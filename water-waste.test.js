#!/usr/bin/env node
/**
 * tests/water-waste.test.js — اختبارات آلية لحساب الهادر التقديري من مياه الشرب
 * (computeWaterWasteAnalysis).
 *
 * التشغيل: node tests/water-waste.test.js
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
function assertClose(actual, expected, tolerance, label) {
    const ok = typeof actual === 'number' && Math.abs(actual - expected) <= tolerance;
    if (ok) passed++;
    else { failed++; failures.push(`${label}\n    متوقع تقريبًا: ${expected} (±${tolerance})\n    الفعلي: ${actual}`); }
}

function makeBatch(records, species = 'broiler') {
    return { id: 'b1', species, records };
}

function run() {
    const ctx = getSandbox();
    const refWfr = ctx.getSpeciesData('broiler').waterFeedRatio;
    assertTrue(typeof refWfr === 'number' && refWfr > 0, 'نسبة الماء:العلف المرجعية لسلالة broiler موجودة وموجبة');

    // ===== نوع سلالة غير معروف → يرجع بيانات broiler الافتراضية (تصميم متعمّد، مش استثناء) =====
    {
        const b = makeBatch([], 'نوع-غريب-غير-موجود');
        const r = ctx.computeWaterWasteAnalysis(b);
        assertTrue(r !== null && r.refWfr === refWfr, 'computeWaterWasteAnalysis: سلالة غير معروفة → يرجع نسبة broiler الافتراضية بدل ما ينهار (getSpeciesData fallback)');
    }

    // ===== بيانات غير كافية (أقل من 3 أيام) =====
    {
        const b = makeBatch([
            { age: 1, date: '2026-01-01', water: 10, feed: 5 },
            { age: 2, date: '2026-01-02', water: 12, feed: 6 },
        ]);
        const r = ctx.computeWaterWasteAnalysis(b);
        assertEqual(r.hasEnoughData, false, 'computeWaterWasteAnalysis: أقل من 3 أيام بيانات → hasEnoughData=false');
    }

    // ===== استهلاك مطابق تمامًا للنسبة المرجعية → هادر صفر =====
    {
        const records = [1, 2, 3, 4].map(age => ({ age, date: `2026-01-0${age}`, feed: 10, water: 10 * refWfr }));
        const b = makeBatch(records);
        const r = ctx.computeWaterWasteAnalysis(b);
        assertEqual(r.hasEnoughData, true, 'استهلاك مطابق للمعيار: بيانات كافية');
        assertClose(r.totalWaste, 0, 0.01, 'استهلاك مطابق تمامًا للنسبة المرجعية → هادر تراكمي = صفر تقريبًا');
        assertClose(r.wastePct, 0, 0.5, 'استهلاك مطابق للمعيار → نسبة الهادر = صفر تقريبًا');
    }

    // ===== استهلاك أعلى بوضوح من المعيار → هادر موجب محسوب صح =====
    {
        // كل يوم: علف=10 كجم، المتوقع = 10×refWfr، الفعلي = المتوقع + 5 لتر زيادة كل يوم
        const records = [1, 2, 3, 4].map(age => {
            const expected = 10 * refWfr;
            return { age, date: `2026-01-0${age}`, feed: 10, water: expected + 5 };
        });
        const b = makeBatch(records);
        const r = ctx.computeWaterWasteAnalysis(b);
        assertClose(r.avgDailyWaste, 5, 0.01, 'زيادة ثابتة 5 لتر/يوم عن المتوقع → avgDailyWaste = 5 بالظبط');
        assertClose(r.totalWaste, 20, 0.01, 'زيادة 5 لتر × 4 أيام → إجمالي الهادر = 20 لتر');
        assertTrue(r.wastePct > 0, 'نسبة الهادر موجبة لما الاستهلاك أعلى من المتوقع');
    }

    // ===== أيام فيها استهلاك أقل من المتوقع → مفيش هادر سالب (Math.max(0,...) شغّالة صح) =====
    {
        const records = [1, 2, 3].map(age => ({ age, date: `2026-01-0${age}`, feed: 10, water: 10 * refWfr * 0.5 })); // نص الاستهلاك المتوقع
        const b = makeBatch(records);
        const r = ctx.computeWaterWasteAnalysis(b);
        assertEqual(r.totalWaste, 0, 'استهلاك أقل من المتوقع → هادر = صفر (مش رقم سالب)');
    }

    // ===== تجاهل الأيام الناقصة البيانات (مفيش علف أو مفيش ماء مسجَّل) =====
    {
        const records = [
            { age: 1, date: '2026-01-01', feed: 10, water: 10 * refWfr },
            { age: 2, date: '2026-01-02', feed: null, water: 15 }, // ناقص علف — لازم يتجاهل
            { age: 3, date: '2026-01-03', feed: 10, water: null }, // ناقص ماء — لازم يتجاهل
            { age: 4, date: '2026-01-04', feed: 10, water: 10 * refWfr },
            { age: 5, date: '2026-01-05', feed: 10, water: 10 * refWfr },
        ];
        const b = makeBatch(records);
        const r = ctx.computeWaterWasteAnalysis(b);
        assertEqual(r.hasEnoughData, true, 'بعد استبعاد اليومين الناقصين، لسه فاضل 3 أيام صالحة → بيانات كافية');
        assertEqual(r.daysCounted, 3, 'الأيام الناقصة بيانات (علف أو ماء = null) بتتجاهل من الحساب، يفضل بس 3 أيام صالحة من أصل 5');
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ نجح: ${passed}   ❌ فشل: ${failed}`);
    if (failures.length) {
        console.log(`\n--- تفاصيل الفشل ---`);
        failures.forEach(f => console.log('❌ ' + f + '\n'));
        process.exit(1);
    } else {
        console.log('🎉 كل اختبارات هادر المياه نجحت');
        process.exit(0);
    }
}

run();
