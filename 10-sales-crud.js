        function editSale(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            const s = b.sales.find(s => s.id === id);
            if (!s) return;
            editingSaleId = id;
            document.getElementById('s_kind').value = s.kind || 'meat';
            toggleSaleKind();
            const mInfo = manureSaleInfo(b);
            document.getElementById('s_kindLitterOpt').textContent = mInfo.optLabel;
            const hintEl = document.getElementById('saleLitterHint'); if (hintEl) hintEl.textContent = mInfo.hint;
            document.getElementById('s_date').value = s.date;
            document.getElementById('s_buyer').value = s.buyer || '';
            if (s.kind === 'litter') {
                document.getElementById('s_litterheight').value = s.litterHeight || '';
                document.getElementById('s_litterarea').value = s.litterArea || (getActiveBatch().area || '');
                document.getElementById('s_littervolume').value = s.volume || '';
                document.getElementById('s_litterprice').value = s.price || '';
            } else {
                document.getElementById('s_count').value = s.count || '';
                document.getElementById('s_weight').value = s.weight || '';
                document.getElementById('s_price').value = s.price || '';
                document.getElementById('s_producttype').value = s.productType || 'live';
                document.getElementById('s_carcassyield').value = s.carcassYield || '';
                document.getElementById('s_processcost').value = s.processCost || '';
                toggleSaleProductType();
            }
            document.getElementById('s_total').value = s.total;
            document.getElementById('s_paid').value = s.paid === false ? '0' : '1';
            document.getElementById('s_due').value = s.dueDate || '';
            if (document.getElementById('s_dueTime')) document.getElementById('s_dueTime').value = s.dueTime || '';
            if (document.getElementById('s_dueLead')) document.getElementById('s_dueLead').value = s.notifyLeadMinutes != null ? String(s.notifyLeadMinutes) : '60';
            toggleSaleDue();
            document.getElementById('saleModalOverlay').classList.add('show');
        }

        function saveSale() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const kind = document.getElementById('s_kind').value;
            const date = document.getElementById('s_date').value;
            const buyer = document.getElementById('s_buyer').value.trim();
            let total = parseFloat(document.getElementById('s_total').value);
            const paid = document.getElementById('s_paid').value !== '0';
            const dueDate = paid ? null : (document.getElementById('s_due').value || null);
            const dueTime = paid ? null : (document.getElementById('s_dueTime') ? (document.getElementById('s_dueTime').value || null) : null);
            const notifyLeadMinutes = paid ? 0 : (document.getElementById('s_dueLead') ? parseInt(document.getElementById('s_dueLead').value, 10) || 0 : 0);
            let sale = { id: editingSaleId || uid(), kind, date, buyer, paid, dueDate, dueTime, notifyLeadMinutes };
            if (kind === 'meat') {
                const count = parseInt(document.getElementById('s_count').value) || 0;
                const weight = parseFloat(document.getElementById('s_weight').value) || 0;
                const price = parseFloat(document.getElementById('s_price').value) || 0;
                const productType = document.getElementById('s_producttype').value;
                const carcassYield = parseFloat(document.getElementById('s_carcassyield').value) || 0;
                const processCost = parseFloat(document.getElementById('s_processcost').value) || 0;
                // ⚠️ إصلاح: كان ممكن تتسجّل عملية بيع بعدد/وزن صفر وإجمالي مُدخل يدويًا — فيضخّم
                // إيراد المبيعات (meatRevenue) فى الحسابات المالية من غير ما يقابله أي كجم مباع
                // فعليًا، فيشوّه متوسط سعر البيع (avgSalePrice) لكل عمليات البيع مجتمعة.
                if (count <= 0 || weight <= 0) { showToast('⚠️ أدخل عدد ووزن أكبر من صفر لعملية بيع اللحم'); return; }
                if (isNaN(total)) total = weight * price;
                Object.assign(sale, { count, weight, price, productType, carcassYield, processCost, total });
                // نغذّي سجل سعر السوق بالسعر الفعلي اللي اتباع بيه — نفس السجل المستخدم فى حاسبة يوم البيع الأمثل
                if (price > 0) recordMarketPrice(b, price);
            } else {
                const litterHeight = parseFloat(document.getElementById('s_litterheight').value) || 0;
                const litterArea = parseFloat(document.getElementById('s_litterarea').value) || (b.area || 0);
                const volume = litterHeight * litterArea;
                const price = parseFloat(document.getElementById('s_litterprice').value) || 0;
                // نفس إصلاح بيع اللحم: مانعين إجمالي مُدخل بدون ارتفاع/مساحة حقيقيين وراهم، عشان
                // لا يتضخّم litterRevenue من غير litterVolumeM3 مقابل له.
                if (litterHeight <= 0 || litterArea <= 0) { showToast('⚠️ أدخل ارتفاع ومساحة الفرشة أكبر من صفر'); return; }
                if (isNaN(total)) total = volume * price;
                Object.assign(sale, { litterHeight, litterArea, volume, price, total });
            }
            // 🔒 Red Team fix: نفس إصلاح savePurchase — رفض القيم السالبة والصفرية مش بس الفارغة
            if (!date || isNaN(total) || total <= 0) { showToast('أدخل التاريخ وإجمالي أكبر من صفر'); return; }
            if (editingSaleId) { b.sales = b.sales.filter(s => s.id !== editingSaleId); }
            b.sales.push(sale);
            b.sales.sort((a, c) => a.date.localeCompare(c.date));
            editingSaleId = null;
            persist();
            closeModal('saleModalOverlay');
            render();
            showToast('تم حفظ عملية البيع 💰');
        }

        // تسجيل سريع لتحصيل/سداد بضغطة واحدة من الجدول، بدون فتح النموذج الكامل
        function markPurchasePaid(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const p = b.purchases.find(x => x.id === id);
            if (!p) return;
            p.paid = true; p.dueDate = null;
            logAudit(b, `💳 تسجيل سداد مستحق مورد: ${p.desc || p.type} (${money(p.total)})`);
            persist();
            render();
            showToast('✅ تم تسجيل السداد');
        }
        function markSaleCollected(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const s = b.sales.find(x => x.id === id);
            if (!s) return;
            s.paid = true; s.dueDate = null;
            logAudit(b, `💳 تسجيل تحصيل مستحق من مشترٍ: ${s.buyer || '—'} (${money(s.total)})`);
            persist();
            render();
            showToast('✅ تم تسجيل التحصيل');
        }

        function deleteSale(id) {
            if (!requirePermission('management')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const s = b.sales.find(s => s.id === id);
            showConfirm('سيتم حذف عملية البيع هذه. يمكن استرجاعها لاحقًا من سلة المهملات. متأكد؟', () => {
                b.sales = b.sales.filter(s => s.id !== id);
                if (s) softDeleteToTrash(b, 'sale', s, `🗑️ حذف عملية بيع: ${money(s.total)}`);
                persist();
                render();
                showToast('تم الحذف'); });
        }

        // ============ Custom items CRUD ============
        let editingCustomId = null;
        let editingBatchId = null;
        let editingVaccineId = null;
        let editingTreatmentId = null;
        let editingReminderId = null;
        let editingFeedAdditiveId = null;
        let editingWaterAdditiveId = null;
        let editingBiosecurityId = null;
        let editingHouseId = null;
        let editingMovementId = null;
        let editingChecklistTaskId = null;

