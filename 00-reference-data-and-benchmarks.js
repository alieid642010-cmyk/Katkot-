
        /* ================================================================
           الكود الكامل المُحسَّن مع الكتالوج المرجعي والإضافات المتكاملة
           ================================================================ */

        /* ================================================================
           فهرس أقسام الكود (Table of Contents) — للتنقّل السريع عند التطوير
           استخدم بحث المحرر (Ctrl/Cmd+F) عن اسم القسم بالأسفل للقفز إليه مباشرة
           بُنية الملف بالترتيب: كتالوج مرجعي ← حالة وتخزين ← صلاحيات ←
           عمليات CRUD لكل تبويب ← حسابات إنتاجية ← محرك تنبيهات ←
           عرض الواجهة (Render) لكل تبويب ← رسوم بيانية ← تصدير/طباعة ← تشغيل
           ================================================================
           1) الكتالوج المرجعي لكل نوع (SPECIES_CATALOG)
           2) محرر الأرقام القياسية والمرجعية (إعدادات)
           3) محرر المعايير المتقدمة (تدفئة/تنبيهات/أداء/جدوى)
           4) State & Storage — حالة التطبيق المركزية
           5) Auth / Roles — تسجيل الدخول والصلاحيات (مالك/عامل)
           6) Storage — الحفظ والقراءة من localStorage (متزامن بالكامل)
           7) Confirm modal / Modals — النوافذ المنبثقة العامة
           8) Heating Estimation — تقدير استهلاك التدفئة
           9) مهام اليوم داخل السجل اليومي (تحصينات/معاملات/إضافات مستحقة)
           10) Feed Formulation Calculator — حاسبة تركيب العلف
           11) Batch CRUD — إدارة الدفعات
           12) Inventory helpers — أدوات المخزون
           13) Daily record CRUD — السجل اليومي
           14) Purchases CRUD — المشتريات
           15) Sales CRUD — المبيعات
           16) Custom items CRUD — أصناف مخصصة
           17) Operations & Biosecurity CRUD — العمليات والأمن الحيوي
           18) Stock manual movement — حركة مخزون يدوية
           19) Reminders, Vaccines, Treatments, Additives — التذكيرات والتحصينات
           20) تنفيذ إضافات العلف/الماء اليومية وربطها بالمخزن
           21) Core Production Calculations — الحسابات الإنتاجية الأساسية
           22) Feasibility Study — دراسة الجدوى
           23) Alerts engine — محرك التنبيهات (مع الانحراف عن المرجع)
           24) Render Router — موجّه العرض بين التبويبات
           25) Dashboard — لوحة التحكم
           26) Daily Tab — تبويب السجل اليومي
           27) Inventory + Purchases + Sales (مدمج) — المخزون والمبيعات
           28) Operations & Biosecurity Tab
           29) Alerts Tab — تبويب التنبيهات
           30) Finance Tab / التقرير الشامل (إنتاجي + مالي)
           31) Compare Tab — مقارنة الدفعات
           32) Report Tab / buildPrintableReport — التقرير التفصيلي القابل للطباعة
           33) Charts — رسوم Canvas2D بدون مكتبات خارجية
           34) Notifications — إشعارات المتصفح
           35) إغلاق المودال (Escape / النقر خارجه)
           36) Export PDF / Print Report
           37) Demo Data — بيانات تجريبية (غير مفعّلة من الواجهة)
           38) تصدير واستيراد البيانات — نسخ احتياطي JSON
           39) Init — نقطة بدء التطبيق (initAuth)
           ================================================================ */

        // ==================== الكتالوج المرجعي لكل نوع ====================
        // ============ معايير عالمية مرجعية للسلالات (تقديرية من أدلة الأداء المنشورة) — منفصلة عن الأرقام المرجعية القابلة للتعديل ============
        // ملاحظة: هذه أرقام تقريبية للمقارنة فقط، وتُحدَّث دوريًا من الشركات المنتجة — راجع أحدث دليل أداء رسمي لو محتاج دقة تعاقدية.
        const GLOBAL_BREED_BENCHMARKS = {
            ross308: { label: 'روص 308 (Ross 308)', weight: [[0,42],[7,180],[14,460],[21,900],[28,1450],[35,2100],[42,2800],[49,3400]] },
            cobb500: { label: 'كوب 500 (Cobb 500)', weight: [[0,42],[7,175],[14,450],[21,890],[28,1430],[35,2080],[42,2760],[49,3350]] }
        };
        function getGlobalBenchmarkWeight(stdKey, day) {
            const std = GLOBAL_BREED_BENCHMARKS[stdKey];
            if (!std) return null;
            return interpAnchors(std.weight, day);
        }

        // ============ معيار المزرعة الداخلي: متوسط منحنى الوزن الفعلي لدورات سابقة مؤرشفة من نفس النوع ============
        // بيدّي إحساس أدق من معيار السلالة العالمي: "هل إحنا بنتحسن كمزرعة نفسها" مش بس "هل إحنا زي الشركة العالمية"
        function getFarmInternalBenchmark(speciesKey, excludeBatchId) {
            const archived = state.batches.filter(x => x.id !== excludeBatchId && x.species === speciesKey
                && x.status === 'مؤرشفة' && x.records && x.records.length >= 3);
            if (archived.length < 2) return null; // يحتاج دورتين سابقتين على الأقل عشان يكون "معيار" له معنى
            const byAge = {};
            archived.forEach(x => {
                const xm = computeMetrics(x);
                xm.series.forEach(r => {
                    if (r.effWeight != null) { (byAge[r.age] = byAge[r.age] || []).push(r.effWeight); }
                });
            });
            const curve = Object.keys(byAge).map(Number).sort((a, c) => a - c)
                .map(age => ({ age, avg: byAge[age].reduce((s, v) => s + v, 0) / byAge[age].length }));
            if (!curve.length) return null;
            return { cycles: archived.length, curve };
        }
        function getFarmBenchmarkWeight(curve, day) {
            if (!curve || !curve.length) return null;
            if (day <= curve[0].age) return curve[0].avg;
            for (let i = 0; i < curve.length - 1; i++) {
                const a = curve[i], c = curve[i + 1];
                if (day >= a.age && day <= c.age) return c.age === a.age ? c.avg : a.avg + (c.avg - a.avg) * ((day - a.age) / (c.age - a.age));
            }
            return curve[curve.length - 1].avg;
        }

        // ============ مقارنة بأفضل 3 دورات سابقة (Internal Benchmarking) ============
        // بخلاف getFarmInternalBenchmark اللي بيحسب متوسط منحنى الوزن لكل الدورات السابقة، هنا بنحدد
        // أفضل الدورات فعليًا (حسب EPEF) ونقارن مؤشرات الأداء النهائية (FCR/نفوق/تكلفة الكيلو/معدل النمو اليومي)
        // بينها وبين الدورة الحالية — عشان يبان "أعلى سقف حققته فعلاً" مش بس المتوسط.
        function computeBestCyclesBenchmark(b) {
            const archived = state.batches.filter(x => x.id !== b.id && x.species === b.species
                && x.status === 'مؤرشفة' && x.records && x.records.length >= 3);
            if (archived.length < 2) return null; // يحتاج دورتين سابقتين على الأقل عشان التصنيف يكون له معنى
            const rows = archived.map(x => {
                const xm = computeMetrics(x);
                const xfin = computeFinance(x, xm);
                return { id: x.id, name: x.name, startDate: x.startDate, age: xm.age, epef: xm.epef,
                    fcr: xm.fcr, mortRate: xm.mortRate, adg: xm.adg, costPerKg: xfin.costPerKg };
            }).filter(r => r.epef != null && r.age >= 20);
            if (rows.length < 2) return null;
            rows.sort((a, c) => c.epef - a.epef);
            const top = rows.slice(0, Math.min(3, rows.length));
            const avgOfKey = key => top.reduce((s, r) => s + (r[key] || 0), 0) / top.length;
            return {
                sampleSize: rows.length, top,
                avg: { epef: avgOfKey('epef'), fcr: avgOfKey('fcr'), mortRate: avgOfKey('mortRate'),
                    adg: avgOfKey('adg'), costPerKg: avgOfKey('costPerKg') }
            };
        }

        // ============ نسبة مئوية Percentile + شارة ثقة موحّدة — تُستخدم فى كل كروت الترتيب والتحليلات (v3.86) ============
        // بيحسب كام % من مجموعة القيم التاريخية "أسوأ" من القيمة الحالية (كل ما زاد % كان الأداء الحالي أفضل نسبيًا)
        function percentileBeats(value, historyArr, higherIsBetter) {
            const vals = (historyArr || []).filter(v => v != null && !isNaN(v));
            // ⚠️ إصلاح: كان الحد الأدنى دورتين بس (n=2) — نسبة مئوية من عينة بحجم 2 ممكن تقفز 0%↔100% بمجرد
            // إضافة دورة واحدة، وده مضلل بصريًا حتى لو الشارة جنبها بتقول "ثقة منخفضة". رفعنا الحد لـ3 كحد أدنى حقيقي.
            if (value == null || isNaN(value) || vals.length < 3) return null;
            const worseCount = vals.filter(v => higherIsBetter ? (value > v) : (value < v)).length;
            const tieCount = vals.filter(v => v === value).length;
            return Math.round(((worseCount + tieCount * 0.5) / vals.length) * 100);
        }
        // شارة ثقة موحّدة حسب حجم العينة (عدد الدورات/النقاط المبني عليها التحليل)
        function confBadge(n, opts) {
            opts = opts || {};
            const lowT = opts.low != null ? opts.low : 3, midT = opts.mid != null ? opts.mid : 6;
            if (n == null || n < lowT) return { level: 'low', icon: '⚪', label: `ثقة منخفضة (${n||0} عينة)` };
            if (n < midT) return { level: 'mid', icon: '🟡', label: `ثقة متوسطة (${n} عينة)` };
            return { level: 'green', icon: '🟢', label: `ثقة عالية (${n} عينة)` };
        }
        function confBadgeHtml(n, opts) {
            const c = confBadge(n, opts);
            const color = c.level === 'green' ? 'var(--green)' : (c.level === 'mid' ? 'var(--warning-text)' : 'var(--muted)');
            return `<span style="display:inline-block;font-size:10px;font-weight:700;color:${color};background:${c.level==='green'?'rgba(52,168,83,.1)':(c.level==='mid'?'rgba(201,162,39,.12)':'rgba(0,0,0,.05)')};border-radius:8px;padding:1px 7px;">${c.icon} ${c.label}</span>`;
        }
        // ============ مؤشر أداء الدورة الموحّد (0-100) + الترتيب (Rank) بين كل دوراتك المؤرشفة لنفس النوع ============
        // بيجمع 4 مؤشرات نهائية (EPEF/FCR/نفوق/تكلفة الكيلو) فى نسبة مئوية واحدة مقارنة بتاريخ مزرعتك نفسها،
        // بدل ما المستخدم يقرأ فقرات متفرقة — رقم واحد + ترتيب واحد يلخّص "الدورة دي واقفة فين من أدائك المعتاد"
        function computeFarmPerformanceRank(b, m, fin) {
            const archived = state.batches.filter(x => x.id !== b.id && x.species === b.species
                && x.status === 'مؤرشفة' && x.records && x.records.length >= 3);
            const rows = archived.map(x => {
                const xm = computeMetrics(x);
                const xfin = computeFinance(x, xm);
                return { epef: xm.epef, fcr: xm.fcr, mortRate: xm.mortRate, costPerKg: xfin.costPerKg };
            }).filter(r => r.epef != null);
            if (rows.length < 3) return null; // ⚠️ إصلاح: رفعنا الحد الأدنى من دورتين لـ3 (نفس حد percentileBeats) عشان النسب المعروضة تبقى ذات معنى إحصائي أدنى
            const metrics = [
                { key: 'epef', label: 'EPEF', value: m.epef, higherIsBetter: true },
                { key: 'fcr', label: 'معدل التحويل FCR', value: m.fcr, higherIsBetter: false },
                { key: 'mortRate', label: 'نسبة النفوق', value: m.mortRate, higherIsBetter: false },
                { key: 'costPerKg', label: 'تكلفة الكيلو', value: fin ? fin.costPerKg : null, higherIsBetter: false },
            ];
            const breakdown = metrics.map(mt => {
                const hist = rows.map(r => r[mt.key]).filter(v => v != null);
                const pct = hist.length >= 3 ? percentileBeats(mt.value, hist, mt.higherIsBetter) : null;
                return { ...mt, pct, sample: hist.length };
            }).filter(x => x.pct != null);
            if (!breakdown.length) return null;
            const score = Math.round(breakdown.reduce((s, x) => s + x.pct, 0) / breakdown.length);
            const epefRows = rows.map(r => r.epef).filter(v => v != null);
            const betterCount = epefRows.filter(v => (m.epef || 0) > v).length;
            const rankPos = epefRows.length - betterCount; // 1 = الأفضل
            // ============ (جديد) مرجع مطلق مستقل عن تاريخ المزرعة — يعالج فجوة "الترتيب نسبي بس مقابل نفسه" ============
            // كل الأرقام فوق دي نسبية (مقارنة بدوراتك المؤرشفة أنت بس) — لو كل دوراتك كانت متوسطة الأداء
            // صناعيًا، الترتيب ممكن يطلع "🥇 الأفضل" وهو أداء عادي فعليًا. هنا بنقارن كمان بمعيار السلالة
            // القياسي المطلق (منحنى الوزن/العلف الرسمي) المستقل تمامًا عن تاريخ المستخدم.
            let absolute = null;
            if (m.age > 0) {
                const stdWAbs = getRefValue(b, 'weight', m.age); // جرام
                const stdFeedAbs = getRefValue(b, 'feed', m.age); // جرام/طائر تراكمي
                if (stdWAbs > 0 && stdFeedAbs > 0) {
                    const stdFcrAbs = stdFeedAbs / stdWAbs; // نفس وحدة m.fcr (كجم علف/كجم وزن حي، النسبة بتتلغي)
                    const fcrDiffPct = m.fcr != null ? ((m.fcr - stdFcrAbs) / stdFcrAbs) * 100 : null;
                    absolute = { stdFcrAbs, fcrDiffPct, weightDiffPct: m.weightDiffPct, atAge: m.age };
                }
            }
            return { score, breakdown, rank: { position: Math.max(1, rankPos), total: epefRows.length + 1 },
                sampleSize: rows.length, conf: confBadge(rows.length), absolute };
        }

        // ============ تقييم أداء العمال (Worker Performance) ============
        // مبني على enteredBy/enteredAt المُسجَّلة تلقائيًا مع كل سجل يومي + إضافة خارج الجدول + حادثة + تنفيذ برنامج
        // إضافات (بداية من تفعيل هذه الميزة — السجلات القديمة قبلها هتظهر كـ"غير محدد")، بالإضافة لسجل التدقيق
        // العام (globalAuditLog) لرصد عدد التعديلات/الحذف. الأنواع الأربعة بتتجمع فى مجهود واحد بدل ما السجل
        // اليومي بس هو المحسوب — عامل بيتعامل صح مع الطوارئ (حادثة/جرعة استباقية/تنفيذ إضافة) ياخد نقاط له.
        function computeWorkerPerformance() {
            const groups = {}; // name -> { records:[], quickInts:0, incidents:0, execs:0, edits:0 }
            const ensure = (name) => { if (!groups[name]) groups[name] = { records: [], quickInts: 0, incidents: 0, execs: 0, edits: 0 }; return groups[name]; };
            (state.batches || []).forEach(b => {
                (b.records || []).forEach(r => { if (r.enteredBy) ensure(r.enteredBy).records.push(r); });
                (b.quickInterventions || []).forEach(qi => { if (qi.enteredBy) ensure(qi.enteredBy).quickInts++; });
                (b.incidents || []).forEach(inc => { if (inc.enteredBy) ensure(inc.enteredBy).incidents++; });
                (b.additiveExecLog || []).forEach(e => { if (e.enteredBy) ensure(e.enteredBy).execs++; });
            });
            (state.globalAuditLog || []).forEach(e => {
                if (!e.who) return;
                if (/حذف|تعديل/.test(e.text || '')) ensure(e.who).edits++;
            });
            const names = Object.keys(groups);
            if (!names.length) return null;
            const optionalFields = ['water', 'temp', 'weight', 'health'];
            const rows = names.map(name => {
                const g = groups[name];
                const n = g.records.length;
                let onTime = 0, totalDelay = 0, completenessSum = 0;
                g.records.forEach(r => {
                    if (r.enteredAt) {
                        const delay = Math.max(0, daysBetween(r.date, r.enteredAt.slice(0, 10)));
                        totalDelay += delay;
                        if (delay <= 0) onTime++;
                    }
                    const filled = optionalFields.filter(f => r[f] != null && r[f] !== '').length;
                    completenessSum += (filled / optionalFields.length) * 100;
                });
                // ============ (جديد) كشف أنماط إدخال مشبوهة — مش اتهام، مجرد إشارة "راجع يدويًا" ============
                // 1) قيم متطابقة تمامًا (تباين صفري) عبر عدد كبير من السجلات فى حقل بطبيعته متغيّر يوميًا بيولوجيًا
                //    (وزن/حرارة) — ده نمط غير طبيعي بيولوجيًا وممكن يكون نسخ قيمة قديمة بدل قياس فعلي كل مرة.
                // 2) دفعة كبيرة من السجلات اتسجلت بنفس timestamp بالظبط — مؤشر تعبئة لاحقة دفعة واحدة بدل تسجيل آني.
                const anomalyFlags = [];
                ['weight', 'temp'].forEach(f => {
                    const vals = g.records.map(r => r[f]).filter(v => v != null && v !== '' && !isNaN(v)).map(Number);
                    if (vals.length >= 8) {
                        const sd = stdDev(vals);
                        if (sd === 0) anomalyFlags.push(`قيم "${f === 'weight' ? 'الوزن' : 'الحرارة'}" متطابقة تمامًا فى كل الـ${vals.length} سجل — غير منطقي بيولوجيًا، راجع طريقة القياس الفعلية`);
                    }
                });
                const tsCounts = {};
                g.records.forEach(r => { if (r.enteredAt) tsCounts[r.enteredAt] = (tsCounts[r.enteredAt] || 0) + 1; });
                const maxBurst = Object.values(tsCounts).reduce((a, c) => Math.max(a, c), 0);
                if (n >= 6 && maxBurst >= Math.max(4, Math.ceil(n * 0.5))) anomalyFlags.push(`${maxBurst} من أصل ${n} سجل اتسجلوا بنفس اللحظة بالظبط — يرجّح تعبئة لاحقة دفعة واحدة بدل تسجيل يومي آني`);
                return {
                    name, recordsCount: n, edits: g.edits,
                    quickInts: g.quickInts, incidents: g.incidents, execs: g.execs,
                    totalEffort: n + g.quickInts + g.incidents + g.execs,
                    onTimePct: n ? (onTime / n) * 100 : null,
                    avgDelayDays: n ? totalDelay / n : null,
                    completenessPct: n ? completenessSum / n : null,
                    anomalyFlags,
                };
            });
            rows.sort((a, c) => c.totalEffort - a.totalEffort);
            return rows;
        }

        const SPECIES_CATALOG = {
            broiler: {
                label: 'دجاج تسمين أبيض (روص/كوب)',
                cycleDays: 42,
                waterFeedRatio: 1.9,
                weight: [
                    [0, 42],
                    [7, 185],
                    [14, 480],
                    [21, 920],
                    [28, 1480],
                    [35, 2100],
                    [42, 2700],
                    [49, 3250]
                ],
                feed: [
                    [0, 0],
                    [7, 170],
                    [14, 480],
                    [21, 1050],
                    [28, 1900],
                    [35, 2950],
                    [42, 4100],
                    [49, 5300]
                ],
                temp: [
                    [0, 33],
                    [3, 32],
                    [7, 30],
                    [14, 28],
                    [21, 26],
                    [28, 24],
                    [35, 22],
                    [42, 21]
                ],
                humidity: [
                    [0, 65],
                    [7, 60],
                    [14, 55],
                    [21, 55],
                    [28, 50],
                    [35, 50],
                    [42, 50]
                ],
                airspeed: [
                    [0, 0.3],
                    [7, 0.3],
                    [14, 0.5],
                    [21, 0.8],
                    [28, 1.0],
                    [35, 1.2],
                    [42, 1.5]
                ],
                co2: [
                    [0, 1500],
                    [7, 2000],
                    [14, 2500],
                    [21, 2800],
                    [28, 3000],
                    [35, 3000],
                    [42, 3000]
                ],
                nh3: [
                    [0, 5],
                    [7, 8],
                    [14, 10],
                    [21, 12],
                    [28, 15],
                    [35, 18],
                    [42, 20]
                ],
                o2: [
                    [0, 21],
                    [7, 21],
                    [14, 21],
                    [21, 20.5],
                    [28, 20.5],
                    [35, 20],
                    [42, 20]
                ],
                vaccines: [
                    { day: 1, name: 'نيوكاسل + التهاب شعبي (قطرة عين/أنف)' },
                    { day: 7, name: 'جمبورو (الجرعة الأولى)' },
                    { day: 14, name: 'نيوكاسل لاسوتا (مياه الشرب)' },
                    { day: 18, name: 'جمبورو (الجرعة الثانية)' },
                    { day: 24, name: 'نيوكاسل (تحصين تنشيطي)' }
                ],
                treatments: [
                    { day: 7, name: 'رش بروبيوتك على السبلة والفرشة' },
                    { day: 14, name: 'رش ملح الليمون (حامض ستريك) على السبلة' },
                    { day: 21, name: 'رش بروبيوتك' },
                    { day: 28, name: 'رش ملح الليمون' },
                    { day: 35, name: 'رش بروبيوتك' },
                    { day: 42, name: 'رش ملح الليمون' }
                ],
                feedAdditives: [
                    { from: 1, to: 7, name: 'بيوتيرات الصوديوم', dose: 0.5, unit: 'جم', per: 'كجم علف',
                    notes: 'تعزيز صحة الأمعاء، تحسين امتصاص العناصر الغذائية، تقليل الالتهابات المعوية.' },
                    { from: 1, to: 42, name: 'نيوكليوتيدات + ببتيدات بنائية', dose: 0.3, unit: 'جم', per: 'كجم علف',
                        notes: 'تسريع النمو، تقوية المناعة، تحسين جودة اللحم.' },
                    { from: 1, to: 42, name: 'مانان وبيتا جلوكان', dose: 0.2, unit: 'جم', per: 'كجم علف',
                        notes: 'تحفيز المناعة، امتصاص السموم الفطرية، تحسين الأداء.' },
                    { from: 1, to: 42, name: 'إنزيمات هاضمة (بروتياز، أميلاز، ليباز، فيتاز)', dose: 0.15, unit: 'جم',
                        per: 'كجم علف', notes: 'تحسين هضم البروتين والنشا والدهون والفيتات، تقليل الفاقد.' },
                    { from: 1, to: 42, name: 'زيوت الأوريجانو والحلبة والقسط الهندي والبردقوش والقرفة والثوم وحبة البركة وحب الرشاد والكركم والكرفس وحليب الشوك وحلفا بر والخلة البلدي',
                        dose: 0.5, unit: 'جم', per: 'كجم علف',
                        notes: 'مضادات بكتيريا طبيعية، مضادات أكسدة، تحسين الشهية، تعزيز المناعة، طارد للغازات.' }
                ],
                waterAdditives: [
                    { from: 1, to: 3, name: 'بروبايوتك (بكتيريا نافعة)', dose: 0.5, unit: 'جم', per: 'لتر ماء',
                        notes: 'استعمار الأمعاء بالبكتيريا النافعة، تقليل الإسهال، تعزيز المناعة.' },
                    { from: 1, to: 5,
                        name: 'تركيبة المياه (مغلي اليانسون النجمي + الأكناشيا + البيتين + السوربيتول + الكارنيتين + ملح الليمون + الملح الإنجليزي)',
                        dose: 1, unit: 'سم', per: 'لتر ماء',
                        notes: 'ترطيب، تعويض الإلكتروليت، تحسين الهضم، تقليل الإجهاد الحراري، دعم الكبد والكلى.' }
                ]
            },
            sasso: {
                label: 'ساسو (دجاج ملون بطيء النمو)',
                cycleDays: 81,
                waterFeedRatio: 1.9,
                weight: [
                    [0, 40],
                    [14, 150],
                    [28, 550],
                    [42, 1100],
                    [56, 1800],
                    [70, 2300],
                    [81, 2600]
                ],
                feed: [
                    [0, 0],
                    [14, 250],
                    [28, 900],
                    [42, 2200],
                    [56, 4000],
                    [70, 6200],
                    [81, 7800]
                ],
                temp: [
                    [0, 33],
                    [7, 32],
                    [14, 30],
                    [21, 28],
                    [28, 26],
                    [35, 24],
                    [42, 22],
                    [56, 20],
                    [70, 19],
                    [81, 18]
                ],
                humidity: [
                    [0, 65],
                    [14, 60],
                    [28, 55],
                    [42, 55],
                    [56, 50],
                    [70, 50],
                    [81, 50]
                ],
                airspeed: [
                    [0, 0.3],
                    [14, 0.5],
                    [28, 0.8],
                    [42, 1.0],
                    [56, 1.2],
                    [70, 1.5],
                    [81, 1.8]
                ],
                co2: [
                    [0, 1500],
                    [14, 2000],
                    [28, 2500],
                    [42, 2800],
                    [56, 3000],
                    [70, 3000],
                    [81, 3000]
                ],
                nh3: [
                    [0, 5],
                    [14, 8],
                    [28, 10],
                    [42, 12],
                    [56, 15],
                    [70, 18],
                    [81, 20]
                ],
                o2: [
                    [0, 21],
                    [14, 21],
                    [28, 20.5],
                    [42, 20.5],
                    [56, 20],
                    [70, 20],
                    [81, 20]
                ],
                vaccines: [
                    { day: 1, name: 'نيوكاسل + التهاب شعبي' },
                    { day: 7, name: 'جمبورو (جرعة أولى)' },
                    { day: 14, name: 'نيوكاسل لاسوتا' },
                    { day: 18, name: 'جمبورو (جرعة ثانية)' },
                    { day: 24, name: 'نيوكاسل تنشيطي' },
                    { day: 35, name: 'جدري (طعن بالجناح)' }
                ],
                treatments: [
                    { day: 7, name: 'رش بروبيوتك' },
                    { day: 14, name: 'رش ملح الليمون' },
                    { day: 21, name: 'رش بروبيوتك' },
                    { day: 28, name: 'رش ملح الليمون' },
                    { day: 35, name: 'رش بروبيوتك' },
                    { day: 42, name: 'رش ملح الليمون' },
                    { day: 56, name: 'رش بروبيوتك' },
                    { day: 70, name: 'رش ملح الليمون' }
                ],
                feedAdditives: [
                    { from: 1, to: 7, name: 'بيوتيرات الصوديوم', dose: 0.5, unit: 'جم', per: 'كجم علف',
                    notes: 'تعزيز صحة الأمعاء.' },
                    { from: 1, to: 81, name: 'نيوكليوتيدات + ببتيدات بنائية', dose: 0.3, unit: 'جم', per: 'كجم علف',
                        notes: 'تسريع النمو وتقوية المناعة.' },
                    { from: 1, to: 81, name: 'مانان وبيتا جلوكان', dose: 0.2, unit: 'جم', per: 'كجم علف',
                        notes: 'تحفيز المناعة وامتصاص السموم.' },
                    { from: 1, to: 81, name: 'إنزيمات هاضمة', dose: 0.15, unit: 'جم', per: 'كجم علف',
                        notes: 'تحسين الهضم وتقليل الفاقد.' },
                    { from: 1, to: 81,
                        name: 'زيوت الأعشاب (الأوريجانو والحلبة والقسط الهندي والبردقوش والقرفة والثوم وحبة البركة وحب الرشاد والكركم والكرفس وحليب الشوك وحلفا بر والخلة البلدي)',
                        dose: 0.5, unit: 'جم', per: 'كجم علف', notes: 'مضادات بكتيريا طبيعية، مضادات أكسدة، تحسين الشهية.' }
                ],
                waterAdditives: [
                    { from: 1, to: 3, name: 'بروبايوتك', dose: 0.5, unit: 'جم', per: 'لتر ماء',
                        notes: 'استعمار الأمعاء بالبكتيريا النافعة.' },
                    { from: 1, to: 5,
                        name: 'تركيبة المياه (اليانسون النجمي، الأكناشيا، البيتين، السوربيتول، الكارنيتين، ملح الليمون، الملح الإنجليزي)',
                        dose: 1, unit: 'سم', per: 'لتر ماء', notes: 'ترطيب، تعويض الإلكتروليت، تحسين الهضم.' }
                ]
            },
            balady: {
                label: 'ديك بلدي',
                cycleDays: 120,
                waterFeedRatio: 1.9,
                weight: [
                    [0, 35],
                    [30, 300],
                    [60, 700],
                    [90, 1200],
                    [120, 1800]
                ],
                feed: [
                    [0, 0],
                    [30, 700],
                    [60, 2300],
                    [90, 4300],
                    [120, 6500]
                ],
                temp: [
                    [0, 33],
                    [30, 30],
                    [60, 27],
                    [90, 25],
                    [120, 23]
                ],
                humidity: [
                    [0, 65],
                    [30, 60],
                    [60, 55],
                    [90, 50],
                    [120, 50]
                ],
                airspeed: [
                    [0, 0.3],
                    [30, 0.5],
                    [60, 0.8],
                    [90, 1.0],
                    [120, 1.2]
                ],
                co2: [
                    [0, 1500],
                    [30, 2000],
                    [60, 2500],
                    [90, 2800],
                    [120, 3000]
                ],
                nh3: [
                    [0, 5],
                    [30, 8],
                    [60, 10],
                    [90, 12],
                    [120, 15]
                ],
                o2: [
                    [0, 21],
                    [30, 21],
                    [60, 20.5],
                    [90, 20],
                    [120, 20]
                ],
                vaccines: [
                    { day: 1, name: 'نيوكاسل + التهاب شعبي' },
                    { day: 7, name: 'جمبورو (جرعة أولى)' },
                    { day: 14, name: 'نيوكاسل لاسوتا' },
                    { day: 18, name: 'جمبورو (جرعة ثانية)' },
                    { day: 24, name: 'نيوكاسل تنشيطي' },
                    { day: 30, name: 'ميكوبلازما' },
                    { day: 45, name: 'جدري' }
                ],
                treatments: [
                    { day: 7, name: 'رش بروبيوتك' },
                    { day: 14, name: 'رش ملح الليمون' },
                    { day: 21, name: 'رش بروبيوتك' },
                    { day: 28, name: 'رش ملح الليمون' },
                    { day: 35, name: 'رش بروبيوتك' },
                    { day: 42, name: 'رش ملح الليمون' },
                    { day: 60, name: 'رش بروبيوتك' },
                    { day: 75, name: 'رش ملح الليمون' },
                    { day: 90, name: 'رش بروبيوتك' },
                    { day: 105, name: 'رش ملح الليمون' }
                ],
                feedAdditives: [
                    { from: 1, to: 7, name: 'بيوتيرات الصوديوم', dose: 0.5, unit: 'جم', per: 'كجم علف',
                    notes: 'تعزيز صحة الأمعاء.' },
                    { from: 1, to: 120, name: 'نيوكليوتيدات + ببتيدات', dose: 0.3, unit: 'جم', per: 'كجم علف',
                        notes: 'تسريع النمو وتقوية المناعة.' },
                    { from: 1, to: 120, name: 'مانان وبيتا جلوكان', dose: 0.2, unit: 'جم', per: 'كجم علف',
                        notes: 'تحفيز المناعة وامتصاص السموم.' },
                    { from: 1, to: 120, name: 'إنزيمات هاضمة', dose: 0.15, unit: 'جم', per: 'كجم علف',
                        notes: 'تحسين الهضم وتقليل الفاقد.' },
                    { from: 1, to: 120,
                        name: 'زيوت الأعشاب (الأوريجانو، الحلبة، القسط الهندي، البردقوش، القرفة، الثوم، حبة البركة، حب الرشاد، الكركم، الكرفس، حليب الشوك، حلفا بر، الخلة البلدي)',
                        dose: 0.5, unit: 'جم', per: 'كجم علف', notes: 'مضادات بكتيريا طبيعية، مضادات أكسدة، تحسين الشهية.' }
                ],
                waterAdditives: [
                    { from: 1, to: 3, name: 'بروبايوتك', dose: 0.5, unit: 'جم', per: 'لتر ماء',
                        notes: 'استعمار الأمعاء بالبكتيريا النافعة.' },
                    { from: 1, to: 5,
                        name: 'تركيبة المياه (اليانسون النجمي، الأكناشيا، البيتين، السوربيتول، الكارنيتين، ملح الليمون، الملح الإنجليزي)',
                        dose: 1, unit: 'سم', per: 'لتر ماء', notes: 'ترطيب، تعويض الإلكتروليت، تحسين الهضم.' }
                ]
            },
            quail: {
                label: 'سمان',
                cycleDays: 42,
                waterFeedRatio: 2.0,
                weight: [
                    [0, 8],
                    [7, 25],
                    [14, 55],
                    [21, 90],
                    [28, 120],
                    [35, 150],
                    [42, 170]
                ],
                feed: [
                    [0, 0],
                    [7, 30],
                    [14, 100],
                    [21, 200],
                    [28, 300],
                    [35, 400],
                    [42, 500]
                ],
                temp: [
                    [0, 35],
                    [7, 33],
                    [14, 31],
                    [21, 29],
                    [28, 27],
                    [35, 26],
                    [42, 25]
                ],
                humidity: [
                    [0, 70],
                    [7, 65],
                    [14, 60],
                    [21, 55],
                    [28, 50],
                    [35, 50],
                    [42, 50]
                ],
                airspeed: [
                    [0, 0.2],
                    [7, 0.3],
                    [14, 0.4],
                    [21, 0.6],
                    [28, 0.8],
                    [35, 1.0],
                    [42, 1.2]
                ],
                co2: [
                    [0, 1500],
                    [7, 2000],
                    [14, 2500],
                    [21, 2800],
                    [28, 3000],
                    [35, 3000],
                    [42, 3000]
                ],
                nh3: [
                    [0, 5],
                    [7, 8],
                    [14, 10],
                    [21, 12],
                    [28, 15],
                    [35, 18],
                    [42, 20]
                ],
                o2: [
                    [0, 21],
                    [7, 21],
                    [14, 21],
                    [21, 20.5],
                    [28, 20.5],
                    [35, 20],
                    [42, 20]
                ],
                vaccines: [
                    { day: 7, name: 'نيوكاسل (مخفف)' },
                    { day: 14, name: 'التهاب شعبي (مخفف)' }
                ],
                treatments: [
                    { day: 7, name: 'رش بروبيوتك' },
                    { day: 14, name: 'رش ملح الليمون' },
                    { day: 21, name: 'رش بروبيوتك' },
                    { day: 28, name: 'رش ملح الليمون' },
                    { day: 35, name: 'رش بروبيوتك' }
                ],
                feedAdditives: [
                    { from: 1, to: 7, name: 'بيوتيرات الصوديوم', dose: 0.5, unit: 'جم', per: 'كجم علف',
                    notes: 'تعزيز صحة الأمعاء.' },
                    { from: 1, to: 42, name: 'نيوكليوتيدات + ببتيدات', dose: 0.3, unit: 'جم', per: 'كجم علف',
                        notes: 'تسريع النمو وتقوية المناعة.' },
                    { from: 1, to: 42, name: 'مانان وبيتا جلوكان', dose: 0.2, unit: 'جم', per: 'كجم علف',
                        notes: 'تحفيز المناعة وامتصاص السموم.' },
                    { from: 1, to: 42, name: 'إنزيمات هاضمة', dose: 0.15, unit: 'جم', per: 'كجم علف',
                    notes: 'تحسين الهضم.' },
                    { from: 1, to: 42,
                        name: 'زيوت الأعشاب (الأوريجانو، الحلبة، القسط الهندي، البردقوش، القرفة، الثوم، حبة البركة، حب الرشاد، الكركم، الكرفس، حليب الشوك، حلفا بر، الخلة البلدي)',
                        dose: 0.5, unit: 'جم', per: 'كجم علف', notes: 'مضادات بكتيريا طبيعية، مضادات أكسدة.' }
                ],
                waterAdditives: [
                    { from: 1, to: 3, name: 'بروبايوتك', dose: 0.5, unit: 'جم', per: 'لتر ماء',
                        notes: 'استعمار الأمعاء بالبكتيريا النافعة.' },
                    { from: 1, to: 5,
                        name: 'تركيبة المياه (اليانسون النجمي، الأكناشيا، البيتين، السوربيتول، الكارنيتين، ملح الليمون، الملح الإنجليزي)',
                        dose: 1, unit: 'سم', per: 'لتر ماء', notes: 'ترطيب، تعويض الإلكتروليت.' }
                ]
            },
            turkeyWhite: {
                label: 'رومي أبيض',
                cycleDays: 112,
                waterFeedRatio: 2.1,
                weight: [
                    [0, 60],
                    [28, 1000],
                    [56, 3000],
                    [84, 5500],
                    [112, 7500]
                ],
                feed: [
                    [0, 0],
                    [28, 1500],
                    [56, 5800],
                    [84, 12500],
                    [112, 20500]
                ],
                temp: [
                    [0, 35],
                    [28, 30],
                    [56, 26],
                    [84, 23],
                    [112, 21]
                ],
                humidity: [
                    [0, 65],
                    [28, 60],
                    [56, 55],
                    [84, 50],
                    [112, 50]
                ],
                airspeed: [
                    [0, 0.3],
                    [28, 0.5],
                    [56, 0.8],
                    [84, 1.0],
                    [112, 1.5]
                ],
                co2: [
                    [0, 1500],
                    [28, 2000],
                    [56, 2500],
                    [84, 2800],
                    [112, 3000]
                ],
                nh3: [
                    [0, 5],
                    [28, 8],
                    [56, 10],
                    [84, 15],
                    [112, 20]
                ],
                o2: [
                    [0, 21],
                    [28, 21],
                    [56, 20.5],
                    [84, 20],
                    [112, 20]
                ],
                vaccines: [
                    { day: 1, name: 'نيوكاسل + التهاب شعبي (رذاذ)' },
                    { day: 7, name: 'رومي (فيروسي)' },
                    { day: 14, name: 'نيوكاسل (مياه)' },
                    { day: 21, name: 'هيموفيليس' },
                    { day: 28, name: 'ميكوبلازما' },
                    { day: 45, name: 'جدري' }
                ],
                treatments: [
                    { day: 7, name: 'رش بروبيوتك' },
                    { day: 14, name: 'رش ملح الليمون' },
                    { day: 21, name: 'رش بروبيوتك' },
                    { day: 28, name: 'رش ملح الليمون' },
                    { day: 35, name: 'رش بروبيوتك' },
                    { day: 42, name: 'رش ملح الليمون' },
                    { day: 56, name: 'رش بروبيوتك' },
                    { day: 70, name: 'رش ملح الليمون' },
                    { day: 84, name: 'رش بروبيوتك' },
                    { day: 98, name: 'رش ملح الليمون' }
                ],
                feedAdditives: [
                    { from: 1, to: 7, name: 'بيوتيرات الصوديوم', dose: 0.5, unit: 'جم', per: 'كجم علف',
                    notes: 'تعزيز صحة الأمعاء.' },
                    { from: 1, to: 112, name: 'نيوكليوتيدات + ببتيدات', dose: 0.3, unit: 'جم', per: 'كجم علف',
                        notes: 'تسريع النمو وتقوية المناعة.' },
                    { from: 1, to: 112, name: 'مانان وبيتا جلوكان', dose: 0.2, unit: 'جم', per: 'كجم علف',
                        notes: 'تحفيز المناعة وامتصاص السموم.' },
                    { from: 1, to: 112, name: 'إنزيمات هاضمة', dose: 0.15, unit: 'جم', per: 'كجم علف',
                    notes: 'تحسين الهضم.' },
                    { from: 1, to: 112,
                        name: 'زيوت الأعشاب (الأوريجانو، الحلبة، القسط الهندي، البردقوش، القرفة، الثوم، حبة البركة، حب الرشاد، الكركم، الكرفس، حليب الشوك، حلفا بر، الخلة البلدي)',
                        dose: 0.5, unit: 'جم', per: 'كجم علف', notes: 'مضادات بكتيريا طبيعية، مضادات أكسدة.' }
                ],
                waterAdditives: [
                    { from: 1, to: 3, name: 'بروبايوتك', dose: 0.5, unit: 'جم', per: 'لتر ماء',
                        notes: 'استعمار الأمعاء بالبكتيريا النافعة.' },
                    { from: 1, to: 5,
                        name: 'تركيبة المياه (اليانسون النجمي، الأكناشيا، البيتين، السوربيتول، الكارنيتين، ملح الليمون، الملح الإنجليزي)',
                        dose: 1, unit: 'سم', per: 'لتر ماء', notes: 'ترطيب، تعويض الإلكتروليت.' }
                ]
            },
            turkeyBlack: {
                label: 'رومي أسود (محلي)',
                cycleDays: 180,
                waterFeedRatio: 2.1,
                weight: [
                    [0, 55],
                    [30, 350],
                    [60, 1000],
                    [90, 2000],
                    [120, 3200],
                    [150, 4200],
                    [180, 5000]
                ],
                feed: [
                    [0, 0],
                    [30, 800],
                    [60, 2800],
                    [90, 5800],
                    [120, 9500],
                    [150, 13500],
                    [180, 17500]
                ],
                temp: [
                    [0, 35],
                    [30, 30],
                    [60, 27],
                    [90, 25],
                    [120, 23],
                    [150, 22],
                    [180, 21]
                ],
                humidity: [
                    [0, 65],
                    [30, 60],
                    [60, 55],
                    [90, 50],
                    [120, 50],
                    [150, 50],
                    [180, 50]
                ],
                airspeed: [
                    [0, 0.3],
                    [30, 0.5],
                    [60, 0.8],
                    [90, 1.0],
                    [120, 1.2],
                    [150, 1.5],
                    [180, 1.8]
                ],
                co2: [
                    [0, 1500],
                    [30, 2000],
                    [60, 2500],
                    [90, 2800],
                    [120, 3000],
                    [150, 3000],
                    [180, 3000]
                ],
                nh3: [
                    [0, 5],
                    [30, 8],
                    [60, 10],
                    [90, 12],
                    [120, 15],
                    [150, 18],
                    [180, 20]
                ],
                o2: [
                    [0, 21],
                    [30, 21],
                    [60, 20.5],
                    [90, 20.5],
                    [120, 20],
                    [150, 20],
                    [180, 20]
                ],
                vaccines: [
                    { day: 1, name: 'نيوكاسل + التهاب شعبي' },
                    { day: 7, name: 'رومي (لقاح)' },
                    { day: 14, name: 'نيوكاسل (مياه)' },
                    { day: 21, name: 'هيموفيليس' },
                    { day: 35, name: 'ميكوبلازما' }
                ],
                treatments: [
                    { day: 7, name: 'رش بروبيوتك' },
                    { day: 14, name: 'رش ملح الليمون' },
                    { day: 21, name: 'رش بروبيوتك' },
                    { day: 28, name: 'رش ملح الليمون' },
                    { day: 35, name: 'رش بروبيوتك' },
                    { day: 42, name: 'رش ملح الليمون' },
                    { day: 60, name: 'رش بروبيوتك' },
                    { day: 80, name: 'رش ملح الليمون' },
                    { day: 100, name: 'رش بروبيوتك' },
                    { day: 120, name: 'رش ملح الليمون' },
                    { day: 140, name: 'رش بروبيوتك' },
                    { day: 160, name: 'رش ملح الليمون' }
                ],
                feedAdditives: [
                    { from: 1, to: 7, name: 'بيوتيرات الصوديوم', dose: 0.5, unit: 'جم', per: 'كجم علف',
                    notes: 'تعزيز صحة الأمعاء.' },
                    { from: 1, to: 180, name: 'نيوكليوتيدات + ببتيدات', dose: 0.3, unit: 'جم', per: 'كجم علف',
                        notes: 'تسريع النمو وتقوية المناعة.' },
                    { from: 1, to: 180, name: 'مانان وبيتا جلوكان', dose: 0.2, unit: 'جم', per: 'كجم علف',
                        notes: 'تحفيز المناعة وامتصاص السموم.' },
                    { from: 1, to: 180, name: 'إنزيمات هاضمة', dose: 0.15, unit: 'جم', per: 'كجم علف',
                    notes: 'تحسين الهضم.' },
                    { from: 1, to: 180,
                        name: 'زيوت الأعشاب (الأوريجانو، الحلبة، القسط الهندي، البردقوش، القرفة، الثوم، حبة البركة، حب الرشاد، الكركم، الكرفس، حليب الشوك، حلفا بر، الخلة البلدي)',
                        dose: 0.5, unit: 'جم', per: 'كجم علف', notes: 'مضادات بكتيريا طبيعية، مضادات أكسدة.' }
                ],
                waterAdditives: [
                    { from: 1, to: 3, name: 'بروبايوتك', dose: 0.5, unit: 'جم', per: 'لتر ماء',
                        notes: 'استعمار الأمعاء بالبكتيريا النافعة.' },
                    { from: 1, to: 5,
                        name: 'تركيبة المياه (اليانسون النجمي، الأكناشيا، البيتين، السوربيتول، الكارنيتين، ملح الليمون، الملح الإنجليزي)',
                        dose: 1, unit: 'سم', per: 'لتر ماء', notes: 'ترطيب، تعويض الإلكتروليت.' }
                ]
            },
            muscovy: {
                label: 'بط مسكوفي',
                cycleDays: 84,
                waterFeedRatio: 3.2,
                weight: [
                    [0, 50],
                    [14, 350],
                    [28, 900],
                    [42, 1700],
                    [56, 2600],
                    [70, 3400],
                    [84, 4000]
                ],
                feed: [
                    [0, 0],
                    [14, 400],
                    [28, 1500],
                    [42, 3300],
                    [56, 5800],
                    [70, 8800],
                    [84, 11800]
                ],
                temp: [
                    [0, 34],
                    [14, 30],
                    [28, 28],
                    [42, 26],
                    [56, 24],
                    [70, 23],
                    [84, 22]
                ],
                humidity: [
                    [0, 65],
                    [14, 60],
                    [28, 55],
                    [42, 50],
                    [56, 50],
                    [70, 50],
                    [84, 50]
                ],
                airspeed: [
                    [0, 0.3],
                    [14, 0.5],
                    [28, 0.8],
                    [42, 1.0],
                    [56, 1.2],
                    [70, 1.5],
                    [84, 1.8]
                ],
                co2: [
                    [0, 1500],
                    [14, 2000],
                    [28, 2500],
                    [42, 2800],
                    [56, 3000],
                    [70, 3000],
                    [84, 3000]
                ],
                nh3: [
                    [0, 5],
                    [14, 8],
                    [28, 10],
                    [42, 12],
                    [56, 15],
                    [70, 18],
                    [84, 20]
                ],
                o2: [
                    [0, 21],
                    [14, 21],
                    [28, 20.5],
                    [42, 20.5],
                    [56, 20],
                    [70, 20],
                    [84, 20]
                ],
                vaccines: [
                    { day: 1, name: 'التهاب الكبد الفيروسي' },
                    { day: 7, name: 'بارفو' },
                    { day: 14, name: 'كوليرا البط' }
                ],
                treatments: [
                    { day: 7, name: 'رش بروبيوتك' },
                    { day: 14, name: 'رش ملح الليمون' },
                    { day: 21, name: 'رش بروبيوتك' },
                    { day: 28, name: 'رش ملح الليمون' },
                    { day: 35, name: 'رش بروبيوتك' },
                    { day: 42, name: 'رش ملح الليمون' },
                    { day: 56, name: 'رش بروبيوتك' },
                    { day: 70, name: 'رش ملح الليمون' }
                ],
                feedAdditives: [
                    { from: 1, to: 7, name: 'بيوتيرات الصوديوم', dose: 0.5, unit: 'جم', per: 'كجم علف',
                    notes: 'تعزيز صحة الأمعاء.' },
                    { from: 1, to: 84, name: 'نيوكليوتيدات + ببتيدات', dose: 0.3, unit: 'جم', per: 'كجم علف',
                        notes: 'تسريع النمو وتقوية المناعة.' },
                    { from: 1, to: 84, name: 'مانان وبيتا جلوكان', dose: 0.2, unit: 'جم', per: 'كجم علف',
                        notes: 'تحفيز المناعة وامتصاص السموم.' },
                    { from: 1, to: 84, name: 'إنزيمات هاضمة', dose: 0.15, unit: 'جم', per: 'كجم علف',
                    notes: 'تحسين الهضم.' },
                    { from: 1, to: 84,
                        name: 'زيوت الأعشاب (الأوريجانو، الحلبة، القسط الهندي، البردقوش، القرفة، الثوم، حبة البركة، حب الرشاد، الكركم، الكرفس، حليب الشوك، حلفا بر، الخلة البلدي)',
                        dose: 0.5, unit: 'جم', per: 'كجم علف', notes: 'مضادات بكتيريا طبيعية، مضادات أكسدة.' }
                ],
                waterAdditives: [
                    { from: 1, to: 3, name: 'بروبايوتك', dose: 0.5, unit: 'جم', per: 'لتر ماء',
                        notes: 'استعمار الأمعاء بالبكتيريا النافعة.' },
                    { from: 1, to: 5,
                        name: 'تركيبة المياه (اليانسون النجمي، الأكناشيا، البيتين، السوربيتول، الكارنيتين، ملح الليمون، الملح الإنجليزي)',
                        dose: 1, unit: 'سم', per: 'لتر ماء', notes: 'ترطيب، تعويض الإلكتروليت.' }
                ]
            },
            mulard: {
                label: 'بط مولر',
                cycleDays: 84,
                waterFeedRatio: 3.2,
                weight: [
                    [0, 55],
                    [14, 400],
                    [28, 1100],
                    [42, 2000],
                    [56, 2900],
                    [70, 3600],
                    [84, 4200]
                ],
                feed: [
                    [0, 0],
                    [14, 450],
                    [28, 1700],
                    [42, 3700],
                    [56, 6300],
                    [70, 9300],
                    [84, 12300]
                ],
                temp: [
                    [0, 34],
                    [14, 30],
                    [28, 28],
                    [42, 26],
                    [56, 24],
                    [70, 23],
                    [84, 22]
                ],
                humidity: [
                    [0, 65],
                    [14, 60],
                    [28, 55],
                    [42, 50],
                    [56, 50],
                    [70, 50],
                    [84, 50]
                ],
                airspeed: [
                    [0, 0.3],
                    [14, 0.5],
                    [28, 0.8],
                    [42, 1.0],
                    [56, 1.2],
                    [70, 1.5],
                    [84, 1.8]
                ],
                co2: [
                    [0, 1500],
                    [14, 2000],
                    [28, 2500],
                    [42, 2800],
                    [56, 3000],
                    [70, 3000],
                    [84, 3000]
                ],
                nh3: [
                    [0, 5],
                    [14, 8],
                    [28, 10],
                    [42, 12],
                    [56, 15],
                    [70, 18],
                    [84, 20]
                ],
                o2: [
                    [0, 21],
                    [14, 21],
                    [28, 20.5],
                    [42, 20.5],
                    [56, 20],
                    [70, 20],
                    [84, 20]
                ],
                vaccines: [
                    { day: 1, name: 'التهاب الكبد الفيروسي' },
                    { day: 7, name: 'بارفو' },
                    { day: 14, name: 'كوليرا البط' }
                ],
                treatments: [
                    { day: 7, name: 'رش بروبيوتك' },
                    { day: 14, name: 'رش ملح الليمون' },
                    { day: 21, name: 'رش بروبيوتك' },
                    { day: 28, name: 'رش ملح الليمون' },
                    { day: 35, name: 'رش بروبيوتك' },
                    { day: 42, name: 'رش ملح الليمون' },
                    { day: 56, name: 'رش بروبيوتك' },
                    { day: 70, name: 'رش ملح الليمون' }
                ],
                feedAdditives: [
                    { from: 1, to: 7, name: 'بيوتيرات الصوديوم', dose: 0.5, unit: 'جم', per: 'كجم علف',
                    notes: 'تعزيز صحة الأمعاء.' },
                    { from: 1, to: 84, name: 'نيوكليوتيدات + ببتيدات', dose: 0.3, unit: 'جم', per: 'كجم علف',
                        notes: 'تسريع النمو وتقوية المناعة.' },
                    { from: 1, to: 84, name: 'مانان وبيتا جلوكان', dose: 0.2, unit: 'جم', per: 'كجم علف',
                        notes: 'تحفيز المناعة وامتصاص السموم.' },
                    { from: 1, to: 84, name: 'إنزيمات هاضمة', dose: 0.15, unit: 'جم', per: 'كجم علف',
                    notes: 'تحسين الهضم.' },
                    { from: 1, to: 84,
                        name: 'زيوت الأعشاب (الأوريجانو، الحلبة، القسط الهندي، البردقوش، القرفة، الثوم، حبة البركة، حب الرشاد، الكركم، الكرفس، حليب الشوك، حلفا بر، الخلة البلدي)',
                        dose: 0.5, unit: 'جم', per: 'كجم علف', notes: 'مضادات بكتيريا طبيعية، مضادات أكسدة.' }
                ],
                waterAdditives: [
                    { from: 1, to: 3, name: 'بروبايوتك', dose: 0.5, unit: 'جم', per: 'لتر ماء',
                        notes: 'استعمار الأمعاء بالبكتيريا النافعة.' },
                    { from: 1, to: 5,
                        name: 'تركيبة المياه (اليانسون النجمي، الأكناشيا، البيتين، السوربيتول، الكارنيتين، ملح الليمون، الملح الإنجليزي)',
                        dose: 1, unit: 'سم', per: 'لتر ماء', notes: 'ترطيب، تعويض الإلكتروليت.' }
                ]
            }
        };

        // دوال مساعدة للكتالوج
        // ============ (جديد) مطابقة نص السلالة الحر (breed) اللي بيكتبه المستخدم مع سلالات تجارية معروفة لها منحنى نمو مختلف ============
        // المشكلة الأصلية: المرجع المعياري كان مربوط بـ"النوع" (دجاج تسمين) بس، فروص 308 وكوب 500 وهوبارد
        // كانوا بيتقارنوا كلهم بمنحنى واحد رغم إن منحناهم الفعلي مختلف — مقارنة غير دقيقة تأثر على كل التحليلات.
        const BREED_NAME_ALIASES = {
            ross308: ['روص', 'ross', 'روس 308', 'روص 308'],
            cobb500: ['كوب', 'cobb', 'كوب 500', 'كوب500'],
        };
        function detectBreedKey(breedText) {
            if (!breedText) return null;
            const t = String(breedText).trim().toLowerCase();
            if (!t) return null;
            for (const key of Object.keys(BREED_NAME_ALIASES)) {
                if (BREED_NAME_ALIASES[key].some(alias => t.includes(alias.toLowerCase()))) return key;
            }
            return null;
        }
        function getSpeciesData(speciesKey, breedText) {
            const base = SPECIES_CATALOG[speciesKey] || SPECIES_CATALOG.broiler;
            const ov = (state.speciesOverrides || {})[speciesKey];
            let result = ov ? { ...base, ...ov } : base;
            // 1) تعديل يدوي مخصّص لسلالة بعينها (لو المستخدم حفظ واحد صراحة من محرر المرجع) — أعلى أولوية
            const breedKey = detectBreedKey(breedText);
            const breedOv = breedKey && state.speciesOverrides ? state.speciesOverrides[speciesKey + '::' + breedKey] : null;
            if (breedOv) return { ...result, ...breedOv };
            // 2) لو مفيش تعديل يدوي، لكن السلالة معروفة (روص/كوب) وعندها منحنى وزن عالمي جاهز ومفيش تعديل عام
            //    يدوي مقصود على مستوى النوع كله (لو المستخدم عدّل يدويًا على مستوى النوع، بنحترم اختياره ومنستبدلوش تلقائيًا)
            if (breedKey && !ov && GLOBAL_BREED_BENCHMARKS[breedKey]) {
                result = { ...result, weight: GLOBAL_BREED_BENCHMARKS[breedKey].weight, breedAutoMatched: breedKey };
            }
            return result;
        }

        // ============ خطة المساحة/التحضين والتجهيزات (علافات + سقايات/نبل) طوال الدورة ============
        // أرقام استرشادية تقريبية شائعة فى إدارة الدواجن/الرومي/البط — مش بديل عن دليل السلالة أو توصية المورّد،
        // لكنها كافية للتخطيط الأولي: كام علافة وسقاية/نبل محتاج، وإزاي توسّع منطقة التحضين تدريجيًا.
        const SPECIES_CATEGORY = {
            broiler: 'chicken', sasso: 'chicken', balady: 'chicken', quail: 'quail',
            turkeyWhite: 'turkey', turkeyBlack: 'turkey', muscovy: 'duck', mulard: 'duck'
        };
        function getSpeciesCategory(species) { return SPECIES_CATEGORY[species] || 'chicken'; }
        // ============ 🥚 مرجع "قطيع الأمهات" — أرقام استرشادية تقريبية شائعة لكل نوع، نقطة انطلاق قابلة للتعديل الكامل ============
        // نفس فكرة SPECIES_CATALOG بالظبط (مرجع تقريبي مش بديل عن بيانات مورّدك الفعلية) لكن لبيانات الأمهات
        // تحديدًا (بيض/خصوبة/فقس) اللي معندهاش مرجع قبل كده وكانت بتتطلب من المستخدم يخمّنها من الصفر. تُستخدم
        // كقيمة ابتدائية بس فى حاسبة قطيع الأمهات (خطة التوسع) — أي تعديل يدوي من المستخدم بيبقى له الأولوية دايمًا.
        const BREEDER_FLOCK_BENCHMARKS = {
            broiler: { henEggsPerYear: 170, fertilityPct: 92, hatchPct: 84 }, // أمهات دجاج تسمين أبيض (روص/كوب) — موسم إنتاج ~40 أسبوع
            sasso: { henEggsPerYear: 150, fertilityPct: 90, hatchPct: 82 },
            balady: { henEggsPerYear: 130, fertilityPct: 88, hatchPct: 80 }, // بلدي عادة إنتاجية بيض أقل من السلالات المحسّنة
            quail: { henEggsPerYear: 280, fertilityPct: 90, hatchPct: 75 }, // سمان: إنتاجية بيض عالية جدًا لكن فقس أقل نسبيًا
            turkeyWhite: { henEggsPerYear: 95, fertilityPct: 88, hatchPct: 80 },
            turkeyBlack: { henEggsPerYear: 80, fertilityPct: 85, hatchPct: 78 },
            muscovy: { henEggsPerYear: 140, fertilityPct: 85, hatchPct: 75 },
            mulard: { henEggsPerYear: 130, fertilityPct: 85, hatchPct: 75 }, // المولار هجين، عادة بيستخدم أمهات مسكوفي/بط بلدي
        };
        function getBreederFlockDefaults(species) {
            return BREEDER_FLOCK_BENCHMARKS[species] || BREEDER_FLOCK_BENCHMARKS.broiler;
        }
        const EQUIPMENT_STANDARDS = {
            chicken: { label: 'دجاج (تسمين/بلدي/ساسو)', broodingDays: 10, broodingDensity: 38,
                areaRamp: [{ d: 3, pct: 33 }, { d: 7, pct: 66 }, { d: 10, pct: 100 }],
                feederStages: [{ d: 7, per: 100, note: 'صواني تحضين' }, { d: 14, per: 65, note: 'علافة بان صغيرة' }, { d: 9999, per: 45, note: 'علافة بان/أنبوبية قياسية' }],
                drinkerStages: [{ d: 14, per: 15, note: 'نبل تحضين' }, { d: 9999, per: 12, note: 'نبل قياسي' }] },
            quail: { label: 'سمان', broodingDays: 7, broodingDensity: 90,
                areaRamp: [{ d: 3, pct: 40 }, { d: 7, pct: 100 }],
                feederStages: [{ d: 14, per: 100, note: 'أحواض تحضين صغيرة' }, { d: 9999, per: 70, note: 'أحواض/علافات خطية' }],
                drinkerStages: [{ d: 14, per: 15, note: 'نبل/كبك تحضين مصغّر' }, { d: 9999, per: 12, note: 'نبل قياسي مصغّر' }] },
            turkey: { label: 'رومي', broodingDays: 14, broodingDensity: 16,
                areaRamp: [{ d: 7, pct: 40 }, { d: 14, pct: 70 }, { d: 21, pct: 100 }],
                feederStages: [{ d: 14, per: 30, note: 'صواني تحضين رومي' }, { d: 56, per: 25, note: 'علافة بان متوسطة' }, { d: 9999, per: 20, note: 'علافة كبيرة للرومي البالغ' }],
                drinkerStages: [{ d: 14, per: 8, note: 'نبل تحضين — حسّاس جدًا للعطش أول أسبوعين' }, { d: 9999, per: 6, note: 'نبل قياسي رومي' }] },
            duck: { label: 'بط (مسكوفي/مولر)', broodingDays: 10, broodingDensity: 20,
                areaRamp: [{ d: 3, pct: 40 }, { d: 10, pct: 100 }],
                feederStages: [{ d: 10, per: 40, note: 'أحواض تحضين بط' }, { d: 9999, per: 25, note: 'علافة قياسية' }],
                drinkerStages: [{ d: 10, per: 10, note: 'تحضين — البط يحتاج مياه أكتر من الدواجن' }, { d: 9999, per: 6, note: 'قياسي — وفّر كمية مياه أكبر لطبيعة البط' }] }
        };
        function computeEquipmentPlan(b, m) {
            const cat = getSpeciesCategory(b.species);
            const std = EQUIPMENT_STANDARDS[cat];
            const targetAge = b.targetAge || 35;
            const startCount = b.startCount || 0;
            const area = b.area || 0;
            const isCage = b.floorType === 'cage';
            function findStage(list, day) { return list.find(s => day <= s.d) || list[list.length - 1]; }
            const brackets = new Set([targetAge]);
            std.feederStages.forEach(fs => { if (fs.d < 9999 && fs.d <= targetAge) brackets.add(fs.d); });
            std.drinkerStages.forEach(ds => { if (ds.d < 9999 && ds.d <= targetAge) brackets.add(ds.d); });
            if (std.broodingDays <= targetAge) brackets.add(std.broodingDays);
            const uniqSorted = [...brackets].sort((a, c) => a - c);
            const rows = uniqSorted.map((day, idx) => {
                const fromDay = idx === 0 ? 1 : uniqSorted[idx - 1] + 1;
                const fs = findStage(std.feederStages, day);
                const ds = findStage(std.drinkerStages, day);
                return { fromDay, toDay: day, feeders: Math.ceil(startCount / fs.per) || 0, feederNote: fs.note,
                    drinkers: Math.ceil(startCount / ds.per) || 0, drinkerNote: ds.note };
            });
            let broodingPlan = null;
            if (!isCage && area > 0) {
                broodingPlan = std.areaRamp.map(r => {
                    const openArea = area * (r.pct / 100);
                    const maxBirds = Math.floor(openArea * std.broodingDensity);
                    return { untilDay: r.d, pct: r.pct, openArea: openArea.toFixed(1), maxBirds, ok: startCount <= maxBirds };
                });
            }
            return { category: cat, categoryLabel: std.label, rows, broodingPlan, isCage, startCount, targetAge };
        }

        // ============ محرر الأرقام القياسية والمرجعية (إعدادات) ============
        let stdRefSpeciesSel = null;
        let stdRefRows = null;

        function loadStdRefBuffer(sp) {
            stdRefSpeciesSel = sp;
            const data = getSpeciesData(sp);
            const at = (arr, d) => { const p = (arr || []).find(x => x[0] === d); return p ? p[1] : ''; };
            const days = [...new Set((data.weight || []).map(p => p[0]))].sort((a, c) => a - c);
            stdRefRows = days.map(d => ({
                day: d, weight: at(data.weight, d), feed: at(data.feed, d), temp: at(data.temp, d),
                humidity: at(data.humidity, d), airspeed: at(data.airspeed, d), co2: at(data.co2, d),
                nh3: at(data.nh3, d), o2: data.o2 ? at(data.o2, d) : ''
            }));
        }

        function changeStdRefSpecies(sp) { loadStdRefBuffer(sp); render(); }

        // ============ تحميل منحنى وزن قياسي جاهز (روص 308 / كوب 500) داخل محرر المرجع ============
        // المنحنيان معرّفان أصلاً فى GLOBAL_BREED_BENCHMARKS ومُستخدمان فى مقارنة الأداء، لكن كانا مجرد
        // عرض معلوماتي بدون أي طريقة لجعلهما هما "المرجع الفعلي" اللي بتُبنى عليه التنبيهات والـ FCR وكل الحسابات.
        // هنا بنسمح بتحميل عمود الوزن بس من المعيار الجاهز داخل نفس المحرر، فيبقى قابل للتفعيل الفعلي بضغطة حفظ.
        function loadBreedPreset(key) {
            const std = GLOBAL_BREED_BENCHMARKS[key];
            if (!std || !stdRefRows) return;
            showConfirm(`سيتم استبدال عمود "الوزن" فقط بمنحنى ${std.label} (باقي الأعمدة — العلف والبيئة — هتفضل زي ما هي فى المحرر). التغيير مش نهائي إلا لما تضغط 💾 حفظ، وتقدر تسترجع الأصلي فى أي وقت. متابعة؟`, () => {
                std.weight.forEach(([day, w]) => {
                    let row = stdRefRows.find(r => Number(r.day) === day);
                    if (!row) { row = { day, weight: '', feed: '', temp: '', humidity: '', airspeed: '', co2: '', nh3: '', o2: '' }; stdRefRows.push(row); }
                    row.weight = w;
                });
                stdRefRows.sort((a, c) => Number(a.day) - Number(c.day));
                render();
                showToast(`✅ تم تحميل منحنى وزن ${std.label} فى المحرر — اضغط 💾 حفظ لتثبيته كمرجع فعلي`);
            });
        }

        function updateStdRefCell(idx, field, val) {
            if (!stdRefRows || !stdRefRows[idx]) return;
            const n = parseFloat(val);
            if (val !== '' && (isNaN(n) || n < 0)) return; // يمنع تخزين قيم سالبة أو غير رقمية فى منحنى مرجعي بيتبني عليه كل تحليل إحصائي
            stdRefRows[idx][field] = val === '' ? '' : n;
        }

        function addStdRefRow() {
            if (!stdRefRows) return;
            const lastDay = stdRefRows.length ? (Number(stdRefRows[stdRefRows.length - 1].day) || 0) : 0;
            stdRefRows.push({ day: lastDay + 7, weight: '', feed: '', temp: '', humidity: '', airspeed: '', co2: '', nh3: '', o2: '' });
            render();
        }

        function removeStdRefRow(idx) {
            if (!stdRefRows) return;
            stdRefRows.splice(idx, 1);
            render();
        }

        function saveStdRefs() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 3): تعديل المنحنى المرجعي يؤثر على كل التحليلات — owner فقط
            if (!stdRefRows || !stdRefSpeciesSel) return;
            const rows = stdRefRows.map(r => ({ ...r, day: Number(r.day) })).filter(r => !isNaN(r.day)).sort((a, c) => a.day - c.day);
            if (rows.length < 2) { showToast('أدخل نقطتين على الأقل (لازم يوم 0 = يوم التسكين ونقطة تانية على الأقل)'); return; }
            const build = key => rows.map(r => [r.day, Number(r[key]) || 0]);
            const hasO2 = rows.some(r => r.o2 !== '' && r.o2 != null && !isNaN(Number(r.o2)));
            const wfrInput = document.getElementById('stdRef_wfr');
            const override = {
                weight: build('weight'), feed: build('feed'), temp: build('temp'),
                humidity: build('humidity'), airspeed: build('airspeed'), co2: build('co2'), nh3: build('nh3'),
                waterFeedRatio: wfrInput ? (parseFloat(wfrInput.value) || getSpeciesData(stdRefSpeciesSel).waterFeedRatio) : getSpeciesData(stdRefSpeciesSel).waterFeedRatio
            };
            if (hasO2) override.o2 = build('o2');
            if (!state.speciesOverrides) setState('speciesOverrides', {});
            state.speciesOverrides[stdRefSpeciesSel] = override;
            persist();
            logAudit(null, `📊 تعديل الأرقام القياسية المرجعية لنوع: ${SPECIES_CATALOG[stdRefSpeciesSel] ? SPECIES_CATALOG[stdRefSpeciesSel].label : stdRefSpeciesSel}`);
            loadStdRefBuffer(stdRefSpeciesSel);
            render();
            showToast('✅ تم حفظ الأرقام القياسية لهذا النوع');
        }

        function resetStdRefs() {
            if (!stdRefSpeciesSel) return;
            if (!state.speciesOverrides || !state.speciesOverrides[stdRefSpeciesSel]) { showToast('لا يوجد تعديل مخصص لاسترجاعه'); return; }
            showConfirm('سيتم حذف تعديلاتك واسترجاع القيم الافتراضية الأصلية لهذا النوع. متابعة؟', () => {
                delete state.speciesOverrides[stdRefSpeciesSel];
                persist();
                logAudit(null, `↩️ استرجاع الأرقام القياسية الأصلية لنوع: ${SPECIES_CATALOG[stdRefSpeciesSel] ? SPECIES_CATALOG[stdRefSpeciesSel].label : stdRefSpeciesSel}`);
                loadStdRefBuffer(stdRefSpeciesSel);
                render();
                showToast('↩️ تم استرجاع القيم الافتراضية');
            }, 'استرجاع الافتراضي');
        }

        function renderStdRefSection() {
            if (!stdRefRows) loadStdRefBuffer(stdRefSpeciesSel || (getActiveBatch() && getActiveBatch().species) || 'broiler');
            const speciesOptions = Object.keys(SPECIES_CATALOG).map(k =>
                `<option value="${k}" ${k === stdRefSpeciesSel ? 'selected' : ''}>${SPECIES_CATALOG[k].label}</option>`).join('');
            const isOverridden = !!(state.speciesOverrides && state.speciesOverrides[stdRefSpeciesSel]);
            const wfr = isOverridden ? state.speciesOverrides[stdRefSpeciesSel].waterFeedRatio : getSpeciesData(stdRefSpeciesSel).waterFeedRatio;
            const rowsHtml = stdRefRows.map((r, i) => `
                <tr>
                    <td><input type="number" min="0" step="1" value="${r.day}" oninput="updateStdRefCell(${i},'day',this.value)" style="width:52px;"></td>
                    <td><input type="number" min="0" step="1" value="${r.weight}" oninput="updateStdRefCell(${i},'weight',this.value)" style="width:64px;"></td>
                    <td><input type="number" min="0" step="1" value="${r.feed}" oninput="updateStdRefCell(${i},'feed',this.value)" style="width:64px;"></td>
                    <td><input type="number" min="0" max="45" step="0.1" value="${r.temp}" oninput="updateStdRefCell(${i},'temp',this.value)" style="width:56px;"></td>
                    <td><input type="number" min="0" max="100" step="1" value="${r.humidity}" oninput="updateStdRefCell(${i},'humidity',this.value)" style="width:56px;"></td>
                    <td><input type="number" min="0" max="10" step="0.1" value="${r.airspeed}" oninput="updateStdRefCell(${i},'airspeed',this.value)" style="width:56px;"></td>
                    <td><input type="number" min="0" step="1" value="${r.co2}" oninput="updateStdRefCell(${i},'co2',this.value)" style="width:64px;"></td>
                    <td><input type="number" min="0" step="1" value="${r.nh3}" oninput="updateStdRefCell(${i},'nh3',this.value)" style="width:56px;"></td>
                    <td><button class="btn danger sm" onclick="removeStdRefRow(${i})">✕</button></td>
                </tr>`).join('');
            return `
                <div class="section">
                    <div class="section-head"><h2>📊 الأرقام القياسية والمرجعية (وزن/علف/بيئة)</h2></div>
                    <div class="card">
                        <p style="font-size:12px;color:var(--muted);margin:0 0 10px;line-height:1.7;">
                            هنا تقدر تعدّل منحنى الأداء المرجعي (الوزن، العلف التراكمي، الحرارة، الرطوبة، سرعة الهواء، CO₂، NH₃) لكل نوع — <b>يوم 0 = يوم التسكين/الاستقبال</b>. أي تعديل هنا بيغيّر كل الحسابات والتنبيهات المبنية على هذا المرجع، لكل دفعاتك من هذا النوع.
                            ${isOverridden ? '<br><b style="color:#B8860B;">⚠️ الأرقام الحالية معدَّلة يدويًا — مش الافتراضي الأصلي.</b>' : ''}
                        </p>
                        <div class="field"><label>النوع</label><select id="stdRef_species" onchange="changeStdRefSpecies(this.value)">${speciesOptions}</select></div>
                        <div class="field"><label>نسبة الماء:العلف</label><input type="number" step="0.1" id="stdRef_wfr" value="${wfr}"></div>
                        ${stdRefSpeciesSel === 'broiler' ? `<div class="field full">
                            <label>تحميل منحنى وزن قياسي جاهز (يستبدل عمود الوزن فقط)</label>
                            <div class="row-actions">
                                <button class="btn ghost sm" style="flex:1;" onclick="loadBreedPreset('ross308')">📥 روص 308</button>
                                <button class="btn ghost sm" style="flex:1;" onclick="loadBreedPreset('cobb500')">📥 كوب 500</button>
                            </div>
                        </div>` : ''}
                        <div class="scroll-x" style="margin-top:10px;">
                            <table>
                                <thead><tr><th>يوم</th><th>وزن(جم)</th><th>علف تراكمي(جم)</th><th>حرارة°م</th><th>رطوبة%</th><th>هواء م/ث</th><th>CO2</th><th>NH3</th><th></th></tr></thead>
                                <tbody>${rowsHtml}</tbody>
                            </table>
                        </div>
                        <div class="row-actions" style="margin-top:10px;">
                            <button class="btn ghost" style="flex:1;" onclick="addStdRefRow()">+ إضافة يوم</button>
                            <button class="btn gold" style="flex:1;" onclick="saveStdRefs()">💾 حفظ</button>
                        </div>
                        ${isOverridden ? `<button class="btn danger block" style="margin-top:8px;" onclick="resetStdRefs()">↩️ استرجاع القيم الافتراضية الأصلية</button>` : ''}
                    </div>
                </div>`;
        }

        // ============ محرر المعايير المتقدمة (تدفئة/تنبيهات/أداء/جدوى) ============
        function asField(id, label, key, step) {
            const v = AS()[key];
            return `<div class="field"><label>${label}</label><input type="number" ${step?`step="${step}"`:''} id="${id}" value="${v}"></div>`;
        }

        function renderAdvancedSettingsSection() {
            const isCustom = state.appSettings && Object.keys(state.appSettings).length > 0;
            return `
                <div class="section">
                    <div class="section-head"><h2>⚙️ معايير متقدمة (تدفئة / تنبيهات / أداء / جدوى)</h2></div>
                    <div class="card">
                        <p style="font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.7;">
                            كل الأرقام دي مستخدمة فى حسابات التطبيق (تقدير وقود التدفئة، مواعيد التنبيهات، ألوان تقييم الأداء، دراسة الجدوى). عدّلها براحتك على حسب ظروف مزرعتك الفعلية.
                            ${isCustom ? '<br><b style="color:#B8860B;">⚠️ فيه معايير معدَّلة يدويًا حاليًا.</b>' : ''}
                        </p>

                        <details open><summary style="font-weight:800;color:var(--barn-dark);cursor:pointer;padding:6px 0;">🔥 التدفئة</summary>
                        <div class="form-grid" style="margin-top:8px;">
                            ${asField('as_heatFuelSolarPerM2','معدل السولار (لتر/م²)','heatFuelSolarPerM2','0.001')}
                            ${asField('as_heatFuelGasPerM2','معدل الغاز (أنبوبة/م²)','heatFuelGasPerM2','0.0001')}
                            ${asField('as_defaultAreaM2','مساحة العنبر الافتراضية (م²)','defaultAreaM2','1')}
                            ${asField('as_heatTempDiffMultiplier','معامل انحراف الحرارة','heatTempDiffMultiplier','0.01')}
                            ${asField('as_heatFactorWeek1','معامل الأسبوع 1','heatFactorWeek1','0.05')}
                            ${asField('as_heatFactorWeek2','معامل الأسبوع 2','heatFactorWeek2','0.05')}
                            ${asField('as_heatFactorWeek3','معامل الأسبوع 3','heatFactorWeek3','0.05')}
                            ${asField('as_heatFactorWeek4','معامل الأسبوع 4','heatFactorWeek4','0.05')}
                            ${asField('as_heatFactorAfter','معامل بعد الأسبوع 4','heatFactorAfter','0.05')}
                            ${asField('as_seasonFactorWinter','معامل الشتاء','seasonFactorWinter','0.05')}
                            ${asField('as_seasonFactorSpring','معامل الربيع','seasonFactorSpring','0.05')}
                            ${asField('as_seasonFactorSummer','معامل الصيف','seasonFactorSummer','0.05')}
                            ${asField('as_seasonFactorAutumn','معامل الخريف','seasonFactorAutumn','0.05')}
                        </div></details>

                        <details style="margin-top:10px;"><summary style="font-weight:800;color:var(--barn-dark);cursor:pointer;padding:6px 0;">🔔 حدود التنبيهات</summary>
                        <div class="form-grid" style="margin-top:8px;">
                            ${asField('as_vaccGraceDays','أيام السماح قبل "فاتك تحصين" (يوم)','vaccGraceDays','1')}
                            ${asField('as_vaccAdvanceDays','التنبيه المسبق بتحصين قادم (يوم)','vaccAdvanceDays','1')}
                            ${asField('as_treatGraceDays','أيام السماح قبل "فاتك معاملة" (يوم)','treatGraceDays','1')}
                            ${asField('as_targetAgeAdvanceDays','التنبيه المسبق بعمر البيع (يوم)','targetAgeAdvanceDays','1')}
                            ${asField('as_humidityDiffThreshold','حد انحراف الرطوبة المُنبِّه (%)','humidityDiffThreshold','1')}
                            ${asField('as_fcrCompareWindowDays','نافذة مقارنة FCR قبل البيع (يوم)','fcrCompareWindowDays','1')}
                            ${asField('as_mortCompareMinRate','أقل نسبة نفوق تاريخية للمقارنة (%)','mortCompareMinRate','0.1')}
                            ${asField('as_mortCompareHighMult','معامل اعتبار النفوق "مرتفع"','mortCompareHighMult','0.1')}
                            ${asField('as_mortCompareLowMult','معامل اعتبار النفوق "منخفض"','mortCompareLowMult','0.1')}
                        </div></details>

                        <details style="margin-top:10px;"><summary style="font-weight:800;color:var(--barn-dark);cursor:pointer;padding:6px 0;">🎯 ألوان تقييم الأداء</summary>
                        <div class="form-grid" style="margin-top:8px;">
                            ${asField('as_fcrGoodMax','حد FCR الأخضر (أقل من)','fcrGoodMax','0.05')}
                            ${asField('as_fcrOkMax','حد FCR الأصفر (أقل من)','fcrOkMax','0.05')}
                            ${asField('as_weightDiffGoodMin','أقل انحراف وزن مقبول (%)','weightDiffGoodMin','0.5')}
                        </div></details>

                        <details style="margin-top:10px;"><summary style="font-weight:800;color:var(--barn-dark);cursor:pointer;padding:6px 0;">📈 دراسة الجدوى وقيم عامة</summary>
                        <div class="form-grid" style="margin-top:8px;">
                            ${asField('as_restDaysBetweenCycles','أيام الراحة بين الدورات (يوم)','restDaysBetweenCycles','1')}
                            ${asField('as_defaultStartWeightG','وزن الكتكوت الافتراضي (جم)','defaultStartWeightG','1')}
                        </div></details>

                        <details style="margin-top:10px;"><summary style="font-weight:800;color:var(--barn-dark);cursor:pointer;padding:6px 0;">🌾 برنامج مراحل العلف الافتراضي (بادئ / نامي / ناهي)</summary>
                        <div class="form-grid" style="margin-top:8px;">
                            ${asField('as_feedStageStarterKg','إجمالي علف بادئ لكل طائر (كجم)','feedStageStarterKg','0.05')}
                            ${asField('as_feedStageGrowerKg','إجمالي علف نامي لكل طائر (كجم)','feedStageGrowerKg','0.05')}
                        </div>
                        <p style="font-size:11px;color:var(--muted);margin:8px 2px 0;line-height:1.6;">💡 دي القيم الافتراضية اللي بتتعبى تلقائيًا عند إنشاء أي دفعة جديدة. لتعديل برنامج مراحل العلف لدفعة نشطة حاليًا بعينها، روح لتبويب "🌾 الإنتاج" ← قسم العلف مباشرة. مرحلة "ناهي" = باقي الدورة تلقائيًا بعد استهلاك كمية البادئ والنامي دي بالكامل.</p></details>

                        <div class="row-actions" style="margin-top:12px;">
                            <button class="btn gold" style="flex:1;" onclick="saveAdvancedSettings()">💾 حفظ المعايير</button>
                        </div>
                        ${isCustom ? `<button class="btn danger block" style="margin-top:8px;" onclick="resetAdvancedSettings()">↩️ استرجاع كل القيم الافتراضية الأصلية</button>` : ''}
                    </div>
                </div>`;
        }

        function saveAdvancedSettings() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 3): إعدادات عامة (تدفئة/تنبيهات/أداء/جدوى) تخص كل المزرعة — owner فقط
            const next = {};
            Object.keys(DEFAULT_APP_SETTINGS).forEach(key => {
                const el = document.getElementById('as_' + key);
                if (!el) return;
                const v = parseFloat(el.value);
                next[key] = isNaN(v) ? DEFAULT_APP_SETTINGS[key] : v;
            });
            setState('appSettings', next);
            persist();
            logAudit(null, `⚙️ تعديل المعايير المتقدمة (تدفئة/تنبيهات/أداء/جدوى)`);
            render();
            showToast('✅ تم حفظ المعايير المتقدمة');
        }

        function resetAdvancedSettings() {
            showConfirm('سيتم استرجاع كل المعايير المتقدمة للقيم الافتراضية الأصلية. متابعة؟', () => {
                setState('appSettings', {});
                persist();
                logAudit(null, `↩️ استرجاع المعايير المتقدمة للقيم الافتراضية`);
                render();
                showToast('↩️ تم استرجاع القيم الافتراضية');
            }, 'استرجاع الافتراضي');
        }

        function interpAnchors(anchors, day) {
            if (day <= anchors[0][0]) return anchors[0][1];
            for (let i = 0; i < anchors.length - 1; i++) {
                const [d1, v1] = anchors[i],
                    [d2, v2] = anchors[i + 1];
                if (day >= d1 && day <= d2) return v1 + (v2 - v1) * ((day - d1) / (d2 - d1));
            }
            return anchors[anchors.length - 1][1];
        }

        // ==================== منحنى مرجعي خاص بالمزرعة (مزيج بيزي: معياري السلالة × أداء المزرعة الفعلي التاريخي) ====================
        // الفكرة: بدل ما كل انحراف/تنبؤ فى التطبيق (وزن/FCR عبر توقّع العلف) يتقارن بمنحنى Ross308/Cobb500 المعياري بس،
        // بعد ما تتراكم دورات مؤرشفة كفاية لنفس النوع، بنبني منحنى "خاص بمزرعتك" فعليًا من بياناتك المسجَّلة،
        // ونمزجه مع المعياري العالمي بوزن يكبر تدريجيًا كل ما زاد عدد الدورات المؤرشفة (انكماش بيزي/Empirical Bayes بسيط:
        // بدورة أو اتنين الوزن الأكبر للمعياري العالمي، وبعد عشرات الدورات المنحنى يبقى شبه معتمد على مزرعتك بالكامل).
        // هذا يعمل تلقائيًا من داخل getRefValue/getRefsForDay اللي مستخدَمة أصلًا فى كل حسابات الانحراف والتنبيهات والتنبؤ،
        // فمفيش أي مكان تانى فى الكود محتاج تعديل يدوي — كل تنبيه وتنبؤ موجود بيستفيد فورًا.
        // ملاحظة مهمة لتفادي أي حلقة حسابية: الدوال هنا بتقرأ b.records الخام مباشرة (وزن مُقاس فعليًا فقط + علف مُسجَّل فعليًا)
        // ولا تستدعي computeMetrics/getRefValue إطلاقًا، عشان منحنى المزرعة نفسه ميعتمدش على نتائج بتعتمد عليه.
        // الحد الأقصى لمعدل النفوق اليومي المُستخدَم فى كل توقعات المستقبل (وزن/FCR/ربح/يوم بيع).
        // ============ (تعديل) كان 0.02 (2%) بيقصّ أي فاشية حقيقية أعلى من كده ويخلي التوقعات متفائلة زيادة عن الواقع فى الأزمات — رُفع لـ 0.08 (8%) عشان يسمح بمرور إشارة فاشية حقيقية مع الاحتفاظ بسقف يمنع تطاير الأرقام من خطأ إدخال شاذ ============
        const MAX_PROJECTED_DAILY_MORT_RATE = 0.08;
        const FARM_CURVE_MIN_CYCLES = 2;   // أقل عدد دورات مؤرشفة مطلوب عشان نبدأ نستخدم منحنى المزرعة أصلًا
        const FARM_CURVE_SHRINKAGE_K = 6;  // ثابت الانكماش: عند n دورة، وزن منحنى المزرعة = n/(n+K) (عند n=6 الوزن 50%، عند n=18 الوزن 75%... إلخ)

        function _cycleRawWeightPoints(x) {
            const defW = AS().defaultStartWeightG;
            const pts = [{ age: 0, value: x.startweight || defW }];
            [...x.records].sort((a, c) => a.age - c.age).forEach(r => { if (r.weight != null) pts.push({ age: r.age, value: r.weight }); });
            return pts;
        }
        function _cycleRawFeedPerBirdPoints(x) {
            const recs = [...x.records].sort((a, c) => a.age - c.age);
            let cumMort = 0, cumCull = 0, cumFeedKg = 0;
            const pts = [{ age: 0, value: 0 }];
            recs.forEach(r => {
                cumMort += (r.mort || 0); cumCull += (r.cull || 0); cumFeedKg += (r.feed || 0);
                const liveCount = Math.max(x.startCount - cumMort - cumCull, 0);
                if (liveCount > 0) pts.push({ age: r.age, value: (cumFeedKg * 1000) / liveCount }); // جم/طائر تراكمي
            });
            return pts;
        }
        // استكمال خطي فقط داخل نطاق الدورة المسجَّل فعليًا — لا نستقرئ خارج آخر يوم مسجَّل حتى لا نفبرك بيانات لم تُقَس
        function _interpRawPoints(pts, day) {
            if (!pts.length) return null;
            if (day <= pts[0].age) return pts[0].value;
            if (day > pts[pts.length - 1].age) return null;
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i], p1 = pts[i + 1];
                if (day >= p0.age && day <= p1.age) return p1.age === p0.age ? p1.value : p0.value + (p1.value - p0.value) * ((day - p0.age) / (p1.age - p0.age));
            }
            return pts[pts.length - 1].value;
        }

        const _farmCurveCache = new Map(); // "species|key|excludeId" -> { fp, anchors, cycles, weightAtMaxAge }
        // بصمة خفيفة تلتقط أي تعديل فعلي فى قيم السجلات (مش بس تغيّر العدد) — بتستخدم نفس منطق بصمة كاش الدورات المؤرشفة أدناه
        function _farmCurveFingerprint(archived) {
            return archived.map(x => x.id + ':' + (typeof _cycleFingerprint === 'function' ? _cycleFingerprint(x) : x.records.length)).join(',');
        }
        // بيرجع { anchors, cycles } — anchors بنفس شكل [[يوم, قيمة], ...] القياسي فيشتغل مباشرة مع interpAnchors فى أي مكان تاني
        // ============ ترجيح الدورات الأرشيفية حسب تشابه الموسم مع الدورة الحالية — دورة صيفية مش لازم تتقارن بوزن دورة شتوية بنفس القوة ============
        function seasonGroupOf6(month) {
            if ([12, 1, 2].includes(month)) return 0; // شتاء
            if ([3, 4, 5].includes(month)) return 1;  // ربيع
            if ([6, 7, 8].includes(month)) return 2;  // صيف
            return 3; // خريف
        }
        function seasonSimilarityWeight(monthA, monthB) {
            if (monthA == null || monthB == null) return 1;
            const ga = seasonGroupOf6(monthA), gb = seasonGroupOf6(monthB);
            if (ga === gb) return 1.2; // نفس الموسم — وزن أعلى من المتوسط
            const diff = Math.min(Math.abs(ga - gb), 4 - Math.abs(ga - gb)); // دائرية: شتاء وخريف متجاورين
            return diff === 1 ? 0.7 : 0.4; // موسم مجاور / معاكس تمامًا
        }
        function getFarmBlendedCurve(speciesKey, key, excludeBatchId, standardAnchors, currentStartDate) {
            const currentMonth = currentStartDate ? (new Date(currentStartDate).getMonth() + 1) : null;
            const cacheKey = speciesKey + '|' + key + '|' + excludeBatchId + '|' + (currentMonth != null ? seasonGroupOf6(currentMonth) : 'x');
            const archived = state.batches.filter(x => x.species === speciesKey && x.status === 'مؤرشفة'
                && x.id !== excludeBatchId && x.records && x.records.length >= 3);
            const fp = _farmCurveFingerprint(archived);
            const cached = _farmCurveCache.get(cacheKey);
            if (cached && cached.fp === fp) return cached;
            let result;
            if (archived.length < FARM_CURVE_MIN_CYCLES) {
                result = { fp, anchors: standardAnchors, cycles: archived.length };
            } else {
                const cyclePointsFn = key === 'weight' ? _cycleRawWeightPoints : _cycleRawFeedPerBirdPoints;
                const cyclesPts = archived.map(cyclePointsFn);
                const cycleWeights = archived.map(x => seasonSimilarityWeight(currentMonth, x.startDate ? (new Date(x.startDate).getMonth() + 1) : null));
                const days = [...new Set(standardAnchors.map(a => a[0]))].sort((a, c) => a - c);
                const anchors = days.map(day => {
                    const std = interpAnchors(standardAnchors, day);
                    const pointsWithW = cyclesPts.map((pts, i) => ({ v: _interpRawPoints(pts, day), w: cycleWeights[i] })).filter(o => o.v != null && o.v > 0);
                    if (!pointsWithW.length) return [day, std];
                    const totalW = pointsWithW.reduce((s, o) => s + o.w, 0);
                    const farmMean = pointsWithW.reduce((s, o) => s + o.v * o.w, 0) / totalW;
                    const n = pointsWithW.length; // ثابت الانكماش مبني على عدد الدورات الفعلي مش مجموع الأوزان، عشان دورة موسم متطابق لوحدها منتضخّمش ثقتها زي 2 دورة
                    const w = n / (n + FARM_CURVE_SHRINKAGE_K);
                    return [day, w * farmMean + (1 - w) * std];
                });
                result = { fp, anchors, cycles: archived.length };
            }
            _farmCurveCache.set(cacheKey, result);
            return result;
        }
        // نسبة اعتماد التطبيق حاليًا على بيانات مزرعتك الفعلية بدل المعياري العالمي (0% مع دورة واحدة، تقترب من 100% مع تراكم عشرات الدورات)
        function getFarmCurveConfidence(speciesKey, excludeBatchId) {
            const archived = state.batches.filter(x => x.species === speciesKey && x.status === 'مؤرشفة'
                && x.id !== excludeBatchId && x.records && x.records.length >= 3);
            const n = archived.length;
            if (n < FARM_CURVE_MIN_CYCLES) return { cycles: n, weightPct: 0, active: false };
            return { cycles: n, weightPct: (n / (n + FARM_CURVE_SHRINKAGE_K)) * 100, active: true };
        }

        function getRefValue(b, key, day) {
            const data = getSpeciesData(b.species, b.breed);
            if (!data[key]) return null;
            // الوزن والعلف بس هما اللي عندهم مقابل تاريخي حقيقي فى دوراتك (أداء) يستحق المزج معه؛
            // القيم البيئية (حرارة/رطوبة/أمونيا...) تفضل معيارية بحتة لأنها "هدف" مش "أداء سابق" يُقاس عليه
            if (key === 'weight' || key === 'feed') {
                const farm = getFarmBlendedCurve(b.species, key, b.id, data[key], b.startDate);
                return interpAnchors(farm.anchors, day);
            }
            return interpAnchors(data[key], day);
        }

        // ============ الإجهاد البيئي المُركّب لسجل واحد (مشتركة بين التحليلات والتنبيهات) ============
        function computeEnvStressForRecord(b, r, tempAvgIn, humidityAvgIn, nh3AvgIn) {
            const tempAvg = tempAvgIn !== undefined ? tempAvgIn : avgOf(r.tempDay, r.tempNight);
            const humidityAvg = humidityAvgIn !== undefined ? humidityAvgIn : avgOf(r.humidityDay, r.humidityNight);
            const nh3Avg = nh3AvgIn !== undefined ? nh3AvgIn : avgOf(r.nh3Day, r.nh3Night);
            if (tempAvg == null && humidityAvg == null && nh3Avg == null) return null;
            const refs = getRefsForDay(b, r.age);
            let stress = 0; const parts = [];
            if (tempAvg != null && refs.temp) {
                const d = tempAvg - refs.temp;
                if (d > 0) { const humFactor = 1 + (Math.max(0, (humidityAvg != null ? humidityAvg : refs.humidity) - 50) / 200); const v = d * humFactor * 2; stress += v; if (v > 1) parts.push('حرارة'); }
            }
            if (humidityAvg != null && refs.humidity) {
                const d = humidityAvg - refs.humidity;
                if (d > 0) { const v = d * 0.6; stress += v; if (v > 1) parts.push('رطوبة'); }
            }
            if (nh3Avg != null && refs.nh3) {
                const d = nh3Avg - refs.nh3;
                if (d > 0) { const v = d * 1.5; stress += v; if (v > 1) parts.push('أمونيا'); }
            }
            return { stress, parts };
        }

        // ============ تجانس القطيع (Uniformity/CV%) من عيّنة أوزان فردية ============
        function computeUniformity(sample) {
            if (!Array.isArray(sample) || sample.length < 3) return null;
            const n = sample.length;
            const mean = sample.reduce((s, v) => s + v, 0) / n;
            if (mean <= 0) return null;
            const variance = sample.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
            const sd = Math.sqrt(variance);
            const cv = (sd / mean) * 100; // معامل الاختلاف % — كل ما قلّ كل ما القطيع متجانس أكتر
            const within10 = sample.filter(v => Math.abs(v - mean) <= mean * 0.1).length;
            const pctWithin10 = (within10 / n) * 100; // % الطيور فى نطاق ±10% من المتوسط (المعيار الصناعي الشائع)
            return { n, mean, sd, cv, pctWithin10 };
        }
        function getLatestUniformity(b) {
            const withSample = [...(b.records || [])].filter(r => Array.isArray(r.weightSample) && r.weightSample.length >= 3).sort((a, c) => c.age - a.age);
            if (!withSample.length) return null;
            const r = withSample[0];
            const u = computeUniformity(r.weightSample);
            return u ? { ...u, age: r.age, date: r.date } : null;
        }

        function getRefsForDay(b, day) {
            const data = getSpeciesData(b.species);
            // العلف في الكتالوج تراكمي (جم/طائر) — نحسب اليومي بطرح قيمة اليوم السابق (getRefValue بيرجع القيمة الممزوجة مع منحنى مزرعتك تلقائيًا)
            const feedCumToday = getRefValue(b, 'feed', day) || 0;
            const feedCumYesterday = day > 0 ? (getRefValue(b, 'feed', day - 1) || 0) : 0;
            const feedDailyPerBird = Math.max(feedCumToday - feedCumYesterday, 0); // جم/طائر/يوم
            const waterDailyPerBird = feedDailyPerBird * data.waterFeedRatio; // مل/طائر/يوم
            return {
                weight: getRefValue(b, 'weight', day),
                feed: feedDailyPerBird,
                water: waterDailyPerBird,
                temp: interpAnchors(data.temp, day),
                humidity: interpAnchors(data.humidity, day),
                airspeed: interpAnchors(data.airspeed, day),
                co2: interpAnchors(data.co2, day),
                nh3: interpAnchors(data.nh3, day),
                o2: interpAnchors(data.o2, day)
            };
        }


        // ============ بروتوكول توصيات التهوية اليومي — يجمع كل العوامل المرتبطة (العمر/الفصل/نوع النظام/المساحة/الكثافة/القراءات الفعلية مقابل المعيار/الطقس) ============
        function seasonLabelOf(month) {
            if ([12,1,2].includes(month)) return 'شتاء';
            if ([6,7,8].includes(month)) return 'صيف';
            if ([3,4,5].includes(month)) return 'ربيع';
            return 'خريف';
        }
        // الحد الأدنى القياسي للتهوية (تجديد الهواء/التحكم فى الرطوبة، أجواء باردة إلى معتدلة) بوحدة قدم³/دقيقة لكل طائر، حسب أسبوع العمر (١-٨) — مصدر: إرشادات جامعة Mississippi State Extension.
        const MIN_VENT_CFM_PER_BIRD_BY_WEEK = [0.10, 0.25, 0.35, 0.50, 0.65, 0.70, 0.80, 0.90];
        const CFM_TO_M3H = 1.699; // 1 قدم³/دقيقة = 1.699 م³/ساعة
        const STANDARD_FAN_M3H = 17000; // مروحة قياسية 36 بوصة، سعة تقريبية 10,000 قدم³/دقيقة
        // ============ 💧 جدولة سقاية الماء بفترات اليوم (Water Period Scheduling) ============
        // الفكرة: بدل إضافة ماء واحدة تغطي الـ24 ساعة، اليوم بينقسم لعدد فترات يحدده المربي (2/3/4/6...)
        // بعدد ساعات متساوٍ لكل فترة، وكل فترة ليها إضافة/جرعة مستقلة تمامًا عن باقي الفترات. الجدول
        // نفسه ممكن يتغيّر مع تقدّم عمر الدفعة (مثلاً يبدأ بـ3 فترات فى الأسبوع الأول ويبقى 4 بعد كده)
        // — بنفس فكرة b.feedTransitions (نسخ متعددة، كل واحدة ليها startAge، وبنستخدم الأحدث اللي
        // startAge بتاعها ≤ عمر النهاردة).
        function computeEqualPeriods(periodCount) {
            const n = Math.max(1, Math.min(24, Math.round(periodCount || 1)));
            const base = Math.floor(24 / n);
            const remainder = 24 - base * n; // لو 24 مش قابلة للقسمة بالظبط (مثلاً 5 فترات = 4,5,5,5,5)، نوزّع الساعة الزيادة على أول فترات
            const periods = [];
            let cursor = 0;
            for (let i = 0; i < n; i++) {
                const hours = base + (i < remainder ? 1 : 0);
                periods.push({ startHour: cursor, endHour: cursor + hours, hours });
                cursor += hours;
            }
            return periods;
        }
        function formatHourRange(startHour, endHour) {
            const fmt12 = h => { const hh = ((h % 24) + 24) % 24; const period = hh < 12 ? 'ص' : 'م'; const h12 = hh % 12 === 0 ? 12 : hh % 12; return `${h12.toLocaleString('ar-EG')}:٠٠ ${period}`; };
            return endHour >= 24 ? `${fmt12(startHour)} - ١٢:٠٠ ص` : `${fmt12(startHour)} - ${fmt12(endHour)}`;
        }
        // الجدول النشط النهارده = آخر نسخة startAge بتاعها ≤ العمر الحالي (زي منطق getRefsForDay/feedTransitions تمامًا)
        function getActiveWaterSchedule(b, age) {
            const schedules = (b.waterSchedules || []).filter(s => s.startAge <= age);
            if (!schedules.length) return null;
            return schedules.reduce((best, s) => (s.startAge > best.startAge ? s : best));
        }

        function computeMinVentTarget(age, liveCount) {
            if (!(liveCount > 0)) return null;
            const weekIdx = Math.min(8, Math.max(1, Math.ceil(age / 7))) - 1;
            const cfmPerBird = MIN_VENT_CFM_PER_BIRD_BY_WEEK[weekIdx];
            const totalCfm = cfmPerBird * liveCount;
            const totalM3h = totalCfm * CFM_TO_M3H;
            const fanEquivalent = totalM3h / STANDARD_FAN_M3H;
            return { cfmPerBird, totalCfm, totalM3h, fanEquivalent };
        }
        // معدل التهوية الانتقالية الموصى به وقت الحر (م³/دقيقة لكل م² من مساحة أرضية العنبر) — مصدر: دليل Cobb لإدارة التهوية النفقية/الانتقالية.
        const HOT_VENT_M3MIN_PER_M2_LOW = 1.2;
        const HOT_VENT_M3MIN_PER_M2_HIGH = 1.8;
        // نسبة تشغيل التهوية الليلية (% من كل دورة 5 دقائق) حسب مرحلة العمر والموسم — نقطة انطلاق عملية للتايمر/الضبط اليدوي، تُستخدم فى بروتوكول اليوم وفى الكارت المرجعي معًا (مصدر واحد لتفادي التعارض)
        const NIGHT_VENT_DUTY_TABLE = [
            { maxAge: 7,        stageLabel: '١-٧ أيام',   winter: [10,15], mild: [15,20], summer: [20,25] },
            { maxAge: 14,       stageLabel: '٨-١٤ يوم',   winter: [15,20], mild: [20,30], summer: [30,40] },
            { maxAge: 21,       stageLabel: '١٥-٢١ يوم',  winter: [20,30], mild: [30,40], summer: [40,55] },
            { maxAge: 28,       stageLabel: '٢٢-٢٨ يوم',  winter: [30,40], mild: [40,55], summer: [55,75] },
            { maxAge: 35,       stageLabel: '٢٩-٣٥ يوم',  winter: [35,50], mild: [55,70], summer: [75,100] },
            { maxAge: Infinity, stageLabel: '٣٦+ يوم',    winter: [45,60], mild: [70,90], summer: [100,100] },
        ];
        function getNightVentDutyRow(age, season) {
            const row = NIGHT_VENT_DUTY_TABLE.find(r => age <= r.maxAge) || NIGHT_VENT_DUTY_TABLE[NIGHT_VENT_DUTY_TABLE.length - 1];
            const key = season === 'شتاء' ? 'winter' : season === 'صيف' ? 'summer' : 'mild';
            return { low: row[key][0], high: row[key][1], stageLabel: row.stageLabel };
        }
        function computeVentilationPlan(b, m) {
            if (!b) return [];
            const age = m.todayAge;
            const refs = getRefsForDay(b, age);
            const month = b.startmonth || (new Date().getMonth() + 1);
            const season = seasonLabelOf(month);
            const ventType = b.ventType || 'natural';
            const ventLabel = { natural: 'الطبيعي (فتحات جانبية)', tunnel: 'النفقي (مراوح وبادات)', mixed: 'المختلط' }[ventType];
            const floorType = b.floorType || 'litter';
            const floorInfo = getFloorInfo(b);
            const fanCapacity = b.fanCapacityM3h || 0;
            const fanCount = b.fanCount || 0;
            const totalFanCapacity = fanCapacity * fanCount; // إجمالي قدرة الشفاطات المُركَّبة فعليًا عند المربي (م³/ساعة)
            const items = []; // { level: 'info'|'warn'|'danger', text }
            const lastEnv = m.lastEnv || {}; // ⬆️ نُقلت لأعلى الدالة (كانت فى قسم 3) عشان نقدر نربط بيها توصية الليل فى قسم 1ب كمان — نفس القيمة، بلا تكرار حساب

            // ===== 0) الرقم المستهدف: الحد الأدنى الفعلي المطلوب من تجديد الهواء لعدد الطيور والعمر الحاليين =====
            const target = computeMinVentTarget(age, m.liveCount);
            if (target) {
                if (totalFanCapacity > 0) {
                    // عندنا قدرة شفاطات فعلية مُدخَلة — نحسب نسبة التشغيل المطلوبة أو النقص الفعلي بالأرقام
                    const dutyPct = (target.totalM3h / totalFanCapacity) * 100;
                    if (dutyPct > 100) {
                        const deficit = target.totalM3h - totalFanCapacity;
                        items.push({ level: 'danger', text: `🎯 قدرة شفاطاتك الحالية (${fanCount} شفاط × ${fmt(fanCapacity,0)} = <b>${fmt(totalFanCapacity,0)} م³/ساعة</b>) أقل من الحد الأدنى المطلوب الآن (${fmt(m.liveCount,0)} طائر، عمر ${age} يوم): <b>~${fmt(target.totalM3h,0)} م³/ساعة</b> — نقص حوالي ${fmt(deficit,0)} م³/ساعة. فكّر فى إضافة شفاط إضافي بقدرة مماثلة أو تشغيل الموجود بأقصى سرعة باستمرار.` });
                    } else {
                        const runMinutesPer5 = (dutyPct / 100) * 5;
                        items.push({ level: 'info', text: `🎯 قدرة شفاطاتك الحالية (${fanCount} شفاط × ${fmt(fanCapacity,0)} = <b>${fmt(totalFanCapacity,0)} م³/ساعة</b>) تكفي الحد الأدنى المطلوب الآن (~${fmt(target.totalM3h,0)} م³/ساعة لـ ${fmt(m.liveCount,0)} طائر، عمر ${age} يوم) — شغّلها بدورة تشغيل حوالي <b>${fmt(dutyPct,0)}%</b> من الوقت (مثلاً ${fmt(runMinutesPer5,1)} دقيقة تشغيل من كل 5 دقائق) بدل التشغيل المستمر.` });
                    }
                } else {
                    const fanPct = Math.min(100, target.fanEquivalent * 100);
                    const fanTxt = target.fanEquivalent >= 1
                        ? `ما يعادل ${fmt(target.fanEquivalent,1)} مروحة قياسية 36 بوصة (سعة ~17,000 م³/س لكل مروحة) تعمل باستمرار`
                        : `ما يعادل تشغيل مروحة قياسية 36 بوصة (سعة ~17,000 م³/س) لمدة ${fmt(fanPct,0)}% من الوقت (مثلاً ${fmt(fanPct*3/100,1)} دقيقة تشغيل من كل 5 دقائق)`;
                    items.push({ level: 'info', text: `🎯 الحد الأدنى المطلوب لتجديد الهواء الآن (${fmt(m.liveCount,0)} طائر، عمر ${age} يوم): <b>~${fmt(target.totalM3h,0)} م³/ساعة</b> — ${ventType==='natural'?`بنظامك الطبيعي، افتح الفتحات الجانبية تدريجيًا واستخدم سرعة الهواء المقاسة كمؤشر لتقريب هذا المعدل`:fanTxt}${ventType!=='natural'?' (أدخل قدرة/عدد الشفاطات فى بيانات الدفعة عشان نحسب لك دورة التشغيل بالظبط)':''}. هذا حد أدنى للرطوبة وجودة الهواء فقط — وقت الحر يُحتاج معدل أعلى بكثير للتبريد.` });
                }
            }

            // ===== 0ب) معدل التهوية الانتقالية الموصى به وقت الحر — محسوب من مساحة العنبر فعليًا =====
            if (b.area > 0 && (season === 'صيف' || age > 21)) {
                const hotLow = b.area * HOT_VENT_M3MIN_PER_M2_LOW * 60;
                const hotHigh = b.area * HOT_VENT_M3MIN_PER_M2_HIGH * 60;
                if (totalFanCapacity > 0) {
                    if (totalFanCapacity < hotLow) {
                        items.push({ level: season === 'صيف' ? 'danger' : 'warn', text: `☀️ لتهوية كافية وقت الحر لمساحة عنبرك (${fmt(b.area,0)} م²): المطلوب بين <b>${fmt(hotLow,0)}-${fmt(hotHigh,0)} م³/ساعة</b>، وقدرتك الحالية ${fmt(totalFanCapacity,0)} م³/ساعة أقل من ذلك بوضوح — فكّر جديًا فى زيادة عدد/سعة الشفاطات قبل ذروة الصيف.` });
                    } else {
                        items.push({ level: 'info', text: `☀️ قدرة شفاطاتك الحالية (${fmt(totalFanCapacity,0)} م³/ساعة) تغطي المعدل الانتقالي الموصى به وقت الحر لمساحة عنبرك (${fmt(hotLow,0)}-${fmt(hotHigh,0)} م³/ساعة) — حافظ على صيانتها الدورية (نظافة الشفرات والستائر) لضمان الأداء الفعلي.` });
                    }
                } else if (ventType === 'natural') {
                    items.push({ level: 'info', text: `☀️ مرجع استرشادي لمساحة عنبرك (${fmt(b.area,0)} م²) وقت الحر: هدف تهوية انتقالي حوالي <b>${fmt(hotLow,0)}-${fmt(hotHigh,0)} م³/ساعة</b> — بنظامك الطبيعي هذا يعني فتح الفتحات الجانبية بالكامل مع الاستعانة بمراوح مساعدة لو استمرت درجة الحرارة أعلى من المعياري رغم الفتح الكامل.` });
                }
            }

            // ===== 1) توصية المرحلة العمرية الأساسية =====
            if (age <= 7) {
                items.push({ level: 'info', text: `🐣 المرحلة الأولى (١-٧ أيام): تهوية دنيا فقط لتجديد الهواء دون سحب حرارة الفرخة — أبقِ الفتحات الجانبية شبه مغلقة وشغّل التهوية على فترات قصيرة متقطعة بدل التشغيل المستمر، مع تجنّب أي تيار هواء مباشر على مستوى الفرشة.` });
            } else if (age <= 21) {
                items.push({ level: 'info', text: `📈 المرحلة الثانية (٨-٢١ يوم): زد معدل التهوية تدريجيًا مع نمو الطائر — افتح الفتحات الجانبية أكثر تباعًا لحرارة العنبر، بهدف الوصول لسرعة هواء قريبة من ${refs.airspeed?fmt(refs.airspeed,1):'المعيار'} م/ث.` });
            } else {
                if (ventType === 'tunnel') {
                    items.push({ level: 'info', text: `🌀 المرحلة الثالثة (٢٢+ يوم) — نظام نفقي: فعّل التشغيل التدريجي للمراوح (Staged Fans) وارفع عدد المراوح العاملة كلما زادت الكتلة الحيوية، مع تشغيل البادات وقت الذروة الحرارية.` });
                } else if (season === 'صيف') {
                    items.push({ level: 'warn', text: `☀️ المرحلة الثالثة صيفًا بنظام ${ventLabel}: خطر إجهاد حراري مرتفع فى هذا العمر — فكّر فى تركيب مراوح مساعدة أو التحويل لتهوية نفقية جزئية، وافتح الفتحات الجانبية بالكامل مع تظليل السقف لو ممكن.` });
                } else if (season === 'شتاء') {
                    items.push({ level: 'info', text: `❄️ المرحلة الثالثة شتاءً بنظام ${ventLabel}: حافظ على تهوية انتقالية متوازنة — لا تُغلق الفتحات كليًا رغم البرودة لتفادي تراكم الرطوبة والأمونيا، وزد الفتح تدريجيًا صباحًا.` });
                } else {
                    items.push({ level: 'info', text: `🍂 المرحلة الثالثة (${season}) بنظام ${ventLabel}: تهوية انتقالية متوازنة، راقب القراءات يوميًا واضبط الفتحات حسب حرارة الظهيرة.` });
                }
            }

            // ===== 1ب) توصية تايمر التهوية الليلية الليلة — ديناميكية حسب العمر والموسم الحاليين بالظبط (بدل جدول ثابت لازم تدوّر عليه) =====
            {
                const nd = getNightVentDutyRow(age, season);
                // ✨ تحسين: لو عندنا قراءة أمونيا فعلية حديثة، نربطها بالنسبة الموصى بها بدل ما تفضل رقم من جدول ثابت بس —
                // لو الأمونيا لسه مرتفعة رغم إنك ماشي على أعلى حد فى الجدول، ده معناه المشكلة مش فى نسبة التشغيل نفسها
                // (مساحة الفتحات/عدد الشفاطات غير كافية)، فنوجّهك للحاسبة التفصيلية بدل ما نقولك "زوّد" فى فراغ.
                const nh3Now = avgOf(lastEnv.nh3Day, lastEnv.nh3Night) ?? lastEnv.nh3;
                let dutyLow = nd.low, dutyHigh = nd.high, tuneNote = '';
                if (nh3Now != null && nh3Now >= 20) {
                    if (nd.high >= 95) {
                        tuneNote = ` ⚠️ ملحوظة: أنت أصلًا قريب من أقصى نسبة تشغيل فى الجدول والأمونيا لسه مرتفعة (${fmt(nh3Now,0)} ppm) — المشكلة على الأغلب مش فى نسبة التشغيل، افحص مساحة فتحات الدخول وعدد/قدرة الشفاطات فعليًا (راجع الحاسبة التفصيلية تحت).`;
                    } else {
                        dutyLow = Math.min(100, nd.low + 10);
                        dutyHigh = Math.min(100, nd.high + 15);
                        tuneNote = ` ⬆️ آخر قراءة أمونيا عندك (${fmt(nh3Now,0)} ppm) أعلى من المعدل المثالي (أقل من 20 ppm)، فرفعنا لك النسبة المقترحة أعلى من الجدول القياسي — راقب الأمونيا تاني بعد يوم-يومين من الضبط الجديد.`;
                    }
                }
                const runLow = fmt(dutyLow * 5 / 100, 1), runHigh = fmt(dutyHigh * 5 / 100, 1);
                items.push({ level: (nh3Now != null && nh3Now >= 20) ? 'warn' : 'info', text: `🌙 توصية الليلة (عمر ${age} يوم، ${nd.stageLabel}، موسم ${season}): شغّل التهوية بنسبة تشغيل تقريبية <b>${dutyLow}-${dutyHigh}%</b> من الوقت — يعني تقريبًا ${runLow}-${runHigh} دقيقة تشغيل من كل 5 دقائق.${tuneNote || ' اضبطها لأعلى أو لأقل حسب قراءات الأمونيا/الرطوبة الفعلية المسجّلة عندك.'}` });
            }

            // ===== 1ج) تنبيه بداية مرحلة عمرية جديدة — نقطة تحوّل تحتاج ضبط فوري بدل الاستمرار على إعدادات المرحلة السابقة =====
            if ([1, 8, 15, 22, 29, 36].includes(age)) {
                items.push({ level: 'warn', text: `🔔 اليوم بداية مرحلة عمرية جديدة (${age} يوم) — راجع واضبط معدل ونسبة تشغيل التهوية (نهارًا وليلاً) والفتحات الجانبية على المعدل الجديد الآن، بدل ما تفضل شغّال بإعدادات المرحلة اللي فاتت.` });
            }

            // ===== 1د) تذكيرات دورية للفحص الميداني — تظهر تلقائيًا فى موعدها بدل ما تكون مرجع ثابت لازم تفتحه بنفسك =====
            if (age > 0 && age % 7 === 0) {
                items.push({ level: 'info', text: `🌫️ اليوم موعد فحص توزيع الأمونيا فى 4-5 نقاط (الزوايا البعيدة + منتصف العنبر + قرب الخروج) عند مستوى أنف الطائر — قارن بين النقاط لرصد أي مناطق ميتة (Dead spots) محتاجة توزيع تهوية أفضل.` });
            }
            if (age > 0 && age % 14 === 0) {
                const pressureNote = ventType !== 'natural' ? ' وموعد قياس الضغط الساكن بالمانومتر عند أبعد نقطة عن الشفاطات (المعدل الشائع 0.05-0.15 بوصة ماء)' : '';
                items.push({ level: 'info', text: `🕯️ اليوم موعد اختبار الشمعة/الدخان لفحص انسياب الهواء من فتحات الدخول لكل الأركان بانتظام${pressureNote}.` });
            }

            // ===== 2) الكثافة (كجم حيوي/م²) =====
            if (b.area > 0 && m.density > 0) {
                let maxDensity = ventType === 'tunnel' ? 35 : ventType === 'mixed' ? 30 : 26;
                if (floorType === 'slat') maxDensity += 2; // تصريف أفضل للزرق يسمح عادة بكثافة أعلى قليلاً من الفرشة التقليدية
                const densityNote = floorType === 'cage' ? ` (محسوبة على أساس ${b.cageTiers || 1} دور × مساحة العنبر)` : '';
                if (m.density >= maxDensity) {
                    items.push({ level: 'danger', text: `⚖️ الكثافة الحالية ${fmt(m.density,1)} كجم/م²${densityNote} وصلت أو تجاوزت الحد الأقصى الموصى به لنظام ${ventLabel} (${floorInfo.label}) (~${maxDensity} كجم/م²) — زد معدل التهوية فورًا أو فكّر فى تخفيف الكثافة.` });
                } else if (m.density >= maxDensity * 0.85) {
                    items.push({ level: 'warn', text: `⚖️ الكثافة الحالية ${fmt(m.density,1)} كجم/م²${densityNote} تقترب من الحد الأقصى لنظام ${ventLabel} (${floorInfo.label}) (~${maxDensity} كجم/م²) — راقب التهوية عن قرب فى الأيام القادمة مع زيادة الوزن.` });
                }
                if (floorType === 'cage') {
                    items.push({ level: 'info', text: `🔲 هذا متوسط عام على مستوى كل الأدوار — تأكد كمان إن التوزيع بين الأقفاص متساوٍ، لأن الدور السفلي أو الأقفاص المزدحمة ممكن تتجاوز الحد الآمن حتى لو المتوسط سليم.` });
                }
            }

            // ===== 3) القراءات الفعلية الأخيرة مقابل المعيار =====
            const actualAirspeed = avgOf(lastEnv.airspeedDay, lastEnv.airspeedNight) ?? lastEnv.airspeed;
            if (actualAirspeed != null && refs.airspeed) {
                if (actualAirspeed < refs.airspeed * 0.7) {
                    items.push({ level: 'warn', text: `💨 آخر سرعة هواء مسجّلة (${fmt(actualAirspeed,1)} م/ث) أقل من المعيار لعمر ${age} يوم (${fmt(refs.airspeed,1)} م/ث) — زد عدد/سرعة المراوح أو اتساع الفتحات.` });
                } else if (age <= 14 && actualAirspeed > refs.airspeed * 1.6) {
                    items.push({ level: 'warn', text: `💨 آخر سرعة هواء مسجّلة (${fmt(actualAirspeed,1)} م/ث) أعلى من اللازم فى هذا العمر الصغير — قد تسبب تيارات باردة مباشرة على الكتاكيت، قلّل معدل التهوية أو غيّر اتجاه الفتحات بعيدًا عن مستوى الفرشة.` });
                }
            }
            const actualCo2 = avgOf(lastEnv.co2Day, lastEnv.co2Night) ?? lastEnv.co2;
            if (actualCo2 != null && actualCo2 >= 3000) {
                items.push({ level: 'danger', text: `🌫️ ثاني أكسيد الكربون مرتفع جدًا (${fmt(actualCo2,0)} ppm) — زد التهوية فورًا، المعدل الآمن أقل من 3000 ppm.` });
            }
            const actualNh3 = avgOf(lastEnv.nh3Day, lastEnv.nh3Night) ?? lastEnv.nh3;
            if (actualNh3 != null && actualNh3 >= 20) {
                const nh3Advice = floorType === 'cage' ? 'راجع انتظام إزالة الزرق وتهوية أسفل الأقفاص'
                    : floorType === 'slat' ? 'راجع تجمّع الزرق أسفل الأرضية الشبكية وتهوية الحيز السفلي'
                    : 'راجع رطوبة الفرشة';
                items.push({ level: actualNh3 >= 25 ? 'danger' : 'warn', text: `🌫️ الأمونيا مرتفعة (${fmt(actualNh3,0)} ppm) — زد معدل التهوية و${nh3Advice}، المعدل المثالي أقل من 20 ppm.` });
            }

            // ===== 4) الطقس المتوقع (لو مفعّل تحديد الموقع) — تنبيه استباقي =====
            if (state.farmLocation && weatherResult && !weatherResult.error) {
                if (weatherResult.tempMax != null && refs.temp != null && weatherResult.tempMax - refs.temp >= 6 && ventType !== 'tunnel') {
                    items.push({ level: 'warn', text: `🌡️ الطقس المتوقع اليوم (${fmt(weatherResult.tempMax,1)}°م) أعلى من معيار العمر بفارق كبير، ونظامك الحالي ${ventLabel} — جهّز مراوح/بادات مساعدة استباقيًا قبل ذروة الحرارة.` });
                }
            }

            return items;
        }

        // ==================== State & Storage ====================
        // ============ الحالة الظاهرية اليومية (فحص سريري بصري) — مجموعات الأعراض المعروضة فى فورم السجل اليومي ============
        // كل مجموعة عبارة عن جهاز/نظام جسدي، وكل عرض جواها ليه كود ثابت بيُستخدم فى الحفظ وفى مطابقة قاعدة معرفة الأمراض
        // (CLINICAL_DISEASE_KB تحت). ترتيب الأعراض هنا هو نفس ترتيب ظهورها فى الفورم.
        const CLINICAL_SIGN_GROUPS = [
            { key: 'respiratory', label: '🫁 الجهاز التنفسي', signs: [
                { code: 'cough_sneeze', label: 'سعال / عطس' },
                { code: 'rales', label: 'صوت تنفس (حشرجة/خرخرة)' },
                { code: 'discharge', label: 'رشح من العين أو الأنف' },
                { code: 'gasping', label: 'فتح الفم للتنفس (لهث)' },
            ]},
            { key: 'digestive', label: '💩 الزرق والجهاز الهضمي', signs: [
                { code: 'watery_droppings', label: 'إسهال مائي' },
                { code: 'bloody_droppings', label: 'زرق دموي' },
                { code: 'abnormal_droppings', label: 'زرق أخضر/أصفر غير طبيعي' },
                { code: 'undigested_feed', label: 'زرق غير مهضوم (حبوب علف ظاهرة)' },
            ]},
            { key: 'mobility', label: '🦵 الحركة والأرجل', signs: [
                { code: 'lameness', label: 'عرج واضح' },
                { code: 'imbalance', label: 'عدم اتزان عند المشي' },
                { code: 'joint_swelling', label: 'تورم فى مفاصل الأرجل' },
                { code: 'sitting_hocks', label: 'جلوس الطيور على عرقوبها' },
            ]},
            { key: 'neuro', label: '🧠 أعراض عصبية', signs: [
                { code: 'torticollis', label: 'التواء الرقبة (للخلف أو الجانب)' },
                { code: 'circling', label: 'دوران فى دوائر' },
                { code: 'tremors', label: 'ارتعاش أو تشنجات' },
            ]},
            { key: 'behavior', label: '🐔 السلوك العام', signs: [
                { code: 'lethargy_huddling', label: 'خمول وتجمّع الطيور فى ركن' },
                { code: 'feed_water_drop', label: 'انخفاض واضح فى الإقبال على العلف/الماء' },
                { code: 'chick_piling', label: 'تكوّم الكتاكيت فوق بعض' },
                { code: 'isolation', label: 'انزواء طيور مصابة عن باقي القطيع' },
            ]},
            { key: 'skin', label: '🪶 الريش والجلد', signs: [
                { code: 'feather_loss', label: 'تقشف/تساقط ريش غير طبيعي للعمر' },
                { code: 'pecking_wounds', label: 'جروح أو نقر متبادل' },
            ]},
        ];
        const CLINICAL_AFFECTED_PCT_LABELS = { none: 'لا شيء ملحوظ', low: 'محدودة (أقل من 5%)', medium: 'متوسطة (5–15%)', high: 'منتشرة (أكثر من 15%)' };
        // ثابت انكماش الذاكرة المرضية الشخصية (نفس فكرة FARM_CURVE_SHRINKAGE_K المستخدم لمنحنى نمو المزرعة، بس K أصغر
        // عمدًا: K=4 بدل 6 — حالات صحية مؤكدة بتشخيص فعلي نادرة نسبيًا مقارنة بسجلات وزن يومية، فمش منطقي ننتظر
        // نفس عدد العينات قبل ما نسمح لخبرة المزرعة تأثر. عند n حالة مؤكدة، وزن الذاكرة الشخصية = n/(n+K) (عند n=4 الوزن 50%)
        const DISEASE_MEMORY_SHRINKAGE_K = 4;

        // ============ قاعدة معرفة استدلالية عامة (مرجع بيطري عام لدواجن التسمين فى مصر) — مش تشخيص نهائي ============
        // كل بند: نطاق عمري تقريبي بيظهر فيه المرض غالبًا + أعراض "أساسية" (وزنها أعلى فى المطابقة) وأعراض "مساندة"،
        // وتوصية عملية أولى. الهدف تنبيه مبكر واسترشادي فقط — التشخيص المؤكد دايمًا محتاج طبيب بيطري ميداني/تحليل معملي.
        // ============ قاعدة معرفة الأمراض الافتراضية (نقطة انطلاق فقط) — تتحوّل لقائمة قابلة للتعديل الكامل
        // من المستخدم (state.diseaseKB) عند أول تحميل. أي تعديل هنا بعد كده مالوش تأثير على تطبيقات مثبّتة
        // بالفعل — التعديل الفعلي بيبقى من شاشة "دليل الأمراض" فى التطبيق نفسه. ============
        // symptomsText/diffText: وصف حر يظهر فى شاشة تصفح الدليل. requiredSigns/supportingSigns: أكواد من
        // CLINICAL_SIGN_GROUPS تُستخدم فى المطابقة الاستباقية مع السجل اليومي — ممكن تُترك فاضية لمرض مالوش
        // توقيع أعراض واضح يتفحص بصريًا (زي التسمم بالأفلاتوكسين)، ووقتها بيفضل للتصفح والمرجعية بس.
        // ============ أدوار جهات الاتصال — قابلة للتعديل الكامل من المستخدم (state.contactRoles)، نفس نمط دليل الأمراض ============
        function getDefaultContactRoles() {
            return [
                { id: 'role_supplier', label: 'مورد', icon: '🚚' },
                { id: 'role_vet', label: 'طبيب بيطري', icon: '💉' },
                { id: 'role_tech', label: 'فني صيانة', icon: '🔧' },
                { id: 'role_worker', label: 'عامل', icon: '👷' },
                { id: 'role_other', label: 'أخرى', icon: '📇' },
            ];
        }
        function getDefaultDiseaseKB() {
            return [
                { id: 'dz_cocci', name: 'كوكسيديا الأعور (Coccidiosis)', ageMin: 14, ageMax: 35,
                    requiredSigns: ['bloody_droppings'], supportingSigns: ['lethargy_huddling', 'feed_water_drop', 'watery_droppings'],
                    symptomsText: 'إسهال دموي، ريش منتفش وخمول، تراجع فى معدل النمو ووزن غير متجانس بين الطيور.',
                    diffText: 'الدم فى الزرق علامة مميزة، غالبًا مرتبط بفرشة رطبة أو كثافة عالية.',
                    recommendation: 'راجع الفرشة والزرق فورًا — لو الدم واضح فى الزرق، ابدأ بروتوكول العلاج المضاد للكوكسيديا اللي عندك واستشر الطبيب البيطري لتأكيد النوع (أعورية/معوية) وتحديد الجرعة المناسبة.' },
                { id: 'dz_gumboro', name: 'الجمبورو (Gumboro / IBD)', ageMin: 14, ageMax: 28,
                    requiredSigns: ['watery_droppings'], supportingSigns: ['lethargy_huddling', 'imbalance', 'feed_water_drop'],
                    symptomsText: 'إسهال أبيض مائي، ريش منتفش، عزوف عن الأكل، نفوق يبدأ فجأة ويرتفع خلال أيام قليلة عادة بعمر 3-6 أسابيع.',
                    diffText: 'يصيب عادة قبل عمر 6 أسابيع ويترك الطائر أكثر عرضة لعدوى ثانوية بعدها بسبب ضعف المناعة.',
                    recommendation: 'نفوق سريع مع إسهال مائي أبيض فى العمر ده من علامات الجمبورو الشائعة — اعزل القطيع المتأثر لو ممكن، وكلم الطبيب البيطري بسرعة لتقييم الحالة المناعية والحاجة لدعم مصلي/فيتاميني.' },
                { id: 'dz_ecoli', name: 'الكوليباسيلوس (E. coli / Colibacillosis)', ageMin: 18, ageMax: 42,
                    requiredSigns: ['discharge'], supportingSigns: ['lethargy_huddling', 'feed_water_drop', 'joint_swelling', 'cough_sneeze'],
                    symptomsText: 'ضعف عام، إسهال، التهاب الأكياس الهوائية (يظهر عند التشريح)، تراجع الأداء ونفوق متفرق مستمر بدل موجة حادة.',
                    diffText: 'غالبًا عدوى ثانوية تتبع إجهاد بيئي أو ضعف مناعة من مرض آخر — راجع التهوية والكثافة والفرشة.',
                    recommendation: 'غالبًا مرتبط بضعف تهوية أو تراكم أمونيا — راجع معدل التهوية والفرشة فورًا، وناقش مع الطبيب البيطري بروتوكول مضاد حيوي مناسب لو الحالة منتشرة.' },
                { id: 'dz_crd', name: 'أمراض الجهاز التنفسي المزمن (CRD / مايكوبلازما)', ageMin: 10, ageMax: 45,
                    requiredSigns: ['rales'], supportingSigns: ['cough_sneeze', 'discharge', 'feed_water_drop'],
                    symptomsText: 'سعال وحشرجة تنفسية، إفرازات أنفية، تراجع طفيف فى النمو، نفوق منخفض عادة إلا مع عدوى مصاحبة.',
                    diffText: 'أعراض تنفسية مزمنة ممتدة بدون موجة نفوق حادة، خصوصًا فى الجو البارد أو سوء التهوية.',
                    recommendation: 'راقب التهوية ونسبة الأمونيا وكثافة التربية — دعم بروتوكول مضاد للمايكوبلازما بعد استشارة الطبيب البيطري، خصوصًا لو الأعراض بدأت مع تغيّر مفاجئ فى الطقس.' },
                { id: 'dz_nd', name: 'النيوكاسل (Newcastle) — احتمال، يحتاج تأكيد فوري', ageMin: 1, ageMax: 60,
                    requiredSigns: ['torticollis', 'circling'], supportingSigns: ['bloody_droppings', 'gasping', 'lethargy_huddling'],
                    symptomsText: 'ضيق تنفس وسعال، إسهال أخضر، ارتعاش وأعراض عصبية (التواء الرقبة)، انخفاض حاد فى إنتاج البيض، ارتفاع نفوق مفاجئ.',
                    diffText: 'الفرق عن الإنفلونزا: ظهور الأعراض العصبية (التواء الرقبة/الدوران) بوضوح أكبر فى النيوكاسل.',
                    recommendation: '⚠️ أعراض عصبية زي التواء الرقبة أو الدوران محتاجة تواصل فوري مع الطبيب البيطري — النيوكاسل مرض وبائي خطير ومعدي، والتأكيد والعزل السريع بيحددوا مصير باقي القطيع.' },
                { id: 'dz_heat', name: 'إجهاد حراري (مش مرض معدي، لكن مهم يتفرّق)', ageMin: 1, ageMax: 60,
                    requiredSigns: ['gasping'], supportingSigns: ['lethargy_huddling', 'feed_water_drop'],
                    symptomsText: 'لهث وفرد الأجنحة، تجمّع الطيور بعيدًا عن بعض، تراجع استهلاك العلف وزيادة استهلاك الماء، نفوق مفاجئ فى ساعات الذروة الحارة.',
                    diffText: 'يرتبط بتوقيت درجة الحرارة المرتفعة مباشرة وليس عدوى — التبريد والتهوية الفورية هما الحل الأول.',
                    recommendation: 'راجع حرارة ورطوبة العنبر الآن — زوّد التهوية/الرش لو متاح، ووفّر مياه باردة. لو الأعراض اختفت بعد تحسين البيئة، الأغلب إجهاد حراري مش مرض.' },
                { id: 'dz_ai', name: 'أنفلونزا الطيور', ageMin: 1, ageMax: 60, requiredSigns: [], supportingSigns: ['lethargy_huddling', 'watery_droppings', 'gasping'],
                    symptomsText: 'نفوق مفاجئ بدون أعراض واضحة أحيانًا، تورم الرأس والعرف المزرقّ، إسهال، ضعف عام شديد.',
                    diffText: 'نفوق سريع جدًا ومرتفع مقارنة بالأمراض التنفسية الأخرى — يستدعى إبلاغ الجهات البيطرية فورًا.',
                    recommendation: '⚠️ نفوق مفاجئ مرتفع من غير سبب واضح يستدعي إبلاغ الجهات البيطرية الرسمية فورًا، مش بس علاج ذاتي.' },
                { id: 'dz_aflatoxin', name: 'التسمم بالأفلاتوكسين (علف ملوث)', ageMin: 1, ageMax: 60, requiredSigns: [], supportingSigns: ['feed_water_drop'],
                    symptomsText: 'تراجع النمو والـFCR بدون سبب واضح، شحوب، تضخم الكبد (عند التشريح)، ضعف مناعة عام.',
                    diffText: 'لا توجد أعراض تنفسية أو عصبية مميزة — الشك يقوى مع تدهور الأداء العام رغم سلامة البرنامج الصحي، راجع مصدر وتخزين العلف.',
                    recommendation: 'مفيش أعراض ظاهرة مميزة تتفحص بصريًا — الشك بيقوى من تراجع الأداء (FCR/نمو) رغم سلامة البرنامج الصحي. راجع مصدر وتخزين العلف واستشر الطبيب البيطري لو الشك استمر.' },
                { id: 'dz_gout', name: 'النقرس (Gout)', ageMin: 1, ageMax: 60, requiredSigns: [], supportingSigns: ['lethargy_huddling'],
                    symptomsText: 'خمول، ترسبات بيضاء طباشيرية حول المفاصل أو الأعضاء الداخلية (عند التشريح)، تراجع الشهية.',
                    diffText: 'غالبًا مرتبط بمشاكل كلوية من جفاف حاد سابق أو زيادة بروتين/كالسيوم غير متوازنة فى العلف.',
                    recommendation: 'راجع برنامج التحصين للماء (خصوصًا فى الأيام الحارة) وتوازن البروتين/الكالسيوم فى العلف، واستشر الطبيب البيطري لو النفوق مستمر.' },
            ];
        }

        // ==================== State & Storage ====================

        // ============ معايير متقدمة قابلة للتعديل (تدفئة/تنبيهات/أداء/جدوى) ============
        const DEFAULT_APP_SETTINGS = {
            heatFuelSolarPerM2: 0.012, heatFuelGasPerM2: 0.0015,
            heatFactorWeek1: 1.0, heatFactorWeek2: 0.75, heatFactorWeek3: 0.5, heatFactorWeek4: 0.3, heatFactorAfter: 0.15,
            seasonFactorWinter: 1.5, seasonFactorSpring: 0.9, seasonFactorSummer: 0.35, seasonFactorAutumn: 1.1,
            heatTempDiffMultiplier: 0.05,
            defaultAreaM2: 100,
            vaccGraceDays: 2, vaccAdvanceDays: 2, treatGraceDays: 2,
            targetAgeAdvanceDays: 3, humidityDiffThreshold: 10, fcrCompareWindowDays: 5,
            mortCompareMinRate: 0.3, mortCompareHighMult: 1.4, mortCompareLowMult: 0.6,
            fcrGoodMax: 1.8, fcrOkMax: 2.1, weightDiffGoodMin: -2,
            restDaysBetweenCycles: 15,
            defaultStartWeightG: 42,
            feedStageStarterKg: 0.5, feedStageGrowerKg: 1.5,
            electricityPricePerKwh: 2.15
        };

