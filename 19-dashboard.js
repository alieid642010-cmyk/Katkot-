        function computeOpsRisk(b, m) {
            const factors = [];
            let penalty = 0;
            // --- تشيك ليست العمليات: متوسط نسبة الإنجاز خلال آخر 3 أيام فعلية (وليس اليوم فقط، لتفادي التحيز لوقت اليوم) ---
            const total = (b.checklistTemplate || []).length;
            let checklistRate = null;
            if (total > 0) {
                const recentDates = [...new Set((b.records || []).map(r => r.date))].sort().slice(-3);
                const datesToCheck = recentDates.length ? recentDates : [todayStr()];
                const rates = datesToCheck.map(d => {
                    const doneSet = new Set((b.checklistLog || []).filter(l => l.date === d && l.done).map(l => l.taskId));
                    return (b.checklistTemplate.filter(t => doneSet.has(t.id)).length / total) * 100;
                });
                checklistRate = rates.reduce((a, c) => a + c, 0) / rates.length;
                if (checklistRate < 60) {
                    const p = Math.min((60 - checklistRate) * 0.15, 8);
                    factors.push({ label: `انخفاض الالتزام بتشيك ليست العمليات اليومية (${fmt(checklistRate, 0)}% متوسط آخر أيام)`, weight: p });
                    penalty += p;
                }
            }
            // --- الأمان الحيوي: عدد الأيام منذ آخر إجراء مسجّل (تعقيم/مكافحة/تطهير...) ---
            let bioDaysSince = null;
            if (m.todayAge > 3) { // نتجاهل بداية الدورة (أول أيام غالبًا مفيش داعي لإجراء أمان حيوي)
                const lastBio = [...(b.biosecurityLog || [])].sort((a, c) => c.date.localeCompare(a.date))[0];
                bioDaysSince = lastBio ? daysBetween(lastBio.date, todayStr()) : (b.biosecurityLog ? m.todayAge : null);
                if (bioDaysSince != null && bioDaysSince > 10) {
                    const p = Math.min((bioDaysSince - 10) * 0.6, 7);
                    factors.push({ label: `لا توجد إجراءات أمان حيوي مسجّلة منذ ${bioDaysSince} يوم`, weight: p });
                    penalty += p;
                }
            }
            return { checklistRate, bioDaysSince, penalty: Math.min(penalty, 12), factors };
        }

        function computeHealthScore(b, m, alerts, ins, ops) {
            let score = 100;
            const factors = [];
            // النفوق: خصم تدريجي لو تجاوز 3% (معدل مرجعي مقبول لبداية الخصم)
            const mortPenalty = Math.min(Math.max(0, m.mortRate - 3) * 3, 30);
            if (mortPenalty > 0) factors.push({ label: 'نسبة نفوق أعلى من المعتاد', weight: mortPenalty });
            score -= mortPenalty;
            // انحراف الوزن السلبي عن المعياري (الحالة الآنية)
            const weightPenalty = m.weightDiffPct < 0 ? Math.min(Math.abs(m.weightDiffPct) * 1.2, 25) : 0;
            if (weightPenalty > 0) factors.push({ label: 'وزن الدفعة الحالي أقل من المعياري', weight: weightPenalty });
            score -= weightPenalty;
            // التنبيهات النشطة الآن (خطر/تحذير)
            const dangerCount = alerts.filter(a => a.level === 'danger').length;
            const warnCount = alerts.filter(a => a.level === 'warn').length;
            const alertPenalty = Math.min(dangerCount * 6 + warnCount * 2, 30);
            if (alertPenalty > 0) factors.push({ label: `${dangerCount} تنبيه خطر و${warnCount} تحذير نشط الآن`, weight: alertPenalty });
            score -= alertPenalty;
            // ============ عوامل استباقية (تنبؤية): اتجاه الأداء + الوزن المتوقع عند عمر البيع ============
            // بخلاف العوامل أعلاه اللي بتقيس الحالة الآنية، دي بتحاول تكشف تدهورًا قبل ما يظهر بوضوح فى الأرقام الحالية
            if (ins) {
                if (ins.devTrend != null && ins.devTrend < -1) {
                    const trendPenalty = Math.min(Math.abs(ins.devTrend) * 1.5, 15);
                    factors.push({ label: 'الأداء فى تراجع مقارنة ببداية الدورة (مؤشر مبكر)', weight: trendPenalty });
                    score -= trendPenalty;
                }
                if (ins.weightPrediction && ins.weightPrediction.diffPct != null && ins.weightPrediction.diffPct < -3) {
                    const forecastPenalty = Math.min(Math.abs(ins.weightPrediction.diffPct) * 0.8, 15);
                    factors.push({ label: `الوزن المتوقع عند البيع أقل من المعياري بـ ${fmt(Math.abs(ins.weightPrediction.diffPct),1)}%`, weight: forecastPenalty });
                    score -= forecastPenalty;
                }
            }
            // ============ سبب النفوق المسيطر: يُخصم إضافيًا لو كان السبب مرضيًا أو حراريًا وبنسبة معتبرة من القطيع ============
            // ⚠️ إصلاح ازدواج الخصم: العدد نفسه (m.dominantCause.count) مصدره نفس بيانات النفوق اللي أصلاً
            // خصمناها فوق كـ"نسبة نفوق أعلى من المعتاد" (mortPenalty). لو mortPenalty شغّال فعلاً، بند السبب
            // بيبقى إعادة عقاب لنفس الإشارة بزاوية تانية — فبنقلّل وزنه للنص فى الحالة دي، ونسيبه كامل بس
            // لو mortPenalty = صفر (يعني معدل النفوق العام لسه تحت 3% لكن متركّز فى سبب واحد — إشارة مبكرة مستقلة فعلًا).
            if (m.dominantCause && m.dominantCause.count > 0 && b.startCount > 0) {
                const shareOfFlock = (m.dominantCause.count / b.startCount) * 100; // % من إجمالي القطيع الابتدائي
                const causeSeverity = { disease: 2.2, heat: 1.8, trample: 1.2, deform: 0.8, other: 1.0 }[m.dominantCause.key] || 1.0;
                const overlapFactor = mortPenalty > 0 ? 0.5 : 1; // نص الوزن لو النفوق العام اتخصم أصلاً، كامل الوزن لو ده أول إشارة
                const causePenalty = Math.min(shareOfFlock * causeSeverity, 12) * overlapFactor;
                if (causePenalty >= 1.5) {
                    factors.push({ label: `السبب الأساسي للنفوق "${m.dominantCause.label}" يمثل ${fmt(m.dominantCause.pct,0)}% من الحالات المصنّفة — ${mortCauseActionHint(m.dominantCause.key)}`, weight: causePenalty });
                    score -= causePenalty;
                }
            }
            // ============ تجانس القطيع (Uniformity/CV%) — من آخر عيّنة أوزان فردية حديثة ============
            const uniHs = getLatestUniformity(b);
            if (uniHs && uniHs.age >= m.todayAge - 5 && uniHs.cv > 8) {
                const uniPenalty = Math.min((uniHs.cv - 8) * 1.2, 10);
                factors.push({ label: `تجانس القطيع أقل من الهدف الصناعي (تفاوت ${fmt(uniHs.cv,1)}%)`, weight: uniPenalty });
                score -= uniPenalty;
            }
            // ============ ترابط تشيك ليست العمليات والأمان الحيوي (عوامل تشغيلية وقائية) ============
            if (ops && ops.penalty > 0) {
                ops.factors.forEach(f => factors.push(f));
                score -= ops.penalty;
            }
            // ============ 🔴 إصلاح Red Team: نظام هجين — دمج "درجة صحة الدفعة" (حالة آنية) مع "احتمالية مشكلة قادمة" (توقّع إحصائي) ============
            // قبل كده كان فيه رقمين منفصلين للمربي فى مكانين مختلفين وبمقياسين مختلفين (واحد صاعد للأفضل، التاني
            // صاعد للأسوأ)، ورقم "٪x/100" للمخاطر من غير سياق كان مربك فعليًا (مش واضح حجم المشكلة ولا معناها).
            // الحل الهجين هنا: مؤشر واحد بس (نفس مقياس 0-100 القديم كل ما زاد كل ما كان أحسن، عشان الاتجاه
            // ميتقلبش على المستخدم المعتاد عليه)، بيتأثر بخصم إضافي محافظ (25% بس من درجة الخطر الإحصائي) —
            // مش خصم كامل، عشان نتفادى عقاب مزدوج لنفس الإشارة (زي تراجع الوزن اللي أصلًا اتخصم فوق كعامل حالي).
            // وكل سبب من أسباب "احتمالية المشكلة القادمة" بقى بييجي معاه فعل تنفيذي مباشر (⚡ نفّذ) بدل ما يفضل
            // سطر نص مقروء بس — بالظبط زي باقي التطبيق.
            let riskPenalty = 0;
            let riskReasons = [];
            let riskLevel = 'ok';
            if (ins && ins.riskIndex && ins.riskIndex.level !== 'ok') {
                riskLevel = ins.riskIndex.level;
                riskPenalty = Math.round(ins.riskIndex.score * 0.25);
                score -= riskPenalty;
                riskReasons = ins.riskIndex.reasons.map(r => ({ text: r, action: resolveKatkotActionForText(r) }));
            }
            score = Math.max(0, Math.min(100, Math.round(score)));
            // ============ تسميات هجينة: بتفرّق صراحة بين "الوضع حاليًا كويس فعلاً" و"الوضع شكله كويس لكن فيه توقّع مخاطرة" ============
            // ده الفرق الجوهري بين النظام الهجين ده وأي نظام من الاتنين لوحده: نظام الحالة الآنية وحده كان
            // ممكن يقول "🟢 ممتازة" مع إن فيه 3-4 إشارات إحصائية بتلمّح لمشكلة قادمة خلال أيام — والعكس، نظام
            // التوقّع وحده كان بيدي رقم "خطورة" من غير ما يوضّح إن الحالة الفعلية دلوقتي كويسة. هنا بنقول الاتنين مع بعض.
            let label, color;
            const highMismatch = score >= 65 && riskLevel === 'danger';
            const midMismatch = score >= 65 && riskLevel === 'warn';
            if (score >= 85 && riskLevel === 'ok') { label = '🟢 ممتازة'; color = 'var(--green)'; }
            else if (highMismatch) { label = '🟠 الوضع الحالي مستقر ظاهريًا، لكن مؤشرات إحصائية قوية بتنذر بمشكلة قادمة — تدخّل الآن أرخص من علاجها لاحقًا'; color = '#e08a2b'; }
            else if (score >= 85) { label = '🟢 ممتازة، مع مراقبة إشارات مبكرة متوسطة'; color = 'var(--green)'; }
            else if (midMismatch) { label = '🟡 جيدة حاليًا، لكن فيه إشارات مبكرة متوسطة تستاهل المتابعة'; color = 'var(--warning-text)'; }
            else if (score >= 65) { label = '🟡 جيدة، تحتاج انتباه بسيط'; color = 'var(--warning-text)'; }
            else if (score >= 45) { label = riskLevel === 'danger' ? '🟠 تحتاج متابعة عاجلة — ومؤشرات إحصائية بتؤكد وجود مخاطرة حقيقية قادمة' : '🟠 تحتاج متابعة عاجلة'; color = '#e08a2b'; }
            else { label = '🔴 حرجة — تدخّل فوري'; color = 'var(--red)'; }
            factors.sort((a, c) => c.weight - a.weight);
            return { score, label, color, dangerCount, warnCount, factors: factors.slice(0, 3), riskLevel, riskReasons };
        }

        // ============ محرك القرار الموحّد: كل الإشارات (🌱 إنتاج + 💰 مالية + 🛡️ تشغيل + 🌡️ بيئة/طقس) فى مكان واحد ============
        // بدل ما يفضل المستخدم يقرا تنبيهات + مؤشر مخاطر + رؤى ذكية منفصلين ويفسّرهم لوحده، الدالة دي بتجمع كل إشارة
        // من نفس الدوال المحسوبة أصلاً (من غير إعادة حساب أي منطق من جديد) وترتبها بأولوية موحدة، وتطلع أهم 3 أفعال بس.
        // كل إشارة متعلّمة بالمجال اللي جاية منه ودرجة الإلحاح (اليوم / هذا الأسبوع / مراقبة) عشان الأولوية تبقى مفهومة فورًا.
        // ============ 🩺 توصيات صحية/بيطرية تلقائية عند تراجع الأداء الفعلي أو المتوقع عن الهدف ============
        // فجوة كانت موجودة: دليل الأمراض (diseaseKB) وقاعدة معرفة حوادث المزرعة (computeIncidentKnowledgeBase)
        // كانا مربوطين عمليًا بس بحالة دخول "أعراض ظاهرية" فى السجل اليومي (clinicalSigns) — أي مؤشر أداء أو
        // توقع ساء (FCR/وزن/نفوق) من غير ما حد يسجّل عرض ظاهري (زي حالة التسمم بالأفلاتوكسين اللي أصلًا مالهاش
        // توقيع أعراض واضح يتفحص بصريًا) كان بيتعامل معاه بجملة عامة ("راجع التغذية/الصحة") من غير أي توصية
        // محددة. الدالة دي بتتنادى بمجرد ما مؤشر أداء حالي أو توقع مستقبلي يطلع سلبي عن الهدف المرصود، وبتجمع
        // 3 مصادر معًا فى توصية واحدة:
        //   (1) الذاكرة المرضية: علاجات/تحصينات مُسجَّلة فعليًا لهذه الدفعة قريبة من العمر الحالي، + قاعدة
        //       معرفة حوادث المزرعة نفسها المبنية من الدورات المؤرشفة السابقة (نمط متكرر + أفضل حل نجح فعليًا).
        //   (2) البروتوكولات المحفوظة على مستوى المزرعة لنفس النوع (state.protocols) — جاهزة لإعادة التطبيق.
        //   (3) دليل الأمراض البيطري العام (state.diseaseKB) — مع تفضيل الأمراض اللي توقيعها الأساسي "تراجع
        //       أداء" بدون عرض ظاهري مميز (requiredSigns فاضية، زي الأفلاتوكسين والنقرس)، لأن غياب عرض ظاهري
        //       مُسجَّل هنا مش دليل إن مفيش مشكلة — العلامة الوحيدة المتاحة هى تراجع الأداء نفسه.
        // ملحوظة: التوصيات هنا "احتمالات تستحق المراجعة"، مش تشخيص نهائي — الصياغة فى formatUnderperformanceRecommendationText
        // بتوضّح كده عمدًا، وبتحيل لاستشارة الطبيب البيطري فى الحالات الأشد (زي دليل الأمراض نفسه).
        function getUnderperformanceRecommendations(b, m, category) {
            if (!b || !m) return null;
            const age = m.todayAge;
            const diseaseSource = (typeof state !== 'undefined' && state.diseaseKB && state.diseaseKB.length) ? state.diseaseKB : getDefaultDiseaseKB();
            const ageMatches = diseaseSource.filter(d => age >= (d.ageMin != null ? d.ageMin : 0) && age <= (d.ageMax != null ? d.ageMax : 999));
            // أولوية 1: أمراض توقيعها "تراجع أداء" بدون عرض ظاهري مميز — الأنسب لإشارة أداء/توقع سلبي بدون أعراض مُسجَّلة
            const silent = ageMatches.filter(d => !d.requiredSigns || d.requiredSigns.length === 0);
            // أولوية 2: أمراض ليها عرض ظاهري لكن من ضمن أعراضها المساندة تراجع علف/ماء (إشارة أضعف، تستحق مراجعة برضه)
            const secondary = ageMatches.filter(d => (d.requiredSigns && d.requiredSigns.length > 0) &&
                (d.supportingSigns || []).includes('feed_water_drop'));
            const diseaseHints = [...silent, ...secondary].slice(0, 3).map(d => ({ id: d.id, name: d.name, recommendation: d.recommendation || d.diffText || '' }));

            // (1) الذاكرة المرضية الخاصة بالدفعة نفسها — هل فى علاج/تحصين اتنفّذ فعلاً قريب من العمر الحالي (آخر 5 أيام)؟
            const recentTreatments = (b.treatmentLog || []).filter(t => t.done && t.day <= age && t.day >= age - 5).map(t => t.name);
            const recentVaccines = (b.vaccineLog || []).filter(v => v.done && v.day <= age && v.day >= age - 5).map(v => v.name);

            // (1ب) قاعدة معرفة حوادث المزرعة عبر الدورات المؤرشفة السابقة — نمط متكرر قريب من نفس العمر + أفضل حل نجح تاريخيًا
            let farmHistory = null;
            if (typeof computeIncidentKnowledgeBase === 'function') {
                const kb = computeIncidentKnowledgeBase(b.species);
                const hit = kb && kb.filter(e => Math.abs(e.ageCenter - age) <= 3).sort((x, y) => y.cyclesAffected - x.cyclesAffected)[0];
                if (hit) farmHistory = hit;
            }

            // (2) البروتوكولات المحفوظة على مستوى المزرعة لنفس النوع
            const savedProtocols = ((typeof state !== 'undefined' && state.protocols) ? state.protocols : [])
                .filter(p => p.species === b.species).slice(0, 3).map(p => ({ id: p.id, name: p.name, savedAt: p.savedAt }));

            if (!diseaseHints.length && !farmHistory && !savedProtocols.length) return null;
            return { category, age, diseaseHints, farmHistory, savedProtocols, recentTreatments, recentVaccines };
        }

        // نسخة نصية موجزة جاهزة للإدراج مباشرة داخل نص تنبيه/بطاقة أولوية — بتلخّص أقوى مصدرين بس عشان النص يفضل قابل للقراءة
        // (النسخة الكاملة بكل المصادر تُعرض لاحقًا فى كارت مخصص لو احتجنا تفصيل أكتر — هنا مجرد سطر توصية مدمج فى تنبيه موجود)
        function formatUnderperformanceRecommendationText(rec) {
            if (!rec) return '';
            const parts = [];
            if (rec.farmHistory && rec.farmHistory.bestSolution) {
                parts.push(`جرّب "${rec.farmHistory.bestSolution.name}" (نجح سابقًا فى ${fmt(rec.farmHistory.bestSolution.successRate * 100, 0)}% من ${rec.farmHistory.bestSolution.timesUsed} محاولة بدورات سابقة قريبة من نفس العمر)`);
            }
            if (rec.diseaseHints && rec.diseaseHints.length) {
                const d = rec.diseaseHints[0];
                parts.push(`احتمال يستحق المراجعة: "${d.name}"${d.recommendation ? ' — ' + d.recommendation : ''}`);
            }
            if (!parts.length && rec.savedProtocols && rec.savedProtocols.length) {
                parts.push(`راجع بروتوكول "${rec.savedProtocols[0].name}" المحفوظ لنفس النوع`);
            }
            return parts.join(' | ');
        }

        // ============ 🎯 محرك فعل موحّد — كل مكان بيعرض تنبيه/توقّع فى التطبيق بيستخدم نفس المنطق ============
        // (كارت "أهم فعل عليك اتخاذه الآن" + قائمة "يحتاج متابعتك الآن" الكاملة + أسباب "احتمالية مشكلة قادمة"
        // جوه كارت صحة الدفعة) — بدل ما كل مكان يخمّن الفعل المناسب بمنطقه الخاص، نص التنبيه بيتوصّل بمطابقة
        // نصية واحدة موحّدة لنفس مجموعة الأفعال المعرّفة فى priorityActionFor.
        function priorityActionFor(kind, extra) {
            switch (kind) {
                case 'weightHealthLog': return { type: 'fn', fn: 'openDailyModal', arg: 'essentials', label: '⚖️ سجّل الوزن/الصحة الآن' };
                case 'biosecurity': return { type: 'fn', fn: 'openBiosecurityModal', label: '🛡️ افتح تشيك ليست الأمان الحيوي' };
                case 'feedLot': return { type: 'scroll', id: 'smartInsightsSection', label: '🌾 راجع تحليل شحنة العلف' };
                case 'additive': return { type: 'scroll', id: 'smartInsightsSection', label: '💊 راجع تحليل الإضافة' };
                case 'waterFeed': return { type: 'fn', fn: 'openDailyModal', arg: 'day', label: '💧 سجّل قراءات اليوم' };
                case 'fcrPred': return { type: 'scroll', id: 'smartInsightsSection', label: '🔮 راجع توقع الـFCR' };
                case 'sale': return { type: 'fn', fn: 'openSaleModal', label: '🎯 سجّل عملية البيع' };
                case 'finance': return { type: 'tab', tab: 'management', sub: 'finance', label: '💰 افتح الإدارة والتخطيط' };
                case 'stock': return { type: 'fn', fn: 'openPurchaseModal', label: '📦 سجّل توريد مخزون' };
                case 'weather': return { type: 'fn', fn: 'openDailyModal', arg: 'day', label: '🌡️ سجّل قراءات البيئة' };
                default: return null;
            }
        }
        function resolveKatkotActionForText(text) {
            const rules = [
                { re: /بيع الآن|الأفضل تبيع/, kind: 'sale' },
                { re: /تكلفة كيلو اللحم|مستحق سداد|مستحق تحصيل/, kind: 'finance' },
                { re: /نواقص فى المخزن/, kind: 'stock' },
                { re: /تشيك ليست|أمان حيوي/, kind: 'biosecurity' },
                { re: /شحنة العلف/, kind: 'feedLot' },
                { re: /إضافة|جرعة|تحصين/, kind: 'additive' },
                { re: /الماء:العلف|استهلاك الماء|استهلاك العلف/, kind: 'waterFeed' },
                { re: /FCR|معدل التحويل/, kind: 'fcrPred' },
                { re: /الإجهاد البيئي|ثاني أكسيد الكربون|الطقس المتوقع|حرارة العنبر|رطوبة/, kind: 'weather' },
                { re: /وزن|نفوق|تجانس|انحراف|شذوذ/, kind: 'weightHealthLog' },
            ];
            const hit = rules.find(r => r.re.test(text));
            return hit ? priorityActionFor(hit.kind) : null;
        }
        // ============ 🎯 سجل الأفعال العام لصفحة الداشبورد — بيتصفّر أول كل رسمة، وأي كارت بيسجّل فعله فيه ============
        // (أولويات "أهم فعل الآن" + صفوف "يحتاج متابعتك الآن" + أسباب "احتمالية مشكلة قادمة") ويرجع Index
        // يستخدمه الزرار فى onclick، عشان زرار واحد بس (runKatkotAction) يقدر ينفّذ أي فعل جه من أي كارت.
        function registerKatkotAction(action) {
            if (!window._katkotActions) window._katkotActions = [];
            window._katkotActions.push(action);
            return window._katkotActions.length - 1;
        }
        // ============ 🎯 منفّذ الفعل الفعلي — بيوصل المستخدم لمكان التنفيذ الحقيقي، مش عرض/كلام مرسل ============
        // بيتنفّذ من أي زرار "⚡ نفّذ" فى أي كارت (أهم فعل الآن / يحتاج متابعتك الآن / كارت صحة الدفعة). كل بند
        // بيحمل action محدد سلفًا وقت حسابه (مش تخمين وقت الضغط) — فالتنفيذ هنا مجرد توجيه دقيق: فتح المودال
        // الصحيح مباشرة، أو النقل للتبويب/القسم المسؤول، أو Scroll لمكان التحليل التفصيلي.
        function runKatkotAction(idx) {
            const queue = window._katkotActions || [];
            const action = queue[idx];
            if (!action) { showToast('مفيش فعل تلقائي متاح للبند ده — راجعه يدويًا من التبويب المناسب'); return; }
            try {
                if (action.type === 'fn') {
                    const fn = window[action.fn];
                    if (typeof fn !== 'function') throw new Error('fn-missing:' + action.fn);
                    if (action.arg !== undefined) fn(action.arg); else fn();
                } else if (action.type === 'tab') {
                    if (action.sub) managementSubTab = action.sub; // لازم تتحدد قبل setTab عشان render() يقرأها صح من أول رسمة
                    setTab(action.tab);
                } else if (action.type === 'scroll') {
                    const el = document.getElementById(action.id);
                    if (!el) throw new Error('scroll-target-missing:' + action.id);
                    // لو القسم المستهدف جوه <details> مطوي، افتحه الأول عشان المستخدم يشوف المحتوى فعليًا
                    const det = el.tagName === 'DETAILS' ? el : el.querySelector('details');
                    if (det) det.open = true;
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    el.classList.add('priority-action-highlight');
                    setTimeout(() => el.classList.remove('priority-action-highlight'), 2200);
                }
            } catch (e) {
                console.error('runKatkotAction failed:', e);
                showToast('تعذّر فتح المكان المخصص تلقائيًا — استخدم التبويبات فى الأسفل للوصول له يدويًا');
            }
        }

        function computeUnifiedPriorities(b, m, fin, alerts, ins, ops, hs, saleAdv) {
            const items = [];
            const push = (domain, icon, text, weight, action) => items.push({ domain, icon, text, weight, action: action || null });

            // --- 🌱 إنتاج: من نفس عوامل مؤشر الصحة (نفوق/وزن/اتجاه/تجانس/سبب النفوق)، مع فرز عوامل التشغيل لقسمها الخاص ---
            hs.factors.forEach(f => {
                if (/تنبيه خطر و.*تحذير نشط/.test(f.label)) return; // عامل عام (عدد التنبيهات) مش فعل محدد — الإشارات الفردية المهمة بتتلقط أصلاً من alerts تحت
                const isOps = /تشيك ليست|أمان حيوي/.test(f.label);
                push(isOps ? 'ops' : 'production', isOps ? '🛡️' : '🌱', f.label, f.weight, priorityActionFor(isOps ? 'biosecurity' : 'weightHealthLog'));
            });
            if (ins.deviationNarrative) push('production', '🌱', ins.deviationNarrative.text, 9, priorityActionFor('weightHealthLog'));
            if (ins.feedLotAnalysis && ins.feedLotAnalysis.flagged) {
                const fl = ins.feedLotAnalysis.flagged;
                const flTxt = fl.reason === 'weight' ? `متوسط انحراف الوزن ${fmt(fl.avgDev,1)}% مقابل متوسط ${fmt(ins.feedLotAnalysis.avgDevAll,1)}% فى باقي الشحنات`
                    : fl.reason === 'fcr' ? `معدل تحويل الفترة ${fmt(fl.periodFcr,2)} مقابل متوسط ${fmt(ins.feedLotAnalysis.avgFcrAll,2)} فى باقي الشحنات`
                    : `معدل نفوق ${fmt(fl.mortPerDay,2)} طائر/يوم مقابل متوسط ${fmt(ins.feedLotAnalysis.avgMortRate,2)} فى باقي الدورة`;
                push('production', '🌾', `راجع شحنة العلف "${fl.lot}" مع المورد — ${flTxt}`, 8, priorityActionFor('feedLot'));
            }
            if (ins.additiveAnalysis && ins.additiveAnalysis.flagged) {
                const aa = ins.additiveAnalysis.flagged;
                const topReason = aa.reasons[0] ? aa.reasons[0].key : 'mort';
                // ✅ الـFCR اليومي التقريبي (fcrDaily) دلوقتي بيتفحص بـ welchSignificant زي النفوق والوزن —
                // البند مش بيتعلّم أصلًا إلا لو الفرق مؤكد إحصائيًا، فمفيش داعي لكاڤيات "غير مؤكد" هنا.
                const aaTxt = topReason === 'weight' ? `الوزن أضعف من المعتاد بـ ${fmt(aa.inactiveDev - aa.activeDev,1)}% وقت سريانه`
                    : topReason === 'fcr' ? `معدل التحويل أسوأ (${fmt(aa.activeFcr,2)} مقابل ${fmt(aa.inactiveFcr,2)}) وقت سريانه`
                    : `معدل نفوق ${fmt(aa.activeMortRate,2)} طائر/يوم وقت سريانه مقابل ${fmt(aa.inactiveMortRate,2)} خارج فترته`;
                push('production', '💊', `راجع جرعة/توقيت "${aa.name}" (${aa.kind}) — ${aaTxt}`, 7, priorityActionFor('additive'));
            }
            if (ins.waterFeedAnalysis && ins.waterFeedAnalysis.deviationPct != null && ins.waterFeedAnalysis.deviationPct >= 15) {
                push('production', '💧', `نسبة الماء:العلف ارتفعت ${fmt(ins.waterFeedAnalysis.deviationPct,0)}% عن المعتاد فى آخر 3 أيام — راجع الحرارة والتهوية والصحة العامة الآن قبل ظهور أعراض واضحة`, 8, priorityActionFor('waterFeed'));
            }
            // توقّع FCR (مضاف حديثًا) كإشارة إنتاج استباقية — قبل كده محدش كان بياخده فى الاعتبار ضمن الأولويات
            // 🩺 لو التوقع سلبي عن الهدف، منسيبش الجملة عامة ("عدّل التغذية") — نرفق توصية محددة من الذاكرة
            // المرضية/البروتوكولات/دليل الأمراض، لأن FCR متوقَّع أضعف كتير من المعياري ممكن يكون سببه صحي مش تغذوي بس
            if (ins.fcrPrediction && ins.fcrPrediction.diffPct != null && ins.fcrPrediction.diffPct > 8) {
                const fcrPredRec = getUnderperformanceRecommendations(b, m, 'fcrPrediction');
                const fcrPredRecTxt = fcrPredRec ? formatUnderperformanceRecommendationText(fcrPredRec) : '';
                push('production', '🔮', `FCR المتوقَّع عند البيع (${fmt(ins.fcrPrediction.predictedFcr,2)}) أعلى من المعياري بـ ${fmt(ins.fcrPrediction.diffPct,1)}% — فرصتك تتدخل الآن بتعديل التغذية قبل نهاية الدورة${fcrPredRecTxt ? ` | 🩺 ${fcrPredRecTxt}` : ''}`, Math.min(ins.fcrPrediction.diffPct * 0.5, 8), priorityActionFor('fcrPred'));
            }
            // 🩺 نفس الفكرة للوزن المتوقع عند البيع لو أقل من المعياري — كانت بتُحتسب بس فى نقاط "مؤشر الصحة"
            // (computeHealthScore) كخصم رقمي بدون أي توصية عملية مرفقة فى قائمة "أهم فعل الآن"
            if (ins.weightPrediction && ins.weightPrediction.diffPct != null && ins.weightPrediction.diffPct < -3) {
                const wtPredRec = getUnderperformanceRecommendations(b, m, 'weightPrediction');
                const wtPredRecTxt = wtPredRec ? formatUnderperformanceRecommendationText(wtPredRec) : '';
                if (wtPredRecTxt) {
                    push('production', '🔮', `الوزن المتوقع عند البيع (يوم ${ins.weightPrediction.targetAge}) أقل من المعياري بـ ${fmt(Math.abs(ins.weightPrediction.diffPct),1)}% — 🩺 ${wtPredRecTxt}`, Math.min(Math.abs(ins.weightPrediction.diffPct) * 0.6, 8), priorityActionFor('weightHealthLog'));
                }
            }

            // --- 💰 مالية: قرار البيع (أولوية عالية لأنه قرار عاجل بطبيعته وله موعد نهائي واضح) ---
            if (saleAdv.osd && saleAdv.nextRow) {
                if (saleAdv.nextRow.densityUnsafe) {
                    push('financial', '🎯', `الكثافة المتوقعة غدًا (${fmt(saleAdv.nextRow.projDensity,1)} كجم/م²) هتتخطى الحد الآمن — الأفضل تبيع الآن حتى لو الربح الحدي لسه موجب`, 9, priorityActionFor('sale'));
                } else if (saleAdv.nextRow.marginalProfit <= 0) {
                    push('financial', '🎯', `سعر البورصة الحالي (${fmt(saleAdv.priceForCalc,2)} ج/كجم) تحت سعر التعادل المطلوب (${fmt(saleAdv.nextRow.breakEvenPrice,2)} ج/كجم) — الأفضل تبيع الآن`, 9, priorityActionFor('sale'));
                }
            }

            // --- 💰 مالية + 🌡️ بيئة/طقس + 🛡️ تشغيل: نلتقطها من alerts المحسوبة أصلاً بمطابقة نصية دقيقة (بدون إعادة حساب المنطق) ---
            const domainRules = [
                { re: /تكلفة كيلو اللحم|مستحق سداد|مستحق تحصيل/, domain: 'financial', icon: '💰', kind: 'finance' },
                { re: /الإجهاد البيئي|ثاني أكسيد الكربون|الطقس المتوقع/, domain: 'weather', icon: '🌡️', kind: 'weather' },
                { re: /نواقص فى المخزن/, domain: 'ops', icon: '📦', kind: 'stock' },
            ];
            alerts.forEach(a => {
                if (a.level !== 'danger' && a.level !== 'warn') return;
                if (a.dismissed) return; // المستخدم كتمها اليوم بنفسه — منعرضهاش كأولوية عاجلة تانى
                const rule = domainRules.find(r => r.re.test(a.text));
                if (!rule) return;
                let w = a.level === 'danger' ? 8 : 5;
                // ============ 🔴 إصلاح Red Team (مدموج): حلقة تغذية راجعة لإجهاد التنبيهات (Alert Fatigue) ============
                // تحذير اتكتم كتير قبل كده ياخد أولوية أقل فى "أهم 3 أفعال" — بدون ما يختفي من قائمة التنبيهات
                // الكاملة. تنبيهات "الخطر" مستثناة عمدًا وبتفضل بأولويتها الكاملة دايمًا لأنها سلامة/مخاطرة حرجة.
                if (a.level === 'warn' && a.dismissCount > 0) w *= Math.max(0.5, 1 - a.dismissCount * 0.12);
                push(rule.domain, rule.icon, a.text.replace(/^\S+\s*/, ''), w, priorityActionFor(rule.kind));
            });

            const seen = new Set();
            const ranked = items.filter(it => { if (seen.has(it.text)) return false; seen.add(it.text); return true; })
                .sort((a, c) => c.weight - a.weight);
            // ============ (جديد) تتبّع تكرار الأولويات عبر الأيام — معالجة عملية لفجوة "الأوزان ثابتة يدويًا بدون تعلّم من النتائج" ============
            // بدل نظام تعلّم آلي معقّد (محتاج بيانات نتائج فعلية موثوقة مش متوفرة)، الحل العملي الصادق: مشكلة
            // اتكررت فى الأولويات 3 أيام متتالية أو أكتر أقوى دليل إحصائيًا إنها حقيقية (مش تقلب يومي عشوائي)
            // من أي وزن ثابت مكتوب فى الكود — فبنرفعها فى الترتيب ونوضّح للمستخدم إنها متكررة، عشان يفرّق
            // بنفسه بين إنذار عابر وإنذار مُلحّ فعلًا.
            const normKey = (it) => it.domain + '::' + it.text.replace(/[\d.,%٪٫\s]+/g, '#').slice(0, 55);
            if (b && ranked.length) {
                if (!b.priorityLog) b.priorityLog = [];
                const today = todayStr();
                if (!b.priorityLog.some(p => p.date === today)) {
                    b.priorityLog.push({ date: today, keys: ranked.slice(0, 5).map(normKey) });
                    if (b.priorityLog.length > 45) b.priorityLog = b.priorityLog.slice(-45); // آخر 45 يوم كفاية لأي دورة تسمين
                }
            }
            const streakOf = (it) => {
                if (!b || !b.priorityLog || !b.priorityLog.length) return 0;
                const key = normKey(it);
                let streak = 0;
                for (let i = b.priorityLog.length - 1; i >= 0; i--) {
                    if (b.priorityLog[i].keys.includes(key)) streak++; else break;
                }
                return streak;
            };
            ranked.forEach(it => {
                const streak = streakOf(it);
                if (streak >= 3) it.weight = Math.min(it.weight + Math.min((streak - 2) * 0.7, 3), 10); // رفع تدريجي محدود، مش قفزة مفاجئة
                it.streak = streak;
            });
            ranked.sort((a, c) => c.weight - a.weight); // إعادة ترتيب بعد تعديل الأوزان بالتكرار
            // ============ 🔴 إصلاح Red Team: العدد اتغيّر من "3 ثابتة دايمًا" لعدد ديناميكي حسب خطورة الوضع فعليًا ============
            // قبل كده كانت القائمة دايمًا 3 بنود بالظبط — سواء الوضع فيه بند عاجل واحد بس (يبقى فيها حشو غير
            // ضروري) أو 6 بنود عاجلة فى نفس اليوم (يبقى فيها إخفاء لمشاكل حقيقية). المنطق دلوقتي: نعرض كل
            // البنود "العاجلة اليوم" (وزن ≥ 8) بالكامل بلا حذف (سقف عملي 8 عشان الداشبورد يفضل قابل للقراءة)،
            // وبحد أدنى 3 بنود (أو أقل لو مفيش بيانات كفاية أصلاً) لو مفيش عاجل كتير، عشان الداشبورد يفضل مفيد
            // حتى فى الأيام الهادئة.
            const urgentTodayCount = ranked.filter(it => it.weight >= 8).length;
            const showCount = Math.min(Math.max(urgentTodayCount, Math.min(3, ranked.length)), 8);
            const top3 = ranked.slice(0, showCount).map(it => ({ ...it,
                urgency: it.weight >= 8 ? 'اليوم' : (it.weight >= 5 ? 'هذا الأسبوع' : 'مراقبة'),
                recurringNote: it.streak >= 3 ? `🔁 متكررة ${it.streak} أيام متتالية فى الأولويات — مش تقلب يوم واحد` : null }));
            const domainLabels = { production: 'إنتاج', financial: 'مالية', ops: 'تشغيل', weather: 'بيئة/طقس' };
            return { top3, ranked, domainLabels, domainsCovered: [...new Set(ranked.map(r => r.domain))] };
        }

        function renderDashboard(b, m, fin, alerts) {
            const ins = computeInsights(b, m);
            const saleAdv = computeMarketSaleAdvice(b, m, fin);
            // ============ كارت "مؤشر أداء الدورة" الموحّد — رقم واحد (0-100) + ترتيب (Rank) بين كل دوراتك المؤرشفة لنفس النوع ============
            const perfRank = computeFarmPerformanceRank(b, m, fin);
            const perfScoreCardHtml = (() => {
                if (!perfRank) return `<div class="card perf-score-card" style="text-align:center;">
                        <div class="title">🏅 مؤشر أداء الدورة + الترتيب</div>
                        <div class="foot-note">يظهر تلقائيًا لما يكون عندك 3 دورات مؤرشفة على الأقل لنفس النوع بعمر 20 يوم فأكثر (رُفع الحد من دورتين لـ3 عشان النسب المعروضة تبقى موثوقة إحصائيًا) — كل ما أرشفت دورات أكتر كل ما كان الترتيب أدق</div>
                    </div>`;
                const scoreColor = perfRank.score >= 70 ? 'var(--green)' : (perfRank.score >= 40 ? 'var(--warning-text)' : 'var(--red)');
                const rankBadge = perfRank.rank.position === 1
                    ? `🥇 أفضل دورة سجّلتها على الإطلاق (#1 من ${perfRank.rank.total})`
                    : `#${perfRank.rank.position} من ${perfRank.rank.total} دورة`;
                const rows = perfRank.breakdown.map(x => {
                    const c = x.pct >= 70 ? 'var(--green)' : (x.pct >= 40 ? 'var(--warning-text)' : 'var(--red)');
                    return `${statLine(`${x.label}`, `${x.pct}%`, {vStyle:`color:${c};font-weight:700;`})}`;
                }).join('');
                return `<div class="card perf-score-card">
                    <div class="head">
                        <div>
                            <div class="title">🏅 مؤشر أداء الدورة (مقارنة بتاريخك الخاص)</div>
                            <div class="rank-badge">${rankBadge}</div>
                            <div style="margin-top:4px;">${confBadgeHtml(perfRank.sampleSize)}</div>
                        </div>
                        <div class="perf-score-ring">
                            <svg width="74" height="74" viewBox="0 0 74 74">
                                <circle cx="37" cy="37" r="31" fill="none" stroke="var(--line)" stroke-width="7"/>
                                <circle cx="37" cy="37" r="31" fill="none" stroke="${scoreColor}" stroke-width="7" stroke-linecap="round"
                                    stroke-dasharray="${2*Math.PI*31}" stroke-dashoffset="${2*Math.PI*31*(1-perfRank.score/100)}"/>
                            </svg>
                            <div class="ring-value">
                                <b style="color:${scoreColor};">${perfRank.score}</b>
                                <span>من 100</span>
                            </div>
                        </div>
                    </div>
                    <div class="rows-block">${rows}</div>
                    ${perfRank.absolute ? `<div class="abs-block">
                        <div class="abs-title">📏 مرجع مطلق مستقل (معيار السلالة القياسي عند يوم ${perfRank.absolute.atAge}، مش تاريخك أنت)</div>
                        ${statLine(`معدل التحويل مقابل المعيار القياسي`, `${perfRank.absolute.fcrDiffPct==null?'—':(perfRank.absolute.fcrDiffPct>=0?'+':'')+fmt(perfRank.absolute.fcrDiffPct,1)+'%'}`, {vStyle:`font-weight:700;color:${perfRank.absolute.fcrDiffPct==null?'var(--muted)':(perfRank.absolute.fcrDiffPct<=0?'var(--green)':'var(--red)')};`})}
                        <div class="foot-note">ده مش نسبي لتاريخك — ده مقارنة مباشرة بمنحنى العلف/الوزن الرسمي للسلالة، فمفيد حتى لو كل دوراتك السابقة كانت متوسطة الأداء</div>
                    </div>` : ''}
                    <div class="foot-note">💡 النسبة بجانب كل مؤشر فوق = كام % من دوراتك السابقة (لنفس النوع) الدورة الحالية "أحسن" منها فيه — ده ترتيب نسبي مقابل نفسك بس، مش مقياس عالمي مطلق (استخدم المرجع المطلق تحت لده).</div>
                </div>`;
            })();
            // ============ مؤشر كثافة التسجيل: تحذير أعلى التحليلات لو التغطية اليومية ضعيفة، عشان يعرف المستخدم أن دقة كل التحليلات التالية محدودة بجودة تسجيله ============
            const recComp = computeRecordingCompleteness(b, m);
            const dataConf = computeDataConfidence(b, m);
            const recCompHtml = (recComp.expectedDays >= 5 && recComp.pct < 70) || dataConf ? `
                <div class="card data-quality-warning">
                    ${(recComp.expectedDays >= 5 && recComp.pct < 70) ? `<div class="line">⚠️ تغطية تسجيل منخفضة: ${fmt(recComp.pct,0)}% فقط من أيام الدورة (${recComp.actualDays} من ${recComp.expectedDays} يوم) مُسجَّلة فعليًا</div>` : ''}
                    ${dataConf ? `<div class="line" style="${(recComp.expectedDays >= 5 && recComp.pct < 70) ? 'margin-top:6px;' : ''}">⚠️ فاتك تسجيل الوزن ${dataConf.missingWeight} من آخر ${dataConf.ofDays} أيام${dataConf.missingFeed?' والعلف '+dataConf.missingFeed+' يوم':''}</div>` : ''}
                    <div class="hint">التحليلات والتنبؤات بالأسفل أقل دقة مع تسجيل متقطع — سجّل يوميًا لأفضل النتائج</div>
                </div>` : '';
            // ============ (جديد) شفافية مصدر المرجع المعياري المستخدم فى المقارنة — عشان المستخدم يعرف بيتقارن بإيه بالظبط ============
            const refBreedKey = detectBreedKey(b.breed);
            const refSourceNote = refBreedKey ? `🧬 المرجع المستخدم: منحنى ${GLOBAL_BREED_BENCHMARKS[refBreedKey].label} (تلقائي حسب اسم السلالة "${esc(b.breed)}")` : '';
            const devHtml = ins.devAvg == null ? `<div class="check-row"><div class="txt"><div>📐 الانحراف التراكمي عن المعيار</div><div class="day">بيانات غير كافية بعد (يحتاج 3 سجلات وزن على الأقل)</div></div></div>` : `
                <div class="check-row"><div class="txt">
                    <div>📐 الانحراف التراكمي عن المعيار: <b style="color:${ins.devAvg>=0?'var(--green)':'var(--red)'};">${ins.devAvg>=0?'+':''}${fmt(ins.devAvg,1)}%</b></div>
                    <div class="day">${ins.devTrend==null?'':(ins.devTrend>0.5?'📈 الأداء بيتحسن مقارنة ببداية الدورة':(ins.devTrend<-0.5?'📉 الأداء بيتراجع مقارنة ببداية الدورة — راجع التغذية والبيئة':'➖ الأداء مستقر تقريبًا'))}</div>
                    ${refSourceNote ? `<div class="day" style="color:var(--muted);margin-top:2px;">${refSourceNote} — لو ده مش صحيح أو السلالة مختلفة، عدّل اسم السلالة فى بيانات الدفعة أو خصّص المرجع يدويًا من إعدادات الأرقام القياسية</div>` : ''}
                </div></div>`;
            const predTrackRecord = computePredictionTrackRecord(b.species);
            const predHtml = !ins.weightPrediction ? '' : `
                <div class="check-row"><div class="txt">
                    <div>🔮 وزن متوقع يوم ${ins.weightPrediction.targetAge}: <b>${fmt(ins.weightPrediction.predictedG,0)} جم</b> ${ins.weightPrediction.predictedGLow!=null?`<span style="color:var(--muted);font-weight:600;">(نطاق ${fmt(ins.weightPrediction.predictedGLow,0)}–${fmt(ins.weightPrediction.predictedGHigh,0)} جم)</span>`:''} ${ins.weightPrediction.stdAtTarget>0?`(المعياري ${fmt(ins.weightPrediction.stdAtTarget,0)} جم)`:''} ${predTrackRecord ? confBadgeHtml(predTrackRecord.cycles) : ''}</div>
                    <div class="day">${ins.weightPrediction.perfRatio!=null?`مبني على نسبة أداء القطيع مقارنة بمنحنى نمو السلالة (${fmt(ins.weightPrediction.perfRatio*100,0)}% من معدل نمو السلالة${ins.weightPrediction.perfRatioLong!=null?`، مزيج بين آخر أيام (${fmt(ins.weightPrediction.perfRatioShort*100,0)}%) وأداء الدورة كاملة (${fmt(ins.weightPrediction.perfRatioLong*100,0)}%)`:''})`:`مبني على معدل النمو الفعلي الأخير (${fmt(ins.weightPrediction.recentDailyGain,1)} جم/يوم)`}${ins.weightPrediction.diffPct!=null?` — ${ins.weightPrediction.diffPct>=0?'أعلى':'أقل'} من المعياري بـ ${fmt(Math.abs(ins.weightPrediction.diffPct),1)}%`:''}</div>
                    ${ins.weightPrediction.predictedGLow==null?`<div class="day" style="color:var(--muted);">نطاق الثقة يحتاج 4 وزنات فعلية على الأقل موزّعة عبر الدورة عشان يظهر</div>`:''}
                    ${ins.weightPrediction.outlierWeightDaysExcluded?`<div class="day" style="color:var(--muted);">تم تجاهل ${ins.weightPrediction.outlierWeightDaysExcluded} قراءة وزن غير منطقية عند حساب هذا التوقع (راجعها فى السجل، غالبًا خطأ ميزان)</div>`:''}
                    ${predTrackRecord ? `<div class="day" style="margin-top:2px;">📊 دقة توقعاتك التاريخية لهذا النوع: متوسط خطأ الوزن ±${fmt(predTrackRecord.avgWeightErrPct,1)}%${predTrackRecord.avgFcrErrPct!=null?` وخطأ الـFCR ±${fmt(predTrackRecord.avgFcrErrPct,1)}%`:''} (من ${predTrackRecord.cycles} دورة مؤرشفة سابقة)</div>` : ''}
                </div></div>`;
            // ============ توقّع FCR النهائي مبكرًا — يديك وقت تتدخل (تعديل تغذية/بيئة) قبل ما الدورة تخلص فعليًا ============
            const fcrPredHtml = !ins.fcrPrediction ? '' : (() => {
                const fp = ins.fcrPrediction;
                const diffColor = fp.diffPct == null ? 'inherit' : (fp.diffPct <= 0 ? 'var(--green)' : (fp.diffPct <= 8 ? 'var(--warning-text)' : 'var(--red)'));
                return `<div class="check-row"><div class="txt">
                    <div>🔮 FCR متوقَّع يوم ${fp.targetAge} (نهاية الدورة): <b style="color:${diffColor};">${fmt(fp.predictedFcr,2)}</b> ${fp.predictedFcrLow!=null?`<span style="color:var(--muted);font-weight:600;">(نطاق ${fmt(fp.predictedFcrLow,2)}–${fmt(fp.predictedFcrHigh,2)})</span>`:''} ${fp.stdFcrAtTarget?`(المعياري ${fmt(fp.stdFcrAtTarget,2)})`:''} ${predTrackRecord ? confBadgeHtml(predTrackRecord.cycles) : ''}</div>
                    <div class="day">مبني على نسبة أداء استهلاك العلف الفعلي مقارنة بمنحنى السلالة (${fmt(fp.feedPerfRatio*100,0)}% من معدل السلالة${fp.feedPerfRatioLong!=null?`، مزيج بين آخر أيام (${fmt(fp.feedPerfRatioShort*100,0)}%) وأداء الدورة كاملة (${fmt(fp.feedPerfRatioLong*100,0)}%)`:''}) + إسقاط النفوق بمعدل آخر 7 أيام${fp.diffPct!=null?` — ${fp.diffPct<=0?'أفضل من':'أعلى من'} المعياري بـ ${fmt(Math.abs(fp.diffPct),1)}%`:''}</div>
                    <div class="day" style="margin-top:2px;">توقّع تقديري وليس نهائيًا — كل ما اقتربت من يوم البيع الفعلي زادت دقته، فرصتك تتدخل بتعديل التغذية أو البيئة الآن لو الفرق واضح</div>
                </div></div>`;
            })();
            // ============ توقع الربح الحي للدورة — لو استمرت على نفس المنوال حتى يوم البيع الموصى به، يتحدّث تلقائيًا مع كل تسجيل جديد أو تغيير سعر البورصة ============
            // ⚠️ إصلاح (دمج): كان ده كارت منفصل (stat-mini-card) جنب مؤشر الأداء، وقرار البيع كارت hero منفصل تحته —
            // مع إن توقع الربح أصلاً محسوب من نفس بيانات قرار البيع (osd)، فكان عرضهم منفصلين مربك. دلوقتي
            // بيتحسب هنا قبل بناء كارت قرار البيع عشان يتدمجوا فى كارت واحد.
            const liveProfit = computeLiveProfitForecast(b, m, fin, saleAdv);
            const heroProfitLineHtml = !liveProfit ? '' : `<div class="profit-line">
                    <span class="profit-label">💹 الربح المتوقع حتى وقت البيع</span>
                    <span class="profit-value" style="color:${liveProfit.projectedProfit>=0?'var(--green)':'#F09088'};">${money(liveProfit.projectedProfit)}<small> (${money(liveProfit.projectedProfitPerBird)}/طائر)</small></span>
                </div>`;
            // ============ 🎨 كارت قرار البيع + توقع الربح الحي البارز (خارج الأكورديون) — كارت واحد مدموج، نفس بيانات saleHtml/liveProfitHtml تحت لكن بواجهة مميزة لأنه أهم قرار عملي يومي ============
            const saleDecisionCardHtml = !saleAdv.osd ? '' : `
            <div class="card sale-decision-card">
                <div class="eyebrow">🎯 قرار البيع (حسب بورصة الدواجن)</div>
                <div class="headline">
                    يوم <span class="day-num">${saleAdv.osd.optimalDay}</span>
                </div>
                ${saleAdv.osd.limitingFactor==='density'?'<div class="warn-line">⚠️ بسبب الكثافة/المساحة، قبل الحد الاقتصادي</div>':''}
                <div class="advice-line">${saleAdv.adviceIcon} ${saleAdv.advice}</div>
                ${heroProfitLineHtml}
                <div class="meta-line">مبني على سعر بورصة ${fmt(saleAdv.priceForCalc,2)} ج/كجم${saleAdv.osd.priceSource==='market'?' (مُدخَل يدويًا)':' (من متوسط مبيعات سابقة)'} · ${saleAdv.osd.weightDataPoints} وزنة فعلية ${confBadgeHtml(saleAdv.osd.weightDataPoints, {low:2, mid:4})}</div>
            </div>`;
            // ============ قرار البيع + توقع الربح الحي: نسخة الأكورديون التفصيلية المدموجة (بدل صفّين منفصلين) ============
            const saleHtml = !saleAdv.osd ? `<div class="check-row"><div class="txt">
                    <div>🎯 قرار البيع (حسب بورصة الدواجن)</div>
                    <div class="day">أدخل سعر العلف وسعر البورصة الحالي من تبويب "💰 الإدارة والتخطيط" ← دراسة الجدوى عشان تظهر التوصية هنا</div>
                </div></div>` : `<div class="check-row"><div class="txt">
                    <div>🎯 قرار البيع: أفضل يوم مُوصى به <b style="color:var(--green);">يوم ${saleAdv.osd.optimalDay}</b>${saleAdv.osd.limitingFactor==='density'?' <span style="color:var(--red);font-weight:700;">(بسبب الكثافة/المساحة، قبل الحد الاقتصادي)</span>':''} ${confBadgeHtml(saleAdv.osd.weightDataPoints, {low:2, mid:4})}</div>
                    <div class="day" style="color:${saleAdv.adviceColor};font-weight:700;">${saleAdv.adviceIcon} ${saleAdv.advice}</div>
                    ${liveProfit ? `<div class="day" style="margin-top:4px;">💹 لو استمرت الدورة على نفس المنوال ${liveProfit.daysRemaining} يوم كمان لحد يوم ${liveProfit.targetDay}: ربح متوقع <b style="font-size:14px;color:${liveProfit.projectedProfit>=0?'var(--green)':'var(--red)'};">${money(liveProfit.projectedProfit)}</b> إجمالي الدورة، أو <b>${money(liveProfit.projectedProfitPerBird)}</b> لكل طائر</div>
                    <div class="day">الإيراد المتوقع ${money(liveProfit.projectedRevenue)} (${fmt(liveProfit.liveProjAtTarget,0)} طائر × ${fmt(liveProfit.projWeightG/1000,2)} كجم × ${fmt(liveProfit.salePrice,2)} ج) − إجمالي التكلفة المتوقعة ${money(liveProfit.projectedTotalCost)}</div>` : ''}
                    <div class="day" style="margin-top:2px;">مبني على سعر بورصة ${fmt(saleAdv.priceForCalc,2)} ج/كجم (${saleAdv.osd.priceSource==='market'?'مُدخَل يدويًا':'من متوسط مبيعات سابقة'}) — حدّثه من تبويب "💰 الإدارة والتخطيط" ← دراسة الجدوى</div>
                    <div class="day" style="margin-top:2px;color:var(--muted);">مبني على ${saleAdv.osd.weightDataPoints} وزنة فعلية مُقاسة مؤخرًا${liveProfit ? ` — ${liveProfit.confidence==='green'?'🟢 دقة توقع الربح كافية':(liveProfit.confidence==='mid'?'🟡 دقة توقع الربح متوسطة':'⚪ توقع الربح تقريبي لسه')}` : ''} — كل ما سجّلت أوزان أكتر وأقرب لبعض، زادت الدقة</div>
                </div></div>`;
            const feedForecastHtml = (() => {
                const targetAge = (ins.weightPrediction && ins.weightPrediction.targetAge) || b.targetAge || null;
                if (!targetAge || targetAge <= m.todayAge) return '';
                const ff = computeFeedForecast(b, m, targetAge - m.todayAge);
                const priceInfo = computeActualFeedPrice(b);
                const targetRow = ff.rows[ff.rows.length - 1];
                if (!targetRow) return '';
                const remainingCost = targetRow.cumFeedKg * (priceInfo.price || 0);
                const balanceTxt = ff.currentBalanceKg != null ? `${fmt(ff.currentBalanceKg,0)} كجم متاحة الآن بالمخزن` : 'لا يوجد صنف "علف" مسجَّل بالمخزن بعد';
                const coverageTxt = ff.currentBalanceKg != null
                    ? (ff.currentBalanceKg >= targetRow.cumFeedKg
                        ? `<b style="color:var(--green);">✅ يكفي</b> للوصول ليوم ${targetAge}`
                        : `<b style="color:var(--red);">⚠️ ناقص ${fmt(targetRow.cumFeedKg - ff.currentBalanceKg,0)} كجم</b> للوصول ليوم ${targetAge}`)
                    : '';
                return `<div class="check-row"><div class="txt">
                        <div>🌾🔮 توقع العلف حتى يوم ${targetAge}: <b>${fmt(targetRow.cumFeedKg,0)} كجم</b> بتكلفة تقديرية <b>${money(remainingCost)}</b></div>
                        <div class="day">${balanceTxt}${coverageTxt ? ' — ' + coverageTxt : ''}</div>
                        <div class="day" style="margin-top:2px;">مبني على منحنى استهلاك السلالة × نسبة أداء الدفعة الفعلية (${fmt(ff.perfRatio*100,0)}% من معدل السلالة) وسعر علف ${fmt(priceInfo.price,2)} ج/كجم${priceInfo.source==='purchases'?' (فعلي من آخر مشتريات)':' (افتراضي، لا توجد مشتريات علف مسجَّلة بعد)'}</div>
                    </div></div>`;
            })();
            const corrLine = (label, corr, count, actionHint) => {
                if (corr == null) return `<div class="check-row"><div class="txt"><div>${label}</div><div class="day">بيانات غير كافية بعد (${count} قراءة مسجّلة، يحتاج 5 على الأقل)</div></div></div>`;
                const strength = Math.abs(corr) >= 0.5 ? 'قوي' : Math.abs(corr) >= 0.3 ? 'متوسط' : 'ضعيف';
                const strengthColor = Math.abs(corr) >= 0.5 ? 'var(--red)' : Math.abs(corr) >= 0.3 ? 'var(--warning-text)' : 'var(--muted)';
                const clear = Math.abs(corr) >= 0.3;
                const direction = corr > 0 ? 'كلما ارتفعت القيمة، زاد النفوق معها' : 'كلما ارتفعت القيمة، قلّ النفوق معها';
                const weakDetail = `أقرب ما توصّلنا له من بيانات هذه الدفعة: ارتباط ضعيف (r=${fmt(corr,2)}) ${corr>0?'موجب':'سالب'} — مش كافي للاعتماد عليه كنمط حقيقي (المطلوب r≥0.30 تقريبًا)، فضّل مراقبة العامل ده يدويًا لحد ما العدد يكبر`;
                return `<div class="check-row"><div class="txt"><div>${label}: <b style="color:${strengthColor};">${clear?`ارتباط ${strength} بالنفوق`:'لا يوجد ارتباط واضح حتى الآن'}</b> ${corrConfidence(count, corr)}</div>
                    <div class="day">${clear?`${direction} فى بيانات هذه الدورة${actionHint?` — ${actionHint}`:''}`:weakDetail}</div></div></div>`;
            };
            const lotHtml = !ins.feedLotAnalysis ? '' : (() => {
                const fl = ins.feedLotAnalysis;
                if (fl.flagged) {
                    const reasonTxt = fl.flagged.reason === 'weight' ? `متوسط انحراف الوزن ${fmt(fl.flagged.avgDev,1)}% مقابل متوسط ${fmt(fl.avgDevAll,1)}% فى باقي الشحنات — الوزن أضعف من المعتاد بوضوح خلال فترة هذه الشحنة`
                        : fl.flagged.reason === 'fcr' ? `معدل تحويل الفترة ${fmt(fl.flagged.periodFcr,2)} مقابل متوسط ${fmt(fl.avgFcrAll,2)} فى باقي الشحنات — معامل تحويل أسوأ بوضوح خلال فترة هذه الشحنة (فرق مؤكد إحصائيًا)`
                        : `معدل نفوق ${fmt(fl.flagged.mortPerDay,2)} طائر/يوم مقابل متوسط ${fmt(fl.avgMortRate,2)}`;
                    return `<div class="check-row"><div class="txt">
                        <div>🌾📦 شحنة العلف "<b>${fl.flagged.lot}</b>" مرتبطة بأداء أضعف (${fl.flagged.reason === 'weight' ? 'وزن' : fl.flagged.reason === 'fcr' ? 'معدل تحويل' : 'نفوق'})</div>
                        <div class="day">${reasonTxt} — يُنصح بمراجعة جودة هذه الشحنة مع المورد</div>
                    </div></div>`;
                }
                return `<div class="check-row"><div class="txt"><div>🌾📦 تتبع شحنات العلف: ${fl.segs.length} شحنات مرصودة</div><div class="day">لا يوجد فرق ملحوظ فى النفوق أو الوزن أو معدل التحويل بين الشحنات حتى الآن</div></div></div>`;
            })();
            const additiveHtml = !ins.additiveAnalysis ? '' : (() => {
                const aa = ins.additiveAnalysis;
                const reasonLabel = { mort: 'نفوق', weight: 'وزن', fcr: 'معدل تحويل' };
                // ============ 🔴 Red Team fix (تناغم الإضافات مع المشتريات): كان التحليل الإحصائي بيقول "الإضافة ============
                // دي مفيدة/ضارة" من غير أي فكرة عن تكلفتها الفعلية — لأن بروتوكول الإضافات (feedAdditives/waterAdditives)
                // مالوش أي ربط باسم الصنف فى المشتريات. هنا بنطابق اسم الإضافة مع وصف المشتريات (مطابقة نصية مرنة)
                // ونعرض إجمالي المصروف عليها جنب الأثر الإحصائي، عشان القرار (تكمل معاها ولا لأ) يبقى مبني على
                // الاتنين مع بعض: هل بتنفع؟ وهل تستاهل تكلفتها؟
                const additiveCostLookup = (name) => {
                    const norm = normalizeArabicName(name);
                    if (!norm) return null;
                    const matches = (b.purchases || []).filter(p => (p.type === 'إضافات' || p.type === 'أدوية ولقاحات') && p.desc && normalizeArabicName(p.desc).includes(norm));
                    if (!matches.length) return null;
                    return matches.reduce((s, p) => s + p.total, 0);
                };
                let html = '';
                if (aa.flagged) {
                    const topR = aa.flagged.reasons[0];
                    const txt = topR.key === 'weight' ? `الوزن أضعف من المعتاد بمتوسط ${fmt(aa.flagged.inactiveDev - aa.flagged.activeDev,1)}% وقت سريانه مقارنة بخارج فترته`
                        : topR.key === 'fcr' ? `معدل التحويل وقت السريان ${fmt(aa.flagged.activeFcr,2)} مقابل ${fmt(aa.flagged.inactiveFcr,2)} خارج فترته — أسوأ بوضوح (فرق مؤكد إحصائيًا)`
                        : `معدل نفوق ${fmt(aa.flagged.activeMortRate,2)} طائر/يوم وقت السريان مقابل ${fmt(aa.flagged.inactiveMortRate,2)} خارج فترته`;
                    const flaggedCost = additiveCostLookup(aa.flagged.name);
                    const costTxt = flaggedCost ? ` — رصدنا مشتريات باسم مطابق بإجمالي ${money(flaggedCost)}، يستاهل تراجع جدواها الاقتصادية طالما أثرها سلبي.` : '';
                    html += `<div class="check-row"><div class="txt">
                        <div>💊⚠️ "<b>${aa.flagged.name}</b>" (${aa.flagged.kind}) مرتبط بأداء أضعف (${reasonLabel[topR.key]}) وقت سريانه</div>
                        <div class="day">${txt} — يُنصح بمراجعة الجرعة/التوقيت أو السبب الذي استدعى إعطاءه، أو إيقافه لو تكرر نفس النمط فى دورات قادمة${costTxt}</div>
                    </div></div>`;
                }
                if (aa.improved) {
                    const topR = aa.improved.positiveReasons[0];
                    const txt = topR.key === 'weight' ? `الوزن أفضل من المعتاد بمتوسط ${fmt(aa.improved.activeDev - aa.improved.inactiveDev,1)}% وقت سريانه`
                        : `معدل التحويل وقت السريان ${fmt(aa.improved.activeFcr,2)} مقابل ${fmt(aa.improved.inactiveFcr,2)} خارج فترته — أفضل بوضوح (فرق مؤكد إحصائيًا)`;
                    const improvedCost = additiveCostLookup(aa.improved.name);
                    const costTxt = improvedCost ? ` — إجمالي مصروفك عليها حسب المشتريات المسجلة: ${money(improvedCost)}، قارنها بالفرق فى الأداء لتقييم الجدوى.` : '';
                    html += `<div class="check-row"><div class="txt">
                        <div>💊✅ "<b>${aa.improved.name}</b>" (${aa.improved.kind}) مرتبط بأداء أفضل (${reasonLabel[topR.key]}) وقت سريانه</div>
                        <div class="day">${txt} — مؤشر إيجابي يستحق الاستمرار عليه، خصوصًا لو تكرر فى دورات قادمة${costTxt}</div>
                    </div></div>`;
                }
                if (!html) html = `<div class="check-row"><div class="txt"><div>💊📦 تتبع أثر الإضافات/الأدوية على النفوق والوزن ومعدل التحويل: ${aa.rows.length} بند مرصود</div><div class="day">لا يوجد بند مرتبط بفرق واضح فى الأداء حتى الآن</div></div></div>`;
                return html;
            })();
            const stressHtml = (() => {
                if (!ins.envStressBest) return `<div class="check-row"><div class="txt"><div>🌡️💧🌬️ مؤشر الإجهاد البيئي المُركّب (حرارة+رطوبة+أمونيا)</div><div class="day">بيانات غير كافية بعد (${ins.stressPairsCount} قراءة مسجّلة، يحتاج 5 على الأقل)</div></div></div>`;
                const eb = ins.envStressBest;
                const clear = Math.abs(eb.corr) >= 0.3;
                const strength = Math.abs(eb.corr) >= 0.5 ? 'قوي' : 'متوسط';
                const strengthColor = Math.abs(eb.corr) >= 0.5 ? 'var(--red)' : 'var(--warning-text)';
                const lagTxt = eb.lag === 0 ? 'فى نفس اليوم' : (eb.lag === 1 ? 'بعد يوم واحد' : 'بعد يومين');
                if (clear && isDismissedToday(b, 'envStress')) return '';
                return `<div class="check-row"><div class="txt">
                        <div>🌡️💧🌬️ الإجهاد البيئي (حرارة+رطوبة+أمونيا) والنفوق: <b style="color:${clear?strengthColor:'var(--muted)'};">${clear?`ارتباط ${strength}`:'لا يوجد ارتباط واضح حتى الآن'}</b> ${corrConfidence(eb.count, eb.corr)}</div>
                        <div class="day">${clear?`النفوق بيرتفع بوضوح ${lagTxt} من كل مرة يرتفع فيها الإجهاد البيئي معًا (مش بالضرورة نفس اليوم) — راجع التهوية والتبريد وقت ارتفاع الحرارة/الرطوبة/الأمونيا مجتمعين`:`أقرب ما توصّلنا له: ارتباط ضعيف (r=${fmt(eb.corr,2)}) — مش كافي كنمط مؤكد بعد، تابع القراءات البيئية اليومية لتزيد الدقة`}</div>
                        ${ins.envMultiRegression ? (ins.envMultiRegression.modelWeak
                            ? `<div class="day" style="margin-top:4px;color:var(--muted);">🧮 حاولنا نفصل أثر كل عامل بيئي عن التانى (من ${ins.envMultiRegression.n} قراءة)، لكن النموذج ضعيف التفسير حاليًا (r²=${fmt(ins.envMultiRegression.r2*100,0)}%) — الأرجح إن العوامل مترابطة بقوة أو العينة لسه صغيرة، فمش هنعرض ترتيب "الأكثر تأثيرًا" حتى تتوفر بيانات أكتر</div>`
                            : `<div class="day" style="margin-top:4px;">🧮 لو فصلنا أثر كل عامل بيئي عن التانى (من ${ins.envMultiRegression.n} قراءة، جودة النموذج r²=${fmt(ins.envMultiRegression.r2*100,0)}%): العامل الأكثر تأثيرًا فعليًا على النفوق هو <b>${ins.envMultiRegression.dominant.label}</b> — يليه بالترتيب: ${ins.envMultiRegression.factors.slice(1).map(f=>f.label).join('، ') || '—'}</div>`
                        ) : ''}
                        ${clear ? insightActions('envStress', '🌡️ تسجيل قراءة بيئية', "openDailyModal('day')") : ''}
                    </div></div>`;
            })();
            const narrativeHtml = !ins.deviationNarrative ? '' : (() => {
                const dn = ins.deviationNarrative;
                let detail = 'تحليل آلي يربط توقيت الانحراف فى الوزن بتوقيت المؤشرات الأخرى — راجعه كدليل استرشادي وليس تشخيصًا نهائيًا';
                if (dn.type === 'stress' && dn.avgIn != null && dn.avgOut != null) {
                    const ratio = dn.avgOut > 0 ? (dn.avgIn / dn.avgOut) : null;
                    detail = `متوسط الإجهاد البيئي فى الفترة دى كان ${fmt(dn.avgIn,1)} مقابل ${fmt(dn.avgOut,1)} فى باقي أيام الدفعة${ratio ? ` (يعني تقريبًا ${fmt(ratio,1)}× أعلى)` : ''} — دى الفترة اللي غالبًا بدأ فيها الطائر يستهلك طاقة زيادة فى التعامل مع الحرارة/الرطوبة بدل النمو، فانعكس على الوزن`;
                } else if (dn.type === 'feed' && dn.feedDeficitPct != null) {
                    detail = `متوسط استهلاك العلف فى الفترة دى كان أقل من المعياري بـ${fmt(Math.abs(dn.feedDeficitPct),0)}% — يعني الطائر مكانش بياخد كمية العلف الكافية لتحقيق معدل النمو المستهدف فى السلالة، مش مجرد بطء نمو عادي`;
                }
                return `<div class="check-row"><div class="txt">
                    <div>${dn.text}</div>
                    <div class="day" style="margin-top:4px;">${detail}</div>
                </div></div>`;
            })();
            const causeHtml = !m.dominantCause ? '' : `<div class="check-row"><div class="txt">
                    <div>💀 السبب الأساسي للنفوق: <b>${m.dominantCause.label}</b> (${fmt(m.dominantCause.pct,0)}% من الحالات المصنّفة)</div>
                    <div class="day">من إجمالي ${m.mortCauseClassifiedTotal} حالة مصنّفة من ${m.cumMort} نفوق مسجَّل</div>
                    ${m.dominantCause.pct >= 20 ? `<div class="day" style="margin-top:3px;font-weight:700;color:var(--barn-dark);">${mortCauseActionHint(m.dominantCause.key)}</div>` : ''}
                    ${(m.dominantCause.pct >= 20 && m.dominantCause.key === 'disease') ? `<div class="row-actions owner-only" style="margin-top:6px;">
                        <button class="btn ghost sm" style="flex:1;" onclick="openVaccineModal()">💉 تسجيل تحصين/علاج</button>
                        <button class="btn ghost sm" style="flex:1;" onclick="document.getElementById('feedAddModalOverlay').classList.add('show')">💊 إضافة مضاد للعلف</button>
                    </div>` : ''}
                </div></div>`;
            const globalBenchHtml = (b.species !== 'broiler') ? '' : (() => {
                const rows = ['ross308', 'cobb500'].map(key => {
                    const std = GLOBAL_BREED_BENCHMARKS[key];
                    const gWeight = getGlobalBenchmarkWeight(key, m.age);
                    if (!gWeight) return '';
                    const diff = ((m.avgWeightG - gWeight) / gWeight) * 100;
                    return `${statLine(`${std.label} (يوم ${m.age})`, `${fmt(gWeight,0)} جم (${diff>=0?'+':''}${fmt(diff,1)}%)`, {vStyle:`color:${diff>=0?'var(--green)':'var(--red)'};`})}`;
                }).join('');
                return `<div class="check-row"><div class="txt">
                        <div>🌍 مقارنة بمعايير عالمية معتمدة (تقديرية)</div>
                        <div class="day" style="margin-top:4px;">${rows}</div>
                        <div class="day" style="margin-top:4px;">💡 لو حابب تخلي منحنى الوزن ده هو المرجع الفعلي لكل التنبيهات والحسابات (مش مجرد مقارنة)، فيه زرار تحميل جاهز فى الإعدادات ← الأرقام القياسية والمرجعية.</div>
                    </div></div>`;
            })();
            const farmBenchHtml = (() => {
                const fb = getFarmInternalBenchmark(b.species, b.id);
                if (!fb) return '';
                const fw = getFarmBenchmarkWeight(fb.curve, m.age);
                if (!fw) return '';
                const diff = ((m.avgWeightG - fw) / fw) * 100;
                return `<div class="check-row"><div class="txt">
                        <div>🏡 مقارنة بمعيار المزرعة الداخلي (متوسط ${fb.cycles} دورات سابقة)</div>
                        <div class="day" style="margin-top:4px;">${statLine(`وزن يوم ${m.age} فى دوراتك السابقة`, `${fmt(fw,0)} جم (${diff>=0?'+':''}${fmt(diff,1)}%)`, {vStyle:`color:${diff>=0?'var(--green)':'var(--red)'};`})}</div>
                        <div class="day" style="margin-top:2px;">${diff>=0?'أداء الدورة الحالية أفضل من متوسط مزرعتك السابق':'أداء الدورة الحالية أقل من متوسط مزرعتك السابق'} — مقياس أدق لتحسّنك الذاتي بخلاف مقارنة السلالة العالمية</div>
                    </div></div>`;
            })();
            // ============ منحنى المرجع الفعلي المستخدَم الآن فى كل حسابات الانحراف/التنبيهات لهذه الدورة (مزيج بيزي معياري×مزرعة) ============
            const blendedCurveHtml = (() => {
                const conf = getFarmCurveConfidence(b.species, b.id);
                if (!conf.active) return `<div class="check-row"><div class="txt">
                        <div>🧬📈 منحنى مرجعي خاص بمزرعتك</div>
                        <div class="day" style="margin-top:4px;">لسه بيعتمد 100% على المعيار العالمي — يحتاج ${FARM_CURVE_MIN_CYCLES}+ دورات مؤرشفة من نفس النوع عشان يبدأ يتشكّل (عندك حاليًا ${conf.cycles})</div>
                    </div></div>`;
                return `<div class="check-row"><div class="txt">
                        <div>🧬📈 منحنى مرجعي خاص بمزرعتك: <b style="color:var(--barn-dark);">${fmt(conf.weightPct,0)}% اعتماد على أدائك الفعلي</b></div>
                        <div class="day" style="margin-top:4px;">كل حسابات انحراف الوزن والعلف/FCR والتنبيهات فى هذه الدورة بتقارن الآن بمزيج من معيار السلالة العالمي وأداء ${conf.cycles} دورة مؤرشفة سابقة من نفس النوع، مش بالمعيار العالمي وحده — ده بيزيد مع كل دورة جديدة تؤرشفها</div>
                    </div></div>`;
            })();
            const bestCyclesHtml = (() => {
                const bc = computeBestCyclesBenchmark(b);
                if (!bc) return '';
                const cmp = (curVal, bestVal, higherIsBetter) => {
                    if (curVal == null || bestVal == null || bestVal === 0) return '';
                    const diffPct = ((curVal - bestVal) / Math.abs(bestVal)) * 100;
                    const good = higherIsBetter ? diffPct >= 0 : diffPct <= 0;
                    return `<span style="color:${good?'var(--green)':'var(--red)'};">(${diffPct>=0?'+':''}${fmt(diffPct,1)}%)</span>`;
                };
                const rowsHtml = bc.top.map((r, i) => `${statLine(`${i+1}. ${esc(r.name)} (${r.startDate})`, `EPEF ${fmt(r.epef,0)} · FCR ${fmt(r.fcr,2)} · نفوق ${fmt(r.mortRate,2)}%`)}`).join('');
                return `<div class="check-row"><div class="txt">
                        <div>🏆 مقارنة بأفضل ${bc.top.length} دورات سابقة (من أصل ${bc.sampleSize}، حسب EPEF) ${confBadgeHtml(bc.sampleSize)}</div>
                        <div class="day" style="margin-top:4px;">
                            ${statLine(`EPEF الحالي مقابل متوسط الأفضل`, `${fmt(m.epef,0)} مقابل ${fmt(bc.avg.epef,0)} ${cmp(m.epef, bc.avg.epef, true)}`)}
                            ${statLine(`FCR الحالي مقابل متوسط الأفضل`, `${m.fcr?fmt(m.fcr,2):'—'} مقابل ${fmt(bc.avg.fcr,2)} ${m.fcr?cmp(m.fcr, bc.avg.fcr, false):''}`)}
                            ${statLine(`نسبة النفوق الحالية مقابل متوسط الأفضل`, `${fmt(m.mortRate,2)}% مقابل ${fmt(bc.avg.mortRate,2)}% ${cmp(m.mortRate, bc.avg.mortRate, false)}`)}
                            ${statLine(`تكلفة الكيلو الحالية مقابل متوسط الأفضل`, `${money(fin.costPerKg)} مقابل ${money(bc.avg.costPerKg)} ${cmp(fin.costPerKg, bc.avg.costPerKg, false)}`)}
                            <div style="margin-top:6px;font-weight:700;">أفضل دوراتك المسجَّلة:</div>
                            ${rowsHtml}
                        </div>
                        <div class="day" style="margin-top:4px;">هدف استرشادي: تقريب أداء الدورة الحالية من أفضل ما حققته فعلًا، مش بس المتوسط العام — ده سقف مُثبت وقابل للتكرار على أرض الواقع.</div>
                    </div></div>`;
            })();
            const treatmentHtml = !ins.treatmentImpact ? '' : (() => {
                const ti = ins.treatmentImpact;
                if (ti.best) {
                    const extra = [];
                    if (ti.best.nh3Before != null && ti.best.nh3After != null) extra.push(`أمونيا ${fmt(ti.best.nh3Before,1)}→${fmt(ti.best.nh3After,1)} ppm${ti.best.nh3StatSignificant===false?' (فرق غير مؤكد إحصائيًا)':''}`);
                    if (ti.best.devBefore != null && ti.best.devAfter != null) extra.push(`انحراف الوزن ${fmt(ti.best.devBefore,1)}%→${fmt(ti.best.devAfter,1)}%${ti.best.devStatSignificant===false?' (فرق غير مؤكد إحصائيًا)':''}`);
                    // ✅ الـ FCR اليومي التقريبي دلوقتي بيتفحص بنفس اختبار Welch المستخدم للأمونيا/الوزن.
                    if (ti.best.fcrBefore != null && ti.best.fcrAfter != null) extra.push(`معدل التحويل ${fmt(ti.best.fcrBefore,2)}→${fmt(ti.best.fcrAfter,2)}${ti.best.fcrStatSignificant===false?' (فرق غير مؤكد إحصائيًا)':''}`);
                    return `<div class="check-row"><div class="txt">
                        <div>🪣✅ معاملة "<b>${ti.best.name}</b>" (يوم ${ti.best.doneAge}) مرتبطة بتحسّن ملموس بعد التنفيذ</div>
                        <div class="day">نفوق ${fmt(ti.best.mortBefore,2)}→${fmt(ti.best.mortAfter,2)} طائر/يوم${extra.length ? ' · ' + extra.join(' · ') : ''} (مقارنة 3 أيام قبل/بعد) — مؤشر جيد لتكرارها فى نفس التوقيت بالدورات القادمة</div>
                    </div></div>`;
                }
                return `<div class="check-row"><div class="txt"><div>🪣 تتبع أثر معاملات الفرشة/السبلة: ${ti.rows.length} معاملة منفَّذة مرصودة</div><div class="day">لا يوجد تحسّن واضح (نفوق/وزن/معدل تحويل) مرتبط بتوقيت التنفيذ حتى الآن</div></div></div>`;
            })();
            const uniformityHtml = (() => {
                const u = getLatestUniformity(b);
                if (!u) return '';
                const label = u.cv <= 8 ? 'ممتاز' : (u.cv <= 12 ? 'متوسط' : 'ضعيف');
                const color = u.cv <= 8 ? 'var(--green)' : (u.cv <= 12 ? 'var(--warning-text)' : 'var(--red)');
                return `<div class="check-row"><div class="txt">
                        <div>📏 تجانس القطيع (يوم ${u.age}، عيّنة ${u.n} طائر): <b style="color:${color};">${label} (تفاوت ${fmt(u.cv,1)}%)</b></div>
                        <div class="day">${fmt(u.pctWithin10,0)}% من العيّنة وزنها قريب من المتوسط (±10% من ${fmt(u.mean,0)} جم) — كل ما زادت هذه النسبة كل ما كان القطيع أكثر تجانسًا. الهدف المعتاد: تفاوت أقل من 8%</div>
                    </div></div>`;
            })();
            const waterQualityHtml = (() => {
                const lastWQ = [...b.records].reverse().find(r => r.waterPh != null || r.waterSalinity != null);
                if (!lastWQ) return '';
                return `<div class="check-row"><div class="txt">
                        <div>💧 آخر قراءة جودة مياه شرب (يوم ${lastWQ.age})</div>
                        <div class="day">${lastWQ.waterPh!=null?`pH: ${fmt(lastWQ.waterPh,1)} `:''}${lastWQ.waterSalinity!=null?`· ملوحة (TDS): ${fmt(lastWQ.waterSalinity,0)} ppm`:''}</div>
                    </div></div>`;
            })();
            // ============ 🔴 إصلاح Red Team: "احتمالية مشكلة قادمة" اتشالت من هنا نهائيًا — بقت مدموجة داخل كارت "🩺 درجة صحة الدفعة" فقط ============
            // (نظام هجين واحد بدل ما نفس المعلومة تتكرر فى مكانين بصيغتين مختلفتين ومقياسين مختلفين — شوف computeHealthScore)
            const riskIndexHtml = '';
            const weeklyStressHtml = !ins.weeklyStress ? '' : (() => {
                if (isDismissedToday(b, 'weeklyStress')) return '';
                const ws = ins.weeklyStress;
                const rowsHtml = ws.weeks.map(w => `${statLine(`أسبوع ${w.week} (يوم ${w.from}-${w.to})`, `إجهاد ${fmt(w.avgStress,1)} · نفوق ${fmt(w.avgMort,1)}/يوم`, {vStyle:`${w.week===ws.worst.week?'color:var(--red);font-weight:800;':''}`})}`).join('');
                return `<div class="check-row"><div class="txt">
                        <div>🌡️💧🌬️ الإجهاد البيئي حسب الأسبوع العمري</div>
                        <div class="day" style="margin-top:4px;">${rowsHtml}</div>
                        <div class="day" style="margin-top:2px;">أعلى إجهاد كان فى الأسبوع ${ws.worst.week} — راجع التهوية والتبريد وقت تكرار نفس الظروف فى الدورات القادمة عند نفس العمر</div>
                        ${insightActions('weeklyStress', null, null)}
                    </div></div>`;
            })();
            const weightZHtml = !ins.weightZAnomaly ? '' : (() => {
                if (isDismissedToday(b, 'weightZ')) return '';
                const wz = ins.weightZAnomaly;
                const unusual = Math.abs(wz.z) >= 3 ? 'مختلفة جدًا' : 'مختلفة بشكل ملحوظ';
                const rec = b.records.find(r => r.age === wz.age);
                return `<div class="check-row"><div class="txt">
                        <div>📏⚠️ آخر وزنة (يوم ${wz.age}) ${unusual} عن باقي وزنات هذه الدفعة</div>
                        <div class="day">الانحراف الحالي عن الوزن المعياري (${fmt(wz.dev,1)}%) ${wz.z>0?'أعلى':'أقل'} بوضوح من المعتاد فى هذه الدفعة (متوسط انحرافها ${fmt(wz.baselineMean,1)}%) — إما خطأ فى الميزان، أو تغيّر حقيقي مفاجئ يستاهل تتأكد من سببه</div>
                        ${insightActions('weightZ', rec ? '✏️ مراجعة/تعديل الوزنة' : null, rec ? `editDailyRecord('${rec.date}')` : null)}
                    </div></div>`;
            })();
            const waterQualityCorrHtml = !ins.waterQualityCorr ? '' : (() => {
                const wq = ins.waterQualityCorr;
                const line = (res, label, count) => {
                    if (!res) return '';
                    const clear = Math.abs(res.corr) >= 0.3;
                    if (!clear) return '';
                    const lagTxt = res.lag === 0 ? 'نفس اليوم' : res.lag === 1 ? 'بعد يوم' : 'بعد يومين';
                    return `${statLine(`${label}`, `ارتباط بالنفوق ${lagTxt} ${corrConfidence(res.count, res.corr)}`, {vStyle:`color:var(--red);`})}`;
                };
                const phLine = line(wq.ph, 'الانحراف عن pH المحايد', wq.phCount);
                const salLine = line(wq.salinity, 'الملوحة (TDS)', wq.salCount);
                if (!phLine && !salLine) return '';
                if (isDismissedToday(b, 'waterQualityCorr')) return '';
                return `<div class="check-row"><div class="txt">
                        <div>💧🧪 جودة مياه الشرب وعلاقتها بالنفوق (لهذه الدفعة)</div>
                        <div class="day" style="margin-top:4px;">${phLine}${salLine}</div>
                        ${insightActions('waterQualityCorr', '💧 تسجيل جودة مياه جديدة', "openDailyModal('day')")}
                    </div></div>`;
            })();
            const vaccineImpactHtml = !ins.vaccineImpact ? '' : (() => {
                const vi = ins.vaccineImpact;
                if (vi.flagged) return `<div class="check-row"><div class="txt">
                        <div>💉⚠️ تحصين "<b>${vi.flagged.name}</b>" (يوم ${vi.flagged.doneAge}) مرتبط بارتفاع نفوق بعده</div>
                        <div class="day">نفوق ${fmt(vi.flagged.mortBefore,2)}→${fmt(vi.flagged.mortAfter,2)} طائر/يوم (مقارنة 3 أيام قبل/بعد) — طبيعي جزئيًا مع بعض التحصينات، لكن راجع مع البيطري لو تكرر النمط فى دورات قادمة</div>
                    </div></div>`;
                return `<div class="check-row"><div class="txt"><div>💉 تتبع أثر توقيت التحصينات على الأداء: ${vi.rows.length} تحصين مرصود</div><div class="day">لا يوجد ارتفاع نفوق ملحوظ مرتبط بتوقيت أي تحصين حتى الآن</div></div></div>`;
            })();
            const weekOverWeekHtml = !ins.weekOverWeekVsHistory ? '' : (() => {
                const ww = ins.weekOverWeekVsHistory;
                const mortColor = ww.mortDiffPct != null && ww.mortDiffPct > 20 ? 'var(--red)' : (ww.mortDiffPct != null && ww.mortDiffPct < -20 ? 'var(--green)' : 'var(--muted)');
                return `<div class="check-row"><div class="txt">
                        <div>📅 مقارنة الأسبوع ${ww.week} (يوم ${ww.from}-${ww.to}) بنفس الأسبوع من ${ww.sampleSize} دورة سابقة</div>
                        <div class="day" style="margin-top:4px;">
                            ${statLine(`نفوق/يوم هذا الأسبوع`, `${fmt(ww.curMortPerDay,2)} مقابل متوسط ${fmt(ww.avgHistMort,2)}${ww.mortDiffPct!=null?` (${ww.mortDiffPct>=0?'+':''}${fmt(ww.mortDiffPct,0)}%)`:''}`, {vStyle:`color:${mortColor};`})}
                            ${ww.curFcrLatest && ww.avgHistFcr ? `${statLine(`FCR التراكمي حتى الآن`, `${fmt(ww.curFcrLatest,2)} مقابل متوسط ${fmt(ww.avgHistFcr,2)}${ww.fcrDiffPct!=null?` (${ww.fcrDiffPct>=0?'+':''}${fmt(ww.fcrDiffPct,0)}%)`:''}`)}` : ''}
                        </div>
                        <div class="day" style="margin-top:2px;">مؤشر مبكر فى نص الدورة — لا تنتظر النتيجة النهائية لتكتشف الانحراف عن أدائك المعتاد</div>
                    </div></div>`;
            })();
            const epefProj = computeEpefProjection(b, m);
            const epefProjHtml = !epefProj ? '' : (() => {
                const vsBest = epefProj.bestEpef ? epefProj.projEpef - epefProj.bestEpef : null;
                const color = vsBest == null ? 'var(--muted)' : (vsBest >= 0 ? 'var(--green)' : (vsBest >= -20 ? 'var(--warning-text)' : 'var(--red)'));
                return `<div class="check-row"><div class="txt">
                    <div>🎯 EPEF نهائي متوقع (لو استمريت بنفس المعدل الحالي حتى يوم ${epefProj.targetAge}): <b style="color:${color};">${fmt(epefProj.projEpef,0)}</b> ${confBadgeHtml(epefProj.sampleSize)}</div>
                    <div class="day">وزن متوقع ${fmt(epefProj.projWeightKg*1000,0)} جم · بقاء متوقع ${fmt(epefProj.projLiveCountPct,1)}% · FCR بنفس المعدل الحالي ${fmt(epefProj.projFcr,2)}${epefProj.bestEpef ? ` — مقابل أفضل EPEF فعلي محقق سابقًا: ${fmt(epefProj.bestEpef,0)}` : ' (لا توجد دورة مؤرشفة سابقة للمقارنة بعد)'}</div>
                    ${epefProj.epefPercentile != null ? `<div class="day" style="margin-top:2px;">📊 لو تحقق هذا الرقم، هيبقى أفضل من ${epefProj.epefPercentile}% من دوراتك المؤرشفة السابقة لنفس النوع (${epefProj.sampleSize} دورة)</div>` : ''}
                    <div class="day" style="margin-top:2px;">تقدير مباشر يتحدث يوميًا — مش رقمك النهائي الفعلي، لكنه بيوريك بدري لو محتاج تعدّل حاجة قبل ما تفوّت الفرصة</div>
                </div></div>`;
            })();
            // ===== 1) نقطة بداية الانحراف =====
            const devOnsetHtml = (!ins.devOnset || isDismissedToday(b, 'devOnset')) ? '' : (() => {
                const dn = ins.deviationNarrative;
                const linked = dn && dn.direction === 'down' && dn.ageFrom <= ins.devOnset.age && ins.devOnset.age <= dn.ageTo;
                const causeTxt = linked
                    ? (dn.type === 'stress' ? `التوقيت ده بيتطابق مع فترة ارتفاع إجهاد بيئي واضح (${fmt(dn.avgIn,1)} مقابل ${fmt(dn.avgOut,1)} فى باقي الدفعة) — الاحتمال الأقوى إن السبب بيئي (حرارة/رطوبة/أمونيا)`
                    : `التوقيت ده بيتطابق مع فترة نقص فى استهلاك العلف عن المعياري بـ${fmt(Math.abs(dn.feedDeficitPct),0)}% — الاحتمال الأقوى إن السبب تغذوي (كمية/جودة العلف وقتها)`)
                    : 'مفيش سبب واضح مرتبط زمنيًا لسه — راجع سجلاتك وقتها (علف/بيئة/صحة) يدويًا لمعرفة السبب';
                return `<div class="check-row"><div class="txt">
                <div style="color:var(--red);font-weight:800;">📍 بداية الانحراف المستدام عن الوزن المعياري: يوم ${ins.devOnset.age}</div>
                <div class="day">من يوم ${ins.devOnset.age} الانحراف بقى سلبي ومستمر (${fmt(ins.devOnset.dev,1)}%) — ${causeTxt}</div>
                ${insightActions('devOnset', null, null)}
            </div></div>`;
            })();
            // ===== 2) تكلفة النفوق بالجنيه =====
            const mortCost = computeMortalityCost(b, m, fin);
            const mortCostHtml = !mortCost ? '' : `<div class="check-row"><div class="txt">
                <div>💸 تكلفة النفوق حتى الآن: <b style="color:var(--red);">${money(mortCost.lostValue)}</b></div>
                <div class="day">${fmt(mortCost.deadCount,0)} طائر نافق/مستبعد × القيمة السوقية المتوقعة عند وزن البيع المستهدف</div>
            </div></div>`;
            // ===== 3) مؤشر كفاءة اليوم =====
            const effScore = computeDailyEfficiencyScore(b, m);
            const effScoreHtml = effScore == null ? '' : (() => {
                const color = effScore >= 80 ? 'var(--green)' : effScore >= 60 ? 'var(--warning-text)' : 'var(--red)';
                return `<div class="check-row"><div class="txt">
                    <div>⚡ مؤشر كفاءة اليوم المركّب${glossHtml('dailyEfficiency')}: <b style="color:${color};font-size:16px;">${effScore}/100</b></div>
                    <div class="day">يجمع النمو والعلف والنفوق والبيئة فى رقم واحد — كل ما اقترب من 100 كل ما اليوم كان مطابق للمثالي</div>
                </div></div>`;
            })();
            // ===== 4) تحليل موسمي =====
            const seasonal = computeSeasonalAnalysis(b.species);
            const seasonalHtml = !seasonal ? '' : `<div class="check-row"><div class="txt">
                <div>🗓️ تحليل موسمي عبر دوراتك السابقة (${getSpeciesData(b.species).label}) ${confBadgeHtml(seasonal.reduce((s,x)=>s+x.count,0))}</div>
                <div class="day">${seasonal.map(s => `${s.season}: FCR ${s.avgFcr?fmt(s.avgFcr,2):'—'} · نفوق ${s.avgMort?fmt(s.avgMort,2)+'%':'—'} (${s.count} دورة${s.lowConfidence?' — ⚠️ عينة صغيرة':''})`).join(' · ')}</div>
            </div></div>`;
            // ===== 5) أثر الإضافات — (أُزيل: computeAdditiveImpact كانت مقارنة قديمة ساذجة قبل/بعد بنافذة
            //    ثابتة 3-4 أيام بدون أي اختبار دلالة إحصائية، من additiveExecLog. اتستبدلت تمامًا بتحليل
            //    additiveAnalysis/ins.additiveAnalysis الأحدث والأدق (سلسلة fcrDaily + اختبار Welch على
            //    النفوق/الوزن/التحويل معًا، فترات سريان حقيقية مش نافذة ثابتة). كانت الاتنين بتظهروا فى نفس
            //    المجموعة تحت بعض، وده كان بيسبب تناقض محيّر أحيانًا — نفس الإضافة ممكن تظهر "تحسّن" فى
            //    البطاقة القديمة و"غير مؤكد إحصائيًا" فى الجديدة. شوف additiveHtml تحت لنفس التحليل بس أدق. =====
            // ===== 6) اللقاحات القادمة خلال 7 أيام =====
            const upcomingVacc = computeUpcomingVaccines7d(b, m);
            const upcomingVaccHtml = (!upcomingVacc.length || isDismissedToday(b, 'upcomingVacc')) ? '' : `<div class="check-row"><div class="txt">
                <div>💉 لقاحات مستحقة خلال 7 أيام قادمة</div>
                <div class="day">${upcomingVacc.map(v => `<span style="color:${v.importance==='عاجل'?'var(--red)':v.importance==='قريب'?'var(--warning-text)':'var(--muted)'};font-weight:700;">${v.importance}</span> — ${esc(v.name)} (يوم ${v.day}، بعد ${v.daysAway} يوم)`).join('<br>')}</div>
                ${insightActions('upcomingVacc', '💉 تسجيل تحصين/علاج', 'openVaccineModal()')}
            </div></div>`;
            // ===== 7) مقارنة العنابر النشطة — مدموجة بالفعل فى قسم "نظرة عامة على كل الدفعات/العنابر النشطة" بالأسفل، بدون تكرار هنا =====
            // ===== 8) مؤشر ثقة البيانات — مدموج بالفعل فى بطاقة "تغطية التسجيل" أعلى لوحة التحكم، بدون تكرار هنا =====
            // ===== 9) (أُزيل: عائد التبريد/التهوية كان معتمدًا على ساعات تشغيل المعدات المُزالة) =====
            // ===== 10) خطر الأمراض التنفسية =====
            const respRisk = computeRespiratoryRisk(b, m);
            const respRiskHtml = (!respRisk || isDismissedToday(b, 'respRisk')) ? '' : `<div class="check-row"><div class="txt">
                <div style="color:${respRisk.level==='high'?'var(--red)':'var(--warning-text)'};font-weight:800;">🫁 احتمالية إجهاد/مشاكل تنفسية: ${respRisk.level==='high'?'مرتفعة':'متوسطة'}</div>
                <div class="day">${respRisk.avgHumid!=null?`متوسط رطوبة آخر 5 أيام ${fmt(respRisk.avgHumid,0)}%`:''}${respRisk.avgNh3!=null?` · أمونيا ${fmt(respRisk.avgNh3,0)}ppm`:''} · الموسم الحالي ${respRisk.season} — راجع معدلات التهوية الدنيا الآن قبل ظهور أعراض فعلية</div>
                ${insightActions('respRisk', '🌬️ تسجيل قراءة بيئية', "openDailyModal('day')")}
            </div></div>`;
            const feedCorrHtml = corrLine('🌾 علاقة استهلاك العلف/طائر بالنفوق اليومي', ins.feedCorr, ins.feedPairsCount, ins.feedCorr!=null && ins.feedCorr < 0 ? 'راجع سبب نقص استهلاك العلف فى الأيام اللي فيها النفوق أعلى (جودة العلف، ازدحام المعالف، أو مرض)' : null);
            const waterFeedRatioHtml = (() => {
                const wf = ins.waterFeedAnalysis;
                if (!wf) return `<div class="check-row"><div class="txt"><div>💧🌾 نسبة الماء:العلف اليومية (مؤشر إجهاد مبكر)</div><div class="day">بيانات غير كافية بعد (يحتاج تسجيل العلف والماء يوميًا فى 5 أيام على الأقل)</div></div></div>`;
                const baseline = wf.refWfr || wf.overallAvg;
                const devTxt = wf.deviationPct != null ? `${wf.deviationPct>=0?'+':''}${fmt(wf.deviationPct,0)}%` : '—';
                const devColor = waterFeedDeviationColor(wf.deviationPct);
                const isHigh = wf.deviationPct != null && wf.deviationPct >= 8;
                if (isHigh && isDismissedToday(b, 'waterFeedRatio')) return '';
                // ⚠️ إصلاح: كان بيعرض "مرتبط بارتفاع النفوق" لمجرد |r|≥0.3 من غير فحص دلالة إحصائية
                // ولا شارة ثقة — بعكس نفس التحليل بالظبط فى مؤشر الإجهاد البيئي (stressHtml) اللي
                // بيحط corrConfidence() جنبه. دلوقتي بنشترط pearsonSignificant وبنضيف نفس الشارة.
                const corrIsSig = wf.corr && pearsonSignificant(wf.corr.corr, wf.corr.count);
                const corrTxt = wf.corr && Math.abs(wf.corr.corr) >= 0.3
                    ? `<br>ارتفاع النسبة عن المعتاد ${corrIsSig ? 'مرتبط' : 'قد يكون مرتبطًا (غير مؤكد إحصائيًا بعد)'} بارتفاع النفوق ${wf.corr.lag===0?'فى نفس اليوم':'بعد يوم واحد'} فى بيانات هذه الدورة ${corrConfidence(wf.corr.count, wf.corr.corr)}`
                    : '';
                return `<div class="check-row"><div class="txt">
                    <div>💧🌾 نسبة الماء:العلف — آخر 3 أيام: <b>${fmt(wf.recentAvg,2)}</b> مقابل المرجعي ${fmt(baseline,2)} (<b style="color:${devColor};">${devTxt}</b>)</div>
                    <div class="day">${isHigh ? 'ارتفاع ملحوظ عن الطبيعي — غالبًا يسبق أعراض الإجهاد الحراري أو المرض بيوم أو يومين، راجع الحرارة والتهوية والصحة العامة للقطيع الآن' : 'ضمن النطاق الطبيعي تقريبًا'}${corrTxt}</div>
                    ${isHigh ? insightActions('waterFeedRatio', '🌡️ تسجيل قراءة بيئية', "openDailyModal('day')") : ''}
                </div></div>`;
            })();
            // ============ تجميع التحليلات فى 4 مجموعات مصنّفة بدل عرضها كلها فى كومة واحدة غير منظمة ============
            const groupAttentionArr = [respRiskHtml, devOnsetHtml, riskIndexHtml, upcomingVaccHtml, weeklyStressHtml, weightZHtml, stressHtml, waterFeedRatioHtml, waterQualityCorrHtml].filter(Boolean);
            const groupForecastArr = [epefProjHtml, saleHtml, devHtml, predHtml, fcrPredHtml, feedForecastHtml, weekOverWeekHtml].filter(Boolean);
            const groupPerformanceArr = [effScoreHtml, mortCostHtml, additiveHtml, treatmentHtml, vaccineImpactHtml, uniformityHtml, waterQualityHtml, causeHtml, lotHtml, narrativeHtml, feedCorrHtml].filter(Boolean);
            const groupBenchmarkArr = [seasonalHtml, globalBenchHtml, blendedCurveHtml, farmBenchHtml, bestCyclesHtml].filter(Boolean);
            // ============ 🔴 إصلاح Red Team (مدموج): إخفاء فئة كاملة من "🔬 تحليلات ذكية" (مش بس القسم كله) — عشان لو ============
            // "مقارنات ومعايير" مثلاً مش مفيدة لمزرعتك، تشيلها نهائيًا بدل ما تطويها كل مرة تفتح الداشبورد.
            const hiddenInsightGroups = (state.appSettings && state.appSettings.insightGroupsHidden) || [];
            const insightGroup = (gkey, title, icon, desc, arr, openByDefault) => (!arr.length || hiddenInsightGroups.includes(gkey)) ? '' : `
                <details class="insight-group" data-gkey="${gkey}" ${openByDefault ? 'open' : ''}>
                    <summary>
                        <div class="igrp-top">
                            <span class="igrp-icon">${icon}</span>
                            <span class="igrp-title">${title}</span>
                            <span class="igrp-count">${arr.length}</span>
                        </div>
                        <div class="igrp-desc">${desc}</div>
                    </summary>
                    <div class="igrp-body">${arr.join('')}</div>
                </details>`;
            // ============ إعادة هيكلة 2026: "يحتاج انتباه الآن" اتشالت من هنا نهائيًا — بقت مدموجة مع كل التنبيهات ============
            // فى قسم واحد موحّد "⚠️ يحتاج متابعتك الآن" (اتبنى تحت، قبل مكانه القديم فوق "🩺 درجة صحة الدفعة").
            // السبب: كانت نفس الفكرة ("حاجة عاجلة محتاجة تتصرف فيها") معروضة فى 3 أماكن مختلفة بالداشبورد
            // (hero-priority + هنا + allAlertsSection) بميكانيكية وتسميات مختلفة — ده كان اللي بيلخبط.
            // "تحليلات ذكية" دلوقتي بقت مخصصة بس للتحليل التفسيري/الاستشرافي (مش للتنبيهات العاجلة).
            const totalInsights = ['forecast','performance','benchmark'].filter(k => !hiddenInsightGroups.includes(k))
                .reduce((s, k) => s + ({forecast: groupForecastArr, performance: groupPerformanceArr, benchmark: groupBenchmarkArr}[k].length), 0);
            const insightsSection = !totalInsights ? '' : `<div class="section" id="smartInsightsSection"><div class="section-head"><h2>🔬 تحليلات ذكية</h2></div>
                <p style="font-size:11px;color:var(--muted);margin:-4px 2px 8px;">دي تحليلات لفهم الاتجاه العام والتخطيط — مش تنبيهات عاجلة. لو فيه حاجة محتاجة تتصرف فيها دلوقتي، هتلاقيها فوق فى "⚠️ يحتاج متابعتك الآن".</p>
                <div class="card" style="padding:0;overflow:hidden;">
                    ${insightGroup('forecast', 'توقعات', '🔮', 'أرقام متوقعة لو استمر الوضع الحالي (وزن البيع، EPEF، سعر البيع الأمثل)', groupForecastArr, true)}
                    ${insightGroup('performance', 'أداء وكفاءة', '📊', 'تحليل وصفي لأداء الدورة الحالية (تكلفة، تجانس، أثر الإضافات)', groupPerformanceArr, false)}
                    ${insightGroup('benchmark', 'مقارنات ومعايير', '🌍', 'مقارنة بدوراتك السابقة والمعايير العالمية للسلالة', groupBenchmarkArr, false)}
                </div>
                <p style="font-size:10.5px;color:var(--muted);margin:6px 2px 0;">💡 هذه التحليلات إحصائية مبنية على بيانات هذه الدورة فقط، وتُستخدم كمؤشر إضافي للمتابعة وليست بديلاً عن التقييم البيطري المباشر. المقارنة بالمعايير العالمية تقريبية وقد تختلف عن أحدث دليل أداء رسمي.</p>
            </div>`;
            const others = activeBatches();
            const multiHouseSection = others.length > 1 ? `
            <div class="section" style="margin-top:0;"><div class="section-head"><h2>🏘️ نظرة عامة على كل الدفعات/العنابر النشطة</h2></div>
                <div class="card" style="padding:0;">
                    ${others.map(x => {
                        const xm = computeMetrics(x);
                        const isActive = x.id === state.activeId;
                        const stdW = getRefValue(x, 'weight', xm.todayAge) || 0;
                        const devPct = stdW > 0 ? ((xm.avgWeightG - stdW) / stdW) * 100 : null;
                        return `<div class="check-row" style="${isActive?'background:rgba(217,165,68,.12);border-right:3px solid var(--wheat);':''}cursor:pointer;" onclick="selectBatch('${x.id}')">
                            <div class="txt">
                                <div style="font-weight:800;">${esc(x.name)}${x.location?' — 📍 '+esc(x.location):''} ${isActive?'<span class="pill ok" style="font-size:10px;">الحالية</span>':''}</div>
                                <div class="day">يوم ${xm.todayAge} · ${fmt(xm.liveCount,0)} طائر (${fmt(xm.liveCountPct,1)}%) · نفوق ${fmt(xm.mortRate,2)}% · FCR ${xm.fcr?fmt(xm.fcr,2):'—'}${devPct!=null?` · ${devPct>=0?'+':''}${fmt(devPct,1)}% عن المعياري`:''}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : '';
            // ============ تفصيل أداء العنابر (لو الدفعة موزّعة على أكتر من عنبر) ============
            // ملحوظة: السجل اليومي مُسجَّل على مستوى الدفعة ككل (مفيش تسجيل يومي منفصل لكل عنبر)،
            // فالتفصيل هنا تقديري بالتناسب مع عدد/مساحة كل عنبر — مفيد لمقارنة الكثافة، وليس بديلاً عن سجل يومي منفصل فعلي.
            const housesSection = (b.houses && b.houses.length > 1) ? (() => {
                const totalHouseCount = b.houses.reduce((s, h) => s + (h.count || 0), 0) || b.startCount;
                const rows = b.houses.map(h => {
                    const share = totalHouseCount > 0 ? (h.count || 0) / totalHouseCount : 0;
                    const estLive = m.liveCount * share;
                    const estDensity = (h.area > 0) ? (estLive * m.avgWeightG / 1000) / h.area : null;
                    return `<div class="check-row"><div class="txt">
                            <div style="font-weight:700;">🏠 ${esc(h.name)}</div>
                            <div class="day">${fmt(h.count||0,0)} طائر بداية (${fmt(share*100,0)}% من الدفعة) · مساحة ${fmt(h.area||0,0)} م² ${estDensity!=null?`· كثافة تقديرية ${fmt(estDensity,1)} كجم/م²`:''}</div>
                        </div></div>`;
                }).join('');
                return `<div class="section" style="margin-top:0;"><div class="section-head"><h2>🏠 تفصيل أداء العنابر (تقديري بالتناسب)</h2></div>
                    <div class="card" style="padding:0;">${rows}</div>
                    <p style="font-size:10.5px;color:var(--muted);margin:6px 2px 0;">💡 السجل اليومي مُسجَّل على مستوى الدفعة كاملة؛ الأرقام هنا تقديرية بالتناسب مع عدد/مساحة كل عنبر، مفيدة لمقارنة الكثافة بين العنابر وليست قياسًا فعليًا منفصلًا لكل عنبر.</p>
                </div>`;
            })() : '';
            const ops = computeOpsRisk(b, m);
            const hs = computeHealthScore(b, m, alerts, ins, ops);
            // ============ 🎯 أهم 3 أفعال الآن: من محرك القرار الموحّد (إنتاج + مالية + تشغيل + بيئة/طقس فى مكان واحد) ============
            const unified = computeUnifiedPriorities(b, m, fin, alerts, ins, ops, hs, saleAdv);
            // 🎨 نظام تصميم موحّد: بادچات المجال والإلحاح بقت كلاسات CSS مركزية (.badge-domain-*/.badge-urgency-*
            // فى main.css) بدل كائنات JS بتتبني من الصفر فى كل رسمة — تغيير اللون دلوقتي مكان واحد بس، مش هنا وهناك.
            const urgencyClass = { 'اليوم': 'badge-urgency-today', 'هذا الأسبوع': 'badge-urgency-week', 'مراقبة': 'badge-urgency-watch' };
            // 🎨 إعادة تصميم (مرحلة 2 — بصري فقط، نفس بيانات unified.top3 بالظبط): بدل عرض 3 أفعال بنفس
            // الوزن البصري، أهم فعل (top3[0]) بيبقى بارز فى كارت Hero علوي، والباقي (top3[1..]) قايمة مختصرة تحته.
            const heroPick = unified.top3[0];
            const restPicks = unified.top3.slice(1);
            // ============ 🔴 إصلاح Red Team: كل بند بقى فعل قابل للتنفيذ فورًا، مش وصف بس ============
            // كل بند بيتسجّل فى سجل الأفعال العام (registerKatkotAction) وياخد زرار "نفّذ الآن" بيستدعي
            // runKatkotAction(index) — اللي بيفتح المودال الصحيح فعليًا أو ينقل المستخدم للتبويب/القسم
            // المسؤول عن حل المشكلة دي بالظبط، بدل ما يفضل يقرأ الجملة ويدوّر بنفسه على مكان التنفيذ.
            const actionBtnHtml = (action) => {
                if (!action) return '';
                const idx = registerKatkotAction(action);
                const lbl = action.label || '⚡ نفّذ الآن';
                return `<button type="button" class="btn gold xs" style="margin-top:6px;" onclick="event.stopPropagation();runKatkotAction(${idx})">${esc(lbl)}</button>`;
            };
            const prioritiesSection = !heroPick ? '' : `
            <div class="hero-priority">
                <div class="eyebrow"><span>🎯 أهم فعل عليك اتخاذه الآن</span> ${unified.top3.length > 1 ? `<span style="font-size:var(--fs-2xs);font-weight:700;color:var(--muted);">(${unified.top3.length} بند يحتاج تنفيذ الآن)</span>` : ''}</div>
                <div class="lead-meta">
                    <span class="badge-domain badge-domain-${heroPick.domain}">${heroPick.icon} ${unified.domainLabels[heroPick.domain]}</span>
                    <span class="badge-urgency ${urgencyClass[heroPick.urgency]}">⏱️ ${heroPick.urgency}</span>
                </div>
                <div class="lead-text">${esc(heroPick.text)}</div>
                ${heroPick.recurringNote ? `<div style="font-size:var(--fs-xs);color:#b8860b;font-weight:700;margin-top:4px;">${esc(heroPick.recurringNote)}</div>` : ''}
                ${actionBtnHtml(heroPick.action)}
                ${restPicks.length ? `<div class="rest-list">
                    ${restPicks.map((p, i) => `<div class="rest-row" style="flex-wrap:wrap;">
                        <b>${i+2}.</b>
                        <span class="badge-domain badge-domain-${p.domain}" style="flex-shrink:0;">${p.icon}</span>
                        <span>${esc(p.text)} <span class="badge-urgency ${urgencyClass[p.urgency]}" style="margin-inline-start:4px;">${p.urgency}</span></span>
                        ${p.action ? (() => { const idx = registerKatkotAction(p.action); return `<button type="button" class="btn ghost xs" style="margin-inline-start:auto;" onclick="event.stopPropagation();runKatkotAction(${idx})">${esc(p.action.label || '⚡ نفّذ')}</button>`; })() : ''}
                    </div>`).join('')}
                </div>` : ''}
                <p style="font-size:var(--fs-2xs);color:var(--muted);margin:var(--space-2) 0 0;">💡 مجمّعة من كل بيانات الدفعة (إنتاج/مالية/تشغيل/بيئة) ومرتبة بالأولوية، وعددها يتغيّر حسب خطورة الوضع فعليًا — راجعها أول حاجة كل يوم.</p>
            </div>`;
            // ============ إعادة هيكلة 2026: قسم واحد موحّد بدل 3 أماكن منفصلة كانت بتعرض "حاجة عاجلة" ============
            // (كان فيه: hero-priority + accordion "يحتاج انتباه الآن" جوه تحليلات ذكية + accordion منفصل
            // "كل التنبيهات الحالية"). دلوقتي: hero-priority لسه فوق كملخص تنفيذي لأهم 3 أفعال، وكل الباقي
            // (تنبيهات محرك computeAlerts + تحليلات "يحتاج انتباه" الإحصائية) بقى فى قسم واحد هنا، ظاهر
            // بالكامل من غير طي (مش accordion) لأنه محتوى عاجل، مش تفصيلة تتقفل.
            const allAlertsHtml = renderAlertsList(alerts);
            const attentionInsightsHtml = groupAttentionArr.length
                ? `<div style="margin-top:${allAlertsHtml.includes('لا توجد تنبيهات') ? '0' : '4px'};">${groupAttentionArr.join('')}</div>` : '';
            const totalAttentionCount = alerts.filter(a => !a.dismissed).length + groupAttentionArr.length;
            const unifiedAttentionSection = (!totalAttentionCount && !attentionInsightsHtml) ? `
            <div class="section" style="margin-top:0;"><div class="card" style="padding:14px;text-align:center;color:var(--muted);font-size:13px;">
                ✅ مفيش حاجة محتاجة متابعتك دلوقتي
            </div></div>` : `
            <div class="section" style="margin-top:0;" data-default-open="true">
                <div class="section-head"><h2>⚠️ يحتاج متابعتك الآن</h2></div>
                <p style="font-size:10.5px;color:var(--muted);margin:-4px 2px 8px;">
                    🔕 <b>تأجيل</b> = بيخفي البطاقة لحد بكرة بس، مش معناها إنك حليت المشكلة. الزرار الدهبي = فعل حقيقي بيتسجّل فعليًا.
                    لو محتاج تفهم الاتجاه العام/التوقعات المبنية على اللي هنا، هتلاقيها فى "🔬 تحليلات ذكية" تحت.
                </p>
                <div class="card" style="padding:10px 12px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <span class="tag">${totalAttentionCount} بند</span>
                        <button class="btn ghost xs" onclick="showAlertHistoryModal()">📜 السجل التاريخي</button>
                    </div>
                    <div class="alert-banner">${allAlertsHtml}</div>
                    ${attentionInsightsHtml}
                </div>
            </div>`;
            const quickMarketPriceSection = `
            <div class="card-accent">
                <div class="accent-label">📊 بورصة اليوم (ج/كجم حي)</div>
                <input id="dashMarketPriceInput_${b.id}" type="number" step="0.05" min="0" placeholder="مثال: 47.5"
                    value="${getLatestMarketPrice(b) != null ? getLatestMarketPrice(b) : ''}" style="flex:1;min-width:90px;">
                <button class="btn gold sm owner-only" onclick="updateMarketPriceFromDashboard('${b.id}')">💾 حفظ</button>
            </div>`;
            // ============ سلسلة أيام التسجيل المتتالية + تذكير ذكي لو فات وقت التسجيل المعتاد ولسه محدش سجّل اليوم ============
            const streak = computeLoggingStreak(b);
            const hasTodayRecord = b.records.some(r => r.date === todayStr());
            const nowHour = new Date().getHours();
            const streakHtml = !b.archivedDate ? `
            <div class="card" style="margin-bottom:14px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <span class="streak-pill">🔥 ${streak > 0 ? `${streak} يوم متتالي بتسجل بيانات دفعتك` : 'ابدأ سلسلة التسجيل اليومي'}</span>
                ${(!hasTodayRecord && nowHour >= 19) ? `<span style="font-size:11.5px;font-weight:700;color:var(--red);">⏰ لسه ما سجّلتش سجل اليوم</span>` : ''}
            </div>` : '';
            const healthScoreCardHtml = `
            <div class="health-score-card" style="border-color:${hs.color};">
                <div class="caption">🩺 حالة الدفعة الشاملة (آنية + مقارنة + استباقية)${glossHtml('healthScore')}</div>
                <div class="score" style="color:${hs.color};">${hs.score}<small>/100</small></div>
                <div class="label" style="color:${hs.color};">${hs.label}</div>
                ${hs.factors.length ? `<div class="factors">${hs.factors.map(f => `• ${f.label}`).join('<br>')}</div>` : ''}
                ${(() => {
                    // ============ نظام هجين موحّد: الترتيب مقابل تاريخك (كان كارت "🏅 مؤشر أداء الدورة" منفصل) بقى
                    // شريط مضمّن هنا — نفس الإشارات (نفوق/FCR/وزن) اللي درجة الصحة فوق مبنية عليها، بس بمنظور
                    // مختلف مكمّل مش مكرر: الدرجة فوق بتقول "الوضع كويس/سيء إد إيه دلوقتي"، والشريط ده بيقول
                    // "إزاي ده بالنسبة لتاريخك انت نفسك ولمعيار السلالة المطلق" — بدل رقمين منفصلين فى مكانين.
                    if (!perfRank) return '';
                    const scoreColor = perfRank.score >= 70 ? 'var(--green)' : (perfRank.score >= 40 ? 'var(--warning-text)' : 'var(--red)');
                    const rankWord = perfRank.rank.position === 1 ? `🥇 أفضل دورة سجّلتها على الإطلاق (#1 من ${perfRank.rank.total})` : `#${perfRank.rank.position} من ${perfRank.rank.total} دورة`;
                    const rowsHtml = perfRank.breakdown.map(x => {
                        const c = x.pct >= 70 ? 'var(--green)' : (x.pct >= 40 ? 'var(--warning-text)' : 'var(--red)');
                        return statLine(`${x.label}`, `${x.pct}%`, {vStyle:`color:${c};font-weight:700;`});
                    }).join('');
                    return `<details style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5ddc8;">
                        <summary style="cursor:pointer;font-size:var(--fs-xs);font-weight:800;color:${scoreColor};">📊 مقارنة بتاريخك: <b>${perfRank.score}/100</b> — ${rankWord} ${confBadgeHtml(perfRank.sampleSize)}</summary>
                        <div style="margin-top:6px;">${rowsHtml}</div>
                        ${perfRank.absolute ? `<div style="margin-top:6px;font-size:var(--fs-2xs);">
                            <div style="font-weight:800;color:var(--muted);">📏 مرجع مطلق مستقل (معيار السلالة القياسي يوم ${perfRank.absolute.atAge}، مش تاريخك انت)</div>
                            ${statLine(`معدل التحويل مقابل المعيار القياسي`, `${perfRank.absolute.fcrDiffPct==null?'—':(perfRank.absolute.fcrDiffPct>=0?'+':'')+fmt(perfRank.absolute.fcrDiffPct,1)+'%'}`, {vStyle:`font-weight:700;color:${perfRank.absolute.fcrDiffPct==null?'var(--muted)':(perfRank.absolute.fcrDiffPct<=0?'var(--green)':'var(--red)')};`})}
                        </div>` : ''}
                        <div style="margin-top:4px;font-size:9.5px;color:var(--muted);">النسبة = كام % من دوراتك السابقة (لنفس النوع) الدورة الحالية "أحسن" منها فيه — ترتيب نسبي مقابل نفسك، مش مقياس عالمي.</div>
                    </details>`;
                })()}
                ${(() => {
                    // ============ نظام هجين موحّد: توقعات نهاية الدورة (FCR/الوزن) بقت هنا كملخص سريع، مش مدفونة
                    // جوه "تحليلات ذكية" لوحدها — عشان تقرأها فى نفس اللحظة اللي بتشوف فيها الدرجة والترتيب، لأنها
                    // كلها بتحكي نفس القصة (الأداء) من 3 زوايا زمنية مختلفة: دلوقتي (الدرجة) / تاريخيًا (الترتيب) / قدام (التوقع). ============
                    if (!ins.fcrPrediction && !ins.weightPrediction) return '';
                    const rows = [];
                    if (ins.weightPrediction && ins.weightPrediction.diffPct != null) {
                        const wp = ins.weightPrediction;
                        const c = wp.diffPct >= 0 ? 'var(--green)' : 'var(--red)';
                        rows.push(`<div>⚖️ الوزن المتوقع يوم ${wp.targetAge}: <b>${fmt(wp.predictedG,0)} جم</b> <span style="color:${c};font-weight:700;">(${wp.diffPct>=0?'+':''}${fmt(wp.diffPct,1)}% عن المعيار)</span></div>`);
                    }
                    if (ins.fcrPrediction && ins.fcrPrediction.diffPct != null) {
                        const fp = ins.fcrPrediction;
                        const c = fp.diffPct <= 0 ? 'var(--green)' : 'var(--red)';
                        rows.push(`<div>🌾 الـFCR المتوقع يوم ${fp.targetAge}: <b>${fmt(fp.predictedFcr,2)}</b> <span style="color:${c};font-weight:700;">(${fp.diffPct>=0?'+':''}${fmt(fp.diffPct,1)}% عن المعيار)</span></div>`);
                    }
                    return `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5ddc8;">
                        <div style="font-size:var(--fs-xs);font-weight:800;color:var(--barn-dark);">🔮 توقعات نهاية الدورة (لو استمر الأداء الحالي)</div>
                        <div style="margin-top:4px;font-size:var(--fs-2xs);line-height:1.9;">${rows.join('')}</div>
                    </div>`;
                })()}
                ${(() => {
                    // ============ 🔴 إصلاح Red Team: "احتمالية مشكلة قادمة" اتدمجت هنا — نظام هجين واحد بدل رقمين منفصلين ============
                    // بدل رقم "٪x/100" مجرد بلا سياق، بنوضّح حجم المشكلة بكلام عملي (كام إشارة نشطة، وأي فعل
                    // ينفع تتخذه فورًا لكل سبب) — وكل سبب بيحمل زرار "⚡ نفّذ" حقيقي لو فيه فعل معروف يحله.
                    if (!hs.riskReasons || !hs.riskReasons.length) return '';
                    const sevWord = hs.riskLevel === 'danger' ? 'مرتفعة' : 'متوسطة';
                    const sevColor = hs.riskLevel === 'danger' ? 'var(--red)' : 'var(--warning-text)';
                    const countWord = hs.riskReasons.length === 1 ? 'إشارة تحذيرية واحدة نشطة' : `${hs.riskReasons.length} إشارات تحذيرية نشطة مجتمعة`;
                    const reasonsHtml = hs.riskReasons.map(r => {
                        const btn = r.action ? (() => { const idx = registerKatkotAction(r.action);
                            return `<button type="button" class="btn gold xs" style="margin-inline-start:6px;flex-shrink:0;" onclick="runKatkotAction(${idx})">${esc(r.action.label || '⚡ نفّذ')}</button>`; })() : '';
                        return `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:3px 0;"><span style="flex:1;">• ${esc(r.text)}</span>${btn}</div>`;
                    }).join('');
                    return `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5ddc8;">
                        <div style="font-size:var(--fs-xs);font-weight:800;color:${sevColor};">🧭 احتمالية مشكلة قادمة: ${sevWord} — ${countWord}</div>
                        <div style="margin-top:4px;font-size:var(--fs-2xs);">${reasonsHtml}</div>
                    </div>`;
                })()}
                <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5ddc8;font-size:9.5px;color:var(--muted);line-height:1.7;">
                    💡 الكارت ده بيجمع 4 زوايا لنفس القصة: <b>الدرجة</b> (الوضع دلوقتي) + <b>الترتيب</b> (مقابل تاريخك) + <b>التوقع</b> (لو استمر كده لآخر الدورة) + <b>احتمالية مشكلة قادمة</b> (إشارات مبكرة). "🎯 أهم فعل عليك اتخاذه الآن" فوق مبني على نفس المصادر دي بالظبط، و"⚠️ يحتاج متابعتك الآن" تحت بيوريك التفاصيل الكاملة وراها.
                </div>
            </div>`;
            return `
            ${streakHtml}
            ${renderDashboardWeatherCard(b, m)}
            ${multiHouseSection}
            ${housesSection}
            ${recCompHtml}
            ${quickMarketPriceSection}
            ${prioritiesSection}
            ${healthScoreCardHtml}
            ${renderInventoryDashboardCard(b, fin, m)}
            ${saleDecisionCardHtml}
            ${unifiedAttentionSection}
            <div class="kpi-grid">
                <div class="kpi"><div class="lbl">📅 عمر القطيع</div><div class="val">${m.todayAge} <small>يوم</small></div></div>
                <div class="kpi ${m.liveCountPct < 95 ? 'warn' : 'good'}"><div class="lbl">🐔 الأعداد الحية</div><div class="val">${fmt(m.liveCount, 0)} <small>(${fmt(m.liveCountPct, 1)}%)</small></div></div>
                <div class="kpi ${m.mortRate > 5 ? 'warn' : ''}"><div class="lbl">💀 نسبة النفوق التراكمية${glossHtml('mortRate')}</div><div class="val">${fmt(m.mortRate, 2)}%</div></div>
                <div class="kpi"><div class="lbl">⚖️ متوسط الوزن الحالي</div><div class="val">${m.avgWeightIsEstimated ? '~' : ''}${fmt(m.avgWeightG, 0)} <small>جم</small></div>${m.avgWeightIsEstimated ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">تقديري — آخر وزن فعلي يوم ${m.lastWeighed ? m.lastWeighed.age : 0}</div>` : ''}</div>
                <div class="kpi ${m.weightDiffPct < -5 ? 'warn' : 'good'}"><div class="lbl">📈 الانحراف عن المعيار</div><div class="val">${m.weightDiffPct >= 0 ? '+' : ''}${fmt(m.weightDiffPct, 1)}%</div></div>
                <div class="kpi"><div class="lbl">🌾 إجمالي العلف المستهلك</div><div class="val">${fmt(m.cumFeed, 0)} <small>كجم</small></div></div>
                <div class="kpi ${m.fcr && (m.fcr > 2.2 || m.fcr <= 0) ? 'warn' : 'good'}"><div class="lbl">🧮 معامل التحويل FCR${glossHtml('fcr')}</div><div class="val">${m.fcr ? (m.avgWeightIsEstimated ? '~' : '') + fmt(m.fcr, 2) : '—'}</div></div>
                <div class="kpi ${m.epef < 300 ? 'warn' : 'good'}"><div class="lbl">🏆 كفاءة الأداء EPEF${glossHtml('epef')}</div><div class="val">${m.epef ? (m.avgWeightIsEstimated ? '~' : '') + fmt(m.epef, 0) : '—'}</div></div>
                <div class="kpi"><div class="lbl">📊 معدل الزيادة اليومي ADG${glossHtml('adg')}</div><div class="val">${fmt(m.adg, 1)} <small>جم/يوم</small></div></div>
                <div class="kpi"><div class="lbl">💧 معدل الماء:العلف${glossHtml('waterFeedRatio')}</div><div class="val">${fmt(m.waterFeedRatio, 2)}</div></div>
                ${(() => { const abx = computeAntibioticStats(b, m); return abx.totalDays > 0 ? `<div class="kpi ${abx.antibioticDays > 0 ? 'warn' : 'good'}"><div class="lbl">🌿 أيام بدون مضاد حيوي</div><div class="val">${abx.freeDays}/${abx.totalDays} <small>(${fmt(abx.freePct,0)}%)</small></div></div>` : ''; })()}
                <div class="kpi"><div class="lbl">📦 الكتلة الحيوية${glossHtml('biomass')}</div><div class="val">${fmt(m.biomassKg, 0)} <small>كجم</small></div></div>
                ${b.area > 0 ? (() => {
                    const maxD = getMaxSafeDensity(b);
                    const pct = maxD > 0 ? (m.density / maxD) * 100 : 0;
                    const kpiClass = pct >= 100 ? 'warn' : (pct >= 85 ? 'warn' : 'good');
                    return `<div class="kpi ${kpiClass}"><div class="lbl">⚖️ الكثافة الحالية${glossHtml('density')}</div><div class="val">${fmt(m.density, 1)} <small>كجم/م² (حد ${maxD})</small></div></div>`;
                })() : ''}
                <div class="kpi ${fin.netProfit < 0 ? 'warn' : 'good'}"><div class="lbl">💰 الربح/الخسارة الحالي</div><div class="val">${fmt(fin.netProfit, 0)} <small>ج</small></div></div>
                <div class="kpi"><div class="lbl">🥩 تكلفة كيلو اللحم</div><div class="val">${fmt(fin.costPerKg, 2)} <small>ج/كجم</small></div></div>
                <div class="kpi"><div class="lbl">🌡️ آخر قراءة بيئية</div><div class="val" style="font-size:13px;">${m.lastEnv.humidity != null ? 'رطوبة ' + fmt(m.lastEnv.humidity, 0) + '%' : '—'} ${m.lastEnv.health != null ? '· صحة ' + m.lastEnv.health + '/10' : ''}</div></div>
            </div>
            ${insightsSection}
            <div class="section"><div class="section-head"><h2>📈 الرسوم البيانية</h2></div>
                <details class="card" style="padding:0;overflow:hidden;" ontoggle="if(this.open) redrawDashboardChartsIfNeeded()">
                    <summary style="padding:10px 12px;cursor:pointer;background:#faf8f2;font-weight:800;font-size:13px;">📊 اضغط لعرض منحنيات النمو والنفوق والتجانس والأسعار والعلف</summary>
                    <div style="padding:10px 12px;">
                        <div style="margin-bottom:14px;">
                            <div style="font-weight:700;font-size:12.5px;margin-bottom:6px;">📈 منحنى نمو الوزن (فعلي مقابل المعياري)</div>
                            <canvas id="chartWeight" height="200"></canvas>
                            <div class="legend-row"><span><span class="dot" style="background:#D9A544"></span>الوزن الفعلي</span><span><span class="dot" style="background:#6B4226;opacity:.6"></span>الوزن المعياري</span></div>
                        </div>
                        <div style="margin-bottom:14px;">
                            <div style="font-weight:700;font-size:12.5px;margin-bottom:6px;">💀 النفوق التراكمي</div>
                            <canvas id="chartMort" height="170"></canvas>
                        </div>
                        ${(b.records || []).filter(r => Array.isArray(r.weightSample) && r.weightSample.length >= 3).length >= 2 ? `
                        <div style="margin-bottom:14px;">
                            <div style="font-weight:700;font-size:12.5px;margin-bottom:6px;">📏 تجانس القطيع عبر الأسابيع (CV%)${glossHtml('cv')}</div>
                            <canvas id="chartUniformity" height="170"></canvas>
                            <p style="font-size:11px;color:var(--muted);margin:6px 2px 0;">كل ما قلّ الخط كل ما القطيع أكثر تجانسًا. الهدف الصناعي المعتاد: أقل من 8% (خط استرشادي منقّط).</p>
                        </div>` : ''}
                        <div style="margin-bottom:14px;">
                            <div style="font-weight:700;font-size:12.5px;margin-bottom:6px;">📊 اتجاه سعر بورصة الدواجن (ج/كجم حي)</div>
                            <canvas id="chartMarketPrice" height="170"></canvas>
                            ${getBatchMarketPriceLog(b).length ? '<div class="legend-row"><span><span class="dot" style="background:#B45A2E"></span>سعر البورصة المُسجَّل يوميًا</span></div>' : '<p style="font-size:11px;color:var(--muted);margin:6px 2px 0;">سجّل سعر البورصة من الحقل السريع أعلى الصفحة أو من تبويب "💰 الإدارة والتخطيط" ← دراسة الجدوى، ليظهر اتجاهه هنا يومًا بعد يوم.</p>'}
                        </div>
                        <div>
                            <div style="font-weight:700;font-size:12.5px;margin-bottom:6px;">🌾 استهلاك العلف اليومي ومعامل التحويل</div>
                            <canvas id="chartFeed" height="200"></canvas>
                            <div class="legend-row"><span><span class="dot" style="background:#2F4538"></span>علف يومي (كجم)</span><span><span class="dot" style="background:#C1443C"></span>FCR التراكمي</span></div>
                        </div>
                    </div>
                </details>
            </div>`;
        }

        // ============ Daily Tab ============
        let dailyEventsSubTab = 'additives';
