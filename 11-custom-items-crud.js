        function editCustom(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            const c = b.customItems.find(c => c.id === id);
            if (!c) return;
            editingCustomId = id;
            document.getElementById('c_name').value = c.name;
            document.getElementById('c_date').value = c.date || todayStr();
            document.getElementById('c_type').value = c.type;
            document.getElementById('c_amount').value = c.amount;
            document.getElementById('c_note').value = c.note || '';
            document.getElementById('customModalOverlay').classList.add('show');
        }

        function saveCustom() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix: deleteCustom كانت محمية وsaveCustom (الإضافة/التعديل) لأ — عدم اتساق كان بيسمح بإضافة حركات مالية حرة
            const b = getActiveBatch();
            if (!b) return;
            const name = document.getElementById('c_name').value.trim();
            const date = document.getElementById('c_date').value || todayStr();
            const type = document.getElementById('c_type').value;
            const amount = parseFloat(document.getElementById('c_amount').value) || 0;
            const note = document.getElementById('c_note').value.trim();
            if (!name || !amount) { showToast('أدخل اسم البند والقيمة'); return; }
            const newId = editingCustomId || uid();
            if (editingCustomId) { b.customItems = b.customItems.filter(c => c.id !== editingCustomId); }
            b.customItems.push({ id: newId, name, date, type, amount, note });
            editingCustomId = null;
            persist();
            closeModal('customModalOverlay');
            render();
            showToast('تم إضافة البند');
        }

        function deleteCustom(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const c = b.customItems.find(c => c.id === id);
            showConfirm('سيتم حذف هذا البند. يمكن استرجاعه لاحقًا من سلة المهملات. متأكد؟', () => { b.customItems = b.customItems.filter(c => c.id !== id);
                if (c) softDeleteToTrash(b, 'custom', c, `🗑️ حذف بند: ${c.name || ''}`);
                persist();
                render();
                showToast('تم الحذف'); });
        }

        // ============ Operations & Biosecurity CRUD ============
