#!/usr/bin/env node
/**
 * tests/date-range-filter.test.js — اختبارات آلية لمكوّن فلتر التاريخ الموحّد (dateRangeFromPreset,
 * isDateInPreset). الدوال دي pure functions مبنية على new Date() الحالي، فالاختبارات بتتأكد من
 * السلوك النسبي (اليوم داخل "هذا الشهر"، امبارح مش داخل "اليوم"، إلخ) بدل تواريخ ثابتة.
 *
 * التشغيل: node tests/date-range-filter.test.js
 */
const { getSandbox } = require('./test-env.js');

let passed = 0, failed = 0;
const failures = [];
function assert(cond, label, detail) {
    if (cond) { passed++; }
    else { failed++; failures.push(`${label}${detail ? '\n    ' + detail : ''}`); }
}

function run() {
    const ctx = getSandbox();
    const now = new Date();
    const iso = d => d.toISOString();

    // اليوم النهاردة لازم يقع جوّه preset 'today'، وأمبارح لأ
    assert(ctx.isDateInPreset(iso(now), 'today'), 'تاريخ النهاردة يقع داخل preset "اليوم"');
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    assert(!ctx.isDateInPreset(iso(yesterday), 'today'), 'تاريخ أمبارح لا يقع داخل preset "اليوم"');
    assert(ctx.isDateInPreset(iso(yesterday), 'yesterday'), 'تاريخ أمبارح يقع داخل preset "أمس"');

    // 'all_time' لازم يشمل أي تاريخ حتى القديم جدًا
    const veryOld = new Date('2015-01-01');
    assert(ctx.isDateInPreset(iso(veryOld), 'all_time'), 'preset "كل الوقت" بيشمل أي تاريخ حتى القديم جدًا');

    // تاريخ فارغ/غير موجود لازم يرجّع false دايمًا (مش استثناء)
    assert(ctx.isDateInPreset(null, 'all_time') === false, 'تاريخ فاضي (null) بيرجّع false حتى مع "كل الوقت"');
    assert(ctx.isDateInPreset(undefined, 'today') === false, 'تاريخ فاضي (undefined) بيرجّع false');

    // النهاردة لازم يقع جوّه "هذا الشهر" و"هذا العام" دايمًا
    assert(ctx.isDateInPreset(iso(now), 'this_month'), 'تاريخ النهاردة يقع داخل preset "هذا الشهر"');
    assert(ctx.isDateInPreset(iso(now), 'this_year'), 'تاريخ النهاردة يقع داخل preset "هذا العام"');

    // تاريخ من 4 شهور فات لازم يقع جوّه "آخر 6 أشهر" ومش جوّه "آخر 3 أشهر"
    const fourMonthsAgo = new Date(now); fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    assert(ctx.isDateInPreset(iso(fourMonthsAgo), 'last_6_months'), 'تاريخ من 4 شهور ← يقع داخل "آخر 6 أشهر"');
    assert(!ctx.isDateInPreset(iso(fourMonthsAgo), 'last_3_months'), 'تاريخ من 4 شهور ← لا يقع داخل "آخر 3 أشهر"');

    // dateRangeFromPreset('all_time') لازم يرجّع null صراحة (بلا حدود)
    assert(ctx.dateRangeFromPreset('all_time') === null, 'dateRangeFromPreset("all_time") بيرجّع null صراحة');

    // dateRangePresetLabel بترجّع تسمية عربية صحيحة، وترجع لـ"كل الوقت" لأي id مش معروف
    assert(ctx.dateRangePresetLabel('today') === 'اليوم', 'dateRangePresetLabel("today") === "اليوم"');
    assert(ctx.dateRangePresetLabel('not_a_real_id') === 'كل الوقت', 'id غير معروف ← يرجع "كل الوقت" كافتراضي آمن');

    console.log('='.repeat(50));
    console.log(`✅ نجح: ${passed}   ❌ فشل: ${failed}`);
    if (failed) {
        console.log('\nتفاصيل الفشل:');
        failures.forEach(f => console.log(`  ❌ ${f}`));
        process.exitCode = 1;
    } else {
        console.log('🎉 كل اختبارات فلتر التاريخ الموحّد نجحت');
    }
}

run();
