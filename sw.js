var CACHE_NAME = 'katkot-shell-v3'; // ⚠️ لازم يتزامن يدويًا مع sw.js — الاتنين نسخة واحدة من نفس الكود، ده بس خط دفاع تاني لو الملف الحقيقي فشل يتحمّل (404/مشكلة نشر)
// ============ 🔒 (إصلاح) هنا كانت النسخة القديمة (v1) اللي ملهاش تخزين لسكريبتات Firebase —
// لو ./sw.js الحقيقي فشل يتسجّل لأي سبب (404، مشكلة نشر على GitHub Pages)، التطبيق كان بيرجع
// بصمت للنسخة القديمة دي وبيفقد كل فايدة تخزين Firebase من غير ما حد يلاحظ. دلوقتي الاتنين
// نفس الكود بالظبط (نسخة من sw.js بتاريخ آخر تحديث)، فمفيش فرق فعلي فى السلوك أي النسختين اشتغلت.
var FIREBASE_URLS = [
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

// ============ (جديد) Firebase Cloud Messaging — استقبال إشعارات فورية حتى لو التطبيق مقفول تمامًا ============
// نفس الـ service worker المسؤول عن التخزين المؤقت هو اللي بيستقبل رسائل الـ push، عشان
// المتصفح ميدّيش أكتر من SW فعّال بيستحوذ على نفس الـ scope فى نفس الوقت.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
try {
    firebase.initializeApp({
        apiKey: "AIzaSyAvQkPnrzxuMJbqDiXxhHctxjhiM-LFG0M",
        authDomain: "katkot-pro.firebaseapp.com",
        projectId: "katkot-pro",
        storageBucket: "katkot-pro.firebasestorage.app",
        messagingSenderId: "364078349089",
        appId: "1:364078349089:web:e1d2222a22251f859b9c60"
    });
    var messaging = firebase.messaging();
    messaging.onBackgroundMessage(function (payload) {
        var title = (payload.notification && payload.notification.title) || '🐣 كتكوت برو';
        var body = (payload.notification && payload.notification.body) || '';
        self.registration.showNotification(title, {
            body: body, dir: 'rtl', lang: 'ar',
            icon: './icon-192x192-any.png', badge: './icon-192x192-any.png',
            data: payload.data || {}
        });
    });
} catch (e) { /* لو فشلت تهيئة Firebase جوه الـ SW (مثلاً فى وضع أوفلاين وقت أول تسجيل) نتجاهل بهدوء — باقي وظائف الـ SW (التخزين المؤقت) لازم تفضل شغالة عادي */ }
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
        if (clients.openWindow) return clients.openWindow('./');
    }));
});

self.addEventListener('install', function(e){
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(function(cache){
        return Promise.all([
            cache.add(self.registration.scope).catch(function(){}),
            ...FIREBASE_URLS.map(function(url){
                return cache.add(url).catch(function(){});
            })
        ]);
    }));
});
self.addEventListener('activate', function(e){
    e.waitUntil(Promise.all([
        self.clients.claim(),
        caches.keys().then(function(keys){
            return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
        })
    ]));
});
// بيخزّن نسخة من صفحة التطبيق نفسها (شل التطبيق) عشان تفتح حتى من غير إنترنت — نتيجة الشبكة
// (Network-first) عشان لو أونلاين ياخد آخر نسخة محفوظة دايمًا، ولو أوفلاين يرجع لآخر نسخة متخزّنة.
// سكريبتات Firebase: Cache-first (كود ثابت مربوط بإصدار محدد). أي طلبات تانية (Open-Meteo،
// الخطوط...) بتعدي للشبكة عادي من غير تدخل، لأنها بيانات حية مفيش فايدة من تخزينها.
self.addEventListener('fetch', function(event){
    var isAppShell = event.request.mode === 'navigate' ||
        (event.request.method === 'GET' && event.request.url === self.registration.scope);
    var isFirebaseSdk = event.request.method === 'GET' && FIREBASE_URLS.indexOf(event.request.url) !== -1;
    if (isFirebaseSdk) {
        event.respondWith(
            caches.match(event.request).then(function(cached){
                if (cached) return cached;
                return fetch(event.request).then(function(resp){
                    var clone = resp.clone();
                    caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, clone); });
                    return resp;
                });
            })
        );
        return;
    }
    if (!isAppShell) return;
    event.respondWith(
        fetch(event.request).then(function(resp){
            var clone = resp.clone();
            caches.open(CACHE_NAME).then(function(cache){ cache.put(self.registration.scope, clone); });
            return resp;
        }).catch(function(){
            return caches.match(self.registration.scope).then(function(cached){ return cached || Response.error(); });
        })
    );
});
self.addEventListener('notificationclick', function(event){
    event.notification.close();
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
        for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
        if (self.clients.openWindow) return self.clients.openWindow('./');
    }));
});
// فحص دوري فى الخلفية (أفضل جهد فقط — مدعوم على أندرويد/كروم للتطبيقات المُثبَّتة كـPWA بس،
// والتوقيت مش مضمون بدقة، المتصفح هو اللي بيقرر حسب استخدامك). بما إن الـService Worker مالوش
// وصول لبيانات التطبيق (localStorage)، أقصى حاجة يقدر يعملها تذكير عام يفتح بيه التطبيق.
self.addEventListener('periodicsync', function(event){
    if (event.tag === 'katkot-daily-check') {
        event.waitUntil(self.registration.showNotification('كتكوت Pro 🐔', {
            body: 'افتح التطبيق لمراجعة تنبيهات وأولويات دفعتك اليوم',
            tag: 'katkot-nudge', renotify: true, vibrate: [200,100,200]
        }));
    }
});