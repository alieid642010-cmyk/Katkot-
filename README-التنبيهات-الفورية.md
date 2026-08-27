# 🔔 تفعيل التنبيهات الفورية (Push) — دليل النشر

## الخطوات بالترتيب

### 1) ترقية الحساب لخطة Blaze
Firebase Console → ⚙️ Usage and billing → Modify plan → Blaze (Pay as you go).
هتحتاج تربط بطاقة، لكن التكلفة الفعلية لمزرعة واحدة أو عدد قليل قريبة من صفر
(Cloud Scheduler + Cloud Functions لهما حصة مجانية شهرية كبيرة).

### 2) تفعيل الخدمات المطلوبة (أول مرة بس)
لما تعمل `firebase deploy --only functions` هيقترح عليك يفعّلها تلقائيًا، وافق:
- Cloud Functions API
- Cloud Scheduler API
- Cloud Pub/Sub API
- Cloud Build API

### 3) توليد مفتاح VAPID
Firebase Console → ⚙️ Project settings → Cloud Messaging → قسم **Web configuration**
→ **Web Push certificates** → Generate key pair.
انسخ الـ Key pair (سلسلة طويلة تبدأ بحروف/أرقام).

### 4) الصق المفتاح فى الكود
افتح `app-logic/01-state-storage.js`، دوّر على السطر:
```js
const FCM_VAPID_KEY = 'PASTE_YOUR_VAPID_KEY_HERE';
```
واستبدل القيمة بالمفتاح اللي نسخته، وابني المشروع تاني (`node build.js`).

### 5) تحديث Firestore Security Rules
لازم تسمح للعميل يكتب حقلين جدد على مستند المزرعة: `fcmTokens` و`notifyEnabled`.
دوّر فى ملف `firestore.rules` بتاعك على السطر اللي فيه `hasOnly([...])` (allow-list الحقول
المسموح تعديلها)، وضيف الحقلين الجديدين للقايمة، مثال:
```
allow update: if request.auth != null
  && request.resource.data.diff(resource.data).changedKeys()
     .hasOnly(['stateJson', 'lastWriter', 'rev', 'updatedAt', 'fcmTokens', 'notifyEnabled']);
```
(عدّل حسب الأسماء الفعلية فى ملفك — ده مجرد مثال توضيحي).

### 6) نشر الـ Cloud Function
من جذر مشروع Firebase بتاعك (نفس المكان اللي فيه `firebase.json`):
```bash
# لو أول مرة تستخدم functions فى المشروع ده:
firebase init functions   # اختار "Use an existing project" → katkot-pro، واختار JavaScript

# انسخ محتوى مجلد functions/ (index.js + package.json) اللي بعتهملك فوق مكان المجلد
# اللي firebase init عملهولك (أو ادمج المحتوى لو فيه ملفات موجودة بالفعل)

cd functions
npm install
cd ..
firebase deploy --only functions
```

### 7) التجربة
افتح التطبيق → الإعدادات → "📱 التطبيق والإشعارات" → اضغط
"🔔 تفعيل الإشعارات الفورية". لازم تشوف رسالة "✅ اتفعّلت التنبيهات الفورية".
بعدها جرّب تضيف تحصين بوقت تنفيذ قريب (كمان 10 دقايق مثلاً) ونبّهني "فى نفس الميعاد بالظبط"،
واستنى — المفروض يوصلك إشعار فى الموبايل حتى لو قفلت التطبيق تمامًا.

## حدود التصميم (مهم تعرفها)
- الفحص بيشتغل كل 5 دقايق بالظبط (مش لحظي) — يعني أقرب دقة ممكنة للتنبيه هي ±5 دقايق.
- مفيش تخزين لـ"تم الإرسال" فى فايرستور (عشان نتجنب تعارض مع مزامنة التطبيق) — فى حالة
  نادرة جدًا (تأخر الجدولة أكتر من دقيقة) ممكن إشعار يتكرر مرتين أو يتأجل لأقرب تشغيلة.
- لازم اتصال إنترنت على جهازك وقت وصول الإشعار (طبيعي فى أي Push notification).
- كل جهاز يفعّل الإشعارات من عنده لوحده (الزرار بيسجل رمز الجهاز ده تحديدًا).
