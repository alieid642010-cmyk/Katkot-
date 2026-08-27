        function stockLevelBarHtml(usedQty, availQty, unit) {
            const total = usedQty + availQty;
            if (total <= 0) return '';
            const availPct = Math.max(0, Math.min(100, (availQty / total) * 100));
            // أخضر = مخزون مريح، برتقالي = محتاج انتباه قريب، أحمر = منخفض جدًا — لون له معنى تحذيري مباشر
            const color = availPct <= 15 ? '#d64545' : (availPct <= 40 ? '#e0921f' : '#27ae60');
            return `
            <div class="stock-lvl-wrap">
                <div class="stock-lvl-labels">
                    <span>متاح: ${fmt(availQty,1)} ${unit} (${fmt(availPct,0)}%)</span>
                    <span>مستهلك: ${fmt(usedQty,1)} ${unit}</span>
                </div>
                <div class="stock-lvl-track">
                    <div class="stock-lvl-fill" style="width:${availPct}%;background:${color};"></div>
                </div>
            </div>`;
        }

        // ============ Feed Tab (مجمّع): برنامج المراحل + الإضافات + التوقعات + المخزون — كل حاجة خاصة بالعلف مكان واحد ============
        // ============ برنامج التحويل التدريجي بين نوعين علف — منطقة العلف (تبويب الإنتاج) ============
        function renderFeedTransitionSection(b) {
            return `<div class="section"><div class="section-head"><h2>🔄 برنامج التحويل بين الأعلاف${b ? ` — الدفعة النشطة (${expansionSpeciesLabel(b.species)})` : ''}</h2></div>
                <div class="card">
                    <p style="font-size:11px;color:var(--muted);margin:0 0 10px;line-height:1.7;">
                        عرّف هنا مرة واحدة جدول التحويل من علف لآخر (بادئ→نامي، نامي→ناهي، أو أي علف لآخر)، بنسبة كل علف فى كل يوم من أيام التحويل. النسب دي هتتطبّق تلقائيًا فى "تسجيل بيانات اليوم" — هتقسّم كمية العلف اللي هتسجّلها بين الصنفين، وتخصمها من المخزن بنفس النسبة، من غير ما تحتاج تحسب حاجة يدويًا.
                    </p>
                    ${!b ? `<div class="empty" style="padding:14px;"><div class="ico">🔄</div>محتاج دفعة نشطة الأول عشان تقدر تدير جدول التحويل بتاعها.</div>` : `
                    ${(b.feedTransitions||[]).map(t => `
                    <div class="card" style="margin-bottom:10px;background:var(--cream);">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                            <div style="font-weight:800;color:var(--barn-dark);">${esc(t.fromFeed)} ← → ${esc(t.toFeed)} <span style="font-weight:600;color:var(--muted);font-size:11.5px;">(بداية عمر ${t.startAge} يوم، ${t.days.length} يوم تحويل)</span></div>
                            <button class="btn danger sm" onclick="removeFeedTransition('${t.id}')">🗑️ حذف الجدول</button>
                        </div>
                        <div class="scroll-x" style="margin-top:8px;">
                            <table><thead><tr><th>يوم التحويل</th><th>عمر القطيع</th><th>% ${esc(t.fromFeed)}</th><th>% ${esc(t.toFeed)}</th><th></th></tr></thead>
                            <tbody>${t.days.map((d,i)=>`
                                <tr><td>${i+1}</td><td>يوم ${t.startAge+i}</td>
                                <td><input type="number" min="0" max="100" value="${d.fromPct}" style="width:64px;padding:6px;border:1.5px solid var(--line);border-radius:8px;" onchange="updateTransitionDayPct('${t.id}',${i},this.value)"></td>
                                <td style="font-weight:800;">${100-d.fromPct}%</td>
                                <td><button class="btn ghost sm" onclick="removeTransitionDay('${t.id}',${i})">🗑️</button></td></tr>`).join('')}</tbody></table>
                        </div>
                        <button class="btn ghost sm" style="margin-top:6px;" onclick="addTransitionDay('${t.id}')">+ إضافة يوم للجدول</button>
                    </div>`).join('') || '<div class="empty" style="padding:14px;"><div class="ico">🔄</div>لا توجد جداول تحويل بعد.</div>'}
                    <div class="form-grid" style="margin-top:12px;border-top:1.5px solid var(--line);padding-top:12px;">
                        <div class="field"><label>من علف (الحالي)</label><input id="ft_from" list="dl_invItems" placeholder="مثال: بادئ"></div>
                        <div class="field"><label>إلى علف (الجديد)</label><input id="ft_to" list="dl_invItems" placeholder="مثال: نامي"></div>
                        <div class="field"><label>عمر بداية التحويل (يوم)</label><input id="ft_startAge" type="number" inputmode="decimal" min="0" placeholder="مثال: 10"></div>
                    </div>
                    <button class="btn gold block" style="margin-top:6px;" onclick="addFeedTransition()">+ إضافة جدول تحويل جديد</button>
                    <p style="font-size:10.5px;color:var(--muted);margin:8px 2px 0;">💡 بيبدأ افتراضيًا بيومين (65%/35%) — عدّل النسب وأضف/احذف أيام حسب برنامجك بالظبط (مثال: يوم 1: 65%/35%، يوم 2: 50%/50%، يوم 3: 35%/65%...).</p>
                    `}
                </div>
            </div>`;
        }

        function renderFeedAdditiveListCard(b, m) {
            m = m || computeMetrics(b);
            const today = m.todayAge;
            return b.feedAdditives.map(a => {
                const activeToday = a.active && additiveActiveOnDay(a, today);
                const execToday = isAdditiveExecutedToday(b, a.id, todayStr());
                const execBtn = !activeToday ? '' : execToday
                    ? `<span class="pill ok" style="font-size:10px;">✅ نُفّذ اليوم</span>`
                    : `<button class="btn gold sm" onclick="applyAdditiveToday('feed','${a.id}')">✅ تنفيذ اليوم</button>`;
                return `<div class="check-row" style="${activeToday?'background:rgba(217,165,68,.12);border-right:3px solid var(--wheat);':''}">
                    <input type="checkbox" ${a.active?'checked':''} onchange="toggleAdditive('feed','${a.id}')">
                    <div class="txt">
                        <div style="font-weight:${activeToday?'800':'600'};">${esc(a.name)} ${activeToday?'<span class="pill ok" style="font-size:10px;">نشط اليوم ✓</span>':''}</div>
                        <div class="day">${additiveDayLabel(a)} · ${additivePeriodLabel(a)}${timeLabel(a.time)} · الجرعة: <b>${a.dose} ${a.unit}/${a.per}</b></div>
                        ${a.notes?`<div style="font-size:11px;color:var(--muted);">${esc(a.notes)}</div>`:''}
                    </div>
                    ${execBtn}
                    <button class="btn ghost sm owner-only" onclick="editAdditiveDose('feed','${a.id}')">✏️ جرعة</button>
                    <button class="btn ghost sm owner-only" onclick="editFeedAdditive('${a.id}')">✏️ تعديل كامل</button>
                    <button class="btn danger sm owner-only" onclick="deleteAdditive('feed','${a.id}')">🗑️</button>
                </div>`;
            }).join('');
        }
        // ⚡ تحسين أداء (المرحلة 1): تحديث كارت إضافات العلف لوحده بدل هدم تبويب الإنتاج كامل
        function refreshFeedAdditiveListBox() {
            const box = document.getElementById('feedAdditiveListBox');
            const b = getActiveBatch();
            if (box && b) box.innerHTML = renderFeedAdditiveListCard(b);
            else render();
        }
        function renderFeedTab(b, m, fin) {
            m = m || computeMetrics(b);
            fin = fin || computeFinance(b, m);
            const today = m.todayAge;

            // ===== مرحلة العلف الحالية (بادئ/نامي/ناهي) — قابلة للتعديل المباشر هنا لهذه الدفعة =====
            const fsi = getFeedStageInfo(b, m);
            const curStages = getFeedStages(b);
            const stageEditHtml = `<div class="card" style="margin-top:${fsi?'8px':'0'};">
                    <div style="font-weight:800;font-size:13px;margin-bottom:8px;">⚙️ كميات مراحل العلف لهذه الدفعة</div>
                    <div class="form-grid">
                        <div class="field"><label>إجمالي علف بادئ لكل طائر (كجم)</label><input id="fs_starterKg" type="number" inputmode="decimal" step="0.05" min="0" value="${curStages[0].targetKg ?? ''}"></div>
                        <div class="field"><label>إجمالي علف نامي لكل طائر (كجم)</label><input id="fs_growerKg" type="number" inputmode="decimal" step="0.05" min="0" value="${curStages[1].targetKg ?? ''}"></div>
                    </div>
                    <p style="font-size:10.5px;color:var(--muted);margin:6px 2px 0;">💡 مرحلة "ناهي" = باقي الدورة تلقائيًا. القيم دي خاصة بدفعة "${esc(b.name)}" بس — تقدر تظبطها مختلفة عن باقي دفعاتك.</p>
                    <button class="btn gold sm" style="margin-top:6px;" onclick="saveFeedStageForBatch()">💾 حفظ لهذه الدفعة</button>
                </div>`;
            const feedStageCard = `<div class="section" style="margin-top:0;"><div class="section-head"><h2>🌾 مرحلة العلف الحالية</h2></div>
                ${!fsi ? '' : `<div class="card">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-weight:900;font-size:15px;color:var(--barn-dark);">${fsi.stage.icon} ${fsi.stage.label}</span>
                        <span style="font-size:11.5px;color:var(--muted);">استهلاك تقديري/طائر: ${fmt(fsi.cumPerBirdKg*1000,0)} جم</span>
                    </div>
                    ${fsi.stage.targetKg != null ? `
                    <div style="background:var(--line);border-radius:8px;height:10px;overflow:hidden;">
                        <div style="background:var(--wheat);height:100%;width:${fsi.pctOfStage.toFixed(0)}%;"></div>
                    </div>
                    <div style="font-size:11px;color:var(--muted);margin-top:5px;">${fsi.pctOfStage.toFixed(0)}% من كمية ${fsi.stage.label} (${fsi.stage.targetKg} كجم/طائر) — ${fsi.nextStage ? `باقي ~${fmt(fsi.remainingKg*1000,0)} جم/طائر قبل التحويل لعلف ${fsi.nextStage.icon} ${fsi.nextStage.label}` : 'آخر مرحلة'}</div>
                    ` : `<div style="font-size:11.5px;color:var(--muted);">آخر مرحلة فى برنامج العلف — تكمل بيها لحد البيع.</div>`}
                    <p style="font-size:10.5px;color:var(--muted);margin:8px 2px 0;line-height:1.5;">💡 محسوبة من إجمالي العلف الفعلي المسجَّل ÷ متوسط عدد الطيور (تقديري).</p>
                </div>`}
                ${stageEditHtml}</div>`;

            // ===== إضافات العلف (مع تمييز النشط اليوم وزر تنفيذ يخصم من المخزن) =====
            const feedAddRows = renderFeedAdditiveListCard(b, m);

            // ===== توقع العلف حتى تاريخ مستهدف =====
            const ins = computeInsights(b, m);
            const feedForecastHtml = (() => {
                const targetAge = (ins.weightPrediction && ins.weightPrediction.targetAge) || b.targetAge || null;
                if (!targetAge || targetAge <= m.todayAge) return '';
                const ff = computeFeedForecast(b, m, targetAge - m.todayAge);
                const priceInfo = computeActualFeedPrice(b);
                const targetRow = ff.rows[ff.rows.length - 1];
                if (!targetRow) return '';
                const remainingCost = targetRow.cumFeedKg * (priceInfo.price || 0);
                const balanceTxt = ff.currentBalanceKg != null ? `${fmt(ff.currentBalanceKg,0)} كجم متاحة الآن بالمخزن` : 'لا يوجد صنف "علف" مسجَّل بالمخزن بعد';
                const coverageTxt = ff.currentBalanceKg != null
                    ? (ff.currentBalanceKg >= targetRow.cumFeedKg
                        ? `<b style="color:var(--green);">✅ يكفي</b> للوصول ليوم ${targetAge}`
                        : `<b style="color:var(--red);">⚠️ ناقص ${fmt(targetRow.cumFeedKg - ff.currentBalanceKg,0)} كجم</b> للوصول ليوم ${targetAge}`)
                    : '';
                return `<div class="check-row"><div class="txt">
                        <div>🔮 توقع العلف حتى يوم ${targetAge}: <b>${fmt(targetRow.cumFeedKg,0)} كجم</b> بتكلفة تقديرية <b>${money(remainingCost)}</b></div>
                        <div class="day">${balanceTxt}${coverageTxt ? ' — ' + coverageTxt : ''}</div>
                        <div class="day" style="margin-top:2px;">مبني على منحنى استهلاك السلالة × نسبة أداء الدفعة الفعلية (${fmt(ff.perfRatio*100,0)}% من معدل السلالة) وسعر علف ${fmt(priceInfo.price,2)} ج/كجم${priceInfo.source==='purchases'?' (فعلي من آخر مشتريات)':' (افتراضي، لا توجد مشتريات علف مسجَّلة بعد)'}</div>
                    </div></div>`;
            })();

            // ===== تتبع شحنات العلف (لو مرصودة) =====
            const lotHtml = !ins.feedLotAnalysis ? '' : (() => {
                const fl = ins.feedLotAnalysis;
                if (fl.flagged) {
                    const reasonTxt = fl.flagged.reason === 'weight' ? `متوسط انحراف الوزن ${fmt(fl.flagged.avgDev,1)}% مقابل متوسط ${fmt(fl.avgDevAll,1)}% فى باقي الشحنات — الوزن أضعف من المعتاد بوضوح خلال فترة هذه الشحنة`
                        : fl.flagged.reason === 'fcr' ? `معدل تحويل الفترة ${fmt(fl.flagged.periodFcr,2)} مقابل متوسط ${fmt(fl.avgFcrAll,2)} فى باقي الشحنات — معامل تحويل أسوأ بوضوح خلال فترة هذه الشحنة (فرق مؤكد إحصائيًا)`
                        : `معدل نفوق ${fmt(fl.flagged.mortPerDay,2)} طائر/يوم مقابل متوسط ${fmt(fl.avgMortRate,2)}`;
                    return `<div class="check-row"><div class="txt">
                        <div>📦 شحنة العلف "<b>${fl.flagged.lot}</b>" مرتبطة بأداء أضعف (${fl.flagged.reason === 'weight' ? 'وزن' : fl.flagged.reason === 'fcr' ? 'معدل تحويل' : 'نفوق'})</div>
                        <div class="day">${reasonTxt} — يُنصح بمراجعة جودة هذه الشحنة مع المورد</div>
                    </div></div>`;
                }
                return `<div class="check-row"><div class="txt"><div>📦 تتبع شحنات العلف: ${fl.segs.length} شحنات مرصودة</div><div class="day">لا يوجد فرق ملحوظ فى النفوق أو الوزن أو معدل التحويل بين الشحنات حتى الآن</div></div></div>`;
            })();

            // ===== مخزون العلف (ملخص سريع، الإدارة الكاملة فى تبويب المخزن) =====
            const feedItems = b.inventory.filter(it => it.category === 'علف');
            const cutoff14 = new Date(new Date(todayStr()).getTime() - 14 * 86400000).toISOString().slice(0,10);
            const feedDailyOut = {};
            b.stockMovements.filter(mv => mv.type === 'out' && mv.date >= cutoff14).forEach(mv => { feedDailyOut[mv.itemName] = (feedDailyOut[mv.itemName] || 0) + mv.qty; });
            const feedTotalOut = {};
            b.stockMovements.filter(mv => mv.type === 'out').forEach(mv => { feedTotalOut[mv.itemName] = (feedTotalOut[mv.itemName] || 0) + mv.qty; });
            const feedStockRows = feedItems.map(it => {
                const usedQty = feedTotalOut[it.name] || 0;
                const levelBar = it.balance > 0 || usedQty > 0 ? stockLevelBarHtml(usedQty, Math.max(it.balance,0), it.unit) : '';
                return `<div class="card" style="margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;">
                        <span>${esc(it.name)}</span><span>${fmt(it.balance,1)} ${it.unit} متاح</span>
                    </div>${levelBar}</div>`;
            }).join('');
            const feedStockSection = `<div class="section"><div class="section-head"><h2>📦 مخزون العلف</h2>
                <button class="btn ghost sm" onclick="setTab('dashboard')">فتح المخزن الكامل →</button></div>
                <div>${feedStockRows || '<div class="card empty">لا يوجد صنف "علف" مسجَّل بالمخزن بعد.</div>'}</div>
            </div>`;

            const forecastGroup = [feedForecastHtml, lotHtml].filter(Boolean).join('');

            return `
            <div class="section" style="margin-top:0;">
                <div class="row-actions" style="margin:0 0 12px;">
                    <button class="btn ghost sm owner-only" style="flex:1;" onclick="document.getElementById('feedCalcModalOverlay').classList.add('show')">🧮 حاسبة تكوين العلف</button>
                    <button class="btn ghost sm owner-only" style="flex:1;" onclick="openProtocolModal()">🧬 بروتوكولات محفوظة</button>
                </div>
                <div class="row-actions" style="margin:0 0 12px;">
                    <button class="btn ghost sm owner-only block" onclick="openIncidentKbModal()">🧠 قاعدة معرفة الحوادث</button>
                </div>
            </div>
            ${feedStageCard}
            ${renderFeedTransitionSection(b)}
            <div class="section"><div class="section-head"><h2>🌾 برنامج إضافات العلف</h2>
                <button class="btn ghost sm owner-only" onclick="document.getElementById('feedAddModalOverlay').classList.add('show')">+ إضافة</button></div>
                <div class="card" id="feedAdditiveListBox" style="padding:0;">${feedAddRows||'<div class="empty" style="padding:14px;">لا توجد إضافات علف.</div>'}</div>
            </div>
            ${forecastGroup ? `<div class="section"><div class="section-head"><h2>🔮 توقعات وتتبع العلف</h2></div><div class="card" style="padding:0;">${forecastGroup}</div></div>` : ''}
            ${feedStockSection}
            <p style="font-size:10.5px;color:var(--muted);margin:4px 2px 0;">💡 التسجيل اليومي لكميات العلف (نهار/ليل) لسه فى تبويب "📅 السجل اليومي" زي ما هو — التبويب ده لإدارة البرنامج والمتابعة فقط.</p>`;
        }

        // ============ Environment Tab (مجمّع): طقس + تهوية + فرشة/سبلة + معدات وأعطال — كل حاجة خاصة بالبيئة مكان واحد ============
        function renderTreatmentListCard(b, m, listOverride) {
            m = m || computeMetrics(b);
            const today = m.todayAge;
            const list = listOverride || b.treatmentLog;
            return [...list].sort((a,c)=>a.day-c.day).map(t => {
                const dueToday = !t.done && t.day === today;
                const overdue = !t.done && t.day < today;
                return `<div class="check-row" style="${dueToday?'background:rgba(193,68,60,.1);border-right:3px solid var(--red);':overdue?'background:rgba(193,68,60,.05);':''}">
                    <input type="checkbox" ${t.done?'checked':''} onchange="toggleTreatment('${t.id}')">
                    <div class="txt">
                        <div class="${t.done?'done-strike':''}" style="font-weight:${dueToday?'800':'600'};">${esc(t.name)}
                            ${dueToday?'<span class="pill exp" style="font-size:10px;">مستحق اليوم!</span>':overdue&&!t.done?'<span class="pill exp" style="font-size:10px;">متأخر</span>':''}
                        </div>
                        <div class="day">يوم ${t.day}${timeLabel(t.time)} ${t.doneDate?'· تم فى '+t.doneDate:''}</div>
                        ${t.notes?`<div style="font-size:11px;color:var(--muted);">${esc(t.notes)}</div>`:''}
                    </div>
                    <button class="btn ghost sm owner-only" onclick="editTreatment('${t.id}')">✏️</button>
                    <button class="btn danger sm owner-only" onclick="deleteTreatment('${t.id}')">🗑️</button>
                </div>`;
            }).join('');
        }
        // ⚡ ملحوظة أداء: بعد تحويل معاملات الفرشة لجزء من مسار البيئة (كل معاملة جوه مرحلتها العمرية)، مبقاش فيه
        // صندوق واحد نقدر نحدّثه لوحده — فبنعمل render() كامل بدل التحديث الجزئي القديم
        function refreshTreatmentListBox() {
            render();
        }
        // ============ حاسبة ومرجع التهوية التفصيلي: معادلات مطبّقة على بيانات الدفعة الفعلية + تايمر ليلي موسمي + سرعة هواء/ضغط ساكن + فحص ميداني ============
        function renderVentilationCalcCard(b, m) {
            m = m || computeMetrics(b);
            const age = m.todayAge;
            const liveCount = m.liveCount || 0;
            const area = b.area || 0;
            const fanCapacity = b.fanCapacityM3h || 0;
            const fanCount = b.fanCount || 0;
            const totalFanCapacity = fanCapacity * fanCount;
            const target = computeMinVentTarget(age, liveCount);
            const weekIdx = Math.min(8, Math.max(1, Math.ceil(age / 7)));

            // ===== 1) المعادلات مطبّقة على بياناتك الفعلية =====
            let eq1 = `<div class="empty" style="padding:10px;">أدخل عدد الطيور الحي (من السجل اليومي) لحساب المعادلة على بياناتك.</div>`;
            if (target) {
                const m3hPerBird = target.cfmPerBird * CFM_TO_M3H;
                eq1 = `<div style="font-size:12px;line-height:2;">
                    <b>معادلة الحد الأدنى لتجديد الهواء (أسبوع ${weekIdx}):</b><br>
                    معدل الطائر الواحد = <b>${fmt(m3hPerBird,2)} م³/ساعة</b> × عدد الطيور الحي (${fmt(liveCount,0)}) = <b>${fmt(target.totalM3h,0)} م³/ساعة</b> — هذا رقمك المستهدف الآن كحد أدنى (رطوبة/جودة هواء فقط، مش تبريد).
                </div>`;
            }
            let eq2 = `<div class="empty" style="padding:10px;">أدخل مساحة العنبر فى بيانات الدفعة لحساب معادلة ذروة الحر.</div>`;
            if (area > 0) {
                const hotLow = area * HOT_VENT_M3MIN_PER_M2_LOW * 60;
                const hotHigh = area * HOT_VENT_M3MIN_PER_M2_HIGH * 60;
                eq2 = `<div style="font-size:12px;line-height:2;">
                    <b>معادلة ذروة الحر (تهوية انتقالية/نفقية):</b><br>
                    مساحة عنبرك (${fmt(area,0)} م²) × 1.2 إلى 1.8 م³/دقيقة لكل م² × 60 = <b>${fmt(hotLow,0)} - ${fmt(hotHigh,0)} م³/ساعة</b><br>
                    ${totalFanCapacity > 0
                        ? `قدرتك الحالية: ${fmt(fanCount,0)} شفاط × ${fmt(fanCapacity,0)} = <b>${fmt(totalFanCapacity,0)} م³/ساعة</b> ${totalFanCapacity >= hotLow ? '✅ تغطي الحد الأدنى المطلوب' : '⚠️ أقل من الحد الأدنى المطلوب'}`
                        : 'أدخل عدد وقدرة الشفاطات فى بيانات الدفعة لمقارنة قدرتك الفعلية بهذا الرقم.'}
                </div>`;
            }

            // ===== 2) جدول تايمر التهوية الليلية حسب الموسم — نفس مصدر البيانات المستخدم فى توصية "الليلة" الظاهرة تلقائيًا فوق فى بروتوكول اليوم =====
            let prevMax = 0;
            const nightRowsHtml = NIGHT_VENT_DUTY_TABLE.map(r => {
                const isCurrent = age > prevMax && age <= r.maxAge;
                prevMax = r.maxAge;
                return `<tr style="border-bottom:1px solid var(--line);${isCurrent ? 'background:rgba(46,110,142,.08);font-weight:800;' : ''}">
                    <td style="padding:6px;">${r.stageLabel}${isCurrent ? ' 👈' : ''}</td>
                    <td style="padding:6px;text-align:center;">${r.winter[0]}-${r.winter[1]}%</td>
                    <td style="padding:6px;text-align:center;">${r.mild[0]}-${r.mild[1]}%</td>
                    <td style="padding:6px;text-align:center;">${r.summer[0]}-${r.summer[1]}${r.summer[1]===100?'% (شبه مستمر)':'%'}</td>
                </tr>`;
            }).join('');
            const nightTableHtml = `
                <p style="font-size:10.5px;color:var(--muted);margin:0 0 6px;">💡 مفيش داعي تفتح الجدول ده كل يوم — توصية الليلة النهاردة بالظبط (حسب عمر وموسم دفعتك الحالية، ومُعدَّلة تلقائيًا لو الأمونيا مرتفعة) بتظهر تلقائيًا فوق فى قسم "🌬️ بروتوكول توصيات التهوية اليوم". الجدول ده للرجوع السريع بس لو حابب تشوف الصورة الكاملة لكل الأعمار مرة واحدة.</p>
                <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
                <thead><tr style="background:#faf8f2;">
                    <th style="padding:6px;text-align:right;border-bottom:1px solid var(--line);">العمر</th>
                    <th style="padding:6px;text-align:center;border-bottom:1px solid var(--line);">❄️ شتاء</th>
                    <th style="padding:6px;text-align:center;border-bottom:1px solid var(--line);">🍂 ربيع/خريف</th>
                    <th style="padding:6px;text-align:center;border-bottom:1px solid var(--line);">☀️ صيف</th>
                </tr></thead>
                <tbody>${nightRowsHtml}</tbody></table>
                </div>
                <p style="font-size:10.5px;color:var(--muted);margin:6px 2px 0;">النسبة = دقائق تشغيل من كل دورة 5 دقائق (مثلاً 20% ≈ دقيقة تشغيل / 4 دقائق وقف). الصف المظلّل 👈 هو مرحلة دفعتك الحالية. دي نقطة انطلاق عملية وليست رقمًا نهائيًا ثابتًا — اضبطها فعليًا حسب قراءات الأمونيا/CO2/الرطوبة الفعلية المسجّلة يوميًا.</p>`;

            // ===== 3) سرعة الهواء والضغط الساكن =====
            let airCalc = `<div class="empty" style="padding:10px;">أدخل عدد وقدرة الشفاطات فى بيانات الدفعة لحساب سرعة الهواء ومساحة الفتحات المطلوبة.</div>`;
            if (totalFanCapacity > 0) {
                const m3s = totalFanCapacity / 3600;
                const inletAreaHigh = m3s / 5;
                const inletAreaLow = m3s / 7;
                airCalc = `<div style="font-size:12px;line-height:2;">
                    <b>إجمالي سعة الشفط:</b> ${fmt(fanCount,0)} × ${fmt(fanCapacity,0)} م³/س = <b>${fmt(totalFanCapacity,0)} م³/ساعة</b> = ${fmt(m3s,2)} م³/ثانية<br>
                    <b>سرعة الهواء داخل العنبر</b> = م³/ثانية ÷ (عرض العنبر × ارتفاعه بالمتر) — قِس عرض وارتفاع عنبرك الفعليين واقسم عليهم للحصول على السرعة الفعلية؛ المستهدف وقت التوننل الكامل: 2-3 م/ث.<br>
                    <b>مساحة فتحات الدخول (Inlets) المطلوبة</b> ≈ <b>${fmt(inletAreaLow,1)} - ${fmt(inletAreaHigh,1)} م²</b> إجمالاً (بافتراض سرعة دخول هواء مستهدفة 5-7 م/ث عند البادات/الفتحات).<br>
                    <b>الضغط الساكن (Static Pressure):</b> المعدل الشائع فى عنابر التوننل حوالي 0.05-0.15 بوصة ماء (12-37 باسكال تقريبًا) — يُقاس بمانومتر عند أبعد نقطة عن الشفاطات. لو الضغط أعلى من المعتاد رغم نظافة البادات، غالبًا فيه انسداد بالفتحات أو مساحة دخول غير كافية بالنسبة لقدرة الشفاطات، وده بيقلل الأداء الفعلي عن السعة المكتوبة على المروحة (fan curve derating).
                </div>`;
            }

            // ===== 4) مؤشرات عملية لقياس كفاءة التهوية ميدانيًا =====
            const practicalHtml = `<div style="font-size:12px;line-height:1.9;">
                <b>🕯️ اختبار الشمعة/الدخان:</b> قرّب شمعة أو مصدر دخان بسيط من فتحة الدخول وراقب اتجاه وسرعة انسياب الدخان داخل العنبر — لازم ينتشر بانتظام نحو كل الأركان من غير ما "يسقط" فجأة على مستوى الفرشة قريب من الفتحة (ده مؤشر على سرعة دخول عالية جدًا وتيار بارد مباشر على الطيور القريبة).<br><br>
                <b>🌫️ توزيع الأمونيا:</b> اقيس عند مستوى أنف الطائر (مش وأنت واقف) فى 4-5 نقاط: الزوايا البعيدة، منتصف العنبر، وبالقرب من فتحات الخروج. لو الزوايا البعيدة أعلى بوضوح من المنتصف يبقى عندك مناطق ميتة (dead spots) محتاجة توزيع تهوية أفضل.<br><br>
                <b>🪣 فحص الفرشة (Grab Test):</b> اقبض حفنة فرشة بإيدك واعصرها — لو اتكتلت ومسكت شكلها زي الطين يبقى الرطوبة زايدة، ولو اتفتت وطلعت غبار يبقى جافة زيادة؛ المثالي إنها تتفتت بس تحس إنها متماسكة شوية. راقب كمان أماكن التكتل (caking) تحت النيبل درينكرز خصوصًا — علامة مباشرة على ضعف تهوية أو تصريف مياه فى المنطقة دي تحديدًا.
            </div>`;

            // ✨ تحسين: ملخص سريع أعلى الكارت (بدل ما تفتح الـ4 أكورديونات كلها عشان تعرف "هل التهوية عندي كافية دلوقتي؟")
            const quickVerdict = (() => {
                if (!target) return '';
                if (totalFanCapacity <= 0 && b.ventType !== 'natural') return '';
                let ok = null, note = '';
                if (totalFanCapacity > 0) {
                    ok = totalFanCapacity >= target.totalM3h;
                    note = ok ? `قدرتك الحالية (${fmt(totalFanCapacity,0)} م³/س) تغطي الحد الأدنى المطلوب الآن (${fmt(target.totalM3h,0)} م³/س)`
                              : `قدرتك الحالية (${fmt(totalFanCapacity,0)} م³/س) أقل من الحد الأدنى المطلوب الآن (${fmt(target.totalM3h,0)} م³/س)`;
                }
                if (ok === null) return '';
                return `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:12px;margin-bottom:10px;background:${ok?'rgba(44,122,75,.08)':'rgba(193,68,60,.08)'};border:1px solid ${ok?'var(--green)':'var(--red)'};">
                    <span style="font-size:18px;">${ok?'✅':'⚠️'}</span>
                    <span style="font-size:12px;font-weight:700;color:${ok?'var(--green)':'var(--red)'};">${note}</span>
                </div>`;
            })();

            return `
            <div class="section"><div class="card">
                <h2 style="margin:0 0 8px;color:var(--barn-dark);">🧮 حاسبة ومرجع التهوية التفصيلي</h2>
                <p style="font-size:11px;color:var(--muted);margin-top:0;">معادلات وأرقام استرشادية مبنية على مصادر إرشادية معروفة فى صناعة الدواجن — استخدمها كنقطة انطلاق واضبطها حسب قراءاتك الفعلية.</p>
                ${quickVerdict}
                <details style="margin-bottom:6px;"><summary style="cursor:pointer;font-weight:700;font-size:12.5px;padding:6px 0;">📐 معادلات الحساب مطبّقة على بياناتك الحالية</summary>
                    ${eq1}${eq2}
                </details>
                <details style="margin-bottom:6px;"><summary style="cursor:pointer;font-weight:700;font-size:12.5px;padding:6px 0;">🌙 جدول تايمر التهوية الليلية حسب الموسم</summary>
                    ${nightTableHtml}
                </details>
                <details style="margin-bottom:6px;"><summary style="cursor:pointer;font-weight:700;font-size:12.5px;padding:6px 0;">💨 سرعة الهواء والضغط الساكن (Static Pressure)</summary>
                    ${airCalc}
                </details>
                <details><summary style="cursor:pointer;font-weight:700;font-size:12.5px;padding:6px 0;">🔍 مؤشرات عملية لفحص كفاءة التهوية ميدانيًا</summary>
                    ${practicalHtml}
                </details>
            </div></div>`;
        }
        // ============ (إعادة تصميم) مسار البيئة والتهوية كتايملاين تفاعلي حسب العمر — بدل معلومات/جداول ثابتة مفصولة ============
        // كل مرحلة عمرية (من نفس جدول NIGHT_VENT_DUTY_TABLE) بقت "محطة" فى المسار: اللي فات مُعلَّم ✅، الحالية
        // مفصّلة بالكامل (توصيات اليوم + مؤشرات + معاملات الفرشة المستحقة فيها)، واللي جاي "استعد لها" مختصر.
        function renderEnvironmentTimeline(b, m) {
            m = m || computeMetrics(b);
            const age = m.todayAge;
            const month = b.startmonth || (new Date().getMonth() + 1);
            const season = seasonLabelOf(month);
            const seasonKey = season === 'شتاء' ? 'winter' : season === 'صيف' ? 'summer' : 'mild';
            const seasonIcon = { winter: '❄️', mild: '🍂', summer: '☀️' }[seasonKey];
            const ventPlan = computeVentilationPlan(b, m);
            const ventRows = ventPlan.map(v => `<div class="alert-item ${v.level}">${v.text}</div>`).join('');
            const respRisk = computeRespiratoryRisk(b, m);
            const respRiskHtml = !respRisk ? '' : `<div class="check-row" style="padding:0 0 8px;"><div class="txt">
                <div style="color:${respRisk.level==='high'?'var(--red)':'var(--warning-text)'};font-weight:800;">🫁 احتمالية إجهاد/مشاكل تنفسية: ${respRisk.level==='high'?'مرتفعة':'متوسطة'}</div>
                <div class="day">${respRisk.avgHumid!=null?`متوسط رطوبة آخر 5 أيام ${fmt(respRisk.avgHumid,0)}%`:''}${respRisk.avgNh3!=null?` · أمونيا ${fmt(respRisk.avgNh3,0)}ppm`:''} · الموسم الحالي ${respRisk.season}</div>
            </div></div>`;

            let prevMax = 0;
            const stagesHtml = NIGHT_VENT_DUTY_TABLE.map((row, idx) => {
                const minAge = prevMax + 1;
                prevMax = row.maxAge;
                const status = age > row.maxAge ? 'done' : (age >= minAge ? 'current' : 'upcoming');
                const stageTreatments = b.treatmentLog.filter(t => t.day >= minAge && t.day <= Math.min(row.maxAge, minAge + 30));
                const treatRowsHtml = stageTreatments.length ? renderTreatmentListCard(b, m, stageTreatments) : '';
                const dutyLow = row[seasonKey][0], dutyHigh = row[seasonKey][1];
                const dotColor = status === 'done' ? 'var(--green)' : status === 'current' ? 'var(--wheat)' : 'var(--muted)';
                const dotIcon = status === 'done' ? '✅' : status === 'current' ? '👉' : '⏳';

                if (status === 'current') {
                    return `
                    <div class="timeline-node current" style="border-right:3px solid ${dotColor};background:rgba(217,165,68,.08);border-radius:0 10px 10px 0;padding:12px;margin-bottom:10px;">
                        <div style="display:flex;align-items:center;gap:8px;font-weight:900;color:var(--barn-dark);font-size:14px;">${dotIcon} ${row.stageLabel} <span class="pill info">المرحلة الحالية — يوم ${age}</span></div>
                        <div style="font-size:11px;color:var(--muted);margin:4px 0 8px;">${seasonIcon} موسم ${season} · نسبة تشغيل تهوية ليلية مرجعية: ${dutyLow}-${dutyHigh}%</div>
                        ${respRiskHtml}
                        ${ventRows || `<div class="empty"><div class="ico">🌬️</div>لا توجد بيانات كافية بعد لبناء توصيات — أدخل مساحة العنبر وسجل يومي بقراءات بيئية.</div>`}
                        ${treatRowsHtml ? `<div style="margin-top:10px;"><div style="font-weight:800;font-size:12px;margin-bottom:4px;">🪣 معاملات ${getFloorInfo(b).short} فى هذه المرحلة</div>${treatRowsHtml}</div>` : ''}
                        <details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:700;font-size:11.5px;color:var(--muted);">📐 التفاصيل الفنية والمعادلات (اختياري)</summary>
                            <div style="margin-top:8px;">${renderVentilationCalcCard(b, m)}</div>
                        </details>
                    </div>`;
                }
                // مراحل فاتت أو لسه جاية — سطر مختصر بس
                const nextNote = status === 'upcoming' && idx > 0 && age >= minAge - 3
                    ? `<div style="font-size:10.5px;color:var(--wheat);margin-top:2px;">🔔 قربت — ابدأ تضبط الفتحات/الشفاطات تدريجيًا استعدادًا لهذه المرحلة</div>` : '';
                return `
                <div class="timeline-node ${status}" style="border-right:3px solid ${dotColor};opacity:${status==='done'?0.65:0.9};padding:8px 12px;margin-bottom:6px;">
                    <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--barn-dark);font-size:12.5px;">${dotIcon} ${row.stageLabel} <span style="font-size:10.5px;color:var(--muted);font-weight:600;">(${seasonIcon} ${dutyLow}-${dutyHigh}% تشغيل ليلي)</span></div>
                    ${nextNote}
                    ${treatRowsHtml ? `<div style="margin-top:6px;">${treatRowsHtml}</div>` : ''}
                </div>`;
            }).join('');

            return `
            <div class="section" style="margin-top:0;"><div class="card">
                <h2 style="margin:0 0 4px;color:var(--barn-dark);">🌡️ مسار البيئة والتهوية</h2>
                <p style="font-size:11px;color:var(--muted);margin:0 0 10px;">توصيات تتبع عمر القطيع تلقائيًا بدل جداول ومعادلات ثابتة — كل مرحلة بتتفتح بالتفصيل لما توصل ليها، والمراحل اللي فاتت أو الجاية بتظهر مختصرة.</p>
                ${stagesHtml}
            </div></div>`;
        }

        function renderEnvironmentTab(b, m) {
            m = m || computeMetrics(b);
            const today = m.todayAge;

            return `
            <div class="section" style="margin-top:0;"><div class="card">
                <h2 style="margin:0 0 8px;color:var(--barn-dark);">🌦️ الطقس والإجهاد الحراري</h2>
                ${renderWeatherWidget()}
            </div></div>

            ${renderEnvironmentTimeline(b, m)}

            <div class="section"><div class="section-head"><h2>🪣 إضافة معاملة ${getFloorInfo(b).short}</h2>
                <button class="btn ghost sm owner-only" onclick="openTreatModal()">+ إضافة معاملة</button></div>
                <p style="font-size:10.5px;color:var(--muted);margin:2px 2px 0;">💡 نظام التربية والأرضية الحالي: <b>${getFloorInfo(b).label}</b> — ${getFloorInfo(b).hint}. المعاملات المجدولة بتظهر تلقائيًا جوه المرحلة العمرية بتاعتها فى المسار فوق.</p>
            </div>

            ${renderOutageSection(b, m)}
            <p style="font-size:10.5px;color:var(--muted);margin:4px 2px 0;">💡 التسجيل اليومي لدرجة الحرارة والرطوبة لسه فى تبويب "📅 السجل اليومي" زي ما هو — التبويب ده لإدارة البرنامج والمتابعة فقط.</p>`;
        }

        function renderWaterAdditiveListCard(b, m) {
            m = m || computeMetrics(b);
            const today = m.todayAge;
            return b.waterAdditives.map(a => {
                const activeToday = a.active && additiveActiveOnDay(a, today);
                const execToday = isAdditiveExecutedToday(b, a.id, todayStr());
                const execBtn = !activeToday ? '' : execToday
                    ? `<span class="pill info" style="font-size:10px;">✅ نُفّذ اليوم</span>`
                    : `<button class="btn gold sm" onclick="applyAdditiveToday('water','${a.id}')">✅ تنفيذ اليوم</button>`;
                return `<div class="check-row" style="${activeToday?'background:rgba(46,110,142,.1);border-right:3px solid #2E6E8E;':''}">
                    <input type="checkbox" ${a.active?'checked':''} onchange="toggleAdditive('water','${a.id}')">
                    <div class="txt">
                        <div style="font-weight:${activeToday?'800':'600'};">${esc(a.name)} ${activeToday?'<span class="pill info" style="font-size:10px;">نشط اليوم ✓</span>':''}</div>
                        <div class="day">${additiveDayLabel(a)} · ${additivePeriodLabel(a)}${timeLabel(a.time)} · الجرعة: <b>${a.dose} ${a.unit}/${a.per}</b></div>
                        ${a.notes?`<div style="font-size:11px;color:var(--muted);">${esc(a.notes)}</div>`:''}
                    </div>
                    ${execBtn}
                    <button class="btn ghost sm owner-only" onclick="editAdditiveDose('water','${a.id}')">✏️ جرعة</button>
                    <button class="btn ghost sm owner-only" onclick="editWaterAdditive('${a.id}')">✏️ تعديل كامل</button>
                    <button class="btn danger sm owner-only" onclick="deleteAdditive('water','${a.id}')">🗑️</button>
                </div>`;
            }).join('');
        }
        // ⚡ تحسين أداء (المرحلة 1): تحديث كارت إضافات الماء لوحده بدل هدم تبويب الإنتاج كامل
        function refreshWaterAdditiveListBox() {
            const box = document.getElementById('waterAdditiveListBox');
            const b = getActiveBatch();
            if (box && b) box.innerHTML = renderWaterAdditiveListCard(b);
            else render();
        }
        // ============ Water Section (جزء من تبويب الإنتاج): إضافات الماء + جودة المياه + نسبة الماء:العلف ============
        // ============ 💧 كارت جدولة سقاية الماء بفترات اليوم ============
        function renderWaterScheduleCard(b) {
            const age = computeMetrics(b).todayAge;
            const active = getActiveWaterSchedule(b, age);
            const allSchedules = [...(b.waterSchedules || [])].sort((a, c) => a.startAge - c.startAge);

            const activeHtml = !active ? `<div class="empty" style="padding:14px;">مفيش جدول سقاية معرَّف لعمر النهاردة (يوم ${age}) — ضيف جدول من تحت.</div>` :
                `<div style="font-size:10.5px;color:var(--muted);padding:4px 12px 8px;">📅 الجدول الساري من يوم ${active.startAge} — مقسَّم ${active.periods.length} فترات</div>` +
                active.periods.map(p => {
                    const done = isWaterPeriodDoneToday(b, p.id);
                    const hasAdditive = p.additiveName && p.additiveName.trim();
                    return `<div class="check-row">
                        <input type="checkbox" ${done?'checked':''} onchange="toggleWaterPeriodDone('${active.id}','${p.id}')">
                        <div class="txt">
                            <div style="font-weight:${done?'600':'800'};" class="${done?'done-strike':''}">🕐 ${formatHourRange(p.startHour, p.endHour)} <span class="pill" style="font-size:10px;">${p.hours} ساعة</span></div>
                            <div class="day">
                                <input type="text" value="${esc(p.additiveName||'')}" placeholder="اسم الإضافة (اختياري)" oninput="updateWaterSchedulePeriod('${active.id}','${p.id}','additiveName',this.value)" style="width:110px;display:inline-block;font-size:11px;padding:3px 6px;margin-inline-end:4px;">
                                ${hasAdditive ? `<input type="number" value="${p.dose||''}" placeholder="الجرعة" oninput="updateWaterSchedulePeriod('${active.id}','${p.id}','dose',this.value)" style="width:55px;display:inline-block;font-size:11px;padding:3px 6px;margin-inline-end:4px;">
                                <select onchange="updateWaterSchedulePeriod('${active.id}','${p.id}','unit',this.value)" style="width:auto;display:inline-block;font-size:11px;padding:3px 4px;">
                                    <option ${p.unit==='جم/لتر'?'selected':''}>جم/لتر</option>
                                    <option ${p.unit==='مل/لتر'?'selected':''}>مل/لتر</option>
                                    <option ${p.unit==='جم/1000 طائر'?'selected':''}>جم/1000 طائر</option>
                                </select>` : ''}
                            </div>
                        </div>
                    </div>`;
                }).join('');

            const managerRows = allSchedules.map(s => `<div class="check-row">
                <div class="txt">
                    <div>${s.id === (active && active.id) ? '👈 ' : ''}من يوم <b>${s.startAge}</b> — ${s.periods.length} فترات (${s.periods.map(p=>p.hours).join('+')} ساعة)</div>
                    <div class="day">${s.periods.map(p => formatHourRange(p.startHour,p.endHour)).join(' · ')}</div>
                </div>
                <button class="btn danger sm owner-only" onclick="removeWaterSchedule('${s.id}')">🗑️</button>
            </div>`).join('') || '<div class="empty" style="padding:10px;">مفيش جداول محفوظة لسه.</div>';

            return `
                <div id="waterScheduleBox">${activeHtml}</div>
                <details style="margin-top:8px;">
                    <summary style="cursor:pointer;font-weight:700;font-size:12px;padding:8px 4px;color:var(--muted);">⚙️ إدارة جداول السقاية (${allSchedules.length})</summary>
                    <div style="padding:8px 4px;">
                        <div class="form-grid" style="margin-bottom:8px;">
                            <div class="field"><label>يبدأ من يوم</label><input type="number" id="ws_startAge" placeholder="مثال: 1" min="1"></div>
                            <div class="field"><label>عدد الفترات</label>
                                <select id="ws_periodCount">
                                    <option value="2">فترتين (12+12)</option>
                                    <option value="3" selected>3 فترات (8+8+8)</option>
                                    <option value="4">4 فترات (6+6+6+6)</option>
                                    <option value="6">6 فترات (4×6)</option>
                                </select>
                            </div>
                        </div>
                        <button class="btn gold block sm" onclick="addWaterSchedule(document.getElementById('ws_startAge').value, document.getElementById('ws_periodCount').value)">+ إضافة جدول جديد</button>
                        <div style="margin-top:10px;">${managerRows}</div>
                    </div>
                </details>`;
        }

        function renderWaterSection(b, m) {
            m = m || computeMetrics(b);
            const today = m.todayAge;
            const ins = computeInsights(b, m);

            const waterAddRows = renderWaterAdditiveListCard(b, m);

            const lastWQ = [...b.records].reverse().find(r => r.waterPh != null || r.waterSalinity != null);
            const waterQualityHtml = !lastWQ ? '' : `<div class="check-row"><div class="txt">
                    <div>💧 آخر قراءة جودة مياه شرب (يوم ${lastWQ.age})</div>
                    <div class="day">${lastWQ.waterPh!=null?`pH: ${fmt(lastWQ.waterPh,1)} `:''}${lastWQ.waterSalinity!=null?`· ملوحة (TDS): ${fmt(lastWQ.waterSalinity,0)} ppm`:''}</div>
                </div></div>`;

            const wf = ins.waterFeedAnalysis;
            const waterFeedRatioHtml = !wf ? '' : (() => {
                const baseline = wf.refWfr || wf.overallAvg;
                const devTxt = wf.deviationPct != null ? `${wf.deviationPct>=0?'+':''}${fmt(wf.deviationPct,0)}%` : '—';
                const devColor = waterFeedDeviationColor(wf.deviationPct);
                const isHigh = wf.deviationPct != null && wf.deviationPct >= 8;
                return `<div class="check-row"><div class="txt">
                    <div>💧🌾 نسبة الماء:العلف — آخر 3 أيام: <b>${fmt(wf.recentAvg,2)}</b> مقابل المرجعي ${fmt(baseline,2)} (<b style="color:${devColor};">${devTxt}</b>)</div>
                    <div class="day">${isHigh ? 'ارتفاع ملحوظ عن الطبيعي — غالبًا يسبق أعراض الإجهاد الحراري أو المرض بيوم أو يومين' : 'ضمن النطاق الطبيعي تقريبًا'}</div>
                </div></div>`;
            })();

            const wwa = computeWaterWasteAnalysis(b, m);
            const waterWasteHtml = (!wwa || !wwa.hasEnoughData) ? '' : (() => {
                const level = wwa.wastePct >= 20 ? 'var(--red)' : wwa.wastePct >= 10 ? 'var(--warning-text)' : 'var(--green)';
                const icon = wwa.wastePct >= 20 ? '🔴' : wwa.wastePct >= 10 ? '🟡' : '🟢';
                return `<div class="check-row"><div class="txt">
                    <div>🚰 هادر مياه تقديري (مقارنة بنسبة العلف المرجعية): <b style="color:${level};">${icon} ${fmt(wwa.recentAvgWaste,1)} لتر/يوم</b> (${fmt(wwa.wastePct,0)}% من الاستهلاك)</div>
                    <div class="day">تراكمي على الدورة: ${fmt(wwa.totalWaste,0)} لتر عبر ${wwa.daysCounted} يوم مسجَّل — ${wwa.wastePct>=15 ? 'نسبة مرتفعة، يستاهل تفحص النيبل درينكرز/الحلمات من تسريب فعلي أولًا، وتراجع الحرارة والصحة العامة لو مفيش تسريب واضح' : 'ضمن نطاق مقبول تقريبًا'}</div>
                </div></div>`;
            })();

            return `
            <div class="row-actions" style="margin:0 0 12px;">
                <button class="btn ghost sm owner-only" style="flex:1;" onclick="openWaterCalcModal()">🧮 حاسبة احتياج الماء</button>
                <button class="btn ghost sm owner-only" style="flex:1;" onclick="openProtocolModal()">🧬 بروتوكولات محفوظة</button>
            </div>
            <div class="section" style="margin-top:0;"><div class="section-head"><h2>🕐 جدولة سقاية الماء بفترات اليوم</h2></div>
                <p style="font-size:10.5px;color:var(--muted);margin:0 0 8px;">قسّم الـ24 ساعة لفترات متساوية (زي 8+8+8 أو 6+6+6+6)، وحدّد لكل فترة إضافتها وجرعتها المستقلة — والجدول نفسه يقدر يتغيّر مع عمر الدفعة.</p>
                <div class="card" style="padding:0;">${renderWaterScheduleCard(b)}</div>
            </div>
            <div class="section"><div class="section-head"><h2>💧 برنامج إضافات الماء</h2>
                <button class="btn ghost sm owner-only" onclick="document.getElementById('waterAddModalOverlay').classList.add('show')">+ إضافة</button></div>
                <div class="card" id="waterAdditiveListBox" style="padding:0;">${waterAddRows||'<div class="empty" style="padding:14px;">لا توجد إضافات ماء.</div>'}</div>
            </div>
            ${(waterQualityHtml||waterFeedRatioHtml||waterWasteHtml) ? `<div class="section"><div class="section-head"><h2>📊 مؤشرات جودة واستهلاك المياه</h2></div><div class="card" style="padding:0;">${waterQualityHtml}${waterFeedRatioHtml}${waterWasteHtml}</div></div>` : ''}
            <p style="font-size:10.5px;color:var(--muted);margin:4px 2px 0;">💡 التسجيل اليومي لكميات الماء وقراءات جودته لسه فى تبويب "📅 السجل اليومي" زي ما هو.</p>`;
        }

        // ============ Health Section (جزء من تبويب الإنتاج): تحصينات + بروتوكولات + تنبيهات مخصصة + سجل تنفيذ ============
        function renderVaccineListCard(b, m) {
            m = m || computeMetrics(b);
            const today = m.todayAge;
            return [...b.vaccineLog].sort((a,c)=>a.day-c.day).map(v => {
                const dueToday = !v.done && v.day === today;
                const overdue = !v.done && v.day < today;
                return `<div class="check-row" style="${dueToday?'background:rgba(193,68,60,.1);border-right:3px solid var(--red);':overdue?'background:rgba(193,68,60,.05);':''}">
                    <input type="checkbox" ${v.done?'checked':''} onchange="toggleVaccine('${v.id}')">
                    <div class="txt">
                        <div class="${v.done?'done-strike':''}" style="font-weight:${dueToday?'800':'600'};">${esc(v.name)}
                            ${dueToday?'<span class="pill exp" style="font-size:10px;">مستحق اليوم!</span>':overdue&&!v.done?'<span class="pill exp" style="font-size:10px;">متأخر</span>':''}
                        </div>
                        <div class="day">يوم ${v.day} ${v.doneDate?'· تم فى '+v.doneDate:''}</div>
                        ${v.doseMode === 'perBirds' ? `<div class="day" style="color:var(--muted);">💉 ${fmt(v.ampoulesPerGroup,2)} أمبول لكل ${fmt(v.birdsPerGroup,0)} فرخة${!v.done ? ` — تقديريًا ${fmt(Math.ceil(m.liveCount / v.birdsPerGroup) * v.ampoulesPerGroup,0)} أمبول للقطيع الحالي (${fmt(m.liveCount,0)} طائر)` : ` — نُفِّذ بـ ${fmt(v.qty,1)} أمبول`}</div>` : ''}</div>
                    </div>
                    <button class="btn ghost sm owner-only" onclick="editVaccine('${v.id}')">✏️</button>
                    <button class="btn danger sm owner-only" onclick="deleteVaccine('${v.id}')">🗑️</button>
                </div>`;
            }).join('');
        }
        // ⚡ تحسين أداء (المرحلة 1): تحديث كارت التحصينات لوحده بدل هدم الصفحة كاملة عند تأشير/إلغاء تحصين
        function refreshVaccineListBox() {
            const box = document.getElementById('healthVaccineListBox');
            const b = getActiveBatch();
            if (box && b) box.innerHTML = renderVaccineListCard(b);
            else render();
        }
        // ============ تقويم شهري مرئي للتنبيهات (بديل بصري للقائمة الفلات — إلهام من تطبيق تانى) ============
        // حالة العرض والتنقل بين الشهور session فقط (مش محفوظة)، بترجع لشهر تاريخ النهاردة كل ما تفتح دفعة جديدة
        let reminderViewMode = 'list'; // 'list' | 'calendar'
        let reminderCalYear = null, reminderCalMonth = null, reminderCalSelectedDate = null;
        function toggleReminderViewMode() {
            reminderViewMode = reminderViewMode === 'list' ? 'calendar' : 'list';
            if (reminderViewMode === 'calendar' && reminderCalYear === null) {
                const t = new Date(); reminderCalYear = t.getFullYear(); reminderCalMonth = t.getMonth(); reminderCalSelectedDate = todayStr();
            }
            refreshReminderListBox();
        }
        function navigateReminderCalendar(delta) {
            reminderCalMonth += delta;
            if (reminderCalMonth < 0) { reminderCalMonth = 11; reminderCalYear--; }
            else if (reminderCalMonth > 11) { reminderCalMonth = 0; reminderCalYear++; }
            refreshReminderListBox();
        }
        function selectReminderCalendarDay(dateStr) { reminderCalSelectedDate = dateStr; refreshReminderListBox(); }
        const AR_MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const AR_WEEKDAY_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
        function renderReminderCalendar(b) {
            if (reminderCalYear === null) { const t = new Date(); reminderCalYear = t.getFullYear(); reminderCalMonth = t.getMonth(); reminderCalSelectedDate = todayStr(); }
            const y = reminderCalYear, m = reminderCalMonth;
            const firstDay = new Date(y, m, 1);
            const startOffset = firstDay.getDay(); // 0=أحد
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            const t0 = todayStr();
            const remByDate = {};
            (b.reminders || []).forEach(r => { (remByDate[r.date] = remByDate[r.date] || []).push(r); });
            let cells = '';
            for (let i = 0; i < startOffset; i++) cells += '<div></div>';
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayRems = remByDate[dateStr] || [];
                const hasOverdue = dayRems.some(r => !r.done && dateStr < t0);
                const isToday = dateStr === t0;
                const isSelected = dateStr === reminderCalSelectedDate;
                cells += `<div onclick="selectReminderCalendarDay('${dateStr}')" style="text-align:center;padding:7px 0;border-radius:10px;cursor:pointer;font-size:13px;
                    ${isSelected ? 'background:var(--barn-dark);color:#fff;font-weight:800;' : isToday ? 'background:rgba(217,165,68,.18);font-weight:800;' : ''}">
                    ${d}${dayRems.length ? `<div style="display:flex;justify-content:center;gap:2px;margin-top:2px;">${dayRems.slice(0, 3).map(r => `<span style="width:5px;height:5px;border-radius:50%;display:inline-block;background:${r.done ? '#9aa08f' : hasOverdue ? '#E5544B' : 'var(--wheat)'};"></span>`).join('')}</div>` : ''}
                    </div>`;
            }
            const weekdayHeaders = AR_WEEKDAY_SHORT.map(w => `<div style="text-align:center;font-size:11px;color:var(--muted);font-weight:700;">${w}</div>`).join('');
            const selRems = (remByDate[reminderCalSelectedDate] || []).sort((a, c) => (a.done - c.done));
            const remCatIcon = { feed: '🌾', water: '💧', medication: '💊', maintenance: '🔧', other: '📌' };
            const selRemsHtml = selRems.length ? selRems.map(r => `
                <div class="check-row"><input type="checkbox" ${r.done ? 'checked' : ''} onchange="toggleReminder('${r.id}')">
                    <div class="txt"><div class="${r.done ? 'done-strike' : ''}">${remCatIcon[r.category] || '📌'} ${esc(r.title)}</div></div>
                    <button class="btn ghost sm owner-only" onclick="editReminder('${r.id}')">✏️</button>
                    <button class="btn danger sm owner-only" onclick="deleteReminder('${r.id}')">🗑️</button></div>`).join('')
                : `<div class="empty" style="padding:10px;font-size:12px;">مفيش تنبيهات فى ${reminderCalSelectedDate}</div>`;
            return `
                <div style="padding:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <button class="btn ghost sm" onclick="navigateReminderCalendar(-1)">›</button>
                    <div style="font-weight:800;">${AR_MONTH_NAMES[m]} ${y}</div>
                    <button class="btn ghost sm" onclick="navigateReminderCalendar(1)">‹</button>
                </div>
                <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:4px;">${weekdayHeaders}</div>
                <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">${cells}</div>
                <div style="margin-top:12px;border-top:1px dashed var(--line);padding-top:8px;">
                    <div style="font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:4px;">📌 ${reminderCalSelectedDate}</div>
                    ${selRemsHtml}
                </div>
                </div>`;
        }
        function renderReminderListCard(b) {
            const remCatIcon = { feed: '🌾', water: '💧', medication: '💊', maintenance: '🔧', other: '📌' };
            return [...b.reminders].sort((a,c)=>a.date.localeCompare(c.date)).map(r => {
                const t0 = todayStr();
                const dueToday = !r.done && r.date === t0;
                const overdue = !r.done && r.date < t0;
                const repeatTxt = r.repeatDays > 0 ? `<span class="pill" style="font-size:10px;">🔁 كل ${r.repeatDays === 1 ? 'يوم' : r.repeatDays === 7 ? 'أسبوع' : r.repeatDays + ' يوم'}</span>` : '';
                return `
                <div class="check-row"><input type="checkbox" ${r.done?'checked':''} onchange="toggleReminder('${r.id}')">
                    <div class="txt"><div class="${r.done?'done-strike':''}" style="font-weight:${dueToday||overdue?'800':'600'};">${remCatIcon[r.category]||'📌'} ${esc(r.title)}
                        ${dueToday?'<span class="pill exp" style="font-size:10px;">مستحق اليوم!</span>':overdue?'<span class="pill exp" style="font-size:10px;">متأخر</span>':''} ${repeatTxt}</div>
                    <div class="day">${r.date}${r.completedCount?` · اتنفذ ${r.completedCount} مرة قبل كده`:''}</div></div>
                    <button class="btn ghost sm owner-only" onclick="editReminder('${r.id}')">✏️</button>
                    <button class="btn danger sm owner-only" onclick="deleteReminder('${r.id}')">🗑️</button></div>`;
            }).join('');
        }
        // ⚡ تحسين أداء (المرحلة 1): تحديث كارت التنبيهات لوحده بدل هدم الصفحة كاملة عند تأشير/إلغاء تنبيه
        function refreshReminderListBox() {
            const box = document.getElementById('healthReminderListBox');
            const b = getActiveBatch();
            if (!box || !b) { render(); return; }
            box.innerHTML = reminderViewMode === 'calendar' ? renderReminderCalendar(b) : (renderReminderListCard(b) || '<div class="empty" style="padding:14px;">لا توجد تنبيهات مخصصة.</div>');
            const btn = document.getElementById('reminderViewToggleBtn');
            if (btn) btn.textContent = reminderViewMode === 'calendar' ? '📋 قائمة' : '📅 تقويم';
        }
        function renderHealthSection(b, m) {
            m = m || computeMetrics(b);
            const today = m.todayAge;

            const vaccineRows = renderVaccineListCard(b, m);

            const reminderRows = renderReminderListCard(b);

            const execRows = [...(b.additiveExecLog||[])].reverse().slice(0, 20).map(e => `
                <div class="check-row">
                    <div class="txt"><div>${e.type==='feed'?'🌾':'💧'} ${esc(e.name)} — <b>${fmt(e.qty,2)} ${e.unit}</b></div>
                    <div class="day">${e.date}</div></div>
                    <button class="btn ghost sm owner-only" onclick="undoAdditiveExec('${e.id}')">↩️ تراجع</button>
                </div>`).join('');

            return `
            <div class="section" style="margin-top:0;"><div class="section-head"><h2>💉 برنامج التحصينات</h2>
                <div class="no-print" style="display:flex;gap:6px;">
                    <button class="btn ghost sm owner-only" onclick="loadDefaultVaccineProgram()" title="يضيف تحصينات النوع القياسية الناقصة دون حذف أي تحصين موجود">📋 تحميل البرنامج القياسي</button>
                    <button class="btn ghost sm owner-only" onclick="openVaccineModal()">+ إضافة تحصين</button>
                </div></div>
                <div class="card" id="healthVaccineListBox" style="padding:0;">${vaccineRows||'<div class="empty" style="padding:14px;">لا توجد تحصينات. اضغط «تحميل البرنامج القياسي» لتحميل برنامج التحصينات المعتمد لهذا النوع.</div>'}</div>
            </div>
            <div class="section"><div class="section-head"><h2>🔔 تنبيهات مخصصة</h2>
                <div style="display:flex;gap:6px;">
                    <button class="btn ghost sm" id="reminderViewToggleBtn" onclick="toggleReminderViewMode()">${reminderViewMode === 'calendar' ? '📋 قائمة' : '📅 تقويم'}</button>
                    <button class="btn ghost sm owner-only" onclick="openReminderModal()">+ تنبيه</button>
                </div></div>
                <div class="card" id="healthReminderListBox" style="padding:0;">${reminderViewMode === 'calendar' ? renderReminderCalendar(b) : (reminderRows || '<div class="empty" style="padding:14px;">لا توجد تنبيهات مخصصة.</div>')}</div>
            </div>
            <div class="section"><div class="section-head"><h2>📜 سجل تنفيذ الإضافات (مخصوم من المخزن)</h2></div>
                <div class="card" style="padding:0;">${execRows||'<div class="empty" style="padding:14px;">لا توجد عمليات تنفيذ مسجّلة بعد.</div>'}</div>
            </div>`;
        }

        // ============ Production Tab (مجمّع): العلف + الماء + البيئة والتهوية + الصحة والتحصينات — صفحات مطوية ============
        function renderProductionTab(b, m, fin, alerts) {
            m = m || computeMetrics(b);
            fin = fin || computeFinance(b, m);
            const sec = (id, icon, title, contentHtml, openByDefault) => `
                <details ${openByDefault ? 'open' : ''} style="border-bottom:1px solid var(--line);">
                    <summary style="padding:12px 14px;cursor:pointer;background:#faf8f2;font-weight:800;font-size:14px;">${icon} ${title}</summary>
                    <div style="padding:10px 12px;">${contentHtml}</div>
                </details>`;
            return `<div class="section" style="margin-top:0;"><div class="card" style="padding:0;overflow:hidden;">
                ${sec('feed', '🌾', 'العلف', renderFeedTab(b, m, fin), true)}
                ${sec('water', '💧', 'الماء', renderWaterSection(b, m), false)}
                ${sec('environment', '🌡️', 'البيئة والتهوية', renderEnvironmentTab(b, m), false)}
                ${sec('health', '💉', 'الصحة والتحصينات', renderHealthSection(b, m), false)}
            </div></div>`;
        }

        // ============ Management Tab (مجمّع): الماليات + المخزن + مقارنة الدورات — بتنقل فرعي ============
        let managementSubTab = 'finance';
        function setManagementSubTab(id) { managementSubTab = id; render(); }
        function renderManagementTab(b, fin, m, alerts) {
            m = m || computeMetrics(b);
            fin = fin || computeFinance(b, m);
            const cats = [
                { id: 'finance', label: '💰 التقرير الشامل' },
                { id: 'compare', label: '⚖️ مقارنة الدورات' },
                { id: 'expansion', label: '🚀 خطة التوسع' },
            ];
            // ============ (جديد) المخزون والمعاملات اتنقلوا بالكامل لكارت مخصص فى الداشبورد ============
            // (📦 المخزن + 🛒 المشتريات + 💰 المبيعات + مقارنة الموردين/المشترين) — مبقوش جزء من
            // الإدارة والتخطيط، وبقت renderInventoryDashboardCard() هي المسؤولة عن عرضها فى الداشبورد.
            if (managementSubTab === 'inventory') managementSubTab = 'finance';
            const navHtml = `<div class="settings-subnav">${cats.map(c => `<button class="ssnav-btn ${managementSubTab===c.id?'active':''}" onclick="setManagementSubTab('${c.id}')">${c.label}</button>`).join('')}</div>`;
            let bodyHtml = '';
            if (managementSubTab === 'finance') bodyHtml = renderFinanceTab(b, m, fin, alerts);
            else if (managementSubTab === 'compare') bodyHtml = renderCompareTab();
            else if (managementSubTab === 'expansion') bodyHtml = renderExpansionTab(b);
            return navHtml + bodyHtml;
        }

        // ============ خطة التوسع (Snowball Expansion Plan) — محاكاة توسع تراكمي مبنية على أداء المزرعة الفعلي التاريخي ============
        // منطق الاستراتيجية: كل عنبر فى أول دورة تسكين له، ربحها بالكامل بيفتح عنبر جديد ضعف سعته مباشرة (نسل خاص بيه).
        // من الدورة التانية للعنبر فأكتر، ربحه بيروح لصندوق تنمية/طوارئ مشترك لكل عنابر نفس النوع.
        // لما الصندوق يوصل لتكلفة هدف كبير (تكامل رأسي: مفرخة/مصنع علف/أمهات/مجزر)، بينفّذه، وتتكرر الكرة بسيولة أكبر.
        // ============ كل نوع طائر عنده نفس الخطة كاملة بنفس المنطق بالظبط (مش تنويع جانبي) — الاختلاف بينهم فى الأرقام فقط ============
        // تختار النوع من القائمة تحت، والتطبيق يحسبلك تلقائيًا: خطة التوسع + قطيع الأمهات + طاقة مصنع العلف + طاقة المجزر + مرحلة العلف، كلها خاصة بالنوع ده وحده.
        const EXPANSION_SPECIES_LIST = [
            { key: 'broiler', label: 'دجاج تسمين أبيض (روص/كوب)', icon: '🐔' },
            { key: 'sasso', label: 'ساسو (دجاج ملون بطيء النمو)', icon: '🐔' },
            { key: 'balady', label: 'ديك بلدي', icon: '🐓' },
            { key: 'quail', label: 'سمان', icon: '🐦' },
            { key: 'turkeyWhite', label: 'رومي أبيض', icon: '🦃' },
            { key: 'turkeyBlack', label: 'رومي أسود (محلي)', icon: '🦃' },
            { key: 'muscovy', label: 'بط مسكوفي', icon: '🦆' },
            { key: 'mulard', label: 'بط مولر', icon: '🦆' },
        ];
        function expansionSpeciesLabel(key) { const s = EXPANSION_SPECIES_LIST.find(x => x.key === key); return s ? `${s.icon} ${s.label}` : (key || '—'); }

        // ============ تحذيرات من "قاعدة معرفة الحوادث" قبل الدخول/التوسع فى نوع مُعيّن — بتظهر أعلى تبويب التوسع ============
        function renderExpansionIncidentWarnings(species) {
            const kb = computeIncidentKnowledgeBase(species);
            if (!kb || !kb.length) return '';
            const top = kb.slice(0, 5);
            return `<div class="section">
                <div class="section-head"><h2>⚠️ خبرة دوراتك السابقة قبل ما تكمّل التوسع فى ${expansionSpeciesLabel(species)}</h2></div>
                <div class="card" style="padding:0;">` + top.map(e => {
                    const solTxt = e.bestSolution
                        ? `الحل اللي نجح غالبًا: <b>${esc(e.bestSolution.name)}</b> (${fmt(e.bestSolution.successRate*100,0)}% من ${e.bestSolution.timesUsed} محاولة)`
                        : 'لسه مفيش حل مُثبت مرتبط بهذا النمط';
                    return `<div class="check-row"><div class="txt">
                        <div style="font-weight:800;">${esc(e.category)} — حوالي يوم ${e.ageCenter}</div>
                        <div class="day">تكرر فى ${e.cyclesAffected} من دوراتك المؤرشفة — ${solTxt}</div>
                    </div></div>`;
                }).join('') + `</div>
                <p style="font-size:10.5px;color:var(--muted);margin:6px 2px 0;">💡 قبل ما تحجز عنبر/رأس مال إضافي لهذا النوع، جهّز خطة لمواجهة هذه الأنماط — التفاصيل الكاملة فى "🧠 قاعدة معرفة الحوادث" (تبويب الإنتاج).</p>
            </div>`;
        }

        const DEFAULT_EXPANSION_INPUTS = {
            minHouseCapacity: 10000, targetHouseCount: 10, stockingIntervalDays: 3, capacityMultiplier: 2,
            costPerBirdOpenHouse: null, feedCreditMarkupPerBird: null, safetyFundMin: null,
            // الأهداف الكبرى (تكامل رأسي) الخاصة بهذا النوع تحديدًا — رأس المال بيتحسب تلقائيًا من احتياجك الفعلي
            // (شوف computeAutoMilestoneCapex)، إنت بس بتدخل تكلفة الوحدة (أرخص تتأكد منها من عروض أسعار حقيقية)
            capexHatcheryPerThousandChicks: null, capexFeedMillPerTonDay: null, capexSlaughterhousePerTonDay: null,
            // حاسبة قطيع الأمهات الخاصة بهذا النوع — عدد الأمهات المطلوب + نقطة التعادل مع شراء الصغار
            cyclesPerYearPerHouse: 6, henEggsPerYear: 160, fertilityPct: 90, hatchPct: 85,
            currentChickPrice: null, henAnnualFeedCost: null, henCost: null,
            // الطاقة المخططة للمجزر ومصنع العلف الخاصين بهذا النوع
            plannedSlaughterKgPerDay: null, plannedFeedMillTonsPerDay: null, capacitySafetyMarginPct: 20,
            // اختبار ضغط تقلب سعر العلف والبيع (سيناريوهات متفائل/متشائم)
            feedPriceStressPct: 15, salePriceStressPct: 10,
            // مقارنة مسار الأجل بمسار الكاش (بديل بدون تمويل خارجي) + رفع القيمة من بيع مجزّر بدل حي
            cashOnlyStartHouseCount: 1, houseCountCap: null, liveToProcessedUpliftPerBird: null,
            // مرحلة العلف الافتراضية لهذا النوع (بادئ/نامي) — مرجع تخطيط لهذا النوع، "ناهي" = باقي الدورة تلقائيًا
            feedStageStarterKg: null, feedStageGrowerKg: null,
            // بيانات أداء احتياطية يدوية — تُستخدم بس لو لسه معندكش دورة مؤرشفة واحدة من هذا النوع، عشان تقدر تخطط له من الأول
            manualAvgProfitPerBird: null, manualSdProfitPerBird: null, manualAvgCycleDays: null,
            manualAvgFeedKgPerBird: null, manualAvgFinalWeightKg: null, manualSuccessRatePct: null,
        };
        const EXPANSION_INPUT_IDS = Object.keys(DEFAULT_EXPANSION_INPUTS);

        function getExpansionSelectedSpecies() { return state.expansionSelectedSpecies || 'broiler'; }
        function setExpansionSpecies(sp) { setState('expansionSelectedSpecies', sp); persist(); render(); }

        // ترحيل بيانات نسخة قديمة (كانت بتخزن إعدادات توسع واحدة بس لكل المزرعة) لنوع "دجاج أبيض" — عشان محدش يفقد بياناته اللي دخّلها قبل كده
        function migrateExpansionInputsIfNeeded() {
            if (!state.expansionInputsBySpecies) {
                setState('expansionInputsBySpecies', {});
                if (state.expansionInputs) {
                    const old = { ...state.expansionInputs };
                    delete old.capexSasso; delete old.capexBaladi; delete old.capexTurkeyWhite; delete old.capexTurkeyBlack;
                    delete old.capexDuckMuscovy; delete old.capexDuckMulard; delete old.quailCapex;
                    state.expansionInputsBySpecies.broiler = old;
                }
            }
        }
        function getExpansionInputs(species) {
            migrateExpansionInputsIfNeeded();
            species = species || getExpansionSelectedSpecies();
            return { ...DEFAULT_EXPANSION_INPUTS, ...((state.expansionInputsBySpecies || {})[species] || {}) };
        }
        function saveExpansionInputs() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3): مدخلات خطة توسع استراتيجية
            migrateExpansionInputsIfNeeded();
            const species = getExpansionSelectedSpecies();
            const vals = {};
            EXPANSION_INPUT_IDS.forEach(id => {
                const el = document.getElementById('exp_' + id);
                if (el) { const n = parseFloat(el.value); vals[id] = isNaN(n) ? null : n; }
            });
            state.expansionInputsBySpecies[species] = { ...getExpansionInputs(species), ...vals };
            persist();
            render();
        }

        function computeExpansionHistoricalStats(species) {
            const archived = state.batches.filter(x => x.status === 'مؤرشفة' && (!species || x.species === species) && x.records && x.records.length >= 5);
            if (!archived.length) return null;
            const rows = archived.map(bt => {
                const mt = computeMetrics(bt);
                const ft = computeFinance(bt, mt);
                const days = (bt.startDate && bt.archivedDate) ? Math.round((new Date(bt.archivedDate) - new Date(bt.startDate)) / 86400000) : (mt.age || bt.targetAge || 35);
                const feedPerBird = bt.startCount > 0 ? ft.feedCost / bt.startCount : null;
                const feedKgPerBird = bt.startCount > 0 ? (mt.cumFeed || 0) / bt.startCount : null;
                const finalWeightKg = mt.avgWeightKg || null;
                return { profit: ft.profitPerBird, fcr: mt.fcr, mortality: mt.mortalityPct, days, feedPerBird, feedKgPerBird, finalWeightKg, totalCostPerBird: ft.costPerBird };
            });
            const meanOf = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
            const profits = rows.map(r => r.profit);
            const avgProfitPerBird = meanOf(profits);
            const sdProfitPerBird = stdDev(profits);
            const successRate = profits.length ? profits.filter(p => p > 0).length / profits.length : null;
            const fcrPairs = rows.filter(r => r.fcr != null);
            const avgFcr = meanOf(fcrPairs.map(r => r.fcr));
            const fcrCorr = fcrPairs.length >= 4 ? pearsonCorr(fcrPairs.map(r => r.fcr), fcrPairs.map(r => r.profit)) : null;
            const mortPairs = rows.filter(r => r.mortality != null);
            const avgMortality = meanOf(mortPairs.map(r => r.mortality));
            const mortCorr = mortPairs.length >= 4 ? pearsonCorr(mortPairs.map(r => r.mortality), mortPairs.map(r => r.profit)) : null;
            const avgCycleDays = meanOf(rows.map(r => r.days)) || 35;
            const avgFeedPerBird = meanOf(rows.filter(r => r.feedPerBird != null).map(r => r.feedPerBird));
            const avgFeedKgPerBird = meanOf(rows.filter(r => r.feedKgPerBird != null).map(r => r.feedKgPerBird));
            const avgFinalWeightKg = meanOf(rows.filter(r => r.finalWeightKg != null).map(r => r.finalWeightKg));
            const avgTotalCostPerBird = meanOf(rows.filter(r => r.totalCostPerBird != null).map(r => r.totalCostPerBird));
            return { n: rows.length, avgProfitPerBird, sdProfitPerBird, successRate, avgFcr, avgMortality, avgCycleDays, fcrCorr, mortCorr, avgFeedPerBird, avgFeedKgPerBird, avgFinalWeightKg, avgTotalCostPerBird };
        }

        // ============ يدمج الأداء الفعلي المؤرشف (لو موجود) مع بيانات احتياطية يدوية لنفس النوع — عشان تقدر تخطط لنوع لسه معندكش دورة مؤرشفة منه ============
        function getExpansionStatsWithFallback(species, inputs) {
            const hist = computeExpansionHistoricalStats(species);
            const usedFallback = {};
            const out = hist ? { ...hist } : { n: 0, avgProfitPerBird: null, sdProfitPerBird: null, successRate: null, avgFcr: null, avgMortality: null, avgCycleDays: null, fcrCorr: null, mortCorr: null, avgFeedPerBird: null, avgFeedKgPerBird: null, avgFinalWeightKg: null, avgTotalCostPerBird: null };
            if (out.avgProfitPerBird == null && inputs.manualAvgProfitPerBird != null) { out.avgProfitPerBird = inputs.manualAvgProfitPerBird; usedFallback.profit = true; }
            if (out.sdProfitPerBird == null && inputs.manualSdProfitPerBird != null) { out.sdProfitPerBird = inputs.manualSdProfitPerBird; usedFallback.sd = true; }
            if (out.avgCycleDays == null && inputs.manualAvgCycleDays != null) { out.avgCycleDays = inputs.manualAvgCycleDays; usedFallback.cycle = true; }
            if (out.avgFeedKgPerBird == null && inputs.manualAvgFeedKgPerBird != null) { out.avgFeedKgPerBird = inputs.manualAvgFeedKgPerBird; usedFallback.feed = true; }
            else if (out.avgFeedKgPerBird == null && (inputs.feedStageStarterKg != null || inputs.feedStageGrowerKg != null)) { out.avgFeedKgPerBird = (inputs.feedStageStarterKg || 0) + (inputs.feedStageGrowerKg || 0); usedFallback.feed = true; }
            if (out.avgFinalWeightKg == null && inputs.manualAvgFinalWeightKg != null) { out.avgFinalWeightKg = inputs.manualAvgFinalWeightKg; usedFallback.weight = true; }
            if (out.successRate == null && inputs.manualSuccessRatePct != null) { out.successRate = inputs.manualSuccessRatePct / 100; usedFallback.success = true; }
            out.isFallback = Object.keys(usedFallback).length > 0;
            out.usedFallback = usedFallback;
            out.isFullyManual = !hist;
            return out;
        }

        // ============ 🎯 حساب رأس مال الأهداف الكبرى تلقائيًا — مش رقم تقديري مكتوب يدوي ============
        // كل هدف بيتحسب من: (1) السعة/الاحتياج المستهدف فعليًا (من عدد عنابرك المستهدف targetHouseCount +
        // أداؤك التاريخي الحقيقي فى نفس النوع — feed/weight/cycle days)، × (2) تكلفة الوحدة الفعلية للسوق
        // (رقم معروف عندك من عروض أسعار حقيقية، مش تخمين إجمالي المشروع). قطيع الأمهات حالة خاصة: بيستخدم
        // حاسبة الأمهات الموجودة أصلاً (عدد الأمهات المطلوب لتغطية احتياجك × سعر شراء الأم) من غير أي مُدخل إضافي.
        // ⚠️ إصلاح: قبل كده كان المستخدم بيكتب رقم رأس مال إجمالي تقديري بحدسه لكل هدف (زي "3 مليون معمل تفريخ") —
        // رقم صعب تتأكد منه وسهل يبقى غلط بمراحل. دلوقتي بتدخل تكلفة الوحدة بس (سعر الطن/يوم، سعر الألف كتكوت،
        // سعر الأم) وهي أرقام أسهل تتأكد منها من عروض أسعار حقيقية، والإجمالي بيتحسب تلقائيًا من احتياجك الفعلي.
        function computeAutoMilestoneCapex(inputs, hist) {
            const bp = computeBreederFlockPlan(inputs); // مبنية أصلاً على targetHouseCount (المستهدف) — "الحالي والمستهدف" بالظبط
            const targetTotalCapacity = (inputs.targetHouseCount || 10) * (inputs.minHouseCapacity || 10000);
            const margin = 1 + ((inputs.capacitySafetyMarginPct != null ? inputs.capacitySafetyMarginPct : 20) / 100);
            const targetBirdsPerDay = (hist && hist.avgCycleDays > 0) ? targetTotalCapacity / hist.avgCycleDays : null;
            const targetSlaughterKgPerDay = (targetBirdsPerDay != null && hist && hist.avgFinalWeightKg) ? targetBirdsPerDay * hist.avgFinalWeightKg * margin : null;
            const targetFeedMillTonsPerDay = (targetBirdsPerDay != null && hist && hist.avgFeedKgPerBird) ? (targetBirdsPerDay * hist.avgFeedKgPerBird / 1000) * margin : null;

            const capexHatchery = (inputs.capexHatcheryPerThousandChicks != null && bp.annualChicksNeeded)
                ? (bp.annualChicksNeeded / 1000) * inputs.capexHatcheryPerThousandChicks : null;
            const capexFeedMill = (inputs.capexFeedMillPerTonDay != null && targetFeedMillTonsPerDay != null)
                ? targetFeedMillTonsPerDay * inputs.capexFeedMillPerTonDay : null;
            const capexSlaughterhouse = (inputs.capexSlaughterhousePerTonDay != null && targetSlaughterKgPerDay != null)
                ? (targetSlaughterKgPerDay / 1000) * inputs.capexSlaughterhousePerTonDay : null;
            const capexBreeders = (bp.hensNeeded && inputs.henCost != null) ? bp.hensNeeded * inputs.henCost : null;

            return { capexHatchery, capexFeedMill, capexBreeders, capexSlaughterhouse,
                targetSlaughterKgPerDay, targetFeedMillTonsPerDay, targetBirdsPerDay, annualChicksNeeded: bp.annualChicksNeeded, hensNeeded: bp.hensNeeded };
        }

        // قائمة الأهداف الكبرى (تكامل رأسي) الخاصة بالنوع المختار — بيتم تنفيذها بالترتيب من الأرخص للأغلى كل ما الصندوق يكفي
        function getExpansionMilestones(inputs, autoCapex) {
            const list = [
                { id: 'hatchery', label: '🐣 معمل تفريخ', capex: autoCapex.capexHatchery },
                { id: 'feedmill', label: '🏭 مصنع علف', capex: autoCapex.capexFeedMill },
                { id: 'breeders', label: '🥚 قطيع أمهات', capex: autoCapex.capexBreeders },
                { id: 'slaughterhouse', label: '🔪 مجزر خاص', capex: autoCapex.capexSlaughterhouse },
            ];
            return list.filter(x => x.capex != null && x.capex > 0).sort((a, b) => a.capex - b.capex);
        }

        // ============ حاسبة قطيع الأمهات — عدد الأمهات المطلوب لتغطية إنتاج النوع المختار + نقطة التعادل مقابل شراء الصغار ============
        function computeBreederFlockPlan(inputs) {
            const houseCount = inputs.targetHouseCount || 10;
            const minCap = inputs.minHouseCapacity || 10000;
            const cyclesPerYear = inputs.cyclesPerYearPerHouse || 6;
            const annualChicksNeeded = houseCount * minCap * cyclesPerYear;

            const eggsPerHen = inputs.henEggsPerYear || 160;
            const fertility = (inputs.fertilityPct != null ? inputs.fertilityPct : 90) / 100;
            const hatch = (inputs.hatchPct != null ? inputs.hatchPct : 85) / 100;
            const chicksPerHenYear = eggsPerHen * fertility * hatch;
            const hensNeeded = chicksPerHenYear > 0 ? Math.ceil(annualChicksNeeded / chicksPerHenYear) : null;

            let costPerChickOwn = null, breakeven = null;
            if (hensNeeded && inputs.henAnnualFeedCost != null) {
                const henCost = inputs.henCost || 0;
                const totalAnnualCost = hensNeeded * (inputs.henAnnualFeedCost + (henCost / 2)); // نصف عمر إنتاجي تقديري سنتين
                costPerChickOwn = totalAnnualCost / annualChicksNeeded;
                if (inputs.currentChickPrice != null) breakeven = inputs.currentChickPrice - costPerChickOwn;
            }
            return { annualChicksNeeded, chicksPerHenYear, hensNeeded, costPerChickOwn, breakeven, cyclesPerYear, houseCount, minCap };
        }

        function computeExpansionPlan(species) {
            species = species || getExpansionSelectedSpecies();
            const inputs = getExpansionInputs(species);
            const hist = getExpansionStatsWithFallback(species, inputs);
            if (!hist || hist.avgProfitPerBird == null) return { hist, insufficientData: true, species };

            const creditMarkup = inputs.feedCreditMarkupPerBird || 0;
            const profitPerBird = hist.avgProfitPerBird - creditMarkup; // ربح الطائر بعد خصم فرق سعر الأجل
            const minCap = inputs.minHouseCapacity || 10000;
            const baseHouseCount = inputs.targetHouseCount || 10;
            const multiplier = inputs.capacityMultiplier || 2;
            const costPerBird = inputs.costPerBirdOpenHouse || 0;
            const safetyMin = inputs.safetyFundMin || 0;
            const autoCapex = computeAutoMilestoneCapex(inputs, hist);
            const milestones = getExpansionMilestones(inputs, autoCapex);
            let milestoneIdx = 0;
            const achievedMilestones = [];

            // المرحلة صفر: بناء القاعدة الأفقية (10 عنابر بالحد الأدنى) ممولة بالأجل، تسكين متدرّج كل 2-3 أيام
            let houses = Array.from({ length: baseHouseCount }, () => ({ capacity: minCap, cyclesCompleted: 0 }));
            let fund = 0;
            const baseTotalCapacity = houses.length * minCap;
            const baseBirdsPerDay = hist.avgCycleDays > 0 ? baseTotalCapacity / hist.avgCycleDays : null;
            const baseMargin = 1 + ((inputs.capacitySafetyMarginPct != null ? inputs.capacitySafetyMarginPct : 20) / 100);
            const baseSlaughterKgPerDay = (baseBirdsPerDay != null && hist.avgFinalWeightKg) ? baseBirdsPerDay * hist.avgFinalWeightKg : null;
            const baseFeedMillTonsPerDay = (baseBirdsPerDay != null && hist.avgFeedKgPerBird) ? (baseBirdsPerDay * hist.avgFeedKgPerBird) / 1000 : null;
            const timeline = [{
                round: 0, houseCount: houses.length, totalCapacity: baseTotalCapacity, newHousesOpened: houses.length,
                fundAdded: 0, fundBalance: 0, action: `🏗️ بناء القاعدة الأفقية: ${houses.length} عنابر × ${fmt(minCap, 0)} طائر`,
                note: `ممولة بالأجل، تسكين كل عنبر بفارق ~${inputs.stockingIntervalDays || 3} أيام لضمان بيع كل ${inputs.stockingIntervalDays || 3} أيام تقريبًا`,
                birdsPerDay: baseBirdsPerDay,
                slaughterKgPerDay: baseSlaughterKgPerDay,
                feedMillTonsPerDay: baseFeedMillTonsPerDay,
                slaughterKgPerDayRec: baseSlaughterKgPerDay != null ? baseSlaughterKgPerDay * baseMargin : null,
                feedMillTonsPerDayRec: baseFeedMillTonsPerDay != null ? baseFeedMillTonsPerDay * baseMargin : null,
            }];

            const maxRounds = 8;
            for (let round = 1; round <= maxRounds; round++) {
                const newHouses = [];
                let fundAdded = 0, opened = 0;
                houses.forEach(h => {
                    h.cyclesCompleted++;
                    const cycleProfit = h.capacity * profitPerBird;
                    if (h.cyclesCompleted === 1) {
                        // أول دورة لهذا العنبر تحديدًا — ربحه بالكامل بيفتح عنبر جديد ضعف سعته (نسل مباشر)
                        newHouses.push({ capacity: h.capacity * multiplier, cyclesCompleted: 0 });
                        opened++;
                    } else {
                        fundAdded += cycleProfit;
                    }
                });
                fund += fundAdded;
                houses = houses.concat(newHouses);
                let action = opened > 0 ? `🆕 ${opened} عنبر جديد فتحوا من ربح دورتهم الأولى` : '➖ مفيش عنابر جديدة الدورة دي';
                let note = '';
                // تحقق من تحقيق أقرب هدف كبير من الصندوق
                while (milestoneIdx < milestones.length && (fund - safetyMin) >= milestones[milestoneIdx].capex) {
                    fund -= milestones[milestoneIdx].capex;
                    achievedMilestones.push({ round, ...milestones[milestoneIdx] });
                    note += (note ? ' + ' : '') + `تحقق: ${milestones[milestoneIdx].label}`;
                    milestoneIdx++;
                }
                const totalCapacity = houses.reduce((s, h) => s + h.capacity, 0);
                // ===== طاقة المجزر ومصنع العلف اللازمة لتغطية هذه السعة (بافتراض تدفق يومي مستمر = السعة الكلية ÷ مدة الدورة) =====
                const margin = 1 + ((inputs.capacitySafetyMarginPct != null ? inputs.capacitySafetyMarginPct : 20) / 100);
                const birdsPerDay = hist.avgCycleDays > 0 ? totalCapacity / hist.avgCycleDays : null;
                const slaughterKgPerDay = (birdsPerDay != null && hist.avgFinalWeightKg) ? birdsPerDay * hist.avgFinalWeightKg : null;
                const feedMillTonsPerDay = (birdsPerDay != null && hist.avgFeedKgPerBird) ? (birdsPerDay * hist.avgFeedKgPerBird) / 1000 : null;
                const slaughterKgPerDayRec = slaughterKgPerDay != null ? slaughterKgPerDay * margin : null;
                const feedMillTonsPerDayRec = feedMillTonsPerDay != null ? feedMillTonsPerDay * margin : null;
                timeline.push({
                    round, houseCount: houses.length, totalCapacity,
                    newHousesOpened: opened, fundAdded, fundBalance: fund, action, note,
                    birdsPerDay, slaughterKgPerDay, feedMillTonsPerDay, slaughterKgPerDayRec, feedMillTonsPerDayRec
                });
            }

            const p = (hist.successRate != null) ? hist.successRate : 0.7;
            const nextMilestone = milestones[milestoneIdx] || null;
            const roundsToNextMilestone = nextMilestone ? (timeline.findIndex(t => t.round > 0 && t.fundBalance >= (nextMilestone.capex - safetyMin)) + 1 || null) : null;

            return { hist, insufficientData: false, timeline, p, profitPerBird, milestones, achievedMilestones, nextMilestone, safetyMin, roundsToNextMilestone, species, autoCapex };
        }

        // ============ 🌐 الخطة الشاملة (تعاقب الأنواع) — فائض صندوق النوع الأساسي بيمول بداية أنواع تانية بترتيب محدد ============
        // بدل ما فائض صندوق النوع الأساسي (فوق الحد الآمن safetyMin) يروح لأهداف النوع ده نفسه (مفرخة/مصنع علف...)،
        // بيتحوّل هنا لتمويل "رأس مال بداية" لأنواع تانية موجودة فى التطبيق بترتيب ثابت:
        //   جولة 1: سمان → جولة 2: ساسو → جولة 3: ديوك بلدي → جولة 4: بط (مسكوفي/مولر) + رومي (أبيض/أسود) → جولة 5: أمهات + معمل تفريخ (للنوع الأساسي)
        // بمجرد ما نوع ياخد رأس ماله الأول، بيدخل فى كرة ثلج مستقلة بصندوق طوارئ خاص بيه (زي أي نوع تاني فى التطبيق) —
        // منطق كرة الثلج نفسه بيتحسب بإعادة استخدام computeExpansionPlan(النوع ده) من غير تكرار كود.
        // أي فائض بعد ما كل التعاقب ده يتمول بالكامل بيبقى "فائض استثماري حر" (خارج نطاق أنواع الطيور فى التطبيق).
        const MASTER_CASCADE_STEPS = [
            { id: 'quail', label: '🐦 سمان', speciesKeys: ['quail'] },
            { id: 'sasso', label: '🐔 ساسو', speciesKeys: ['sasso'] },
            { id: 'balady', label: '🐓 ديوك بلدي', speciesKeys: ['balady'] },
            { id: 'duckTurkey', label: '🦆🦃 بط (مسكوفي + مولر) ورومي (أبيض + أسود)', speciesKeys: ['muscovy', 'mulard', 'turkeyWhite', 'turkeyBlack'] },
            { id: 'breedersHatchery', label: '🥚🐣 أمهات + معمل تفريخ', speciesKeys: [] }, // خاص بالنوع الأساسي نفسه — بيغلق دائرة الإنتاج
        ];

        // تكلفة فتح أول عنبر (بالحد الأدنى للسعة) لنوع معين — رأس مال البداية اللي التعاقب بيحوّله للنوع ده
        function computeSpeciesSeedCapital(speciesKey) {
            const inputs = getExpansionInputs(speciesKey);
            const minCap = inputs.minHouseCapacity || 10000;
            const costPerBird = inputs.costPerBirdOpenHouse || 0;
            return minCap * costPerBird;
        }

        function getMasterCascadeMilestones(baseSpecies, hist) {
            const baseInputs = getExpansionInputs(baseSpecies);
            const autoCapex = computeAutoMilestoneCapex(baseInputs, hist);
            return MASTER_CASCADE_STEPS.map(step => {
                const capex = step.id === 'breedersHatchery'
                    ? (autoCapex.capexBreeders || 0) + (autoCapex.capexHatchery || 0)
                    : step.speciesKeys.reduce((s, k) => s + computeSpeciesSeedCapital(k), 0);
                return { ...step, capex };
            }).filter(x => x.capex > 0);
        }

        function computeMasterExpansionPlan(baseSpecies) {
            baseSpecies = baseSpecies || getExpansionSelectedSpecies();
            const inputs = getExpansionInputs(baseSpecies);
            const hist = getExpansionStatsWithFallback(baseSpecies, inputs);
            if (!hist || hist.avgProfitPerBird == null) return { hist, insufficientData: true, baseSpecies };

            const creditMarkup = inputs.feedCreditMarkupPerBird || 0;
            const profitPerBird = hist.avgProfitPerBird - creditMarkup;
            const minCap = inputs.minHouseCapacity || 10000;
            const baseHouseCount = inputs.targetHouseCount || 10;
            const multiplier = inputs.capacityMultiplier || 2;
            // 🛟 نفس تعريف الحد الآمن للصندوق العادي: تكلفة تسكين عنبر واحد بالكامل تاني بمتوسط أدائك الفعلي —
            // ده اللي بيتحفظ لكل عنبر قبل ما أي فائض يتحوّل للتعاقب.
            const safetyMin = inputs.safetyFundMin || 0;

            const milestones = getMasterCascadeMilestones(baseSpecies, hist);
            let milestoneIdx = 0;
            const achieved = [];

            let houses = Array.from({ length: baseHouseCount }, () => ({ capacity: minCap, cyclesCompleted: 0 }));
            let fund = 0;
            const timeline = [{ round: 0, houseCount: houses.length, totalCapacity: houses.length * minCap, fundAdded: 0, fundBalance: 0, opened: houses.length, note: `🏗️ بناء القاعدة الأفقية: ${houses.length} عنبر × ${fmt(minCap, 0)} طائر` }];

            const maxRounds = 10;
            for (let round = 1; round <= maxRounds; round++) {
                const newHouses = [];
                let fundAdded = 0, opened = 0;
                houses.forEach(h => {
                    h.cyclesCompleted++;
                    const cycleProfit = h.capacity * profitPerBird;
                    if (h.cyclesCompleted === 1) { newHouses.push({ capacity: h.capacity * multiplier, cyclesCompleted: 0 }); opened++; }
                    else fundAdded += cycleProfit;
                });
                fund += fundAdded;
                houses = houses.concat(newHouses);
                let note = opened > 0 ? `🆕 ${opened} عنبر جديد من ربح دورته الأولى` : '';
                while (milestoneIdx < milestones.length && (fund - safetyMin) >= milestones[milestoneIdx].capex) {
                    fund -= milestones[milestoneIdx].capex;
                    achieved.push({ round, ...milestones[milestoneIdx] });
                    note += (note ? ' + ' : '') + `🌐 تعاقب: ${milestones[milestoneIdx].label} اتمول برأس مال ${money(milestones[milestoneIdx].capex)}`;
                    milestoneIdx++;
                }
                const totalCapacity = houses.reduce((s, h) => s + h.capacity, 0);
                timeline.push({ round, houseCount: houses.length, totalCapacity, fundAdded, fundBalance: fund, opened, note });
            }

            const allAchieved = milestoneIdx >= milestones.length;
            // لكل نوع اتمول من التعاقب، هات خطة كرة الثلج المستقلة الخاصة بيه (نفس منطق النوع الأساسي بالظبط،
            // بإعادة استخدام computeExpansionPlan من غير أي تكرار كود) — دي بتبدأ من لحظة تمويله بصندوقه الخاص.
            const seededSubPlans = achieved.filter(a => a.speciesKeys && a.speciesKeys.length).flatMap(a =>
                a.speciesKeys.map(sk => ({ fundedAtRound: a.round, fundedCapital: computeSpeciesSeedCapital(sk), species: sk, plan: computeExpansionPlan(sk) }))
            );

            return { hist, insufficientData: false, baseSpecies, timeline, milestones, achieved, allAchieved, profitPerBird, safetyMin, seededSubPlans };
        }

        // ============ 🌐 عرض الخطة الشاملة (تعاقب الأنواع) ============
        let expansionViewMode = 'single'; // 'single' = خطة نوع واحد (الأصلية) | 'master' = التعاقب بين الأنواع
        function setExpansionViewMode(mode) { expansionViewMode = mode; render(); }

        function renderMasterExpansionPlan(baseSpecies) {
            const plan = computeMasterExpansionPlan(baseSpecies);
            const baseLabel = expansionSpeciesLabel(baseSpecies);
            if (plan.insufficientData) {
                return `<div class="section"><div class="card" style="text-align:center;padding:20px;color:var(--muted);">📊 محتاج بيانات كافية (دورة مؤرشفة واحدة على الأقل، أو "ربح متوقع للطائر" فى البيانات الاحتياطية) لنوع ${baseLabel} عشان أقدر أحسب الخطة الشاملة.</div></div>`;
            }
            const rows = plan.timeline.map(t => `<tr style="border-bottom:1px solid var(--line);">
                <td style="padding:5px;text-align:center;">${t.round}</td>
                <td style="padding:5px;text-align:center;">${fmt(t.houseCount, 0)}</td>
                <td style="padding:5px;text-align:center;">${fmt(t.totalCapacity, 0)}</td>
                <td style="padding:5px;text-align:center;">${money(t.fundBalance)}</td>
                <td style="padding:5px;font-size:10.5px;">${t.note || '—'}</td>
            </tr>`).join('');
            const achievedRows = plan.achieved.map(a => `<div class="check-row"><div class="txt">
                <div style="font-weight:800;">${a.label}</div>
                <div class="day">اتمول فى الجولة ${a.round} — رأس مال ${money(a.capex)}</div>
            </div></div>`).join('');
            const remainingRows = plan.milestones.slice(plan.achieved.length).map(mm => `<div class="check-row" style="opacity:.6;"><div class="txt">
                <div style="font-weight:800;">${mm.label}</div>
                <div class="day">محتاج ${money(mm.capex)} — لسه معملش</div>
            </div></div>`).join('');
            const subPlansHtml = plan.seededSubPlans.map(sp => {
                const lastRow = sp.plan.insufficientData ? null : sp.plan.timeline[sp.plan.timeline.length - 1];
                return `<div class="card">
                    <div style="font-weight:800;margin-bottom:4px;">${expansionSpeciesLabel(sp.species)}</div>
                    <div class="day" style="margin-bottom:6px;">اتمول برأس مال ${money(sp.fundedCapital)} فى الجولة ${sp.fundedAtRound} من صندوق ${baseLabel}</div>
                    ${lastRow ? `
                        ${statLine('عدد عنابره المستقلة الآن', fmt(lastRow.houseCount, 0))}
                        ${statLine('رصيد صندوق طوارئه الخاص', money(lastRow.fundBalance))}
                    ` : `<p style="font-size:10.5px;color:var(--muted);margin:0;">محتاج بيانات أداء (دورة مؤرشفة أو بيانات احتياطية) لهذا النوع عشان أحسب كرة ثلجه المستقلة — دخّلها من قائمة النوع فوق.</p>`}
                </div>`;
            }).join('') || `<p style="font-size:11px;color:var(--muted);">لسه مفيش نوع اتمول من التعاقب.</p>`;

            return `
            <div class="section">
                <div class="section-head"><h2>🌐 الخطة الشاملة — تعاقب الأنواع من فائض ${baseLabel}</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.7;">فائض صندوق ${baseLabel} <b>فوق الحد الآمن</b> (${money(plan.safetyMin)} — تكلفة تسكين عنبر واحد بالكامل تاني بمتوسط أدائك الفعلي) مش بيروح لأهداف ${baseLabel} نفسه — بيتحوّل بالترتيب ده: <b>سمان ← ساسو ← ديوك بلدي ← بط ورومي ← أمهات ومعمل تفريخ</b>. كل نوع بمجرد ما ياخد رأس ماله الأول، بيدخل فى كرة ثلج مستقلة بصندوق طوارئ خاص بيه (زي ${baseLabel} بالظبط). بعد ما التعاقب كله يتمول، أي فائض تاني بيبقى فائض استثماري حر خارج نطاق أنواع الطيور فى التطبيق.</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>📅 مسار صندوق ${baseLabel} الرئيسي</h2></div>
                <div class="card" style="padding:0;overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
                        <thead><tr style="background:var(--cream);"><th style="padding:6px;">جولة</th><th>عنابر</th><th>سعة</th><th>رصيد الصندوق</th><th>ملاحظة</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>✅ التعاقب — اتمول لحد دلوقتي</h2></div>
                <div class="card" style="padding:0;">${achievedRows || `<div class="empty" style="padding:14px;">لسه محدش اتمول.</div>`}</div>
                ${remainingRows ? `<div class="card" style="padding:0;margin-top:8px;">${remainingRows}</div>` : ''}
                ${plan.allAchieved ? `<p style="font-size:11px;color:var(--green);margin:8px 2px 0;">🌱 كل التعاقب اتمول بالكامل — أي فائض بعد كده بقى فائض استثماري حر.</p>` : ''}
            </div>
            <div class="section">
                <div class="section-head"><h2>🌱 حالة الأنواع المتعاقبة (كل نوع بصندوقه المستقل)</h2></div>
                <div class="card" style="display:grid;gap:10px;">${subPlansHtml}</div>
            </div>`;
        }

        // ============ محاكاة مبسّطة لتطور الصندوق تحت أي سيناريو ربح — تُستخدم فى حساب المخاطر لاختبار سيناريوهات متشائمة/كارثية ============
        function simulateExpansionFund(inputs, milestones, profitPerBird, safetyMin) {
            const minCap = inputs.minHouseCapacity || 10000;
            const baseHouseCount = inputs.targetHouseCount || 10;
            const multiplier = inputs.capacityMultiplier || 2;
            let houses = Array.from({ length: baseHouseCount }, () => ({ capacity: minCap, cyclesCompleted: 0 }));
            let fund = 0, minFundBalance = 0, milestoneIdx = 0;
            const achievedRounds = [];
            const maxRounds = 8;
            for (let round = 1; round <= maxRounds; round++) {
                const newHouses = [];
                let fundAdded = 0;
                houses.forEach(h => {
                    h.cyclesCompleted++;
                    const cycleProfit = h.capacity * profitPerBird;
                    if (h.cyclesCompleted === 1) { newHouses.push({ capacity: h.capacity * multiplier, cyclesCompleted: 0 }); }
                    else { fundAdded += cycleProfit; }
                });
                fund += fundAdded;
                houses = houses.concat(newHouses);
                minFundBalance = Math.min(minFundBalance, fund);
                while (milestoneIdx < milestones.length && (fund - safetyMin) >= milestones[milestoneIdx].capex) {
                    fund -= milestones[milestoneIdx].capex;
                    achievedRounds.push({ round, label: milestones[milestoneIdx].label });
                    milestoneIdx++;
                }
            }
            return { finalFund: fund, minFundBalance, milestonesAchievedCount: achievedRounds.length, achievedRounds, breachedSafety: minFundBalance < 0 };
        }

        // ============ مخاطر تقلب سعر العلف — اختبار ضغط: لو سعر العلف زاد X%، إزاي ده بيأثر على ربح الطائر وتوقيت الأهداف ============
        function computeFeedPriceStressRisk(plan, inputs) {
            const feedStressPct = inputs.feedPriceStressPct != null ? inputs.feedPriceStressPct : 15;
            const avgFeedCostPerBird = plan.hist.avgFeedPerBird || 0;
            const extraCostPerBird = avgFeedCostPerBird * (feedStressPct / 100);
            const stressedProfit = plan.profitPerBird - extraCostPerBird;
            const stressCase = simulateExpansionFund(inputs, plan.milestones, stressedProfit, plan.safetyMin);
            return { feedStressPct, avgFeedCostPerBird, extraCostPerBird, stressedProfit, stressCase };
        }

        // ============ 🎯 سيناريوهات حساسية — بدل اختبار ضغط واحد بس (سعر علف)، متفائل ومتشائم مع بعض
        // (تقلب سعر العلف + تقلب سعر البيع مع بعض فى نفس السيناريو، مش كل واحد لوحده) — عشان تشوف
        // المدى الواقعي لخطتك (أحسن حالة معقولة / أسوأ حالة معقولة)، مش بس متغير واحد منعزل. ============
        function computeExpansionSensitivityScenarios(plan, inputs) {
            const hist = plan.hist;
            const feedStressPct = inputs.feedPriceStressPct != null ? inputs.feedPriceStressPct : 15;
            const saleStressPct = inputs.salePriceStressPct != null ? inputs.salePriceStressPct : 10;
            const avgFeedCostPerBird = hist.avgFeedPerBird || 0;
            // إيراد الطائر التقريبي = التكلفة الفعلية الكاملة + الربح الفعلي (نفس الفكرة اللي دراسة الجدوى بتحسبها من fin.totalRevenue)
            const avgRevenuePerBird = (hist.avgTotalCostPerBird != null && hist.avgProfitPerBird != null) ? hist.avgTotalCostPerBird + hist.avgProfitPerBird : null;

            function scenario(feedMult, revMult) {
                const feedDelta = avgFeedCostPerBird * (feedMult - 1);
                const revDelta = (avgRevenuePerBird != null) ? avgRevenuePerBird * (revMult - 1) : 0;
                const profitPerBird = plan.profitPerBird - feedDelta + revDelta;
                const fundSim = simulateExpansionFund(inputs, plan.milestones, profitPerBird, plan.safetyMin);
                return { profitPerBird, fundSim };
            }

            const currentScenario = scenario(1, 1);
            const optimisticScenario = scenario(1 - feedStressPct / 100, 1 + saleStressPct / 100);
            const pessimisticScenario = scenario(1 + feedStressPct / 100, 1 - saleStressPct / 100);
            const feedOnlyScenario = scenario(1 + feedStressPct / 100, 1); // 🔙 محفوظ للتوافق مع اختبار الضغط الأصلي (سعر علف بس)

            return {
                feedStressPct, saleStressPct, avgFeedCostPerBird, avgRevenuePerBird,
                extraCostPerBird: avgFeedCostPerBird * (feedStressPct / 100),
                stressedProfit: feedOnlyScenario.profitPerBird, stressCase: feedOnlyScenario.fundSim,
                scenarios: [
                    { label: 'الوضع الحالي (بدون ضغط)', ...currentScenario },
                    { label: `متفائل (علف -${fmt(feedStressPct,0)}% / بيع +${fmt(saleStressPct,0)}%)`, ...optimisticScenario },
                    { label: `متشائم (علف +${fmt(feedStressPct,0)}% / بيع -${fmt(saleStressPct,0)}%)`, ...pessimisticScenario },
                ],
            };
        }

        // ============ 💳 امتى نعتمد على الأجل، وامتى بقى الأجل ضرر — نقطة التعادل مع التكامل الرأسي ============
        // السؤال اللي الميزة دي بتجاوبه بالظبط: "امتى نعتمد على الأجل وامتى نقدر ندير المنظومة بنفس القدرة
        // (نفس سرعة التوسع) من غيره؟". الإجابة مبنية على منطق "فترة استرداد رأس المال" (payback period) بسيط:
        // فرق سعر الأجل فى العلف (feedCreditMarkupPerBird) بتدفعه كل دورة طول ما بتشتري من السوق — ده تكلفة
        // متكررة للأبد طول ما مستمر تعتمد على السوق. المعمل/المجزر الخاص بيه رأس مال مرة واحدة (capex) بيلغي
        // (أو يقلّب) التكلفة المتكررة دي. لو "سنين استرداد رأس المال" (capex ÷ التكلفة السنوية اللي هتوفرها)
        // قليلة (≤3 سنين مثلًا)، معناه إنك بالفعل كبرت بما يكفي إن الاستمرار فى الأجل بقى أضرّ من بناء استقلالك
        // — دي "نقطة التعادل اللي بعدها الأجل ضرر". لو لسه كتير (>5 سنين)، لسه بدري والاعتماد على الأجل حاليًا
        // مقبول ومنطقي (بيدّيك سرعة توسع أعلى بتكلفة أقل من فايدة بناء المصنع/المجزر دلوقتي).
        function computeCreditDependencyAnalysis(plan, inputs) {
            if (!plan || plan.insufficientData) return null;
            const hist = plan.hist;
            const cyclesPerYear = (hist.avgCycleDays > 0) ? 365 / hist.avgCycleDays : null;
            const currentTotalCapacity = plan.timeline[0].totalCapacity; // "الحالي" = القاعدة الأفقية القائمة فعليًا الآن، مش المستهدف النهائي
            const feedMillAchieved = plan.achievedMilestones.some(m => m.id === 'feedmill');
            const slaughterhouseAchieved = plan.achievedMilestones.some(m => m.id === 'slaughterhouse');

            // 🌾 اعتماد الأجل فى شراء العلف من السوق
            const feedCreditMarkup = inputs.feedCreditMarkupPerBird || 0;
            const feedCreditAnnualCost = (cyclesPerYear != null) ? feedCreditMarkup * currentTotalCapacity * cyclesPerYear : null;
            const feedMillCapex = plan.autoCapex.capexFeedMill;
            const feedMillPaybackYears = (feedMillCapex != null && feedCreditAnnualCost > 0) ? feedMillCapex / feedCreditAnnualCost : null;

            // 🔪 بيع حي للتجار (أقل هامش) بدل بيع مجزّر (هامش أعلى عادة)
            const liveToProcessedUplift = inputs.liveToProcessedUpliftPerBird || 0;
            const slaughterhouseAnnualUplift = (cyclesPerYear != null) ? liveToProcessedUplift * currentTotalCapacity * cyclesPerYear : null;
            const slaughterhouseCapex = plan.autoCapex.capexSlaughterhouse;
            const slaughterhousePaybackYears = (slaughterhouseCapex != null && slaughterhouseAnnualUplift > 0) ? slaughterhouseCapex / slaughterhouseAnnualUplift : null;

            // ⚖️ مقارنة مباشرة بين مسار الأجل الحالي ومسار كاش بس (بديل بدون أي تمويل خارجي)
            const cashVsCredit = computeCreditVsCashExpansionComparison(inputs, hist);

            return { cyclesPerYear, currentTotalCapacity, feedMillAchieved, slaughterhouseAchieved,
                feedCreditMarkup, feedCreditAnnualCost, feedMillCapex, feedMillPaybackYears,
                liveToProcessedUplift, slaughterhouseAnnualUplift, slaughterhouseCapex, slaughterhousePaybackYears, cashVsCredit };
        }

        // ============ ⚖️ مقارنة مباشرة: مسار "بالأجل" (زي خطتك الحالية) مقابل مسار "بالكاش بس" من غير أي أجل ============
        // السؤال اللي الميزة دي بتجاوبه بالظبط: "لو قطعنا الاعتماد على الأجل النهارده، هل نقدر ندير المنظومة
        // بنفس القدرة (نفس عدد العنابر ونفس السرعة)، ولا هنبطّئ؟". الفرق بين المسارين اتنين:
        //   1) نقطة البداية: مسار الأجل بيبدأ بالقاعدة الأفقية كاملة (baseHouseCount عنبر) فورًا (ممولة بالأجل).
        //      مسار الكاش بيبدأ بعدد عنابر أقل (اللي تقدر تفتحه فعليًا من مالك الخاص من غير أي تمويل خارجي).
        //   2) ربح الطائر: مسار الأجل مخصوم منه فرق سعر الأجل فى العلف كل دورة؛ مسار الكاش ربحه كامل بدون خصم.
        // المقارنة بتوريك بعد كام دورة مسار الكاش "يلحق" نفس سعة القاعدة الأفقية اللي مسار الأجل بيبدأ بيها فورًا —
        // ده "تكلفة السرعة" الحقيقية للاستقلال عن الأجل، مقابل "تكلفة الفلوس" (فرق الأجل) اللي مسار الأجل بيدفعها.
        function computeCreditVsCashExpansionComparison(inputs, hist) {
            if (!hist || hist.avgProfitPerBird == null) return null;
            const minCap = inputs.minHouseCapacity || 10000;
            const baseHouseCount = inputs.targetHouseCount || 10;
            const multiplier = inputs.capacityMultiplier || 2;
            const houseCountCap = inputs.houseCountCap || (baseHouseCount * 3);
            const creditMarkup = inputs.feedCreditMarkupPerBird || 0;
            const cashStartHouses = inputs.cashOnlyStartHouseCount || 1;
            const maxRounds = 20; // مدى أطول من خطة التوسع العادية (8 دورات) عشان نضمن مسار الكاش هيلحق لو أصلًا هيلحق

            function simulatePath(startHouseCount, profitPerBird) {
                let houses = Array.from({ length: startHouseCount }, () => ({ capacity: minCap, cyclesCompleted: 0 }));
                const capacityByRound = [houses.reduce((s, h) => s + h.capacity, 0)];
                const houseCountByRound = [houses.length];
                for (let round = 1; round <= maxRounds; round++) {
                    const newHouses = [];
                    houses.forEach(h => {
                        h.cyclesCompleted++;
                        if (h.cyclesCompleted === 1) {
                            if (houses.length + newHouses.length < houseCountCap) newHouses.push({ capacity: h.capacity * multiplier, cyclesCompleted: 0 });
                            else h.capacity = h.capacity * multiplier;
                        }
                    });
                    houses = houses.concat(newHouses);
                    capacityByRound.push(houses.reduce((s, h) => s + h.capacity, 0));
                    houseCountByRound.push(houses.length);
                }
                return { capacityByRound, houseCountByRound };
            }

            // مسار الأجل: القاعدة الأفقية كاملة فورًا، ربح مخصوم منه فرق الأجل
            const creditPath = simulatePath(baseHouseCount, hist.avgProfitPerBird - creditMarkup);
            // مسار الكاش: عدد عنابر بداية أقل (واقعي بدون تمويل)، ربح كامل بدون خصم فرق الأجل
            const cashPath = simulatePath(cashStartHouses, hist.avgProfitPerBird);

            const creditBaseCapacity = creditPath.capacityByRound[0];
            const catchUpRoundIdx = cashPath.capacityByRound.findIndex(c => c >= creditBaseCapacity);
            const roundsBehind = catchUpRoundIdx; // -1 لو محدّش لسه لحد آخر دورة فى المدى المحسوب

            return { creditPath, cashPath, creditBaseCapacity, roundsBehind, cashStartHouses, maxRounds, creditMarkup, baseHouseCount };
        }

        // ============ مخاطر الأمراض الموسمية — تنبيه ديناميكي حسب الشهر الحالي (مناخ مصر) ============
        function getSeasonalDiseaseRisk() {
            const month = new Date().getMonth() + 1; // 1-12
            if (month >= 6 && month <= 9) {
                return {
                    season: '☀️ صيف حار', level: 'مرتفعة',
                    risks: [
                        'إجهاد حراري بيرفع النفوق فجأة خصوصًا فى العنابر المفتوحة عالية الكثافة — راقب التهوية والتبريد وقت الذروة (2–5 عصرًا).',
                        'انخفاض استهلاك العلف بسبب الحرارة بيبطّئ معدل النمو ويطوّل الدورة.',
                        'تلوث مياه الشرب بيزيد فى الحر — تابع جودة المياه ونظافة النبل يوميًا.',
                    ]
                };
            } else if (month === 10 || month === 11 || month === 3 || month === 4) {
                return {
                    season: '🍂 فترة انتقالية (خريف/ربيع)', level: 'متوسطة',
                    risks: [
                        'تقلب درجة الحرارة بين الليل والنهار بيزود مخاطر الأمراض التنفسية والكوكسيديا.',
                        'الرطوبة المتغيرة بتأثر على جودة الفرشة — فرشة مبللة تعني كوكسيديا ونفوق أعلى.',
                        'وقت التحول بين برنامج التهوية الصيفي والشتوي يحتاج ضبط دقيق، أي تأخير بيسبب إجهاد للقطيع.',
                    ]
                };
            } else {
                return {
                    season: '❄️ شتاء بارد', level: 'متوسطة إلى مرتفعة',
                    risks: [
                        'أمراض تنفسية (نيوكاسل/IB) أكتر شيوعًا فى البرد — تأكد من برنامج التحصينات مظبوط بالتقويم.',
                        'تهوية ضعيفة (خوفًا من البرد) بتزوّد تركيز الأمونيا وده بيأثر على الجهاز التنفسي والأداء.',
                        'فرق الحرارة بين النهار والليل بيحتاج تحكم دقيق فى الدفايات والستائر.',
                    ]
                };
            }
        }

        // ============ حساب المخاطر الشامل لخطة التوسع: تشغيلية (نفوق/ربحية متذبذبة) + سيولة (صندوق) + سداد آجل + تركّز نوع واحد ============
        function computeExpansionRiskAnalysis(plan, inputs) {
            if (!plan || plan.insufficientData) return null;
            const hist = plan.hist;
            const sd = hist.sdProfitPerBird || 0;
            const milestones = plan.milestones;
            const safetyMin = plan.safetyMin;

            // ----- 1) مخاطر تشغيلية: احتمالية فشل الدورة + أسوأ سيناريو ربح للطائر (تقريب إحصائي بمستوى ثقة ~95%) -----
            const failureRate = 1 - plan.p;
            const worstCaseBirdProfit5pct = plan.profitPerBird - 1.65 * sd; // احتمال 5% إن الربح الفعلي أسوأ من كده
            const worstCaseHouseLoss = worstCaseBirdProfit5pct < 0 ? worstCaseBirdProfit5pct * (inputs.minHouseCapacity || 10000) : 0;

            // ----- 2) مخاطر السيولة: محاكاة الصندوق بربح متشائم (-1σ) وكارثي (-2σ) بدل المتوسط -----
            const baseCase = simulateExpansionFund(inputs, milestones, plan.profitPerBird, safetyMin);
            const pessimisticCase = simulateExpansionFund(inputs, milestones, plan.profitPerBird - sd, safetyMin);
            const severeCase = simulateExpansionFund(inputs, milestones, plan.profitPerBird - 2 * sd, safetyMin);

            // ----- 3) مخاطر السداد الآجل (شراء/بيع) على مستوى المزرعة كلها -----
            const today0 = todayStr();
            let overduePayable = 0, overdueReceivable = 0, totalPayable = 0, totalReceivable = 0;
            (state.batches || []).forEach(bt => {
                (bt.purchases || []).forEach(p => { if (p.paid === false) { totalPayable += p.total; if (p.dueDate && p.dueDate < today0) overduePayable += p.total; } });
                (bt.sales || []).forEach(s => { if (s.paid === false) { totalReceivable += s.total; if (s.dueDate && s.dueDate < today0) overdueReceivable += s.total; } });
            });

            // ----- 4) مخاطر تركّز النوع الواحد: هل عندك خطط توسع فعلية (رأس مال مُدخَل لأي هدف كبير) لأنواع تانية غير النوع المختار حاليًا؟ -----
            migrateExpansionInputsIfNeeded();
            const allSpeciesInputs = state.expansionInputsBySpecies || {};
            const speciesWithActivePlan = Object.keys(allSpeciesInputs).filter(sp => {
                const i = { ...DEFAULT_EXPANSION_INPUTS, ...allSpeciesInputs[sp] };
                return (i.capexHatcheryPerThousandChicks > 0 || i.capexFeedMillPerTonDay > 0 || i.henCost > 0 || i.capexSlaughterhousePerTonDay > 0);
            });
            const otherSpeciesPlanned = speciesWithActivePlan.filter(sp => sp !== plan.species).length;
            const verticalPlanned = milestones.length;

            // ----- 5) مخاطر السعة (ملخص) -----
            const lastRound = plan.timeline[plan.timeline.length - 1];
            const capacityRisk = {
                slaughterUncovered: !!(inputs.plannedSlaughterKgPerDay && lastRound.slaughterKgPerDayRec != null && lastRound.slaughterKgPerDayRec > inputs.plannedSlaughterKgPerDay),
                feedMillUncovered: !!(inputs.plannedFeedMillTonsPerDay && lastRound.feedMillTonsPerDayRec != null && lastRound.feedMillTonsPerDayRec > inputs.plannedFeedMillTonsPerDay),
            };

            // ----- 6) مخاطر تقلب سعر العلف/سعر البيع (مُعمَّق ومدموج مع تحليل الحساسية بدراسة الجدوى) -----
            const priceRisk = computeExpansionSensitivityScenarios(plan, inputs);
            const combinedPessimistic = priceRisk.scenarios[2]; // "متشائم" (علف+ / بيع-) — أشد سيناريو واقعي مزدوج

            // ----- 7) مخاطر الأمراض الموسمية -----
            const seasonalRisk = getSeasonalDiseaseRisk();

            // ----- 8) 💳 الاعتماد على الأجل ونقطة التعادل (امتى الاستمرار فيه بقى أضرّ من الاستقلال عنه) -----
            const creditDependency = computeCreditDependencyAnalysis(plan, inputs);

            // ----- تقييم عام: نحسب عدد عوامل الخطر "المرتفعة" -----
            let riskFlags = 0;
            if (failureRate > 0.35) riskFlags++;
            if (worstCaseHouseLoss < 0) riskFlags++;
            if (severeCase.breachedSafety) riskFlags++;
            if (overduePayable > 0 || overdueReceivable > 0) riskFlags++;
            if (verticalPlanned > 0 && otherSpeciesPlanned === 0) riskFlags++; // كل خطتك حاليًا فى نوع واحد بس، من غير تنويع لنوع تاني
            if (capacityRisk.slaughterUncovered || capacityRisk.feedMillUncovered) riskFlags++;
            if (priceRisk.stressCase.breachedSafety || combinedPessimistic.fundSim.breachedSafety) riskFlags++;
            if (seasonalRisk.level.includes('مرتفعة')) riskFlags++;
            if (!creditDependency.feedMillAchieved && creditDependency.feedMillPaybackYears != null && creditDependency.feedMillPaybackYears <= 3) riskFlags++; // وصلت لنقطة التعادل ولسه معتمد على الأجل
            const overallLevel = riskFlags >= 5 ? 'مرتفعة' : riskFlags >= 3 ? 'متوسطة' : 'منخفضة';

            return {
                failureRate, sd, worstCaseBirdProfit5pct, worstCaseHouseLoss,
                baseCase, pessimisticCase, severeCase,
                overduePayable, overdueReceivable, totalPayable, totalReceivable,
                otherSpeciesPlanned, verticalPlanned,
                capacityRisk, priceRisk, seasonalRisk, creditDependency, riskFlags, overallLevel,
            };
        }

        function renderExpansionTab(b) {
            const species = getExpansionSelectedSpecies();
            const inputs = getExpansionInputs(species);
            const plan = computeExpansionPlan(species);
            const hist = plan.hist;
            const bp = computeBreederFlockPlan(inputs);

            let html = `
            <div class="section">
                <div class="section-head"><h2>🚀 خطة التوسع (كرة الثلج)</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.6;">كل عنبر فى أول دورة تسكين له، ربحها بالكامل بيفتح عنبر جديد ضعف سعته مباشرة. من الدورة التانية للعنبر فأكتر، ربحه بيروح لصندوق تنمية وطوارئ مشترك لكل عنابر النوع ده. لما الصندوق يكفي هدف كبير (مفرخة/مصنع علف/أمهات/مجزر)، بينفّذه وتتكرر الكرة بسيولة أكبر. <b>كل نوع طائر عنده هنا نفس الخطة كاملة بالظبط — اختر النوع تحت وهيتحسبلك تلقائيًا</b>.</p>
                    <div class="field">
                        <label>🐣 النوع المطلوب التخطيط له</label>
                        <select id="exp_speciesSelect" onchange="setExpansionSpecies(this.value)">
                            ${EXPANSION_SPECIES_LIST.map(s => `<option value="${s.key}" ${species === s.key ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
                        </select>
                    </div>
                    <p style="font-size:10.5px;color:var(--muted);margin:0;">💾 كل الأرقام تحت (سعة العنبر/رأس المال/الأمهات/العلف...) بتتحفظ لكل نوع لوحده — تقدر تنقّل بين الأنواع من غير ما تفقد بيانات أي نوع تاني.</p>
                    <div style="display:flex;gap:8px;border-top:1px solid var(--line);padding-top:8px;">
                        <button class="btn ${expansionViewMode === 'single' ? 'gold' : 'ghost'} sm" style="flex:1;" onclick="setExpansionViewMode('single')">📋 خطة ${expansionSpeciesLabel(species)} لوحدها</button>
                        <button class="btn ${expansionViewMode === 'master' ? 'gold' : 'ghost'} sm" style="flex:1;" onclick="setExpansionViewMode('master')">🌐 الخطة الشاملة (تعاقب الأنواع)</button>
                    </div>
                </div>
            </div>`;
            if (expansionViewMode === 'master') { html += renderMasterExpansionPlan(species); return html; }
            html += `
            ${renderExpansionIncidentWarnings(species)}
            <div class="section">
                <div class="section-head"><h2>📋 الأساسيات — ${expansionSpeciesLabel(species)}</h2></div>
                <div class="card" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div class="field"><label>الحد الأدنى لسعة العنبر (طائر)</label><input type="number" id="exp_minHouseCapacity" value="${inputs.minHouseCapacity ?? 10000}"></div>
                    <div class="field"><label>عدد عنابر القاعدة الأفقية</label><input type="number" id="exp_targetHouseCount" value="${inputs.targetHouseCount ?? 10}"></div>
                    <div class="field"><label>الفارق بين تسكين وتسكين (يوم)</label><input type="number" id="exp_stockingIntervalDays" value="${inputs.stockingIntervalDays ?? 3}"></div>
                    <div class="field"><label>معامل مضاعفة سعة العنبر الجديد</label><input type="number" step="0.1" id="exp_capacityMultiplier" value="${inputs.capacityMultiplier ?? 2}"></div>
                    <div class="field"><label>تكلفة فتح عنبر جديد للفرخة الواحدة (جنيه)</label><input type="number" step="0.01" id="exp_costPerBirdOpenHouse" value="${inputs.costPerBirdOpenHouse ?? ''}" placeholder="مقدم إيجار + تجهيزات ÷ السعة"></div>
                    <div class="field">
                        <label>فرق سعر الأجل للفرخة الواحدة (جنيه)</label>
                        <input type="number" step="0.01" id="exp_feedCreditMarkupPerBird" value="${inputs.feedCreditMarkupPerBird ?? ''}" placeholder="فرق سعر العلف بالأجل عن الكاش">
                        ${hist && hist.avgFeedKgPerBird != null ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">💡 افتراض شائع: 1000ج/طن فرق أجل × استهلاكك الفعلي (${fmt(hist.avgFeedKgPerBird,2)} كجم علف/طائر) ≈ ${fmt(hist.avgFeedKgPerBird,2)} جنيه/طائر</div>` : ''}
                    </div>
                    <div class="field"><label>الحد الأدنى الآمن لرصيد الصندوق (جنيه)</label><input type="number" id="exp_safetyFundMin" value="${inputs.safetyFundMin ?? ''}"></div>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🎯 الأهداف الكبرى (تكامل رأسي) — ${expansionSpeciesLabel(species)}</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.7;">💡 مش رأس مال تقديري بعد كده — دخّل "تكلفة الوحدة" (سعر سوق حقيقي معروف عندك للوحدة) والتطبيق بيضربها تلقائيًا فى السعة/الاحتياج المستهدف الفعلي (محسوب من عدد عنابرك المستهدف × أداؤك التاريخي الحقيقي فى هذا النوع). قطيع الأمهات بيتحسب من حاسبة الأمهات تحت من غير أي مُدخل إضافي هنا.</p>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div class="field"><label>🐣 تكلفة معمل تفريخ / 1000 كتكوت سعة سنوية</label><input type="number" id="exp_capexHatcheryPerThousandChicks" value="${inputs.capexHatcheryPerThousandChicks ?? ''}"></div>
                        <div class="field"><label>🏭 تكلفة مصنع علف / طن سعة يومية</label><input type="number" id="exp_capexFeedMillPerTonDay" value="${inputs.capexFeedMillPerTonDay ?? ''}"></div>
                        <div class="field"><label>🔪 تكلفة مجزر / طن سعة يومية</label><input type="number" id="exp_capexSlaughterhousePerTonDay" value="${inputs.capexSlaughterhousePerTonDay ?? ''}"></div>
                        <div class="field"><label>🥚 قطيع أمهات — بيتحسب تلقائيًا من "سعر شراء الأم" فى حاسبة الأمهات تحت</label><input type="text" value="${plan.autoCapex && plan.autoCapex.capexBreeders != null ? money(plan.autoCapex.capexBreeders) : '—'}" disabled style="background:var(--cream);color:var(--muted);"></div>
                    </div>
                    ${plan.autoCapex ? `<div style="display:grid;gap:4px;border-top:1px solid var(--line);padding-top:8px;">
                        ${statLine('🐣 معمل تفريخ — رأس المال المطلوب (محسوب)', plan.autoCapex.capexHatchery != null ? money(plan.autoCapex.capexHatchery) : '—')}
                        ${statLine('🏭 مصنع علف — رأس المال المطلوب (محسوب)', plan.autoCapex.capexFeedMill != null ? money(plan.autoCapex.capexFeedMill) : '—')}
                        ${statLine('🔪 مجزر خاص — رأس المال المطلوب (محسوب)', plan.autoCapex.capexSlaughterhouse != null ? money(plan.autoCapex.capexSlaughterhouse) : '—')}
                        ${statLine('🥚 قطيع أمهات — رأس المال المطلوب (محسوب)', plan.autoCapex.capexBreeders != null ? money(plan.autoCapex.capexBreeders) : '—')}
                    </div>` : ''}
                    <button class="btn gold block" onclick="saveExpansionInputs()">💾 احفظ واحسب الخطة</button>
                </div>
            </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>📊 حاسبات ${expansionSpeciesLabel(species)}: مرحلة العلف + الأمهات + المصنع + المجزر</h2></div>
                <div class="card" style="display:grid;gap:14px;">
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.6;">كل حاسبات النوع المختار مجمّعة هنا فى قسم واحد قابل للطي — منفصل تمامًا عن برنامج إضافات العلف (اللي فاضل زي ما هو فى تبويب "الإنتاج").</p>

                    <div style="border-top:1px solid var(--line);padding-top:12px;">
                        <label style="font-weight:800;display:block;margin-bottom:8px;">🌾 مرحلة العلف الافتراضية لهذا النوع (بادئ / نامي / ناهي)</label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div class="field"><label>إجمالي علف بادئ لكل طائر (كجم)</label><input type="number" step="0.05" id="exp_feedStageStarterKg" value="${inputs.feedStageStarterKg ?? ''}"></div>
                            <div class="field"><label>إجمالي علف نامي لكل طائر (كجم)</label><input type="number" step="0.05" id="exp_feedStageGrowerKg" value="${inputs.feedStageGrowerKg ?? ''}"></div>
                        </div>
                        <p style="font-size:10.5px;color:var(--muted);margin:6px 2px 0;">💡 مرحلة "ناهي" = باقي الدورة تلقائيًا. دي قيم مرجعية للتخطيط الخاصة بهذا النوع، بتغذّي تقدير إجمالي العلف/الطائر فى حاسبات السعة تحت لو لسه معندكش دورة مؤرشفة من هذا النوع.</p>
                    </div>

                    <div style="border-top:1px solid var(--line);padding-top:12px;">
                        <label style="font-weight:800;display:block;margin-bottom:8px;">🔄 برنامج التحويل بين الأعلاف</label>
                        <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.7;">
                            إدارة جدول التحويل التدريجي بين نوعين علف (بادئ→نامي، نامي→ناهي، أو أي علف لآخر) اتنقلت لتبويب "🌾 الإنتاج" ← قسم "العلف" مباشرة، جنب باقي إعدادات برنامج العلف. من هناك تقدر تضيف/تعدّل جدول التحويل الخاص بالدفعة النشطة.
                        </p>
                    </div>

                    <div style="border-top:1px solid var(--line);padding-top:12px;">
                        <label style="font-weight:800;display:block;margin-bottom:8px;">📥 بيانات أداء احتياطية (لو لسه معندكش دورة مؤرشفة من هذا النوع)</label>
                        <p style="font-size:10.5px;color:var(--muted);margin:0 0 8px;line-height:1.6;">لو عندك دورة مؤرشفة واحدة على الأقل من هذا النوع، التطبيق بيتجاهل الأرقام دي تلقائيًا ويحسب من أدائك الفعلي. لو النوع جديد عليك تمامًا، دخّل تقديراتك هنا عشان تقدر تشوف خطة توسع وحاسبات كاملة من الأول.</p>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div class="field"><label>ربح متوقع للطائر (جنيه)</label><input type="number" step="0.01" id="exp_manualAvgProfitPerBird" value="${inputs.manualAvgProfitPerBird ?? ''}"></div>
                            <div class="field"><label>تذبذب الربح المتوقع ± (جنيه)</label><input type="number" step="0.01" id="exp_manualSdProfitPerBird" value="${inputs.manualSdProfitPerBird ?? ''}"></div>
                            <div class="field"><label>مدة الدورة المتوقعة (يوم)</label><input type="number" id="exp_manualAvgCycleDays" value="${inputs.manualAvgCycleDays ?? ''}"></div>
                            <div class="field"><label>إجمالي علف متوقع/طائر (كجم)</label><input type="number" step="0.05" id="exp_manualAvgFeedKgPerBird" value="${inputs.manualAvgFeedKgPerBird ?? ''}" placeholder="لو فاضي، بيتحسب من بادئ+نامي فوق"></div>
                            <div class="field"><label>وزن التسويق المتوقع (كجم)</label><input type="number" step="0.05" id="exp_manualAvgFinalWeightKg" value="${inputs.manualAvgFinalWeightKg ?? ''}"></div>
                            <div class="field"><label>نسبة نجاح الدورة المتوقعة %</label><input type="number" step="1" id="exp_manualSuccessRatePct" value="${inputs.manualSuccessRatePct ?? ''}"></div>
                        </div>
                    </div>

                    <div style="grid-column:1/-1;"><button class="btn gold block" onclick="saveExpansionInputs()">💾 احفظ لهذا النوع</button></div>

                    <div style="border-top:1px solid var(--line);padding-top:12px;">
                        <label style="font-weight:800;display:block;margin-bottom:8px;">🥚 حاسبة قطيع الأمهات</label>
                        <p style="font-size:11px;color:var(--muted);margin:0 0 8px;line-height:1.6;">احسب عدد الأمهات اللى يقدر يغطي احتياجك السنوي من الصغار، وقارن تكلفة إنتاج الكتكوت/الصغير داخليًا بسعر شرائه دلوقتي. 💡 بيض/خصوبة/فقس اتملوا برقم مرجعي تقريبي شائع لـ${expansionSpeciesLabel(species)} (${getBreederFlockDefaults(species).henEggsPerYear} بيضة، خصوبة ${getBreederFlockDefaults(species).fertilityPct}%، فقس ${getBreederFlockDefaults(species).hatchPct}%) — عدّلها برقم مورّدك الفعلي وقت ما يتوفر.</p>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div class="field"><label>عدد الدورات سنويًا لكل عنبر</label><input type="number" step="0.1" id="exp_cyclesPerYearPerHouse" value="${inputs.cyclesPerYearPerHouse ?? 6}"></div>
                            <div class="field"><label>بيض الأم الواحدة سنويًا</label><input type="number" id="exp_henEggsPerYear" value="${inputs.henEggsPerYear ?? getBreederFlockDefaults(species).henEggsPerYear}"></div>
                            <div class="field"><label>نسبة الخصوبة %</label><input type="number" step="0.1" id="exp_fertilityPct" value="${inputs.fertilityPct ?? getBreederFlockDefaults(species).fertilityPct}"></div>
                            <div class="field"><label>نسبة الفقس من المخصب %</label><input type="number" step="0.1" id="exp_hatchPct" value="${inputs.hatchPct ?? getBreederFlockDefaults(species).hatchPct}"></div>
                            <div class="field"><label>سعر الكتكوت/الصغير الحالي (شراء) جنيه</label><input type="number" step="0.01" id="exp_currentChickPrice" value="${inputs.currentChickPrice ?? ''}"></div>
                            <div class="field"><label>تكلفة تربية الأم سنويًا (علف+رعاية) جنيه</label><input type="number" step="0.01" id="exp_henAnnualFeedCost" value="${inputs.henAnnualFeedCost ?? ''}"></div>
                            <div class="field"><label>سعر شراء الأم (بيولة) جنيه</label><input type="number" step="0.01" id="exp_henCost" value="${inputs.henCost ?? ''}"></div>
                        </div>
                        <button class="btn gold block" style="margin-top:10px;" onclick="saveExpansionInputs()">💾 احفظ واحسب</button>
                        <div style="display:grid;gap:8px;border-top:1px solid var(--line);padding-top:10px;margin-top:10px;">
                            ${statLine(`احتياجك السنوي من الصغار (${bp.houseCount} عنبر × ${fmt(bp.minCap,0)} × ${fmt(bp.cyclesPerYear,1)} دورة)`, `${fmt(bp.annualChicksNeeded, 0)}`, {vStyle:`font-weight:900;`})}
                            ${statLine(`إنتاج الأم الواحدة سنويًا`, `${fmt(bp.chicksPerHenYear, 1)}`)}
                            ${statLine(`عدد الأمهات المطلوب لتغطية إنتاجك بالكامل`, `${bp.hensNeeded != null ? fmt(bp.hensNeeded, 0) + ' أم' : '—'}`, {vStyle:`font-weight:900;color:var(--gold-dark, var(--barn-dark));`})}
                            ${bp.costPerChickOwn != null ? `${statLine(`تكلفة الكتكوت/الصغير لو أنتجته بنفسك`, `${money(bp.costPerChickOwn)}`, {vStyle:`font-weight:900;`})}` : ''}
                            ${bp.breakeven != null ? `${statLine(`الفرق لصالحك عن سعر الشراء الحالي`, `${money(bp.breakeven)} / رأس`, {vStyle:`font-weight:900;color:${bp.breakeven >= 0 ? 'var(--green)' : 'var(--red)'};`})}` : ''}
                            ${bp.breakeven != null ? `<p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">${bp.breakeven > 0 ? '✅ التربية الداخلية أرخص من الشراء دلوقتي — المشروع مجزي.' : '⏳ الشراء لسه أرخص من التربية الداخلية — راقب السعر، وقت ما يعدي تكلفتك يبقى وقت تنفيذ المشروع.'}</p>` : ''}
                        </div>
                    </div>

                    <div style="border-top:1px solid var(--line);padding-top:12px;">
                        <label style="font-weight:800;display:block;margin-bottom:8px;">🏭🔪 طاقة المجزر ومصنع العلف اللازمة</label>
                        <p style="font-size:11px;color:var(--muted);margin:0 0 8px;line-height:1.6;">الطاقة اللازمة بتتحسب من السعة الكلية المتنامية لهذا النوع ÷ متوسط مدة دورته — يعني معدل التدفق اليومي المستمر من الصغار اللى المجزر والمصنع الخاصين بالنوع ده لازم يقدروا يستوعبوه بثبات. "الطاقة الموصى بها" مضاف عليها هامش أمان.</p>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div class="field"><label>هامش أمان الطاقة %</label><input type="number" step="1" id="exp_capacitySafetyMarginPct" value="${inputs.capacitySafetyMarginPct ?? 20}"></div>
                            <div class="field"><label>الطاقة المخططة للمجزر (كجم لحم حي/يوم)</label><input type="number" id="exp_plannedSlaughterKgPerDay" value="${inputs.plannedSlaughterKgPerDay ?? ''}"></div>
                            <div class="field"><label>الطاقة المخططة لمصنع العلف (طن/يوم)</label><input type="number" step="0.1" id="exp_plannedFeedMillTonsPerDay" value="${inputs.plannedFeedMillTonsPerDay ?? ''}"></div>
                        </div>
                        <button class="btn gold block" style="margin-top:10px;" onclick="saveExpansionInputs()">💾 احفظ واحسب</button>
                        ${plan.insufficientData ? `<p style="font-size:11px;color:var(--muted);margin:10px 0 0;text-align:center;">📊 دخّل ربح متوقع للطائر (وباقي البيانات الاحتياطية فوق)، أو أرشف أول دورة من "${expansionSpeciesLabel(species)}" عشان أقدر أحسبلك جدول السعة والمجزر والمصنع.</p>` : `
                        <div style="overflow-x:auto;margin-top:10px;">
                            <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
                                <thead><tr style="border-bottom:2px solid var(--line);">
                                    <th style="padding:6px;text-align:right;">الدورة</th><th style="padding:6px;">السعة الكلية</th><th style="padding:6px;">تدفق/يوم</th><th style="padding:6px;">مجزر لازم (كجم/يوم)</th><th style="padding:6px;">مجزر موصى به</th><th style="padding:6px;">علف لازم (طن/يوم)</th><th style="padding:6px;">علف موصى به</th>
                                </tr></thead>
                                <tbody>
                                    ${plan.timeline.map(t => `<tr style="border-bottom:1px solid var(--line);">
                                        <td style="padding:6px;text-align:center;">${t.round}</td>
                                        <td style="padding:6px;text-align:center;">${fmt(t.totalCapacity, 0)}</td>
                                        <td style="padding:6px;text-align:center;">${t.birdsPerDay != null ? fmt(t.birdsPerDay, 0) : '—'}</td>
                                        <td style="padding:6px;text-align:center;">${t.slaughterKgPerDay != null ? fmt(t.slaughterKgPerDay, 0) : '—'}</td>
                                        <td style="padding:6px;text-align:center;${inputs.plannedSlaughterKgPerDay && t.slaughterKgPerDayRec != null && t.slaughterKgPerDayRec > inputs.plannedSlaughterKgPerDay ? 'color:var(--red);font-weight:900;' : ''}">${t.slaughterKgPerDayRec != null ? fmt(t.slaughterKgPerDayRec, 0) : '—'}</td>
                                        <td style="padding:6px;text-align:center;">${t.feedMillTonsPerDay != null ? fmt(t.feedMillTonsPerDay, 1) : '—'}</td>
                                        <td style="padding:6px;text-align:center;${inputs.plannedFeedMillTonsPerDay && t.feedMillTonsPerDayRec != null && t.feedMillTonsPerDayRec > inputs.plannedFeedMillTonsPerDay ? 'color:var(--red);font-weight:900;' : ''}">${t.feedMillTonsPerDayRec != null ? fmt(t.feedMillTonsPerDayRec, 1) : '—'}</td>
                                    </tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                        ${(() => {
                            const last = plan.timeline[plan.timeline.length - 1];
                            const msgs = [];
                            if (inputs.plannedSlaughterKgPerDay && last.slaughterKgPerDayRec != null) {
                                msgs.push(last.slaughterKgPerDayRec > inputs.plannedSlaughterKgPerDay
                                    ? `⚠️ عند الدورة ${last.round} احتياجك للمجزر (${fmt(last.slaughterKgPerDayRec,0)} كجم/يوم شامل هامش الأمان) هيتخطى طاقتك المخططة (${fmt(inputs.plannedSlaughterKgPerDay,0)}) — فكّر تكبّر السعة من الأول أو تجهّز لمرحلة توسعة تانية للمجزر.`
                                    : `✅ طاقة المجزر المخططة كافية (شاملة هامش الأمان) لحد الدورة ${last.round}.`);
                            }
                            if (inputs.plannedFeedMillTonsPerDay && last.feedMillTonsPerDayRec != null) {
                                msgs.push(last.feedMillTonsPerDayRec > inputs.plannedFeedMillTonsPerDay
                                    ? `⚠️ عند الدورة ${last.round} احتياجك لمصنع العلف (${fmt(last.feedMillTonsPerDayRec,1)} طن/يوم شامل هامش الأمان) هيتخطى طاقتك المخططة (${fmt(inputs.plannedFeedMillTonsPerDay,1)}) — ابنِ المصنع بطاقة أكبر من الاحتياج الحالي عشان يستحمل نموك.`
                                    : `✅ طاقة مصنع العلف المخططة كافية (شاملة هامش الأمان) لحد الدورة ${last.round}.`);
                            }
                            if (!msgs.length) msgs.push('💡 دخّل الطاقة المخططة للمجزر والمصنع فوق عشان أقولك هيغطوا نموك المتوقع ولا لأ، وامتى تحتاج تكبّرهم.');
                            return msgs.map(m => `<div class="day">${m}</div>`).join('');
                        })()}
                        `}
                    </div>
                </div>
            </div>`;

            if (plan.insufficientData) {
                html += `<div class="section"><div class="card" style="text-align:center;padding:20px;color:var(--muted);">📊 محتاج إما دورة واحدة على الأقل مؤرشفة من "${expansionSpeciesLabel(species)}" (مكتملة ومباعة)، أو "ربح متوقع للطائر" فى قسم البيانات الاحتياطية فوق، عشان أقدر أحسب خطة التوسع الكاملة.</div></div>`;
                return html;
            }

            html += `
            <div class="section">
                <div class="section-head"><h2>📈 أداء ${expansionSpeciesLabel(species)}${hist.n ? ` (من ${hist.n} دورة مؤرشفة)` : ' (بيانات مدخلة يدويًا)'}</h2></div>
                <div class="card" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${hist.isFallback ? `<p style="grid-column:1/-1;font-size:10.5px;color:var(--muted);margin:0 0 4px;">💡 بعض الأرقام تحت من بياناتك الاحتياطية اليدوية لحد ما يتوفر أداء فعلي مؤرشف كفاية.</p>` : ''}
                    ${statLine(`متوسط الربح للطائر`, `${money(hist.avgProfitPerBird)}`, {vStyle:`font-weight:900;color:${hist.avgProfitPerBird >= 0 ? 'var(--green)' : 'var(--red)'};`})}
                    ${statLine(`نسبة الدورات الرابحة`, `${hist.successRate != null ? fmt(hist.successRate * 100, 0) + '%' : '—'}`, {vStyle:`font-weight:900;`})}
                    ${statLine(`متوسط تحويل العلف (FCR)`, `${hist.avgFcr != null ? fmt(hist.avgFcr, 2) : '—'}`)}
                    ${statLine(`متوسط نسبة النفوق`, `${hist.avgMortality != null ? fmt(hist.avgMortality, 1) + '%' : '—'}`)}
                    ${statLine(`متوسط مدة الدورة`, `${hist.avgCycleDays != null ? fmt(hist.avgCycleDays, 0) + ' يوم' : '—'}`)}
                    ${statLine(`تذبذب الربح بين الدورات`, `${hist.sdProfitPerBird != null ? '±' + money(hist.sdProfitPerBird) : '—'}`)}
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🎯 احتمالية النجاح</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    ${statLine(`معدل نجاح الدورة الواحدة`, `${fmt(plan.p * 100, 0)}%`, {vStyle:`font-weight:900;`})}
                    ${statLine(`ربح الطائر بعد خصم فرق سعر الأجل`, `${money(plan.profitPerBird)}`, {vStyle:`font-weight:900;color:${plan.profitPerBird >= 0 ? 'var(--green)' : 'var(--red)'};`})}
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">⚠️ نجاح الخطة على المدى الطويل بيعتمد على استمرار معدل النجاح ده لكل دورة جديدة من كل عنبر. أي دورة سيئة بتتحمّلها الصندوق (طالما فوق الحد الأدنى الآمن) بدل ما توقف التوسع كله.</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🗓️ الجدول الزمني المتوقع</h2></div>
                <div class="card" style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
                        <thead><tr style="border-bottom:2px solid var(--line);">
                            <th style="padding:6px;text-align:right;">الدورة</th><th style="padding:6px;">عدد العنابر</th><th style="padding:6px;">السعة الكلية</th><th style="padding:6px;">دخل الصندوق</th><th style="padding:6px;">رصيد الصندوق</th><th style="padding:6px;text-align:right;">الحدث</th>
                        </tr></thead>
                        <tbody>
                            ${plan.timeline.map(t => `<tr style="border-bottom:1px solid var(--line);">
                                <td style="padding:6px;">${t.round}</td>
                                <td style="padding:6px;text-align:center;">${t.houseCount}</td>
                                <td style="padding:6px;text-align:center;">${fmt(t.totalCapacity, 0)}</td>
                                <td style="padding:6px;text-align:center;color:${t.fundAdded >= 0 ? 'var(--green)' : 'var(--red)'};">${money(t.fundAdded)}</td>
                                <td style="padding:6px;text-align:center;">${money(t.fundBalance)}</td>
                                <td style="padding:6px;">${t.action}${t.note ? `<div style="font-size:9.5px;color:var(--gold-dark, var(--barn-dark));font-weight:700;">${t.note}</div>` : ''}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    ${!plan.milestones.length ? '<p style="font-size:10.5px;color:var(--muted);margin:8px 0 0;">💡 دخّل رأس مال تقديري لأي هدف كبير (معمل تفريخ/مصنع علف/أمهات/مجزر) فوق عشان يظهر توقيت تحقيقه هنا.</p>' : ''}
                </div>
            </div>`;

            // ============ قسم حساب المخاطر ============
            const risk = computeExpansionRiskAnalysis(plan, inputs);
            if (risk) {
                const levelColor = risk.overallLevel === 'مرتفعة' ? 'var(--red)' : risk.overallLevel === 'متوسطة' ? 'var(--gold-dark, var(--barn-dark))' : 'var(--green)';
                html += `
            <div class="section">
                <div class="section-head"><h2>⚠️ حساب المخاطر</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    ${statLine(`التقييم العام لمخاطر الخطة`, `${risk.overallLevel} (${risk.riskFlags} من 8 عوامل خطر نشطة)`, {vStyle:`font-weight:900;color:${levelColor};`})}
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🎲 مخاطر تشغيلية (نفوق/ربحية متذبذبة)</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    ${statLine(`احتمالية فشل الدورة الواحدة`, `${fmt(risk.failureRate * 100, 0)}%`, {vStyle:`font-weight:900;color:${risk.failureRate > 0.35 ? 'var(--red)' : 'var(--muted)'};`})}
                    ${statLine(`تذبذب الربح بين الدورات (σ)`, `±${money(risk.sd)}`)}
                    ${statLine(`أسوأ ربح متوقع للطائر (احتمال 5%)`, `${money(risk.worstCaseBirdProfit5pct)}`, {vStyle:`font-weight:900;color:${risk.worstCaseBirdProfit5pct < 0 ? 'var(--red)' : 'var(--green)'};`})}
                    ${risk.worstCaseHouseLoss < 0 ? `${statLine(`أقصى خسارة متوقعة لعنبر واحد فى دورة سيئة`, `${money(risk.worstCaseHouseLoss)}`, {vStyle:`font-weight:900;color:var(--red);`})}` : ''}
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">ده معناه: فى المتوسط ${fmt(risk.failureRate*100,0)}% من الدورات بتكون خاسرة تاريخيًا عندك، وفى أسوأ 1 من كل 20 دورة ممكن الطائر يخسّرك بدل ما يربّحك — الصندوق المشترك هو اللى بيحمي العنابر التانية من دورة زي دي.</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>💧 مخاطر السيولة (سيناريوهات الصندوق)</h2></div>
                <div class="card" style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
                        <thead><tr style="border-bottom:2px solid var(--line);">
                            <th style="padding:6px;text-align:right;">السيناريو</th><th style="padding:6px;">أدنى رصيد للصندوق</th><th style="padding:6px;">رصيد الصندوق النهائي</th><th style="padding:6px;">أهداف تحققت</th>
                        </tr></thead>
                        <tbody>
                            <tr style="border-bottom:1px solid var(--line);"><td style="padding:6px;">🟢 الأساسي (متوسط أدائك)</td><td style="padding:6px;text-align:center;">${money(risk.baseCase.minFundBalance)}</td><td style="padding:6px;text-align:center;">${money(risk.baseCase.finalFund)}</td><td style="padding:6px;text-align:center;">${risk.baseCase.milestonesAchievedCount} من ${plan.milestones.length}</td></tr>
                            <tr style="border-bottom:1px solid var(--line);"><td style="padding:6px;">🟡 متشائم (-1σ فى الربح)</td><td style="padding:6px;text-align:center;color:${risk.pessimisticCase.breachedSafety?'var(--red)':'inherit'};">${money(risk.pessimisticCase.minFundBalance)}</td><td style="padding:6px;text-align:center;">${money(risk.pessimisticCase.finalFund)}</td><td style="padding:6px;text-align:center;">${risk.pessimisticCase.milestonesAchievedCount} من ${plan.milestones.length}</td></tr>
                            <tr style="border-bottom:1px solid var(--line);"><td style="padding:6px;">🔴 كارثي (-2σ فى الربح)</td><td style="padding:6px;text-align:center;color:${risk.severeCase.breachedSafety?'var(--red)':'inherit'};font-weight:${risk.severeCase.breachedSafety?900:400};">${money(risk.severeCase.minFundBalance)}</td><td style="padding:6px;text-align:center;">${money(risk.severeCase.finalFund)}</td><td style="padding:6px;text-align:center;">${risk.severeCase.milestonesAchievedCount} من ${plan.milestones.length}</td></tr>
                        </tbody>
                    </table>
                    ${risk.severeCase.breachedSafety ? `<div class="day" style="margin-top:8px;">🔴 فى السيناريو الكارثي الصندوق بيكسر الحد الأدنى الآمن — يعني لو حصل تدهور حقيقي فى الأداء (مرض منتشر مثلًا)، محتاج تجهّز مصدر تمويل احتياطي تاني غير أرباح الدورة، أو تأجّل فتح عنابر جديدة مؤقتًا.</div>` : `<div class="day" style="margin-top:8px;">✅ حتى فى السيناريو الكارثي (-2σ)، الصندوق مبيكسرش الحد الأدنى الآمن — الخطة عندها هامش أمان معقول لتحمّل تراجع فى الأداء.</div>`}
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>💳 مخاطر السداد الآجل</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    ${statLine(`إجمالي مستحق للموردين (كل المزرعة)`, `${money(risk.totalPayable)}`, {vStyle:`font-weight:900;${risk.overduePayable>0?'color:var(--red);':''}`})}
                    ${risk.overduePayable > 0 ? `${statLine(`منه متأخر السداد`, `${money(risk.overduePayable)}`, {vStyle:`font-weight:900;color:var(--red);`})}` : ''}
                    ${statLine(`إجمالي مستحق من العملاء (كل المزرعة)`, `${money(risk.totalReceivable)}`, {vStyle:`font-weight:900;${risk.overdueReceivable>0?'color:var(--gold-dark, var(--barn-dark));':''}`})}
                    ${risk.overdueReceivable > 0 ? `${statLine(`منه متأخر التحصيل`, `${money(risk.overdueReceivable)}`, {vStyle:`font-weight:900;color:var(--gold-dark, var(--barn-dark));`})}` : ''}
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">${(risk.overduePayable>0||risk.overdueReceivable>0) ? '⚠️ متأخرات السداد أو التحصيل بتأثر على قدرتك تفتح العنبر الجديد فى موعده حتى لو الربح الدفتري موجود فى الخطة.' : '✅ لا يوجد متأخرات سداد أو تحصيل حاليًا — التدفق النقدي منتظم.'}</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🎯 مخاطر تركّز النوع الواحد</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    ${statLine(`أهداف تكامل رأسي فى خطة ${expansionSpeciesLabel(species)}`, `${risk.verticalPlanned}`)}
                    ${statLine(`عدد الأنواع التانية اللي عندها خطة توسع فعلية`, `${risk.otherSpeciesPlanned}`)}
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">${risk.verticalPlanned > 0 && risk.otherSpeciesPlanned === 0 ? `⚠️ كل خطتك حاليًا فى ${expansionSpeciesLabel(species)} بس، من غير خطة فعلية لنوع تاني — لو حصلت أزمة سعرية أو مرضية خاصة بالنوع ده هتأثر على كل استثماراتك مع بعض. جرّب تدخل أرقام لنوع تاني من القائمة فوق للتنويع.` : (risk.otherSpeciesPlanned > 0 ? '✅ عندك خطط فعلية لأكتر من نوع، وده بيقلل اعتمادك الكامل على نوع واحد.' : '💡 دخّل رأس مال تقديري لأي هدف كبير عشان يظهر هنا تحليل التركّز.')}</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>📈 مخاطر تقلب سعر العلف</h2></div>
                <div class="card" style="display:grid;gap:10px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div class="field"><label>نسبة اختبار الضغط لسعر العلف %</label><input type="number" step="1" id="exp_feedPriceStressPct" value="${inputs.feedPriceStressPct ?? 15}"></div>
                        <div class="field full" style="grid-column:1/-1;"><button class="btn gold block" onclick="saveExpansionInputs()">💾 احفظ واحسب</button></div>
                    </div>
                    ${statLine(`تكلفة العلف الحالية للطائر`, `${money(risk.priceRisk.avgFeedCostPerBird)}`)}
                    ${statLine(`تكلفة إضافية للطائر لو العلف زاد ${fmt(risk.priceRisk.feedStressPct,0)}%`, `+${money(risk.priceRisk.extraCostPerBird)}`, {vStyle:`font-weight:900;color:var(--red);`})}
                    ${statLine(`ربح الطائر بعد الزيادة (علف بس)`, `${money(risk.priceRisk.stressedProfit)}`, {vStyle:`font-weight:900;color:${risk.priceRisk.stressedProfit >= 0 ? 'var(--green)' : 'var(--red)'};`})}
                    ${statLine(`أدنى رصيد للصندوق تحت ضغط سعر العلف بس`, `${money(risk.priceRisk.stressCase.minFundBalance)}`, {vStyle:`font-weight:900;color:${risk.priceRisk.stressCase.breachedSafety ? 'var(--red)' : 'inherit'};`})}
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">${risk.priceRisk.stressCase.breachedSafety ? '⚠️ لو سعر العلف ارتفع ' + fmt(risk.priceRisk.feedStressPct,0) + '% بس، الصندوق بيكسر الحد الأدنى الآمن.' : '✅ الخطة قادرة تمتص زيادة ' + fmt(risk.priceRisk.feedStressPct,0) + '% فى سعر العلف لوحده من غير ما الصندوق يكسر الحد الأدنى الآمن.'}</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>📊 تحليل الحساسية المُعمَّق (مدموج مع دراسة الجدوى) — سيناريوهات علف + بيع معًا</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.7;">نفس منطق وتسمية سيناريوهات "الوضع الحالي / متفائل / متشائم" الموجودة فى دراسة الجدوى لدفعتك الحالية، لكن مطبّقة هنا على مسار الصندوق وتوقيت الأهداف الكبرى بالكامل عبر خطة التوسع — مش بس ربح دورة واحدة.</p>
                    <div class="field"><label>نسبة اختبار ضغط سعر البيع %</label><input type="number" id="exp_salePriceStressPct" value="${inputs.salePriceStressPct ?? 10}" onchange="saveExpansionInputs()"></div>
                    <div class="scroll-x">
                        <table><thead><tr><th>السيناريو</th><th>ربح الطائر</th><th>أدنى رصيد صندوق</th><th>الحالة</th></tr></thead>
                        <tbody>${risk.priceRisk.scenarios.map(s => `
                            <tr><td>${s.label}</td>
                            <td style="color:${s.profitPerBird>=0?'var(--green)':'var(--red)'};font-weight:800;">${money(s.profitPerBird)}</td>
                            <td>${money(s.fundSim.minFundBalance)}</td>
                            <td>${s.fundSim.breachedSafety ? '⚠️ يكسر الحد الآمن' : '✅ آمن'}</td></tr>`).join('')}
                        </tbody></table>
                    </div>
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">${risk.priceRisk.scenarios[2].fundSim.breachedSafety ? '⚠️ فى السيناريو المتشائم المزدوج (علف أعلى + بيع أقل معًا)، صندوق التوسع بيكسر الحد الأدنى الآمن فعليًا — ده أشد اختبار واقعي من اختبار العلف لوحده فوق، لازم تاخده فى الاعتبار قبل أي التزام برأس مال هدف كبير قريب.' : '✅ حتى فى السيناريو المتشائم المزدوج، الصندوق بيفضل فوق الحد الأدنى الآمن.'}</p>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>💳 الاعتماد على الأجل — امتى بيبقى ضرر بدل ميزة؟</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    <p style="font-size:11px;color:var(--muted);margin:0;line-height:1.7;">فرق سعر الأجل فى العلف بتدفعه كل دورة للأبد طول ما مستمر تشتري من السوق. مصنع العلف/المجزر الخاص بيه رأس مال مرة واحدة بيلغي التكلفة المتكررة دي — "سنين الاسترداد" تحت بتقولك امتى الاستثمار ده يستاهل قبل ما تفضل تدفع فرق الأجل للأبد.</p>
                    <div class="field"><label>فرق سعر الأجل للفرخة الواحدة (جنيه)</label><input type="number" step="0.01" id="exp_feedCreditMarkupPerBird" value="${inputs.feedCreditMarkupPerBird ?? ''}" placeholder="فرق سعر العلف بالأجل عن الكاش" onchange="saveExpansionInputs()"></div>
                    <div class="field"><label>فرق سعر البيع مجزّر مقابل حي للفرخة (جنيه)</label><input type="number" step="0.01" id="exp_liveToProcessedUpliftPerBird" value="${inputs.liveToProcessedUpliftPerBird ?? ''}" placeholder="الهامش الإضافي لو بعت مجزّر بدل حي" onchange="saveExpansionInputs()"></div>
                    ${risk.creditDependency.feedCreditAnnualCost != null ? `
                    ${statLine(`تكلفة الأجل السنوية الحالية (على سعتك الحالية)`, `${money(risk.creditDependency.feedCreditAnnualCost)}`, {vStyle:`font-weight:900;color:var(--red);`})}
                    ${risk.creditDependency.feedMillCapex != null ? statLine(`رأس مال مصنع العلف المطلوب`, `${money(risk.creditDependency.feedMillCapex)}`) : ''}
                    ${risk.creditDependency.feedMillPaybackYears != null ? statLine(`سنين استرداد رأس المال (مصنع العلف)`, `${fmt(risk.creditDependency.feedMillPaybackYears,1)} سنة`, {vStyle:`font-weight:900;color:${risk.creditDependency.feedMillPaybackYears<=3?'var(--red)':'var(--green)'};`}) : ''}
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">${risk.creditDependency.feedMillAchieved ? '✅ عندك مصنع علف خاص بالفعل — الاعتماد على الأجل فى شراء العلف من السوق مش مطروح.' : (risk.creditDependency.feedMillPaybackYears != null && risk.creditDependency.feedMillPaybackYears <= 3 ? '⚠️ وصلت لنقطة التعادل — الاستمرار فى الأجل بقى أضرّ من بناء مصنع علف خاص (استرداد سريع نسبيًا).' : '✅ لسه بدري — الاعتماد على الأجل حاليًا أوفر من بناء مصنع علف خاص.')}</p>` : ''}
                    ${risk.creditDependency.slaughterhousePaybackYears != null ? `
                    ${statLine(`سنين استرداد رأس المال (مجزر خاص)`, `${fmt(risk.creditDependency.slaughterhousePaybackYears,1)} سنة`, {vStyle:`font-weight:900;color:${risk.creditDependency.slaughterhousePaybackYears<=3?'var(--red)':'var(--green)'};`})}` : ''}
                    ${risk.creditDependency.cashVsCredit ? `
                    <div style="margin-top:6px;padding-top:8px;border-top:1px dashed var(--line);">
                        <div style="font-weight:800;font-size:12px;margin-bottom:4px;">⚖️ مسار الكاش بس مقابل مسار الأجل الحالي</div>
                        ${risk.creditDependency.cashVsCredit.roundsBehind >= 0
                            ? statLine(`مسار الكاش بيلحق نفس سعتك الأفقية الحالية بعد`, `${risk.creditDependency.cashVsCredit.roundsBehind} دورة`, {vStyle:`font-weight:900;`})
                            : `<p style="font-size:11px;color:var(--muted);margin:4px 0;">مسار الكاش (بدون أي أجل) محتاج أكتر من ${risk.creditDependency.cashVsCredit.maxRounds} دورة عشان يلحق نفس سعتك الحالية — الاعتماد على الأجل حاليًا بيوفّر سرعة توسع مش هتلحقها بالكاش وحده فى مدى معقول.</p>`}
                    </div>` : ''}
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>🌡️ مخاطر الأمراض الموسمية (${risk.seasonalRisk.season})</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    ${statLine(`مستوى الخطورة الموسمية الحالية`, `${risk.seasonalRisk.level}`, {vStyle:`font-weight:900;color:${risk.seasonalRisk.level.includes('مرتفعة') ? 'var(--red)' : 'var(--gold-dark, var(--barn-dark))'};`})}
                    ${risk.seasonalRisk.risks.map(r => `<div class="day">⚠️ ${r}</div>`).join('')}
                    <p style="font-size:10.5px;color:var(--muted);margin:0;line-height:1.6;">التوسع الأفقي بيزوّد عدد العنابر المعرضة لنفس المخاطر الموسمية فى وقت واحد — كل عنبر جديد لازم يكون معاه نفس مستوى الاستعداد (تهوية/تبريد/تدفئة) قبل التسكين، مش بعده.</p>
                </div>
            </div>`;
            }
            html += `
            <div class="section">
                <div class="section-head"><h2>✅ عوامل النجاح ركّز عليها</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    ${hist.fcrCorr != null ? `<div class="day">🌾 معدل تحويل العلف (FCR) عندك ${hist.fcrCorr < -0.3 ? 'مرتبط بقوة بربحيتك — كل ما قلّ زادت الأرباح فعليًا فى بياناتك' : 'مؤثر لكن مش العامل الحاسم الوحيد فى بياناتك'} — حافظ عليه قريب من ${fmt(hist.avgFcr, 2)} أو أقل.</div>` : ''}
                    ${hist.mortCorr != null ? `<div class="day">💀 نسبة النفوق ${hist.mortCorr < -0.3 ? 'بتأثر بشكل واضح على أرباحك — أي ارتفاع فيها بياكل هامش الربح بسرعة' : 'لها تأثير، خليها تحت المتوسط التاريخي'} (${fmt(hist.avgMortality, 1)}%).</div>` : ''}
                    <div class="day">⏱️ الحفاظ على الفارق بين التسكينات (${inputs.stockingIntervalDays || 3} أيام) بيضمن بيع/تدفق نقدي شبه مستمر بدل ما كل الفلوس تتحبس لحد نهاية الدورة.</div>
                    <div class="day">💰 عدم لمس صندوق الطوارئ تحت الحد الأدنى (${money(plan.safetyMin)}) حتى لو فيه هدف كبير قريب — هو اللي بيحمي كل العنابر من دورة خسارة واحدة.</div>
                </div>
            </div>
            <div class="section">
                <div class="section-head"><h2>⚠️ إيه ممكن يأخّر الخطة وإزاي تتفاداه</h2></div>
                <div class="card" style="display:grid;gap:8px;">
                    <div class="day">🌡️ إجهاد حراري / كوليباسيلوز — بيرفع النفوق فجأة ويحوّل دورة رابحة لخاسرة، وبيأخر فتح العنبر التالي فى نسله. تابع تنبيهات لوحة التحكم أول بأول.</div>
                    <div class="day">📈 تقلب سعر العلف أو فرق سعر الأجل — لو زاد فرق السعر عن اللي دخلته هنا، الربح الفعلي هيقل عن المتوقع فى الجدول. حدّثه دوريًا.</div>
                    <div class="day">⏳ تأخر تحصيل مستحقات البيع أو تأخر سداد الأجل — بيأثر على قدرتك تفتح العنبر التالي فى موعده حتى لو الربح الدفتري موجود. راجع "المخزن والمعاملات" للمتأخرات.</div>
                    <div class="day">🏚️ لو حصلت دورة خسارة فى أي عنبر: غطّيها من الصندوق بدل ما توقف عنبر قائم، وأجّل فتح النسل التالي من العنبر ده لحد ما يرجع لمعدله الطبيعي.</div>
                    <div class="day">🏗️ الأهداف الكبرى (تكامل رأسي) اتساب فى الجدول بترتيب الأرخص فالأغلى تلقائيًا — لو عايز أولوية مختلفة، زوّد رأس مال الهدف اللي عايزه الأول فوق واقلل التاني مؤقتًا.</div>
                </div>
            </div>`;
            return html;
        }


        // ============ (إعادة هيكلة) كارت المخزون فى الداشبورد ============
        // بدل ما يكون "المخزون" تبويب فرعي جوه الإدارة والتخطيط، بقى كارت واحد فى الداشبورد نفسه:
        // دائرة توضح رصيد/استهلاك صنف واحد (افتراضيًا العلف) مع زرار يبدّل الصنف الظاهر، وزرارين
        // شراء/بيع فوق الكارت، ومستطيل صغير للمستحقات، وقسم مطوي تحت فيه حركة المخزن الكاملة
        // ومقارنة الموردين والمشترين. الصرف بقى بيتسجل تلقائيًا من السجل اليومي (تنفيذ إضافات/تحصينات/
        // علاجات) مش من زرار "صرف" يدوي منفصل — فالأزرار هنا اتبسطت لـ"تعديل" (تصحيح/تلف/جرد) و"حذف" بس.

        // دائرة (donut) بصرية: نسبة "الباقي" مقابل "المستهلك" لصنف واحد
        function stockLevelRingHtml(usedQty, availQty, unit, size) {
            size = size || 108;
            const r = (size / 2) - 12;
            const c = 2 * Math.PI * r;
            const total = usedQty + availQty;
            const availPct = total > 0 ? Math.max(0, Math.min(100, (availQty / total) * 100)) : 100;
            const color = availPct <= 15 ? '#d64545' : (availPct <= 40 ? '#e0921f' : '#27ae60');
            const cx = size / 2, cy = size / 2;
            return `
            <div class="dash-inv-ring" style="position:relative;width:${size}px;height:${size}px;flex-shrink:0;">
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="11"/>
                    ${total > 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"
                        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - availPct / 100)}" transform="rotate(-90 ${cx} ${cy})"/>` : ''}
                </svg>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
                    <b style="font-size:15px;color:${color};line-height:1.1;">${fmt(availQty,1)}</b>
                    <span style="font-size:10px;color:var(--muted);">${esc(unit)}</span>
                </div>
            </div>`;
        }

        // الصنف المختار حاليًا لعرضه فى دائرة الداشبورد (افتراضيًا العلف) — مجرد اختيار عرض، لا يُخزَّن ولا يمس أي بيانات
        let dashInvItemId = null;
        function setDashInvItem(itemId) { dashInvItemId = itemId; dashInvActionsOpen = false; render(); }
        // الضغط على الدائرة التفاعلية بيفتح/يقفل زرارى "تعديل/حذف" للصنف الظاهر فيها حاليًا (بدل صفحة منفصلة)
        let dashInvActionsOpen = false;
        function toggleDashInvActions() { dashInvActionsOpen = !dashInvActionsOpen; render(); }
        // تجاهل اقتراح إعادة الشراء لصنف مُعيّن لباقي الجلسة الحالية (مش قرار نهائي، مجرد إخفاء بصري وقتي)
        let dashInvDismissedSuggestions = {};
        function dismissReorderSuggestion(itemId) { dashInvDismissedSuggestions[itemId] = true; render(); }

        // تجميع بيانات المخزون/المشتريات/المبيعات المطلوبة لكارت الداشبورد ولوحة التفاصيل المطوية تحته
        function computeInventoryDashboardData(b, fin, m) {
            m = m || computeMetrics(b);
            fin = fin || computeFinance(b, m);
            const feedForecast = computeFeedForecast(b, m);
            const today0 = todayStr();
            const payables = { total: 0, overdue: 0, feed: 0, other: 0 };
            b.purchases.filter(p => p.paid === false).forEach(p => {
                payables.total += p.total;
                if (p.dueDate && p.dueDate < today0) payables.overdue += p.total;
                if (p.type === 'علف') payables.feed += p.total; else payables.other += p.total;
            });
            const receivables = { total: 0, overdue: 0 };
            b.sales.filter(s => s.paid === false).forEach(s => { receivables.total += s.total; if (s.dueDate && s.dueDate < today0) receivables.overdue += s.total; });
            const items = [...b.inventory].sort((a,c)=>a.category.localeCompare(c.category));
            const lastUnitPrice = {};
            [...b.purchases].filter(p => p.stocked && p.stockQty > 0).sort((a,c)=>a.date.localeCompare(c.date))
                .forEach(p => { lastUnitPrice[p.stockItemName] = p.total / p.stockQty; });
            const cutoff = new Date(new Date(todayStr()).getTime() - 14 * 86400000).toISOString().slice(0,10);
            const dailyOut = {};
            const outDaysCount = {};
            b.stockMovements.filter(mv => mv.type === 'out' && mv.date >= cutoff).forEach(mv => {
                dailyOut[mv.itemName] = (dailyOut[mv.itemName] || 0) + mv.qty;
                if (!outDaysCount[mv.itemName]) outDaysCount[mv.itemName] = new Set();
                outDaysCount[mv.itemName].add(mv.date);
            });
            let totalInvValue = 0;
            const totalOutByItem = {};
            b.stockMovements.filter(mv => mv.type === 'out').forEach(mv => { totalOutByItem[mv.itemName] = (totalOutByItem[mv.itemName] || 0) + mv.qty; });
            const REORDER_TARGET_DAYS = 10;
            const MIN_REGULAR_DAYS = 3;
            const reorderSuggestions = [];
            const itemStats = items.map(it => {
                const unitPrice = lastUnitPrice[it.name] || 0;
                const value = it.balance > 0 ? it.balance * unitPrice : 0;
                totalInvValue += value;
                let suggestion = null;
                const distinctOutDays = (outDaysCount[it.name] && outDaysCount[it.name].size) || 0;
                const isRegularUse = distinctOutDays >= MIN_REGULAR_DAYS;
                const avgDaily = isRegularUse ? (dailyOut[it.name] || 0) / 14 : 0;
                const isFeedItem = it.category === 'علف' && feedForecast.feedItem && feedForecast.feedItem.id === it.id;
                let daysLeft = avgDaily > 0 ? it.balance / avgDaily : null;
                let forecastNote = '';
                if (isFeedItem && feedForecast.stockOutInDays != null) { daysLeft = feedForecast.stockOutInDays; forecastNote = ' (توقع علمي متصاعد)'; }
                if (isFeedItem) {
                    const targetRow = feedForecast.rows.find(r => r.day === m.todayAge + REORDER_TARGET_DAYS) || feedForecast.rows[feedForecast.rows.length - 1];
                    const neededForTargetKg = targetRow ? targetRow.cumFeedKg : 0;
                    const balanceKg = feedForecast.currentBalanceKg != null ? feedForecast.currentBalanceKg : it.balance;
                    const suggestedQtyKg = Math.max(neededForTargetKg - balanceKg, 0);
                    const suggestedQty = convertUnitQty(suggestedQtyKg, 'كجم', it.unit);
                    if (suggestedQty != null && suggestedQty > 0 && (daysLeft == null || daysLeft <= 7)) suggestion = { name: it.name, unit: it.unit, qty: suggestedQty, cost: unitPrice > 0 ? suggestedQty * unitPrice : null, daysLeft };
                } else if (isRegularUse && avgDaily > 0 && daysLeft <= 7) {
                    const suggestedQty = Math.max((avgDaily * REORDER_TARGET_DAYS) - it.balance, 0);
                    if (suggestedQty > 0) suggestion = { name: it.name, unit: it.unit, qty: suggestedQty, cost: unitPrice > 0 ? suggestedQty * unitPrice : null, daysLeft };
                } else if (!isRegularUse && it.balance <= 0 && (dailyOut[it.name] || totalOutByItem[it.name])) {
                    const lastDoseQty = dailyOut[it.name] || (totalOutByItem[it.name] / Math.max(distinctOutDays, 1));
                    if (lastDoseQty > 0) suggestion = { name: it.name, unit: it.unit, qty: lastDoseQty, cost: unitPrice > 0 ? lastDoseQty * unitPrice : null, daysLeft: null, irregular: true };
                }
                if (suggestion) reorderSuggestions.push(suggestion);
                const usedQty = totalOutByItem[it.name] || 0;
                return { it, unitPrice, value, usedQty, daysLeft, forecastNote, isFeedItem, suggestion };
            });
            const supplierMap = {};
            b.purchases.filter(p => p.supplier).forEach(p => {
                if (!supplierMap[p.supplier]) supplierMap[p.supplier] = { count: 0, total: 0, lastDate: '', lastItem: '', lastPrice: 0, prices: [] };
                const s = supplierMap[p.supplier];
                s.count++; s.total += p.total; s.prices.push(p.price);
                if (p.date >= s.lastDate) { s.lastDate = p.date; s.lastItem = p.desc || p.type; s.lastPrice = p.price; }
            });
            const buyerMap = {};
            b.sales.filter(s => s.buyer).forEach(s => {
                if (!buyerMap[s.buyer]) buyerMap[s.buyer] = { count: 0, total: 0, weight: 0, lastDate: '', prices: [] };
                const bm = buyerMap[s.buyer];
                bm.count++; bm.total += s.total;
                if (s.kind !== 'litter') { bm.weight += (s.weight || 0); if (s.price) bm.prices.push(s.price); }
                if (s.date >= bm.lastDate) bm.lastDate = s.date;
            });
            return { items, itemStats, totalInvValue, payables, receivables, reorderSuggestions, REORDER_TARGET_DAYS, supplierMap, buyerMap, feedForecast };
        }

        // كارت المخزون الرئيسي فى الداشبورد — مبسّط: دائرة تفاعلية + سويتشر صنف + شراء/بيع + مستحقات
        // مفيش صفحة منفصلة تحت؛ الضغط على الدائرة نفسها بيفتح تعديل/حذف للصنف الظاهر فيها
        function renderInventoryDashboardCard(b, fin, m) {
            m = m || computeMetrics(b);
            fin = fin || computeFinance(b, m);
            const data = computeInventoryDashboardData(b, fin, m);
            const { items, itemStats, payables, receivables } = data;
            if (!items.length) {
                return `
                <div class="section" style="margin-top:0;"><div class="section-head"><h2>📦 المخزون</h2></div>
                    <div class="card empty" style="text-align:center;">
                        <div class="ico">📦</div>
                        <p style="margin:6px 0 10px;font-size:13px;">المخزن فارغ حتى الآن — سجّل أول عملية شراء ليبدأ التتبع.</p>
                        <div class="row-actions"><button class="btn gold" style="flex:1;" onclick="openPurchaseModal()">🛒 شراء</button><button class="btn danger" style="flex:1;" onclick="openSaleModal()">💰 بيع</button></div>
                    </div>
                </div>`;
            }
            // اختيار الصنف الظاهر فى الدائرة: افتراضيًا العلف، أو آخر صنف تم اختياره طالما لسه موجود
            let chosen = itemStats.find(x => x.it.id === dashInvItemId);
            if (!chosen) chosen = itemStats.find(x => x.isFeedItem) || itemStats.find(x => x.it.category === 'علف') || itemStats[0];
            const ringHtml = stockLevelRingHtml(chosen.usedQty, Math.max(chosen.it.balance, 0), chosen.it.unit, 108);
            const itemPickerOptions = itemStats.map(x => `<option value="${x.it.id}" ${x.it.id === chosen.it.id ? 'selected' : ''}>${esc(x.it.name)} (${x.it.category})</option>`).join('');

            // بدل نص "أوشك على النفاذ" الثابت: زرارين فعليين "إعادة شراء" أو "تجاهل" لو الصنف الحالي محتاج طلب
            let stockActionHtml = '';
            const sug = chosen.suggestion;
            const dismissed = !!dashInvDismissedSuggestions[chosen.it.id];
            if (chosen.it.balance <= 0 && !sug) {
                stockActionHtml = '<span class="pill exp">نفد المخزون</span>';
            } else if (sug && !dismissed) {
                const urgencyLabel = chosen.it.balance <= 0 ? 'نفد المخزون' : (chosen.daysLeft != null ? `أوشك على النفاذ (~${fmt(chosen.daysLeft,0)} يوم${chosen.forecastNote})` : 'محتاج إعادة طلب');
                stockActionHtml = `
                    <div style="margin-top:2px;"><span class="pill exp">${urgencyLabel}</span></div>
                    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
                        <button class="btn gold sm owner-only" style="flex:1;" onclick="quickReorderPurchase('${sug.name.replace(/'/g,"\\'")}', ${sug.qty}, '${sug.unit}')">🛒 إعادة شراء (${fmt(sug.qty,1)} ${sug.unit})</button>
                        <button class="btn ghost sm" onclick="dismissReorderSuggestion('${chosen.it.id}')">🙈 تجاهل</button>
                    </div>`;
            } else if (chosen.daysLeft != null && chosen.daysLeft <= 7) {
                stockActionHtml = `<span class="pill info">يكفي ~${fmt(chosen.daysLeft,0)} يوم${chosen.forecastNote}</span>`;
            }

            // زرارا تعديل/حذف للصنف الظاهر حاليًا — بيظهروا لما يدوس المستخدم على الدائرة نفسها
            const actionsRowHtml = dashInvActionsOpen ? `
                <div class="row-actions" style="margin-top:10px;">
                    <button class="btn ghost" style="flex:1;" onclick="quickStock('${chosen.it.id}','adjust')" title="تعديل/تصحيح رصيد الصنف (تلف، جرد، خطأ إدخال)">✏️ تعديل الرصيد</button>
                    <button class="btn ghost owner-only" style="flex:1;color:var(--red);" onclick="deleteInventoryItem('${chosen.it.id}')" title="⚠️ حذف الصنف نهائيًا من المخزن مع كل حركاته">🗑️ حذف الصنف</button>
                </div>` : '';

            return `
            <div class="section" style="margin-top:0;"><div class="section-head"><h2>📦 المخزون</h2><span class="tag">💰 القيمة التقديرية: ${money(data.totalInvValue)}</span></div>
                <div class="card dash-inv-card">
                    <div class="row-actions" style="margin-bottom:10px;">
                        <button class="btn gold" style="flex:1;" onclick="openPurchaseModal()">🛒 شراء</button>
                        <button class="btn danger" style="flex:1;" onclick="openSaleModal()">💰 بيع</button>
                    </div>
                    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                        <div onclick="toggleDashInvActions()" title="اضغط لتعديل أو حذف هذا الصنف" style="cursor:pointer;">${ringHtml}</div>
                        <div style="flex:1;min-width:130px;">
                            <select onchange="setDashInvItem(this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-weight:700;margin-bottom:6px;">${itemPickerOptions}</select>
                            <div style="font-size:11.5px;color:var(--muted);">مستهلك: ${fmt(chosen.usedQty,1)} ${chosen.it.unit}</div>
                            <div style="margin-top:2px;">${stockActionHtml}</div>
                        </div>
                    </div>
                    ${actionsRowHtml}
                    <p style="font-size:10px;color:var(--muted);margin:8px 2px 0;">💡 اضغط على الدائرة لتعديل أو حذف الصنف الظاهر فيها. الصرف بيتسجل تلقائيًا من تنفيذ برامج العلف/الماء/التحصينات/العلاجات فى السجل اليومي.</p>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;background:linear-gradient(135deg,#2d4a5a,#1e323a);color:#fff;border-radius:10px;padding:10px 12px;">
                        <div><div style="opacity:.85;font-size:10.5px;">💳 مستحق للموردين</div><div style="font-weight:900;font-size:15px;color:${payables.total>0?'#ffb4b4':'#fff'};">${money(payables.total)}</div></div>
                        <div><div style="opacity:.85;font-size:10.5px;">💵 مستحق من العملاء</div><div style="font-weight:900;font-size:15px;color:${receivables.total>0?'#ffe08a':'#fff'};">${money(receivables.total)}</div></div>
                    </div>
                    <div class="row-actions" style="margin-top:10px;">
                        <button class="btn ghost sm" style="flex:1;" onclick="mergeDuplicateInvItems()">🔗 دمج الأصناف المكررة</button>
                        <button class="btn ghost sm no-print" style="flex:1;" onclick="printInventoryReport()">🖨️ طباعة كشف الجرد</button>
                    </div>
                </div>
            </div>`;
        }

        // حذف صنف من المخزن نهائيًا (يختلف عن "حذف/تسوية" التي تُصفّر الرصيد فقط وتُبقي الصنف موجودًا).
        // هذا الإجراء يحذف الصنف وكل حركاته من السجل نهائيًا، ويحذّر لو الصنف مرتبط بإضافة علف/ماء نشطة
        // حتى لا تُفاجأ لاحقًا بتعذر الخصم التلقائي عند تنفيذ تلك الإضافة لعدم وجود صنف مطابق بالمخزن.
        function deleteInventoryItem(itemId) {
            if (!requirePermission('owner')) return; // 🔒 Red Team fix
            const b = getActiveBatch();
            if (!b) return;
            const it = b.inventory.find(i => i.id === itemId);
            if (!it) return;
            const linkedFeed = (b.feedAdditives || []).filter(a => normalizeArabicName(a.name) === normalizeArabicName(it.name));
            const linkedWater = (b.waterAdditives || []).filter(a => normalizeArabicName(a.name) === normalizeArabicName(it.name));
            const linkedNames = [...linkedFeed.map(a => `🌾 ${a.name}`), ...linkedWater.map(a => `💧 ${a.name}`)];
            let warning = `سيتم حذف صنف "${it.name}" نهائيًا من المخزن مع كل حركاته المسجّلة (${fmt(it.balance,1)} ${it.unit} رصيد حالي). هذا الإجراء نهائي ولا يمكن التراجع عنه.`;
            if (linkedNames.length) {
                warning += `\n\n⚠️ تنبيه: هذا الصنف مرتبط ببرنامج الإضافات التالي: ${linkedNames.join('، ')}. بعد الحذف لن يتم الخصم التلقائي من المخزن عند تنفيذ هذه الإضافة مستقبلاً إلا إذا أعدت إضافة الصنف بنفس الاسم.`;
            }
            showConfirm(warning, () => {
                logAudit(b, `🗑️ حذف صنف مخزون نهائيًا: ${it.name} (${fmt(it.balance,1)} ${it.unit})`);
                b.inventory = b.inventory.filter(i => i.id !== itemId);
                b.stockMovements = (b.stockMovements || []).filter(mv => mv.itemId !== itemId);
                persist();
                render();
                showToast(`🗑️ تم حذف صنف "${it.name}" نهائيًا من المخزن`);
            }, 'تأكيد حذف الصنف نهائيًا');
        }

        // دمج أصناف المخزن المكررة (اللي اتسجلت بنفس الاسم لكن بتصنيف مختلف، فانفصل رصيدها)
        function mergeDuplicateInvItems() {
            const b = getActiveBatch();
            if (!b) return;
            const groups = {};
            b.inventory.forEach(it => {
                const key = normalizeArabicName(it.name) + '|' + it.category;
                if (!groups[key]) groups[key] = [];
                groups[key].push(it);
            });
            const dupGroups = Object.values(groups).filter(g => g.length > 1);
            if (!dupGroups.length) { showToast('لا توجد أصناف مكررة بنفس الاسم'); return; }
            const summary = dupGroups.map(g => `• ${g[0].name}: ${g.map(x => `${fmt(x.balance,1)} ${x.unit} (${x.category})`).join(' + ')}`).join('\n');
            showConfirm(`سيتم دمج الأصناف التالية فى صنف واحد لكل اسم (سيُجمع الرصيد وتُحدَّث الحركات):\n${summary}`, () => {
                dupGroups.forEach(g => {
                    const keep = g[0];
                    for (let i = 1; i < g.length; i++) {
                        const dup = g[i];
                        keep.balance += dup.balance;
                        b.stockMovements.forEach(mv => { if (mv.itemId === dup.id) { mv.itemId = keep.id; mv.itemName = keep.name; } });
                        b.inventory = b.inventory.filter(x => x.id !== dup.id);
                    }
                });
                persist();
                render();
                showToast('✅ تم دمج الأصناف المكررة وتحديث الأرصدة');
            }, 'تأكيد دمج الأصناف المكررة');
        }


        // ============ Operations & Biosecurity Tab ============
        // اختيار نوع حدث الأمان الحيوي من الأزرار السريعة (chips) وفتح باقي الحقول تلقائيًا
