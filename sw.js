var CACHE_NAME = 'katkot-shell-v1';
self.addEventListener('install', function(e){
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(function(cache){
        return cache.add(self.registration.scope).catch(function(){});
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
// أي طلبات تانية (Firebase، Open-Meteo، الخطوط...) بتعدي للشبكة عادي من غير تدخل،
// لأنها بيانات حية مفيش فايدة من تخزينها.
self.addEventListener('fetch', function(event){
    var isAppShell = event.request.mode === 'navigate' ||
        (event.request.method === 'GET' && event.request.url === self.registration.scope);
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
