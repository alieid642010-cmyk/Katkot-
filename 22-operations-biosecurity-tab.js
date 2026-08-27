        function selectBioChip(idx) {
            const sel = document.getElementById('bio_type');
            if (!sel) return;
            sel.selectedIndex = idx;
            document.querySelectorAll('.bio-chip').forEach((el,i) => {
                el.classList.toggle('gold', i === idx);
                el.classList.toggle('ghost', i !== idx);
            });
            document.getElementById('bioExtraFields').style.display = 'block';
        }


        // ============ Alerts Tab ============
        // ============ Finance Tab ============
        // ============ التقرير الشامل (إنتاجي + مالي) ============
        // ============ التقويم المالي الموحّد: مستحقات دفع + تواريخ بيع متوقعة + تدفقات نقدية قادمة فى شاشة واحدة ============
