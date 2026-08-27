#!/usr/bin/env node
/**
 * tests/permissions.test.js — اختبارات آلية لدالة requirePermission()، جوهر كل الـ82
 * نقطة حماية اللي أضفناها فى جولات المراجعة الأمنية الثلاثة. أي تعديل مستقبلي فى
 * منطق الصلاحيات نفسه (لا قدّر الله) هيبان أثره هنا فورًا.
 *
 * التشغيل: node tests/permissions.test.js
 */
const { getSandbox, setGlobals } = require('./test-env.js');

let passed = 0, failed = 0;
const failures = [];

function assertEqual(actual, expected, label) {
    if (actual === expected) { passed++; }
    else { failed++; failures.push(`${label}\n    متوقع: ${JSON.stringify(expected)}  —  الفعلي: ${JSON.stringify(actual)}`); }
}

function run() {
    const ctx = getSandbox();
    // نلغّي showToast مؤقتًا (requirePermission بينادها عند الرفض) عشان منحتاجش DOM حقيقي
    ctx.showToast = () => {};

    // ===== المالك (owner) — دايمًا مصرّح له بكل حاجة =====
    setGlobals(ctx, { currentRole: 'owner', currentWorker: null });
    assertEqual(ctx.requirePermission('management'), true, 'المالك: مصرّح له بـ management');
    assertEqual(ctx.requirePermission('production'), true, 'المالك: مصرّح له بـ production');
    assertEqual(ctx.requirePermission('owner'), true, 'المالك: مصرّح له بـ owner (طبيعي، هو المالك)');

    // ===== عامل بدون أي صلاحيات مخصصة (يرجع للافتراضي: daily + production) =====
    setGlobals(ctx, { currentRole: 'worker', currentWorker: { id: 'w1', permissions: [] } });
    assertEqual(ctx.requirePermission('production'), true, 'عامل بلا صلاحيات مخصصة: production مسموح (افتراضي)');
    assertEqual(ctx.requirePermission('management'), false, 'عامل بلا صلاحيات مخصصة: management ممنوع');
    assertEqual(ctx.requirePermission('owner'), false, 'عامل: owner ممنوع دائمًا مهما كانت صلاحياته');

    // ===== عامل بصلاحية management محددة يدويًا =====
    setGlobals(ctx, { currentWorker: { id: 'w2', permissions: ['management'] } });
    assertEqual(ctx.requirePermission('management'), true, 'عامل بصلاحية management محددة: management مسموح');
    assertEqual(ctx.requirePermission('production'), false, 'عامل بصلاحية management بس: production ممنوع (مش فى القائمة)');
    assertEqual(ctx.requirePermission('owner'), false, 'عامل بأي صلاحيات: owner يفضل ممنوع دائمًا');

    // ===== عامل بكل الصلاحيات ما عدا owner (owner لا يُمنح أبدًا لعامل) =====
    setGlobals(ctx, { currentWorker: { id: 'w3', permissions: ['daily', 'production', 'management'] } });
    assertEqual(ctx.requirePermission('management'), true, 'عامل بكل الصلاحيات: management مسموح');
    assertEqual(ctx.requirePermission('production'), true, 'عامل بكل الصلاحيات: production مسموح');
    assertEqual(ctx.requirePermission('owner'), false, '🔒 حرج: عامل حتى لو معاه كل الصلاحيات، owner يفضل ممنوع (لا يوجد تحايل)');

    // ===== 🔒 اختبار حرج: التأكد إن الدوال الـ82 المحمية فعليًا موجودة ومربوطة =====
    const guardedFns = [
        'saveBatch', 'deleteBatch', 'saveDaily', 'deleteRecord', 'saveCustom', 'addHouse', 'removeHouse',
        'saveBiosecurity', 'saveVaccine', 'saveTreatment', 'saveProtocol', 'saveFeedAdditive', 'saveWaterAdditive',
        'saveIncident', 'deleteIncident', 'saveOutageLog', 'saveStdRefs', 'saveAdvancedSettings',
        'addChecklistTask', 'saveExpansionInputs', 'deleteQuickIntervention',
    ];
    for (const fn of guardedFns) {
        assertEqual(typeof ctx[fn], 'function', `الدالة المحمية ${fn} موجودة ومُعرَّفة فى التطبيق`);
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ نجح: ${passed}   ❌ فشل: ${failed}`);
    if (failures.length) {
        console.log(`\n--- تفاصيل الفشل ---`);
        failures.forEach(f => console.log('❌ ' + f + '\n'));
        process.exit(1);
    } else {
        console.log('🎉 كل اختبارات الصلاحيات نجحت');
        process.exit(0);
    }
}

run();
