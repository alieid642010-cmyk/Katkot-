        function toggleVibration(checked) {
            setState('vibrationEnabled', checked);
            persist();
            if (checked) vibrate(40);
        }
        // ============ الوضع الليلي (Dark Mode) ============
        function applyTheme() {
            document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
        }
        function toggleDarkMode(checked) {
            setState('darkMode', checked);
            persist();
            applyTheme();
        }
        // يحدّث اسم المزرعة الظاهر أعلى التطبيق بدون الحاجة لإعادة رسم الشاشة كلها
        function updateHeaderIdentity() {
            const el = document.getElementById('headerFarmTitle');
            if (el) el.textContent = state.farmName || 'مزرعتي للتسمين';
        }
        function exportData() {
            try {
                const dataStr = JSON.stringify(state, null, 2);
                showConfirm('هل تريد تشفير النسخة الاحتياطية بكلمة مرور؟ (مفيد لو هتشاركها أو ترفعها لمكان خارجي)',
                    () => {
                        showPasswordPrompt('🔒 كلمة مرور التشفير', 'أدخل كلمة مرور التشفير (احفظها جيدًا، لا يمكن استرجاع البيانات بدونها):', async (pass) => {
                            if (!pass || pass.length < 4) { showToast('⚠️ التصدير أُلغي — كلمة المرور يجب ألا تقل عن 4 أحرف'); return; }
                            try {
                                const finalStr = await encryptBackupJson(dataStr, pass);
                                finishExport(finalStr, `katkot-pro-backup-encrypted-${todayStr()}.json`);
                            } catch (e) { showToast('حدث خطأ أثناء التشفير'); }
                        });
                    },
                    'تشفير النسخة الاحتياطية؟',
                    () => finishExport(dataStr, `katkot-pro-backup-${todayStr()}.json`)
                );
            } catch (e) { showToast('حدث خطأ أثناء التصدير'); }
        }

        // ============ سجل تدقيق (Audit Log) — يوثّق العمليات الحساسة (حذف/تعديل مؤثر).
        // يُسجَّل مرتين: داخل الدفعة نفسها (للعرض السريع فى سياقها) وفى سجل عام على مستوى التطبيق
        // (state.globalAuditLog) حتى لا يضيع السجل لو الدفعة نفسها اتحذفت لاحقًا.
        function logAudit(b, text) {
            const who = currentRole === 'worker' && currentWorker ? currentWorker.name : 'المالك';
            const entry = { id: uid(), at: new Date().toISOString(), who, text, batchName: b ? b.name : '' };
            if (b) {
                if (!b.auditLog) b.auditLog = [];
                b.auditLog.unshift(entry);
                if (b.auditLog.length > 300) b.auditLog.length = 300;
            }
            if (!state.globalAuditLog) setState('globalAuditLog', []);
            state.globalAuditLog.unshift(entry);
            if (state.globalAuditLog.length > 300) state.globalAuditLog.length = 300;
        }

        // ============ نظام موحّد: سلة مهملات قابلة للاسترجاع + توثيق تلقائي لكل عمليات الحذف ============
        // قبل كده، أغلب دوال الحذف كانت بتمسح العنصر نهائيًا من غير أي أثر فى سجل التدقيق، وبدون أي إمكانية تراجع.
        // الدالتين دول بيغطوا كل حالات الحذف "البسيطة" (اللي مالهاش أثر على أرصدة المخزون) بمكان واحد:
        // بيسجّلوا العملية فى logAudit تلقائيًا، وبيحفظوا نسخة من العنصر فى b.trash لمدة (آخر 20 عملية حذف)
        // عشان تقدر تسترجعها بضغطة واحدة لو اتمسحت غلط.
        // ملحوظة: حذف السجل اليومي/المشتريات بيرجّع أثرها فى المخزون وقت الحذف (زي ما كان)؛ الاسترجاع بيرجّع
        // العنصر نفسه لكن من غير ما يعيد خصم المخزون تلقائيًا تجنبًا لتضارب الأرصدة — بنوضح ده فى رسالة الاسترجاع.
        const TRASH_RESTORE = {
            record: (b, item) => { b.records.push(item); },
            sale: (b, item) => { b.sales.push(item); },
            purchase: (b, item) => { b.purchases.push(item); },
            custom: (b, item) => { b.customItems.push(item); },
            biosecurity: (b, item) => { b.biosecurityLog.push(item); },
            reminder: (b, item) => { b.reminders.push(item); },
            vaccine: (b, item) => { b.vaccineLog.push(item); },
            treatment: (b, item) => { b.treatmentLog.push(item); },
            feedAdditive: (b, item) => { b.feedAdditives.push(item); },
            waterAdditive: (b, item) => { b.waterAdditives.push(item); },
            outage: (b, item) => { b.outageLog.push(item); },
            quickIntervention: (b, item) => { b.quickInterventions.push(item); },
            incident: (b, item) => { b.incidents.push(item); },
        };
        function softDeleteToTrash(b, type, item, auditText, note) {
            logAudit(b, auditText);
            if (!b.trash) b.trash = [];
            b.trash.unshift({ id: uid(), type, item: JSON.parse(JSON.stringify(item)), auditText, note: note || null, deletedAt: new Date().toISOString() });
            if (b.trash.length > 20) b.trash.length = 20;
        }
        function undoTrashItem(trashId) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix: سلة المهملات داخل تبويب الإعدادات المحجوب عن العمال
            const b = getActiveBatch(); if (!b) return;
            const idx = (b.trash || []).findIndex(t => t.id === trashId);
            if (idx === -1) return;
            const t = b.trash[idx];
            const restorer = TRASH_RESTORE[t.type];
            if (restorer) restorer(b, t.item);
            b.trash.splice(idx, 1);
            persist(); render();
            showToast(t.note ? `تم الاسترجاع ↩️ — ${t.note}` : 'تم استرجاع العنصر ↩️');
        }
        // نفس الفكرة لكن للعناصر على مستوى التطبيق ككل (مش مرتبطة بدفعة معينة): البروتوكولات وجهات الاتصال
        const GLOBAL_TRASH_RESTORE = {
            protocol: (item) => { if (!state.protocols) setState('protocols', []); state.protocols.push(item); },
            contact: (item) => { if (!state.contacts) setState('contacts', []); state.contacts.push(item); },
        };
        function softDeleteToGlobalTrash(type, item, auditText) {
            logAudit(null, auditText);
            if (!state.trash) setState('trash', []);
            state.trash.unshift({ id: uid(), type, item: JSON.parse(JSON.stringify(item)), auditText, deletedAt: new Date().toISOString() });
            if (state.trash.length > 20) state.trash.length = 20;
        }
        function undoGlobalTrashItem(trashId) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const idx = (state.trash || []).findIndex(t => t.id === trashId);
            if (idx === -1) return;
            const t = state.trash[idx];
            const restorer = GLOBAL_TRASH_RESTORE[t.type];
            if (restorer) restorer(t.item);
            state.trash.splice(idx, 1);
            persist(); render();
            showToast('تم استرجاع العنصر ↩️');
        }
        // كل عناصر سلة المهملات (دفعة نشطة + عام) مرتبة بالأحدث أولاً — تُستخدم فى شاشة الإعدادات
        function getAllTrashItems() {
            const b = getActiveBatch();
            const batchTrash = (b && b.trash) ? b.trash.map(t => ({ ...t, scope: 'batch' })) : [];
            const globalTrash = (state.trash || []).map(t => ({ ...t, scope: 'global' }));
            return [...batchTrash, ...globalTrash].sort((a, c) => c.deletedAt.localeCompare(a.deletedAt));
        }

        function proceedImport(imported, event) {
            if (!requirePermission('owner')) { event.target.value = ''; return; } // 🔒 Red Team fix — CRITICAL: استبدال كامل بيانات المزرعة، مالك فقط
            if (!imported || !Array.isArray(imported.batches)) { showToast('⚠️ ملف غير صالح'); event.target.value = ''; return; }
            showConfirm('سيتم استبدال كل البيانات الحالية بالنسخة المستوردة. هل أنت متأكد؟', () => {
                const existingSnapshots = state.localSnapshots || [];
                createLocalSnapshot('قبل الاستيراد'); // لقطة أمان من الوضع الحالي قبل الاستبدال، احتياطًا
                const snapshotsAfterSafety = state.localSnapshots;
                state = imported;
                if (!state.appSettings) setState('appSettings', {});
                if (!state.speciesOverrides) setState('speciesOverrides', {});
                if (!state.compareIds) setState('compareIds', []);
                if (!state.activeTab) setState('activeTab', 'dashboard');
                if (!state.protocols) setState('protocols', []);
                setState('localSnapshots', snapshotsAfterSafety || existingSnapshots || []);
                state.batches.forEach(migrateBatch);
                persist();
                render();
                showToast('✅ تم استيراد النسخة الاحتياطية بنجاح');
            }, 'تأكيد الاستيراد');
            event.target.value = '';
        }
        function importData(event) {
            if (!requirePermission('owner')) { event.target.value = ''; return; } // 🔒 Red Team fix
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    let raw = JSON.parse(e.target.result);
                    if (raw && raw.katkotEncrypted) {
                        showPasswordPrompt('🔓 فك تشفير النسخة الاحتياطية', 'هذه نسخة احتياطية مشفّرة. أدخل كلمة المرور لفك التشفير:', async (pass) => {
                            if (!pass) { showToast('⚠️ الاستيراد أُلغي — كلمة المرور مطلوبة'); event.target.value = ''; return; }
                            try {
                                const decryptedStr = await decryptBackupJson(raw, pass);
                                proceedImport(JSON.parse(decryptedStr), event);
                            } catch (decErr) { showToast('❌ فشل فك التشفير — تأكد من كلمة المرور'); event.target.value = ''; }
                        }, () => { event.target.value = ''; });
                        return;
                    }
                    proceedImport(raw, event);
                } catch (err) { showToast('⚠️ تعذّر قراءة الملف — تأكد أنه ملف نسخة احتياطية صحيح'); event.target.value = ''; }
            };
            reader.readAsText(file);
        }

        // ============ إغلاق المودال (Escape / النقر خارجه) ============
        document.addEventListener('mousedown', (e) => {
            if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('show')) {
                closeModal(e.target.id);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const open = document.querySelector('.modal-overlay.show');
                if (open) closeModal(open.id);
            }
        });


        // ================================================================
        // ============ 10 تحسينات تجربة الاستخدام والبنية التحتية ============
        // ================================================================

        // ---------- 1) دليل مصطلحات ومساعدة مدمجة ----------
        const GLOSSARY_TERMS = {
            fcr: { t: 'FCR — معامل التحويل الغذائي', d: 'كمية العلف المستهلكة (كجم) مقسومة على وزن اللحم المنتَج (كجم). كل ما قلّ الرقم كل ما كانت كفاءة تحويل العلف للحم أفضل. القيم الجيدة للدجاج الأبيض عادة بين 1.4 و1.8 حسب عمر البيع.' },
            epef: { t: 'EPEF — كفاءة الأداء الإنتاجي', d: 'رقم مركّب = (نسبة الحياة% × معدل الزيادة اليومي جم) ÷ (FCR × 10). كل ما ارتفع كل ما كان أداء الدفعة أفضل بشكل عام. فوق 300 غالبًا أداء ممتاز.' },
            adg: { t: 'ADG — معدل الزيادة اليومي', d: 'متوسط الجرامات التى يكسبها الطائر يوميًا فى الوزن = (الوزن الحالي − وزن الاستلام) ÷ عمر الدفعة.' },
            zscore: { t: 'Z-score — درجة الشذوذ الإحصائي', d: 'مقياس إحصائي يقارن قراءة اليوم (علف/ماء/نفوق) بمتوسط وانحراف قراءات نفس الدفعة مؤخرًا. القراءة البعيدة جدًا عن المعتاد (Z مرتفع) تعنى احتمال وجود مشكلة تستحق المراجعة.' },
            cv: { t: 'CV% — معامل تجانس القطيع', d: 'الانحراف المعياري لعينة أوزان فردية مقسومًا على متوسطها. كل ما قلّ الرقم كل ما كان القطيع أكثر تجانسًا. الهدف الصناعي المعتاد أقل من 8%.' },
            dailyEfficiency: { t: 'مؤشر كفاءة اليوم', d: 'رقم مركّب من 0 إلى 100 يلخّص أداء اليوم الحالي (الانحراف عن الوزن المعياري، معدل النفوق اليومي، استقرار استهلاك العلف/الماء) فى رقم واحد سريع للمتابعة.' },
            density: { t: 'الكثافة (كجم/م²)', d: 'إجمالي وزن الطيور الحية مقسومًا على مساحة العنبر. تجاوز الحد الآمن يزيد الإجهاد الحراري ومشاكل الأمونيا والنفوق.' },
            healthScore: { t: 'درجة صحة الدفعة', d: 'رقم من 100 يلخّص الحالة العامة للدفعة الآن: الانحراف عن المعيار، معدل النفوق، الالتزام بتشيك ليست العمليات، والأمان الحيوي.' },
            mortRate: { t: 'نسبة النفوق التراكمية', d: 'إجمالي الطيور النافقة منذ بداية الدورة مقسومًا على عدد الكتاكيت المستلمة، كنسبة مئوية.' },
            waterFeedRatio: { t: 'معدل الماء:العلف', d: 'كمية الماء المستهلكة مقسومة على كمية العلف. القيمة الطبيعية تقريبًا 1.8-2 وترتفع فى الجو الحار — انحراف كبير قد يدل على مشكلة صحية أو بيئية.' },
            biomass: { t: 'الكتلة الحيوية', d: 'إجمالي وزن كل الطيور الحية الآن (متوسط الوزن × عدد الأحياء) — أساس حساب الكثافة واحتياجات التهوية.' },
            envStress: { t: 'مؤشر الإجهاد البيئي المركّب', d: 'يجمع أثر الحرارة والرطوبة والأمونيا معًا على النفوق بدل النظر لكل عامل منفردًا — بعض المشاكل تظهر فقط عند ارتفاع أكثر من عامل معًا.' },
            costPerKg: { t: 'تكلفة كيلو اللحم', d: 'إجمالي تكاليف الدورة (كتاكيت + علف + أدوية + تشغيل...) مقسومة على إجمالى كيلوجرامات اللحم المُنتَج حتى الآن.' },
        };
        function glossHtml(key) {
            const g = GLOSSARY_TERMS[key];
            if (!g) return '';
            return `<i class="gloss-ico" onclick="event.stopPropagation();showGlossTerm('${key}')" title="${esc(g.t)}">ℹ</i>`;
        }
        function showGlossTerm(key) {
            const g = GLOSSARY_TERMS[key];
            if (!g) return;
            openGenericModal('📖 ' + g.t, `<div class="card">${esc(g.d)}</div><button class="btn ghost block" style="margin-top:10px;" onclick="showGlossaryFull()">📖 عرض كل المصطلحات</button>`);
        }
        function showGlossaryFull() {
            const rows = Object.keys(GLOSSARY_TERMS).map(k => {
                const g = GLOSSARY_TERMS[k];
                return `<div class="check-row"><div class="txt"><div style="font-weight:800;">${esc(g.t)}</div><div class="day">${esc(g.d)}</div></div></div>`;
            }).join('');
            openGenericModal('📖 دليل المصطلحات', `<div class="card" style="padding:0;">${rows}</div>`);
        }

        // ---------- Modal عام (يُستخدم للمصطلحات، الأمراض، مهام اليوم) ----------
        function openGenericModal(title, bodyHtml) {
            document.getElementById('genericModalTitle').textContent = title;
            document.getElementById('genericModalBody').innerHTML = bodyHtml;
            document.getElementById('genericModalOverlay').classList.add('show');
        }

        // ---------- 2) استنساخ دفعة سابقة كقالب سريع ----------
        function batchTemplateOptionsHtml() {
            const list = [...state.batches].sort((a, c) => (c.startDate || '').localeCompare(a.startDate || ''));
            if (!list.length) return '<option value="">لا توجد دفعات سابقة بعد</option>';
            return '<option value="">— اختر دفعة لنسخ إعداداتها (اختياري) —</option>' +
                list.map(b => `<option value="${b.id}">${esc(b.name)} (${b.startDate})</option>`).join('');
        }
        function cloneBatchIntoForm(id) {
            if (!id) return;
            const src = state.batches.find(x => x.id === id);
            if (!src) return;
            document.getElementById('b_location').value = src.location || '';
            document.getElementById('b_species').value = src.species;
            onSpeciesChange();
            document.getElementById('b_breed').value = src.breed || '';
            document.getElementById('b_startweight').value = src.startweight || '';
            document.getElementById('b_chickprice').value = src.chickprice || '';
            document.getElementById('b_feedprice').value = src.feedprice || '';
            document.getElementById('b_area').value = src.area || '';
            document.getElementById('b_targetage').value = src.targetAge || '';
            document.getElementById('b_targetweight').value = src.targetWeight || '';
            document.getElementById('b_heattype').value = src.heattype || 'gas';
            onHeatTypeChange();
            document.getElementById('b_heatprice').value = src.heatprice || '';
            document.getElementById('b_venttype').value = src.ventType || 'natural';
            document.getElementById('b_fancapacity').value = src.fanCapacityM3h || '';
            document.getElementById('b_fancount').value = src.fanCount || '';
            onVentTypeChange();
            document.getElementById('b_floortype').value = src.floorType || 'litter';
            document.getElementById('b_cagetiers').value = src.cageTiers || 1;
            onFloorTypeChange();
            document.getElementById('b_startmonth').value = src.startmonth || (new Date().getMonth() + 1);
            updateDensitySuggestion();
            showToast(`✅ تم نسخ إعدادات "${src.name}" — عدّل الاسم والتاريخ والعدد ثم احفظ`);
        }

        // ---------- 3) بحث شامل داخل التطبيق ----------
        function openGlobalSearch() {
            document.getElementById('globalSearchInput').value = '';
            document.getElementById('globalSearchResults').innerHTML = '<p style="font-size:12px;color:var(--muted);text-align:center;padding:14px;">اكتب كلمة للبحث فى كل الدفعات والسجلات والمعاملات والملاحظات</p>';
            document.getElementById('searchModalOverlay').classList.add('show');
            setTimeout(() => { const el = document.getElementById('globalSearchInput'); if (el) el.focus(); }, 100);
        }
        function esc2(s) { return (s == null ? '' : String(s)); }
        // ============ دليل الميزات/الأدوات القابلة للقفز إليها مباشرة من البحث الشامل — إلهام "مركز القيادة"
        // من تطبيق تانى، بس مدمج فى البحث الموجود بدل شاشة منفصلة (البحث عندنا أصلًا بيغطي البيانات). كل بند:
        // label (اسم الميزة)، run (الفعل المباشر عند الضغط، بيتنفذ بعد قفل نافذة البحث وتفعيل التبويب المناسب لو لازم). ============
        function getFeatureDirectory() {
            return [
                { label: '🧮 حاسبة تكوين العلف', tab: 'production', run: () => openFeedCalcModal() },
                { label: '💧 حاسبة تركيز محلول الإماهة/اللقاح فى المياه', tab: 'production', run: () => openWaterCalcModal() },
                { label: '📖 دليل المصطلحات', tab: 'settings', run: () => showGlossaryFull() },
                { label: '🩺 دليل الأمراض', tab: 'settings', run: () => showDiseaseLibrary() },
                { label: '🏷️ إدارة أدوار جهات الاتصال', tab: 'settings', run: () => showContactRolesManager() },
                { label: '📇 إضافة جهة اتصال سريعة', tab: 'settings', run: () => openContactModal() },
                { label: '📋 مهام اليوم (كل المستحقات)', tab: 'daily', run: () => showTodayTasksModal() },
                { label: '📁 أرشيف الدورات', tab: 'settings', run: () => openArchiveModal() },
                { label: '🖨️ طباعة ورقة تعليمات يومية للعامل', tab: 'settings', run: () => openWorkerSheetPrint() },
                { label: '📂 استيراد سجل يومي من CSV/Excel', tab: 'settings', run: () => openCsvImportModal() },
                { label: '⚡ تسجيل انقطاع كهرباء/عطل مولد', tab: 'production', run: () => openOutageModal() },
                { label: '🐔 إضافة دفعة جديدة', tab: 'dashboard', run: () => openBatchModal() },
                { label: '👥 إدارة الحسابات والصلاحيات', tab: 'settings', run: () => (typeof openAccountsModal === 'function') && openAccountsModal() },
                { label: '💊 إضافة تحصين/تطعيم', tab: 'daily', run: () => (typeof openVaccineModal === 'function') && openVaccineModal() },
                { label: '⏰ إضافة تذكير', tab: 'daily', run: () => (typeof openReminderModal === 'function') && openReminderModal() },
                { label: '📦 إضافة بروتوكول علاج/دواء', tab: 'daily', run: () => (typeof openProtocolModal === 'function') && openProtocolModal() },
            ];
        }
        // ============ ترشيح الصفحة الحالية — بيدوّر فى أي جدول/قائمة ظاهرة دلوقتي فى الصفحة (بدون التنقل)
        // بيشتغل تلقائيًا لأي تبويب، من غير ما نحتاج نضيف كود ترشيح خاص لكل صفحة على حدة ============
        function scanCurrentPageMatches(qn) {
            const container = document.getElementById('mainContent');
            if (!container) return [];
            const candidates = [...container.querySelectorAll('tr, .check-row, .qa-row')];
            const results = [];
            candidates.forEach(el => {
                const text = (el.innerText || '').trim();
                if (text.length < 2 || !text.toLowerCase().includes(qn)) return;
                // نفضّل أدق عنصر مطابق ونتجاهل أي عنصر أكبر حاوي لمطابقة أدق جواه (تجنب تكرار نفس النتيجة مرتين)
                const hasMoreSpecificMatch = candidates.some(other => other !== el && el.contains(other) &&
                    (other.innerText || '').trim().toLowerCase().includes(qn));
                if (hasMoreSpecificMatch) return;
                results.push({ label: text.slice(0, 70), el });
            });
            return results.slice(0, 12);
        }
        function goToPageMatch(idx) {
            const m = (window._qaPageMatches || [])[idx];
            closeModal('searchModalOverlay');
            if (!m || !m.el || !document.body.contains(m.el)) { showToast('العنصر ده مبقاش ظاهر دلوقتي — جرب تبحث تانى'); return; }
            setTimeout(() => {
                m.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const prevTransition = m.el.style.transition, prevBg = m.el.style.backgroundColor;
                m.el.style.transition = 'background-color .4s';
                m.el.style.backgroundColor = 'rgba(217,165,68,.4)';
                setTimeout(() => { m.el.style.backgroundColor = prevBg; setTimeout(() => { m.el.style.transition = prevTransition; }, 400); }, 1400);
            }, 200);
        }
        function runGlobalSearch(qRaw) {
            const q = (qRaw || '').trim();
            const box = document.getElementById('globalSearchResults');
            if (q.length < 2) { box.innerHTML = '<p style="font-size:12px;color:var(--muted);text-align:center;padding:14px;">اكتب حرفين على الأقل...</p>'; return; }
            const qn = q.toLowerCase();
            const has = s => esc2(s).toLowerCase().includes(qn);
            const pageMatches = scanCurrentPageMatches(qn);
            window._qaPageMatches = pageMatches;
            const cats = [
                { key: 'features', label: '🧭 ميزات وأدوات', items: [] },
                { key: 'batches', label: '🐔 الدفعات', items: [] },
                { key: 'records', label: '📅 السجل اليومي', items: [] },
                { key: 'purchases', label: '🛒 المشتريات', items: [] },
                { key: 'sales', label: '💰 المبيعات', items: [] },
                { key: 'ops', label: '🛡️ العمليات والأمان الحيوي', items: [] },
                { key: 'contacts', label: '📇 جهات الاتصال', items: [] },
            ];
            getFeatureDirectory().forEach(f => {
                if (has(f.label)) cats[0].items.push({ label: f.label, sub: 'اضغط للفتح مباشرة', tab: f.tab, runFeature: f.run });
            });
            state.batches.forEach(b => {
                if (has(b.name) || has(b.location) || has(b.breed)) {
                    cats[1].items.push({ label: `${esc(b.name)}${b.location ? ' — ' + esc(b.location) : ''}`, sub: `${getSpeciesData(b.species).label} · ${b.startDate}`, batchId: b.id, tab: 'dashboard' });
                }
                (b.records || []).forEach(r => {
                    if (has(r.notes)) cats[2].items.push({ label: `سجل ${r.date} — ${esc(b.name)}`, sub: esc(r.notes).slice(0, 90), batchId: b.id, tab: 'daily' });
                });
                (b.purchases || []).forEach(p => {
                    if (has(p.desc) || has(p.supplier) || has(p.lot)) cats[3].items.push({ label: `${esc(p.desc || p.type)} — ${esc(b.name)}`, sub: `${p.date} · ${money(p.total || 0)}${p.supplier ? ' · ' + esc(p.supplier) : ''}`, batchId: b.id, tab: 'inventory' });
                });
                (b.sales || []).forEach(s => {
                    if (has(s.buyer)) cats[4].items.push({ label: `بيع (${s.kind === 'meat' ? 'لحم' : 'سبلة'}) — ${esc(b.name)}`, sub: `${s.date} · ${money(s.total || 0)} · ${esc(s.buyer)}`, batchId: b.id, tab: 'inventory' });
                });
                (b.biosecurityLog || []).forEach(o => {
                    if (has(o.note) || has(o.type)) cats[5].items.push({ label: `${esc(o.type)} — ${esc(b.name)}`, sub: `${o.date}${o.note ? ' · ' + esc(o.note).slice(0, 60) : ''}`, batchId: b.id, tab: 'daily' });
                });
            });
            (state.contacts || []).forEach(c => {
                if (has(c.name) || has(c.phone) || has(c.role)) cats[6].items.push({ label: esc(c.name), sub: `${esc(c.role || '')} · ${esc(c.phone || '')}`, tab: 'settings' });
            });
            const nonEmpty = cats.filter(c => c.items.length);
            if (!nonEmpty.length && !pageMatches.length) { box.innerHTML = '<p style="font-size:12px;color:var(--muted);text-align:center;padding:14px;">لا توجد نتائج مطابقة</p>'; return; }
            const pageMatchesHtml = pageMatches.length ? `
                <div class="search-cat-label">📄 ترشيح فى نفس الصفحة الحالية (${pageMatches.length})</div>
                ${pageMatches.map((m, i) => `
                    <div class="search-result-row" onclick="goToPageMatch(${i})">
                        <div style="font-weight:700;font-size:13px;">${esc2(m.label)}</div>
                        <div style="font-size:11px;color:var(--muted);">اضغط للتمرير إليه فى نفس الصفحة</div>
                    </div>`).join('')}` : '';
            box.innerHTML = pageMatchesHtml + nonEmpty.map((c, ci) => `
                <div class="search-cat-label">${c.label} (${c.items.length})</div>
                ${c.items.slice(0, 12).map((it, ii) => `
                    <div class="search-result-row" onclick="goToSearchResult(${ci},${ii})">
                        <div style="font-weight:700;font-size:13px;">${it.label}</div>
                        <div style="font-size:11px;color:var(--muted);">${it.sub}</div>
                    </div>`).join('')}
            `).join('');
            window._searchResultsCache = nonEmpty;
        }
        function goToSearchResult(ci, ii) {
            const it = (window._searchResultsCache || [])[ci] && window._searchResultsCache[ci].items[ii];
            if (!it) return;
            closeModal('searchModalOverlay');
            if (it.batchId && currentRole !== 'worker') { setState('activeId', it.batchId); persist(); }
            setTab(it.tab || 'dashboard');
            if (it.runFeature) setTimeout(it.runFeature, 150); // بعد ما التبويب يترندر، عشان لو الميزة محتاجة عناصر DOM من التبويب ده
        }

        // ---------- 4) استيراد بيانات من إكسل/CSV (سجل يومي) ----------
        let csvParsedRows = null;
        function downloadCsvTemplate() {
            const csv = 'date,age,weight,mort,cull,feed,water,temp,notes\n2026-01-01,1,45,0,0,12,20,32,\n';
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'قالب_استيراد_السجل_اليومي.csv';
            a.click();
        }
        function parseCsvText(text) {
            const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length);
            if (!lines.length) return { header: [], rows: [] };
            const splitLine = l => l.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
            const header = splitLine(lines[0]).map(h => h.toLowerCase());
            const rows = lines.slice(1).map(l => {
                const cells = splitLine(l);
                const obj = {};
                header.forEach((h, i) => obj[h] = cells[i] != null ? cells[i] : '');
                return obj;
            });
            return { header, rows };
        }
        const CSV_FIELD_ALIASES = {
            date: ['date', 'التاريخ'], age: ['age', 'العمر'], weight: ['weight', 'الوزن'],
            mort: ['mort', 'mortality', 'نفوق'], cull: ['cull', 'استبعاد'],
            feed: ['feed', 'علف'], water: ['water', 'ماء'], temp: ['temp', 'حرارة'],
            notes: ['notes', 'ملاحظات']
        };
        function mapCsvRow(row) {
            const out = {};
            Object.keys(CSV_FIELD_ALIASES).forEach(field => {
                const alias = CSV_FIELD_ALIASES[field].find(a => row[a] !== undefined && row[a] !== '');
                out[field] = alias ? row[alias] : '';
            });
            return out;
        }
        function handleCsvFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                const { rows } = parseCsvText(e.target.result);
                const mapped = rows.map(mapCsvRow).filter(r => r.date);
                csvParsedRows = mapped;
                const preview = document.getElementById('csvImportPreview');
                if (!mapped.length) {
                    preview.innerHTML = '<div style="color:var(--red);">⚠️ لم يتم التعرّف على أي صفوف صالحة (تأكد من عمود date/التاريخ)</div>';
                    document.getElementById('csvImportConfirmBtn').style.display = 'none';
                    return;
                }
                preview.innerHTML = `<div style="color:var(--green);font-weight:700;">✅ تم التعرّف على ${mapped.length} صف/يوم</div>
                    <div class="card" style="padding:0;margin-top:6px;max-height:180px;overflow-y:auto;">
                        ${mapped.slice(0, 8).map(r => `<div class="check-row" style="padding:6px 8px;"><div class="txt" style="font-size:11.5px;">${r.date} · عمر ${r.age || '—'} · وزن ${r.weight || '—'} · نفوق ${r.mort || 0} · علف ${r.feed || '—'}</div></div>`).join('')}
                        ${mapped.length > 8 ? `<div style="padding:6px 8px;font-size:11px;color:var(--muted);">+ ${mapped.length - 8} صف إضافي...</div>` : ''}
                    </div>`;
                document.getElementById('csvImportConfirmBtn').style.display = 'block';
            };
            reader.readAsText(file, 'UTF-8');
        }
        function confirmCsvImport() {
            const b = getActiveBatch();
            if (!b || !csvParsedRows || !csvParsedRows.length) return;
            let added = 0, skipped = 0;
            csvParsedRows.forEach(r => {
                if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) { skipped++; return; }
                const age = parseInt(r.age);
                const rec = {
                    date: r.date,
                    age: !isNaN(age) ? age : daysBetween(b.startDate, r.date),
                    weight: r.weight ? parseFloat(r.weight) : null,
                    mort: parseInt(r.mort) || 0,
                    cull: parseInt(r.cull) || 0,
                    mortDay: parseInt(r.mort) || 0, cullDay: parseInt(r.cull) || 0, mortNight: 0, cullNight: 0,
                    mortCauses: { heat: 0, disease: 0, trample: 0, deform: 0, other: 0 },
                    mortCausesDay: { heat: 0, disease: 0, trample: 0, deform: 0, other: 0 },
                    mortCausesNight: { heat: 0, disease: 0, trample: 0, deform: 0, other: 0 },
                    feed: r.feed ? parseFloat(r.feed) : 0,
                    feedItem: 'علف',
                    water: r.water ? parseFloat(r.water) : null,
                    temp: r.temp ? parseFloat(r.temp) : null,
                    notes: (r.notes || '') + ' [مستورَد من CSV]',
                    enteredBy: currentRole === 'worker' && currentWorker ? currentWorker.name : 'المالك',
                    enteredAt: new Date().toISOString(),
                };
                b.records = b.records.filter(x => x.date !== rec.date);
                b.records.push(rec);
                added++;
            });
            b.records.sort((a, c) => a.age - c.age);
            persist();
            closeModal('csvImportModalOverlay');
            render();
            showToast(`✅ تم استيراد ${added} سجل${skipped ? ' (تخطّي ' + skipped + ' صف بتاريخ غير صالح)' : ''} — ملاحظة: لم يُخصم العلف المستورد تلقائيًا من المخزون، راجعه يدويًا لو لزم`);
            csvParsedRows = null;
            document.getElementById('csvImportFile').value = '';
            document.getElementById('csvImportPreview').innerHTML = '';
            document.getElementById('csvImportConfirmBtn').style.display = 'none';
        }
        function openCsvImportModal() {
            const b = getActiveBatch();
            if (!b) { showToast('اختر أو أنشئ دفعة أولًا'); return; }
            csvParsedRows = null;
            document.getElementById('csvImportPreview').innerHTML = '';
            document.getElementById('csvImportConfirmBtn').style.display = 'none';
            const f = document.getElementById('csvImportFile'); if (f) f.value = '';
            document.getElementById('csvImportModalOverlay').classList.add('show');
        }

        // ---------- 4.5) طي/فرد الأقسام تلقائيًا فى كل تبويب: أهم قسم يفضل مفتوح والباقي مطوي، مع تذكر اختيار المستخدم ----------
        // نعمل على مستوى DOM بعد الرسم (زي آلية ترتيب لوحة التحكم بالظبط) — كل عنصر .section مباشر
        // داخل التبويب الحالي بياخد مفتاحه من نص عنوانه (h2)، ويتحول لقسم قابل للطي/الفرد بالضغط على عنوانه.
        function getSectionOpenState(scopeId) {
            const st = (state.appSettings && state.appSettings.sectionOpenState) || {};
            return st[scopeId] || null; // null = المستخدم لسه ماخصصش حاجة هنا، استخدم الافتراضي (أول قسم مفتوح فقط)
        }
        function toggleSectionOpen(scopeId, key, isOpen, defaultFirstKey) {
            if (!state.appSettings) setState('appSettings', {});
            if (!state.appSettings.sectionOpenState) state.appSettings.sectionOpenState = {};
            const st = state.appSettings.sectionOpenState;
            let list = st[scopeId] ? [...st[scopeId]] : (defaultFirstKey != null ? [defaultFirstKey] : []);
            if (isOpen) { if (!list.includes(key)) list.push(key); } else { list = list.filter(k => k !== key); }
            st[scopeId] = list;
            persist();
        }
        function applySectionCollapsing(scopeId) {
            const main = document.getElementById('mainContent');
            if (!main) return;
            const sections = [...main.querySelectorAll(':scope > .section')];
            if (sections.length < 2) return; // قسم واحد أو لا شيء: لا داعي للطي
            const savedOpen = getSectionOpenState(scopeId);
            let firstKey = null;
            sections.forEach((sec, i) => {
                const head = sec.querySelector(':scope > .section-head');
                const h2 = head ? head.querySelector('h2') : null;
                if (!head || !h2) return; // كروت ملخص بدون عنوان قسم تفضل زي ما هي، دايمًا ظاهرة
                const key = h2.textContent.trim();
                if (firstKey === null) firstKey = key; // ============ 🔧 إصلاح: لازم تتحسب هنا قبل أي return تاني، وإلا لو أول قسم عنده <details>
                // (زي "السجل اليومي") بيتخطى بالكامل، القسم اللي بعده كان بيتحسب غلط إنه هو "الأول" فيفتح
                // افتراضيًا بدل ما يقفل، وده كان بيسبب سلوك عكسي/غير متوقع لأقسام زي "سجلات وأحداث إضافية" ============
                if (sec.querySelector(':scope > details')) return; // قسم بيستخدم <details> جاهزة للطي الداخلي أصلاً — سيبه زي ما هو
                sec.dataset.skey = key;
                const bodyEls = [...sec.children].filter(c => c !== head);
                if (!bodyEls.length) return;
                let body = sec.querySelector(':scope > .section-body');
                if (!body) {
                    body = document.createElement('div');
                    body.className = 'section-body';
                    bodyEls.forEach(el => body.appendChild(el));
                    sec.appendChild(body);
                }
                // ⚠️ إصلاح: الافتراضي كان "أول قسم بس مفتوح" حسب ترتيبه فى الصفحة (i===0) — فلو قسم
                // "⚠️ يحتاج متابعتك الآن" (فيه أزرار تأجيل/تنفيذ التنبيهات) مش أول قسم فعليًا (مثلاً عند
                // وجود أكتر من عنبر/دفعة، فقسم "نظرة عامة على العنابر" بيظهر قبله)، كان بيتطوى تلقائيًا
                // فى كل مرة تضغط زرار جواه (لأن الضغط بيعمل render() كامل من جديد)، فيحسّه المستخدم وكأن
                // الصفحة "رجعت للشاشة الرئيسية" فجأة رغم إنه لسه فى نفس التبويب. دلوقتي أي قسم متعلّم
                // صراحة data-default-open="true" (زي قسم التنبيهات) بيفضل مفتوح افتراضيًا بغض النظر عن ترتيبه.
                const isOpen = savedOpen ? savedOpen.includes(key) : (i === 0 || sec.dataset.defaultOpen === 'true');
                sec.classList.toggle('section-collapsed', !isOpen);
                head.classList.add('collapsible');
                if (!head.querySelector('.section-toggle-ic')) {
                    const ic = document.createElement('span');
                    ic.className = 'section-toggle-ic';
                    ic.textContent = '◀';
                    head.appendChild(ic);
                }
                head.onclick = (e) => {
                    if (e.target.closest('button, a, input, select, textarea, label')) return;
                    const nowCollapsed = sec.classList.toggle('section-collapsed');
                    toggleSectionOpen(scopeId, key, !nowCollapsed, firstKey);
                };
            });
        }

        // ---------- 5) تخصيص ترتيب لوحة التحكم ----------
        // نعمل على مستوى DOM بعد الرسم (بدون لمس منطق التحليلات نفسه) — كل عنصر .section مباشر
        // داخل لوحة التحكم بيتاخد مفتاحه من نص عنوانه (h2)، ونعيد ترتيبه/إخفاءه حسب تفضيل المستخدم.
        function getDashboardSectionKeys() {
            const main = document.getElementById('mainContent');
            if (!main) return [];
            return [...main.querySelectorAll(':scope > .section')].map(el => {
                const h2 = el.querySelector('.section-head h2');
                return h2 ? h2.textContent.trim() : null;
            }).filter(Boolean);
        }
        function applyDashboardCustomization() {
            if (state.activeTab !== 'dashboard') return;
            const main = document.getElementById('mainContent');
            if (!main) return;
            const sections = [...main.querySelectorAll(':scope > .section')];
            if (!sections.length) return;
            const order = (state.appSettings && state.appSettings.dashboardOrder) || [];
            const hidden = (state.appSettings && state.appSettings.dashboardHidden) || [];
            const keyOf = el => { const h2 = el.querySelector('.section-head h2'); return h2 ? h2.textContent.trim() : ''; };
            const byKey = {};
            sections.forEach(el => { byKey[keyOf(el)] = el; });
            hidden.forEach(k => { if (byKey[k]) byKey[k].style.display = 'none'; });
            if (!order.length) return;
            const parent = sections[0].parentElement;
            const anchor = sections[0];
            order.forEach(k => { if (byKey[k]) parent.insertBefore(byKey[k], anchor); });
        }
        function renderDashboardOrderSettings() {
            const b = getActiveBatch();
            const m = b ? computeMetrics(b) : null;
            const fin = b && m ? computeFinance(b, m) : null;
            const alerts = b && m ? computeAlerts(b, m) : [];
            let keys = [];
            if (b) {
                const tmp = document.createElement('div');
                tmp.style.display = 'none';
                tmp.innerHTML = renderDashboard(b, m, fin, alerts);
                document.body.appendChild(tmp);
                keys = [...tmp.querySelectorAll(':scope > .section')].map(el => {
                    const h2 = el.querySelector('.section-head h2');
                    return h2 ? h2.textContent.trim() : null;
                }).filter(Boolean);
                document.body.removeChild(tmp);
            }
            if (!keys.length) return '<div class="empty" style="padding:14px;">أنشئ دفعة نشطة أولًا لتخصيص ترتيب أقسام لوحة التحكم الخاصة بها.</div>';
            const order = (state.appSettings && state.appSettings.dashboardOrder && state.appSettings.dashboardOrder.length) ? state.appSettings.dashboardOrder.filter(k => keys.includes(k)) : keys;
            keys.forEach(k => { if (!order.includes(k)) order.push(k); });
            const hidden = (state.appSettings && state.appSettings.dashboardHidden) || [];
            return `<div class="card" style="padding:0;">
                ${order.map((k, i) => `
                    <div class="dash-order-row">
                        <input type="checkbox" ${hidden.includes(k) ? '' : 'checked'} onchange="toggleDashboardSectionVisible('${esc(k).replace(/'/g, "\\'")}', this.checked)" title="إظهار/إخفاء">
                        <div style="flex:1;font-size:12.5px;">${esc(k)}</div>
                        <span class="grip">
                            <button class="btn ghost xs" ${i === 0 ? 'disabled' : ''} onclick="moveDashboardSection(${i},-1)">⬆️</button>
                            <button class="btn ghost xs" ${i === order.length - 1 ? 'disabled' : ''} onclick="moveDashboardSection(${i},1)">⬇️</button>
                        </span>
                    </div>`).join('')}
            </div>
            <p style="font-size:10.5px;color:var(--muted);margin:8px 2px 0;">💡 الترتيب والإخفاء يُطبَّق على أقسام الرسوم البيانية والتحليلات فى لوحة التحكم (الكروت الرئيسية بأعلى الصفحة ثابتة دايمًا).</p>
            ${renderInsightGroupsSettings()}`;
        }
        // ============ 🔴 إصلاح Red Team (مدموج): إخفاء فئة كاملة من "🔬 تحليلات ذكية" (مش بس القسم كله) — عشان لو ============
        // "مقارنات ومعايير" مثلاً مش مفيدة لمزرعتك، تشيلها نهائيًا بدل ما تطويها كل مرة تفتح الداشبورد.
        function renderInsightGroupsSettings() {
            const groups = [
                { key: 'forecast', label: '🔮 توقعات' },
                { key: 'performance', label: '📊 أداء وكفاءة' },
                { key: 'benchmark', label: '🌍 مقارنات ومعايير' },
            ];
            const hidden = (state.appSettings && state.appSettings.insightGroupsHidden) || [];
            return `<div class="card" style="padding:0;margin-top:10px;">
                <div style="padding:8px 12px 4px;font-size:11.5px;font-weight:800;color:var(--muted);">فئات "🔬 تحليلات ذكية" — إظهار/إخفاء</div>
                ${groups.map(g => `
                    <div class="dash-order-row">
                        <input type="checkbox" ${hidden.includes(g.key) ? '' : 'checked'} onchange="toggleInsightGroupHidden('${g.key}', this.checked)" title="إظهار/إخفاء">
                        <div style="flex:1;font-size:12.5px;">${g.label}</div>
                    </div>`).join('')}
            </div>`;
        }
        function toggleInsightGroupHidden(key, visible) {
            if (!state.appSettings) setState('appSettings', {});
            let hidden = state.appSettings.insightGroupsHidden || [];
            hidden = visible ? hidden.filter(k => k !== key) : [...new Set([...hidden, key])];
            state.appSettings.insightGroupsHidden = hidden;
            persist();
            const container = document.getElementById('dashOrderSettingsBox');
            if (container) container.innerHTML = renderDashboardOrderSettings();
        }
        function saveDashboardOrder(order) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3): إعداد مشترك (Firestore) بيأثر على شكل اللوحة لكل مستخدمي المزرعة
            if (!state.appSettings) setState('appSettings', {});
            state.appSettings.dashboardOrder = order;
            persist();
        }
        function moveDashboardSection(i, dir) {
            const container = document.getElementById('dashOrderSettingsBox');
            const b = getActiveBatch();
            if (!b) return;
            const m = computeMetrics(b), fin = computeFinance(b, m), alerts = computeAlerts(b, m);
            const tmp = document.createElement('div'); tmp.style.display = 'none'; tmp.innerHTML = renderDashboard(b, m, fin, alerts);
            document.body.appendChild(tmp);
            const allKeys = [...tmp.querySelectorAll(':scope > .section')].map(el => { const h2 = el.querySelector('.section-head h2'); return h2 ? h2.textContent.trim() : null; }).filter(Boolean);
            document.body.removeChild(tmp);
            let order = (state.appSettings && state.appSettings.dashboardOrder && state.appSettings.dashboardOrder.length) ? state.appSettings.dashboardOrder.filter(k => allKeys.includes(k)) : allKeys;
            allKeys.forEach(k => { if (!order.includes(k)) order.push(k); });
            const j = i + dir;
            if (j < 0 || j >= order.length) return;
            [order[i], order[j]] = [order[j], order[i]];
            saveDashboardOrder(order);
            if (container) container.innerHTML = renderDashboardOrderSettings();
        }
        function toggleDashboardSectionVisible(key, visible) {
            if (!state.appSettings) setState('appSettings', {});
            let hidden = state.appSettings.dashboardHidden || [];
            hidden = visible ? hidden.filter(k => k !== key) : [...new Set([...hidden, key])];
            state.appSettings.dashboardHidden = hidden;
            persist();
        }

        // ---------- 6) تعليمات يومية مطبوعة للعامل ----------
        function computeTodayDueItems(b, m) {
            const age = m.todayAge;
            const date = todayStr();
            const dueVacc = (b.vaccineLog || []).filter(v => v.day === age && !v.done);
            const dueTreat = (b.treatmentLog || []).filter(t => t.day === age && !t.done);
            const activeFeed = (b.feedAdditives || []).filter(a => a.active && additiveActiveOnDay(a, age) && !isAdditiveExecutedToday(b, a.id, date));
            const activeWater = (b.waterAdditives || []).filter(a => a.active && additiveActiveOnDay(a, age) && !isAdditiveExecutedToday(b, a.id, date));
            const doneToday = new Set((b.checklistLog || []).filter(l => l.date === date && l.done).map(l => l.taskId));
            const pendingChecklist = (b.checklistTemplate || []).filter(t => !doneToday.has(t.id));
            const hasToday = (b.records || []).some(r => r.date === date);
            return { age, date, dueVacc, dueTreat, activeFeed, activeWater, pendingChecklist, hasToday };
        }
        function openWorkerSheetPrint() {
            const b = getActiveBatch();
            if (!b) { showToast('اختر دفعة أولًا'); return; }
            const m = computeMetrics(b);
            const items = computeTodayDueItems(b, m);
            const lines = [];
            if (!items.hasToday) lines.push('📝 تسجيل السجل اليومي (علف، ماء، وزن، نفوق، حرارة)');
            items.dueVacc.forEach(v => lines.push(`💉 تحصين: ${v.name}`));
            items.dueTreat.forEach(t => lines.push(`🧴 معاملة/علاج: ${t.name}`));
            items.activeFeed.forEach(a => lines.push(`🌾 إضافة علف: ${a.name} — جرعة ${a.dose} ${a.unit}/${a.per}`));
            items.activeWater.forEach(a => lines.push(`💧 إضافة ماء: ${a.name} — جرعة ${a.dose} ${a.unit}/${a.per}`));
            items.pendingChecklist.forEach(t => lines.push(`✅ ${t.text}`));
            const win = window.open('', '_blank');
            if (!win) { showToast('⚠️ فعّل النوافذ المنبثقة للطباعة'); return; }
            win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>ورقة تعليمات اليوم</title>
                <style>.worker-sheet-print{direction:rtl;font-family:Tahoma,sans-serif;padding:18px;}.worker-sheet-print h2{margin:0 0 4px;}.worker-sheet-print .task-line{padding:10px 0;border-bottom:1.5px dashed #999;font-size:15px;}.worker-sheet-print .box{display:inline-block;width:16px;height:16px;border:2px solid #333;margin-left:8px;vertical-align:middle;}</style></head>
                <body onload="window.print()"><div class="worker-sheet-print">
                    <h2>📋 مطلوب النهاردة — ${esc(b.name)}</h2>
                    <div style="font-size:13px;color:#555;margin-bottom:12px;">التاريخ: ${items.date} · عمر القطيع: ${items.age} يوم</div>
                    ${lines.length ? lines.map(l => `<div class="task-line"><span class="box"></span>${esc(l)}</div>`).join('') : '<div class="task-line">لا توجد مهام خاصة اليوم غير السجل اليومي المعتاد.</div>'}
                    <div style="margin-top:20px;font-size:12px;color:#777;">وقّع بعد التنفيذ: ______________</div>
                </div></body></html>`);
            win.document.close();
        }

        // ---------- 7) دعم عملة مختلفة (عرض) ----------
        function getCurrencySymbol() { return (state.appSettings && state.appSettings.currencySymbol) || 'ج'; }
        function setCurrencySymbol(sym) {
            if (!state.appSettings) setState('appSettings', {});
            state.appSettings.currencySymbol = sym;
            persist();
            render();
            showToast('✅ تم تحديث رمز العملة فى كل الشاشات');
        }
        function renderCurrencySettings() {
            const cur = getCurrencySymbol();
            const options = [
                { v: 'ج', l: 'جنيه مصري (ج)' }, { v: 'ر.س', l: 'ريال سعودي (ر.س)' },
                { v: 'د.إ', l: 'درهم إماراتي (د.إ)' }, { v: 'د.ك', l: 'دينار كويتي (د.ك)' },
                { v: 'ر.ق', l: 'ريال قطري (ر.ق)' }, { v: 'د.أ', l: 'دينار أردني (د.أ)' },
                { v: '$', l: 'دولار أمريكي ($)' }, { v: '€', l: 'يورو (€)' },
            ];
            return `<div class="field full"><label>رمز العملة المعروض فى كل الشاشات</label>
                <select onchange="setCurrencySymbol(this.value)">
                    ${options.map(o => `<option value="${o.v}" ${cur === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select></div>
                <p style="font-size:11px;color:var(--muted);margin:6px 2px 0;line-height:1.7;">💡 هذا يغيّر رمز العملة المعروض فقط فى كل التقارير والشاشات — الأرقام نفسها تبقى كما أدخلتها (لا يوجد تحويل تلقائي بين العملات). وحدات الوزن فى التطبيق كله بالكيلوجرام (كجم) باعتباره النظام المتري المستخدم فى كل الحسابات والمعايير المرجعية.</p>`;
        }

        // ---------- 8) قائمة "مهام اليوم" موحّدة ----------
        function computeUnifiedTodayTasks(b, m) {
            const items = computeTodayDueItems(b, m);
            const alerts = computeAlerts(b, m);
            const urgentAlerts = alerts.filter(a => a.level === 'danger' || a.level === 'warn').slice(0, 6);
            return { ...items, urgentAlerts };
        }
        function showTodayTasksModal() {
            const b = getActiveBatch();
            if (!b) { showToast('اختر أو أنشئ دفعة أولًا'); return; }
            const m = computeMetrics(b);
            const t = computeUnifiedTodayTasks(b, m);
            const sec = (title, rows) => rows.length ? `<div style="font-weight:800;color:var(--barn);font-size:12.5px;margin:10px 0 4px;">${title}</div>${rows.join('')}` : '';
            const html = `
                <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">${t.date} · عمر القطيع ${t.age} يوم${t.hasToday ? '' : ' · <b style="color:var(--red);">⚠️ لم يُسجَّل سجل اليوم بعد</b>'}</div>
                ${sec('🔔 تنبيهات عاجلة', t.urgentAlerts.map(a => `<div class="check-row"><div class="txt"><div style="color:${a.level === 'danger' ? 'var(--red)' : 'var(--warning-text)'};">${esc(a.text)}</div></div></div>`))}
                ${sec('💉 تحصينات مستحقة اليوم', t.dueVacc.map(v => `<div class="check-row"><input type="checkbox" onchange="dailyToggleVaccine('${v.id}');closeModal('genericModalOverlay');showToast('✅ تم التسجيل')"><div class="txt">${esc(v.name)}</div></div>`))}
                ${sec('🧴 معاملات مستحقة اليوم', t.dueTreat.map(x => `<div class="check-row"><input type="checkbox" onchange="dailyToggleTreatment('${x.id}');closeModal('genericModalOverlay');showToast('✅ تم التسجيل')"><div class="txt">${esc(x.name)}</div></div>`))}
                ${sec('🌾 إضافات علف/ماء مستحقة', [...t.activeFeed.map(a => `<div class="check-row"><div class="txt">🌾 ${esc(a.name)}</div></div>`), ...t.activeWater.map(a => `<div class="check-row"><div class="txt">💧 ${esc(a.name)}</div></div>`)])}
                ${sec('✅ تشيك ليست العمليات اليومية', t.pendingChecklist.map(x => `<div class="check-row"><div class="txt">${esc(x.text)}</div></div>`))}
                ${(!t.urgentAlerts.length && !t.dueVacc.length && !t.dueTreat.length && !t.activeFeed.length && !t.activeWater.length && !t.pendingChecklist.length && t.hasToday) ? '<div class="empty" style="padding:14px;">🎉 لا توجد مهام معلّقة — كل حاجة مسجَّلة النهاردة</div>' : ''}
                <button class="btn gold block" style="margin-top:12px;" onclick="closeModal('genericModalOverlay');openWorkerSheetPrint()">🖨️ طباعة ورقة تعليمات للعامل</button>
            `;
            openGenericModal('📋 مهام اليوم', html);
        }

        // ---------- 9) دليل الأمراض — قابل للتصفح والتعديل الكامل (إضافة/تعديل/حذف) من المستخدم ----------
        let editingDiseaseId = null;
        function showDiseaseLibrary() {
            const html = `
                <input id="diseaseSearchInput" type="text" placeholder="ابحث باسم المرض أو عرَض..." style="width:100%;padding:11px 14px;border:1.5px solid var(--line);border-radius:10px;font-size:13px;margin-bottom:8px;" oninput="filterDiseaseLibrary(this.value)">
                <div id="diseaseLibList"></div>
                <button class="btn ghost block" style="margin-top:10px;" onclick="openDiseaseEditForm(null)">➕ إضافة مرض جديد للدليل</button>
                <p style="font-size:10.5px;color:var(--muted);margin-top:10px;">⚠️ مرجع استرشادي سريع فقط وليس بديلًا عن تشخيص طبيب بيطري — عند الشك استشر بيطري العهدة فورًا خصوصًا مع نفوق مرتفع أو مفاجئ.</p>`;
            openGenericModal('🩺 دليل الأمراض', html);
            filterDiseaseLibrary('');
        }
        function filterDiseaseLibrary(qRaw) {
            const q = (qRaw || '').trim().toLowerCase();
            const box = document.getElementById('diseaseLibList');
            if (!box) return;
            const list = state.diseaseKB || [];
            const rows = list.filter(d => !q || d.name.toLowerCase().includes(q) || (d.symptomsText || '').toLowerCase().includes(q));
            box.innerHTML = rows.length ? rows.map(d => `
                <div class="check-row"><button class="del-x" onclick="removeDiseaseFromKB('${d.id}')" title="حذف">✕</button><div class="txt" onclick="openDiseaseEditForm('${d.id}')" style="cursor:pointer;">
                    <div style="font-weight:800;color:var(--barn-dark);">🩺 ${esc(d.name)} <span style="font-size:10px;color:var(--muted);font-weight:400;">(✏️ اضغط للتعديل)</span></div>
                    ${d.symptomsText ? `<div class="day" style="margin-top:3px;"><b>الأعراض:</b> ${esc(d.symptomsText)}</div>` : ''}
                    ${d.diffText ? `<div class="day" style="margin-top:3px;"><b>يُفرَّق عن غيره بـ:</b> ${esc(d.diffText)}</div>` : ''}
                    <div class="day" style="margin-top:3px;color:var(--muted);">العمر: ${d.ageMin}-${d.ageMax} يوم${(d.requiredSigns||[]).length ? ' · مربوط بتوقّع الحالة الظاهرية اليومية' : ' · مرجعي بس (مفيش توقيع أعراض للمطابقة التلقائية)'}</div>
                </div></div>`).join('') : '<div class="empty" style="padding:14px;">لا توجد نتائج مطابقة</div>';
        }
        function removeDiseaseFromKB(id) {
            if (!requirePermission('management')) return;
            showConfirm('سيتم حذف هذا المرض من الدليل نهائيًا. متأكد؟', () => {
                setState('diseaseKB', (state.diseaseKB || []).filter(d => d.id !== id));
                persist();
                filterDiseaseLibrary(document.getElementById('diseaseSearchInput') ? document.getElementById('diseaseSearchInput').value : '');
                showToast('تم حذف المرض من الدليل');
            });
        }
        // ============ فورم إضافة/تعديل مرض — بما فيه اختيار الأعراض (اختياري) اللي بتربطه بتوقّع الحالة الظاهرية ============
        function openDiseaseEditForm(id) {
            editingDiseaseId = id;
            const d = id ? (state.diseaseKB || []).find(x => x.id === id) : null;
            const allSelected = new Set();
            if (d) { (d.requiredSigns || []).forEach(c => allSelected.add(c + ':required')); (d.supportingSigns || []).forEach(c => allSelected.add(c + ':supporting')); }
            const signsHtml = CLINICAL_SIGN_GROUPS.map(g => `
                <div style="margin-top:6px;"><div style="font-size:12px;font-weight:700;color:#8a5a34;margin-bottom:3px;">${g.label}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;">
                    ${g.signs.map(s => `<label style="display:flex;align-items:center;gap:3px;background:#fff;border:1px solid #ecd3ba;border-radius:8px;padding:4px 7px;font-size:11px;">
                        <select data-code="${s.code}" class="dzSignSelect" style="border:none;font-size:10.5px;padding:0;background:transparent;">
                            <option value="">—</option>
                            <option value="required" ${allSelected.has(s.code + ':required') ? 'selected' : ''}>أساسي</option>
                            <option value="supporting" ${allSelected.has(s.code + ':supporting') ? 'selected' : ''}>مساند</option>
                        </select>${s.label}</label>`).join('')}
                </div></div>`).join('');
            const html = `
                <div class="form-grid">
                    <div class="field full"><label>اسم المرض</label><input id="dz_name" value="${d ? esc(d.name) : ''}"></div>
                    <div class="field"><label>أقل عمر (يوم)</label><input type="number" id="dz_ageMin" value="${d ? d.ageMin : 1}"></div>
                    <div class="field"><label>أكبر عمر (يوم)</label><input type="number" id="dz_ageMax" value="${d ? d.ageMax : 60}"></div>
                    <div class="field full"><label>الأعراض (وصف حر)</label><textarea id="dz_symptomsText" rows="2">${d ? esc(d.symptomsText || '') : ''}</textarea></div>
                    <div class="field full"><label>يُفرَّق عن غيره بـ (اختياري)</label><textarea id="dz_diffText" rows="2">${d ? esc(d.diffText || '') : ''}</textarea></div>
                    <div class="field full"><label>التوصية عند الاشتباه</label><textarea id="dz_recommendation" rows="2">${d ? esc(d.recommendation || '') : ''}</textarea></div>
                    <div class="field full">
                        <label>ربط بأعراض الفحص السريري اليومي (اختياري — لو حددت "أساسي" لعرض واحد على الأقل، المرض ده هيظهر تلقائيًا فى توقعات السجل اليومي لو نفس العرض اتسجّل)</label>
                        ${signsHtml}
                    </div>
                </div>
                <button class="btn ghost block" style="margin-top:10px;" onclick="saveDiseaseToKB()">${d ? '✏️ حفظ التعديل' : '+ إضافة للدليل'}</button>`;
            openGenericModal(d ? '✏️ تعديل مرض' : '➕ إضافة مرض جديد', html);
        }
        function saveDiseaseToKB() {
            if (!requirePermission('management')) return;
            const name = document.getElementById('dz_name').value.trim();
            if (!name) { showToast('اكتب اسم المرض أولاً'); return; }
            const ageMin = parseInt(document.getElementById('dz_ageMin').value) || 1;
            const ageMax = parseInt(document.getElementById('dz_ageMax').value) || 60;
            const symptomsText = document.getElementById('dz_symptomsText').value.trim();
            const diffText = document.getElementById('dz_diffText').value.trim();
            const recommendation = document.getElementById('dz_recommendation').value.trim();
            const requiredSigns = [], supportingSigns = [];
            document.querySelectorAll('.dzSignSelect').forEach(sel => {
                if (sel.value === 'required') requiredSigns.push(sel.getAttribute('data-code'));
                else if (sel.value === 'supporting') supportingSigns.push(sel.getAttribute('data-code'));
            });
            const list = (state.diseaseKB || []).slice();
            if (editingDiseaseId) {
                const idx = list.findIndex(d => d.id === editingDiseaseId);
                if (idx > -1) list[idx] = { ...list[idx], name, ageMin, ageMax, symptomsText, diffText, recommendation, requiredSigns, supportingSigns };
            } else {
                list.push({ id: uid(), name, ageMin, ageMax, symptomsText, diffText, recommendation, requiredSigns, supportingSigns });
            }
            setState('diseaseKB', list);
            persist();
            editingDiseaseId = null;
            showToast('تم الحفظ فى دليل الأمراض ✅');
            showDiseaseLibrary();
        }

        // ---------- 10) شاشة ترحيب وتهيئة أولى لمستخدم جديد ----------
        const ONBOARDING_KEY = 'poultry_onboarded_v1';
        let onbCurrentStep = 1;
        // ============ 📋 ملخص الأولويات اليومي — قائمة منبثقة أول ما يفتح التطبيق فيها كل حاجة محتاج
        // يعرفها وينفّذها، مرتبة الأهم فالأهم، وكل بند قابل للتنفيذ مباشرة بزرار. تظهر مرة واحدة كل يوم
        // (قابلة للإلغاء)، مبنية على نفس محرك computeUnifiedPriorities المستخدم فى كارت "أهم 3 أفعال"
        // بالداشبورد، فمفيش منطق مكرر أو مصدر بيانات تاني لازم يتزامن معاه. ============
        const DAILY_BRIEF_KEY_PREFIX = 'katkot_dailyBrief_seen_';
        function computeDailyBriefData(b) {
            if (!b) return null;
            const m = computeMetrics(b);
            const fin = computeFinance(b, m);
            const alerts = computeAlerts(b, m);
            const ins = computeInsights(b, m);
            const ops = computeOpsRisk(b, m);
            const hs = computeHealthScore(b, m, alerts, ins, ops);
            const saleAdv = computeMarketSaleAdvice(b, m, fin);
            return computeUnifiedPriorities(b, m, fin, alerts, ins, ops, hs, saleAdv);
        }
        function maybeShowDailyBrief() {
            // بس للمالك — تنبيهات مالية/إدارية حساسة ممكن تظهر هنا، والعامل أصلاً بيشوف مهامه الخاصة فى
            // "الأساسيات ← مهمتك دلوقتي" جوه السجل اليومي نفسه.
            if (currentRole !== 'owner') return;
            const b = getActiveBatch();
            if (!b) return; // مفيش دفعة نشطة = مفيش حاجة تتلخّص أصلاً
            let seenKey = null;
            try { seenKey = localStorage.getItem(DAILY_BRIEF_KEY_PREFIX + b.id); } catch (e) {}
            if (seenKey === todayStr()) return; // اتشاف النهارده خلاص
            const pr = computeDailyBriefData(b);
            if (!pr || !pr.ranked.length) return; // مفيش أولويات أصلاً = مفيش داعي نزعج المستخدم بقائمة فاضية
            renderDailyBrief(pr);
            document.getElementById('dailyBriefModalOverlay').classList.add('show');
        }
        function renderDailyBrief(pr) {
            const body = document.getElementById('dailyBriefBody');
            if (!body) return;
            const top = pr.ranked.slice(0, 8);
            body.innerHTML = top.map(it => {
                const level = it.weight >= 8 ? 'danger' : (it.weight >= 5 ? 'warn' : 'info');
                const actionBtn = it.action
                    ? (() => { const idx = registerKatkotAction(it.action); return `<button type="button" class="btn gold xs" style="flex-shrink:0;" onclick="closeDailyBrief(); runKatkotAction(${idx});" title="ينفّذ الإجراء المناسب فورًا">${esc(it.action.label || '⚡ نفّذ')}</button>`; })()
                    : '';
                return `<div class="alert-item ${level}" style="margin-bottom:6px;justify-content:space-between;">
                    <span style="flex:1;">${it.icon} ${esc(it.text)}${it.recurringNote ? `<br><span style="font-size:10.5px;font-weight:600;opacity:.85;">${it.recurringNote}</span>` : ''}</span>
                    ${actionBtn}
                </div>`;
            }).join('');
        }
        function closeDailyBrief() {
            const b = getActiveBatch();
            if (b) { try { localStorage.setItem(DAILY_BRIEF_KEY_PREFIX + b.id, todayStr()); } catch (e) {} }
            closeModal('dailyBriefModalOverlay');
        }

        function maybeShowOnboarding() {
            if (currentRole !== 'owner') return;
            let seen = null;
            try { seen = localStorage.getItem(ONBOARDING_KEY); } catch (e) {}
            if (seen) return;
            if (state.batches && state.batches.length) { try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch (e) {} return; }
            onbCurrentStep = 1;
            updateOnboardingStepUI();
            document.getElementById('onboardingModalOverlay').classList.add('show');
        }
        function updateOnboardingStepUI() {
            [1, 2, 3].forEach(i => {
                const step = document.getElementById('onbStep' + i);
                const dot = document.getElementById('onbDot' + i);
                if (step) step.classList.toggle('active', i === onbCurrentStep);
                if (dot) dot.classList.toggle('active', i === onbCurrentStep);
            });
            document.getElementById('onbNextBtn').textContent = onbCurrentStep === 3 ? '🐣 إنشاء أول دفعة' : 'التالي';
        }
        function onboardingNext() {
            if (onbCurrentStep === 2) {
                const name = document.getElementById('onb_farmName').value.trim();
                if (name) { setState('farmName', name); persist(); }
            }
            if (onbCurrentStep < 3) { onbCurrentStep++; updateOnboardingStepUI(); return; }
            finishOnboarding();
            openBatchModal();
        }
        function skipOnboarding() { finishOnboarding(); }
        function finishOnboarding() {
            try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch (e) {}
            closeModal('onboardingModalOverlay');
        }

        // ============ 🔒 تحصين أداء: بعد ما بقت المكتبات الخارجية (فايربيز/xlsx/html2pdf/qrcode) بتتحمّل بـ defer ============
        // لازم ننادي أي حاجة بتعتمد عليها (خصوصًا initFirebaseCloud اللي بتستخدم window.firebase) من جوه
        // DOMContentLoaded، مش مباشرة فى نص السكريبت — عشان نضمن إن الملفات دي خلصت تحميل وتنفيذ فعلاً
        // قبل ما نحاول نستخدمها (المتصفح بينفّذ كل الـ defer scripts بالترتيب قبل ما يطلق DOMContentLoaded).
        document.addEventListener('DOMContentLoaded', () => {
            registerKatkotServiceWorker();
            initFirebaseCloud(); // بيتولى هو نفسه استدعاء بوابة إذن الاستخدام أول ما فايربيز يجهز (نجاح أو فشل)
            // مؤقت أمان: لو فايربيز اتعلّق (نت بطيء/متقطع) ومردش خلال 6 ثواني، كمّل بالمسار اليدوي بدل ما الشاشة تفضل فاضية للأبد
            setTimeout(() => { if (!_authFlowHandled) onFirebaseAuthUnavailable(); }, 6000);
        });

        // ============ تحديث تلقائي لبيانات الطقس كل ساعة (لو موقع المزرعة محدد) — يقرأ درجة الحرارة والرطوبة من غير تدخل يدوي ============
        function autoRefreshWeatherIfStale() {
            if (!state.farmLocation) return;
            const last = state.farmWeatherForecast && state.farmWeatherForecast.fetchedAt;
            const ageHours = last ? (new Date() - new Date(last)) / 3600000 : Infinity;
            if (ageHours >= 1 && !weatherLoading) checkWeatherAlert(true);
        }
        setTimeout(autoRefreshWeatherIfStale, 3000); // فحص أول مرة بعد فتح التطبيق بلحظات
        setInterval(autoRefreshWeatherIfStale, 3600000); // ثم كل ساعة تلقائيًا طول ما التطبيق مفتوح
    