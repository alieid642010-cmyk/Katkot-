        function getFbUid() {
            try { return (firebase.auth().currentUser) ? firebase.auth().currentUser.uid : null; } catch (e) { return null; }
        }
        function isActivated() { try { return localStorage.getItem(ACTIVATION_KEY) === '1'; } catch (e) { return false; } }
        function setActivated(flag) { try { localStorage.setItem(ACTIVATION_KEY, flag ? '1' : '0'); } catch (e) {} }
        function isSourceDevice() { try { return localStorage.getItem(SOURCE_DEVICE_KEY) === '1'; } catch (e) { return false; } }
        // ===== صلاحيات الجهاز الممنوحة (النظام الموحّد) =====
        function getDeviceGrant() {
            try { const raw = localStorage.getItem(DEVICE_GRANT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
        }
        function setDeviceGrant(grant) {
            try {
                if (grant) localStorage.setItem(DEVICE_GRANT_KEY, JSON.stringify(grant));
                else localStorage.removeItem(DEVICE_GRANT_KEY);
            } catch (e) {}
        }

        // ===== مسار احتياطي يدوي (بدون إنترنت) — نفس فكرة كود الجهاز/كود التفعيل القديمة، مفيدة لو مفيش نت أو فايربيز مش شغال =====
        function getOrCreateDeviceCode() {
            let dc = null;
            try { dc = localStorage.getItem(DEVICE_CODE_KEY); } catch (e) {}
            if (!dc) {
                const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
                let raw = '';
                for (let i = 0; i < 8; i++) raw += chars[Math.floor(Math.random() * chars.length)];
                dc = raw.slice(0, 4) + '-' + raw.slice(4, 8);
                try { localStorage.setItem(DEVICE_CODE_KEY, dc); } catch (e) {}
            }
            return dc;
        }
        function computeActivationCode(deviceCode) {
            const clean = String(deviceCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const h = simpleHash(clean + ACTIVATION_SECRET_SALT);
            let digits = '';
            for (let i = 0; i < h.length && digits.length < 6; i++) { if (h[i] >= '0' && h[i] <= '9') digits += h[i]; }
            let seed = 0; for (let i = 0; i < h.length; i++) seed += h.charCodeAt(i);
            while (digits.length < 6) digits += String(seed % 10), seed = Math.floor(seed / 3) + 7;
            return digits.slice(0, 6);
        }
        function toggleManualActivation() {
            const box = document.getElementById('manualActivationBox');
            if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
        }
        function submitManualActivation() {
            const input = (document.getElementById('activationCodeInput').value || '').trim().toUpperCase();
            const err = document.getElementById('activationErr');
            if (!input) { if (err) err.textContent = 'اكتب كود التفعيل الأول'; return; }
            const deviceCode = getOrCreateDeviceCode();
            if (input === MASTER_OVERRIDE_CODE.toUpperCase()) {
                setActivated(true);
                try { localStorage.setItem(SOURCE_DEVICE_KEY, '1'); } catch (e) {}
                location.reload();
                return;
            }
            if (input.replace(/[^A-Z0-9]/g, '') === computeActivationCode(deviceCode)) {
                setActivated(true);
                location.reload();
                return;
            }
            if (err) err.textContent = '❌ الكود غلط';
        }

        // ===== المسار الأساسي: طلب دخول حقيقي بالاسم ورقم الموبايل، يوصل لصاحب التطبيق ويوافق/يرفض بنفسه =====
        function activationRequestFormHtml() {
            const dc = getOrCreateDeviceCode();
            return `<h2>🔒 التطبيق محتاج إذن استخدام</h2>
            <div class="sub">التطبيق ده ملك خاص. اكتب اسمك ورقم موبايلك وابعت طلب دخول — صاحب التطبيق هيشوفه ويوافق أو يرفض بنفسه، وهتدخل تلقائيًا فور الموافقة من غير ما تحتاج تعمل حاجة تانية.</div>
            <input type="text" id="accReqName" placeholder="اسمك">
            <input type="tel" id="accReqPhone" placeholder="رقم الموبايل" autocomplete="tel">
            <div class="auth-err" id="activationErr"></div>
            <button class="btn gold" onclick="submitAccessRequest()">📮 إرسال طلب الاستخدام</button>
            <div style="text-align:center;margin-top:12px;"><a href="javascript:void(0)" onclick="toggleManualActivation()" style="font-size:11.5px;color:var(--muted);">🔑 عندي كود تفعيل يدوي بالفعل</a></div>
            <div id="manualActivationBox" style="display:none;margin-top:10px;">
                <p style="font-size:10.5px;color:var(--muted);margin:0 0 6px;">كود جهازك (لو صاحب التطبيق طلبه منك تليفونيًا): <b>${dc}</b></p>
                <input type="text" id="activationCodeInput" placeholder="اكتب كود التفعيل" style="text-align:center;letter-spacing:2px;font-weight:800;">
                <button class="btn ghost" style="margin-top:6px;" onclick="submitManualActivation()">تفعيل بالكود</button>
            </div>
            <div style="text-align:center;margin-top:8px;"><a href="javascript:void(0)" onclick="toggleRecoverySignIn()" style="font-size:11.5px;color:var(--muted);">🛡️ أنا صاحب التطبيق وعندي حساب استرداد</a></div>
            <div id="recoverySignInBox" style="display:none;margin-top:10px;">
                <input type="email" id="recSignInEmail" placeholder="إيميل الاسترداد" autocomplete="email">
                <input type="password" id="recSignInPass" placeholder="كلمة المرور" autocomplete="current-password" style="margin-top:8px;">
                <button class="btn ghost" style="margin-top:6px;" onclick="submitRecoverySignIn()">🔓 دخول واسترجاع صلاحية المالك</button>
            </div>`;
        }
        function activationManualOnlyHtml() {
            const dc = getOrCreateDeviceCode();
            return `<h2>🔒 التطبيق محتاج إذن استخدام</h2>
            <div class="sub">مفيش اتصال بالإنترنت دلوقتي، فمينفعش نبعت طلب لصاحب التطبيق مباشرة. لو معاك كود تفعيل يدوي منه، اكتبه تحت. لو لأ، وصّل نت وجرّب تاني.</div>
            <p style="font-size:10.5px;color:var(--muted);margin:0 0 6px;">كود جهازك: <b>${dc}</b></p>
            <input type="text" id="activationCodeInput" placeholder="اكتب كود التفعيل" style="text-align:center;letter-spacing:2px;font-weight:800;">
            <div class="auth-err" id="activationErr"></div>
            <button class="btn gold" onclick="submitManualActivation()">تفعيل بالكود</button>
            <div style="text-align:center;margin-top:8px;"><a href="javascript:void(0)" onclick="toggleRecoverySignIn()" style="font-size:11.5px;color:var(--muted);">🛡️ أنا صاحب التطبيق وعندي حساب استرداد</a></div>
            <div id="recoverySignInBox" style="display:none;margin-top:10px;">
                <input type="email" id="recSignInEmail" placeholder="إيميل الاسترداد" autocomplete="email">
                <input type="password" id="recSignInPass" placeholder="كلمة المرور" autocomplete="current-password" style="margin-top:8px;">
                <button class="btn ghost" style="margin-top:6px;" onclick="submitRecoverySignIn()">🔓 دخول واسترجاع صلاحية المالك</button>
            </div>`;
        }
        function statusPill(s) {
            if (s === 'pending') return '<span class="pill" style="font-size:10px;background:#fff3cd;color:#997404;">⏳ معلّق</span>';
            if (s === 'approved') return '<span class="pill ok" style="font-size:10px;">✅ مسموح</span>';
            if (s === 'denied') return '<span class="pill" style="font-size:10px;background:#f8d7da;color:#842029;">🚫 ممنوع</span>';
            return '';
        }
        function formatFsDate(ts) {
            try { const d = ts && ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleDateString('ar-EG') + ' ' + d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
        }
        function renderAccessStateCard(d) {
            const card = document.querySelector('#activationOverlay .auth-card');
            if (!card) return;
            if (d.status === 'approved') { activateAndProceed(d); return; }
            if (d.status === 'denied') {
                card.innerHTML = `<h2>🚫 اتمنع الدخول</h2><div class="sub">صاحب التطبيق رفض طلب الدخول لهذا الجهاز. لو ده غلط أو عايز تتراجع، كلّمه مباشرة أو اطلب تاني.</div>
                <button class="btn gold" style="margin-top:10px;" onclick="document.querySelector('#activationOverlay .auth-card').innerHTML = activationRequestFormHtml();">📮 إعادة إرسال الطلب</button>`;
                return;
            }
            // pending
            card.innerHTML = `<h2>⏳ طلبك قيد المراجعة</h2><div class="sub">طلب الدخول اتبعت لصاحب التطبيق — التطبيق هيفتح تلقائيًا فور الموافقة، من غير ما تحتاج تعمل حاجة.</div>
            <p style="font-size:11px;color:var(--muted);margin-top:10px;">الاسم: <b>${esc(d.name || '—')}</b> · الموبايل: <b>${esc(d.phone || '—')}</b></p>`;
        }
        function activateAndProceed(d) {
            setActivated(true);
            if (d && (d.accessLevel === 'full' || d.accessLevel === 'partial')) {
                setDeviceGrant({ accessLevel: d.accessLevel, permissions: Array.isArray(d.permissions) ? d.permissions : [], name: d.name || '', batchId: d.batchId || null });
            }
            location.reload();
        }
        function listenOwnAccessRequest(uid) {
            if (accessUnsub || !fbDb) return;
            accessUnsub = fbDb.collection(ACCESS_COLLECTION).doc(uid).onSnapshot(doc => {
                if (!doc.exists) return;
                const d = doc.data();
                if (d.status === 'approved') {
                    if (!isActivated()) { activateAndProceed(d); return; }
                    // الجهاز شغال بالفعل بصلاحيات ممنوحة — لو صاحب التطبيق غيّر مستوى الصلاحية أو الأقسام دلوقتي، حدّثها فورًا من غير ما يحتاج يقفل ويفتح التطبيق تاني
                    const prevGrant = getDeviceGrant();
                    const newGrant = { accessLevel: d.accessLevel || 'partial', permissions: Array.isArray(d.permissions) ? d.permissions : [], name: d.name || '', batchId: d.batchId || null };
                    const grantChanged = !prevGrant || prevGrant.accessLevel !== newGrant.accessLevel || prevGrant.batchId !== newGrant.batchId || JSON.stringify(prevGrant.permissions) !== JSON.stringify(newGrant.permissions);
                    if (grantChanged && prevGrant) { // نحدّث بس لو كان أصلًا داخل من مسار الصلاحيات الموحّد (مش المسار اليدوي القديم)
                        setDeviceGrant(newGrant);
                        if (currentRole === 'owner' && newGrant.accessLevel !== 'full') {
                            showToast('🚫 تم تقييد صلاحيتك — سيتم تحديث الشاشة');
                            setTimeout(() => location.reload(), 1000);
                        } else if (currentRole === 'worker') {
                            if (newGrant.accessLevel === 'full') { showToast('✅ تم منحك صلاحية كاملة — سيتم تحديث الشاشة'); setTimeout(() => location.reload(), 1000); }
                            else {
                                currentWorker.permissions = newGrant.permissions;
                                currentWorker.batchId = newGrant.batchId;
                                const hasBatch = currentWorker.batchId && state.batches.some(b => b.id === currentWorker.batchId);
                                setState('activeId', hasBatch ? currentWorker.batchId : null);
                                const badge = document.getElementById('workerRoleBadge');
                                if (badge) badge.textContent = `👷 ${currentWorker.name} — ${hasBatch ? state.batches.find(b => b.id === currentWorker.batchId).name : 'لا توجد دفعة مرتبطة — راجع المالك'}`;
                                showToast('🔄 تم تحديث صلاحياتك من صاحب التطبيق');
                                if (!visibleTabs().some(t => t.id === state.activeTab)) setState('activeTab', visibleTabs()[0] ? visibleTabs()[0].id : 'daily');
                                render();
                            }
                        }
                    }
                } else if (isActivated() && !isSourceDevice()) {
                    // اتلغت الصلاحية وهو مستخدم التطبيق بالفعل — قفل فوري
                    setActivated(false);
                    setDeviceGrant(null);
                    showToast('🚫 تم إلغاء صلاحية استخدام التطبيق على هذا الجهاز');
                    setTimeout(() => location.reload(), 1200);
                } else if (!isActivated()) {
                    renderAccessStateCard(d);
                }
            }, err => console.error('فشل متابعة حالة الطلب', err));
        }
        function watchOwnAccessStatus() {
            const uid = getFbUid();
            if (!uid || isSourceDevice()) return; // الجهاز المصدر (صاحب التطبيق) مالوش طلب أصلًا
            listenOwnAccessRequest(uid);
        }
        function submitAccessRequest() {
            const name = (document.getElementById('accReqName').value || '').trim();
            const phone = (document.getElementById('accReqPhone').value || '').trim();
            const err = document.getElementById('activationErr');
            if (!name) { err.textContent = 'اكتب اسمك'; return; }
            if (!phone || phone.length < 8) { err.textContent = 'اكتب رقم موبايل صحيح'; return; }
            const uid = getFbUid();
            if (!uid || !fbDb) { err.textContent = '⚠️ تعذّر الاتصال — تأكد من الإنترنت وحاول تاني'; return; }
            fbDb.collection(ACCESS_COLLECTION).doc(uid).set({
                name, phone, status: 'pending', requestedAt: firebase.firestore.FieldValue.serverTimestamp(), deviceLabel: (navigator.userAgent || '').slice(0, 80)
            }, { merge: true }).then(() => {
                renderAccessStateCard({ name, phone, status: 'pending' });
                listenOwnAccessRequest(uid);
            }).catch(e => { console.error(e); err.textContent = '❌ فشل إرسال الطلب — حاول تاني'; });
        }
        function renderActivationOverlay() {
            document.getElementById('activationOverlay').style.display = 'flex';
            const card = document.querySelector('#activationOverlay .auth-card');
            const uid = getFbUid();
            if (!fbDb || !uid) { card.innerHTML = activationManualOnlyHtml(); return; }
            fbDb.collection(ACCESS_COLLECTION).doc(uid).get().then(doc => {
                if (doc.exists) { renderAccessStateCard(doc.data()); listenOwnAccessRequest(uid); }
                else { card.innerHTML = activationRequestFormHtml(); }
            }).catch(() => { card.innerHTML = activationManualOnlyHtml(); });
        }
        function beginActivationFlow() {
            if (isActivated()) {
                watchOwnAccessStatus();
                const grant = getDeviceGrant();
                // نظام موحّد: لو الجهاز ده دخل عن طريق موافقة صاحب التطبيق (مش الكود اليدوي القديم ولا الجهاز المصدر)، يدخل مباشرة بنفس الصلاحيات المُمنوحة بدون شاشة تسجيل دخول منفصلة
                if (grant && !isSourceDevice()) {
                    if (grant.accessLevel === 'full') { startSession('owner', null, false); return; }
                    startSession('worker', { id: 'device_' + (getFbUid() || 'x'), name: grant.name || 'مستخدم مُصرّح له', permissions: Array.isArray(grant.permissions) ? grant.permissions : [], batchId: grant.batchId || null }, false);
                    return;
                }
                initAuth();
                return;
            }
            renderActivationOverlay();
        }

        // ============ أداة الأدمن: طلبات الدخول (تظهر بس لصاحب التطبيق على "الجهاز المصدر") ============
        function subscribeAccessRequestsAdmin() {
            if (!fbDb || accessAdminUnsub) return;
            accessAdminUnsub = fbDb.collection(ACCESS_COLLECTION).orderBy('requestedAt', 'desc').onSnapshot(snap => {
                accessRequestsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                render();
            }, err => console.error('فشل تحميل طلبات الدخول', err));
        }
        function decideAccessRequest(deviceId, decision, grantData) {
            if (!fbDb) return;
            // ============ 🔒 تحصين أمني (Red Team fix — Privilege Escalation) ============
            // قبل التعديل: الدالة دي (وهي اللي بتوافق/ترفض/تمنح صلاحية "مالك كاملة" لأي جهاز) كانت
            // من غير أي تحقق داخلي — بتتنفذ لمجرد استدعائها. كل حماية كانت واقعة على عاتق الواجهة
            // (إنها بتظهر بس لصاحب الجهاز المصدر). لكن أي مستخدم عادي فاتح الـ Console يقدر ينادي
            // decideAccessRequest(myUid,'approved',{accessLevel:'full'}) مباشرة ويرقّي نفسه لمالك كامل.
            // ⚠️ ملحوظة مهمة: التحقق ده دفاع إضافي على مستوى العميل بس (يمنع الاستخدام العرضي/غير المتعمد
            // من واجهة التطبيق نفسها). أي حد فاهم Firestore SDK يقدر يتجاوز هذا التحقق تمامًا وينادي
            // firebase.firestore() مباشرة من الـ Console لتحديث نفس الـ document. الحماية الحقيقية
            // والوحيدة الموثوقة هنا **لازم تكون Firestore Security Rules** على مستوى السيرفر
            // (شوف ملف firestore.rules المرفق مع التقرير).
            if (currentRole !== 'owner' || !isSourceDevice()) { showToast('🚫 غير مصرح لك بهذا الإجراء'); return; }
            const payload = { status: decision, decidedAt: firebase.firestore.FieldValue.serverTimestamp() };
            if (decision === 'approved' && grantData) {
                payload.accessLevel = grantData.accessLevel === 'full' ? 'full' : 'partial';
                payload.permissions = payload.accessLevel === 'full' ? [] : (Array.isArray(grantData.permissions) ? grantData.permissions : []);
                payload.batchId = payload.accessLevel === 'full' ? null : (grantData.batchId || null);
            }
            fbDb.collection(ACCESS_COLLECTION).doc(deviceId).update(payload)
                .then(() => {
                    // ============ 🔒 تحصين أمني: مزامنة authorizedUids مع قرار الموافقة/الرفض ============
                    // ده اللي بيخلي Firestore Rules الجديدة فعليًا تشتغل: الموافقة = إضافة uid العامل
                    // لقائمة المصرّح لهم بمستند المزرعة، الرفض/الإلغاء = شطبه منها فورًا (يقفل وصوله
                    // للبيانات على مستوى السيرفر نفسه، مش بس إخفاء واجهة).
                    if (farmId && fbDb) {
                        const arrayOp = decision === 'approved'
                            ? firebase.firestore.FieldValue.arrayUnion(deviceId)
                            : firebase.firestore.FieldValue.arrayRemove(deviceId);
                        fbDb.collection('farms').doc(farmId).set({ authorizedUids: arrayOp }, { merge: true })
                            .catch(e => console.error('فشل تحديث قائمة الصلاحيات على مستند المزرعة', e));
                    }
                    showToast(decision === 'approved' ? '✅ اتسمحله يستخدم التطبيق' : '🚫 اتمنع');
                    accessRequestPanelOpen[deviceId] = false;
                })
                .catch(e => { console.error(e); showToast('❌ فشل تنفيذ القرار — تأكد من اتصال الإنترنت وحاول تاني، أو تواصل مع الدعم لو استمرت'); });
        }
        function revokeAccess(deviceId) {
            showConfirm('هل تريد إلغاء صلاحية هذا الجهاز؟ هيتقفل فورًا حتى لو التطبيق مفتوح عنده دلوقتي.', () => decideAccessRequest(deviceId, 'denied'), 'إلغاء الصلاحية');
        }
        // ===== واجهة اختيار مستوى/أقسام الصلاحية وقت الموافقة على طلب دخول (النظام الموحّد) =====
        let accessRequestPanelOpen = {}; // {deviceId: true/false} — حالة فتح لوحة اختيار الصلاحيات لكل طلب، مؤقتة (مش متخزنة)
        // ⚡ تحسين أداء (المرحلة 1 — الجولة التانية): الدالة دي بتتنادى بس من قسم "طلبات الدخول" جوه
        // تبويب الإعدادات (مصدر نداء واحد فعلي فى كل الملفات — اتأكد بـ grep)، وده قسم صغير متداخل جوه
        // تبويب إعدادات كبير فيه كذا فئة تانية (هوية المزرعة، الوصول، النظام...). كانت بتنادي render()
        // الكامل يهد ويبني تبويب الإعدادات كله من غير أي داعي بس عشان توسّع بانل صلاحيات طلب واحد.
        // دلوقتي بتحدّث صندوق قائمة الطلبات بس (#accessReqListBox) لو موجود فى الصفحة، وترجع لـrender()
        // الكامل كـfallback آمن لو الصندوق مش موجود لأي سبب (مثلاً لو اتنادت من مكان مش متوقع مستقبلًا).
        function refreshAccessRequestsListBox() {
            const box = document.getElementById('accessReqListBox');
            if (box) box.innerHTML = renderAccessRequestsListCard();
            else render();
        }
        function toggleAccessGrantPanel(deviceId) {
            accessRequestPanelOpen[deviceId] = !accessRequestPanelOpen[deviceId];
            refreshAccessRequestsListBox();
        }
        // ============ كارت قائمة طلبات الدخول (مُستخرجة لملف مستقل عشان صندوق #accessReqListBox
        // يقدر يتحدّث لوحده من غير هدم تبويب الإعدادات كله — نفس نص الكارت بالظبط زي ما كان قبل الاستخراج) ============
        function renderAccessRequestsListCard() {
            return `<div class="card" style="margin-top:10px;">
                    <label style="font-size:12px;font-weight:800;color:var(--barn-dark);display:block;margin-bottom:8px;">📋 طلبات الدخول ${accessRequestsCache.filter(r=>r.status==='pending').length ? `<span class="pill" style="font-size:10px;background:#fff3cd;color:#997404;">${accessRequestsCache.filter(r=>r.status==='pending').length} جديد</span>` : ''}</label>
                    ${accessRequestsCache.length ? accessRequestsCache.map(r => `
                        <div class="check-row" style="flex-wrap:wrap;">
                            <div class="txt">
                                <div style="font-weight:800;">${esc(r.name || '—')} ${statusPill(r.status)}</div>
                                <div class="day">📞 ${esc(r.phone || '—')}${r.requestedAt ? ' · ' + formatFsDate(r.requestedAt) : ''}</div>
                                ${r.status === 'approved' ? `<div class="day">${r.accessLevel === 'full' ? '👑 صلاحية كاملة' : '🧩 صلاحية جزئية: ' + (permsSummary(r.permissions) || 'لا يوجد أقسام محددة')}</div>` : ''}
                            </div>
                            ${r.status === 'pending' ? `
                                <button class="btn gold sm" onclick="toggleAccessGrantPanel('${r.id}')">✅ سماح…</button>
                                <button class="btn danger sm" onclick="decideAccessRequest('${r.id}','denied')">🚫 رفض</button>
                            ` : r.status === 'approved' ? `
                                <button class="btn ghost sm" onclick="toggleAccessGrantPanel('${r.id}')">✏️ تعديل الصلاحيات</button>
                                <button class="btn danger sm" onclick="revokeAccess('${r.id}')">🚫 إلغاء الصلاحية</button>
                            ` : `<button class="btn ghost sm" onclick="toggleAccessGrantPanel('${r.id}')">✅ سماح بعد كل ده</button>`}
                            ${accessRequestPanelOpen[r.id] ? accessGrantPanelHtml(r) : ''}
                        </div>`).join('') : '<div class="empty" style="padding:14px;"><div class="ico">📋</div>لا توجد طلبات دخول بعد.</div>'}
                </div>`;
        }
        function accessGrantPanelHtml(r) {
            const level = accessRequestPanelOpen[r.id + '_level'] || (r.accessLevel === 'full' ? 'full' : 'partial');
            return `<div class="card" style="margin-top:8px;background:var(--cream,#f5efe0);">
                <div style="display:flex;gap:14px;margin-bottom:8px;">
                    <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;">
                        <input type="radio" name="acclevel_${r.id}" value="full" ${level === 'full' ? 'checked' : ''} onchange="accessRequestPanelOpen['${r.id}_level']='full';refreshAccessRequestsListBox();"> 👑 صلاحية كاملة (زي المالك)
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;">
                        <input type="radio" name="acclevel_${r.id}" value="partial" ${level === 'partial' ? 'checked' : ''} onchange="accessRequestPanelOpen['${r.id}_level']='partial';refreshAccessRequestsListBox();"> 🧩 صلاحية جزئية (حدد الأقسام)
                    </label>
                </div>
                ${level === 'partial' ? `<div id="accPerms_${r.id}">${permsCheckboxesHtml(r.permissions).replace(/class="wf_perm_chk"/g, `class="acc_perm_chk_${r.id}"`)}</div>
                <label style="font-size:11.5px;color:var(--muted);display:block;margin:8px 0 4px;">🏠 الدفعة المرتبطة (اختياري)</label>
                <select id="accBatch_${r.id}" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;font-size:13px;">${batchOptionsHtml(r.batchId)}</select>` : ''}
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <button class="btn gold sm" onclick="confirmAccessGrant('${r.id}')">✅ تأكيد ${r.status === 'approved' ? 'التعديل' : 'السماح'}</button>
                    <button class="btn ghost sm" onclick="toggleAccessGrantPanel('${r.id}')">إلغاء</button>
                </div>
            </div>`;
        }
        function confirmAccessGrant(deviceId) {
            const level = accessRequestPanelOpen[deviceId + '_level'] || 'partial';
            const perms = level === 'full' ? [] : Array.from(document.querySelectorAll('.acc_perm_chk_' + deviceId + ':checked')).map(el => el.value);
            const batchSel = document.getElementById('accBatch_' + deviceId);
            const batchId = level === 'partial' && batchSel ? (batchSel.value || null) : null;
            decideAccessRequest(deviceId, 'approved', { accessLevel: level, permissions: perms, batchId });
        }
        // ===== أداة احتياطية: توليد كود تفعيل يدوي لجهاز تاني (لو مفيش نت وقت الموافقة) =====
        function generateActivationForDevice() {
            const dc = (document.getElementById('genDeviceCodeInput').value || '').trim();
            const out = document.getElementById('genActivationCodeOutput');
            if (!dc) { out.textContent = ''; return; }
            out.textContent = computeActivationCode(dc);
        }
        function copyDeviceUid() {
            const uid = getFbUid();
            if (!uid) { showToast('⚠️ لسه مش متصل بالسيرفر، جرّب تاني بعد شوية'); return; }
            navigator.clipboard?.writeText(uid).then(() => showToast('✅ اتنسخ الـ UID')).catch(() => showToast(uid));
        }
        // ============ 🛡️ تأمين هوية المالك (حل خطر: anonymous auth بيضيع لو اتمسحت بيانات المتصفح/الجهاز اتغيّر) ============
        // الفكرة: نربط حساب Firebase المجهول الحالي (اللي isOwner() فى firestore.rules معتمدة على uid بتاعه) بإيميل/كلمة مرور
        // حقيقيين عبر linkWithCredential. الـ uid ميتغيّرش بعد الربط، لكن دلوقتي بقى فيه طريقة "يرجع" لنفس الـ uid من أي جهاز
        // تانى عن طريق signInWithEmailAndPassword — عكس الحساب المجهول اللي مربوط بجلسة المتصفح بس ومفيش له مسار استرجاع.
        function hasRecoveryLinked() {
            try {
                const u = firebase.auth().currentUser;
                return !!(u && u.providerData && u.providerData.some(p => p.providerId === 'password'));
            } catch (e) { return false; }
        }
        function getRecoveryEmail() {
            try {
                const u = firebase.auth().currentUser;
                const p = u && u.providerData && u.providerData.find(p => p.providerId === 'password');
                return p ? p.email : null;
            } catch (e) { return null; }
        }
        function linkOwnerRecoveryAccount() {
            const email = ((document.getElementById('rec_email') || {}).value || '').trim();
            const pass = (document.getElementById('rec_pass') || {}).value || '';
            const pass2 = (document.getElementById('rec_pass2') || {}).value || '';
            const err = document.getElementById('recoveryErr');
            if (err) err.textContent = '';
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (err) err.textContent = '❌ اكتب إيميل صحيح'; return; }
            if (!pass || pass.length < 6) { if (err) err.textContent = '❌ كلمة المرور لازم تكون 6 حروف/أرقام على الأقل'; return; }
            if (pass !== pass2) { if (err) err.textContent = '❌ كلمتا المرور مش متطابقتين'; return; }
            let user = null;
            try { user = firebase.auth().currentUser; } catch (e) {}
            if (!user) { if (err) err.textContent = '❌ لسه مش متصل بالسيرفر — جرّب تاني بعد شوية'; return; }
            const cred = firebase.auth.EmailAuthProvider.credential(email, pass);
            user.linkWithCredential(cred).then(() => {
                showToast('✅ اترَبط حساب الاسترداد بنجاح — احتفظ بالإيميل وكلمة المرور دول فى مكان آمن');
                render();
            }).catch(e => {
                console.error('فشل ربط حساب الاسترداد', e);
                let msg = '❌ فشل الربط — حاول تاني';
                if (e.code === 'auth/email-already-in-use' || e.code === 'auth/credential-already-in-use') msg = '❌ الإيميل ده مربوط بحساب تاني بالفعل — استخدم إيميل مختلف';
                else if (e.code === 'auth/weak-password') msg = '❌ كلمة المرور ضعيفة — جرّب كلمة أطول وأقوى';
                else if (e.code === 'auth/invalid-email') msg = '❌ الإيميل غير صحيح';
                else if (e.code === 'auth/provider-already-linked') msg = '⚠️ عندك حساب استرداد مربوط بالفعل';
                if (err) err.textContent = msg; else showToast(msg);
            });
        }
        function updateRecoveryPassword() {
            const pass = ((document.getElementById('rec_newpass') || {}).value || '');
            const err = document.getElementById('recoveryErr');
            if (err) err.textContent = '';
            if (!pass || pass.length < 6) { if (err) err.textContent = '❌ كلمة المرور لازم تكون 6 حروف/أرقام على الأقل'; return; }
            let user = null;
            try { user = firebase.auth().currentUser; } catch (e) {}
            if (!user) { if (err) err.textContent = '❌ لسه مش متصل بالسيرفر'; return; }
            user.updatePassword(pass).then(() => {
                showToast('✅ اتحدّثت كلمة المرور');
                render();
            }).catch(e => {
                console.error('فشل تحديث كلمة المرور', e);
                let msg = '❌ فشل التحديث';
                if (e.code === 'auth/requires-recent-login') msg = '⚠️ لازم تسجّل دخول تانى بحساب الاسترداد الأول (من شاشة إذن الاستخدام) قبل ما تقدر تغيّر كلمة المرور';
                else if (e.code === 'auth/weak-password') msg = '❌ كلمة المرور ضعيفة';
                if (err) err.textContent = msg; else showToast(msg);
            });
        }
        // ===== تسجيل دخول باستخدام حساب الاسترداد (بيستخدم فى شاشة "إذن الاستخدام" لما جهاز يكون جديد/اتمسحت بياناته) =====
        function toggleRecoverySignIn() {
            const box = document.getElementById('recoverySignInBox');
            if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
        }
        function submitRecoverySignIn() {
            const email = ((document.getElementById('recSignInEmail') || {}).value || '').trim();
            const pass = (document.getElementById('recSignInPass') || {}).value || '';
            const err = document.getElementById('activationErr');
            if (!email || !pass) { if (err) err.textContent = 'اكتب الإيميل وكلمة المرور'; return; }
            if (!window.firebase) { if (err) err.textContent = '❌ فايربيز مش متاح — تأكد من الإنترنت'; return; }
            firebase.auth().signInWithEmailAndPassword(email, pass).then(() => {
                try { localStorage.setItem(SOURCE_DEVICE_KEY, '1'); } catch (e) {}
                setActivated(true);
                location.reload();
            }).catch(e => {
                console.error('فشل تسجيل الدخول باسترداد الحساب', e);
                let msg = '❌ فشل تسجيل الدخول';
                if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = '❌ كلمة المرور غلط';
                else if (e.code === 'auth/user-not-found') msg = '❌ مفيش حساب مربوط بالإيميل ده';
                else if (e.code === 'auth/invalid-email') msg = '❌ الإيميل غير صحيح';
                else if (e.code === 'auth/too-many-requests') msg = '❌ محاولات كتير غلط — حاول تاني بعد شوية';
                if (err) err.textContent = msg;
            });
        }
        // ============ QR لمعرّف الجهاز — يسهّل نقل الـUID لشخص تاني (يفتحه بكاميرا موبايله بدل ما يكتبه يدويًا) ============
        let deviceUidQrShown = false;
        function toggleDeviceUidQR() {
            deviceUidQrShown = !deviceUidQrShown;
            const box = document.getElementById('deviceUidQrBox');
            if (!box) return;
            box.style.display = deviceUidQrShown ? 'flex' : 'none';
            if (deviceUidQrShown) renderDeviceUidQR();
        }
        function renderDeviceUidQR() {
            const uid = getFbUid();
            const holder = document.getElementById('deviceUidQrCanvas');
            if (!holder) return;
            holder.innerHTML = '';
            if (!uid) { holder.textContent = '⚠️ الـ UID لسه مش جاهز'; return; }
            if (typeof QRCode === 'undefined') { holder.textContent = '⚠️ مكتبة QR لسه بتتحمّل، جرّب تاني بعد ثانية'; return; }
            new QRCode(holder, { text: uid, width: 160, height: 160, colorDark: '#1F2F26', colorLight: '#FFFFFF' });
        }
        function copyGeneratedCode() {
            const code = document.getElementById('genActivationCodeOutput').textContent;
            if (!code) return;
            navigator.clipboard?.writeText(code).then(() => showToast('✅ اتنسخ كود التفعيل')).catch(() => {});
        }

        function simpleHash(str) {
            // ⚠️ تجزئة قديمة (DJB2) — غير آمنة تشفيريًا (بدون ملح، سريعة الكسر بجداول Rainbow/Brute-force).
            // محتفظ بها فقط للتوافق الرجعي مع حسابات قديمة لسه ما تمتش ترقيتها لـ secureHash (شوف verifyPassword تحت).
            // ما ينفعش تتستخدم لحسابات جديدة أبدًا.
            str = String(str);
            let h = 5381;
            for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h = h & h; }
            return 'h' + Math.abs(h).toString(36) + str.length;
        }

        // ============ 🔒 تحصين أمني: تجزئة قوية (SHA-256 + ملح عشوائي لكل حساب) لكل كلمات المرور الجديدة ============
        // صادق: التطبيق عميل بالكامل (client-side) بدون سيرفر خاص — لو حد عنده وصول فعلي لنفس الجهاز
        // ومفتوح DevTools، يقدر يقرأ متغيرات الجافاسكريبت أو ينادي أي دالة مباشرة من الـ Console بغض
        // النظر عن قوة التجزئة. الفايدة الحقيقية من SHA-256+Salt هنا: حماية كلمة المرور نفسها لو
        // localStorage / نسخة احتياطية اتسربت (جهاز مشترك، نسخة مشاركة عبر واتساب، إلخ) — مش بديل عن
        // قواعد حماية فايرستور (Security Rules) اللي هي خط الدفاع الحقيقي للبيانات المشتركة على السحابة.
        function genSalt() {
            try { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(''); }
            catch (e) { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
        }
        async function secureHash(str, salt) {
            salt = salt || genSalt();
            try {
                if (window.crypto && crypto.subtle && crypto.subtle.digest) {
                    const enc = new TextEncoder().encode(salt + ':' + String(str));
                    const buf = await crypto.subtle.digest('SHA-256', enc);
                    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
                    return { hash: hex, salt };
                }
            } catch (e) {}
            return { hash: simpleHash(salt + ':' + str), salt }; // بيئة قديمة بدون SubtleCrypto (مثلاً WebView قديم) — رجوع لتجزئة بسيطة كخط دفاع أخير
        }
        async function verifyPassword(str, salt, hash) {
            if (!salt) return simpleHash(str) === hash; // حساب قديم قبل الترقية — للتوافق الرجعي فقط
            const r = await secureHash(str, salt);
            return r.hash === hash;
        }

        function getAuth() {
            try {
                const a = JSON.parse(localStorage.getItem(AUTH_KEY));
                if (a && !a.workers) a.workers = [];
                return a;
            } catch (e) { return null; }
        }

        function saveAuth(auth) {
            try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch (e) {}
        }

        function pickRole(r) {
            pickedRole = r;
            document.getElementById('roleBtnOwner').classList.toggle('active', r === 'owner');
            document.getElementById('roleBtnWorker').classList.toggle('active', r === 'worker');
            document.getElementById('loginUsername').style.display = r === 'worker' ? 'block' : 'none';
            document.getElementById('loginErr').textContent = '';
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPass').value = '';
            document.getElementById(r === 'worker' ? 'loginUsername' : 'loginPass').focus();
            refreshBiometricLoginButton();
        }

        // ============ 👆 تسجيل الدخول بالبصمة/الوجه (WebAuthn) بدل كتابة كلمة المرور فى كل مرة ============
        // ⚠️ ملحوظة أمانية صادقة (نفس روح ملحوظة secureHash): التطبيق ده عميل بالكامل بدون سيرفر خاص
        // يتحقق من التوقيع التشفيري لـWebAuthn عن بُعد — فمفيش فايدة حقيقية من التحقق الكامل بالتوقيع هنا
        // (محدش هيتحقق منه أصلًا). الحماية الفعلية اللي بنعتمد عليها: نظام التشغيل والمتصفح نفسهم مش
        // هيرجّعوا "نجاح" لـnavigator.credentials.get() إلا لو البصمة/الوجه فعلاً اتطابق مع اللي مسجّل على
        // الجهاز ده. يعني ده نفس مستوى الحماية اللي أي قفل بصمة على الموبايل بيوفّره لتطبيقاته المحلية —
        // بديل مريح لكلمة المرور على "هذا الجهاز تحديدًا"، مش بديل عن حماية بيانات مشتركة على السحابة.
        // البصمة بتتسجّل لكل جهاز لوحده (تقدر تفعّلها على أكتر من جهاز لنفس الحساب، كل جهاز له تسجيله الخاص).
        function isWebAuthnSupported() {
            return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
        }
        function bufToB64url(buf) {
            let bin = '';
            new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); });
            return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        function b64urlToBuf(str) {
            str = str.replace(/-/g, '+').replace(/_/g, '/');
            while (str.length % 4) str += '=';
            const bin = atob(str);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            return buf.buffer;
        }
        async function enrollBiometricLogin(role, workerObj) {
            if (!isWebAuthnSupported()) { showToast('⚠️ الجهاز/المتصفح ده مايدعمش تسجيل الدخول بالبصمة أو الوجه'); return false; }
            try {
                const challenge = crypto.getRandomValues(new Uint8Array(32));
                const userId = crypto.getRandomValues(new Uint8Array(16));
                const cred = await navigator.credentials.create({
                    publicKey: {
                        challenge, rp: { name: 'كتكوت برو' },
                        user: { id: userId, name: role === 'owner' ? 'مالك' : (workerObj ? workerObj.username : 'عامل'), displayName: role === 'owner' ? 'مالك المزرعة' : (workerObj ? workerObj.name : 'عامل') },
                        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
                        timeout: 60000,
                    }
                });
                if (!cred) return false;
                const auth = getAuth();
                if (!auth) return false;
                const workerId = workerObj ? workerObj.id : null;
                auth.biometric = (auth.biometric || []).filter(b => !(b.role === role && b.workerId === workerId)); // استبدال أي تسجيل سابق لنفس الحساب على هذا الجهاز
                auth.biometric.push({ role, workerId, credentialId: bufToB64url(cred.rawId), createdAt: Date.now() });
                saveAuth(auth);
                showToast('✅ اتفعّل الدخول بالبصمة/الوجه على الجهاز ده');
                return true;
            } catch (e) {
                console.error('فشل تسجيل البصمة', e);
                showToast('❌ اتلغى تسجيل البصمة أو حصل خطأ (تأكد إن الجهاز فيه بصمة/وجه مفعّل أصلًا فى إعدادات النظام)');
                return false;
            }
        }
        async function loginWithBiometric(role) {
            const err = document.getElementById('loginErr');
            if (!isWebAuthnSupported()) { err.textContent = '⚠️ الجهاز ده مايدعمش الدخول بالبصمة'; return; }
            const auth = getAuth();
            if (!auth) { err.textContent = 'لا توجد حسابات بعد.'; return; }
            let entries = (auth.biometric || []).filter(b => b.role === role);
            let workerObj = null;
            if (role === 'worker') {
                const uname = (document.getElementById('loginUsername').value || '').trim().toLowerCase();
                if (!uname) { err.textContent = 'أدخل اسم المستخدم الأول عشان نعرف بصمة مين نتحقق منها'; return; }
                workerObj = (auth.workers || []).find(w => w.username.toLowerCase() === uname);
                if (!workerObj) { err.textContent = '❌ اسم المستخدم مش موجود'; return; }
                entries = entries.filter(b => b.workerId === workerObj.id);
            }
            if (!entries.length) { err.textContent = '⚠️ لسه معملتش تسجيل بصمة على الجهاز ده — سجّل دخول بكلمة المرور مرة وفعّلها من الرابط تحت.'; return; }
            try {
                const assertion = await navigator.credentials.get({
                    publicKey: {
                        challenge: crypto.getRandomValues(new Uint8Array(32)),
                        allowCredentials: entries.map(e => ({ type: 'public-key', id: b64urlToBuf(e.credentialId) })),
                        userVerification: 'required', timeout: 60000,
                    }
                });
                if (!assertion) { err.textContent = '❌ فشل التحقق بالبصمة'; return; }
                _loginFailCount = 0;
                startSession(role, role === 'worker' ? workerObj : null, true, 'biometric');
            } catch (e) {
                console.error('فشل الدخول بالبصمة', e);
                err.textContent = '❌ اتلغى الدخول بالبصمة أو فشل التطابق — جرّب تاني أو ادخل بكلمة المرور';
            }
        }
        function hasBiometricEnrolled(role, workerId) {
            const auth = getAuth();
            if (!auth) return false;
            return (auth.biometric || []).some(b => b.role === role && (role === 'owner' || b.workerId === workerId));
        }
        function refreshBiometricLoginButton() {
            const btn = document.getElementById('bioLoginBtn');
            if (!btn) return;
            if (!isWebAuthnSupported()) { btn.style.display = 'none'; return; }
            const auth = getAuth();
            if (pickedRole === 'owner') {
                btn.style.display = hasBiometricEnrolled('owner', null) ? 'block' : 'none';
            } else {
                // العامل لسه ما كتبش اسم المستخدم بالضرورة — بنوري الزر لو فى أي بصمة عامل مسجّلة على الجهاز ده أصلًا، والتحقق الدقيق بيحصل جوه loginWithBiometric
                btn.style.display = (auth && (auth.biometric || []).some(b => b.role === 'worker')) ? 'block' : 'none';
            }
        }
        async function enrollBiometricFromLoginScreen() {
            const auth = getAuth();
            const pass = document.getElementById('loginPass').value;
            const err = document.getElementById('loginErr');
            if (!auth) { err.textContent = 'لا توجد حسابات بعد.'; return; }
            if (!pass) { err.textContent = 'اكتب كلمة المرور الأول عشان تقدر تفعّل البصمة'; return; }
            if (pickedRole === 'owner') {
                const ok = await verifyPassword(pass, auth.ownerSalt, auth.ownerHash);
                if (!ok) { err.textContent = '❌ كلمة المرور غلط'; return; }
                await enrollBiometricLogin('owner', null);
                refreshBiometricLoginButton();
                return;
            }
            const uname = (document.getElementById('loginUsername').value || '').trim().toLowerCase();
            if (!uname) { err.textContent = 'أدخل اسم المستخدم'; return; }
            const worker = (auth.workers || []).find(w => w.username.toLowerCase() === uname);
            const ok = worker && await verifyPassword(pass, worker.passSalt, worker.passHash);
            if (!ok) { err.textContent = '❌ بيانات الدخول غير صحيحة'; return; }
            await enrollBiometricLogin('worker', worker);
            refreshBiometricLoginButton();
        }

        let _setupInFlight = false; // 🔒 تحصين: يمنع نداء متزامن مزدوج أثناء انتظار secureHash غير المتزامنة
        async function doSetup() {
            if (_setupInFlight) return;
            _setupInFlight = true;
            try { await _doSetupInner(); } finally { _setupInFlight = false; }
        }
        async function _doSetupInner() {
            const p1 = document.getElementById('setupOwnerPass').value;
            const p2 = document.getElementById('setupOwnerPass2').value;
            const err = document.getElementById('setupErr');
            if (p1.length < 4) { err.textContent = 'كلمة مرور المالك يجب ألا تقل عن 4 أحرف'; return; }
            if (p1 !== p2) { err.textContent = 'كلمتا المرور غير متطابقتين'; return; }
            const { hash, salt } = await secureHash(p1); // 🔒 SHA-256+Salt بدل التجزئة البسيطة القديمة
            saveAuth({ ownerHash: hash, ownerSalt: salt, workers: [] });
            document.getElementById('setupOverlay').style.display = 'none';
            document.getElementById('loginOverlay').style.display = 'flex';
        }

        // 🔒 تحصين أمني: لا يوجد Rate-Limiting حقيقي ممكن على تطبيق عميل بالكامل (المهاجم يقدر ينادي verifyPassword
        // مباشرة بأي عدد محاولات من الـ Console)، لكن نضيف تأخير بسيط + عداد محاولات فاشلة كخط دفاع أول ضد
        // الاستخدام العرضي (شخص بيجرب كلمات سر من الشاشة العادية)، مش ضد مهاجم متمرّس.
        let _loginFailCount = 0, _loginLockUntil = 0;
        let _loginInFlight = false; // 🔒 تحصين: يمنع نداء متزامن مزدوج (ضغط "دخول" مرتين بسرعة أثناء انتظار secureHash غير المتزامنة)
        async function doLogin() {
            if (_loginInFlight) return;
            _loginInFlight = true;
            try { await _doLoginInner(); } finally { _loginInFlight = false; }
        }
        async function _doLoginInner() {
            const auth = getAuth();
            const pass = document.getElementById('loginPass').value;
            const err = document.getElementById('loginErr');
            if (!auth) { err.textContent = 'لا توجد حسابات بعد.'; return; }
            if (!pass) { err.textContent = 'أدخل كلمة المرور'; return; }
            if (Date.now() < _loginLockUntil) { err.textContent = `⏳ محاولات كتير غلط، استنى ${Math.ceil((_loginLockUntil - Date.now()) / 1000)} ثانية`; return; }
            const registerFail = () => {
                _loginFailCount++;
                if (_loginFailCount >= 5) { _loginLockUntil = Date.now() + 30000; _loginFailCount = 0; }
            };
            if (pickedRole === 'owner') {
                const ok = await verifyPassword(pass, auth.ownerSalt, auth.ownerHash);
                if (ok) {
                    _loginFailCount = 0;
                    if (!auth.ownerSalt) { const up = await secureHash(pass); auth.ownerHash = up.hash; auth.ownerSalt = up.salt; saveAuth(auth); } // ترقية تلقائية بصمت لحساب قديم عند أول دخول ناجح
                    startSession('owner', null, true, 'password');
                } else { registerFail(); err.textContent = '❌ بيانات الدخول غير صحيحة'; }
                return;
            }
            // عامل
            const uname = (document.getElementById('loginUsername').value || '').trim().toLowerCase();
            if (!uname) { err.textContent = 'أدخل اسم المستخدم'; return; }
            const worker = (auth.workers || []).find(w => w.username.toLowerCase() === uname);
            const ok = worker && await verifyPassword(pass, worker.passSalt, worker.passHash);
            if (ok) {
                _loginFailCount = 0;
                if (!worker.passSalt) { const up = await secureHash(pass); worker.passHash = up.hash; worker.passSalt = up.salt; saveAuth(auth); }
                startSession('worker', worker, true, 'password');
            } else { registerFail(); err.textContent = '❌ بيانات الدخول غير صحيحة'; }
        }

        // ============ 📊 نظام تتبّع حضور العمال — جلسات دخول/خروج تُبنى عليها الكفاءة والتقييم والنقاط ============
        // كل جلسة: {id, workerId, workerName, batchId, loginAt, lastActiveAt, logoutAt, method}. لو التطبيق
        // اتقفل من غير تسجيل خروج صريح (الأغلب فى تطبيق زي ده)، مش بنسيب الجلسة "مفتوحة للأبد" — أول ما يحصل
        // دخول جديد لنفس العامل، بنقفل القديمة بأفضل تقدير متاح (lastActiveAt، آخر نبضة حياة معروفة له)، مش
        // بوقت الدخول الجديد نفسه (عشان فجوة الانقطاع الفعلية ما تتحسبش غلط كأنها جزء من مدة الجلسة).
        function logWorkerSessionStart(worker, method) {
            if (!state.workerSessions) state.workerSessions = [];
            const nowIso = new Date().toISOString();
            state.workerSessions.forEach(s => { if (s.workerId === worker.id && !s.logoutAt) { s.logoutAt = s.lastActiveAt || s.loginAt; s.closedReason = 'auto'; } });
            state.workerSessions.unshift({ id: uid(), workerId: worker.id, workerName: worker.name, batchId: worker.batchId || null, loginAt: nowIso, lastActiveAt: nowIso, logoutAt: null, method: method || 'password' });
            if (state.workerSessions.length > 1000) state.workerSessions.length = 1000; // سقف تخزين معقول
            persist();
        }
        function touchWorkerSessionHeartbeat() {
            if (currentRole !== 'worker' || !currentWorker || !state.workerSessions) return;
            const sess = state.workerSessions.find(s => s.workerId === currentWorker.id && !s.logoutAt);
            if (sess) { sess.lastActiveAt = new Date().toISOString(); persist(); }
        }
        function closeCurrentWorkerSession() {
            if (currentRole !== 'worker' || !currentWorker || !state.workerSessions) return;
            const sess = state.workerSessions.find(s => s.workerId === currentWorker.id && !s.logoutAt);
            if (sess) { const nowIso = new Date().toISOString(); sess.logoutAt = nowIso; sess.lastActiveAt = nowIso; persist(); }
        }
        let _workerHeartbeatTimer = null;
        function startWorkerHeartbeat() {
            if (_workerHeartbeatTimer) return; // شغّالة أصلًا فى نفس التبويب
            touchWorkerSessionHeartbeat();
            _workerHeartbeatTimer = setInterval(touchWorkerSessionHeartbeat, 3 * 60 * 1000);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) touchWorkerSessionHeartbeat(); });
            window.addEventListener('beforeunload', () => { closeCurrentWorkerSession(); });
        }

        function startSession(role, worker, isFreshLogin, method) {
            if (isFreshLogin === undefined) isFreshLogin = true;
            currentRole = role;
            currentWorker = worker || null;
            // ============ 📊 تتبّع حضور العمال — تسجيل جلسة دخول جديدة بس لو ده تسجيل دخول فعلي (مش استرجاع صامت بعد تحديث الصفحة) ============
            if (role === 'worker' && currentWorker && isFreshLogin) {
                logWorkerSessionStart(currentWorker, method || 'password');
            }
            if (role === 'worker' && currentWorker) {
                startWorkerHeartbeat();
            }
            try {
                sessionStorage.setItem('poultry_role', role);
                sessionStorage.setItem('poultry_worker_id', worker ? worker.id : '');
            } catch (e) {}
            document.getElementById('setupOverlay').style.display = 'none';
            document.getElementById('loginOverlay').style.display = 'none';
            document.body.classList.remove('role-owner', 'role-worker');
            document.body.classList.add('role-' + role);
            document.getElementById('workerHeaderBar').style.display = role === 'worker' ? 'flex' : 'none';
            if (role === 'owner' && isSourceDevice()) subscribeAccessRequestsAdmin();
            loadState();
            if (role === 'worker' && currentWorker) {
                setState('activeTab', 'daily');
                const hasBatch = currentWorker.batchId && state.batches.some(b => b.id === currentWorker.batchId);
                setState('activeId', hasBatch ? currentWorker.batchId : null);
                const batchName = hasBatch ? state.batches.find(b => b.id === currentWorker.batchId).name : 'لا توجد دفعة مرتبطة — راجع المالك';
                document.getElementById('workerRoleBadge').textContent = `👷 ${currentWorker.name} — ${batchName}`;
            }
            render();
            setTimeout(() => checkAndNotifyToday(false), 2000);
            setTimeout(() => maybeShowOnboarding(), 300);
            setTimeout(() => maybeShowDailyBrief(), 600); // بعد الترحيب (لو ظاهر) عشان مايتزاحموش فوق بعض
            // إعادة فحص دورية للتنبيهات طول ما التطبيق/التبويب مفتوح (حتى لو فى الخلفية) — بتفيد لو
            // نسيت التطبيق شغال طول اليوم، تحديث المحتوى بيوصلك من غير ما تحتاج تفتحه من جديد.
            // ملحوظة: ده شغال بس والتبويب لسه مفتوح؛ لإشعار حقيقي والتطبيق مقفول تمامًا محتاج تثبيت
            // كـPWA + شبكة تدعم periodic background sync (أفضل جهد، مش مضمون فى كل الحالات).
            if (!window._katkotNotifyIntervalSet) {
                window._katkotNotifyIntervalSet = true;
                setInterval(() => checkAndNotifyToday(false), 45 * 60 * 1000);
                setInterval(checkExactTimeReminders, 60 * 1000);
                // ⚠️ إصلاح مكمّل: فحص فوري لحظة رجوع التطبيق للمقدمة (بعد ما كان فى الخلفية) — بدل ما
                // نستنى لحد الـ60 ثانية الجاية للـ interval العادي، اللي أصلًا ممكن يكون اتوقّف بسبب
                // نفس تبطيء المتصفح للتابات الخلفية. مع نافذة السماح فى isDueNow، ده بيقلل احتمال تفويت
                // الإشعار للحد الأدنى.
                document.addEventListener('visibilitychange', () => { if (!document.hidden) checkExactTimeReminders(); });
            }
        }

        function logout() {
            closeCurrentWorkerSession(); // نقفل جلسة العامل الحالية بوقت خروج دقيق قبل ما نمسح بيانات الجلسة
            try { sessionStorage.removeItem('poultry_role'); sessionStorage.removeItem('poultry_worker_id'); } catch (e) {}
            location.reload();
        }

        function openAccountsModal() {
            if (currentRole !== 'owner') return;
            document.getElementById('accOwnerPass').value = '';
            document.getElementById('accErr').textContent = '';
            cancelWorkerEdit();
            renderWorkersList();
            document.getElementById('accountsModalOverlay').classList.add('show');
        }

        function closeAccountsModal() {
            document.getElementById('accountsModalOverlay').classList.remove('show');
        }

        let _ownerPassSaveInFlight = false; // 🔒 تحصين: يمنع نداء متزامن مزدوج أثناء انتظار secureHash غير المتزامنة
        async function saveOwnerPassOnly() {
            if (_ownerPassSaveInFlight) return;
            _ownerPassSaveInFlight = true;
            try { await _saveOwnerPassOnlyInner(); } finally { _ownerPassSaveInFlight = false; }
        }
        async function _saveOwnerPassOnlyInner() {
            // 🔒 تحصين دفاعي: تأكيد الدور جوه الدالة نفسها، مش بس عند فتح المودال — عشان لو اتنادت
            // الدالة مباشرة (مثلاً من الـ Console) من غير ما تعدي على openAccountsModal لا تنفذ لغير المالك.
            if (currentRole !== 'owner') { showToast('🚫 غير مصرح لك بهذا الإجراء'); return; }
            const op = document.getElementById('accOwnerPass').value;
            const err = document.getElementById('accErr');
            if (!op) { err.textContent = 'أدخل كلمة المرور الجديدة أولاً'; return; }
            if (op.length < 4) { err.textContent = 'كلمة المرور يجب ألا تقل عن 4 أحرف'; return; }
            const auth = getAuth() || { workers: [] };
            const { hash, salt } = await secureHash(op);
            auth.ownerHash = hash; auth.ownerSalt = salt;
            saveAuth(auth);
            document.getElementById('accOwnerPass').value = '';
            err.textContent = '';
            showToast('✅ تم تحديث كلمة مرور المالك');
        }

        function permsCheckboxesHtml(selected) {
            const sel = Array.isArray(selected) ? selected : DEFAULT_WORKER_PERMISSIONS;
            const tabsHtml = WORKER_ASSIGNABLE_TABS.map(t => {
                const checked = sel.includes(t.id) ? 'checked' : '';
                return `<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:5px 0;cursor:pointer;">
                    <input type="checkbox" class="wf_perm_chk" value="${t.id}" ${checked}> ${t.label}
                </label>`;
            }).join('');
            const actionsHtml = ACTION_PERMISSIONS.map(a => {
                const checked = sel.includes(a.id) ? 'checked' : '';
                return `<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:5px 0;cursor:pointer;">
                    <input type="checkbox" class="wf_perm_chk" value="${a.id}" ${checked}> ${a.label}
                </label>`;
            }).join('');
            return tabsHtml +
                `<div style="border-top:1px dashed var(--line);margin:6px 0 4px;padding-top:6px;font-size:11px;font-weight:800;color:var(--muted);">🔧 إجراءات إضافية</div>` +
                actionsHtml;
        }

        function getCheckedPerms() {
            return Array.from(document.querySelectorAll('.wf_perm_chk:checked')).map(el => el.value);
        }

        function permsSummary(perms) {
            const list = (Array.isArray(perms) && perms.length) ? perms : DEFAULT_WORKER_PERMISSIONS;
            return list.map(id => {
                const t = TABS.find(x => x.id === id);
                if (t) return t.label.replace(/^\S+\s/, '');
                const a = ACTION_PERMISSIONS.find(x => x.id === id);
                return a ? a.label.replace(/^\S+\s/, '') : id;
            }).join('، ');
        }

        function batchOptionsHtml(selectedId) {
            const batches = (state.batches || []).filter(b => b.status !== 'مؤرشفة');
            let opts = `<option value="">— غير مرتبط بدفعة بعد —</option>`;
            opts += batches.map(b => `<option value="${b.id}" ${b.id === selectedId ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
            return opts;
        }

        function renderWorkersList() {
            const auth = getAuth() || { workers: [] };
            const workers = auth.workers || [];
            const wrap = document.getElementById('workersListWrap');
            document.getElementById('wf_batch').innerHTML = batchOptionsHtml(null);
            if (workers.length === 0) {
                wrap.innerHTML = `<div class="empty" style="padding:14px;"><div class="ico">👷</div>لا يوجد عمّال بعد. أضف أول عامل بالأسفل.</div>`;
                return;
            }
            wrap.innerHTML = workers.map(w => {
                const b = (state.batches || []).find(x => x.id === w.batchId);
                const batchLabel = b ? esc(b.name) : 'غير مرتبط بدفعة';
                return `<div class="check-row">
                    <div class="txt">
                        <div style="font-weight:800;">${esc(w.name)} <span style="font-weight:500;color:var(--muted);font-size:11.5px;">(${esc(w.username)})</span></div>
                        <div class="day">🐔 ${batchLabel}</div>
                        <div class="day" style="color:var(--muted);">🔐 ${permsSummary(w.permissions)}</div>
                    </div>
                    <button class="btn ghost sm" onclick="editWorkerStart('${w.id}')">✏️</button>
                    <button class="btn danger sm" onclick="deleteWorkerAccount('${w.id}')">🗑️</button>
                </div>`;
            }).join('');
            renderWorkerPerformance();
        }

        // ============ 📊 كفاءة/تقييم/نقاط حضور العامل — مبنية على جلسات الدخول الفعلية (state.workerSessions) ============
        // ⚠️ سُمّيت computeWorkerAttendancePerformance (مش computeWorkerPerformance) عمدًا — فيه دالة تانية بنفس
        // الاسم فى الكود الأصلي بتقيس حاجة مختلفة تمامًا (جودة بيانات مُدخَلة بمعزل عن الحضور)، ومُستخدمة فى
        // تبويب المالية. لو استخدمنا نفس الاسم كان هيحصل "shadowing" صامت (تعريف بيبطّل التاني بنفس الاسم من
        // غير أي خطأ ظاهر)، فتفشل الدالة القديمة تمامًا من غير أي تنبيه — نوع أخطر من الأخطاء لأنه بيمر بصمت.
        function computeWorkerAttendancePerformance(workerId, days) {
            days = days || 30;
            const auth = getAuth();
            const worker = auth && (auth.workers || []).find(w => w.id === workerId);
            if (!worker) return null;
            const cutoff = new Date(Date.now() - days * 86400000);
            const sessions = (state.workerSessions || []).filter(s => s.workerId === workerId && new Date(s.loginAt) >= cutoff);
            const activeDates = [...new Set(sessions.map(s => s.loginAt.slice(0, 10)))].sort();
            const attendanceDays = activeDates.length;

            const durationsMin = sessions.map(s => {
                const end = s.logoutAt || s.lastActiveAt || s.loginAt;
                return Math.max(0, (new Date(end) - new Date(s.loginAt)) / 60000);
            });
            const avgSessionMin = durationsMin.length ? durationsMin.reduce((a, b) => a + b, 0) / durationsMin.length : null;
            const openNow = sessions.some(s => !s.logoutAt);

            // أول وقت دخول لكل يوم — أساس قياس الالتزام بميعاد الحضور
            const firstLoginMinutes = activeDates.map(d => {
                const daySessions = sessions.filter(s => s.loginAt.slice(0, 10) === d).sort((a, b) => new Date(a.loginAt) - new Date(b.loginAt));
                const t = new Date(daySessions[0].loginAt);
                return t.getHours() * 60 + t.getMinutes();
            });
            const expectedMin = (state.appSettings && state.appSettings.workerExpectedCheckInMinute != null) ? state.appSettings.workerExpectedCheckInMinute : 6 * 60;
            const windowMin = (state.appSettings && state.appSettings.workerExpectedCheckInWindowMin != null) ? state.appSettings.workerExpectedCheckInWindowMin : 120;
            const onTimeDays = firstLoginMinutes.filter(t => Math.abs(t - expectedMin) <= windowMin).length;

            // انتظام تسجيل السجل اليومي لدفعته المرتبطة فى نفس أيام حضوره
            const batch = worker.batchId ? (state.batches || []).find(b => b.id === worker.batchId) : null;
            let recordCompletionRate = null;
            if (batch && attendanceDays > 0) {
                const recordDates = new Set((batch.records || []).filter(r => r.enteredBy === worker.name && new Date(r.enteredAt || r.date) >= cutoff).map(r => r.date));
                recordCompletionRate = Math.min(1, [...recordDates].filter(d => activeDates.includes(d)).length / attendanceDays);
            }

            // أطول سلسلة أيام حضور متتالية
            let longestStreak = 0, curStreak = 0, prevDate = null;
            activeDates.forEach(d => {
                curStreak = (prevDate && (new Date(d) - new Date(prevDate)) / 86400000 === 1) ? curStreak + 1 : 1;
                longestStreak = Math.max(longestStreak, curStreak);
                prevDate = d;
            });

            // النقاط: +2/يوم حضور، +3/يوم سجل يومي مكتمل، +2/يوم دخول فى الميعاد، +5 لكل أسبوع كامل متواصل
            let points = attendanceDays * 2 + onTimeDays * 2 + Math.floor(longestStreak / 7) * 5;
            if (batch) points += Math.round((recordCompletionRate || 0) * attendanceDays * 3);

            const tier = points >= 80 ? '🏆 ممتاز' : points >= 50 ? '👍 جيد' : points >= 25 ? '⚠️ متوسط' : (attendanceDays > 0 ? '🔴 يحتاج متابعة' : '➖ لا يوجد نشاط');
            const pointValue = (state.appSettings && state.appSettings.workerPointValueEGP != null) ? state.appSettings.workerPointValueEGP : null;
            const suggestedReward = pointValue != null ? points * pointValue : null;

            return { worker, days, sessionsCount: sessions.length, attendanceDays, avgSessionMin, openNow, onTimeDays,
                onTimeRate: attendanceDays ? onTimeDays / attendanceDays : null, recordCompletionRate, longestStreak, points, tier, suggestedReward };
        }

        // ============ 🎯 نقاط نتيجة الرعاية والتربية الفعلية — توزيع نقطي لكل تفصيلة حسب أهميتها وتأثيرها ============
        // ده منفصل عن نقاط الحضور اليومية (اللي بتتجمع باستمرار وبتتصفّر كل 30 يوم فى الأداء العام). النقاط
        // هنا مرتبطة بـ"دورة تربية كاملة" (دفعة واحدة من التسكين للأرشفة)، وبتتجمّع للعامل وتفضل قابلة
        // للاستبدال (رصيد يتراكم عبر عدة دورات لحد ما المالك يستبدله)، عشان تعكس نتيجة رعايته الفعلية للطيور
        // مش بس انتظام حضوره. التوزيع بالأهمية والتأثير على نتيجة الدورة:
        //   🐣 النفوق النهائي (25) — أهم مؤشر لجودة الرعاية اليومية والاستجابة السريعة للمشاكل الصحية
        //   🌾 كفاءة التحويل الغذائي/FCR (20) — انعكاس مباشر لدقة وانتظام التغذية والوزن
        //   💉 الالتزام بمواعيد التحصينات والعلاجات (20) — أهم إجراء وقائي، التأخير فيه بيكلّف الدورة كلها
        //   📝 انتظام تسجيل السجل اليومي طوال الدورة (15) — أساس أي متابعة ورصد مشاكل مبكرًا
        //   🌡️ الحفاظ على الحرارة/الرطوبة ضمن النطاق الموصى به (10) — جودة إدارة البيئة يوم بيوم
        //   📅 الحضور والانتظام فى الدخول خلال الدورة (10) — الأساس اللي باقي التفاصيل مبنية عليه
        // المقارنات (نفوق/FCR) بتبقى على متوسطك التاريخي الفعلي لنفس النوع — مش رقم عالمي ثابت، عشان
        // المقارنة تفضل عادلة لظروف مزرعتك بالذات. لو مفيش تاريخ كفاية للمقارنة، بتاخد نص النقاط (محايدة).
        function scoreVsBenchmark(actual, benchmark, lowerIsBetter, maxPoints) {
            if (actual == null || benchmark == null || benchmark === 0) return Math.round(maxPoints * 0.5);
            let ratio = lowerIsBetter ? benchmark / actual : actual / benchmark;
            ratio = Math.max(0, Math.min(1.2, ratio)); // سقف مكافأة تفوّق عند 120% من المتوسط
            return Math.round(maxPoints * ratio);
        }
        function computeCyclePointsBreakdown(b, worker) {
            if (!b) return null;
            const m = computeMetrics(b);
            const priorArchived = state.batches.filter(x => x.status === 'مؤرشفة' && x.species === b.species && x.id !== b.id);
            const histFcr = priorArchived.length ? priorArchived.map(x => computeMetrics(x).fcr).filter(v => v != null).reduce((a, v, _, arr) => a + v / arr.length, 0) || null : null;
            const histMort = priorArchived.length ? priorArchived.map(x => computeMetrics(x).mortRate).filter(v => v != null).reduce((a, v, _, arr) => a + v / arr.length, 0) || null : null;

            const mortalityPts = scoreVsBenchmark(m.mortRate, histMort, true, 25);
            const fcrPts = scoreVsBenchmark(m.fcr, histFcr, true, 20);

            const items = [...(b.vaccineLog || []), ...(b.treatmentLog || [])];
            let vaccinePts;
            if (!items.length) vaccinePts = Math.round(20 * 0.5);
            else {
                const done = items.filter(i => i.done);
                const completionRate = done.length / items.length;
                let onTimeCount = 0, timedCount = 0;
                done.forEach(i => {
                    if (!i.doneDate || !b.startDate) return;
                    timedCount++;
                    if (Math.abs(daysBetween(b.startDate, i.doneDate) - i.day) <= 2) onTimeCount++;
                });
                const onTimeRate = timedCount > 0 ? onTimeCount / timedCount : completionRate;
                vaccinePts = Math.round(20 * (completionRate * 0.6 + onTimeRate * 0.4));
            }

            const daysActive = worker ? Math.max(1, daysBetween(worker.assignedAt || b.startDate, b.archivedDate || todayStr()) + 1) : (b.records || []).length;
            const workerRecordDates = worker ? new Set((b.records || []).filter(r => r.enteredBy === worker.name).map(r => r.date)) : new Set();
            const recordPts = worker ? Math.round(15 * Math.min(1, workerRecordDates.size / daysActive)) : Math.round(15 * 0.5);

            let envPts;
            const recordsWithEnv = (b.records || []).filter(r => r.temp != null || r.humidity != null);
            if (!recordsWithEnv.length) envPts = Math.round(10 * 0.5);
            else {
                let withinCount = 0;
                recordsWithEnv.forEach(r => {
                    const refs = getRefsForDay(b, r.age);
                    let ok = true;
                    if (r.temp != null && refs.temp != null && Math.abs(r.temp - refs.temp) > 2) ok = false;
                    if (r.humidity != null && refs.humidity != null && Math.abs(r.humidity - refs.humidity) > 10) ok = false;
                    if (ok) withinCount++;
                });
                envPts = Math.round(10 * (withinCount / recordsWithEnv.length));
            }

            let attendancePts = Math.round(10 * 0.5);
            if (worker) {
                const cycleSessions = (state.workerSessions || []).filter(s => s.workerId === worker.id && s.batchId === b.id);
                const cycleDates = new Set(cycleSessions.map(s => s.loginAt.slice(0, 10)));
                attendancePts = Math.round(10 * Math.min(1, cycleDates.size / daysActive));
            }

            const categories = [
                { key: 'mortality', label: '🐣 النفوق النهائي مقابل متوسطك التاريخي', points: mortalityPts, maxPoints: 25 },
                { key: 'fcr', label: '🌾 كفاءة التحويل الغذائي (FCR) مقابل متوسطك التاريخي', points: fcrPts, maxPoints: 20 },
                { key: 'vaccines', label: '💉 الالتزام بمواعيد التحصينات والعلاجات', points: vaccinePts, maxPoints: 20 },
                { key: 'records', label: '📝 انتظام تسجيل السجل اليومي طوال الدورة', points: recordPts, maxPoints: 15 },
                { key: 'environment', label: '🌡️ الحرارة/الرطوبة ضمن النطاق الموصى به', points: envPts, maxPoints: 10 },
                { key: 'attendance', label: '📅 الحضور والانتظام فى الدخول خلال الدورة', points: attendancePts, maxPoints: 10 },
            ];
            const totalPoints = categories.reduce((s, c) => s + c.points, 0);
            return { categories, totalPoints, maxTotal: 100 };
        }

        // ============ 💰 دفتر نقاط قابلة للاستبدال — تُقفل وتُضاف تلقائيًا عند أرشفة كل دورة (نتيجة نهائية مؤكدة) ============
        function finalizeCyclePointsOnArchive(b) {
            const auth = getAuth();
            if (!auth || !Array.isArray(auth.workers)) return;
            const linkedWorkers = auth.workers.filter(w => w.batchId === b.id);
            if (!linkedWorkers.length) return;
            if (!state.workerPointsLedger) state.workerPointsLedger = [];
            linkedWorkers.forEach(w => {
                const breakdown = computeCyclePointsBreakdown(b, w);
                if (!breakdown) return;
                state.workerPointsLedger.unshift({ id: uid(), workerId: w.id, workerName: w.name, batchId: b.id, batchName: b.name, species: b.species,
                    breakdown: breakdown.categories, totalPoints: breakdown.totalPoints, maxTotal: breakdown.maxTotal, earnedAt: new Date().toISOString(), redeemed: false, redeemedAt: null, redeemedNote: null });
            });
            if (state.workerPointsLedger.length > 500) state.workerPointsLedger.length = 500;
        }
        function getWorkerRedeemableBalance(workerId) {
            return (state.workerPointsLedger || []).filter(e => e.workerId === workerId && !e.redeemed).reduce((s, e) => s + e.totalPoints, 0);
        }
        function redeemWorkerPoints(workerId) {
            if (!requirePermission('owner')) return; // 🔒 استبدال النقاط قرار مالي — مالك فقط
            const noteEl = document.getElementById('redeemNote_' + workerId);
            const note = noteEl ? noteEl.value.trim() : '';
            const balance = getWorkerRedeemableBalance(workerId);
            if (balance <= 0) { showToast('مفيش رصيد نقاط قابل للاستبدال حاليًا'); return; }
            showConfirm(`هتستبدل ${fmt(balance,0)} نقطة${note ? ` مقابل: "${esc(note)}"` : ''}؟ الرصيد هيتصفّر بعد كده.`, () => {
                const nowIso = new Date().toISOString();
                (state.workerPointsLedger || []).forEach(e => { if (e.workerId === workerId && !e.redeemed) { e.redeemed = true; e.redeemedAt = nowIso; e.redeemedNote = note || null; } });
                persist();
                renderWorkerPerformance();
                showToast('✅ تم استبدال الرصيد');
            }, 'تأكيد الاستبدال');
        }

        // ============ 📊 عرض كفاءة وتقييم ونقاط وحوافز كل عامل — آخر 30 يوم ============
        function renderWorkerPerformance() {
            const wrap = document.getElementById('workerPerfWrap');
            if (!wrap) return;
            const auth = getAuth() || { workers: [] };
            const workers = auth.workers || [];
            const s = state.appSettings || {};
            document.getElementById('wperf_checkinTime').value = fmtMinutesToHHMM((s.workerExpectedCheckInMinute != null) ? s.workerExpectedCheckInMinute : 360);
            document.getElementById('wperf_window').value = s.workerExpectedCheckInWindowMin ?? 120;
            document.getElementById('wperf_pointValue').value = s.workerPointValueEGP ?? '';
            if (!workers.length) { wrap.innerHTML = `<div class="empty" style="padding:10px;font-size:12px;">لا يوجد عمّال بعد.</div>`; return; }
            wrap.innerHTML = workers.map(w => {
                const p = computeWorkerAttendancePerformance(w.id, 30);
                if (!p) return '';
                const batch = w.batchId ? (state.batches || []).find(b => b.id === w.batchId) : null;
                const liveCycle = (batch && batch.status === 'نشطة') ? computeCyclePointsBreakdown(batch, w) : null;
                const balance = getWorkerRedeemableBalance(w.id);
                const history = (state.workerPointsLedger || []).filter(e => e.workerId === w.id).slice(0, 5);
                return `<div class="check-row" style="align-items:flex-start;">
                    <div class="txt">
                        <div style="font-weight:800;">${esc(w.name)} — ${p.tier}${p.openNow ? ' <span style="color:var(--green);font-size:10.5px;">● أونلاين دلوقتي</span>' : ''}</div>
                        <div class="day">📅 حضور ${p.attendanceDays} يوم من آخر 30 | ⏱️ متوسط الجلسة ${p.avgSessionMin != null ? fmt(p.avgSessionMin,0) + ' دقيقة' : '—'} | ⏰ التزام بالميعاد ${p.onTimeRate != null ? fmt(p.onTimeRate*100,0)+'%' : '—'}</div>
                        <div class="day">📝 انتظام السجل اليومي ${p.recordCompletionRate != null ? fmt(p.recordCompletionRate*100,0)+'%' : '—'} | 🔥 أطول سلسلة متواصلة ${p.longestStreak} يوم</div>
                        <div class="day" style="font-weight:800;color:var(--barn-dark);">⭐ ${fmt(p.points,0)} نقطة حضور${p.suggestedReward != null ? ` — 🎁 مكافأة مقترحة: ${money(p.suggestedReward)}` : ''}</div>
                        ${liveCycle ? `<div class="day" style="margin-top:4px;border-top:1px dashed var(--line);padding-top:4px;">🎯 نقاط الرعاية والتربية لدورة "${esc(batch.name)}" (تقدير حي حتى الآن): <b>${liveCycle.totalPoints}/${liveCycle.maxTotal}</b><br><span style="font-size:10px;">${liveCycle.categories.map(c => `${c.label.split(' ')[0]} ${c.points}/${c.maxPoints}`).join(' · ')}</span></div>` : ''}
                        <div class="day" style="margin-top:4px;font-weight:800;">💰 رصيد نقاط قابل للاستبدال: ${fmt(balance,0)} نقطة</div>
                        ${balance > 0 ? `<div style="display:flex;gap:6px;margin-top:4px;">
                            <input type="text" id="redeemNote_${w.id}" placeholder="مقابل ايه؟ (اختياري)" style="flex:1;padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;font-size:12px;">
                            <button class="btn gold sm" onclick="redeemWorkerPoints('${w.id}')">✅ استبدال</button>
                        </div>` : ''}
                        ${history.length ? `<div class="day" style="margin-top:4px;color:var(--muted);font-size:10px;">آخر دورات: ${history.map(e => `${esc(e.batchName)} (${e.totalPoints}ن${e.redeemed ? ' ✅مُستبدلة' : ' ⏳معلّقة'})`).join(' | ')}</div>` : ''}
                    </div>
                </div>`;
            }).join('');
        }
        function fmtMinutesToHHMM(min) {
            const h = Math.floor(min / 60).toString().padStart(2, '0');
            const m = Math.floor(min % 60).toString().padStart(2, '0');
            return `${h}:${m}`;
        }
        function saveWorkerPerfSettings() {
            if (!requirePermission('owner')) return; // 🔒 إصلاح Red Team: معايير تقييم العمال (ميعاد الحضور، قيمة النقطة) قرار مالك فقط — لا يجوز للعامل نفسه تعديلها
            const timeVal = document.getElementById('wperf_checkinTime').value; // HH:MM
            const [hh, mm] = (timeVal || '06:00').split(':').map(Number);
            setState('appSettings', { ...state.appSettings, workerExpectedCheckInMinute: (hh || 0) * 60 + (mm || 0),
                workerExpectedCheckInWindowMin: parseFloat(document.getElementById('wperf_window').value) || 120,
                workerPointValueEGP: document.getElementById('wperf_pointValue').value === '' ? null : parseFloat(document.getElementById('wperf_pointValue').value) });
            persist();
            renderWorkerPerformance();
            showToast('✅ اتحفظت إعدادات تقييم العمال');
        }

        function editWorkerStart(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix: منع عامل من قراءة بيانات/صلاحيات عامل آخر
            const auth = getAuth();
            const w = (auth.workers || []).find(x => x.id === id);
            if (!w) return;
            editingWorkerId = id;
            document.getElementById('workerFormTitle').textContent = `✏️ تعديل بيانات: ${w.name}`;
            document.getElementById('wf_name').value = w.name;
            document.getElementById('wf_username').value = w.username;
            document.getElementById('wf_pass').value = '';
            document.getElementById('wf_pass').placeholder = 'اتركها فارغة للإبقاء على نفس كلمة المرور';
            document.getElementById('wf_batch').innerHTML = batchOptionsHtml(w.batchId);
            document.getElementById('wf_permsWrap').innerHTML = permsCheckboxesHtml(w.permissions);
            document.getElementById('wf_save_btn').textContent = '💾 حفظ التعديل';
            document.getElementById('wf_cancel_btn').style.display = 'block';
            document.getElementById('accErr').textContent = '';
        }

        function cancelWorkerEdit() {
            editingWorkerId = null;
            document.getElementById('workerFormTitle').textContent = '➕ إضافة عامل جديد';
            document.getElementById('wf_name').value = '';
            document.getElementById('wf_username').value = '';
            document.getElementById('wf_pass').value = '';
            document.getElementById('wf_pass').placeholder = 'كلمة المرور';
            const batchSel = document.getElementById('wf_batch');
            if (batchSel) batchSel.innerHTML = batchOptionsHtml(null);
            const permsWrap = document.getElementById('wf_permsWrap');
            if (permsWrap) permsWrap.innerHTML = permsCheckboxesHtml(DEFAULT_WORKER_PERMISSIONS);
            document.getElementById('wf_save_btn').textContent = '+ إضافة العامل';
            document.getElementById('wf_cancel_btn').style.display = 'none';
            document.getElementById('accErr').textContent = '';
        }

        let _workerSaveInFlight = false; // 🔒 تحصين: يمنع نداء متزامن مزدوج أثناء انتظار secureHash غير المتزامنة
        async function addOrUpdateWorker() {
            if (_workerSaveInFlight) return;
            _workerSaveInFlight = true;
            try { await _addOrUpdateWorkerInner(); } finally { _workerSaveInFlight = false; }
        }
        async function _addOrUpdateWorkerInner() {
            // 🔒 تحصين دفاعي: نفس المبدأ — تأكيد الدور جوه الدالة نفسها (defense-in-depth)
            if (currentRole !== 'owner') { showToast('🚫 غير مصرح لك بهذا الإجراء'); return; }
            const auth = getAuth() || { workers: [] };
            if (!auth.workers) auth.workers = [];
            const name = document.getElementById('wf_name').value.trim();
            const username = document.getElementById('wf_username').value.trim().toLowerCase();
            const pass = document.getElementById('wf_pass').value;
            const batchId = document.getElementById('wf_batch').value || null;
            const err = document.getElementById('accErr');
            if (!name) { err.textContent = 'أدخل اسم العامل'; return; }
            if (!/^[a-zA-Z0-9_.]{3,}$/.test(username)) { err.textContent = 'اسم المستخدم بالإنجليزي فقط (3 أحرف على الأقل، بدون مسافات)'; return; }
            const dup = auth.workers.find(w => w.username.toLowerCase() === username && w.id !== editingWorkerId);
            if (dup) { err.textContent = 'اسم المستخدم ده مستخدم بالفعل، اختر اسم تاني'; return; }
            if (!editingWorkerId && pass.length < 4) { err.textContent = 'كلمة المرور يجب ألا تقل عن 4 أحرف'; return; }
            if (pass && pass.length > 0 && pass.length < 4) { err.textContent = 'كلمة المرور يجب ألا تقل عن 4 أحرف'; return; }
            let permissions = getCheckedPerms();
            if (!permissions.length) permissions = ['daily']; // على الأقل السجل اليومي حتى لا يُقفل العامل تمامًا

            if (editingWorkerId) {
                const w = auth.workers.find(x => x.id === editingWorkerId);
                if (w) {
                    w.name = name; w.username = username; w.batchId = batchId; w.permissions = permissions;
                    if (pass) { const h = await secureHash(pass); w.passHash = h.hash; w.passSalt = h.salt; } // 🔒 SHA-256+Salt
                }
                showToast('✅ تم تحديث بيانات العامل');
                if (currentWorker && currentWorker.id === editingWorkerId) currentWorker.permissions = permissions;
            } else {
                const h = await secureHash(pass); // 🔒 SHA-256+Salt بدل التجزئة البسيطة القديمة
                auth.workers.push({ id: uid(), name, username, passHash: h.hash, passSalt: h.salt, batchId, permissions });
                showToast('✅ تم إضافة العامل');
            }
            saveAuth(auth);
            cancelWorkerEdit();
            renderWorkersList();
        }

        function deleteWorkerAccount(id) {
            // 🔒 تحصين دفاعي: نفس المبدأ — تأكيد الدور جوه الدالة نفسها
            if (currentRole !== 'owner') { showToast('🚫 غير مصرح لك بهذا الإجراء'); return; }
            const auth = getAuth();
            const w = (auth.workers || []).find(x => x.id === id);
            if (!w) return;
            showConfirm(`هل تريد حذف حساب العامل «${w.name}»؟ لن يستطيع الدخول مرة أخرى.`, () => {
                auth.workers = auth.workers.filter(x => x.id !== id);
                saveAuth(auth);
                renderWorkersList();
                showToast('🗑️ تم حذف حساب العامل');
            }, 'تأكيد حذف العامل');
        }

        function initAuth() {
            const auth = getAuth();
            if (!auth) { document.getElementById('setupOverlay').style.display = 'flex'; return; }
            migrateWorkerPermissions(auth);
            let savedRole = null, savedWorkerId = null;
            try {
                savedRole = sessionStorage.getItem('poultry_role');
                savedWorkerId = sessionStorage.getItem('poultry_worker_id');
            } catch (e) {}
            if (savedRole === 'owner') { startSession('owner', null, false); return; }
            if (savedRole === 'worker' && savedWorkerId) {
                const w = (auth.workers || []).find(x => x.id === savedWorkerId);
                if (w) { startSession('worker', w, false); return; }
            }
            document.getElementById('loginOverlay').style.display = 'flex';
            setTimeout(() => { const el = document.getElementById('loginPass'); if (el) el.focus(); refreshBiometricLoginButton(); }, 50);
        }

        // ============ نقل صلاحيات العمال من أسماء التبويبات القديمة (feed/environment/alerts/finance/inventory/compare) للتبويبات الجديدة المُدمجة (production/management) — مرة واحدة عند التحميل ============
        function migrateWorkerPermissions(auth) {
            if (!auth || !Array.isArray(auth.workers)) return;
            const map = { feed: 'production', environment: 'production', alerts: 'production', finance: 'management', inventory: 'management', compare: 'management' };
            let changed = false;
            auth.workers.forEach(w => {
                if (!Array.isArray(w.permissions)) return;
                const mapped = [...new Set(w.permissions.map(p => map[p] || p))];
                if (mapped.length !== w.permissions.length || mapped.some((v, i) => v !== w.permissions[i])) {
                    w.permissions = mapped; changed = true;
                }
            });
            if (changed) saveAuth(auth);
        }

        function getDefaultChecklist(floorType) {
            const floorItem = floorType === 'cage' ? 'فحص انتظام إزالة الزرق ونظافة الأحواض/السير'
                : floorType === 'slat' ? 'فحص سلامة الأرضية الشبكية وتهوية الحيز أسفلها'
                : 'فحص الفرشة (جفاف/تكتل)';
            return [
                'فحص العلافات والتأكد من وجود علف كافٍ',
                'فحص المساقي والتأكد من جريان الماء',
                'فحص درجة الحرارة والتهوية',
                'جمع ومراجعة النافق (إن وجد) وتسجيله',
                floorItem,
                'فحص سلوك وحيوية القطيع',
                'تسجيل بيانات اليوم فى السجل اليومي'
            ];
        }
        const DEFAULT_CHECKLIST = getDefaultChecklist('litter');

        const TABS = [
            { id: 'dashboard', label: '📊 لوحة التحكم' },
            { id: 'daily', label: '📅 السجل اليومي' },
            { id: 'production', label: '🌾 الإنتاج' },
            { id: 'management', label: '💰 الإدارة والتخطيط' },
            { id: 'settings', label: '⚙️ الإعدادات' },
        ];

        // تبويبات يمكن منح العامل صلاحية الوصول إليها (الإعدادات محجوبة عن العمّال دائمًا)
        const WORKER_ASSIGNABLE_TABS = TABS.filter(t => t.id !== 'settings');
        const DEFAULT_WORKER_PERMISSIONS = ['daily', 'production'];

        // صلاحيات إجراءات إضافية (غير مرتبطة بتبويب) يمكن منحها للعامل
        const ACTION_PERMISSIONS = [
            { id: 'createBatch', label: '➕ إنشاء دفعة تسمين جديدة' }
        ];

        function workerHasPermission(action) {
            if (currentRole !== 'worker') return true; // المالك له كل الصلاحيات دائمًا
            const perms = (currentWorker && Array.isArray(currentWorker.permissions) && currentWorker.permissions.length)
                ? currentWorker.permissions : DEFAULT_WORKER_PERMISSIONS;
            return perms.includes(action);
        }

        // ============ 🔒 تحصين أمني (Red Team fix — Action-Level Authorization Bypass) ============
        // المشكلة المكتشفة: كثير من دوال الحذف/الحفظ الحساسة (مبيعات، مشتريات، تحصينات،
        // علاجات، إضافات، مخزون...) كانت تتحقق من الصلاحية فقط عند *رسم* الزرار فى الواجهة
        // (class="owner-only" بيخفي الزرار بـ CSS، أو تبويب كامل مخفي عن العامل). لكن الدالة
        // نفسها اللي بتنفذ التعديل الفعلي على البيانات ما كانتش بتعيد نفس التحقق — فأي عامل
        // (شخص له دخول فعلي على نفس الجهاز، وهو بالظبط الـ Threat Model هنا) يقدر يفتح
        // Console المتصفح (F12) وينادي الدالة بالاسم مباشرة (مثلاً deleteSale('id'))
        // متجاوزًا القيد تمامًا، حتى لو الزرار نفسه مخفي عنه أو التبويب كله مقفول أمامه.
        // الحل: نقطة تحقق مركزية واحدة تتنادى من *جوه* كل دالة حساسة، فتتأكد من الصلاحية
        // بغض النظر عن مصدر النداء (زرار، أو نداء مباشر من الـ Console).
        //   requirePermission('owner')       → المالك فقط (يطابق ما كانت الواجهة تعرضه بـ owner-only)
        //   requirePermission('management')  → المالك أو عامل معه صلاحية تبويب "الإدارة والتخطيط"
        //   requirePermission('production')  → المالك أو عامل معه صلاحية تبويب "الإنتاج"
        function requirePermission(scope) {
            if (currentRole !== 'worker') return true; // المالك دائمًا مصرح له
            if (scope === 'owner') { showToast('🚫 هذا الإجراء متاح لمالك المزرعة فقط'); return false; }
            if (!workerHasPermission(scope)) { showToast('🚫 غير مصرح لك بهذا الإجراء — تواصل مع مالك المزرعة'); return false; }
            return true;
        }

        function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

        // ============ لمسات إحساس صغيرة (اهتزاز/ألوان/سلاسل) — بدون تخزين إضافي، محسوبة من البيانات الموجودة ============
        function vibrate(pattern) {
            try {
                if (state.vibrationEnabled === false) return; // المستخدم قفلها من الإعدادات
                if (navigator.vibrate) navigator.vibrate(pattern);
            } catch (e) {}
        }
        // لون ثابت لكل دفعة (نفس الدفعة بتاخد نفس اللون دايمًا) — للتفريق البصري السريع بين الدفعات النشطة
        const BATCH_COLORS = ['#D9A544', '#2C7A4B', '#2E6E8E', '#C1443C', '#8A6116', '#6B4226', '#7A5FBF'];
        function batchColor(id) {
            let h = 0;
            for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
            return BATCH_COLORS[h % BATCH_COLORS.length];
        }
        // كام يوم متتالي (لحد آخر سجل موجود) اتسجل فيه سجل يومي — بيتوقف أول يوم فيه فجوة
        function computeLoggingStreak(b) {
            if (!b || !b.records || !b.records.length) return 0;
            const dates = new Set(b.records.map(r => r.date));
            let cursor = new Date();
            // لو النهاردة لسه معملوش سجل، نبدأ العد من أمس عشان السلسلة متتكسرش لحد نص الليل
            if (!dates.has(todayStr())) cursor.setDate(cursor.getDate() - 1);
            let streak = 0;
            while (true) {
                const y = cursor.getFullYear(), m = String(cursor.getMonth() + 1).padStart(2, '0'), d = String(cursor.getDate()).padStart(2, '0');
                const ds = `${y}-${m}-${d}`;
                if (!dates.has(ds)) break;
                streak++;
                cursor.setDate(cursor.getDate() - 1);
            }
            return streak;
        }
        // تشغيل انيميشن نجاح على أي زرار (تحويل مؤقت لعلامة صح)
        function flashSaveSuccess(btn, doneLabel) {
            if (!btn) return;
            const original = btn.textContent;
            btn.textContent = doneLabel || '✅ تم الحفظ';
            btn.classList.add('save-success');
            setTimeout(() => { btn.textContent = original; btn.classList.remove('save-success'); }, 900);
        }
        // اهتزاز رفض بسيط على حقل مدخل غلط (بدل رسالة حمرا بس)
        function shakeField(el) {
            if (!el) return;
            const wrap = el.closest('.field') || el;
            wrap.classList.remove('shake');
            void wrap.offsetWidth; // إعادة تشغيل الانيميشن لو اتكرر
            wrap.classList.add('shake');
            vibrate(60);
        }
        let lastDangerAlertSignatures = {}; // لكل دفعة سيجنتشر منفصل — عشان التنقل بين الدفعات ميكررش/يبلع الاهتزاز غلط
        function notifyNewDangerAlerts(alerts, batchId) {
            const dangerOnly = (alerts || []).filter(a => a.level === 'danger' && !a.dismissed);
            const sig = dangerOnly.map(a => a.text).join('|');
            if (dangerOnly.length && sig !== lastDangerAlertSignatures[batchId]) {
                vibrate([50, 40, 50]);
            }
            lastDangerAlertSignatures[batchId] = sig;
        }
        // تنظيف أي نص حر كتبه المستخدم (اسم دفعة/عامل/مورد/ملاحظة...) قبل عرضه داخل HTML
        // لمنع كسر التنسيق أو حقن وسوم لو النص فيه رموز مثل < > " &
        function esc(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function todayStr() {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
        // ============ 🔴 تنفيذ Critique (2): البُعد الثاني للذاكرة المرضية — الموسم/وقت السنة، مستخرج من تاريخ الحادثة ============
        // نستخدم الفصول الأربعة (مش الشهر مباشرة) عشان العينة تفضل كافية إحصائيًا — 12 شهر هيقسّم بيانات قليلة أصلاً
        // لدرجة مفيش فيها معنى، أما 4 فصول فبتحافظ على قوة إحصائية معقولة وبرضه بتلتقط الفرق المناخي الحقيقي فى مصر.
        function seasonOf(dateStr) {
            if (!dateStr) return null;
            const m = new Date(dateStr).getMonth() + 1; // 1-12
            if (m >= 6 && m <= 9) return 'صيف';
            if (m === 12 || m <= 2) return 'شتاء';
            if (m >= 3 && m <= 5) return 'ربيع';
            return 'خريف';
        }

        function fmt(n, d = 1) { if (n === null || n === undefined || isNaN(n)) return '—'; return Number(n).toLocaleString(
                'ar-EG', { maximumFractionDigits: d, minimumFractionDigits: 0 }); }

        function money(n) { return fmt(n, 0) + ' ' + getCurrencySymbol(); }

        // ============ مكوّن فلتر تاريخ موحّد قابل لإعادة الاستخدام (المرحلة الملهمة من تطبيق آخر) ============
        // بديل عن ما يتكرر إعادة بناءه فى كل شاشة تحتاج فلترة بالتاريخ: نفس التسعة اختيارات القياسية.
        const DATE_RANGE_PRESETS = [
            { id: 'today', label: 'اليوم' }, { id: 'yesterday', label: 'أمس' },
            { id: 'this_month', label: 'هذا الشهر' }, { id: 'last_month', label: 'الشهر الماضي' },
            { id: 'last_3_months', label: 'آخر 3 أشهر' }, { id: 'last_6_months', label: 'آخر 6 أشهر' },
            { id: 'this_year', label: 'هذا العام' }, { id: 'last_year', label: 'العام الماضي' },
            { id: 'all_time', label: 'كل الوقت' },
        ];
        function dateRangePresetLabel(id) { const p = DATE_RANGE_PRESETS.find(x => x.id === id); return p ? p.label : 'كل الوقت'; }
        // بيرجع {start, end} كـ Date، أو null لـ 'all_time' (يعني بلا حدود)
        function dateRangeFromPreset(presetId) {
            const now = new Date();
            const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
            const endOfDay = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
            switch (presetId) {
                case 'today': return { start: startOfDay(now), end: endOfDay(now) };
                case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: startOfDay(y), end: endOfDay(y) }; }
                case 'this_month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
                case 'last_month': { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { start: s, end: endOfDay(e) }; }
                case 'last_3_months': { const s = new Date(now); s.setMonth(s.getMonth() - 3); return { start: startOfDay(s), end: endOfDay(now) }; }
                case 'last_6_months': { const s = new Date(now); s.setMonth(s.getMonth() - 6); return { start: startOfDay(s), end: endOfDay(now) }; }
                case 'this_year': return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) };
                case 'last_year': return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999) };
                case 'all_time': default: return null;
            }
        }
        function isDateInPreset(dateStrOrTimestamp, presetId) {
            if (!dateStrOrTimestamp) return false;
            const range = dateRangeFromPreset(presetId);
            if (!range) return true;
            const d = new Date(dateStrOrTimestamp);
            return d >= range.start && d <= range.end;
        }
        let _dateRangeFilterCallback = null;
        function openDateRangeFilter(currentPresetId, onSelect) {
            _dateRangeFilterCallback = onSelect;
            const cur = currentPresetId || 'all_time';
            const html = DATE_RANGE_PRESETS.map(p => `<button class="btn ${p.id === cur ? '' : 'ghost'} block" style="margin-bottom:6px;" onclick="selectDateRangePreset('${p.id}')">${p.label}</button>`).join('');
            openGenericModal('📅 فلترة حسب التاريخ', html);
        }
        function selectDateRangePreset(id) {
            closeModal('genericModalOverlay');
            if (_dateRangeFilterCallback) _dateRangeFilterCallback(id);
        }

        // ===== Storage (متزامن بالكامل - يحل مشكلة سباق البيانات) =====
        function saveToStorage(jsonStr) {
            try {
                localStorage.setItem(STORAGE_KEY, jsonStr);
                // ============ تحقق من سلامة البيانات (Integrity Check) ============
                // نخزّن بصمة (checksum) بسيطة لمحتوى البيانات فى مفتاح منفصل. لو حصل تلف جزئي فى
                // localStorage (مساحة ممتلئة، تعارض بين تبويبات، خطأ نظام) هنقدر نكتشفه عند التحميل التالي
                // بدل ما نفاجأ ببيانات ناقصة/فاسدة بصمت.
                localStorage.setItem(STORAGE_KEY + '_checksum', simpleHash(jsonStr));
                return true;
            } catch (e) { console.error('خطأ في الحفظ', e); return false; }
        }

        function loadFromStorage() {
            try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
        }

        // ============ إدارة سعة التخزين — الصور التوثيقية base64 يمكنها تجاوز حد localStorage (~5-10 ميجا) ============
        const MAX_STORED_PHOTOS = 15; // نحتفظ بآخر N صورة توثيقية فقط عبر كل الدفعات لتفادي امتلاء السعة
        // دوال مساعدة موحّدة للتعامل مع صور السجل اليومي — تدعم الشكل الجديد (r.photos[]) والقديم (r.photo) معًا
        function getRecordPhotos(r) { return Array.isArray(r.photos) ? r.photos : (r.photo ? [r.photo] : []); }
        function clearRecordPhotos(r) { r.photos = []; r.photo = null; }
        function pruneOldPhotos(maxPhotos) {
            maxPhotos = maxPhotos || MAX_STORED_PHOTOS;
            const withPhotos = [];
            (state.batches || []).forEach(b => (b.records || []).forEach(r => { if (getRecordPhotos(r).length) withPhotos.push(r); }));
            if (withPhotos.length <= maxPhotos) return false;
            withPhotos.sort((a, c) => (a.date || '').localeCompare(c.date || ''));
            const toRemove = withPhotos.length - maxPhotos;
            for (let i = 0; i < toRemove; i++) clearRecordPhotos(withPhotos[i]);
            return true;
        }

        // ============ صور مرجعية للأصناف (أدوية/لقاحات/إضافات) — توثّق شكل المنتج المستخدم فعليًا ============
        const MAX_STORED_ITEM_PHOTOS = 20;
        let pendingInvPhotoItemId = null;
        function triggerItemPhotoUpload(itemId) {
            pendingInvPhotoItemId = itemId;
            document.getElementById('inv_photo_input').click();
        }
        function handleItemPhotoUpload(event) {
            const file = event.target.files[0];
            const itemId = pendingInvPhotoItemId;
            if (!file || !itemId) return;
            compressImageFile(file, 500, 0.55, (dataUrl) => {
                const b = getActiveBatch();
                const it = b && b.inventory.find(i => i.id === itemId);
                if (it) {
                    it.photo = dataUrl; it.photoUpdatedAt = Date.now();
                    pruneOldInventoryPhotos();
                    persist(); render();
                    showToast('✅ تم حفظ صورة الصنف');
                }
                pendingInvPhotoItemId = null;
                event.target.value = '';
            });
        }
        function removeItemPhoto(itemId) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            const it = b && b.inventory.find(i => i.id === itemId);
            if (!it) return;
            it.photo = null; it.photoUpdatedAt = null;
            persist(); render();
            showToast('🗑️ تم حذف صورة الصنف');
        }
        function pruneOldInventoryPhotos(maxPhotos) {
            maxPhotos = maxPhotos || MAX_STORED_ITEM_PHOTOS;
            const withPhotos = [];
            (state.batches || []).forEach(b => (b.inventory || []).forEach(it => { if (it.photo) withPhotos.push(it); }));
            if (withPhotos.length <= maxPhotos) return false;
            withPhotos.sort((a, c) => (a.photoUpdatedAt || 0) - (c.photoUpdatedAt || 0));
            const toRemove = withPhotos.length - maxPhotos;
            for (let i = 0; i < toRemove; i++) withPhotos[i].photo = null;
            return true;
        }

        // ============ توفير المساحة: تنظيف صور الدورات المؤرشفة القديمة (اختياري، بتأكيد صريح) ============
        // الصور التوثيقية (base64) هي المسبب الأكبر لتضخم حجم البيانات المحفوظة بمرور الوقت مع تراكم الدورات.
        // البيانات الرقمية والتحليلية لكل سجل (وزن، علف، نفوق، FCR...) تبقى كاملة كما هي دائمًا — هذا التنظيف
        // يحذف الصور فقط، ومن دورات "مؤرشفة" مضى عليها فترة طويلة تحديدًا (مش الدفعات النشطة حاليًا).
        const ARCHIVE_PHOTO_CLEANUP_DAYS = 90;
        function estimateArchivePhotoCleanup() {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - ARCHIVE_PHOTO_CLEANUP_DAYS);
            let photoCount = 0, approxKB = 0;
            (state.batches || []).forEach(b => {
                if (b.status !== 'مؤرشفة' || !b.archivedDate || new Date(b.archivedDate) > cutoff) return;
                (b.records || []).forEach(r => { const ph = getRecordPhotos(r); if (ph.length) { photoCount += ph.length; ph.forEach(p => approxKB += Math.round((p||'').length / 1024)); } });
                (b.inventory || []).forEach(it => { if (it.photo) { photoCount++; approxKB += Math.round(it.photo.length / 1024); } });
            });
            return { photoCount, approxKB };
        }
        function cleanupOldArchivedPhotos() {
            const { photoCount, approxKB } = estimateArchivePhotoCleanup();
            if (photoCount === 0) { showToast('لا توجد صور فى دورات مؤرشفة قديمة لتنظيفها حاليًا'); return; }
            showConfirm(`سيتم حذف ${photoCount} صورة توثيقية من دورات مؤرشفة مضى عليها أكثر من ${ARCHIVE_PHOTO_CLEANUP_DAYS} يوم (تحرير ~${approxKB.toLocaleString('ar-EG')} ك.ب تقريبًا). كل البيانات الرقمية والتحليلية (الوزن، العلف، النفوق، FCR...) ستبقى كاملة كما هي تمامًا، ولن يتأثر أي تقرير أو حساب أو منحنى مقارنة. هذا الإجراء نهائي ولا يمكن التراجع عنه. متابعة؟`, () => {
                const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - ARCHIVE_PHOTO_CLEANUP_DAYS);
                (state.batches || []).forEach(b => {
                    if (b.status !== 'مؤرشفة' || !b.archivedDate || new Date(b.archivedDate) > cutoff) return;
                    (b.records || []).forEach(r => { if (getRecordPhotos(r).length) clearRecordPhotos(r); });
                    (b.inventory || []).forEach(it => { if (it.photo) { it.photo = null; it.photoUpdatedAt = null; } });
                });
                persist();
                render();
                showToast('✅ تم تنظيف الصور القديمة وتوفير المساحة');
            }, 'تأكيد تنظيف الصور القديمة');
        }

        function loadState() {
            const raw = loadFromStorage();
            let integrityWarning = false;
            if (raw) {
                try {
                    const storedChecksum = localStorage.getItem(STORAGE_KEY + '_checksum');
                    if (storedChecksum && storedChecksum !== simpleHash(raw)) integrityWarning = true;
                } catch (e) { /* تجاهل - التحقق اختياري ولا يمنع التحميل */ }
                try { state = JSON.parse(raw); } catch (e) {
                    state = { batches: [], activeId: null, activeTab: 'dashboard', compareIds: [] };
                }
            }
            if (!state.batches) setState('batches', []);
            if (!state.activeTab) setState('activeTab', 'dashboard');
            if (!state.compareIds) setState('compareIds', []);
            if (!state.speciesOverrides) setState('speciesOverrides', {});
            if (!state.appSettings) setState('appSettings', {});
            if (!state.protocols) setState('protocols', []);
            if (state.lastBackupDate === undefined) setState('lastBackupDate', null);
            if (!state.globalAuditLog) setState('globalAuditLog', []);
            if (state.farmLocation === undefined) setState('farmLocation', null);
            if (!state.localSnapshots) setState('localSnapshots', []);
            if (!state.contacts) setState('contacts', []);
            if (!state.sharedSnapshots) setState('sharedSnapshots', []);
            if (state.autoBackupEnabled === undefined) setState('autoBackupEnabled', false);
            if (state.lastAutoBackupAt === undefined) setState('lastAutoBackupAt', null);
            if (state.farmWeatherForecast === undefined) setState('farmWeatherForecast', null);
            if (state.farmName === undefined) setState('farmName', (typeof state.farmLocation === 'string' ? state.farmLocation : null)); // ترحيل: قديمًا كان اسم المزرعة بيتخزن غلط جوه farmLocation
            if (typeof state.farmLocation === 'string') setState('farmLocation', null); // farmLocation مخصص لإحداثيات الطقس فقط {lat,lon} — تصحيح خلط قديم
            if (state.vibrationEnabled === undefined) setState('vibrationEnabled', true);
            if (state.darkMode === undefined) setState('darkMode', false);
            applyTheme();
            if (!state.conflictRules) setState('conflictRules', []);
            if (!state.diseaseKB) setState('diseaseKB', getDefaultDiseaseKB()); // ⚠️ ترحيل: دليل الأمراض بقى قابل للتعديل الكامل من المستخدم
            if (!state.contactRoles) setState('contactRoles', getDefaultContactRoles()); // ⚠️ ترحيل: أدوار جهات الاتصال بقت قابلة للتعديل
            if (!state.pendingCarryOver) setState('pendingCarryOver', []); // ⚠️ ترحيل: قائمة انتظار مخزون الدورات المؤرشفة حديثًا
            state.batches.forEach(migrateBatch);
            if (!state.activeId && activeBatches().length) setState('activeId', activeBatches()[0].id);
            maybeAutoSnapshot();
            render();
            setTimeout(checkAutoBackup, 2000);
            if (integrityWarning) {
                setTimeout(() => showToast('⚠️ تحذير: بصمة سلامة البيانات لا تطابق المتوقع — راجع بياناتك واعمل نسخة احتياطية فورًا احتياطًا'), 600);
            }
        }

        function migrateBatch(b) {
            if (!b.species) b.species = 'broiler';
            if (!b.purchases) b.purchases = [];
            if (!b.sales) b.sales = [];
            if (!b.customItems) b.customItems = [];
            if (!b.inventory) b.inventory = [];
            if (!b.stockMovements) b.stockMovements = [];
            if (!b.reminders) b.reminders = [];
            b.reminders.forEach(r => { if (r.repeatDays === undefined) r.repeatDays = 0; if (r.category === undefined) r.category = 'other'; });
            if (!b.dismissedAlerts) b.dismissedAlerts = {};
            if (!b.vaccineLog) b.vaccineLog = [];
            if (!b.treatmentLog) b.treatmentLog = [];
            if (!b.feedAdditives) b.feedAdditives = [];
            if (!b.waterAdditives) b.waterAdditives = [];
            if (!b.additiveExecLog) b.additiveExecLog = [];
            if (!b.checklistTemplate) b.checklistTemplate = DEFAULT_CHECKLIST.map((t, i) => ({ id: 'ck' + i, text: t }));
            if (!b.checklistLog) b.checklistLog = [];
            if (!b.biosecurityLog) b.biosecurityLog = [];
            if (!b.houses) b.houses = [];
            if (!b.feedTransitions) b.feedTransitions = [];
            if (!b.loggedConflicts) b.loggedConflicts = [];
            if (!b.auditLog) b.auditLog = [];
            if (!b.aiRecommendationLog) b.aiRecommendationLog = [];
            if (!b.predictionSnapshots) b.predictionSnapshots = [];
            if (b.chickprice === undefined) b.chickprice = 0;
            if (b.targetAge === undefined) b.targetAge = null;
            if (b.targetWeight === undefined) b.targetWeight = null;
            if (!b.heattype) b.heattype = 'gas';
            if (!b.ventType) b.ventType = 'natural';
            if (!b.floorType) b.floorType = 'litter';
            if (!b.cageTiers) b.cageTiers = 1;
            if (b.fanCapacityM3h === undefined) b.fanCapacityM3h = 0;
            if (b.fanCount === undefined) b.fanCount = 0;
            if (b.heatprice === undefined) b.heatprice = 0;
            if (!b.startmonth) b.startmonth = new Date(b.startDate).getMonth() + 1;
            if (!b.status) b.status = 'نشطة';
            if (b.archivedDate === undefined) b.archivedDate = null;
            if (b.location === undefined) b.location = '';
            if (!b.outageLog) b.outageLog = [];
            if (!b.quickInterventions) b.quickInterventions = [];
            if (!b.incidents) b.incidents = [];
            b.records.forEach(r => {
                if (r.humidity === undefined) r.humidity = null;
                if (r.airspeed === undefined) r.airspeed = null;
                if (r.co2 === undefined) r.co2 = null;
                if (r.nh3 === undefined) r.nh3 = null;
                if (r.o2 === undefined) r.o2 = null;
                if (r.health === undefined) r.health = null;
                if (r.light === undefined) r.light = null;
                if (r.dark === undefined) r.dark = null;
                if (r.heatfuel === undefined) r.heatfuel = null;
                if (r.waterPh === undefined) r.waterPh = null;
                if (r.waterSalinity === undefined) r.waterSalinity = null;
                if (r.enteredBy === undefined) r.enteredBy = null;
                if (r.enteredAt === undefined) r.enteredAt = null;
                // ترحيل السجلات القديمة (قراءة واحدة يومية) إلى بنية النهار/الليل: القراءة
                // القديمة تُعتبر قراءة النهار، وتُترك قراءة الليل فارغة لحين إدخالها فعليًا.
                if (r.feedDay === undefined) {
                    r.feedDay = r.feed || 0; r.feedNight = 0;
                    r.waterDay = r.water ?? null; r.waterNight = null;
                    r.tempDay = r.temp ?? null; r.tempNight = null;
                    r.humidityDay = r.humidity ?? null; r.humidityNight = null;
                    r.airspeedDay = r.airspeed ?? null; r.airspeedNight = null;
                    r.co2Day = r.co2 ?? null; r.co2Night = null;
                    r.nh3Day = r.nh3 ?? null; r.nh3Night = null;
                    r.o2Day = r.o2 ?? null; r.o2Night = null;
                    r.analysis = r.analysis || '';
                }
            });
            b.sales.forEach(s => { if (!s.kind) s.kind = 'meat'; });
        }

        function persist() {
            let ok = saveToStorage(JSON.stringify(state));
            if (!ok) {
                // فشل الحفظ (على الأغلب تجاوز سعة التخزين بسبب الصور التوثيقية) — نقلّم الصور القديمة ونعيد المحاولة
                const pruned = pruneOldPhotos(MAX_STORED_PHOTOS);
                ok = saveToStorage(JSON.stringify(state));
                if (ok && pruned) showToast('⚠️ اقتربت سعة التخزين من الحد الأقصى، تم حذف أقدم الصور التوثيقية تلقائيًا لحفظ باقي البيانات');
                else if (!ok) showToast('❌ فشل الحفظ! سعة التخزين ممتلئة — صدّر نسخة احتياطية وامسح بيانات قديمة');
            }
            if (cloudSyncEnabled) pushStateToCloud();
        }

        // ============ نسخ احتياطي محلي متعدد الإصدارات (Local Snapshot History) ============
        // بخلاف exportData (تصدير يدوي لملف خارجي)، هنا بنحتفظ بآخر 5 "لقطات" لحالة البيانات داخل
        // الجهاز نفسه، عشان لو اكتشفت خطأ إدخال أو تلف بيانات بعد فترة تقدر ترجع لنسخة أقدم فورًا
        // بدون ما تكون مصدّر ملف يدوي وقتها. الصور التوثيقية بتتستبعد من اللقطات لتفادي تضخيم سعة
        // التخزين المحلي المحدودة أصلاً (localStorage ~5-10 ميجا).
        const MAX_LOCAL_SNAPSHOTS = 5;
        function stripPhotosForSnapshot(rawState) {
            const clone = JSON.parse(JSON.stringify(rawState));
            clone.localSnapshots = []; // اللقطة لا تحمل نسخة من نفسها
            (clone.batches || []).forEach(b => (b.records || []).forEach(r => { if (getRecordPhotos(r).length) clearRecordPhotos(r); }));
            return clone;
        }
        function createLocalSnapshot(label) {
            try {
                const clone = stripPhotosForSnapshot(state);
                const dataStr = JSON.stringify(clone);
                const snap = { id: uid(), at: new Date().toISOString(), label: label || 'يدوي', sizeKB: Math.round(dataStr.length / 1024), dataStr };
                state.localSnapshots.unshift(snap);
                if (state.localSnapshots.length > MAX_LOCAL_SNAPSHOTS) state.localSnapshots.length = MAX_LOCAL_SNAPSHOTS;
                return true;
            } catch (e) { console.error('فشل إنشاء لقطة محلية', e); return false; }
        }
        function maybeAutoSnapshot() {
            const today = todayStr();
            const lastAuto = state.localSnapshots.find(s => s.label === 'تلقائي يومي');
            if (lastAuto && lastAuto.at.slice(0, 10) === today) return; // أُخذت لقطة اليوم بالفعل
            if (!state.batches || !state.batches.length) return; // مفيش بيانات تستاهل لقطة
            createLocalSnapshot('تلقائي يومي');
        }
        function manualSnapshotNow() {
            const ok = createLocalSnapshot('يدوي');
            if (ok) { persist(); showToast('✅ تم حفظ لقطة محلية من البيانات الحالية'); render(); }
            else showToast('❌ فشل حفظ اللقطة');
        }
        function restoreLocalSnapshot(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix — CRITICAL: الدالة دي بتستبدل كل بيانات التطبيق بالكامل (state = restored)، لازم مالك فقط
            const snap = state.localSnapshots.find(s => s.id === id);
            if (!snap) return;
            showConfirm(`استرجاع نسخة "${snap.label}" بتاريخ ${new Date(snap.at).toLocaleString('ar-EG')}؟\n\n⚠️ هذا سيستبدل كل بياناتك الحالية بمحتوى هذه اللقطة، ماعدا الصور التوثيقية (غير محفوظة فى اللقطات). يُفضّل تصدير نسخة احتياطية للوضع الحالي أولاً قبل المتابعة.`, () => {
                try {
                    const restored = JSON.parse(snap.dataStr);
                    restored.localSnapshots = state.localSnapshots; // نحافظ على سجل اللقطات نفسه بعد الاسترجاع
                    state = restored;
                    state.batches.forEach(migrateBatch);
                    persist();
                    showToast('✅ تم الاسترجاع من اللقطة المحلية');
                    render();
                } catch (e) { showToast('❌ فشل الاسترجاع — اللقطة تالفة'); }
            });
        }
        function deleteLocalSnapshot(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            showConfirm('سيتم حذف هذه النسخة الاحتياطية المحلية نهائيًا ولن تتمكن من الرجوع إليها لاحقًا. متأكد؟', () => {
                setState('localSnapshots', state.localSnapshots.filter(s => s.id !== id));
                persist(); render();
                showToast('تم حذف النسخة الاحتياطية');
            });
        }

        function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 1800); }

        // ===== Confirm modal =====
