        function computeHistoricalSeries() {
            const sorted = [...state.batches].filter(b => b.records && b.records.length > 0)
                .sort((a, c) => a.startDate.localeCompare(c.startDate));
            return sorted.map(b => {
                const m = computeMetrics(b);
                const fin = computeFinance(b, m);
                return { name: b.name, date: b.startDate, fcr: m.fcr, epef: m.epef, roi: fin.roi, profit: fin.netProfit, mortRate: m.mortRate };
            });
        }

        // ============ أثر مصدر/مورد الكتاكيت (المفرخة) على الأداء — عبر كل الدورات المؤرشفة ============
        // مبنية على اسم المورد المُدخل عند تسجيل شراء "كتاكيت" لكل دفعة — تكشف هل مفرخة معينة بتدّي أداء أفضل باستمرار
        function computeChickSourceAnalysis() {
            const archived = state.batches.filter(b => b.status === 'مؤرشفة' && b.records && b.records.length >= 5);
            const groups = {};
            archived.forEach(b => {
                const chickPur = (b.purchases || []).find(p => p.type === 'كتاكيت' && p.supplier);
                const supplier = chickPur ? chickPur.supplier : null;
                if (!supplier) return;
                const m = computeMetrics(b);
                if (m.epef == null) return;
                if (!groups[supplier]) groups[supplier] = [];
                groups[supplier].push({ name: b.name, epef: m.epef, fcr: m.fcr, mortRate: m.mortRate });
            });
            const suppliers = Object.keys(groups).filter(s => groups[s].length >= 1);
            if (suppliers.length < 2) return null; // محتاج مفرختين على الأقل للمقارنة تكون ذات معنى
            const rows = suppliers.map(s => {
                const g = groups[s];
                const avgEpef = g.reduce((sum, r) => sum + r.epef, 0) / g.length;
                const fcrVals = g.map(r => r.fcr).filter(v => v != null);
                const avgFcr = fcrVals.length ? fcrVals.reduce((sum, v) => sum + v, 0) / fcrVals.length : null;
                const avgMort = g.reduce((sum, r) => sum + r.mortRate, 0) / g.length;
                return { supplier: s, cycles: g.length, avgEpef, avgFcr, avgMort };
            }).sort((a, c) => c.avgEpef - a.avgEpef);
            return { rows };
        }

        // ============ الكفاءة الاقتصادية للبروتوكولات الطبيعية المحفوظة — عبر الدورات المؤرشفة ============
        // مقارنة الدورات اللي طُبِّق عليها بروتوكول معيّن (appliedProtocolNames) مقابل الدورات اللي لم يُطبَّق عليها،
        // لنفس النوع — لمعرفة هل البروتوكول فعلاً بيحسّن FCR/تكلفة الكيلو/النفوق أم لا، بدل الانطباع العام
        function computeProtocolEffectiveness() {
            const allProtoNames = [...new Set((state.protocols || []).map(p => p.name))];
            if (!allProtoNames.length) return null;
            const archived = state.batches.filter(b => b.status === 'مؤرشفة' && b.records && b.records.length >= 5);
            if (archived.length < 3) return null; // محتاج عينة معقولة من الدورات المكتملة
            const rows = allProtoNames.map(name => {
                const withProto = archived.filter(b => (b.appliedProtocolNames || []).includes(name));
                const withoutProto = archived.filter(b => !(b.appliedProtocolNames || []).includes(name));
                if (withProto.length < 1 || withoutProto.length < 1) return null;
                const avgOfBatches = (list, key) => {
                    const vals = list.map(b => { const m = computeMetrics(b); const fin = computeFinance(b, m);
                        return key === 'fcr' ? m.fcr : key === 'mortRate' ? m.mortRate : fin.costPerKg; }).filter(v => v != null && v > 0);
                    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
                };
                const withFcr = avgOfBatches(withProto, 'fcr'), withoutFcr = avgOfBatches(withoutProto, 'fcr');
                const withCost = avgOfBatches(withProto, 'costPerKg'), withoutCost = avgOfBatches(withoutProto, 'costPerKg');
                const withMort = avgOfBatches(withProto, 'mortRate'), withoutMort = avgOfBatches(withoutProto, 'mortRate');
                return { name, withCount: withProto.length, withoutCount: withoutProto.length,
                    withFcr, withoutFcr, withCost, withoutCost, withMort, withoutMort };
            }).filter(Boolean);
            return rows.length ? { rows } : null;
        }

        // ============ موسمية سعر بورصة الدواجن — تجميع كل سجلات marketPriceLog عبر كل الدورات حسب الشهر ============
        // مؤشر استرشادي فقط لتفضيل مواسم بيع تاريخيًا أعلى سعرًا، وليس تنبؤًا مضمونًا بالسوق
        function computeMarketPriceSeasonality() {
            const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
            const byMonth = {}; // 0-11 -> [prices]
            state.batches.forEach(b => (b.marketPriceLog || []).forEach(p => {
                const month = parseInt(p.date.slice(5, 7), 10) - 1;
                if (isNaN(month)) return;
                (byMonth[month] = byMonth[month] || []).push(p.price);
            }));
            const months = Object.keys(byMonth).map(Number);
            if (months.length < 2) return null; // محتاج بيانات من شهرين مختلفين على الأقل
            const rows = months.map(m => {
                const vals = byMonth[m];
                return { month: m, label: monthNames[m], avg: vals.reduce((s, v) => s + v, 0) / vals.length, count: vals.length };
            }).sort((a, c) => c.avg - a.avg);
            const totalPoints = rows.reduce((s, r) => s + r.count, 0);
            if (totalPoints < 6) return null; // عينة صغيرة جدًا لتكون مؤشرًا موثوقًا
            return { rows, best: rows[0], worst: rows[rows.length - 1] };
        }

        // ============ محرك مشترك: تصنيف "هل البند ده بيفرق بثبات عبر الدورات" ============
        // بياخد لكل بند قائمة نتائج لكل دورة (فرق النفوق/الوزن/التحويل)، ويحدد: دايمًا بيفرق إيجابًا/سلبًا،
        // بدون تأثير خالص، أو متفاوت — نفس المحرك مستخدم للإضافات والمعاملات وشحنات/موردي العلف
        const CROSS_CYCLE_THRESH = { mort: 0.03, weight: 2, fcr: 0.05 };
        function classifyCrossCycleDiffs(diffs, thresh) {
            const valid = diffs.filter(v => v != null);
            if (!valid.length) return null;
            // 🔒 تحسين: بنحسب كمان "متوسط حجم الفرق الفعلي" مش بس عدد الدورات المتحسنة/المتراجعة —
            // ده اللي بيسمح للتوصيات إنها تتكلم بأرقام صريحة ("تحسّن بمتوسط +3.2%") بدل حكم عام بلا رقم.
            // الإشارة موحّدة فى كل الاستدعاءات: موجب = تحسّن، سالب = تراجع (راجع تعليقات mortDiff/weightDiff/fcrDiff بالأسفل).
            const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
            return { n: valid.length, improved: valid.filter(v => v > thresh).length, worsened: valid.filter(v => v < -thresh).length, avg };
        }
        function verdictFromMetrics(mortC, weightC, fcrC) {
            const metrics = [mortC, weightC, fcrC].filter(Boolean);
            const anyStrongImprove = metrics.some(mc => mc.n >= 2 && (mc.improved / mc.n) >= 0.7 && mc.worsened === 0);
            const anyStrongWorsen = metrics.some(mc => mc.n >= 2 && (mc.worsened / mc.n) >= 0.7 && mc.improved === 0);
            const allNeutral = metrics.length > 0 && metrics.every(mc => mc.improved === 0 && mc.worsened === 0);
            if (anyStrongWorsen) return { verdict: 'worsen', verdictLabel: '🔴 دايمًا بيفرق بالسلب — يُقترح إلغاؤه' };
            if (anyStrongImprove) return { verdict: 'improve', verdictLabel: '🟢 دايمًا بيفرق بالإيجاب — استمر عليه' };
            if (allNeutral) return { verdict: 'none', verdictLabel: '⚪ بدون تأثير يُذكر فى أي دورة — يمكن إلغاؤه لتوفير التكلفة' };
            return { verdict: 'mixed', verdictLabel: '🟡 تأثيره متفاوت من دورة لأخرى — راقبه أكتر قبل القرار' };
        }
        // سلسلة أداء يومية (نفوق + انحراف الوزن% + معدل تحويل الفترة) لدفعة كاملة — نفس منطق computeInsights
        // لكن كمساعد قابل لإعادة الاستخدام هنا عبر كل الدفعات المؤرشفة
        function buildBatchDailyPerf(b, m) {
            const series = m.series.filter(r => r.age > 0);
            return series.map((r, i) => {
                const prev = i > 0 ? series[i - 1] : null;
                const gainPerBirdG = prev != null ? (r.effWeight - prev.effWeight) : null;
                const dailyGainKgFlock = gainPerBirdG != null ? (gainPerBirdG / 1000) * r.liveCount : null;
                const avgBirds = Math.max(((b.startCount || 0) + (r.liveCount || 0)) / 2, 1);
                const cumPerBirdKg = (r.cumFeed || 0) / avgBirds;
                return { age: r.age, mort: (r.mort || 0) + (r.cull || 0), feed: r.feed,
                    dailyGainKgFlock, devPct: r.stdW > 0 ? ((r.effWeight - r.stdW) / r.stdW) * 100 : null, cumPerBirdKg };
            });
        }
        function perfWindowStats(days) {
            const mortRate = days.length ? days.reduce((s, d) => s + d.mort, 0) / days.length : null;
            const devVals = days.map(d => d.devPct).filter(v => v != null);
            const avgDev = devVals.length ? devVals.reduce((s, v) => s + v, 0) / devVals.length : null;
            const gainDays = days.filter(d => d.dailyGainKgFlock != null && d.dailyGainKgFlock > 0);
            const feedSum = gainDays.reduce((s, d) => s + (d.feed || 0), 0);
            const gainSum = gainDays.reduce((s, d) => s + d.dailyGainKgFlock, 0);
            const periodFcr = gainSum > 0 ? feedSum / gainSum : null;
            return { mortRate, avgDev, periodFcr };
        }
        function dominantStageLabel(days) {
            const stages = getFeedStages();
            const counts = {};
            days.forEach(d => {
                let cumulative = 0, label = stages[stages.length - 1].label;
                for (let i = 0; i < stages.length; i++) {
                    const s = stages[i];
                    const stageEndKg = s.targetKg != null ? cumulative + s.targetKg : Infinity;
                    if (d.cumPerBirdKg < stageEndKg || s.targetKg == null) { label = s.label; break; }
                    cumulative = stageEndKg;
                }
                counts[label] = (counts[label] || 0) + 1;
            });
            let best = null, bestN = 0;
            Object.keys(counts).forEach(k => { if (counts[k] > bestN) { bestN = counts[k]; best = k; } });
            return best;
        }

        // ============ أثر الإضافات/المعاملات على مستوى المزرعة كلها عبر الدورات المؤرشفة (وليس دفعة واحدة فقط) ============
        // بنحسب لكل دورة استخدم فيها البند: هل النفوق قلّ، الوزن زاد، معدل التحويل تحسّن وقت سريانه — كل ده لكل دورة
        // على حدة (مش تجميع خام لكل الأيام مع بعض)، عشان القرار يبقى مبني على "فى كام دورة فرق فعلاً" مش متوسط
        // عام ممكن يكون منحاز لدورة واحدة كبيرة. لو البند فرق بثبات (أغلب الدورات) فى الوزن أو التحويل من غير أي
        // تدهور — نعتبره "دايمًا بيفرق"، ولو ما ظهرش له أي أثر ملحوظ فى أي دورة — نقترح إلغاؤه.
        // كمان بنفصل النتيجة حسب مرحلة العلف الغالبة وقت سريان البند (بادئ/نامي/ناهي) — لأن بعض البنود ممكن
        // تفرق فى مرحلة ومتفرقش فى تانية، وبنقدّر تكلفة البند فى المتوسط لكل دورة من فواتير الشراء المطابقة.
        function computeCrossCycleItemEffectiveness(species) {
            const archived = state.batches.filter(b => b.species === species && b.status === 'مؤرشفة' && b.records && b.records.length >= 6);
            if (archived.length < 2) return null;
            const itemCycles = {}; // key(name+kind+stage) -> [{ batchId, mortDiff, weightDiff, fcrDiff, cost }]
            archived.forEach(b => {
                const m = computeMetrics(b);
                const dailyPerf = buildBatchDailyPerf(b, m);
                const items = [
                    ...(b.feedAdditives || []).map(a => ({ ...a, kind: 'علف' })),
                    ...(b.waterAdditives || []).map(a => ({ ...a, kind: 'ماء' })),
                    // إضافات/مكملات خارج الجدول (جرعة لحظية) — بتتحول لنافذة 3 أيام (يوم الجرعة + يومين بعدها)
                    // عشان تدخل نفس محرك تحليل الفايدة اللي بيقارن أيام السريان بأيام عدم السريان
                    ...(b.quickInterventions || []).filter(qi => qi.name).map(qi => {
                        const age = daysBetween(b.startDate, qi.date);
                        return { name: qi.name, from: age, to: age + 2, kind: qi.type === 'water' ? 'ماء' : 'علف' };
                    }),
                ];
                items.forEach(a => {
                    // ============ سريان فعلي (من additiveExecLog) بدل السريان المخطط، لو متاح كفاية بيانات ============
                    // البند المجدول (feedAdditives/waterAdditives) وليه id بنقارن أيام السريان الحقيقية (تنفيذ فعلي مسجَّل)
                    // بدل افتراض إن كل يوم داخل نطاق الجدول = سريان. لو التنفيذ الفعلي أقل من عتبة موثوقة (تأخير/تفويت/دفعة
                    // قديمة قبل وجود سجل تنفيذ)، نرجع لسلوك النطاق المخطط القديم كـfallback بدل ما البند يختفي من التحليل.
                    let activeAges = null;
                    if (a.id) {
                        const execAges = [...new Set((b.additiveExecLog || [])
                            .filter(e => e.additiveId === a.id)
                            .map(e => daysBetween(b.startDate, e.date)))];
                        if (execAges.length >= 3) activeAges = new Set(execAges);
                    }
                    const isActive = activeAges ? (age => activeAges.has(age)) : (age => additiveActiveOnDay(a, age));
                    const activeDays = dailyPerf.filter(d => isActive(d.age));
                    const inactiveDays = dailyPerf.filter(d => !isActive(d.age));
                    if (activeDays.length < 3 || inactiveDays.length < 3) return; // مش كفاية بيانات فى هذه الدورة تحديدًا
                    const stage = dominantStageLabel(activeDays) || '—';
                    const key = a.name + ' (' + a.kind + ') · ' + stage;
                    const as = perfWindowStats(activeDays), is = perfWindowStats(inactiveDays);
                    // تكلفة تقديرية: فواتير شراء من نوع "إضافات" فى نفس الدفعة اسمها يطابق اسم البند تقريبيًا
                    const nA = normalizeArabicName(a.name);
                    const cost = (b.purchases || []).filter(p => p.type === 'إضافات' && normalizeArabicName(p.desc || '').includes(nA))
                        .reduce((s, p) => s + (p.total || 0), 0) || null;
                    if (!itemCycles[key]) itemCycles[key] = [];
                    itemCycles[key].push({
                        batchId: b.id,
                        mortDiff: (is.mortRate != null && as.mortRate != null) ? (is.mortRate - as.mortRate) : null,   // موجب = تحسّن (نفوق أقل وقت السريان)
                        weightDiff: (as.avgDev != null && is.avgDev != null) ? (as.avgDev - is.avgDev) : null,        // موجب = تحسّن (وزن أعلى من المعيار وقت السريان)
                        fcrDiff: (as.periodFcr != null && is.periodFcr != null) ? (is.periodFcr - as.periodFcr) : null, // موجب = تحسّن (معدل تحويل أفضل وقت السريان)
                        cost,
                    });
                });
            });
            const rows = Object.keys(itemCycles).map(key => {
                const cyclesData = itemCycles[key];
                if (cyclesData.length < 2) return null; // لازم يتكرر فى دورتين على الأقل عشان يبقى نمط لا ملاحظة عابرة
                const mortC = classifyCrossCycleDiffs(cyclesData.map(c => c.mortDiff), CROSS_CYCLE_THRESH.mort);
                const weightC = classifyCrossCycleDiffs(cyclesData.map(c => c.weightDiff), CROSS_CYCLE_THRESH.weight);
                const fcrC = classifyCrossCycleDiffs(cyclesData.map(c => c.fcrDiff), CROSS_CYCLE_THRESH.fcr);
                const { verdict, verdictLabel } = verdictFromMetrics(mortC, weightC, fcrC);
                const costVals = cyclesData.map(c => c.cost).filter(v => v != null);
                const avgCostPerCycle = costVals.length ? costVals.reduce((s, v) => s + v, 0) / costVals.length : null;
                return { name: key, cycles: cyclesData.length, mortC, weightC, fcrC, verdict, verdictLabel, avgCostPerCycle, costCycles: costVals.length };
            }).filter(Boolean);
            if (!rows.length) return null;
            const order = { worsen: 0, improve: 1, mixed: 2, none: 3 };
            return rows.sort((a, c) => order[a.verdict] - order[c.verdict]);
        }

        // ============ نفس فكرة الاستمرارية عبر الدورات، لكن على معاملات الفرشة/السبلة المنفَّذة (رش/تقليب/تعقيم) ============
        // لكل معاملة اتنفذت فى دورتين فأكتر: مقارنة 3 أيام قبل/بعد التنفيذ على النفوق والوزن ومعدل التحويل،
        // لكل دورة على حدة، ونفس محرك التصنيف بتاع الإضافات (دايمًا بيفرق / متفاوت / بدون تأثير)
        function computeCrossCycleTreatmentEffectiveness(species) {
            const archived = state.batches.filter(b => b.species === species && b.status === 'مؤرشفة' && b.records && b.records.length >= 6);
            if (archived.length < 2) return null;
            const itemCycles = {};
            archived.forEach(b => {
                const m = computeMetrics(b);
                const dailyPerf = buildBatchDailyPerf(b, m);
                const doneTreatments = (b.treatmentLog || []).filter(t => t.done && t.doneDate);
                doneTreatments.forEach(t => {
                    const doneAge = daysBetween(b.startDate, t.doneDate);
                    const before = dailyPerf.filter(d => d.age >= doneAge - 3 && d.age < doneAge);
                    const after = dailyPerf.filter(d => d.age > doneAge && d.age <= doneAge + 3);
                    if (before.length < 2 || after.length < 2) return;
                    const bs = perfWindowStats(before), as = perfWindowStats(after);
                    if (!itemCycles[t.name]) itemCycles[t.name] = [];
                    itemCycles[t.name].push({
                        batchId: b.id,
                        mortDiff: (bs.mortRate != null && as.mortRate != null) ? (bs.mortRate - as.mortRate) : null,
                        weightDiff: (as.avgDev != null && bs.avgDev != null) ? (as.avgDev - bs.avgDev) : null,
                        fcrDiff: (bs.periodFcr != null && as.periodFcr != null) ? (bs.periodFcr - as.periodFcr) : null,
                    });
                });
            });
            const rows = Object.keys(itemCycles).map(name => {
                const cyclesData = itemCycles[name];
                if (cyclesData.length < 2) return null;
                const mortC = classifyCrossCycleDiffs(cyclesData.map(c => c.mortDiff), CROSS_CYCLE_THRESH.mort);
                const weightC = classifyCrossCycleDiffs(cyclesData.map(c => c.weightDiff), CROSS_CYCLE_THRESH.weight);
                const fcrC = classifyCrossCycleDiffs(cyclesData.map(c => c.fcrDiff), CROSS_CYCLE_THRESH.fcr);
                const { verdict, verdictLabel } = verdictFromMetrics(mortC, weightC, fcrC);
                return { name, cycles: cyclesData.length, mortC, weightC, fcrC, verdict, verdictLabel };
            }).filter(Boolean);
            if (!rows.length) return null;
            const order = { worsen: 0, improve: 1, mixed: 2, none: 3 };
            return rows.sort((a, c) => order[a.verdict] - order[c.verdict]);
        }

        // ============ نفس فكرة الاستمرارية عبر الدورات، لكن على شحنات/موردي العلف (وليس دفعة واحدة فقط) ============
        // بتجمع شحنات العلف حسب "المورد" (أدق من رقم اللوط اللي بيتغير كل مرة) عبر كل الدورات المؤرشفة، وتقارن
        // أداء فترات كل مورد بباقي فترات نفس الدورة — نفس محرك التصنيف بتاع الإضافات
        function computeCrossCycleFeedLotEffectiveness(species) {
            const archived = state.batches.filter(b => b.species === species && b.status === 'مؤرشفة' && b.records && b.records.length >= 6);
            if (archived.length < 2) return null;
            const itemCycles = {};
            archived.forEach(b => {
                const m = computeMetrics(b);
                const dailyPerf = buildBatchDailyPerf(b, m);
                const feedPurchases = (b.purchases || []).filter(p => p.type === 'علف' && p.supplier)
                    .map(p => ({ date: p.date, supplier: p.supplier }))
                    .sort((a, c) => a.date.localeCompare(c.date));
                const uniqueSup = [];
                feedPurchases.forEach(fp => { if (!uniqueSup.length || uniqueSup[uniqueSup.length - 1].supplier !== fp.supplier) uniqueSup.push(fp); });
                if (uniqueSup.length < 2) return; // محتاج أكتر من مورد اتجرب فى نفس الدورة عشان تبقى مقارنة فعلية
                uniqueSup.forEach((sp, i) => {
                    const startDate = sp.date;
                    const endDate = (i < uniqueSup.length - 1) ? uniqueSup[i + 1].date : null;
                    const segRecs = b.records.filter(r => r.date >= startDate && (!endDate || r.date < endDate));
                    if (segRecs.length < 2) return;
                    const segAges = new Set(segRecs.map(r => r.age));
                    const inSeg = dailyPerf.filter(d => segAges.has(d.age));
                    const outSeg = dailyPerf.filter(d => !segAges.has(d.age));
                    if (inSeg.length < 2 || outSeg.length < 2) return;
                    const is = perfWindowStats(inSeg), os = perfWindowStats(outSeg);
                    if (!itemCycles[sp.supplier]) itemCycles[sp.supplier] = [];
                    itemCycles[sp.supplier].push({
                        batchId: b.id,
                        mortDiff: (os.mortRate != null && is.mortRate != null) ? (os.mortRate - is.mortRate) : null,
                        weightDiff: (is.avgDev != null && os.avgDev != null) ? (is.avgDev - os.avgDev) : null,
                        fcrDiff: (is.periodFcr != null && os.periodFcr != null) ? (os.periodFcr - is.periodFcr) : null,
                    });
                });
            });
            const rows = Object.keys(itemCycles).map(name => {
                const cyclesData = itemCycles[name];
                if (cyclesData.length < 2) return null;
                const mortC = classifyCrossCycleDiffs(cyclesData.map(c => c.mortDiff), CROSS_CYCLE_THRESH.mort);
                const weightC = classifyCrossCycleDiffs(cyclesData.map(c => c.weightDiff), CROSS_CYCLE_THRESH.weight);
                const fcrC = classifyCrossCycleDiffs(cyclesData.map(c => c.fcrDiff), CROSS_CYCLE_THRESH.fcr);
                const { verdict, verdictLabel } = verdictFromMetrics(mortC, weightC, fcrC);
                return { name, cycles: cyclesData.length, mortC, weightC, fcrC, verdict, verdictLabel };
            }).filter(Boolean);
            if (!rows.length) return null;
            const order = { worsen: 0, improve: 1, mixed: 2, none: 3 };
            return rows.sort((a, c) => order[a.verdict] - order[c.verdict]);
        }

        // ============ أفضل موسم/شهر بدء تربية حسب أداء الدورات التاريخية الفعلي (EPEF/FCR/نفوق/ربح) — مختلف عن موسمية سعر البيع ============
        // بيكشف موسمية الأداء الإنتاجي نفسه (تأثير الطقس/الرطوبة الموسمي على مزرعتك بالذات)، مش موسمية السوق
        // ============ ملخص "توصيات الدورة القادمة" — بيتولد أوتوماتيك عند أرشفة كل دورة ============
        // بيجمع فى رسالة واحدة أفضل موسم بدء، أفضل مورد علف، والإضافات/المعاملات المستحقة الاستمرار
        // أو المقترح إلغاؤها — بدل ما تدور على نفس المعلومة دي متفرقة فى كذا قسم تحليل منفصل
        // ============ 🔒 تحصين: سطر إحصائي صريح بالأرقام لكل بند (مورد علف / إضافة / معاملة) — بدل حكم عام بلا رقم ============
        // الإشارة موحّدة: mortC.avg/weightC.avg/fcrC.avg موجب = تحسّن، سالب = تراجع (راجع تعليقات الدوال المصدر لهذه القيم)
        function crossCycleStatLine(r) {
            const parts = [];
            if (r.weightC && r.weightC.n) {
                const v = r.weightC.avg;
                parts.push(`الوزن ${v >= 0 ? 'تحسّن' : 'تراجع'} بمتوسط ${v >= 0 ? '+' : '-'}${fmt(Math.abs(v), 1)}% انحراف عن المعياري (${r.weightC.improved} من ${r.weightC.n} دورة تحسّنت)`);
            }
            if (r.fcrC && r.fcrC.n) {
                const v = r.fcrC.avg;
                parts.push(`معدل التحويل ${v >= 0 ? 'تحسّن' : 'تراجع'} بمتوسط ${fmt(Math.abs(v), 2)} نقطة (${r.fcrC.improved} من ${r.fcrC.n} دورة تحسّنت)`);
            }
            if (r.mortC && r.mortC.n) {
                const v = r.mortC.avg;
                parts.push(`النفوق ${v >= 0 ? 'قلّ' : 'زاد'} بمتوسط ${fmt(Math.abs(v), 2)} طائر/يوم (${r.mortC.improved} من ${r.mortC.n} دورة تحسّنت)`);
            }
            return parts.join(' · ');
        }
        function buildNextCycleRecommendations(species) {
            const lines = [];
            const season = computePerformanceSeasonality();
            if (season && season.best) {
                const worstTxt = season.worst && season.worst.month !== season.best.month
                    ? ` (مقابل ${season.worst.label} كأضعف شهر بمتوسط EPEF ${fmt(season.worst.avgEpef,0)}، من ${season.worst.count} دورة)` : '';
                lines.push(`📅 أفضل شهر بدء تاريخيًا حسب أدائك الفعلي: ${season.best.label} — متوسط EPEF ${fmt(season.best.avgEpef,0)} من ${season.best.count} دورة${worstTxt}`);
            }
            const lots = computeCrossCycleFeedLotEffectiveness(species);
            if (lots) {
                const goodLots = lots.filter(r => r.verdict === 'improve');
                const badLots = lots.filter(r => r.verdict === 'worsen');
                goodLots.forEach(r => lines.push(`🌾✅ مورد "${r.name}" يستحق الاستمرار — ${crossCycleStatLine(r)}`));
                badLots.forEach(r => lines.push(`🌾⚠️ مورد "${r.name}" يستحق المراجعة — ${crossCycleStatLine(r)}`));
            }
            const items = computeCrossCycleItemEffectiveness(species);
            if (items) {
                const goodItems = items.filter(r => r.verdict === 'improve');
                const dropItems = items.filter(r => r.verdict === 'worsen' || r.verdict === 'none');
                goodItems.forEach(r => {
                    const costTxt = r.avgCostPerCycle != null ? ` — تكلفة تقديرية ${money(r.avgCostPerCycle)}/دورة` : '';
                    lines.push(`💊✅ "${r.name}" يستحق الاستمرار — ${crossCycleStatLine(r)}${costTxt}`);
                });
                dropItems.forEach(r => {
                    const costTxt = r.avgCostPerCycle != null ? ` — توفير تقديري ${money(r.avgCostPerCycle)}/دورة لو أُلغي` : '';
                    const reasonTxt = r.verdict === 'none' ? 'بدون تأثير يُذكر' : 'أثره سلبي بوضوح';
                    lines.push(`💊🚫 "${r.name}" يُقترح إلغاؤه (${reasonTxt}) — ${crossCycleStatLine(r)}${costTxt}`);
                });
            }
            const treatments = computeCrossCycleTreatmentEffectiveness(species);
            if (treatments) {
                const goodT = treatments.filter(r => r.verdict === 'improve');
                goodT.forEach(r => lines.push(`🪣 معاملة "${r.name}" أثبتت فائدتها بتوقيتها الحالي — ${crossCycleStatLine(r)}`));
            }
            if (!lines.length) return null;
            return lines.join('\n\n');
        }


        function computePerformanceSeasonality() {
            const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
            const archived = state.batches.filter(b => b.status === 'مؤرشفة' && b.records && b.records.length >= 5);
            const byMonth = {};
            archived.forEach(b => {
                const month = parseInt((b.startDate || '').slice(5, 7), 10) - 1;
                if (isNaN(month)) return;
                const m = computeMetrics(b);
                if (m.epef == null) return;
                const fin = computeFinance(b, m);
                (byMonth[month] = byMonth[month] || []).push({ epef: m.epef, fcr: m.fcr, mortRate: m.mortRate, profit: fin.netProfit });
            });
            const months = Object.keys(byMonth).map(Number);
            if (months.length < 2) return null; // محتاج بيانات من شهرين مختلفين على الأقل
            const rows = months.map(mo => {
                const list = byMonth[mo];
                const avg = key => list.reduce((s, x) => s + (x[key] || 0), 0) / list.length;
                return { month: mo, label: monthNames[mo], count: list.length, avgEpef: avg('epef'), avgFcr: avg('fcr'), avgMort: avg('mortRate'), avgProfit: avg('profit') };
            }).sort((a, c) => c.avgEpef - a.avgEpef);
            const totalCycles = rows.reduce((s, r) => s + r.count, 0);
            if (totalCycles < 4) return null; // عينة صغيرة جدًا لتكون مؤشرًا موثوقًا
            return { rows, best: rows[0], worst: rows[rows.length - 1] };
        }

        // ============ أثر وزن/تجانس الكتاكيت عند الاستلام (أول 3 أيام) على EPEF النهائي — عبر كل الدورات المؤرشفة ============
        function computeArrivalQualityAnalysis() {
            const archived = state.batches.filter(b => b.status === 'مؤرشفة' && b.records && b.records.length >= 5);
            const rows = [];
            archived.forEach(b => {
                const early = [...b.records].filter(r => r.age <= 3 && r.weight != null).sort((a, c) => a.age - c.age)[0];
                if (!early) return;
                const stdEarly = getRefValue(b, 'weight', early.age) || 0;
                if (!stdEarly) return;
                const arrivalDiffPct = ((early.weight - stdEarly) / stdEarly) * 100;
                const earlySample = [...b.records].filter(r => r.age <= 5 && r.weightSample && r.weightSample.length >= 3).sort((a, c) => a.age - c.age)[0];
                const uni = earlySample ? computeUniformity(earlySample.weightSample) : null;
                const m = computeMetrics(b);
                if (m.epef == null) return;
                rows.push({ name: b.name, arrivalAge: early.age, arrivalWeight: early.weight, arrivalDiffPct, uniCv: uni ? uni.cv : null, epef: m.epef, fcr: m.fcr, mortRate: m.mortRate });
            });
            if (rows.length < 4) return null; // محتاج عدد دورات معقول لظهور علاقة موثوقة
            const corr = pearsonCorr(rows.map(r => r.arrivalDiffPct), rows.map(r => r.epef));
            return { rows: rows.sort((a, c) => c.epef - a.epef), corr, count: rows.length };
        }

        // ============ الكثافة المثلى تاريخيًا: مقارنة أقصى كثافة تربية استُخدمت فعليًا فى كل دورة سابقة بأدائها النهائي ============
        // بيكشف "أفضل كثافة" مجرّبة فعليًا فى مزرعتك، مش بس الحد الأقصى النظري لنظام التهوية
        function computeDensityPerformanceAnalysis() {
            const archived = state.batches.filter(b => b.status === 'مؤرشفة' && b.records && b.records.length >= 5 && b.area > 0);
            const rows = archived.map(b => {
                const m = computeMetrics(b);
                if (m.epef == null) return null;
                const effArea = getEffectiveFloorArea(b);
                const densities = m.series.map(r => (effArea > 0 && r.biomassKg > 0) ? r.biomassKg / effArea : 0).filter(v => v > 0);
                if (!densities.length) return null;
                const maxDensity = Math.max(...densities);
                return { name: b.name, maxDensity, epef: m.epef, fcr: m.fcr, mortRate: m.mortRate };
            }).filter(Boolean);
            if (rows.length < 4) return null;
            const corr = pearsonCorr(rows.map(r => r.maxDensity), rows.map(r => r.epef));
            return { rows: rows.sort((a, c) => a.maxDensity - c.maxDensity), corr, count: rows.length };
        }

        // ============ ربط الالتزام بتشيك ليست العمليات/الأمان الحيوي بالنتيجة النهائية (نفوق) عبر كل الدورات المؤرشفة ============
        // تُحسب من نفس checklistLog/biosecurityLog المحفوظة أصلاً — تشتغل حتى على دورات اتؤرشفت قبل إضافة هذا التحليل
        function computeComplianceMortalityAnalysis() {
            const archived = state.batches.filter(b => b.status === 'مؤرشفة' && b.records && b.records.length >= 5);
            const rows = archived.map(b => {
                const ops = computeFinalOpsCompliance(b);
                if (ops.checklistAvgPct == null) return null;
                const m = computeMetrics(b);
                return { name: b.name, checklistAvgPct: ops.checklistAvgPct, bioActionsPerWeek: ops.bioActionsPerWeek, mortRate: m.mortRate };
            }).filter(Boolean);
            if (rows.length < 4) return null;
            const corr = pearsonCorr(rows.map(r => r.checklistAvgPct), rows.map(r => r.mortRate));
            return { rows: rows.sort((a, c) => c.checklistAvgPct - a.checklistAvgPct), corr, count: rows.length };
        }

        // ============ ربط سجل الطقس الداخلي الفعلي (حرارة/رطوبة العنبر المُسجَّلة يوميًا) بالنفوق تاريخيًا حسب الشهر — عبر كل الدورات المؤرشفة ============
        // بيستخدم القراءات الداخلية الفعلية (tempDay/tempNight) وليس توقعات الطقس الخارجية، لأن الإجهاد الحراري الحقيقي على الطيور بيتحدد بالتهوية جوه العنبر
        // ============ تحليل "الأسبوع الحرج" — أنهي أسبوع عمري بيبقى فيه أعلى تفاوت (عدم استقرار) فى النفوق تاريخيًا فى مزرعتك تحديدًا لهذا النوع ============
        // مش بس "أعلى نفوق فى المتوسط" (ده موجود فى تحليلات تانية)، وإنما أعلى TAFAWUT بين الدورات نفسها — يعني الأسبوع اللي نتيجته أقل قابلية للتنبؤ وتستاهل انتباه إضافي
        function computeCriticalWeekAnalysis(species) {
            const archived = state.batches.filter(b => b.species === species && b.status === 'مؤرشفة' && b.records && b.records.length >= 14);
            if (archived.length < 4) return null;
            const weekData = {};
            archived.forEach(b => {
                const m = computeMetrics(b);
                const maxWeek = Math.ceil((m.todayAge || 0) / 7);
                for (let w = 1; w <= maxWeek; w++) {
                    const from = (w - 1) * 7 + 1, to = w * 7;
                    const weekRecs = m.series.filter(r => r.age >= from && r.age <= to && r.age > 0);
                    if (weekRecs.length < 3) continue;
                    const mortSum = weekRecs.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0);
                    const avgLive = weekRecs.reduce((s, r) => s + r.liveCount, 0) / weekRecs.length;
                    const mortRateWeek = avgLive > 0 ? (mortSum / avgLive) * 100 : null;
                    if (mortRateWeek == null) continue;
                    if (!weekData[w]) weekData[w] = [];
                    weekData[w].push(mortRateWeek);
                }
            });
            const rows = Object.keys(weekData).map(Number).map(w => {
                const vals = weekData[w];
                if (vals.length < 3) return null;
                const meanMort = vals.reduce((s, v) => s + v, 0) / vals.length;
                const sdMort = stdDev(vals);
                const cv = meanMort > 0.05 ? (sdMort / meanMort) : null; // معامل الاختلاف = مقياس عدم الاستقرار، مستقل عن حجم الرقم نفسه
                return { week: w, meanMort, sdMort, cv, count: vals.length };
            }).filter(Boolean).sort((a, c) => (c.cv || 0) - (a.cv || 0));
            if (rows.length < 2) return null;
            return { rows, worst: rows[0] };
        }

        // ============ انحدار خطي بسيط بمتغير واحد (لتوقع EPEF من الكثافة المخططة فى محاكي ما قبل الدورة) ============
        function simpleLinReg(xs, ys) {
            const n = xs.length;
            if (n < 3) return null;
            const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
            let num = 0, den = 0;
            for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
            if (den === 0) return null;
            const slope = num / den, intercept = my - slope * mx;
            return { slope, intercept, n };
        }
        // ============ محاكي ما قبل الدورة (توأم رقمي) — توقع EPEF وربح الطائر لكثافة وشهر بدء مخططين، قبل بدء الدفعة فعليًا ============
        // يدمج إشارتين مستقلتين من تاريخ مزرعتك: (1) علاقة الكثافة بـ EPEF عبر الدورات، (2) موسمية الأداء حسب شهر البدء،
        // ثم يستخدم نموذج انحدار "أهم عوامل الربح" (لو متاح) لترجمة كل ده لربح متوقع للطائر
        function computePreCycleForecast(plannedDensity, plannedMonth) {
            const densityPerf = computeDensityPerformanceAnalysis();
            let epefFromDensity = null;
            if (densityPerf && densityPerf.rows.length >= 4) {
                const reg = simpleLinReg(densityPerf.rows.map(r => r.maxDensity), densityPerf.rows.map(r => r.epef));
                if (reg) epefFromDensity = reg.intercept + reg.slope * plannedDensity;
            }
            const perfSeason = computePerformanceSeasonality();
            const seasonRow = (perfSeason && plannedMonth != null) ? perfSeason.rows.find(r => r.month === plannedMonth) : null;
            let expectedEpef = null;
            if (epefFromDensity != null && seasonRow) expectedEpef = (epefFromDensity + seasonRow.avgEpef) / 2;
            else expectedEpef = epefFromDensity != null ? epefFromDensity : (seasonRow ? seasonRow.avgEpef : null);
            let expectedProfitPerBird = null;
            const profitAttr = computeProfitAttributionAnalysis();
            if (profitAttr) {
                const checklistAvg = profitAttr.rows.reduce((s, r) => s + r.checklistPct, 0) / profitAttr.rows.length;
                const mortForCalc = seasonRow ? seasonRow.avgMort : (profitAttr.rows.reduce((s, r) => s + r.mortRate, 0) / profitAttr.rows.length);
                // نفس ترتيب predictorDefs الأصلي فى computeProfitAttributionAnalysis: الكثافة، الالتزام%، انحراف الاستلام%، النفوق%
                const orderedVals = [plannedDensity, checklistAvg, 0, mortForCalc];
                expectedProfitPerBird = profitAttr.reg.intercept + profitAttr.reg.coefs.reduce((s, c, i) => s + c * orderedVals[i], 0);
            }
            if (expectedEpef == null && expectedProfitPerBird == null) return null;
            return { expectedEpef, expectedProfitPerBird, epefFromDensity, seasonRow,
                densityN: densityPerf ? densityPerf.rows.length : 0, profitN: profitAttr ? profitAttr.n : 0 };
        }
        function runPreCycleForecast() {
            const box = document.getElementById('preCycleResult');
            if (!box) return;
            const density = parseFloat(document.getElementById('pc_density').value);
            const month = parseInt(document.getElementById('pc_month').value, 10);
            if (isNaN(density) || density <= 0) { box.innerHTML = `<div class="day" style="color:var(--red);">دخّل الكثافة المخططة الأول.</div>`; return; }
            const fc = computePreCycleForecast(density, month);
            if (!fc) { box.innerHTML = `<div class="day" style="color:var(--muted);">لسه مفيش دورات مؤرشفة كافية فى مزرعتك لبناء توقع موثوق (محتاج 4 دورات على الأقل).</div>`; return; }
            const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
            box.innerHTML = `
                ${fc.expectedEpef!=null?`${statLine(`EPEF متوقع`, `${fmt(fc.expectedEpef,0)}`, {vStyle:`font-weight:900;`})}`:''}
                ${fc.expectedProfitPerBird!=null?`${statLine(`ربح متوقع للطائر`, `${money(fc.expectedProfitPerBird)}`, {vStyle:`font-weight:900;color:${fc.expectedProfitPerBird>=0?'var(--green)':'var(--red)'};`})}`:''}
                ${fc.seasonRow?`<div class="day" style="margin-top:4px;">مبني جزئيًا على أداء دوراتك السابقة اللي بدأت فى ${monthNames[month]} (${fc.seasonRow.count} دورة)</div>`:''}
                <div class="day" style="margin-top:2px;color:var(--muted);">مبني على ${fc.densityN} دورة (علاقة الكثافة) و${fc.profitN} دورة (نموذج الربح) — دقة تقريبية تزيد مع تراكم بياناتك</div>`;
        }

        // ============ ترتيب أهم العوامل المؤثرة على "ربح الطائر" عبر كل الدورات المؤرشفة — انحدار متعدد يفصل أثر كل عامل عن التانى ============
        // نفس منطق envMultiRegression (فصل الحرارة/الرطوبة/الأمونيا) لكن هنا النتيجة هي الربح، والعوامل: الكثافة، الالتزام بالعمليات، جودة الاستلام، النفوق
        function computeProfitAttributionAnalysis() {
            const archived = state.batches.filter(b => b.status === 'مؤرشفة' && b.records && b.records.length >= 5);
            const rows = [];
            archived.forEach(b => {
                const m = computeMetrics(b);
                if (m.epef == null) return;
                const fin = computeFinance(b, m);
                if (!fin || fin.profitPerBird == null) return;
                const ops = computeFinalOpsCompliance(b);
                if (ops.checklistAvgPct == null) return;
                let maxDensity = null;
                if (b.area > 0) {
                    const effArea = getEffectiveFloorArea(b);
                    const densities = m.series.map(r => (effArea > 0 && r.biomassKg > 0) ? r.biomassKg / effArea : 0).filter(v => v > 0);
                    if (densities.length) maxDensity = Math.max(...densities);
                }
                if (maxDensity == null) return;
                const early = [...b.records].filter(r => r.age <= 3 && r.weight != null).sort((a,c)=>a.age-c.age)[0];
                let arrivalDiffPct = null;
                if (early) {
                    const stdEarly = getRefValue(b, 'weight', early.age) || 0;
                    if (stdEarly) arrivalDiffPct = ((early.weight - stdEarly) / stdEarly) * 100;
                }
                if (arrivalDiffPct == null) return;
                rows.push({ name: b.name, profitPerBird: fin.profitPerBird, density: maxDensity, checklistPct: ops.checklistAvgPct, arrivalDiffPct, mortRate: m.mortRate });
            });
            if (rows.length < 6) return null; // محتاجين عدد دورات معقول عشان 4 متغيرات فى نفس الوقت يبقى لها معنى
            const predictorDefs = [
                { key: 'density', label: 'الكثافة القصوى (كجم/م²)' },
                { key: 'checklistPct', label: 'الالتزام بتشيك ليست العمليات (%)' },
                { key: 'arrivalDiffPct', label: 'انحراف وزن الاستلام عن المعياري (%)' },
                { key: 'mortRate', label: 'معدل النفوق (%)' },
            ];
            const predictorArrays = predictorDefs.map(d => rows.map(r => r[d.key]));
            const yArr = rows.map(r => r.profitPerBird);
            const reg = multiLinearRegression(predictorArrays, yArr);
            if (!reg) return null;
            const sdY = stdDev(yArr);
            const avgProfitPerBird = yArr.reduce((s, v) => s + v, 0) / yArr.length;
            const factors = predictorDefs.map((d, i) => {
                const arr = predictorArrays[i];
                const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
                const sdX = stdDev(arr);
                const stdCoef = (sdX && sdY) ? (reg.coefs[i] * sdX / sdY) : 0;
                return { key: d.key, label: d.label, coef: reg.coefs[i], stdCoef, mean, sd: sdX };
            }).sort((a, c) => Math.abs(c.stdCoef) - Math.abs(a.stdCoef));
            return { rows, reg, factors, r2: reg.r2, n: rows.length, avgProfitPerBird };
        }

        function computeWeatherMortalityHistory() {
            const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
            const archived = state.batches.filter(b => b.status === 'مؤرشفة' && b.records && b.records.length >= 5);
            const byMonth = {};
            archived.forEach(b => {
                b.records.forEach(r => {
                    if (r.age <= 0) return;
                    const month = parseInt((r.date || '').slice(5, 7), 10) - 1;
                    if (isNaN(month)) return;
                    if (!byMonth[month]) byMonth[month] = { mortSum: 0, dayCount: 0, tempSum: 0, tempCount: 0 };
                    byMonth[month].mortSum += (r.mort || 0) + (r.cull || 0);
                    byMonth[month].dayCount++;
                    const t = avgOf(r.tempDay, r.tempNight);
                    if (t != null) { byMonth[month].tempSum += t; byMonth[month].tempCount++; }
                });
            });
            const months = Object.keys(byMonth).map(Number);
            if (months.length < 3) return null;
            const rows = months.map(mo => {
                const d = byMonth[mo];
                return { month: mo, label: monthNames[mo], avgMortPerDay: d.dayCount ? d.mortSum / d.dayCount : 0, avgTemp: d.tempCount ? d.tempSum / d.tempCount : null, dayCount: d.dayCount };
            }).filter(r => r.dayCount >= 5).sort((a, c) => c.avgMortPerDay - a.avgMortPerDay);
            if (rows.length < 3) return null;
            return { rows, worst: rows[0], best: rows[rows.length - 1] };
        }

        function drawTrendCharts() {
            const hist = computeHistoricalSeries();
            if (hist.length < 2) return;
            const labels = hist.map(h => h.name.length > 10 ? h.name.slice(0, 10) + '…' : h.name);
            drawLineChart('chartTrendFCR', labels, [{ data: hist.map(h => h.fcr), color: '#B45A2E', fill: true,
                fillTop: 'rgba(180,90,46,.28)', fillBottom: 'rgba(180,90,46,.02)' }]);
            drawLineChart('chartTrendROI', labels, [{ data: hist.map(h => h.roi), color: '#2C7A4B', fill: true,
                fillTop: 'rgba(44,122,75,.28)', fillBottom: 'rgba(44,122,75,.02)' }]);
            drawLineChart('chartTrendProfit', labels, [{ data: hist.map(h => h.profit), color: '#D9A544', fill: true,
                fillTop: 'rgba(217,165,68,.30)', fillBottom: 'rgba(217,165,68,.02)' }]);
        }

        // ============ الطقس وتقدير الإجهاد الحراري (Open-Meteo — بدون مفتاح API) ============
        let weatherLoading = false;
        let weatherResult = null; // { tempMax, humidityMax, fetchedAt } أو { error }

        function setFarmLocation() {
            if (!navigator.geolocation) { showToast('⚠️ المتصفح لا يدعم تحديد الموقع تلقائيًا (شائع لو الملف مفتوح مباشرة بدون رابط https) — استخدم البحث بالاسم بالأسفل بدلًا منه'); document.getElementById('locSearchBox').style.display=''; return; }
            showToast('📍 جارٍ تحديد الموقع...');
            navigator.geolocation.getCurrentPosition(pos => {
                setState('farmLocation', { lat: pos.coords.latitude, lon: pos.coords.longitude });
                persist();
                showToast('✅ تم حفظ موقع المزرعة');
                render();
            }, () => { showToast('❌ تعذّر تحديد الموقع تلقائيًا — استخدم البحث بالاسم بالأسفل'); document.getElementById('locSearchBox').style.display=''; }, { timeout: 10000 });
        }
        // ============ بديل لتحديد الموقع بدون GPS: بحث بالاسم عبر خدمة Open-Meteo المجانية للترميز الجغرافي (بدون مفتاح API) ============
        async function searchFarmLocationByName() {
            const q = document.getElementById('locSearchInput').value.trim();
            if (!q) { showToast('⚠️ اكتب اسم المدينة/المنطقة'); return; }
            const box = document.getElementById('locSearchResults');
            box.innerHTML = '⏳ جارٍ البحث...';
            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=ar&format=json`);
                const data = await res.json();
                if (!data.results || !data.results.length) { box.innerHTML = '<div style="font-size:12px;color:var(--muted);">لا توجد نتائج — جرّب اسمًا أدق أو بالإنجليزية</div>'; return; }
                box.innerHTML = data.results.map(r => `<div class="check-row" style="cursor:pointer;" onclick="pickSearchedLocation(${r.latitude},${r.longitude},'${esc(r.name)}')"><div class="txt"><div style="font-weight:700;">📍 ${esc(r.name)}${r.admin1?', '+esc(r.admin1):''}</div><div class="day">${esc(r.country||'')}</div></div></div>`).join('');
            } catch (e) { box.innerHTML = '<div style="font-size:12px;color:var(--red);">❌ تعذّر البحث — تأكد من الاتصال بالإنترنت</div>'; }
        }
        function pickSearchedLocation(lat, lon, name) {
            setState('farmLocation', { lat, lon });
            persist();
            showToast(`✅ تم حفظ الموقع: ${name}`);
            document.getElementById('locSearchResults').innerHTML = '';
            document.getElementById('locSearchInput').value = '';
            render();
        }
        function saveManualLatLon() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const lat = parseFloat(document.getElementById('locManualLat').value);
            const lon = parseFloat(document.getElementById('locManualLon').value);
            if (isNaN(lat) || isNaN(lon)) { showToast('⚠️ اكتب خط عرض وطول صحيحين'); return; }
            setState('farmLocation', { lat, lon });
            persist();
            showToast('✅ تم حفظ الموقع يدويًا');
            render();
        }

        // يحسب وقت التجهيز المقترح (HH:MM) قبل ساعة معينة بعدد ساعات محدد — لاقتراح توقيت تنفيذ دقيق قبل ذروة الحرارة
        function prepTimeBefore(peakTimeStr, hoursBefore) {
            if (!peakTimeStr) return null;
            const [h, mnt] = peakTimeStr.split(':').map(Number);
            if (isNaN(h)) return null;
            let newH = h - hoursBefore;
            if (newH < 0) newH += 24;
            return `${String(newH).padStart(2,'0')}:${String(mnt).padStart(2,'0')}`;
        }
        function clockLabel(timeStr) {
            if (!timeStr) return '';
            const [h, mnt] = timeStr.split(':').map(Number);
            const period = h >= 12 ? 'م' : 'ص';
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return `${h12}:${String(mnt).padStart(2,'0')} ${period}`;
        }

        async function checkWeatherAlert(silent) {
            if (!state.farmLocation) { if (!silent) showToast('⚠️ حدّد موقع المزرعة أولاً'); return; }
            weatherLoading = true; if (!silent) weatherResult = null;
            if (!silent) render();
            try {
                const { lat, lon } = state.farmLocation;
                // forecast_days=4 عشان يغطي اليوم + 3 أيام قادمة لجدول الاستعداد الاستباقي لموجات الحر/البرد
                // current=... عشان نجيب قراءة حرارة/رطوبة حقيقية آنية (مش بس توقع أعلى حرارة لليوم) تُعرض فى لوحة التحكم
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature&hourly=temperature_2m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`;
                const res = await fetch(url);
                const data = await res.json();
                if (!data || !data.hourly || !data.daily) throw new Error('بيانات غير متاحة');
                const tempMax = Math.max(...data.hourly.temperature_2m.slice(0, 24));
                const idxOfMax = data.hourly.temperature_2m.slice(0, 24).indexOf(tempMax);
                const humidityAtMax = data.hourly.relative_humidity_2m[idxOfMax];
                // وقت الذروة الحرارية الفعلي اليوم (HH:MM) — لاقتراح توقيت تنفيذ تبريد/تهوية دقيق بدل نصيحة عامة
                const peakTimeToday = (data.hourly.time && data.hourly.time[idxOfMax]) ? data.hourly.time[idxOfMax].slice(11, 16) : null;
                // القراءة الآنية الحقيقية (مش توقّع) — درجة الحرارة والرطوبة الفعليين الآن حسب أقرب محطة/نموذج طقس لموقع المزرعة
                const current = data.current ? {
                    temp: data.current.temperature_2m, humidity: data.current.relative_humidity_2m,
                    apparentTemp: data.current.apparent_temperature, time: data.current.time ? data.current.time.slice(11, 16) : null,
                } : null;
                // بناء جدول توقعات لكل يوم من الـ4 أيام (اليوم + 3 قادمين) — نستخدم أعلى رطوبة مسجلة وقت الذروة الحرارية لكل يوم
                const forecastDays = (data.daily.time || []).map((date, i) => {
                    const hStart = i * 24, hEnd = hStart + 24;
                    const hoursTemp = data.hourly.temperature_2m.slice(hStart, hEnd);
                    const hoursHum = data.hourly.relative_humidity_2m.slice(hStart, hEnd);
                    const hoursTime = (data.hourly.time || []).slice(hStart, hEnd);
                    let humidityAtDayMax = null, peakTime = null, minTime = null;
                    if (hoursTemp.length) {
                        const dMax = Math.max(...hoursTemp);
                        const idx = hoursTemp.indexOf(dMax);
                        humidityAtDayMax = hoursHum[idx];
                        peakTime = hoursTime[idx] ? hoursTime[idx].slice(11, 16) : null;
                        const dMin = Math.min(...hoursTemp);
                        const idxMin = hoursTemp.indexOf(dMin);
                        minTime = hoursTime[idxMin] ? hoursTime[idxMin].slice(11, 16) : null;
                    }
                    return { offset: i, date, tempMax: data.daily.temperature_2m_max[i], tempMin: data.daily.temperature_2m_min[i], humidityAtMax: humidityAtDayMax, peakTime, minTime };
                });
                weatherResult = { tempMax, humidityAtMax, peakTimeToday, current, fetchedAt: new Date().toISOString(), forecastDays };
                setState('farmWeatherForecast', { fetchedAt: weatherResult.fetchedAt, forecastDays });
                persist();
            } catch (e) {
                weatherResult = { error: '❌ تعذّر جلب بيانات الطقس. تأكد من الاتصال بالإنترنت.' };
            }
            weatherLoading = false;
            render();
        }

        // ============ جدول الاستعداد الاستباقي لموجات الحر/البرد (3 أيام قادمة) ============
        // بيقارن توقع حرارة/برودة كل يوم قادم بالمعياري المرجعي لعمر القطيع المتوقع فى نفس اليوم، ويقترح إجراء تجهيزي قبلها بوقت كافٍ
        function computeHeatColdPrepSchedule(b, m, forecastDays) {
            if (!b || !forecastDays || forecastDays.length < 2) return null;
            const rows = forecastDays.filter(d => d.offset >= 1 && d.offset <= 3).map(d => {
                const futureAge = m.todayAge + d.offset;
                const refTemp = getRefValue(b, 'temp', futureAge);
                let level = 'ok', action = '✅ ضمن المتوقع — لا حاجة لإجراء إضافي الآن';
                let diffHeat = null, diffCold = null;
                if (refTemp != null) {
                    diffHeat = d.tempMax - refTemp;
                    diffCold = refTemp - d.tempMin;
                    if (diffHeat >= 6 || (d.humidityAtMax >= 80 && d.tempMax >= 28)) {
                        level = 'heat';
                        const prepTime = prepTimeBefore(d.peakTime, 2);
                        action = `🌡️ جهّز التبريد/التهوية (مراوح، بادات، فتحات)${prepTime ? ` — ابدأ الساعة ${clockLabel(prepTime)} (قبل ذروة الحرارة المتوقعة الساعة ${clockLabel(d.peakTime)})` : ' الآن'}`;
                    } else if (diffCold >= 8) {
                        level = 'cold';
                        const coldPrepTime = prepTimeBefore(d.minTime, 2);
                        action = `❄️ جهّز وقود التدفئة وتأكد من عزل العنبر${coldPrepTime ? ` — ابدأ الساعة ${clockLabel(coldPrepTime)} (قبل أدنى حرارة متوقعة الساعة ${clockLabel(d.minTime)})` : ` قبل وصول الموجة بـ${d.offset} يوم`}`;
                    } else if (diffHeat >= 3) {
                        level = 'watch';
                        action = '👁️ راقب الوضع — فرق بسيط عن المعياري، جهّز التبريد احتياطًا';
                    }
                }
                return { ...d, futureAge, refTemp, diffHeat, diffCold, level, action };
            });
            return rows.length ? rows : null;
        }

        // ============ كارت مختصر للطقس فى لوحة التحكم — قراءة آنية حقيقية (حرارة/رطوبة الآن) + أعلى حرارة متوقعة اليوم، يتحدث تلقائيًا كل ساعة ============
        function renderDashboardWeatherCard(b, m) {
            if (!state.farmLocation) {
                return `<div class="card" style="margin-bottom:10px;padding:12px;text-align:center;">
                    <div style="font-size:12px;font-weight:800;">🌦️ الطقس والإجهاد الحراري</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:4px;">حدّد موقع المزرعة من تبويب "اليومي ← البيئة" لمتابعة الحرارة/الرطوبة الآنية والفعلية تلقائيًا هنا فى لوحة التحكم.</div>
                    <button class="btn ghost sm" style="margin-top:8px;" onclick="setFarmLocation()">📍 تحديد موقع المزرعة</button>
                </div>`;
            }
            if (weatherLoading && !weatherResult) {
                return `<div class="card" style="margin-bottom:10px;padding:12px;text-align:center;font-size:12px;color:var(--muted);">⏳ جارٍ جلب قراءة الطقس...</div>`;
            }
            if (!weatherResult || weatherResult.error) {
                return `<div class="card" style="margin-bottom:10px;padding:12px;text-align:center;">
                    <div style="font-size:12px;font-weight:800;">🌦️ الطقس والإجهاد الحراري</div>
                    <div style="font-size:11px;color:var(--red);margin-top:4px;">${weatherResult && weatherResult.error ? weatherResult.error : 'لسه ما اتجابتش قراءة الطقس'}</div>
                    <button class="btn ghost sm" style="margin-top:8px;" onclick="checkWeatherAlert()">🔄 تحديث الآن</button>
                </div>`;
            }
            const cur = weatherResult.current;
            const fetchedTime = weatherResult.fetchedAt ? new Date(weatherResult.fetchedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : null;
            let heatWarning = '';
            if (b) {
                const refTemp = getRefValue(b, 'temp', m.todayAge);
                if (refTemp != null && cur && cur.temp != null && cur.temp - refTemp >= 6) {
                    heatWarning = `<div style="margin-top:6px;color:var(--red);font-weight:800;font-size:12px;">⚠️ الحرارة الآن أعلى من معياري عمر القطيع (${m.todayAge} يوم) بـ ${fmt(cur.temp - refTemp,1)}°م — جهّز التبريد/التهوية.</div>`;
                } else if (refTemp != null && weatherResult.tempMax - refTemp >= 6) {
                    heatWarning = `<div style="margin-top:6px;color:#e08a2b;font-weight:800;font-size:12px;">⚠️ إجهاد حراري متوقع لاحقًا اليوم — أعلى حرارة متوقعة أعلى من المعياري بـ ${fmt(weatherResult.tempMax - refTemp,1)}°م.</div>`;
                }
            }
            return `<div class="card" style="margin-bottom:10px;padding:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                    <div>
                        <div style="font-size:12px;font-weight:800;">🌦️ الطقس الآن${fetchedTime ? ` <span style="font-weight:600;color:var(--muted);font-size:10.5px;">(آخر تحديث ${fetchedTime})</span>` : ''}</div>
                        ${cur && cur.temp != null ? `<div style="font-size:22px;font-weight:900;color:var(--barn-dark);margin-top:2px;">${fmt(cur.temp,1)}°م <span style="font-size:13px;font-weight:700;color:#2b6fe0;">💧${fmt(cur.humidity,0)}%</span></div>
                        <div style="font-size:10.5px;color:var(--muted);margin-top:1px;">${cur.apparentTemp != null ? `يُحس كأنها ${fmt(cur.apparentTemp,1)}°م` : ''}</div>` : `<div style="font-size:11px;color:var(--muted);margin-top:4px;">قراءة آنية غير متاحة الآن</div>`}
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:10.5px;color:var(--muted);">أعلى حرارة اليوم</div>
                        <div style="font-size:18px;font-weight:800;color:var(--red);">${fmt(weatherResult.tempMax,1)}°م</div>
                        ${weatherResult.peakTimeToday ? `<div style="font-size:10px;color:var(--muted);">الساعة ${clockLabel(weatherResult.peakTimeToday)}</div>` : ''}
                    </div>
                </div>
                ${heatWarning}
            </div>`;
        }

        function renderWeatherWidget() {
            const b = getActiveBatch();
            const m = b ? computeMetrics(b) : null;
            const locLabel = state.farmLocation ? `${fmt(state.farmLocation.lat,3)}, ${fmt(state.farmLocation.lon,3)}` : null;
            let alertHtml = '', prepHtml = '';
            if (weatherResult && !weatherResult.error) {
                let heatWarning = '';
                if (b) {
                    const refTemp = getRefValue(b, 'temp', m.todayAge);
                    const prepTime = prepTimeBefore(weatherResult.peakTimeToday, 2);
                    if (refTemp != null && weatherResult.tempMax - refTemp >= 6) {
                        heatWarning = `<div style="margin-top:6px;color:var(--red);font-weight:800;">⚠️ إجهاد حراري متوقع: الحرارة المتوقعة أعلى من المعياري لعمر القطيع (${m.todayAge} يوم) بـ ${fmt(weatherResult.tempMax - refTemp,1)}°م — جهّز التهوية/التبريد${prepTime ? ` <u>الساعة ${clockLabel(prepTime)}</u> (قبل الذروة المتوقعة الساعة ${clockLabel(weatherResult.peakTimeToday)} بساعتين)` : ' الآن'}.</div>`;
                    } else if (weatherResult.humidityAtMax >= 80 && weatherResult.tempMax >= 28) {
                        heatWarning = `<div style="margin-top:6px;color:#e08a2b;font-weight:800;">⚠️ حرارة ورطوبة مرتفعتان معًا — إجهاد حراري محتمل حتى لو الحرارة وحدها ضمن الحدود${weatherResult.peakTimeToday ? ` (الذروة الساعة ${clockLabel(weatherResult.peakTimeToday)})` : ''}.</div>`;
                    }
                }
                alertHtml = `<div style="font-size:12.5px;margin-top:8px;">🌡️ أعلى حرارة متوقعة اليوم: <b>${fmt(weatherResult.tempMax,1)}°م</b>${weatherResult.peakTimeToday ? ` (الساعة ${clockLabel(weatherResult.peakTimeToday)})` : ''} · 💧 الرطوبة وقتها: <b>${fmt(weatherResult.humidityAtMax,0)}%</b>${heatWarning}</div>`;
                if (b && weatherResult.forecastDays) {
                    const prep = computeHeatColdPrepSchedule(b, m, weatherResult.forecastDays);
                    if (prep) {
                        const dayNames = ['غدًا','بعد غد','بعد 3 أيام'];
                        const rows = prep.map((r, i) => {
                            const color = r.level === 'heat' ? 'var(--red)' : r.level === 'cold' ? '#2b6fe0' : r.level === 'watch' ? '#e08a2b' : 'var(--green)';
                            const icon = r.level === 'heat' ? '🔥' : r.level === 'cold' ? '❄️' : r.level === 'watch' ? '👁️' : '✅';
                            return `<div class="check-row" style="padding:8px 0;"><div class="txt">
                                <div style="font-weight:800;">${icon} ${dayNames[i] || ('بعد ' + r.offset + ' أيام')} — ${r.date}</div>
                                <div class="day">حرارة عليا متوقعة ${fmt(r.tempMax,1)}°م · دنيا ${fmt(r.tempMin,1)}°م${r.refTemp!=null?` (المعياري ليوم ${r.futureAge}: ${fmt(r.refTemp,1)}°م)`:''}</div>
                                <div style="color:${color};font-weight:700;font-size:12px;margin-top:2px;">${r.action}</div>
                            </div></div>`;
                        }).join('');
                        prepHtml = `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:8px;">
                            <div style="font-weight:800;font-size:13px;margin-bottom:4px;">📅 جدول استعداد استباقي (3 أيام قادمة)</div>
                            ${rows}
                        </div>`;
                    }
                }
            } else if (weatherResult && weatherResult.error) {
                alertHtml = `<div style="font-size:12px;color:var(--red);margin-top:8px;">${weatherResult.error}</div>`;
            }
            return `
                <p style="font-size:11.5px;color:var(--muted);margin:0;line-height:1.6;">اربط موقع المزرعة لمتابعة توقعات الحرارة/الرطوبة، وجدول استعداد استباقي لموجات الحر/البرد خلال الأيام الثلاثة القادمة (تجهيز التبريد/التهوية أو التدفئة قبلها لا وقتها).</p>
                <div class="row-actions" style="margin-top:6px;">
                    <button class="btn ghost" style="flex:1;" onclick="setFarmLocation()">📍 ${state.farmLocation ? 'تحديث موقع المزرعة' : 'تحديد موقع المزرعة'}</button>
                    <button class="btn gold" style="flex:1;" onclick="checkWeatherAlert()" ${!state.farmLocation ? 'disabled' : ''}>${weatherLoading ? '⏳ جارٍ التحقق...' : '🌦️ تحقق من الطقس (اليوم + 3 أيام)'}</button>
                </div>
                <div id="locSearchBox" style="${state.farmLocation ? 'display:none;' : ''}margin-top:8px;border-top:1px dashed var(--line);padding-top:8px;">
                    <p style="font-size:11px;color:var(--muted);margin:0 0 6px;">لو تحديد الموقع تلقائيًا مش شغال (غير مدعوم فى بعض المتصفحات/الواجهات لما يكون الملف مفتوح مباشرة بدون رابط https)، حدّد موقعك بالبحث بالاسم:</p>
                    <div style="display:flex;gap:6px;">
                        <input id="locSearchInput" placeholder="اسم المدينة/المركز، مثال: طنطا" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();searchFarmLocationByName();}">
                        <button type="button" class="btn ghost sm" onclick="searchFarmLocationByName()">🔍 بحث</button>
                    </div>
                    <div id="locSearchResults" style="margin-top:6px;"></div>
                    <details style="margin-top:8px;">
                        <summary style="font-size:11px;color:var(--muted);cursor:pointer;">أو أدخل خط العرض/الطول يدويًا (لو عارفهم)</summary>
                        <div style="display:flex;gap:6px;margin-top:6px;">
                            <input id="locManualLat" type="number" step="0.0001" placeholder="خط العرض Latitude" style="flex:1;">
                            <input id="locManualLon" type="number" step="0.0001" placeholder="خط الطول Longitude" style="flex:1;">
                            <button type="button" class="btn ghost sm" onclick="saveManualLatLon()">حفظ</button>
                        </div>
                    </details>
                </div>
                ${locLabel ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">📍 الموقع المحفوظ: ${locLabel}</div>` : ''}
                ${alertHtml}
                ${prepHtml}`;
        }

        // (تمت إزالة نظام "المعدات وساعات التشغيل والصيانة" بالكامل — كان يشمل عداد ساعات تشغيل يدوي
        // وجدولة صيانة دورية بالساعات/التاريخ. الميزة كانت مستقلة ولا يعتمد عليها أي تبويب آخر.)

        // ============ إضافة/مكمل خارج الجدول: تسجيل إضافة (فيتامين/إلكتروليت/دواء...) توضع على العلف أو فى الماء
        // بشكل طارئ خارج برنامج الإضافات المجدول — بوقت فعلي، مع خصم من المخزون مثل البرنامج المجدول ============
        let quickIntType = 'feed';
        function setQuickIntType(type) {
            quickIntType = type;
            document.getElementById('qi_btn_feed').className = 'btn ' + (type === 'feed' ? 'gold' : 'ghost');
            document.getElementById('qi_btn_water').className = 'btn ' + (type === 'water' ? 'gold' : 'ghost');
        }
        function openQuickIntModal() {
            const b = getActiveBatch();
            if (!b) { showToast('⚠️ فعّل دفعة نشطة أولاً'); return; }
            setQuickIntType('feed');
            document.getElementById('qi_name').value = '';
            document.getElementById('qi_qty').value = '';
            document.getElementById('qi_unit').value = 'جم';
            document.getElementById('qi_reason').value = 'موجة إجهاد حراري';
            document.getElementById('qi_reasonOther').value = '';
            document.getElementById('qi_reasonOtherField').style.display = 'none';
            document.getElementById('qi_note').value = '';
            document.getElementById('qi_withdrawal').value = 0;
            // وقت الإضافة يتعبّى تلقائيًا باللحظة الحالية (محليًا) — قابل للتعديل لو كان التسجيل بأثر رجعي بعد الإضافة الفعلية
            const now = new Date();
            const tzOffsetMs = now.getTimezoneOffset() * 60000;
            document.getElementById('qi_datetime').value = new Date(now - tzOffsetMs).toISOString().slice(0, 16);
            document.getElementById('qi_datetime').max = new Date(now - tzOffsetMs).toISOString().slice(0, 16);
            openModal('quickIntModalOverlay');
        }
        function saveQuickIntervention() {
            if (!requirePermission('production')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            if (!b) return;
            const name = document.getElementById('qi_name').value.trim();
            if (!name) { showToast('⚠️ اكتب اسم الإضافة/المكمل'); return; }
            const qty = parseFloat(document.getElementById('qi_qty').value) || 0;
            if (qty <= 0) { showToast('⚠️ اكتب كمية أكبر من صفر'); return; }
            const unit = document.getElementById('qi_unit').value;
            const dtVal = document.getElementById('qi_datetime').value;
            if (!dtVal) { showToast('⚠️ حدّد وقت الإضافة'); return; }
            const reasonSel = document.getElementById('qi_reason').value;
            const reason = reasonSel === 'أخرى' ? (document.getElementById('qi_reasonOther').value.trim() || 'أخرى') : reasonSel;
            const note = document.getElementById('qi_note').value.trim();
            const withdrawalDays = parseInt(document.getElementById('qi_withdrawal').value) || 0;
            const dateOnly = dtVal.slice(0, 10);
            const finish = (finalUnit) => {
                const rec = {
                    id: uid(), type: quickIntType, dateTime: dtVal, date: dateOnly, qty, unit: finalUnit || unit,
                    name, reason, note, withdrawalDays,
                    enteredBy: currentRole === 'worker' && currentWorker ? currentWorker.name : 'المالك',
                    enteredAt: new Date().toISOString(),
                };
                // ⚠️ إصلاح: لو فيه بند مجدول (بروتوكول إضافات) نشط بنفس الاسم والنوع فى نفس تاريخ/عمر الإضافة
                // دي، فهي عمليًا بتاخد مكانه — الطائر أخد نفس المادة فعلًا، بس من مسار "خارج الجدول" مش
                // زرار "تنفيذ" بتاع البروتوكول. من غير الربط ده، البند المجدول كان بيفضل شكليًا "لسه ما
                // اتنفذش" (رغم إنه اتنفذ فعليًا)، وتقارير فعالية الإضافات ونسبة الالتزام بالبروتوكول كانت
                // بتتجاهل الجرعة دي تمامًا فى حساباتها. دلوقتي بنسجلها كمان فى additiveExecLog بربطها ببند
                // البروتوكول المطابق، عشان كل التحليلات المبنية على "هل اتنفذ فعلاً" (وليس مجرد سجل منفصل
                // "حبر على ورق") تحسبها صح تلقائيًا.
                const ageOnDate = daysBetween(b.startDate, dateOnly);
                const protocolList = quickIntType === 'feed' ? (b.feedAdditives || []) : (b.waterAdditives || []);
                const matchedProtocol = protocolList.find(x => x.active && x.name && x.name.trim().toLowerCase() === name.toLowerCase()
                    && additiveActiveOnDay(x, ageOnDate) && !isAdditiveExecutedToday(b, x.id, dateOnly));
                if (matchedProtocol) {
                    if (!b.additiveExecLog) b.additiveExecLog = [];
                    b.additiveExecLog.push({ id: uid(), date: dateOnly, additiveId: matchedProtocol.id, type: quickIntType,
                        name: matchedProtocol.name, qty, unit: finalUnit || unit, viaQuickIntervention: true,
                        enteredBy: rec.enteredBy, enteredAt: rec.enteredAt });
                    rec.linkedAdditiveId = matchedProtocol.id;
                }
                b.quickInterventions.push(rec);
                logAudit(b, `➕ إضافة/مكمل خارج الجدول: ${name} ${fmt(qty,2)} ${unit} — ${quickIntType === 'feed' ? '🌾 على العلف' : '💧 فى الماء'} — ${reason}${withdrawalDays > 0 ? ` — ⚠️ فترة سحب ${withdrawalDays} يوم` : ''}${matchedProtocol ? ` — 🔗 اعتُبرت تنفيذًا لبند البروتوكول "${matchedProtocol.name}" لنفس اليوم` : ''}`);
                persist();
                closeModal('quickIntModalOverlay');
                showToast(matchedProtocol ? `✅ تم تسجيل الإضافة وربطها بتنفيذ بند البروتوكول "${matchedProtocol.name}" تلقائيًا` : '✅ تم تسجيل الإضافة');
                render();
            };
            // الخصم من المخزون بنفس منطق برنامج الإضافات المجدول (تصنيف "إضافات" + تحويل وحدات تلقائي)
            const { it, qty: convQty } = resolveInvQty(b, name, 'إضافات', qty, unit);
            if (convQty == null) {
                showToast(`⚠️ وحدة "${unit}" لا تتوافق مع وحدة "${it.name}" المسجلة بالمخزن "${it.unit}" — لا يمكن الخصم تلقائيًا. صحّح الوحدة أو راجع المخزون.`);
                return;
            }
            confirmIfShort(name, it.unit, it.balance, convQty, 'كإضافة خارج الجدول', () => {
                stockOutByItem(b, it.id, convQty, dateOnly, `إضافة خارج الجدول - ${name}`);
                finish(unit);
            });
        }
        function deleteQuickIntervention(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 3): يتماشى مع نمط الحذف owner-only
            const b = getActiveBatch();
            if (!b) return;
            const it = (b.quickInterventions || []).find(x => x.id === id);
            showConfirm('حذف هذه الإضافة؟ يمكن استرجاعها لاحقًا من سلة المهملات (لن تُعاد الكمية المخصومة تلقائيًا للمخزون).', () => {
                b.quickInterventions = b.quickInterventions.filter(x => x.id !== id);
                if (it) softDeleteToTrash(b, 'quickIntervention', it, `🗑️ حذف إضافة خارج الجدول (${esc(it.name || '')} ${fmt(it.qty,1)} ${it.unit})`);
                persist();
                render();
            });
        }
        // (تعرض قائمة آخر إضافات/حوادث خارج الجدول دلوقتي جوه القسم الموحّد renderDailyEventsSection فى تبويب التسجيل اليومي)

        // ============ تسجيل الحوادث اليدوي + قاعدة معرفة الحوادث (اكتشاف تلقائي من الأرقام + حوادث يدوية) ============
        // الفكرة: نبني من دوراتك المؤرشفة "بنود خبرة" — نمط تكرر عبر أكتر من دورة (نوع مشكلة + نطاق عمر) مع
        // أفضل حل أثبت نجاحه فيها — ونستخدمها لتنبيهك قبل الوقت المتوقع للمشكلة فى الدفعة الحالية.
        function openIncidentModal() {
            const b = getActiveBatch();
            if (!b) { showToast('⚠️ فعّل دفعة نشطة أولاً'); return; }
            document.getElementById('ic_date').value = todayStr();
            document.getElementById('ic_date').max = todayStr();
            document.getElementById('ic_category').value = 'نفوق مرتفع';
            document.getElementById('ic_severity').value = 'negative_med';
            document.getElementById('ic_title').value = '';
            document.getElementById('ic_disease').value = '';
            document.getElementById('ic_solution').value = '';
            document.getElementById('ic_outcome').value = 'unknown';
            document.getElementById('ic_notes').value = '';
            openModal('incidentModalOverlay');
        }
        function saveIncident() {
            if (!requirePermission('production')) return; // 🔒 Red Team fix (جولة 2): كان مكشوف بالكامل — العمال بيسجلوا حوادث كجزء من عملهم اليومي، لكن لازم يكون فيه تحقق
            const b = getActiveBatch();
            if (!b) return;
            const date = document.getElementById('ic_date').value;
            if (!date) { showToast('⚠️ حدّد تاريخ الحادثة'); return; }
            const title = document.getElementById('ic_title').value.trim();
            if (!title) { showToast('⚠️ اكتب وصف مختصر للحادثة'); return; }
            const category = document.getElementById('ic_category').value;
            const severity = document.getElementById('ic_severity').value;
            // ============ 🔴 تنفيذ Critique (1): تصنيف تشخيصي محدد باسم المرض، منفصل عن فئة الأعراض العامة ============
            const diseaseTag = document.getElementById('ic_disease').value.trim() || null;
            const solution = document.getElementById('ic_solution').value.trim();
            const outcome = document.getElementById('ic_outcome').value;
            const notes = document.getElementById('ic_notes').value.trim();
            const age = Math.max(0, daysBetween(b.startDate, date));
            const rec = {
                id: uid(), source: 'manual', date, age, category, diseaseTag, severity, title, solution: solution || null, outcome, notes,
                enteredBy: currentRole === 'worker' && currentWorker ? currentWorker.name : 'المالك',
                enteredAt: new Date().toISOString(),
            };
            b.incidents.push(rec);
            logAudit(b, `📓 حادثة مُسجَّلة: ${category}${diseaseTag ? ' — ' + diseaseTag : ''} (يوم ${age}) — ${title}${solution ? ' — الحل: ' + solution : ''}`);
            persist();
            closeModal('incidentModalOverlay');
            showToast('✅ تم تسجيل الحادثة — هتدخل قاعدة المعرفة وتساعد فى تنبيهك مبكرًا فى الدورات الجاية');
            render();
        }
        function deleteIncident(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 2): يتماشى مع نمط الحذف فى deleteBiosecurity/deleteVaccine (owner فقط)
            const b = getActiveBatch();
            if (!b) return;
            const it = (b.incidents || []).find(x => x.id === id);
            showConfirm('حذف هذه الحادثة؟ يمكن استرجاعها لاحقًا من سلة المهملات.', () => {
                b.incidents = b.incidents.filter(x => x.id !== id);
                if (it) softDeleteToTrash(b, 'incident', it, `🗑️ حذف حادثة (${esc(it.title || '')})`);
                persist();
                render();
            });
        }
        const INCIDENT_SEVERITY_LABEL = { negative_high: '🔴 سلبي كبير', negative_med: '🟠 سلبي متوسط', negative_low: '🟡 سلبي بسيط', positive: '🟢 إيجابي' };
        const INCIDENT_OUTCOME_LABEL = { improved: '✅ تحسّن ملحوظ', mild_improved: '🙂 تحسّن بسيط', no_change: '➖ لم يتغيّر', worsened: '❌ ساء الوضع', unknown: '❓ غير معروف' };
        // (تعرض قائمة آخر الحوادث دلوقتي جوه القسم الموحّد renderDailyEventsSection فى تبويب التسجيل اليومي)

        // ============ اكتشاف تلقائي لحوادث سلبية عبر سلسلة دورة مؤرشفة (شذوذ Z-score فى النفوق أو استهلاك العلف) ============
        // بيرجع نقاط شذوذ مُجمَّعة (الأيام المتتالية لنفس النوع تتوحّد فى حادثة واحدة بعمر أسوأ نقطة فيها)
        function mineAutoIncidentsForCycle(x) {
            const xm = computeMetrics(x);
            const series = xm.series.filter(r => r.age > 0);
            if (series.length < 10) return [];
            const raw = [];
            // --- شذوذ نفوق: مقارنة نسبة النفوق اليومية بخط أساس متحرك (آخر 7 أيام سابقة لنفس الدورة) ---
            for (let i = 7; i < series.length; i++) {
                const window = series.slice(i - 7, i).map(r => r.liveCount > 0 ? (((r.mort || 0) + (r.cull || 0)) / r.liveCount) * 100 : null).filter(v => v != null);
                if (window.length < 5) continue;
                const mean = window.reduce((s, v) => s + v, 0) / window.length;
                const sd = stdDev(window);
                if (!sd || sd < 0.0001) continue;
                const today = series[i].liveCount > 0 ? (((series[i].mort || 0) + (series[i].cull || 0)) / series[i].liveCount) * 100 : null;
                if (today == null) continue;
                const z = (today - mean) / sd;
                if (z >= 2.5) raw.push({ age: series[i].age, date: series[i].date, category: 'نفوق مرتفع', z, metric: 'mort' });
            }
            // --- شذوذ هبوط استهلاك العلف: مقارنة انحراف العلف عن المعيار المرجعي بخط أساس متحرك لنفس الدورة ---
            for (let i = 7; i < series.length; i++) {
                const window = series.slice(i - 7, i).map(r => {
                    const refs = getRefsForDay(x, r.age);
                    const std = (refs.feed * (r.liveCount || 0)) / 1000;
                    return (r.feed != null && std > 0) ? r.feed - std : null;
                }).filter(v => v != null);
                if (window.length < 5) continue;
                const mean = window.reduce((s, v) => s + v, 0) / window.length;
                const sd = stdDev(window);
                if (!sd || sd < 0.0001) continue;
                const refsToday = getRefsForDay(x, series[i].age);
                const stdToday = (refsToday.feed * (series[i].liveCount || 0)) / 1000;
                if (series[i].feed == null || stdToday <= 0) continue;
                const z = ((series[i].feed - stdToday) - mean) / sd;
                if (z <= -2.5) raw.push({ age: series[i].age, date: series[i].date, category: 'هبوط استهلاك العلف', z: Math.abs(z), metric: 'feed' });
            }
            if (!raw.length) return [];
            // تجميع النقاط المتتالية (فرق يوم واحد أو يومين) من نفس النوع فى حادثة واحدة — نحتفظ بأسوأ يوم فيها كمركز
            raw.sort((a, c) => a.category === c.category ? a.age - c.age : a.category.localeCompare(c.category));
            const merged = [];
            raw.forEach(pt => {
                const last = merged[merged.length - 1];
                if (last && last.category === pt.category && pt.age - last.lastAge <= 2) {
                    last.lastAge = pt.age;
                    if (pt.z > last.z) { last.age = pt.age; last.date = pt.date; last.z = pt.z; }
                } else {
                    merged.push({ category: pt.category, age: pt.age, date: pt.date, z: pt.z, lastAge: pt.age, metric: pt.metric });
                }
            });
            return merged.map(m2 => ({ age: m2.age, date: m2.date, category: m2.category, metric: m2.metric,
                severity: m2.z >= 4 ? 'negative_high' : 'negative_med' }));
        }

        // يبحث عن أقرب تدخل (معاملة/إضافة مُنفَّذة/إضافة خارج الجدول) اتسجّل فى نافذة 0-4 أيام بعد عمر الحادثة
        function findNearbyInterventionForIncident(x, inc) {
            const from = inc.age, to = inc.age + 4;
            const candidates = [];
            (x.treatmentLog || []).forEach(t => { if (t.done && t.day >= from && t.day <= to) candidates.push({ name: t.name, day: t.day }); });
            (x.additiveExecLog || []).forEach(e => {
                const age = daysBetween(x.startDate, e.date);
                if (age >= from && age <= to) candidates.push({ name: e.name, day: age });
            });
            (x.quickInterventions || []).forEach(qi => {
                const age = daysBetween(x.startDate, qi.date);
                if (age >= from && age <= to) candidates.push({ name: qi.name || '', day: age });
            });
            if (!candidates.length) return null;
            candidates.sort((a, c) => a.day - c.day);
            return candidates[0];
        }

        // يقيس هل تحسّن المؤشر (نفوق/علف) بعد التدخل مقارنة بقبله، باستخدام نفس اختبار Welch المستخدم فى باقي التحليلات
        function assessIncidentOutcome(x, inc, intervention) {
            const xm = computeMetrics(x);
            const series = xm.series.filter(r => r.age > 0);
            const before = series.filter(r => r.age >= inc.age - 3 && r.age < intervention.day);
            const after = series.filter(r => r.age > intervention.day && r.age <= intervention.day + 3);
            if (before.length < 2 || after.length < 2) return 'unknown';
            const valOf = r => inc.metric === 'mort'
                ? (r.liveCount > 0 ? (((r.mort || 0) + (r.cull || 0)) / r.liveCount) * 100 : null)
                : (() => { const refs = getRefsForDay(x, r.age); const std = (refs.feed * (r.liveCount || 0)) / 1000; return (r.feed != null && std > 0) ? r.feed - std : null; })();
            const beforeVals = before.map(valOf).filter(v => v != null);
            const afterVals = after.map(valOf).filter(v => v != null);
            if (beforeVals.length < 2 || afterVals.length < 2) return 'unknown';
            const test = welchSignificant(beforeVals, afterVals);
            // للنفوق: تحسّن يعنى انخفاض بعد التدخل. لهبوط العلف: تحسّن يعنى انخفاض الانحراف السلبي (رقم أقرب للصفر/موجب)
            const improvedDirection = inc.metric === 'mort' ? (test.meanC < test.meanA) : (test.meanC > test.meanA);
            if (!test.significant) return 'no_change';
            return improvedDirection ? 'improved' : 'worsened';
        }

        // ============ تجميع خام لكل الحوادث (تلقائية + يدوية) عبر الدورات المؤرشفة لنوع مُعيّن ============
        // دالة مشتركة تُستخدم فى: قاعدة معرفة الحوادث، مؤشر "احتمالية مشكلة قادمة"، بروتوكول الأفضل من كل دورة،
        // خطة التوسع لنوع جديد، وتحليل "نفس الحل ضار فى توقيت ومفيد فى توقيت تاني" — بدل تكرار نفس المسح فى كل مكان
        function mineAllIncidentRecords(species) {
            const archived = state.batches.filter(x => x.species === species && x.status === 'مؤرشفة' && x.records && x.records.length >= 8);
            if (archived.length < 2) return [];
            const allIncidents = [];
            archived.forEach(x => {
                mineAutoIncidentsForCycle(x).forEach(inc => {
                    const linked = findNearbyInterventionForIncident(x, inc);
                    const outcome = linked ? assessIncidentOutcome(x, inc, linked) : 'unknown';
                    allIncidents.push({ source: 'auto', batchName: x.name, location: x.location || null, age: inc.age, date: inc.date,
                        season: seasonOf(inc.date), category: inc.category, diseaseTag: null, solutionName: linked ? linked.name : null, outcome });
                });
                (x.incidents || []).filter(mi => mi.severity !== 'positive').forEach(mi => {
                    allIncidents.push({ source: 'manual', batchName: x.name, location: x.location || null, age: mi.age, date: mi.date,
                        season: seasonOf(mi.date), category: mi.category, diseaseTag: mi.diseaseTag || null,
                        solutionName: mi.solution || null, outcome: mi.outcome === 'mild_improved' ? 'improved' : mi.outcome });
                });
            });
            return allIncidents;
        }

        // ============ بناء قاعدة معرفة الحوادث لنوع مُعيّن — تجميع حوادث تلقائية + يدوية عبر كل الدورات المؤرشفة ============
        // بترجع بنود متكررة فقط (حصلت فى دورتين مختلفتين على الأقل بنفس النوع ونطاق العمر) — نمط حقيقي مش حادثة عرضية مرة واحدة
        function computeIncidentKnowledgeBase(species) {
            const allIncidents = mineAllIncidentRecords(species);
            if (allIncidents.length < 2) return null;
            // تجميع فى نطاقات عمرية (كتلة ±1.5 يوم تقريبًا) لكل نوع مشكلة
            const buckets = {};
            allIncidents.forEach(inc => {
                const bucketAge = Math.round(inc.age / 3) * 3;
                const key = inc.category + '_' + bucketAge;
                if (!buckets[key]) buckets[key] = { category: inc.category, ageCenter: bucketAge, items: [] };
                buckets[key].items.push(inc);
            });
            return Object.values(buckets)
                .filter(bk => new Set(bk.items.map(i => i.batchName)).size >= 2) // لازم يتكرر فى دورتين مختلفتين على الأقل
                .map(bk => {
                    const solStats = {};
                    bk.items.forEach(it => {
                        if (!it.solutionName) return;
                        if (!solStats[it.solutionName]) solStats[it.solutionName] = { count: 0, improved: 0 };
                        solStats[it.solutionName].count++;
                        if (it.outcome === 'improved') solStats[it.solutionName].improved++;
                    });
                    const ranked = Object.entries(solStats).sort((a, c) =>
                        (c[1].improved / c[1].count) - (a[1].improved / a[1].count) || c[1].count - a[1].count);
                    const best = ranked[0];
                    // ============ 🔴 تنفيذ Critique (2): تركّز موسمي — لو أغلب حدوث النمط ده وقع فى فصل واحد بعينه ============
                    // (مش بس عمر واحد)، نوضّح ده كـ"بُعد ثانٍ" مستقل عشان المستخدم يعرف يستعد قبل الفصل ده تحديدًا،
                    // مش بس قبل العمر ده. محتاج دورتين مختلفتين على الأقل وقعوا فى نفس الفصل عشان النمط يبقى ذو معنى.
                    const seasonCounts = {};
                    bk.items.forEach(it => { if (it.season) { if (!seasonCounts[it.season]) seasonCounts[it.season] = new Set(); seasonCounts[it.season].add(it.batchName); } });
                    let seasonalHint = null;
                    const seasonEntries = Object.entries(seasonCounts).sort((a, c) => c[1].size - a[1].size);
                    if (seasonEntries.length && seasonEntries[0][1].size >= 2 && seasonEntries[0][1].size / new Set(bk.items.map(i => i.batchName)).size >= 0.7) {
                        seasonalHint = seasonEntries[0][0];
                    }
                    // ============ 🔴 تنفيذ Critique (1): لو أغلب الحوادث فى النمط ده مرتبطة باسم مرض محدد، نعرضه كـ"تشخيص مرجّح" ============
                    const diseaseCounts = {};
                    bk.items.forEach(it => { if (it.diseaseTag) diseaseCounts[it.diseaseTag] = (diseaseCounts[it.diseaseTag] || 0) + 1; });
                    const diseaseEntries = Object.entries(diseaseCounts).sort((a, c) => c[1] - a[1]);
                    const likelyDisease = (diseaseEntries.length && diseaseEntries[0][1] / bk.items.length >= 0.5) ? diseaseEntries[0][0] : null;
                    return {
                        category: bk.category, ageCenter: bk.ageCenter, frequency: bk.items.length,
                        cyclesAffected: new Set(bk.items.map(i => i.batchName)).size,
                        bestSolution: best ? { name: best[0], successRate: best[1].improved / best[1].count, timesUsed: best[1].count } : null,
                        seasonalHint, likelyDisease,
                    };
                })
                .sort((a, c) => c.cyclesAffected - a.cyclesAffected || c.frequency - a.frequency);
        }

        // ============ حساسية نفس الحل للتوقيت: بند استُخدم فى أكتر من نطاق عمر/نوع مشكلة بنتيجة متضادة ============
        // مثال: "فيتامين سي" نجح فى نطاق عمر 5-8 (إجهاد حراري) لكن سجّل "ساء الوضع" فى نطاق عمر 20-25 (مشكلة هضمية)
        // — ده فرق عن verdict عام فى بروتوكول "الأفضل من كل دورة" لأنه بيوضّح متى بالظبط الحل مفيد ومتى مش مفيد
        function computeSolutionContextSensitivity(species) {
            const allIncidents = mineAllIncidentRecords(species).filter(inc => inc.solutionName && (inc.outcome === 'improved' || inc.outcome === 'worsened'));
            if (allIncidents.length < 2) return [];
            const bySolution = {};
            allIncidents.forEach(inc => {
                if (!bySolution[inc.solutionName]) bySolution[inc.solutionName] = [];
                bySolution[inc.solutionName].push(inc);
            });
            const results = [];
            Object.entries(bySolution).forEach(([name, items]) => {
                if (items.length < 2) return;
                // تجميع نفس البند فى نطاقات (نوع مشكلة + كتلة عمرية ±1.5 يوم)، ثم فحص هل فيه نطاقين مختلفين بنتيجة متضادة
                const buckets = {};
                items.forEach(it => {
                    const bucketAge = Math.round(it.age / 3) * 3;
                    const key = it.category + '_' + bucketAge;
                    if (!buckets[key]) buckets[key] = { category: it.category, ageCenter: bucketAge, improved: 0, worsened: 0 };
                    if (it.outcome === 'improved') buckets[key].improved++; else buckets[key].worsened++;
                });
                const bucketList = Object.values(buckets).map(bk => ({ ...bk, verdict: bk.improved > bk.worsened ? 'improved' : (bk.worsened > bk.improved ? 'worsened' : 'mixed') }));
                const goodContexts = bucketList.filter(bk => bk.verdict === 'improved');
                const badContexts = bucketList.filter(bk => bk.verdict === 'worsened');
                if (goodContexts.length && badContexts.length) {
                    results.push({ name, goodContexts, badContexts });
                }
            });
            return results;
        }

        // ============ 🔴 تنفيذ Critique (3): تسلسلات مرضية متكررة — هل حادثة معينة بيتبعها حادثة تانية بفارق أيام منتظم؟ ============
        // مثال كلاسيكي: إصابة مناعية تضعف القطيع، وبعدها بفترة قصيرة مشكلة هضمية/تنفسية ثانوية انتهازية. النظام قبل
        // كده كان بيحلل كل حادثة كنقطة مستقلة تمامًا؛ هنا بنفحص كل زوج حوادث متتالي داخل نفس الدورة (بفارق منطقي
        // 1-21 يوم) ونجمع الأنماط اللي اتكررت فى دورتين مختلفتين على الأقل — عشان نفرّق تتابع سببي حقيقي عن صدفة.
        function computeDiseaseSequences(species) {
            const archived = state.batches.filter(x => x.species === species && x.status === 'مؤرشفة' && x.records && x.records.length >= 8);
            if (archived.length < 2) return [];
            const MIN_GAP = 1, MAX_GAP = 21;
            const transitions = {};
            archived.forEach(x => {
                const incs = [];
                mineAutoIncidentsForCycle(x).forEach(inc => incs.push({ age: inc.age, label: inc.category }));
                (x.incidents || []).filter(mi => mi.severity !== 'positive').forEach(mi => incs.push({ age: mi.age, label: mi.diseaseTag || mi.category }));
                incs.sort((a, c) => a.age - c.age);
                for (let i = 0; i < incs.length; i++) {
                    for (let j = i + 1; j < incs.length; j++) {
                        const gap = incs[j].age - incs[i].age;
                        if (gap < MIN_GAP) continue;
                        if (gap > MAX_GAP) break; // القائمة مرتبة تصاعديًا بالعمر، فمفيش داعي نكمل الفحص بعد كده
                        if (incs[i].label === incs[j].label) continue; // نفس النوع مش تتابع مرضي، تكرار عادي
                        const key = incs[i].label + '→' + incs[j].label;
                        if (!transitions[key]) transitions[key] = { from: incs[i].label, to: incs[j].label, gaps: [], batches: new Set() };
                        transitions[key].gaps.push(gap);
                        transitions[key].batches.add(x.name);
                    }
                }
            });
            return Object.values(transitions)
                .filter(t => t.batches.size >= 2)
                .map(t => ({ from: t.from, to: t.to, cyclesAffected: t.batches.size, avgGap: Math.round(t.gaps.reduce((s, g) => s + g, 0) / t.gaps.length) }))
                .sort((a, c) => c.cyclesAffected - a.cyclesAffected);
        }

        // ============ 🔴 تنفيذ Critique (4): خريطة نقاط الضعف داخل مزرعتك — مش "مناطق موبوءة فى الجمهورية" ============
        // بيانات التطبيق محلية لحسابك أنت بس (لا يوجد تجميع بيانات عبر مستخدمين مختلفين فى أي مكان بالكود)، فمقارنة
        // مزارع مختلفة فى محافظات مختلفة مش ممكنة تقنيًا من غير خلفية مشتركة جديدة بالكامل. الممكن فعليًا: تجميع
        // حوادثك حسب حقل "الموقع/العنبر" ومقارنة متوسط الحوادث لكل دورة بين عنابرك المختلفة أنت.
        function computeLocationIncidentClusters() {
            const archived = state.batches.filter(x => x.status === 'مؤرشفة' && x.records && x.records.length >= 8 && x.location && x.location.trim());
            if (archived.length < 3) return null;
            const byLoc = {};
            archived.forEach(x => {
                const loc = x.location.trim();
                if (!byLoc[loc]) byLoc[loc] = { cycles: new Set(), incidentCount: 0 };
                byLoc[loc].cycles.add(x.name);
                byLoc[loc].incidentCount += mineAutoIncidentsForCycle(x).length + (x.incidents || []).filter(mi => mi.severity !== 'positive').length;
            });
            const locs = Object.entries(byLoc).map(([loc, v]) => ({ location: loc, cycles: v.cycles.size, avgIncidentsPerCycle: v.incidentCount / v.cycles.size }));
            if (locs.length < 2) return null;
            const farmAvg = locs.reduce((s, l) => s + l.avgIncidentsPerCycle, 0) / locs.length;
            return locs.map(l => ({ ...l, vsFarmAvg: farmAvg > 0 ? l.avgIncidentsPerCycle / farmAvg : 1 }))
                .sort((a, c) => c.avgIncidentsPerCycle - a.avgIncidentsPerCycle);
        }

        // ============ 🔴 تنفيذ Critique (5): ربط فعلي بين قاعدة المعرفة والبروتوكول — بدل ما الاقتراح يفضل نص للقراءة ============
        // بس، الزرار ده بيفتح مودال "إضافة سريعة" جاهز باسم الحل المقترح، فتأكيد الكمية/الوحدة بس ويتسجل فورًا.
        function quickApplyIncidentSolution(name) {
            const b = getActiveBatch();
            if (!b) { showToast('⚠️ فعّل دفعة نشطة أولاً'); return; }
            closeModal('incidentKbModalOverlay');
            openQuickIntModal();
            document.getElementById('qi_name').value = name;
            document.getElementById('qi_reason').value = 'أخرى';
            document.getElementById('qi_reasonOther').value = 'مقترح من قاعدة معرفة الحوادث (نمط متكرر)';
            document.getElementById('qi_reasonOtherField').style.display = '';
            showToast('راجع الكمية والوحدة المناسبة وأكّد الإضافة 👍');
        }

        function openIncidentKbModal() {
            const b = getActiveBatch();
            if (!b) { showToast('⚠️ فعّل دفعة نشطة أولاً (لتحديد النوع)'); return; }
            const kb = computeIncidentKnowledgeBase(b.species);
            const sensitivity = computeSolutionContextSensitivity(b.species);
            const sequences = computeDiseaseSequences(b.species);
            const locClusters = computeLocationIncidentClusters();
            const el = document.getElementById('incidentKbContent');
            let html = '';
            if (!kb || !kb.length) {
                html += `<div class="card empty" style="padding:14px;"><div class="ico">🧠</div>محتاج دورتين مؤرشفتين على الأقل من نفس النوع بينهم نمط متكرر (حادثة تلقائية أو مُسجَّلة يدويًا فى نفس نطاق العمر) عشان تظهر هنا بنود.<br><br>سجّل حوادثك يدويًا كل ما تحصل عشان تبني القاعدة أسرع.</div>`;
            } else {
                html += `<div class="card" style="padding:0;">` + kb.map(e => {
                    const solTxt = e.bestSolution
                        ? `🏆 أفضل حل: <b>${esc(e.bestSolution.name)}</b> — نجح فى ${fmt(e.bestSolution.successRate*100,0)}% من ${e.bestSolution.timesUsed} محاولة
                           <button class="btn ghost xs" style="margin-right:6px;" onclick="quickApplyIncidentSolution('${esc(e.bestSolution.name).replace(/'/g,"\\'")}')">⚡ طبّقه دلوقتي</button>`
                        : `لسه مفيش حل مُثبت مرتبط بهذا النمط فى بياناتك`;
                    const diseaseBadge = e.likelyDisease ? `<span style="background:#fde8e8;color:#a33;border-radius:8px;padding:1px 7px;font-size:10.5px;font-weight:700;margin-right:4px;">🩺 ${esc(e.likelyDisease)}</span>` : '';
                    const seasonBadge = e.seasonalHint ? `<span style="background:#fff3d6;color:#8a6800;border-radius:8px;padding:1px 7px;font-size:10.5px;font-weight:700;">🗓️ مرتبط بفصل ${e.seasonalHint}</span>` : '';
                    return `<div class="check-row"><div class="txt">
                        <div style="font-weight:800;">⚠️ ${esc(e.category)} — حوالي يوم ${e.ageCenter} ${diseaseBadge}${seasonBadge}</div>
                        <div class="day">حصل فى ${e.cyclesAffected} دورة مختلفة (${e.frequency} مرة إجمالاً)</div>
                        <div style="font-size:12px;margin-top:2px;">${solTxt}</div>
                    </div></div>`;
                }).join('') + `</div>`;
            }
            if (sensitivity.length) {
                html += `<div class="section-head" style="margin-top:12px;"><h2>⚡ حلول حساسة للتوقيت</h2></div>
                    <p style="font-size:11px;color:var(--muted);margin:0 0 8px;line-height:1.6;">نفس البند طلع مفيد فى نطاق ومضر/غير مجدي فى نطاق تاني — الجرعة مش المشكلة، التوقيت هو الفارق.</p>
                    <div class="card" style="padding:0;">` + sensitivity.map(s => `<div class="check-row"><div class="txt">
                        <div style="font-weight:800;">${esc(s.name)}</div>
                        <div class="day" style="color:var(--green);">✅ مفيد قرب: ${s.goodContexts.map(c => `${esc(c.category)} (يوم ${c.ageCenter})`).join('، ')}</div>
                        <div class="day" style="color:var(--red);">❌ ضار/غير مجدي قرب: ${s.badContexts.map(c => `${esc(c.category)} (يوم ${c.ageCenter})`).join('، ')}</div>
                    </div></div>`).join('') + `</div>`;
            }
            if (sequences.length) {
                html += `<div class="section-head" style="margin-top:12px;"><h2>🔗 تسلسلات مرضية متكررة</h2></div>
                    <p style="font-size:11px;color:var(--muted);margin:0 0 8px;line-height:1.6;">لما مشكلة معينة تحصل، مشكلة تانية بتميل تظهر بعدها بفترة منتظمة — غالبًا لأن الأولى بتضعف مقاومة القطيع للتانية.</p>
                    <div class="card" style="padding:0;">` + sequences.map(s => `<div class="check-row"><div class="txt">
                        <div>🔗 لما تحصل "<b>${esc(s.from)}</b>"، راقب "<b>${esc(s.to)}</b>" خلال ~${s.avgGap} يوم تقريبًا</div>
                        <div class="day">تكرر النمط ده فى ${s.cyclesAffected} دورة مختلفة</div>
                    </div></div>`).join('') + `</div>`;
            }
            if (locClusters && locClusters.length) {
                html += `<div class="section-head" style="margin-top:12px;"><h2>📍 خريطة نقاط الضعف داخل مزرعتك</h2></div>
                    <p style="font-size:11px;color:var(--muted);margin:0 0 8px;line-height:1.6;">متوسط عدد الحوادث لكل دورة فى كل موقع/عنبر عندك (كل الأنواع مجتمعة) — موقع بمتوسط أعلى بوضوح ممكن يكون فيه مشكلة بنيوية (تهوية، فرشة، تيار هوا).</p>
                    <div class="card" style="padding:0;">` + locClusters.map(l => {
                        const flag = l.vsFarmAvg >= 1.3 && l.cycles >= 2 ? ' 🔴' : '';
                        return `<div class="check-row"><div class="txt">
                        <div style="font-weight:800;">📍 ${esc(l.location)}${flag}</div>
                        <div class="day">${fmt(l.avgIncidentsPerCycle,1)} حادثة/دورة فى المتوسط (${l.cycles} دورة) — ${fmt(l.vsFarmAvg*100,0)}% من متوسط مزرعتك</div>
                    </div></div>`;
                    }).join('') + `</div>`;
            }
            el.innerHTML = html;
            openModal('incidentKbModalOverlay');
        }

        // ============ سجل انقطاع الكهرباء/أعطال المولد ============
        function openOutageModal() {
            document.getElementById('og_date').value = todayStr(); document.getElementById('og_date').max = todayStr();
            document.getElementById('og_duration').value = '';
            document.getElementById('og_note').value = '';
            openModal('outageModalOverlay');
        }
        function saveOutageLog() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 2): deleteOutageLog محمية بـ owner، الحفظ كان مكشوف
            const b = getActiveBatch();
            if (!b) return;
            const date = document.getElementById('og_date').value || todayStr();
            const duration = parseFloat(document.getElementById('og_duration').value) || 0;
            const note = document.getElementById('og_note').value.trim();
            if (duration <= 0) { showToast('⚠️ اكتب مدة الانقطاع بالساعات'); return; }
            b.outageLog.push({ id: uid(), date, duration, note });
            persist();
            closeModal('outageModalOverlay');
            showToast('✅ تم تسجيل الانقطاع');
            render();
        }
        function deleteOutageLog(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const o = b.outageLog.find(x => x.id === id);
            showConfirm('حذف هذا السجل؟ يمكن استرجاعه لاحقًا من سلة المهملات.', () => {
                b.outageLog = b.outageLog.filter(x => x.id !== id);
                if (o) softDeleteToTrash(b, 'outage', o, `🗑️ حذف سجل انقطاع كهرباء بتاريخ ${o.date || ''}`);
                persist();
                render();
            });
        }
        function renderOutageSection(b, m) {
            const log = [...(b.outageLog || [])].sort((a, c) => c.date.localeCompare(a.date));
            const rows = log.map(o => {
                // ربط بسيط بمعدل النفوق فى نفس يوم الانقطاع واليوم التالي، لمعرفة مدى التأثير الفعلي
                const rec = (b.records || []).find(r => r.date === o.date);
                const nextDate = new Date(o.date); nextDate.setDate(nextDate.getDate() + 1);
                const nextRec = (b.records || []).find(r => r.date === nextDate.toISOString().slice(0,10));
                const mortThatDay = rec ? (rec.mort||0)+(rec.cull||0) : null;
                const mortNextDay = nextRec ? (nextRec.mort||0)+(nextRec.cull||0) : null;
                return `<div class="check-row"><div class="txt">
                    <div style="font-weight:800;">⚡ انقطاع ${fmt(o.duration,1)} ساعة</div>
                    <div class="day">${o.date}${o.note ? ' · ' + esc(o.note) : ''}</div>
                    ${(mortThatDay!=null || mortNextDay!=null) ? `<div style="font-size:11.5px;color:var(--muted);margin-top:2px;">النفوق نفس اليوم: ${mortThatDay??'—'} · اليوم التالي: ${mortNextDay??'—'}</div>` : ''}
                </div>
                <button class="btn ghost sm owner-only" style="color:var(--red);" onclick="deleteOutageLog('${o.id}')">🗑️</button></div>`;
            }).join('');
            return `<div class="section"><div class="section-head"><h2>⚡ سجل انقطاع الكهرباء/أعطال المولد</h2></div>
                <div class="card" style="padding:0;">${rows || '<div class="empty" style="padding:14px;"><div class="ico">⚡</div>لا يوجد انقطاعات مسجّلة (الحمد لله).</div>'}</div>
                <button class="btn ghost block" style="margin-top:10px;" onclick="openOutageModal()">+ تسجيل انقطاع/عطل</button>
                <p style="font-size:10.5px;color:var(--muted);margin-top:6px;">💡 النفوق المعروض بجانب كل انقطاع هو نفس رقم اليوم/اليوم التالي من سجلاتك اليومية العادية — مؤشر استرشادي سريع لمدى تأثر القطيع، مش تحليل إحصائي دقيق.</p>
            </div>`;
        }
        // ============ جهات الاتصال السريعة (مورد/طبيب بيطري...) — اتصال/واتساب مباشر من أي شاشة ============
        function cleanPhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
        function telLink(phone) { return 'tel:' + cleanPhone(phone); }
        function waLink(phone, text) { return 'https://wa.me/' + cleanPhone(phone) + (text ? ('?text=' + encodeURIComponent(text)) : ''); }

        let editingContactId = null;
        function openContactModal(id) {
            editingContactId = id || null;
            const c = id ? state.contacts.find(x => x.id === id) : null;
            document.getElementById('contactModalTitle').textContent = id ? '✏️ تعديل جهة اتصال' : '📇 إضافة جهة اتصال سريعة';
            document.getElementById('ct_name').value = c ? c.name : '';
            const roleSel = document.getElementById('ct_role');
            const roles = (state.contactRoles && state.contactRoles.length) ? state.contactRoles : getDefaultContactRoles();
            roleSel.innerHTML = roles.map(r => `<option value="${esc(r.label)}">${r.icon} ${esc(r.label)}</option>`).join('');
            roleSel.value = c ? c.role : (roles[0] ? roles[0].label : 'مورد');
            document.getElementById('ct_phone').value = c ? c.phone : '';
            openModal('contactModalOverlay');
        }
        function saveContact() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const name = document.getElementById('ct_name').value.trim();
            const role = document.getElementById('ct_role').value;
            const phone = document.getElementById('ct_phone').value.trim();
            if (!name) { showToast('⚠️ اكتب اسم جهة الاتصال'); return; }
            if (!cleanPhone(phone)) { showToast('⚠️ اكتب رقم هاتف صحيح'); return; }
            if (editingContactId) {
                const c = state.contacts.find(x => x.id === editingContactId);
                if (c) Object.assign(c, { name, role, phone });
            } else {
                state.contacts.push({ id: uid(), name, role, phone });
            }
            persist();
            closeModal('contactModalOverlay');
            showToast('✅ تم حفظ جهة الاتصال');
            render();
        }
        function deleteContact(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix: القسم بالكامل داخل تبويب الإعدادات المحجوب عن العمال
            const c = (state.contacts || []).find(x => x.id === id);
            showConfirm('حذف جهة الاتصال هذه؟ يمكن استرجاعها لاحقًا من سلة المهملات.', () => {
                setState('contacts', state.contacts.filter(x => x.id !== id));
                if (c) softDeleteToGlobalTrash('contact', c, `🗑️ حذف جهة اتصال: ${c.name || ''}`);
                persist();
                render();
            });
        }
        function contactRoleIcon(roleLabel) {
            const roles = (state.contactRoles && state.contactRoles.length) ? state.contactRoles : getDefaultContactRoles();
            const found = roles.find(r => r.label === roleLabel);
            return found ? found.icon : '📇';
        }
        function renderContactsSection() {
            const rows = state.contacts.length ? state.contacts.map(c => `
                <div class="check-row"><div class="txt">
                    <div style="font-weight:800;">${contactRoleIcon(c.role)} ${esc(c.name)}</div>
                    <div class="day">${esc(c.role)} · ${esc(c.phone)}</div>
                </div>
                <div class="row-actions" style="gap:6px;">
                    <a class="btn ghost xs" href="${telLink(c.phone)}">☎️ اتصال</a>
                    <a class="btn ghost xs" style="color:#25D366;" href="${waLink(c.phone)}" target="_blank" rel="noopener">💬 واتساب</a>
                    <button class="btn ghost xs" onclick="openContactModal('${c.id}')">✏️</button>
                    <button class="btn ghost xs" style="color:var(--red);" onclick="deleteContact('${c.id}')">🗑️</button>
                </div></div>`).join('') : '<div class="empty" style="padding:14px;"><div class="ico">📇</div>لا توجد جهات اتصال محفوظة بعد.</div>';
            return `<div class="card" style="padding:0;">${rows}</div>
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <button class="btn gold block" onclick="openContactModal()">+ إضافة جهة اتصال سريعة</button>
                    <button class="btn ghost" style="flex-shrink:0;padding:10px 14px;" onclick="showContactRolesManager()" title="إدارة الأدوار">🏷️</button>
                </div>`;
        }
        // ============ إدارة أدوار جهات الاتصال — إضافة/تعديل/حذف دور بأيقونته، نفس نمط دليل الأمراض ============
        let editingContactRoleId = null;
        function showContactRolesManager() {
            if (!requirePermission('management')) return;
            const html = `<div id="contactRolesList"></div>
                <div class="form-grid" style="margin-top:10px;">
                    <div class="field"><label>أيقونة (إيموجي)</label><input id="cr_icon" maxlength="4" placeholder="🚚" style="text-align:center;"></div>
                    <div class="field"><label>اسم الدور</label><input id="cr_label" placeholder="مثال: مندوب توصيل"></div>
                </div>
                <button class="btn ghost block" id="crSaveBtn" style="margin-top:8px;" onclick="saveContactRole()">+ إضافة دور</button>`;
            openGenericModal('🏷️ إدارة أدوار جهات الاتصال', html);
            renderContactRolesList();
        }
        function renderContactRolesList() {
            const box = document.getElementById('contactRolesList');
            if (!box) return;
            const roles = state.contactRoles || [];
            box.innerHTML = roles.length ? roles.map(r => `
                <div class="check-row"><button class="del-x" onclick="removeContactRole('${r.id}')" title="حذف">✕</button>
                    <div class="txt" onclick="editContactRole('${r.id}')" style="cursor:pointer;">${r.icon} ${esc(r.label)}</div>
                </div>`).join('') : '<div class="empty" style="padding:14px;">لا توجد أدوار بعد.</div>';
        }
        function editContactRole(id) {
            const r = (state.contactRoles || []).find(x => x.id === id);
            if (!r) return;
            editingContactRoleId = id;
            document.getElementById('cr_icon').value = r.icon;
            document.getElementById('cr_label').value = r.label;
            document.getElementById('crSaveBtn').textContent = '✏️ حفظ التعديل';
        }
        function saveContactRole() {
            if (!requirePermission('management')) return;
            const icon = document.getElementById('cr_icon').value.trim() || '📇';
            const label = document.getElementById('cr_label').value.trim();
            if (!label) { showToast('اكتب اسم الدور أولاً'); return; }
            const roles = (state.contactRoles || []).slice();
            if (editingContactRoleId) {
                const idx = roles.findIndex(r => r.id === editingContactRoleId);
                if (idx > -1) roles[idx] = { ...roles[idx], icon, label };
            } else {
                roles.push({ id: uid(), icon, label });
            }
            setState('contactRoles', roles);
            persist();
            editingContactRoleId = null;
            document.getElementById('cr_icon').value = '';
            document.getElementById('cr_label').value = '';
            document.getElementById('crSaveBtn').textContent = '+ إضافة دور';
            renderContactRolesList();
            showToast('تم حفظ الدور ✅');
        }
        function removeContactRole(id) {
            if (!requirePermission('management')) return;
            showConfirm('حذف الدور ده مش هيمسح جهات الاتصال اللي مستخدماه، بس مش هيظهر تانى فى القايمة عند الإضافة. متأكد؟', () => {
                setState('contactRoles', (state.contactRoles || []).filter(r => r.id !== id));
                persist();
                renderContactRolesList();
            });
        }
        // شريط أزرار سريعة (اتصال/واتساب) يظهر بجوار حقل المورد فى شاشات الشراء/السجل — يفلتر حسب الصفة المطلوبة
        function renderQuickContactChips(roleFilter) {
            const list = roleFilter ? state.contacts.filter(c => c.role === roleFilter) : state.contacts;
            if (!list.length) return '';
            const chips = list.map(c => `
                <span style="display:inline-flex;align-items:center;gap:4px;background:#f3f1e8;border-radius:20px;padding:4px 8px;font-size:11.5px;margin:2px;">
                    ${esc(c.name)}
                    <a href="${telLink(c.phone)}" title="اتصال" style="text-decoration:none;">☎️</a>
                    <a href="${waLink(c.phone)}" target="_blank" rel="noopener" title="واتساب" style="text-decoration:none;">💬</a>
                </span>`).join('');
            return `<div style="grid-column:1/-1;margin:-4px 0 4px;">${chips}</div>`;
        }

        // (تمت إزالة نظام "سجل التواصل/الاستشارات" بالكامل بناءً على طلب تبسيط الاستخدام)


        let settingsSubTab = 'identity';
        let auditLogDateFilter = 'all_time'; // مؤقت (session فقط، مش محفوظ) — لتصفية عرض سجل التدقيق بالتاريخ
        function setSettingsSubTab(id) { settingsSubTab = id; render(); }
        function renderSettingsTab() {
            if (currentRole !== 'owner') {
                return `<div class="card empty" style="margin-top:14px;"><div class="ico">🔒</div>هذا القسم متاح للمالك فقط.</div>`;
            }
            const b = getActiveBatch();
            const allBatches = [...state.batches].sort((x,c)=> (x.status==='مؤرشفة'?1:0) - (c.status==='مؤرشفة'?1:0));
            const batchRows = allBatches.map(x => `
                <div class="check-row" style="${x.id===state.activeId?'background:rgba(217,165,68,.12);border-right:3px solid var(--wheat);':''}">
                    <div class="txt">
                        <div style="font-weight:800;">${esc(x.name)} ${x.id===state.activeId?'<span class="pill ok" style="font-size:10px;">الدفعة الحالية</span>':''} ${x.status==='مؤرشفة'?'<span class="pill info" style="font-size:10px;">مؤرشفة</span>':''}</div>
                        <div class="day">${getSpeciesData(x.species).label} · ${x.startDate} · ${fmt(x.startCount,0)} كتكوت${x.location?' · 📍 '+esc(x.location):''}</div>
                    </div>
                    ${x.id!==state.activeId && x.status!=='مؤرشفة' ? `<button class="btn ghost sm" onclick="selectBatch('${x.id}')">تنشيط</button>` : ''}
                    <button class="btn ghost sm" onclick="editBatch('${x.id}')">✏️ تعديل بيانات</button>
                    <button class="btn danger sm" onclick="deleteBatch('${x.id}')">🗑️ حذف نهائي</button>
                </div>`).join('');
            const activeNow = allBatches.filter(x => x.status !== 'مؤرشفة');
            const overviewSection = activeNow.length >= 2 ? `
            <div class="section">
                <div class="section-head"><h2>🏠 نظرة عامة على كل العنابر/المواقع النشطة</h2></div>
                <div class="card" style="padding:0;">
                    ${activeNow.map(x => {
                        const xm = computeMetrics(x);
                        return `<div class="check-row" style="${x.id===state.activeId?'background:rgba(217,165,68,.12);border-right:3px solid var(--wheat);':''}"><div class="txt">
                            <div style="font-weight:800;">${esc(x.name)}${x.location?' — 📍 '+esc(x.location):''}</div>
                            <div class="day">${getSpeciesData(x.species).label} · عمر ${fmt(xm.todayAge,0)} يوم</div>
                            ${statLine(`أحياء`, `${fmt(xm.liveCount,0)}`, {lineStyle:`margin-top:4px;`})}
                            ${statLine(`نسبة النفوق`, `${fmt(xm.mortRate,2)}%`)}
                            ${statLine(`FCR حتى الآن`, `${xm.fcr!=null?fmt(xm.fcr,2):'—'}`)}
                        </div>
                        ${x.id!==state.activeId ? `<button class="btn ghost sm" onclick="selectBatch('${x.id}')">تنشيط</button>` : '<span class="pill ok" style="font-size:10px;">نشطة الآن</span>'}
                        </div>`;
                    }).join('')}
                </div>
                <p style="font-size:10.5px;color:var(--muted);margin:8px 2px 0;">💡 يظهر هذا القسم تلقائيًا عند وجود دفعتين نشطتين أو أكثر — مفيد لو عندك أكثر من عنبر أو موقع فى نفس الوقت.</p>
            </div>` : '';

            // ============ فئة 0: هوية المزرعة ============
            const catIdentity = `
            <div class="section" style="margin-top:0;">
                <div class="section-head"><h2>🏷️ هوية المزرعة</h2></div>
                <div class="card">
                    <div class="field full"><label>اسم المزرعة (يظهر أعلى التطبيق)</label>
                        <input id="set_farmName" value="${esc(state.farmName || '')}" placeholder="مثال: مزرعة العائلة - إيتاي البارود" oninput="document.getElementById('set_farmNamePreview').textContent = this.value.trim() || 'مزرعتي للتسمين';">
                    </div>
                    <p style="font-size:11px;color:var(--muted);margin:2px 2px 10px;">سيظهر باسم: <b id="set_farmNamePreview">${esc(state.farmName || 'مزرعتي للتسمين')}</b></p>
                    <button class="btn gold" onclick="saveFarmName()">💾 حفظ اسم المزرعة</button>
                </div>
            </div>`;

            // ============ مقتطف: اهتزاز التطبيق (يُستخدم داخل فئة "النظام والتطبيق") ============
            const snippetVibration = `
                <div class="card" style="margin-top:10px;">
                    <label class="check-row" style="cursor:pointer;">
                        <input type="checkbox" id="set_vibration" ${state.vibrationEnabled !== false ? 'checked' : ''} onchange="toggleVibration(this.checked)">
                        <div class="txt"><div style="font-weight:800;">📳 اهتزاز عند الحفظ والتنبيهات المهمة</div>
                        <div class="day">اهتزاز خفيف عند حفظ سجل يومي، تنفيذ تحصين، أو ظهور تنبيه خطر</div></div>
                    </label>
                </div>`;

            // ============ مقتطف: طلبات الدخول وأجهزة التفعيل (يُستخدم داخل فئة "الوصول والحسابات") ============
            const snippetDeviceAccess = isSourceDevice() ? `
                <div id="accessReqListBox">${renderAccessRequestsListCard()}</div>
                <div class="card" style="margin-top:10px;">
                    <label style="font-size:12px;font-weight:800;color:var(--barn-dark);display:block;margin-bottom:4px;">🆔 معرّف جهازك (UID) — انسخه وحطّه فى Firestore Rules</label>
                    <p style="font-size:11.5px;color:var(--muted);margin:0 0 8px;">الكود ده لازم تحطه فى الـ Rules عشان الجهاز ده بس (جهازك المصدر) يقدر يوافق/يرفض على طلبات الناس. متسبيهوش لحد.</p>
                    <div style="background:var(--cream, #f5efe0);border:1.5px solid var(--line);border-radius:10px;padding:12px;text-align:center;word-break:break-all;font-family:monospace;font-size:12.5px;font-weight:700;color:var(--barn-dark);">${esc(getFbUid() || (window._fbAuthErr ? ('❌ خطأ: ' + window._fbAuthErr) : (window.firebase ? 'لسه بيحاول يتصل...' : '❌ مكتبة فايربيز مش اتحمّلت خالص (تأكد من الإنترنت)')))}</div>
                    <button class="btn ghost sm" style="margin-top:8px;" onclick="copyDeviceUid()">📋 نسخ الـ UID</button>
                    <button class="btn ghost sm" style="margin-top:8px;" onclick="toggleDeviceUidQR()">🔳 عرض كـQR</button>
                    <div id="deviceUidQrBox" style="display:none;margin-top:10px;flex-direction:column;align-items:center;gap:6px;">
                        <div id="deviceUidQrCanvas"></div>
                        <p style="font-size:10px;color:var(--muted);margin:0;text-align:center;">صوّره بكاميرا أي موبايل تاني عشان تاخد الـUID جاهز بدون كتابة يدوية</p>
                    </div>
                </div>
                <div class="card" style="margin-top:10px;">
                    <label style="font-size:12px;font-weight:800;color:var(--barn-dark);display:block;margin-bottom:4px;">🔑 توليد كود تفعيل يدوي (احتياطي بدون إنترنت)</label>
                    <p style="font-size:11.5px;color:var(--muted);margin:0 0 8px;">الأفضل دايمًا إنك توافق من قسم "طلبات الدخول" فوق. الأداة دي بس احتياط لو حصل ومفيش نت وقت الموافقة — اكتب كود الجهاز اللي هيديهولك الشخص تليفونيًا.</p>
                    <input type="text" id="genDeviceCodeInput" placeholder="مثال: AB12-CD34" oninput="generateActivationForDevice()" style="width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:10px;font-size:14px;margin-bottom:8px;text-align:center;letter-spacing:1px;">
                    <div style="background:var(--cream, #f5efe0);border:1.5px solid var(--line);border-radius:10px;padding:12px;text-align:center;">
                        <div style="font-size:11px;color:var(--muted);">كود التفعيل</div>
                        <div id="genActivationCodeOutput" style="font-size:20px;font-weight:900;letter-spacing:2px;color:var(--barn-dark);min-height:26px;"></div>
                    </div>
                    <button class="btn ghost sm" style="margin-top:8px;" onclick="copyGeneratedCode()">📋 نسخ كود التفعيل</button>
                </div>
                <div class="card" style="margin-top:10px;">
                    <label style="font-size:12px;font-weight:800;color:var(--barn-dark);display:block;margin-bottom:4px;">🛡️ تأمين حساب المالك (استرداد الوصول)</label>
                    <p style="font-size:11.5px;color:var(--muted);margin:0 0 10px;line-height:1.7;">
                        صلاحية المالك (isOwner) على السيرفر مربوطة بمعرّف جهازك (UID) فوق. لو مسحت بيانات المتصفح، غيّرت الجهاز، أو مسحت التطبيق ورَكّبته تانى من غير ما تربط حساب استرداد — هتفقد صلاحية المالك على كل مزارعك نهائيًا ومفيش مسار رجوع.
                        ${hasRecoveryLinked() ? ` اتربط حساب استرداد بالفعل على: <b>${esc(getRecoveryEmail() || '')}</b>. احتفظ بالإيميل وكلمة المرور فى مكان آمن، ولو عايز تغيّر كلمة المرور استخدم الحقل تحت.` : ' اربط إيميل وكلمة مرور دلوقتي (مرة واحدة بس) عشان لو حصل وفقدت الوصول للجهاز ده، تقدر ترجع لنفس صلاحيتك من أي جهاز تانى عن طريق "أنا صاحب التطبيق وعندي حساب استرداد" فى شاشة إذن الاستخدام.'}
                    </p>
                    ${hasRecoveryLinked() ? `
                    <div class="form-grid">
                        <div class="field full"><label>كلمة مرور جديدة (6 حروف على الأقل)</label><input type="password" id="rec_newpass" placeholder="كلمة مرور جديدة" autocomplete="new-password"></div>
                    </div>
                    <div class="auth-err" id="recoveryErr" style="color:var(--red,#c0392b);font-size:11.5px;margin-top:4px;"></div>
                    <button class="btn ghost sm" style="margin-top:8px;" onclick="updateRecoveryPassword()">🔄 تحديث كلمة المرور</button>
                    ` : `
                    <div class="form-grid">
                        <div class="field full"><label>إيميل الاسترداد</label><input type="email" id="rec_email" placeholder="example@email.com" autocomplete="email"></div>
                        <div class="field"><label>كلمة المرور</label><input type="password" id="rec_pass" placeholder="6 حروف على الأقل" autocomplete="new-password"></div>
                        <div class="field"><label>تأكيد كلمة المرور</label><input type="password" id="rec_pass2" placeholder="اكتبها تانى" autocomplete="new-password"></div>
                    </div>
                    <div class="auth-err" id="recoveryErr" style="color:var(--red,#c0392b);font-size:11.5px;margin-top:4px;"></div>
                    <button class="btn gold sm" style="margin-top:8px;" onclick="linkOwnerRecoveryAccount()">🔗 ربط حساب الاسترداد</button>
                    `}
                </div>` : '';

            // ============ فئة 1: المزرعة والدفعات ============
            const catFarm = `
            <div class="section">
                <div class="section-head"><h2>🐔 بيانات الدفعات وإدارتها</h2></div>
                <div class="card">
                    <p style="font-size:12px;color:var(--muted);margin:0 0 10px;line-height:1.7;">
                        كل بيانات الدفعة (الاسم، النوع، السلالة، تاريخ الاستلام، عدد الكتاكيت، مساحة العنبر، أعمار وأوزان البيع المستهدفة) قابلة للتعديل من هنا مباشرة، وكذلك تنشيط دفعة أخرى أو حذفها نهائيًا — دون الحاجة للبحث عنها فى تبويبات أخرى.
                    </p>
                    <div class="card" style="padding:0;">${batchRows || '<div class="empty" style="padding:14px;">لا توجد دفعات بعد.</div>'}</div>
                    <button class="btn gold block" style="margin-top:10px;" onclick="openBatchModal()">+ إنشاء دفعة تسمين جديدة</button>
                    ${b ? `<button class="btn ghost block" style="margin-top:8px;" onclick="endCycle('${b.id}')">🏁 إنهاء وأرشفة الدفعة الحالية</button>` : ''}
                </div>
            </div>
            ${overviewSection}
            ${b ? `
            <div class="section">
                <div class="section-head"><h2>✅ قالب تشيك ليست العمليات اليومية</h2></div>
                <div class="card">
                    <p style="font-size:12px;color:var(--muted);margin:0 0 10px;line-height:1.7;">
                        عدّل بنود التشيك ليست هنا — أي بند تضيفه أو تحذفه بيظهر فورًا فى "تسجيل بيانات اليوم" عشان العامل ينفّذه. التنفيذ اليومي (التعليم ✔️) بيتم من هناك، مش من هنا.
                    </p>
                    <div class="card" style="padding:0;">${b.checklistTemplate.length ? b.checklistTemplate.map(t => `
                        <div class="check-row"><div class="txt">${esc(t.text)} <span style="font-size:10.5px;color:var(--muted);">(${checklistPeriodLabel(t)})</span></div>
                            <button class="btn ghost sm" onclick="editChecklistTask('${t.id}')">✏️</button>
                            <button class="btn danger sm" onclick="removeChecklistTask('${t.id}')">🗑️</button>
                        </div>`).join('') : '<div class="empty" style="padding:14px;"><div class="ico">✅</div>لا توجد بنود بعد.</div>'}</div>
                    <div class="form-grid" style="margin-top:12px;">
                        <div class="field full"><label>إضافة بند جديد للتشيك ليست</label><input id="ck_newtask" placeholder="مثال: فحص أبواب التهوية"></div>
                        <div class="field full"><label>فترة التنفيذ</label>
                            <select id="ck_period">
                                <option value="day">☀️ نهارًا فقط (جولة الصباح)</option>
                                <option value="night">🌙 ليلاً فقط</option>
                                <option value="both">☀️🌙 نهارًا وليلاً (يظهر فى الجولتين)</option>
                            </select>
                        </div>
                    </div>
                    <button class="btn ghost block" id="ckSaveBtn" style="margin-top:6px;" onclick="addChecklistTask()">+ إضافة بند</button>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>⚠️ قواعد تعارض الإضافات</h2></div>
                <div class="card">
                    <p style="font-size:12px;color:var(--muted);margin:0 0 10px;line-height:1.7;">
                        عرّف هنا أي صنفين (علف/ماء) بتعرف من خبرتك إنهم متعارضين ومينفعش يتاخدوا مع بعض (زي حمض عضوي مع مضاد حيوي معين). اكتب كلمة مفتاحية من اسم كل صنف — لو الاتنين بقوا "نشطين" مع بعض فى نفس اليوم، هيظهرلك تنبيه أحمر فورًا فى التنبيهات.
                    </p>
                    ${(state.conflictRules||[]).map(r => `
                        <div class="check-row"><div class="txt">"${esc(r.a)}" ⚡ "${esc(r.b)}"${r.note ? ` — ${esc(r.note)}` : ''}</div>
                        <button class="btn danger sm" onclick="removeConflictRule('${r.id}')">🗑️</button></div>`).join('') || '<div class="empty" style="padding:14px;"><div class="ico">⚠️</div>لا توجد قواعد بعد.</div>'}
                    <div class="form-grid" style="margin-top:12px;border-top:1.5px solid var(--line);padding-top:12px;">
                        <div class="field"><label>كلمة مفتاحية من اسم الصنف الأول</label><input id="cr_a" placeholder="مثال: حمض الستريك"></div>
                        <div class="field"><label>كلمة مفتاحية من اسم الصنف الثاني</label><input id="cr_b" placeholder="مثال: تيلميكوسين"></div>
                        <div class="field full"><label>ملاحظة (اختياري)</label><input id="cr_note" placeholder="مثال: الحمض بيقلل فاعلية المضاد الحيوي"></div>
                    </div>
                    <button class="btn gold block" style="margin-top:6px;" onclick="addConflictRule()">+ إضافة قاعدة تعارض</button>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🏠 العنابر/الأقسام (اختياري)</h2></div>
                <div class="card">
                    <p style="font-size:12px;color:var(--muted);margin:0 0 10px;line-height:1.7;">
                        لو الدفعة موزعة على أكثر من عنبر أو قسم، سجّلهم هنا للتوثيق والمقارنة فقط — الحسابات الرئيسية تعتمد على "مساحة العنبر" و"عدد الكتاكيت" المُدخلة عند إنشاء الدفعة، مش على القائمة دي.
                    </p>
                    <div class="form-grid">
                        <div class="field"><label>اسم العنبر/القسم</label><input id="hs_name" placeholder="مثال: عنبر 1"></div>
                        <div class="field"><label>المساحة (م²)</label><input id="hs_area" type="number" inputmode="decimal" step="0.1" min="0"></div>
                        <div class="field"><label>عدد الطيور</label><input id="hs_count" type="number" inputmode="decimal" min="0"></div>
                    </div>
                    <button class="btn ghost block" id="hsSaveBtn" style="margin-top:6px;" onclick="addHouse()">+ إضافة عنبر/قسم</button>
                    ${b.houses.length ? `<div class="scroll-x" style="margin-top:10px;"><table><thead><tr><th>الاسم</th><th>المساحة</th><th>الطيور</th><th></th></tr></thead><tbody>${b.houses.map(h => `
                        <tr><td>${esc(h.name)}</td><td>${fmt(h.area,1)} م²</td><td>${fmt(h.count,0)}</td>
                        <td><button class="btn ghost sm" onclick="editHouse('${h.id}')">✏️</button> <button class="btn danger sm" onclick="removeHouse('${h.id}')">حذف</button></td></tr>`).join('')}</tbody></table></div>
                    ${statLine(`الإجمالي`, `${fmt(b.houses.reduce((s,h)=>s+(h.area||0),0),1)} م² · ${fmt(b.houses.reduce((s,h)=>s+(h.count||0),0),0)} طائر`, {lineStyle:`margin-top:8px;border-top:2px solid var(--barn-dark);padding-top:8px;`,kStyle:`font-weight:900;`})}`
                    : ''}
                </div>
            </div>` : ''}
            <div class="section">
                <div class="section-head"><h2>📇 جهات الاتصال السريعة</h2></div>
                ${renderContactsSection()}
            </div>`;

            // ============ فئة 2: الأدوات والحاسبات ============
            const catTools = `
            <div class="section" style="margin-top:0;">
                <div class="section-head"><h2>🧮 حاسبات ومراجع سريعة</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    <button class="btn ghost block" onclick="openFeedCalcModal()">🧮 حاسبة تكوين العلف</button>
                    <button class="btn ghost block" onclick="openWaterCalcModal()">💧 حاسبة تركيز محلول الإماهة/اللقاح فى المياه</button>
                    <button class="btn ghost block" onclick="showGlossaryFull()">📖 دليل المصطلحات</button>
                    <button class="btn ghost block" onclick="showDiseaseLibrary()">🩺 دليل الأمراض (قابل للتعديل)</button>
                    <button class="btn ghost block" onclick="openGlobalSearch()">🔎 بحث شامل فى التطبيق</button>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>📋 المهام والطباعة والاستيراد</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    <button class="btn ghost block" onclick="showTodayTasksModal()">📋 مهام اليوم (كل المستحقات فى شاشة واحدة)</button>
                    <button class="btn ghost block" onclick="openArchiveModal()">📁 أرشيف الدورات</button>
                    <button class="btn ghost block" onclick="openWorkerSheetPrint()">🖨️ طباعة ورقة تعليمات يومية للعامل</button>
                    <button class="btn ghost block" onclick="openCsvImportModal()">📂 استيراد سجل يومي من CSV/Excel</button>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🔮 محاكي ما قبل الدورة (توأم رقمي)</h2></div>
                <div class="card">
                    <div class="day" style="margin-bottom:8px;">قبل ما تبدأ دفعة جديدة فعليًا: جرّب كثافة وشهر بدء مختلفين، واتوقّع EPEF والربح المتوقع بناءً على تاريخ مزرعتك الفعلي — قبل ما تلتزم بالقرار</div>
                    <div class="form-grid">
                        <div class="field"><label>الكثافة المخططة (كجم/م²)</label><input type="number" step="0.5" id="pc_density" placeholder="مثال: 22"></div>
                        <div class="field"><label>شهر بدء التربية</label>
                            <select id="pc_month">
                                ${['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'].map((n,i)=>`<option value="${i}" ${i===new Date().getMonth()?'selected':''}>${n}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <button type="button" class="btn gold sm" style="margin-top:6px;" onclick="runPreCycleForecast()">🔮 احسب توقع مبدئي</button>
                    <div id="preCycleResult" style="margin-top:8px;"></div>
                    <div class="day" style="margin-top:6px;color:var(--muted);">⚠️ مؤشر استرشادي مبني على دوراتك المؤرشفة السابقة فقط — كل ما راكمت دورات أكتر زادت دقته</div>
                </div>
            </div>`;

            // ============ فئة جديدة: المعايير المرجعية (منحنى الوزن/العلف/البيئة + معايير الحسابات المتقدمة) ============
            const catStandards = `
            <div class="section" style="margin-top:0;">
                <div class="section-head"><h2>📊 عن هذا القسم</h2></div>
                <div class="card">
                    <p style="font-size:12px;color:var(--muted);margin:0;line-height:1.7;">
                        كل الأرقام هنا بتغذّي محرك الحسابات فى التطبيق (منحنى الأداء المرجعي، تقدير وقود التدفئة، مواعيد التنبيهات، ألوان تقييم الأداء، دراسة الجدوى). بتتعدل نادرًا — عدّلها براحتك على حسب ظروف مزرعتك الفعلية.
                    </p>
                </div>
            </div>
            ${renderStdRefSection()}
            ${renderAdvancedSettingsSection()}`;

            // ============ فئة 3: إعدادات النظام ============
            const catSystem = `
            <div class="section" style="margin-top:0;">
                <div class="section-head"><h2>📱 التطبيق والإشعارات</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    <button class="btn ghost block" id="installAppBtn" style="display:${(isStandaloneMode() ? false : (deferredInstallPrompt || isIOSDevice())) ? '' : 'none'};" onclick="triggerInstallApp()">${deferredInstallPrompt ? '📲 تثبيت التطبيق على الجهاز' : '📲 كيفية التثبيت على آيفون'}</button>
                    <button class="btn ghost block" onclick="requestNotificationPermission()">🔔 تفعيل الإشعارات الفورية (تصل والتطبيق مقفول)</button>
                    <div class="day" style="margin-top:-4px;padding:0 2px;">الحالة الآن: <b>${notificationStatusInfo().label}</b></div>
                    <div class="day" style="margin-top:-4px;padding:0 2px;line-height:1.6;">💡 دي إشعارات حقيقية (Push) بتوصل من سيرفر حتى لو التطبيق مقفول تمامًا — بتشتغل لكل موعد ليه "وقت تنفيذ" و"نبّهني قبله بكذا" محدد (تحصين، علاج، إضافة، معاملة فرشة، أو استحقاق مورد/عميل). لازم اتصال إنترنت وقت وصول الإشعار.</div>
                    <label class="check-row" style="cursor:pointer;">
                        <input type="checkbox" id="as_soundAlert" ${state.appSettings.soundAlertEnabled ? 'checked' : ''} onchange="toggleSoundAlert()">
                        <div class="txt"><div style="font-weight:800;">🔊 صوت تنبيه داخل التطبيق (بديل)</div>
                        <div class="day">يعمل حتى لو إشعارات المتصفح غير مدعومة — يُشغَّل عند فتح التطبيق ووجود تنبيهات عاجلة</div></div>
                    </label>
                    <button class="btn ghost block" onclick="playAlertBeep()">🔊 تجربة الصوت الآن</button>
                    <div style="font-size:11px;color:var(--muted);background:#f8f5ed;border-radius:8px;padding:8px;">
                        💡 لو ظهرت رسالة "المتصفح لا يدعم" لتحديد الموقع أو الإشعارات: ده غالبًا لأن الملف مفتوح مباشرة (file://) بدل رابط https، وده يمنع بعض المتصفحات/الواجهات من هذه الميزات لأسباب أمنية. الحل: افتح التطبيق من متصفح حقيقي (Chrome/Safari) بعد رفعه على استضافة (حتى مجانية)، أو استخدم البحث بالاسم لتحديد الموقع، وصوت التنبيه البديل أعلاه بدل الإشعارات.
                    </div>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>📳 التنبيهات الاهتزازية</h2></div>
                ${snippetVibration.replace('margin-top:10px;', '')}
            </div>
            <div class="section">
                <div class="section-head"><h2>🌙 مظهر التطبيق</h2></div>
                <div class="card">
                    <label class="check-row" style="cursor:pointer;">
                        <input type="checkbox" id="set_darkMode" ${state.darkMode ? 'checked' : ''} onchange="toggleDarkMode(this.checked)">
                        <div class="txt"><div style="font-weight:800;">🌙 الوضع الليلي</div>
                        <div class="day">مريح أكتر للعين وقت تسجيل بيانات الليل جوه العنبر أو فى الضلمة</div></div>
                    </label>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>💱 العملة والوحدات</h2></div>
                <div class="card">${renderCurrencySettings()}</div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🎛️ تخصيص ترتيب لوحة التحكم</h2></div>
                <div id="dashOrderSettingsBox">${renderDashboardOrderSettings()}</div>
            </div>`;

            // ============ فئة 4: البيانات والنسخ الاحتياطي ============
            const catData = `
            <div class="section" style="margin-top:0;">
                <div class="section-head"><h2>💾 النسخ الاحتياطي للبيانات</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    ${(() => {
                        const days = state.lastBackupDate ? Math.floor((new Date(todayStr()) - new Date(state.lastBackupDate)) / 86400000) : null;
                        const overdue = days === null || days > 7;
                        return `<div style="font-size:12.5px;padding:8px 10px;border-radius:10px;background:${overdue?'rgba(193,68,60,.1)':'rgba(44,122,75,.1)'};color:${overdue?'var(--red)':'var(--green)'};font-weight:700;">
                            ${state.lastBackupDate ? `📅 آخر نسخة احتياطية: ${state.lastBackupDate} (منذ ${days} يوم)` : '⚠️ لا توجد نسخة احتياطية مأخوذة بعد'}
                            ${overdue ? '<br>ننصح بتصدير نسخة احتياطية الآن — بياناتك محفوظة محليًا على هذا الجهاز فقط.' : ''}
                        </div>`;
                    })()}
                    <button class="btn gold block" onclick="exportData()">💾 تصدير نسخة احتياطية (JSON)</button>
                    <label class="check-row" style="cursor:pointer;">
                        <input type="checkbox" id="as_autoBackup" ${state.autoBackupEnabled ? 'checked' : ''} onchange="toggleAutoBackup()">
                        <div class="txt"><div style="font-weight:800;">🔄 نسخ احتياطي تلقائي أسبوعي</div>
                        <div class="day">يُصدَّر تلقائيًا كل 7 أيام طالما الجهاز فاتح التطبيق — لا يعتمد على تذكّرك</div></div>
                    </label>
                    <button class="btn ghost block" onclick="exportCSV()">📊 تصدير سجل الدفعة الحالية (CSV)</button>
                    <button class="btn ghost block" onclick="exportXLSX()">📗 تصدير سجل الدفعة الحالية (Excel .xlsx)</button>
                    <button class="btn ghost block" onclick="document.getElementById('importFile').click()">📂 استيراد نسخة احتياطية</button>
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.6;">💡 التطبيق يعمل بالكامل بدون إنترنت وبياناته محفوظة على هذا الجهاز أولًا (localStorage)، وتتزامن مع السحابة تلقائيًا لو فعّلت المزامنة أدناه. لحماية إضافية، صدّر نسخة احتياطية بشكل دوري.</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🔄 مزامنة سحابية بين الأجهزة (المالك والعمال)</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    ${farmId ? `<div style="font-size:12.5px;padding:8px 10px;border-radius:10px;background:${cloudConnected?'rgba(44,122,75,.1)':'rgba(217,165,68,.15)'};color:${cloudConnected?'var(--green)':'var(--barn-dark)'};font-weight:700;">
                        ${cloudConnected ? '🟢 متصل ومتزامن مع باقي الأجهزة' : '🟡 جاري الاتصال بالسحابة...'}
                    </div>` : `<p style="font-size:11px;color:var(--muted);margin:0;line-height:1.6;">مفيش مزرعة سحابية مفعّلة على هذا الجهاز دلوقتي — بياناتك محفوظة محليًا فقط.</p>`}
                    ${(() => {
                        const farms = getFarmsList();
                        if (!farms.length) return '';
                        return `<div style="display:grid;gap:6px;">
                            ${farms.map(f => `
                                <div class="check-row" style="${f.id===farmId?'background:rgba(217,165,68,.12);border-right:3px solid var(--wheat);':''}">
                                    <div class="txt">
                                        <div style="font-weight:800;">${esc(f.name || f.id)} ${f.id===farmId?'<span class="pill ok" style="font-size:10px;">المزرعة الحالية</span>':''}</div>
                                        <div class="day">رمز: ${esc(f.id)}</div>
                                    </div>
                                    ${f.id!==farmId ? `<button class="btn ghost sm" onclick="switchToFarm('${f.id}')">🔁 تبديل</button>` : ''}
                                    <button class="btn danger sm" onclick="removeFarmFromListUI('${f.id}')">✕ إزالة</button>
                                </div>`).join('')}
                        </div>`;
                    })()}
                    <button class="btn gold block" onclick="createNewFarm()">🆕 إنشاء مزرعة سحابية جديدة</button>
                    <button class="btn ghost block" onclick="joinExistingFarm()">🔗 الانضمام لمزرعة موجودة برمز</button>
                    ${farmId ? `<div style="display:flex;gap:8px;align-items:center;">
                        <div style="font-size:16px;font-weight:900;letter-spacing:2px;background:var(--panel-2);padding:6px 12px;border-radius:8px;flex:1;text-align:center;">${esc(farmId)}</div>
                        <button class="btn ghost sm" onclick="copyFarmCode()">📋 نسخ الرمز الحالي</button>
                    </div>
                    <button class="btn ghost block" onclick="disconnectFromFarm()">🔌 وقف المزامنة والعمل محليًا فقط</button>` : ''}
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">💡 كل مزرعة عندها بياناتها المستقلة تمامًا (دفعات، عمال، مخزون). التبديل بين مزرعتين بيعرض بيانات المزرعة المختارة بدل الحالية — مش عرض مجمّع للاتنين مع بعض.</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🧹 توفير المساحة</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    ${(() => {
                        const { photoCount, approxKB } = estimateArchivePhotoCleanup();
                        return photoCount > 0
                            ? `<div style="font-size:12.5px;padding:8px 10px;border-radius:10px;background:rgba(217,165,68,.15);color:var(--barn-dark);font-weight:700;">📸 ${photoCount} صورة توثيقية فى دورات مؤرشفة مضى عليها أكثر من ${ARCHIVE_PHOTO_CLEANUP_DAYS} يوم (~${approxKB.toLocaleString('ar-EG')} ك.ب) — يمكن حذفها لتوفير المساحة دون التأثير على أي بيانات رقمية.</div>`
                            : `<div style="font-size:12px;color:var(--muted);">لا توجد صور فى دورات مؤرشفة قديمة تحتاج تنظيف حاليًا.</div>`;
                    })()}
                    <button class="btn ghost block" onclick="cleanupOldArchivedPhotos()">🧹 تنظيف صور الدورات المؤرشفة القديمة</button>
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.6;">💡 يحذف الصور التوثيقية فقط من دورات مؤرشفة قديمة (بعد ${ARCHIVE_PHOTO_CLEANUP_DAYS} يوم من الأرشفة) — كل السجلات والأرقام والتحليلات تبقى كاملة ولا يتأثر بها أي تقرير أو مقارنة دورات. الدفعات النشطة حاليًا لا تتأثر إطلاقًا.</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🕐 لقطات محلية سابقة (استرجاع سريع)</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.6;">لقطة تلقائية تُحفظ مرة كل يوم من جهازك نفسه (بدون صور توثيقية لتوفير المساحة)، بالإضافة لإمكانية أخذ لقطة يدوية فورية. آخر ${MAX_LOCAL_SNAPSHOTS} لقطات فقط بيتم الاحتفاظ بيهم.</p>
                    <button class="btn ghost block" onclick="manualSnapshotNow()">📸 احفظ لقطة الآن</button>
                    ${state.localSnapshots.length ? state.localSnapshots.map(s => `
                        <div class="check-row" style="padding:8px 0;"><div class="txt">
                            <div>${s.label === 'تلقائي يومي' ? '🔄' : '📸'} ${s.label} — ${new Date(s.at).toLocaleString('ar-EG')}</div>
                            <div class="day">${s.sizeKB} ك.ب</div>
                        </div>
                        <div class="row-actions" style="gap:6px;">
                            <button class="btn ghost xs" onclick="restoreLocalSnapshot('${s.id}')">استرجاع</button>
                            <button class="btn ghost xs" style="color:var(--red);" onclick="deleteLocalSnapshot('${s.id}')">حذف</button>
                        </div></div>`).join('') : '<div class="empty" style="padding:10px;">لا توجد لقطات محلية بعد.</div>'}
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🗑️ سلة المهملات (استرجاع ما تم حذفه)</h2></div>
                <div class="card" style="padding:0;">
                    ${(() => {
                        const items = getAllTrashItems();
                        if (!items.length) return '<div class="empty" style="padding:14px;">لا توجد عناصر محذوفة قابلة للاسترجاع حاليًا.</div>';
                        return items.map(t => `
                            <div class="check-row"><div class="txt">
                                <div>${esc(t.auditText)}</div>
                                <div class="day">${new Date(t.deletedAt).toLocaleString('ar-EG')}${t.note ? ` · ⚠️ ${esc(t.note)}` : ''}</div>
                            </div>
                            <button class="btn ghost sm owner-only" onclick="${t.scope === 'global' ? `undoGlobalTrashItem('${t.id}')` : `undoTrashItem('${t.id}')`}">↩️ استرجاع</button>
                            </div>`).join('');
                    })()}
                    <p style="font-size:10.5px;color:var(--muted);padding:10px;margin:0;">💡 بتحتفظ بآخر 20 عملية حذف لكل دفعة (+20 عامة للبروتوكولات وجهات الاتصال). لو الدفعة نفسها اتحذفت أو الدورة اتؤرشفت، سلة مهملاتها بتفضل معاها.</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>📜 سجل التدقيق (آخر العمليات الحساسة)</h2>
                    <button class="btn ghost sm" onclick="openDateRangeFilter(auditLogDateFilter, (id) => { auditLogDateFilter = id; render(); })">📅 ${esc(dateRangePresetLabel(auditLogDateFilter))}</button>
                </div>
                <div class="card" style="padding:0;">
                    ${(() => {
                        const filtered = (state.globalAuditLog || []).filter(e => isDateInPreset(e.at, auditLogDateFilter));
                        return filtered.length ? filtered.slice(0, 30).map(e => `
                        <div class="check-row"><div class="txt">
                            <div>${e.text}</div>
                            <div class="day">${e.batchName ? e.batchName + ' · ' : ''}${e.who} · ${new Date(e.at).toLocaleString('ar-EG')}</div>
                        </div></div>`).join('') : '<div class="empty" style="padding:14px;">لا توجد عمليات حذف/تعديل حساسة فى الفترة دي.</div>';
                    })()}
                </div>
            </div>`;

            // ============ فئة 5: الوصول والحسابات (أجهزة + عمّال + صلاحيات) ============
            const catAccess = `
            <div class="section" style="margin-top:0;">
                <div class="section-head"><h2>👥 الحسابات وصلاحيات الوصول</h2></div>
                <div class="card">
                    <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;line-height:1.7;">
                        غيّر كلمة مرور المالك، وأضف/عدّل حسابات العمّال، وحدّد لكل عامل أي أقسام من التطبيق يقدر يوصل لها.
                    </p>
                    <button class="btn gold block" onclick="openAccountsModal()">👥 إدارة الحسابات والصلاحيات</button>
                </div>
                ${snippetDeviceAccess}
            </div>
            <div class="section">
                <div class="section-head"><h2>📊 أداء العمال</h2></div>
                <div class="card" style="padding:0;">
                    ${(() => {
                        const wp = computeWorkerPerformance();
                        if (!wp) return `<div class="empty" style="padding:14px;"><div class="ico">👷</div>لا توجد سجلات مرتبطة بعمّال بعد — المقياس بيبدأ يتجمّع من أول سجل يومي يُحفظ من الآن.</div>`;
                        return wp.map(r => {
                            const onTimeColor = r.onTimePct == null ? 'var(--muted)' : (r.onTimePct >= 80 ? 'var(--green)' : (r.onTimePct >= 50 ? 'var(--warning-text)' : 'var(--red)'));
                            return `<div class="check-row"><div class="txt">
                                <div style="font-weight:800;">${r.name === 'المالك' ? '👑' : '👷'} ${esc(r.name)}</div>
                                <div class="day" style="margin-top:4px;">
                                    ${statLine(`عدد السجلات المُدخَلة`, `${fmt(r.recordsCount,0)}`)}
                                    ${statLine(`إضافات خارج الجدول`, `${fmt(r.quickInts,0)}`)}
                                    ${statLine(`حوادث مُسجَّلة`, `${fmt(r.incidents,0)}`)}
                                    ${statLine(`تنفيذ برنامج إضافات`, `${fmt(r.execs,0)}`)}
                                    ${statLine(`إجمالي المجهود المُسجَّل`, `${fmt(r.totalEffort,0)}`, {vStyle:`font-weight:800;`})}
                                    ${statLine(`الالتزام بالتوقيت (نفس اليوم)`, `${r.onTimePct!=null?fmt(r.onTimePct,0)+'%':'—'}${r.avgDelayDays?` (متوسط تأخير ${fmt(r.avgDelayDays,1)} يوم)`:''}`, {vStyle:`color:${onTimeColor};`})}
                                    ${statLine(`اكتمال البيانات المُدخَلة`, `${r.completenessPct!=null?fmt(r.completenessPct,0)+'%':'—'}`)}
                                    ${statLine(`تعديلات/حذف مسجَّلة`, `${fmt(r.edits,0)}`)}
                                </div>
                            </div></div>`;
                        }).join('');
                    })()}
                    <p style="font-size:10.5px;color:var(--muted);padding:10px;margin:0;">💡 "إجمالي المجهود" = مجموع السجلات اليومية + الإضافات خارج الجدول + الحوادث المُسجَّلة + تنفيذ برنامج الإضافات (الترتيب مبني عليه). "الالتزام بالتوقيت" و"اكتمال البيانات" بيتحسبوا من السجل اليومي فقط. المقياس تراكمي منذ تفعيله ولا يشمل سجلات قديمة.</p>
                </div>
            </div>`;

            // ============ 🔒 تبسيط: دمج 7 تصنيفات فرعية فى 4 مجموعات منطقية بدل التنقل بين 7 شاشات ============
            // كل المحتوى الأصلي موجود بالكامل زي ما هو — التجميع بس بيقلل عدد الأزرار/النقرات للوصول له
            const cats = [
                { id: 'identity', label: '🏷️ الملف والمزرعة', content: catIdentity + catFarm },
                { id: 'standards', label: '📊 المعايير والأدوات', content: catStandards + catTools },
                { id: 'system', label: '⚙️ النظام والبيانات', content: catSystem + catData },
                { id: 'access', label: '🔐 الوصول والحسابات', content: catAccess },
            ];
            const navHtml = `<div class="settings-subnav">${cats.map(c => `<button class="ssnav-btn ${settingsSubTab===c.id?'active':''}" onclick="setSettingsSubTab('${c.id}')">${c.label}</button>`).join('')}</div>`;
            const active = cats.find(c => c.id === settingsSubTab) || cats[0];
            return navHtml + active.content;
        }

        function renderCompareTab() {
            // ============ متابعة أكثر من دورة نشطة وهي شغّالة: لو فيه دورتين أو أكثر شغّالة الآن ولسه محددش المستخدم اختيار،
            // نحدد الدورات الشغّالة تلقائيًا فى المقارنة (مرة واحدة فقط، بعدها اختيار المستخدم هو اللي يحكم) ============
            if (!state.appSettings) setState('appSettings', {});
            if (!state.appSettings.compareAutoSeeded) {
                const runningNow = state.batches.filter(x => x.status !== 'مؤرشفة');
                if (runningNow.length >= 2 && state.compareIds.length === 0) {
                    setState('compareIds', runningNow.map(x => x.id));
                    persist();
                }
                state.appSettings.compareAutoSeeded = true;
                persist();
            }
            const all = [...state.batches].sort((x, c) => (x.status === 'مؤرشفة' ? 1 : 0) - (c.status === 'مؤرشفة' ? 1 : 0));
            if (all.length === 0) return `<div class="card empty" style="margin-top:14px;"><div class="ico">⚖️</div>لا توجد دورات لمقارنتها بعد.</div>`;
            const runningCount = all.filter(x => x.status !== 'مؤرشفة').length;
            const hist = computeHistoricalSeries();
            const trendSection = hist.length >= 2 ? `
            <div class="section" style="margin-top:0;"><div class="section-head"><h2>📈 الأداء عبر كل الدورات (تاريخي)</h2></div>
                <div class="card"><p style="font-size:11.5px;color:var(--muted);margin-top:0;">تطور معامل التحويل الغذائي FCR عبر ${hist.length} دورة مرتبة زمنيًا (الأقل أفضل)</p><canvas id="chartTrendFCR" height="160"></canvas></div>
                <div class="card"><p style="font-size:11.5px;color:var(--muted);margin-top:0;">تطور العائد على التكلفة ROI %</p><canvas id="chartTrendROI" height="160"></canvas></div>
                <div class="card"><p style="font-size:11.5px;color:var(--muted);margin-top:0;">تطور صافي الربح لكل دورة</p><canvas id="chartTrendProfit" height="160"></canvas></div>
            </div>` : '';
            const checks = all.map(b => {
                const checked = state.compareIds.includes(b.id) ? 'checked' : '';
                const running = b.status !== 'مؤرشفة';
                const tag = running ? ' <span class="pill ok" style="font-size:9.5px;">🟢 شغّالة الآن</span>' : ' <span class="pill info" style="font-size:9.5px;">مؤرشفة</span>';
                return `<label><input type="checkbox" ${checked} onchange="toggleCompare('${b.id}')"> ${esc(b.name)}${tag}</label>`;
            }).join('');
            const selected = all.filter(b => state.compareIds.includes(b.id));
            let tableHtml =
                `<div class="empty"><div class="ico">⚖️</div>اختر دورتين أو أكثر من القائمة أعلاه لمقارنتها.</div>`;
            if (selected.length >= 2) {
                const rows = selected.map(b => { const m = computeMetrics(b); const fin = computeFinance(b, m);
                        const saleAdv = computeMarketSaleAdvice(b, m, fin); return { b, m, fin, saleAdv }; });
                const metricDefs = [
                    { label: '🏠 نظام التهوية', get: r => r.b.ventType, text: true, fmt: v => ({ natural: '🌬️ طبيعي', tunnel: '🌀 نفقي', mixed: '🔀 مختلط' }[v] || '🌬️ طبيعي') },
                    { label: '🐔 نظام التربية/الأرضية', get: r => r.b, text: true, fmt: b => getFloorInfo(b).label + (b.floorType === 'cage' ? ` (${b.cageTiers || 1} دور)` : '') },
                    { label: '🎯 قرار البيع (حسب بورصة اليوم)', get: r => r.saleAdv, text: true,
                        fmt: sa => {
                            if (!sa || !sa.osd || !sa.nextRow) return 'بيانات غير كافية';
                            if (sa.nextRow.densityUnsafe) return '🔴 بيع الآن (كثافة تتخطى الحد الآمن)';
                            if (sa.nextRow.marginalProfit <= 0) return '🔴 بيع الآن (تحت سعر التعادل)';
                            return '✅ الاستمرار لسه مجدي';
                        } },
                    { label: 'العمر الحالي/النهائي (يوم)', get: r => r.m.todayAge, fmt: v => fmt(v, 0), low: false },
                    { label: 'عدد الكتاكيت', get: r => r.b.startCount, fmt: v => fmt(v, 0), neutral: true },
                    { label: 'الأعداد الحية المتبقية', get: r => r.m.liveCount, fmt: v => fmt(v, 0), low: false },
                    { label: 'نسبة النفوق %', get: r => r.m.mortRate, fmt: v => fmt(v, 2), low: true },
                    { label: 'متوسط الوزن (جم)', get: r => r.m.avgWeightG, fmt: v => fmt(v, 0), low: false },
                    { label: 'إجمالي العلف (كجم)', get: r => r.m.cumFeed, fmt: v => fmt(v, 0), neutral: true },
                    { label: 'معامل التحويل FCR', get: r => r.m.fcr, fmt: v => fmt(v, 2), low: true },
                    { label: 'كفاءة الأداء EPEF', get: r => r.m.epef, fmt: v => fmt(v, 0), low: false },
                    { label: '🌿 % أيام بدون مضاد حيوي', get: r => computeAntibioticStats(r.b, r.m).freePct, fmt: v => fmt(v, 0) + '%', low: false },
                    { label: 'إجمالي التكاليف', get: r => r.fin.totalCosts, fmt: v => money(v), low: true },
                    { label: 'إجمالي الإيرادات', get: r => r.fin.totalRevenue, fmt: v => money(v), low: false },
                    { label: 'صافي الربح/الخسارة', get: r => r.fin.netProfit, fmt: v => money(v), low: false },
                    { label: 'تكلفة الكيلو', get: r => r.fin.costPerKg, fmt: v => fmt(v, 2) + ' ج', low: true },
                    { label: 'تكلفة الطائر', get: r => r.fin.costPerBird, fmt: v => fmt(v, 2) + ' ج', low: true },
                    { label: 'العائد ROI %', get: r => r.fin.roi, fmt: v => fmt(v, 1) + '%', low: false },
                ];
                const head =
                    `<tr><th>المؤشر</th>${rows.map(r => `<th>${esc(r.b.name)}${r.b.status !== 'مؤرشفة' ? ' 🟢' : ''}</th>`).join('')}</tr>`;
                const body = metricDefs.map(md => {
                    if (md.text) {
                        const cells = rows.map(r => {
                            const txt = md.fmt(md.get(r));
                            return `<td class="${txt.includes('🔴') ? 'worst' : (txt.includes('✅') ? 'best' : '')}">${txt}</td>`;
                        }).join('');
                        return `<tr><td style="text-align:right;font-weight:800;">${md.label}</td>${cells}</tr>`;
                    }
                    const vals = rows.map(r => md.get(r));
                    const max = Math.max(...vals),
                        min = Math.min(...vals);
                    const cells = vals.map(v => {
                        let cls = '';
                        if (!md.neutral && max !== min) {
                            if (md.low) { if (v === min) cls = 'best';
                                else if (v === max) cls = 'worst'; } else { if (v === max) cls =
                                'best';
                                else if (v === min) cls = 'worst'; }
                        }
                        return `<td class="${cls}">${md.fmt(v)}</td>`;
                    }).join('');
                    return `<tr><td style="text-align:right;font-weight:800;">${md.label}</td>${cells}</tr>`;
                }).join('');
                const liveNote = rows.some(r => r.b.status !== 'مؤرشفة') ? `<p style="font-size:11px;color:var(--green);margin:0 0 6px;font-weight:700;">🟢 = دورة شغّالة الآن — أرقامها تتحدّث لحظيًا مع كل سجل يومي جديد تُدخله.</p>` : '';
                tableHtml =
                    `${liveNote}<div class="card scroll-x"><table class="compare-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
                    <p style="font-size:11px;color:var(--muted);margin-top:8px;">🟢 القيمة الأفضل بين الدورات المختارة لكل مؤشر · 🔴 الأضعف. (الأقل أفضل بالنسبة للنفوق/FCR/التكاليف، والأعلى أفضل لباقي المؤشرات)</p>`;
            }
            // ============ تحليلات ذكية عبر الدورات — مبنية على كل الدفعات المؤرشفة، مش دفعة واحدة ============
            const activeSpecies = getActiveBatch() ? getActiveBatch().species : (all[0] && all[0].species);
            const chickSrc = computeChickSourceAnalysis();
            const chickSrcHtml = !chickSrc ? '' : `<div class="check-row"><div class="txt">
                    <div>🐣 أداء مصادر/مفارخ الكتاكيت عبر الدورات المؤرشفة</div>
                    <div class="day" style="margin-top:4px;">${chickSrc.rows.map(r => `${statLine(`${esc(r.supplier)} (${r.cycles} دورة)`, `EPEF ${fmt(r.avgEpef,0)} · FCR ${r.avgFcr?fmt(r.avgFcr,2):'—'} · نفوق ${fmt(r.avgMort,2)}%`)}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">مرتبة من الأفضل EPEF للأقل — مؤشر استرشادي يحتاج عدد دورات كافٍ لكل مصدر ليكون موثوقًا</div>
                </div></div>`;
            const protoEff = computeProtocolEffectiveness();
            const protoEffHtml = !protoEff ? '' : `<div class="check-row"><div class="txt">
                    <div>🧪 الكفاءة الاقتصادية للبروتوكولات المحفوظة (طبيعية/إضافات) عبر الدورات المؤرشفة</div>
                    <div class="day" style="margin-top:4px;">${protoEff.rows.map(r => `${statLine(`${esc(r.name)}`, `مع (${r.withCount}): FCR ${r.withFcr?fmt(r.withFcr,2):'—'}، تكلفة ${r.withCost?fmt(r.withCost,2):'—'} ج · بدون (${r.withoutCount}): FCR ${r.withoutFcr?fmt(r.withoutFcr,2):'—'}، تكلفة ${r.withoutCost?fmt(r.withoutCost,2):'—'} ج`)}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">مقارنة الدورات اللي طُبِّق عليها البروتوكول مقابل التي لم يُطبَّق عليها — تحتاج عدد دورات كافٍ فى كل مجموعة لتكون النتيجة موثوقة</div>
                </div></div>`;
            const seasonality = computeMarketPriceSeasonality();
            const seasonalityHtml = !seasonality ? '' : `<div class="check-row"><div class="txt">
                    <div>📅 موسمية سعر بورصة الدواجن (من كل سجلات الأسعار المُدخلة عبر دوراتك)</div>
                    <div class="day" style="margin-top:4px;">${seasonality.rows.map(r => `${statLine(`${r.label}`, `${fmt(r.avg,2)} ج/كجم (${r.count} قراءة)`, {vStyle:`${r.month===seasonality.best.month?'color:var(--green);font-weight:800;':(r.month===seasonality.worst.month?'color:var(--red);':'')}`})}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">تاريخيًا أعلى الأسعار فى ${seasonality.best.label} — مؤشر استرشادي فقط، وليس تنبؤًا مضمونًا بحركة السوق القادمة</div>
                </div></div>`;
            function renderCrossCycleVerdictCard(rows, opts) {
                if (!rows) return '';
                return `<div class="check-row"><div class="txt">
                    <div>${opts.title}</div>
                    <div class="day" style="margin-top:4px;">${rows.slice(0, 8).map(r => {
                        const metricTxt = [];
                        if (r.weightC) metricTxt.push(`وزن: تحسّن فى ${r.weightC.improved}/${r.weightC.n}`);
                        if (r.fcrC) metricTxt.push(`تحويل: تحسّن فى ${r.fcrC.improved}/${r.fcrC.n}`);
                        if (r.mortC) metricTxt.push(`نفوق: تحسّن فى ${r.mortC.improved}/${r.mortC.n}`);
                        if (r.avgCostPerCycle != null) metricTxt.push(`تكلفة ~${fmt(r.avgCostPerCycle,0)} ج/دورة`);
                        const color = r.verdict === 'improve' ? 'var(--green)' : (r.verdict === 'worsen' ? 'var(--red)' : (r.verdict === 'none' ? 'var(--muted)' : 'var(--warning-text)'));
                        return `${statLine(`${esc(r.name)} (${r.cycles} دورة)`, `${r.verdictLabel}`, {vStyle:`color:${color};font-weight:800;`})}
                        <div style="font-size:10.5px;color:var(--muted);margin:-2px 0 4px;">${metricTxt.join(' · ')}</div>`;
                    }).join('')}</div>
                    <div class="day" style="margin-top:2px;">${opts.footer}</div>
                </div></div>`;
            }
            const crossVerdictFooter = '"تحسّن فى X/Y دورة" = فى كام دورة ظهر فرق ملحوظ فعليًا وقت السريان/التنفيذ مقابل خارجه. 🟢 دايم إيجابي = استمر عليه · 🔴 دايم سلبي = يُقترح إلغاؤه · ⚪ بدون تأثير = مرشّح للإلغاء توفيرًا للتكلفة · 🟡 متفاوت = محتاج مراقبة أكتر';
            const crossItems = activeSpecies ? computeCrossCycleItemEffectiveness(activeSpecies) : null;
            const crossItemsHtml = renderCrossCycleVerdictCard(crossItems, {
                title: '💊🔁 فعالية الإضافات/الأدوية على الوزن والتحويل والنفوق — مقسّمة حسب مرحلة العلف (بادئ/نامي/ناهي)، ومعاها التكلفة التقديرية لكل دورة',
                footer: crossVerdictFooter,
            });
            const crossTreatments = activeSpecies ? computeCrossCycleTreatmentEffectiveness(activeSpecies) : null;
            const crossTreatmentsHtml = renderCrossCycleVerdictCard(crossTreatments, {
                title: '🪣🔁 فعالية معاملات الفرشة/السبلة عبر الدورات (قبل/بعد التنفيذ)',
                footer: crossVerdictFooter,
            });
            const crossFeedLots = activeSpecies ? computeCrossCycleFeedLotEffectiveness(activeSpecies) : null;
            const crossFeedLotsHtml = renderCrossCycleVerdictCard(crossFeedLots, {
                title: '🌾🔁 فعالية موردي العلف عبر الدورات — أداء فترة كل مورد مقابل باقي الدورة',
                footer: crossVerdictFooter,
            });
            // ============ أفضل موسم بدء تربية حسب أداء الدورات الفعلي (EPEF/FCR/نفوق) — مختلف عن موسمية سعر البيع ============
            const perfSeason = computePerformanceSeasonality();
            const perfSeasonHtml = !perfSeason ? '' : `<div class="check-row"><div class="txt">
                    <div>📅🏆 موسمية الأداء الإنتاجي حسب شهر بدء التربية (من دوراتك الفعلية)</div>
                    <div class="day" style="margin-top:4px;">${perfSeason.rows.map(r => `${statLine(`${r.label} (${r.count} دورة)`, `EPEF ${fmt(r.avgEpef,0)} · FCR ${r.avgFcr?fmt(r.avgFcr,2):'—'} · نفوق ${fmt(r.avgMort,2)}%`, {vStyle:`${r.month===perfSeason.best.month?'color:var(--green);font-weight:800;':(r.month===perfSeason.worst.month?'color:var(--red);':'')}`})}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">أفضل أداء تاريخيًا فى ${perfSeason.best.label} — هذا مؤشر أداء الإنتاج نفسه (تأثير الطقس)، منفصل عن موسمية سعر البيع بالأسفل</div>
                </div></div>`;
            // ============ أثر وزن/تجانس الكتاكيت عند الاستلام على EPEF النهائي ============
            const arrivalQ = computeArrivalQualityAnalysis();
            const arrivalQHtml = !arrivalQ ? '' : (() => {
                const clear = arrivalQ.corr != null && Math.abs(arrivalQ.corr) >= 0.3;
                const corrTxt = arrivalQ.corr == null ? 'بيانات غير كافية للارتباط' : (clear ? `ارتباط ${Math.abs(arrivalQ.corr)>=0.5?'قوي':'متوسط'} ${arrivalQ.corr>0?'موجب':'سالب'} بـ EPEF ${corrConfidence(arrivalQ.count)}` : `لا يوجد ارتباط واضح حتى الآن ${corrConfidence(arrivalQ.count)}`);
                return `<div class="check-row"><div class="txt">
                    <div>🐣📏 أثر وزن الاستلام (أول 3 أيام) على EPEF النهائي: <b style="color:${clear?(arrivalQ.corr>0?'var(--green)':'var(--red)'):'var(--muted)'};">${corrTxt}</b></div>
                    <div class="day" style="margin-top:4px;">${arrivalQ.rows.slice(0,6).map(r => `${statLine(`${esc(r.name)} (يوم ${r.arrivalAge}: ${r.arrivalDiffPct>=0?'+':''}${fmt(r.arrivalDiffPct,1)}%${r.uniCv!=null?`، تفاوت ${fmt(r.uniCv,1)}%`:''})`, `EPEF ${fmt(r.epef,0)}`)}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">${clear?(arrivalQ.corr>0?'بداية أقوى من المعياري عند الاستلام مرتبطة بأداء نهائي أفضل فى دوراتك — راجع مصدر الكتاكيت وقت البداية الأضعف':'بداية أضعف من المعياري عند الاستلام مرتبطة بأداء نهائي أضعف فى دوراتك — راجع مصدر الكتاكيت وقت البداية الأضعف'):'استمر فى تسجيل وزن أول 3 أيام لكل دورة جديدة لزيادة دقة هذا التحليل'}</div>
                </div></div>`;
            })();
            // ============ الكثافة المثلى تاريخيًا: مقارنة أقصى كثافة استُخدمت فعليًا بأداء كل دورة ============
            const densityPerf = computeDensityPerformanceAnalysis();
            const densityPerfHtml = !densityPerf ? '' : (() => {
                const clear = densityPerf.corr != null && Math.abs(densityPerf.corr) >= 0.3;
                const corrTxt = densityPerf.corr == null ? 'بيانات غير كافية للارتباط' : (clear ? `ارتباط ${Math.abs(densityPerf.corr)>=0.5?'قوي':'متوسط'} ${densityPerf.corr>0?'موجب':'سالب'} بـ EPEF ${corrConfidence(densityPerf.count)}` : `لا يوجد ارتباط واضح حتى الآن ${corrConfidence(densityPerf.count)}`);
                return `<div class="check-row"><div class="txt">
                    <div>⚖️📊 الكثافة المثلى تاريخيًا (أقصى كجم/م² وصلته كل دورة مقابل EPEF): <b style="color:${clear?(densityPerf.corr<0?'var(--red)':'var(--green)'):'var(--muted)'};">${corrTxt}</b></div>
                    <div class="day" style="margin-top:4px;">${densityPerf.rows.map(r => `${statLine(`${esc(r.name)}`, `${fmt(r.maxDensity,1)} كجم/م² · EPEF ${fmt(r.epef,0)}`)}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">مرتبة من أقل كثافة لأعلى — قارن أفضل EPEF عندك اترافق مع أي مستوى كثافة فعليًا، بدل الاعتماد على الحد الأقصى النظري لنظام التهوية فقط</div>
                </div></div>`;
            })();
            // ============ ربط الالتزام بتشيك ليست العمليات/الأمان الحيوي بمعدل النفوق النهائي عبر الدورات ============
            const compliance = computeComplianceMortalityAnalysis();
            const complianceHtml = !compliance ? '' : (() => {
                const clear = compliance.corr != null && Math.abs(compliance.corr) >= 0.3;
                const corrTxt = compliance.corr == null ? 'بيانات غير كافية للارتباط' : (clear ? `ارتباط ${Math.abs(compliance.corr)>=0.5?'قوي':'متوسط'} ${compliance.corr<0?'سالب (كلما زاد الالتزام قلّ النفوق)':'موجب'} ${corrConfidence(compliance.count)}` : `لا يوجد ارتباط واضح حتى الآن ${corrConfidence(compliance.count)}`);
                return `<div class="check-row"><div class="txt">
                    <div>✅🛡️ الالتزام بتشيك ليست العمليات ومعدل النفوق النهائي: <b style="color:${clear?(compliance.corr<0?'var(--green)':'var(--red)'):'var(--muted)'};">${corrTxt}</b></div>
                    <div class="day" style="margin-top:4px;">${compliance.rows.slice(0,6).map(r => `${statLine(`${esc(r.name)} (التزام ${fmt(r.checklistAvgPct,0)}%)`, `نفوق ${fmt(r.mortRate,2)}%${r.bioActionsPerWeek!=null?` · أمان حيوي ${fmt(r.bioActionsPerWeek,1)}/أسبوع`:''}`)}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">متوسط الالتزام محسوب على كامل الدورة (وليس آخر 3 أيام فقط كما فى التنبيهات اليومية)</div>
                </div></div>`;
            })();
            // ============ ربط سجل الطقس الداخلي الفعلي (المُسجَّل يوميًا) بالنفوق تاريخيًا حسب الشهر ============
            const weatherHist = computeWeatherMortalityHistory();
            const weatherHistHtml = !weatherHist ? '' : `<div class="check-row"><div class="txt">
                    <div>🌡️📅 النفوق حسب شهر السجل الفعلي (من قراءات الحرارة الداخلية المُسجَّلة عبر كل الدورات)</div>
                    <div class="day" style="margin-top:4px;">${weatherHist.rows.map(r => `${statLine(`${r.label}${r.avgTemp!=null?` (${fmt(r.avgTemp,1)}°م)`:''}`, `نفوق ${fmt(r.avgMortPerDay,2)} طائر/يوم`, {vStyle:`${r.month===weatherHist.worst.month?'color:var(--red);font-weight:800;':(r.month===weatherHist.best.month?'color:var(--green);':'')}`})}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">أعلى نفوق تاريخيًا فى ${weatherHist.worst.label} — مؤشر خاص بمزرعتك تحديدًا (تهوية/تصميم العنبر)، مبني على القراءات الداخلية الفعلية وليس توقعات الطقس الخارجية</div>
                </div></div>`;
            // ============ الأسبوع الحرج — أعلى تفاوت (عدم استقرار) فى نفوق كل أسبوع عمري عبر دوراتك المؤرشفة لنفس النوع ============
            const criticalWeek = computeCriticalWeekAnalysis(activeSpecies);
            const criticalWeekHtml = !criticalWeek ? '' : `<div class="check-row"><div class="txt">
                    <div>⚠️📆 الأسبوع الحرج فى مزرعتك: <b style="color:var(--red);">الأسبوع ${criticalWeek.worst.week}</b> (أعلى تفاوت فى النفوق بين دوراتك، مش بس أعلى متوسط)</div>
                    <div class="day" style="margin-top:4px;">${criticalWeek.rows.slice(0,6).map(r => `${statLine(`الأسبوع ${r.week} (${r.count} دورة)`, `متوسط نفوق ${fmt(r.meanMort,2)}%${r.cv!=null?` · تفاوت ${fmt(r.cv*100,0)}%`:''}`, {vStyle:`${r.week===criticalWeek.worst.week?'color:var(--red);font-weight:800;':''}`})}`).join('')}</div>
                    <div class="day" style="margin-top:2px;">التفاوت العالي معناه إن نتيجة الأسبوع ده أقل قابلية للتنبؤ فى مزرعتك تحديدًا — ركّز مراقبتك (تهوية/تغذية/برنامج صحي) خصوصًا وقت وصولك للأسبوع ده فى الدورة الجايه</div>
                </div></div>`;
            // ============ ترتيب أهم العوامل المؤثرة على ربح الطائر (انحدار متعدد عبر الدورات المؤرشفة) ============
            const profitAttr = computeProfitAttributionAnalysis();
            _whatIfModel = profitAttr; // يُخزَّن عالميًا ليستخدمه محاكي "ماذا لو" بدون إعادة حساب
            const profitAttrHtml = !profitAttr ? '' : (() => {
                const dirTxt = f => Math.abs(f.stdCoef) < 0.15 ? 'تأثير ضعيف/غير واضح' : (f.stdCoef > 0 ? 'زيادته مرتبطة بربح أعلى' : 'زيادته مرتبطة بربح أقل');
                const rowsHtml = profitAttr.factors.map((f, i) => `${statLine(`${i+1}. ${f.label}`, `${dirTxt(f)} (وزن نسبي ${fmt(Math.abs(f.stdCoef)*100,0)}%)`, {vStyle:`${Math.abs(f.stdCoef)>=0.3?(f.stdCoef>0?'color:var(--green);font-weight:800;':'color:var(--red);font-weight:800;'):''}`})}`).join('');
                return `<div class="check-row"><div class="txt">
                    <div>🏆📈 أهم العوامل المؤثرة على ربح الطائر عبر دوراتك (${profitAttr.n} دورة مؤرشفة، دقة النموذج R²=${fmt((profitAttr.r2||0)*100,0)}%)</div>
                    <div class="day" style="margin-top:4px;">${rowsHtml}</div>
                    <div class="day" style="margin-top:2px;">متوسط ربح الطائر فى دوراتك: <b>${money(profitAttr.avgProfitPerBird)}</b> — الترتيب هنا بعد فصل أثر كل عامل عن الباقي إحصائيًا (انحدار متعدد)، مش مجرد ترتيب مبني على ارتباط منفرد ممكن يكون مضلِّل</div>
                </div></div>`;
            })();
            // ============ مصفوفة ارتباط موحّدة — تجمع كل الارتباطات المتفرقة أعلاه فى جدول واحد بنظرة سريعة ============
            const corrMatrixRows = [];
            if (arrivalQ && arrivalQ.corr != null) corrMatrixRows.push({ factor: 'وزن الاستلام (أول 3 أيام)', outcome: 'EPEF النهائي', val: arrivalQ.corr, n: arrivalQ.count, kind: 'corr' });
            if (densityPerf && densityPerf.corr != null) corrMatrixRows.push({ factor: 'الكثافة القصوى', outcome: 'EPEF النهائي', val: densityPerf.corr, n: densityPerf.count, kind: 'corr' });
            if (compliance && compliance.corr != null) corrMatrixRows.push({ factor: 'الالتزام بتشيك ليست العمليات', outcome: 'معدل النفوق', val: compliance.corr, n: compliance.count, kind: 'corr' });
            if (profitAttr) profitAttr.factors.forEach(f => corrMatrixRows.push({ factor: f.label, outcome: 'ربح الطائر', val: f.stdCoef, n: profitAttr.n, kind: 'coef' }));
            corrMatrixRows.sort((a, c) => Math.abs(c.val) - Math.abs(a.val));
            const corrMatrixHtml = !corrMatrixRows.length ? '' : `<div class="check-row"><div class="txt">
                    <div>🧩🔬 مصفوفة الارتباط الموحّدة — كل العلاقات المكتشفة فى دوراتك بنظرة واحدة</div>
                    <div class="card scroll-x" style="margin-top:6px;padding:0;"><table><thead><tr><th>العامل</th><th>يؤثر على</th><th>القوة والاتجاه</th><th>العينة</th></tr></thead><tbody>
                    ${corrMatrixRows.map(r => {
                        const strong = Math.abs(r.val) >= 0.5, med = Math.abs(r.val) >= 0.3;
                        const color = !med ? 'var(--muted)' : (r.val > 0 ? 'var(--green)' : 'var(--red)');
                        const arrow = r.val > 0 ? '↑' : '↓';
                        const strengthTxt = strong ? 'قوي' : (med ? 'متوسط' : 'ضعيف');
                        return `<tr><td style="text-align:right;">${esc(r.factor)}</td><td style="font-size:11px;">${esc(r.outcome)}</td><td style="color:${color};font-weight:800;">${arrow} ${strengthTxt} (${fmt(Math.abs(r.val)*100,0)}%)</td><td style="font-size:11px;color:var(--muted);">${r.n} دورة</td></tr>`;
                    }).join('')}
                    </tbody></table></div>
                    <div class="day" style="margin-top:6px;">💡 الأسهم للأعلى = زيادة العامل مرتبطة بنتيجة أفضل، وللأسفل = مرتبطة بنتيجة أسوأ. راجع التفاصيل الكاملة لكل تحليل بالأسفل.</div>
                </div></div>`;
            // ============ محاكي "ماذا لو" — يستخدم نموذج الانحدار أعلاه للتنبؤ بربح الطائر عند تغيير عامل افتراضيًا قبل اتخاذ القرار الفعلي ============
            const whatIfHtml = !profitAttr ? '' : (() => {
                const inputsHtml = profitAttr.factors.map(f => `
                    <div class="field"><label>${f.label}</label><input type="number" step="0.1" id="wi_${f.key}" value="${fmt(f.mean,1)}"></div>`).join('');
                return `<div class="check-row"><div class="txt">
                    <div>🧪🔮 محاكي "ماذا لو" — جرّب قيمة مختلفة وشوف تأثيرها المتوقع على ربح الطائر قبل ما تاخد القرار فعليًا</div>
                    <div class="day" style="margin-top:4px;">القيم معبّأة بمتوسط دوراتك — غيّر أي رقم واضغط احسب</div>
                    <div class="form-grid" style="margin-top:8px;">${inputsHtml}</div>
                    <button type="button" class="btn gold sm" style="margin-top:6px;" onclick="runWhatIfSimulation()">🔮 احسب التأثير المتوقع</button>
                    <div id="whatIfResult" style="margin-top:8px;"></div>
                    <div class="day" style="margin-top:6px;color:var(--muted);">⚠️ تنبؤ إحصائي مبني على ${profitAttr.n} دورة سابقة فقط (R²=${fmt((profitAttr.r2||0)*100,0)}%) — مؤشر استرشادي وليس ضمانًا، خصوصًا لو غيّرت رقم بعيد جدًا عن مدى بياناتك المعتاد</div>
                </div></div>`;
            })();
            const crossCycleSection = (chickSrcHtml || protoEffHtml || seasonalityHtml || crossItemsHtml || crossTreatmentsHtml || crossFeedLotsHtml || perfSeasonHtml || arrivalQHtml || densityPerfHtml || complianceHtml || weatherHistHtml || corrMatrixHtml || profitAttrHtml || whatIfHtml || criticalWeekHtml) ? `
            <div class="section"><div class="section-head"><h2>🔬 تحليلات ذكية عبر الدورات</h2></div>
                <div class="card" style="padding:0;">${corrMatrixHtml}${profitAttrHtml}${whatIfHtml}${criticalWeekHtml}${chickSrcHtml}${protoEffHtml}${seasonalityHtml}${perfSeasonHtml}${arrivalQHtml}${densityPerfHtml}${complianceHtml}${weatherHistHtml}${crossItemsHtml}${crossTreatmentsHtml}${crossFeedLotsHtml}</div>
                <p style="font-size:10.5px;color:var(--muted);margin:6px 2px 0;">💡 هذه التحليلات تحتاج عدة دورات مؤرشفة لتكون ذات معنى إحصائي، وتزداد دقتها كل ما راكمت بيانات أكتر.</p>
                ${(crossItemsHtml || crossTreatmentsHtml || crossFeedLotsHtml) ? `<div class="row-actions" style="margin-top:8px;">
                    <button class="btn ghost sm" style="flex:1;" onclick="printAdditiveEffectivenessReport()">🖨️ طباعة تقرير فعالية الإضافات</button>
                    <button class="btn gold sm" style="flex:1;" onclick="exportAdditiveEffectivenessPDF()">📄 حفظ PDF لمشاركته مع المورد/الطبيب</button>
                </div>` : ''}
            </div>` : '';
            // ============ أهم حاجة فى صفحة المقارنة هي جدول المقارنة نفسه، فيظهر أول قسم مفتوح؛ التحليلات التاريخية والذكية بعده مطوية ============
            return `<div class="section" style="margin-top:0;"><div class="section-head"><h2>اختر الدورات للمقارنة</h2>${runningCount>=2?`<span class="tag">${runningCount} دورة شغّالة الآن</span>`:''}</div>
                <div class="card"><div class="chip-select">${checks}</div>${runningCount>=2?`<p style="font-size:10.5px;color:var(--muted);margin:8px 2px 0;">💡 بما إن عندك أكتر من دورة شغّالة فى نفس الوقت، اتحددوا هنا تلقائيًا للمقارنة — تقدر تعدّل الاختيار وقت ما تحب.</p>`:''}</div>
                ${tableHtml}</div>
                ${trendSection}${crossCycleSection}${renderAnonCompareSection()}`;
        }

        // ============ مقارنة مجهولة الهوية مع مزارع أخرى (اختياري تمامًا) ============
        // بدون خادم مركزي: التبادل يدوي بالكامل — تُنشئ كودًا من دورة مؤرشفة عندك (أرقام أداء فقط، بدون اسمك أو موقعك)،
        // وترسله لمربّي آخر تثق فيه (واتساب مثلًا)، وهو يرسلّك كوده بالمثل، وتستورده هنا. لا إرسال تلقائي ولا خادم مركزي — خصوصيتك بالكامل بين يديك.
        // ============ تشغيل محاكي "ماذا لو" — يقرأ القيم اللي دخّلها المستخدم ويحسب الربح المتوقع بنموذج الانحدار المحسوب فى computeProfitAttributionAnalysis ============
        function runWhatIfSimulation() {
            const box = document.getElementById('whatIfResult');
            if (!box) return;
            if (!_whatIfModel) { box.innerHTML = `<div class="day" style="color:var(--red);">النموذج مش متاح — افتح تبويب المقارنة تاني.</div>`; return; }
            const vals = _whatIfModel.factors.map(f => {
                const el = document.getElementById('wi_' + f.key);
                return el ? parseFloat(el.value) : NaN;
            });
            if (vals.some(v => isNaN(v))) { box.innerHTML = `<div class="day" style="color:var(--red);">دخّل كل القيم بأرقام صحيحة الأول.</div>`; return; }
            const reg = _whatIfModel.reg;
            // نبني نفس ترتيب المُعاملات الأصلي (predictorDefs) بدل ترتيب factors المُعاد ترتيبه حسب قوة التأثير
            const orderedKeys = ['density', 'checklistPct', 'arrivalDiffPct', 'mortRate'];
            const valByKey = {};
            _whatIfModel.factors.forEach((f, i) => { valByKey[f.key] = vals[i]; });
            const orderedVals = orderedKeys.map(k => valByKey[k]);
            const predicted = reg.intercept + reg.coefs.reduce((s, c, i) => s + c * orderedVals[i], 0);
            const diff = predicted - _whatIfModel.avgProfitPerBird;
            const diffColor = diff >= 0 ? 'var(--green)' : 'var(--red)';
            box.innerHTML = `
                ${statLine(`الربح المتوقع لكل طائر`, `${money(predicted)}`, {vStyle:`font-weight:900;`})}
                ${statLine(`الفرق عن متوسطك الحالي`, `${diff>=0?'+':''}${money(diff)}`, {vStyle:`color:${diffColor};font-weight:800;`})}`;
        }

        function generateAnonSnapshotCode(batchId) {
            const b = state.batches.find(x => x.id === batchId);
            if (!b) return;
            const m = computeMetrics(b), fin = computeFinance(b, m);
            const snap = {
                v: 1, species: b.species, breed: b.breed || null,
                epef: Math.round(m.epef || 0), fcr: fin && m.fcr ? +m.fcr.toFixed(2) : null,
                mortRate: +m.mortRate.toFixed(2), costPerKg: fin ? +fin.costPerKg.toFixed(2) : null,
                roi: fin ? +fin.roi.toFixed(1) : null, cycleDays: m.todayAge,
                maxDensity: (b.area && m.liveCount && m.avgWeightG) ? +((m.liveCount * m.avgWeightG / 1000) / b.area).toFixed(1) : null,
                month: (b.startDate || '').slice(5, 7) || null
            };
            const code = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
            const box = document.getElementById('anonCodeOutBox');
            if (box) {
                box.style.display = '';
                box.innerHTML = `<textarea readonly style="width:100%;font-size:11px;direction:ltr;text-align:left;" rows="3" onclick="this.select()">${code}</textarea>
                    <div class="row-actions" style="margin-top:6px;">
                        <button type="button" class="btn ghost sm" style="flex:1;" onclick="navigator.clipboard && navigator.clipboard.writeText('${code}').then(()=>showToast('✅ تم نسخ الكود'))">📋 نسخ الكود</button>
                        <a class="btn ghost sm" style="flex:1;color:#25D366;" href="https://api.whatsapp.com/send?text=${encodeURIComponent('كود مقارنة أداء مجهول من تطبيق كتكوت Pro:\n' + code)}" target="_blank" rel="noopener">💬 إرسال عبر واتساب</a>
                    </div>`;
            }
        }
        function importAnonSnapshotCode() {
            const raw = document.getElementById('imp_code').value.trim();
            if (!raw) { showToast('⚠️ الصق الكود أولاً'); return; }
            try {
                const snap = JSON.parse(decodeURIComponent(escape(atob(raw))));
                if (!snap || !snap.species || snap.epef == null) throw new Error('bad');
                const key = JSON.stringify(snap);
                if (state.sharedSnapshots.some(s => JSON.stringify(s) === key)) { showToast('هذا الكود مُستورد بالفعل'); return; }
                state.sharedSnapshots.push(snap);
                persist();
                closeModal('importSnapshotModalOverlay');
                document.getElementById('imp_code').value = '';
                showToast('✅ تم استيراد بيانات المقارنة');
                render();
            } catch (e) { showToast('❌ الكود غير صالح — تأكد إنه منسوخ كامل بدون تعديل'); }
        }
        function renderAnonCompareSection() {
            const archivedBatches = state.batches.filter(b => b.status === 'مؤرشفة');
            const genOptions = archivedBatches.length
                ? `<select id="anonBatchSelect">${archivedBatches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
                   <button type="button" class="btn ghost sm" onclick="generateAnonSnapshotCode(document.getElementById('anonBatchSelect').value)">📤 إنشاء كود مشاركة</button>`
                : '<p style="font-size:11px;color:var(--muted);">أنشئ الكود من دورة مؤرشفة مكتملة (أنهِ دورتك الحالية أولًا).</p>';
            let statsHtml = '';
            if (state.sharedSnapshots.length) {
                const bySpecies = {};
                state.sharedSnapshots.forEach(s => { (bySpecies[s.species] = bySpecies[s.species] || []).push(s); });
                statsHtml = Object.entries(bySpecies).map(([sp, list]) => {
                    const avg = (k) => { const v = list.map(x => x[k]).filter(x => x != null); return v.length ? v.reduce((a,c)=>a+c,0) / v.length : null; };
                    const label = (getSpeciesData(sp) || {}).label || sp;
                    return `${statLine(`${label} (${list.length} دفعة مستوردة)`, `EPEF ${fmt(avg('epef'),0)} · FCR ${avg('fcr')?fmt(avg('fcr'),2):'—'} · نفوق ${fmt(avg('mortRate'),2)}%`)}`;
                }).join('');
            }
            return `<div class="section">
                <div class="section-head"><h2>🤝 مقارنة مجهولة مع مزارع أخرى (اختياري)</h2></div>
                <div class="card">
                    <p style="font-size:11.5px;color:var(--muted);margin:0 0 8px;line-height:1.6;">تبادل يدوي بالكامل: أنشئ كودًا من دورة مؤرشفة عندك (أرقام أداء فقط — بدون اسمك أو موقعك)، أرسله لمربّي تثق فيه عبر واتساب، وهو يرسلّك كوده. استورد أي كود تستلمه لتشوف متوسط قطاع حقيقي من دورات فعلية بدل المعياري النظري فقط. لا يوجد إرسال تلقائي ولا خادم مركزي — خصوصيتك بالكامل بين يديك.</p>
                    <div style="margin-bottom:8px;">${genOptions}</div>
                    <div id="anonCodeOutBox" style="display:none;margin-bottom:8px;"></div>
                    <button type="button" class="btn gold block" onclick="openModal('importSnapshotModalOverlay')">📥 استيراد كود من مربّي آخر</button>
                    ${statsHtml ? `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:8px;"><div style="font-weight:800;font-size:13px;margin-bottom:4px;">📊 متوسط الدورات المستوردة (${state.sharedSnapshots.length})</div>${statsHtml}</div>` : ''}
                </div>
            </div>`;
        }

        function toggleCompare(id) {
            const i = state.compareIds.indexOf(id);
            if (i > -1) state.compareIds.splice(i, 1);
            else state.compareIds.push(id);
            persist();
            render();
        }

        // ============ buildPrintableReport - التقرير التفصيلي الكامل ============
        function buildPrintableReport(b, m, fin, alerts) {
            const el = document.getElementById('printableReport');
            if (!el) return;

            if (!b || !m || !fin) {
                el.innerHTML = `<div style="color:red;text-align:center;padding:20px;">⚠️ لا توجد بيانات كافية لتوليد التقرير</div>`;
                return;
            }

            const speciesLabel = getSpeciesData(b.species).label || b.species;
            const today = todayStr();

            // بناء جدول الأيام التفصيلي
            let daysRows = '';
            const records = [...b.records].sort((a, c) => a.age - c.age);

            const dnPrint = (d, n) => (d == null && n == null) ? '—' : `☀️${d != null ? fmt(d,1) : '—'} / 🌙${n != null ? fmt(n,1) : '—'}`;
            const dnPrintInt = (d, n) => (d == null && n == null) ? '—' : `☀️${d ?? 0} / 🌙${n ?? 0}`;
            if (records.length === 0) {
                daysRows = `<tr><td colspan="15" style="text-align:center;color:#999;">لا توجد سجلات يومية مسجلة</td></tr>`;
            } else {
                daysRows = records.map(r => {
                    const feedAdds = b.feedAdditives.filter(fa => fa.active && additiveActiveOnDay(fa, r.age));
                    const feedAddText = feedAdds.length ? feedAdds.map(fa => `${esc(fa.name)} (${fa.dose} ${fa.unit}/${fa.per})`).join('<br>') : '—';
                    const waterAdds = b.waterAdditives.filter(wa => wa.active && additiveActiveOnDay(wa, r.age));
                    const waterAddText = waterAdds.length ? waterAdds.map(wa => `${esc(wa.name)} (${wa.dose} ${wa.unit}/${wa.per})`).join('<br>') : '—';
                    const treatments = b.treatmentLog.filter(t => t.done && t.day === r.age);
                    const treatText = treatments.length ? treatments.map(t => `✅ ${esc(t.name)}`).join('<br>') : '—';
                    const vaccines = b.vaccineLog.filter(v => v.done && v.day === r.age);
                    const vaccText = vaccines.length ? vaccines.map(v => `✅ ${esc(v.name)}`).join('<br>') : '—';
                    const notesText = (r.notesDay || r.notesNight)
                        ? [r.notesDay ? `☀️ ${r.notesDay}` : '', r.notesNight ? `🌙 ${r.notesNight}` : ''].filter(Boolean).join('<br>')
                        : (r.notes || '—');
                    return `<tr>
                        <td style="font-weight:bold;">${r.age}</td>
                        <td>${r.date}</td>
                        <td style="font-size:9px;">${r.mort || 0}<br><span style="color:#888;">${dnPrintInt(r.mortDay, r.mortNight)}</span></td>
                        <td style="font-size:9px;">${r.cull || 0}<br><span style="color:#888;">${dnPrintInt(r.cullDay, r.cullNight)}</span></td>
                        <td style="font-size:9.5px;white-space:nowrap;">${dnPrint(r.feedDay, r.feedNight)}</td>
                        <td style="font-size:9.5px;white-space:nowrap;">${dnPrint(r.waterDay, r.waterNight)}</td>
                        <td>${r.weight ? fmt(r.weight, 0) : '—'}</td>
                        <td style="font-size:9.5px;white-space:nowrap;">${dnPrint(r.tempDay, r.tempNight)}</td>
                        <td style="font-size:9.5px;white-space:nowrap;">${dnPrint(r.humidityDay, r.humidityNight)}</td>
                        <td>${r.health != null ? r.health + '/10' : '—'}</td>
                        <td style="font-size:9px;">${r.analysis ? r.analysis.split(' | ').join('<br>') : '—'}</td>
                        <td style="font-size:9px;">${feedAddText}</td>
                        <td style="font-size:9px;">${waterAddText}</td>
                        <td style="font-size:9px;">${treatText}${treatText!=='—'&&vaccText!=='—'?'<br>':''}${vaccText!=='—'?vaccText:''}</td>
                        <td style="font-size:9px;">${notesText}</td>
                    </tr>`;
                }).join('');
            }

            // حساب إجماليات الدورة
            const totalMort = records.reduce((s, r) => s + (r.mort || 0), 0);
            const totalCull = records.reduce((s, r) => s + (r.cull || 0), 0);
            const totalFeed = records.reduce((s, r) => s + (r.feed || 0), 0);
            const totalWater = records.reduce((s, r) => s + (r.water || 0), 0);
            const avgTemp = records.filter(r => r.temp != null).reduce((s, r) => s + r.temp, 0) / (records.filter(r => r.temp != null).length || 1);
            const avgHealth = records.filter(r => r.health != null).reduce((s, r) => s + r.health, 0) / (records.filter(r => r.health != null).length || 1);

            // إضافات العلف المسجلة في البرنامج
            const allFeedAdds = b.feedAdditives.filter(fa => fa.active).map(fa =>
                `• ${fa.name}: ${additiveDayLabel(fa)} (${fa.dose} ${fa.unit}/${fa.per})${fa.notes ? ' — ' + fa.notes : ''}`
            ).join('<br>') || 'لا توجد إضافات علف مسجلة';

            // إضافات المياه المسجلة في البرنامج
            const allWaterAdds = b.waterAdditives.filter(wa => wa.active).map(wa =>
                `• ${wa.name}: ${additiveDayLabel(wa)} (${wa.dose} ${wa.unit}/${wa.per})${wa.notes ? ' — ' + wa.notes : ''}`
            ).join('<br>') || 'لا توجد إضافات مياه مسجلة';

            // معاملات الفرشة المسجلة في البرنامج
            const allTreats = b.treatmentLog.map(t =>
                `• ${t.name} (يوم ${t.day}) ${t.done ? '✅ تم' : '⏳ لم يتم'}`
            ).join('<br>') || 'لا توجد معاملات فرشة مسجلة';

            // التحصينات المسجلة في البرنامج
            const allVaccs = b.vaccineLog.map(v =>
                `• ${v.name} (يوم ${v.day}) ${v.done ? '✅ تم' : '⏳ لم يتم'}`
            ).join('<br>') || 'لا توجد تحصينات مسجلة';

            // ============ سجل تنفيذ إضافات العلف والمياه الكامل خلال الدورة ============
            const execSorted = [...(b.additiveExecLog || [])].sort((a, c) => a.date.localeCompare(c.date));
            let execRowsPrint = execSorted.map(e => `<tr>
                        <td>${e.date}</td><td>${e.type === 'feed' ? '🌾 علف' : '💧 مياه'}</td>
                        <td>${esc(e.name)}</td><td>${fmt(e.qty, 2)} ${e.unit || ''}</td>
                    </tr>`).join('');

            // ============ سجل حركات المخزن الكامل ============
            const movementsSorted = [...(b.stockMovements || [])].sort((a, c) => a.date.localeCompare(c.date));
            const movTypeLabel = { in: '⬆️ وارد', out: '⬇️ صادر', adjust: '🗑️ حذف/تسوية' };
            let movementsRows = movementsSorted.map(mv => `<tr>
                        <td>${mv.date}</td><td>${mv.itemName || '—'}</td>
                        <td>${movTypeLabel[mv.type] || mv.type}</td><td>${fmt(mv.qty, 2)}</td>
                        <td style="font-size:10px;">${esc(mv.note) || '—'}</td>
                    </tr>`).join('');

            // ============ سجل المشتريات الكامل ============
            const purchasesSorted = [...(b.purchases || [])].sort((a, c) => a.date.localeCompare(c.date));
            let purchasesRows = purchasesSorted.map(p => `<tr>
                        <td>${p.date}</td><td>${p.type}</td><td>${esc(p.desc) || '—'}</td><td>${esc(p.supplier) || '—'}</td>
                        <td>${p.qty ? fmt(p.qty, 2) + ' ' + (p.unit || '') : '—'}</td>
                        <td>${p.price ? fmt(p.price, 2) : '—'}</td><td style="font-weight:bold;">${money(p.total)}</td>
                    </tr>`).join('');
            const purchasesTotal = purchasesSorted.reduce((s, p) => s + (p.total || 0), 0);

            // ============ (جديد) مقارنة الموردين — إحصائية مجمّعة من كل مشتريات الدورة ============
            const supplierMapPr = {};
            purchasesSorted.filter(p => p.supplier).forEach(p => {
                if (!supplierMapPr[p.supplier]) supplierMapPr[p.supplier] = { count: 0, total: 0, lastDate: '', lastItem: '', lastPrice: 0, prices: [] };
                const s = supplierMapPr[p.supplier];
                s.count++; s.total += p.total; if (p.price) s.prices.push(p.price);
                if (p.date >= s.lastDate) { s.lastDate = p.date; s.lastItem = p.desc || p.type; s.lastPrice = p.price; }
            });
            const supplierNamesPr = Object.keys(supplierMapPr).sort();
            let supplierRowsPr = supplierNamesPr.map(name => {
                const s = supplierMapPr[name];
                const avg = s.prices.length ? s.prices.reduce((a,c)=>a+c,0) / s.prices.length : 0;
                return `<tr><td>${esc(name)}</td><td>${s.count}</td><td style="font-size:10px;">${esc(s.lastItem)}</td>
                    <td>${s.lastPrice ? fmt(s.lastPrice,2) : '—'}</td><td>${avg ? fmt(avg,2) : '—'}</td><td style="font-weight:bold;">${money(s.total)}</td><td>${s.lastDate}</td></tr>`;
            }).join('');

            // ============ سجل المبيعات الكامل ============
            const salesSorted = [...(b.sales || [])].sort((a, c) => a.date.localeCompare(c.date));
            let salesRows = salesSorted.map(s => {
                const details = s.kind === 'litter'
                    ? `حجم: ${fmt(s.volume || 0, 2)} م³ × ${fmt(s.price || 0, 2)} ج`
                    : `عدد: ${fmt(s.count || 0, 0)} | وزن: ${fmt(s.weight || 0, 1)} كجم × ${fmt(s.price || 0, 2)} ج (${s.productType === 'processed' ? 'مذبوح' : 'حي'})`;
                return `<tr>
                        <td>${s.date}</td><td>${s.kind === 'litter' ? ((b.floorType === 'cage') ? '🟫 زرق' : '🌾 سبلة') : '🐔 لحم'}</td><td>${esc(s.buyer) || '—'}</td>
                        <td style="font-size:10px;">${details}</td><td style="font-weight:bold;">${money(s.total)}</td>
                    </tr>`;
            }).join('');
            const salesTotal = salesSorted.reduce((s, x) => s + (x.total || 0), 0);

            // ============ (جديد) مقارنة المشترين — إحصائية مجمّعة من كل مبيعات الدورة ============
            const buyerMapSl = {};
            salesSorted.filter(s => s.buyer).forEach(s => {
                if (!buyerMapSl[s.buyer]) buyerMapSl[s.buyer] = { count: 0, total: 0, weight: 0, lastDate: '', prices: [] };
                const bm = buyerMapSl[s.buyer];
                bm.count++; bm.total += s.total;
                if (s.kind !== 'litter') { bm.weight += (s.weight || 0); if (s.price) bm.prices.push(s.price); }
                if (s.date >= bm.lastDate) bm.lastDate = s.date;
            });
            const buyerNamesSl = Object.keys(buyerMapSl).sort((x, y) => buyerMapSl[y].total - buyerMapSl[x].total);
            let buyerRowsSl = buyerNamesSl.map(name => {
                const bm = buyerMapSl[name];
                const avgPrice = bm.prices.length ? bm.prices.reduce((a,c)=>a+c,0) / bm.prices.length : 0;
                const avgTicket = bm.count > 0 ? bm.total / bm.count : 0;
                return `<tr><td>${esc(name)}</td><td>${bm.count}</td><td>${bm.weight > 0 ? fmt(bm.weight,1) + ' كجم' : '—'}</td>
                    <td>${avgPrice > 0 ? fmt(avgPrice,2) : '—'}</td><td style="font-weight:bold;">${money(bm.total)}</td><td>${money(avgTicket)}</td><td>${bm.lastDate}</td></tr>`;
            }).join('');

            // ============ البنود الإضافية الكاملة ============
            const customSorted = [...(b.customItems || [])].sort((a, c) => (a.date || '').localeCompare(c.date || ''));
            let customRows = customSorted.map(c => `<tr>
                        <td>${c.date || '—'}</td><td>${esc(c.name)}</td>
                        <td>${c.type === 'revenue' ? '📈 إيراد' : '📉 تكلفة'}</td>
                        <td style="font-size:10px;">${esc(c.note) || '—'}</td>
                        <td style="font-weight:bold;color:${c.type === 'revenue' ? 'green' : 'red'};">${money(c.amount)}</td>
                    </tr>`).join('');

            // ============ سجل الأمان الحيوي الكامل ============
            const biosecuritySorted = [...(b.biosecurityLog || [])].sort((a, c) => a.date.localeCompare(c.date));
            let biosecurityRows = biosecuritySorted.map(bi => `<tr>
                        <td>${bi.date}</td><td>${esc(bi.type)}</td><td style="font-size:10px;">${esc(bi.note) || '—'}</td>
                    </tr>`).join('');

            el.innerHTML = `
                <div style="font-family: 'Tajawal', 'Cairo', sans-serif; max-width: 100%; margin: 0 auto; padding: 20px; background: white; direction: rtl; font-size: 12px;">

                    <!-- رأس التقرير -->
                    <div style="text-align:center;border-bottom:3px solid #2F4538;padding-bottom:10px;margin-bottom:14px;">
                        <h1 style="margin:0;color:#2F4538;font-size:22px;">🐔 تقرير أداء الدورة اليومي التفصيلي</h1>
                        <p style="margin:4px 0 0;color:#555;font-size:14px;font-weight:bold;">${esc(b.name) || 'دفعة غير مسماة'}</p>
                        <p style="margin:2px 0 0;color:#777;font-size:12px;">${speciesLabel} (${esc(b.breed) || 'غير محدد'}) | تاريخ الاستلام: ${b.startDate} | عدد الكتاكيت: ${fmt(b.startCount, 0)}</p>
                        <p style="margin:2px 0 0;color:#777;font-size:12px;">تاريخ التقرير: ${today}</p>
                    </div>

                    <!-- ملخص سريع -->
                    <div style="background:#f5f0e8;padding:10px;border-radius:8px;margin-bottom:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;font-size:12px;">
                        <div><b>📅 العمر:</b> ${m.age} يوم</div>
                        <div><b>🐔 المتبقي:</b> ${fmt(m.liveCount, 0)} (${fmt(m.liveCountPct, 1)}%)</div>
                        <div><b>💀 إجمالي النافق:</b> ${totalMort}</div>
                        <div><b>📊 نسبة النفوق:</b> ${fmt(m.mortRate, 2)}%</div>
                        <div><b>⚖️ متوسط الوزن:</b> ${fmt(m.avgWeightG, 0)} جم</div>
                        <div><b>🌾 إجمالي العلف:</b> ${fmt(totalFeed, 0)} كجم</div>
                        <div><b>🧮 FCR:</b> ${m.fcr ? fmt(m.fcr, 2) : '—'}</div>
                        <div><b>🏆 EPEF:</b> ${m.epef ? fmt(m.epef, 0) : '—'}</div>
                        <div><b>🌡️ متوسط الحرارة:</b> ${fmt(avgTemp, 1)} °C</div>
                        <div><b>💚 متوسط الصحة:</b> ${fmt(avgHealth, 1)}/10</div>
                    </div>

                    <!-- الرسوم البيانية -->
                    <h3 style="color:#2F4538;font-size:15px;margin:12px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">📈 الرسوم البيانية</h3>
                    <div style="display:grid;gap:10px;margin-bottom:14px;">
                        <div style="background:#faf7ee;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <div style="font-size:12px;font-weight:bold;color:#6B4226;margin-bottom:4px;">منحنى نمو الوزن (فعلي vs معياري)</div>
                            <canvas id="chartWeightPrint" height="170"></canvas>
                        </div>
                        <div style="background:#faf7ee;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <div style="font-size:12px;font-weight:bold;color:#6B4226;margin-bottom:4px;">العلف اليومي + FCR التراكمي</div>
                            <canvas id="chartFeedPrint" height="170"></canvas>
                        </div>
                        <div style="background:#faf7ee;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <div style="font-size:12px;font-weight:bold;color:#6B4226;margin-bottom:4px;">النفوق التراكمي</div>
                            <canvas id="chartMortPrint" height="150"></canvas>
                        </div>
                        <div style="background:#faf7ee;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <div style="font-size:12px;font-weight:bold;color:#6B4226;margin-bottom:4px;">توزيع التكاليف</div>
                            <canvas id="chartCostPiePrint" height="170"></canvas>
                            <div id="costPieLegendPrint" class="legend-row"></div>
                        </div>
                        <div style="background:#faf7ee;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <div style="font-size:12px;font-weight:bold;color:#6B4226;margin-bottom:4px;">توزيع الإيرادات</div>
                            <canvas id="chartRevPiePrint" height="170"></canvas>
                            <div id="revPieLegendPrint" class="legend-row"></div>
                        </div>
                    </div>

                    <!-- جدول الأيام التفصيلي -->
                    <h3 style="color:#2F4538;font-size:15px;margin:12px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">📋 سجل المتابعة اليومي (${records.length} يوم)</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10px;background:white;min-width:1500px;">
                            <thead>
                                <tr style="background:#2F4538;color:white;">
                                    <th style="padding:6px 4px;">العمر</th>
                                    <th style="padding:6px 4px;">التاريخ</th>
                                    <th style="padding:6px 4px;">نافق</th>
                                    <th style="padding:6px 4px;">مستبعد</th>
                                    <th style="padding:6px 4px;">علف ☀️/🌙 (كجم)</th>
                                    <th style="padding:6px 4px;">ماء ☀️/🌙 (لتر)</th>
                                    <th style="padding:6px 4px;">الوزن (جم)</th>
                                    <th style="padding:6px 4px;">حرارة ☀️/🌙 °C</th>
                                    <th style="padding:6px 4px;">رطوبة ☀️/🌙 %</th>
                                    <th style="padding:6px 4px;">صحة /10</th>
                                    <th style="padding:6px 4px;min-width:110px;">تحليل تلقائي (فروق نهار/ليل)</th>
                                    <th style="padding:6px 4px;min-width:80px;">إضافات العلف</th>
                                    <th style="padding:6px 4px;min-width:80px;">إضافات المياه</th>
                                    <th style="padding:6px 4px;min-width:80px;">معاملة/تحصين</th>
                                    <th style="padding:6px 4px;min-width:90px;">ملاحظات ☀️/🌙</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${daysRows}
                            </tbody>
                        </table>
                    </div>

                    <!-- برامج الإضافات والمعاملات -->
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-top:14px;font-size:11px;">
                        <div style="background:#f8f5ed;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <h4 style="margin:0 0 4px;color:#6B4226;font-size:13px;">🌾 برنامج إضافات العلف</h4>
                            <div style="line-height:1.6;">${allFeedAdds}</div>
                        </div>
                        <div style="background:#f8f5ed;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <h4 style="margin:0 0 4px;color:#6B4226;font-size:13px;">💧 برنامج إضافات المياه</h4>
                            <div style="line-height:1.6;">${allWaterAdds}</div>
                        </div>
                        <div style="background:#f8f5ed;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <h4 style="margin:0 0 4px;color:#6B4226;font-size:13px;">🧴 برنامج معاملة الفرشة</h4>
                            <div style="line-height:1.6;">${allTreats}</div>
                        </div>
                        <div style="background:#f8f5ed;border-radius:8px;padding:10px;border:1px solid #e0dcd2;">
                            <h4 style="margin:0 0 4px;color:#6B4226;font-size:13px;">💉 برنامج التحصينات</h4>
                            <div style="line-height:1.6;">${allVaccs}</div>
                        </div>
                    </div>

                    <!-- سجل تنفيذ إضافات العلف والمياه -->
                    <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">💉 سجل تنفيذ الإضافات خلال الدورة (${execSorted.length})</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;min-width:500px;">
                            <thead><tr style="background:#2F4538;color:white;">
                                <th style="padding:6px 4px;">التاريخ</th><th style="padding:6px 4px;">النوع</th>
                                <th style="padding:6px 4px;">اسم الإضافة</th><th style="padding:6px 4px;">الكمية المنفذة</th>
                            </tr></thead>
                            <tbody>${execRowsPrint || '<tr><td colspan="4" style="text-align:center;color:#999;">لا توجد عمليات تنفيذ إضافات مسجلة</td></tr>'}</tbody>
                        </table>
                    </div>

                    <!-- سجل حركات المخزن -->
                    <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">📦 سجل حركات المخزن (${movementsSorted.length})</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;min-width:600px;">
                            <thead><tr style="background:#2F4538;color:white;">
                                <th style="padding:6px 4px;">التاريخ</th><th style="padding:6px 4px;">الصنف</th>
                                <th style="padding:6px 4px;">نوع الحركة</th><th style="padding:6px 4px;">الكمية</th>
                                <th style="padding:6px 4px;">ملاحظة</th>
                            </tr></thead>
                            <tbody>${movementsRows || '<tr><td colspan="5" style="text-align:center;color:#999;">لا توجد حركات مخزن مسجلة</td></tr>'}</tbody>
                        </table>
                    </div>

                    <!-- سجل المشتريات -->
                    <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">🧾 سجل المشتريات (${purchasesSorted.length})</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;min-width:700px;">
                            <thead><tr style="background:#2F4538;color:white;">
                                <th style="padding:6px 4px;">التاريخ</th><th style="padding:6px 4px;">النوع</th>
                                <th style="padding:6px 4px;">البيان</th><th style="padding:6px 4px;">المورد</th>
                                <th style="padding:6px 4px;">الكمية</th><th style="padding:6px 4px;">السعر</th>
                                <th style="padding:6px 4px;">الإجمالي</th>
                            </tr></thead>
                            <tbody>${purchasesRows || '<tr><td colspan="7" style="text-align:center;color:#999;">لا توجد مشتريات مسجلة</td></tr>'}</tbody>
                            ${purchasesSorted.length ? `<tfoot><tr style="background:#f5f0e8;font-weight:bold;"><td colspan="6" style="padding:6px;text-align:left;">إجمالي المشتريات</td><td style="padding:6px;">${money(purchasesTotal)}</td></tr></tfoot>` : ''}
                        </table>
                    </div>

                    <!-- (جديد) مقارنة الموردين -->
                    ${supplierNamesPr.length ? `
                    <h3 style="color:#2F4538;font-size:14px;margin:10px 0 6px;">🚚 مقارنة الموردين (${supplierNamesPr.length})</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;min-width:650px;">
                            <thead><tr style="background:#6B4226;color:white;">
                                <th style="padding:6px 4px;">المورد</th><th style="padding:6px 4px;">عدد التعاملات</th>
                                <th style="padding:6px 4px;">آخر صنف</th><th style="padding:6px 4px;">آخر سعر</th>
                                <th style="padding:6px 4px;">متوسط السعر</th><th style="padding:6px 4px;">إجمالي المشتريات</th>
                                <th style="padding:6px 4px;">آخر تعامل</th>
                            </tr></thead>
                            <tbody>${supplierRowsPr}</tbody>
                        </table>
                    </div>` : ''}

                    <!-- سجل المبيعات -->
                    <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">💵 سجل المبيعات (${salesSorted.length})</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;min-width:600px;">
                            <thead><tr style="background:#2F4538;color:white;">
                                <th style="padding:6px 4px;">التاريخ</th><th style="padding:6px 4px;">النوع</th>
                                <th style="padding:6px 4px;">المشتري</th><th style="padding:6px 4px;">التفاصيل</th>
                                <th style="padding:6px 4px;">الإجمالي</th>
                            </tr></thead>
                            <tbody>${salesRows || '<tr><td colspan="5" style="text-align:center;color:#999;">لا توجد مبيعات مسجلة</td></tr>'}</tbody>
                            ${salesSorted.length ? `<tfoot><tr style="background:#f5f0e8;font-weight:bold;"><td colspan="4" style="padding:6px;text-align:left;">إجمالي المبيعات</td><td style="padding:6px;">${money(salesTotal)}</td></tr></tfoot>` : ''}
                        </table>
                    </div>

                    <!-- (جديد) مقارنة المشترين -->
                    ${buyerNamesSl.length ? `
                    <h3 style="color:#2F4538;font-size:14px;margin:10px 0 6px;">🤝 مقارنة المشترين (${buyerNamesSl.length})</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;min-width:650px;">
                            <thead><tr style="background:#6B4226;color:white;">
                                <th style="padding:6px 4px;">المشتري</th><th style="padding:6px 4px;">عدد التعاملات</th>
                                <th style="padding:6px 4px;">إجمالي الوزن</th><th style="padding:6px 4px;">متوسط السعر</th>
                                <th style="padding:6px 4px;">إجمالي المبيعات</th><th style="padding:6px 4px;">متوسط قيمة العملية</th>
                                <th style="padding:6px 4px;">آخر تعامل</th>
                            </tr></thead>
                            <tbody>${buyerRowsSl}</tbody>
                        </table>
                    </div>` : ''}

                    <!-- البنود الإضافية -->
                    <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">➕ البنود الإضافية (${customSorted.length})</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;min-width:500px;">
                            <thead><tr style="background:#2F4538;color:white;">
                                <th style="padding:6px 4px;">التاريخ</th><th style="padding:6px 4px;">البند</th>
                                <th style="padding:6px 4px;">النوع</th><th style="padding:6px 4px;">ملاحظة</th>
                                <th style="padding:6px 4px;">القيمة</th>
                            </tr></thead>
                            <tbody>${customRows || '<tr><td colspan="5" style="text-align:center;color:#999;">لا توجد بنود إضافية</td></tr>'}</tbody>
                        </table>
                    </div>

                    <!-- سجل الأمان الحيوي -->
                    <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">🛡️ سجل الأمان الحيوي (${biosecuritySorted.length})</h3>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;min-width:400px;">
                            <thead><tr style="background:#2F4538;color:white;">
                                <th style="padding:6px 4px;">التاريخ</th><th style="padding:6px 4px;">الإجراء</th>
                                <th style="padding:6px 4px;">ملاحظة</th>
                            </tr></thead>
                            <tbody>${biosecurityRows || '<tr><td colspan="3" style="text-align:center;color:#999;">لا توجد سجلات أمان حيوي</td></tr>'}</tbody>
                        </table>
                    </div>

                    <!-- التقرير المالي -->
                    <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">💰 التقرير المالي</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;background:#faf7ee;border-radius:8px;padding:12px;border:1px solid #e0dcd2;">
                        <div><b>تكلفة العلف:</b> ${money(fin.feedCost)}</div>
                        <div><b>تكلفة الكتاكيت:</b> ${money(fin.chickCost)}</div>
                        <div><b>أدوية ولقاحات:</b> ${money(fin.medFromPurchases)}</div>
                        <div><b>فرشة:</b> ${money(fin.beddingFromPurchases)}</div>
                        <div><b>وقود التدفئة:</b> ${money(fin.heatCost)}</div>
                        <div><b>ذبح وتصنيع:</b> ${money(fin.processingCost)}</div>
                        <div><b>إضافات:</b> ${money(fin.addFromPurchases)}</div>
                        <div><b>كهرباء ومياه:</b> ${money(fin.utilFromPurchases)}</div>
                        <div><b>عمالة:</b> ${money(fin.laborFromPurchases)}</div>
                        <div><b>بنود إضافية:</b> ${money(fin.customCosts)}</div>
                        <div style="grid-column:1/2;font-weight:bold;border-top:2px solid #2F4538;padding-top:6px;">إجمالي التكاليف</div>
                        <div style="grid-column:2/3;font-weight:bold;border-top:2px solid #2F4538;padding-top:6px;color:red;">${money(fin.totalCosts)}</div>

                        <div style="grid-column:1/2;font-weight:bold;border-top:1px solid #ddd;padding-top:6px;">إيراد اللحم</div>
                        <div style="grid-column:2/3;font-weight:bold;border-top:1px solid #ddd;padding-top:6px;color:green;">${money(fin.meatRevenue)}</div>
                        <div style="grid-column:1/2;font-weight:bold;">إيراد السبلة</div>
                        <div style="grid-column:2/3;font-weight:bold;color:green;">${money(fin.litterRevenue)}</div>
                        <div style="grid-column:1/2;font-weight:bold;border-top:2px solid #2F4538;padding-top:6px;">إجمالي الإيرادات</div>
                        <div style="grid-column:2/3;font-weight:bold;border-top:2px solid #2F4538;padding-top:6px;color:green;">${money(fin.totalRevenue)}</div>

                        <div style="grid-column:1/3;text-align:center;font-size:16px;font-weight:bold;padding:8px;background:${fin.netProfit >= 0 ? '#e8f5e9' : '#ffebee'};border-radius:6px;margin-top:4px;">
                            ${fin.netProfit >= 0 ? '✅ صافي الربح' : '❌ صافي الخسارة'}: ${money(Math.abs(fin.netProfit))}
                        </div>
                        <div style="grid-column:1/3;text-align:center;font-size:11px;color:#777;">
                            تكلفة الكيلو: ${fmt(fin.costPerKg, 2)} ج | تكلفة الطائر: ${fmt(fin.costPerBird, 2)} ج | ROI: ${fmt(fin.roi, 1)}%
                        </div>
                    </div>

                    <!-- كشف المستحقات (آجل) -->
                    ${(() => {
                        const unpaidPur = purchasesSorted.filter(p => p.paid === false);
                        const unpaidSal = salesSorted.filter(s => s.paid === false);
                        if (!unpaidPur.length && !unpaidSal.length) return '';
                        const t0 = todayStr();
                        const purRowsP = unpaidPur.map(p => `<tr><td>${p.date}</td><td>${esc(p.supplier) || '—'}</td><td>${esc(p.desc) || p.type}</td>
                            <td style="font-weight:bold;">${money(p.total)}</td><td>${p.dueDate || '—'}</td>
                            <td style="color:${p.dueDate && p.dueDate < t0 ? 'red' : '#8A6116'};">${p.dueDate && p.dueDate < t0 ? '⚠️ متأخر' : 'قائم'}</td></tr>`).join('');
                        const salRowsP = unpaidSal.map(s => `<tr><td>${s.date}</td><td>${esc(s.buyer) || '—'}</td><td>${s.kind === 'litter' ? 'سبلة' : 'لحم'}</td>
                            <td style="font-weight:bold;">${money(s.total)}</td><td>${s.dueDate || '—'}</td>
                            <td style="color:${s.dueDate && s.dueDate < t0 ? 'red' : '#8A6116'};">${s.dueDate && s.dueDate < t0 ? '⚠️ متأخر' : 'قائم'}</td></tr>`).join('');
                        const payTotal = unpaidPur.reduce((s, p) => s + p.total, 0);
                        const recTotal = unpaidSal.reduce((s, x) => s + x.total, 0);
                        return `
                        <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">💳 كشف المستحقات الآجلة</h3>
                        ${unpaidPur.length ? `
                        <div style="font-size:12px;font-weight:bold;margin:6px 0 4px;color:#6B4226;">مستحق للموردين (${unpaidPur.length}) — إجمالي ${money(payTotal)}</div>
                        <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;margin-bottom:10px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;">
                        <thead><tr style="background:#2F4538;color:white;"><th>التاريخ</th><th>المورد</th><th>البيان</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th></tr></thead>
                        <tbody>${purRowsP}</tbody></table></div>` : ''}
                        ${unpaidSal.length ? `
                        <div style="font-size:12px;font-weight:bold;margin:6px 0 4px;color:#6B4226;">مستحق من العملاء (${unpaidSal.length}) — إجمالي ${money(recTotal)}</div>
                        <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:10.5px;background:white;">
                        <thead><tr style="background:#2F4538;color:white;"><th>التاريخ</th><th>المشتري</th><th>النوع</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th></tr></thead>
                        <tbody>${salRowsP}</tbody></table></div>` : ''}`;
                    })()}

                    <!-- التنبيهات -->
                    <h3 style="color:#2F4538;font-size:15px;margin:14px 0 6px;border-bottom:2px solid #D9A544;padding-bottom:4px;">🔔 التنبيهات والتوصيات</h3>
                    <ul style="font-size:12px;padding-right:20px;background:#faf7ee;border-radius:8px;padding:12px;border:1px solid #e0dcd2;margin:0;">
                        ${alerts && alerts.length ? alerts.map(a => `<li style="color:${a.level === 'danger' ? 'red' : a.level === 'warn' ? '#8A6116' : '#2E6E8E'};">${a.text}</li>`).join('') : '<li style="color:green;">✅ لا توجد تنبيهات حالية</li>'}
                    </ul>

                    <!-- تذييل -->
                    <div style="margin-top:20px;font-size:10px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px;">
                        تم إنشاء هذا التقرير تلقائيًا بواسطة تطبيق "مزرعتي للتسمين"<br>
                        جميع الحقوق محفوظة © ${new Date().getFullYear()}
                    </div>
                </div>
            `;
        }

        // ============ Charts — pure Canvas2D ============
