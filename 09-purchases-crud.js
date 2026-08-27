        function editPurchase(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            const p = b.purchases.find(p => p.id === id);
            if (!p) return;
            editingPurchaseId = id;
            document.getElementById('p_date').value = p.date;
            document.getElementById('p_type').value = p.type;
            document.getElementById('p_desc').value = p.desc || '';
            document.getElementById('p_supplier').value = p.supplier || '';
            if (document.getElementById('p_lot')) document.getElementById('p_lot').value = p.lot || '';
            document.getElementById('p_qty').value = p.qty;
            document.getElementById('p_unit').value = p.unit;
            document.getElementById('p_price').value = p.price;
            document.getElementById('p_total').value = p.total;
            document.getElementById('p_paid').value = p.paid === false ? '0' : '1';
            document.getElementById('p_due').value = p.dueDate || '';
            if (document.getElementById('p_dueTime')) document.getElementById('p_dueTime').value = p.dueTime || '';
            if (document.getElementById('p_dueLead')) document.getElementById('p_dueLead').value = p.notifyLeadMinutes != null ? String(p.notifyLeadMinutes) : '60';
            togglePurchaseDue();
            document.getElementById('purModalOverlay').classList.add('show');
        }

        function savePurchase() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const date = document.getElementById('p_date').value;
            const type = document.getElementById('p_type').value;
            const desc = document.getElementById('p_desc').value.trim();
            const supplier = document.getElementById('p_supplier').value.trim();
            const lot = document.getElementById('p_lot') ? document.getElementById('p_lot').value.trim() : '';
            const expiryDate = document.getElementById('p_expiry') ? (document.getElementById('p_expiry').value || null) : null;
            const qty = parseFloat(document.getElementById('p_qty').value) || 0;
            const unit = document.getElementById('p_unit').value;
            const price = parseFloat(document.getElementById('p_price').value) || 0;
            let total = parseFloat(document.getElementById('p_total').value);
            if (isNaN(total)) total = qty * price;
            const paid = document.getElementById('p_paid').value !== '0';
            const dueDate = paid ? null : (document.getElementById('p_due').value || null);
            const dueTime = paid ? null : (document.getElementById('p_dueTime') ? (document.getElementById('p_dueTime').value || null) : null);
            const notifyLeadMinutes = paid ? 0 : (document.getElementById('p_dueLead') ? parseInt(document.getElementById('p_dueLead').value, 10) || 0 : 0);
            // 🔒 Red Team fix: الشرط القديم !total كان بيرفض الصفر بس مش السالب — قيمة زي -500
            // كانت تعدي وتتسجل كمصروف سالب، وده يقلّب حسابات الأرباح/المستحقات ويشوّه التحليل
            // الإحصائي (t-test/IQR) اللي بيعتمد على القيم دي.
            if (!date || isNaN(total) || total <= 0) { showToast('أدخل التاريخ وإجمالي أكبر من صفر'); return; }
            if (qty < 0 || price < 0) { showToast('⚠️ الكمية والسعر لا يمكن أن يكونا بالسالب'); return; }
            if (editingPurchaseId) {
                const old = b.purchases.find(p => p.id === editingPurchaseId);
                // ⚠️ إصلاح: كنا بنسحب أثر الحركة القديمة من المخزون قبل التأكد إن الكمية/الوحدة
                // الجديدة هتتضاف بنجاح. لو الوحدة الجديدة مش متوافقة مع وحدة الصنف الموجود، أو
                // الكمية صفر، كانت الكمية القديمة بتتفقد نهائيًا من غير ما تتعوّض. دلوقتي بنتحقق
                // الأول قبل ما نلمس أي رصيد.
                if (old && old.stocked && type !== 'كتاكيت' && !NON_STOCK_TYPES.includes(type)) {
                    const itemNameCheck = type === 'علف' ? (desc || 'علف') : (desc || type);
                    if (qty <= 0) {
                        showToast('⚠️ أدخل كمية صحيحة أكبر من صفر — لم يُحفظ التعديل حتى لا تُفقد الكمية القديمة من المخزون');
                        return;
                    }
                    const existingCheck = findInvItem(b, itemNameCheck, type);
                    if (existingCheck && convertUnitQty(qty, unit, existingCheck.unit) == null) {
                        showToast(`⚠️ وحدة "${unit}" لا تتوافق مع وحدة "${existingCheck.unit}" المسجلة لصنف "${itemNameCheck}" — صحّح الوحدة قبل الحفظ (لم يُحفظ التعديل حتى لا تُفقد الكمية القديمة من المخزون)`);
                        return;
                    }
                }
                if (old && old.stocked) reverseStockMovement(b, old.stockItemName, old.type, old.stockQty, old.stockUnit);
                b.purchases = b.purchases.filter(p => p.id !== editingPurchaseId);
            }
            const purchase = { id: editingPurchaseId || uid(), date, type, desc, supplier, lot, qty, unit, price, total, stocked: false, paid, dueDate, dueTime, notifyLeadMinutes };
            if (type === 'كتاكيت') { /* لا يدخل المخزن */ } else if (!NON_STOCK_TYPES.includes(type)) {
                const itemName = type === 'علف' ? (desc || 'علف') : (desc || type);
                const otherCatMatch = b.inventory.find(i => normalizeArabicName(i.name) === normalizeArabicName(itemName) && i.category !== type);
                if (otherCatMatch) {
                    showToast(`⚠️ يوجد بالفعل صنف باسم "${itemName}" فى تصنيف "${otherCatMatch.category}" — راجع التصنيف المختار حتى لا يتكرر الصنف`);
                }
                // stockIn تُحوّل تلقائيًا بين الوحدات المتوافقة فيزيائيًا (وزن/حجم) لتطابق وحدة
                // الصنف الفعلية بالمخزن، بدل تسجيل الرقم الخام كما هو بوحدة مختلفة عن رصيده الحالي.
                const result = stockIn(b, itemName, type, unit, qty, date, desc || 'شراء', expiryDate);
                if (result && !result.mismatch) {
                    purchase.stocked = true;
                    purchase.stockItemName = itemName;
                    purchase.stockQty = result.qty;
                    purchase.stockUnit = result.unit;
                }
            }
            b.purchases.push(purchase);
            b.purchases.sort((a, c) => a.date.localeCompare(c.date));
            editingPurchaseId = null;
            persist();
            closeModal('purModalOverlay');
            render();
            showToast('تم حفظ عملية الشراء وتحديث المخزن 🧾');
        }

        function deletePurchase(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix: كان قابل للنداء من Console بدون أي تحقق صلاحية
            const b = getActiveBatch();
            const p = b.purchases.find(p => p.id === id);
            if (!p) return;
            showConfirm('سيتم حذف عملية الشراء هذه (وسيُسحب أثرها من المخزن إن وُجد). يمكن استرجاعها لاحقًا من سلة المهملات. متأكد؟', () => {
                if (p.stocked) reverseStockMovement(b, p.stockItemName, p.type, p.stockQty, p.stockUnit);
                b.purchases = b.purchases.filter(x => x.id !== id);
                softDeleteToTrash(b, 'purchase', p, `🗑️ حذف عملية شراء: ${p.desc || p.type} (${money(p.total)})`, p.stocked ? 'ملحوظة: تم سحب أثرها من المخزن وقت الحذف ولن يُعاد تلقائيًا — راجع رصيد المخزن يدويًا لو استرجعتها' : null);
                persist();
                render();
                showToast('تم الحذف');
            });
        }

        // ============ Sales CRUD ============
        let editingSaleId = null;

