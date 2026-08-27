        function AS() { return { ...DEFAULT_APP_SETTINGS, ...(state.appSettings || {}) }; }

        let state = { batches: [], activeId: null, activeTab: 'dashboard', compareIds: [], speciesOverrides: {}, appSettings: {}, protocols: [], lastBackupDate: null, globalAuditLog: [], farmLocation: null, localSnapshots: [],
            contacts: [], sharedSnapshots: [], autoBackupEnabled: false, lastAutoBackupAt: null, farmWeatherForecast: null, farmName: null, vibrationEnabled: true, conflictRules: [] };
        // ============ نقطة تعديل مركزية واحدة (المرحلة 1 من خطة الهندسة) ============
        // بدل التعديل المباشر المتفرّق لخصائص state الجذرية (state.activeTab = ...، state.farmName = ...، إلخ)
        // من أماكن كتير فى الكود، أي تعديل جديد يعدّي من هنا. نفس السلوك بالظبط (state[key] = value)،
        // الفرق إننا بقى عندنا نقطة واحدة نقدر نتتبع منها كل تعديل (سجل تشخيصي مؤقت بس، مش بيتحفظ)،
        // ونقدر نضيف تحقق/تسجيل مستقبلي هنا فى مكان واحد بدل ما نلحق كل الأماكن المتفرقة.
        let _stateChangeLog = [];
        function setState(key, value) {
            state[key] = value;
            _stateChangeLog.push({ key, at: Date.now() });
            if (_stateChangeLog.length > 50) _stateChangeLog.shift();
            return value;
        }
        let pendingConfirmAction = null;
        let pendingConfirmCancelAction = null;
        let _whatIfModel = null; // ============ يخزّن آخر نموذج انحدار "أهم عوامل الربح" المحسوب فى تبويب المقارنة، ليستخدمه محاكي "ماذا لو" بدون إعادة حساب ============
        const STORAGE_KEY = 'poultry_state_v3';

        // ============ Firebase Cloud Sync (مزامنة سحابية بين المالك والعمال — كل الأجهزة المرتبطة بنفس رمز المزرعة تتبادل نفس نسخة "state" لحظيًا) ============
        const firebaseConfig = {
            apiKey: "AIzaSyAvQkPnrzxuMJbqDiXxhHctxjhiM-LFG0M",
            authDomain: "katkot-pro.firebaseapp.com",
            projectId: "katkot-pro",
            storageBucket: "katkot-pro.firebasestorage.app",
            messagingSenderId: "364078349089",
            appId: "1:364078349089:web:e1d2222a22251f859b9c60"
        };
        const FARM_ID_KEY = 'poultry_farm_id';
        const DEVICE_ID_KEY = 'poultry_device_id';
        let fbDb = null;
        let cloudSyncEnabled = false;
        let cloudConnected = false;
        let cloudUnsub = null;
        let farmId = null;
        let _cloudPushTimer = null;
        let _lastPushedRev = 0;
        let _applyingRemoteUpdate = false; // بيتفعّل مؤقتًا وإحنا بنطبّق تحديث جاي من جهاز تاني، عشان منعيدش نبعته تاني كصدى ونعمل حلقة لا نهائية

        function getDeviceId() {
            let id = null;
            try { id = localStorage.getItem(DEVICE_ID_KEY); } catch (e) {}
            if (!id) { id = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (e) {} }
            return id;
        }

        function initFirebaseCloud() {
            try {
                if (!window.firebase) { onFirebaseAuthUnavailable(); return false; }
                if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
                fbDb = firebase.firestore();
                firebase.auth().onAuthStateChanged(user => { if (user) onFirebaseAuthReady(); });
                firebase.auth().signInAnonymously().catch(e => { console.error('فشل تسجيل دخول فايربيز', e); window._fbAuthErr = (e && (e.code || e.message)) || String(e); onFirebaseAuthUnavailable(); });
                try { farmId = localStorage.getItem(FARM_ID_KEY); } catch (e) {}
                if (farmId) { addFarmToList(farmId); startCloudSync(); }
                return true;
            } catch (e) { console.error('فشل تهيئة فايربيز', e); onFirebaseAuthUnavailable(); return false; }
        }
        // ============ بوابة إذن الاستخدام تنتظر جاهزية فايربيز (نجاح أو فشل) قبل ما تقرر تعرض إيه — عشان أي كتابة/قراءة لازم auth.uid ============
        function onFirebaseAuthReady() {
            if (_authFlowHandled) return;
            _authFlowHandled = true;
            beginActivationFlow();
        }
        function onFirebaseAuthUnavailable() {
            if (_authFlowHandled) return;
            _authFlowHandled = true;
            beginActivationFlow(); // هيشتغل بالمسار اليدوي بس (مفيش نت/فايربيز)
        }

        function startCloudSync() {
            if (!farmId || !fbDb) return;
            cloudSyncEnabled = true;
            if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; }
            cloudUnsub = fbDb.collection('farms').doc(farmId).onSnapshot(doc => {
                cloudConnected = true;
                if (!doc.exists) return;
                const remote = doc.data();
                if (!remote || !remote.stateJson) return;
                if (remote.lastWriter === getDeviceId() && remote.rev === _lastPushedRev) return; // صدى تحديثنا إحنا، متطبقوش تاني
                try {
                    _applyingRemoteUpdate = true;
                    state = JSON.parse(remote.stateJson);
                    saveToStorage(JSON.stringify(state));
                    render();
                    showToast('🔄 تم استلام تحديث من جهاز آخر');
                } catch (e) { console.error('فشل تطبيق التحديث السحابي', e); }
                finally { _applyingRemoteUpdate = false; }
            }, err => { cloudConnected = false; console.error('خطأ اتصال فايرستور', err); });
        }

        function stopCloudSync() {
            if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; }
            cloudSyncEnabled = false;
            cloudConnected = false;
        }

        // ============ (جديد) Firebase Cloud Messaging — تسجيل الجهاز لاستقبال تنبيهات فورية تصل حتى لو التطبيق مقفول تمامًا ============
        // ⚠️ لازم تستبدل القيمة دي بمفتاح الـ VAPID الحقيقي بتاعك: Firebase Console → ⚙️ إعدادات المشروع
        // → Cloud Messaging → قسم "شهادات Web Push" → توليد زوج مفاتيح جديد → انسخ الـ Key pair هنا.
        const FCM_VAPID_KEY = 'PASTE_YOUR_VAPID_KEY_HERE';

        function notificationStatusInfo() {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) return { label: 'غير مدعوم على هذا المتصفح/الجهاز', ok: false, canRequest: false };
            const perm = Notification.permission;
            if (FCM_VAPID_KEY === 'PASTE_YOUR_VAPID_KEY_HERE') return { label: '⚠️ لسه محتاج ضبط VAPID key فى الكود', ok: false, canRequest: false };
            if (perm === 'granted') return { label: '✅ مفعّلة على هذا الجهاز', ok: true, canRequest: false };
            if (perm === 'denied') return { label: '🚫 مرفوضة — فعّلها يدويًا من إعدادات الموقع/التطبيق فى المتصفح', ok: false, canRequest: false };
            return { label: '⚪ غير مفعّلة بعد', ok: false, canRequest: true };
        }

        async function requestNotificationPermission() {
            const status = notificationStatusInfo();
            if (Notification && Notification.permission === 'granted' && FCM_VAPID_KEY === 'PASTE_YOUR_VAPID_KEY_HERE') {
                // الإذن مفعّل أصلاً بس مفيش VAPID key لسه — على الأقل نفعّل السلوك المحلي القديم (يشتغل والتطبيق مفتوح)
                registerKatkotServiceWorker(); checkAndNotifyToday(true); return;
            }
            if (!status.canRequest) { showToast(status.label); return; }
            if (!farmId || !fbDb) { showToast('⚠️ لازم تنضم لمزرعة سحابية (رمز المزرعة) الأول قبل تفعيل التنبيهات'); return; }
            try {
                registerKatkotServiceWorker();
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') { showToast('🚫 رفضت إذن التنبيهات — ممكن تفعّله لاحقًا من إعدادات المتصفح/الجهاز'); render(); return; }
                const reg = katkotSwRegistration || await navigator.serviceWorker.ready;
                if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
                const messaging = firebase.messaging();
                const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
                if (!token) { showToast('❌ فشل الحصول على رمز الجهاز — جرب تاني'); return; }
                const doc = await fbDb.collection('farms').doc(farmId).get();
                const existing = (doc.exists && doc.data().fcmTokens) || [];
                const tokens = existing.includes(token) ? existing : [...existing, token];
                await fbDb.collection('farms').doc(farmId).set({ fcmTokens: tokens, notifyEnabled: true }, { merge: true });
                showToast('✅ اتفعّلت التنبيهات الفورية على هذا الجهاز — هتوصلك حتى لو التطبيق مقفول');
                checkAndNotifyToday(true);
                render();
            } catch (e) {
                console.error('فشل تفعيل التنبيهات الفورية', e);
                showToast('❌ حصل خطأ أثناء التفعيل — تأكد إنك متصل بالإنترنت وجرب تاني');
            }
        }

        // ============ 🔒 تحصين (Red Team fix — Firestore Document Size Guard) ============
        // المشكلة: كنا برفع state كله كـ JSON string واحد فى حقل stateJson بمستند واحد.
        // Firestore بيرفض أي مستند أكبر من 1 ميجابايت (1,048,576 بايت) ويفشل الرفع بالكامل.
        // الكود القديم كان بيلقط الفشل بصمت (console.error فقط) — يعني بعد سنين من الدورات
        // المؤرشفة، المزامنة السحابية ممكن توقف من غير أي تنبيه واضح للمالك، وهو مايكتشفش إلا
        // لما يفتح جهاز تاني ويلاقي بيانات قديمة. الحل: نتحقق من الحجم *قبل* الرفع، ونحذّر
        // المالك مبكرًا (عند 80% من الحد) بدل ما نفاجأ بفشل صامت عند 100%.
        const FIRESTORE_DOC_MAX_BYTES = 1048576; // حد Firestore الفعلي لحجم المستند الواحد
        const FIRESTORE_DOC_WARN_RATIO = 0.8; // نحذّر عند الوصول لـ 80% من الحد
        let _lastSizeWarnAt = 0; // نمنع تكرار نفس التحذير كل ثانيتين لو المستخدم بيكتب بسرعة
        function estimateStateJsonBytes(jsonStr) {
            // نستخدم TextEncoder لحساب البايتات الفعلية (UTF-8) مش طول النص فقط — العربي بيتحسب
            // بأكتر من بايت للحرف، وده فرق حقيقي فى تطبيق كل نصوصه عربي.
            try { return new TextEncoder().encode(jsonStr).length; } catch (e) { return jsonStr.length * 3; } // تقدير احتياطي متحفّظ لو TextEncoder غير متاح
        }
        let _cloudSyncing = false; // ============ (جديد) حالة "بيتم الحفظ" مرئية وقت الرفع الفعلي للسحاب — قبل كده كان المستخدم شايف "🟢 متصل" بس من غير ما يعرف لو آخر تعديل له فعلاً اتحفظ أو لسه فى الطريق ============
        function pushStateToCloud(immediate) {
            if (_applyingRemoteUpdate || !cloudSyncEnabled || !farmId || !fbDb) return Promise.resolve();
            clearTimeout(_cloudPushTimer);
            // ⚠️ إصلاح: كانت الدالة دي "fire-and-forget" — الكود اللي بينادّيها بـ immediate:true (زي
            // تبديل/إنشاء/الانضمام لمزرعة) كان بيكمّل على طول ويستبدل الـ state المحلي بمزرعة تانية،
            // من غير ما يستنى تأكيد إن آخر تعديلات المزرعة القديمة فعلاً وصلت السحاب. لو النت بطيء/
            // اتقطع لحظتها، التعديلات دي كانت بتضيع نهائيًا بصمت. دلوقتي بترجّع Promise حقيقي يقدر
            // الكود اللي بينادّيها يستناه فعلاً قبل ما يكمل.
            const doPush = () => {
                const jsonStr = JSON.stringify(state);
                const bytes = estimateStateJsonBytes(jsonStr);
                // ============ فحص الحجم قبل الرفع ============
                if (bytes >= FIRESTORE_DOC_MAX_BYTES) {
                    // تجاوزنا الحد فعليًا — الرفع هيفشل من Firestore نفسه، فنمنعه من الأساس
                    // ونوضّح للمالك المشكلة بدل رسالة خطأ تقنية غامضة.
                    cloudConnected = false;
                    showToast('❌ حجم بيانات المزرعة تجاوز الحد المسموح للمزامنة السحابية (1 ميجابايت) — المزامنة متوقفة! تواصل مع الدعم الفني لترتيب أرشفة/تقسيم البيانات القديمة.');
                    console.error(`فشل الرفع: حجم المستند ${bytes} بايت يتجاوز حد Firestore (${FIRESTORE_DOC_MAX_BYTES})`);
                    return Promise.reject(new Error('document-too-large'));
                }
                if (bytes >= FIRESTORE_DOC_MAX_BYTES * FIRESTORE_DOC_WARN_RATIO && Date.now() - _lastSizeWarnAt > 120000) {
                    _lastSizeWarnAt = Date.now();
                    const pct = Math.round((bytes / FIRESTORE_DOC_MAX_BYTES) * 100);
                    showToast(`⚠️ بيانات المزرعة وصلت ${pct}% من حد المزامنة السحابية — فكّر فى أرشفة الدورات القديمة جدًا أو تصدير نسخة والاحتفاظ بيها محليًا`);
                }
                _lastPushedRev = Date.now();
                _cloudSyncing = true; updateConnStatus();
                return fbDb.collection('farms').doc(farmId).set({
                    stateJson: jsonStr,
                    lastWriter: getDeviceId(),
                    rev: _lastPushedRev,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true })
                    .then(() => { cloudConnected = true; })
                    .catch(e => { cloudConnected = false; console.error('فشل رفع البيانات للسحاب', e); throw e; })
                    .finally(() => { _cloudSyncing = false; updateConnStatus(); });
            };
            if (immediate) return doPush();
            return new Promise((resolve) => { _cloudPushTimer = setTimeout(() => { doPush().catch(() => {}).finally(resolve); }, 1200); }); // تجميع التعديلات المتتالية فى رفعة واحدة بدل ما نرفع مع كل حرف يتكتب
        }


        function copyFarmCode() {
            if (!farmId) return;
            if (navigator.clipboard) navigator.clipboard.writeText(farmId).then(() => showToast('📋 تم نسخ الرمز')).catch(() => showToast(farmId));
            else showToast(farmId);
        }

        // ============ تعدد المزارع على نفس الجهاز (المالك يتابع أكتر من مزرعة منفصلة، كل واحدة برمزها الخاص) ============
        const FARMS_LIST_KEY = 'poultry_farms_list';
        function getFarmsList() {
            try { return JSON.parse(localStorage.getItem(FARMS_LIST_KEY) || '[]'); } catch (e) { return []; }
        }
        function saveFarmsList(list) {
            try { localStorage.setItem(FARMS_LIST_KEY, JSON.stringify(list)); } catch (e) {}
        }
        function addFarmToList(id, name) {
            const list = getFarmsList();
            const existing = list.find(f => f.id === id);
            if (existing) { if (name) existing.name = name; }
            else list.push({ id, name: name || id });
            saveFarmsList(list);
        }
        function getBlankFarmState() {
            return { batches: [], activeId: null, activeTab: 'dashboard', compareIds: [], speciesOverrides: {}, appSettings: {}, protocols: [], lastBackupDate: null, globalAuditLog: [], farmLocation: null, localSnapshots: [],
                contacts: [], sharedSnapshots: [], autoBackupEnabled: false, lastAutoBackupAt: null, farmWeatherForecast: null, farmName: null, vibrationEnabled: true, conflictRules: [] };
        }
        // ⚠️ إصلاح: هيلبر موحّد يُستخدم قبل أي عملية بتستبدل الـstate المحلي بمزرعة تانية (تبديل/إنشاء/
        // انضمام). بيستنى تأكيد حقيقي إن آخر تعديلات المزرعة الحالية وصلت السحاب قبل ما يكمل، ولو
        // فشل الاتصال، بيدّي المستخدم خيار صريح "كمّل على مسؤوليتك" أو "إلغاء" بدل ما يضيع بياناته بصمت.
        function flushBeforeFarmSwitch(onReady) {
            if (!cloudSyncEnabled) { onReady(); return; }
            pushStateToCloud(true).then(onReady).catch(() => {
                showConfirm(
                    '⚠️ تعذّر تأكيد حفظ آخر تعديلاتك على المزرعة الحالية على السحاب (مشكلة فى الاتصال). لو كملت دلوقتي، آخر تعديلاتك غير المحفوظة ممكن تضيع.\n\nتحب تكمل على مسؤوليتك، ولا تلغي وتحاول تاني لما الاتصال يتحسّن؟',
                    onReady, '⚠️ فشل تأكيد الحفظ على السحاب', () => showToast('تم الإلغاء — حاول تاني لما الاتصال يتحسّن')
                );
            });
        }
        function switchToFarm(id) {
            if (id === farmId) return;
            if (!fbDb) { showToast('⚠️ تعذّر الاتصال بالسحابة، تأكد من الإنترنت'); return; }
            showConfirm('سيتم حفظ التعديلات الحالية على هذا الجهاز أولًا، ثم عرض بيانات المزرعة المختارة بدلًا منها. متابعة؟', () => {
                flushBeforeFarmSwitch(() => {
                stopCloudSync();
                fbDb.collection('farms').doc(id).get().then(doc => {
                    if (!doc.exists) { showToast('❌ تعذّر تحميل بيانات هذه المزرعة'); return; }
                    try {
                        const remote = doc.data();
                        _applyingRemoteUpdate = true;
                        state = (remote && remote.stateJson) ? JSON.parse(remote.stateJson) : getBlankFarmState();
                        saveToStorage(JSON.stringify(state));
                        _applyingRemoteUpdate = false;
                        farmId = id;
                        try { localStorage.setItem(FARM_ID_KEY, id); } catch (e) {}
                        addFarmToList(id, state.farmName);
                        startCloudSync();
                        showToast('✅ تم التبديل للمزرعة');
                        render();
                    } catch (e) { showToast('❌ فشل تحميل بيانات المزرعة'); console.error(e); }
                }).catch(e => { console.error(e); showToast('❌ فشل الاتصال بالسحابة'); });
                });
            }, 'تبديل المزرعة');
        }
        function removeFarmFromListUI(id) {
            showConfirm('هل تريد إزالة هذه المزرعة من قائمة هذا الجهاز؟ بياناتها تبقى محفوظة بالكامل على السحابة ولأي جهاز تاني مرتبط بيها، وتقدر تنضم ليها تاني فى أي وقت بنفس الرمز.', () => {
                removeFarmFromList(id);
                if (id === farmId) { stopCloudSync(); farmId = null; try { localStorage.removeItem(FARM_ID_KEY); } catch (e) {} }
                render();
            }, 'إزالة مزرعة من القائمة');
        }
        function removeFarmFromList(id) { saveFarmsList(getFarmsList().filter(f => f.id !== id)); }

        function createNewFarm() {
            showConfirm('سيتم إنشاء مزرعة سحابية جديدة فارغة بالكامل (بدون دفعات أو سجلات) وربط هذا الجهاز بيها كجهاز أساسي. بيانات المزرعة اللي واقف فيها دلوقتي (لو موجودة) هتفضل محفوظة بالكامل على السحابة وتقدر ترجعلها فى أي وقت من قايمة المزارع. متابعة؟', () => {
                flushBeforeFarmSwitch(() => { // حفظ آخر تعديلات المزرعة الحالية قبل ما نسيبها (وننتظر تأكيد نجاحه فعليًا)
                stopCloudSync();
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                let id = '';
                for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
                _applyingRemoteUpdate = true;
                state = getBlankFarmState();
                saveToStorage(JSON.stringify(state));
                _applyingRemoteUpdate = false;
                farmId = id;
                try { localStorage.setItem(FARM_ID_KEY, id); } catch (e) {}
                addFarmToList(id, 'مزرعة جديدة');
                startCloudSync();
                pushStateToCloud(true);
                // ============ 🔒 تحصين أمني: تسجيل صاحب المزرعة كأول uid مُصرّح له ============
                // Firestore Rules الجديدة بترفض أي قراءة/كتابة على مستند المزرعة إلا لو الـ uid
                // موجود جوه authorizedUids. المزرعة لسه جديدة (مفيش حد وافق عليه)، فلازم أول جهاز
                // ينشئها يضيف نفسه تلقائيًا هنا — وبعد كده أي جهاز/عامل تاني بيتضاف بس لما المالك
                // يوافق عليه فعليًا من شاشة "طلبات الدخول" (شوف decideAccessRequest بالأسفل).
                const ownerUid = getFbUid();
                if (ownerUid) {
                    fbDb.collection('farms').doc(id).set({
                        authorizedUids: firebase.firestore.FieldValue.arrayUnion(ownerUid)
                    }, { merge: true }).catch(e => console.error('فشل تسجيل صاحب المزرعة فى قائمة الصلاحيات', e));
                }
                showToast('✅ تم إنشاء المزرعة السحابية — شارك الرمز مع العمال');
                render();
                });
            }, 'إنشاء مزرعة سحابية جديدة');
        }

        function joinExistingFarm() {
            // ⚠️ ملحوظة بعد تفعيل firestore.rules: مجرد معرفة الكود بقى مش كافي — الـ uid بتاع
            // الجهاز لازم يكون فعلاً جوه authorizedUids الأول (يعني المالك وافق عليه قبل كده من
            // شاشة "طلبات الدخول"). لو حد كتب كود صحيح لمزرعة مش مصرّح له بيها، الطلب هنا هيرجع
            // permission-denied من فايرستور، وده هو المفروض يحصل (بدل ما ينضم مباشرة زي الأول).
            showPasswordPrompt('🔗 الانضمام لمزرعة موجودة', 'أدخل رمز المزرعة (6 خانات) اللي هيديهولك مالك المزرعة:', (code) => {
                code = (code || '').trim().toUpperCase();
                if (!code) return;
                if (!fbDb) { showToast('⚠️ تعذّر الاتصال بالسحابة، تأكد من الإنترنت'); return; }
                fbDb.collection('farms').doc(code).get().then(doc => {
                    if (!doc.exists) { showToast('❌ الرمز غير صحيح أو المزرعة غير موجودة'); return; }
                    showConfirm('سيتم استبدال البيانات المعروضة حاليًا على هذا الجهاز ببيانات المزرعة المرتبطة بهذا الرمز (بيانات المزرعة الحالية، لو موجودة، تبقى محفوظة بالكامل على السحابة). متابعة؟', () => {
                        flushBeforeFarmSwitch(() => {
                        try {
                            stopCloudSync();
                            const remote = doc.data();
                            _applyingRemoteUpdate = true;
                            state = (remote && remote.stateJson) ? JSON.parse(remote.stateJson) : getBlankFarmState();
                            saveToStorage(JSON.stringify(state));
                            _applyingRemoteUpdate = false;
                            farmId = code;
                            try { localStorage.setItem(FARM_ID_KEY, code); } catch (e) {}
                            addFarmToList(code, state.farmName);
                            startCloudSync();
                            showToast('✅ تم الانضمام للمزرعة بنجاح');
                            render();
                        } catch (e) { showToast('❌ فشل تطبيق بيانات المزرعة'); console.error(e); }
                        });
                    }, 'استبدال البيانات المعروضة');
                }).catch(e => { console.error(e); showToast('❌ فشل الاتصال بالسحابة'); });
            });
        }

        function disconnectFromFarm() {
            showConfirm('سيتوقف هذا الجهاز عن مزامنة بياناته مع باقي الأجهزة، وستبقى بياناته المحلية كما هي. المزرعة تفضل فى قايمة مزارعك وتقدر ترجعلها فى أي وقت.', () => {
                stopCloudSync();
                farmId = null;
                try { localStorage.removeItem(FARM_ID_KEY); } catch (e) {}
                showToast('🔌 تم فصل المزامنة السحابية');
                render();
            }, 'فصل المزامنة السحابية');
        }

        // ============ Auth / Roles ============
        // مالك = صلاحية كاملة. عامل = حساب مستقل مرتبط بدفعة واحدة، صلاحياته: السجل اليومي + تنفيذ (لا إعداد) العمليات والتنبيهات لدفعته فقط.
        const AUTH_KEY = 'poultry_auth_v1';
        let currentRole = null;      // 'owner' | 'worker'
        let currentWorker = null;    // { id, name, username, passHash, batchId } عند تسجيل عامل
        let pickedRole = 'owner';
        let editingWorkerId = null;

        // ============ نظام إذن الاستخدام — محدش يستخدم التطبيق على أي جهاز جديد غير لما صاحب التطبيق يوافق فعليًا (طلب حقيقي عبر السحابة) ============
        // ⚠️ غيّر القيمتين دول لحاجة سرية تانية بس انت اللي تعرفها قبل ما توزّع التطبيق على حد (بيستخدموا فى المسار اليدوي الاحتياطي بس، لو مفيش إنترنت):
        const ACTIVATION_SECRET_SALT = 'R5EIPK-C8B4Y5-XFA36O-GNI4MX'; // 🔒 غُيّرت قبل الرفع على GitHub (27 أغسطس 2026) — احتفظ بالقيمة دي فى مكان آمن عندك، ولو ضاعت اعمل قيمة جديدة وغيّرها هنا فقط
        const MASTER_OVERRIDE_CODE = 'DO8AR6-LGZC07-9OH4ZC-XADGCJ'; // 🔒 كودك الرئيسي الجديد — استخدمه بس لو محتاج تفعّل جهاز فورًا كـ"جهاز مصدر" (أدمن)، واحتفظ بيه سري تمامًا
        const DEVICE_CODE_KEY = 'katkot_device_code_v1';
        const ACTIVATION_KEY = 'katkot_activated_v1';
        const SOURCE_DEVICE_KEY = 'katkot_source_device_v1';
        const ACCESS_COLLECTION = 'deviceAccess';
        const DEVICE_GRANT_KEY = 'katkot_device_grant_v1'; // صلاحيات الجهاز المُمنوحة وقت الموافقة (نظام موحّد: الموافقة = تسجيل دخول تلقائي بنفس الصلاحيات، بدون خطوة عامل منفصلة)
        let accessUnsub = null;
        let accessAdminUnsub = null;
        let accessRequestsCache = [];
        let _authFlowHandled = false;

