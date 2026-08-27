        function computeFinancialCalendar() {
            const items = [];
            const active = state.batches.filter(x => x.status !== 'مؤرشفة');
            active.forEach(x => {
                (x.purchases || []).filter(p => p.paid === false).forEach(p => {
                    items.push({ date: p.dueDate || null, type: 'payable', label: `💳 مستحق دفع لمورد: ${p.desc || p.type}${p.supplier ? ' (' + p.supplier + ')' : ''}`, amount: p.total, batchName: x.name });
                });
                (x.sales || []).filter(s => s.paid === false).forEach(s => {
                    items.push({ date: s.dueDate || null, type: 'receivable', label: `💰 مستحق تحصيل من: ${s.buyer || 'مشترٍ'}`, amount: s.total, batchName: x.name });
                });
                if (x.targetAge && x.startDate) {
                    const expectedDate = new Date(x.startDate);
                    expectedDate.setDate(expectedDate.getDate() + x.targetAge);
                    const dateStr = expectedDate.toISOString().slice(0, 10);
                    const m = computeMetrics(x);
                    const fin = computeFinance(x, m);
                    const expectedRevenue = (fin.avgSalePrice > 0 && m.liveCount > 0 && m.avgWeightG > 0)
                        ? fin.avgSalePrice * m.liveCount * (x.targetWeight || m.avgWeightG) / 1000 : null;
                    items.push({ date: dateStr, type: 'sale', label: `🚚 تاريخ بيع متوقع لدفعة "${x.name}" (عمر مستهدف ${x.targetAge} يوم)`, amount: expectedRevenue, batchName: x.name });
                }
            });
            const dated = items.filter(i => i.date).sort((a, c) => a.date.localeCompare(c.date));
            const undated = items.filter(i => !i.date);
            return { dated, undated };
        }
        function renderFinancialCalendarSection() {
            const cal = computeFinancialCalendar();
            if (!cal.dated.length && !cal.undated.length) return '';
            const today = todayStr();
            const rowHtml = i => {
                const overdue = i.date && i.date < today && i.type !== 'sale';
                const color = i.type === 'payable' ? 'var(--red)' : i.type === 'receivable' ? 'var(--green)' : 'var(--wheat)';
                return `<div class="check-row"><div class="txt">
                    <div style="font-weight:800;">${esc(i.label)} ${overdue ? '<span class="pill bad" style="font-size:10px;">متأخر</span>' : ''}</div>
                    <div class="day">${i.batchName} ${i.date ? '· ' + i.date : '· بدون تاريخ استحقاق محدد'}</div>
                </div>
                <div style="font-weight:900;color:${color};">${i.amount != null ? money(i.amount) : '—'}</div></div>`;
            };
            return `<div class="section" style="margin-top:0;">
                <div class="section-head"><h2>🗓️ التقويم المالي الموحّد</h2></div>
                <div class="card" style="padding:0;">
                    ${cal.dated.map(rowHtml).join('') || ''}
                    ${cal.undated.map(rowHtml).join('') || ''}
                    ${(!cal.dated.length && !cal.undated.length) ? '<div class="empty" style="padding:14px;">لا توجد مستحقات أو تواريخ بيع متوقعة حاليًا.</div>' : ''}
                </div>
                <p style="font-size:10.5px;color:var(--muted);margin:8px 2px 0;">💡 يجمع هذا التقويم: مستحقات الدفع الآجلة للموردين، المستحقات المتوقع تحصيلها من العملاء، وتاريخ البيع المتوقع لكل دفعة نشطة (بناءً على العمر المستهدف) — عبر كل الدفعات النشطة معًا.</p>
            </div>`;
        }

        function renderFinanceTab(b, m, fin, alerts) {
            const profitClass = fin.netProfit >= 0 ? 'profit' : 'loss';
            const heatUnit = b.heattype === 'solar' ? 'لتر' : b.heattype === 'gas' ? 'أنبوبة' : '';
            const cumHeat = fin.cumHeatFuel;
            const heatTypeLabel = {gas:'غاز (أنبوبة)',solar:'سولار / ديزل',electric:'كهرباء',none:'بدون تدفئة'}[b.heattype]||'';
            const heatPriceUnit = b.heattype === 'gas' ? 'جنيه/أنبوبة' : 'جنيه/لتر';
            return `
            <!-- الربح النهائي: أهم رقم فى التقرير الشامل بالكامل، أول حاجة تظهر ودايمًا ظاهرة (مش قابلة للطي) -->
            <div class="section" style="margin-top:0;"><div class="section-head"><h2>💰 الربح/الخسارة النهائية</h2></div><div class="card">
                <div class="big-result ${profitClass}">
                    <div style="font-size:13px;font-weight:700;color:var(--muted);">${fin.netProfit>=0?'صافي الربح':'صافي الخسارة'}</div>
                    <div class="v" style="color:${fin.netProfit>=0?'var(--green)':'var(--red)'};">${money(Math.abs(fin.netProfit))}</div>
                </div>
                ${statLine(`تكلفة كجم اللحم`, `${fmt(fin.costPerKg,2)} ج/كجم`, {lineStyle:`margin-top:10px;`})}
                ${statLine(`سعر التعادل`, `${fmt(fin.breakEvenPrice,2)} ج/كجم`)}
                ${statLine(`تكلفة الطائر`, `${fmt(fin.costPerBird,2)} ج`)}
                ${statLine(`ربح/خسارة الطائر`, `${fmt(fin.profitPerBird,2)} ج`, {vStyle:`color:${fin.profitPerBird>=0?'var(--green)':'var(--red)'};`})}
                ${statLine(`العائد على التكلفة ROI`, `${fmt(fin.roi,1)}%`, {vStyle:`color:${fin.roi>=0?'var(--green)':'var(--red)'};`})}
                ${(fin.totalPayable>0||fin.totalReceivable>0)?`
                ${statLine(`مستحق للموردين (آجل)`, `${money(fin.totalPayable)}`, {lineStyle:`border-top:1.5px solid var(--line);margin-top:8px;padding-top:8px;`,vStyle:`color:var(--red);`})}
                ${statLine(`مستحق من العملاء (آجل)`, `${money(fin.totalReceivable)}`, {vStyle:`color:var(--wheat);`})}
                ${statLine(`صافي الموقف النقدي الفعلي`, `${money(fin.netCashPosition)}`, {lineStyle:`border-top:1.5px solid var(--line);padding-top:8px;`, kStyle:`font-weight:900;`, vStyle:`font-weight:900;color:${fin.netCashPosition>=0?'var(--green)':'var(--red)'};`})}
                <p style="font-size:10.5px;color:var(--muted);margin:4px 2px 0;">💡 صافي الموقف النقدي = صافي الربح الدفتري − المستحق من العملاء + المستحق للموردين (يعكس النقد الفعلي المتاح لو حصّلت والتزمت بكل المستحقات الآن).</p>` : ''}
            </div></div>

            <!-- قسم الأداء الإنتاجي (أهم ملخص فى هذا التبويب، يفضل مفتوح افتراضيًا) -->
            <div class="section"><div class="section-head"><h2>🐔 ملخص الأداء الإنتاجي</h2></div><div class="card">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${statLine(`عمر القطيع`, `${m.age} يوم`)}
                    ${statLine(`الأعداد الحية`, `${fmt(m.liveCount,0)} (${fmt(m.liveCountPct,1)}%)`)}
                    ${statLine(`متوسط الوزن${m.avgWeightIsEstimated?' (تقديري)':''}`, `${m.avgWeightIsEstimated?'~':''}${fmt(m.avgWeightG,0)} جم`)}
                    ${statLine(`الانحراف عن المعيار`, `<span style="color:${m.weightDiffPct>=AS().weightDiffGoodMin?'var(--green)':'var(--red)'}">${m.weightDiffPct>=0?'+':''}${fmt(m.weightDiffPct,1)}%</span>`)}
                    ${statLine(`إجمالي العلف المستهلك`, `${fmt(m.cumFeed,1)} كجم`)}
                    ${statLine(`ADG (معدل النمو اليومي)`, `${fmt(m.adg,1)} جم/يوم`)}
                    ${statLine(`FCR (معامل التحويل)`, `${m.fcr?(m.avgWeightIsEstimated?'~':'')+fmt(m.fcr,2):'—'}`, {lineStyle:`border-top:1.5px solid var(--line);margin-top:4px;padding-top:8px;`, kStyle:`font-weight:900;color:var(--barn-dark);`, vStyle:`font-size:18px;font-weight:900;color:${m.fcr&&m.fcr<AS().fcrGoodMax?'var(--green)':m.fcr&&m.fcr<AS().fcrOkMax?'var(--wheat)':'var(--red)'};`})}
                    ${statLine(`EPEF (كفاءة الأداء الأوروبي)`, `${m.epef?(m.avgWeightIsEstimated?'~':'')+fmt(m.epef,0):'—'}`, {lineStyle:`border-top:1.5px solid var(--line);margin-top:4px;padding-top:8px;`, kStyle:`font-weight:900;color:var(--barn-dark);`, vStyle:`font-size:18px;font-weight:900;color:${m.epef&&m.epef>350?'var(--green)':m.epef&&m.epef>280?'var(--wheat)':'var(--red)'};`})}
                </div>
                ${m.avgWeightIsEstimated ? `<p style="font-size:11px;color:var(--muted);margin:8px 0 0;">~ يعنى أن اليوم الحالي غير موزون فعليًا، فتم تقدير الوزن بالاستكمال من آخر وزنة حقيقية (يوم ${m.lastWeighed ? m.lastWeighed.age : 0}) لتفادى انقطاع أو قفزة غير حقيقية فى FCR/EPEF.</p>` : ''}
                <div class="formula-box" style="margin-top:10px;">
                    FCR = إجمالي العلف (كجم) ÷ إجمالي الزيادة في الكتلة الحيوية (كجم)<br>
                    EPEF = (نسبة النجاة% × متوسط وزن الطائر كجم) ÷ (FCR × عمر القطيع بالأيام) × 100<br>
                    FCR ممتاز &lt;1.75 | جيد &lt;2.0 | مقبول &lt;2.2 | ضعيف &gt;2.2
                    EPEF ممتاز &gt;400 | جيد &gt;320 | مقبول &gt;250
                </div>
            </div></div>

            ${renderFinancialCalendarSection()}
            <!-- دراسة الجدوى المفصلة -->
            <div class="section no-print">${renderFeasibilityStudy(b, m, fin)}</div>

            <!-- رسوم بيانية إنتاجية -->
            <div class="section"><div class="section-head"><h2>📈 منحنى نمو الوزن (فعلي vs معياري)</h2></div><div class="card">
                <canvas id="chartWeightRep" height="200"></canvas>
                <div class="legend-row"><span><span class="dot" style="background:#D9A544"></span>فعلي</span><span><span class="dot" style="background:rgba(107,66,38,.5)"></span>معياري (منقط)</span></div>
            </div></div>
            <div class="section"><div class="section-head"><h2>🌾 العلف اليومي + FCR التراكمي</h2></div><div class="card">
                <canvas id="chartFeedRep" height="190"></canvas>
                <div class="legend-row"><span><span class="dot" style="background:#2F4538"></span>علف (كجم)</span><span><span class="dot" style="background:#C1443C"></span>FCR</span></div>
            </div></div>
            <div class="section"><div class="section-head"><h2>💀 النفوق التراكمي</h2></div><div class="card">
                <canvas id="chartMortRep" height="160"></canvas>
            </div></div>

            <!-- التدفئة -->
            ${b.heattype !== 'none' && b.heattype !== 'electric' ? `
            <div class="section"><div class="section-head"><h2>🔥 التدفئة</h2></div><div class="card">
                ${statLine(`نوع التدفئة`, `${heatTypeLabel}`)}
                ${statLine(`إجمالي الاستهلاك الفعلي`, `${cumHeat>0?fmt(cumHeat,2)+' '+heatUnit:'لم يُسجَّل بعد'}`)}
                ${b.heatprice>0?`${statLine(`سعر الوحدة`, `${fmt(b.heatprice,2)} ${heatPriceUnit}`)}`:''}
                ${statLine(`تكلفة التدفئة`, `${money(fin.heatCost)}`)}
                ${statLine(`الفصل عند بداية الدورة`, `${['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][(b.startmonth||1)-1]}`)}
                ${b.heattype==='gas' && cumHeat>0?`<div style="font-size:11px;color:var(--muted);margin-top:6px;">💡 كل وحدة = أنبوبة غاز كاملة. الاستهلاك المسجّل يمثل كسور من الأنبوبة (مثال: 0.3 = 30% من الأنبوبة).</div>`:''}
            </div></div>` : ''}

            <!-- ملخص التكاليف -->
            <div class="section"><div class="section-head"><h2>📊 توزيع التكاليف</h2></div><div class="card">
                <canvas id="chartCostPie" height="190"></canvas>
                <div id="costPieLegend" class="legend-row"></div>
                ${statLine(`علف`, `${money(fin.feedCost)}`, {lineStyle:`margin-top:10px;`})}
                ${statLine(`كتاكيت`, `${money(fin.chickCost)}`)}
                ${statLine(`أدوية ولقاحات`, `${money(fin.medFromPurchases)}`)}
                ${statLine(`فرشة`, `${money(fin.beddingFromPurchases)}`)}
                ${statLine(`وقود التدفئة (غاز/سولار)`, `${money(fin.heatCost)}`)}
                ${statLine(`تكلفة الذبح والتصنيع`, `${money(fin.processingCost)}`)}
                ${statLine(`إضافات + كهرباء + عمالة + أخرى`, `${money(fin.addFromPurchases+fin.utilFromPurchases+fin.laborFromPurchases+fin.otherFromPurchases)}`)}
                ${statLine(`بنود إضافية (تكاليف)`, `${money(fin.customCosts)}`)}
                ${statLine(`إجمالي التكاليف`, `${money(fin.totalCosts)}`, {lineStyle:`border-top:2px solid var(--barn-dark);padding-top:8px;font-weight:900;color:var(--barn-dark);`,vStyle:`color:var(--red);`})}
            </div></div>

            <!-- ملخص الإيرادات -->
            <div class="section"><div class="section-head"><h2>📊 توزيع الإيرادات</h2></div><div class="card">
                <canvas id="chartRevPie" height="190"></canvas>
                <div id="revPieLegend" class="legend-row"></div>
                ${statLine(`إيراد اللحم (${fmt(fin.soldWeightKg,1)} كجم)`, `${money(fin.meatRevenue)}`, {lineStyle:`margin-top:10px;`})}
                ${fin.avgCarcassYield!=null?`${statLine(`متوسط نسبة التصافي (Carcass Yield)`, `${fmt(fin.avgCarcassYield,1)}%`)}`:''}
                ${fin.processingCost>0?`${statLine(`تكلفة الذبح والتصنيع`, `${money(fin.processingCost)}`)}`:''}
                ${statLine(`إيراد السبلة`, `${money(fin.litterRevenue)}`)}
                ${statLine(`بنود إضافية (إيرادات)`, `${money(fin.customRevenue)}`)}
                ${statLine(`إجمالي الإيرادات`, `${money(fin.totalRevenue)}`, {lineStyle:`border-top:2px solid var(--barn-dark);padding-top:8px;`,kStyle:`font-weight:900;color:var(--barn-dark);`,vStyle:`color:var(--green);`})}
            </div></div>

            <!-- تحليل الحساسية المالية (ماذا لو؟) -->
            <div class="section no-print"><div class="section-head"><h2>🎯 تحليل الحساسية (ماذا لو؟)</h2></div><div class="card">

                <p style="font-size:12px;color:var(--muted);margin:0 0 10px;">تقدير سريع لأثر تغيّر سعر العلف أو سعر البيع على الربح، بافتراض ثبات باقي البنود. تقريبي وليس بديلاً عن إعادة حساب دقيقة.</p>
                ${(() => {
                    const scenarios = [
                        { label: 'سعر العلف +10%', feedMult: 1.10, saleMult: 1 },
                        { label: 'سعر العلف -10%', feedMult: 0.90, saleMult: 1 },
                        { label: 'سعر البيع +10%', feedMult: 1, saleMult: 1.10 },
                        { label: 'سعر البيع -10%', feedMult: 1, saleMult: 0.90 },
                        { label: 'الأسوأ: علف +10% وبيع -10%', feedMult: 1.10, saleMult: 0.90 },
                        { label: 'الأفضل: علف -10% وبيع +10%', feedMult: 0.90, saleMult: 1.10 }
                    ];
                    const rows = scenarios.map(sc => {
                        const newFeedCost = fin.feedCost * sc.feedMult;
                        const newMeatRevenue = fin.meatRevenue * sc.saleMult;
                        const newTotalCosts = fin.totalCosts - fin.feedCost + newFeedCost;
                        const newTotalRevenue = fin.totalRevenue - fin.meatRevenue + newMeatRevenue;
                        const newProfit = newTotalRevenue - newTotalCosts;
                        const delta = newProfit - fin.netProfit;
                        return `<tr><td style="text-align:right;">${sc.label}</td><td>${money(newProfit)}</td>
                            <td style="color:${delta>=0?'var(--green)':'var(--red)'};font-weight:800;">${delta>=0?'+':''}${money(delta)}</td></tr>`;
                    }).join('');
                    return `<div class="scroll-x"><table><thead><tr><th>السيناريو</th><th>الربح المتوقع</th><th>التغيّر عن الحالي</th></tr></thead><tbody>${rows}</tbody></table></div>`;
                })()}
            </div></div>

            <!-- بنود إضافية (تكاليف/إيرادات يدوية) -->
            <div class="section"><div class="section-head"><h2>➕ بنود إضافية</h2></div><div class="card">
                <p style="font-size:12px;color:var(--muted);margin:0 0 8px;">أضف أي بند تكلفة أو إيراد غير موجود فى التطبيق، يُحسب تلقائيًا فى التقرير المالي أعلاه.</p>
                <button class="btn ghost block no-print" onclick="openCustomModal()">+ إضافة بند جديد</button>
                ${b.customItems.length ? `<div class="scroll-x" style="margin-top:10px;"><table><thead><tr><th>التاريخ</th><th>البند</th><th>النوع</th><th>القيمة</th><th>ملاحظة</th><th class="no-print"></th></tr></thead><tbody>
                ${[...b.customItems].sort((a,c)=> (c.date||'').localeCompare(a.date||'')).map(c => `
                <tr><td>${c.date || '—'}</td><td style="text-align:right;">${esc(c.name)}</td><td><span class="pill ${c.type === 'cost' ? 'exp' : 'rev'}">${c.type === 'cost' ? 'تكلفة' : 'إيراد'}</span></td><td>${money(c.amount)}</td><td style="text-align:right;font-size:11px;color:var(--muted);">${esc(c.note || '')}</td>
                <td class="no-print"><button class="btn ghost sm" onclick="editCustom('${c.id}')">تعديل</button> <button class="btn danger sm" onclick="deleteCustom('${c.id}')">حذف</button></td></tr>`).join('')}
                </tbody></table></div>` : `<div class="empty" style="margin-top:10px;"><div class="ico">➕</div>لا توجد بنود إضافية بعد.</div>`}
            </div></div>

            <!-- بيانات الدفعة -->
            <div class="section"><div class="section-head"><h2>📋 بيانات الدفعة</h2></div><div class="card">
                ${statLine(`الاسم`, `${esc(b.name)}`)}
                ${statLine(`نوع الطائر`, `${getSpeciesData(b.species).label}`)}
                ${statLine(`السلالة`, `${b.breed}`)}
                ${statLine(`تاريخ الاستلام`, `${b.startDate}`)}
                ${statLine(`عدد الكتاكيت`, `${fmt(b.startCount,0)}`)}
                ${statLine(`مساحة العنبر`, `${b.area?b.area+' م²':'غير محدد'}`)}
                <div class="row-actions no-print" style="margin-top:12px;">
                    <button class="btn gold" style="flex:1;" onclick="endCycle('${b.id}')">🏁 إنهاء وأرشفة</button>
                    <button class="btn danger" style="flex:1;" onclick="deleteBatch('${b.id}')">🗑️ حذف نهائي</button>
                </div>
                <div class="print-btn-group no-print" style="margin-top:8px;">
                    <button class="btn gold" onclick="exportPDF('printableReport','katkot-pro-report.pdf')">📥 تحميل PDF</button>
                    <button class="btn ghost" onclick="printReport()">🖨️ طباعة</button>
                </div>
                <div class="print-btn-group no-print" style="margin-top:8px;">
                    <button class="btn gold" onclick="exportInvestorPDF()">📊 تقرير استثماري (PDF)</button>
                    <button class="btn ghost" onclick="printInvestorReport()">🖨️ طباعة الاستثماري</button>
                </div>
                <div class="print-btn-group no-print" style="margin-top:8px;">
                    <button class="btn ghost block" onclick="exportInvestorHTML()">📄 ملف عرض فقط (HTML — بدون إنترنت، للمستثمر/المالك)</button>
                </div>
                <div class="print-btn-group no-print" style="margin-top:8px;">
                    <button class="btn gold" onclick="exportTraceabilityPDF()">🔗 بطاقة تتبع (PDF)</button>
                    <button class="btn ghost" onclick="printTraceabilityCard()">🖨️ طباعة بطاقة التتبع</button>
                </div>
            </div></div>`;
        }


        // ============ Compare Tab ============
