        function saveReminder() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix: نقطة الدخول الوحيدة لها (openReminderModal) owner-only بالواجهة
            const b = getActiveBatch();
            if (!b) return;
            const title = document.getElementById('r_title').value.trim();
            const date = document.getElementById('r_date').value;
            const category = document.getElementById('r_category').value;
            const repeatSel = document.getElementById('r_repeat').value;
            let repeatDays = repeatSel === 'custom' ? (parseInt(document.getElementById('r_repeat_days').value, 10) || 0) : parseInt(repeatSel, 10);
            if (repeatDays < 0 || isNaN(repeatDays)) repeatDays = 0;
            if (!title || !date) { showToast('أكمل البيانات'); return; }
            if (editingReminderId) {
                const r = b.reminders.find(x => x.id === editingReminderId);
                if (r) { r.title = title; r.date = date; r.category = category; r.repeatDays = repeatDays; }
                editingReminderId = null;
                persist();
                closeModal('reminderModalOverlay');
                document.getElementById('r_title').value = '';
                render();
                showToast('تم تحديث التنبيه ✅');
                return;
            }
            b.reminders.push({ id: uid(), title, date, category, repeatDays, done: false });
            persist();
            closeModal('reminderModalOverlay');
            document.getElementById('r_title').value = '';
            render();
            showToast(repeatDays > 0 ? 'تم إضافة التذكير المتكرر 🔔' : 'تم إضافة التنبيه 🔔');
        }

        function editReminder(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const r = b.reminders.find(x => x.id === id);
            if (!r) return;
            editingReminderId = id;
            document.getElementById('r_title').value = r.title;
            document.getElementById('r_date').value = r.date;
            document.getElementById('r_category').value = r.category || 'other';
            const rd = r.repeatDays || 0;
            document.getElementById('r_repeat').value = rd === 0 ? '0' : (rd === 1 ? '1' : (rd === 7 ? '7' : 'custom'));
            document.getElementById('r_repeat_days').value = (rd !== 0 && rd !== 1 && rd !== 7) ? rd : '';
            document.getElementById('r_repeat_custom_wrap').style.display = (rd !== 0 && rd !== 1 && rd !== 7) ? 'block' : 'none';
            document.getElementById('reminderModalTitle').textContent = '✏️ تعديل التنبيه';
            document.getElementById('reminderModalBtn').textContent = 'حفظ التعديل';
            document.getElementById('reminderModalOverlay').classList.add('show');
        }

        // ============ لو التذكير متكرر، بمجرد ما تعمل "تم" بيتحرك تلقائيًا للموعد الجاي وبيفضل نشط (يعني بيتجدد لوحده) ============
        function toggleReminder(id) {
            const b = getActiveBatch(); const r = b.reminders.find(r => r.id === id); if (!r) return;
            if (!r.done && r.repeatDays > 0) {
                // تنفيذ تذكير متكرر: نسجّل تاريخ آخر تنفيذ وننقل الموعد للمرة الجاية بدل ما نعلّمه "تم" نهائيًا
                r.lastDoneDate = todayStr();
                r.completedCount = (r.completedCount || 0) + 1;
                const next = new Date(r.date + 'T00:00:00');
                next.setDate(next.getDate() + r.repeatDays);
                r.date = next.toISOString().slice(0, 10);
                persist(); refreshReminderListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
                showToast(`تمام ✅ الموعد الجاي: ${r.date}`);
                return;
            }
            r.done = !r.done;
            persist();
            refreshReminderListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
        }

        function deleteReminder(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const r = b.reminders.find(r => r.id === id);
            showConfirm('حذف هذا التنبيه؟ يمكن استرجاعه لاحقًا من سلة المهملات.', () => { b.reminders = b.reminders.filter(r => r.id !== id);
                if (r) softDeleteToTrash(b, 'reminder', r, `🗑️ حذف تنبيه مخصص: ${r.title || ''}`);
                persist();
                render(); });
        }

        // (جديد) إظهار/إخفاء حقول طريقة حساب جرعة التحصين حسب الاختيار (كمية ثابتة / أمبولات لكل عدد فراخ)
        function toggleVaccineDoseModeFields() {
            const mode = document.getElementById('v_doseMode').value;
            const perBirds = mode === 'perBirds';
            document.getElementById('v_fixedDoseWrap').style.display = perBirds ? 'none' : '';
            document.getElementById('v_fixedUnitWrap').style.display = perBirds ? 'none' : '';
            document.getElementById('v_ampoulesWrap').style.display = perBirds ? '' : 'none';
            document.getElementById('v_birdsWrap').style.display = perBirds ? '' : 'none';
            document.getElementById('v_ampNote').style.display = perBirds ? '' : 'none';
        }

        function saveVaccine() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 2): deleteVaccine محمية بـ owner، الحفظ/التعديل كان مكشوف
            const b = getActiveBatch();
            if (!b) return;
            const name = document.getElementById('v_name').value.trim();
            const day = parseInt(document.getElementById('v_day').value);
            const time = document.getElementById('v_time') ? document.getElementById('v_time').value : '';
            const notifyLeadMinutes = document.getElementById('v_lead') ? parseInt(document.getElementById('v_lead').value, 10) || 0 : 0;
            const doseMode = document.getElementById('v_doseMode').value === 'perBirds' ? 'perBirds' : 'fixed';
            let qty = 0, unit = document.getElementById('v_unit').value;
            let ampoulesPerGroup = 0, birdsPerGroup = 0;
            if (doseMode === 'perBirds') {
                ampoulesPerGroup = parseFloat(document.getElementById('v_ampoulesPerGroup').value) || 0;
                birdsPerGroup = parseInt(document.getElementById('v_birdsPerGroup').value, 10) || 0;
                if (!ampoulesPerGroup || !birdsPerGroup) { showToast('أدخل عدد الأمبولات وعدد الفراخ لكل جرعة'); return; }
                unit = 'أمبول';
                // نحسب الكمية المبدئية بعدد القطيع الحي الحالي — تُعاد حسبتها تلقائيًا وقت تنفيذ التحصين الفعلي لتعكس أي تغيير فى عدد القطيع
                const mNow = computeMetrics(b);
                qty = Math.ceil(mNow.liveCount / birdsPerGroup) * ampoulesPerGroup;
            } else {
                qty = parseFloat(document.getElementById('v_qty').value) || 0;
            }
            if (!name || !day) { showToast('أكمل البيانات'); return; }
            if (editingVaccineId) {
                const v = b.vaccineLog.find(x => x.id === editingVaccineId);
                if (v) { v.day = day; v.name = name; v.qty = qty; v.unit = unit; v.doseMode = doseMode; v.ampoulesPerGroup = ampoulesPerGroup; v.birdsPerGroup = birdsPerGroup; v.time = time; v.notifyLeadMinutes = notifyLeadMinutes; }
                b.vaccineLog.sort((a, c) => a.day - c.day);
                editingVaccineId = null;
                persist();
                closeModal('vaccineModalOverlay');
                document.getElementById('v_name').value = '';
                document.getElementById('v_day').value = '';
                document.getElementById('v_qty').value = '';
                render();
                showToast('تم تحديث التحصين ✅');
                return;
            }
            b.vaccineLog.push({ id: uid(), day, name, done: false, doneDate: null, qty, unit, doseMode, ampoulesPerGroup, birdsPerGroup, time, notifyLeadMinutes });
            b.vaccineLog.sort((a, c) => a.day - c.day);
            persist();
            closeModal('vaccineModalOverlay');
            document.getElementById('v_name').value = '';
            document.getElementById('v_day').value = '';
            document.getElementById('v_qty').value = '';
            render();
            showToast('تمت إضافة التحصين للبرنامج');
        }

        function editVaccine(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const v = b.vaccineLog.find(x => x.id === id);
            if (!v) return;
            editingVaccineId = id;
            document.getElementById('v_name').value = v.name;
            document.getElementById('v_day').value = v.day;
            document.getElementById('v_qty').value = v.qty || '';
            if (document.getElementById('v_unit')) document.getElementById('v_unit').value = v.unit || document.getElementById('v_unit').value;
            document.getElementById('v_doseMode').value = v.doseMode === 'perBirds' ? 'perBirds' : 'fixed';
            document.getElementById('v_ampoulesPerGroup').value = v.ampoulesPerGroup || '';
            document.getElementById('v_birdsPerGroup').value = v.birdsPerGroup || '';
            if (document.getElementById('v_time')) document.getElementById('v_time').value = v.time || '';
            if (document.getElementById('v_lead')) document.getElementById('v_lead').value = v.notifyLeadMinutes != null ? String(v.notifyLeadMinutes) : '30';
            toggleVaccineDoseModeFields();
            document.getElementById('vaccineModalTitle').textContent = '✏️ تعديل التحصين';
            document.getElementById('vaccineModalBtn').textContent = 'حفظ التعديل';
            document.getElementById('vaccineModalOverlay').classList.add('show');
        }

        function toggleVaccine(id) {
            const b = getActiveBatch();
            const v = b.vaccineLog.find(v => v.id === id);
            if (!v) return;
            const doseUnit = v.unit || 'جرعة';
            const turningOn = !v.done;
            // (جديد) لو الجرعة محسوبة بالأمبول لكل عدد فراخ، نعيد حساب الكمية بعدد القطيع الحي الفعلي
            // وقت التنفيذ (مش وقت إضافة التحصين للبرنامج) — عشان أي نفوق لحد دلوقتي يتحسب صح
            if (turningOn && v.doseMode === 'perBirds' && v.birdsPerGroup > 0 && v.ampoulesPerGroup > 0) {
                const mNow = computeMetrics(b);
                v.qty = Math.ceil(mNow.liveCount / v.birdsPerGroup) * v.ampoulesPerGroup;
            }
            if (!turningOn) {
                // التراجع عن تنفيذ سابق: يُرجع الكمية للمخزن دائمًا، لا حاجة للتحقق من الرصيد
                v.done = false;
                v.doneDate = null;
                if (v.qty > 0) reverseStockOut(b, v.name, 'أدوية ولقاحات', v.qty, doseUnit);
                persist();
                refreshVaccineListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
                return;
            }
            if (!(v.qty > 0)) {
                v.done = true;
                v.doneDate = todayStr();
                persist();
                refreshVaccineListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
                vibrate(35);
                return;
            }
            const { it, qty: convQty } = resolveInvQty(b, v.name, 'أدوية ولقاحات', v.qty, doseUnit);
            if (convQty == null) {
                showToast(`⚠️ وحدة الجرعة "${doseUnit}" لا تتوافق مع وحدة "${it.name}" المسجلة بالمخزن "${it.unit}" — لا يمكن الخصم تلقائيًا. صحّح الوحدة من التحصين أو من المخزون.`);
                return;
            }
            const finalize = () => {
                v.done = true;
                v.doneDate = todayStr();
                stockOutByItem(b, it.id, convQty, todayStr(), `تنفيذ تحصين: ${v.name}`);
                persist();
                refreshVaccineListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
                vibrate(35);
                showToast(`✅ تم تنفيذ التحصين وخصم ${fmt(convQty,2)} ${it.unit} من المخزن`);
            };
            confirmIfShort(v.name, it.unit, it.balance, convQty, 'لتنفيذ هذا التحصين', finalize);
        }

        function deleteVaccine(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix: الزرار كان owner-only بالواجهة بس مش مطبّق فى الدالة
            const b = getActiveBatch();
            if (!b) return;
            const v = b.vaccineLog.find(v => v.id === id);
            // ⚠️ إصلاح: كان الحذف بيمسح البند من غير ما يرجّع كميته المخصومة للمخزون لو كان منفَّذ
            // بالفعل (done:true) — بعكس "إلغاء التنفيذ" اللي بيرجّعها صح. دلوقتي بنرجّع الكمية أولاً
            // (نفس منطق toggleVaccine بالظبط) قبل الحذف، ولو أنه اترجعت بننبّه المستخدم بتوست واضح.
            const wasStocked = v && v.done && v.qty > 0;
            const confirmMsg = wasStocked
                ? `حذف هذا التحصين من البرنامج؟ الكمية (${fmt(v.qty,2)} ${v.unit || 'جرعة'}) المخصومة من المخزن هترجع تلقائيًا. يمكن استرجاعه لاحقًا من سلة المهملات.`
                : 'حذف هذا التحصين من البرنامج؟ يمكن استرجاعه لاحقًا من سلة المهملات.';
            showConfirm(confirmMsg, () => {
                if (wasStocked) reverseStockOut(b, v.name, 'أدوية ولقاحات', v.qty, v.unit || 'جرعة');
                b.vaccineLog = b.vaccineLog.filter(v => v.id !== id);
                if (v) softDeleteToTrash(b, 'vaccine', v, `🗑️ حذف تحصين من البرنامج: ${v.name || ''}`);
                persist();
                render();
                if (wasStocked) showToast(`✅ تم الحذف وإرجاع ${fmt(v.qty,2)} ${v.unit || 'جرعة'} للمخزن`);
            });
        }

        function loadDefaultVaccineProgram() {
            if (currentRole !== 'owner') return;
            const b = getActiveBatch();
            if (!b) { showToast('أضف دفعة أولاً'); return; }
            const spData = getSpeciesData(b.species);
            const defaults = spData.vaccines || [];
            if (!defaults.length) { showToast('لا يوجد برنامج تحصينات قياسي مسجّل لهذا النوع بعد'); return; }
            const existing = new Set((b.vaccineLog || []).map(v => v.day + '|' + v.name));
            const toAdd = defaults.filter(v => !existing.has(v.day + '|' + v.name));
            if (!toAdd.length) { showToast('البرنامج القياسي محمّل بالفعل بالكامل'); return; }
            showConfirm(`سيتم إضافة ${toAdd.length} تحصين من البرنامج القياسي لنوع «${spData.label}» بدون حذف أي تحصين موجود عندك. متابعة؟`, () => {
                toAdd.forEach(v => b.vaccineLog.push({ id: uid(), day: v.day, name: v.name, done: false, doneDate: null }));
                b.vaccineLog.sort((a, c) => a.day - c.day);
                persist();
                render();
                showToast(`✅ تم تحميل ${toAdd.length} تحصين من البرنامج القياسي`);
            }, 'تحميل البرنامج القياسي');
        }

        function saveTreatment() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 2): deleteTreatment محمية بـ owner، الحفظ/التعديل كان مكشوف
            const b = getActiveBatch();
            if (!b) return;
            const name = document.getElementById('t_name').value.trim();
            const qty = parseFloat(document.getElementById('t_qty').value) || 0;
            const unit = document.getElementById('t_unit').value;
            const notes = (document.getElementById('t_notes') || {}).value || '';
            const time = document.getElementById('t_time') ? document.getElementById('t_time').value : '';
            const notifyLeadMinutes = document.getElementById('t_lead') ? parseInt(document.getElementById('t_lead').value, 10) || 0 : 0;
            const dayFieldVal = document.getElementById('t_day').value;
            if (!name || !dayFieldVal) { showToast('أكمل البيانات'); return; }
            if (editingTreatmentId) {
                // فى وضع التعديل نأخذ يومًا واحدًا فقط (أول يوم لو كُتبت عدة أيام)
                const days = parseDaySchedule(dayFieldVal);
                const day = days.length ? days[0] : parseInt(dayFieldVal);
                if (!day) { showToast('أدخل يوم صحيح'); return; }
                const t = b.treatmentLog.find(x => x.id === editingTreatmentId);
                if (t) { t.day = day; t.name = name; t.notes = notes.trim(); t.qty = qty; t.unit = unit; t.time = time; t.notifyLeadMinutes = notifyLeadMinutes; }
                b.treatmentLog.sort((a, c) => a.day - c.day);
                editingTreatmentId = null;
                persist();
                closeModal('treatModalOverlay');
                document.getElementById('t_name').value = '';
                document.getElementById('t_day').value = '';
                document.getElementById('t_qty').value = '';
                if (document.getElementById('t_notes')) document.getElementById('t_notes').value = '';
                render();
                showToast('✅ تم تحديث المعاملة');
                return;
            }
            // وضع الإضافة: يدعم كتابة عدة أيام تكرار معًا (مثال: 1,2,3,8-10) فيُنشأ بند مستقل لكل يوم
            const days = parseDaySchedule(dayFieldVal);
            if (!days.length) { showToast('أدخل يوم/أيام صحيحة — مثال: 14 أو 1,2,3,8-10'); return; }
            days.forEach(day => {
                b.treatmentLog.push({ id: uid(), day, name, notes: notes.trim(), done: false, doneDate: null, qty, unit, time, notifyLeadMinutes });
            });
            b.treatmentLog.sort((a, c) => a.day - c.day);
            persist();
            closeModal('treatModalOverlay');
            document.getElementById('t_name').value = '';
            document.getElementById('t_day').value = '';
            document.getElementById('t_qty').value = '';
            if (document.getElementById('t_notes')) document.getElementById('t_notes').value = '';
            render();
            showToast(days.length > 1 ? `✅ تمت إضافة المعاملة لـ ${days.length} يوم للبرنامج` : '✅ تمت إضافة المعاملة للبرنامج');
        }

        function editTreatment(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const t = b.treatmentLog.find(x => x.id === id);
            if (!t) return;
            editingTreatmentId = id;
            document.getElementById('t_name').value = t.name;
            document.getElementById('t_day').value = t.day;
            document.getElementById('t_qty').value = t.qty || '';
            if (document.getElementById('t_unit')) document.getElementById('t_unit').value = t.unit || document.getElementById('t_unit').value;
            if (document.getElementById('t_time')) document.getElementById('t_time').value = t.time || '';
            if (document.getElementById('t_lead')) document.getElementById('t_lead').value = t.notifyLeadMinutes != null ? String(t.notifyLeadMinutes) : '30';
            if (document.getElementById('t_notes')) document.getElementById('t_notes').value = t.notes || '';
            document.getElementById('treatModalTitle').textContent = '✏️ تعديل المعاملة';
            document.getElementById('treatModalBtn').textContent = 'حفظ التعديل';
            if (document.getElementById('t_dayHint')) document.getElementById('t_dayHint').textContent = 'وضع التعديل: يوم واحد فقط لهذا البند';
            document.getElementById('treatModalOverlay').classList.add('show');
        }

        function toggleTreatment(id) {
            const b = getActiveBatch();
            const t = b.treatmentLog.find(t => t.id === id);
            if (!t) return;
            const doseUnit = t.unit || 'لتر';
            const turningOn = !t.done;
            if (!turningOn) {
                // التراجع عن تنفيذ سابق: يُرجع الكمية للمخزن دائمًا، لا حاجة للتحقق من الرصيد
                t.done = false;
                t.doneDate = null;
                if (t.qty > 0) reverseStockOut(b, t.name, 'أدوية ولقاحات', t.qty, doseUnit);
                persist();
                refreshTreatmentListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
                return;
            }
            if (!(t.qty > 0)) {
                t.done = true;
                t.doneDate = todayStr();
                persist();
                refreshTreatmentListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
                return;
            }
            const { it, qty: convQty } = resolveInvQty(b, t.name, 'أدوية ولقاحات', t.qty, doseUnit);
            if (convQty == null) {
                showToast(`⚠️ وحدة "${doseUnit}" لا تتوافق مع وحدة "${it.name}" المسجلة بالمخزن "${it.unit}" — لا يمكن الخصم تلقائيًا. صحّح الوحدة من المعاملة أو من المخزون.`);
                return;
            }
            const finalize = () => {
                t.done = true;
                t.doneDate = todayStr();
                stockOutByItem(b, it.id, convQty, todayStr(), `تنفيذ معاملة فرشة: ${t.name}`);
                persist();
                refreshTreatmentListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
                showToast(`✅ تم تنفيذ المعاملة وخصم ${fmt(convQty,2)} ${it.unit} من المخزن`);
            };
            confirmIfShort(t.name, it.unit, it.balance, convQty, 'لتنفيذ هذه المعاملة', finalize);
        }

        function deleteTreatment(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const t0 = b.treatmentLog.find(t => t.id === id);
            // ⚠️ إصلاح: نفس إصلاح deleteVaccine — نرجّع الكمية المخصومة للمخزون لو المعاملة كانت
            // منفَّذة بالفعل، قبل ما نحذفها، بدل ما تضيع الكمية بصمت.
            const wasStocked = t0 && t0.done && t0.qty > 0;
            const confirmMsg = wasStocked
                ? `حذف هذه المعاملة من برنامج السبلة والفرشة؟ الكمية (${fmt(t0.qty,2)} ${t0.unit || 'لتر'}) المخصومة من المخزن هترجع تلقائيًا. يمكن استرجاعها لاحقًا من سلة المهملات.`
                : 'حذف هذه المعاملة من برنامج السبلة والفرشة؟ يمكن استرجاعها لاحقًا من سلة المهملات.';
            showConfirm(confirmMsg, () => {
                if (wasStocked) reverseStockOut(b, t0.name, 'أدوية ولقاحات', t0.qty, t0.unit || 'لتر');
                b.treatmentLog = b.treatmentLog.filter(t => t.id !== id);
                if (t0) softDeleteToTrash(b, 'treatment', t0, `🗑️ حذف معاملة فرشة/سبلة: ${t0.name || ''}`);
                persist();
                render();
                if (wasStocked) showToast(`✅ تم الحذف وإرجاع ${fmt(t0.qty,2)} ${t0.unit || 'لتر'} للمخزن`);
            });
        }

        // ============ جدولة أيام التكرار (غير متصلة) لإضافات العلف/الماء ومعاملات الفرشة ============
        // تسمح بكتابة أيام منفصلة وفواصل زمنية معًا فى حقل واحد بدل تكرار الإدخال لكل يوم أو مرحلة:
        // مثال: "1-3,8-10,15" => [1,2,3,8,9,10,15]
        function parseDaySchedule(text) {
            const days = new Set();
            String(text || '').split(',').forEach(part => {
                part = part.trim();
                if (!part) return;
                const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
                if (range) {
                    let a = parseInt(range[1], 10), z = parseInt(range[2], 10);
                    if (isNaN(a) || isNaN(z)) return;
                    if (a > z) { const t = a; a = z; z = t; }
                    for (let d = a; d <= z; d++) days.add(d);
                } else {
                    const n = parseInt(part, 10);
                    if (!isNaN(n)) days.add(n);
                }
            });
            return Array.from(days).sort((a, c) => a - c);
        }

        // يحوّل مصفوفة أيام لنص مضغوط بصيغة نطاقات: [1,2,3,8,9,10,15] => "1-3, 8-10, 15"
        function daysScheduleText(daysArr) {
            if (!daysArr || !daysArr.length) return '';
            const sorted = [...daysArr].sort((a, c) => a - c);
            const parts = [];
            let start = sorted[0], prev = sorted[0];
            for (let i = 1; i <= sorted.length; i++) {
                const cur = sorted[i];
                if (cur === prev + 1) { prev = cur; continue; }
                parts.push(start === prev ? `${start}` : `${start}-${prev}`);
                if (i < sorted.length) { start = cur; prev = cur; }
            }
            return parts.join(', ');
        }

        // هل الإضافة سارية فى يوم عمر معيّن؟ تدعم مصفوفة أيام غير متصلة (days) مع رجوع تلقائى
        // لنمط "من يوم - إلى يوم" (from/to) للبنود القديمة أو المُدخلة كنطاق متصل واحد.
        function additiveActiveOnDay(a, day) {
            if (a.days && a.days.length) return a.days.includes(day);
            return day >= (a.from || 0) && day <= (a.to || 0);
        }

        function additiveDayRange(a) {
            if (a.days && a.days.length) return { from: a.days[0], to: a.days[a.days.length - 1] };
            return { from: a.from || 0, to: a.to || 0 };
        }

        function additiveDayLabel(a) {
            if (a.days && a.days.length) return `يوم ${daysScheduleText(a.days)}`;
            return `يوم ${a.from} → ${a.to}`;
        }

        // ============ (جديد) توصية #1: عدّاد "أيام بدون مضاد حيوي" فى الدورة — نستخدم "فترة السحب > 0" كمؤشر إن الصنف دواء/مضاد وليس مكمّل غذائي (بروبيوتك/فيتامين...) ============
        function computeAntibioticStats(b, m) {
            const totalDays = Math.max(0, (b.status === 'مؤرشفة' ? (m.age || 0) : (m.todayAge || 0)));
            if (totalDays <= 0) return { totalDays: 0, antibioticDays: 0, freeDays: 0, freePct: 100 };
            // جرعات خارج الجدول (quickInterventions) بفترة سحب > 0 بتتحسب كمان كـ"يوم مضاد حيوي" — نفس منطق البند المجدول
            const qiAntibioticAges = new Set((b.quickInterventions || [])
                .filter(qi => (qi.withdrawalDays || 0) > 0)
                .map(qi => daysBetween(b.startDate, qi.date)));
            let antibioticDays = 0;
            for (let d = 1; d <= totalDays; d++) {
                const hasAntibiotic =
                    (b.feedAdditives || []).some(a => a.active && (a.withdrawalDays || 0) > 0 && additiveActiveOnDay(a, d)) ||
                    (b.waterAdditives || []).some(a => a.active && (a.withdrawalDays || 0) > 0 && additiveActiveOnDay(a, d)) ||
                    qiAntibioticAges.has(d);
                if (hasAntibiotic) antibioticDays++;
            }
            const freeDays = totalDays - antibioticDays;
            return { totalDays, antibioticDays, freeDays, freePct: totalDays > 0 ? (freeDays / totalDays) * 100 : 100 };
        }

        // توقيت إعطاء الإضافة (نهارًا/ليلاً/كلاهما) — يُستخدم فى العرض وفى حساب كمية الخصم من المخزن
        function additivePeriodLabel(a) {
            if (a.period === 'day') return '☀️ نهارًا فقط';
            if (a.period === 'night') return '🌙 ليلاً فقط';
            return '☀️🌙 نهارًا وليلاً';
        }

        // نص الساعة المفضّلة لتنفيذ إضافة/معاملة (لو محددة) — يُستخدم فى التنبيهات وقوائم العرض
        function timeLabel(t) {
            if (!t) return '';
            const [h, mnt] = t.split(':').map(Number);
            if (isNaN(h)) return '';
            const period = h >= 12 ? 'م' : 'ص';
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return ` — 🕐 الساعة ${h12}:${String(mnt).padStart(2,'0')} ${period}`;
        }

        // ============ بروتوكولات إضافات العلف/الماء ومعاملات الفرشة القابلة لإعادة الاستخدام ============
        // تسمح بحفظ برنامج الإضافات والمعاملات الحالى للدفعة كـ"بروتوكول" مُسمّى مستقل عن الدفعة،
        // لتطبيقه لاحقًا على دفعة/دورة تسمين جديدة دون إعادة كتابة كل بند من الصفر.
        function openProtocolModal() {
            renderProtocolList();
            document.getElementById('pr_name').value = '';
            document.getElementById('protocolModalOverlay').classList.add('show');
        }

        function saveProtocol() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 2): deleteProtocol محمية بـ owner، الحفظ/التعديل كان مكشوف
            const b = getActiveBatch();
            if (!b) { showToast('أضف دفعة أولاً'); return; }
            const nameInput = document.getElementById('pr_name');
            const name = nameInput.value.trim();
            if (!name) { showToast('أدخل اسمًا للبروتوكول'); return; }
            if (!state.protocols) setState('protocols', []);
            const feedCount = (b.feedAdditives || []).length;
            const waterCount = (b.waterAdditives || []).length;
            const treatCount = (b.treatmentLog || []).length;
            if (!feedCount && !waterCount && !treatCount) {
                showToast('لا توجد بنود (إضافات علف/ماء أو معاملات فرشة) بهذه الدفعة لحفظها كبروتوكول');
                return;
            }
            const proto = {
                id: uid(),
                name,
                species: b.species,
                savedAt: todayStr(),
                feedAdditives: (b.feedAdditives || []).map(a => ({
                    name: a.name, from: a.from, to: a.to, days: (a.days && a.days.length) ? [...a.days] : null,
                    dose: a.dose, unit: a.unit, per: a.per, notes: a.notes || '' })),
                waterAdditives: (b.waterAdditives || []).map(a => ({
                    name: a.name, from: a.from, to: a.to, days: (a.days && a.days.length) ? [...a.days] : null,
                    dose: a.dose, unit: a.unit, per: a.per, notes: a.notes || '' })),
                treatments: (b.treatmentLog || []).map(t => ({
                    name: t.name, day: t.day, qty: t.qty || 0, unit: t.unit || '', notes: t.notes || '' })),
            };
            state.protocols.push(proto);
            nameInput.value = '';
            persist();
            renderProtocolList();
            showToast(`✅ تم حفظ البروتوكول "${name}" (${feedCount} علف، ${waterCount} ماء، ${treatCount} فرشة) — متاح لأى دفعة قادمة`);
        }

        // ============ توليد بروتوكول محسّن آليًا: يبني بروتوكول من بنود أفضل دورة مؤرشفة (EPEF الأعلى)، ============
        // وينقّحه بمقارنة كل بند بأدائه عبر كل الدورات المؤرشفة (نفس محرك computeCrossCycleItemEffectiveness) —
        // فيسقط أي بند "دايمًا بيفرق بالسلب" أو "بدون تأثير يُذكر"، ويُبقي فقط ما أثبت فائدته أو لسه ملوش تاريخ كافٍ للحكم عليه
        function buildRefinedProtocol() {
            const b = getActiveBatch();
            if (!b) { showToast('أضف دفعة أولاً (لتحديد نوع الطائر المطلوب بناء بروتوكول له)'); return; }
            const species = b.species;
            const archived = state.batches.filter(x => x.species === species && x.status === 'مؤرشفة' && x.records && x.records.length >= 6);
            if (!archived.length) { showToast('⚠️ محتاج دورة مؤرشفة واحدة على الأقل من نفس النوع (6 سجلات على الأقل) عشان نقدر نبني بروتوكول محسّن'); return; }

            // اختيار أفضل دورة: EPEF الأعلى، وإلا FCR الأقل كبديل
            let best = null, bestScore = -Infinity;
            archived.forEach(x => {
                const xm = computeMetrics(x);
                const score = xm.epef != null ? xm.epef : (xm.fcr != null ? (10 - xm.fcr) * 100 : -Infinity);
                if (score > bestScore) { bestScore = score; best = x; }
            });
            if (!best) { showToast('⚠️ بيانات الدورات المؤرشفة غير كافية لتحديد أفضل دورة'); return; }
            const bestM = computeMetrics(best);
            if (!(best.feedAdditives || []).length && !(best.waterAdditives || []).length && !(best.treatmentLog || []).some(t => t.done)) {
                showToast(`⚠️ أفضل دورة "${best.name}" مفيهاش أي إضافات أو معاملات فرشة منفَّذة لنبني منها بروتوكول`);
                return;
            }

            const itemEff = computeCrossCycleItemEffectiveness(species) || [];
            const treatEff = computeCrossCycleTreatmentEffectiveness(species) || [];
            const kept = { feed: [], water: [], treatments: [] };
            const dropped = [];

            function evalAdditive(a, kind) {
                const prefix = normalizeArabicName(a.name + ' (' + kind + ')');
                const match = itemEff.find(r => normalizeArabicName(r.name).startsWith(prefix));
                if (!match) return { keep: true, note: 'من أفضل دورة — لسه معندوش تاريخ كافٍ عبر دورات متعددة للتأكد من فائدته' };
                if (match.verdict === 'worsen') { dropped.push({ name: a.name, kind, reason: `أثبت أثرًا سلبيًا واضحًا عبر ${match.cycles} دورة مؤرشفة` }); return { keep: false }; }
                if (match.verdict === 'none') { dropped.push({ name: a.name, kind, reason: `بدون أثر واضح عبر ${match.cycles} دورة — لا داعي للاستمرار فيه (توفير تكلفة)` }); return { keep: false }; }
                if (match.verdict === 'mixed') return { keep: true, note: `نتائج متفاوتة عبر ${match.cycles} دورة — يُنصح بمراقبته` };
                return { keep: true, note: `أثبت فائدته عبر ${match.cycles} دورة` };
            }
            (best.feedAdditives || []).forEach(a => {
                const r = evalAdditive(a, 'علف');
                if (r.keep) kept.feed.push({ name: a.name, from: a.from, to: a.to, days: (a.days && a.days.length) ? [...a.days] : null, dose: a.dose, unit: a.unit, per: a.per, notes: a.notes || '', _note: r.note });
            });
            (best.waterAdditives || []).forEach(a => {
                const r = evalAdditive(a, 'ماء');
                if (r.keep) kept.water.push({ name: a.name, from: a.from, to: a.to, days: (a.days && a.days.length) ? [...a.days] : null, dose: a.dose, unit: a.unit, per: a.per, notes: a.notes || '', _note: r.note });
            });
            // معاملات الفرشة: نأخذ فقط ما نُفِّذ فعليًا فى أفضل دورة (مش المُخطَّط وما اتنفذش)
            (best.treatmentLog || []).filter(t => t.done).forEach(t => {
                const match = treatEff.find(r => normalizeArabicName(r.name) === normalizeArabicName(t.name));
                if (!match) { kept.treatments.push({ name: t.name, day: t.day, qty: t.qty || 0, unit: t.unit || '', notes: t.notes || '', _note: 'من أفضل دورة — لسه معندوش تاريخ كافٍ للتأكد من فائدته' }); return; }
                if (match.verdict === 'worsen') { dropped.push({ name: t.name, kind: 'فرشة', reason: `أثبتت أثرًا سلبيًا واضحًا عبر ${match.cycles} دورة مؤرشفة` }); return; }
                if (match.verdict === 'none') { dropped.push({ name: t.name, kind: 'فرشة', reason: `بدون أثر واضح عبر ${match.cycles} دورة — لا داعي للاستمرار فيها` }); return; }
                const note = match.verdict === 'mixed' ? `نتائج متفاوتة عبر ${match.cycles} دورة — يُنصح بمراقبتها` : `أثبتت فائدتها عبر ${match.cycles} دورة`;
                kept.treatments.push({ name: t.name, day: t.day, qty: t.qty || 0, unit: t.unit || '', notes: t.notes || '', _note: note });
            });

            if (!kept.feed.length && !kept.water.length && !kept.treatments.length) {
                showToast('⚠️ بعد التنقيح، محدش من بنود أفضل دورة يستحق الاحتفاظ به حسب أداءه عبر دوراتك المؤرشفة');
                return;
            }

            const protoName = `🧠 بروتوكول محسّن — مبني على "${best.name}" (${todayStr()})`;
            const proto = {
                id: uid(), name: protoName, species, savedAt: todayStr(), autoGenerated: true, sourceBatchName: best.name,
                feedAdditives: kept.feed.map(({ _note, ...a }) => a),
                waterAdditives: kept.water.map(({ _note, ...a }) => a),
                treatments: kept.treatments.map(({ _note, ...t }) => t),
            };
            if (!state.protocols) setState('protocols', []);
            state.protocols.push(proto);
            persist();
            renderProtocolList();
            vibrate([40, 60, 40]);

            const keptAll = [
                ...kept.feed.map(a => ({ name: a.name, kind: 'علف', note: a._note })),
                ...kept.water.map(a => ({ name: a.name, kind: 'ماء', note: a._note })),
                ...kept.treatments.map(t => ({ name: t.name, kind: 'فرشة', note: t._note })),
            ];
            let report = `مبني على أفضل دورة مؤرشفة "<b>${esc(best.name)}</b>" (${bestM.epef != null ? `EPEF ${fmt(bestM.epef,0)}` : ''}${bestM.fcr != null ? ` · FCR ${fmt(bestM.fcr,2)}` : ''}) من إجمالي ${archived.length} دورة مؤرشفة من نفس النوع.<br><br>`;
            report += `✅ بنود محتفظ بها فى البروتوكول (${keptAll.length}):<br>` + keptAll.map(x => `• ${esc(x.name)} (${x.kind}) — ${esc(x.note)}`).join('<br>');
            if (dropped.length) {
                report += `<br><br>🚫 بنود اتشالت من البروتوكول (${dropped.length}):<br>` + dropped.map(x => `• ${esc(x.name)} (${x.kind}) — ${esc(x.reason)}`).join('<br>');
            } else {
                report += `<br><br>لا يوجد بند اتشال — كل بنود أفضل دورة إما أثبتت فائدتها أو لسه معندهاش تاريخ كافٍ للحكم عليها.`;
            }
            report += `<br><br>💾 اتحفظ باسم "${esc(protoName)}" فى قائمة البروتوكولات بالأسفل، جاهز يتطبّق على أى دفعة/دورة جديدة بضغطة واحدة.`;
            showInfo('🧠 بروتوكول محسّن جاهز', report);
        }

        // ============ توليد بروتوكول "الأفضل من كل دورة": بدل ما ناخد بنود دورة واحدة "الأفضل" وننقّحها، ============
        // هنا بنجمع كل بند (إضافة/معاملة) أثبت إنه "دايمًا بيحسّن" الأداء عبر الدورات المؤرشفة — بغض النظر عن
        // أي دورة استخدمته بالظبط. لكل بند مُثبت الفايدة، بنسحب قيمه الفعلية (جرعة/توقيت) من أفضل دورة (EPEF) من
        // بين الدورات اللى فعلًا جرّبت البند ده. النتيجة توليفة جديدة قد تكون ملهاش وجود فعليًا فى أي دورة سابقة بالظبط.
        function buildBestOfBreedProtocol() {
            const b = getActiveBatch();
            if (!b) { showToast('أضف دفعة أولاً (لتحديد نوع الطائر المطلوب بناء بروتوكول له)'); return; }
            const species = b.species;
            const archived = state.batches.filter(x => x.species === species && x.status === 'مؤرشفة' && x.records && x.records.length >= 6);
            if (archived.length < 2) { showToast('⚠️ محتاج دورتين مؤرشفتين على الأقل من نفس النوع عشان نقدر نجمع "الأفضل من كل دورة" — لو عندك دورة واحدة بس استخدم "بروتوكول محسّن" اللي فوق'); return; }

            const itemEff = computeCrossCycleItemEffectiveness(species);
            const treatEff = computeCrossCycleTreatmentEffectiveness(species);
            if (!itemEff && !treatEff) { showToast('⚠️ مفيش بنود متكررة كفاية عبر دوراتك المؤرشفة (لازم يتكرر نفس البند فى دورتين على الأقل) لبناء تحليل موثوق'); return; }

            const provenItems = (itemEff || []).filter(r => r.verdict === 'improve');
            const provenTreatments = (treatEff || []).filter(r => r.verdict === 'improve');
            if (!provenItems.length && !provenTreatments.length) { showToast('⚠️ محدش من البنود المتكررة أثبت فايدة واضحة (دايمًا بيحسّن) عبر كل دوراتك حتى الآن — لسه معندكش "أفضل ممارسات" واضحة تتجمع فى بروتوكول'); return; }

            // --- تقاطع مع "قاعدة معرفة الحوادث": بند ضار دايمًا وقت الحوادث (اتسجّل ساء الوضع وميعرفش تحسّن ولا مرة) بيتستبعد،
            // وبند "حساس للتوقيت" (مفيد فى نطاق، ضار فى نطاق تاني) بيتحط عليه ملحوظة توقيت بدل ما يتستبعد بالكامل ---
            const allIncSolutions = mineAllIncidentRecords(species).filter(inc => inc.solutionName);
            const solutionOutcomeStats = {};
            allIncSolutions.forEach(inc => {
                if (!solutionOutcomeStats[inc.solutionName]) solutionOutcomeStats[inc.solutionName] = { improved: 0, worsened: 0 };
                if (inc.outcome === 'improved') solutionOutcomeStats[inc.solutionName].improved++;
                else if (inc.outcome === 'worsened') solutionOutcomeStats[inc.solutionName].worsened++;
            });
            const incidentBlacklist = new Set(Object.entries(solutionOutcomeStats)
                .filter(([, s]) => s.worsened > 0 && s.improved === 0).map(([n]) => n));
            const sensitivity = computeSolutionContextSensitivity(species);
            const sensitivityByName = {};
            sensitivity.forEach(s => { sensitivityByName[s.name] = s; });
            const excludedByIncidents = [];
            const timingNoteFor = (name) => {
                const s = sensitivityByName[name];
                if (!s) return '';
                return ` ⚡ ملحوظة توقيت (من قاعدة معرفة الحوادث): مفيد قرب ${s.goodContexts.map(c=>`يوم ${c.ageCenter}`).join('/')} — تجنّبه قرب ${s.badContexts.map(c=>`يوم ${c.ageCenter}`).join('/')}.`;
            };

            // بيدوّر على أفضل دورة (EPEF) من بين الدورات اللى استخدمت البند ده بالتحديد، عشان ناخد منها قيمه الفعلية (جرعة/توقيت)
            function bestSourceFor(itemName, kind) {
                let best = null, bestScore = -Infinity, bestBatchName = null;
                archived.forEach(x => {
                    let arr;
                    if (kind === 'treatment') {
                        arr = (x.treatmentLog || []).filter(t => t.done && t.name === itemName);
                    } else {
                        arr = (kind === 'علف' ? (x.feedAdditives || []) : (x.waterAdditives || [])).filter(a => a.name === itemName);
                        if (!arr.length) {
                            // مفيش جدول مُعرَّف مسبقًا لهذا البند فى هذه الدورة — جرّب مصدر "إضافة خارج الجدول" (جرعة لحظية بدل جدول)
                            const qiType = kind === 'علف' ? 'feed' : 'water';
                            arr = (x.quickInterventions || []).filter(qi => qi.name === itemName && qi.type === qiType)
                                .map(qi => ({ name: qi.name, from: daysBetween(x.startDate, qi.date), to: daysBetween(x.startDate, qi.date), dose: qi.qty, unit: qi.unit, notes: `أُخذت أصلاً كإضافة خارج الجدول (${qi.reason || ''}) — راجع الجرعة والتوقيت قبل التطبيق كبرنامج ثابت` }));
                        }
                    }
                    if (!arr.length) return;
                    const xm = computeMetrics(x);
                    const score = xm.epef != null ? xm.epef : (xm.fcr != null ? (10 - xm.fcr) * 100 : 0);
                    if (score > bestScore) { bestScore = score; best = arr[0]; bestBatchName = x.name; }
                });
                return best ? { item: best, sourceBatch: bestBatchName } : null;
            }

            const kept = { feed: [], water: [], treatments: [] };
            const sources = [];
            provenItems.forEach(r => {
                const mm = r.name.match(/^(.*) \((علف|ماء)\) · .*$/);
                if (!mm) return;
                const itemName = mm[1], kind = mm[2];
                if (incidentBlacklist.has(itemName)) { excludedByIncidents.push(itemName); return; }
                const src = bestSourceFor(itemName, kind);
                if (!src) return;
                const a = src.item;
                const target = kind === 'علف' ? kept.feed : kept.water;
                if (target.some(x => x.name === a.name)) return; // نفس البند ظهر أكتر من مرة (مراحل مختلفة) — نكتفي بأول ظهور
                target.push({ name: a.name, from: a.from, to: a.to, days: (a.days && a.days.length) ? [...a.days] : null, dose: a.dose, unit: a.unit, per: a.per, notes: (a.notes || '') + timingNoteFor(a.name) });
                sources.push({ name: a.name, kind, cycles: r.cycles, sourceBatch: src.sourceBatch });
            });
            provenTreatments.forEach(r => {
                if (incidentBlacklist.has(r.name)) { excludedByIncidents.push(r.name); return; }
                const src = bestSourceFor(r.name, 'treatment');
                if (!src) return;
                const t = src.item;
                if (kept.treatments.some(x => x.name === t.name)) return;
                kept.treatments.push({ name: t.name, day: t.day, qty: t.qty || 0, unit: t.unit || '', notes: (t.notes || '') + timingNoteFor(t.name) });
                sources.push({ name: t.name, kind: 'فرشة', cycles: r.cycles, sourceBatch: src.sourceBatch });
            });

            if (!kept.feed.length && !kept.water.length && !kept.treatments.length) {
                if (excludedByIncidents.length) {
                    showToast(`⚠️ كل البنود المُثبتة الفايدة (${excludedByIncidents.join('، ')}) اتستبعدت لأنها اتربطت بـ"ساء الوضع" فى حوادث سابقة من غير أي تحسّن مسجَّل — مفيش بروتوكول موثوق يتبني حاليًا`);
                } else {
                    showToast('⚠️ حصل تعارض فى مطابقة أسماء البنود بين التحليل والدورات — جرّب تاني، ولو استمرت المشكلة راجع تناسق أسماء الإضافات بين دوراتك');
                }
                return;
            }

            const protoName = `🏆 بروتوكول الأفضل من كل دورة (${todayStr()})`;
            const proto = {
                id: uid(), name: protoName, species, savedAt: todayStr(), autoGenerated: true, bestOfBreed: true,
                feedAdditives: kept.feed, waterAdditives: kept.water, treatments: kept.treatments,
            };
            if (!state.protocols) setState('protocols', []);
            state.protocols.push(proto);
            persist();
            renderProtocolList();
            vibrate([40, 60, 40]);

            const uniqueSourceBatches = [...new Set(sources.map(s => s.sourceBatch))];
            let report = `بروتوكول جديد اتصمم من جمع أفضل بند مُثبت الفايدة من كل دورة على حدة — مش نسخة من دورة واحدة بعينها، لكن توليفة من ${uniqueSourceBatches.length} دورة مختلفة (من إجمالي ${archived.length} دورة مؤرشفة اتفحصت من نفس النوع).<br><br>`;
            report += `🏆 البنود المُجمّعة (${sources.length}):<br>` + sources.map(s => `• ${esc(s.name)} (${s.kind}) — من دورة "${esc(s.sourceBatch)}"، أثبت فايدته عبر ${s.cycles} دورة`).join('<br>');
            if (excludedByIncidents.length) {
                report += `<br><br>🚫 اتستبعد رغم إثباته فايدة عامة (لأنه اتربط بـ"ساء الوضع" فى حادثة سابقة من غير أي تحسّن مسجَّل معاه): ${excludedByIncidents.map(esc).join('، ')}. راجعه فى "🧠 قاعدة معرفة الحوادث".`;
            }
            report += `<br><br>💾 اتحفظ باسم "${esc(protoName)}" فى قائمة البروتوكولات بالأسفل، جاهز يتطبّق على أى دفعة/دورة جديدة.`;
            showInfo('🏆 بروتوكول الأفضل من كل دورة', report);
        }

        function applyProtocol(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix: بروتوكولات محفوظة فى تبويب الإعدادات المحجوب عن العمال أصلًا
            const b = getActiveBatch();
            if (!b) { showToast('أضف دفعة أولاً'); return; }
            const p = (state.protocols || []).find(x => x.id === id);
            if (!p) return;
            showConfirm(
                `سيتم إضافة بنود بروتوكول "${p.name}" (${p.feedAdditives.length} إضافة علف، ${p.waterAdditives.length} إضافة ماء، ${p.treatments.length} معاملة فرشة) لبرنامج الدفعة الحالية "${b.name}" دون حذف أى بند موجود بالفعل. متابعة؟`,
                () => {
                    if (!b.feedAdditives) b.feedAdditives = [];
                    if (!b.waterAdditives) b.waterAdditives = [];
                    if (!b.treatmentLog) b.treatmentLog = [];
                    p.feedAdditives.forEach(a => b.feedAdditives.push({ id: uid(), ...a, active: true }));
                    p.waterAdditives.forEach(a => b.waterAdditives.push({ id: uid(), ...a, active: true }));
                    p.treatments.forEach(t => b.treatmentLog.push({ id: uid(), ...t, done: false, doneDate: null }));
                    b.treatmentLog.sort((a, c) => a.day - c.day);
                    // ===== تتبّع البروتوكولات المُطبَّقة على الدفعة — يُستخدم لاحقًا لمقارنة الكفاءة الاقتصادية عبر الدورات =====
                    if (!Array.isArray(b.appliedProtocolNames)) b.appliedProtocolNames = [];
                    if (!b.appliedProtocolNames.includes(p.name)) b.appliedProtocolNames.push(p.name);
                    persist();
                    closeModal('protocolModalOverlay');
                    render();
                    showToast(`✅ تم تطبيق بروتوكول "${p.name}" على دفعة "${b.name}"`);
                }
            );
        }

        function deleteProtocol(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const p = (state.protocols || []).find(x => x.id === id);
            if (!p) return;
            showConfirm(`حذف بروتوكول "${p.name}" المحفوظ؟ (لن يؤثر على أى دفعة سبق تطبيقه عليها) — يمكن استرجاعه لاحقًا من سلة المهملات بالإعدادات`, () => {
                setState('protocols', (state.protocols || []).filter(x => x.id !== id));
                softDeleteToGlobalTrash('protocol', p, `🗑️ حذف بروتوكول محفوظ: ${p.name}`);
                persist();
                renderProtocolList();
                showToast('تم حذف البروتوكول');
            });
        }

        function renderProtocolList() {
            const box = document.getElementById('protocolListBox');
            if (!box) return;
            const list = state.protocols || [];
            if (!list.length) {
                box.innerHTML = `<div class="empty" style="padding:14px;">لا توجد بروتوكولات محفوظة بعد. احفظ برنامج الإضافات والفرشة الحالى بالأعلى لاستخدامه فى دورة قادمة.</div>`;
                return;
            }
            box.innerHTML = [...list].reverse().map(p => `
                <div class="check-row">
                    <div class="txt">
                        <div style="font-weight:800;">${esc(p.name)} ${p.autoGenerated ? '<span class="pill info" style="font-size:10px;">🧠 مُولَّد آليًا</span>' : ''}</div>
                        <div class="day">🌾 ${p.feedAdditives.length} علف · 💧 ${p.waterAdditives.length} ماء · 🪣 ${p.treatments.length} فرشة · حُفظ ${p.savedAt}${p.sourceBatchName ? ` · مصدره: ${esc(p.sourceBatchName)}` : ''}</div>
                    </div>
                    <button class="btn gold sm" onclick="applyProtocol('${p.id}')">📥 تطبيق على الدفعة الحالية</button>
                    <button class="btn danger sm owner-only" onclick="deleteProtocol('${p.id}')">🗑️</button>
                </div>`).join('');
        }

        // ============ تنبيه فورى عند إضافة/تعديل بند سبق تقييمه بالسلب أو بدون تأثير فى دورات سابقة (نفس النوع) ============
        function checkAdditiveHistoryWarning(b, name, kind) {
            try {
                const rows = computeCrossCycleItemEffectiveness(b.species);
                if (!rows) return null;
                const prefix = normalizeArabicName(name + ' (' + kind + ')');
                const match = rows.find(r => normalizeArabicName(r.name).startsWith(prefix) && (r.verdict === 'worsen' || r.verdict === 'none'));
                if (!match) return null;
                return match.verdict === 'worsen'
                    ? `⚠️ تنبيه: "${name}" اتقيّم بدايمًا بيفرق بالسلب فى دورات سابقة (${match.cycles} دورة) — راجع فعاليته قبل الاستمرار`
                    : `ℹ️ ملحوظة: "${name}" ما ظهرش له أثر واضح فى دورات سابقة (${match.cycles} دورة) — قد يستحق إعادة تقييم جدواه`;
            } catch (e) { return null; }
        }
        function saveFeedAdditive() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 2): deleteAdditive محمية بـ owner، الحفظ/التعديل كان مكشوف
            const b = getActiveBatch();
            if (!b) return;
            const name = document.getElementById('fa_name').value.trim();
            const days = parseDaySchedule(document.getElementById('fa_days').value);
            const dose = parseFloat(document.getElementById('fa_dose').value) || 0;
            const unit = document.getElementById('fa_unit').value;
            const per = document.getElementById('fa_per').value;
            const period = document.getElementById('fa_period') ? document.getElementById('fa_period').value : 'both';
            const time = document.getElementById('fa_time') ? document.getElementById('fa_time').value : '';
            const notifyLeadMinutes = document.getElementById('fa_lead') ? parseInt(document.getElementById('fa_lead').value, 10) || 0 : 0;
            const notes = document.getElementById('fa_notes').value.trim();
            const withdrawalDays = parseInt(document.getElementById('fa_withdrawal') ? document.getElementById('fa_withdrawal').value : 0) || 0;
            if (!name) { showToast('أدخل اسم الإضافة'); return; }
            if (!days.length) { showToast('أدخل أيام السريان — مثال: 1-3, 8-10'); return; }
            const from = days[0], to = days[days.length - 1];
            const historyWarning = checkAdditiveHistoryWarning(b, name, 'علف');
            if (editingFeedAdditiveId) {
                const a = b.feedAdditives.find(x => x.id === editingFeedAdditiveId);
                if (a) Object.assign(a, { name, from, to, days, dose, unit, per, period, time, notifyLeadMinutes, notes, withdrawalDays });
                editingFeedAdditiveId = null;
                persist();
                closeModal('feedAddModalOverlay');
                render();
                showToast(historyWarning || 'تم تحديث إضافة العلف ✅');
                return;
            }
            b.feedAdditives.push({ id: uid(), name, from, to, days, dose, unit, per, period, time, notifyLeadMinutes, notes, withdrawalDays, active: true });
            persist();
            closeModal('feedAddModalOverlay');
            render();
            showToast(historyWarning || 'تمت إضافة إضافة العلف ✅');
        }

        function editFeedAdditive(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const a = b.feedAdditives.find(x => x.id === id);
            if (!a) return;
            editingFeedAdditiveId = id;
            document.getElementById('fa_name').value = a.name;
            document.getElementById('fa_days').value = (a.days && a.days.length) ? daysScheduleText(a.days) : `${a.from}-${a.to}`;
            document.getElementById('fa_dose').value = a.dose;
            if (document.getElementById('fa_unit')) document.getElementById('fa_unit').value = a.unit;
            if (document.getElementById('fa_per')) document.getElementById('fa_per').value = a.per;
            if (document.getElementById('fa_period')) document.getElementById('fa_period').value = a.period || 'both';
            if (document.getElementById('fa_time')) document.getElementById('fa_time').value = a.time || '';
            if (document.getElementById('fa_lead')) document.getElementById('fa_lead').value = a.notifyLeadMinutes != null ? String(a.notifyLeadMinutes) : '30';
            if (document.getElementById('fa_withdrawal')) document.getElementById('fa_withdrawal').value = a.withdrawalDays || 0;
            document.getElementById('fa_notes').value = a.notes || '';
            document.getElementById('feedAddModalTitle').textContent = '✏️ تعديل إضافة العلف';
            document.getElementById('feedAddModalBtn').textContent = 'حفظ التعديل';
            document.getElementById('feedAddModalOverlay').classList.add('show');
        }

        function saveWaterAdditive() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 2): deleteAdditive محمية بـ owner، الحفظ/التعديل كان مكشوف
            const b = getActiveBatch();
            if (!b) return;
            const name = document.getElementById('wa_name').value.trim();
            const days = parseDaySchedule(document.getElementById('wa_days').value);
            const dose = parseFloat(document.getElementById('wa_dose').value) || 0;
            const unit = document.getElementById('wa_unit').value;
            const per = document.getElementById('wa_per').value;
            const period = document.getElementById('wa_period') ? document.getElementById('wa_period').value : 'both';
            const time = document.getElementById('wa_time') ? document.getElementById('wa_time').value : '';
            const notifyLeadMinutes = document.getElementById('wa_lead') ? parseInt(document.getElementById('wa_lead').value, 10) || 0 : 0;
            const notes = document.getElementById('wa_notes').value.trim();
            const withdrawalDays = parseInt(document.getElementById('wa_withdrawal') ? document.getElementById('wa_withdrawal').value : 0) || 0;
            if (!name) { showToast('أدخل اسم الإضافة'); return; }
            if (!days.length) { showToast('أدخل أيام السريان — مثال: 1-3, 8-10'); return; }
            const from = days[0], to = days[days.length - 1];
            const historyWarning = checkAdditiveHistoryWarning(b, name, 'ماء');
            if (editingWaterAdditiveId) {
                const a = b.waterAdditives.find(x => x.id === editingWaterAdditiveId);
                if (a) Object.assign(a, { name, from, to, days, dose, unit, per, period, time, notifyLeadMinutes, notes, withdrawalDays });
                editingWaterAdditiveId = null;
                persist();
                closeModal('waterAddModalOverlay');
                render();
                showToast(historyWarning || 'تم تحديث إضافة المياه ✅');
                return;
            }
            b.waterAdditives.push({ id: uid(), name, from, to, days, dose, unit, per, period, time, notifyLeadMinutes, notes, withdrawalDays, active: true });
            persist();
            closeModal('waterAddModalOverlay');
            render();
            showToast(historyWarning || 'تمت إضافة إضافة المياه ✅');
        }

        // ============ 💧 جدولة سقاية الماء بفترات اليوم — الدوال المُغيّرة للبيانات ============
        function addWaterSchedule(startAge, periodCount) {
            if (!requirePermission('management')) return; // مطابق لنمط feedTransitions/protocols
            const b = getActiveBatch();
            if (!b) return;
            startAge = Math.max(1, parseInt(startAge) || 1);
            const periods = computeEqualPeriods(periodCount).map((p, i) => ({
                id: 'wp_' + Date.now() + '_' + i, startHour: p.startHour, endHour: p.endHour,
                additiveName: '', dose: 0, unit: 'جم/لتر', notes: ''
            }));
            if (!b.waterSchedules) b.waterSchedules = [];
            if (b.waterSchedules.some(s => s.startAge === startAge)) { showToast('⚠️ فيه جدول بيبدأ من نفس اليوم ده بالفعل — عدّله بدل ما تضيف واحد جديد'); return; }
            b.waterSchedules.push({ id: 'ws_' + Date.now(), startAge, periods });
            b.waterSchedules.sort((a, c) => a.startAge - c.startAge);
            persist();
            render();
            showToast(`✅ اتضاف جدول سقاية جديد من يوم ${startAge} بـ${periods.length} فترات`);
        }
        function removeWaterSchedule(id) {
            if (!requirePermission('management')) return;
            const b = getActiveBatch();
            if (!b) return;
            showConfirm('سيتم حذف نسخة الجدول دي بالكامل. متأكد؟', () => {
                b.waterSchedules = (b.waterSchedules || []).filter(s => s.id !== id);
                persist();
                render();
                showToast('تم الحذف');
            });
        }
        function updateWaterSchedulePeriod(scheduleId, periodId, field, value) {
            if (!requirePermission('management')) return;
            const b = getActiveBatch();
            if (!b) return;
            const sch = (b.waterSchedules || []).find(s => s.id === scheduleId);
            const per = sch && sch.periods.find(p => p.id === periodId);
            if (!per) return;
            if (field === 'dose') per.dose = parseFloat(value) || 0;
            else if (field === 'additiveName') per.additiveName = String(value || '').trim();
            else if (field === 'unit') per.unit = value;
            else if (field === 'notes') per.notes = String(value || '').trim();
            persist();
            // ⚡ تحسين أداء (نفس نمط المرحلة 1): تحديث كارت الجدول لوحده بدل هدم تبويب الإنتاج كامل
            refreshWaterScheduleBox();
        }
        // تنفيذ/تأشير فترة سقاية بعينها كـ"تمت النهارده" — نفس نمط toggleVaccine/toggleAdditive
        function toggleWaterPeriodDone(scheduleId, periodId) {
            if (!requirePermission('production')) return;
            const b = getActiveBatch();
            if (!b) return;
            if (!b.waterScheduleLog) b.waterScheduleLog = [];
            const dateStr = todayStr();
            const existing = b.waterScheduleLog.find(l => l.date === dateStr && l.periodId === periodId);
            if (existing) existing.done = !existing.done;
            else b.waterScheduleLog.push({ date: dateStr, scheduleId, periodId, done: true });
            persist();
            refreshWaterScheduleBox();
            vibrate(30);
        }
        function isWaterPeriodDoneToday(b, periodId) {
            const dateStr = todayStr();
            return !!(b.waterScheduleLog || []).find(l => l.date === dateStr && l.periodId === periodId && l.done);
        }
        // ⚡ تحديث جزئي — نفس نمط refreshVaccineListBox/refreshFeedAdditiveListBox
        function refreshWaterScheduleBox() {
            const box = document.getElementById('waterScheduleBox');
            const b = getActiveBatch();
            if (box && b) box.innerHTML = renderWaterScheduleCard(b);
            else render();
        }

        function editWaterAdditive(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const a = b.waterAdditives.find(x => x.id === id);
            if (!a) return;
            editingWaterAdditiveId = id;
            document.getElementById('wa_name').value = a.name;
            document.getElementById('wa_days').value = (a.days && a.days.length) ? daysScheduleText(a.days) : `${a.from}-${a.to}`;
            document.getElementById('wa_dose').value = a.dose;
            if (document.getElementById('wa_unit')) document.getElementById('wa_unit').value = a.unit;
            if (document.getElementById('wa_per')) document.getElementById('wa_per').value = a.per;
            if (document.getElementById('wa_period')) document.getElementById('wa_period').value = a.period || 'both';
            if (document.getElementById('wa_time')) document.getElementById('wa_time').value = a.time || '';
            if (document.getElementById('wa_lead')) document.getElementById('wa_lead').value = a.notifyLeadMinutes != null ? String(a.notifyLeadMinutes) : '30';
            if (document.getElementById('wa_withdrawal')) document.getElementById('wa_withdrawal').value = a.withdrawalDays || 0;
            document.getElementById('wa_notes').value = a.notes || '';
            document.getElementById('waterAddModalTitle').textContent = '✏️ تعديل إضافة المياه';
            document.getElementById('waterAddModalBtn').textContent = 'حفظ التعديل';
            document.getElementById('waterAddModalOverlay').classList.add('show');
        }

        function toggleAdditive(type, id) {
            const b = getActiveBatch();
            if (!b) return;
            const list = type === 'feed' ? b.feedAdditives : b.waterAdditives;
            const a = list.find(x => x.id === id);
            if (a) { a.active = !a.active;
                persist();
                if (type === 'feed') refreshFeedAdditiveListBox(); else refreshWaterAdditiveListBox(); // ⚡ تحسين أداء (المرحلة 1): كانت render() كاملة
            }
        }

        function deleteAdditive(type, id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const arr = type === 'feed' ? b.feedAdditives : b.waterAdditives;
            const a = arr.find(x => x.id === id);
            showConfirm('سيتم إيقاف/حذف هذه الإضافة من برنامج ' + (type === 'feed' ? 'العلف' : 'الماء') + '. يمكن استرجاعها لاحقًا من سلة المهملات. متأكد؟', () => {
                if (type === 'feed') b.feedAdditives = b.feedAdditives.filter(x => x.id !== id);
                else b.waterAdditives = b.waterAdditives.filter(x => x.id !== id);
                if (a) softDeleteToTrash(b, type === 'feed' ? 'feedAdditive' : 'waterAdditive', a, `🗑️ حذف إضافة ${type === 'feed' ? 'علف' : 'ماء'}: ${a.name || ''}`);
                persist();
                render();
                showToast('تم الحذف');
            });
        }

        let pendingDoseEdit = null;

        function editAdditiveDose(type, id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const list = type === 'feed' ? b.feedAdditives : b.waterAdditives;
            const a = list.find(x => x.id === id);
            if (!a) return;
            pendingDoseEdit = { type, id };
            document.getElementById('doseModalLabel').textContent = `${a.name} — الوحدة: ${a.unit}/${a.per}`;
            document.getElementById('dose_newValue').value = a.dose;
            document.getElementById('doseErr').textContent = '';
            document.getElementById('doseModalOverlay').classList.add('show');
            setTimeout(() => { const el = document.getElementById('dose_newValue'); if (el) { el.focus(); el.select(); } }, 50);
        }

        function closeDoseModal() {
            document.getElementById('doseModalOverlay').classList.remove('show');
            pendingDoseEdit = null;
        }

        function saveDoseModal() {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix (جولة 2): deleteAdditive محمية بـ owner، تعديل الجرعة كان مكشوف
            if (!pendingDoseEdit) return;
            const b = getActiveBatch();
            if (!b) { closeDoseModal(); return; }
            const list = pendingDoseEdit.type === 'feed' ? b.feedAdditives : b.waterAdditives;
            const a = list.find(x => x.id === pendingDoseEdit.id);
            if (!a) { closeDoseModal(); return; }
            const newDose = parseFloat(document.getElementById('dose_newValue').value);
            if (!newDose || newDose <= 0) {
                document.getElementById('doseErr').textContent = 'أدخل رقمًا صحيحًا أكبر من صفر';
                return;
            }
            a.dose = newDose;
            persist();
            render();
            showToast('تم تحديث الجرعة');
            closeDoseModal();
        }

        // ============ تنفيذ إضافات العلف/الماء اليومية وربطها بالمخزن ============
        function getTodayFeedWater(b, m, overrides) {
            const date = (overrides && overrides.date) ? overrides.date : todayStr();
            const rec = b.records.find(r => r.date === date);
            const age = (overrides && overrides.age != null && !isNaN(overrides.age)) ? overrides.age : m.todayAge;
            const refs = getRefsForDay(b, age);
            let feedKg = (rec && rec.feed) ? rec.feed : (refs.feed * m.liveCount) / 1000;
            let waterL = (rec && rec.water) ? rec.water : (refs.water * m.liveCount) / 1000;
            // كمية العلف/الماء نهارًا وليلاً فقط (من السجل اليومي المُقسَّم)، تُستخدم مع إضافات مقيّدة بتوقيت معيّن
            let feedDay = (rec && rec.feedDay != null) ? rec.feedDay : null;
            let feedNight = (rec && rec.feedNight != null) ? rec.feedNight : null;
            let waterDay = (rec && rec.waterDay != null) ? rec.waterDay : null;
            let waterNight = (rec && rec.waterNight != null) ? rec.waterNight : null;
            if (overrides) {
                if (overrides.feedKg != null && overrides.feedKg > 0) feedKg = overrides.feedKg;
                if (overrides.waterL != null && overrides.waterL > 0) waterL = overrides.waterL;
                if (overrides.feedDay != null) feedDay = overrides.feedDay;
                if (overrides.feedNight != null) feedNight = overrides.feedNight;
                if (overrides.waterDay != null) waterDay = overrides.waterDay;
                if (overrides.waterNight != null) waterNight = overrides.waterNight;
            }
            return { feedKg, waterL, feedDay, feedNight, waterDay, waterNight, hasRecordToday: !!rec };
        }

        function calcAdditiveQtyToday(a, type, b, m, overrides) {
            const fw = getTodayFeedWater(b, m, overrides);
            const period = a.period || 'both';
            // للإضافات المقيّدة بنهار/ليل فقط: نستخدم كمية العلف/الماء الخاصة بهذا التوقيت لو مسجّلة،
            // وإلا نرجع تلقائيًا للإجمالي (احتياطًا لو لم تُدخل قيم النهار/الليل منفصلة بعد).
            let feedKg = fw.feedKg, waterL = fw.waterL;
            if (type === 'feed' && period === 'day' && fw.feedDay != null) feedKg = fw.feedDay;
            else if (type === 'feed' && period === 'night' && fw.feedNight != null) feedKg = fw.feedNight;
            if (type === 'water' && period === 'day' && fw.waterDay != null) waterL = fw.waterDay;
            else if (type === 'water' && period === 'night' && fw.waterNight != null) waterL = fw.waterNight;
            let qty = 0;
            if (type === 'feed') {
                if (a.per === 'طن علف') qty = a.dose * (feedKg / 1000);
                else if (a.per === 'كجم علف يومياً') qty = a.dose;
                else qty = a.dose * feedKg; // كجم علف
            } else {
                if (a.per === '1000 لتر ماء') qty = a.dose * (waterL / 1000);
                else if (a.per === 'يومياً للقطيع') qty = a.dose;
                else qty = a.dose * waterL; // لتر ماء
            }
            return Math.round(qty * 1000) / 1000;
        }

        function isAdditiveExecutedToday(b, additiveId, date) {
            return (b.additiveExecLog || []).some(e => e.additiveId === additiveId && e.date === date);
        }

        function applyAdditiveToday(type, id, overrides) {
            const b = getActiveBatch();
            if (!b) return;
            const list = type === 'feed' ? b.feedAdditives : b.waterAdditives;
            const a = list.find(x => x.id === id);
            if (!a) return;
            const m = computeMetrics(b);
            const date = (overrides && overrides.date) ? overrides.date : todayStr();
            if (date > todayStr()) {
                showToast('لا يمكن تنفيذ إضافة لتاريخ مستقبلي');
                return;
            }
            const today = (overrides && overrides.age != null && !isNaN(overrides.age)) ? overrides.age : m.todayAge;
            if (!a.active || !additiveActiveOnDay(a, today)) {
                showToast('هذه الإضافة ليست سارية فى هذا اليوم');
                return;
            }
            if (!b.additiveExecLog) b.additiveExecLog = [];
            if (isAdditiveExecutedToday(b, a.id, date)) {
                showToast('تم تنفيذ هذا البند بالفعل فى هذا التاريخ ✅');
                return;
            }
            const qty = calcAdditiveQtyToday(a, type, b, m, overrides);
            if (!(qty > 0)) {
                showToast('تعذر حساب الكمية — تأكد من تسجيل العلف/الماء لهذا اليوم أو من بيانات الجرعة');
                return;
            }
            const doseUnit = a.unit;
            const { it, qty: convQty } = resolveInvQty(b, a.name, 'إضافات', qty, doseUnit);
            if (convQty == null) {
                showToast(`⚠️ وحدة الجرعة "${doseUnit}" لا تتوافق مع وحدة "${it.name}" المسجلة بالمخزن "${it.unit}" — لا يمكن الخصم تلقائيًا. صحّح الوحدة من الإضافة أو من المخزون.`);
                return;
            }
            const label = type === 'feed' ? 'إضافة علف' : 'إضافة ماء';
            // ============ التأكد إن الجرعة محسوبة على الاستهلاك الفعلي المسجَّل، مش على المعيار القياسي ============
            // لو لسه معملتش تسجيل يومي للاستهلاك النهاردة أصلًا، الحساب بيرجع للمعيار القياسي احتياطيًا
            // بصمت — وده ممكن يبعد عن الاستهلاك الحقيقي بفارق كبير حسب أداء دفعتك الفعلي. بدل ما نسيب
            // ده يعدي من غير ما ينتبه المستخدم، بنعرض تأكيد صريح قبل الخصم من المخزن فى هذه الحالة.
            const fw = getTodayFeedWater(b, m, overrides);
            const specificVal = (a.period && a.period !== 'both')
                ? (type === 'feed' ? (a.period === 'day' ? fw.feedDay : fw.feedNight) : (a.period === 'day' ? fw.waterDay : fw.waterNight))
                : null;
            const usedPeriodFallback = (a.period && a.period !== 'both') && (specificVal == null);
            const usedFullEstimate = !fw.hasRecordToday; // مفيش سجل يومي خالص لهذا التاريخ لسه
            let periodFallbackNote = '';
            if (usedFullEstimate) {
                periodFallbackNote = ` ⚠️ (لا يوجد سجل استهلاك فعلي مُسجَّل لهذا التاريخ بعد — تم الحساب على المعيار القياسي لعمر ${today} يوم، وليس الاستهلاك الفعلي)`;
            } else if (usedPeriodFallback) {
                periodFallbackNote = ` ⚠️ (لا توجد قيمة ${additivePeriodLabel(a)} مسجّلة منفصلة لهذا التاريخ — تم الحساب على إجمالي اليوم احتياطيًا)`;
            }
            const finalize = () => {
                stockOutByItem(b, it.id, convQty, date, `تنفيذ يومي - ${label}: ${a.name} (${additivePeriodLabel(a)})`);
                b.additiveExecLog.push({ id: uid(), date, additiveId: a.id, type, name: a.name, qty, unit: doseUnit,
                    enteredBy: currentRole === 'worker' && currentWorker ? currentWorker.name : 'المالك', enteredAt: new Date().toISOString() });
                persist();
                render();
                showToast(`✅ تم تنفيذ "${a.name}" وخصم ${fmt(convQty,2)} ${it.unit} من المخزن (${date})${periodFallbackNote}`);
            };
            const proceedWithStockCheck = () => confirmIfShort(a.name, it.unit, it.balance, convQty, 'لتنفيذ جرعة اليوم', finalize);
            if (usedFullEstimate) {
                showConfirm(
                    `لسه ما اتسجلش استهلاك العلف/الماء الفعلي لهذا التاريخ (${date})، فالجرعة دلوقتي محسوبة على المعيار القياسي لعمر ${today} يوم (${fmt(type==='feed'?fw.feedKg:fw.waterL,1)} ${type==='feed'?'كجم':'لتر'} تقديري) — مش على استهلاك دفعتك الفعلي.\n\n` +
                    `لو دفعتك بتاكل/بتشرب أكتر أو أقل من المعيار، الجرعة هتبقى غير دقيقة. اضغط "نعم، تأكيد" للمتابعة بالتقدير القياسي الآن، أو "إلغاء" وسجّل استهلاك اليوم أولًا من "تسجيل يومي" ثم ارجع لتنفيذ الإضافة على الرقم الفعلي.`,
                    proceedWithStockCheck, '⚠️ الجرعة مبنية على تقدير وليس استهلاك فعلي'
                );
                return;
            }
            proceedWithStockCheck();
        }

        function undoAdditiveExec(execId) {
            const b = getActiveBatch();
            if (!b) return;
            const e = (b.additiveExecLog || []).find(x => x.id === execId);
            if (!e) return;
            showConfirm(`التراجع عن تنفيذ "${e.name}" وإرجاع ${fmt(e.qty,2)} ${e.unit} للمخزن؟`, () => {
                reverseStockOut(b, e.name, 'إضافات', e.qty, e.unit);
                b.additiveExecLog = b.additiveExecLog.filter(x => x.id !== execId);
                persist();
                render();
                showToast('تم التراجع عن التنفيذ');
            });
        }

        // ============ Core Production Calculations ============
        // ============ كاش نتائج الحسابات للدورات المؤرشفة ============
        // الدورة المؤرشفة لا تتغيّر عادة، فإعادة حساب computeMetrics/computeFinance من الصفر لها فى كل render
        // (خصوصًا فى تبويب "مقارنة الدورات" والتحليلات التاريخية) مجهود ضائع بيكبر مع تراكم الدورات بمرور الوقت.
        // هنا بنخزّن النتيجة أول مرة تتحسب، ونعيد استخدامها طول ما بصمة بيانات الدورة (بصمة خفيفة جدًا) لم تتغيّر.
        // لو عدّلت/حذفت أي سجل أو مشترى أو بيع فى دورة مؤرشفة، البصمة بتتغيّر تلقائيًا فيُعاد الحساب مرة واحدة فقط ثم يُخزَّن الجديد.
        const _cycleCache = new Map(); // batch.id -> { fp, metrics, finance }
