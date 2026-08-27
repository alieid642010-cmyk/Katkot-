        function computeFeasibility(b, m, fin) {
            const restDays = AS().restDaysBetweenCycles; // افتراض قياسي: أيام راحة/تنظيف/تعقيم بين الدورات
            const cycleDays = Math.max(m.age || 0, b.targetAge || 0) || 35;
            const totalCycleDays = cycleDays + restDays;
            const cyclesPerYear = totalCycleDays > 0 ? 365 / totalCycleDays : 0;
            const annualRevenue = fin.totalRevenue * cyclesPerYear;
            const annualCosts = fin.totalCosts * cyclesPerYear;
            const annualProfit = fin.netProfit * cyclesPerYear;
            const profitMarginPct = fin.totalRevenue > 0 ? (fin.netProfit / fin.totalRevenue) * 100 : 0;
            const paybackDays = (fin.netProfit > 0 && fin.totalCosts > 0) ? (fin.totalCosts / fin.netProfit) * cycleDays : null;
            const costShare = {
                feed: fin.totalCosts > 0 ? (fin.feedCost / fin.totalCosts) * 100 : 0,
                chick: fin.totalCosts > 0 ? (fin.chickCost / fin.totalCosts) * 100 : 0,
                heat: fin.totalCosts > 0 ? (fin.heatCost / fin.totalCosts) * 100 : 0,
                processing: fin.totalCosts > 0 ? (fin.processingCost / fin.totalCosts) * 100 : 0,
                other: fin.totalCosts > 0 ? ((fin.totalCosts - fin.feedCost - fin.chickCost - fin.heatCost - fin.processingCost) / fin.totalCosts) * 100 : 0,
            };
            // سيناريوهات تحليل الحساسية: تغيّر سعر العلف والبيع ±10%
            function scenario(feedMult, revMult) {
                const newFeedCost = fin.feedCost * feedMult;
                const newTotalCosts = fin.totalCosts - fin.feedCost + newFeedCost;
                const newRevenue = fin.totalRevenue * revMult;
                const newProfit = newRevenue - newTotalCosts;
                const newRoi = newTotalCosts > 0 ? (newProfit / newTotalCosts) * 100 : 0;
                return { revenue: newRevenue, costs: newTotalCosts, profit: newProfit, roi: newRoi };
            }
            const scenarios = [
                { label: 'الوضع الحالي', ...scenario(1, 1) },
                { label: 'متفائل (علف -10% / بيع +10%)', ...scenario(0.9, 1.1) },
                { label: 'متشائم (علف +10% / بيع -10%)', ...scenario(1.1, 0.9) },
            ];
            let verdict, verdictColor;
            if (fin.totalCosts <= 0) { verdict = 'لا توجد بيانات كافية بعد'; verdictColor = 'var(--muted)'; }
            else if (fin.roi >= 25) { verdict = '✅ جدوى ممتازة'; verdictColor = 'var(--green)'; }
            else if (fin.roi >= 15) { verdict = '👍 جدوى جيدة'; verdictColor = 'var(--green)'; }
            else if (fin.roi >= 5) { verdict = '⚠️ جدوى مقبولة'; verdictColor = 'var(--wheat)'; }
            else if (fin.roi >= 0) { verdict = '⚠️ جدوى ضعيفة — تحتاج تحسين'; verdictColor = 'var(--wheat)'; }
            else { verdict = '🔴 خسارة — تحتاج مراجعة'; verdictColor = 'var(--red)'; }
            const earlyCycle = (m.age || 0) > 0 && (m.age || 0) < cycleDays * 0.5;
            return { restDays, cycleDays, totalCycleDays, cyclesPerYear, annualRevenue, annualCosts, annualProfit,
                profitMarginPct, paybackDays, costShare, scenarios, verdict, verdictColor, earlyCycle };
        }

        // ============ نقطة البيع الاقتصادية المثلى ============
        // تحسب لكل يوم إضافي بعد اليوم الحالي: هل قيمة الزيادة فى الوزن (بسعر البيع) أكبر من تكلفة العلف الإضافي؟
        // بمجرد ما الربح الحدي ليوم إضافي يبقى سالب أو شبه معدوم، يبقى ده أقرب يوم اقتصادي مثالي للبيع.
        // overridePrice (اختياري): سعر البورصة الحي اللي المربي بيدخله يدويًا (متغيّر يوميًا) — بياخد الأولوية
        // على متوسط سعر البيع الفعلي المُسجَّل (fin.avgSalePrice)، عشان يقدر يقيّم قرار البيع *قبل* ما يبيع فعليًا
        // وبناءً على حركة البورصة النهاردة، مش بس على مبيعات قديمة اتسجلت زمان.
        //
        // ===== دقة الإسقاط: مبني على أداء القطيع الفعلي مش على المنحنى المرجعي وحده =====
        // 1) الوزن: بنحسب "نسبة أداء الوزن" = الأوزان الفعلية المُقاسة ÷ المرجعي لنفس الأعمار (آخر 5 أوزان فعلية)،
        //    وبنطبّق نفس النسبة دي على شكل منحنى النمو المرجعي بالكامل مستقبلًا — يعني لو قطيعك بيكبر أسرع/أبطأ
        //    من المرجعي بنسبة ثابتة، الإسقاط بيعكس ده بدل ما يفترض إنك بالظبط زي الكتالوج.
        // 2) العلف: نفس فكرة "نسبة أداء" لكن لاستهلاك العلف الفعلي (زي المستخدمة أصلاً فى توقع مخزون العلف).
        // 3) النفوق: بنسقط تناقص الأعداد الحية يوم بيوم بمعدل النفوق الفعلي لآخر 7 أيام (مش بنثبّت العدد الحالي)،
        //    فالربح الحدي المعروض هو ربح القطيع كامل (مش الطائر الواحد) — وبيعكس تلقائيًا مخاطرة الاستمرار
        //    كل ما القطيع بيقل عدده مع الوقت.
        // 4) الكثافة/المساحة: بنحسب الكثافة الحيوية المتوقعة (كجم/م²) لكل يوم مستقبلي، ولو هتتجاوز الحد الآمن
        //    لنظام التهوية بتاعك (نفس حدود توصيات التهوية)، بيظهر تحذير وممكن يحدّ من "أفضل يوم" حتى لو
        //    الربح الحدي لسه موجب اقتصاديًا — لأن تجاوز الكثافة بيرفع مخاطر الإجهاد الحراري والنفوق فعليًا.
        // ============ توقع الربح الحي للدورة الجارية — يبني على نموذج يوم البيع الأمثل الموجود (توقع وزن/نفوق/تكلفة يومي) ليحسب الربح الإجمالي المتوقع لو استمرت الدورة على نفس المنوال حتى يوم البيع الموصى به ============
        function computeLiveProfitForecast(b, m, fin, saleAdv) {
            const osd = saleAdv && saleAdv.osd;
            if (!osd || !osd.rows || !osd.rows.length) return null;
            const targetDay = osd.optimalDay;
            const targetRow = osd.rows.find(r => r.day === targetDay);
            if (!targetRow) return null;
            const stdWTarget = getRefValue(b, 'weight', targetDay) || 0;
            const projWeightG = stdWTarget * osd.weightRatio;
            if (!(projWeightG > 0)) return null;
            // إجمالي التكلفة الإضافية المتوقعة من اليوم لحد يوم البيع (علف بس — باقي البنود مفترضة شبه ثابتة من الآن حتى البيع)
            const remainingFeedCost = osd.rows.filter(r => r.day <= targetDay).reduce((s, r) => s + r.marginalCost, 0);
            const projectedTotalCost = fin.totalCosts + remainingFeedCost;
            const projectedRevenue = targetRow.liveProj * (projWeightG / 1000) * osd.salePrice;
            const projectedProfit = projectedRevenue - projectedTotalCost;
            const projectedProfitPerBird = b.startCount > 0 ? projectedProfit / b.startCount : null;
            const daysRemaining = targetDay - m.todayAge;
            const confidence = osd.weightDataPoints >= 4 ? 'green' : (osd.weightDataPoints >= 2 ? 'mid' : 'low');
            return { targetDay, daysRemaining, projWeightG, projectedRevenue, projectedTotalCost, projectedProfit, projectedProfitPerBird,
                liveProjAtTarget: targetRow.liveProj, salePrice: osd.salePrice, priceSource: osd.priceSource, confidence };
        }

        // ⚠️ إصلاح: helper موحّد لفلترة القيم الشاذة فى الوزن — بيتشارك بين computeOptimalSaleDay
        // و computeEpefProjection عشان قرار "يوم البيع الأمثل" وتوقع الـ EPEF ما ينبنوش على وزن
        // واحد مُدخَل غلط (فاصلة عشرية، صفر زيادة، إلخ)، نفس الحماية المستخدمة أصلاً فى weightPrediction.
        function getRobustRecentWeights(m, windowSize, tailSize) {
            const raw = m.series.filter(r => r.age > 0 && r.weight != null).slice(-(windowSize || 8));
            if (raw.length < 5) return { recs: raw, outlierExcluded: false }; // مش كفاية نقط لحساب IQR أصلًا
            const out = filterOutlierRecords(raw, 'weight');
            const clean = out.clean.length >= 2 ? out.clean : raw;
            return { recs: clean.slice(-(tailSize || 5)), outlierExcluded: out.removed.length > 0, removedAges: out.removed.map(r => r.age) };
        }
        // ⚠️ إصلاح مماثل للنفوق: بعكس الوزن، بيانات النفوق غالبًا صفر لأيام كتير فمعامل IQR بيبقى صفر
        // (يعني فلترة IQR العادية مش هتمسك يوم نفوق استثنائي وسط أيام صفر) — فبنستخدم الوسيط (median)
        // بدل المتوسط لحساب معدل النفوق اليومي المتوقع، لأن الوسيط أصلًا مقاوم ليوم شاذ واحد.
        function getRobustDailyMortRate(recentMortRecs, cap) {
            if (!recentMortRecs.length) return 0;
            const dailyRates = recentMortRecs.map(r => r.liveCount > 0 ? ((r.mort || 0) + (r.cull || 0)) / r.liveCount : 0);
            const sorted = [...dailyRates].sort((a, c) => a - c);
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            return Math.min(median, cap);
        }
        function computeOptimalSaleDay(b, m, fin, overridePrice) {
            const feedPriceInfo = computeActualFeedPrice(b);
            const feedPrice = feedPriceInfo.price || 0;
            const usingMarketPrice = overridePrice != null && overridePrice > 0;
            const salePrice = usingMarketPrice ? overridePrice : (fin.avgSalePrice > 0 ? fin.avgSalePrice : 0);
            const priceSource = usingMarketPrice ? 'market' : (fin.avgSalePrice > 0 ? 'sales' : 'none');
            if (feedPrice <= 0 || salePrice <= 0 || m.todayAge < 1) return null;
            // نبدأ الإسقاط من عمر آخر سجل فعلي مُدخَل (m.age) لا عمر اليوم بالتقويم (m.todayAge)، لأن كل بيانات
            // الأساس (الأعداد الحية، نسبة أداء الوزن والعلف) مأخوذة من آخر سجل فعلي — لو فيه فرق (يوم أو أكتر
            // من غير تسجيل)، الاعتماد على عمر التقويم هنا كان هيطلع تسمية يوم مش متسقة مع بيانات الأساس فعليًا.
            const startAge = Math.max(m.age || m.todayAge, 1);

            // ===== نسبة أداء الوزن الفعلي مقابل المرجعي — من آخر 5 أوزان فعلية مُقاسة (مش تقديرية) =====
            // ⚠️ إصلاح: فلترة القيم الشاذة قبل الاعتماد عليها (زي weightPrediction بالظبط) — وزن واحد
            // مُدخَل غلط ما يقلبش قرار يوم البيع كله.
            const weightRobust = getRobustRecentWeights(m, 8, 5);
            const recentWeightRecs = weightRobust.recs;
            let weightRatio = 1;
            if (recentWeightRecs.length >= 1) {
                let actualSum = 0, stdSum = 0;
                recentWeightRecs.forEach(r => {
                    const stdW = getRefValue(b, 'weight', r.age) || 0;
                    if (stdW > 0) { actualSum += r.weight; stdSum += stdW; }
                });
                if (stdSum > 0) weightRatio = actualSum / stdSum;
            }
            const weightDataPoints = recentWeightRecs.length;

            // ===== نسبة أداء استهلاك العلف الفعلي (نفس منطق computeFeedForecast) =====
            const recentFeedRecs = m.series.filter(r => r.age > 0 && r.feed != null && r.liveCount > 0 && r.feedDay != null && r.feedNight != null).slice(-5);
            let feedPerfRatio = 1;
            if (recentFeedRecs.length >= 2) {
                let actualSum = 0, stdSum = 0;
                recentFeedRecs.forEach(r => {
                    const stdPerBirdG = getRefsForDay(b, r.age).feed;
                    actualSum += (r.feed * 1000);
                    stdSum += (stdPerBirdG * r.liveCount);
                });
                if (stdSum > 0) feedPerfRatio = actualSum / stdSum;
            }

            // ===== معدل نفوق يومي متوقع (متوسط آخر 7 أيام فعلية كنسبة من الأعداد الحية) =====
            const recentMortRecs = m.series.filter(r => r.age > 0).slice(-7);
            // ⚠️ إصلاح: كان بيستخدم المتوسط الحسابي، فيوم نفوق استثنائي واحد (حدث عابر انتهى) بيتراكب
            // أُسّيًا على توقع 21 يوم قادمة. دلوقتي بنستخدم الوسيط (أقاوم للقيم الشاذة من طبيعته).
            const dailyMortRate = getRobustDailyMortRate(recentMortRecs, MAX_PROJECTED_DAILY_MORT_RATE);

            // ===== حد الكثافة الأقصى الآمن حسب نظام التهوية والأرضية (نفس القيم المستخدمة فى توصيات التهوية) =====
            const ventType = b.ventType || 'natural';
            const maxDensity = getMaxSafeDensity(b);
            const effArea = getEffectiveFloorArea(b); // فى البطاريات = مساحة العنبر × عدد الأدوار

            // ===== سقف واقعي لعمر البيع: العمر المستهدف اللي المربي حدده للدفعة (b.targetAge) لو موجود،
            // وإلا عمر الدورة القياسي للسلالة من الكتالوج (مثلاً 42 يوم للبروللر روص/كوب) =====
            // ⚠️ إصلاح: بدون السقف ده، اللوب كان بيمتد لحد +21 يوم من غير أي علاقة بعمر البيع الواقعي،
            // وجدول النمو المرجعي فيه نقاط بيانات لحد يوم 49 (قياسية/نظرية)، فكان ممكن النظام يوصي
            // بالاستمرار لحد يوم 49 لو الربح الحدي النظري فضل موجب — رقم محدش بيستمر لحد بيه فعليًا فى التربية،
            // خصوصًا للبروللر اللي بيتباع غالبًا فى حدود 32-40 يوم.
            const speciesData = getSpeciesData(b.species, b.breed);
            const practicalMaxAge = b.targetAge > 0 ? b.targetAge : (speciesData.cycleDays || (startAge + 21));
            const dayCeiling = Math.min(startAge + 21, Math.max(practicalMaxAge, startAge));

            const rows = [];
            let optimalDay = null, densityLimitDay = null;
            let liveProj = m.liveCount;
            for (let day = startAge; day <= dayCeiling; day++) {
                if (day > startAge) liveProj = Math.max(liveProj * (1 - dailyMortRate), 0);
                const stdWToday = getRefValue(b, 'weight', day) || 0;
                const stdWYesterday = getRefValue(b, 'weight', day - 1) || 0;
                const projWToday = stdWToday * weightRatio;
                const projWYesterday = stdWYesterday * weightRatio;
                const gainG = Math.max(projWToday - projWYesterday, 0);
                const refs = getRefsForDay(b, day);
                const feedKgPerBird = ((refs.feed || 0) / 1000) * feedPerfRatio;
                // الربح الحدي هنا لإجمالي القطيع المتوقع (مش للطائر الواحد) — بيعكس تلقائيًا تناقص الأعداد بالنفوق
                const marginalRevenue = liveProj * (gainG / 1000) * salePrice;
                const marginalCost = liveProj * feedKgPerBird * feedPrice;
                const marginalProfit = marginalRevenue - marginalCost;
                // سعر التعادل للكيلو (مستقل عن حجم القطيع): أقل سعر بيع لازم البورصة توصله عشان يوم إضافي يفضل مجدي
                const breakEvenPrice = gainG > 0 ? (feedKgPerBird * feedPrice) / (gainG / 1000) : null;
                const projBiomassKg = (liveProj * projWToday) / 1000;
                const projDensity = effArea > 0 ? projBiomassKg / effArea : null;
                const densityUnsafe = projDensity != null && projDensity >= maxDensity;
                if (densityUnsafe && densityLimitDay == null) densityLimitDay = day;
                const survivalPct = m.liveCount > 0 ? (liveProj / m.liveCount) * 100 : 100;
                rows.push({ day, gainG, feedKgPerBird, marginalRevenue, marginalCost, marginalProfit, breakEvenPrice,
                    liveProj, survivalPct, projDensity, densityUnsafe });
                if (marginalProfit > 0) optimalDay = day;
            }
            // أول يوم بعد آخر يوم مربح حديًا يمثل بداية التراجع الاقتصادي
            const firstUnprofitableRow = rows.find(r => r.day > (optimalDay || 0) && r.marginalProfit <= 0);
            const economicOptimalDay = optimalDay || startAge;
            // اليوم الموصى به اقتصاديًا/كثافةً = الأقرب بين حد الجدوى الاقتصادية وحد الكثافة الآمنة (أيهما جه الأول هو الحاكم)
            const rawOptimalDay = densityLimitDay ? Math.min(economicOptimalDay, densityLimitDay) : economicOptimalDay;
            // ===== سلامة غذائية: لا يجوز أن يكون يوم البيع الموصى به قبل نهاية فترة سحب أي دواء/مضاد حيوي نشط =====
            // فترة السحب حَدّ أدنى (أرضية) وليست عاملًا اقتصاديًا — لها أولوية مطلقة فوق أي ربح أو كثافة.
            let withdrawalSafeDay = null, withdrawalItemName = null;
            [...(b.feedAdditives || []), ...(b.waterAdditives || [])].forEach(a => {
                if (!a.active || !a.withdrawalDays) return;
                const { to } = additiveDayRange(a);
                const candidate = to + a.withdrawalDays;
                if (withdrawalSafeDay == null || candidate > withdrawalSafeDay) { withdrawalSafeDay = candidate; withdrawalItemName = a.name; }
            });
            // إضافات/جرعات خارج الجدول بفترة سحب > 0 — نفس منطق السلامة الغذائية بس الجرعة نقطية (يوم واحد) مش نطاق
            (b.quickInterventions || []).forEach(qi => {
                if (!qi.withdrawalDays) return;
                const doseAge = daysBetween(b.startDate, qi.date);
                const candidate = doseAge + qi.withdrawalDays;
                if (withdrawalSafeDay == null || candidate > withdrawalSafeDay) { withdrawalSafeDay = candidate; withdrawalItemName = qi.name; }
            });
            const withdrawalOverride = withdrawalSafeDay != null && withdrawalSafeDay > rawOptimalDay;
            const finalOptimalDay = withdrawalOverride ? withdrawalSafeDay : rawOptimalDay;
            const limitingFactor = withdrawalOverride ? 'withdrawal' : (densityLimitDay && densityLimitDay < economicOptimalDay) ? 'density' : 'economic';
            // ===== ربط تلقائي بمخزون العلف: هل الكمية المتوفرة فعلًا هتكفي للوصول ليوم البيع الأمثل؟ =====
            let feedSufficiency = null;
            const ff = computeFeedForecast(b, m, finalOptimalDay - m.todayAge + 1);
            if (ff.currentBalanceKg != null) {
                const rowAtOptimal = ff.rows.find(r => r.day === finalOptimalDay) || ff.rows[ff.rows.length - 1];
                const neededKg = rowAtOptimal ? rowAtOptimal.cumFeedKg : 0;
                feedSufficiency = { neededKg, balanceKg: ff.currentBalanceKg, shortfallKg: Math.max(neededKg - ff.currentBalanceKg, 0),
                    sufficient: ff.currentBalanceKg >= neededKg };
            }
            return { rows, optimalDay: finalOptimalDay, economicOptimalDay, densityLimitDay, limitingFactor,
                withdrawalSafeDay, withdrawalItemName,
                feedPrice, salePrice, priceSource, feedPriceInfo, feedSufficiency,
                weightRatio, weightDataPoints, feedPerfRatio, dailyMortRate, maxDensity, ventType,
                turningPoint: firstUnprofitableRow ? firstUnprofitableRow.day : null };
        }



        // ============ سجل سعر بورصة الدواجن اليومي (يدوي، لكل دفعة) ============
        // بورصة الدواجن الحية بتتغيّر يوميًا وأحيانًا أكتر من مرة فى اليوم، وهي المرجع الفعلي اللي المربي بيبيع
        // على أساسه — مش سعر بيع قديم اتسجل فى دفعة سابقة. هنا بنسجّل آخر سعر بورصة يدخله المربي مع تاريخه،
        // عشان نقدر: (1) نستخدمه فورًا فى حساب نقطة البيع الاقتصادية المثلى، و(2) نبني اتجاه بسيط (طالع/نازل)
        // يساعد فى قرار "أبيع دلوقتي ولا أستنى".
        function getBatchMarketPriceLog(b) { return Array.isArray(b.marketPriceLog) ? b.marketPriceLog : []; }
        function getLatestMarketPrice(b) {
            const log = getBatchMarketPriceLog(b);
            return log.length ? log[log.length - 1].price : null;
        }
        function recordMarketPrice(b, price) {
            price = parseFloat(price);
            if (!(price > 0)) return false;
            if (!Array.isArray(b.marketPriceLog)) b.marketPriceLog = [];
            const today = todayStr();
            const last = b.marketPriceLog[b.marketPriceLog.length - 1];
            if (last && last.date === today) last.price = price; // تحديث سعر اليوم نفسه لو اتعدّل أكتر من مرة
            else b.marketPriceLog.push({ date: today, price });
            if (b.marketPriceLog.length > 30) b.marketPriceLog = b.marketPriceLog.slice(-30); // آخر 30 يوم يكفي للاتجاه
            return true;
        }
        // توصية بيع مبنية على: آخر سعر بورصة مُسجَّل + اتجاهه + الربح الحدي لليوم القادم مباشرة
        // ============ الكثافة القصوى الآمنة حسب نظام التهوية والأرضية (كجم/م²) — دالة موحّدة يُعاد استخدامها فى أكثر من مكان ============
        function getMaxSafeDensity(b) {
            const ventType = b.ventType || 'natural';
            const floorType = b.floorType || 'litter';
            let maxDensity = ventType === 'tunnel' ? 35 : ventType === 'mixed' ? 30 : 26;
            if (floorType === 'slat') maxDensity += 2;
            return maxDensity;
        }
        function computeMarketSaleAdvice(b, m, fin) {
            const log = getBatchMarketPriceLog(b);
            const latestPrice = log.length ? log[log.length - 1].price : null;
            const priceForCalc = latestPrice != null ? latestPrice : (fin.avgSalePrice > 0 ? fin.avgSalePrice : null);
            const osd = computeOptimalSaleDay(b, m, fin, priceForCalc);
            if (!osd) return { osd: null, log };
            let trend = null;
            if (log.length >= 2) {
                const prev = log[log.length - 2].price;
                const diffPct = prev > 0 ? ((latestPrice - prev) / prev) * 100 : 0;
                trend = { prevDate: log[log.length - 2].date, prevPrice: prev, diffPct,
                    direction: diffPct > 0.5 ? 'up' : diffPct < -0.5 ? 'down' : 'flat' };
            }
            const nextRow = osd.rows.find(r => r.day === m.todayAge + 1);
            let advice, adviceColor, adviceIcon;
            if (!nextRow || osd.priceSource === 'none') {
                advice = 'أدخل سعر البورصة الحالي للكيلو الحي عشان تظهر التوصية';
                adviceColor = 'var(--muted)'; adviceIcon = '➖';
            } else if (nextRow.densityUnsafe) {
                adviceIcon = '⚠️';
                adviceColor = 'var(--red)';
                advice = `الكثافة المتوقعة غدًا (${fmt(nextRow.projDensity,1)} كجم/م²) هتوصل أو تتخطى الحد الآمن (${osd.maxDensity} كجم/م²) لنظام تهويتك — يفضّل البيع الآن حتى لو الربح الحدي لسه موجب، لتفادي إجهاد حراري ونفوق إضافي`;
            } else if (nextRow.marginalProfit > 0) {
                adviceIcon = '✅';
                adviceColor = 'var(--green)';
                advice = (trend && trend.direction === 'down')
                    ? `الاستمرار يوم إضافي لسه مجدي بالسعر الحالي، لكن البورصة نازلة (${fmt(Math.abs(trend.diffPct),1)}% عن آخر سعر مسجّل) — راقبها يوميًا وممكن الوضع ينقلب`
                    : 'الاستمرار يوم إضافي فى التسمين لسه مجدي اقتصاديًا بسعر البورصة الحالي، وكثافة العنبر لسه فى نطاق آمن';
            } else {
                adviceIcon = '🔴';
                adviceColor = 'var(--red)';
                advice = `سعر البورصة الحالي (${fmt(priceForCalc,2)} ج/كجم) أقل من سعر التعادل المطلوب (${fmt(nextRow.breakEvenPrice,2)} ج/كجم) للاستمرار يوم إضافي — الأفضل البيع الآن ولا تستنى`;
            }
            return { osd, trend, latestPrice, priceForCalc, nextRow, advice, adviceColor, adviceIcon, log };
        }
        // يتنفّذ من زرار "حفظ السعر" بجوار حقل إدخال البورصة داخل بطاقة نقطة البيع المثلى
        function updateMarketPrice(batchId) {
            if (!requirePermission('production')) return; // 🔒 Red Team fix (جولة 3): تسجيل يومي روتيني
            const input = document.getElementById('marketPriceInput_' + batchId);
            if (!input) return;
            const price = parseFloat(input.value);
            if (!(price > 0)) { showToast('أدخل سعر بورصة صحيح أكبر من صفر'); return; }
            const b = state.batches.find(x => x.id === batchId);
            if (!b) return;
            recordMarketPrice(b, price);
            persist();
            refreshOptimalSaleCard(batchId);
            showToast('✅ اتسجّل سعر البورصة');
        }
        // يتنفّذ من الحقل السريع أعلى الداشبورد — نفس منطق updateMarketPrice لكن بيعمل render() كامل
        // عشان يحدّث كل حاجة مبنية على السعر (التوصيات، التنبيهات، الرسم البياني) بضغطة واحدة من فتح التطبيق
        function updateMarketPriceFromDashboard(batchId) {
            if (!requirePermission('production')) return; // 🔒 Red Team fix (جولة 3)
            const input = document.getElementById('dashMarketPriceInput_' + batchId);
            if (!input) return;
            const price = parseFloat(input.value);
            if (!(price > 0)) { showToast('أدخل سعر بورصة صحيح أكبر من صفر'); return; }
            const b = state.batches.find(x => x.id === batchId);
            if (!b) return;
            recordMarketPrice(b, price);
            persist();
            showToast('✅ اتسجّل سعر البورصة');
            render();
        }
        // معاينة فورية أثناء الكتابة (زي محاكاة "ماذا لو") بدون حفظ — تحدّث الجدول والتوصية فقط
        function previewMarketPrice(batchId) {
            const input = document.getElementById('marketPriceInput_' + batchId);
            if (!input) return;
            const price = parseFloat(input.value);
            const b = state.batches.find(x => x.id === batchId);
            if (!b) return;
            const m = computeMetrics(b);
            const fin = computeFinance(b, m);
            const body = document.getElementById('optimalSaleCardResult_' + batchId);
            if (body) body.innerHTML = renderOptimalSaleCardResult(b, m, fin, (price > 0 ? price : null));
        }
        function refreshOptimalSaleCard(batchId) {
            const b = state.batches.find(x => x.id === batchId);
            if (!b) return;
            const m = computeMetrics(b);
            const fin = computeFinance(b, m);
            const wrap = document.getElementById('optimalSaleCard_' + batchId);
            if (wrap) wrap.outerHTML = renderOptimalSaleCard(b, m, fin);
        }
        // جسم البطاقة: التوصية + الجدول — بيتغيّر لوحده مع كل تغيير فى سعر البورصة (معاينة أو محفوظ)
        function renderOptimalSaleCardResult(b, m, fin, previewPrice) {
            const adv = computeMarketSaleAdvice(b, m, fin);
            // لو فيه سعر معاينة مكتوب فى الحقل، استخدمه بدل آخر سعر محفوظ (بدون تعديل السجل المحفوظ)
            const osd = (previewPrice != null) ? computeOptimalSaleDay(b, m, fin, previewPrice) : adv.osd;
            if (!osd) return `<p style="font-size:11.5px;color:var(--muted);">أدخل سعر العلف وسعر البورصة الحالي (أو سجّل مبيعة واحدة على الأقل) عشان تظهر هذه النقطة.</p>`;
            const priceSrcTxt = osd.priceSource === 'market'
                ? 'سعر البورصة اليدوي المُدخل' + (previewPrice != null ? ' (معاينة لحظية غير محفوظة)' : '')
                : osd.priceSource === 'sales' ? 'متوسط سعر بيع فعلي من مبيعات مُسجَّلة (لا يوجد سعر بورصة مُدخل)'
                : '—';
            const feedSrcTxt = osd.feedPriceInfo.source === 'purchases'
                ? `سعر علف فعلي مرجّح من آخر ${osd.feedPriceInfo.purchasesUsed} عملية شراء (حتى ${osd.feedPriceInfo.asOf})`
                : 'سعر العلف الافتراضي المُدخل عند إنشاء الدفعة (لا توجد مشتريات علف مسجَّلة بعد لحساب سعر فعلي)';
            const trendHtml = (previewPrice == null && adv.trend) ? `
                ${statLine(`اتجاه البورصة عن آخر سعر مسجَّل (${adv.trend.prevDate})`, `${adv.trend.direction==='up'?'📈 طالعة':adv.trend.direction==='down'?'📉 نازلة':'➖ مستقرة'} ${adv.trend.diffPct>=0?'+':''}${fmt(adv.trend.diffPct,1)}%`, {vStyle:`color:${adv.trend.direction==='up'?'var(--green)':adv.trend.direction==='down'?'var(--red)':'var(--muted)'};font-weight:800;`})}` : '';
            const adviceHtml = (previewPrice == null) ? `
                <div class="stat-line" style="background:${adv.adviceColor}14;border-radius:8px;padding:8px;margin:4px 0;">
                <span class="k" style="font-weight:800;color:${adv.adviceColor};">${adv.adviceIcon} التوصية</span></div>
                <p style="font-size:11.5px;color:${adv.adviceColor};font-weight:700;margin:0 0 8px;">${adv.advice}</p>` : '';
            // ===== أساس الإسقاط: هل مبني على أداء فعلي مُقاس ولا لسه بيعتمد على المرجعي بالكامل؟ =====
            const weightBasisTxt = osd.weightDataPoints > 0
                ? `الوزن الفعلي ${osd.weightRatio >= 1 ? 'أعلى من' : 'أقل من'} المرجعي بنسبة ${fmt(Math.abs((osd.weightRatio-1)*100),1)}% (من آخر ${osd.weightDataPoints} وزنة فعلية مُقاسة)`
                : 'لا توجد أوزان فعلية مُقاسة بعد — الإسقاط مبني على المنحنى المرجعي للسلالة فقط، سجّل وزن فعلي عشان تظهر النتيجة أدق';
            const feedBasisTxt = `استهلاك العلف الفعلي ${osd.feedPerfRatio >= 1 ? 'أعلى من' : 'أقل من'} المرجعي بنسبة ${fmt(Math.abs((osd.feedPerfRatio-1)*100),1)}%`;
            const mortBasisTxt = `معدل نفوق يومي متوقع ${fmt(osd.dailyMortRate*100,2)}% (من متوسط آخر 7 أيام فعلية)`;
            const limitingFactorHtml = osd.limitingFactor === 'withdrawal'
                ? `${statLine(`⛔ العامل الحاكم: فترة سحب دواء نشطة`, `"${osd.withdrawalItemName}" — لا يجوز الذبح قبل يوم ${osd.withdrawalSafeDay} (سلامة غذائية، أولوية فوق أي عامل اقتصادي أو كثافة)`, {kStyle:`font-weight:900;color:var(--red);`})}`
                : osd.limitingFactor === 'density'
                ? `${statLine(`⚠️ العامل الحاكم: الكثافة/المساحة`, `تتخطى ${osd.maxDensity} كجم/م² يوم ${osd.densityLimitDay} قبل ما الربح الحدي ينتهي أصلًا (يوم ${osd.economicOptimalDay})`, {kStyle:`font-weight:800;color:var(--red);`})}`
                : (osd.densityLimitDay ? `${statLine(`🌡️ الكثافة هتتخطى الحد الآمن يوم ${osd.densityLimitDay}`, `(بعد نقطة البيع الاقتصادية، مش هي الحاكمة)`, {vStyle:`color:var(--muted);`})}` : '');
            return `
            <p style="font-size:11px;color:var(--muted);margin:-2px 0 8px;">مبنية على سعر علف ${fmt(osd.feedPrice,2)} ج/كجم (${feedSrcTxt}) وسعر بيع ${fmt(osd.salePrice,2)} ج/كجم (${priceSrcTxt}) — كل يوم إضافي بعده الربح الحدي بيقل عن تكلفة العلف الإضافي بيبقى غير مجدٍ اقتصاديًا</p>
            <div style="background:var(--cream);border-radius:8px;padding:8px;margin-bottom:8px;font-size:11px;line-height:1.7;">
                <div>📏 ${weightBasisTxt}</div>
                <div>🌾 ${feedBasisTxt}</div>
                <div>💀 ${mortBasisTxt}</div>
            </div>
            ${trendHtml}
            ${adviceHtml}
            ${statLine(`أفضل يوم مُوصى به للبيع`, `يوم ${osd.optimalDay}`, {lineStyle:`border-top:2px solid var(--barn-dark);padding-top:8px;`, kStyle:`font-weight:900;color:var(--barn-dark);`, vStyle:`color:${osd.limitingFactor==='withdrawal'?'var(--red)':'var(--green)'};font-size:16px;`})}
            ${limitingFactorHtml}
            ${osd.turningPoint ? `${statLine(`بعد يوم ${osd.turningPoint} الربح الحدي لإجمالي القطيع يبقى سالب/معدوم`, `⚠️`)}` : `${statLine(`الربح الحدي مستمر موجب حتى نهاية الأفق المحسوب (21 يوم إضافي)`, `➖`)}`}
            ${osd.feedSufficiency ? (osd.feedSufficiency.sufficient
                ? `${statLine(`🌾 مخزون العلف الحالي (${fmt(osd.feedSufficiency.balanceKg,0)} كجم)`, `✅ يكفي للوصول ليوم ${osd.optimalDay}`, {vStyle:`color:var(--green);`})}`
                : `${statLine(`🌾 مخزون العلف الحالي (${fmt(osd.feedSufficiency.balanceKg,0)} كجم)`, `⚠️ ناقص ${fmt(osd.feedSufficiency.shortfallKg,0)} كجم للوصول ليوم ${osd.optimalDay}`, {vStyle:`color:var(--red);font-weight:800;`})}`
              ) : ''}
            <div style="overflow-x:auto;margin-top:6px;">
            <table class="feas-scenario-table">
                <thead><tr><th>اليوم</th><th>الأعداد المتوقعة</th><th>الكثافة كجم/م²</th><th>الربح الحدي للقطيع</th><th>سعر التعادل/كجم</th></tr></thead>
                <tbody>
                    ${osd.rows.slice(0, 10).map(r => `<tr><td>${r.day}${r.day===osd.optimalDay?' 🏆':''}</td><td>${fmt(r.liveProj,0)} <span style="color:var(--muted);font-size:10px;">(${fmt(r.survivalPct,1)}%)</span></td><td style="color:${r.densityUnsafe?'var(--red)':'inherit'};font-weight:${r.densityUnsafe?'800':'400'};">${r.projDensity!=null?fmt(r.projDensity,1)+(r.densityUnsafe?' ⚠️':''):'—'}</td><td style="color:${r.marginalProfit>=0?'var(--green)':'var(--red)'};font-weight:800;">${money(r.marginalProfit)}</td><td>${r.breakEvenPrice!=null?fmt(r.breakEvenPrice,2)+' ج':'—'}</td></tr>`).join('')}
                </tbody>
            </table>
            </div>`;
        }
        // البطاقة كاملة: عنوان + حقل إدخال البورصة + زرار حفظ + النتيجة (renderOptimalSaleCardResult)
        function renderOptimalSaleCard(b, m, fin) {
            const latest = getLatestMarketPrice(b);
            return `
            <div class="feas-sub-card" id="optimalSaleCard_${b.id}">
                <h4>🎯 نقطة البيع الاقتصادية المثلى (حسب بورصة الدواجن)</h4>
                <div class="form-grid" style="margin-bottom:6px;">
                    <div class="field"><label>سعر البورصة الحالي (ج/كجم حي)</label>
                        <input id="marketPriceInput_${b.id}" type="number" step="0.05" min="0" placeholder="مثال: 47.5"
                            value="${latest != null ? latest : ''}" oninput="previewMarketPrice('${b.id}')" style="width:100%;"></div>
                </div>
                <button class="btn gold sm owner-only" onclick="updateMarketPrice('${b.id}')" style="margin-bottom:8px;">💾 حفظ سعر البورصة لليوم</button>
                <div id="optimalSaleCardResult_${b.id}">${renderOptimalSaleCardResult(b, m, fin, null)}</div>
            </div>`;
        }

        // ============ توقع استهلاك العلف المستقبلي وربطه بالمخزون الفعلي (بدل متوسط تاريخي ثابت) ============
        // المشكلة اللي بيحلّها: تقدير "أيام التغطية المتبقية" فى تبويب المخزون كان بيعتمد على متوسط الصرف الفعلي
        // آخر 14 يوم ثابت — وده دايمًا بيقلّل التقدير لأن استهلاك الفرخة بيتصاعد يوميًا مع تقدم العمر (منحنى نمو
        // متسارع طبيعيًا). هنا بنسقط الأيام القادمة يوم بيوم باستخدام منحنى الاستهلاك المرجعي للسلالة، معدَّل
        // بـ"نسبة أداء" الدفعة الفعلية (لو بتاكل أكتر/أقل من المعيار بنسبة ثابتة، بنفترض استمرارها)، مع خصم نفوق
        // متوقع بنفس معدل النفوق الأخير الفعلي بدل تثبيت عدد الطيور الحي.
        function computeFeedForecast(b, m, horizonDaysIn) {
            // بنحدد صنف العلف "الحالي" من آخر سجل يومي فيه اختيار صنف مسجَّل (ده الصنف اللي فعليًا
            // بتتغذى عليه الدفعة دلوقتي)، مش أول صنف "علف" فى المخزن كيفما اتفق — عشان لو عندك
            // أصناف منفصلة (بادئ/نامي/ناهي) التوقع والتنبيه يبقوا مربوطين بالصنف الصح فعلاً.
            const feedInvItems = (b.inventory || []).filter(it => it.category === 'علف');
            const lastFeedRec = [...b.records].sort((a, c) => a.age - c.age).reverse().find(r => r.feedItem);
            let feedItem = lastFeedRec ? feedInvItems.find(it => it.name === lastFeedRec.feedItem) : null;
            if (!feedItem) feedItem = feedInvItems[0]; // احتياطي: سجلات قديمة بدون صنف محدد، أو مفيش سجلات لسه
            const currentBalanceKg = feedItem ? convertUnitQty(feedItem.balance, feedItem.unit, 'كجم') : null;
            const todayAge = m.todayAge;
            // نسبة أداء استهلاك العلف الفعلي مقابل المعيار — من آخر 5 سجلات فيها علف وأعداد حية فعلية
            const recentFeedRecs = m.series.filter(r => r.age > 0 && r.feed != null && r.liveCount > 0 && r.feedDay != null && r.feedNight != null).slice(-5);
            let perfRatio = 1;
            if (recentFeedRecs.length >= 2) {
                let actualSum = 0, stdSum = 0;
                recentFeedRecs.forEach(r => {
                    const stdPerBirdG = getRefsForDay(b, r.age).feed;
                    actualSum += (r.feed * 1000);
                    stdSum += (stdPerBirdG * r.liveCount);
                });
                if (stdSum > 0) perfRatio = actualSum / stdSum;
            }
            // معدل نفوق يومي أخير (متوسط آخر 7 أيام كنسبة من الأعداد الحية) لإسقاط عدد الطيور مستقبلًا بدل تثبيته
            const recentMortRecs = m.series.filter(r => r.age > 0).slice(-7);
            let dailyMortRate = 0;
            if (recentMortRecs.length) {
                const totalMort = recentMortRecs.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0);
                const avgLive = recentMortRecs.reduce((s, r) => s + r.liveCount, 0) / recentMortRecs.length;
                if (avgLive > 0) dailyMortRate = Math.min((totalMort / recentMortRecs.length) / avgLive, MAX_PROJECTED_DAILY_MORT_RATE);
            }
            const horizon = horizonDaysIn || Math.max((b.targetAge || todayAge + 21) - todayAge, 21);
            let liveProj = m.liveCount;
            let cumFeedKg = 0;
            const rows = [];
            for (let i = 1; i <= horizon; i++) {
                const day = todayAge + i;
                liveProj = Math.max(liveProj * (1 - dailyMortRate), 0);
                const stdPerBirdG = getRefsForDay(b, day).feed;
                const projPerBirdG = Math.max(stdPerBirdG * perfRatio, 0);
                const dayFeedKg = (projPerBirdG * liveProj) / 1000;
                cumFeedKg += dayFeedKg;
                rows.push({ day, liveProj, dayFeedKg, cumFeedKg });
            }
            // أول يوم هينفد فيه المخزون الفعلي بناءً على هذا التوقع المتصاعد (بدل متوسط ثابت)
            let stockOutInDays = null, stockOutAge = null;
            if (currentBalanceKg != null) {
                const row = rows.find(r => r.cumFeedKg >= currentBalanceKg);
                if (row) { stockOutInDays = row.day - todayAge; stockOutAge = row.day; }
            }
            const feedToTargetKg = (b.targetAge && b.targetAge > todayAge)
                ? (rows.find(r => r.day === b.targetAge) || rows[rows.length - 1] || {}).cumFeedKg : null;
            const shortfallKg = (currentBalanceKg != null && feedToTargetKg != null) ? Math.max(feedToTargetKg - currentBalanceKg, 0) : null;
            return { perfRatio, dailyMortRate, horizon, rows, currentBalanceKg, feedItem,
                stockOutInDays, stockOutAge, feedToTargetKg, shortfallKg };
        }

        function feasCalcDefaults(b, m, fin) {
            const twKg = b.targetWeight ? b.targetWeight / 1000 : (m.avgWeightKg > 0.3 ? m.avgWeightKg : 2.2);
            return {
                count: b.startCount || 0,
                chickPrice: b.chickprice || 0,
                targetWeight: +(+twKg).toFixed(2),
                mortPct: m.mortRate ? +m.mortRate.toFixed(1) : 5,
                fcrExp: m.fcr ? +m.fcr.toFixed(2) : 1.8,
                feedPrice: +(computeActualFeedPrice(b).price || 0).toFixed(2),
                salePrice: fin.avgSalePrice > 0 ? +fin.avgSalePrice.toFixed(2) : 0,
                otherCosts: Math.round((fin.otherDirectCosts || 0) + (fin.customCosts || 0)),
                cycleDays: b.targetAge || Math.max(m.age, 35),
                restDays: AS().restDaysBetweenCycles || 14,
                area: b.area || 0
            };
        }

        function computeFeasCalc(v) {
            const liveBirds = Math.max(v.count * (1 - v.mortPct / 100), 0);
            const totalWeight = liveBirds * v.targetWeight;
            const totalFeed = totalWeight * v.fcrExp;
            const feedCost = totalFeed * v.feedPrice;
            const chickCost = v.count * v.chickPrice;
            const totalCost = feedCost + chickCost + v.otherCosts;
            const revenue = totalWeight * v.salePrice;
            const profit = revenue - totalCost;
            const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
            const costPerKg = totalWeight > 0 ? totalCost / totalWeight : 0;
            const profitPerBird = v.count > 0 ? profit / v.count : 0;
            const totalCycleDays = (v.cycleDays || 0) + (v.restDays || 0);
            const cyclesPerYear = totalCycleDays > 0 ? 365 / totalCycleDays : 0;
            const annualProfit = profit * cyclesPerYear;
            const density = (v.area > 0) ? totalWeight / v.area : null;
            return { liveBirds, totalWeight, totalFeed, feedCost, chickCost, totalCost, revenue, profit, roi, costPerKg, profitPerBird, cyclesPerYear, annualProfit, density };
        }

        function feasVerdictOf(roi, hasCost) {
            if (!hasCost) return { txt: 'لا توجد بيانات كافية بعد', col: 'var(--muted)' };
            if (roi >= 25) return { txt: '✅ جدوى ممتازة', col: 'var(--green)' };
            if (roi >= 15) return { txt: '👍 جدوى جيدة', col: 'var(--green)' };
            if (roi >= 5) return { txt: '⚠️ جدوى مقبولة', col: 'var(--wheat)' };
            if (roi >= 0) return { txt: '⚠️ جدوى ضعيفة — تحتاج تحسين', col: 'var(--wheat)' };
            return { txt: '🔴 خسارة متوقعة — راجع الأسعار', col: 'var(--red)' };
        }

        function recalcFeasCalc() {
            const ids = ['count', 'chickPrice', 'targetWeight', 'mortPct', 'fcrExp', 'feedPrice', 'salePrice', 'otherCosts', 'cycleDays', 'restDays', 'area'];
            const v = {};
            ids.forEach(id => { const el = document.getElementById('fc_' + id); v[id] = el ? (parseFloat(el.value) || 0) : 0; });
            const r = computeFeasCalc(v);
            const set = (id, text, color) => { const el = document.getElementById(id); if (el) { el.textContent = text; if (color) el.style.color = color; } };
            set('fcOut_revenue', money(r.revenue));
            set('fcOut_cost', money(r.totalCost));
            set('fcOut_profit', money(r.profit), r.profit >= 0 ? 'var(--green)' : 'var(--red)');
            set('fcOut_costPerKg', fmt(r.costPerKg, 2) + ' ج/كجم');
            set('fcOut_profitPerBird', fmt(r.profitPerBird, 2) + ' ج', r.profitPerBird >= 0 ? 'var(--green)' : 'var(--red)');
            set('fcOut_roi', fmt(r.roi, 1) + '%', r.roi >= 0 ? 'var(--green)' : 'var(--red)');
            set('fcOut_annualProfit', money(r.annualProfit), r.annualProfit >= 0 ? 'var(--green)' : 'var(--red)');
            const densityRow = document.getElementById('fcOut_densityRow');
            if (densityRow) {
                if (r.density != null) {
                    const b = getActiveBatch();
                    const maxD = b ? getMaxSafeDensity(b) : 26;
                    densityRow.style.display = '';
                    set('fcOut_density', fmt(r.density, 1) + ' كجم/م² (الحد الآمن ~' + maxD + ')', r.density >= maxD ? 'var(--red)' : 'var(--green)');
                } else { densityRow.style.display = 'none'; }
            }
            const verdictEl = document.getElementById('fcOut_verdict');
            if (verdictEl) {
                const vd = feasVerdictOf(r.roi, v.count > 0);
                verdictEl.textContent = vd.txt;
                verdictEl.style.color = vd.col;
                verdictEl.style.background = vd.col + '1a';
                verdictEl.style.borderColor = vd.col + '55';
            }
        }

        function renderFeasCalc(b, m, fin) {
            const d = feasCalcDefaults(b, m, fin);
            const r = computeFeasCalc(d);
            const vd = feasVerdictOf(r.roi, d.count > 0);
            const field = (id, label, val, step, unit) => `
                <div class="fc-field">
                    <label>${label}</label>
                    <div class="fc-input-wrap"><input type="number" id="fc_${id}" value="${val}" step="${step}" oninput="recalcFeasCalc()"><span class="fc-unit">${unit || ''}</span></div>
                </div>`;
            return `
            <div class="feas-sub-card">
                <h4>🧮 حاسبة الجدوى التفاعلية — جرّب أسعارك</h4>
                <p style="font-size:11px;color:var(--muted);margin:-2px 0 10px;line-height:1.6;">القيم المبدئية مأخوذة من بيانات الدفعة الحالية — غيّر أي سعر أو رقم وسيتحدث الربح/الخسارة فورًا بدون حفظ.</p>
                <div class="fc-grid">
                    ${field('count', 'عدد الكتاكيت', d.count, 1)}
                    ${field('chickPrice', 'سعر الكتكوت', d.chickPrice, 0.1, 'ج')}
                    ${field('targetWeight', 'وزن البيع المستهدف', d.targetWeight, 0.05, 'كجم')}
                    ${field('mortPct', 'نسبة النفوق المتوقعة', d.mortPct, 0.5, '%')}
                    ${field('fcrExp', 'FCR المتوقع', d.fcrExp, 0.01)}
                    ${field('feedPrice', 'سعر كيلو العلف', d.feedPrice, 0.1, 'ج')}
                    ${field('salePrice', 'سعر بيع كيلو اللحم', d.salePrice, 0.1, 'ج')}
                    ${field('otherCosts', 'تكاليف أخرى للدورة', d.otherCosts, 10, 'ج')}
                    ${field('cycleDays', 'مدة الدورة', d.cycleDays, 1, 'يوم')}
                    ${field('restDays', 'أيام راحة بين الدورات', d.restDays, 1, 'يوم')}
                    ${field('area', 'مساحة العنبر (لحساب الكثافة)', d.area, 0.5, 'م²')}
                </div>
                <div class="fc-results">
                    ${statLine(`إجمالي الإيرادات المتوقعة`, `${money(r.revenue)}`, {vStyle:`color:var(--green);`,vId:`fcOut_revenue`})}
                    ${statLine(`إجمالي التكاليف المتوقعة`, `${money(r.totalCost)}`, {vStyle:`color:var(--red);`,vId:`fcOut_cost`})}
                    ${statLine(`صافي الربح/الخسارة المتوقع`, `${money(r.profit)}`, {lineStyle:`border-top:2px solid var(--barn-dark);padding-top:8px;`, kStyle:`font-weight:900;color:var(--barn-dark);`, vId:`fcOut_profit`, vStyle:`font-size:17px;color:${r.profit >= 0 ? 'var(--green)' : 'var(--red)'};`})}
                    ${statLine(`تكلفة الكيلو`, `${fmt(r.costPerKg, 2)} ج/كجم`, {vId:`fcOut_costPerKg`})}
                    ${statLine(`ربح/خسارة الطائر`, `${fmt(r.profitPerBird, 2)} ج`, {vId:`fcOut_profitPerBird`, vStyle:`color:${r.profitPerBird >= 0 ? 'var(--green)' : 'var(--red)'};`})}
                    ${statLine(`العائد على التكلفة ROI`, `${fmt(r.roi, 1)}%`, {vId:`fcOut_roi`, vStyle:`color:${r.roi >= 0 ? 'var(--green)' : 'var(--red)'};`})}
                    ${statLine(`صافي الربح السنوي المتوقع`, `${money(r.annualProfit)}`, {vId:`fcOut_annualProfit`, vStyle:`color:${r.annualProfit >= 0 ? 'var(--green)' : 'var(--red)'};`})}
                    ${statLine(`🐔 الكثافة الناتجة عند البيع`, `${r.density!=null?fmt(r.density,1)+' كجم/م² (الحد الآمن ~'+getMaxSafeDensity(b)+')':''}`, {lineId:`fcOut_densityRow`, lineStyle:`${r.density==null?'display:none;':''}`, vId:`fcOut_density`, vStyle:`color:${(r.density!=null && r.density>=getMaxSafeDensity(b))?'var(--red)':'var(--green)'};`})}
                </div>
                <div style="text-align:center;margin-top:10px;"><span class="feas-verdict" id="fcOut_verdict" style="background:${vd.col}1a;color:${vd.col};border:1px solid ${vd.col}55;">${vd.txt}</span></div>
            </div>`;
        }

        function renderFeasibilityStudy(b, m, fin) {
            const fs = computeFeasibility(b, m, fin);
            const hasData = fin.totalCosts > 0;
            return `
            <details class="feas-wrap">
                <summary>
                    <div>
                        📈 دراسة جدوى مفصلة لهذا المشروع
                        <span class="sub">${esc(b.name)} · اضغط لعرض التفاصيل الكاملة</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="feas-verdict" style="background:${fs.verdictColor}1a;color:${fs.verdictColor};border:1px solid ${fs.verdictColor}55;">${fs.verdict}</span>
                        <span class="chev">▾</span>
                    </div>
                </summary>
                <div class="feas-body">
                    ${renderFeasCalc(b, m, fin)}
                    ${!hasData ? `<p style="font-size:12.5px;color:var(--muted);">أضف بيانات التكاليف والمبيعات أولاً لعرض دراسة الجدوى الفعلية بناءً على أداء الدفعة.</p>` : `
                    <div class="feas-sub-card">
                        <h4>💵 ربحية الدورة الحالية</h4>
                        ${statLine(`هامش الربح من الإيرادات`, `${fmt(fs.profitMarginPct,1)}%`, {vStyle:`color:${fs.profitMarginPct>=0?'var(--green)':'var(--red)'};`})}
                        ${statLine(`العائد على التكلفة (ROI) لهذه الدورة`, `${fmt(fin.roi,1)}%`, {vStyle:`color:${fin.roi>=0?'var(--green)':'var(--red)'};`})}
                        ${statLine(`تكلفة كجم اللحم`, `${fmt(fin.costPerKg,2)} ج/كجم`)}
                        ${statLine(`سعر التعادل (Break-even)`, `${fmt(fin.breakEvenPrice,2)} ج/كجم`)}
                        ${statLine(`فترة استرداد رأس المال التقديرية`, `${fs.paybackDays!=null?fmt(fs.paybackDays,0)+' يوم':'غير محقق ربح بعد'}`)}
                    </div>

                    <div class="feas-sub-card">
                        <h4>📅 الإسقاط السنوي (تقديري)</h4>
                        ${fs.earlyCycle ? `<p style="font-size:11px;color:var(--red);font-weight:700;margin:-2px 0 8px;">⚠️ الدورة لسه فى بدايتها (يوم ${fmt(m.age,0)} من ${fmt(fs.cycleDays,0)}) — الأرقام دي مبنية على تكاليف/إيرادات جزئية غير مكتملة وممكن تتغيّر بشكل كبير مع تقدّم الدورة، خصوصًا قبل أول عملية بيع.</p>` : ''}
                        <p style="font-size:11px;color:var(--muted);margin:-2px 0 8px;">افتراض: مدة الدورة ${fmt(fs.cycleDays,0)} يوم + ${fs.restDays} يوم راحة/تنظيف وتعقيم بين الدورات ≈ ${fmt(fs.cyclesPerYear,1)} دورة/سنة</p>
                        ${statLine(`إجمالي الإيرادات السنوية المتوقعة`, `${money(fs.annualRevenue)}`, {vStyle:`color:var(--green);`})}
                        ${statLine(`إجمالي التكاليف السنوية المتوقعة`, `${money(fs.annualCosts)}`, {vStyle:`color:var(--red);`})}
                        ${statLine(`صافي الربح السنوي المتوقع`, `${money(fs.annualProfit)}`, {lineStyle:`border-top:2px solid var(--barn-dark);padding-top:8px;`, kStyle:`font-weight:900;color:var(--barn-dark);`, vStyle:`color:${fs.annualProfit>=0?'var(--green)':'var(--red)'};font-size:16px;`})}
                    </div>

                    <div class="feas-sub-card">
                        <h4>🎯 تحليل الحساسية (تأثير تغيّر أسعار العلف والبيع)</h4>
                        <div style="overflow-x:auto;">
                        <table class="feas-scenario-table">
                            <thead><tr><th>السيناريو</th><th>الإيرادات</th><th>التكاليف</th><th>صافي الربح</th><th>ROI</th></tr></thead>
                            <tbody>
                                ${fs.scenarios.map(s => `<tr><td>${s.label}</td><td>${money(s.revenue)}</td><td>${money(s.costs)}</td><td style="color:${s.profit>=0?'var(--green)':'var(--red)'};font-weight:800;">${money(s.profit)}</td><td style="color:${s.roi>=0?'var(--green)':'var(--red)'};">${fmt(s.roi,1)}%</td></tr>`).join('')}
                            </tbody>
                        </table>
                        </div>
                    </div>

                    <div class="feas-sub-card">
                        <h4>🎛️ محاكاة "ماذا لو" (سيناريو مخصّص)</h4>
                        <p style="font-size:11px;color:var(--muted);margin:-2px 0 8px;">حرّك القيم لأي تغيّر متوقع فى سعر العلف أو سعر البيع وشوف الأثر فورًا على صافي الربح — بدون حفظ أو تعديل بيانات الدفعة الفعلية.</p>
                        <div class="form-grid">
                            <div class="field"><label>تغيّر سعر العلف <span id="wf_feedLbl">0%</span></label>
                                <input id="wf_feedPct" type="range" min="-30" max="30" step="1" value="0" oninput="updateWhatIf('${b.id}')" style="width:100%;"></div>
                            <div class="field"><label>تغيّر سعر البيع <span id="wf_revLbl">0%</span></label>
                                <input id="wf_revPct" type="range" min="-30" max="30" step="1" value="0" oninput="updateWhatIf('${b.id}')" style="width:100%;"></div>
                        </div>
                        <div id="wf_result" style="margin-top:6px;">
                            ${statLine(`صافي الربح المتوقع`, `${money(fin.netProfit)}`, {vStyle:`font-weight:900;`})}
                            ${statLine(`العائد على التكلفة (ROI)`, `${fmt(fin.roi,1)}%`)}
                        </div>
                    </div>

                    <div class="feas-sub-card">
                        <h4>🧮 هيكل التكاليف</h4>
                        ${statLine(`العلف`, `${fmt(fs.costShare.feed,1)}%`)}
                        ${statLine(`الكتاكيت`, `${fmt(fs.costShare.chick,1)}%`)}
                        ${statLine(`وقود التدفئة`, `${fmt(fs.costShare.heat,1)}%`)}
                        ${fs.costShare.processing>0?`${statLine(`الذبح والتصنيع`, `${fmt(fs.costShare.processing,1)}%`)}`:''}
                        ${statLine(`باقي التكاليف (أدوية، فرشة، إضافات، عمالة، أخرى)`, `${fmt(fs.costShare.other,1)}%`)}
                    </div>

                    ${renderOptimalSaleCard(b, m, fin)}

                    <p style="font-size:10.5px;color:var(--muted);margin-top:10px;line-height:1.6;">💡 هذه الدراسة تقديرية ومبنية على بيانات الدورة الحالية المُسجَّلة وافتراض ثبات نفس الأداء فى الدورات القادمة. الإسقاط السنوي يفترض تكرار نفس النتائج لكل دورة، وقد تتغير النتائج الفعلية حسب الموسم والأسعار.</p>
                    `}
                </div>
            </details>`;
        }

        // محاكاة "ماذا لو" التفاعلية: تُحسب فى المتصفح لحظيًا من الأسلايدرز، ولا تُحفظ أو تُغيّر بيانات الدفعة الفعلية إطلاقًا
        function updateWhatIf(batchId) {
            const b = state.batches.find(x => x.id === batchId);
            if (!b) return;
            const feedPct = parseFloat(document.getElementById('wf_feedPct').value) || 0;
            const revPct = parseFloat(document.getElementById('wf_revPct').value) || 0;
            document.getElementById('wf_feedLbl').textContent = (feedPct >= 0 ? '+' : '') + feedPct + '%';
            document.getElementById('wf_revLbl').textContent = (revPct >= 0 ? '+' : '') + revPct + '%';
            const m = computeMetrics(b);
            const fin = computeFinance(b, m);
            const newFeedCost = fin.feedCost * (1 + feedPct / 100);
            const newTotalCosts = fin.totalCosts - fin.feedCost + newFeedCost;
            const newRevenue = fin.totalRevenue * (1 + revPct / 100);
            const newProfit = newRevenue - newTotalCosts;
            const newRoi = newTotalCosts > 0 ? (newProfit / newTotalCosts) * 100 : 0;
            const diffProfit = newProfit - fin.netProfit;
            const el = document.getElementById('wf_result');
            if (el) el.innerHTML = `
                ${statLine(`صافي الربح المتوقع`, `${money(newProfit)}`, {vStyle:`font-weight:900;color:${newProfit>=0?'var(--green)':'var(--red)'};`})}
                ${statLine(`العائد على التكلفة (ROI)`, `${fmt(newRoi,1)}%`, {vStyle:`color:${newRoi>=0?'var(--green)':'var(--red)'};`})}
                ${statLine(`الفرق عن الوضع الحالي`, `${diffProfit>=0?'+':''}${money(diffProfit)}`, {vStyle:`color:${diffProfit>=0?'var(--green)':'var(--red)'};`})}`;
        }

        // ============ Alerts engine (with reference deviation) ============
        // ============ مرحلة العلف الحالية (بادئ/نامي/ناهي) بناءً على الاستهلاك الفعلي المتراكم للطائر ============
        // نتابع المرحلة من واقع الاستهلاك الفعلي المسجَّل يوميًا (مش بعدد أيام العمر)، عشان تعكس أداء قطيعك
        // الحقيقي سواء كان بياكل أسرع أو أبطأ من المتوسط. الكمية للطائر تقديرية (إجمالي العلف ÷ متوسط عدد الطيور).
