// ============ كتكوت برو — Cloud Function للتنبيهات الفورية ============
// شغالة كل 5 دقايق (Cloud Scheduler)، بتفحص كل مزارع state.batches فى Firestore، وتبعت
// إشعار FCM حقيقي (يوصل حتى لو التطبيق مقفول تمامًا) لأي موعد (تحصين/علاج/إضافة/استحقاق)
// قرب وقته حسب "وقت التنفيذ" و"نبّهني قبله بكذا دقيقة" المحفوظين مع كل بند.
//
// ⚠️ التصميم بسيط عن قصد لحجم مزرعة واحدة/عدد قليل من المزارع: مفيش أي كتابة رجوع لفايرستور
// (عشان نتجنب أي تعارض مع بروتوكول المزامنة rev/lastWriter بتاع التطبيق)، وبدل كده بنعتمد على
// إن الجدولة بتشتغل كل 5 دقايق فعلاً وبنفحص "نافذة" الـ 5 دقايق اللي فاتت (+ دقيقة هامش أمان).
// النتيجة: فى حالات نادرة جدًا (تأخر مؤقت فى الجدولة) ممكن إشعار يتكرر مرتين أو يتأخر لحد
// أقرب تشغيلة — مقبول لحجم الاستخدام ده، ولو حبيت دقة أعلى تقدر تضيف حقل notifiedAt لاحقًا.

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// مصر بدون توقيت صيفي حاليًا (UTC+2 ثابت) — لو اتغيّر رسميًا فى المستقبل عدّل الرقم ده بس
const EGYPT_UTC_OFFSET = '+02:00';

