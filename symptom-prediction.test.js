#!/usr/bin/env node
/**
 * tests/symptom-prediction.test.js — اختبارات آلية لدالة computeSymptomPrediction() (الحالة
 * الظاهرية اليومية والتنبؤ الاستباقي بالمرض). أي تعديل مستقبلي فى CLINICAL_DISEASE_KB أو منطق
 * المطابقة/الدرجات هيبان أثره هنا فورًا، من غير ما نحتاج نفتح المتصفح.
 *
 * التشغيل: node tests/symptom-prediction.test.js
 */
const { getSandbox, setGlobals } = require('./test-env.js');

let passed = 0, failed = 0;
const failures = [];

function assert(cond, label, detail) {
    if (cond) { passed++; }
    else { failed++; failures.push(`${label}${detail ? '\n    ' + detail : ''}`); }
}

function buildBatch(overrides) {
    return Object.assign({
        id: 'b1', name: 'دفعة اختبار', species: 'دجاج تسمين', floorType: 'litter',
        status: 'نشطة', startDate: '2026-07-01', startCount: 4500, startweight: 42, area: 300,
        records: [], sales: [], purchases: [], incidents: [], checklistTemplate: [], checklistLog: []
    }, overrides || {});
}

function run() {
    const ctx = getSandbox();

    // ===== لا توجد أعراض ← لا توقعات =====
    const bEmpty = buildBatch({ records: [{ date: '2026-07-20', age: 20, mort: 1, cull: 0, liveCount: 4490 }] });
    let res = ctx.computeSymptomPrediction(bEmpty, {});
    assert(res.predictions.length === 0, 'مفيش أعراض ← مفيش توقعات', `فعليًا ${res.predictions.length}`);

    // ===== زرق دموي فى عمر 20 (جوّه نطاق الكوكسيديا 14-35) ← لازم يظهر احتمال الكوكسيديا =====
    const bCocci = buildBatch({ records: [{ date: '2026-07-20', age: 20, mort: 2, cull: 0, liveCount: 4480 }] });
    res = ctx.computeSymptomPrediction(bCocci, { digestive: ['bloody_droppings'] });
    assert(res.predictions.some(p => p.name.includes('كوكسيديا')), 'زرق دموي بعمر 20 ← يظهر احتمال كوكسيديا',
        `التوقعات: ${res.predictions.map(p => p.name).join(', ')}`);

    // ===== نفس العرض خارج النطاق العمري (عمر 55، أكبر من نطاق الكوكسيديا 14-35) ← ميظهرش =====
    const bOldAge = buildBatch({ records: [{ date: '2026-08-24', age: 55, mort: 1, cull: 0, liveCount: 4470 }] });
    res = ctx.computeSymptomPrediction(bOldAge, { digestive: ['bloody_droppings'] });
    assert(!res.predictions.some(p => p.name.includes('كوكسيديا')), 'زرق دموي بعمر 55 (خارج نطاق الكوكسيديا) ← ميظهرش',
        `التوقعات: ${res.predictions.map(p => p.name).join(', ')}`);

    // ===== أعراض عصبية (التواء رقبة + دوران) ← احتمال قوي للنيوكاسل، ومُعلَّم urgent =====
    const bNd = buildBatch({ records: [{ date: '2026-07-15', age: 15, mort: 3, cull: 0, liveCount: 4470 }] });
    res = ctx.computeSymptomPrediction(bNd, { neuro: ['torticollis', 'circling'] });
    const ndPred = res.predictions.find(p => p.name.includes('نيوكاسل'));
    assert(!!ndPred, 'التواء رقبة + دوران ← يظهر احتمال نيوكاسل', `التوقعات: ${res.predictions.map(p => p.name).join(', ')}`);
    assert(!!(ndPred && ndPred.confidenceLabel.includes('قوي')), 'نيوكاسل بعرضين أساسيين ← درجة ثقة قوية',
        ndPred ? ndPred.confidenceLabel : 'مفيش توقع خالص');

    // ===== استمرارية العرض يومين متتاليين ← ترفع الدرجة وتفعّل urgent مقارنة بعرض جديد بلا سابقة =====
    // (لما currentSigns متبعتة معناها "اليوم" لسه مش متسجل فى b.records — فآخر سجل محفوظ = "أمبارح")
    const bNoPriorDay = buildBatch({ records: [] });
    const resNoPrior = ctx.computeSymptomPrediction(bNoPriorDay, { digestive: ['bloody_droppings'] });
    const bWithPriorDay = buildBatch({ records: [
        { date: '2026-07-19', age: 19, mort: 1, cull: 0, liveCount: 4490, clinicalSigns: { digestive: ['bloody_droppings'] } },
    ]});
    const resWithPrior = ctx.computeSymptomPrediction(bWithPriorDay, { digestive: ['bloody_droppings'] });
    const scoreNoPrior = (resNoPrior.predictions.find(p => p.name.includes('كوكسيديا')) || {}).score || 0;
    const scoreWithPrior = (resWithPrior.predictions.find(p => p.name.includes('كوكسيديا')) || {}).score || 0;
    assert(scoreWithPrior > scoreNoPrior, 'نفس العرض مسجّل أمبارح كمان ← درجة أعلى من عرض جديد بلا سابقة',
        `بلا سابقة: ${scoreNoPrior}  —  مستمر من أمبارح: ${scoreWithPrior}`);
    assert(resWithPrior.persistingSigns.includes('bloody_droppings'), 'persistingSigns بتتضمن العرض المستمر صح');

    // ===== دالة نقية 100% — نفس المدخلات لازم تدّي نفس المخرجات، من غير أي أثر جانبي على b =====
    const bPure = buildBatch({ records: [{ date: '2026-07-20', age: 20, mort: 1, cull: 0, liveCount: 4490 }] });
    const snapshot = JSON.stringify(bPure);
    ctx.computeSymptomPrediction(bPure, { respiratory: ['cough_sneeze', 'rales'] });
    assert(JSON.stringify(bPure) === snapshot, 'الدالة نقية — مفيش تعديل على كائن الدفعة نفسه بعد النداء');

    // ============ الذاكرة المرضية الشخصية (وزن متدرّج n/(n+K)، بنفس فكرة FARM_CURVE_SHRINKAGE_K) ============
    // ملحوظة: mineAllIncidentRecords نفسها بتطلب دورتين مؤرشفتين على الأقل من نفس النوع قبل ما ترجّع أي حاجة
    // (نفس فلسفة "نمط حقيقي مش حادثة عرضية مرة واحدة" المستخدمة أصلاً فى قاعدة معرفة الحوادث) — فبنبني دايمًا
    // دورة "حاملة" فاضية من الحوادث بجانب الدورة اللي فيها التشخيصات المؤكدة، عشان نستوفي الشرط ده فى الاختبار.
    function archivedBatch(id, incidents) {
        return {
            id, name: 'دورة ' + id, species: 'دجاج تسمين', status: 'مؤرشفة', startDate: '2026-01-01',
            records: Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, age: i, mort: 1, cull: 0, liveCount: 4000 - i })),
            incidents: incidents || []
        };
    }
    function diagnosedIncidents(diseaseTag, incidentAge, count) {
        return Array.from({ length: count }, (_, i) => ({ id: 'inc' + i, source: 'manual', date: '2026-01-20', age: incidentAge,
            category: 'نفوق مرتفع', diseaseTag, severity: 'negative_med', solution: 'بروتوكول كوكسيديا القياسي', outcome: 'improved' }));
    }
    const emptyCarrierBatch = archivedBatch('carrier', []);
    const bLiveToday = buildBatch({ records: [{ date: '2026-07-20', age: 20, mort: 1, cull: 0, liveCount: 4490 }] });

    // n=0 (مفيش حوادث مؤكدة بنفس التشخيص فى أرشيف المزرعة) ← اعتماد 100% على المرجع العام
    setGlobals(ctx, { state: { batches: [] } });
    let resZero = ctx.computeSymptomPrediction(bLiveToday, { digestive: ['bloody_droppings'] });
    let cocciZero = resZero.predictions.find(p => p.name.includes('كوكسيديا'));
    assert(!!cocciZero && cocciZero.personalWeightPct === 0, 'مفيش ذاكرة شخصية ← وزنها 0%',
        cocciZero ? `فعليًا ${cocciZero.personalWeightPct}%` : 'مفيش توقع خالص');
    assert(!!cocciZero && cocciZero.personalHistoryNote.includes('100%'), 'مفيش ذاكرة شخصية ← الملاحظة توضح الاعتماد الكامل على المرجع العام');

    // n=1 حالة مؤكدة قبل كده بنفس التشخيص فى عمر قريب ← وزن شخصي = 1/(1+4) = 20%
    setGlobals(ctx, { state: { batches: [archivedBatch('one', diagnosedIncidents('كوكسيديا الأعور', 21, 1)), emptyCarrierBatch] } });
    let resOne = ctx.computeSymptomPrediction(bLiveToday, { digestive: ['bloody_droppings'] });
    let cocciOne = resOne.predictions.find(p => p.name.includes('كوكسيديا'));
    assert(!!cocciOne && cocciOne.personalWeightPct === 20, 'حالة شخصية واحدة مؤكدة ← وزن الذاكرة الشخصية 20% بالظبط',
        cocciOne ? `فعليًا ${cocciOne.personalWeightPct}%` : 'مفيش توقع خالص');
    assert(!!cocciOne && cocciOne.evidenceCount === 1, 'evidenceCount = 1 حالة مطابقة');
    assert(!!cocciOne && cocciOne.personalHistoryNote.includes('الحل اللي استخدمته'), 'الملاحظة الشخصية بتقترح الحل المستخدم قبل كده');

    // n=4 حالات ← الوزن يرتفع لـ50%، والثقة تزيد (score أعلى من حالة n=1)
    setGlobals(ctx, { state: { batches: [archivedBatch('four', diagnosedIncidents('كوكسيديا الأعور', 21, 4)), emptyCarrierBatch] } });
    let resFour = ctx.computeSymptomPrediction(bLiveToday, { digestive: ['bloody_droppings'] });
    let cocciFour = resFour.predictions.find(p => p.name.includes('كوكسيديا'));
    assert(!!cocciFour && cocciFour.personalWeightPct === 50, 'أربع حالات شخصية مؤكدة ← وزن الذاكرة الشخصية 50% بالظبط',
        cocciFour ? `فعليًا ${cocciFour.personalWeightPct}%` : 'مفيش توقع خالص');
    assert(cocciFour.score > cocciOne.score, 'الثقة (score) بترتفع كل ما زادت الحالات الشخصية المؤكدة',
        `n=1: ${cocciOne.score}  —  n=4: ${cocciFour.score}`);

    // تشخيص شخصي لمرض مختلف تمامًا (مش كوكسيديا) ← ميأثرش على تقييم الكوكسيديا خالص
    setGlobals(ctx, { state: { batches: [archivedBatch('other', diagnosedIncidents('الجمبورو', 21, 5)), emptyCarrierBatch] } });
    let resOtherDisease = ctx.computeSymptomPrediction(bLiveToday, { digestive: ['bloody_droppings'] });
    let cocciOther = resOtherDisease.predictions.find(p => p.name.includes('كوكسيديا'));
    assert(!!cocciOther && cocciOther.personalWeightPct === 0, 'ذاكرة شخصية لمرض مختلف ← مفيش تأثير على تقييم مرض تاني',
        cocciOther ? `فعليًا ${cocciOther.personalWeightPct}%` : 'مفيش توقع خالص');
    setGlobals(ctx, { state: { batches: [] } }); // تنظيف الحالة العامة قبل باقي الاختبارات

    // ============ دليل الأمراض بقى قابل للتعديل (state.diseaseKB) — لازم يستخدمه بدل القائمة الثابتة لو موجود ============
    const bCustom = buildBatch({ records: [{ date: '2026-07-10', age: 10, mort: 1, cull: 0, liveCount: 4490 }] });
    setGlobals(ctx, { state: { batches: [], diseaseKB: [
        { id: 'custom1', name: 'مرض تجريبي مخصّص', ageMin: 1, ageMax: 60, requiredSigns: ['pecking_wounds'], supportingSigns: [], recommendation: 'توصية تجريبية' }
    ] } });
    let resCustom = ctx.computeSymptomPrediction(bCustom, { skin: ['pecking_wounds'] });
    assert(resCustom.predictions.some(p => p.name === 'مرض تجريبي مخصّص'), 'مرض مضاف يدويًا فى state.diseaseKB ← بيظهر فى التوقعات',
        `التوقعات: ${resCustom.predictions.map(p => p.name).join(', ')}`);
    assert(!resCustom.predictions.some(p => p.name.includes('كوكسيديا')), 'لما state.diseaseKB موجودة، القائمة الافتراضية القديمة (كوكسيديا وغيرها) متستخدمش تلقائيًا معاها');

    // مرض بدون requiredSigns (مرجعي بس، زي التسمم بالأفلاتوكسين) ← ميظهرش أبدًا فى التوقعات حتى لو الأعراض المساندة موجودة
    setGlobals(ctx, { state: { batches: [], diseaseKB: [
        { id: 'refonly1', name: 'مرض مرجعي بس', ageMin: 1, ageMax: 60, requiredSigns: [], supportingSigns: ['lethargy_huddling'], recommendation: 'x' }
    ] } });
    let resRefOnly = ctx.computeSymptomPrediction(bCustom, { behavior: ['lethargy_huddling'] });
    assert(resRefOnly.predictions.length === 0, 'مرض بدون requiredSigns (مرجعي بس) ← ميظهرش أبدًا فى التوقعات النشطة',
        `التوقعات: ${resRefOnly.predictions.map(p => p.name).join(', ')}`);
    setGlobals(ctx, { state: { batches: [] } });

    console.log('='.repeat(50));
    console.log(`✅ نجح: ${passed}   ❌ فشل: ${failed}`);
    if (failed) {
        console.log('\nتفاصيل الفشل:');
        failures.forEach(f => console.log(`  ❌ ${f}`));
        process.exitCode = 1;
    } else {
        console.log('🎉 كل اختبارات التنبؤ الاستباقي بالحالة الظاهرية نجحت');
    }
}

run();
