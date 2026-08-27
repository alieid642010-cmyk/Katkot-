        function getSeasonFactor(month) {
            const s = AS();
            if ([12,1,2].includes(month)) return s.seasonFactorWinter;
            if ([6,7,8].includes(month)) return s.seasonFactorSummer;
            if ([3,4,5].includes(month)) return s.seasonFactorSpring;
            return s.seasonFactorAutumn; // خريف
        }
        // استهلاك التدفئة التقديري يومياً
        // قاعدة: في الأسبوع الأول: حرارة عالية + طيور صغيرة + إهدار حرارة عالي
        // نقدّر باللتر (سولار/ديزل) أو بجزء من الأنبوبة الكاملة (غاز بوتاجاز، مثال: 0.3 = 30% من الأنبوبة)
        function estimateHeatFuel(b, age, actualTemp, refs) {
            if (!b || b.heattype === 'none' || b.heattype === 'electric') return null;
            const s = AS();
            const area = b.area || s.defaultAreaM2;
            const month = b.startmonth || 1;
            const sf = getSeasonFactor(month);
            // إذا كانت درجة الحرارة خارج المعيار تزيد أو تقل الاستهلاك
            const tempDiff = refs && refs.temp ? Math.max(refs.temp - (actualTemp || refs.temp), 0) : 0;
            // معامل العمر: الأسبوع 1 يحتاج أكثر تدفئة
            const ageFactor = age <= 7 ? s.heatFactorWeek1 : age <= 14 ? s.heatFactorWeek2 : age <= 21 ? s.heatFactorWeek3 : age <= 28 ? s.heatFactorWeek4 : s.heatFactorAfter;
            const baseFuelPerM2 = b.heattype === 'solar' ? s.heatFuelSolarPerM2 : s.heatFuelGasPerM2; // لتر سولار أو جزء من الأنبوبة لكل م²
            const est = area * baseFuelPerM2 * ageFactor * sf * (1 + tempDiff * s.heatTempDiffMultiplier);
            return Math.max(est, 0);
        }

        function populateFeedItemSelect(selectedName) {
            const b = getActiveBatch();
            const sel = document.getElementById('d_feeditem');
            if (!b || !sel) return;
            const feedItems = b.inventory.filter(i => i.category === 'علف');
            if (!feedItems.some(i => i.name === 'علف')) feedItems.unshift({ name: 'علف', balance: 0 });
            sel.innerHTML = feedItems.map(i =>
                `<option value="${esc(i.name)}">${esc(i.name)} (الرصيد: ${fmt(i.balance,1)} كجم)</option>`).join('');
            let finalName = selectedName && feedItems.some(i => i.name === selectedName) ? selectedName : feedItems[feedItems.length - 1].name;

            // ===== مطابقة الصنف المختار مع مرحلة العلف الفعلية المحسوبة (بادئ/نامي/ناهي) =====
            // الفحص/التحويل التلقائي مربوط بـ"اليوم الحالي" بس؛ عند تعديل سجل تاريخي قديم (يوم فات)،
            // مرحلة العلف وقتها ممكن تكون مختلفة عن مرحلة القطيع النهاردة، فمينفعش نقارن بنفس المعيار.
            const dateFieldVal = document.getElementById('d_date') ? document.getElementById('d_date').value : null;
            const warnBox = document.getElementById('d_feeditem_warn');
            try {
                if (dateFieldVal && dateFieldVal !== todayStr()) throw new Error('historical-record-skip-stage-check');
                const m = computeMetrics(b);
                const mismatch = checkFeedItemStageMismatch(b, m, finalName);
                if (mismatch) {
                    if (!feedItemManuallyOverridden && mismatch.suggestedItem) {
                        // مفيش تدخل يدوي صريح فى هذا النموذج، وفيه صنف صح متاح بالمخزن — نحوّل تلقائيًا ونوضح ليه
                        finalName = mismatch.suggestedItem.name;
                        if (warnBox) {
                            warnBox.style.display = '';
                            warnBox.innerHTML = `🔄 تم اختيار "${esc(finalName)}" تلقائيًا بدل الصنف السابق — القطيع دخل مرحلة ${mismatch.expectedStage.icon} ${mismatch.expectedStage.label} فعليًا (${fmt(mismatch.cumPerBirdKg*1000,0)} جم/طائر تراكمي). غيّره يدويًا لو الاختيار مش صحيح.`;
                        }
                    } else if (warnBox) {
                        // إما المستخدم اختار يدويًا فى نفس الجلسة، أو مفيش صنف مطابق بالمخزن — تحذير بس بدون تحويل قسري
                        warnBox.style.display = '';
                        warnBox.innerHTML = mismatch.suggestedItem
                            ? `⚠️ الصنف المختار يبدو من مرحلة مختلفة — القطيع حسب الاستهلاك الفعلي فى مرحلة ${mismatch.expectedStage.icon} ${mismatch.expectedStage.label} الآن (${fmt(mismatch.cumPerBirdKg*1000,0)} جم/طائر). راجع اختيارك.`
                            : `⚠️ القطيع حسب الاستهلاك الفعلي دخل مرحلة ${mismatch.expectedStage.icon} ${mismatch.expectedStage.label}، ومفيش صنف بهذا الاسم فى المخزون — أضِف صنف علف باسمه واضح (يحتوي كلمة "${mismatch.expectedStage.label}") عشان التوقعات واقتراحات الشراء تبقى صحيحة.`;
                    }
                } else if (warnBox) {
                    warnBox.style.display = 'none';
                    warnBox.innerHTML = '';
                }
            } catch (e) {
                // إما سجل تاريخي (مش النهاردة) أو فشل الحساب لأي سبب — نتجاهل التحذير ونكمل عادي بدون ما نعطّل التسجيل
                if (warnBox) { warnBox.style.display = 'none'; warnBox.innerHTML = ''; }
            }

            sel.value = finalName;
        }
        // ============ نسخة مبسطة لصنف علف الليل — بيسمح يكون مختلف عن صنف النهار (زي حالة تحويل بادئ↔نامي يدوي بين الفترتين) ============
        // أول خيار فاضي = "زي النهار" (السلوك الافتراضي القديم قبل الإصلاح، فمفيش أي كسر فى البيانات القديمة)
        function populateFeedItemNightSelect(selectedName) {
            const b = getActiveBatch();
            const sel = document.getElementById('d_feeditem_night');
            if (!b || !sel) return;
            const feedItems = b.inventory.filter(i => i.category === 'علف');
            if (!feedItems.some(i => i.name === 'علف')) feedItems.unshift({ name: 'علف', balance: 0 });
            sel.innerHTML = `<option value="">— نفس صنف النهار —</option>` + feedItems.map(i =>
                `<option value="${esc(i.name)}">${esc(i.name)} (الرصيد: ${fmt(i.balance,1)} كجم)</option>`).join('');
            sel.value = (selectedName && feedItems.some(i => i.name === selectedName)) ? selectedName : '';
        }
        function onFeedItemNightManualChange() {
            feedItemNightManuallyOverridden = true;
        }
        // الرابط الافتراضي مخفي عشان مايكترش المساحة — يظهر خانة اختيار الصنف بس لو المستخدم فعلاً محتاجها
        function revealFeedItemNight() {
            const wrap = document.getElementById('feedNightSelectWrap');
            const link = document.getElementById('feedNightDiffToggleBox');
            if (wrap) wrap.style.display = '';
            if (link) link.style.display = 'none';
        }
        // بيتنادى لما المستخدم يغيّر صنف العلف يدويًا من القائمة — بنسجّل إنه اختيار صريح عشان منلغيهوش
        // تلقائيًا لو اتعمل recalcAge تاني (زي تغيير التاريخ)، لكن التحذير (لو فيه اختلاف) يفضل ظاهر.
        function onFeedItemManualChange() {
            feedItemManuallyOverridden = true;
            populateFeedItemSelect(document.getElementById('d_feeditem').value);
        }

        function recalcAge() {
            const b = getActiveBatch();
            if (!b) return;
            const d = document.getElementById('d_date').value;
            const age = daysBetween(b.startDate, d);
            document.getElementById('d_age').value = age;
            const refs = getRefsForDay(b, age);
            const cumMortCull = b.records.reduce((s, r) => s + (r.mort || 0) + (r.cull || 0), 0);
            const liveCount = Math.max(b.startCount - cumMortCull, 0);
            const feedFlockKg = (refs.feed * liveCount) / 1000;
            const waterFlockL = (refs.water * liveCount) / 1000;

            // تحديث حقل التدفئة
            const heatField = document.getElementById('d_heatfield');
            const heatEstBox = document.getElementById('d_heatestbox');
            const heatLabel = document.getElementById('d_heatlabel');
            if (b.heattype && b.heattype !== 'none' && b.heattype !== 'electric') {
                heatField.style.display = '';
                const unit = b.heattype === 'solar' ? 'لتر' : 'أنبوبة';
                heatLabel.textContent = `استهلاك التدفئة الفعلي (${unit})`;
                document.getElementById('d_heatfuel').placeholder = b.heattype === 'gas' ? 'مثال: 0.3 (أي 30% من الأنبوبة)' : 'تلقائي ← تقديري';
                const tempDayVal = parseFloat(document.getElementById('d_temp_day').value);
                const tempNightVal = parseFloat(document.getElementById('d_temp_night').value);
                const actualTemp = !isNaN(tempNightVal) ? tempNightVal : (!isNaN(tempDayVal) ? tempDayVal : null);
                const est = estimateHeatFuel(b, age, actualTemp, refs);
                if (est !== null) {
                    heatEstBox.style.display = '';
                    const estNote = b.heattype === 'gas' ? `(أي حوالي ${Math.round(est*100)}% من أنبوبة كاملة)` : '';
                    heatEstBox.innerHTML = `🔥 التقدير: <b>${est.toFixed(2)}</b> ${unit} ${estNote} | العمر ${age} يوم | مساحة ${b.area||0} م² | ${['شتاء','شتاء','ربيع','ربيع','صيف','صيف','صيف','صيف','خريف','خريف','شتاء','شتاء'][b.startmonth-1]}<br><span style="color:var(--muted);font-size:11px;">* تقدير فقط — أدخل الاستهلاك الفعلي في الحقل أعلاه، ويمكن إدخال كسور الأنبوبة مثل 0.3</span>`;
                }
            } else {
                heatField.style.display = 'none';
                heatEstBox.style.display = 'none';
            }

            document.getElementById('stdRefBox').innerHTML = `
                <div style="font-weight:800;color:var(--barn);">📋 المرجع المعياري ليوم ${age} (${getSpeciesData(b.species).label})</div>
                <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">بناءً على ${liveCount.toLocaleString('ar-EG')} طائر حي (من أصل ${b.startCount.toLocaleString('ar-EG')})</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:4px;">
                    <span>⚖️ وزن متوقع: <b>${Math.round(refs.weight)}</b> جم</span>
                    <span>🌾 علف القطيع اليوم: <b>${fmt(feedFlockKg, 1)}</b> كجم</span>
                    <span>💧 ماء القطيع اليوم: <b>${fmt(waterFlockL, 1)}</b> لتر</span>
                    <span>🌡️ حرارة مثلى: <b>${fmt(refs.temp, 1)}</b> °C</span>
                    <span>💨 هواء: <b>${fmt(refs.airspeed, 1)}</b> م/ث</span>
                    <span>CO₂: <b>${Math.round(refs.co2)}</b> ppm</span>
                    <span>NH₃: <b>${Math.round(refs.nh3)}</b> ppm</span>
                </div>`;
            populateFeedItemSelect(document.getElementById('d_feeditem').value);
            populateFeedItemNightSelect(document.getElementById('d_feeditem_night') ? document.getElementById('d_feeditem_night').value : '');
            const feedSel = document.getElementById('d_feeditem');
            const ftBox = document.getElementById('feedTransitionBox');
            const activeTrans = getActiveFeedTransition(b, age);
            if (activeTrans) {
                const t = activeTrans.transition;
                ftBox.style.display = '';
                ftBox.innerHTML = `🔄 يوم التحويل ${activeTrans.dayNum} من ${activeTrans.totalDays}: <b>${activeTrans.fromPct}%</b> ${esc(t.fromFeed)} + <b>${activeTrans.toPct}%</b> ${esc(t.toFeed)} — هيتقسّم تلقائيًا من إجمالي كمية العلف اللي هتسجّلها تحت.`;
                feedSel.disabled = true;
            } else {
                ftBox.style.display = 'none';
                ftBox.innerHTML = '';
                feedSel.disabled = false;
            }
            renderDailyDueTasks();
            renderDailyWorkerBox();
        }

        // ============ (جديد) صفحة العامل الموحّدة: تنبيهات نشطة + تشيك ليست السلامة الحيوية اليوم + تذكيرات مستحقة ============
        // الهدف: العامل يفتح "تسجيل بيانات اليوم" ويلاقي كل حاجة محتاج يتعامل معاها فى مكان واحد —
        // يتابع البروتوكول (تشيك ليست)، يشوف التنبيهات النشطة، وينفّذ التذكيرات المستحقة — من غير ما يدوّر فى تابات تانية.
        // ============ 👷 مهمتك دلوقتي — بعد إعادة التنظيم: صندوقين منفصلين بدل واحد يحجب أول الفورم ============
        // 1) d_alertsRemBox (تنبيهات + تذكيرات): مش مرتبطة بنهار/ليل، فضلت فى مكانها الأصلي فوق، لكن بقت
        //    جوّه <details> مطوية افتراضيًا (ملخص سطر واحد) — تتفتح تلقائيًا بس لو فيه تنبيه خطر فعلي (danger)
        //    عشان الأمان يفضل واضح فورًا، من غير ما التنبيهات الروتينية تحجب حقول الإدخال زي قبل.
        // 2) d_checklistBoxDay / d_checklistBoxNight (تشيك ليست السلامة الحيوية): كل بند بيتصنّف حسب
        //    t.period ('day' افتراضيًا يحافظ على سلوك البنود القديمة اللي كانت دايمًا فى صندوق النهار بس
        //    قبل إضافة الفلتر / 'night' / 'both' يظهر فى الجولتين) — نفس منطق تصنيف نهار/ليل المستخدم بالفعل
        //    فى renderDailyDueTasks للإضافات والمعاملات.
        function renderDailyWorkerBox() {
            const detailsEl = document.getElementById('d_alertsRemDetails');
            const alertsBox = document.getElementById('d_alertsRemBox');
            const summaryEl = document.getElementById('d_alertsRemSummary');
            const checklistBoxDay = document.getElementById('d_checklistBoxDay');
            const checklistBoxNight = document.getElementById('d_checklistBoxNight');
            const b = getActiveBatch();
            if (!b) {
                if (detailsEl) detailsEl.style.display = 'none';
                if (checklistBoxDay) { checklistBoxDay.innerHTML = ''; checklistBoxDay.style.display = 'none'; }
                if (checklistBoxNight) { checklistBoxNight.innerHTML = ''; checklistBoxNight.style.display = 'none'; }
                return;
            }
            const m = computeMetrics(b);
            const alerts = computeAlerts(b, m).filter(a => a.level === 'danger' || a.level === 'warn');
            const topAlerts = alerts.slice(0, 6); // نعرض الأهم بس عشان النموذج مايتقلش بحمل زيادة
            const hasDanger = alerts.some(a => a.level === 'danger');
            const today = todayStr();
            const checklistTasksAll = b.checklistTemplate || [];
            const checklistTasksDay = checklistTasksAll.filter(t => t.period !== 'night');
            const checklistTasksNight = checklistTasksAll.filter(t => t.period === 'night' || t.period === 'both');
            const doneSet = new Set((b.checklistLog || []).filter(l => l.date === today && l.done).map(l => l.taskId));
            const dueReminders = (b.reminders || []).filter(r => !r.done && r.date <= today);

            // --- تنبيهات + تذكيرات (details مطوية، تتفتح تلقائيًا لو فيه خطر فعلي) ---
            if (detailsEl && alertsBox) {
                if (!topAlerts.length && !dueReminders.length) { detailsEl.style.display = 'none'; }
                else {
                    detailsEl.style.display = '';
                    detailsEl.open = hasDanger; // خطر فعلي = يتفتح تلقائيًا؛ غير كده يفضل مطوي لحد ما المستخدم يفتحه بنفسه
                    if (summaryEl) summaryEl.textContent = `👷 مهمتك دلوقتي${(topAlerts.length + dueReminders.length) ? ' (' + (topAlerts.length + dueReminders.length) + ')' : ''}${hasDanger ? ' ⚠️' : ''}`;
                    const alertsHtml = !topAlerts.length ? '' : `
                        <div style="font-weight:800;color:var(--barn);font-size:12px;margin:0 0 3px;">⚠️ تنبيهات نشطة الآن (${alerts.length}${alerts.length > topAlerts.length ? '، أهم ' + topAlerts.length : ''})</div>
                        ${topAlerts.map(a => `<div class="day" style="margin-bottom:4px;${a.level === 'danger' ? 'color:var(--red);font-weight:700;' : ''}">${a.text}</div>`).join('')}`;
                    const reminderHtml = !dueReminders.length ? '' : `
                        <div style="font-weight:800;color:var(--barn);font-size:12px;margin:8px 0 3px;">🔔 تذكيرات مستحقة</div>
                        ${dueReminders.map(r => `<div class="check-row"><div class="txt">${esc(r.title)}${r.date < today ? ' <span style="color:var(--red);">(متأخر)</span>' : ''}</div><button class="btn gold sm" onclick="dailyToggleReminder('${r.id}')">✅ تم</button></div>`).join('')}`;
                    alertsBox.innerHTML = alertsHtml + reminderHtml;
                }
            }
            // --- تشيك ليست السلامة الحيوية: صندوق نهار وصندوق ليل، كل بند فى صندوقه (أو الاثنين لو "both") ---
            const checklistRow = t => `<div class="check-row"><input type="checkbox" ${doneSet.has(t.id) ? 'checked' : ''} onchange="dailyToggleChecklist('${t.id}')"><div class="txt ${doneSet.has(t.id) ? 'done-strike' : ''}">${esc(t.text)}</div></div>`;
            if (checklistBoxDay) {
                if (!checklistTasksDay.length) { checklistBoxDay.innerHTML = ''; checklistBoxDay.style.display = 'none'; }
                else {
                    checklistBoxDay.style.display = '';
                    checklistBoxDay.innerHTML = `
                        <div style="font-weight:800;color:var(--barn);font-size:12px;margin:0 0 3px;">🧹 تشيك ليست السلامة الحيوية — نهار (${checklistTasksDay.filter(t => doneSet.has(t.id)).length}/${checklistTasksDay.length})</div>
                        ${checklistTasksDay.map(checklistRow).join('')}`;
                }
            }
            if (checklistBoxNight) {
                if (!checklistTasksNight.length) { checklistBoxNight.innerHTML = ''; checklistBoxNight.style.display = 'none'; }
                else {
                    checklistBoxNight.style.display = '';
                    checklistBoxNight.innerHTML = `
                        <div style="font-weight:800;color:var(--barn);font-size:12px;margin:0 0 3px;">🧹 تشيك ليست السلامة الحيوية — ليل (${checklistTasksNight.filter(t => doneSet.has(t.id)).length}/${checklistTasksNight.length})</div>
                        ${checklistTasksNight.map(checklistRow).join('')}`;
                }
            }
        }
        function dailyToggleChecklist(id) { toggleChecklistTask(id); } // renderDailyWorkerBox() بقى جوّه toggleChecklistTask نفسها
        function dailyToggleReminder(id) { toggleReminder(id); renderDailyWorkerBox(); }

        // ============ مهام اليوم داخل نموذج السجل اليومي (تحصينات/معاملات/إضافات مستحقة) ============
        // ملاحظة: تنفيذ إضافات العلف/الماء يعتمد على تاريخ السجل المفتوح حالياً (d_date) وليس تاريخ
        // النظام الفعلي — هذا يسمح بإتمام تنفيذ الإضافات حتى عند تعبئة سجل متأخر (يوم أمس مثلاً)،
        // مع منع التنفيذ لتاريخ مستقبلي لأن الخصم من المخزن يجب أن يواكب الاستهلاك الفعلي فقط.
        // ============ 🔧 مقسّمة لصندوقين (نهار/ليل) بدل صندوق واحد مشترك دايمًا ظاهر — كل مهمة بتتصنّف حسب
        // فترتها الفعلية (a.period لإضافات العلف/الماء، وقت t.time للمعاملات: قبل الساعة 6 مساءً = نهار)
        // بدل ما تتزاحم كلها فوق الصفحة فى كل الأوضاع. التحصينات بطبيعتها بتتنفذ فى جولة النهار عادةً. ============
        function isTreatmentNight(t) {
            if (!t || !t.time) return false;
            const h = parseInt(String(t.time).split(':')[0]);
            return !isNaN(h) && (h >= 18 || h < 6);
        }
        function renderDailyDueTasks() {
            const boxDay = document.getElementById('dailyDueBoxDay');
            const boxNight = document.getElementById('dailyDueBoxNight');
            if (!boxDay && !boxNight) return;
            const b = getActiveBatch();
            const age = parseInt(document.getElementById('d_age').value);
            if (!b || isNaN(age)) { if (boxDay) { boxDay.innerHTML = ''; boxDay.style.display = 'none'; } if (boxNight) { boxNight.innerHTML = ''; boxNight.style.display = 'none'; } return; }
            const date = document.getElementById('d_date').value || todayStr();
            const isFuture = date > todayStr();
            const dueVacc = b.vaccineLog.filter(v => v.day === age); // ✅ التحصينات دايمًا فى مهام النهار (جولة الصباح المعتادة)
            const dueTreatAll = b.treatmentLog.filter(t => t.day === age);
            const dueTreatDay = dueTreatAll.filter(t => !isTreatmentNight(t));
            const dueTreatNight = dueTreatAll.filter(t => isTreatmentNight(t));
            const activeFeedAll = b.feedAdditives.filter(a => a.active && additiveActiveOnDay(a, age));
            const activeWaterAll = b.waterAdditives.filter(a => a.active && additiveActiveOnDay(a, age));
            const activeFeedDay = activeFeedAll.filter(a => a.period !== 'night');
            const activeFeedNight = activeFeedAll.filter(a => a.period === 'night' || a.period === 'both');
            const activeWaterDay = activeWaterAll.filter(a => a.period !== 'night');
            const activeWaterNight = activeWaterAll.filter(a => a.period === 'night' || a.period === 'both');

            const lockNote = isFuture ? '<span style="font-size:10.5px;color:var(--muted);">🔒 لا يمكن التنفيذ لتاريخ مستقبلي</span>' : '';
            const groupHtml = (title, rowsHtml) => rowsHtml ? `
                <div style="font-weight:800;color:var(--barn);font-size:12px;margin:8px 0 3px;">${title}</div>
                ${rowsHtml}` : '';
            const vaccRow = v => `<div class="check-row"><input type="checkbox" ${v.done?'checked':''} onchange="dailyToggleVaccine('${v.id}')">
                    <div class="txt"><div class="${v.done?'done-strike':''}">💉 ${esc(v.name)}</div>
                    <div class="day">يوم ${v.day}${v.doneDate?' · تم فى '+v.doneDate:''}${v.qty>0?' · '+v.qty+' '+(v.unit||''):''}</div></div>
                </div>`;
            const treatRow = t => `<div class="check-row"><input type="checkbox" ${t.done?'checked':''} onchange="dailyToggleTreatment('${t.id}')">
                    <div class="txt"><div class="${t.done?'done-strike':''}">🧴 ${esc(t.name)}</div>
                    <div class="day">يوم ${t.day}${timeLabel(t.time)}${t.doneDate?' · تم فى '+t.doneDate:''}${t.qty>0?' · '+t.qty+' '+(t.unit||''):''}</div></div>
                </div>`;
            const feedRow = a => {
                const done = isAdditiveExecutedToday(b, a.id, date);
                const action = isFuture ? lockNote : done
                    ? '<span class="pill ok" style="font-size:10px;">✅ نُفّذ</span>'
                    : `<button class="btn gold sm" onclick="dailyApplyAdditive('feed','${a.id}')">✅ تنفيذ</button>`;
                return `<div class="check-row"><div class="txt"><div>🌾 ${esc(a.name)} <span style="font-size:10.5px;color:var(--muted);">(${additivePeriodLabel(a)})${timeLabel(a.time)}</span></div>
                    <div class="day">الجرعة: ${a.dose} ${a.unit}/${a.per}</div></div>
                    ${action}
                </div>`;
            };
            const waterRow = a => {
                const done = isAdditiveExecutedToday(b, a.id, date);
                const action = isFuture ? lockNote : done
                    ? '<span class="pill info" style="font-size:10px;">✅ نُفّذ</span>'
                    : `<button class="btn gold sm" onclick="dailyApplyAdditive('water','${a.id}')">✅ تنفيذ</button>`;
                return `<div class="check-row"><div class="txt"><div>💧 ${esc(a.name)} <span style="font-size:10.5px;color:var(--muted);">(${additivePeriodLabel(a)})${timeLabel(a.time)}</span></div>
                    <div class="day">الجرعة: ${a.dose} ${a.unit}/${a.per}</div></div>
                    ${action}
                </div>`;
            };

            if (boxDay) {
                const has = dueVacc.length || dueTreatDay.length || activeFeedDay.length || activeWaterDay.length;
                if (!has) { boxDay.innerHTML = ''; boxDay.style.display = 'none'; }
                else {
                    boxDay.style.display = '';
                    boxDay.innerHTML = `<div style="font-weight:800;color:var(--barn);">📌 مهام نهار ${date} — علّم «تم التنفيذ» ليُخصم تلقائياً من المخزن بالاسم</div>
                        ${groupHtml('💉 تحصينات مستحقة', dueVacc.map(vaccRow).join(''))}
                        ${groupHtml('🧴 معاملات مستحقة (نهار)', dueTreatDay.map(treatRow).join(''))}
                        ${groupHtml('🌾 إضافات علف مستحقة (نهار)', activeFeedDay.map(feedRow).join(''))}
                        ${groupHtml('💧 إضافات ماء مستحقة (نهار)', activeWaterDay.map(waterRow).join(''))}`;
                }
            }
            if (boxNight) {
                const has = dueTreatNight.length || activeFeedNight.length || activeWaterNight.length;
                if (!has) { boxNight.innerHTML = ''; boxNight.style.display = 'none'; }
                else {
                    boxNight.style.display = '';
                    boxNight.innerHTML = `<div style="font-weight:800;color:var(--barn);">📌 مهام ليل ${date} — علّم «تم التنفيذ» ليُخصم تلقائياً من المخزن بالاسم</div>
                        ${groupHtml('🧴 معاملات مستحقة (ليل)', dueTreatNight.map(treatRow).join(''))}
                        ${groupHtml('🌾 إضافات علف مستحقة (ليل)', activeFeedNight.map(feedRow).join(''))}
                        ${groupHtml('💧 إضافات ماء مستحقة (ليل)', activeWaterNight.map(waterRow).join(''))}`;
                }
            }
        }

        function dailyToggleVaccine(id) { toggleVaccine(id); renderDailyDueTasks(); }
        function dailyToggleTreatment(id) { toggleTreatment(id); renderDailyDueTasks(); }
        function dailyApplyAdditive(type, id) {
            const feedDayInput = parseFloatOrNull(document.getElementById('d_feed_day').value);
            const feedNightInput = parseFloatOrNull(document.getElementById('d_feed_night').value);
            const waterDayInput = parseFloatOrNull(document.getElementById('d_water_day').value);
            const waterNightInput = parseFloatOrNull(document.getElementById('d_water_night').value);
            const feedTotal = (feedDayInput || 0) + (feedNightInput || 0);
            const waterTotal = (waterDayInput || 0) + (waterNightInput || 0);
            const ageInput = parseInt(document.getElementById('d_age').value);
            const dateInput = document.getElementById('d_date').value;
            applyAdditiveToday(type, id, {
                feedKg: feedTotal > 0 ? feedTotal : null,
                waterL: waterTotal > 0 ? waterTotal : null,
                feedDay: feedDayInput,
                feedNight: feedNightInput,
                waterDay: waterDayInput,
                waterNight: waterNightInput,
                age: !isNaN(ageInput) ? ageInput : null,
                date: dateInput || null
            });
            renderDailyDueTasks();
        }

        // لو المستخدم غيّر صنف العلف يدويًا فى النموذج المفتوح حاليًا، منوقفش نحوّله تلقائيًا تاني
        // (زي تغيير التاريخ) عشان مانفرضش عليه اختيارنا فوق اختياره الصريح — بس التحذير لو فيه اختلاف يفضل ظاهر.
        let feedItemManuallyOverridden = false;
        let feedItemNightManuallyOverridden = false;

        // ⚠️ إصلاح فهم: "الأساسيات"/"تسجيل النهار"/"تسجيل الليل" كل واحد فيهم زرار بيدخلك لصفحته لوحدها
        // (يظهر هو بس، الباقي بيتخفي) — مش تقسيم شاشة بيعرض النهار والليل مع بعض جنب بعض. "full" وضع داخلي
        // بيستخدمه تعديل سجل قديم بس (يعرض التلاتة مع بعض للمراجعة الكاملة)، مش زرار ظاهر للمستخدم.
        let dailyModalMode = 'day';
        function setDailyModalMode(mode) {
            dailyModalMode = mode;
            const essentialsBox = document.getElementById('essentialsBox');
            const dayBox = document.getElementById('dayBox');
            const nightBox = document.getElementById('nightBox');
            if (!essentialsBox || !dayBox || !nightBox) return;
            essentialsBox.style.display = (mode === 'essentials' || mode === 'full') ? '' : 'none';
            dayBox.style.display = (mode === 'day' || mode === 'full') ? '' : 'none';
            nightBox.style.display = (mode === 'night' || mode === 'full') ? '' : 'none';
            ['d_modeBtnEssentials', 'd_modeBtnDay', 'd_modeBtnNight'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('gold');
            });
            const activeBtnId = mode === 'essentials' ? 'd_modeBtnEssentials' : mode === 'night' ? 'd_modeBtnNight' : mode === 'day' ? 'd_modeBtnDay' : null;
            const activeBtn = activeBtnId && document.getElementById(activeBtnId);
            if (activeBtn) activeBtn.classList.add('gold');
            const fullSaveRow = document.getElementById('d_saveBtn') && document.getElementById('d_saveBtn').closest('.row-actions');
            if (fullSaveRow) fullSaveRow.style.display = (mode === 'full') ? '' : 'none';
            if (mode !== 'full') requestAnimationFrame(() => (essentialsBox.closest('.modal') || essentialsBox.parentElement).scrollTop = 0);
            updateMortTotalPreview();
            renderDailyDueTasks();
        }

        // يعرض إجمالي النفوق/المستبعد لليوم (نهار + ليل مجتمعين، للقراءة فقط) فوق القسمين، حتى لو كان أحدهما مخفيًا حاليًا.
        // تصنيف سبب النفوق يبقى مستقلاً تمامًا لكل فترة (نهار/ليل) ويتحقق كل واحد من رقمه فقط بدون ربط بالآخر.
        // ============ 🆕 آليات إدخال جديدة لتبويب التسجيل اليومي (عداد / مقياس تعبيري / نسخ من أمس) ============
        // عداد +/- بديل لكتابة رقم يدويًا فى حقول الإنتاج المتكررة (نفوق/مستبعد/أسباب) — بيدسبتش حدث
        // 'input' حقيقي على الحقل عشان أي oninput موجود أصلاً (زي updateMortTotalPreview) يفضل شغال زي ما هو بدون تعديل.
        function stepInput(id, delta, min) {
            const el = document.getElementById(id);
            if (!el) return;
            const cur = parseFloat(el.value) || 0;
            const next = Math.max(min != null ? min : -Infinity, cur + delta);
            el.value = next;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // مقياس تعبيري بالألوان بدل رقم مجرد 1-10 — بيكتب القيمة فى حقل d_health المخفي زي ما كان بالظبط
        function setHealthRating(v, btn) {
            document.getElementById('d_health').value = v;
            document.querySelectorAll('#d_health_scale .hs-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
        }
        // بيحدد أقرب زرار للقيمة المخزّنة وقت فتح سجل قديم للتعديل (بيانات قديمة ممكن تكون بأي رقم من 1-10)
        function highlightHealthScale(v) {
            const scale = document.getElementById('d_health_scale');
            if (!scale) return;
            scale.querySelectorAll('.hs-btn').forEach(b => b.classList.remove('active'));
            if (v == null || v === '') return;
            let best = null, bestDiff = Infinity;
            scale.querySelectorAll('.hs-btn').forEach(b => {
                const d = Math.abs(parseFloat(b.dataset.v) - v);
                if (d < bestDiff) { bestDiff = d; best = b; }
            });
            if (best) best.classList.add('active');
        }
        // نسخ القيم البيئية (حرارة/رطوبة/سرعة هواء/CO2/NH3/O2) من سجل أمس لنفس الفترة (نهار/ليل) —
        // بيوفر إعادة كتابة قيم بتتغير بالتدريج مش بشكل جذري يوم بيوم؛ المستخدم يعدّل الفرق بس.
        function copyYesterdayEnv(period) {
            const b = getActiveBatch();
            if (!b) return;
            const curDate = document.getElementById('d_date').value || todayStr();
            const prev = new Date(curDate + 'T00:00:00'); prev.setDate(prev.getDate() - 1);
            const prevStr = prev.toISOString().slice(0, 10);
            const yr = b.records.find(r => r.date === prevStr);
            if (!yr) { showToast('⚠️ لا يوجد سجل ليوم أمس لنسخ بياناته'); return; }
            const suffix = period === 'night' ? 'Night' : 'Day';
            const fields = { temp: 'd_temp_', humidity: 'd_humidity_', airspeed: 'd_airspeed_', co2: 'd_co2_', nh3: 'd_nh3_', o2: 'd_o2_' };
            let copied = 0;
            Object.keys(fields).forEach(k => {
                const val = yr[k + suffix];
                const el = document.getElementById(fields[k] + period);
                if (val != null && el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); copied++; }
            });
            showToast(copied ? `✅ اتنسخ ${copied} قيمة بيئية من سجل أمس — عدّل الفرق لو محتاج` : '⚠️ سجل أمس مفيهوش قيم بيئية مسجّلة');
        }
        function updateMortTotalPreview() {
            const box = document.getElementById('d_mortTotalBox');
            if (!box) return;
            const md = parseFloat(document.getElementById('d_mort_day').value) || 0;
            const mn = parseFloat(document.getElementById('d_mort_night').value) || 0;
            const cd = parseFloat(document.getElementById('d_cull_day').value) || 0;
            const cn = parseFloat(document.getElementById('d_cull_night').value) || 0;
            box.innerHTML = `💀 إجمالي نفوق اليوم: <b>${md + mn}</b> (☀️${md} / 🌙${mn}) &nbsp;|&nbsp; 🚫 إجمالي مستبعد اليوم: <b>${cd + cn}</b> (☀️${cd} / 🌙${cn})`;
            checkMortCauseHint('day', md);
            checkMortCauseHint('night', mn);
        }
        function checkMortCauseHint(period, totalMort) {
            const hint = document.getElementById(period === 'day' ? 'd_mortCauseHintDay' : 'd_mortCauseHintNight');
            if (!hint) return;
            const causeSum = ['heat', 'disease', 'trample', 'deform', 'other']
                .reduce((s, k) => s + (parseFloat(document.getElementById(`d_mc_${k}_${period}`).value) || 0), 0);
            if (totalMort === 0 && causeSum === 0) hint.textContent = '';
            else if (causeSum === totalMort) hint.innerHTML = `✅ التصنيف مطابق لإجمالي نفوق ${period === 'day' ? 'النهار' : 'الليل'} (${causeSum})`;
            else hint.innerHTML = `⚠️ مجموع التصنيف (${causeSum}) لا يطابق إجمالي نفوق ${period === 'day' ? 'النهار' : 'الليل'} (${totalMort}) — تأكد من الأرقام`;
        }

        // ============ صور توثيقية للسجل اليومي (حتى 3 صور) ============
        let dailyPhotoDataArr = [];
        const MAX_DAILY_PHOTOS = 3;
        // ============ ضغط أي صورة مرفوعة إلى JPEG صغير الحجم (مشتركة بين الصورة التوثيقية اليومية وصور المنتجات وصور تحليل القطيع) ============
        function compressImageFile(file, maxW, quality, callback) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, maxW / img.width);
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    callback(canvas.toDataURL('image/jpeg', quality));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
        function handlePhotoUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (dailyPhotoDataArr.length >= MAX_DAILY_PHOTOS) { showToast(`⚠️ الحد الأقصى ${MAX_DAILY_PHOTOS} صور لكل سجل يوم`); event.target.value=''; return; }
            compressImageFile(file, 800, 0.6, (dataUrl) => { dailyPhotoDataArr.push(dataUrl); renderPhotoPreview(); event.target.value=''; });
        }
        function renderPhotoPreview() {
            const box = document.getElementById('d_photo_preview');
            if (!box) return;
            box.innerHTML = dailyPhotoDataArr.length
                ? dailyPhotoDataArr.map((src, i) => `<div style="position:relative;display:inline-block;margin:0 6px 6px 0;"><img src="${src}" style="max-width:110px;max-height:110px;border-radius:8px;border:1px solid var(--line);"><button type="button" class="btn danger xs" style="position:absolute;top:-8px;left:-8px;" onclick="removeDailyPhoto(${i})">🗑️</button></div>`).join('')
                    + (dailyPhotoDataArr.length < MAX_DAILY_PHOTOS ? `<div style="font-size:10.5px;color:var(--muted);">يمكن إضافة ${MAX_DAILY_PHOTOS - dailyPhotoDataArr.length} صورة أخرى</div>` : '')
                : '';
        }
        function removeDailyPhoto(i) { dailyPhotoDataArr.splice(i, 1); renderPhotoPreview(); document.getElementById('d_photo_input').value = ''; }

        // ============ عرض صور سجل يوم سابق ومشاركتها مع الطبيب/المورد عبر واتساب ============
        // ملاحظة: روابط واتساب لا تدعم إرفاق صورة تلقائيًا، فالزر بيفتح محادثة بملخص جاهز، والصورة تتضاف يدويًا من المعرض (نفس الصورة المحفوظة هنا).
        function viewBioPhoto(id) {
            const b = getActiveBatch();
            const e = b && b.biosecurityLog.find(x => x.id === id);
            if (!e || !e.photo) return;
            document.getElementById('photoViewBox').innerHTML = `<img src="${e.photo}" style="max-width:250px;border-radius:8px;border:1px solid var(--line);">`;
            document.getElementById('photoViewShareBox').innerHTML = `<p style="font-size:11px;color:var(--muted);">${esc(e.type)}${e.stage?' — '+(e.stage==='before'?'قبل التنظيف':'بعد التنظيف'):''} · ${e.date}</p>`;
            openModal('photoViewModalOverlay');
        }
        function viewRecordPhotos(date) {
            const b = getActiveBatch();
            if (!b) return;
            const r = b.records.find(x => x.date === date);
            if (!r) return;
            const photos = getRecordPhotos(r);
            const box = document.getElementById('photoViewBox');
            box.innerHTML = photos.length
                ? photos.map(src => `<img src="${src}" style="max-width:150px;max-height:150px;border-radius:8px;border:1px solid var(--line);">`).join('')
                : '<div class="empty" style="padding:14px;">لا توجد صور لهذا اليوم.</div>';
            const vets = state.contacts.filter(c => c.role === 'طبيب بيطري');
            const shareBox = document.getElementById('photoViewShareBox');
            if (photos.length && vets.length) {
                const text = `استشارة بخصوص دفعة "${b.name}" — يوم ${date} (عمر ${r.age}). ملاحظات: ${r.notesDay || r.notesNight || 'بدون ملاحظات'}. مرفق صورة توضيحية (سيتم إرفاقها يدويًا).`;
                shareBox.innerHTML = `<p style="font-size:11px;color:var(--muted);margin:0 0 6px;">شارك ملخص اليوم مع الطبيب، ثم أرفق نفس الصورة يدويًا من معرض صورك داخل نفس المحادثة:</p>` +
                    vets.map(v => `<a class="btn ghost block" style="margin-top:6px;color:#25D366;" href="${waLink(v.phone, text)}" target="_blank" rel="noopener">💬 مشاركة مع ${esc(v.name)} عبر واتساب</a>`).join('');
            } else if (photos.length) {
                shareBox.innerHTML = `<p style="font-size:11px;color:var(--muted);">أضف طبيب بيطري فى "جهات الاتصال السريعة" بالإعدادات عشان تقدر تشارك الصور معاه بضغطة واحدة.</p>`;
            } else {
                shareBox.innerHTML = '';
            }
            openModal('photoViewModalOverlay');
        }

        // ============ صور وتسجيل صوتي مرفقين بالحالة الظاهرية تحديدًا (منفصلين عن صور اليوم العامة) ============
        let clinicalPhotoDataArr = [];
        const MAX_CLINICAL_PHOTOS = 2;
        function handleClinicalPhotoUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (clinicalPhotoDataArr.length >= MAX_CLINICAL_PHOTOS) { showToast(`⚠️ الحد الأقصى ${MAX_CLINICAL_PHOTOS} صور للحالة`); event.target.value = ''; return; }
            compressImageFile(file, 800, 0.6, (dataUrl) => { clinicalPhotoDataArr.push(dataUrl); renderClinicalPhotoPreview(); event.target.value = ''; });
        }
        function renderClinicalPhotoPreview() {
            const box = document.getElementById('d_clinical_photo_preview');
            if (!box) return;
            box.innerHTML = clinicalPhotoDataArr.length
                ? clinicalPhotoDataArr.map((src, i) => `<div style="position:relative;display:inline-block;margin:0 6px 6px 0;"><img src="${src}" style="max-width:110px;max-height:110px;border-radius:8px;border:1px solid var(--line);"><button type="button" class="btn danger xs" style="position:absolute;top:-8px;left:-8px;" onclick="removeClinicalPhoto(${i})">🗑️</button></div>`).join('')
                : '';
        }
        function removeClinicalPhoto(i) { clinicalPhotoDataArr.splice(i, 1); renderClinicalPhotoPreview(); document.getElementById('d_clinical_photo_input').value = ''; }

        let clinicalMediaRecorder = null;
        let clinicalAudioChunks = [];
        let clinicalAudioDataUrl = null;
        let clinicalAudioTimerInterval = null;
        let clinicalAudioStartedAt = null;
        const MAX_CLINICAL_AUDIO_SECONDS = 15;
        function toggleClinicalAudioRecording() {
            if (clinicalMediaRecorder && clinicalMediaRecorder.state === 'recording') { clinicalMediaRecorder.stop(); return; }
            if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast('⚠️ تسجيل الصوت مش مدعوم على المتصفح/الجهاز ده'); return;
            }
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                clinicalAudioChunks = [];
                let mimeType = '';
                if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
                else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
                clinicalMediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
                clinicalMediaRecorder.ondataavailable = e => { if (e.data && e.data.size) clinicalAudioChunks.push(e.data); };
                clinicalMediaRecorder.onstop = () => {
                    stream.getTracks().forEach(t => t.stop());
                    clearInterval(clinicalAudioTimerInterval);
                    document.getElementById('d_clinical_audio_timer').textContent = '';
                    document.getElementById('d_clinical_audio_recordBtn').textContent = '🎙️ بدء التسجيل';
                    const blob = new Blob(clinicalAudioChunks, { type: clinicalMediaRecorder.mimeType || 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = () => { clinicalAudioDataUrl = reader.result; renderClinicalAudioPreview(); };
                    reader.readAsDataURL(blob);
                };
                clinicalMediaRecorder.start();
                clinicalAudioStartedAt = Date.now();
                document.getElementById('d_clinical_audio_recordBtn').textContent = '⏹️ إيقاف التسجيل';
                clinicalAudioTimerInterval = setInterval(() => {
                    const secs = Math.floor((Date.now() - clinicalAudioStartedAt) / 1000);
                    document.getElementById('d_clinical_audio_timer').textContent = `⏱️ ${secs} ث`;
                    if (secs >= MAX_CLINICAL_AUDIO_SECONDS) clinicalMediaRecorder.stop();
                }, 250);
            }).catch(() => showToast('⚠️ محتاجين إذن الميكروفون عشان نسجّل الصوت'));
        }
        function renderClinicalAudioPreview() {
            const box = document.getElementById('d_clinical_audio_preview');
            if (!box) return;
            box.innerHTML = clinicalAudioDataUrl
                ? `<audio controls src="${clinicalAudioDataUrl}" style="max-width:220px;vertical-align:middle;"></audio> <button type="button" class="btn danger sm" onclick="removeClinicalAudio()">🗑️</button>`
                : '';
        }
        function removeClinicalAudio() { clinicalAudioDataUrl = null; renderClinicalAudioPreview(); }

        // ============ فورم الحالة الظاهرية (فحص سريري) — بيتبني مرة واحدة عند فتح المودال من CLINICAL_SIGN_GROUPS ============
        function renderClinicalSignsCheckboxes() {
            const box = document.getElementById('d_clinicalSignsGroups');
            if (!box) return;
            box.innerHTML = CLINICAL_SIGN_GROUPS.map(g => `
                <div style="margin-top:6px;"><div style="font-size:12px;font-weight:700;color:#8a5a34;margin-bottom:3px;">${g.label}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;">
                    ${g.signs.map(s => `<label style="display:flex;align-items:center;gap:4px;background:#fff;border:1px solid #ecd3ba;border-radius:8px;padding:4px 8px;font-size:11.5px;cursor:pointer;">
                        <input type="checkbox" class="clinicalSignChk" data-group="${g.key}" data-code="${s.code}" onchange="updateClinicalPredictionPreview()" style="width:auto;">${s.label}</label>`).join('')}
                </div></div>`).join('');
        }
        // بيرجع كائن {groupKey: [codes]} من الاختيارات الحالية فى الفورم (سواء متسجلة أو لسه المستخدم بيدخلها)
        function readClinicalSignsFromForm() {
            const result = {};
            document.querySelectorAll('.clinicalSignChk:checked').forEach(chk => {
                const g = chk.getAttribute('data-group'), c = chk.getAttribute('data-code');
                if (!result[g]) result[g] = [];
                result[g].push(c);
            });
            const pctEl = document.getElementById('d_clinicalAffectedPct');
            result.affectedPct = pctEl ? pctEl.value : 'none';
            if (clinicalPhotoDataArr.length) result.photos = clinicalPhotoDataArr.slice();
            if (clinicalAudioDataUrl) result.respiratoryAudio = clinicalAudioDataUrl;
            return result;
        }
        function setClinicalSignsInForm(signs) {
            const s = signs || {};
            document.querySelectorAll('.clinicalSignChk').forEach(chk => {
                const g = chk.getAttribute('data-group'), c = chk.getAttribute('data-code');
                chk.checked = !!(s[g] && s[g].includes(c));
            });
            const pctEl = document.getElementById('d_clinicalAffectedPct');
            if (pctEl) pctEl.value = s.affectedPct || 'none';
            clinicalPhotoDataArr = s.photos ? s.photos.slice() : [];
            renderClinicalPhotoPreview();
            clinicalAudioDataUrl = s.respiratoryAudio || null;
            renderClinicalAudioPreview();
            // 🔧 لو السجل بتاع يوم اتسجّل فيه أعراض/صورة/صوت قبل كده، افتح القسم تلقائيًا (بدل ما يتخبى جوّه
            // details مطوية ومايلاحظش المستخدم إن فيه بيانات موجودة أصلاً وقت المراجعة أو التعديل)
            const sectionEl = document.getElementById('d_clinicalSection');
            if (sectionEl && (s.photos || s.respiratoryAudio || Object.keys(s).some(k => k !== 'affectedPct' && (s[k] || []).length))) sectionEl.open = true;
        }
        // معاينة حية للتوقع الاستباقي أثناء تعليم الأعراض — بتتحدّث فورًا من غير ما تحتاج حفظ السجل الأول
        function updateClinicalPredictionPreview() {
            const predBox = document.getElementById('d_clinicalPredictionBox');
            if (!predBox) return;
            const b = getActiveBatch();
            if (!b) { predBox.innerHTML = ''; return; }
            const signs = readClinicalSignsFromForm();
            const hasAny = CLINICAL_SIGN_GROUPS.some(g => (signs[g.key] || []).length);
            if (!hasAny) { predBox.innerHTML = ''; return; }
            const { predictions, persistingSigns } = computeSymptomPrediction(b, signs);
            if (!predictions.length) {
                predBox.innerHTML = `<div style="font-size:11.5px;color:var(--muted);">📋 الأعراض المسجّلة مش مطابقة لنمط معروف حاليًا فى مرجعنا العام — استمر فى المتابعة، وسجّلها فى الملاحظات لو استمرت.</div>`;
                return;
            }
            const persistNote = persistingSigns.length ? `<div style="font-size:11px;color:#b45309;margin-bottom:5px;">⏱️ فيه ${persistingSigns.length} عرض مستمر من إمبارح — ده بيرفع درجة الإلحاح.</div>` : '';
            predBox.innerHTML = persistNote + predictions.slice(0, 3).map(p => `
                <div style="background:#fff;border:1px solid ${p.urgent ? '#e08a7f' : '#ecd3ba'};border-radius:10px;padding:8px 10px;margin-bottom:6px;">
                    <div style="font-weight:800;font-size:12.5px;color:${p.urgent ? '#8a3a34' : '#6B4226'};">${p.urgent ? '🔴' : '🟡'} ${esc(p.name)}</div>
                    <div style="font-size:11px;color:var(--muted);margin:2px 0 4px;">${p.confidenceLabel}${p.personalWeightPct ? ` · ذاكرتك الشخصية ${p.personalWeightPct}%` : ''}</div>
                    <div style="font-size:11.5px;">💡 ${esc(p.recommendation)}</div>
                    ${p.personalHistoryNote ? `<div style="font-size:10.5px;color:#8a5a34;margin-top:4px;">📓 ${esc(p.personalHistoryNote)}</div>` : ''}
                </div>`).join('') +
                `<div style="font-size:10px;color:var(--muted);margin-top:2px;">⚠️ ده استرشاد أولي مبني على الأعراض الظاهرة بس، مش تشخيص نهائي — التأكيد دايمًا محتاج طبيب بيطري ميداني أو تحليل معملي.</div>`;
        }

        function openDailyModal(mode) {
            const b = getActiveBatch();
            if (!b) { showToast('أضف دفعة أولاً'); return; }
            feedItemManuallyOverridden = false; // جلسة تسجيل جديدة — نسمح باقتراح الصنف المناسب تلقائيًا من جديد
            feedItemNightManuallyOverridden = false;
            renderClinicalSignsCheckboxes();
            const date = todayStr();
            const existing = b.records.find(r => r.date === date);
            if (existing) {
                // يوجد سجل بالفعل لهذا اليوم (مثلاً تم تسجيل النهار سابقًا) — نُحمّله كاملاً حتى لا نفقد
                // بياناته عند حفظ القسم الآخر (الليل) لاحقًا لنفس التاريخ.
                editingDailyDate = date;
                fillDailyForm(existing);
            } else {
                editingDailyDate = null;
                ['d_feed_day', 'd_feed_night', 'd_water_day', 'd_water_night', 'd_weight', 'd_notes_day', 'd_notes_night',
                    'd_temp_day', 'd_temp_night', 'd_humidity_day', 'd_humidity_night',
                    'd_airspeed_day', 'd_airspeed_night', 'd_co2_day', 'd_co2_night',
                    'd_nh3_day', 'd_nh3_night', 'd_o2_day', 'd_o2_night',
                    'd_health', 'd_light', 'd_dark', 'd_weightSample', 'd_waterPh', 'd_waterSalinity'
                ].forEach(id => document.getElementById(id).value = '');
                document.getElementById('d_mort_day').value = 0;
                document.getElementById('d_cull_day').value = 0;
                document.getElementById('d_mort_night').value = 0;
                document.getElementById('d_cull_night').value = 0;
                highlightHealthScale(null);
                setClinicalSignsInForm(null);
                const clinicalSectionEl = document.getElementById('d_clinicalSection');
                if (clinicalSectionEl) clinicalSectionEl.open = false; // سجل جديد ← يفضل مطوي افتراضيًا لحد ما يتحدد فيه حاجة
                document.getElementById('d_clinicalPredictionBox').innerHTML = '';
                if (clinicalMediaRecorder && clinicalMediaRecorder.state === 'recording') clinicalMediaRecorder.stop();
                ['d_mc_heat_day', 'd_mc_disease_day', 'd_mc_trample_day', 'd_mc_deform_day', 'd_mc_other_day',
                    'd_mc_heat_night', 'd_mc_disease_night', 'd_mc_trample_night', 'd_mc_deform_night', 'd_mc_other_night'].forEach(id => document.getElementById(id).value = 0);
                dailyPhotoDataArr = [];
                if (document.getElementById('d_photo_input')) document.getElementById('d_photo_input').value = '';
                renderPhotoPreview();
                const wrap = document.getElementById('feedNightSelectWrap');
                const link = document.getElementById('feedNightDiffToggleBox');
                if (wrap) wrap.style.display = 'none';
                if (link) link.style.display = '';
                document.getElementById('d_date').value = date;
                recalcAge();
                updateDayNightPreview();
            }
            setDailyModalMode(mode || 'day');
            document.getElementById('d_date').max = todayStr();
            dailyFormDirty = false;
            ['d_saveBtn', 'd_saveBtnDay', 'd_saveBtnNight', 'd_saveBtnEssentials'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = false;
            });
            document.getElementById('dailyModalOverlay').classList.add('show');
        }

        function quickReorderPurchase(name, qty, unit) {
            openPurchaseModal();
            const b = getActiveBatch();
            const invItem = b && (b.inventory || []).find(it => it.name === name);
            if (invItem && invItem.category) document.getElementById('p_type').value = invItem.category;
            document.getElementById('p_desc').value = name;
            document.getElementById('p_qty').value = qty;
            const unitSel = document.getElementById('p_unit');
            if (unitSel && [...unitSel.options].some(o => o.value === unit)) unitSel.value = unit;
            recalcPurchaseTotal();
        }
        function openPurchaseModal() { if (!getActiveBatch()) { showToast('أضف دفعة أولاً'); return; }
            editingPurchaseId = null;
            ['p_desc', 'p_supplier', 'p_lot', 'p_qty', 'p_price', 'p_total', 'p_due', 'p_dueTime', 'p_expiry'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            if (document.getElementById('p_dueLead')) document.getElementById('p_dueLead').value = '60';
            document.getElementById('p_qty').value = 1;
            document.getElementById('p_date').value = todayStr(); document.getElementById('p_date').max = todayStr();
            document.getElementById('p_paid').value = '1';
            togglePurchaseDue();
            const chipsBox = document.getElementById('p_supplierChips');
            if (chipsBox) chipsBox.innerHTML = renderQuickContactChips('مورد') + renderQuickContactChips('طبيب بيطري');
            document.getElementById('purModalOverlay').classList.add('show'); }

        function manureSaleInfo(b) {
            const ft = (b && b.floorType) || 'litter';
            if (ft === 'cage') return { optLabel: 'زرق / سباخ (بدون فرشة)', hint: '💡 نظام البطاريات ينتج زرقًا مباشرًا بدون خلط بنشارة — وزنه النوعي وسعره التجاري يختلفان عن السبلة التقليدية، فراجع السعر المناسب محليًا قبل الحساب.' };
            if (ft === 'slat') return { optLabel: 'مخلفات (زرق أسفل الأرضية الشبكية)', hint: '💡 الأرضية الشبكية تفصل الطائر عن الزرق مباشرة أسفلها — احسب الحجم على أساس ارتفاع تراكم الزرق الفعلي أسفل الشبك، لا ارتفاع فرشة تقليدية.' };
            return { optLabel: 'سبلة / مخلفات', hint: '💡 السبلة هنا خليط الفرشة (نشارة/قش) مع الزرق المتراكم طوال الدورة.' };
        }
        function openSaleModal() {
            const b = getActiveBatch();
            if (!b) { showToast('أضف دفعة أولاً'); return; }
            editingSaleId = null;
            ['s_buyer', 's_count', 's_weight', 's_price', 's_total', 's_litterheight', 's_litterprice', 's_littervolume', 's_carcassyield', 's_processcost', 's_due', 's_dueTime']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            if (document.getElementById('s_dueLead')) document.getElementById('s_dueLead').value = '60';
            document.getElementById('s_kind').value = 'meat';
            document.getElementById('s_producttype').value = 'live';
            toggleSaleKind();
            const latestPrice = getLatestMarketPrice(b);
            if (latestPrice != null) document.getElementById('s_price').value = latestPrice;
            const mInfo = manureSaleInfo(b);
            document.getElementById('s_kindLitterOpt').textContent = mInfo.optLabel;
            const hintEl = document.getElementById('saleLitterHint'); if (hintEl) hintEl.textContent = mInfo.hint;
            document.getElementById('s_litterarea').value = b.area || '';
            document.getElementById('s_date').value = todayStr(); document.getElementById('s_date').max = todayStr();
            document.getElementById('s_paid').value = '1';
            toggleSaleDue();
            document.getElementById('saleModalOverlay').classList.add('show');
        }

        function openCustomModal() { if (!getActiveBatch()) { showToast('أضف دفعة أولاً'); return; }
            editingCustomId = null;
            ['c_name', 'c_amount', 'c_note'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('c_date').value = todayStr();
            document.getElementById('customModalOverlay').classList.add('show'); }

        // ============ Feed Formulation Calculator ============
        let feedCalcRows = [];

        // ============ حاسبة تركيز محلول الإماهة/اللقاح/المضاد فى مياه الشرب ============
