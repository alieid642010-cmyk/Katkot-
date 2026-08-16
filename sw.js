var CACHE_NAME = 'katkot-shell-v2'; // ⚠️ رفعنا رقم النسخة عشان نفعّل الكاش الجديد لسكريبتات Firebase على كل الأجهزة تلقائيًا

// ============ 🔒 تحسين (Red Team fix — Firebase SDK Offline Availability) ============
// المشكلة: سكريبتات Firebase (auth/firestore) كانت بتتحمّل من CDN جوجل مباشرة، وكانت
// بتتعدّى بالكامل من غير أي كاش (زي أي "بيانات حية" — الطقس مثلاً). لكن السكريبتات دي
// مش بيانات حية، هي كود ثابت مربوط بإصدار مُحدَّد فى الرابط نفسه (10.12.2) — نفس المحتوى
// كل مرة. لو المستخدم فتح التطبيق أول مرة وهو أونلاين، تخزينهم فى الكاش بيضمن إن التطبيق
// يقدر يشتغل بمحاولة اتصال بفايربيز حتى لو النت اتقطع بعد كده (بدل ما ينتظر فشل الشبكة
// كل مرة قبل ما يرجع للمسار المحلي فقط). لو الإصدار اتغيّر مستقبلًا، لازم الرابط يتغيّر
// هنا كمان (ورقم CACHE_NAME يترفع) عشان الكاش القديم يتمسح وينزل الإصدار الجديد.
var FIREBASE_URLS = [
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

self.addEventListener('install', function(e){
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(function(cache){
        return Promise.all([
            cache.add(self.registration.scope).catch(function(){}),
            // كل رابط بيتكاش لوحده بمحاولة منفصلة — لو واحد فشل (مثلاً أول تحميل وهو أوفلاين
            // أصلًا) الباقي يكمل عادي بدل ما فشل واحد يوقف كل عملية التثبيت.
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
// سكريبتات Firebase المُثبَّتة بالأعلى: Cache-first (الكود ثابت مربوط بإصدار محدد، مفيش داعي
// نراجع الشبكة كل مرة). أي طلبات تانية (Open-Meteo، الخطوط...) بتعدي للشبكة عادي من غير تدخل،
// لأنها بيانات حية مفيش فايدة من تخزينها.
self.addEventListener('fetch', function(event){
    var isAppShell = event.request.mode === 'navigate' ||
        (event.request.method === 'GET' && event.request.url === self.registration.scope);

    var isFirebaseSdk = event.request.method === 'GET' && FIREBASE_URLS.indexOf(event.request.url) !== -1;

    if (isFirebaseSdk) {
        event.respondWith(
            caches.match(event.request).then(function(cached){
                if (cached) return cached; // Cache-first: عندنا نسخة محلية ثابتة، مفيش داعي للشبكة
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
