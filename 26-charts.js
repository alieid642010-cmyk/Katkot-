        async function downloadOrShareFile(blob, filename, mimeType, shareTitle) {
            try {
                const file = new File([blob], filename, { type: mimeType });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({ files: [file], title: shareTitle || filename });
                        return 'shared';
                    } catch (e) {
                        if (e && e.name === 'AbortError') return 'cancelled'; // المستخدم ألغى بنفسه — مفيش خطأ فعلي
                        // فشلت المشاركة لسبب تاني (نادر) — نكمل على الطريقة التقليدية بدل ما نوقف بالكامل
                    }
                }
            } catch (e) { /* File API غير مدعومة — نكمل على الطريقة التقليدية */ }
            try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 4000);
                return 'downloaded';
            } catch (e2) { return 'failed'; }
        }

        function drawPrintCharts(b, m, fin) {
            drawDashboardCharts(b, m, fin, 'Print');
            drawFinanceCharts(fin, 'Print');
        }

        function exportPDF(elementId, filename) {
            const el = document.getElementById(elementId);
            if (!el) { showToast('لا يوجد محتوى للتصدير'); return; }
            // ============ لا يوجد اتصال بالإنترنت أو تعذّر تحميل مكتبة PDF — رجوع تلقائي للطباعة (تعمل بدون إنترنت) ============
            if (typeof html2pdf === 'undefined') { showToast('📄 مفيش اتصال بالإنترنت الآن — هنفتحلك شاشة الطباعة بدلًا من ذلك (تقدر تحفظه PDF من خيارات الطباعة)'); printReport(); return; }
            const b = getActiveBatch();
            if (!b) { showToast('لا توجد دفعة نشطة لإنشاء التقرير'); return; }
            const m = computeMetrics(b), fin = computeFinance(b, m), alerts = computeAlerts(b, m);
            buildPrintableReport(b, m, fin, alerts);
            showToast('⏳ جارٍ تجهيز ملف PDF (بالرسوم البيانية)...');
            const fname = filename || 'katkot-pro-report.pdf';
            // لازم نُظهر العنصر ونرسم الرسوم البيانية فيه قبل النسخ، وإلا هتُلتقط أبعاد صفرية (كانفاس فارغ) —
            // ده اللي كان بيحصل قبل كده خصوصًا على الموبايل.
            el.style.display = 'block';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                drawPrintCharts(b, m, fin);
                const opt = {
                    margin: 6,
                    filename: fname,
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: { scale: 2, useCORS: true, windowWidth: el.scrollWidth },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                };
                // outputPdf('blob') بيدينا الملف كـ Blob عشان نقدر نستخدم مشاركة/حفظ الموبايل بدل الاعتماد
                // على .save() التلقائية اللي مش موثوقة دايمًا فى حفظ الملف على الموبايل.
                html2pdf().set(opt).from(el).outputPdf('blob')
                    .then(async (blob) => {
                        el.style.display = 'none';
                        const result = await downloadOrShareFile(blob, fname, 'application/pdf', 'تقرير كتكوت Pro');
                        if (result === 'cancelled') return;
                        showToast(result !== 'failed' ? '✅ تم حفظ ملف PDF — يمكنك إيجاده فى تطبيق الملفات أو المشاركة' : 'حدث خطأ أثناء إنشاء PDF — جرّب مرة أخرى');
                    })
                    .catch(() => { el.style.display = 'none'; showToast('حدث خطأ أثناء إنشاء PDF — جرّب مرة أخرى'); });
            }));
        }

        // ============ التقرير الاستثماري (صفحة واحدة ملخّصة) — للعرض على ممول/بنك/شريك، بخلاف التقرير التشغيلي التفصيلي ============
        function buildInvestorReport(b, m, fin) {
            const el = document.getElementById('printableReport');
            if (!el) return;
            if (!b || !m || !fin) { el.innerHTML = `<div style="color:red;text-align:center;padding:20px;">⚠️ لا توجد بيانات كافية لتوليد التقرير</div>`; return; }
            const feas = computeFeasibility(b, m, fin);
            const bc = computeBestCyclesBenchmark(b);
            const kpi = (label, val, color) => `<div style="background:#f7f5f0;border-radius:8px;padding:10px 8px;text-align:center;">
                <div style="font-size:10.5px;color:#777;margin-bottom:4px;">${label}</div>
                <div style="font-size:16px;font-weight:800;color:${color||'#2F4538'};">${val}</div></div>`;
            const scenarioRows = feas.scenarios.map(s => `<tr>
                <td style="text-align:right;">${s.label}</td>
                <td>${money(s.revenue)}</td><td>${money(s.costs)}</td>
                <td style="font-weight:800;color:${s.profit>=0?'#2c7a4b':'#c1443c'};">${money(s.profit)}</td>
                <td>${fmt(s.roi,1)}%</td></tr>`).join('');
            const benchHtml = !bc ? '' : `
                <div style="margin-top:16px;">
                    <h3 style="color:#2F4538;font-size:14px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">🏆 مقارنة بأفضل أداء داخلي مُثبت (${bc.top.length} من ${bc.sampleSize} دورة سابقة)</h3>
                    <table border="1" cellpadding="6" style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">
                        <thead><tr style="background:#2F4538;color:white;"><th>المؤشر</th><th>الدورة الحالية</th><th>متوسط أفضل الدورات</th></tr></thead>
                        <tbody>
                            <tr><td>EPEF</td><td>${fmt(m.epef,0)}</td><td>${fmt(bc.avg.epef,0)}</td></tr>
                            <tr><td>FCR</td><td>${m.fcr?fmt(m.fcr,2):'—'}</td><td>${fmt(bc.avg.fcr,2)}</td></tr>
                            <tr><td>نسبة النفوق %</td><td>${fmt(m.mortRate,2)}</td><td>${fmt(bc.avg.mortRate,2)}</td></tr>
                            <tr><td>تكلفة الكيلو</td><td>${money(fin.costPerKg)}</td><td>${money(bc.avg.costPerKg)}</td></tr>
                        </tbody>
                    </table>
                </div>`;
            el.innerHTML = `
                <div style="font-family:'Tajawal','Cairo',sans-serif;max-width:100%;margin:0 auto;padding:24px;background:white;direction:rtl;font-size:12.5px;color:#222;">
                    <div style="text-align:center;border-bottom:4px solid #2F4538;padding-bottom:12px;margin-bottom:18px;">
                        <h1 style="margin:0;color:#2F4538;font-size:24px;">📊 تقرير أداء استثماري</h1>
                        <p style="margin:6px 0 0;color:#555;font-size:15px;font-weight:bold;">${esc(b.name) || 'دفعة غير مسماة'} — ${getSpeciesData(b.species).label}</p>
                        <p style="margin:2px 0 0;color:#888;font-size:11px;">تاريخ التقرير: ${todayStr()} · عمر القطيع الحالي: يوم ${m.todayAge}</p>
                    </div>

                    <h3 style="color:#2F4538;font-size:14px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">📌 ملخص تنفيذي</h3>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 16px;">
                        ${kpi('عدد حي', fmt(m.liveCount,0)+' ('+fmt(m.liveCountPct,1)+'%)')}
                        ${kpi('متوسط الوزن', fmt(m.avgWeightG,0)+' جم')}
                        ${kpi('FCR', m.fcr?fmt(m.fcr,2):'—')}
                        ${kpi('EPEF', fmt(m.epef,0))}
                        ${kpi('نسبة النفوق', fmt(m.mortRate,2)+'%', m.mortRate>5?'#c1443c':'#2c7a4b')}
                        ${kpi('تكلفة الكيلو', money(fin.costPerKg))}
                        ${kpi('صافي الربح', money(fin.netProfit), fin.netProfit>=0?'#2c7a4b':'#c1443c')}
                        ${kpi('العائد ROI', fmt(fin.roi,1)+'%', fin.roi>=0?'#2c7a4b':'#c1443c')}
                    </div>

                    <div style="background:${feas.verdictColor==='var(--red)'?'#fbeceb':'#eef6f0'};border-radius:10px;padding:12px;text-align:center;font-weight:800;font-size:14px;margin-bottom:16px;color:#2F4538;">
                        ${feas.verdict}
                    </div>

                    <h3 style="color:#2F4538;font-size:14px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">📈 الإسقاط السنوي (بافتراض تكرار نفس الأداء)</h3>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 16px;">
                        ${kpi('دورات/سنة', fmt(feas.cyclesPerYear,1))}
                        ${kpi('إيراد سنوي متوقع', money(feas.annualRevenue))}
                        ${kpi('ربح سنوي متوقع', money(feas.annualProfit), feas.annualProfit>=0?'#2c7a4b':'#c1443c')}
                    </div>

                    <h3 style="color:#2F4538;font-size:14px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">🎯 تحليل الحساسية (تغيّر سعر العلف/البيع ±10%)</h3>
                    <table border="1" cellpadding="6" style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">
                        <thead><tr style="background:#2F4538;color:white;"><th>السيناريو</th><th>الإيراد</th><th>التكاليف</th><th>الربح</th><th>ROI</th></tr></thead>
                        <tbody>${scenarioRows}</tbody>
                    </table>

                    ${benchHtml}

                    <div style="margin-top:24px;font-size:10px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px;">
                        تقرير تلقائي من تطبيق "كتكوت Pro" لغرض العرض الإداري/الاستثماري — الأرقام مبنية على بيانات مُدخَلة يدويًا وقابلة للتغيّر مع استمرار الدورة. © ${new Date().getFullYear()}
                    </div>
                </div>`;
        }
        function printInvestorReport() {
            const b = getActiveBatch();
            if (!b) { showToast('لا توجد دفعة نشطة لإنشاء التقرير'); return; }
            const m = computeMetrics(b), fin = computeFinance(b, m);
            buildInvestorReport(b, m, fin);
            const el = document.getElementById('printableReport');
            el.style.display = 'block';
            requestAnimationFrame(() => setTimeout(() => window.print(), 60));
        }
        // ============ ملف HTML مستقل "عرض فقط" للتقرير الاستثماري — بديل للـPDF يعمل بدون إنترنت (PDF يحتاج مكتبة خارجية) ============
        async function exportInvestorHTML() {
            const b = getActiveBatch();
            if (!b) { showToast('لا توجد دفعة نشطة لإنشاء التقرير'); return; }
            const m = computeMetrics(b), fin = computeFinance(b, m);
            buildInvestorReport(b, m, fin);
            const content = document.getElementById('printableReport').innerHTML;
            const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير استثماري — ${esc(b.name)}</title>
<style>body{margin:0;background:#f2f0e9;padding:16px;}</style></head><body>${content}</body></html>`;
            const blob = new Blob([html], { type: 'text/html' });
            const result = await downloadOrShareFile(blob, `تقرير-استثماري-${traceCode(b)}.html`, 'text/html', 'تقرير استثماري - كتكوت Pro');
            if (result === 'cancelled') return;
            showToast(result !== 'failed' ? '✅ ملف عرض فقط جاهز — شاركه مع المستثمر/المالك (يفتح بأي متصفح بدون إنترنت)' : 'حدث خطأ أثناء التصدير');
        }
        function exportInvestorPDF() {
            const el = document.getElementById('printableReport');
            if (!el) { showToast('لا يوجد محتوى للتصدير'); return; }
            if (typeof html2pdf === 'undefined') { showToast('📄 مفيش اتصال بالإنترنت الآن — هنفتحلك شاشة الطباعة بدلًا من ذلك (تقدر تحفظه PDF من خيارات الطباعة)'); printInvestorReport(); return; }
            const b = getActiveBatch();
            if (!b) { showToast('لا توجد دفعة نشطة لإنشاء التقرير'); return; }
            const m = computeMetrics(b), fin = computeFinance(b, m);
            buildInvestorReport(b, m, fin);
            showToast('⏳ جارٍ تجهيز التقرير الاستثماري...');
            el.style.display = 'block';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const opt = {
                    margin: 6,
                    filename: `katkot-pro-investor-report-${todayStr()}.pdf`,
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: { scale: 2, useCORS: true, windowWidth: el.scrollWidth },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                };
                html2pdf().set(opt).from(el).outputPdf('blob')
                    .then(async (blob) => {
                        el.style.display = 'none';
                        const result = await downloadOrShareFile(blob, opt.filename, 'application/pdf', 'تقرير استثماري - كتكوت Pro');
                        if (result === 'cancelled') return;
                        showToast(result !== 'failed' ? '✅ تم حفظ التقرير الاستثماري' : 'حدث خطأ أثناء إنشاء PDF — جرّب مرة أخرى');
                    })
                    .catch(() => { el.style.display = 'none'; showToast('حدث خطأ أثناء إنشاء PDF — جرّب مرة أخرى'); });
            }));
        }

        // ============ تقرير مستقل: فعالية الإضافات/المعاملات/موردي العلف عبر الدورات — للمشاركة مع مورد/طبيب بيطري ============
        function buildAdditiveEffectivenessReport(species) {
            const el = document.getElementById('printableReport');
            if (!el) return;
            const items = computeCrossCycleItemEffectiveness(species);
            const treatments = computeCrossCycleTreatmentEffectiveness(species);
            const lots = computeCrossCycleFeedLotEffectiveness(species);
            if (!items && !treatments && !lots) {
                el.innerHTML = `<div style="color:red;text-align:center;padding:20px;">⚠️ لا توجد بيانات كافية بعد — التقرير يحتاج دورتين مؤرشفتين على الأقل استُخدم فيهما نفس البند</div>`;
                return;
            }
            const verdictColor = v => v === 'improve' ? '#2c7a4b' : v === 'worsen' ? '#c1443c' : v === 'none' ? '#888' : '#b8860b';
            const section = (title, rows, costCol) => !rows ? '' : `
                <h3 style="color:#2F4538;font-size:14px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;margin-top:20px;">${title}</h3>
                <table border="1" cellpadding="6" style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">
                    <thead><tr style="background:#2F4538;color:white;"><th>الاسم</th><th>عدد الدورات</th><th>التقييم</th><th>وزن (تحسّن/إجمالي)</th><th>تحويل (تحسّن/إجمالي)</th><th>نفوق (تحسّن/إجمالي)</th>${costCol ? '<th>تكلفة تقديرية/دورة</th>' : ''}</tr></thead>
                    <tbody>${rows.map(r => `<tr>
                        <td>${esc(r.name)}</td><td style="text-align:center;">${r.cycles}</td>
                        <td style="text-align:center;color:${verdictColor(r.verdict)};font-weight:800;">${r.verdictLabel.replace(/^[🟢🔴⚪🟡]\s*/, '')}</td>
                        <td style="text-align:center;">${r.weightC ? `${r.weightC.improved}/${r.weightC.n}` : '—'}</td>
                        <td style="text-align:center;">${r.fcrC ? `${r.fcrC.improved}/${r.fcrC.n}` : '—'}</td>
                        <td style="text-align:center;">${r.mortC ? `${r.mortC.improved}/${r.mortC.n}` : '—'}</td>
                        ${costCol ? `<td style="text-align:center;">${r.avgCostPerCycle != null ? fmt(r.avgCostPerCycle,0) + ' ج' : '—'}</td>` : ''}
                    </tr>`).join('')}</tbody>
                </table>`;
            el.innerHTML = `<div style="font-family:'Tajawal',sans-serif;direction:rtl;padding:16px;max-width:800px;margin:0 auto;">
                    <div style="text-align:center;margin-bottom:16px;border-bottom:3px solid #2F4538;padding-bottom:10px;">
                        <h1 style="color:#2F4538;font-size:20px;margin:0;">💊 تقرير فعالية الإضافات والمعاملات وموردي العلف</h1>
                        <div style="font-size:11px;color:#888;margin-top:4px;">مبني على مقارنة الأداء (وزن/معدل تحويل/نفوق) وقت السريان أو التنفيذ مقابل خارجه، لكل دورة على حدة، عبر كل الدورات المؤرشفة — ${new Date().toLocaleDateString('ar-EG')}</div>
                    </div>
                    ${section('💊🔁 الإضافات (علف/ماء) — مقسّمة حسب مرحلة العلف', items, true)}
                    ${section('🪣🔁 معاملات الفرشة/السبلة', treatments, false)}
                    ${section('🌾🔁 موردو العلف', lots, false)}
                    <div style="margin-top:20px;font-size:10px;color:#888;line-height:1.7;">
                        <b>ملاحظة منهجية:</b> "وزن/تحويل/نفوق (تحسّن/إجمالي)" = فى كام دورة من إجمالي الدورات المستخدمة فيها البند ظهر فرق ملحوظ فعليًا. التقييم مؤشر استرشادي مبني على بيانات المزرعة الفعلية، وليس حكمًا علميًا نهائيًا — كل ما زادت عدد الدورات المؤرشفة كل ما زادت دقة النتيجة.
                    </div>
                    <div style="margin-top:16px;font-size:10px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px;">
                        تقرير تلقائي من تطبيق "كتكوت Pro" © ${new Date().getFullYear()}
                    </div>
                </div>`;
        }
        function printAdditiveEffectivenessReport() {
            const b = getActiveBatch() || (state.batches[0]);
            if (!b) { showToast('لا توجد بيانات كافية لإنشاء التقرير'); return; }
            buildAdditiveEffectivenessReport(b.species);
            const el = document.getElementById('printableReport');
            el.style.display = 'block';
            requestAnimationFrame(() => setTimeout(() => window.print(), 60));
        }
        function exportAdditiveEffectivenessPDF() {
            const el = document.getElementById('printableReport');
            if (!el) { showToast('لا يوجد محتوى للتصدير'); return; }
            if (typeof html2pdf === 'undefined') { showToast('📄 مفيش اتصال بالإنترنت الآن — هنفتحلك شاشة الطباعة بدلًا من ذلك (تقدر تحفظه PDF من خيارات الطباعة)'); printAdditiveEffectivenessReport(); return; }
            const b = getActiveBatch() || (state.batches[0]);
            if (!b) { showToast('لا توجد بيانات كافية لإنشاء التقرير'); return; }
            buildAdditiveEffectivenessReport(b.species);
            showToast('⏳ جارٍ تجهيز تقرير فعالية الإضافات...');
            el.style.display = 'block';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const opt = {
                    margin: 6,
                    filename: `katkot-pro-additive-effectiveness-${todayStr()}.pdf`,
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: { scale: 2, useCORS: true, windowWidth: el.scrollWidth },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                };
                html2pdf().set(opt).from(el).outputPdf('blob')
                    .then(async (blob) => {
                        el.style.display = 'none';
                        const result = await downloadOrShareFile(blob, opt.filename, 'application/pdf', 'تقرير فعالية الإضافات - كتكوت Pro');
                        if (result === 'cancelled') return;
                        showToast(result !== 'failed' ? '✅ تم حفظ تقرير فعالية الإضافات' : 'حدث خطأ أثناء إنشاء PDF — جرّب مرة أخرى');
                    })
                    .catch(() => { el.style.display = 'none'; showToast('حدث خطأ أثناء إنشاء PDF — جرّب مرة أخرى'); });
            }));
        }


        // ملحوظة: دي بطاقة توثيق داخلية قابلة للطباعة/التصدير، مش شهادة HACCP رسمية معتمدة من جهة خارجية —
        // مفيدة للعرض على عميل/جهة تعاقد تطلب إثبات مصدر ومسار الدفعة.
        function traceCode(b) { return 'TR-' + String(b.id).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase(); }
        function buildTraceabilityCard(b) {
            const el = document.getElementById('printableReport');
            if (!el) return;
            if (!b) { el.innerHTML = `<div style="color:red;text-align:center;padding:20px;">⚠️ لا توجد دفعة نشطة</div>`; return; }
            const chickSources = b.purchases.filter(p => p.type === 'كتاكيت');
            const feedSources = b.purchases.filter(p => p.type === 'علف');
            const vaccines = [...b.vaccineLog].sort((a, c) => a.day - c.day);
            const treatments = [...b.treatmentLog].filter(t => t.done !== false).sort((a, c) => a.day - c.day);
            const bioEvents = [...(b.biosecurityLog || [])].sort((a, c) => (a.date || '').localeCompare(c.date || ''));
            const meatSales = b.sales.filter(s => s.kind === 'meat');
            const rowsOf = (arr, mapper, emptyText) => arr.length ? arr.map(mapper).join('') : `<tr><td colspan="4" style="text-align:center;color:#999;">${emptyText}</td></tr>`;
            // ============ QR للبطاقة — يشفّر ملخص بيانات الدفعة نصيًا (التطبيق يعمل أوفلاين، فلا يوجد رابط استضافة؛ الماسح يعرض الملخص مباشرة) ============
            const qrPayload = [
                `كتكوت Pro — بطاقة تتبع`, `الكود: ${traceCode(b)}`, `الدفعة: ${b.name}`,
                `النوع/السلالة: ${getSpeciesData(b.species).label} ${b.breed||''}`,
                `تاريخ الاستلام: ${b.startDate} — العدد: ${b.startCount}`,
                chickSources[0] ? `مصدر الكتاكيت: ${chickSources[0].supplier||'—'} (لوت ${chickSources[0].lot||'—'})` : '',
                `آخر تحديث: ${todayStr()}`
            ].filter(Boolean).join(' | ');
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=2&data=${encodeURIComponent(qrPayload)}`;
            el.innerHTML = `
                <div style="font-family:'Tajawal','Cairo',sans-serif;max-width:100%;margin:0 auto;padding:24px;background:white;direction:rtl;font-size:12px;color:#222;">
                    <div style="text-align:center;border-bottom:4px solid #2F4538;padding-bottom:12px;margin-bottom:16px;">
                        <h1 style="margin:0;color:#2F4538;font-size:22px;">🔗 بطاقة تتبع الدفعة</h1>
                        <p style="margin:6px 0 0;color:#555;font-size:14px;font-weight:bold;">${esc(b.name) || 'دفعة غير مسماة'} — ${getSpeciesData(b.species).label} (${b.breed || ''})</p>
                        <p style="margin:4px 0 0;color:#2F4538;font-size:13px;font-weight:800;">كود التتبع: ${traceCode(b)}</p>
                        <img src="${qrUrl}" alt="QR" style="margin-top:10px;width:110px;height:110px;" onerror="this.style.display='none'">
                        <p style="margin:4px 0 0;color:#888;font-size:9.5px;">امسح الكود لعرض ملخص بيانات الدفعة فورًا (يحتاج تطبيق قارئ QR على الهاتف)</p>
                    </div>

                    <h3 style="color:#2F4538;font-size:13px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">🐣 مصدر الكتاكيت</h3>
                    <table border="1" cellpadding="5" style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0 14px;">
                        <thead><tr style="background:#2F4538;color:white;"><th>التاريخ</th><th>المورد</th><th>رقم التشغيلة/اللوت</th><th>العدد</th></tr></thead>
                        <tbody>${rowsOf(chickSources, p => `<tr><td>${p.date}</td><td>${esc(p.supplier)||'—'}</td><td>${p.lot||'—'}</td><td>${fmt(p.qty,0)}</td></tr>`, 'لا يوجد سجل شراء كتاكيت مرتبط — تاريخ الاستلام: ' + b.startDate)}</tbody>
                    </table>
                    <p style="font-size:10.5px;color:#777;margin:-8px 0 14px;">إجمالي عدد الكتاكيت المُستلمة: ${fmt(b.startCount,0)} بتاريخ ${b.startDate}</p>

                    <h3 style="color:#2F4538;font-size:13px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">🌾 مصادر العلف (حسب الشحنة/اللوت)</h3>
                    <table border="1" cellpadding="5" style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0 14px;">
                        <thead><tr style="background:#2F4538;color:white;"><th>التاريخ</th><th>المورد</th><th>رقم اللوت</th><th>الكمية</th></tr></thead>
                        <tbody>${rowsOf(feedSources, p => `<tr><td>${p.date}</td><td>${esc(p.supplier)||'—'}</td><td>${p.lot||'—'}</td><td>${fmt(p.qty,0)} ${p.unit||''}</td></tr>`, 'لا يوجد سجل مشتريات علف بعد')}</tbody>
                    </table>

                    <h3 style="color:#2F4538;font-size:13px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">💉 سجل التحصينات</h3>
                    <table border="1" cellpadding="5" style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0 14px;">
                        <thead><tr style="background:#2F4538;color:white;"><th>اليوم</th><th>اللقاح</th><th>الجرعة</th><th>الحالة</th></tr></thead>
                        <tbody>${rowsOf(vaccines, v => `<tr><td>يوم ${v.day}</td><td>${esc(v.name)}</td><td>${fmt(v.qty,1)} ${v.unit||''}</td><td>${v.done?'✅ تم':'⏳ مجدول'}</td></tr>`, 'لا يوجد برنامج تحصين مسجَّل')}</tbody>
                    </table>

                    <h3 style="color:#2F4538;font-size:13px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">💊 سجل العلاجات المنفَّذة</h3>
                    <table border="1" cellpadding="5" style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0 14px;">
                        <thead><tr style="background:#2F4538;color:white;"><th>اليوم</th><th>العلاج</th><th>الجرعة</th><th>ملاحظات</th></tr></thead>
                        <tbody>${rowsOf(treatments, t => `<tr><td>يوم ${t.day}</td><td>${esc(t.name)}</td><td>${fmt(t.qty,1)} ${t.unit||''}</td><td>${esc(t.notes)||'—'}</td></tr>`, 'لا يوجد علاجات مسجَّلة')}</tbody>
                    </table>

                    <h3 style="color:#2F4538;font-size:13px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">🛡️ أحداث الأمان الحيوي</h3>
                    <table border="1" cellpadding="5" style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0 14px;">
                        <thead><tr style="background:#2F4538;color:white;"><th>التاريخ</th><th>النوع</th><th colspan="2">ملاحظات</th></tr></thead>
                        <tbody>${rowsOf(bioEvents, e => `<tr><td>${e.date}</td><td>${esc(e.type)}</td><td colspan="2">${esc(e.note)||'—'}</td></tr>`, 'لا يوجد أحداث أمان حيوي مسجَّلة')}</tbody>
                    </table>

                    <h3 style="color:#2F4538;font-size:13px;border-bottom:2px solid #e3ddcf;padding-bottom:4px;">🚚 التسويق/الذبح</h3>
                    <table border="1" cellpadding="5" style="width:100%;border-collapse:collapse;font-size:11px;margin:6px 0 6px;">
                        <thead><tr style="background:#2F4538;color:white;"><th>التاريخ</th><th>الجهة</th><th>العدد</th><th>الوزن (كجم)</th></tr></thead>
                        <tbody>${rowsOf(meatSales, s => `<tr><td>${s.date}</td><td>${esc(s.buyer)||'—'}</td><td>${fmt(s.count,0)}</td><td>${fmt(s.weight,0)}</td></tr>`, 'لا يوجد سجل تسويق/ذبح بعد')}</tbody>
                    </table>

                    <div style="margin-top:24px;font-size:10px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px;">
                        بطاقة تتبع داخلية أُنشئت تلقائيًا من بيانات تطبيق "كتكوت Pro" — للاستخدام كإثبات مصدر ومسار داخلي، وليست شهادة اعتماد رسمية من جهة خارجية. تاريخ الإصدار: ${todayStr()}
                    </div>
                </div>`;
        }
        function printTraceabilityCard() {
            const b = getActiveBatch();
            if (!b) { showToast('لا توجد دفعة نشطة'); return; }
            buildTraceabilityCard(b);
            const el = document.getElementById('printableReport');
            el.style.display = 'block';
            requestAnimationFrame(() => setTimeout(() => window.print(), 60));
        }
        function exportTraceabilityPDF() {
            const el = document.getElementById('printableReport');
            if (!el) { showToast('لا يوجد محتوى للتصدير'); return; }
            if (typeof html2pdf === 'undefined') { showToast('📄 مفيش اتصال بالإنترنت الآن — هنفتحلك شاشة الطباعة بدلًا من ذلك (تقدر تحفظه PDF من خيارات الطباعة)'); printTraceabilityCard(); return; }
            const b = getActiveBatch();
            if (!b) { showToast('لا توجد دفعة نشطة'); return; }
            buildTraceabilityCard(b);
            showToast('⏳ جارٍ تجهيز بطاقة التتبع...');
            el.style.display = 'block';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const opt = {
                    margin: 6,
                    filename: `katkot-pro-traceability-${traceCode(b)}.pdf`,
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: { scale: 2, useCORS: true, windowWidth: el.scrollWidth },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'] }
                };
                html2pdf().set(opt).from(el).outputPdf('blob')
                    .then(async (blob) => {
                        el.style.display = 'none';
                        const result = await downloadOrShareFile(blob, opt.filename, 'application/pdf', 'بطاقة تتبع - كتكوت Pro');
                        if (result === 'cancelled') return;
                        showToast(result !== 'failed' ? '✅ تم حفظ بطاقة التتبع' : 'حدث خطأ أثناء إنشاء PDF — جرّب مرة أخرى');
                    })
                    .catch(() => { el.style.display = 'none'; showToast('حدث خطأ أثناء إنشاء PDF — جرّب مرة أخرى'); });
            }));
        }

        // ============ كشف جرد مخزون مستقل للطباعة (مختلف عن تقرير الدورة الكامل — للعد الفعلي بالمخزن ومطابقته بالنظام) ============
        function buildInventoryPrintReport(b) {
            const el = document.getElementById('printableReport');
            if (!el) return;
            const items = [...b.inventory].sort((a, c) => a.category.localeCompare(c.category));
            const rows = items.map(it => `<tr>
                <td style="text-align:right;">${esc(it.name)}</td><td>${it.category}</td>
                <td style="font-weight:bold;">${fmt(it.balance, 1)} ${it.unit}</td>
                <td style="min-width:70px;"></td><td style="min-width:70px;"></td><td style="min-width:120px;"></td>
            </tr>`).join('');
            el.innerHTML = `
                <div style="font-family:'Tajawal','Cairo',sans-serif;max-width:100%;margin:0 auto;padding:20px;background:white;direction:rtl;font-size:12px;">
                    <div style="text-align:center;border-bottom:3px solid #2F4538;padding-bottom:10px;margin-bottom:14px;">
                        <h1 style="margin:0;color:#2F4538;font-size:22px;">📦 كشف جرد المخزون الفعلي</h1>
                        <p style="margin:4px 0 0;color:#555;font-size:14px;font-weight:bold;">${esc(b.name) || 'دفعة غير مسماة'}</p>
                        <p style="margin:2px 0 0;color:#777;font-size:12px;">تاريخ الجرد: ${todayStr()}</p>
                    </div>
                    <p style="font-size:11px;color:#777;margin:0 0 10px;">امسح المخزن فعليًا وسجّل العدد الحقيقي فى عمود "الرصيد الفعلي"، ثم قارنه بـ"الرصيد النظامي" لرصد أي فروقات (تلف، فقد، خطأ تسجيل).</p>
                    <div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px;">
                        <table border="1" cellpadding="6" style="width:100%;border-collapse:collapse;font-size:11px;background:white;">
                            <thead><tr style="background:#2F4538;color:white;">
                                <th>الصنف</th><th>التصنيف</th><th>الرصيد النظامي</th><th>الرصيد الفعلي (بالجرد)</th><th>الفرق</th><th>ملاحظات</th>
                            </tr></thead>
                            <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#999;">لا توجد أصناف بالمخزن</td></tr>'}</tbody>
                        </table>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px;">
                        <div>توقيع القائم بالجرد: ____________________</div>
                        <div>توقيع المسؤول: ____________________</div>
                    </div>
                    <div style="margin-top:20px;font-size:10px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:8px;">
                        تم إنشاء هذا الكشف تلقائيًا بواسطة تطبيق "كتكوت Pro" — © ${new Date().getFullYear()}
                    </div>
                </div>`;
        }
        function printInventoryReport() {
            const b = getActiveBatch();
            if (!b) { showToast('لا توجد دفعة نشطة'); return; }
            if (!b.inventory.length) { showToast('المخزن فارغ — لا يوجد ما يُطبع'); return; }
            buildInventoryPrintReport(b);
            const el = document.getElementById('printableReport');
            el.style.display = 'block';
            requestAnimationFrame(() => setTimeout(() => window.print(), 60));
        }

        function printReport() {
            const b = getActiveBatch();
            if (!b) { showToast('لا توجد دفعة نشطة لإنشاء التقرير'); return; }
            const m = computeMetrics(b), fin = computeFinance(b, m), alerts = computeAlerts(b, m);
            buildPrintableReport(b, m, fin, alerts);
            const el = document.getElementById('printableReport');
            // نفس السبب: لازم يبقى العنصر ظاهر فعليًا وقت رسم الرسوم البيانية عليه (قبل استدعاء print)
            // حتى تاخد الكانفاس أبعادها الصحيحة بدل ما تفضل فاضية فى الطباعة/الـ PDF على الموبايل.
            el.style.display = 'block';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                drawPrintCharts(b, m, fin);
                setTimeout(() => window.print(), 80);
            }));
        }

        // إخفاء التقرير تلقائيًا بعد انتهاء/إلغاء الطباعة حتى لا يفضل ظاهر فى الواجهة العادية
        (function setupPrintCleanup() {
            const hideReport = () => { const el = document.getElementById('printableReport'); if (el) el.style.display = 'none'; };
            window.addEventListener('afterprint', hideReport);
            if (window.matchMedia) {
                try {
                    window.matchMedia('print').addEventListener('change', (mql) => { if (!mql.matches) hideReport(); });
                } catch (e) {}
            }
        })();

        // ============ تصدير واستيراد البيانات — نسخ احتياطي JSON ============
        // ============ تصدير CSV/Excel لسجل الدفعة الحالية ============
        // ============ إدخال صوتي (Web Speech API) — مفيد أثناء العمل داخل العنبر ============
        let voiceRecognition = null;
        let voiceActiveBtn = null;
        function voiceInput(targetFieldId, btnEl) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) { showToast('⚠️ المتصفح لا يدعم الإدخال الصوتي — جرّب متصفح Chrome'); return; }
            if (voiceRecognition) { voiceRecognition.stop(); return; }
            const rec = new SR();
            rec.lang = 'ar-EG';
            rec.interimResults = false;
            rec.maxAlternatives = 1;
            voiceRecognition = rec;
            voiceActiveBtn = btnEl;
            if (btnEl) { btnEl.textContent = '🔴'; btnEl.classList.add('gold'); }
            rec.onresult = (e) => {
                const transcript = e.results[0][0].transcript;
                const field = document.getElementById(targetFieldId);
                if (field) field.value = (field.value ? field.value + ' ' : '') + transcript;
            };
            rec.onerror = () => { showToast('⚠️ تعذّر التعرف على الصوت، حاول مرة أخرى'); };
            rec.onend = () => {
                if (voiceActiveBtn) { voiceActiveBtn.textContent = '🎤'; voiceActiveBtn.classList.remove('gold'); }
                voiceRecognition = null; voiceActiveBtn = null;
            };
            rec.start();
        }

        // ============ مشاركة ملخص اليوم على واتساب ============
        function shareWhatsapp() {
            const b = getActiveBatch();
            if (!b) { showToast('اختر دفعة أولاً'); return; }
            const m = computeMetrics(b);
            const todayRec = b.records.find(r => r.date === todayStr());
            const lines = [
                `🐔 *${b.name}* — ملخص يوم ${todayStr()}`,
                `العمر: ${m.todayAge} يوم`,
                `الأعداد الحية: ${fmt(m.liveCount,0)} (${fmt(m.liveCountPct,1)}%)`,
                `نسبة النفوق التراكمية: ${fmt(m.mortRate,2)}%`,
                `متوسط الوزن: ${fmt(m.avgWeightG,0)} جم`,
                `FCR: ${m.fcr ? fmt(m.fcr,2) : '—'}`,
            ];
            if (todayRec) {
                lines.push(`نفوق اليوم: ${todayRec.mort || 0} · علف اليوم: ${fmt(todayRec.feed||0,1)} كجم`);
            }
            const finWA = computeFinance(b, m);
            const saleAdvWA = computeMarketSaleAdvice(b, m, finWA);
            if (saleAdvWA.osd && saleAdvWA.advice) {
                lines.push('', `${saleAdvWA.adviceIcon || '🎯'} قرار البيع: ${saleAdvWA.advice}`);
            }
            lines.push('', '📱 تم الإنشاء بواسطة كتكوت Pro');
            const text = encodeURIComponent(lines.join('\n'));
            const url = `https://wa.me/?text=${text}`;
            window.open(url, '_blank');
        }

        function exportCSV() {
            const b = getActiveBatch();
            if (!b) { showToast('اختر دفعة أولاً'); return; }
            try {
                const headers = ['التاريخ', 'العمر', 'نفوق', 'مستبعد', 'علف(كجم)', 'ماء(لتر)', 'الوزن(جم)', 'حرارة', 'رطوبة', 'ملاحظات'];
                const rows = [...b.records].sort((a, c) => a.age - c.age).map(r => [
                    r.date, r.age, r.mort || 0, r.cull || 0, r.feed || '', r.water ?? '', r.weight ?? '', r.temp ?? '', r.humidity ?? '',
                    (r.notes || '').replace(/[\r\n,]+/g, ' ')
                ]);
                const csvLines = [headers.join(','), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))];
                const csvContent = '\uFEFF' + csvLines.join('\r\n'); // BOM لدعم عرض العربي صحيحًا فى إكسل
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const filename = `${b.name.replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, '_')}-سجل-${todayStr()}.csv`;
                downloadOrShareFile(blob, filename, 'text/csv', 'سجل الدفعة CSV').then(result => {
                    showToast(result !== 'failed' ? '✅ تم تصدير السجل بصيغة CSV/Excel' : 'حدث خطأ أثناء التصدير');
                });
            } catch (e) { showToast('حدث خطأ أثناء تصدير CSV'); }
        }

        // ============ تصدير Excel حقيقي (.xlsx) — ورقتين: السجل اليومي الكامل + ملخص أداء الدورة ============
        function exportXLSX() {
            const b = getActiveBatch();
            if (!b) { showToast('اختر دفعة أولاً'); return; }
            if (typeof XLSX === 'undefined') { showToast('⚠️ مكتبة إكسل لسه بتتحمّل، جرّب تاني بعد ثانية (محتاج إنترنت أول مرة)'); return; }
            try {
                const m = computeMetrics(b);
                const fin = computeFinance(b, m);
                // ===== ورقة 1: السجل اليومي التفصيلي =====
                const headers = ['التاريخ', 'العمر', 'نفوق نهار', 'نفوق ليل', 'إجمالي نفوق', 'مستبعد', 'علف(كجم)', 'ماء(لتر)', 'الوزن(جم)', 'حرارة°', 'رطوبة%', 'أمونيا ppm', 'ملاحظات'];
                const dataRows = [...b.records].sort((a, c) => a.age - c.age).map(r => [
                    r.date, r.age, r.mortDay ?? '', r.mortNight ?? '', r.mort || 0, r.cull || 0,
                    r.feed || '', r.water ?? '', r.weight ?? '', r.temp ?? '', r.humidity ?? '', r.nh3 ?? '', r.notes || ''
                ]);
                const ws1 = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
                ws1['!cols'] = headers.map(() => ({ wch: 14 }));
                // ===== ورقة 2: ملخص أداء الدورة =====
                const summaryRows = [
                    ['المؤشر', 'القيمة'],
                    ['اسم الدفعة', b.name],
                    ['النوع', expansionSpeciesLabel(b.species)],
                    ['تاريخ التسكين', b.startDate || '—'],
                    ['العمر الحالي (يوم)', m.todayAge],
                    ['الأعداد الحية', fmt(m.liveCount, 0)],
                    ['نسبة البقاء %', fmt(m.liveCountPct, 1)],
                    ['نسبة النفوق التراكمية %', fmt(m.mortRate, 2)],
                    ['متوسط الوزن (جم)', fmt(m.avgWeightG, 0)],
                    ['معامل التحويل الغذائي FCR', m.fcr ? fmt(m.fcr, 2) : '—'],
                    ['EPEF', m.epef != null ? fmt(m.epef, 0) : '—'],
                    ['إجمالي الإيرادات', fmt(fin.totalRevenue, 0)],
                    ['إجمالي التكاليف', fmt(fin.totalCost, 0)],
                    ['صافي الربح', fmt(fin.netProfit, 0)],
                    ['تكلفة الكيلو', fin.costPerKg != null ? fmt(fin.costPerKg, 2) : '—'],
                ];
                const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
                ws2['!cols'] = [{ wch: 26 }, { wch: 20 }];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws2, 'ملخص الأداء');
                XLSX.utils.book_append_sheet(wb, ws1, 'السجل اليومي');
                const filename = `${b.name.replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, '_')}-تقرير-${todayStr()}.xlsx`;
                const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                downloadOrShareFile(blob, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'تقرير الدفعة Excel').then(result => {
                    showToast(result !== 'failed' ? '✅ تم تصدير تقرير Excel (ورقتين: ملخص + سجل يومي)' : 'حدث خطأ أثناء التصدير');
                });
            } catch (e) { showToast('حدث خطأ أثناء تصدير Excel'); }
        }

        // ============ تشفير النسخ الاحتياطية (AES-GCM + PBKDF2) — اختياري، لحماية البيانات لو النسخة اتشاركت أو اتسرّبت ============
        async function deriveBackupKey(passphrase, saltBytes) {
            const enc = new TextEncoder();
            const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' },
                baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
            );
        }
        function bufToB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
        function b64ToBuf(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }

        async function encryptBackupJson(plainText, passphrase) {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await deriveBackupKey(passphrase, salt);
            const enc = new TextEncoder();
            const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
            return JSON.stringify({ katkotEncrypted: true, v: 1, salt: bufToB64(salt), iv: bufToB64(iv), data: bufToB64(cipherBuf) });
        }

        async function decryptBackupJson(envelope, passphrase) {
            const salt = b64ToBuf(envelope.salt), iv = b64ToBuf(envelope.iv), data = b64ToBuf(envelope.data);
            const key = await deriveBackupKey(passphrase, salt);
            const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
            return new TextDecoder().decode(plainBuf);
        }

        // ============ نسخة احتياطية تلقائية مجدولة (أسبوعية) — تعمل فقط لو الجهاز فاتح التطبيق ومفعّل الخيار ============
        function checkAutoBackup() {
            if (!state.autoBackupEnabled) return;
            const last = state.lastAutoBackupAt || state.lastBackupDate;
            const daysSince = last ? Math.floor((new Date(todayStr()) - new Date(last)) / 86400000) : 999;
            if (daysSince < 7) return;
            try {
                const dataStr = JSON.stringify(state, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                downloadOrShareFile(blob, `katkot-pro-backup-auto-${todayStr()}.json`, 'application/json', 'نسخة احتياطية تلقائية - كتكوت Pro').then(result => {
                    if (result !== 'failed' && result !== 'cancelled') {
                        setState('lastAutoBackupAt', todayStr());
                        setState('lastBackupDate', todayStr());
                        persist();
                        showToast('✅ تم أخذ نسخة احتياطية أسبوعية تلقائية');
                    }
                });
            } catch (e) {}
        }
        function toggleAutoBackup() {
            setState('autoBackupEnabled', document.getElementById('as_autoBackup').checked);
            persist();
            showToast(state.autoBackupEnabled ? '✅ تفعيل النسخ الاحتياطي التلقائي الأسبوعي' : 'تم إيقاف النسخ الاحتياطي التلقائي');
            if (state.autoBackupEnabled) setTimeout(checkAutoBackup, 500);
        }

        function finishExport(finalStr, filename) {
            const blob = new Blob([finalStr], { type: 'application/json' });
            downloadOrShareFile(blob, filename, 'application/json', 'نسخة احتياطية - كتكوت Pro').then(result => {
                if (result === 'cancelled') return;
                if (result !== 'failed') { setState('lastBackupDate', todayStr()); persist(); }
                showToast(result !== 'failed' ? '✅ تم حفظ النسخة الاحتياطية — يمكنك إيجادها فى تطبيق الملفات' : 'حدث خطأ أثناء التصدير');
            });
        }
        function saveFarmName() {
            if (!requirePermission('management')) return; // 🔒 Red Team fix (جولة 3)
            const name = document.getElementById('set_farmName').value.trim();
            setState('farmName', name || null);
            persist();
            updateHeaderIdentity();
            showToast('✅ تم تحديث اسم المزرعة');
        }
