        function getActiveBatch() {
            const b = state.batches.find(b => b.id === state.activeId);
            // ============ 🔒 تحصين أمني (Red Team fix — Privilege Escalation) ============
            // قبل التعديل: كل الدوال اللي بتحفظ/تعدّل بيانات الدفعة (سجل يومي، علاجات، مصروفات...)
            // كانت بتاخد الدفعة من state.activeId من غير أي تحقق تاني. وبما إن state متغيّر جافاسكريبت
            // عادي فى الذاكرة، أي عامل يفتح Console المتصفح كان يقدر يكتب:
            //   state.activeId = '<id بتاع دفعة غير مرتبطة بيه>'; ثم يستدعي أي دالة حفظ عادي
            // ويعدّل/يمسح بيانات دفعة تانية مش من صلاحياته — رغم إن الواجهة نفسها كانت مقفولة.
            // الحل: نخلي نقطة الوصول المركزية (getActiveBatch بتتنادى فى +130 مكان) ترفض ترجّع
            // أي دفعة غير اللي المالك خصصها فعليًا للعامل ده، بغض النظر عن قيمة activeId.
            if (currentRole === 'worker') {
                if (!currentWorker || !currentWorker.batchId || !b || b.id !== currentWorker.batchId) return null;
            }
            return b;
        }

        function saveBatch() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix: كانت قابلة للنداء من Console بدون أي تحقق صلاحية — أي عامل ممكن ينشئ/يعدّل دفعة كاملة
            const name = document.getElementById('b_name').value.trim();
            const location = document.getElementById('b_location').value.trim();
            const species = document.getElementById('b_species').value;
            const date = document.getElementById('b_date').value;
            const count = parseInt(document.getElementById('b_count').value);
            const breed = document.getElementById('b_breed').value.trim() || getSpeciesData(species).label;
            const startweight = parseFloat(document.getElementById('b_startweight').value) || 42;
            const chickprice = parseFloat(document.getElementById('b_chickprice').value) || 0;
            const feedprice = parseFloat(document.getElementById('b_feedprice').value) || 0;
            const area = parseFloat(document.getElementById('b_area').value) || 0;
            const targetAge = parseInt(document.getElementById('b_targetage').value) || null;
            const targetWeight = parseFloat(document.getElementById('b_targetweight').value) || null;
            const heattype = document.getElementById('b_heattype').value || 'gas';
            const heatprice = parseFloat(document.getElementById('b_heatprice').value) || 0;
            const ventType = document.getElementById('b_venttype').value || 'natural';
            const fanCapacityM3h = parseFloat(document.getElementById('b_fancapacity').value) || 0;
            const fanCount = parseInt(document.getElementById('b_fancount').value) || 0;
            const floorType = document.getElementById('b_floortype').value || 'litter';
            const cageTiers = Math.max(parseInt(document.getElementById('b_cagetiers').value) || 1, 1);
            const startmonth = parseInt(document.getElementById('b_startmonth').value) || (new Date().getMonth() + 1);
            const feedStageStarterKg = parseFloat(document.getElementById('b_feedStarterKg').value) || null;
            const feedStageGrowerKg = parseFloat(document.getElementById('b_feedGrowerKg').value) || null;
            const applyProtocolId = document.getElementById('b_applyProtocol') ? document.getElementById('b_applyProtocol').value : '';
            if (!name || !date || !count) { showToast('أكمل الاسم والتاريخ والعدد'); return; }
            if (editingBatchId) {
                const eb = state.batches.find(x => x.id === editingBatchId);
                if (!eb) { editingBatchId = null; closeModal('batchModalOverlay'); return; }
                Object.assign(eb, { name, location, species, breed, startDate: date, startCount: count, startweight, chickprice, feedprice, area, targetAge, targetWeight, heattype, heatprice, ventType, fanCapacityM3h, fanCount, floorType, cageTiers, startmonth, feedStageStarterKg, feedStageGrowerKg });
                editingBatchId = null;
                persist();
                closeModal('batchModalOverlay');
                if (applyProtocolId) { setState('activeId', eb.id); applyProtocol(applyProtocolId); }
                render();
                showToast('تم تحديث بيانات الدفعة بنجاح ✅');
                return;
            }
            const spData = getSpeciesData(species, breed);
            const batch = {
                id: uid(),
                name,
                location,
                species,
                breed,
                startDate: date,
                startCount: count,
                startweight,
                chickprice,
                feedprice,
                area,
                targetAge,
                targetWeight,
                heattype,
                heatprice,
                ventType,
                fanCapacityM3h,
                fanCount,
                floorType,
                cageTiers,
                startmonth,
                feedStageStarterKg,
                feedStageGrowerKg,
                status: 'نشطة',
                archivedDate: null,
                records: [],
                purchases: [],
                sales: [],
                customItems: [],
                inventory: [],
                stockMovements: [],
                reminders: [],
                vaccineLog: (spData.vaccines || []).map(v => ({ id: uid(), day: v.day, name: v.name, done: false, doneDate: null })),
                treatmentLog: [],
                feedAdditives: [],
                waterAdditives: [],
                additiveExecLog: [],
                checklistTemplate: getDefaultChecklist(floorType).map((t, i) => ({ id: 'ck' + i, text: t })),
                checklistLog: [],
                biosecurityLog: [],
                houses: [],
                feedTransitions: [],
                aiRecommendationLog: [],
                outageLog: [],
                quickInterventions: [],
                incidents: []
            };
            state.batches.push(batch);
            setState('activeId', batch.id);
            setState('activeTab', 'production');
            if (currentRole === 'worker' && currentWorker) {
                // اربط العامل تلقائيًا بالدفعة اللي أنشأها بنفسه عشان يقدر يشتغل عليها فورًا
                currentWorker.batchId = batch.id;
                const auth = getAuth();
                if (auth) {
                    const w = (auth.workers || []).find(x => x.id === currentWorker.id);
                    if (w) { w.batchId = batch.id; saveAuth(auth); }
                }
                const badge = document.getElementById('workerRoleBadge');
                if (badge) badge.textContent = `👷 ${currentWorker.name} — ${batch.name}`;
            }
            persist();
            closeModal('batchModalOverlay');
            ['b_name', 'b_count', 'b_chickprice', 'b_feedprice', 'b_area', 'b_targetage', 'b_targetweight', 'b_breed', 'b_heatprice']
            .forEach(id => document.getElementById(id).value = '');
            let protocolMsg = '';
            if (applyProtocolId) { applyProtocol(applyProtocolId); protocolMsg = ' + تم تحميل البروتوكول المختار'; }
            render();
            showToast('تم إنشاء الدفعة بنجاح 🐣 — تم تجهيز برنامج التحصينات القياسي لهذا النوع تلقائيًا' + protocolMsg);
            setTimeout(() => offerInventoryCarryOver(batch), 500);
        }

        // ============ ✨ عرض ترحيل مخزون متبقي من دورة سابقة (نفس النوع) عند إنشاء دفعة جديدة ============
        // كل دفعة عندها b.inventory مستقل يبدأ فاضي دايمًا (شوف ملاحظة الأمان فى saveBatch/endCycle) —
        // الدالة دي بتعوّض عن كده بعرض أي رصيد اتسجّل وقت أرشفة آخر دورة من نفس النوع، وتخلي المستخدم
        // يقرر هل يرحّله فعليًا (يفترض إنه نفس المكان الفعلي) أو لأ.
        function offerInventoryCarryOver(batch) {
            const pending = (state.pendingCarryOver || []).filter(c => c.species === batch.species);
            if (!pending.length) return;
            const co = pending.sort((a, c) => c.date.localeCompare(a.date))[pending.length - 1]; // الأحدث لو فيه أكتر من واحد
            // عرض لمرة واحدة بس — سواء اتقبل أو اتراض، ميتكررش على كل دفعة جديدة تانية من نفس النوع
            setState('pendingCarryOver', (state.pendingCarryOver || []).filter(c => c.id !== co.id));
            persist();
            const itemsListHtml = co.items.map(i => `• ${esc(i.name)}: ${fmt(i.balance,2)} ${esc(i.unit)}`).join('<br>');
            const locNote = co.location ? ` (${esc(co.location)})` : '';
            showConfirm(
                `فيه مخزون متبقي من دورة سابقة "${esc(co.fromBatchName)}"${locNote} أُرشفت فى ${co.date}:<br><br>${itemsListHtml}<br><br>` +
                `تحب ترحّل الرصيد ده لبداية الدفعة الجديدة؟ (تأكد الأول إنه فعلاً نفس مكان التخزين قبل الموافقة)`,
                () => {
                    const b = state.batches.find(x => x.id === batch.id);
                    if (!b) return;
                    co.items.forEach(i => {
                        let it = findInvItem(b, i.name, i.category);
                        if (!it) { it = { id: uid(), name: i.name, category: i.category, unit: i.unit, balance: 0 }; b.inventory.push(it); }
                        it.balance += i.balance;
                        b.stockMovements.push({ id: uid(), itemId: it.id, itemName: it.name, type: 'in', qty: i.balance, date: todayStr(), note: `ترحيل رصيد من دورة سابقة: ${co.fromBatchName}` });
                    });
                    persist();
                    render();
                    showToast('✅ تم ترحيل المخزون المتبقي للدفعة الجديدة');
                },
                '📦 ترحيل مخزون من دورة سابقة؟'
            );
        }

        function selectBatch(id) {
            if (currentRole === 'worker') return; // العامل مقفول على دفعته المرتبطة فقط
            setState('activeId', id);
            persist();
            render(); }

        function visibleTabs() {
            if (currentRole !== 'worker') return TABS;
            const perms = (currentWorker && Array.isArray(currentWorker.permissions) && currentWorker.permissions.length)
                ? currentWorker.permissions : DEFAULT_WORKER_PERMISSIONS;
            return TABS.filter(t => t.id !== 'settings' && perms.includes(t.id));
        }

        function setTab(id) {
            // ✅ تحقق موجود مسبقًا وسليم من ناحية المنطق — لكنه دفاع UI فقط (يمنع التنقل من الواجهة).
            // لا يمنع استدعاء دوال الحفظ مباشرة من الـ Console، لذلك التحصين الحقيقي انتقل لمستوى
            // البيانات نفسها فى getActiveBatch() ودوال الحفظ (راجع تعليقات القسم الأمني بالأسفل).
            if (!visibleTabs().some(t => t.id === id)) return; // العامل مقيّد بالتابات المسموح له بيها فقط
            setState('activeTab', id);
            persist();
            render(); }

        function activeBatches() { return state.batches.filter(b => b.status !== 'مؤرشفة'); }

        function archivedBatches() { return state.batches.filter(b => b.status === 'مؤرشفة'); }

        function deleteBatch(id) {
            if (!requirePermission('owner')) return; // 🔧 توحيد: نفس آلية requirePermission (كانت تتحقق بصمت بدون toast للعامل)
            const b = state.batches.find(b => b.id === id);
            if (!b) return;
            showConfirm(`سيتم حذف دفعة "${b.name}" وكل سجلاتها نهائيًا ولا يمكن التراجع. هل أنت متأكد؟`, () => {
                logAudit(b, `🗑️ حذف الدفعة نهائيًا: ${b.name}`);
                setState('batches', state.batches.filter(x => x.id !== id));
                if (state.activeId === id) setState('activeId', activeBatches().length ? activeBatches()[0].id : null);
                persist();
                render();
                showToast('تم حذف الدفعة');
            });
        }

        function endCycle(id) {
            const b = state.batches.find(b => b.id === id);
            if (!b) return;
            showConfirm(
                `سيتم إنهاء وأرشفة دورة "${b.name}". تبقى كل بياناتها محفوظة بالكامل ويمكن الرجوع لها من "📁 الأرشيف" أو مقارنتها لاحقًا. هل تريد المتابعة?`,
            () => {
                // ============ رصد رقم قياسي جديد قبل الأرشفة — بنقارن أداء هذه الدورة بأفضل دورة مؤرشفة سابقة لنفس النوع ============
                const mBefore = computeMetrics(b);
                const priorArchived = state.batches.filter(x => x.status === 'مؤرشفة' && x.species === b.species);
                let priorBestFcr = null, priorBestEpef = null;
                priorArchived.forEach(x => {
                    const xm = computeMetrics(x);
                    if (xm.fcr != null && (priorBestFcr == null || xm.fcr < priorBestFcr)) priorBestFcr = xm.fcr;
                    if (xm.epef != null && (priorBestEpef == null || xm.epef > priorBestEpef)) priorBestEpef = xm.epef;
                });
                const newFcrRecord = mBefore.fcr != null && priorArchived.length > 0 && (priorBestFcr == null || mBefore.fcr < priorBestFcr);
                const newEpefRecord = mBefore.epef != null && priorArchived.length > 0 && (priorBestEpef == null || mBefore.epef > priorBestEpef);

                b.status = 'مؤرشفة';
                b.archivedDate = todayStr();
                b.predictionAccuracyReport = computePredictionAccuracyForBatch(b); // ============ حساب دقة التوقعات الفعلية عند إغلاق الدورة ============
                finalizeCyclePointsOnArchive(b); // ============ 🎯 قفل نقاط الرعاية/التربية النهائية للعامل المرتبط بالدفعة دي وإضافتها لرصيده القابل للاستبدال ============
                if (state.activeId === id) setState('activeId', activeBatches().length ? activeBatches()[0].id : null);
                const recs = buildNextCycleRecommendations(b.species);
                if (recs) b.nextCycleRecommendations = recs;
                // ============ ✨ ميزة جديدة: رصد المخزون المتبقي عند الأرشفة لعرض ترحيله على الدفعة القادمة ============
                // كل دفعة عندها مخزون مستقل (b.inventory)، فمن غير ده أي رصيد فعلي متبقي (أدوية/إضافات/علف)
                // كان بيختفي من تتبع النظام تمامًا لما تتقفل الدورة وتتعمل دفعة جديدة (مخزونها بيبدأ صفر دايمًا).
                const leftover = (b.inventory || []).filter(i => i.balance > 0.001);
                if (leftover.length) {
                    setState('pendingCarryOver', (state.pendingCarryOver || []).filter(c => c.species !== b.species));
                    state.pendingCarryOver.push({
                        id: uid(), fromBatchId: b.id, fromBatchName: b.name, species: b.species, location: b.location || '', date: todayStr(),
                        items: leftover.map(i => ({ name: i.name, category: i.category, unit: i.unit, balance: i.balance }))
                    });
                }
                persist();
                render();
                if (newFcrRecord || newEpefRecord) {
                    vibrate([40, 60, 40, 60, 80]);
                    const parts = [];
                    if (newFcrRecord) parts.push(`أفضل FCR محقق: <b>${fmt(mBefore.fcr,2)}</b> (كان ${fmt(priorBestFcr,2)})`);
                    if (newEpefRecord) parts.push(`أفضل EPEF محقق: <b>${fmt(mBefore.epef,0)}</b> (كان ${fmt(priorBestEpef,0)})`);
                    showToast('🏆 رقم قياسي جديد فى الدورة دي!');
                    setTimeout(() => showInfo('🏆 رقم قياسي جديد!', `دورة "${esc(b.name)}" كسرت أرقامك القياسية السابقة:<br>${parts.join('<br>')}`), 500);
                } else {
                    showToast('تم إنهاء الدورة وأرشفتها 📁');
                }
                if (recs) setTimeout(() => showInfo('💡 توصيات للدورة القادمة', recs), (newFcrRecord || newEpefRecord) ? 1400 : 400);
            });
        }

        function reactivateBatch(id) {
            const b = state.batches.find(b => b.id === id);
            if (!b) return;
            b.status = 'نشطة';
            b.archivedDate = null;
            setState('activeId', id);
            // إصلاح: لو الدورة دي كانت ولّدت "ترحيل مخزون معلّق" وقت أرشفتها، لازم يتلغي — لأن رصيدها
            // ممكن يتغيّر تاني دلوقتي وهي شغالة، فالنسخة المحفوظة بقت غير موثوقة.
            setState('pendingCarryOver', (state.pendingCarryOver || []).filter(c => c.fromBatchId !== id));
            persist();
            closeModal('archiveModalOverlay');
            render();
            showToast('تم إعادة تنشيط الدورة');
        }

        function openArchiveModal() {
            const wrap = document.getElementById('archiveListWrap');
            const list = archivedBatches();
            wrap.innerHTML = list.length ? list.map(b => {
                const m = computeMetrics(b);
                return `<div class="card" style="margin-top:10px;">
                    <div><b>${esc(b.name)}</b><div style="font-size:11px;color:var(--muted);">أُرشفت فى ${b.archivedDate} · العمر النهائي ${m.age} يوم · ${fmt(b.startCount,0)} كتكوت</div></div>
                    <div class="row-actions">
                        <button class="btn ghost sm" style="flex:1;" onclick="reactivateBatch('${b.id}')">↩️ إعادة تنشيط</button>
                        <button class="btn danger sm" style="flex:1;" onclick="permanentDeleteBatch('${b.id}')">🗑️ حذف نهائي</button>
                    </div>
                    ${b.nextCycleRecommendations ? `<div class="row-actions" style="margin-top:6px;"><button class="btn gold sm" style="flex:1;" onclick="showBatchRecommendations('${b.id}')">💡 عرض توصيات الدورة القادمة</button></div>` : ''}
                </div>`;
            }).join('') :
            `<div class="empty"><div class="ico">📁</div>لا توجد دورات مؤرشفة حتى الآن.</div>`;
            document.getElementById('archiveModalOverlay').classList.add('show');
        }
        function showBatchRecommendations(id) {
            const b = state.batches.find(x => x.id === id);
            if (!b || !b.nextCycleRecommendations) return;
            showInfo(`💡 توصيات الدورة القادمة — ${b.name}`, b.nextCycleRecommendations);
        }

        function permanentDeleteBatch(id) {
            const b = state.batches.find(b => b.id === id);
            if (!b) return;
            showConfirm(`سيُحذف أرشيف "${b.name}" نهائيًا ولا يمكن التراجع. متأكد؟`, () => {
                setState('batches', state.batches.filter(x => x.id !== id));
                persist();
                openArchiveModal();
                render();
                showToast('تم الحذف النهائي');
            });
        }

        // ============ Inventory helpers ============
        // المطابقة تتم بالاسم فقط (بعد تجاهل الحالة والمسافات) — بما يتوافق تمامًا مع منطق
        // "دمج الأصناف المكررة". لو تمت المطابقة بالاسم + التصنيف معًا، أي اختيار خاطئ أو افتراضي
        // للتصنيف عند إضافة كمية (مثال: المودال يفتح دائمًا على "علف" كقيمة افتراضية) كان يؤدي لإنشاء
        // صنف مكرر بنفس الاسم برصيد منفصل بدل تحديث رصيد الصنف الأصلي — وهو ما كان يظهر كرصيد سالب
        // لا يتغير رغم إضافة كمية جديدة. صنف موجود دائمًا يحتفظ بتصنيفه ووحدته الأصليين.
        // ============ تطبيع أسماء الأصناف (لمنع تكرار نفس الصنف باختلافات كتابية بسيطة) ============