function toCairoDate(dateStr, timeStr) {
    if (!dateStr) return null;
    const t = (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) ? timeStr : '08:00';
    const d = new Date(`${dateStr}T${t}:00${EGYPT_UTC_OFFSET}`);
    return isNaN(d.getTime()) ? null : d;
}
function addDaysToDateStr(dateStr, days) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00${EGYPT_UTC_OFFSET}`);
    if (isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
    const da = new Date(`${a}T00:00:00${EGYPT_UTC_OFFSET}`), db2 = new Date(`${b}T00:00:00${EGYPT_UTC_OFFSET}`);
    return Math.round((db2 - da) / 86400000);
}
function cairoTodayStr(now) {
    const cairoNow = new Date(now.getTime());
    // نحول للتاريخ بتوقيت القاهرة عن طريق تنسيقه مباشرة بالـ offset بدل حساب يدوي عرضة للغلط وقت التبديل بين الأيام
    const iso = new Date(cairoNow.getTime() + 2 * 3600000).toISOString();
    return iso.slice(0, 10);
}
function rangeInclusive(from, to) {
    const out = [];
    for (let i = from; i <= to; i++) out.push(i);
    return out;
}

// موعد + مهلة تنبيه ضمن نافذة الفحص الحالية؟
function isDueNow(dateStr, timeStr, leadMinutes, windowStart, now) {
    const due = toCairoDate(dateStr, timeStr);
    if (!due) return false;
    const notifyAt = new Date(due.getTime() - (Number(leadMinutes) || 0) * 60000);
    return notifyAt > windowStart && notifyAt <= now;
}

exports.checkDueNotifications = functions.pubsub.schedule('every 5 minutes').timeZone('Africa/Cairo').onRun(async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 6 * 60000); // نافذة 6 دقايق (هامش أمان دقيقة زيادة عن الـ5 دقايق الفعلية بين التشغيلات)
    const todayStr = cairoTodayStr(now);

    const snap = await db.collection('farms').where('notifyEnabled', '==', true).get();
    const sendJobs = [];

    snap.forEach(doc => {
        const farm = doc.data();
        const tokens = Array.isArray(farm.fcmTokens) ? farm.fcmTokens.filter(Boolean) : [];
        if (!tokens.length) return;

        let state;
        try { state = JSON.parse(farm.stateJson || '{}'); } catch (e) { return; }
        const batches = (state.batches || []).filter(b => b.status !== 'مؤرشفة' && b.startDate);

        const dueItems = []; // { title, body }

        batches.forEach(b => {
            const batchLabel = b.name || 'دفعة نشطة';

            // 1) التحصينات
            (b.vaccineLog || []).forEach(v => {
                if (v.done || !v.time) return;
                const dateStr = addDaysToDateStr(b.startDate, v.day);
                if (isDueNow(dateStr, v.time, v.notifyLeadMinutes, windowStart, now)) {
                    dueItems.push({ title: `💉 موعد تحصين: ${v.name}`, body: `${batchLabel} — يوم ${v.day} الساعة ${v.time}` });
                }
            });

            // 2) العلاجات ومعاملات الفرشة/السبلة
            (b.treatmentLog || []).forEach(t => {
                if (t.done || !t.time) return;
                const dateStr = addDaysToDateStr(b.startDate, t.day);
                if (isDueNow(dateStr, t.time, t.notifyLeadMinutes, windowStart, now)) {
                    dueItems.push({ title: `🪣 موعد معاملة: ${t.name}`, body: `${batchLabel} — يوم ${t.day} الساعة ${t.time}` });
                }
            });

            // 3) الإضافات العلفية/المائية (تذكير يومي متكرر طول فترة السريان)
            const ageToday = daysBetween(b.startDate, todayStr);
            [['feedAdditives', '➕ إضافة علفية', 'feed'], ['waterAdditives', '➕ إضافة مائية', 'water']].forEach(([key, label]) => {
                (b[key] || []).forEach(a => {
                    if (!a.active || !a.time) return;
                    const activeDays = (a.days && a.days.length) ? a.days : rangeInclusive(a.from, a.to);
                    if (!activeDays.includes(ageToday)) return;
                    const alreadyDone = (b.additiveExecLog || []).some(e => e.additiveId === a.id && e.date === todayStr);
                    if (alreadyDone) return;
                    if (isDueNow(todayStr, a.time, a.notifyLeadMinutes, windowStart, now)) {
                        dueItems.push({ title: `${label}: ${a.name}`, body: `${batchLabel} — الساعة ${a.time}` });
                    }
                });
            });

            // 4) استحقاقات دفع للموردين (مشتريات آجلة)
            (b.purchases || []).forEach(p => {
                if (p.paid !== false || !p.dueDate || !p.dueTime) return;
                if (isDueNow(p.dueDate, p.dueTime, p.notifyLeadMinutes, windowStart, now)) {
                    dueItems.push({ title: `💳 استحقاق دفع للمورد${p.supplier ? ': ' + p.supplier : ''}`, body: `${batchLabel} — ${p.type || ''} ${p.total ? p.total + ' ج' : ''}`.trim() });
                }
            });

            // 5) استحقاقات تحصيل من العملاء (مبيعات آجلة)
            (b.sales || []).forEach(s => {
                if (s.paid !== false || !s.dueDate || !s.dueTime) return;
                if (isDueNow(s.dueDate, s.dueTime, s.notifyLeadMinutes, windowStart, now)) {
                    dueItems.push({ title: `💵 استحقاق تحصيل${s.buyer ? ' من: ' + s.buyer : ''}`, body: `${batchLabel} — ${s.total ? s.total + ' ج' : ''}`.trim() });
                }
            });
        });

        // إشعار منفصل لكل بند مستحق — أوضح للمالك من دمجهم فى واحد
        dueItems.forEach(item => {
            sendJobs.push(
                admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: { title: item.title, body: item.body },
                    webpush: { fcmOptions: { link: '/' } },
                }).catch(err => {
                    console.error('فشل إرسال إشعار لمزرعة', doc.id, err);
                })
            );
        });
    });

    await Promise.all(sendJobs);
    console.log(`تم فحص التنبيهات — ${sendJobs.length} إشعار اتبعت`);
    return null;
});
