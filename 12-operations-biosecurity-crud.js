        // ⚡ تحسين أداء (المرحلة 1): الدالة دي بينادّيها مصدر واحد بس (dailyToggleChecklist فى تبويب
        // السجل اليومي — لا يوجد استخدام تانى لها فى أي مكان تانى بالتطبيق)، فبدل ما نعمل render() كامل
        // (يهد الصفحة كلها ويبنيها من جديد) على كل ضغطة تيك فى بند تشيك ليست، نكتفي بتحديث صندوق
        // التشيك ليست بس (renderDailyWorkerBox) اللي أصلاً بيعيد حساب كل حاجة محتاجها بشكل صحيح.
        function toggleChecklistTask(taskId) {
            const b = getActiveBatch();
            if (!b) return;
            const date = todayStr();
            const existing = b.checklistLog.find(l => l.date === date && l.taskId === taskId);
            if (existing) existing.done = !existing.done;
            else b.checklistLog.push({ date, taskId, done: true });
            persist();
            renderDailyWorkerBox();
        }

        // فترة تنفيذ البند: 'day' (نهار فقط — الافتراضي، يحافظ على سلوك البنود القديمة اللي كانت دايمًا فى صندوق النهار بس)
        // / 'night' (ليل فقط) / 'both' (يظهر فى الصندوقين معًا لأنه لازم يتنفذ فى الجولتين)
        function checklistPeriodLabel(t) {
            if (t && t.period === 'night') return '🌙 ليلاً فقط';
            if (t && t.period === 'both') return '☀️🌙 نهارًا وليلاً';
            return '☀️ نهارًا فقط';
        }
        function addChecklistTask() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3): تعديل قالب البروتوكول
            const b = getActiveBatch();
            if (!b) return;
            const text = document.getElementById('ck_newtask').value.trim();
            const periodSel = document.getElementById('ck_period');
            const period = periodSel ? periodSel.value : 'day';
            if (!text) { showToast('اكتب نص البند أولاً'); return; }
            if (editingChecklistTaskId) {
                const t = b.checklistTemplate.find(x => x.id === editingChecklistTaskId);
                if (t) { t.text = text; t.period = period; }
                editingChecklistTaskId = null;
                document.getElementById('ck_newtask').value = '';
                if (periodSel) periodSel.value = 'day';
                document.getElementById('ckSaveBtn').textContent = '+ إضافة بند';
                persist();
                render();
                showToast('تم تحديث البند ✅');
                return;
            }
            b.checklistTemplate.push({ id: uid(), text, period });
            persist();
            render();
            showToast('تم إضافة البند ✅');
        }

        function editChecklistTask(id) {
            const b = getActiveBatch();
            if (!b) return;
            const t = b.checklistTemplate.find(x => x.id === id);
            if (!t) return;
            editingChecklistTaskId = id;
            document.getElementById('ck_newtask').value = t.text;
            const periodSel = document.getElementById('ck_period');
            if (periodSel) periodSel.value = t.period || 'day';
            document.getElementById('ckSaveBtn').textContent = '✏️ حفظ التعديل';
            document.getElementById('ck_newtask').scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById('ck_newtask').focus();
        }

        function removeChecklistTask(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            if (!b) return;
            showConfirm('سيتم حذف هذا البند من التشيك ليست. متأكد؟', () => {
                b.checklistTemplate = b.checklistTemplate.filter(t => t.id !== id);
                b.checklistLog = b.checklistLog.filter(l => l.taskId !== id);
                persist();
                render();
                showToast('تم الحذف');
            });
        }

        let bioPhotoData = null;
        function handleBioPhotoUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            compressImageFile(file, 800, 0.6, (dataUrl) => {
                bioPhotoData = dataUrl;
                document.getElementById('bio_photo_preview').innerHTML = `<div style="position:relative;display:inline-block;"><img src="${dataUrl}" style="max-width:140px;border-radius:8px;border:1px solid var(--line);"><button type="button" class="btn danger xs" style="position:absolute;top:-8px;left:-8px;" onclick="bioPhotoData=null;document.getElementById('bio_photo_preview').innerHTML='';document.getElementById('bio_photo_input').value='';">🗑️</button></div>`;
            });
        }
        function saveBiosecurity() {
            if (!requirePermission('production')) return; // 🔒 Red Team fix: كانت قابلة للنداء من Console بدون تحقق — عامل بدون صلاحية "الإنتاج" كان لسه يقدر يسجل أحداث سلامة حيوية
            const b = getActiveBatch();
            if (!b) return;
            const type = document.getElementById('bio_type').value;
            const date = document.getElementById('bio_date').value || todayStr();
            const note = document.getElementById('bio_note').value.trim();
            const stage = document.getElementById('bio_stage').value || null;
            if (editingBiosecurityId) {
                const e = b.biosecurityLog.find(x => x.id === editingBiosecurityId);
                if (e) { e.type = type; e.date = date; e.note = note; e.stage = stage; if (bioPhotoData) e.photo = bioPhotoData; }
                editingBiosecurityId = null;
                persist();
                document.getElementById('bio_note').value = '';
                bioPhotoData = null; document.getElementById('bio_photo_preview').innerHTML = ''; document.getElementById('bio_photo_input').value = '';
                document.getElementById('bioSaveBtn').textContent = '+ تسجيل حدث';
                render();
                refreshBiosecurityModalIfOpen();
                showToast('تم تحديث السجل ✅');
                return;
            }
            b.biosecurityLog.push({ id: uid(), type, date, note, stage, photo: bioPhotoData });
            persist();
            document.getElementById('bio_note').value = '';
            bioPhotoData = null; document.getElementById('bio_photo_preview').innerHTML = ''; document.getElementById('bio_photo_input').value = '';
            render();
            refreshBiosecurityModalIfOpen();
            showToast('تم تسجيل الحدث 🛡️');
        }

        function editBiosecurity(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const e = b.biosecurityLog.find(x => x.id === id);
            if (!e) return;
            editingBiosecurityId = id;
            const sel = document.getElementById('bio_type');
            sel.value = e.type;
            document.getElementById('bio_date').value = e.date;
            document.getElementById('bio_note').value = e.note || '';
            document.getElementById('bio_stage').value = e.stage || '';
            bioPhotoData = null; document.getElementById('bio_photo_input').value = '';
            document.getElementById('bio_photo_preview').innerHTML = e.photo ? `<img src="${e.photo}" style="max-width:140px;border-radius:8px;border:1px solid var(--line);">` : '';
            document.getElementById('bioSaveBtn').textContent = '✏️ حفظ التعديل';
            document.getElementById('bioExtraFields').style.display = 'block';
            document.querySelectorAll('.bio-chip').forEach((el,i) => { el.classList.toggle('gold', i === sel.selectedIndex); el.classList.toggle('ghost', i !== sel.selectedIndex); });
            document.getElementById('bio_note').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function deleteBiosecurity(id) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const e = b.biosecurityLog.find(e => e.id === id);
            showConfirm('سيتم حذف هذا السجل. يمكن استرجاعه لاحقًا من سلة المهملات. متأكد؟', () => {
                b.biosecurityLog = b.biosecurityLog.filter(e => e.id !== id);
                if (e) softDeleteToTrash(b, 'biosecurity', e, `🗑️ حذف سجل أمان حيوي: ${e.type || ''}`);
                persist();
                render();
                refreshBiosecurityModalIfOpen();
                showToast('تم الحذف');
            });
        }

        function addHouse() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix: كانت قابلة للنداء من Console بدون تحقق صلاحية
            const b = getActiveBatch();
            if (!b) return;
            const name = document.getElementById('hs_name').value.trim();
            const area = parseFloat(document.getElementById('hs_area').value) || 0;
            const count = parseInt(document.getElementById('hs_count').value) || 0;
            if (!name) { showToast('اكتب اسم العنبر/القسم أولاً'); return; }
            if (editingHouseId) {
                const h = b.houses.find(x => x.id === editingHouseId);
                if (h) { h.name = name; h.area = area; h.count = count; }
                editingHouseId = null;
                persist();
                ['hs_name','hs_area','hs_count'].forEach(id => document.getElementById(id).value = '');
                document.getElementById('hsSaveBtn').textContent = '+ إضافة عنبر/قسم';
                render();
                showToast('تم تحديث العنبر ✅');
                return;
            }
            b.houses.push({ id: uid(), name, area, count });
            persist();
            ['hs_name','hs_area','hs_count'].forEach(id => document.getElementById(id).value = '');
            render();
            showToast('تم إضافة العنبر 🏠');
        }

        function editHouse(id) {
            const b = getActiveBatch();
            if (!b) return;
            const h = b.houses.find(x => x.id === id);
            if (!h) return;
            editingHouseId = id;
            document.getElementById('hs_name').value = h.name;
            document.getElementById('hs_area').value = h.area || '';
            document.getElementById('hs_count').value = h.count || '';
            document.getElementById('hsSaveBtn').textContent = '✏️ حفظ التعديل';
            document.getElementById('hs_name').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function removeHouse(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix: كانت قابلة للنداء من Console بدون تحقق صلاحية
            const b = getActiveBatch();
            if (!b) return;
            showConfirm('سيتم حذف هذه العنبر/الوحدة من القائمة. متأكد؟', () => {
                b.houses = b.houses.filter(h => h.id !== id);
                persist();
                render();
                showToast('تم الحذف');
            });
        }

        // ============ (جديد) برنامج التحويل التدريجي بين نوعين علف — إدارة (إعدادات ← 🐔 المزرعة)، التطبيق تلقائي فى التسجيل اليومي عبر getActiveFeedTransition ============
        // ============ (جديد) قواعد تعارض الإضافات — المستخدم بيعرّفها بنفسه (بناءً على معرفته البيطرية)، والتطبيق بيراقبها تلقائيًا كل يوم ============
        function addConflictRule() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const a = document.getElementById('cr_a').value.trim();
            const b = document.getElementById('cr_b').value.trim();
            const note = document.getElementById('cr_note').value.trim();
            if (!a || !b) { showToast('اكتب اسم/كلمة مفتاحية للصنفين'); return; }
            if (!state.conflictRules) setState('conflictRules', []);
            state.conflictRules.push({ id: uid(), a, b, note });
            persist();
            render();
            showToast('✅ اتضافت قاعدة التعارض');
        }
        function removeConflictRule(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            showConfirm('سيتم حذف قاعدة التعارض دي. متأكد؟', () => {
                setState('conflictRules', (state.conflictRules || []).filter(r => r.id !== id));
                persist();
                render();
                showToast('تم الحذف');
            });
        }
        function addFeedTransition() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            if (!b) return;
            const fromFeed = document.getElementById('ft_from').value.trim();
            const toFeed = document.getElementById('ft_to').value.trim();
            const startAge = parseInt(document.getElementById('ft_startAge').value);
            if (!fromFeed || !toFeed) { showToast('اكتب اسم العلفين (من وإلى)'); return; }
            if (fromFeed === toFeed) { showToast('لازم يكون اسم العلفين مختلف'); return; }
            if (isNaN(startAge) || startAge < 0) { showToast('اكتب عمر بداية صحيح'); return; }
            if (!b.feedTransitions) b.feedTransitions = [];
            b.feedTransitions.push({ id: uid(), fromFeed, toFeed, startAge, days: [{ fromPct: 65 }, { fromPct: 35 }] });
            persist();
            render();
            showToast('✅ اتضاف جدول تحويل جديد — عدّل نسب الأيام حسب برنامجك');
        }
        function removeFeedTransition(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            if (!b) return;
            showConfirm('سيتم حذف جدول التحويل ده. متأكد؟', () => {
                b.feedTransitions = b.feedTransitions.filter(t => t.id !== id);
                persist();
                render();
                showToast('تم الحذف');
            });
        }
        function addTransitionDay(transId) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            if (!b) return;
            const t = b.feedTransitions.find(x => x.id === transId);
            if (!t) return;
            const lastPct = t.days.length ? t.days[t.days.length - 1].fromPct : 100;
            t.days.push({ fromPct: Math.max(0, lastPct - 15) });
            persist();
            render();
        }
        function removeTransitionDay(transId, dayIdx) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            if (!b) return;
            const t = b.feedTransitions.find(x => x.id === transId);
            if (!t || t.days.length <= 1) { showToast('لازم يفضل يوم واحد على الأقل — احذف الجدول كله لو عايز تلغيه'); return; }
            t.days.splice(dayIdx, 1);
            persist();
            render();
        }
        function updateTransitionDayPct(transId, dayIdx, val) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            if (!b) return;
            const t = b.feedTransitions.find(x => x.id === transId);
            if (!t || !t.days[dayIdx]) return;
            let pct = parseInt(val);
            if (isNaN(pct)) pct = 0;
            pct = Math.max(0, Math.min(100, pct));
            t.days[dayIdx].fromPct = pct;
            persist();
            render();
        }

        // ============ Stock manual movement ============
