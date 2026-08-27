        function openWaterCalcModal() {
            document.getElementById('wc_tank').value = '';
            document.getElementById('wc_doseQty').value = '';
            document.getElementById('wc_doseWater').value = '';
            document.getElementById('wc_doseUnit').value = 'مل';
            document.getElementById('wc_bwDose').value = '';
            document.getElementById('wc_bwBirds').value = '';
            document.getElementById('wc_bwWeight').value = '';
            document.getElementById('wc_bwWater').value = '';
            document.getElementById('waterCalcResult').innerHTML = '';
            setWaterCalcMode('water');
            openModal('waterCalcModalOverlay');
        }
        let waterCalcMode = 'water';
        function setWaterCalcMode(mode) {
            waterCalcMode = mode;
            document.getElementById('wc_waterModeWrap').style.display = mode === 'water' ? '' : 'none';
            document.getElementById('wc_bwModeWrap').style.display = mode === 'bodyweight' ? '' : 'none';
            document.getElementById('wc_modeBtnWater').classList.toggle('gold', mode === 'water');
            document.getElementById('wc_modeBtnWater').classList.toggle('ghost', mode !== 'water');
            document.getElementById('wc_modeBtnBw').classList.toggle('gold', mode === 'bodyweight');
            document.getElementById('wc_modeBtnBw').classList.toggle('ghost', mode !== 'bodyweight');
            if (mode === 'bodyweight') prefillWaterCalcBodyweight();
            computeWaterDilution();
        }

        // تعبئة تلقائية لحاسبة الجرعة بالوزن الحي من بيانات الدفعة النشطة (عدد الطيور، آخر وزن مسجَّل، تقدير استهلاك الماء)
        function prefillWaterCalcBodyweight() {
            const b = getActiveBatch();
            if (!b) return;
            const m = computeMetrics(b);
            const birdsEl = document.getElementById('wc_bwBirds');
            const weightEl = document.getElementById('wc_bwWeight');
            const waterEl = document.getElementById('wc_bwWater');
            if (birdsEl && !birdsEl.value) birdsEl.value = Math.round(m.liveCount || b.startCount || 0);
            if (weightEl && !weightEl.value) {
                const last = m.series && m.series.length ? m.series[m.series.length - 1] : null;
                weightEl.value = last && last.effWeight ? Math.round(last.effWeight) : '';
            }
            if (waterEl && !waterEl.value) {
                const lastWaterRec = [...b.records].reverse().find(r => (r.waterDay != null) || (r.waterNight != null));
                const lastWaterTotal = lastWaterRec ? (lastWaterRec.waterDay || 0) + (lastWaterRec.waterNight || 0) : 0;
                waterEl.value = lastWaterTotal > 0 ? fmt(lastWaterTotal, 1) : fmt((m.liveCount || 0) * 0.2, 0); // تقدير تقريبي: 200 مل/طائر لو مفيش سجل ماء
            }
        }

        function computeWaterDilution() {
            const box = document.getElementById('waterCalcResult');
            if (waterCalcMode === 'bodyweight') {
                const dose = parseFloat(document.getElementById('wc_bwDose').value) || 0;
                const birds = parseFloat(document.getElementById('wc_bwBirds').value) || 0;
                const weightG = parseFloat(document.getElementById('wc_bwWeight').value) || 0;
                const waterL = parseFloat(document.getElementById('wc_bwWater').value) || 0;
                if (dose <= 0 || birds <= 0 || weightG <= 0 || waterL <= 0) { box.innerHTML = '<p style="color:var(--muted);">أدخل الجرعة وعدد الطيور والوزن واستهلاك الماء لعرض النتيجة.</p>'; return; }
                const totalLiveKg = birds * (weightG / 1000);
                const totalDoseMg = dose * totalLiveKg;
                const totalDoseG = totalDoseMg / 1000;
                const concPerLiterMg = totalDoseMg / waterL;
                const tank = parseFloat(document.getElementById('wc_tank').value) || 0;
                box.innerHTML = `
                    ${statLine(`إجمالي الوزن الحي للقطيع`, `${fmt(totalLiveKg,1)} كجم`)}
                    ${statLine(`إجمالي الجرعة المطلوبة اليوم`, `${totalDoseG >= 1 ? fmt(totalDoseG,2)+' جم' : fmt(totalDoseMg,0)+' مجم'}`, {vStyle:`color:var(--green);font-weight:900;`})}
                    ${statLine(`التركيز لكل لتر ماء شرب`, `${fmt(concPerLiterMg,1)} مجم/لتر`)}
                    ${tank > 0 ? `${statLine(`الكمية لكامل خزان ${fmt(tank,1)} لتر`, `${fmt((concPerLiterMg*tank)/1000,2)} جم`, {vStyle:`color:var(--green);font-weight:900;`})}` : ''}
                    <p style="font-size:11px;color:var(--muted);margin-top:8px;">💡 المضاد الحيوي بيتوزّع حسب الوزن الحي مش حسب حجم الخزان — لو الخزان معزول واستهلاك الماء الفعلي منه مختلف عن التقدير، عدّل "استهلاك الماء المتوقع" ليطابق الواقع، والتركيز هيتحدث تلقائيًا. اقسم الجرعة اليومية على وجبتين (صباحًا ومساءً) فى مياه صايمة عطشانة لضمان استهلاك كامل الجرعة خلال ساعتين لـ4 ساعات، والتزم بفترة الحظر (Withdrawal period) المذكورة على الملصق قبل الذبح.</p>`;
                return;
            }
            const tank = parseFloat(document.getElementById('wc_tank').value) || 0;
            const doseQty = parseFloat(document.getElementById('wc_doseQty').value) || 0;
            const doseWater = parseFloat(document.getElementById('wc_doseWater').value) || 0;
            const unit = document.getElementById('wc_doseUnit').value;
            if (tank <= 0 || doseQty <= 0 || doseWater <= 0) { box.innerHTML = '<p style="color:var(--muted);">أدخل القيم الثلاث لعرض النتيجة.</p>'; return; }
            const perLiter = doseQty / doseWater;
            const totalNeeded = perLiter * tank;
            box.innerHTML = `
                ${statLine(`التركيز لكل لتر ماء`, `${fmt(perLiter,3)} ${unit}/لتر`)}
                ${statLine(`الكمية المطلوبة لكامل الخزان (${fmt(tank,1)} لتر)`, `${fmt(totalNeeded,2)} ${unit}`, {vStyle:`color:var(--green);font-weight:900;`})}
                <p style="font-size:11px;color:var(--muted);margin-top:8px;">💡 قلّب المحلول جيدًا بعد الإضافة، وتأكد إن كل الطيور قادرة توصل لنقاط الشرب خلال فترة سريان الجرعة (عادة تُعطى فى مياه صايمة عطشانة لضمان استهلاك كامل الجرعة خلال ساعتين إلى 4 ساعات).</p>`;
        }

        function openFeedCalcModal() {
            feedCalcRows = [
                { id: uid(), name: 'ذرة صفراء', protein: 8.5, price: 12, qty: 60 },
                { id: uid(), name: 'كسب صويا 44%', protein: 44, price: 22, qty: 30 },
                { id: uid(), name: 'مركز/إضافات ومعادن', protein: 0, price: 15, qty: 10 },
            ];
            renderFeedCalcRows();
            document.getElementById('feedCalcModalOverlay').classList.add('show');
        }

        function renderFeedCalcRows() {
            document.getElementById('feedCalcRows').innerHTML = feedCalcRows.map(r => `
                <div class="form-grid" style="grid-template-columns:2fr 1fr 1fr 1fr auto;align-items:end;margin-top:8px;">
                    <div class="field"><label>المكون</label><input value="${esc(r.name)}" oninput="updateFeedCalcRow('${r.id}','name',this.value)"></div>
                    <div class="field"><label>بروتين %</label><input type="number" inputmode="decimal" step="0.1" value="${r.protein}" oninput="updateFeedCalcRow('${r.id}','protein',this.value)"></div>
                    <div class="field"><label>سعر الكيلو</label><input type="number" inputmode="decimal" step="0.01" value="${r.price}" oninput="updateFeedCalcRow('${r.id}','price',this.value)"></div>
                    <div class="field"><label>الكمية (كجم)</label><input type="number" inputmode="decimal" step="0.1" value="${r.qty}" oninput="updateFeedCalcRow('${r.id}','qty',this.value)"></div>
                    <button class="btn danger sm" onclick="removeFeedCalcRow('${r.id}')">🗑️</button>
                </div>`).join('');
            recalcFeedCalc();
        }

        function updateFeedCalcRow(id, field, value) {
            const r = feedCalcRows.find(x => x.id === id);
            if (!r) return;
            r[field] = (field === 'name') ? value : (parseFloat(value) || 0);
            recalcFeedCalc();
        }

        function addFeedCalcRow() { feedCalcRows.push({ id: uid(), name: '', protein: 0, price: 0, qty: 0 });
            renderFeedCalcRows(); }

        function removeFeedCalcRow(id) { feedCalcRows = feedCalcRows.filter(x => x.id !== id);
            renderFeedCalcRows(); }

        function recalcFeedCalc() {
            const totalQty = feedCalcRows.reduce((s, r) => s + (r.qty || 0), 0);
            const totalCost = feedCalcRows.reduce((s, r) => s + (r.qty || 0) * (r.price || 0), 0);
            const totalProtein = feedCalcRows.reduce((s, r) => s + (r.qty || 0) * (r.protein || 0), 0);
            const avgProtein = totalQty > 0 ? totalProtein / totalQty : 0;
            const costPerKg = totalQty > 0 ? totalCost / totalQty : 0;
            document.getElementById('feedCalcResults').innerHTML = `
                ${statLine(`إجمالي وزن الخلطة`, `${fmt(totalQty,1)} كجم`)}
                ${statLine(`نسبة البروتين الناتجة (تقريبية)`, `${fmt(avgProtein,2)}%`)}
                ${statLine(`تكلفة كيلو العلف`, `${fmt(costPerKg,2)} ج/كجم`, {lineStyle:`border-top:2px solid var(--barn-dark);padding-top:8px;`,kStyle:`font-weight:900;color:var(--barn-dark);`,vStyle:`font-size:17px;color:var(--barn-dark);`})}
                ${statLine(`إجمالي تكلفة الخلطة`, `${money(totalCost)}`)}
                <p style="font-size:10.5px;color:var(--muted);margin-top:8px;">💡 هذا حساب تقريبي لنسبة البروتين الكلية بناءً على أوزان المكونات، وليس بديلاً عن استشارة أخصائي تغذية للتأكد من توازن الطاقة والأحماض الأمينية.</p>`;
        }

        function openReminderModal() { if (!getActiveBatch()) { showToast('أضف دفعة أولاً'); return; }
            document.getElementById('r_date').value = todayStr();
            document.getElementById('r_category').value = 'other';
            document.getElementById('r_repeat').value = '0';
            document.getElementById('r_repeat_days').value = '';
            document.getElementById('r_repeat_custom_wrap').style.display = 'none';
            document.getElementById('reminderModalOverlay').classList.add('show'); }

        function openVaccineModal() { if (!getActiveBatch()) { showToast('أضف دفعة أولاً'); return; }
            document.getElementById('v_doseMode').value = 'fixed';
            document.getElementById('v_ampoulesPerGroup').value = '';
            document.getElementById('v_birdsPerGroup').value = '';
            if (document.getElementById('v_time')) document.getElementById('v_time').value = '';
            if (document.getElementById('v_lead')) document.getElementById('v_lead').value = '30';
            toggleVaccineDoseModeFields();
            document.getElementById('vaccineModalOverlay').classList.add('show'); }

        function treatModalDefaultTitle(b) {
            const ft = (b && b.floorType) || 'litter';
            return ft === 'cage' ? '🪣 إضافة معاملة للأحواض/سير إزالة الزرق'
                : ft === 'slat' ? '🪣 إضافة معاملة للأرضية الشبكية'
                : '🪣 إضافة معاملة للفرشة/السبلة';
        }
        function openTreatModal() { if (!getActiveBatch()) { showToast('أضف دفعة أولاً'); return; }
            document.getElementById('treatModalTitle').textContent = treatModalDefaultTitle(getActiveBatch());
            document.getElementById('treatModalOverlay').classList.add('show'); }
        let stockMode = 'in';

        function openStockModal(mode) {
            if (!getActiveBatch()) { showToast('أضف دفعة أولاً'); return; }
            editingMovementId = null;
            stockMode = mode;
            document.getElementById('stockModalTitle').textContent = mode === 'in' ? 'إضافة كمية للمخزن' :
                mode === 'adjust' ? '🗑️ حذف / تسوية كمية من المخزن (لا تُحسب كاستهلاك)' : 'تسجيل استهلاك من المخزن';
            document.getElementById('stockModalBtn').textContent = mode === 'in' ? 'إضافة للمخزن' :
                mode === 'adjust' ? 'حذف من المخزن' : 'تسجيل الاستهلاك';
            ['st_name', 'st_qty', 'st_note'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('st_category').selectedIndex = 0;
            document.getElementById('st_unit').selectedIndex = 0;
            document.getElementById('st_date').value = todayStr(); document.getElementById('st_date').max = todayStr();
            document.getElementById('stockModalOverlay').classList.add('show');
        }

        // لو الاسم المكتوب يطابق عنصر موجود بالفعل فى المخزن، نطابق التصنيف والوحدة تلقائيًا
        // حتى لا تُنشأ نسخة مكررة من نفس الصنف بتصنيف مختلف ويظل الرصيد الأصلي بدون تحديث
        function onStockNameInput() {
            const b = getActiveBatch();
            if (!b) return;
            const typed = document.getElementById('st_name').value.trim().toLowerCase();
            if (!typed) return;
            const match = b.inventory.find(i => i.name.trim().toLowerCase() === typed);
            if (match) {
                document.getElementById('st_category').value = match.category;
                document.getElementById('st_unit').value = match.unit;
            }
        }

        function onFabClick() {
            const t = state.activeTab;
            if (t === 'daily') openDailyModal('day');
            else openDailyModal('day');
        }

        function toggleSaleKind() {
            const kind = document.getElementById('s_kind').value;
            document.getElementById('saleMeatFields').style.display = kind === 'meat' ? 'grid' : 'none';
            document.getElementById('saleLitterFields').style.display = kind === 'litter' ? 'grid' : 'none';
            if (kind === 'meat') toggleSaleProductType();
            recalcSaleTotal();
        }

        function toggleSaleProductType() {
            const pt = document.getElementById('s_producttype').value;
            const showExtra = pt === 'whole' || pt === 'parts';
            document.getElementById('s_carcasswrap').style.display = showExtra ? '' : 'none';
            document.getElementById('s_processwrap').style.display = showExtra ? '' : 'none';
        }

        function recalcPurchaseTotal() {
            const qty = parseFloat(document.getElementById('p_qty').value) || 0;
            const price = parseFloat(document.getElementById('p_price').value) || 0;
            if (qty && price) {
                document.getElementById('p_total').value = (qty * price).toFixed(2);
            }
        }

        function recalcSaleTotal() {
            const kind = document.getElementById('s_kind').value;
            if (kind === 'meat') {
                const w = parseFloat(document.getElementById('s_weight').value) || 0;
                const p = parseFloat(document.getElementById('s_price').value) || 0;
                if (w && p) document.getElementById('s_total').value = (w * p).toFixed(2);
            } else {
                const h = parseFloat(document.getElementById('s_litterheight').value) || 0;
                const area = parseFloat(document.getElementById('s_litterarea').value) || (getActiveBatch() ? getActiveBatch().area || 0 : 0);
                const vol = h * area;
                document.getElementById('s_littervolume').value = vol ? vol.toFixed(2) : '';
                const pr = parseFloat(document.getElementById('s_litterprice').value) || 0;
                if (vol && pr) document.getElementById('s_total').value = (vol * pr).toFixed(2);
            }
        }

        // ============ Batch CRUD ============
