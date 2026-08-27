        function showConfirm(message, onYes, title, onNo) {
            document.getElementById('confirmTitle').textContent = title || 'تأكيد العملية';
            document.getElementById('confirmText').textContent = message;
            pendingConfirmAction = onYes;
            pendingConfirmCancelAction = onNo || null;
            document.getElementById('confirmModalOverlay').classList.add('show');
        }
        function showInfo(title, message) {
            document.getElementById('infoModalTitle').textContent = title || 'معلومة';
            document.getElementById('infoModalText').textContent = message;
            document.getElementById('infoModalOverlay').classList.add('show');
        }

        function confirmYes() { const act = pendingConfirmAction; closeModal('confirmModalOverlay');
            pendingConfirmAction = null; pendingConfirmCancelAction = null; if (act) act(); }

        function confirmNo() { const act = pendingConfirmCancelAction; closeModal('confirmModalOverlay');
            pendingConfirmAction = null; pendingConfirmCancelAction = null; if (act) act(); }

        // ===== Password prompt modal (بديل مصمَّم لنافذة prompt() الأصلية — بيدعم إخفاء/إظهار كلمة المرور
        // وبيشتغل بثبات جوه أي بيئة (PWA/webview)، بعكس نوافذ المتصفح الأصلية اللي ممكن تتصرف بشكل غير متوقع) =====
        let pendingPasswordSubmit = null, pendingPasswordCancel = null;
        function showPasswordPrompt(title, message, onSubmit, onCancel) {
            document.getElementById('pwModalTitle').textContent = title || '🔒 كلمة المرور';
            document.getElementById('pwModalText').textContent = message || '';
            document.getElementById('pwModalInput').value = '';
            document.getElementById('pwModalShow').checked = false;
            document.getElementById('pwModalInput').type = 'password';
            pendingPasswordSubmit = onSubmit || null;
            pendingPasswordCancel = onCancel || null;
            document.getElementById('passwordModalOverlay').classList.add('show');
            setTimeout(() => document.getElementById('pwModalInput').focus(), 50);
        }
        function pwModalSubmit() {
            const val = document.getElementById('pwModalInput').value;
            const act = pendingPasswordSubmit; closeModal('passwordModalOverlay');
            pendingPasswordSubmit = null; pendingPasswordCancel = null; if (act) act(val);
        }
        function pwModalCancel() {
            const act = pendingPasswordCancel; closeModal('passwordModalOverlay');
            pendingPasswordSubmit = null; pendingPasswordCancel = null; if (act) act();
        }

        // ===== Modals =====
        function openBatchModal() {
            if (currentRole === 'worker' && !workerHasPermission('createBatch')) { showToast('🚫 مالك المزرعة لم يمنحك صلاحية إنشاء دفعات جديدة'); return; }
            const cloneWrap = document.getElementById('b_cloneWrap');
            if (cloneWrap) { cloneWrap.style.display = ''; const sel = document.getElementById('b_cloneSelect'); if (sel) sel.innerHTML = batchTemplateOptionsHtml(); }
            document.getElementById('b_date').value = todayStr(); document.getElementById('b_date').max = todayStr();
            document.getElementById('b_location').value = '';
            document.getElementById('b_species').value = 'broiler';
            onSpeciesChange();
            document.getElementById('b_heattype').value = 'gas';
            onHeatTypeChange();
            document.getElementById('b_venttype').value = 'natural';
            document.getElementById('b_fancapacity').value = '';
            document.getElementById('b_fancount').value = '';
            onVentTypeChange();
            document.getElementById('b_floortype').value = 'litter';
            document.getElementById('b_cagetiers').value = '1';
            onFloorTypeChange();
            updateDensitySuggestion();
            const cfg = AS();
            document.getElementById('b_feedStarterKg').value = cfg.feedStageStarterKg;
            document.getElementById('b_feedGrowerKg').value = cfg.feedStageGrowerKg;
            const protoSel = document.getElementById('b_applyProtocol');
            if (protoSel) protoSel.innerHTML = `<option value="">بدون — أضف الإضافات والمعاملات يدويًا بعدين</option>` + (state.protocols || []).map(p => `<option value="${p.id}">${esc(p.name)}${p.bestOfBreed ? ' ⭐ (مُولَّد تلقائيًا من أفضل الدورات)' : ''}</option>`).join('');
            document.getElementById('batchModalOverlay').classList.add('show');
        }

        function editBatch(id) {
            if (currentRole === 'worker' && !workerHasPermission('createBatch')) { showToast('🚫 مالك المزرعة لم يمنحك صلاحية تعديل بيانات الدفعة'); return; }
            const b = state.batches.find(x => x.id === id);
            if (!b) return;
            const cloneWrap = document.getElementById('b_cloneWrap');
            if (cloneWrap) cloneWrap.style.display = 'none';
            editingBatchId = id;
            document.getElementById('b_name').value = b.name || '';
            document.getElementById('b_location').value = b.location || '';
            document.getElementById('b_species').value = b.species || 'broiler';
            onSpeciesChange();
            document.getElementById('b_date').value = b.startDate || todayStr();
            document.getElementById('b_date').max = todayStr();
            document.getElementById('b_count').value = b.startCount || '';
            document.getElementById('b_breed').value = b.breed || '';
            document.getElementById('b_startweight').value = b.startweight || '';
            document.getElementById('b_chickprice').value = b.chickprice || '';
            document.getElementById('b_feedprice').value = b.feedprice || '';
            document.getElementById('b_area').value = b.area || '';
            document.getElementById('b_targetage').value = b.targetAge || '';
            document.getElementById('b_targetweight').value = b.targetWeight || '';
            document.getElementById('b_heattype').value = b.heattype || 'gas';
            onHeatTypeChange();
            document.getElementById('b_heatprice').value = b.heatprice || '';
            document.getElementById('b_venttype').value = b.ventType || 'natural';
            document.getElementById('b_fancapacity').value = b.fanCapacityM3h || '';
            document.getElementById('b_fancount').value = b.fanCount || '';
            onVentTypeChange();
            document.getElementById('b_floortype').value = b.floorType || 'litter';
            document.getElementById('b_cagetiers').value = b.cageTiers || 1;
            onFloorTypeChange();
            document.getElementById('b_startmonth').value = b.startmonth || (new Date().getMonth() + 1);
            updateDensitySuggestion();
            const cfg = AS();
            document.getElementById('b_feedStarterKg').value = b.feedStageStarterKg != null ? b.feedStageStarterKg : cfg.feedStageStarterKg;
            document.getElementById('b_feedGrowerKg').value = b.feedStageGrowerKg != null ? b.feedStageGrowerKg : cfg.feedStageGrowerKg;
            const protoSel2 = document.getElementById('b_applyProtocol');
            if (protoSel2) protoSel2.innerHTML = `<option value="">بدون تغيير</option>` + (state.protocols || []).map(p => `<option value="${p.id}">${esc(p.name)}${p.bestOfBreed ? ' ⭐ (مُولَّد تلقائيًا من أفضل الدورات)' : ''}</option>`).join('');
            document.getElementById('batchModalTitle').textContent = `✏️ تعديل بيانات دفعة: ${b.name}`;
            document.getElementById('batchModalBtn').textContent = 'حفظ التعديلات';
            document.getElementById('batchModalOverlay').classList.add('show');
        }

        function onSpeciesChange() {
            const key = document.getElementById('b_species').value;
            const sp = getSpeciesData(key);
            document.getElementById('b_startweight').value = sp.weight[0][1];
            document.getElementById('b_targetage').value = sp.cycleDays;
            document.getElementById('b_targetweight').value = sp.weight[sp.weight.length - 1][1];
            updateDensitySuggestion();
        }

        // ============ اقتراح كثافة تربية تلقائي للدورة القادمة — مبني على أفضل أداء EPEF فعلي فى دورات سابقة لنفس النوع ============
        function computeSuggestedDensity(species, capDensity) {
            const analysis = computeDensityPerformanceAnalysis();
            if (!analysis) return null;
            // نفضّل دورات نفس النوع لو متاحة بعدد كافٍ، وإلا نستخدم كل الدورات كتقريب عام
            const sameSpeciesRows = analysis.rows.filter(r => {
                const bb = state.batches.find(x => x.name === r.name);
                return bb && bb.species === species;
            });
            const rows = sameSpeciesRows.length >= 3 ? sameSpeciesRows : analysis.rows;
            if (!rows.length) return null;
            // بدل الاعتماد على دورة واحدة صاحبة أعلى EPEF (ممكن تكون استثناء/حظ ظروف، مش نمط يستاهل التعميم)،
            // ناخد متوسط كثافة أفضل الدورات (أعلى 3 أو أعلى ثلثهم أيهما أكبر) لتوصية أكثر ثباتًا واستقرارًا.
            const sorted = [...rows].sort((a, c) => c.epef - a.epef);
            const topN = Math.max(3, Math.ceil(sorted.length / 3));
            const topRows = sorted.slice(0, Math.min(topN, sorted.length));
            const avgDensity = topRows.reduce((s, r) => s + r.maxDensity, 0) / topRows.length;
            const avgEpef = topRows.reduce((s, r) => s + r.epef, 0) / topRows.length;
            // سقف أمان: مهما كان الأداء التاريخي جيدًا، لا تتخطى التوصية الحد الآمن الفعلي لنظام التهوية/الأرضية المختار للدفعة الجديدة
            const cappedDensity = capDensity > 0 ? Math.min(avgDensity, capDensity) : avgDensity;
            return { density: cappedDensity, wasCapped: capDensity > 0 && avgDensity > capDensity, epef: avgEpef,
                basedOn: sameSpeciesRows.length >= 3 ? 'نفس النوع' : 'كل الأنواع', count: rows.length, sampleUsed: topRows.length };
        }
        function updateDensitySuggestion() {
            const box = document.getElementById('b_densityBox');
            if (!box) return;
            const species = document.getElementById('b_species').value;
            const area = parseFloat(document.getElementById('b_area').value) || 0;
            const targetWeight = parseFloat(document.getElementById('b_targetweight').value) || 0;
            const ventType = document.getElementById('b_venttype') ? document.getElementById('b_venttype').value : 'natural';
            const floorType = document.getElementById('b_floortype') ? document.getElementById('b_floortype').value : 'litter';
            const capDensity = getMaxSafeDensity({ ventType, floorType });
            const sug = computeSuggestedDensity(species, capDensity);
            if (!sug || area <= 0 || targetWeight <= 0) { box.style.display = 'none'; return; }
            const suggestedCount = Math.round((sug.density * area) / (targetWeight / 1000));
            box.style.display = '';
            box.innerHTML = `⚖️📊 كثافة مقترحة بناءً على متوسط أفضل ${sug.sampleUsed} دورات (EPEF متوسط ${fmt(sug.epef,0)}) فى دوراتك السابقة (${sug.basedOn}، ${sug.count} دورة إجمالًا): <b>${fmt(sug.density,1)} كجم/م²</b> عند وزن البيع المستهدف
                ${sug.wasCapped ? `<br><span style="color:var(--warning-text);">⚠️ تم تقييدها عند الحد الآمن (${fmt(capDensity,1)} كجم/م²) لنظام التهوية/الأرضية المختار — أداؤك التاريخي كان أعلى لكنه يتخطى الحد الآمن الموصى به لهذا الإعداد</span>` : ''}
                → يقترح استلام <b>${fmt(suggestedCount,0)}</b> كتكوت/صغير لمساحة ${fmt(area,1)} م² (بافتراض نفوق طبيعي حتى نهاية الدورة).
                <button type="button" class="btn ghost sm" style="margin-top:6px;" onclick="document.getElementById('b_count').value=${suggestedCount};showToast('✅ تم تعبئة العدد المقترح')">استخدم هذا العدد</button>`;
        }

        function onHeatTypeChange() {
            const ht = document.getElementById('b_heattype').value;
            const wrap = document.getElementById('b_heatpricewrap');
            const label = document.getElementById('b_heatpricelabel');
            if (ht === 'gas') { wrap.style.display = ''; label.textContent = 'سعر أنبوبة الغاز الواحدة'; document.getElementById('b_heatprice').placeholder = 'جنيه / أنبوبة'; }
            else if (ht === 'solar') { wrap.style.display = ''; label.textContent = 'سعر لتر السولار/الديزل'; document.getElementById('b_heatprice').placeholder = 'جنيه / لتر'; }
            else { wrap.style.display = 'none'; }
        }

        function onVentTypeChange() {
            const vt = document.getElementById('b_venttype').value;
            const showFans = (vt === 'tunnel' || vt === 'mixed');
            document.getElementById('b_fancapacitywrap').style.display = showFans ? '' : 'none';
            document.getElementById('b_fancountwrap').style.display = showFans ? '' : 'none';
        }

        // ============ نظام التربية/الأرضية: فرشة (أرضي) / أرضية شبك-بلاستيك / بطاريات (أقفاص) ============
        // مرجع مركزي لتسميات ونصائح كل نظام، يُستخدم فى نموذج الدفعة وفى تحليلات البيئة والكثافة والفرشة/السبلة
        const FLOOR_TYPE_INFO = {
            litter: { label: 'أرضي بفرشة', short: 'الفرشة', hint: '💡 راقب جفاف وتماسك الفرشة دوريًا — الرطوبة الزائدة أكبر مصدر لارتفاع الأمونيا فى هذا النظام.' },
            slat: { label: 'أرضية شبك/بلاستيك', short: 'الأرضية الشبكية', hint: '💡 الزرق يسقط أسفل الشبك فينخفض تلامس الطائر بالرطوبة، لكن راقب تهوية الحيز السفلي وتجمّع الزرق تحته لتفادي تراكم الأمونيا.' },
            cage: { label: 'بطاريات (أقفاص)', short: 'أحواض/سير إزالة الزرق', hint: '💡 لا توجد فرشة فى هذا النظام — ركّز على انتظام إزالة الزرق (يدويًا أو بالسير) وتهوية أسفل الأقفاص لتفادي تراكم الأمونيا حول الطيور السفلية.' }
        };
        function getFloorInfo(b) { return FLOOR_TYPE_INFO[(b && b.floorType) || 'litter']; }
        // فى نظام البطاريات، المساحة الفعلية المتاحة للطيور = مساحة أرضية العنبر × عدد الأدوار (كل دور أرضية مستقلة)
        function getEffectiveFloorArea(b) {
            const area = (b && b.area) || 0;
            if (b && b.floorType === 'cage') return area * Math.max(b.cageTiers || 1, 1);
            return area;
        }
        function onFloorTypeChange() {
            const ft = document.getElementById('b_floortype').value || 'litter';
            const hintEl = document.getElementById('b_floortypehint');
            if (hintEl) hintEl.textContent = FLOOR_TYPE_INFO[ft].hint;
            const tiersWrap = document.getElementById('b_cagetierswrap');
            if (tiersWrap) tiersWrap.style.display = ft === 'cage' ? '' : 'none';
        }

        function showRecordDetail(date) {
            const b = getActiveBatch(); if (!b) return;
            const r = b.records.find(x => x.date === date); if (!r) return;
            const analysisHtml = r.analysis ? r.analysis.split(' | ').map(x => `<div style="margin-bottom:6px;">📊 ${x}</div>`).join('') : '';
            const notesHtml = [
                r.notesDay ? `<div style="margin-bottom:6px;">☀️ ${esc(r.notesDay)}</div>` : '',
                r.notesNight ? `<div style="margin-bottom:6px;">🌙 ${esc(r.notesNight)}</div>` : '',
                (!r.notesDay && !r.notesNight && r.notes) ? `<div style="margin-bottom:6px;">📝 ${esc(r.notes)}</div>` : ''
            ].filter(Boolean).join('');
            // ============ الحالة الظاهرية المسجّلة لليوم ده + التوقع الاستباقي المبني عليها ============
            let clinicalHtml = '';
            if (r.clinicalSigns) {
                const flatLabels = [];
                CLINICAL_SIGN_GROUPS.forEach(g => (r.clinicalSigns[g.key] || []).forEach(code => {
                    const s = g.signs.find(x => x.code === code);
                    if (s) flatLabels.push(s.label);
                }));
                if (flatLabels.length) {
                    const pct = CLINICAL_AFFECTED_PCT_LABELS[r.clinicalSigns.affectedPct] || '';
                    const { predictions } = computeSymptomPrediction(b, r.clinicalSigns);
                    clinicalHtml = `<div style="font-weight:800;margin-bottom:6px;color:var(--muted);">🩺 الحالة الظاهرية</div>
                        <div style="margin-bottom:6px;">${flatLabels.map(l => `<span class="tag" style="margin:0 3px 3px 0;">${esc(l)}</span>`).join('')}</div>
                        ${pct ? `<div style="font-size:11.5px;color:var(--muted);margin-bottom:6px;">نسبة متأثرة: ${pct}</div>` : ''}
                        ${predictions.length ? predictions.slice(0, 2).map(p => `<div style="background:#fdf5f0;border:1px solid #ecd3ba;border-radius:8px;padding:6px 8px;margin-bottom:5px;font-size:11.5px;"><b>${p.urgent ? '🔴' : '🟡'} ${esc(p.name)}</b> — ${p.confidenceLabel}<br>💡 ${esc(p.recommendation)}</div>`).join('') : ''}
                        ${(r.clinicalSigns.photos || []).length ? `<div style="margin-bottom:6px;">${r.clinicalSigns.photos.map(src => `<img src="${src}" style="max-width:110px;max-height:110px;border-radius:8px;border:1px solid var(--line);margin:0 6px 6px 0;">`).join('')}</div>` : ''}
                        ${r.clinicalSigns.respiratoryAudio ? `<div style="margin-bottom:6px;">🎙️ <audio controls src="${r.clinicalSigns.respiratoryAudio}" style="max-width:220px;vertical-align:middle;"></audio></div>` : ''}
                        <hr style="margin:10px 0;border:none;border-top:1px solid var(--line);">`;
                } else if ((r.clinicalSigns.photos || []).length || r.clinicalSigns.respiratoryAudio) {
                    clinicalHtml = `<div style="font-weight:800;margin-bottom:6px;color:var(--muted);">🩺 الحالة الظاهرية</div>
                        ${(r.clinicalSigns.photos || []).length ? `<div style="margin-bottom:6px;">${r.clinicalSigns.photos.map(src => `<img src="${src}" style="max-width:110px;max-height:110px;border-radius:8px;border:1px solid var(--line);margin:0 6px 6px 0;">`).join('')}</div>` : ''}
                        ${r.clinicalSigns.respiratoryAudio ? `<div style="margin-bottom:6px;">🎙️ <audio controls src="${r.clinicalSigns.respiratoryAudio}" style="max-width:220px;vertical-align:middle;"></audio></div>` : ''}
                        <hr style="margin:10px 0;border:none;border-top:1px solid var(--line);">`;
                }
            }
            document.getElementById('recordDetailTitle').textContent = `📋 تفاصيل يوم ${r.age} — ${date}`;
            document.getElementById('recordDetailBox').innerHTML = clinicalHtml +
                (analysisHtml ? `<div style="font-weight:800;margin-bottom:6px;color:var(--muted);">تحليل تلقائي</div>${analysisHtml}` : '') +
                (analysisHtml && notesHtml ? `<hr style="margin:10px 0;border:none;border-top:1px solid var(--line);">` : '') +
                (notesHtml ? `<div style="font-weight:800;margin-bottom:6px;color:var(--muted);">ملاحظات</div>${notesHtml}` : '') +
                (!clinicalHtml && !analysisHtml && !notesHtml ? `<div style="color:var(--muted);">لا يوجد تحليل أو ملاحظات لهذا السجل</div>` : '');
            openModal('recordDetailModalOverlay');
        }
        function openModal(id) {
            const el = document.getElementById(id);
            if (el) el.classList.add('show');
        }
        function closeModal(id) {
            document.getElementById(id).classList.remove('show');
            // مسح حالة التعديل عند إغلاق المودال
            if (id === 'dailyModalOverlay') { editingDailyDate = null; dailyFormDirty = false; const sb = document.getElementById('d_saveBtn'); if (sb) sb.disabled = false; if (typeof clinicalMediaRecorder !== 'undefined' && clinicalMediaRecorder && clinicalMediaRecorder.state === 'recording') clinicalMediaRecorder.stop(); }
            if (id === 'purModalOverlay') editingPurchaseId = null;
            if (id === 'saleModalOverlay') editingSaleId = null;
            if (id === 'customModalOverlay') editingCustomId = null;
            if (id === 'batchModalOverlay') { editingBatchId = null; document.getElementById('batchModalTitle').textContent = 'بدء دفعة تسمين جديدة'; document.getElementById('batchModalBtn').textContent = 'حفظ وبدء المتابعة'; }
            if (id === 'vaccineModalOverlay') { editingVaccineId = null; document.getElementById('vaccineModalTitle').textContent = 'إضافة تحصين للبرنامج'; document.getElementById('vaccineModalBtn').textContent = 'إضافة'; document.getElementById('v_doseMode').value = 'fixed'; document.getElementById('v_ampoulesPerGroup').value = ''; document.getElementById('v_birdsPerGroup').value = ''; toggleVaccineDoseModeFields(); }
            if (id === 'treatModalOverlay') { editingTreatmentId = null; document.getElementById('treatModalTitle').textContent = treatModalDefaultTitle(getActiveBatch()); document.getElementById('treatModalBtn').textContent = '➕ إضافة للبرنامج'; if (document.getElementById('t_dayHint')) document.getElementById('t_dayHint').textContent = 'اكتب يومًا واحدًا، أو أيام متكررة بفاصلة/شرطة — يُنشأ بند مستقل لكل يوم بنفس التفاصيل'; if (document.getElementById('t_lead')) document.getElementById('t_lead').value = '30'; if (document.getElementById('t_time')) document.getElementById('t_time').value = ''; }
            if (id === 'reminderModalOverlay') { editingReminderId = null; document.getElementById('reminderModalTitle').textContent = 'إضافة تنبيه جديد'; document.getElementById('reminderModalBtn').textContent = 'حفظ التنبيه'; }
            if (id === 'feedAddModalOverlay') { editingFeedAdditiveId = null; document.getElementById('feedAddModalTitle').textContent = '➕ إضافة علفية'; document.getElementById('feedAddModalBtn').textContent = 'إضافة'; }
            if (id === 'waterAddModalOverlay') { editingWaterAdditiveId = null; document.getElementById('waterAddModalTitle').textContent = '➕ إضافة مائية'; document.getElementById('waterAddModalBtn').textContent = 'إضافة'; }
            if (id === 'stockModalOverlay') { editingMovementId = null; }
            if (id === 'bioModalOverlay') { editingBiosecurityId = null; bioPhotoData = null; }
        }

        // ============ قائمة الوصول السريع (⚡) — كل ميزات التطبيق فى مكان واحد ============
        function openQuickAccessMenu() {
            document.getElementById('quickAccessBody').innerHTML = renderQuickAccessMenu();
            document.getElementById('quickAccessModalOverlay').classList.add('show');
        }
        // بيقفل القائمة وبعدين ينفّذ الإجراء المطلوب — الدالة نفسها بتظهر "أضف دفعة أولاً" لو مفيش دفعة نشطة
        function qaGo(fn) { closeModal('quickAccessModalOverlay'); setTimeout(fn, 150); }
        function qaGoTab(tab, sub) { closeModal('quickAccessModalOverlay'); setTimeout(() => { if (sub) managementSubTab = sub; setTab(tab); }, 150); }

        function renderQuickAccessMenu() {
            const sections = [
                { title: '📅 السجل والتنفيذ اليومي', items: [
                    { ic: '☀️', label: 'تسجيل بيانات النهار', fn: `openDailyModal('day')` },
                    { ic: '🌙', label: 'تسجيل بيانات الليل', fn: `openDailyModal('night')` },
                    { ic: '⚖️', label: 'تسجيل الأساسيات (وزن/صحة/مياه/تدفئة)', fn: `openDailyModal('essentials')` },
                ]},
                { title: '💉 البرنامج الصحي', items: [
                    { ic: '💉', label: 'إضافة تحصين للبرنامج', fn: `openVaccineModal()` },
                    { ic: '🩹', label: 'إضافة علاج / معاملة فرشة', fn: `openTreatModal()` },
                    { ic: '📋', label: 'استيراد برنامج تحصين جاهز', fn: `openProtocolModal()` },
                    { ic: '⏰', label: 'إضافة تذكير مخصص', fn: `openReminderModal()` },
                ]},
                { title: '➕ الإضافات العلفية والمائية', items: [
                    { ic: '💊', label: 'إضافة علفية جديدة', fn: `document.getElementById('feedAddModalOverlay').classList.add('show')` },
                    { ic: '💧', label: 'إضافة مائية جديدة', fn: `document.getElementById('waterAddModalOverlay').classList.add('show')` },
                ]},
                { title: '📦 المخزون والمعاملات', items: [
                    { ic: '🛒', label: 'شراء (وتخزين تلقائي)', fn: `openPurchaseModal()` },
                    { ic: '💰', label: 'بيع (لحم أو سبلة)', fn: `openSaleModal()` },
                    { ic: '✏️', label: 'صنف مخزون / مصروف مخصص', fn: `openCustomModal()` },
                ]},
                { title: '🛡️ الأمن الحيوي', items: [
                    { ic: '🧴', label: 'تسجيل إجراء أمن حيوي', fn: `openBiosecurityModal()` },
                ]},
                { title: '📊 التقارير والإدارة', items: [
                    { ic: '💰', label: 'التقرير الشامل', fn: `qaGoTab('management','finance')`, direct: true },
                    { ic: '⚖️', label: 'مقارنة الدورات', fn: `qaGoTab('management','compare')`, direct: true },
                    { ic: '🚀', label: 'خطة التوسع', fn: `qaGoTab('management','expansion')`, direct: true },
                ]},
                { title: '🐣 الدفعات', items: [
                    { ic: '➕', label: 'بدء دفعة تسمين جديدة', fn: `openBatchModal()` },
                    { ic: '🗄️', label: 'أرشفة / استرجاع دورة', fn: `openArchiveModal()` },
                ]},
                { title: '🚨 حوادث ومشاكل', items: [
                    { ic: '⚠️', label: 'تسجيل حادثة/مشكلة', fn: `openIncidentModal()` },
                    { ic: '🔌', label: 'تسجيل انقطاع كهرباء/تيار', fn: `openOutageModal()` },
                    { ic: '📚', label: 'قاعدة معرفة الحوادث السابقة', fn: `openIncidentKbModal()` },
                ]},
                { title: '⚙️ حسابات وإعدادات', items: [
                    { ic: '👥', label: 'الحسابات والصلاحيات', fn: `openAccountsModal()` },
                    { ic: '📥', label: 'استيراد بيانات من ملف CSV', fn: `openCsvImportModal()` },
                    { ic: '⚙️', label: 'كل الإعدادات', fn: `setTab('settings')`, direct: true },
                ]},
            ];
            return sections.map((sec, i) => `
                <div class="qa-section-title" ${i===0?'style="padding-top:0;"':''}>${sec.title}</div>
                <div>${sec.items.map(it => `
                    <div class="qa-row" onclick="${it.direct ? it.fn + `; closeModal('quickAccessModalOverlay')` : `qaGo(() => { ${it.fn}; })`}">
                        <span class="ic">${it.ic}</span><span>${it.label}</span>
                    </div>`).join('')}
                </div>`).join('');
        }

        // ============ Heating Estimation ============
