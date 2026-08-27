        // ============ 🎨 دالة مشتركة (كانت مكررة حرفيًا فى مكانين: لوحة التحكم وتبويب البيئة) ============
        function waterFeedDeviationColor(deviationPct) {
            return deviationPct != null && deviationPct >= 15 ? 'var(--red)' : (deviationPct != null && deviationPct >= 8 ? 'var(--warning-text)' : 'var(--green)');
        }

        // ============ 💧 حساب الهادر التقديري من مياه الشرب (Water Waste Estimate) ============
        // الفكرة: نقارن الاستهلاك الفعلي المسجَّل يوميًا (waterDay+waterNight) بالاستهلاك المتوقع
        // حسب نسبة الماء:العلف المرجعية للسلالة (لتر ماء متوقع = كمية العلف المُستهلكة × النسبة
        // المرجعية). أي زيادة فوق المتوقع = "هادر تقديري" — لكن **مش كل زيادة تسريب بالضرورة**:
        // ممكن تكون إجهاد حراري أو بداية مرض (نفس المؤشر المستخدم فى waterFeedAnalysis) — عشان كده
        // النتيجة بتترجع مع توصية صريحة تراجع الحرارة والصحة الأول قبل ما تفتكرها تسريب فى النيبل درينكرز.
        function computeWaterWasteAnalysis(b, m) {
            m = m || computeMetrics(b);
            const spRef = getSpeciesData(b.species);
            const refWfr = spRef ? spRef.waterFeedRatio : null;
            if (!refWfr) return null;
            const series = (b.records || []).filter(r => r.water != null && r.feed != null && r.feed > 0)
                .map(r => ({ age: r.age, date: r.date, water: r.water, feed: r.feed,
                    expected: r.feed * refWfr,
                    waste: Math.max(0, r.water - r.feed * refWfr) }));
            if (series.length < 3) return { hasEnoughData: false, refWfr };
            const totalWaste = series.reduce((s, r) => s + r.waste, 0);
            const totalActual = series.reduce((s, r) => s + r.water, 0);
            const avgDailyWaste = totalWaste / series.length;
            const last3 = series.slice(-3);
            const recentAvgWaste = last3.reduce((s, r) => s + r.waste, 0) / last3.length;
            const wastePct = totalActual > 0 ? (totalWaste / totalActual) * 100 : 0;
            const today = series[series.length - 1];
            return {
                hasEnoughData: true, refWfr, series, totalWaste, avgDailyWaste, recentAvgWaste,
                wastePct, todayWaste: today ? today.waste : null, todayDate: today ? today.date : null,
                daysCounted: series.length
            };
        }

        function _cycleFingerprint(b) {
            let sum = 0, n = 0;
            for (const r of b.records) { sum += (r.age || 0) * 7 + (r.mort || 0) * 13 + (r.cull || 0) * 17 + (r.feed || 0) * 19 + (r.water || 0) * 23 + (r.weight || 0) * 29; n++; }
            for (const p of (b.purchases || [])) { sum += (p.total || 0) * 31; n++; }
            for (const s of (b.sales || [])) { sum += (s.total || 0) * 37; n++; }
            for (const c of (b.customItems || [])) { sum += (c.amount || 0) * 41; n++; }
            return n + ':' + sum.toFixed(3) + ':' + (b.startCount || 0) + ':' + (b.startweight || 0) + ':' +
                (b.feedprice || 0) + ':' + (b.chickprice || 0) + ':' + (b.heatprice || 0) + ':' + (b.archivedDate || '');
        }
        function _getCycleCacheEntry(b) {
            const fp = _cycleFingerprint(b);
            let entry = _cycleCache.get(b.id);
            if (!entry || entry.fp !== fp) { entry = { fp }; _cycleCache.set(b.id, entry); }
            return entry;
        }
        function computeMetrics(b) {
            if (b.status !== 'مؤرشفة') return computeMetricsRaw(b);
            const entry = _getCycleCacheEntry(b);
            if (!entry.metrics) entry.metrics = computeMetricsRaw(b);
            return entry.metrics;
        }
        function computeMetricsRaw(b) {
            const recs = [...b.records].sort((a, c) => a.age - c.age);
            const defW = AS().defaultStartWeightG;
            const startWeightKg = (b.startweight || defW) / 1000;

            // ===== تقدير الوزن لأي يوم (يعالج انقطاع التسجيل اليومي أو غياب الوزن فى يوم معيّن) =====
            // نجمع كل نقاط الوزن الفعلية المسجّلة (+ وزن البداية كنقطة مرجعية عند يوم صفر)
            const weighedPoints = [{ age: 0, weight: b.startweight || defW },
                ...recs.filter(r => r.weight != null).map(r => ({ age: r.age, weight: r.weight }))
            ].sort((a, c) => a.age - c.age);

            function estimateWeight(age) {
                if (age <= weighedPoints[0].age) return weighedPoints[0].weight;
                // بين نقطتين فعليتين: استكمال خطي (Interpolation) — يغطي حالة انقطاع يوم أو أكثر بين وزنتين حقيقيتين
                for (let i = 0; i < weighedPoints.length - 1; i++) {
                    const p0 = weighedPoints[i], p1 = weighedPoints[i + 1];
                    if (age >= p0.age && age <= p1.age) {
                        if (p1.age === p0.age) return p1.weight;
                        return p0.weight + (p1.weight - p0.weight) * ((age - p0.age) / (p1.age - p0.age));
                    }
                }
                // بعد آخر وزن فعلي مسجّل: إسقاط للأمام (Extrapolation) بمعدل النمو الفعلي الأخير،
                // وإن لم يتوفر إلا وزن واحد فقط نستخدم منحنى النمو القياسي لتقدير نسبة الزيادة
                const lastP = weighedPoints[weighedPoints.length - 1];
                if (weighedPoints.length >= 2) {
                    const prevP = weighedPoints[weighedPoints.length - 2];
                    const days = lastP.age - prevP.age;
                    if (days > 0) {
                        const dailyGain = (lastP.weight - prevP.weight) / days;
                        return Math.max(lastP.weight + dailyGain * (age - lastP.age), lastP.weight);
                    }
                }
                const stdAtLast = getRefValue(b, 'weight', lastP.age) || lastP.weight;
                const stdAtAge = getRefValue(b, 'weight', age) || lastP.weight;
                return stdAtLast > 0 ? lastP.weight * (stdAtAge / stdAtLast) : lastP.weight;
            }

            // ============ 🔴 Red Team fix (تناغم المبيعات مع الإنتاج): liveCount كان بيتحسب من (البداية - نفوق - استبعاد) ============
            // بس، من غير ما يطرح الطيور اللي اتباعت فعليًا فى تفريغ جزئي أثناء الدورة (شائع جدًا فى التسمين المصري).
            // النتيجة: بعد أي بيع جزئي، كل حساب بعده (الكثافة، الكتلة الحيوية، EPEF، وأي تحليل مبني عليهم) كان
            // بيفترض إن كل الطيور المتبقية لسه موجودة فى العنبر، فيضخّم تنبيهات الكثافة ويشوّه FCR/EPEF بعد البيع.
            const meatSalesSorted = (b.sales || []).filter(s => s.kind !== 'litter' && s.count > 0).sort((a, c) => a.date.localeCompare(c.date));
            const soldCountAsOf = (dateStr) => {
                let sum = 0;
                for (const s of meatSalesSorted) { if (s.date <= dateStr) sum += s.count; else break; }
                return sum;
            };
            let cumMort = 0, cumCull = 0, cumFeed = 0, cumWater = 0;
            const series = recs.map(r => {
                cumMort += (r.mort || 0);
                cumCull += (r.cull || 0);
                cumFeed += (r.feed || 0);   // تراكمي بالكجم
                cumWater += (r.water || 0); // تراكمي باللتر
                const cumSold = soldCountAsOf(r.date);
                const liveCount = Math.max(b.startCount - cumMort - cumCull - cumSold, 0);
                const weightIsEstimated = r.weight == null;
                const effWeight = weightIsEstimated ? estimateWeight(r.age) : r.weight;
                const biomassKg = (liveCount * effWeight) / 1000;
                // FCR = إجمالي العلف (كجم) ÷ (الكتلة الحيوية الحالية - وزن البداية الكلي)
                // وزن البداية الكلي = عدد الطيور الحية × وزن البداية بالكجم
                const initialBiomassAtDay = liveCount * startWeightKg;
                const gainKg = Math.max(biomassKg - initialBiomassAtDay, 0);
                const fcr = (gainKg > 0 && cumFeed > 0) ? cumFeed / gainKg : null;
                const stdW = getRefValue(b, 'weight', r.age) || 0;
                return { ...r, cumMort, cumCull, cumSold, cumFeed, cumWater, liveCount, biomassKg, gainKg, fcr, stdW, effWeight, weightIsEstimated };
            });

            // نقطة البداية
            if (!series.length || series[0].age !== 0) {
                const soldAtStart = soldCountAsOf(b.startDate);
                series.unshift({
                    date: b.startDate, age: 0, mort: 0, cull: 0, feed: 0, water: 0, weight: b.startweight, notes: '',
                    cumMort: 0, cumCull: 0, cumSold: soldAtStart, cumFeed: 0, cumWater: 0, liveCount: Math.max(b.startCount - soldAtStart, 0),
                    biomassKg: Math.max(b.startCount - soldAtStart, 0) * startWeightKg, gainKg: 0, fcr: null,
                    stdW: getRefValue(b, 'weight', 0) || b.startweight, effWeight: b.startweight, weightIsEstimated: false
                });
            }

            const last = series[series.length - 1];
            const age = last ? last.age : 0; // عمر آخر سجل فعلي مُدخَل (يُستخدم فى حسابات الوزن/الأداء المرتبطة بالبيانات المسجَّلة)
            // عمر القطيع الفعلي اليوم بالتقويم — يُستخدم للتنبيهات والتذكيرات وتنفيذ الإضافات، حتى قبل حفظ سجل اليوم
            const todayAge = b.archivedDate ? age : Math.max(age, daysBetween(b.startDate, todayStr()));
            const liveCount = last ? last.liveCount : b.startCount;
            const liveCountPct = b.startCount > 0 ? (liveCount / b.startCount) * 100 : 100;
            const mortRate = b.startCount > 0 ? ((cumMort + cumCull) / b.startCount) * 100 : 0;
            // آخر وزن فعلي تم تسجيله فعلًا (لعرضه فى الواجهة كمرجع "آخر وزن مقاس")
            const lastWeighed = [...series].reverse().find(r => r.weight != null);
            // الوزن الحالي المُعتمد فى كل الحسابات (فعلي لو موجود، وإلا مُقدَّر بالاستكمال/الإسقاط أعلاه)
            const avgWeightG = last ? last.effWeight : (b.startweight || defW);
            const avgWeightIsEstimated = last ? last.weightIsEstimated : false;
            const avgWeightKg = avgWeightG / 1000;
            const biomassKg = (liveCount * avgWeightG) / 1000;

            // FCR النهائي = إجمالي العلف ÷ (الكتلة الحيوية الحالية - وزن البداية للأعداد الحية)
            const initialBiomassFinal = liveCount * startWeightKg;
            const gainKg = Math.max(biomassKg - initialBiomassFinal, 0);
            const fcr = (gainKg > 0 && cumFeed > 0) ? (cumFeed / gainKg) : null;

            // EPEF = (نسبة النجاة% × وزن الطائر بالكجم) ÷ (FCR × عمر القطيع) × 100
            const epef = (fcr && fcr > 0 && age > 0 && avgWeightKg > 0)
                ? (liveCountPct * avgWeightKg) / (fcr * age) * 100
                : null;

            const adg = age > 0 ? ((avgWeightG - (b.startweight || defW)) / age) : 0;
            const stdWeight = getRefValue(b, 'weight', age) || 0;
            const weightDiffPct = stdWeight > 0 ? ((avgWeightG - stdWeight) / stdWeight) * 100 : 0;
            const waterFeedRatio = cumFeed > 0 ? cumWater / cumFeed : 0;
            const effArea = getEffectiveFloorArea(b);
            const density = (effArea > 0 && biomassKg > 0) ? biomassKg / effArea : 0;
            const lastEnv = [...series].reverse().find(r => r.humidity != null || r.co2 != null || r.nh3 != null || r.health != null) || {};

            // ===== تجميع أسباب النفوق عبر كل سجلات الدفعة (لتحديد السبب الأساسي وليس مجرد نسبة إجمالية) =====
            const mortCauseTotals = { heat: 0, disease: 0, trample: 0, deform: 0, other: 0 };
            let mortCauseClassifiedTotal = 0;
            recs.forEach(r => {
                if (r.mortCauses) {
                    Object.keys(mortCauseTotals).forEach(k => { mortCauseTotals[k] += (r.mortCauses[k] || 0); mortCauseClassifiedTotal += (r.mortCauses[k] || 0); });
                }
            });
            const causeLabels = { heat: '🌡️ إجهاد حراري', disease: '🦠 مرض', trample: '🐾 دهس/اختناق', deform: '🧬 تشوهات', other: '❓ أخرى' };
            let dominantCause = null;
            const maxCause = Object.keys(mortCauseTotals).reduce((a, k) => mortCauseTotals[k] > (mortCauseTotals[a] || 0) ? k : a, null);
            if (maxCause && mortCauseTotals[maxCause] > 0) {
                dominantCause = { key: maxCause, label: causeLabels[maxCause], count: mortCauseTotals[maxCause],
                    pct: mortCauseClassifiedTotal > 0 ? (mortCauseTotals[maxCause] / mortCauseClassifiedTotal) * 100 : 0 };
            }

            return {
                series, cumMort, cumCull, cumFeed, cumWater, liveCount, liveCountPct, mortRate,
                avgWeightG, avgWeightKg, avgWeightIsEstimated, lastWeighed, biomassKg, gainKg, fcr, age, todayAge, adg, epef, stdWeight,
                weightDiffPct, waterFeedRatio, density, lastEnv, mortCauseTotals, mortCauseClassifiedTotal, dominantCause, causeLabels
            };
        }

        // ============ توصية إجراء فورية مرتبطة تلقائيًا بالسبب المسيطر للنفوق — تربط التحليل بإجراء عملي محدد بدل رقم فقط ============
        const MORT_CAUSE_ACTION_HINTS = {
            heat: '🌬️ راجع بروتوكول التهوية فى تبويب "العمليات" الآن وتأكد من معدلات التهوية الدنيا للعمر الحالي',
            disease: '💉 راجع مواعيد التحصين/العلاج فى تبويب "البرامج والتنبيهات" وتأكد من عدم وجود مواعيد فائتة، وفكّر فى استشارة بيطرية',
            trample: '🐾 راجع كثافة الطيور والإضاءة الليلية — الدهس غالبًا مرتبط بازدحام أو فزع مفاجئ',
            deform: '🧬 راجع توازن العليقة (كالسيوم/فوسفور) وجفاف الفرشة — التشوهات غالبًا مرتبطة بالتغذية أو الفرشة الرطبة',
            other: '📋 صنّف حالات النفوق بدقة أكبر فى السجل اليومي لسبب أوضح ونصيحة أدق'
        };
        function mortCauseActionHint(key) { return MORT_CAUSE_ACTION_HINTS[key] || ''; }

        // معامل ارتباط بيرسون البسيط بين متغيرين — يُستخدم لرصد علاقة إحصائية (مثلاً بين الأمونيا والنفوق)
        function pearsonCorr(xs, ys) {
            const n = xs.length;
            if (n < 5) return null; // بيانات غير كافية لعلاقة موثوقة
            const mx = xs.reduce((a, c) => a + c, 0) / n, my = ys.reduce((a, c) => a + c, 0) / n;
            let sxy = 0, sxx = 0, syy = 0;
            for (let i = 0; i < n; i++) {
                const dx = xs[i] - mx, dy = ys[i] - my;
                sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
            }
            if (sxx === 0 || syy === 0) return null;
            return sxy / Math.sqrt(sxx * syy);
        }
        // ================================================================================
        // ============ حزمة الدقة الإحصائية (v3.72) — تُستخدم فى كل تحليلات computeInsights ============
        // ================================================================================
        function stdDev(arr) {
            const vals = (arr || []).filter(v => v != null && !isNaN(v));
            const n = vals.length;
            if (n < 2) return null;
            const mean = vals.reduce((s, v) => s + v, 0) / n;
            const variance = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1);
            return Math.sqrt(variance);
        }
        // ============ دلالة إحصائية تقريبية لمعامل ارتباط بيرسون (اختبار t لمعامل الارتباط) ============
        // r ثابت وn كبير مش كفاية عشان نطمن — بنحسب t = r*sqrt((n-2)/(1-r^2)) ونقارنه بحد تقريبي لـ p<0.05
        // (~2.0 للعينات المتوسطة/الكبيرة، ~2.3-2.6 للعينات الصغيرة جدًا اللي محتاجة حد أعلى تحفظًا)
        function pearsonSignificant(r, n) {
            if (r == null || n == null || n < 5) return false;
            const df = n - 2;
            if (df <= 0 || Math.abs(r) >= 0.999) return true;
            const tStat = Math.abs(r) * Math.sqrt(df / (1 - r * r));
            const critical = df <= 6 ? 2.6 : (df <= 12 ? 2.2 : 2.0); // تقريب متحفّظ لتوزيع t بدرجات حرية مختلفة
            return tStat >= critical;
        }
        // ============ اختبار Welch t التقريبي لفرق متوسطين (لمقارنات "قبل/بعد" أو "أثناء السريان/خارجه") ============
        // بيراعي إن التباين ممكن يختلف بين المجموعتين (بعكس t-test التقليدي بتباين واحد مفترض)
        function welchSignificant(sampleA, sampleB, numComparisons) {
            const a = (sampleA || []).filter(v => v != null && !isNaN(v));
            const c = (sampleB || []).filter(v => v != null && !isNaN(v));
            if (a.length < 3 || c.length < 3) return { significant: false, reason: 'عينة صغيرة جدًا (أقل من 3 نقاط)' };
            const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
            const variance = arr => { const m = mean(arr); return arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1); };
            const ma = mean(a), mc = mean(c), va = variance(a) || 0, vc = variance(c) || 0;
            const se = Math.sqrt((va / a.length) + (vc / c.length));
            if (se === 0) return { significant: false, reason: 'تباين صفري — بيانات متطابقة' };
            const tStat = Math.abs(ma - mc) / se;
            // درجات حرية Welch–Satterthwaite (تقريب) — كل ما قلّت كل ما احتجنا فرق أوضح عشان نثق فى النتيجة
            const df = Math.pow((va / a.length) + (vc / c.length), 2) /
                ((Math.pow(va / a.length, 2) / (a.length - 1)) + (Math.pow(vc / c.length, 2) / (c.length - 1)) || 1);
            let critical = df <= 6 ? 2.6 : (df <= 12 ? 2.2 : 2.0);
            // ============ 🔴 إصلاح Red Team (مدموج من فرع تطوير آخر): تصحيح بونفيروني تقريبي عند فحص عدة بنود مع ============
            // بعض (إضافات/معاملات/شحنات) — كل ما زاد عدد الاختبارات المتزامنة، زاد احتمال ظهور "دلالة" وهمية بالصدفة.
            const numTests = Math.max(1, numComparisons || 1);
            if (numTests > 1) critical += Math.min(Math.log2(numTests) * 0.3, 1.4);
            return { significant: tStat >= critical, tStat, df, meanA: ma, meanC: mc, critical, numComparisons: numTests };
        }
        // ============ فلترة القيم الشاذة (IQR) — بتحمي كل التحليلات من رقم إدخال غلط واحد بيقلب النتيجة ============
        function iqrBounds(values) {
            const vals = (values || []).filter(v => v != null && !isNaN(v)).slice().sort((a, c) => a - c);
            const n = vals.length;
            if (n < 5) return null;
            const q = p => { const idx = (n - 1) * p; const lo = Math.floor(idx), hi = Math.ceil(idx); return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo); };
            const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
            if (iqr === 0) return null;
            return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr, q1, q3 };
        }
        // ============ فلترة سلسلة سجلات {age, val, ...rest} من القيم الشاذة إحصائيًا قبل دخولها أي تحليل ============
        function filterOutlierRecords(records, valKey) {
            const vals = records.map(r => r[valKey]);
            const bounds = iqrBounds(vals);
            if (!bounds) return { clean: records, removed: [] };
            const clean = [], removed = [];
            records.forEach(r => {
                const v = r[valKey];
                if (v != null && (v < bounds.lower || v > bounds.upper)) removed.push(r); else clean.push(r);
            });
            return { clean, removed };
        }
        // ============ حدود تحكم ديناميكية خاصة بمزرعتك (مش نسبة ثابتة واحدة لكل المزارع) ============
        // بتحسب متوسط ± k انحراف معياري من تاريخ مزرعتك نفسها (أو من الدورة الحالية لو مفيش أرشيف كفاية)
        function dynamicControlLimits(values, k) {
            const vals = (values || []).filter(v => v != null && !isNaN(v));
            if (vals.length < 5) return null;
            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
            const sd = stdDev(vals);
            if (sd == null) return null;
            const kk = k || 2;
            return { mean, sd, upper: mean + kk * sd, lower: mean - kk * sd, n: vals.length };
        }
        // ============ انحدار خطي متعدد بسيط (معادلات عادية Normal Equations) — لفصل أثر متغيرات متشابكة زمنيًا ============
        // (حرارة/رطوبة/أمونيا بتترابط طبيعيًا مع بعضها، والارتباط الأحادي وحده ممكن يضخّم أثر متغير بسبب تزامنه بالتانى)
        function solveLinearSystem(A, bVec) {
            const n = A.length;
            const M = A.map((row, i) => [...row, bVec[i]]);
            for (let col = 0; col < n; col++) {
                let piv = col;
                for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
                if (Math.abs(M[piv][col]) < 1e-9) return null; // نظام شبه منفرد — متغيرات مترابطة بقوة جدًا (لا يمكن فصلها)
                [M[col], M[piv]] = [M[piv], M[col]];
                for (let r = 0; r < n; r++) {
                    if (r === col) continue;
                    const factor = M[r][col] / M[col][col];
                    for (let c2 = col; c2 <= n; c2++) M[r][c2] -= factor * M[col][c2];
                }
            }
            return M.map((row, i) => row[n] / row[i][i]);
        }
        function multiLinearRegression(predictorArrays, yArr) {
            // predictorArrays: [[x1...], [x2...], ...] كل مصفوفة نفس طول yArr
            const n = yArr.length;
            const p = predictorArrays.length;
            if (n < p + 4) return null; // محتاجين نقط أكتر من عدد المتغيرات بهامش أمان معقول
            const X = []; // صف لكل ملاحظة: [1, x1, x2, ...]
            for (let i = 0; i < n; i++) { const row = [1]; for (let j = 0; j < p; j++) row.push(predictorArrays[j][i]); X.push(row); }
            const cols = p + 1;
            const XtX = Array.from({length: cols}, () => Array(cols).fill(0));
            const Xty = Array(cols).fill(0);
            for (let i = 0; i < n; i++) {
                for (let a = 0; a < cols; a++) {
                    Xty[a] += X[i][a] * yArr[i];
                    for (let c2 = 0; c2 < cols; c2++) XtX[a][c2] += X[i][a] * X[i][c2];
                }
            }
            const coefs = solveLinearSystem(XtX, Xty);
            if (!coefs) return null;
            // R² لتقييم جودة النموذج ككل
            const yMean = yArr.reduce((s, v) => s + v, 0) / n;
            let ssTot = 0, ssRes = 0;
            for (let i = 0; i < n; i++) {
                const pred = coefs.reduce((s, c2, j) => s + c2 * (X[i][j] || 0), 0);
                ssRes += Math.pow(yArr[i] - pred, 2);
                ssTot += Math.pow(yArr[i] - yMean, 2);
            }
            const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : null;
            return { intercept: coefs[0], coefs: coefs.slice(1), r2, n };
        }

        // ============ مؤشر ثقة موحّد لكل نتيجة إحصائية معروضة، حسب عدد نقاط البيانات + الدلالة الإحصائية الفعلية ============
        // بيدّي القارئ إحساس فورى بمدى إمكانية الاعتماد على الرقم، بدل ما يفترض إن كل الأرقام بنفس القوة
        function corrConfidence(n, r) {
            if (n == null) return '';
            const sig = r != null ? pearsonSignificant(r, n) : null;
            if (sig === false) return `<span style="color:var(--muted);font-weight:700;">⚪ العدد لسه قليل (${n} قراءة) — ممكن يكون صدفة، استنى شوية</span>`;
            if (n >= 15) return `<span style="color:var(--green);font-weight:700;">🟢 بيانات كفاية (${n} قراءة)</span>`;
            if (n >= 8) return `<span style="color:var(--warning-text);font-weight:700;">🟡 بيانات متوسطة (${n} قراءة)</span>`;
            return `<span style="color:var(--muted);font-weight:700;">⚪ بداية بس (${n} قراءة)</span>`;
        }

        // ============ إخفاء تنبيهات "يحتاج انتباه الآن" بعد التعامل معاها — تفضل مخفية لحد بكرة، ولو المشكلة لسه موجودة تظهر تاني ============
        function isDismissedToday(b, key) {
            const entry = b.dismissedAlerts && b.dismissedAlerts[key];
            if (!entry) return false;
            if (typeof entry === 'string') return entry === todayStr(); // نظام dismissInsight القديم (تجاهل ليوم واحد فقط) — لسه شغال زي ما هو لأنواع التنبيهات التانية
            return true; // نظام dismissAlert الجديد (object) — يفضل متجاهل لحد ما يُرفع صراحة (تصعيد فى الخطورة، أو حل فعلي ثم عودة من جديد — شوف logAlertHistory)
        }
        function dismissInsight(key) {
            const b = getActiveBatch(); if (!b) return;
            if (!b.dismissedAlerts) b.dismissedAlerts = {};
            b.dismissedAlerts[key] = todayStr();
            persist(); render();
            showToast('اتأجلت لحد بكرة 🔕 — ولو المشكلة لسه موجودة هتظهر تاني');
        }
        // ============ لغة موحّدة للأزرار فى كل التنبيهات/التحليلات (توحيد بصري 2026): ============
        // فيه فرق واضح دلوقتي بين نوعين: "فعل حقيقي" (زرار دهبي بارز — بينفّذ حاجة فعلية وبيتسجّل)
        // مقابل "تأجيل" (زرار رمادي خافت 🔕 — بيخفي البطاقة لحد بكرة بس، مفيش أي ادّعاء إنها اتحلت).
        // ده بديل "✓ خلصت منها" اللي كانت بتوهم المستخدم إنه حل المشكلة رغم إنها بترجع تاني لو لسه موجودة.
        function insightActions(key, actionLabel, actionOnclick) {
            return `<div class="row-actions" style="margin-top:8px;gap:6px;">
                ${actionLabel ? `<button class="btn gold sm" style="flex:1;" onclick="${actionOnclick}">${actionLabel}</button>` : ''}
                <button class="btn ghost sm muted-snooze" style="flex:${actionLabel ? '0 0 auto' : '1'};" onclick="dismissInsight('${key}')" title="بيخفيها لحد بكرة بس — مش معناها إنها اتحلت">🔕 تأجيل</button>
            </div>`;
        }

        // ============ نظام كتم/تجاهل التنبيهات الرئيسية (computeAlerts) + سجلها التاريخي ============
        // كل تنبيه بيتحسب له "مفتاح" ثابت مبني على نص التنبيه بعد استبدال أي أرقام/نسب متغيرة بـ #،
        // عشان نفس المشكلة (مثلاً "صيانة المروحة1") تفضل نفس المفتاح يوم بعد يوم حتى لو الأرقام جوه النص اتغيرت،
        // وده يخلينا نقدر نكتمها لحد بكرة، ونتتبع تاريخها (من امتى ظاهرة ولحد امتى)، من غير ما نلمس الـ 50+ مكان اللي بيولّدوا التنبيهات.
        function alertKeyFromText(text) {
            return String(text || '')
                .replace(/[0-9٠-٩]+([.,][0-9٠-٩]+)?/g, '#')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 90);
        }
        function dismissAlert(key) {
            const b = getActiveBatch(); if (!b) return;
            if (!b.dismissedAlerts) b.dismissedAlerts = {};
            // ============ 🔴 إصلاح Red Team: تجاهل دائم (مش لحد بكرة بس) — بيتسجّل معاه مستوى الخطورة وقت الكتم ============
            // عشان لو المشكلة زادت خطورتها بعد كده (من warn لـdanger)، نقدر نكتشف التصعيد ده فى computeAlerts
            // ونشيل الكتم تلقائيًا — التصعيد الحقيقي يستاهل يلفت النظر تاني حتى لو المستخدم تجاهل النسخة الأخف.
            const hist = b.alertHistory && b.alertHistory[key];
            b.dismissedAlerts['alert_' + key] = { level: hist ? hist.level : null, ts: todayStr() };
            // ============ 🔴 إصلاح Red Team (مدموج): تتبّع تراكمي لعدد مرات كتم نفس التنبيه — أساس حلقة "إجهاد التنبيهات" ============
            // (يُستخدم فى computeUnifiedPriorities عشان تنبيه اتكتم كتير قبل كده ياخد أولوية أقل فى "أهم 3 أفعال")
            if (!b.alertDismissCount) b.alertDismissCount = {};
            b.alertDismissCount[key] = (b.alertDismissCount[key] || 0) + 1;
            persist(); render();
            showToast('اتجاهلت 🔕 — مش هتظهر تاني إلا لو اتحلت فعلاً وبعدين رجعت من جديد، أو زادت خطورتها');
        }
        function undismissAlert(key) {
            const b = getActiveBatch(); if (!b) return;
            if (b.dismissedAlerts) delete b.dismissedAlerts['alert_' + key];
            persist(); render();
        }
        // بيسجّل/يحدّث تاريخ كل تنبيه نشط اليوم، وبيعلّم اللي اختفى إنه "اتحل" — عملية idempotent يوميًا فمن الآمن تتكرر
        function logAlertHistory(b, alerts) {
            if (!b.alertHistory) b.alertHistory = {};
            const today = todayStr();
            const activeKeys = new Set();
            alerts.forEach(a => {
                activeKeys.add(a.key);
                const h = b.alertHistory[a.key];
                if (!h) {
                    b.alertHistory[a.key] = { text: a.text, level: a.level, firstSeen: today, lastSeen: today, daysActive: 1, resolved: false, resolvedDate: null };
                } else {
                    if (h.lastSeen !== today) h.daysActive = (h.daysActive || 1) + 1;
                    h.lastSeen = today; h.text = a.text; h.level = a.level; h.resolved = false; h.resolvedDate = null;
                }
            });
            Object.keys(b.alertHistory).forEach(k => {
                const h = b.alertHistory[k];
                if (!activeKeys.has(k) && !h.resolved) {
                    h.resolved = true; h.resolvedDate = today;
                    // ============ 🔴 إصلاح Red Team (مدموج): لما تنبيه يتحل فعليًا (مش بس يتكتم)، نخفّف نصف "إجهاده" التراكمي ============
                    // عشان لو رجع يظهر تاني بعد فترة طويلة كمشكلة جديدة فعلاً، ميفضلش مقموع بتاريخ كتم قديم غير ذي صلة.
                    if (b.alertDismissCount && b.alertDismissCount[k]) {
                        b.alertDismissCount[k] = Math.floor(b.alertDismissCount[k] / 2);
                        if (!b.alertDismissCount[k]) delete b.alertDismissCount[k];
                    }
                }
            });
        }
        // بيجمّع تنبيهات "معلوماتية" (info) المتشابهة (نفس الأيقونة الأولى) تحت عنصر واحد قابل للفتح لو 3 أو أكتر،
        // عشان البانر/تبويب التنبيهات ميتزنقش بتكرار (مثلاً 4-5 تنبيهات "إضافة علف/ماء سارية اليوم" مع بعض).
        // تنبيهات الخطر/التحذير بتفضل ظاهرة فرادى دايمًا، مهما كان عددها.
        function markPlanDone(key) {
            const b = getActiveBatch(); if (!b) return;
            if (!b.executedPlanItems) b.executedPlanItems = {};
            b.executedPlanItems[key] = true;
            persist(); render();
            showToast('تمام ✅ اتسجّلت كمنفذة');
        }
        // ============ الانتقال المباشر لمكان الحل من داخل تنبيه — بدل ما يكون "تأجيل" هو الخيار الوحيد ============
        function goToManagementSub(sub) {
            managementSubTab = sub;
            setTab('management');
        }
        function alertRowHtml(a) {
            // ============ ⚠️ إصلاح: زرار الفعل (لو التنبيه ليه حل مباشر معروف) وزرار التأجيل بيظهروا مع بعض ============
            // دايمًا، مش أحدهم بدل التاني — كان قبل كده لو فيه planKey يظهر "✓ نفّذتها" بس من غير تأجيل،
            // ولو مفيش أي حل معروف يظهر "🔕 تأجيل" بس من غير أي طريقة توصلك لمكان الحل.
            // ============ 🔴🟢 دمج: فعل دقيق مُسجَّل وقت إنشاء التنبيه (actionLabel/actionOnclick من 17-alerts-engine.js) ============
            // أولاً — ده أدق لأنه معروف بالظبط من مصدر التنبيه نفسه وقت إنشائه (مثلاً "✓ اتحصّن" بيكلّم
            // toggleVaccine بنفس معرّف التحصين ده بالظبط). لو مفيش actionLabel/actionOnclick صريح، بيرجع لمحرك
            // المطابقة النصية العام (resolveKatkotActionForText) كـ fallback. الأزرار الممكنة كلها بتظهر مع بعض
            // (✓ نفّذتها / الفعل الدقيق / 🔕 تجاهل) — مش حل بدل التاني — عشان أي مسار متاح يفضل واضح فورًا.
            const doneBtn = a.planKey ? `<button class="btn gold xs" style="flex-shrink:0;" onclick="markPlanDone('${a.planKey}')" title="نفّذتها">✓ نفّذتها</button>` : '';
            let actionBtn = '';
            if (a.actionLabel && a.actionOnclick) {
                actionBtn = `<button class="btn gold xs" style="flex-shrink:0;" onclick="${a.actionOnclick}" title="روح لمكان الحل">${a.actionLabel}</button>`;
            } else if (!a.planKey) {
                const resolvedAction = resolveKatkotActionForText(a.text);
                if (resolvedAction) {
                    const idx = registerKatkotAction(resolvedAction);
                    actionBtn = `<button class="btn gold xs" style="flex-shrink:0;" onclick="runKatkotAction(${idx})" title="ينفّذ الإجراء المناسب فورًا">${esc(resolvedAction.label || '⚡ نفّذ')}</button>`;
                }
            }
            // ============ 🔴 إصلاح Red Team: "تجاهل" بقى معناه فعلي (مش "تأجيل" لحد بكرة) — شوف dismissAlert/isDismissedToday ============
            // مش هيرجع يظهر تاني إلا لو المشكلة اتحلت فعلاً وبعدين رجعت من جديد، أو زادت خطورتها.
            const dismissBtn = `<button class="btn ghost xs muted-snooze" style="flex-shrink:0;" onclick="dismissAlert('${a.key}')" title="مش هتظهر تاني إلا لو اتحلت فعلاً وبعدين رجعت، أو زادت خطورتها">🔕 تجاهل</button>`;
            const actionBtnsHtml = `<div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">${doneBtn}${actionBtn}${dismissBtn}</div>`;
            // ============ 🔴 إصلاح Red Team (مدموج): شارة شفافية توضّح إن التنبيه أخذ أولوية أقل فى "أهم 3 أفعال" ============
            // لأنه اتكتم كتير قبل كده، بدل ما يبقى تصرّف مخفي فى الخوارزمية من غير ما تعرف السبب.
            const fatigueBadge = (a.level === 'warn' && a.dismissCount >= 3)
                ? `<span style="font-size:9.5px;color:var(--muted);flex-shrink:0;" title="كتمته ${a.dismissCount} مرة قبل كده — بياخد أولوية أقل فى أهم 3 أفعال">🔕×${a.dismissCount}</span>` : '';
            return `<div class="alert-item ${a.level}" style="display:flex;align-items:center;gap:6px;justify-content:space-between;">
                <span style="flex:1;">${esc(a.text)}</span>
                ${fatigueBadge}
                ${actionBtnsHtml}
            </div>`;
        }
        function renderAlertsList(alerts) {
            const visible = (alerts || []).filter(a => !a.dismissed);
            const dangerWarn = visible.filter(a => a.level === 'danger' || a.level === 'warn')
                .sort((a, c) => (a.level === 'danger' ? 0 : 1) - (c.level === 'danger' ? 0 : 1));
            const infos = visible.filter(a => a.level === 'info');
            const groups = {};
            infos.forEach(a => { const icon = (a.text.match(/^\S+/) || [''])[0]; (groups[icon] = groups[icon] || []).push(a); });
            let html = dangerWarn.map(alertRowHtml).join('');
            Object.values(groups).forEach(items => {
                if (items.length >= 3) {
                    html += `<details class="alert-group"><summary style="cursor:pointer;padding:8px 10px;font-size:12.5px;color:var(--muted);">${esc((items[0].text.match(/^\S+/)||[''])[0])} ${items.length} تنبيهات معلوماتية متشابهة — اضغط للعرض</summary>${items.map(alertRowHtml).join('')}</details>`;
                } else {
                    html += items.map(alertRowHtml).join('');
                }
            });
            if (!dangerWarn.length && !infos.length && !visible.length) { /* نكمل تحت لعرض حالة فاضية لو محدش اتكتم برضو */ }
            const dismissedToday = (alerts || []).filter(a => a.dismissed);
            if (!dangerWarn.length && !infos.length) {
                html = `<div class="empty"><div class="ico">✅</div>لا توجد تنبيهات حالية.</div>`;
            }
            if (dismissedToday.length) {
                html += `<details class="alert-group" style="margin-top:6px;"><summary style="cursor:pointer;padding:8px 10px;font-size:12px;color:var(--muted);">🔕 ${dismissedToday.length} تم كتمها اليوم — اضغط للعرض</summary>${dismissedToday.map(a => `<div class="alert-item ${a.level}" style="opacity:.6;display:flex;align-items:center;gap:6px;justify-content:space-between;"><span style="flex:1;">${esc(a.text)}</span><button class="btn ghost xs" style="flex-shrink:0;" onclick="undismissAlert('${a.key}')">↩️ إظهار</button></div>`).join('')}</details>`;
            }
            return html;
        }
        function showAlertHistoryModal() {
            const b = getActiveBatch(); if (!b) return;
            const hist = Object.values(b.alertHistory || {});
            const active = hist.filter(h => !h.resolved).sort((a, c) => c.daysActive - a.daysActive);
            const resolved = hist.filter(h => h.resolved).sort((a, c) => (c.resolvedDate||'').localeCompare(a.resolvedDate||'')).slice(0, 15);
            const lvlIcon = { danger: '🔴', warn: '🟠', info: 'ℹ️' };
            const row = h => `<div class="check-row"><div class="txt"><div style="font-weight:700;">${lvlIcon[h.level]||''} ${esc(h.text)}</div>
                <div class="day">${h.resolved ? `اتحل فى ${h.resolvedDate}` : `مستمر منذ ${h.firstSeen} — ${h.daysActive} يوم متكرر`}</div></div></div>`;
            const html = `
                <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">بيتتبع كل تنبيه ظهر إمتى أول مرة، وكام يوم فضل مستمر، وإمتى اتحل (اختفى الشرط اللي سببه).</div>
                <div style="font-weight:800;margin:6px 0;">⏳ نشطة حاليًا (${active.length})</div>
                ${active.length ? active.map(row).join('') : '<div class="empty" style="padding:10px;">لا توجد تنبيهات نشطة مسجّلة فى السجل.</div>'}
                <div style="font-weight:800;margin:14px 0 6px;">✅ اتحلت مؤخرًا (${resolved.length})</div>
                ${resolved.length ? resolved.map(row).join('') : '<div class="empty" style="padding:10px;">لا يوجد بعد.</div>'}`;
            openGenericModal('📜 السجل التاريخي للتنبيهات', html);
        }

        // ============ اتجاه مؤشر خلال آخر نقاط (تحسّن/تدهور)، مش مجرد قيمة اليوم — يفرّق بين "مرتفع ومستقر" و"مرتفع وبيزيد" ============
        function trendDirection(valuesOldToNew) {
            if (!valuesOldToNew || valuesOldToNew.length < 3) return null;
            const half = Math.max(1, Math.floor(valuesOldToNew.length / 2));
            const older = valuesOldToNew.slice(0, half), newer = valuesOldToNew.slice(-half);
            const avgOlder = older.reduce((a, c) => a + c, 0) / older.length;
            const avgNewer = newer.reduce((a, c) => a + c, 0) / newer.length;
            const diff = avgNewer - avgOlder;
            const rel = avgOlder !== 0 ? Math.abs(diff) / Math.abs(avgOlder) : (avgNewer !== 0 ? 1 : 0);
            if (rel < 0.1) return 'flat';
            return diff > 0 ? 'up' : 'down';
        }

        // ============ متوسط الالتزام بتشيك ليست العمليات + معدل إجراءات الأمان الحيوي طوال الدورة كاملة (وليس آخر 3 أيام فقط) ============
        // تُحسب من نفس checklistLog/biosecurityLog/records المحفوظة أصلاً، فتعمل رجعيًا حتى على الدورات المؤرشفة قبل هذا التحديث
        function computeFinalOpsCompliance(b) {
            const total = (b.checklistTemplate || []).length;
            let checklistAvgPct = null;
            const allDates = [...new Set((b.records || []).map(r => r.date))];
            if (total > 0 && allDates.length) {
                const rates = allDates.map(d => {
                    const doneSet = new Set((b.checklistLog || []).filter(l => l.date === d && l.done).map(l => l.taskId));
                    return (b.checklistTemplate.filter(t => doneSet.has(t.id)).length / total) * 100;
                });
                checklistAvgPct = rates.reduce((a, c) => a + c, 0) / rates.length;
            }
            const cycleLenDays = (b.records && b.records.length) ? Math.max(...b.records.map(r => r.age)) : 0;
            const bioActionsCount = (b.biosecurityLog || []).length;
            const bioActionsPerWeek = cycleLenDays > 0 ? bioActionsCount / (cycleLenDays / 7) : null;
            return { checklistAvgPct, bioActionsPerWeek, cycleLenDays };
        }

        // ============ مؤشر "كثافة التسجيل": نسبة الأيام المُسجَّلة فعليًا من إجمالي أيام الدورة حتى اليوم ============
        // تحليلات مبنية على تسجيل متقطع أقل موثوقية إحصائيًا — يستحق تحذير عام واضح للمستخدم
        function computeRecordingCompleteness(b, m) {
            const expectedDays = m.todayAge + 1;
            const actualDays = new Set((b.records || []).map(r => r.age)).size;
            const pct = expectedDays > 0 ? Math.min((actualDays / expectedDays) * 100, 100) : 100;
            return { pct, actualDays, expectedDays };
        }

        // ============ تحليلات ذكية: انحراف تراكمي / تنبؤ بالوزن / علاقة البيئة بالنفوق ============
        // ============ توقع EPEF نهائي متوقع (Live Projection) — "لو استمريت بنفس المعدل الحالي" مقابل أفضل دوراتك السابقة ============
        function computeEpefProjection(b, m) {
            if (m.todayAge < 7 || !m.fcr || m.avgWeightKg <= 0) return null;
            const targetAge = b.targetAge || 35;
            if (m.todayAge >= targetAge) return null;
            const remainingDays = targetAge - m.todayAge;
            const stdWNow = getRefValue(b, 'weight', m.todayAge) || m.avgWeightG;
            const stdWTarget = getRefValue(b, 'weight', targetAge) || m.avgWeightG;
            // ⚠️ إصلاح: m.avgWeightG هو حرفيًا آخر وزن مُدخَل من غير أي فلترة — وزن واحد مُدخَل غلط
            // (فاصلة عشرية، صفر زيادة) كان بيقلب نسبة الأداء وترتيبك المئوي مقابل كل دوراتك السابقة.
            // بنستخدم نفس فلترة القيم الشاذة المستخدمة فى weightPrediction: لو آخر وزن شاذ، نرجع لآخر
            // وزن نظيف قبله بدل ما نصدّق الرقم الشاذ على طول.
            const weightRobust = getRobustRecentWeights(m, 8, 5);
            const baseWeightG = weightRobust.outlierExcluded && weightRobust.recs.length
                ? weightRobust.recs[weightRobust.recs.length - 1].weight
                : m.avgWeightG;
            const weightRatio = stdWNow > 0 ? baseWeightG / stdWNow : 1;
            const projWeightKg = (stdWTarget * weightRatio) / 1000;
            // معدل نفوق يومي فعلي آخر 7 أيام (نفس منطق نصيحة البيع)
            // ⚠️ إصلاح: نفس منطق computeOptimalSaleDay — وسيط بدل متوسط، عشان يوم نفوق استثنائي واحد
            // ما يهيمنش على توقع الأيام المتبقية للدورة كلها.
            const recentMortRecs = m.series.filter(r => r.age > 0).slice(-7);
            const dailyMortRate = getRobustDailyMortRate(recentMortRecs, MAX_PROJECTED_DAILY_MORT_RATE);
            const projLiveCountPct = (m.liveCountPct / 100) * Math.pow(1 - dailyMortRate, remainingDays) * 100;
            const projFcr = m.fcr; // أفضل تقدير متاح لاستمرار نفس كفاءة التحويل الحالية
            const projEpef = (projFcr > 0 && targetAge > 0 && projWeightKg > 0)
                ? (projLiveCountPct * projWeightKg) / (projFcr * targetAge) * 100 : null;
            if (projEpef == null) return null;
            // أفضل EPEF فعلي محقق سابقًا لنفس النوع (من الدورات المؤرشفة) للمقارنة + نسبة مئوية مقارنة بكل تاريخك
            const archived = state.batches.filter(x => x.status === 'مؤرشفة' && x.species === b.species);
            let bestEpef = null;
            const archivedEpefVals = [];
            archived.forEach(x => { const xm = computeMetrics(x); if (xm.epef != null) { archivedEpefVals.push(xm.epef); if (bestEpef == null || xm.epef > bestEpef) bestEpef = xm.epef; } });
            const epefPercentile = archivedEpefVals.length >= 3 ? percentileBeats(projEpef, archivedEpefVals, true) : null;
            return { targetAge, remainingDays, projWeightKg, projLiveCountPct, projFcr, projEpef, bestEpef, epefPercentile, sampleSize: archivedEpefVals.length };
        }

        // ============ 1) نقطة بداية الانحراف المستدام عن المعياري (وزن) ============
        // ============ حدود ديناميكية خاصة بتذبذب هذه الدفعة نفسها (بدل -8%/-5% ثابتة لكل المزارع) ============
        // دفعة تذبذبها الطبيعي أعلى (تسجيل يدوي متذبذب مثلًا) تحتاج عتبة أوسع عشان متتنبهش غلط كل شوية،
        // ودفعة مستقرة جدًا ممكن تستفيد من عتبة أضيق تمسك انحراف حقيقي أبكر. نستخدم limits.mean - k*sd،
        // مع حد أدنى واقعي (متتجاوزش -4% للبداية و-2.5% للاستمرار) عشان الحدود متبقاش فضفاضة أوي مع دفعة مثالية التذبذب.
        function computeDeviationOnset(devPoints) {
            if (!devPoints || devPoints.length < 4) return null;
            let onsetThresh = -8, persistThresh = -5;
            if (devPoints.length >= 10) {
                const limits = dynamicControlLimits(devPoints.map(p => p.dev), 1.5);
                if (limits) {
                    onsetThresh = Math.min(limits.mean - 1.5 * limits.sd, -4);
                    persistThresh = Math.min(limits.mean - 1 * limits.sd, -2.5);
                }
            }
            for (let i = 0; i < devPoints.length; i++) {
                if (devPoints[i].dev <= onsetThresh) {
                    const rest = devPoints.slice(i);
                    const persistentCount = rest.filter(p => p.dev <= persistThresh).length;
                    if (persistentCount >= Math.min(3, rest.length) && persistentCount / rest.length >= 0.7) return devPoints[i];
                }
            }
            return null;
        }
        // ============ 2) تكلفة النفوق بالجنيه (قيمة اللحم المتوقعة المفقودة) ============
        function computeMortalityCost(b, m, fin) {
            const deadCount = (m.cumMort || 0) + (m.cumCull || 0);
            if (deadCount <= 0) return null;
            // الوزن المستهدف عند البيع أدق من وزن اليوم الحالي لتقدير القيمة الضائعة (خصوصًا مبكرًا فى الدورة)
            const targetAge = b.targetAge || 35;
            const stdWTarget = getRefValue(b, 'weight', targetAge);
            const targetWKg = (b.targetWeight || stdWTarget || m.avgWeightG || 0) / 1000;
            const salePrice = fin && fin.avgSalePrice > 0 ? fin.avgSalePrice : null;
            if (!salePrice || targetWKg <= 0) return null;
            return { deadCount, lostValue: deadCount * targetWKg * salePrice };
        }
        // ============ 3) مؤشر "كفاءة اليوم" المركّب (0-100) ============
        function computeDailyEfficiencyScore(b, m) {
            const last = m.series[m.series.length - 1];
            if (!last || last.age <= 0) return null;
            let score = 100;
            // النمو مقابل المعياري
            if (last.stdW > 0) {
                const dev = ((last.effWeight - last.stdW) / last.stdW) * 100;
                score -= Math.min(Math.max(-dev, 0) * 1.5, 35);
            }
            // النفوق: متوسط متحرك لآخر 3 أيام (بدل يوم واحد) لتفادي مبالغة النسبة % بسبب طائر أو اثنين فى قطيع متبقٍّ صغير قرب نهاية الدورة
            const mortWindow = m.series.filter(r => r.age > 0).slice(-3);
            if (mortWindow.length && mortWindow[mortWindow.length - 1].liveCount >= 20) {
                const totalMort = mortWindow.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0);
                const avgLive = mortWindow.reduce((s, r) => s + r.liveCount, 0) / mortWindow.length;
                const dailyMortPct = avgLive > 0 ? (totalMort / mortWindow.length) / avgLive * 100 : 0;
                score -= Math.min(dailyMortPct * 15, 30);
            }
            // العلف: استهلاك أعلى من المعياري بشكل كبير (هدر) أو أقل بشكل كبير (نقص شهية)
            const stdFeedPerBird = getRefsForDay(b, last.age).feed || 0;
            if (stdFeedPerBird > 0 && last.feed != null && last.liveCount > 0) {
                const actualPerBirdG = (last.feed * 1000) / last.liveCount;
                const feedDevPct = ((actualPerBirdG - stdFeedPerBird) / stdFeedPerBird) * 100;
                score -= Math.min(Math.abs(feedDevPct) * 0.4, 20);
            }
            // البيئة: رطوبة/أمونيا خارج النطاق الآمن
            if (last.humidity != null && (last.humidity > 75 || last.humidity < 40)) score -= 8;
            if (last.nh3 != null && last.nh3 > 20) score -= 7;
            return Math.max(0, Math.min(100, Math.round(score)));
        }
        // ============ 4) تحليل موسمي عبر الدورات (FCR/نفوق حسب شهر بداية الدورة) ============
        function getSeasonOf(month) {
            if ([12, 1, 2].includes(month)) return 'شتاء ❄️';
            if ([3, 4, 5].includes(month)) return 'ربيع 🌸';
            if ([6, 7, 8].includes(month)) return 'صيف ☀️';
            return 'خريف 🍂';
        }
        function computeSeasonalAnalysis(species) {
            const archived = state.batches.filter(x => x.status === 'مؤرشفة' && x.species === species && x.startDate);
            if (archived.length < 3) return null;
            const bySeason = {};
            archived.forEach(x => {
                const month = new Date(x.startDate).getMonth() + 1;
                const season = getSeasonOf(month);
                const xm = computeMetrics(x);
                if (!bySeason[season]) bySeason[season] = [];
                bySeason[season].push({ fcr: xm.fcr, mortRate: xm.mortRate });
            });
            const rows = Object.entries(bySeason).map(([season, list]) => {
                const fcrVals = list.map(x => x.fcr).filter(x => x != null);
                const mortVals = list.map(x => x.mortRate).filter(x => x != null);
                return { season, count: list.length, lowConfidence: list.length < 2,
                    avgFcr: fcrVals.length ? fcrVals.reduce((a,c)=>a+c,0)/fcrVals.length : null,
                    avgMort: mortVals.length ? mortVals.reduce((a,c)=>a+c,0)/mortVals.length : null };
            });
            return rows.length >= 2 ? rows : null;
        }
        // ============ 5) تحليل أثر الإضافات الفعلي (قبل/بعد التنفيذ بأيام) ============
        // (أُزيل computeAdditiveImpact — شوف الشرح فوق فى renderDashboard عند addImpactHtml. البيانات الخام
        //  (additiveExecLog) لسه موجودة ومُستخدمة فى أماكن تانية (سجل التنفيذ، سريان فعلي)، بس دالة التحليل
        //  الإحصائي الساذجة دي بس اللي اتشالت.)
        // ============ 6) جدول مخاطر تراكمي للقاحات القادمة (7 أيام) ============
        function computeUpcomingVaccines7d(b, m) {
            return (b.vaccineLog || []).filter(v => !v.done && v.day >= m.todayAge && v.day <= m.todayAge + 7)
                .sort((a, c) => a.day - c.day)
                .map(v => ({ ...v, daysAway: v.day - m.todayAge, importance: v.day - m.todayAge <= 1 ? 'عاجل' : (v.day - m.todayAge <= 3 ? 'قريب' : 'مجدول') }));
        }
        // ============ 7) مقارنة يومية بين العنابر النشطة عند نفس العمر تقريبًا ============
        function computeActiveHousesComparison(b) {
            const active = state.batches.filter(x => x.status !== 'مؤرشفة');
            if (active.length < 2) return null;
            return active.map(x => {
                const xm = computeMetrics(x);
                const stdW = getRefValue(x, 'weight', xm.todayAge) || 0;
                const devPct = stdW > 0 ? ((xm.avgWeightG - stdW) / stdW) * 100 : null;
                return { id: x.id, name: x.name, location: x.location, age: xm.todayAge, mortRate: xm.mortRate, devPct, isActive: x.id === state.activeId };
            }).sort((a, c) => (c.devPct || -999) - (a.devPct || -999));
        }
        // ============ 8) مؤشر ثقة البيانات (فجوات تسجيل حديثة تحديدًا فى الوزن/العلف) ============
        function computeDataConfidence(b, m) {
            const lastNDays = 4;
            const recentAges = Array.from({length: lastNDays}, (_, i) => m.todayAge - i).filter(a => a >= 1);
            const missingWeight = recentAges.filter(age => { const r = b.records.find(x => x.age === age); return !r || r.weight == null; });
            const missingFeed = recentAges.filter(age => { const r = b.records.find(x => x.age === age); return !r || r.feed == null; });
            if (!missingWeight.length && !missingFeed.length) return null;
            return { missingWeight: missingWeight.length, missingFeed: missingFeed.length, ofDays: recentAges.length };
        }
        // (تمت إزالة computeCoolingROI مع إزالة نظام ساعات تشغيل المعدات والصيانة — كان معتمدًا على eq.totalHours المُسجَّلة يدويًا)

        // ============ 10) تنبؤ مبكر بخطر الأمراض التنفسية (رطوبة/أمونيا + الموسم + عمر القطيع) ============
        function computeRespiratoryRisk(b, m) {
            if (m.todayAge < 14) return null; // الخطر التنفسي عادة يبدأ يظهر بعد منتصف الدورة تقريبًا
            const recent = m.series.filter(r => r.age > 0).slice(-5);
            const humidVals = recent.map(r => r.humidity).filter(v => v != null);
            const nh3Vals = recent.map(r => r.nh3).filter(v => v != null);
            if (!humidVals.length && !nh3Vals.length) return null;
            const avgHumid = humidVals.length ? humidVals.reduce((a,c)=>a+c,0)/humidVals.length : null;
            const avgNh3 = nh3Vals.length ? nh3Vals.reduce((a,c)=>a+c,0)/nh3Vals.length : null;
            const month = new Date().getMonth() + 1;
            const season = getSeasonOf(month);
            const seasonRisk = season.includes('شتاء') || season.includes('خريف'); // تهوية أقل بسبب البرد = تراكم أمونيا/رطوبة
            let riskScore = 0;
            if (avgHumid != null && avgHumid >= 70) riskScore += 2;
            if (avgNh3 != null && avgNh3 >= 15) riskScore += 2;
            if (seasonRisk) riskScore += 1;
            if (riskScore < 2) return null;
            return { riskScore, avgHumid, avgNh3, season, level: riskScore >= 4 ? 'high' : 'medium' };
        }

        // ============ 11) تسجيل لقطة يومية من التوقعات (وزن/FCR عند عمر الهدف) — أساس تتبّع دقة التوقعات لاحقًا ============
        // بتتسجل مرة واحدة فقط لكل عمر (idempotent)، ومن يوم 18 فصاعدًا بس عشان التوقع يكون له معنى إحصائي
        function logPredictionSnapshot(b) {
            try {
                const m = computeMetrics(b);
                if (m.todayAge < 18) return;
                const ins = computeInsights(b, m);
                if (!ins || !ins.weightPrediction) return;
                if (!b.predictionSnapshots) b.predictionSnapshots = [];
                b.predictionSnapshots = b.predictionSnapshots.filter(s => s.loggedAge !== m.todayAge);
                b.predictionSnapshots.push({
                    loggedAge: m.todayAge, loggedDate: todayStr(),
                    targetAge: ins.weightPrediction.targetAge,
                    predictedWeightG: ins.weightPrediction.predictedG,
                    predictedFcr: ins.fcrPrediction ? ins.fcrPrediction.predictedFcr : null
                });
                if (b.predictionSnapshots.length > 60) b.predictionSnapshots = b.predictionSnapshots.slice(-60);
            } catch (e) { /* أي فشل مؤقت هنا ما يأثرش على حفظ السجل الأساسي — تتبع الدقة ميزة إضافية مش أساسية */ }
        }
        // ============ 12) دقة التوقعات الفعلية لدفعة مؤرشفة — مقارنة كل لقطة سابقة بما حصل فعليًا عند نهاية الدورة ============
        function computePredictionAccuracyForBatch(b) {
            if (!b.predictionSnapshots || !b.predictionSnapshots.length) return null;
            const finalM = computeMetrics(b);
            const finalAge = finalM.todayAge, finalWeightG = finalM.avgWeightG, finalFcr = finalM.fcr;
            if (!finalWeightG || finalWeightG <= 0) return null;
            const rows = b.predictionSnapshots.map(s => {
                if (Math.abs(s.targetAge - finalAge) > 2) return null; // نقارن بس اللقطات اللي عمر هدفها قريب من عمر نهاية الدورة الفعلي
                const weightErrPct = ((s.predictedWeightG - finalWeightG) / finalWeightG) * 100;
                const fcrErrPct = (s.predictedFcr != null && finalFcr) ? ((s.predictedFcr - finalFcr) / finalFcr) * 100 : null;
                return { loggedAge: s.loggedAge, targetAge: s.targetAge, weightErrPct, fcrErrPct };
            }).filter(Boolean);
            if (!rows.length) return null;
            const avgAbsWeightErr = rows.reduce((s, r) => s + Math.abs(r.weightErrPct), 0) / rows.length;
            const fcrRows = rows.filter(r => r.fcrErrPct != null);
            const avgAbsFcrErr = fcrRows.length ? fcrRows.reduce((s, r) => s + Math.abs(r.fcrErrPct), 0) / fcrRows.length : null;
            return { rows, avgAbsWeightErr, avgAbsFcrErr, finalWeightG, finalFcr };
        }
        // ============ 13) سجل تراكمي لدقة التوقعات عبر كل الدورات المؤرشفة لنفس النوع — "سيرة ذاتية" لثقة التطبيق فى مزرعتك ============
        function computePredictionTrackRecord(species) {
            const archived = state.batches.filter(x => x.species === species && x.status === 'مؤرشفة' && x.predictionAccuracyReport);
            if (archived.length < 2) return null;
            const allWErrs = [], allFErrs = [];
            archived.forEach(x => {
                (x.predictionAccuracyReport.rows || []).forEach(r => {
                    allWErrs.push(Math.abs(r.weightErrPct));
                    if (r.fcrErrPct != null) allFErrs.push(Math.abs(r.fcrErrPct));
                });
            });
            if (!allWErrs.length) return null;
            return {
                cycles: archived.length,
                avgWeightErrPct: allWErrs.reduce((a, c) => a + c, 0) / allWErrs.length,
                avgFcrErrPct: allFErrs.length ? allFErrs.reduce((a, c) => a + c, 0) / allFErrs.length : null,
                n: allWErrs.length
            };
        }

        function computeInsights(b, m) {
            const series = m.series.filter(r => r.age > 0);
            // --- 1) الانحراف التراكمي عن المعيار (متوسط الانحراف % طوال الدورة + اتجاهه فى آخر الأيام) ---
            const devPoints = series.filter(r => r.stdW > 0).map(r => ({ age: r.age, dev: ((r.effWeight - r.stdW) / r.stdW) * 100 }));
            let devAvg = null, devTrend = null;
            if (devPoints.length >= 3) {
                devAvg = devPoints.reduce((s, p) => s + p.dev, 0) / devPoints.length;
                const half = Math.max(1, Math.floor(devPoints.length / 3));
                const recent = devPoints.slice(-half), earlier = devPoints.slice(0, half);
                const recentAvg = recent.reduce((s, p) => s + p.dev, 0) / recent.length;
                const earlierAvg = earlier.reduce((s, p) => s + p.dev, 0) / earlier.length;
                devTrend = recentAvg - earlierAvg; // موجب = الأداء بيتحسن، سالب = بيتراجع
            }

            // --- 2) تنبؤ بالوزن عند عمر البيع المستهدف (أو يوم السوق المعتاد لو مفيش هدف محدد) ---
            // المنطق: معدل نمو الفراخ ليس ثابتًا بل يتسارع مع التقدم فى العمر (منحنى نمو السلالة نفسه متسارع).
            // لذلك بدل تثبيت معدل النمو الفعلي الأخير (جم/يوم) وتوقيعه بالمستقيم على باقي الدورة،
            // نحسب "نسبة الأداء": الفارق الفعلي ÷ فارق السلالة المعياري خلال نفس الفترة الأخيرة،
            // ثم نطبّق نفس النسبة على فارق السلالة المعياري المتوقع (المتسارع طبيعيًا) بين اليوم وعمر الهدف.
            let weightPrediction = null;
            // ============ فلترة القيم الشاذة قبل الاعتماد عليها كنقاط ارتكاز للتنبؤ (خطأ ميزان واحد ما يقلبش التوقع كله) ============
            const weighedRaw = series.filter(r => r.weight != null);
            const wOut = filterOutlierRecords(weighedRaw, 'weight');
            const weighed = wOut.clean.length >= 2 ? wOut.clean : weighedRaw; // لو الفلترة سابت أقل من نقطتين، نرجع للأصلي كاحتياط
            const weightOutlierAges = new Set(wOut.removed.map(r => r.age));
            if (weighed.length >= 2) {
                const p0 = weighed[Math.max(0, weighed.length - 3)], p1 = weighed[weighed.length - 1];
                const days = p1.age - p0.age;
                if (days > 0) {
                    const recentDailyGain = (p1.weight - p0.weight) / days; // معدل النمو الفعلي الأخير جم/يوم (للعرض فقط)
                    const targetAge = b.targetAge || Math.max(p1.age + 7, 35);
                    if (targetAge > p1.age) {
                        const stdP0 = getRefValue(b, 'weight', p0.age) || 0;
                        const stdP1 = getRefValue(b, 'weight', p1.age) || 0;
                        const stdTarget = getRefValue(b, 'weight', targetAge) || 0;
                        let predictedG, perfRatio = null, perfRatioShort = null, perfRatioLong = null;
                        const stdGainRecent = stdP1 - stdP0;
                        if (stdP0 > 0 && stdGainRecent > 0 && stdTarget > stdP1) {
                            const actualGainRecent = p1.weight - p0.weight;
                            perfRatioShort = actualGainRecent / stdGainRecent; // نسبة أداء قصيرة المدى (آخر فترة بس، 1.0 = بينمو بمعدل السلالة)
                            // ============ (تحسين) نسبة أداء طويلة المدى: من أول وزن فعلي مسجَّل فى الدورة لحد آخر وزن، عشان التوقع ميبنيش بالكامل على فترة عابرة (مرض/علاج) قد تكون غير ممثِّلة للدورة كلها ============
                            const dayStart = weighed[0];
                            const stdStart = getRefValue(b, 'weight', dayStart.age) || 0;
                            const stdGainWhole = stdP1 - stdStart;
                            if (stdStart > 0 && stdGainWhole > 0.5 && p1.age > dayStart.age) {
                                perfRatioLong = (p1.weight - dayStart.weight) / stdGainWhole;
                            }
                            // مزج: وزن أكبر للمدى القصير (أحدث وأكثر تمثيلًا للحالة الآن) مع الاحتفاظ بجزء من المدى الطويل لتخفيف التذبذب المفرط من فترة عابرة واحدة
                            const WEIGHT_PRED_SHORT_TERM_WEIGHT = 0.65;
                            perfRatio = perfRatioLong != null
                                ? (WEIGHT_PRED_SHORT_TERM_WEIGHT * perfRatioShort + (1 - WEIGHT_PRED_SHORT_TERM_WEIGHT) * perfRatioLong)
                                : perfRatioShort;
                            const stdGainFuture = stdTarget - stdP1; // فارق نمو السلالة المتوقع بالفترة القادمة (متسارع طبيعيًا)
                            predictedG = p1.weight + perfRatio * stdGainFuture;
                        } else {
                            // احتياطي: لا يوجد منحنى مرجعي كافٍ لهذا العمر — نستخدم معدل النمو الفعلي الأخير ثابتًا
                            predictedG = p1.weight + recentDailyGain * (targetAge - p1.age);
                        }
                        const stdAtTarget = stdTarget || 0;
                        // ============ نطاق ثقة حول التوقع: نحسب تذبذب "نسبة الأداء" عبر عدة فترات ماضية من نفس الدورة ============
                        // (مش بس آخر فترة واحدة) — كل ما كانت نسبة الأداء متذبذبة أكتر، كل ما كان مدى عدم اليقين أوسع فعليًا
                        let predictedGLow = null, predictedGHigh = null, perfRatioStd = null, perfRatioSamples = 0;
                        if (perfRatio != null && weighed.length >= 4) {
                            const ratios = [];
                            for (let i = 1; i < weighed.length; i++) {
                                const a = weighed[i - 1], c = weighed[i];
                                const dAge = c.age - a.age;
                                if (dAge <= 0) continue;
                                const sA = getRefValue(b, 'weight', a.age) || 0, sC = getRefValue(b, 'weight', c.age) || 0;
                                const sGain = sC - sA;
                                if (sA > 0 && sGain > 0.5) ratios.push((c.weight - a.weight) / sGain);
                            }
                            perfRatioSamples = ratios.length;
                            if (ratios.length >= 3) {
                                perfRatioStd = stdDev(ratios);
                                if (perfRatioStd != null) {
                                    const stdGainFuture = stdTarget - stdP1;
                                    predictedGLow = p1.weight + Math.max(perfRatio - perfRatioStd, 0.5) * stdGainFuture;
                                    predictedGHigh = p1.weight + (perfRatio + perfRatioStd) * stdGainFuture;
                                }
                            }
                        }
                        weightPrediction = { targetAge, predictedG, stdAtTarget, recentDailyGain, perfRatio,
                            perfRatioShort, perfRatioLong,
                            predictedGLow, predictedGHigh, perfRatioStd, perfRatioSamples,
                            outlierWeightDaysExcluded: weightOutlierAges.size,
                            diffPct: stdAtTarget > 0 ? ((predictedG - stdAtTarget) / stdAtTarget) * 100 : null };
                    }
                }
            }

            // --- 2ب) توقّع FCR النهائي عند عمر الهدف — من يوم 20-25 فصاعدًا، بدل انتظار نهاية الدورة لمعرفة النتيجة ---
            // نفس فلسفة توقع الوزن: نحسب "نسبة أداء" استهلاك العلف الفعلي (آخر 5 أيام) مقابل منحنى السلالة اليومي،
            // ثم نُسقطها على استهلاك السلالة المتوقع للأيام الباقية (بدل تثبيت رقم يومي واحد)، مع نفس منطق إسقاط النفوق
            // المستخدم فى "قرار البيع الأمثل" — عشان يوصلك FCR متوقع واقعي، مش تفاؤل زائد من أول الدورة.
            let fcrPrediction = null;
            if (weightPrediction && weightPrediction.predictedG > 0) {
                const recentFeedRecsRaw = series.filter(r => r.age > 0 && r.feed != null && r.liveCount > 0 && r.feedDay != null && r.feedNight != null).slice(-5);
                // ============ فلترة أيام العلف الشاذة (خطأ إدخال كمية علف) قبل حساب نسبة أداء الاستهلاك ============
                const feedPerBirdTmp = recentFeedRecsRaw.map(r => ({ ...r, _perBird: (r.feed * 1000) / r.liveCount }));
                const feedOut = filterOutlierRecords(feedPerBirdTmp, '_perBird');
                const recentFeedRecs = feedOut.clean.length >= 2 ? feedOut.clean : recentFeedRecsRaw;
                let feedPerfRatio = null;
                if (recentFeedRecs.length >= 2) {
                    let actualSum = 0, stdSum = 0;
                    recentFeedRecs.forEach(r => {
                        const stdPerBirdG = getRefsForDay(b, r.age).feed;
                        actualSum += (r.feed * 1000);
                        stdSum += (stdPerBirdG * r.liveCount);
                    });
                    if (stdSum > 0) feedPerfRatio = actualSum / stdSum;
                }
                // ============ (تحسين) نسبة أداء استهلاك علف طويلة المدى: كل أيام الدورة اللي فيها علف مُسجَّل، مش آخر 5 أيام بس ============
                // نفس فكرة توقع الوزن: فترة قصيرة واحدة (زي فترة مرض/علاج عابرة) ممكن تشوّه توقّع الـFCR كله لو اعتمدنا عليها لوحدها
                let feedPerfRatioShort = feedPerfRatio, feedPerfRatioLong = null;
                {
                    const allFeedRecsRaw = series.filter(r => r.age > 0 && r.feed != null && r.liveCount > 0 && r.feedDay != null && r.feedNight != null);
                    if (allFeedRecsRaw.length >= 2) {
                        let actualSumAll = 0, stdSumAll = 0;
                        allFeedRecsRaw.forEach(r => {
                            const stdPerBirdG = getRefsForDay(b, r.age).feed;
                            actualSumAll += (r.feed * 1000);
                            stdSumAll += (stdPerBirdG * r.liveCount);
                        });
                        if (stdSumAll > 0) feedPerfRatioLong = actualSumAll / stdSumAll;
                    }
                }
                if (feedPerfRatioShort != null && feedPerfRatioLong != null) {
                    const FEED_PRED_SHORT_TERM_WEIGHT = 0.65; // وزن أكبر للمدى القصير (أحدث) مع الاحتفاظ بجزء من المدى الطويل لتخفيف التذبذب المفرط
                    feedPerfRatio = FEED_PRED_SHORT_TERM_WEIGHT * feedPerfRatioShort + (1 - FEED_PRED_SHORT_TERM_WEIGHT) * feedPerfRatioLong;
                }
                if (feedPerfRatio != null) {
                    const targetAge = weightPrediction.targetAge;
                    const recentMortRecs = series.filter(r => r.age > 0).slice(-7);
                    let dailyMortRate = 0;
                    if (recentMortRecs.length) {
                        const totalMortR = recentMortRecs.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0);
                        const avgLive = recentMortRecs.reduce((s, r) => s + r.liveCount, 0) / recentMortRecs.length;
                        if (avgLive > 0) dailyMortRate = Math.min((totalMortR / recentMortRecs.length) / avgLive, MAX_PROJECTED_DAILY_MORT_RATE);
                    }
                    // ============ دالة إسقاط قابلة لإعادة الاستخدام: تحسب FCR المتوقع لأي نسبة أداء علف مُعطاة ============
                    // (بنستخدمها 3 مرات: النسبة الأساسية، وحدّى نطاق الثقة الأدنى/الأعلى)
                    const projectFcrFor = (fRatio) => {
                        let liveProj = m.liveCount, projFeedKgTotal = m.cumFeed;
                        for (let day = m.age + 1; day <= targetAge; day++) {
                            liveProj = Math.max(liveProj * (1 - dailyMortRate), 0);
                            const stdDailyFeedPerBird = getRefsForDay(b, day).feed;
                            projFeedKgTotal += (stdDailyFeedPerBird / 1000) * fRatio * liveProj;
                        }
                        const startWeightKgLocal = (b.startweight || 42) / 1000;
                        const predictedBiomassKg = (liveProj * weightPrediction.predictedG) / 1000;
                        const initialBiomassKg = liveProj * startWeightKgLocal;
                        const gainKg = Math.max(predictedBiomassKg - initialBiomassKg, 0);
                        return gainKg > 0 ? projFeedKgTotal / gainKg : null;
                    };
                    const predictedFcr = projectFcrFor(feedPerfRatio);
                    const stdFeedAtTargetG = getRefValue(b, 'feed', targetAge) || 0;
                    const stdGainAtTargetG = weightPrediction.stdAtTarget > 0 ? weightPrediction.stdAtTarget - (b.startweight || 42) : 0;
                    const stdFcrAtTarget = (stdFeedAtTargetG > 0 && stdGainAtTargetG > 0) ? stdFeedAtTargetG / stdGainAtTargetG : null;
                    // ============ نطاق ثقة حول توقع الـFCR — من تذبذب نسبة أداء استهلاك العلف عبر أيام سجل أوسع (آخر 10) ============
                    let predictedFcrLow = null, predictedFcrHigh = null, feedPerfRatioStd = null;
                    const widerFeedRecs = series.filter(r => r.age > 0 && r.feed != null && r.liveCount > 0).slice(-10);
                    if (widerFeedRecs.length >= 5) {
                        const dailyRatios = widerFeedRecs.map(r => {
                            const stdPerBirdG = getRefsForDay(b, r.age).feed;
                            const actualPerBirdG = (r.feed * 1000) / r.liveCount;
                            return stdPerBirdG > 0 ? actualPerBirdG / stdPerBirdG : null;
                        }).filter(v => v != null);
                        feedPerfRatioStd = stdDev(dailyRatios);
                        if (feedPerfRatioStd != null && predictedFcr != null) {
                            const fcrA = projectFcrFor(Math.max(feedPerfRatio - feedPerfRatioStd, 0.3));
                            const fcrB = projectFcrFor(feedPerfRatio + feedPerfRatioStd);
                            if (fcrA != null && fcrB != null) { predictedFcrLow = Math.min(fcrA, fcrB); predictedFcrHigh = Math.max(fcrA, fcrB); }
                        }
                    }
                    if (predictedFcr != null) {
                        fcrPrediction = { targetAge, predictedFcr, stdFcrAtTarget, feedPerfRatio,
                            feedPerfRatioShort, feedPerfRatioLong,
                            predictedFcrLow, predictedFcrHigh, feedPerfRatioStd,
                            diffPct: stdFcrAtTarget ? ((predictedFcr - stdFcrAtTarget) / stdFcrAtTarget) * 100 : null };
                    }
                }
            }

            // --- 3) مؤشر إجهاد بيئي مُركّب (حرارة + رطوبة + أمونيا مع بعض) بدل 3 علاقات منفصلة ---
            // كل الثلاثة بيكوّنوا "إجهاد" واحد على الطائر، مش عوامل مستقلة: الرطوبة العالية بتزود أثر الحرارة، والأمونيا
            // العالية بتضعف الجهاز التنفسي وتزود حساسية الطائر للإجهاد الحراري. بنحسب انحراف كل قيمة عن معيار السلالة
            // لنفس العمر (مش رقم مطلق) عشان يكون المؤشر عادل عبر كل أعمار الدورة.
            const stressSeries = []; // [{age, stress, mort, parts}]
            const nh3Pairs = [], humidityPairs = [], tempPairs = [], feedPairs = [];
            series.forEach(r => {
                const dailyMort = (r.mort || 0) + (r.cull || 0);
                const nh3Avg = avgOf(r.nh3Day, r.nh3Night);
                const humidityAvg = avgOf(r.humidityDay, r.humidityNight);
                const tempAvg = avgOf(r.tempDay, r.tempNight);
                if (nh3Avg != null) nh3Pairs.push([nh3Avg, dailyMort]);
                if (humidityAvg != null) humidityPairs.push([humidityAvg, dailyMort]);
                if (tempAvg != null) tempPairs.push([tempAvg, dailyMort]);
                // العلف/طائر حي (جم/يوم) بدل الرقم الإجمالي — عشان يكون قابل للمقارنة عبر أعمار مختلفة بدون انحياز لزيادة القطيع
                let feedPerBird = null;
                if (r.feed != null && r.liveCount > 0) {
                    feedPerBird = (r.feed * 1000) / r.liveCount;
                    feedPairs.push([feedPerBird, dailyMort]);
                }
                const envRes = computeEnvStressForRecord(b, r, tempAvg, humidityAvg, nh3Avg);
                if (envRes) stressSeries.push({ age: r.age, stress: envRes.stress, mort: dailyMort, parts: envRes.parts, feedPerBird, feedRef: (getRefsForDay(b, r.age).feed) });
            });
            const nh3Corr = nh3Pairs.length >= 5 ? pearsonCorr(nh3Pairs.map(p => p[0]), nh3Pairs.map(p => p[1])) : null;
            const humidityCorr = humidityPairs.length >= 5 ? pearsonCorr(humidityPairs.map(p => p[0]), humidityPairs.map(p => p[1])) : null;
            const tempCorr = tempPairs.length >= 5 ? pearsonCorr(tempPairs.map(p => p[0]), tempPairs.map(p => p[1])) : null;
            // --- 3أ) انحدار متعدد يفصل أثر كل عامل بيئي عن التانى — الارتباط الأحادي فوق ممكن يضخّم عامل بيسبب تزامنه مع عامل تانى ---
            // (مثلاً يوم حر عادة رطوبته أقل، فالارتباط الأحادي للحرارة ممكن "يسرق" جزء من أثر الرطوبة والعكس)
            let envMultiRegression = null;
            {
                const matched = series.map(r => {
                    const nh3Avg = avgOf(r.nh3Day, r.nh3Night), humidityAvg = avgOf(r.humidityDay, r.humidityNight), tempAvg = avgOf(r.tempDay, r.tempNight);
                    if (nh3Avg == null || humidityAvg == null || tempAvg == null) return null;
                    return { temp: tempAvg, humidity: humidityAvg, nh3: nh3Avg, mort: (r.mort || 0) + (r.cull || 0) };
                }).filter(Boolean);
                if (matched.length >= 10) {
                    const reg = multiLinearRegression(
                        [matched.map(x => x.temp), matched.map(x => x.humidity), matched.map(x => x.nh3)],
                        matched.map(x => x.mort)
                    );
                    if (reg) {
                        // نحوّل المعاملات لصيغة "قياسية" (standardized) عشان تكون قابلة للمقارنة مع بعض رغم اختلاف وحدات القياس
                        const sdT = stdDev(matched.map(x => x.temp)), sdH = stdDev(matched.map(x => x.humidity)),
                              sdN = stdDev(matched.map(x => x.nh3)), sdM = stdDev(matched.map(x => x.mort));
                        const stdCoef = (coef, sdX) => (sdX && sdM) ? (coef * sdX / sdM) : 0;
                        const factors = [
                            { key: 'temp', label: 'الحرارة', stdCoef: stdCoef(reg.coefs[0], sdT) },
                            { key: 'humidity', label: 'الرطوبة', stdCoef: stdCoef(reg.coefs[1], sdH) },
                            { key: 'nh3', label: 'الأمونيا', stdCoef: stdCoef(reg.coefs[2], sdN) },
                        ].sort((a, c) => Math.abs(c.stdCoef) - Math.abs(a.stdCoef));
                        // ⚠️ إصلاح: كان النموذج بيعرض "العامل الأكثر تأثيرًا" بثقة حتى لو r² قريب من الصفر (يعني
                        // النموذج فعليًا مش مفسِّر حاجة). دلوقتي modelWeak بتوضّح للواجهة إنها متعرضش الترتيب
                        // كحقيقة، وr2 بيتحفظ عشان يتعرض للمستخدم بدل ما يفضل مخفي عنه.
                        const modelWeak = reg.r2 == null || reg.r2 < 0.15;
                        envMultiRegression = { r2: reg.r2, n: matched.length, factors, dominant: factors[0], modelWeak };
                    }
                }
            }
            // --- الأثر بفارق زمني (Lag): النفوق غالبًا بيظهر بعد الإجهاد بيوم أو يومين، مش نفس اليوم ---
            // نجرّب lag = 0 (نفس اليوم)، 1، 2 يوم ونختار الأقوى علاقة إحصائيًا كمؤشر رئيسي، مع توضيح الفارق الزمني للمستخدم
            let envStressBest = null;
            for (let lag = 0; lag <= 2; lag++) {
                const xs = [], ys = [];
                stressSeries.forEach(r => {
                    const future = stressSeries.find(x => x.age === r.age + lag) || series.find(x => x.age === r.age + lag);
                    if (future) { xs.push(r.stress); ys.push((future.mort != null ? future.mort : ((future.mort || 0) + (future.cull || 0)))); }
                });
                if (xs.length >= 5) {
                    const c = pearsonCorr(xs, ys);
                    if (c != null && (envStressBest == null || Math.abs(c) > Math.abs(envStressBest.corr))) envStressBest = { lag, corr: c, count: xs.length };
                }
            }
            // --- 3ب-٢) نسبة الماء:العلف اليومية كمؤشر إجهاد/صحة مبكر — عادة ترتفع النسبة قبل ظهور أعراض واضحة على القطيع ---
            let waterFeedAnalysis = null;
            {
                const spRef = getSpeciesData(b.species);
                const refWfr = spRef ? spRef.waterFeedRatio : null;
                const wfrSeries = series.filter(r => r.water != null && r.feed != null && r.feed > 0).map(r => ({ age: r.age, ratio: r.water / r.feed }));
                if (wfrSeries.length >= 5) {
                    let wfrCorrBest = null;
                    for (let lag = 0; lag <= 1; lag++) {
                        const xs = [], ys = [];
                        wfrSeries.forEach(w => {
                            const future = series.find(x => x.age === w.age + lag);
                            if (future) { xs.push(w.ratio); ys.push((future.mort || 0) + (future.cull || 0)); }
                        });
                        if (xs.length >= 5) {
                            const c = pearsonCorr(xs, ys);
                            if (c != null && (wfrCorrBest == null || Math.abs(c) > Math.abs(wfrCorrBest.corr))) wfrCorrBest = { lag, corr: c, count: xs.length };
                        }
                    }
                    const recent = wfrSeries.slice(-3);
                    const recentAvg = recent.reduce((s, w) => s + w.ratio, 0) / recent.length;
                    const overallAvg = wfrSeries.reduce((s, w) => s + w.ratio, 0) / wfrSeries.length;
                    const baseline = refWfr || overallAvg;
                    const deviationPct = baseline > 0 ? ((recentAvg - baseline) / baseline) * 100 : null;
                    waterFeedAnalysis = { corr: wfrCorrBest, recentAvg, overallAvg, refWfr, deviationPct, count: wfrSeries.length };
                }
            }
            let deviationNarrative = null;
            if (devPoints.length >= 3) {
                const half = Math.max(1, Math.floor(devPoints.length / 3));
                const recentDp = devPoints.slice(-half);
                const recentDevAvg = recentDp.reduce((s, p) => s + p.dev, 0) / recentDp.length;
                if (recentDevAvg < -2 || (devTrend != null && devTrend < -1)) {
                    const ageFrom = recentDp[0].age, ageTo = recentDp[recentDp.length - 1].age;
                    const inWindow = stressSeries.filter(r => r.age >= ageFrom && r.age <= ageTo);
                    const outWindow = stressSeries.filter(r => r.age < ageFrom || r.age > ageTo);
                    const avgIn = inWindow.length ? inWindow.reduce((s, r) => s + r.stress, 0) / inWindow.length : null;
                    const avgOut = outWindow.length ? outWindow.reduce((s, r) => s + r.stress, 0) / outWindow.length : null;
                    const inFeed = inWindow.filter(r => r.feedPerBird != null && r.feedRef);
                    const feedDeficitPct = inFeed.length ? (inFeed.reduce((s, r) => s + ((r.feedPerBird - r.feedRef) / r.feedRef), 0) / inFeed.length) * 100 : null;
                    if (avgIn != null && avgOut != null && avgIn > 3 && avgIn > avgOut * 1.3) {
                        const topParts = [...new Set(inWindow.flatMap(r => r.parts))];
                        deviationNarrative = { type: 'stress', direction: 'down', ageFrom, ageTo, avgIn, avgOut,
                            text: `📉 الانحراف فى الوزن مرتبط زمنيًا بارتفاع الإجهاد البيئي (${topParts.join('/') || 'حرارة ورطوبة وأمونيا'}) خلال الأيام ${ageFrom}-${ageTo}` };
                    } else if (feedDeficitPct != null && feedDeficitPct < -8) {
                        deviationNarrative = { type: 'feed', direction: 'down', ageFrom, ageTo, feedDeficitPct,
                            text: `📉 الانحراف فى الوزن مرتبط زمنيًا بنقص استهلاك العلف عن المعياري (${fmt(Math.abs(feedDeficitPct),0)}% أقل) خلال الأيام ${ageFrom}-${ageTo}` };
                    }
                } else if (recentDevAvg > 2 && devTrend != null && devTrend > 1) {
                    // ===== رواية إيجابية: الأداء بيتحسّن بوضوح — نحاول نربطها بسبب محتمل (إضافة/معاملة سارية فى نفس الفترة) =====
                    const ageFrom = recentDp[0].age, ageTo = recentDp[recentDp.length - 1].age;
                    const activeItemsInWindow = [
                        ...(b.feedAdditives || []).filter(a => a.active).map(a => ({ name: a.name, kind: 'علف' })),
                        ...(b.waterAdditives || []).filter(a => a.active).map(a => ({ name: a.name, kind: 'ماء' })),
                    ].filter(a => {
                        const src = (b.feedAdditives || []).find(x => x.name === a.name) || (b.waterAdditives || []).find(x => x.name === a.name);
                        if (!src) return false;
                        const { from, to } = additiveDayRange(src);
                        return from <= ageTo && to >= ageFrom;
                    });
                    const causeTxt = activeItemsInWindow.length
                        ? ` — يتزامن مع سريان "${activeItemsInWindow[0].name}" (${activeItemsInWindow[0].kind})، مؤشر جيد لتكرارها فى الدورات القادمة`
                        : '';
                    deviationNarrative = { type: 'improve', direction: 'up', ageFrom, ageTo,
                        text: `📈 الأداء بيتحسّن بوضوح عن المعياري خلال الأيام ${ageFrom}-${ageTo}${causeTxt}` };
                }
            }
            const feedCorr = feedPairs.length >= 5 ? pearsonCorr(feedPairs.map(p => p[0]), feedPairs.map(p => p[1])) : null;

            // --- 3ب) أثر إضافات العلف/الماء والأدوية على معدل النفوق اليومي (مقارنة أيام السريان بأيام عدم السريان) ---
            // ============ سلسلة أداء يومية مشتركة (نفوق + انحراف الوزن % + معدل تحويل الفترة) ============
            // تُستخدم فى تحليل أثر الإضافات/المعاملات/شحنات العلف الثلاثة التالية، عشان نقارن "قبل/بعد"
            // أو "وقت السريان/خارجه" مش بس على النفوق زي الأول، وإنما كمان على الوزن ومعامل التحويل —
            // عشان نعرف فعليًا هل البند ده أثّر على الإنتاجية (وزن/FCR) ولا بس على النفوق ولا مفيش أثر خالص.
            // معدل تحويل الفترة = إجمالي علف الفترة ÷ إجمالي الزيادة الفعلية فى الكتلة الحيوية خلال نفس الفترة
            // (مبني على الوزن التقديري اليومي effWeight اللي بيتحسب لكل الأيام حتى غير الموزونة مباشرة).
            const dailyPerf = series.map((r, i) => {
                const prev = i > 0 ? series[i - 1] : null;
                const gainPerBirdG = prev != null ? (r.effWeight - prev.effWeight) : null;
                const dailyGainKgFlock = gainPerBirdG != null ? (gainPerBirdG / 1000) * r.liveCount : null;
                // ============ (جديد) معدل تحويل يومي تقريبي (Daily FCR proxy) — علف اليوم ÷ الزيادة الفعلية فى الكتلة الحيوية لنفس اليوم ============
                // بيتقلب يوميًا بشكل طبيعي (بعكس معدل التحويل التراكمي الثابت)، فبيصلح كسلسلة نقدر نطبّق عليها اختبار Welch
                // زي ما بنعمل بالظبط مع النفوق والانحراف فى الوزن، بدل ما الـFCR يفضل "فرق نسبي وصفي" بس فى كل مكان.
                const fcrDaily = (r.feed != null && dailyGainKgFlock != null && dailyGainKgFlock > 0) ? (r.feed / dailyGainKgFlock) : null;
                return { age: r.age, date: r.date, mort: (r.mort || 0) + (r.cull || 0), feed: r.feed,
                    dailyGainKgFlock, fcrDaily, devPct: r.stdW > 0 ? ((r.effWeight - r.stdW) / r.stdW) * 100 : null };
            });
            // ============ 🔴 إصلاح مهم: "سارية حسب الجدول" ≠ "اتنفّذت فعلًا" — كان التحليل بيعتبر أي يوم جوّه
            // فترة الإضافة المجدولة (from/to) "نشط" حتى لو المستخدم أصلاً معملش "✅ تنفيذ" فى اليوم ده (نسي،
            // خلصت الكمية، قرر يأجّلها...). ده كان بيلوّث المقارنة الإحصائية بأيام مفيهاش الإضافة فعليًا.
            // الحل: لو المستخدم بيستخدم زرار "✅ تنفيذ" أصلاً مع الإضافة دي (حتى ولو مرة واحدة فى الدورة)،
            // نثق فى سجل التنفيذ الفعلي (additiveExecLog) بدل الجدول. لو مستخدمش الزرار خالص مع الإضافة دي
            // (بيانات قديمة قبل الميزة، أو مستخدم مش بيتابع بالزرار)، نرجع للسلوك القديم (نفترض الجدول = التنفيذ)
            // عشان منكسرش تحليل بيانات تاريخية مفيش ليها بديل.
            function wasAdditiveActuallyGiven(a, day) {
                if (!additiveActiveOnDay(a, day.age)) return false;
                const hasAnyExecLog = (b.additiveExecLog || []).some(e => e.additiveId === a.id);
                if (!hasAnyExecLog) return true; // مفيش أي تتبّع تنفيذ لهذه الإضافة خالص — نرجع للجدول كأفضل تقدير متاح
                return isAdditiveExecutedToday(b, a.id, day.date);
            }
            function perfPeriodStats(days) {
                const mortRate = days.length ? days.reduce((s, d) => s + d.mort, 0) / days.length : null;
                const devVals = days.map(d => d.devPct).filter(v => v != null);
                const avgDev = devVals.length ? devVals.reduce((s, v) => s + v, 0) / devVals.length : null;
                const gainDays = days.filter(d => d.dailyGainKgFlock != null && d.dailyGainKgFlock > 0);
                const feedSum = gainDays.reduce((s, d) => s + (d.feed || 0), 0);
                const gainSum = gainDays.reduce((s, d) => s + d.dailyGainKgFlock, 0);
                const periodFcr = gainSum > 0 ? feedSum / gainSum : null;
                return { mortRate, avgDev, periodFcr };
            }
            // ============ فلترة القيم الشاذة إحصائيًا من سلسلة الـFCR اليومي قبل اختبار الدلالة — يوم واحد بعلف غير منطقي (خطأ إدخال/تسرب) مش المفروض يقلب النتيجة ============
            function fcrDailyClean(days) {
                const vals = days.map(d => d.fcrDaily).filter(v => v != null && v > 0);
                const bounds = iqrBounds(vals);
                return bounds ? vals.filter(v => v >= bounds.lower && v <= bounds.upper) : vals;
            }

            let additiveAnalysis = null;
            {
                const allAdditives = [
                    ...(b.feedAdditives || []).map(a => ({ ...a, kind: 'علف' })),
                    ...(b.waterAdditives || []).map(a => ({ ...a, kind: 'ماء' }))
                ];
                if (allAdditives.length && dailyPerf.length >= 6) {
                    const rows = allAdditives.map(a => {
                        const activeDays = dailyPerf.filter(d => wasAdditiveActuallyGiven(a, d));
                        const inactiveDays = dailyPerf.filter(d => !wasAdditiveActuallyGiven(a, d));
                        if (activeDays.length < 3 || inactiveDays.length < 3) return null;
                        const as = perfPeriodStats(activeDays), is = perfPeriodStats(inactiveDays);
                        return { name: a.name, kind: a.kind, activeDays: activeDays.length,
                            activeMortRate: as.mortRate, inactiveMortRate: is.mortRate,
                            activeDev: as.avgDev, inactiveDev: is.avgDev,
                            activeFcr: as.periodFcr, inactiveFcr: is.periodFcr };
                    }).filter(Boolean);
                    if (rows.length) {
                        // نعلّم البند لو ظهر أثر واضح فى أي من التلاتة: نفوق أعلى، أو وزن أضعف من المعتاد بوضوح
                        // وقت سريانه، أو معدل تحويل أسوأ بوضوح وقت سريانه — مع تحديد "السبب" الأوضح للعرض
                        // ============ دلالة إحصائية (Welch t-test): متطلّب إضافي فوق فرق النسبة — عشان منعلّمش بند بفرق ممكن يكون صدفة بحتة ============
                        const withReason = rows.map((r, idx) => {
                            const a = allAdditives[idx];
                            const activeDays = dailyPerf.filter(d => wasAdditiveActuallyGiven(a, d));
                            const inactiveDays = dailyPerf.filter(d => !wasAdditiveActuallyGiven(a, d));
                            // ============ 🔴 إصلاح Red Team (مدموج): تصحيح المقارنات المتعددة — كل إضافة × 3 اختبارات (نفوق/وزن/تحويل) ============
                            const additiveNumTests = allAdditives.length * 3;
                            const mortSig = welchSignificant(activeDays.map(d => d.mort), inactiveDays.map(d => d.mort), additiveNumTests);
                            const devSig = welchSignificant(activeDays.map(d => d.devPct).filter(v => v != null), inactiveDays.map(d => d.devPct).filter(v => v != null), additiveNumTests);
                            // ============ (جديد) دلالة إحصائية لمعدل التحويل اليومي — بدل ما نحكم على الإضافة بفرق نسبي بس ============
                            const fcrSig = welchSignificant(fcrDailyClean(activeDays), fcrDailyClean(inactiveDays), additiveNumTests);
                            const reasons = [];
                            if (r.activeMortRate > (r.inactiveMortRate * 1.3 + 0.05) && mortSig.significant) reasons.push({ key: 'mort', size: r.activeMortRate - r.inactiveMortRate });
                            if (r.activeDev != null && r.inactiveDev != null && (r.inactiveDev - r.activeDev) >= 3 && devSig.significant) reasons.push({ key: 'weight', size: r.inactiveDev - r.activeDev });
                            if (r.activeFcr != null && r.inactiveFcr != null && r.activeFcr > r.inactiveFcr * 1.1 && fcrSig.significant) reasons.push({ key: 'fcr', size: r.activeFcr - r.inactiveFcr });
                            const positiveReasons = [];
                            if (r.activeDev != null && r.inactiveDev != null && (r.activeDev - r.inactiveDev) >= 3 && devSig.significant) positiveReasons.push({ key: 'weight', size: r.activeDev - r.inactiveDev });
                            if (r.activeFcr != null && r.inactiveFcr != null && r.inactiveFcr > r.activeFcr * 1.1 && fcrSig.significant) positiveReasons.push({ key: 'fcr', size: r.inactiveFcr - r.activeFcr });
                            reasons.sort((x, y) => y.size - x.size);
                            positiveReasons.sort((x, y) => y.size - x.size);
                            return { ...r, reasons, positiveReasons, fcrStatSignificant: fcrSig.significant, statSignificant: mortSig.significant || devSig.significant || fcrSig.significant };
                        });
                        const flagged = withReason.filter(r => r.reasons.length)
                            .sort((x, y) => (y.reasons[0] ? y.reasons[0].size : 0) - (x.reasons[0] ? x.reasons[0].size : 0));
                        const improved = withReason.filter(r => r.positiveReasons.length && !r.reasons.length)
                            .sort((x, y) => (y.positiveReasons[0] ? y.positiveReasons[0].size : 0) - (x.positiveReasons[0] ? x.positiveReasons[0].size : 0));
                        additiveAnalysis = { rows: withReason, flagged: flagged[0] || null, improved: improved[0] || null };
                    }
                }
            }

            // --- 3ج) أثر معاملات الفرشة/السبلة المنفَّذة فعليًا (رش/تقليب/تعقيم) على النفوق والأمونيا: مقارنة قبل/بعد التنفيذ ---
            let treatmentImpact = null;
            {
                const doneTreatments = (b.treatmentLog || []).filter(t => t.done && t.doneDate);
                if (doneTreatments.length) {
                    const rows = doneTreatments.map(t => {
                        const doneAge = daysBetween(b.startDate, t.doneDate);
                        const before = series.filter(r => r.age >= doneAge - 3 && r.age < doneAge);
                        const after = series.filter(r => r.age > doneAge && r.age <= doneAge + 3);
                        // ⚠️ إصلاح: كان الحد الأدنى نقطتين بس (يوم واحد فعليًا فى فترة 3 أيام ممكن يحتوي نقطة
                        // واحدة لو فيه فجوات تسجيل) — رفعناه لـ 3 نقاط كحد أدنى حقيقي قبل أي مقارنة قبل/بعد.
                        if (before.length < 3 || after.length < 3) return null;
                        const mortBefore = before.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0) / before.length;
                        const mortAfter = after.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0) / after.length;
                        const nh3BeforeArr = before.map(r => avgOf(r.nh3Day, r.nh3Night)).filter(v => v != null);
                        const nh3AfterArr = after.map(r => avgOf(r.nh3Day, r.nh3Night)).filter(v => v != null);
                        const nh3Before = avgOfArr(nh3BeforeArr);
                        const nh3After = avgOfArr(nh3AfterArr);
                        const beforeDailyPerf = dailyPerf.filter(d => d.age >= doneAge - 3 && d.age < doneAge);
                        const afterDailyPerf = dailyPerf.filter(d => d.age > doneAge && d.age <= doneAge + 3);
                        const beforePerf = perfPeriodStats(beforeDailyPerf);
                        const afterPerf = perfPeriodStats(afterDailyPerf);
                        // ============ 🔴 إصلاح Red Team (مدموج): تصحيح المقارنات المتعددة — كل معاملة × 4 اختبارات (نفوق/أمونيا/وزن/تحويل) ============
                        const treatNumTests = doneTreatments.length * 4;
                        const mortSig = welchSignificant(before.map(r => (r.mort || 0) + (r.cull || 0)), after.map(r => (r.mort || 0) + (r.cull || 0)), treatNumTests);
                        // ⚠️ إصلاح: الأمونيا والوزن والـFCR كانوا بيتحكم فيهم نسبة مباشرة بس من غير أي اختبار دلالة —
                        // دلوقتي بنطبّق نفس اختبار Welch المستخدم أصلاً للنفوق على الاتلاتة، بما فيهم معدل التحويل
                        // اليومي التقريبي (fcrDaily) بدل ما يفضل الوحيد اللي بيتحكم فيه بنسبة وصفية بس.
                        const nh3Sig = welchSignificant(nh3BeforeArr, nh3AfterArr, treatNumTests);
                        const devSig = welchSignificant(beforeDailyPerf.map(d => d.devPct).filter(v => v != null), afterDailyPerf.map(d => d.devPct).filter(v => v != null), treatNumTests);
                        const fcrSig = welchSignificant(fcrDailyClean(beforeDailyPerf), fcrDailyClean(afterDailyPerf), treatNumTests);
                        return { name: t.name, doneAge, mortBefore, mortAfter, nh3Before, nh3After,
                            devBefore: beforePerf.avgDev, devAfter: afterPerf.avgDev, fcrBefore: beforePerf.periodFcr, fcrAfter: afterPerf.periodFcr,
                            mortStatSignificant: mortSig.significant, nh3StatSignificant: nh3Sig.significant, devStatSignificant: devSig.significant, fcrStatSignificant: fcrSig.significant };
                    }).filter(Boolean);
                    if (rows.length) {
                        // نعلّم المعاملات اللي حسّنت النفوق أو الأمونيا أو الوزن أو معدل التحويل بوضوح بعد تنفيذها —
                        // الأربعة كلهم دلوقتي مدعومين بدلالة إحصائية Welch مش نسبة وصفية بس.
                        const improved = rows.filter(r => (r.mortAfter < r.mortBefore * 0.7 && r.mortStatSignificant)
                            || (r.nh3Before != null && r.nh3After != null && r.nh3After < r.nh3Before * 0.8 && r.nh3StatSignificant)
                            || (r.devBefore != null && r.devAfter != null && (r.devAfter - r.devBefore) >= 2 && r.devStatSignificant)
                            || (r.fcrBefore != null && r.fcrAfter != null && r.fcrAfter < r.fcrBefore * 0.92 && r.fcrStatSignificant))
                            .sort((x, y) => (x.mortAfter - x.mortBefore) - (y.mortAfter - y.mortBefore));
                        treatmentImpact = { rows, best: improved[0] || null };
                    }
                }
            }

            // --- 4) ربط الأداء بمصدر/شحنة العلف: مقارنة معدل النفوق اليومي بين فترات الشحنات المختلفة ---
            let feedLotAnalysis = null;
            {
                const feedLots = (b.purchases || [])
                    .filter(p => p.type === 'علف' && p.lot)
                    .map(p => ({ date: p.date, lot: p.lot }))
                    .sort((a, c) => a.date.localeCompare(c.date));
                const uniqueLots = [];
                feedLots.forEach(fl => { if (!uniqueLots.length || uniqueLots[uniqueLots.length - 1].lot !== fl.lot) uniqueLots.push(fl); });
                if (uniqueLots.length >= 2) {
                    const segs = uniqueLots.map((fl, i) => {
                        const startDate = fl.date;
                        const endDate = (i < uniqueLots.length - 1) ? uniqueLots[i + 1].date : null;
                        const recsInSeg = b.records.filter(r => r.date >= startDate && (!endDate || r.date < endDate));
                        const totalMort = recsInSeg.reduce((s, r) => s + (r.mort || 0), 0);
                        const days = recsInSeg.length;
                        const segAges = new Set(recsInSeg.map(r => r.age));
                        const segDailyPerf = dailyPerf.filter(d => segAges.has(d.age));
                        const perf = perfPeriodStats(segDailyPerf);
                        // ⚠️ إصلاح: بنحتفظ بالسلاسل اليومية الخام (مش بس المتوسط) عشان نقدر نشغّل اختبار
                        // Welch لكل شحنة مقابل باقي الشحنات مجتمعة، بدل ما نحكم بمجرد نسبة مباشرة.
                        return { lot: fl.lot, days, totalMort, mortPerDay: days > 0 ? totalMort / days : 0, avgDev: perf.avgDev, periodFcr: perf.periodFcr,
                            mortDaily: recsInSeg.map(r => (r.mort || 0) + (r.cull || 0)), devDaily: segDailyPerf.map(d => d.devPct).filter(v => v != null),
                            fcrDaily: fcrDailyClean(segDailyPerf) };
                    }).filter(s => s.days >= 3); // ⚠️ إصلاح: رفعنا الحد الأدنى من يومين لـ 3 أيام كحد أدنى حقيقي للمقارنة
                    if (segs.length >= 2) {
                        const avgMortRate = segs.reduce((s, x) => s + x.mortPerDay, 0) / segs.length;
                        const devVals = segs.map(s => s.avgDev).filter(v => v != null);
                        const avgDevAll = devVals.length ? devVals.reduce((s, v) => s + v, 0) / devVals.length : null;
                        const fcrVals = segs.map(s => s.periodFcr).filter(v => v != null);
                        const avgFcrAll = fcrVals.length ? fcrVals.reduce((s, v) => s + v, 0) / fcrVals.length : null;
                        // نعلّم أضعف شحنة سواء بارتفاع واضح فى النفوق، أو ضعف واضح فى الوزن مقابل باقي الشحنات، أو معدل تحويل أسوأ بوضوح
                        const worstMort = segs.reduce((a, c) => c.mortPerDay > a.mortPerDay ? c : a, segs[0]);
                        const worstDev = devVals.length ? segs.reduce((a, c) => (c.avgDev != null && (a.avgDev == null || c.avgDev < a.avgDev)) ? c : a, segs[0]) : null;
                        const worstFcr = fcrVals.length ? segs.reduce((a, c) => (c.periodFcr != null && (a.periodFcr == null || c.periodFcr > a.periodFcr)) ? c : a, segs[0]) : null;
                        // ⚠️ إصلاح: اختبار Welch لكل بند (نفوق/وزن/معدل تحويل) مقابل باقي الشحنات مجتمعة، قبل ما نتهم شحنة بعينها.
                        const otherMort = (seg) => segs.filter(s => s !== seg).flatMap(s => s.mortDaily);
                        const otherDev = (seg) => segs.filter(s => s !== seg).flatMap(s => s.devDaily);
                        const otherFcr = (seg) => segs.filter(s => s !== seg).flatMap(s => s.fcrDaily);
                        // ============ 🔴 إصلاح Red Team (مدموج): تصحيح المقارنات المتعددة — كل شحنة × 3 اختبارات (نفوق/وزن/تحويل) ============
                        const lotNumTests = segs.length * 3;
                        const worstMortSig = welchSignificant(worstMort.mortDaily, otherMort(worstMort), lotNumTests).significant;
                        const worstDevSig = worstDev ? welchSignificant(worstDev.devDaily, otherDev(worstDev), lotNumTests).significant : false;
                        const worstFcrSig = worstFcr ? welchSignificant(worstFcr.fcrDaily, otherFcr(worstFcr), lotNumTests).significant : false;
                        let flagged = null;
                        if (avgMortRate > 0 && worstMort.mortPerDay > avgMortRate * 1.5 && worstMortSig) flagged = { ...worstMort, reason: 'mort' };
                        else if (worstDev && avgDevAll != null && (avgDevAll - worstDev.avgDev) >= 3 && worstDevSig) flagged = { ...worstDev, reason: 'weight' };
                        else if (worstFcr && avgFcrAll != null && worstFcr.periodFcr > avgFcrAll * 1.1 && worstFcrSig) flagged = { ...worstFcr, reason: 'fcr' };
                        feedLotAnalysis = { segs, avgMortRate, avgDevAll, avgFcrAll, flagged };
                    }
                }
            }

            // --- 5) جودة مياه الشرب (pH/ملوحة) بارتباط إحصائي + فارق زمني، بدل تنبيه نطاق ثابت بس ---
            // نفس منطق الإجهاد البيئي: مش كل انحراف عن النطاق المثالي بالضرورة بيأثر فعليًا على *هذه* الدفعة بالذات
            let waterQualityCorr = null;
            {
                const phPairs = [], salPairs = [];
                series.forEach(r => {
                    if (r.waterPh != null) phPairs.push({ age: r.age, v: Math.abs(r.waterPh - 7) }); // انحراف عن المحايد فى الاتجاهين
                    if (r.waterSalinity != null) salPairs.push({ age: r.age, v: r.waterSalinity });
                });
                const bestOf = pairs => {
                    if (pairs.length < 5) return null;
                    let best = null;
                    for (let lag = 0; lag <= 2; lag++) {
                        const xs = [], ys = [];
                        pairs.forEach(p => {
                            const future = series.find(x => x.age === p.age + lag);
                            if (future) { xs.push(p.v); ys.push((future.mort || 0) + (future.cull || 0)); }
                        });
                        if (xs.length >= 5) {
                            const c = pearsonCorr(xs, ys);
                            if (c != null && (best == null || Math.abs(c) > Math.abs(best.corr))) best = { lag, corr: c, count: xs.length };
                        }
                    }
                    return best;
                };
                const phResult = bestOf(phPairs), salResult = bestOf(salPairs);
                if (phResult || salResult) waterQualityCorr = { ph: phResult, salinity: salResult,
                    phCount: phPairs.length, salCount: salPairs.length };
            }

            // --- 6) تفصيل الإجهاد البيئي المُركّب حسب الأسبوع العمري — بيوضح متى بالظبط الإجهاد بيأثر أكتر ---
            let weeklyStress = null;
            {
                const maxAge = Math.max(0, ...stressSeries.map(r => r.age));
                if (maxAge >= 7 && stressSeries.length >= 7) {
                    const weeks = [];
                    for (let w = 1; w <= Math.ceil(maxAge / 7); w++) {
                        const from = (w - 1) * 7 + 1, to = w * 7;
                        const inWeek = stressSeries.filter(r => r.age >= from && r.age <= to);
                        if (!inWeek.length) continue;
                        const avgStress = inWeek.reduce((s, r) => s + r.stress, 0) / inWeek.length;
                        const avgMort = inWeek.reduce((s, r) => s + r.mort, 0) / inWeek.length;
                        weeks.push({ week: w, from, to, avgStress, avgMort, count: inWeek.length });
                    }
                    if (weeks.length >= 2) {
                        const worst = weeks.reduce((a, c) => c.avgStress > a.avgStress ? c : a, weeks[0]);
                        weeklyStress = { weeks, worst };
                    }
                }
            }

            // --- 7) شذوذ إحصائي (Z-score) على انحراف الوزن عن المعياري — الوزن الخام لا يصلح لأنه يتصاعد طبيعيًا بالعمر ---
            // فبدل مقارنة الوزن نفسه، بنقارن "نسبة الانحراف %" عن منحنى السلالة بين آخر وزنة وباقي الوزنات السابقة
            let weightZAnomaly = null;
            if (devPoints.length >= 6) {
                const latest = devPoints[devPoints.length - 1];
                const baseline = devPoints.slice(0, -1);
                const n = baseline.length;
                const mean = baseline.reduce((s, p) => s + p.dev, 0) / n;
                const variance = baseline.reduce((s, p) => s + Math.pow(p.dev - mean, 2), 0) / n;
                const std = Math.sqrt(variance);
                if (std >= 0.5) {
                    const z = (latest.dev - mean) / std;
                    if (Math.abs(z) >= 2) weightZAnomaly = { age: latest.age, z, dev: latest.dev, baselineMean: mean, count: n };
                }
            }

            // --- 8) أثر توقيت التحصينات على الأداء (نفس منطق treatmentImpact، مطبَّق على vaccineLog) ---
            let vaccineImpact = null;
            {
                const doneVaccines = (b.vaccineLog || []).filter(v => v.done && v.doneDate);
                if (doneVaccines.length) {
                    const rows = doneVaccines.map(v => {
                        const doneAge = daysBetween(b.startDate, v.doneDate);
                        const before = series.filter(r => r.age >= doneAge - 3 && r.age < doneAge);
                        const after = series.filter(r => r.age > doneAge && r.age <= doneAge + 3);
                        if (before.length < 2 || after.length < 2) return null;
                        const mortBefore = before.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0) / before.length;
                        const mortAfter = after.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0) / after.length;
                        const gainBefore = before.length >= 2 ? (before[before.length - 1].effWeight - before[0].effWeight) / (before.length - 1) : null;
                        const gainAfter = after.length >= 2 ? (after[after.length - 1].effWeight - after[0].effWeight) / (after.length - 1) : null;
                        return { name: v.name, doneAge, mortBefore, mortAfter, gainBefore, gainAfter };
                    }).filter(Boolean);
                    if (rows.length) {
                        // نعلّم التحصينات اللي اترافقت بارتفاع نفوق واضح أو تباطؤ نمو بعدها (فترة استرداد أطول من المعتاد) — للمراجعة، وليس اعتراض على التحصين نفسه
                        const flagged = rows.filter(r => r.mortAfter > r.mortBefore * 1.4 + 0.05)
                            .sort((x, y) => (y.mortAfter - y.mortBefore) - (x.mortAfter - x.mortBefore));
                        vaccineImpact = { rows, flagged: flagged[0] || null };
                    }
                }
            }

            // --- 9) مقارنة الأسبوع العمري الحالي بنفس الأسبوع من دورات سابقة مؤرشفة لنفس النوع — كشف الانحراف مبكرًا فى نص الدورة ---
            let weekOverWeekVsHistory = null;
            {
                const currentWeek = Math.ceil(m.todayAge / 7);
                const from = (currentWeek - 1) * 7 + 1, to = currentWeek * 7;
                const curWeekRecs = series.filter(r => r.age >= from && r.age <= Math.min(to, m.todayAge));
                const archived = state.batches.filter(x => x.id !== b.id && x.species === b.species && x.status === 'مؤرشفة' && x.records && x.records.length >= to);
                if (curWeekRecs.length >= 2 && archived.length >= 2) {
                    const curMortPerDay = curWeekRecs.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0) / curWeekRecs.length;
                    const curFcrLatest = curWeekRecs[curWeekRecs.length - 1].fcr || null;
                    const histRows = archived.map(x => {
                        const xm = computeMetrics(x);
                        const xWeekRecs = xm.series.filter(r => r.age >= from && r.age <= to && r.age > 0);
                        if (xWeekRecs.length < 2) return null;
                        const mortPerDay = xWeekRecs.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0) / xWeekRecs.length;
                        const fcrLatest = xWeekRecs[xWeekRecs.length - 1].fcr || null;
                        return { name: x.name, mortPerDay, fcrLatest };
                    }).filter(Boolean);
                    if (histRows.length >= 2) {
                        const avgHistMort = histRows.reduce((s, r) => s + r.mortPerDay, 0) / histRows.length;
                        const histFcrVals = histRows.map(r => r.fcrLatest).filter(v => v != null);
                        const avgHistFcr = histFcrVals.length ? histFcrVals.reduce((s, v) => s + v, 0) / histFcrVals.length : null;
                        weekOverWeekVsHistory = { week: currentWeek, from, to, curMortPerDay, curFcrLatest,
                            avgHistMort, avgHistFcr, sampleSize: histRows.length,
                            mortDiffPct: avgHistMort > 0 ? ((curMortPerDay - avgHistMort) / avgHistMort) * 100 : null,
                            fcrDiffPct: (curFcrLatest && avgHistFcr) ? ((curFcrLatest - avgHistFcr) / avgHistFcr) * 100 : null };
                    }
                }
            }

            // --- 10) مؤشر مركّب واحد "احتمالية مشكلة قادمة" — يدمج كل الإشارات الإحصائية المتاحة فى رقم/تصنيف واحد ---
            // بدل ما المربي يقرأ 6-7 ارتباطات منفصلة ويقيّمهم بنفسه، بنجمعهم بأوزان بسيطة فى مؤشر واحد مباشر
            let riskIndex = null;
            {
                let score = 0; const reasons = [];
                // ⚠️ إصلاح: كان بيضيف نقط للمؤشر المُجمَّع لمجرد |r|≥0.3 من غير أي فحص دلالة إحصائية —
                // حتى لو نفس الارتباط ده كان هيظهر بشارة "⚪ ممكن يكون صدفة" لو اتعرض كنص منفصل
                // (شوف corrConfidence/pearsonSignificant). دلوقتي بنشترط الدلالة الإحصائية الفعلية
                // قبل ما يساهم فى المؤشر المُجمَّع، عشان يفضل على الأقل بنفس مصداقية العرض التفصيلي.
                if (envStressBest && Math.abs(envStressBest.corr) >= 0.3 && pearsonSignificant(envStressBest.corr, envStressBest.count)) { score += Math.abs(envStressBest.corr) >= 0.5 ? 25 : 15; reasons.push(`إجهاد بيئي مرتبط بالنفوق (ارتباط ${fmt(Math.abs(envStressBest.corr)*100,0)}%)`); }
                if (waterFeedAnalysis && waterFeedAnalysis.deviationPct != null && waterFeedAnalysis.deviationPct >= 8) { score += waterFeedAnalysis.deviationPct >= 15 ? 20 : 10; reasons.push(`نسبة الماء:العلف أعلى من المعتاد بـ${fmt(waterFeedAnalysis.deviationPct,0)}%`); }
                if (devTrend != null && devTrend < -1) { score += 15; reasons.push(`الوزن بيتراجع عن بداية الدورة بمعدل ${fmt(Math.abs(devTrend),1)} نقطة%/يوم`); }
                if (weightZAnomaly) { score += Math.abs(weightZAnomaly.z) >= 3 ? 20 : 10; reasons.push(`آخر وزنة (يوم ${weightZAnomaly.age}) خارج نمط الدفعة بانحراف z=${fmt(weightZAnomaly.z,1)}`); }
                if (weekOverWeekVsHistory && weekOverWeekVsHistory.mortDiffPct != null && weekOverWeekVsHistory.mortDiffPct > 30) { score += 15; reasons.push(`نفوق الأسبوع ${weekOverWeekVsHistory.week} أعلى من متوسط ${weekOverWeekVsHistory.sampleSize} دورات سابقة بـ${fmt(weekOverWeekVsHistory.mortDiffPct,0)}%`); }
                if (additiveAnalysis && additiveAnalysis.flagged) {
                    const r0 = additiveAnalysis.flagged.reasons[0] ? additiveAnalysis.flagged.reasons[0].key : 'mort';
                    score += 10;
                    reasons.push(`"${additiveAnalysis.flagged.name}" مرتبطة بـ${r0 === 'weight' ? 'وزن أضعف' : r0 === 'fcr' ? 'معدل تحويل أسوأ' : 'نفوق أعلى'} وقت سريانها`);
                }
                if (vaccineImpact && vaccineImpact.flagged) { score += 10; reasons.push(`نفوق مرتفع بعد تحصين "${vaccineImpact.flagged.name}" (يوم ${vaccineImpact.flagged.doneAge})`); }
                // --- إشارة إضافية: عمر النهاردة واقع فى نطاق نمط معروف من "قاعدة معرفة الحوادث" (تكرر فى دورتين سابقتين فأكتر) ---
                {
                    const kbNow = computeIncidentKnowledgeBase(b.species);
                    const hit = kbNow && kbNow.filter(e => e.ageCenter <= m.todayAge && e.ageCenter >= m.todayAge - 2).sort((a, c) => c.cyclesAffected - a.cyclesAffected)[0];
                    if (hit) {
                        let boost = hit.cyclesAffected >= 3 ? 20 : 12;
                        const solTxt = hit.bestSolution ? ` — جرّب "${hit.bestSolution.name}" (نجح سابقًا فى ${fmt(hit.bestSolution.successRate*100,0)}%)` : '';
                        const diseaseTxt = hit.likelyDisease ? ` (التشخيص الأرجح سابقًا: ${hit.likelyDisease})` : '';
                        // ============ 🔴 تنفيذ Critique (2): لو النمط مرتبط موسميًا بفصل معين، ونحن فعلاً فى نفس الفصل دلوقتي، ============
                        // نرفع درجة الخطورة أكتر — البُعد الثاني (الموسم) بيتقاطع مع البُعد الأول (العمر) هنا فعليًا.
                        let seasonTxt = '';
                        if (hit.seasonalHint) {
                            const curSeason = seasonOf(todayStr());
                            if (curSeason === hit.seasonalHint) { boost += 8; seasonTxt = ` — وده بيتوافق مع إن النمط ده مرتبط تاريخيًا بفصل ${hit.seasonalHint} (زي دلوقتي بالظبط)`; }
                            else seasonTxt = ` — النمط ده مرتبط تاريخيًا بفصل ${hit.seasonalHint} غالبًا`;
                        }
                        score += boost;
                        reasons.push(`عمر النهاردة قريب من نمط "${hit.category}"${diseaseTxt} اللي تكرر فى ${hit.cyclesAffected} دورة سابقة${solTxt}${seasonTxt}`);
                    }
                }
                score = Math.min(score, 100);
                const level = score >= 50 ? 'danger' : score >= 25 ? 'warn' : 'ok';
                riskIndex = { score, level, reasons };
            }

            const devOnset = computeDeviationOnset(devPoints);
            return { devAvg, devTrend, devCount: devPoints.length, devOnset, weightPrediction, fcrPrediction, nh3Corr, humidityCorr, tempCorr, feedCorr,
                nh3PairsCount: nh3Pairs.length, humidityPairsCount: humidityPairs.length, tempPairsCount: tempPairs.length, feedPairsCount: feedPairs.length,
                feedLotAnalysis, additiveAnalysis, treatmentImpact, envStressBest, envMultiRegression, stressPairsCount: stressSeries.length, deviationNarrative, waterFeedAnalysis,
                waterQualityCorr, weeklyStress, weightZAnomaly, vaccineImpact, weekOverWeekVsHistory, riskIndex };
        }

        // ============ سعر العلف الفعلي المرجّح من آخر عمليات شراء حقيقية (بدل السعر الثابت المُدخل عند إنشاء الدفعة) ============
        // b.feedprice بيتحدد مرة واحدة عند فتح الدفعة وممكن يفضل زي ما هو لحد آخر الدورة حتى لو اتغيّر سعر السوق فعليًا.
        // كل حسابات "المستقبل" (يوم البيع الأمثل، حاسبة الجدوى) لازم تعتمد على أحدث سعر شراء فعلي مسجَّل بدل الرقم القديم.
        function computeActualFeedPrice(b) {
            const feedPur = (b.purchases || []).filter(p => p.type === 'علف' && p.total > 0 && p.qty > 0)
                .map(p => ({ date: p.date, kg: convertUnitQty(p.qty, p.unit, 'كجم'), total: p.total }))
                .filter(p => p.kg != null && p.kg > 0)
                .sort((a, c) => a.date.localeCompare(c.date));
            if (!feedPur.length) return { price: b.feedprice || 0, source: 'default', asOf: null, purchasesUsed: 0 };
            // متوسط مرجّح لآخر 3 عمليات شراء فقط — يعكس سعر السوق الحالي بدل تذويبه بمشتريات قديمة من بداية الدورة
            const recent = feedPur.slice(-3);
            const totalKg = recent.reduce((s, p) => s + p.kg, 0);
            const totalCost = recent.reduce((s, p) => s + p.total, 0);
            const price = totalKg > 0 ? totalCost / totalKg : (b.feedprice || 0);
            return { price, source: 'purchases', asOf: recent[recent.length - 1].date, purchasesUsed: recent.length };
        }

        function computeFinance(b, m) {
            if (b.status !== 'مؤرشفة') return computeFinanceRaw(b, m);
            const entry = _getCycleCacheEntry(b);
            if (!entry.finance) entry.finance = computeFinanceRaw(b, m);
            return entry.finance;
        }
        function computeFinanceRaw(b, m) {
            const feedFromPurchases = b.purchases.filter(p => p.type === 'علف').reduce((s, p) => s + p.total, 0);
            const chickFromPurchases = b.purchases.filter(p => p.type === 'كتاكيت').reduce((s, p) => s + p.total, 0);
            const medFromPurchases = b.purchases.filter(p => p.type === 'أدوية ولقاحات').reduce((s, p) => s + p.total, 0);
            const beddingFromPurchases = b.purchases.filter(p => p.type === 'فرشة وتدفئة').reduce((s, p) => s + p.total, 0);
            const fuelFromPurchases = b.purchases.filter(p => p.type === 'وقود تدفئة (غاز/سولار)').reduce((s, p) => s + p.total, 0);
            const addFromPurchases = b.purchases.filter(p => p.type === 'إضافات').reduce((s, p) => s + p.total, 0);
            const utilFromPurchases = b.purchases.filter(p => p.type === 'كهرباء ومياه').reduce((s, p) => s + p.total, 0);
            const laborFromPurchases = b.purchases.filter(p => p.type === 'عمالة').reduce((s, p) => s + p.total, 0);
            const otherFromPurchases = b.purchases.filter(p => p.type === 'أخرى').reduce((s, p) => s + p.total, 0);
            const totalPurchases = b.purchases.reduce((s, p) => s + p.total, 0);
            const feedCost = feedFromPurchases > 0 ? feedFromPurchases : m.cumFeed * (b.feedprice || 0);
            const chickCost = chickFromPurchases > 0 ? chickFromPurchases : b.startCount * (b.chickprice || 0);
            const cumHeatFuel = b.records.reduce((s, r) => s + (r.heatfuel || 0), 0);
            const heatCost = fuelFromPurchases > 0 ? fuelFromPurchases : cumHeatFuel * (b.heatprice || 0);
            const processingCost = b.sales.filter(s => s.kind === 'meat').reduce((s, x) => s + (x.processCost || 0), 0);
            const carcassSales = b.sales.filter(s => s.kind === 'meat' && s.carcassYield > 0);
            const avgCarcassYield = carcassSales.length ? carcassSales.reduce((s, x) => s + x.carcassYield, 0) / carcassSales.length : null;
            const customCosts = b.customItems.filter(c => c.type === 'cost').reduce((s, c) => s + c.amount, 0);
            const customRevenue = b.customItems.filter(c => c.type === 'revenue').reduce((s, c) => s + c.amount, 0);
            const otherDirectCosts = medFromPurchases + beddingFromPurchases + heatCost + addFromPurchases + utilFromPurchases +
                laborFromPurchases + otherFromPurchases + processingCost;
            const totalCosts = feedCost + chickCost + otherDirectCosts + customCosts;
            const meatSales = b.sales.filter(s => s.kind !== 'litter');
            const litterSales = b.sales.filter(s => s.kind === 'litter');
            const meatRevenue = meatSales.reduce((s, sa) => s + sa.total, 0);
            const litterRevenue = litterSales.reduce((s, sa) => s + sa.total, 0);
            const salesRevenue = meatRevenue + litterRevenue;
            const soldBirds = meatSales.reduce((s, sa) => s + (sa.count || 0), 0);
            const soldWeightKg = meatSales.reduce((s, sa) => s + (sa.weight || 0), 0);
            const litterVolumeM3 = litterSales.reduce((s, sa) => s + (sa.volume || 0), 0);
            const totalRevenue = salesRevenue + customRevenue;
            const netProfit = totalRevenue - totalCosts;
            const producedKgForCost = soldWeightKg > 0 ? soldWeightKg : m.biomassKg;
            const costPerKg = producedKgForCost > 0 ? totalCosts / producedKgForCost : 0;
            const costPerBird = b.startCount > 0 ? totalCosts / b.startCount : 0;
            const profitPerBird = b.startCount > 0 ? netProfit / b.startCount : 0;
            const avgSalePrice = soldWeightKg > 0 ? meatRevenue / soldWeightKg : 0;
            const breakEvenPrice = producedKgForCost > 0 ? totalCosts / producedKgForCost : 0;
            const roi = totalCosts > 0 ? (netProfit / totalCosts) * 100 : 0;
            const today0 = todayStr();
            const totalPayable = b.purchases.filter(p => p.paid === false).reduce((s, p) => s + p.total, 0);
            const overduePayable = b.purchases.filter(p => p.paid === false && p.dueDate && p.dueDate < today0).reduce((s, p) => s + p.total, 0);
            const totalReceivable = b.sales.filter(s => s.paid === false).reduce((s, x) => s + x.total, 0);
            const overdueReceivable = b.sales.filter(s => s.paid === false && s.dueDate && s.dueDate < today0).reduce((s, x) => s + x.total, 0);
            // صافي التدفق النقدي الفعلي حتى الآن = الربح الدفتري مطروحًا منه ما لم يُحصَّل بعد ومضافًا إليه ما لم يُسدَّد بعد
            const netCashPosition = netProfit - totalReceivable + totalPayable;
            return { feedCost, chickCost, medFromPurchases, beddingFromPurchases, fuelFromPurchases, cumHeatFuel, heatCost,
                addFromPurchases, utilFromPurchases,
                laborFromPurchases, otherFromPurchases, processingCost, avgCarcassYield, otherDirectCosts, customCosts, customRevenue, totalCosts,
                meatRevenue, litterRevenue, salesRevenue, soldBirds, soldWeightKg, litterVolumeM3, totalRevenue,
                netProfit, costPerKg, costPerBird, profitPerBird, avgSalePrice, breakEvenPrice, roi,
                totalPurchases, totalPayable, overduePayable, totalReceivable, overdueReceivable, netCashPosition };
        }

        // ============ استدلال مبكر عن حالة صحية محتملة (المرحلة الاستباقية) — دالة نقية 100% مش بتلمس DOM ============
        // بتاخد أعراض اليوم (إما من سجل محفوظ، أو من اختيارات الفورم لحظيًا قبل الحفظ)، وتطابقها مع:
        // 1) CLINICAL_DISEASE_KB (مرجع بيطري عام) — احتمال أولي حسب توافق الأعراض مع نطاق العمر.
        // 2) قاعدة معرفة حوادث المزرعة نفسها (computeIncidentKnowledgeBase) — لو نفس الفئة العمرية شافت مشكلة
        //    مشابهة قبل كده فى دورات سابقة، بنرفع مستوى الثقة ونضيف ملاحظة "حصل عندك قبل كده".
        // 3) استمرارية العرض يومين متتاليين (نفس الكود ظاهر إمبارح والنهاردة) — بترفع مستوى الإلحاح.
        // b: الدفعة. currentSigns: كائن اختياري {groupKey: [codes]} للمعاينة الحية قبل الحفظ؛ لو مش موجود بتاخد آخر سجل محفوظ.
        function computeSymptomPrediction(b, currentSigns) {
            if (!b) return { predictions: [], flatSigns: [], persistingSigns: [] };
            const m = computeMetricsRaw(b);
            const age = m.age || 0;
            let signsSource = currentSigns;
            if (!signsSource) {
                const last = b.records && b.records.length ? b.records[b.records.length - 1] : null;
                signsSource = (last && last.clinicalSigns) ? last.clinicalSigns : {};
            }
            const flatSigns = [];
            CLINICAL_SIGN_GROUPS.forEach(g => (signsSource[g.key] || []).forEach(code => flatSigns.push(code)));
            if (!flatSigns.length) return { predictions: [], flatSigns: [], persistingSigns: [] };

            // أعراض ظاهرة أمبارح كمان (لو فيه سجل سابق) — لاستخدامها فى رفع درجة الإلحاح لو نفس العرض مستمر
            const sortedRecords = (b.records || []).slice().sort((r1, r2) => r1.age - r2.age);
            const prevRecord = sortedRecords.length ? sortedRecords[sortedRecords.length - (currentSigns ? 1 : 2)] : null;
            const prevSigns = new Set();
            if (prevRecord && prevRecord.clinicalSigns) {
                CLINICAL_SIGN_GROUPS.forEach(g => (prevRecord.clinicalSigns[g.key] || []).forEach(code => prevSigns.add(code)));
            }
            const persistingSigns = flatSigns.filter(c => prevSigns.has(c));

            const kb = (typeof computeIncidentKnowledgeBase === 'function') ? computeIncidentKnowledgeBase(b.species) : null;
            const allPersonalIncidents = (typeof mineAllIncidentRecords === 'function') ? mineAllIncidentRecords(b.species) : [];
            const normalize = s => String(s || '').toLowerCase().replace(/[\s\u0640]+/g, '');
            // ⚠️ دليل الأمراض بقى قابل للتعديل بالكامل من المستخدم (state.diseaseKB) — القائمة الثابتة تحت
            // بتُستخدم كنقطة انطلاق افتراضية بس لو الترحيل لسه ما حصلش (مثلاً فى بيئة اختبار معزولة عن state)
            const diseaseSource = (typeof state !== 'undefined' && state.diseaseKB && state.diseaseKB.length) ? state.diseaseKB : getDefaultDiseaseKB();

            const predictions = [];
            diseaseSource.forEach(dz => {
                if (age && (age < dz.ageMin || age > dz.ageMax)) return;
                const matchedRequired = (dz.requiredSigns || []).filter(c => flatSigns.includes(c));
                if (!matchedRequired.length) return;
                const matchedSupporting = (dz.supportingSigns || []).filter(c => flatSigns.includes(c));
                let officialScore = matchedRequired.length * 2 + matchedSupporting.length;
                // كل الأعراض "الأساسية" ظاهرة مع بعض (مش عرض واحد بس من كذا) ← دليل أقوى، مش مجرد جمع نقط
                if (dz.requiredSigns.length > 1 && matchedRequired.length === dz.requiredSigns.length) officialScore += 1;
                const persistBonus = matchedRequired.some(c => persistingSigns.includes(c)) || matchedSupporting.some(c => persistingSigns.includes(c));
                if (persistBonus) officialScore += 1.5;

                // ============ الذاكرة المرضية الشخصية: حالات مؤكدة بتشخيص فعلي مسجَّل (diseaseTag، مش شذوذ تلقائي)
                // بنفس التشخيص تقريبًا وفى عمر قريب (±6 أيام) من دورات سابقة — كل ما زاد عددها، وزنها يرتفع تدريجيًا
                // (n/(n+K))، فبيبدأ التقييم معتمد 100% على المرجع البيطري العام وبيتحول تدريجيًا لخبرة المزرعة نفسها. ============
                const dzKey = normalize(dz.name.split('(')[0]);
                const personalMatches = allPersonalIncidents.filter(inc =>
                    inc.diseaseTag && Math.abs(inc.age - age) <= 6 &&
                    (normalize(inc.diseaseTag).includes(dzKey) || dzKey.includes(normalize(inc.diseaseTag))));
                const n = personalMatches.length;
                const personalWeight = n > 0 ? n / (n + DISEASE_MEMORY_SHRINKAGE_K) : 0;
                const personalScore = 8 + Math.min(n, 3); // دليل شخصي مؤكد أقوى من مطابقة أعراض عامة بحد ذاتها
                const blendedScore = n > 0 ? officialScore * (1 - personalWeight) + personalScore * personalWeight : officialScore;

                let personalHistoryNote;
                if (n > 0) {
                    const solutionCounts = {};
                    personalMatches.forEach(m => { if (m.solutionName) solutionCounts[m.solutionName] = (solutionCounts[m.solutionName] || 0) + 1; });
                    const bestSolution = Object.keys(solutionCounts).sort((a, c) => solutionCounts[c] - solutionCounts[a])[0] || null;
                    personalHistoryNote = `📓 ذاكرتك الشخصية بقت تمثل ${Math.round(personalWeight * 100)}% من التقييم (${n} حالة مؤكدة قبل كده بنفس التشخيص تقريبًا فى عمر قريب)` +
                        (bestSolution ? ` — الحل اللي استخدمته غالبًا: ${bestSolution}` : '');
                } else {
                    personalHistoryNote = 'التقييم ده بيعتمد 100% على المرجع البيطري العام لحد ما تتكوّن ذاكرة خاصة بمزرعتك — سجّل التشخيص المؤكد (من الطبيب البيطري) فى "تسجيل حادثة" بعد ما تتأكد، عشان التوقعات الجاية تبقى مبنية على خبرتك أنت مش بس المرجع العام.';
                }

                let confidenceLabel = 'احتمال مبدئي';
                if (blendedScore >= 5) confidenceLabel = 'احتمال قوي — يحتاج تحرّك سريع';
                else if (blendedScore >= 3) confidenceLabel = 'احتمال متوسط';
                predictions.push({ name: dz.name, confidenceLabel, score: blendedScore, personalWeightPct: Math.round(personalWeight * 100),
                    evidenceCount: n, matchedSigns: matchedRequired.concat(matchedSupporting),
                    recommendation: dz.recommendation, personalHistoryNote, urgent: (persistBonus || n > 0) && blendedScore >= 5 });
            });
            predictions.sort((a, c) => c.score - a.score);
            return { predictions, flatSigns, persistingSigns };
        }

        // ============ Feasibility Study (دراسة الجدوى) ============
