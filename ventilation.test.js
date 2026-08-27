#!/usr/bin/env node
/**
 * tests/ventilation.test.js — اختبارات آلية لدوال التهوية (computeMinVentTarget،
 * getNightVentDutyRow، computeVentilationPlan) ودوال أساسية مساعدة (fmt، seasonLabelOf).
 *
 * الهدف: أي تعديل مستقبلي فى منطق التهوية يبان أثره فورًا هنا (رقم غلط، دالة اتكسرت)
 * من غير ما تحتاج تفتح المتصفح وتدخل بيانات يدويًا كل مرة عشان تتأكد.
 *
 * التشغيل: node tests/ventilation.test.js
 */
const { getSandbox } = require('./test-env.js');

let passed = 0, failed = 0;
const failures = [];

function assertEqual(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { passed++; }
    else { failed++; failures.push(`${label}\n    متوقع: ${JSON.stringify(expected)}\n    الفعلي: ${JSON.stringify(actual)}`); }
}

function assertTrue(cond, label) {
    if (cond) passed++;
    else { failed++; failures.push(`${label} (فشل الشرط)`); }
}

function assertInRange(val, min, max, label) {
    const ok = typeof val === 'number' && val >= min && val <= max;
    if (ok) passed++;
    else { failed++; failures.push(`${label}\n    القيمة: ${val} — المتوقع بين ${min} و ${max}`); }
}

function makeBatch(overrides = {}) {
    return {
        id: 'test-batch-1', name: 'دفعة اختبار', species: 'broiler',
        startCount: 1000, startweight: 42, startmonth: 1,
        area: 300, ventType: 'tunnel', floorType: 'litter',
        fanCapacityM3h: 17000, fanCount: 4,
        records: [], sales: [], status: 'نشطة',
        ...overrides,
    };
}

