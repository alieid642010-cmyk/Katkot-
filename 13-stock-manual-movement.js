        function saveStockMove() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const name = document.getElementById('st_name').value.trim();
            const category = document.getElementById('st_category').value;
            const unit = document.getElementById('st_unit').value;
            const date = document.getElementById('st_date').value;
            const qty = parseFloat(document.getElementById('st_qty').value) || 0;
            const note = document.getElementById('st_note').value.trim();
            if (!name || !qty || !date) { showToast('أكمل البيانات'); return; }
            if (editingMovementId) {
                const mv = b.stockMovements.find(m => m.id === editingMovementId);
                if (mv) {
                    // ⚠️ إصلاح: كنا بنفترض إن الصنف المعدَّل عليه لسه نفسه (mv.itemId) حتى لو
                    // المستخدم غيّر الاسم/التصنيف فى النموذج. دلوقتي بنعيد تحديد الصنف الصحيح
                    // بالاسم/التصنيف الجديدين، ونتحقق من توافق الوحدة، قبل ما نلمس أي رصيد.
                    const newIt = resolveOrCreateInvItemForName(b, name, category, unit);
                    const convQty = convertUnitQty(qty, unit, newIt.unit);
                    if (convQty == null) {
                        showToast(`⚠️ وحدة "${unit}" لا تتوافق مع وحدة "${newIt.unit}" المسجلة لصنف "${newIt.name}" — عدّل الوحدة قبل الحفظ`);
                        return;
                    }
                    const oldIt = b.inventory.find(i => i.id === mv.itemId);
                    if (oldIt) oldIt.balance -= (mv.type === 'in' ? mv.qty : -mv.qty); // تراجع كامل عن أثر الحركة القديمة على صنفها الأصلي
                    newIt.balance += (mv.type === 'in' ? convQty : -convQty); // تطبيق الأثر على الصنف الصحيح (سواء اتغيّر أو لأ)
                    mv.itemId = newIt.id;
                    mv.itemName = newIt.name;
                    mv.date = date;
                    mv.qty = convQty;
                    mv.note = note || mv.note;
                }
                editingMovementId = null;
                persist();
                closeModal('stockModalOverlay');
                render();
                showToast('تم تحديث الحركة وتصحيح الرصيد ✅');
                return;
            }
            if (stockMode === 'in') stockIn(b, name, category, unit, qty, date, note || 'إضافة يدوية');
            else if (stockMode === 'adjust') {
                // ⚠️ إصلاح: كان بيستخدم resolveInvQty اللي بتنشئ صنف جديد تلقائيًا لو الاسم مش
                // موجود بالظبط — يعني خطأ إملائي بسيط وقت "حذف/تسوية" كان بينشئ صنف وهمي رصيده
                // صفر وينزل سالب فورًا، بدل ما يوقف ويطلب تصحيح الاسم.
                const it = findInvItem(b, name, category);
                if (!it) { showToast(`⚠️ لا يوجد صنف باسم "${name}" فى تصنيف "${category}" بالمخزون — راجع الاسم من تبويب المخزون قبل الحذف/التسوية`); return; }
                const convQty = convertUnitQty(qty, unit, it.unit);
                if (convQty == null) { showToast(`⚠️ وحدة "${unit}" لا تتوافق مع وحدة "${it.unit}" المسجلة لصنف "${it.name}" — عدّل الوحدة قبل الحذف/التسوية`); return; }
                stockAdjustByItem(b, it.id, convQty, date, note || 'حذف/تسوية يدوية (غير محسوبة كاستهلاك)');
            } else {
                // نفس إصلاح وضع "استهلاك": لازم الصنف يكون موجود فعليًا بنفس الاسم، من غير إنشاء تلقائي.
                const it = findInvItem(b, name, category);
                if (!it) { showToast(`⚠️ لا يوجد صنف باسم "${name}" فى تصنيف "${category}" بالمخزون — راجع الاسم من تبويب المخزون قبل تسجيل الصرف`); return; }
                const convQty = convertUnitQty(qty, unit, it.unit);
                if (convQty == null) { showToast(`⚠️ وحدة "${unit}" لا تتوافق مع وحدة "${it.unit}" المسجلة لصنف "${it.name}" — عدّل الوحدة قبل تسجيل الصرف`); return; }
                stockOutByItem(b, it.id, convQty, date, note || 'استهلاك يدوي');
            }
            persist();
            closeModal('stockModalOverlay');
            render();
            showToast(stockMode === 'in' ? 'تم إضافة الكمية للمخزن 📦' :
                stockMode === 'adjust' ? 'تم حذف/تسوية الكمية من المخزن 🗑️' : 'تم تسجيل الاستهلاك ✅');
        }

        function editMovement(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const mv = b.stockMovements.find(m => m.id === id);
            if (!mv) return;
            editingMovementId = id;
            stockMode = mv.type;
            const it = b.inventory.find(i => i.id === mv.itemId);
            document.getElementById('st_name').value = mv.itemName || (it ? it.name : '');
            if (it) {
                document.getElementById('st_category').value = it.category;
                document.getElementById('st_unit').value = it.unit;
            }
            document.getElementById('st_date').value = mv.date;
            document.getElementById('st_qty').value = mv.qty;
            document.getElementById('st_note').value = mv.note || '';
            document.getElementById('stockModalTitle').textContent = `✏️ تعديل حركة: ${mv.itemName || ''}`;
            document.getElementById('stockModalBtn').textContent = 'حفظ التعديل';
            document.getElementById('stockModalOverlay').classList.add('show');
        }

        function deleteMovement(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const mv = b.stockMovements.find(m => m.id === id);
            if (!mv) return;
            showConfirm('سيتم حذف هذه الحركة نهائيًا وتصحيح رصيد الصنف تلقائيًا فورًا (كأن الحركة لم تحدث). هذا الإجراء نهائي ولا يمكن التراجع عنه. متأكد؟', () => {
                const it = b.inventory.find(i => i.id === mv.itemId);
                if (it) {
                    // "in" زادت الرصيد وقت التسجيل → نطرحها الآن. "out"/"adjust" خصمتا الرصيد → نضيفهما الآن.
                    if (mv.type === 'in') it.balance -= mv.qty;
                    else it.balance += mv.qty;
                }
                logAudit(b, `🗑️ حذف حركة مخزون: ${mv.itemName} (${fmt(mv.qty,1)})`);
                b.stockMovements = b.stockMovements.filter(m => m.id !== id);
                persist();
                render();
                showToast('تم حذف الحركة نهائيًا وتصحيح الرصيد ✅');
            });
        }

        function quickStock(itemId, mode) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            const it = b.inventory.find(i => i.id === itemId);
            if (!it) return;
            editingMovementId = null;
            stockMode = mode;
            document.getElementById('stockModalTitle').textContent = mode === 'in' ? `إضافة كمية إلى: ${it.name}` :
                mode === 'adjust' ? `✏️ تعديل رصيد: ${it.name} (تصحيح/تلف/جرد — لا يُحسب كاستهلاك)` : `تسجيل استهلاك من: ${it.name}`;
            document.getElementById('stockModalBtn').textContent = mode === 'in' ? 'إضافة للمخزن' :
                mode === 'adjust' ? 'حفظ التعديل' : 'تسجيل الاستهلاك';
            document.getElementById('st_name').value = it.name;
            document.getElementById('st_category').value = it.category;
            document.getElementById('st_unit').value = it.unit;
            document.getElementById('st_date').value = todayStr(); document.getElementById('st_date').max = todayStr();
            document.getElementById('stockModalOverlay').classList.add('show');
        }

        // ============ Reminders, Vaccines, Treatments, Additives ============
