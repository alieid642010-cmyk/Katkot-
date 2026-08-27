        function updateConnStatus() {
            const online = navigator.onLine;
            [document.getElementById('connStatusOwner'), document.getElementById('connStatusWorker')].forEach(el => {
                if (!el) return;
                el.style.display = 'inline-block';
                // ============ (جديد) حالة "بيتم الحفظ" — تظهر بس وقت رفع فعلي للسحاب، مش دايمًا، عشان متبقاش إزعاج بصري ============
                if (online && _cloudSyncing) { el.textContent = '🔄 بيتم الحفظ...'; el.style.background = ''; }
                else { el.textContent = online ? '🟢 متصل' : '⚪ أوفلاين — البيانات محفوظة محليًا بأمان'; el.style.background = online ? '' : 'rgba(255,255,255,.15)'; }
            });
        }
        window.addEventListener('online', updateConnStatus);
        window.addEventListener('offline', updateConnStatus);

        function render() {
            // ============ 🎯 تحسين UX (المرحلة 1 من خطة الهندسة المعمارية): حفظ موضع السكرول والتركيز ============
            // الرسم الحالي بيهد الصفحة كاملة (innerHTML) ويبنيها من جديد فى كل نداء render() (130+ نداء فى
            // كل التطبيق)، وده كان بيرجّع المستخدم لأعلى الصفحة فى كل مرة يضغط فيها حفظ/حذف/تبديل قسم —
            // حتى لو هو واقف فى نص جدول طويل. الحل هنا بسيط وآمن 100%: نحفظ موضع السكرول + العنصر اللي
            // كان عليه التركيز (والـ cursor جواه لو حقل كتابة) قبل الهدم، ونستعيدهم بعد إعادة البناء —
            // إلا لو التبويب النشط اتغيّر فعليًا، وقتها المنطقي إننا نبدأ من أعلى التبويب الجديد.
            const _scrollX = window.scrollX, _scrollY = window.scrollY;
            const _active = document.activeElement;
            const _activeId = (_active && _active.id) ? _active.id : null;
            const _selStart = (_active && typeof _active.selectionStart === 'number') ? _active.selectionStart : null;
            const _selEnd = (_active && typeof _active.selectionEnd === 'number') ? _active.selectionEnd : null;
            const _tabChanged = (_lastRenderedTab !== null && _lastRenderedTab !== state.activeTab);
            const _t0 = performance.now(); // ⏱️ قياس أداء (المرحلة 1 — رصد بدون تخمين): نقيس فعليًا بدل ما نفترض إعادة الهيكلة مطلوبة

            try {
                renderInner();
            } catch (err) {
                const main = document.getElementById('mainContent');
                if (main) {
                    // ⚠️ إصلاح UX: كانت الشاشة بتعرض نص الخطأ التقني (stack trace) مباشرة كأول حاجة يشوفها
                    // المستخدم — مربك ومخيف لمربي غير تقني، وبيوهم إن البيانات ضاعت. دلوقتي: رسالة مطمئنة
                    // بالعربي الأول (البيانات محفوظة، جرب كذا)، والتفاصيل التقنية اختيارية جوه Details مطوية.
                    main.innerHTML = `<div class="card" style="margin-top:14px;border:2px solid #c0392b;background:#fdf1f0;">
                        <div style="font-size:15px;font-weight:800;color:#c0392b;margin-bottom:8px;">⚠️ حصلت مشكلة فى عرض الشاشة دي</div>
                        <div style="font-size:13px;color:#333;margin-bottom:10px;line-height:1.6;">
                            بياناتك محفوظة وآمنة — المشكلة فى العرض بس. جرّب الآتي بالترتيب:<br>
                            1) اضغط زر "إعادة تحميل" تحت<br>
                            2) لو استمرت، أقفل التطبيق وافتحه تاني<br>
                            3) لو لسه فيه مشكلة، افتح "تفاصيل تقنية" تحت وابعتها لحد يقدر يساعدك
                        </div>
                        <button class="btn gold" style="margin-bottom:8px;" onclick="location.reload()">🔄 إعادة تحميل</button>
                        <details style="margin-top:4px;">
                            <summary style="font-size:11.5px;color:var(--muted);cursor:pointer;">🔧 تفاصيل تقنية (للمطوّر فقط)</summary>
                            <textarea readonly style="width:100%;min-height:140px;font-size:11px;direction:ltr;text-align:left;padding:8px;border:1px solid #ccc;border-radius:6px;margin-top:6px;" onclick="this.select()">${(err && err.stack) ? err.stack : (err && err.message) || String(err)}</textarea>
                        </details>
                    </div>`;
                }
                console.error('renderInner failed:', err);
            }

            _lastRenderedTab = state.activeTab;

            // ⏱️ قياس أداء: لو الرسم أخد وقت ملحوظ (>120ms، حد محسوس فعليًا على الموبايل)، نسجّل تحذير
            // فى الـ Console يوضح التبويب وحجم البيانات وقتها — عشان لو حصل يومًا إبطاء حقيقي مع كبر
            // بيانات المزرعة، يكون عندنا دليل رقمي واضح نبني عليه قرار تحسين الأداء، مش تخمين.
            // ملحوظة: القياس ده مش بيتخزن ولا بيتزامن ولا بيغيّر أي سلوك — Console log محلي بس.
            const _renderMs = performance.now() - _t0;
            if (_renderMs > 120) {
                const _b = getActiveBatch && getActiveBatch();
                console.warn(`⏱️ render() بطيء نسبيًا: ${_renderMs.toFixed(0)}ms — التبويب: ${state.activeTab}` +
                    (_b ? ` — سجلات الدفعة النشطة: ${(_b.records || []).length}` : '') +
                    ` — إجمالي الدفعات: ${(state.batches || []).length}`);
            }

            if (_activeId) {
                const _restored = document.getElementById(_activeId);
                if (_restored && typeof _restored.focus === 'function') {
                    _restored.focus({ preventScroll: true });
                    if (_selStart !== null && typeof _restored.setSelectionRange === 'function') {
                        try { _restored.setSelectionRange(_selStart, _selEnd); } catch (e) { /* بعض أنواع الحقول (number/date) لا تدعم تحديد النطاق — تجاهل آمن */ }
                    }
                }
            }

            if (_tabChanged) {
                window.scrollTo(0, 0); // تبويب جديد فعليًا → المنطقي البدء من أعلاه
            } else {
                window.scrollTo(_scrollX, _scrollY); // نفس التبويب (حفظ/حذف/تبديل قسم) → نفضل مكاننا
            }
        }
        let _lastRenderedTab = null;
        function renderInner() {
            // ============ 🔒 (جديد) تحذير أمني وقت التشغيل لو أسرار التفعيل لسه على القيمة الافتراضية ============
            // MASTER_OVERRIDE_CODE و ACTIVATION_SECRET_SALT ظاهرين نص صريح فى ملف الـHTML العام على GitHub Pages —
            // أي حد يفتح "View Source" (من غير أي وصول للجهاز فعليًا) يقدر يقرأهم وقتها يقدر: (أ) يستخدم
            // MASTER_OVERRIDE_CODE عشان يخلي أي جهاز "جهاز مصدر/أدمن"، أو (ب) يشغّل computeActivationCode()
            // بنفسه فى الـConsole على أي deviceCode ويولّد كود تفعيل صحيح لأي جهاز تاني من غير موافقتك خالص.
            // ده عيب معماري متأصّل فى أي تطبيق عميل بالكامل (بدون سيرفر خاص) — مش حاجة ممكن "تتصلح" بالكامل
            // من جوه الكود نفسه، لكن أقل حاجة نقدر نعملها إننا ننبّهك بوضوح كل مرة لحد ما تغيّرهم فعليًا.
            if (currentRole === 'owner' && isSourceDevice()) {
                const usingDefaultMaster = MASTER_OVERRIDE_CODE === 'EID-6666-MASTER';
                const usingDefaultSalt = ACTIVATION_SECRET_SALT === 'KATKOT-PRO-EID-2026-SECRET';
                if (usingDefaultMaster || usingDefaultSalt) {
                    console.warn('⚠️ أمان: MASTER_OVERRIDE_CODE و/أو ACTIVATION_SECRET_SALT لسه على القيمة الافتراضية — أي حد يعمل View Source للموقع العام يقدر يفعّل أي جهاز أو يبقى أدمن. غيّرهم فورًا من أول السكريبت (سطر ~4503) قبل أي نشر عام.');
                    if (!sessionStorage.getItem('_defaultSecretWarnShown')) {
                        sessionStorage.setItem('_defaultSecretWarnShown', '1');
                        setTimeout(() => showToast('🔒 تنبيه أمان: كود التفعيل الرئيسي لسه على القيمة الافتراضية فى الكود — أي حد يشوف مصدر الصفحة العام يقدر يستخدمه. غيّره فورًا (تفاصيل فى الـConsole)'), 1200);
                    }
                }
            }
            updateConnStatus();
            updateHeaderIdentity();
            updateBatchCreateButtonUI();
            if (state.activeTab === 'custom') setState('activeTab', 'dashboard'); // تبويب البنود الإضافية أُلغي
            if (state.activeTab === 'ops') setState('activeTab', 'daily'); // تبويب العمليات والأمان الحيوي أُدمج داخل السجل اليومي
            if (state.activeTab === 'feed' || state.activeTab === 'environment' || state.activeTab === 'alerts') setState('activeTab', 'production'); // اتجمعوا فى تبويب الإنتاج
            if (state.activeTab === 'inventory') setState('activeTab', 'dashboard'); // (جديد) المخزون بقى كارت فى الداشبورد، مبقاش تبويب مستقل ولا جزء من الإدارة
            if (state.activeTab === 'finance' || state.activeTab === 'compare') { managementSubTab = state.activeTab; setState('activeTab', 'management'); } // اتجمعوا فى تبويب الإدارة والتخطيط
            if (currentRole === 'worker' && !visibleTabs().some(t => t.id === state.activeTab)) setState('activeTab', 'daily');
            renderSwitch();
            const b = getActiveBatch();
            const main = document.getElementById('mainContent');
            document.getElementById('fabAdd').style.display = (b && state.activeTab === 'daily') ? 'block' : 'none';
            document.getElementById('alertBanner').innerHTML = '';
            refreshInvDatalist();

            if (state.activeTab === 'settings') {
                renderTabbar(0);
                main.innerHTML = renderSettingsTab();
                requestAnimationFrame(() => applySectionCollapsing('settings_' + settingsSubTab));
                return;
            }

            if (!b && state.activeTab !== 'management') {
                renderTabbar(0);
                const canCreate = currentRole === 'owner' || workerHasPermission('createBatch');
                main.innerHTML = `<div class="card empty" style="margin-top:14px;"><div class="ico">🐥</div>
                    <h3 style="margin:0 0 6px;color:var(--barn-dark);">لا توجد دفعات نشطة حتى الآن</h3>
                    <p style="margin:0 0 14px;font-size:13px;">${canCreate ? 'أضف أول دفعة تسمين لبدء المتابعة اليومية والتحليل المالي' : 'لا توجد دفعة مرتبطة بحسابك حاليًا — راجع المالك لربطك بدفعة أو منحك صلاحية إنشاء دفعة جديدة'}</p>
                    ${canCreate ? '<button class="btn gold" onclick="openBatchModal()">+ إنشاء دفعة جديدة</button>' : ''}</div>`;
                return;
            }

            if (!b && state.activeTab === 'management') {
                renderTabbar(0);
                managementSubTab = 'compare';
                main.innerHTML = `<div class="settings-subnav"><button class="ssnav-btn active">⚖️ مقارنة الدورات</button></div>` + renderCompareTab();
                requestAnimationFrame(() => { applySectionCollapsing('compare'); requestAnimationFrame(() => drawTrendCharts()); });
                return;
            }

            // حساب واحد فقط لكل البيانات
            const m = computeMetrics(b);
            const fin = computeFinance(b, m);
            const alerts = computeAlerts(b, m);
            notifyNewDangerAlerts(alerts, b.id); // ============ اهتزاز مرة واحدة فقط عند ظهور تنبيه خطر جديد (بغض النظر عن التبويب الحالي) ============

            renderTabbar(alerts.filter(a => !a.dismissed).length);
            // الشريط العلوي مفيد كتذكير أثناء العمل فى تبويبات تانية، لكن فى الداشبورد (فيه "🎯 أهم 3 أفعال" والقائمة الكاملة) بيبقى تكرار حرفي — نخفيه هناك فقط.
            if (state.activeTab === 'dashboard') {
                document.getElementById('alertBanner').innerHTML = '';
            } else {
                renderAlertBanner(alerts);
            }

            if (state.activeTab === 'dashboard') main.innerHTML = renderDashboard(b, m, fin, alerts);
            else if (state.activeTab === 'daily') main.innerHTML = renderDailyTab(b, m);
            else if (state.activeTab === 'production') main.innerHTML = renderProductionTab(b, m, fin, alerts);
            else if (state.activeTab === 'management') main.innerHTML = renderManagementTab(b, fin, m, alerts);

            if (state.activeTab === 'management' && managementSubTab === 'finance') buildPrintableReport(b, m, fin, alerts);

            if (state.activeTab === 'dashboard') requestAnimationFrame(() => requestAnimationFrame(() => { applyDashboardCustomization(); applySectionCollapsing('dashboard'); drawDashboardCharts(b, m, fin); }));
            if (state.activeTab === 'management' && managementSubTab === 'finance') requestAnimationFrame(() => requestAnimationFrame(() => { applySectionCollapsing('finance'); drawFinanceCharts(fin); drawDashboardCharts(b, m, fin, 'Rep'); }));
            if (state.activeTab === 'management' && managementSubTab === 'compare') requestAnimationFrame(() => { applySectionCollapsing('compare'); requestAnimationFrame(() => drawTrendCharts()); });
            if (state.activeTab === 'daily' || state.activeTab === 'production') requestAnimationFrame(() => applySectionCollapsing(state.activeTab));
            if (state.activeTab === 'management' && managementSubTab === 'expansion') requestAnimationFrame(() => applySectionCollapsing('expansion'));
        }

        function renderSwitch() {
            const multi = activeBatches().length >= 2; // اللون المميز مفيد بس لو فيه أكتر من دفعة نشطة فى نفس الوقت
            if (currentRole === 'worker') {
                const b = state.batches.find(x => x.id === state.activeId);
                const dot = (b && multi) ? `<span class="dot" style="background:${batchColor(b.id)};"></span>` : '';
                document.getElementById('batchSwitch').innerHTML = b ? `<div class="batch-chip active">${dot}${esc(b.name)} 🔒</div>` : '';
                return;
            }
            document.getElementById('batchSwitch').innerHTML = activeBatches().map(b => {
                const active = b.id === state.activeId ? 'active' : '';
                const dot = multi ? `<span class="dot" style="background:${batchColor(b.id)};"></span>` : '';
                return `<div class="batch-chip ${active}" onclick="selectBatch('${b.id}')">${dot}${esc(b.name)} <span style="opacity:.75;padding:0 2px;" onclick="event.stopPropagation();editBatch('${b.id}')">✏️</span></div>`;
            }).join('');
        }

        function renderTabbar(alertCount) {
            alertCount = alertCount || 0;
            // ⚙️ الإعدادات بقت زرار فى الهيدر العلوي جنب المالك — مش جزء من الشريط السفلي دلوقتي
            const tabs = visibleTabs().filter(t => t.id !== 'settings').map(t => {
                const active = t.id === state.activeTab ? 'active' : '';
                const badge = (t.id === 'dashboard' && alertCount > 0) ? `<span class="badge">${alertCount}</span>` : '';
                const parts = t.label.split(' ');
                const icon = parts[0], label = parts.slice(1).join(' ');
                return `<div class="bt-tab ${active}" onclick="setTab('${t.id}')">${badge}<span class="bt-ic">${icon}</span><span class="bt-label">${label}</span></div>`;
            });
            // زرار الوصول السريع ⚡ فى المنتصف بالظبط بين التبويبات (نصهم شمال، نصهم يمين)
            const mid = Math.ceil(tabs.length / 2);
            const fabSlot = `<div class="bt-fab-slot"><div class="bt-fab" onclick="openQuickAccessMenu()" title="الوصول السريع">⚡</div></div>`;
            document.getElementById('tabbar').innerHTML = [...tabs.slice(0, mid), fabSlot, ...tabs.slice(mid)].join('');
        }

        function renderAlertBanner(alerts) {
            // ============ 🔴 إصلاح Red Team (مدموج): نفس معادلة الوزن المستخدمة فى "أهم 3 أفعال" — عشان تنبيه اتكتم ============
            // كتير قبل كده منيفضلش يظهر بنفس الوضوح فى الشريط العلوي (تناقض بين البانر والقائمة الذكية).
            const scored = alerts.filter(a => (a.level === 'danger' || a.level === 'warn') && !a.dismissed)
                .map(a => {
                    let w = a.level === 'danger' ? 8 : 5;
                    if (a.level === 'warn' && a.dismissCount > 0) w *= Math.max(0.5, 1 - a.dismissCount * 0.12);
                    return { ...a, _w: w };
                })
                .sort((x, y) => y._w - x._w);
            const top = scored.slice(0, 3);
            if (top.length === 0) return;
            const extra = scored.length - top.length;
            document.getElementById('alertBanner').innerHTML = top.map(a =>
                `<div class="alert-item ${a.level}">${esc(a.text)}</div>`).join('')
                + (extra > 0 ? `<div style="font-size:10.5px;color:var(--muted);padding:3px 8px;">+${extra} تنبيه آخر — التفاصيل فى الداشبورد أو تبويب الإنتاج</div>` : '');
        }

        // ============ Dashboard ============
        // ============ درجة صحة الدفعة (Health Score) — رقم واحد من 100 يلخّص الأداء العام ============
        // ============ ترابط تشيك ليست العمليات اليومية والأمان الحيوي بمؤشر الصحة والتنبيهات ============