function run() {
    const ctx = getSandbox();

    // ===== computeMinVentTarget =====
    {
        const r1 = ctx.computeMinVentTarget(3, 1000); // أسبوع 1
        assertTrue(r1 !== null, 'computeMinVentTarget: لازم يرجّع نتيجة لعمر وعدد طيور صالحين');
        assertEqual(r1.cfmPerBird, 0.10, 'computeMinVentTarget: معدل الطائر فى الأسبوع الأول = 0.10 CFM');
        assertInRange(r1.totalM3h, 165, 175, 'computeMinVentTarget: إجمالي م³/ساعة للأسبوع الأول منطقي (0.10×1000×1.699)');

        const r2 = ctx.computeMinVentTarget(50, 1000); // عمر كبير جدًا (أكبر من 8 أسابيع) — لازم يستخدم آخر قيمة فى الجدول
        assertEqual(r2.cfmPerBird, 0.90, 'computeMinVentTarget: الأعمار الكبيرة (>8 أسابيع) تستخدم آخر قيمة فى الجدول (0.90)');

        const r3 = ctx.computeMinVentTarget(10, 0);
        assertEqual(r3, null, 'computeMinVentTarget: يرجّع null لو عدد الطيور صفر أو غير موجود');
    }

    // ===== getNightVentDutyRow =====
    {
        const winter1 = ctx.getNightVentDutyRow(5, 'شتاء');
        assertEqual(winter1, { low: 10, high: 15, stageLabel: '١-٧ أيام' }, 'getNightVentDutyRow: عمر 5 أيام شتاء يطابق صف ١-٧ أيام');

        const summer40 = ctx.getNightVentDutyRow(40, 'صيف');
        assertEqual(summer40, { low: 100, high: 100, stageLabel: '٣٦+ يوم' }, 'getNightVentDutyRow: عمر كبير صيفًا = تشغيل شبه مستمر 100%');

        const boundary = ctx.getNightVentDutyRow(7, 'ربيع'); // على حد فاصل بالظبط
        assertEqual(boundary.stageLabel, '١-٧ أيام', 'getNightVentDutyRow: العمر على الحد الفاصل (7) بيقع فى الفئة الصحيحة (≤7)');
    }

    // ===== computeVentilationPlan: تكامل (integration) — يتأكد إن الدالة الكبيرة شغالة من غير Exception =====
    {
        const b = makeBatch();
        const m = { todayAge: 25, liveCount: 950, density: 22, lastEnv: {} };
        let plan;
        let threw = false;
        try { plan = ctx.computeVentilationPlan(b, m); } catch (e) { threw = true; console.error(e); }
        assertTrue(!threw, 'computeVentilationPlan: يشتغل من غير Exception على دفعة نموذجية كاملة البيانات');
        assertTrue(Array.isArray(plan) && plan.length > 0, 'computeVentilationPlan: يرجّع قائمة توصيات غير فاضية');
        assertTrue(plan.every(item => item.level && item.text), 'computeVentilationPlan: كل عنصر فى القائمة له level و text');

        // ===== التحقق من التحسين الجديد: رفع نسبة التشغيل الليلية تلقائيًا لو الأمونيا مرتفعة =====
        const mHighNh3 = { todayAge: 25, liveCount: 950, density: 22, lastEnv: { nh3Day: 28, nh3Night: 26 } };
        const planHighNh3 = ctx.computeVentilationPlan(b, mHighNh3);
        const nightItemHigh = planHighNh3.find(i => i.text.includes('توصية الليلة'));
        const mNormalNh3 = { todayAge: 25, liveCount: 950, density: 22, lastEnv: { nh3Day: 10, nh3Night: 8 } };
        const planNormalNh3 = ctx.computeVentilationPlan(b, mNormalNh3);
        const nightItemNormal = planNormalNh3.find(i => i.text.includes('توصية الليلة'));
        assertTrue(!!nightItemHigh && !!nightItemNormal, 'computeVentilationPlan: بند "توصية الليلة" موجود دائمًا فى القائمة');
        assertTrue(nightItemHigh.level === 'warn', 'computeVentilationPlan ✨: مستوى التنبيه warn لما الأمونيا مرتفعة');
        assertTrue(nightItemNormal.level === 'info', 'computeVentilationPlan ✨: مستوى التنبيه info لما الأمونيا طبيعية');
        assertTrue(nightItemHigh.text !== nightItemNormal.text, 'computeVentilationPlan ✨: نص التوصية يختلف فعليًا بين حالة الأمونيا المرتفعة والطبيعية (التحسين شغّال)');
    }

    // ===== fmt: دالة تنسيق الأرقام =====
    {
        assertEqual(ctx.fmt(1234.567, 2), '١٬٢٣٤٫٥٧', 'fmt: تقريب لمنزلتين عشريتين بترقيم عربي مع فاصلة الآلاف');
        assertEqual(ctx.fmt(null), '—', 'fmt: قيمة null ترجع شرطة');
        assertEqual(ctx.fmt(undefined), '—', 'fmt: قيمة undefined ترجع شرطة');
    }

    // ===== seasonLabelOf =====
    {
        assertEqual(ctx.seasonLabelOf(1), 'شتاء', 'seasonLabelOf: يناير = شتاء');
        assertEqual(ctx.seasonLabelOf(7), 'صيف', 'seasonLabelOf: يوليو = صيف');
        assertEqual(ctx.seasonLabelOf(4), 'ربيع', 'seasonLabelOf: أبريل = ربيع');
        assertEqual(ctx.seasonLabelOf(10), 'خريف', 'seasonLabelOf: أكتوبر = خريف');
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ نجح: ${passed}   ❌ فشل: ${failed}`);
    if (failures.length) {
        console.log(`\n--- تفاصيل الفشل ---`);
        failures.forEach(f => console.log('❌ ' + f + '\n'));
        process.exit(1);
    } else {
        console.log('🎉 كل الاختبارات نجحت');
        process.exit(0);
    }
}

run();
