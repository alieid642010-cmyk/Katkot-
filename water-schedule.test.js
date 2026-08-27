#!/usr/bin/env node
/**
 * tests/water-schedule.test.js — اختبارات آلية لنظام جدولة سقاية الماء بفترات اليوم
 * (computeEqualPeriods، getActiveWaterSchedule، formatHourRange).
 *
 * التشغيل: node tests/water-schedule.test.js
 */
const { getSandbox } = require('./test-env.js');

let passed = 0, failed = 0;
const failures = [];

function assertEqual(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) passed++;
    else { failed++; failures.push(`${label}\n    متوقع: ${JSON.stringify(expected)}\n    الفعلي: ${JSON.stringify(actual)}`); }
}
function assertTrue(cond, label) {
    if (cond) passed++;
    else { failed++; failures.push(`${label} (فشل الشرط)`); }
}

function run() {
    const ctx = getSandbox();

    // ===== computeEqualPeriods =====
    {
        const p2 = ctx.computeEqualPeriods(2);
        assertEqual(p2, [{ startHour: 0, endHour: 12, hours: 12 }, { startHour: 12, endHour: 24, hours: 12 }], 'computeEqualPeriods(2): 12+12');

        const p3 = ctx.computeEqualPeriods(3);
        assertEqual(p3.map(x => x.hours), [8, 8, 8], 'computeEqualPeriods(3): 8+8+8');
        assertEqual(p3[0], { startHour: 0, endHour: 8, hours: 8 }, 'computeEqualPeriods(3): الفترة الأولى تبدأ من الصفر');
        assertEqual(p3[2].endHour, 24, 'computeEqualPeriods(3): آخر فترة تنتهي عند 24');

        const p4 = ctx.computeEqualPeriods(4);
        assertEqual(p4.map(x => x.hours), [6, 6, 6, 6], 'computeEqualPeriods(4): 6+6+6+6');

        // حالة غير قابلة للقسمة بالتساوي (24÷5 = 4.8) — لازم يوزّع الساعة الزيادة بدل ما يضيّعها
        const p5 = ctx.computeEqualPeriods(5);
        const totalHours5 = p5.reduce((s, x) => s + x.hours, 0);
        assertEqual(totalHours5, 24, 'computeEqualPeriods(5): إجمالي الساعات لازم يفضل 24 بالظبط حتى مع القسمة الكسرية');
        assertEqual(p5.map(x => x.hours).sort().join(','), '4,5,5,5,5', 'computeEqualPeriods(5): توزيع الساعة الزيادة على أول الفترات (4,5,5,5,5)');

        // حدود آمنة
        assertEqual(ctx.computeEqualPeriods(0).length, 1, 'computeEqualPeriods(0): حد أدنى فترة واحدة (حماية من قسمة على صفر)');
        assertEqual(ctx.computeEqualPeriods(30).length, 24, 'computeEqualPeriods(30): حد أقصى 24 فترة (مش أكتر من عدد ساعات اليوم)');
    }

    // ===== formatHourRange =====
    {
        assertEqual(ctx.formatHourRange(0, 12), '١٢:٠٠ ص - ١٢:٠٠ م', 'formatHourRange(0,12): منتصف الليل لمنتصف النهار');
        assertEqual(ctx.formatHourRange(8, 16), '٨:٠٠ ص - ٤:٠٠ م', 'formatHourRange(8,16): صباحًا لمساءً');
        assertEqual(ctx.formatHourRange(16, 24), '٤:٠٠ م - ١٢:٠٠ ص', 'formatHourRange(16,24): آخر فترة تنتهي عند منتصف الليل');
    }

    // ===== getActiveWaterSchedule =====
    {
        const b = {
            waterSchedules: [
                { id: 'ws1', startAge: 1, periods: ctx.computeEqualPeriods(3) },
                { id: 'ws2', startAge: 15, periods: ctx.computeEqualPeriods(4) },
                { id: 'ws3', startAge: 30, periods: ctx.computeEqualPeriods(6) },
            ]
        };
        assertEqual(ctx.getActiveWaterSchedule(b, 5).id, 'ws1', 'getActiveWaterSchedule: يوم 5 → الجدول الأول (startAge=1)');
        assertEqual(ctx.getActiveWaterSchedule(b, 15).id, 'ws2', 'getActiveWaterSchedule: يوم 15 بالظبط → الجدول الثاني (حد الفصل نفسه)');
        assertEqual(ctx.getActiveWaterSchedule(b, 20).id, 'ws2', 'getActiveWaterSchedule: يوم 20 → لسه الجدول الثاني (لحد ما نوصل يوم 30)');
        assertEqual(ctx.getActiveWaterSchedule(b, 40).id, 'ws3', 'getActiveWaterSchedule: يوم 40 → الجدول الثالث (الأحدث)');
        assertEqual(ctx.getActiveWaterSchedule({ waterSchedules: [] }, 10), null, 'getActiveWaterSchedule: مفيش جداول محفوظة → null');
        assertEqual(ctx.getActiveWaterSchedule({}, 10), null, 'getActiveWaterSchedule: batch من غير خاصية waterSchedules أصلًا → null (بدون Exception)');
    }

    // ===== تأكيد وجود الدوال المحمية =====
    {
        for (const fn of ['addWaterSchedule', 'removeWaterSchedule', 'updateWaterSchedulePeriod', 'toggleWaterPeriodDone']) {
            assertTrue(typeof ctx[fn] === 'function', `الدالة المحمية ${fn} موجودة ومُعرَّفة`);
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ نجح: ${passed}   ❌ فشل: ${failed}`);
    if (failures.length) {
        console.log(`\n--- تفاصيل الفشل ---`);
        failures.forEach(f => console.log('❌ ' + f + '\n'));
        process.exit(1);
    } else {
        console.log('🎉 كل اختبارات جدولة سقاية الماء نجحت');
        process.exit(0);
    }
}

run();
