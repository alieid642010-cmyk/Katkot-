        function fillDailyForm(r) {
            document.getElementById('d_date').value = r.date;
            recalcAge();
            document.getElementById('d_age').value = r.age;
            document.getElementById('d_mort_day').value = r.mortDay ?? r.mort ?? 0;
            document.getElementById('d_cull_day').value = r.cullDay ?? r.cull ?? 0;
            document.getElementById('d_mort_night').value = r.mortNight ?? 0;
            document.getElementById('d_cull_night').value = r.cullNight ?? 0;
            // سجلات قديمة (قبل فصل التصنيف) عندها mortCauses مجمّع بدون تفريق نهار/ليل — نحمّله كله فى خانة النهار
            // كنقطة بداية معقولة (مش بيانات مفقودة)، والمستخدم يقدر يصححه لاحقًا لو احتاج.
            const mcDay = r.mortCausesDay || (!r.mortCausesNight ? r.mortCauses : null) || {};
            const mcNight = r.mortCausesNight || {};
            document.getElementById('d_mc_heat_day').value = mcDay.heat ?? 0;
            document.getElementById('d_mc_disease_day').value = mcDay.disease ?? 0;
            document.getElementById('d_mc_trample_day').value = mcDay.trample ?? 0;
            document.getElementById('d_mc_deform_day').value = mcDay.deform ?? 0;
            document.getElementById('d_mc_other_day').value = mcDay.other ?? 0;
            document.getElementById('d_mc_heat_night').value = mcNight.heat ?? 0;
            document.getElementById('d_mc_disease_night').value = mcNight.disease ?? 0;
            document.getElementById('d_mc_trample_night').value = mcNight.trample ?? 0;
            document.getElementById('d_mc_deform_night').value = mcNight.deform ?? 0;
            document.getElementById('d_mc_other_night').value = mcNight.other ?? 0;
            dailyPhotoDataArr = Array.isArray(r.photos) ? [...r.photos] : (r.photo ? [r.photo] : []);
            renderPhotoPreview();
            populateFeedItemSelect(r.feedItem || 'علف');
            populateFeedItemNightSelect(r.feedItemNight || '');
            const fnWrap = document.getElementById('feedNightSelectWrap');
            const fnLink = document.getElementById('feedNightDiffToggleBox');
            if (r.feedItemNight) { if (fnWrap) fnWrap.style.display = ''; if (fnLink) fnLink.style.display = 'none'; }
            else { if (fnWrap) fnWrap.style.display = 'none'; if (fnLink) fnLink.style.display = ''; }
            document.getElementById('d_weight').value = r.weight ?? '';
            document.getElementById('d_weightSample').value = Array.isArray(r.weightSample) ? r.weightSample.join(',') : '';
            document.getElementById('d_waterPh').value = r.waterPh ?? '';
            document.getElementById('d_waterSalinity').value = r.waterSalinity ?? '';
            document.getElementById('d_feed_day').value = r.feedDay ?? '';
            document.getElementById('d_feed_night').value = r.feedNight ?? '';
            document.getElementById('d_water_day').value = r.waterDay ?? '';
            document.getElementById('d_water_night').value = r.waterNight ?? '';
            document.getElementById('d_temp_day').value = r.tempDay ?? '';
            document.getElementById('d_temp_night').value = r.tempNight ?? '';
            document.getElementById('d_humidity_day').value = r.humidityDay ?? '';
            document.getElementById('d_humidity_night').value = r.humidityNight ?? '';
            document.getElementById('d_airspeed_day').value = r.airspeedDay ?? '';
            document.getElementById('d_airspeed_night').value = r.airspeedNight ?? '';
            document.getElementById('d_co2_day').value = r.co2Day ?? '';
            document.getElementById('d_co2_night').value = r.co2Night ?? '';
            document.getElementById('d_nh3_day').value = r.nh3Day ?? '';
            document.getElementById('d_nh3_night').value = r.nh3Night ?? '';
            document.getElementById('d_o2_day').value = r.o2Day ?? '';
            document.getElementById('d_o2_night').value = r.o2Night ?? '';
            document.getElementById('d_health').value = r.health ?? '';
            highlightHealthScale(r.health);
            setClinicalSignsInForm(r.clinicalSigns);
            updateClinicalPredictionPreview();
            document.getElementById('d_light').value = r.light ?? '';
            document.getElementById('d_dark').value = r.dark ?? '';
            document.getElementById('d_heatfuel').value = r.heatfuel ?? '';
            document.getElementById('d_notes_day').value = r.notesDay ?? r.notes ?? '';
            document.getElementById('d_notes_night').value = r.notesNight ?? '';
            updateDayNightPreview();
        }

        // سجل قديم (أكتر من 48 ساعة) يُقفل فى وجه العامل لمنع تعديل بيانات دورة/يوم فات عليه بالغلط؛
        // المالك دائمًا له صلاحية كاملة لتصحيح أى سجل مهما كان تاريخه.
        function isRecordLocked(date) {
            if (currentRole !== 'worker') return false;
            const hours = (new Date() - new Date(date + 'T00:00:00')) / 3600000;
            return hours > 48;
        }

        function editDailyRecord(date) {
            const b = getActiveBatch();
            if (!b) return;
            if (isRecordLocked(date)) { showToast('🔒 مرّ على هذا السجل أكثر من 48 ساعة — التعديل متاح للمالك فقط'); return; }
            const r = b.records.find(r => r.date === date);
            if (!r) return;
            feedItemManuallyOverridden = true; // تعديل سجل تاريخي — مش هنفرض عليه صنف مبني على مرحلة اليوم الحالي
            editingDailyDate = date;
            fillDailyForm(r);
            setDailyModalMode('full'); // تعديل سجل كامل — نعرض الأساسيات + النهار + الليل مع بعض للمراجعة
            document.getElementById('dailyModalOverlay').classList.add('show');
        }

        function parseFloatOrNull(val) {
            const v = parseFloat(val);
            return isNaN(v) ? null : v;
        }

        // متوسط قيمتين يتجاهل القيم الفارغة (null) — يُستخدم لدمج قراءة النهار والليل فى قيمة
        // إجمالية واحدة تبقى متوافقة مع باقى التطبيق (الرسوم، المتوسطات، التنبيهات...).
        function avgOf(a, c) {
            if (a == null && c == null) return null;
            if (a == null) return c;
            if (c == null) return a;
            return (a + c) / 2;
        }
        function avgOfArr(arr) {
            const vals = (arr || []).filter(v => v != null && !isNaN(v));
            return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        }

        // يبني تعليقًا/تحليلًا تلقائيًا مختصرًا يقارن قراءتى النهار والليل (تفاوت حرارى، رطوبة،
        // نسبة استهلاك العلف/الماء ليلًا مقابل نهارًا...) ليساعد فى ملاحظة مشاكل التهوية والتدفئة.
        // ⚠️ إصلاح: كان بيوصف الأرقام بس ("فرق الحرارة X°C") من غير ما يقول يعني ايه عمليًا — نتيجة كده
        // إن التحليل كان بيكرر حاجة المستخدم شايفها بعينه فى الحقول أصلاً (بديهية)، من غير أي قيمة مضافة.
        // دلوقتي كل ملاحظة بترجع نتيجة/عاقبة متوقعة (إجهاد حراري، تراكم أمونيا، ضعف تحويل غذائي...) وتوصية
        // عملية واحدة، مش مجرد وصف للفرق الرقمي. بياخد عمر القطيع كمان عشان يقارن نسبة الأكل الليلي بمعدل
        // متوقع حسب العمر (الطيور الكبيرة بتاكل ليلاً أكتر هروبًا من حر النهار، الصغيرة العكس).
        function buildDayNightAnalysis(v) {
            const notes = [];
            if (v.tempDay != null && v.tempNight != null) {
                const diff = v.tempDay - v.tempNight;
                if (diff >= 6) {
                    notes.push(`🌡️ الليل أبرد من النهار بفارق كبير (${fmt(diff,1)}°C) ← النتيجة المتوقعة: الطيور بتحرق جزء من العلف للتدفئة الذاتية بدل النمو، فالتحويل الغذائي (FCR) بيضعف والمناعة بتقل مع تكرار الموقف. راجع التدفئة/العزل ليلاً.`);
                } else if (diff <= -6) {
                    notes.push(`🌡️ الليل أدفأ من النهار بفارق كبير (${fmt(Math.abs(diff),1)}°C) ← النتيجة المتوقعة: ده مش الطبيعي (المفروض النهار أدفأ)، غالبًا فيه ضعف تهوية أو تسرب حرارة ليلاً بيمنع التبريد الطبيعي. راجع شبك التهوية والفتحات.`);
                } else if (Math.abs(diff) >= 3) {
                    notes.push(`🌡️ فرق حرارة معقول بين النهار والليل (${fmt(Math.abs(diff),1)}°C) — لسه فى الحدود المقبولة، راقبه لو بدأ يكبر.`);
                }
            }
            if (v.humidityDay != null && v.humidityNight != null) {
                const diff = v.humidityDay - v.humidityNight;
                if (diff <= -10) {
                    notes.push(`💧 الرطوبة ليلاً أعلى من النهار بفارق كبير (${fmt(Math.abs(diff),0)}%) ← النتيجة المتوقعة: رطوبة عالية + تهوية أقل عادة بالليل = تراكم أمونيا فى الفرشة، وده بيسبب حروق كف القدم والتهاب الجهاز التنفسي لو استمر كذا يوم. زوّد الحد الأدنى للتهوية ليلاً.`);
                } else if (Math.abs(diff) >= 10) {
                    notes.push(`💧 فرق رطوبة كبير بين النهار والليل (${fmt(Math.abs(diff),0)}%) — راقب فرشة العنبر لو بدأت تتبلل.`);
                }
            }
            if (v.feedDay != null && v.feedNight != null && (v.feedDay + v.feedNight) > 0) {
                const total = v.feedDay + v.feedNight;
                const nightPct = (v.feedNight / total) * 100;
                if (v.age != null && v.age >= 21 && nightPct < 40) {
                    notes.push(`🌾 الأكل الليلي منخفض عن المتوقع للعمر ده (${fmt(nightPct,0)}% بس ليلاً، والطبيعي فى الأعمار المتقدمة إنه يزيد لتجنب حر النهار) ← النتيجة المتوقعة: ده ممكن يبقى مؤشر مبكر لإجهاد حراري ليلي أو بداية مرض بيقلل الشهية. راقب الأداء بكرة وتابع الحالة الصحية.`);
                } else if (nightPct > 70) {
                    notes.push(`🌾 الأكل النهاري منخفض جدًا مقابل الليلي (${fmt(100-nightPct,0)}% بس نهارًا) ← النتيجة المتوقعة: الأرجح إن حر النهار بيخلي الطيور تمتنع عن الأكل وتعوّض ليلاً، وده بيقلل معدل النمو اليومي الإجمالي لو استمر. راجع التبريد/التهوية نهارًا.`);
                }
            }
            return notes;
        }

        // يقرأ الحقول الحالية فى نموذج التسجيل اليومى (قبل الحفظ) ويعرض التحليل مباشرة للمستخدم.
        function updateDayNightPreview() {
            const box = document.getElementById('d_analysisBox');
            if (!box) return;
            const v = {
                age: (() => { const n = parseInt(document.getElementById('d_age').value); return isNaN(n) ? null : n; })(),
                tempDay: parseFloatOrNull(document.getElementById('d_temp_day').value),
                tempNight: parseFloatOrNull(document.getElementById('d_temp_night').value),
                humidityDay: parseFloatOrNull(document.getElementById('d_humidity_day').value),
                humidityNight: parseFloatOrNull(document.getElementById('d_humidity_night').value),
                feedDay: parseFloatOrNull(document.getElementById('d_feed_day').value),
                feedNight: parseFloatOrNull(document.getElementById('d_feed_night').value),
                waterDay: parseFloatOrNull(document.getElementById('d_water_day').value),
                waterNight: parseFloatOrNull(document.getElementById('d_water_night').value),
            };
            const notes = buildDayNightAnalysis(v);
            box.innerHTML = notes.length
                ? `<b>📊 تحليل تلقائي (نتائج متوقعة، مش وصف أرقام):</b><br>${notes.map(n=>`<div style="margin-top:5px;">${n}</div>`).join('')}`
                : `<span style="color:#999;">مفيش ملاحظات لافتة دلوقتي — الفروق بين النهار والليل فى الحدود الطبيعية.</span>`;
        }

        // ============ رصد القيم غير المنطقية تلقائيًا قبل الحفظ — تحليلات إحصائية كتير مبنية فوق هذه السجلات، فخطأ إدخال واحد بيشوّهها كلها بصمت ============
        // بنبني نسخة مؤقتة من الدفعة بالسجل الجديد ونعيد استخدام computeMetrics الموجودة أصلاً (بدل إعادة كتابة نفس حسابات FCR/الأعداد الحية)
        function validateDailyRecordSanity(b, newRec) {
            const warnings = [];
            if (newRec.weight != null && newRec.weight <= 0) warnings.push('الوزن المُدخل صفر أو سالب');
            if (newRec.feed < 0) warnings.push('كمية العلف المُدخلة سالبة');
            const priorMortCull = b.records.filter(r => r.date !== newRec.date && r.age < newRec.age)
                .reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0);
            const liveBefore = Math.max(b.startCount - priorMortCull, 0);
            if (((newRec.mort || 0) + (newRec.cull || 0)) > liveBefore) {
                warnings.push(`عدد النافق + المستبعد اليوم (${(newRec.mort||0)+(newRec.cull||0)}) أكبر من عدد الطيور الحية المتاحة قبل اليوم (${liveBefore}) — راجع الأعداد`);
            }
            try {
                const candidateRecords = [...b.records.filter(r => r.date !== newRec.date), newRec].sort((a, c) => a.age - c.age);
                const m2 = computeMetrics({ ...b, records: candidateRecords });
                const rowToday = m2.series.find(r => r.date === newRec.date);
                if (rowToday) {
                    if (rowToday.fcr != null && (rowToday.fcr < 0.8 || rowToday.fcr > 6)) {
                        warnings.push(`معامل التحويل الغذائي التراكمي المحسوب حتى اليوم (${fmt(rowToday.fcr,2)}) خارج النطاق المنطقي المعتاد (0.8 – 6) — راجع الأوزان أو كميات العلف المُدخلة على مدار الدورة`);
                    }
                    const prevWeighed = [...m2.series].filter(r => r.date !== newRec.date && r.age < rowToday.age && r.weight != null).sort((a, c) => c.age - a.age)[0];
                    if (prevWeighed && newRec.weight != null && newRec.weight < prevWeighed.weight * 0.9) {
                        warnings.push(`الوزن المُدخل (${fmt(newRec.weight,0)} جم) أقل من آخر وزنة فعلية مسجَّلة (${fmt(prevWeighed.weight,0)} جم يوم ${prevWeighed.age}) بأكثر من 10% — نزول الوزن التراكمي نادر إلا مع خطأ فى القراءة أو الميزان`);
                    }
                    // ============ فحص معايرة الميزان: قفزة صعودًا أكبر من أقصى نمو بيولوجي ممكن للسلالة خلال نفس الفترة ============
                    // (خطأ شائع: رقم إضافي بالغلط، أو وزنة يوم مختلف اتسجلت فى التاريخ الغلط)
                    if (prevWeighed && newRec.weight != null && rowToday.age > prevWeighed.age) {
                        const daysGap = rowToday.age - prevWeighed.age;
                        const stdPrev = getRefValue(b, 'weight', prevWeighed.age) || 0;
                        const stdNow = getRefValue(b, 'weight', rowToday.age) || 0;
                        const stdGain = stdNow - stdPrev;
                        const maxPlausibleGain = Math.max(stdGain > 0 ? stdGain * 2.5 : 0, daysGap * 60); // حد أقصى سخي: 2.5× نمو السلالة أو 60جم/يوم كحد أدنى مطلق أيهما أكبر
                        const actualGain = newRec.weight - prevWeighed.weight;
                        if (actualGain > maxPlausibleGain) {
                            warnings.push(`الوزن المُدخل (${fmt(newRec.weight,0)} جم) أعلى من آخر وزنة (${fmt(prevWeighed.weight,0)} جم يوم ${prevWeighed.age}) بزيادة ${fmt(actualGain,0)} جم خلال ${daysGap} يوم — أعلى من أقصى نمو بيولوجي معتاد لهذه الفترة (~${fmt(maxPlausibleGain,0)} جم) — تأكد من دقة الميزان أو الرقم المُدخل`);
                        }
                    }
                }
            } catch (e) { /* لو فشل الحساب المؤقت لأي سبب، نتجاهل هذا الفحص ونكمل الحفظ العادي */ }
            return warnings;
        }

        // ============ (جديد) خصم علف من صنف واحد أو أكثر دفعة واحدة (يدعم تقسيم يوم التحويل)، مع تحذير مُجمَّع واحد لو فيه نقص فى أي صنف ============
        function commitFeedStockOut(b, date, parts, finishSaveDaily) {
            const active = parts.filter(p => p.name && p.qty > 0);
            if (!active.length) { finishSaveDaily(); return; }
            const resolved = active.map(p => ({ ...p, it: ensureInvItem(b, p.name, 'علف', 'كجم') }));
            const doDeduct = () => resolved.forEach(p => stockOutByItem(b, p.it.id, p.qty, date, 'استهلاك يومي'));
            const shortages = resolved.filter(p => p.it.balance < p.qty);
            if (!shortages.length) { doDeduct(); finishSaveDaily(); return; }
            const msg = shortages.map(p => `"${p.name}": الرصيد ${fmt(p.it.balance,1)} كجم، المطلوب ${fmt(p.qty,1)} كجم (نقص ${fmt(p.qty-p.it.balance,1)} كجم)`).join('\n');
            showConfirm(
                `⚠️ رصيد المخزون غير كافٍ للأصناف التالية:\n${msg}\nراجع أن مشترياته مسجَّلة فعليًا فى المخزن بنفس الاسم.\n\n` +
                `اضغط "نعم، تأكيد" لحفظ السجل وخصم الكميات كاملة رغم النقص (رصيد سالب)، أو "إلغاء" لحفظ السجل بدون خصم من المخزن الآن.`,
                () => { doDeduct(); finishSaveDaily(); },
                '⚠️ نقص فى رصيد المخزن',
                () => { finishSaveDaily(); showToast('⚠️ تم حفظ السجل بدون خصم كمية العلف من المخزن'); }
            );
        }
        // يرجّع كمية العلف المخصومة لسجل معيّن للمخزن — يدعم السجلات القديمة (صنف واحد) والجديدة (مقسَّمة على صنفين وقت تحويل نشط)
        function reverseFeedStock(b, r) {
            if (!r) return;
            const qty1 = r.feedItemQty != null ? r.feedItemQty : (r.feed || 0);
            if (qty1 > 0 && r.feedItem) reverseStockOut(b, r.feedItem, 'علف', qty1);
            if (r.feedItem2 && r.feedItem2Qty > 0) reverseStockOut(b, r.feedItem2, 'علف', r.feedItem2Qty);
        }

        function saveDaily(mode) {
            if (!requirePermission('production')) return; // 🔒 Red Team fix: كانت قابلة للنداء من Console بدون تحقق — عامل مسحوبة منه صلاحية "الإنتاج" كان لسه يقدر يسجل
            const saveBtn = document.getElementById(mode === 'day' ? 'd_saveBtnDay' : mode === 'night' ? 'd_saveBtnNight' : mode === 'essentials' ? 'd_saveBtnEssentials' : 'd_saveBtn');
            if (saveBtn && saveBtn.disabled) return; // منع الحفظ المزدوج لو المستخدم ضغط الزر أكتر من مرة بسرعة
            if (saveBtn) saveBtn.disabled = true;
            const b = getActiveBatch();
            if (!b) { if (saveBtn) saveBtn.disabled = false; return; }
            const date = document.getElementById('d_date').value;
            const age = parseInt(document.getElementById('d_age').value);
            // ============ 🔧 إصلاح: حالة "تم التسجيل" لكل فترة (نهار/ليل) بتتحدد صراحةً حسب زرار الحفظ اللي
            // اتضغط (mode) — دلوقتي تسجيل النهار وتسجيل الليل ظاهرين مع بعض دايمًا (مش تابات منفصلة)، وكل
            // قسم بقى ليه زرار حفظ خاص بيه، فمفيش لبس فى تحديد أنهي فترة "اتسجلت فعليًا". زرار "حفظ سجل اليوم"
            // العام (من غير mode) بيعتبر النهار والليل الاتنين اتسجلوا لأن كل الحقول ظاهرة وقابلة للتعديل قدامه. ============
            const existingForFlags = b.records.find(r => r.date === date);
            let dayEntered = existingForFlags ? !!existingForFlags.dayEntered : false;
            let nightEntered = existingForFlags ? !!existingForFlags.nightEntered : false;
            if (mode === 'day') dayEntered = true;
            else if (mode === 'night') nightEntered = true;
            else if (mode !== 'essentials') { dayEntered = true; nightEntered = true; } // زرار الحفظ العام = يعتبر الفترتين اتسجلوا
            // ملحوظة: زرار "حفظ الأساسيات" مايغيّرش حالة تسجيل النهار/الليل خالص — بيسيبهم زي ما هما (وزن/صحة مش جزء من فترة إنتاج)
            const mortDay = parseInt(document.getElementById('d_mort_day').value) || 0;
            const cullDay = parseInt(document.getElementById('d_cull_day').value) || 0;
            const mortNight = parseInt(document.getElementById('d_mort_night').value) || 0;
            const cullNight = parseInt(document.getElementById('d_cull_night').value) || 0;
            const mort = mortDay + mortNight;
            const cull = cullDay + cullNight;
            const mortCausesDay = {
                heat: parseInt(document.getElementById('d_mc_heat_day').value) || 0,
                disease: parseInt(document.getElementById('d_mc_disease_day').value) || 0,
                trample: parseInt(document.getElementById('d_mc_trample_day').value) || 0,
                deform: parseInt(document.getElementById('d_mc_deform_day').value) || 0,
                other: parseInt(document.getElementById('d_mc_other_day').value) || 0,
            };
            const mortCausesNight = {
                heat: parseInt(document.getElementById('d_mc_heat_night').value) || 0,
                disease: parseInt(document.getElementById('d_mc_disease_night').value) || 0,
                trample: parseInt(document.getElementById('d_mc_trample_night').value) || 0,
                deform: parseInt(document.getElementById('d_mc_deform_night').value) || 0,
                other: parseInt(document.getElementById('d_mc_other_night').value) || 0,
            };
            // إجمالي مجمّع (نهار + ليل) — يُستخدم فقط فى القراءة/التحليلات القائمة على مستوى الدورة كاملة، وليس أثناء التسجيل
            const mortCauses = {
                heat: mortCausesDay.heat + mortCausesNight.heat,
                disease: mortCausesDay.disease + mortCausesNight.disease,
                trample: mortCausesDay.trample + mortCausesNight.trample,
                deform: mortCausesDay.deform + mortCausesNight.deform,
                other: mortCausesDay.other + mortCausesNight.other,
            };
            const feedItem = document.getElementById('d_feeditem').value || 'علف';
            // ============ 🔧 إصلاح: صنف علف الليل ممكن يبقى مختلف عن صنف النهار (مثال: بادئ نهارًا + نامي ليلًا) —
            // قبل كده كان فيه اختيار واحد بس لصنف العلف بيتطبّق على إجمالي (نهار+ليل)، فلو الصنفين مختلفين كان
            // بيخصم كل الكمية المجمّعة من صنف واحد بس (وده اللي بيسبب "الكمية غير كافية" غلط فى المخزون). ============
            const feedItemNightSel = document.getElementById('d_feeditem_night');
            const feedItemNightRaw = feedItemNightSel ? feedItemNightSel.value : '';
            const feedItemNight = feedItemNightRaw || feedItem; // فاضي = نفس صنف النهار (سلوك متوافق مع القديم)
            const feedItemsDiffer = feedItemNightRaw && feedItemNightRaw !== feedItem;
            // ============ (جديد) لو فيه برنامج تحويل علف نشط لعمر اليوم ده، بنقسّم إجمالي كمية العلف تلقائيًا بين الصنفين حسب النسبة المُعرَّفة فى الإعدادات، بدل صنف واحد يدوي ============
            // ملحوظة: التحويل التلقائي بيفترض صنف واحد للنهار والليل معًا، فلو المستخدم حدّد صراحةً صنف ليل مختلف، نعطّل التحويل التلقائي ونحترم اختياره اليدوي.
            const activeFeedTrans = feedItemsDiffer ? null : getActiveFeedTransition(b, age);
            const feedItem2 = activeFeedTrans ? activeFeedTrans.transition.toFeed : null;
            const finalFeedItem = activeFeedTrans ? activeFeedTrans.transition.fromFeed : feedItem;
            const feedDay = parseFloatOrNull(document.getElementById('d_feed_day').value);
            const feedNight = parseFloatOrNull(document.getElementById('d_feed_night').value);
            const waterDay = parseFloatOrNull(document.getElementById('d_water_day').value);
            const waterNight = parseFloatOrNull(document.getElementById('d_water_night').value);
            const tempDay = parseFloatOrNull(document.getElementById('d_temp_day').value);
            const tempNight = parseFloatOrNull(document.getElementById('d_temp_night').value);
            const humidityDay = parseFloatOrNull(document.getElementById('d_humidity_day').value);
            const humidityNight = parseFloatOrNull(document.getElementById('d_humidity_night').value);
            const airspeedDay = parseFloatOrNull(document.getElementById('d_airspeed_day').value);
            const airspeedNight = parseFloatOrNull(document.getElementById('d_airspeed_night').value);
            const co2Day = parseFloatOrNull(document.getElementById('d_co2_day').value);
            const co2Night = parseFloatOrNull(document.getElementById('d_co2_night').value);
            const nh3Day = parseFloatOrNull(document.getElementById('d_nh3_day').value);
            const nh3Night = parseFloatOrNull(document.getElementById('d_nh3_night').value);
            const o2Day = parseFloatOrNull(document.getElementById('d_o2_day').value);
            const o2Night = parseFloatOrNull(document.getElementById('d_o2_night').value);
            const weight = parseFloatOrNull(document.getElementById('d_weight').value);
            const weightSampleRaw = document.getElementById('d_weightSample').value.trim();
            const weightSample = weightSampleRaw ? weightSampleRaw.split(/[,،\s]+/).map(s => parseFloat(s)).filter(v => !isNaN(v) && v > 0) : null;
            const waterPh = parseFloatOrNull(document.getElementById('d_waterPh').value);
            const waterSalinity = parseFloatOrNull(document.getElementById('d_waterSalinity').value);
            const health = parseFloatOrNull(document.getElementById('d_health').value);
            const light = parseFloatOrNull(document.getElementById('d_light').value);
            const dark = parseFloatOrNull(document.getElementById('d_dark').value);
            const heatfuel = parseFloatOrNull(document.getElementById('d_heatfuel').value);
            const notesDay = document.getElementById('d_notes_day').value.trim();
            const notesNight = document.getElementById('d_notes_night').value.trim();
            const notes = [notesDay ? `☀️ ${notesDay}` : '', notesNight ? `🌙 ${notesNight}` : ''].filter(Boolean).join(' | ');
            const clinicalSigns = readClinicalSignsFromForm();
            const hasClinicalSigns = CLINICAL_SIGN_GROUPS.some(g => (clinicalSigns[g.key] || []).length) || !!clinicalSigns.photos || !!clinicalSigns.respiratoryAudio;
            if (!date) { showToast('أدخل التاريخ'); shakeField(document.getElementById('d_date')); if (saveBtn) saveBtn.disabled = false; return; }

            // إجماليات (نهار + ليل) تبقى متوافقة مع كل حسابات التطبيق (FCR، الرسوم، التنبيهات...)
            const feed = (feedDay || 0) + (feedNight || 0);
            const water = (waterDay == null && waterNight == null) ? null : (waterDay || 0) + (waterNight || 0);
            const temp = avgOf(tempDay, tempNight);
            const humidity = avgOf(humidityDay, humidityNight);
            const airspeed = avgOf(airspeedDay, airspeedNight);
            const co2 = avgOf(co2Day, co2Night);
            const nh3 = avgOf(nh3Day, nh3Night);
            const o2 = avgOf(o2Day, o2Night);
            const analysis = buildDayNightAnalysis({ age, tempDay, tempNight, humidityDay, humidityNight, feedDay, feedNight, waterDay, waterNight }).join(' | ');
            // ============ تقسيم كمية العلف بين الصنفين — إما حسب نسبة يوم التحويل النشط، أو حسب صنف الليل المختلف يدويًا (الاثنان متبادلان ومتعارضان عمدًا) ============
            const feedItemQty = activeFeedTrans ? feed * (activeFeedTrans.fromPct / 100) : (feedItemsDiffer ? (feedDay || 0) : feed);
            const feedItem2Final = activeFeedTrans ? feedItem2 : (feedItemsDiffer ? feedItemNight : null);
            const feedItem2Qty = activeFeedTrans ? feed * (activeFeedTrans.toPct / 100) : (feedItemsDiffer ? (feedNight || 0) : 0);

            const newRecObj = { date, age, mort, cull, mortDay, mortNight, cullDay, cullNight, mortCauses, mortCausesDay, mortCausesNight, dayEntered, nightEntered, photo: dailyPhotoDataArr[0] || null, photos: dailyPhotoDataArr.slice(), feed, feedItem: finalFeedItem, feedItem2: feedItem2Final, feedItemQty, feedItem2Qty, feedItemNight: feedItemsDiffer ? feedItemNight : null, water, weight, temp, humidity, airspeed, co2, nh3, o2, health,
                light, dark, heatfuel, notes, notesDay, notesNight, clinicalSigns: hasClinicalSigns ? clinicalSigns : null,
                feedDay, feedNight, waterDay, waterNight, tempDay, tempNight, humidityDay, humidityNight,
                airspeedDay, airspeedNight, co2Day, co2Night, nh3Day, nh3Night, o2Day, o2Night, analysis,
                weightSample, waterPh, waterSalinity };

            const commitDailyRecord = () => {
                const existing = b.records.find(r => r.date === date);
                if (existing) reverseFeedStock(b, existing);
                const isFirstRecordEver = b.records.length === 0; // ============ لتحديد إذا كان هذا أول سجل يومي فى الدفعة (لحظة احتفالية) ============
                b.records = b.records.filter(r => r.date !== date);
                const enteredBy = currentRole === 'worker' && currentWorker ? currentWorker.name : 'المالك';
                const enteredAt = new Date().toISOString();
                b.records.push({ ...newRecObj, enteredBy, enteredAt });
                b.records.sort((a, c) => a.age - c.age);
                logPredictionSnapshot(b); // ============ لقطة يومية من التوقع الحالي — أساس تتبّع دقة التوقعات عند الأرشفة ============
                const finishSaveDaily = () => {
                    editingDailyDate = null;
                    dailyFormDirty = false;
                    persist();
                    closeModal('dailyModalOverlay');
                    render();
                    vibrate(35);
                    flashSaveSuccess(saveBtn, '✅ تم الحفظ');
                    if (isFirstRecordEver) {
                        showToast('🐣 بداية موفقة! أول سجل فى الدفعة');
                        setTimeout(() => showInfo('🐣 بداية موفقة!', `سجّلت أول يوم فى دفعة "${esc(b.name)}" — استمر فى التسجيل اليومي، هو أساس دقة كل التحليلات والتوقعات اللى هتشوفها فى الداشبورد.`), 500);
                    } else {
                        showToast('تم حفظ سجل اليوم ✅');
                    }
                    // ============ تنبيه استباقي بعد الحفظ لو فيه احتمال قوي — عشان مايتفوتش مع إغلاق المودال ============
                    if (hasClinicalSigns) {
                        const pred = computeSymptomPrediction(b, clinicalSigns);
                        const urgentOne = pred.predictions.find(p => p.urgent);
                        if (urgentOne) {
                            setTimeout(() => showInfo(`⚠️ ${urgentOne.name}`,
                                `${urgentOne.confidenceLabel}\n\n💡 ${urgentOne.recommendation}${urgentOne.personalHistoryNote ? '\n\n📓 ' + urgentOne.personalHistoryNote : ''}\n\n⚠️ ده استرشاد أولي مش تشخيص نهائي — التأكيد محتاج طبيب بيطري.`), 700);
                        }
                    }
                };
                if (feed > 0) {
                    commitFeedStockOut(b, date, [{ name: finalFeedItem, qty: feedItemQty }, { name: feedItem2Final, qty: feedItem2Qty }], finishSaveDaily);
                } else {
                    finishSaveDaily();
                }
            };

            // ============ رصد القيم غير المنطقية قبل الحفظ — لو فيه شك، بنعرضه ونسيب القرار للمستخدم بدل رفض الحفظ تلقائيًا ============
            const sanityWarnings = validateDailyRecordSanity(b, newRecObj);
            if (sanityWarnings.length) {
                showConfirm(
                    `⚠️ رصدنا قيم قد تكون غير منطقية فى سجل اليوم:\n\n${sanityWarnings.map(w => '• ' + w).join('\n')}\n\nاضغط "نعم، تأكيد" لحفظ السجل كما هو رغم ذلك، أو "إلغاء" للرجوع وتصحيح البيانات.`,
                    () => commitDailyRecord(),
                    '⚠️ تحقق من صحة البيانات المُدخلة',
                    () => { if (saveBtn) saveBtn.disabled = false; }
                );
            } else {
                commitDailyRecord();
            }
        }

        function deleteRecord(date) {
            if (!requirePermission('production')) return; // 🔒 Red Team fix (جولة 2): كانت قابلة للنداء من Console بدون تحقق للسجلات الحديثة (أقل من 48 ساعة)
            const b = getActiveBatch();
            if (!b) return;
            if (isRecordLocked(date)) { showToast('🔒 مرّ على هذا السجل أكثر من 48 ساعة — الحذف متاح للمالك فقط'); return; }
            showConfirm('سيتم حذف سجل هذا اليوم. يمكن استرجاعه لاحقًا من سلة المهملات بالإعدادات. متأكد؟', () => {
                const r = b.records.find(r => r.date === date);
                if (r) reverseFeedStock(b, r);
                b.records = b.records.filter(r => r.date !== date);
                if (r) softDeleteToTrash(b, 'record', r, `🗑️ حذف سجل يومي بتاريخ ${date}`, 'ملحوظة: تم إرجاع كمية العلف للمخزن وقت الحذف ولن تُخصم تلقائيًا مرة أخرى — راجع رصيد المخزن يدويًا لو استرجعت السجل');
                persist();
                render();
                showToast('تم حذف السجل');
            });
        }

        function togglePurchaseDue() {
            const isDue = document.getElementById('p_paid').value === '0';
            ['p_dueWrap', 'p_dueTimeWrap', 'p_dueLeadWrap'].forEach(id => { const w = document.getElementById(id); if (w) w.style.display = isDue ? '' : 'none'; });
        }
        function toggleSaleDue() {
            const isDue = document.getElementById('s_paid').value === '0';
            ['s_dueWrap', 's_dueTimeWrap', 's_dueLeadWrap'].forEach(id => { const w = document.getElementById(id); if (w) w.style.display = isDue ? '' : 'none'; });
        }

        // ============ Purchases CRUD ============
        const NON_STOCK_TYPES = ['كهرباء ومياه', 'عمالة'];
        let editingPurchaseId = null;

