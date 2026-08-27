        function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; let m; if (
                n <= 1) m = 1;
            else if (n <= 2) m = 2;
            else if (n <= 2.5) m = 2.5;
            else if (n <= 5) m = 5;
            else m = 10; return m * p; }

        function prepCanvas(canvas) {
            const dpr = window.devicePixelRatio || 1;
            const cssW = Math.max((canvas.parentElement.clientWidth || 320) - 32, 240);
            const cssH = parseInt(canvas.getAttribute('height')) || 180;
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
            canvas.style.width = cssW + 'px';
            canvas.style.height = cssH + 'px';
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssW, cssH);
            return { ctx, w: cssW, h: cssH };
        }

        function sparseLabels(labels, n) { const every = Math.max(Math.ceil(labels.length / n), 1); return labels.map((l, i) =>
                (i % every === 0 || i === labels.length - 1) ? l : null); }

        function smoothPath(ctx, pts) {
            if (pts.length < 2) { if (pts.length === 1) { ctx.moveTo(pts[0][0], pts[0][1]); } return; }
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i],
                    p1 = pts[i + 1];
                const midX = (p0[0] + p1[0]) / 2,
                    midY = (p0[1] + p1[1]) / 2;
                ctx.quadraticCurveTo(p0[0], p0[1], midX, midY);
            }
            ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        }

        // ============================================================================================
        // ⚡ محرك الرسم البياني المتطور (V2) — حركة رسم تدريجية حقيقية بالفريم + سحب تفاعلي مستمر
        // (Crosshair يتبع إصبعك زي تطبيقات الأسهم/الاستثمار) + تلميحات مصقولة. نفس توقيعات الدوال
        // الأربعة الأصلية بالظبط (drawLineChart/drawBarChart/drawComboChart/drawPieChart) — يعني كل
        // الأماكن اللي بتستخدمهم فى التطبيق (11 مكان) هتشتغل تلقائيًا بدون أي تعديل فيها.
        // ============================================================================================
        const _chartAnimState = {}; // canvasId -> { raf, sig }
        const _chartRedraw = {}; // canvasId -> function(hoverPx|null) — إعادة رسم فورية بدون حركة (للسحب)

        function _chartSig(...parts) { try { return JSON.stringify(parts); } catch (e) { return String(Math.random()); } }
        function _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
        function _easeOutBack(t) { const c = 1.7; return 1 + c * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

        // يشغّل حركة رسم تدريجية لكانفاس معيّن، أو يرسم فورًا (بدون حركة) لو نفس البيانات بالظبط
        // اتّرسمت قبل كده (بيمنع "وميض" الحركة المزعج لو التطبيق عمل إعادة رسم عامة مش متعلقة بيانات الرسمة دي)
        function _runChartAnim(canvasId, sig, durationMs, frameFn) {
            const prev = _chartAnimState[canvasId];
            if (prev && prev.raf) cancelAnimationFrame(prev.raf);
            if (prev && prev.sig === sig) { frameFn(1); return; }
            const t0 = performance.now();
            function step(now) {
                const p = Math.min((now - t0) / durationMs, 1);
                frameFn(_easeOutCubic(p));
                if (p < 1) _chartAnimState[canvasId] = { raf: requestAnimationFrame(step), sig };
                else _chartAnimState[canvasId] = { raf: null, sig };
            }
            _chartAnimState[canvasId] = { raf: requestAnimationFrame(step), sig };
        }

        let _chartTipEl = null;
        function _chartTip() {
            if (_chartTipEl && document.body.contains(_chartTipEl)) return _chartTipEl;
            _chartTipEl = document.createElement('div');
            _chartTipEl.className = 'chart-tooltip-v2';
            document.body.appendChild(_chartTipEl);
            return _chartTipEl;
        }
        function _showChartTip(clientX, clientY, html) {
            const tip = _chartTip();
            tip.innerHTML = html;
            tip.classList.remove('below');
            tip.style.left = clientX + 'px';
            tip.style.top = clientY + 'px';
            tip.classList.add('show');
            requestAnimationFrame(() => {
                const r = tip.getBoundingClientRect(),
                    m = 8;
                let dx = 0;
                if (r.left < m) dx = m - r.left;
                if (r.right > innerWidth - m) dx = -(r.right - innerWidth + m);
                if (dx) tip.style.left = (clientX + dx) + 'px';
                if (r.top < m) tip.classList.add('below');
            });
        }
        function _hideChartTip() { if (_chartTipEl) _chartTipEl.classList.remove('show'); }

        // نرسم شبكة الخلفية + تسميات المحور الرأسي — نفس المنطق فى كل الأنواع، مستخرج مرة واحدة
        function _drawGrid(ctx, pad, w, plotW, plotH, maxV, formatFn, rightFormatFn, maxVRight) {
            for (let i = 0; i <= 4; i++) {
                const y = pad.t + plotH * (i / 4);
                const val = maxV - (maxV * (i / 4));
                ctx.strokeStyle = '#EFEAE0';
                ctx.setLineDash(i === 4 ? [] : [4, 4]);
                ctx.beginPath();
                ctx.moveTo(pad.l, y);
                ctx.lineTo(w - pad.r, y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.font = '10.5px Tajawal,sans-serif';
                ctx.fillStyle = '#9b9690';
                ctx.textAlign = 'left';
                ctx.fillText(formatFn(val), 2, y + 3);
                if (rightFormatFn && maxVRight != null) {
                    const valR = maxVRight - (maxVRight * (i / 4));
                    ctx.textAlign = 'right';
                    ctx.fillText(rightFormatFn(valR), w - 2, y + 3);
                }
            }
        }
        function _emptyState(ctx, w, h) {
            ctx.fillStyle = '#9b9690';
            ctx.font = '13px Tajawal,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('لا توجد بيانات كافية لعرض الرسم البياني', w / 2, h / 2);
        }
        // أقرب index لعمود بيانات بالنسبة لموضع لمسة x — مشترك بين كل الأنواع اللي فيها محور أفقي بفترات متساوية
        function _nearestIndex(x, pad, step, n) { return Math.max(0, Math.min(n - 1, Math.round((x - pad.l) / step))); }

        function drawLineChart(canvasId, labels, series) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const { ctx, w, h } = prepCanvas(canvas);
            let vals = [];
            series.forEach(s => s.data.forEach(v => { if (v != null && !isNaN(v)) vals.push(v); }));
            if (vals.length === 0) { _emptyState(ctx, w, h); _chartRedraw[canvasId] = null; return; }
            const pad = { l: 38, r: 12, t: 14, b: 24 };
            const plotW = w - pad.l - pad.r,
                plotH = h - pad.t - pad.b;
            const n = labels.length;
            const maxV = niceMax(Math.max(...vals) * 1.12),
                minV = 0;
            const xStep = n > 1 ? plotW / (n - 1) : 0;
            const seriesPts = series.map(s => {
                const pts = [];
                s.data.forEach((v, i) => { if (v == null || isNaN(v)) return;
                    pts.push([pad.l + xStep * i, pad.t + plotH * (1 - (v - minV) / (maxV - minV || 1)), i]); });
                return pts;
            });

            function frame(p, hoverPx) {
                ctx.clearRect(0, 0, w, h);
                ctx.font = '10.5px Tajawal,sans-serif';
                ctx.lineWidth = 1;
                _drawGrid(ctx, pad, w, plotW, plotH, maxV, v => Math.round(v).toLocaleString('ar-EG'));
                const labs = sparseLabels(labels, 6);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#9b9690';
                labs.forEach((lab, i) => { if (lab != null) ctx.fillText(lab, pad.l + xStep * i, h - 6); });
                // كشف تدريجي من اليسار لليمين (كل السلاسل مع بعض بنفس النسبة) — إحساس "بيترسم قدامك"
                const revealX = pad.l + plotW * p;
                series.forEach((s, si) => {
                    const pts = seriesPts[si];
                    if (pts.length === 0) return;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, revealX, h);
                    ctx.clip();
                    if (s.fill) {
                        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
                        grad.addColorStop(0, s.fillTop || 'rgba(217,165,68,.30)');
                        grad.addColorStop(1, s.fillBottom || 'rgba(217,165,68,.02)');
                        ctx.beginPath();
                        smoothPath(ctx, pts.map(pt => [pt[0], pt[1]]));
                        ctx.lineTo(pts[pts.length - 1][0], pad.t + plotH);
                        ctx.lineTo(pts[0][0], pad.t + plotH);
                        ctx.closePath();
                        ctx.fillStyle = grad;
                        ctx.fill();
                    }
                    ctx.beginPath();
                    ctx.setLineDash(s.dashed ? [7, 5] : []);
                    smoothPath(ctx, pts.map(pt => [pt[0], pt[1]]));
                    ctx.strokeStyle = s.color;
                    ctx.lineWidth = 2.6;
                    ctx.lineJoin = 'round';
                    ctx.lineCap = 'round';
                    ctx.stroke();
                    ctx.setLineDash([]);
                    if (s.points) pts.forEach(pt => { ctx.beginPath();
                        ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
                        ctx.fillStyle = '#fff';
                        ctx.fill();
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = s.color;
                        ctx.stroke(); });
                    ctx.restore();
                });
                // 🎯 خط السحب التفاعلي (Crosshair) — بيظهر بس لما فى تفاعل فعلي، وبيوقف الرسم عند أبعد نقطة كُشفت فعلاً
                if (hoverPx != null && p >= 0.999) {
                    const idx = _nearestIndex(hoverPx, pad, xStep, n);
                    const cx = pad.l + xStep * idx;
                    ctx.save();
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = '#B8B0A0';
                    ctx.moveTo(cx, pad.t);
                    ctx.lineTo(cx, pad.t + plotH);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    let rows = '';
                    series.forEach(s => {
                        const v = s.data[idx];
                        if (v == null || isNaN(v)) return;
                        const py = pad.t + plotH * (1 - (v - minV) / (maxV - minV || 1));
                        ctx.beginPath();
                        ctx.arc(cx, py, 5, 0, Math.PI * 2);
                        ctx.fillStyle = '#fff';
                        ctx.fill();
                        ctx.lineWidth = 2.5;
                        ctx.strokeStyle = s.color;
                        ctx.stroke();
                        rows += `<div class="ctp-row"><span class="ctp-dot" style="background:${s.color}"></span>${s.label ? esc(s.label) + ': ' : ''}<span class="ctp-val">${fmt(v, s.decimals != null ? s.decimals : 1)}</span></div>`;
                    });
                    ctx.restore();
                    if (rows) {
                        const rect = canvas.getBoundingClientRect();
                        const title = labels[idx] != null ? `<div class="ctp-title">${esc(String(labels[idx]))}</div>` : '';
                        _showChartTip(rect.left + cx, rect.top + pad.t - 6, title + rows);
                    }
                } else if (p >= 0.999) { _hideChartTip(); }
            }
            const sig = _chartSig('line', canvasId, labels, series.map(s => [s.color, s.data]));
            _chartRedraw[canvasId] = (hoverPx) => frame(1, hoverPx);
            _runChartAnim(canvasId, sig, 550, p => frame(p, null));
            _bindChartScrub(canvas, pad, xStep, n);
        }

        function drawBarChart(canvasId, labels, data, color) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const { ctx, w, h } = prepCanvas(canvas);
            const vals = data.filter(v => v != null && !isNaN(v));
            if (vals.length === 0) { _emptyState(ctx, w, h); _chartRedraw[canvasId] = null; return; }
            const pad = { l: 38, r: 12, t: 14, b: 24 };
            const plotW = w - pad.l - pad.r,
                plotH = h - pad.t - pad.b;
            const n = labels.length;
            const maxV = niceMax(Math.max(...vals) * 1.15) || 1;
            const slot = plotW / n;
            const barW = Math.max(Math.min(slot * 0.55, 24), 2);

            function frame(p, activeIdx) {
                ctx.clearRect(0, 0, w, h);
                ctx.font = '10.5px Tajawal,sans-serif';
                _drawGrid(ctx, pad, w, plotW, plotH, maxV, v => Math.round(v).toLocaleString('ar-EG'));
                data.forEach((v, i) => {
                    if (v == null || isNaN(v)) return;
                    const x = pad.l + slot * i + (slot - barW) / 2;
                    const barH = plotH * (v / maxV) * p;
                    const active = i === activeIdx;
                    const grad = ctx.createLinearGradient(0, pad.t + plotH - barH, 0, pad.t + plotH);
                    grad.addColorStop(0, active ? color : color);
                    grad.addColorStop(1, color + (active ? 'CC' : 'AA'));
                    ctx.fillStyle = grad;
                    ctx.globalAlpha = active || activeIdx == null ? 1 : .55;
                    ctx.beginPath();
                    ctx.roundRect ? ctx.roundRect(x, pad.t + plotH - barH, barW, Math.max(barH, 1), [3, 3, 0, 0]) : ctx
                        .rect(x, pad.t + plotH - barH, barW, Math.max(barH, 1));
                    ctx.fill();
                    ctx.globalAlpha = 1;
                });
                const labs = sparseLabels(labels, 6);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#9b9690';
                labs.forEach((lab, i) => { if (lab != null) ctx.fillText(lab, pad.l + slot * i + slot / 2, h - 6); });
                if (activeIdx != null && p >= 0.999 && data[activeIdx] != null) {
                    const rect = canvas.getBoundingClientRect();
                    const x = pad.l + slot * activeIdx + slot / 2;
                    const title = labels[activeIdx] != null ? `<div class="ctp-title">${esc(String(labels[activeIdx]))}</div>` : '';
                    _showChartTip(rect.left + x, rect.top + pad.t, title + `<div class="ctp-row"><span class="ctp-dot" style="background:${color}"></span><span class="ctp-val">${fmt(data[activeIdx],1)}</span></div>`);
                } else if (p >= 0.999) { _hideChartTip(); }
            }
            const sig = _chartSig('bar', canvasId, labels, data, color);
            _chartRedraw[canvasId] = (hoverPx) => frame(1, hoverPx == null ? null : _nearestIndex(hoverPx, pad, slot, n));
            _runChartAnim(canvasId, sig, 550, p => frame(p, null));
            _bindChartScrub(canvas, pad, slot, n);
        }

        function drawComboChart(canvasId, labels, bars, barColor, line, lineColor) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const { ctx, w, h } = prepCanvas(canvas);
            const barVals = bars.filter(v => v != null && !isNaN(v));
            const lineVals = line.filter(v => v != null && !isNaN(v));
            if (barVals.length === 0) { _emptyState(ctx, w, h); _chartRedraw[canvasId] = null; return; }
            const hasLine = lineVals.length > 0;
            const pad = hasLine ? { l: 38, r: 38, t: 14, b: 24 } : { l: 38, r: 12, t: 14, b: 24 };
            const plotW = w - pad.l - pad.r,
                plotH = h - pad.t - pad.b;
            const n = labels.length;
            const maxBar = niceMax(Math.max(...barVals) * 1.2) || 1;
            const maxLine = hasLine ? (niceMax(Math.max(...lineVals) * 1.2) || 1) : 1;
            const slot = plotW / n;
            const barW = Math.max(Math.min(slot * 0.5, 20), 2);
            const xStep = n > 1 ? plotW / (n - 1) : 0;
            const pts = [];
            line.forEach((v, i) => { if (v == null || isNaN(v)) return;
                pts.push([pad.l + xStep * i, pad.t + plotH * (1 - v / maxLine), i]); });

            function frame(p, activeIdx) {
                ctx.clearRect(0, 0, w, h);
                ctx.font = '10px Tajawal,sans-serif';
                _drawGrid(ctx, pad, w, plotW, plotH, maxBar, v => Math.round(v).toLocaleString('ar-EG'),
                    hasLine ? v => v.toFixed(1) : null, hasLine ? maxLine : null);
                bars.forEach((v, i) => { if (v == null || isNaN(v)) return;
                    const x = pad.l + slot * i + (slot - barW) / 2;
                    const barH = plotH * (v / maxBar) * p;
                    ctx.fillStyle = barColor;
                    ctx.globalAlpha = activeIdx == null || i === activeIdx ? 1 : .5;
                    ctx.beginPath();
                    ctx.roundRect ? ctx.roundRect(x, pad.t + plotH - barH, barW, Math.max(barH, 1), [3, 3, 0, 0]) : ctx
                        .rect(x, pad.t + plotH - barH, barW, Math.max(barH, 1));
                    ctx.fill();
                    ctx.globalAlpha = 1; });
                if (pts.length > 0) {
                    const revealX = pad.l + plotW * p;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, revealX, h);
                    ctx.clip();
                    ctx.beginPath();
                    smoothPath(ctx, pts.map(pt => [pt[0], pt[1]]));
                    ctx.strokeStyle = lineColor;
                    ctx.lineWidth = 2.6;
                    ctx.lineJoin = 'round';
                    ctx.lineCap = 'round';
                    ctx.stroke();
                    pts.forEach(pt => { ctx.beginPath();
                        ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
                        ctx.fillStyle = '#fff';
                        ctx.fill();
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = lineColor;
                        ctx.stroke(); });
                    ctx.restore();
                }
                const labs = sparseLabels(labels, 6);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#9b9690';
                labs.forEach((lab, i) => { if (lab != null) ctx.fillText(lab, pad.l + slot * i + slot / 2, h - 6); });
                if (activeIdx != null && p >= 0.999) {
                    const rect = canvas.getBoundingClientRect();
                    const x = pad.l + slot * activeIdx + slot / 2;
                    const title = labels[activeIdx] != null ? `<div class="ctp-title">${esc(String(labels[activeIdx]))}</div>` : '';
                    let rows = '';
                    if (bars[activeIdx] != null) rows += `<div class="ctp-row"><span class="ctp-dot" style="background:${barColor}"></span><span class="ctp-val">${fmt(bars[activeIdx],1)}</span></div>`;
                    if (hasLine && line[activeIdx] != null) rows += `<div class="ctp-row"><span class="ctp-dot" style="background:${lineColor}"></span><span class="ctp-val">${fmt(line[activeIdx],2)}</span></div>`;
                    if (rows) _showChartTip(rect.left + x, rect.top + pad.t, title + rows);
                } else if (p >= 0.999) { _hideChartTip(); }
            }
            const sig = _chartSig('combo', canvasId, labels, bars, line);
            _chartRedraw[canvasId] = (hoverPx) => frame(1, hoverPx == null ? null : _nearestIndex(hoverPx, pad, slot, n));
            _runChartAnim(canvasId, sig, 550, p => frame(p, null));
            _bindChartScrub(canvas, pad, slot, n);
        }

        function drawPieChart(canvasId, legendId, segments) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const { ctx, w, h } = prepCanvas(canvas);
            const legendEl = legendId ? document.getElementById(legendId) : null;
            const valid = segments.filter(s => s.value > 0);
            const total = valid.reduce((s, x) => s + x.value, 0);
            if (total <= 0) { _emptyState(ctx, w, h); if (legendEl) legendEl.innerHTML = ''; _chartRedraw[canvasId] = null; return; }
            const cx = w / 2,
                cy = h / 2,
                r = Math.max(Math.min(w, h) / 2 - 10, 10);

            function frame(p, activeAngle) {
                ctx.clearRect(0, 0, w, h);
                let start = -Math.PI / 2;
                const fullSweep = Math.PI * 2 * p;
                let consumed = 0;
                let activeSeg = null;
                valid.forEach(seg => {
                    const fullAngle = (seg.value / total) * Math.PI * 2;
                    const angle = Math.max(0, Math.min(fullAngle, fullSweep - consumed));
                    consumed += fullAngle;
                    if (angle <= 0) return;
                    const isActive = activeAngle != null && activeAngle >= start && activeAngle <= start + fullAngle && p >= 0.999;
                    if (isActive) activeSeg = seg;
                    const rr = isActive ? r * 1.035 : r;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, rr, start, start + angle);
                    ctx.closePath();
                    ctx.fillStyle = seg.color;
                    ctx.globalAlpha = activeAngle == null || isActive ? 1 : .6;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    start += fullAngle;
                });
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
                ctx.fillStyle = '#FFFDF6';
                ctx.fill();
                ctx.fillStyle = '#6B4226';
                ctx.font = '900 13px Cairo,sans-serif';
                ctx.textAlign = 'center';
                if (activeSeg) {
                    ctx.font = '900 12px Cairo,sans-serif';
                    ctx.fillText(money(activeSeg.value), cx, cy);
                    ctx.font = '700 9.5px Tajawal,sans-serif';
                    ctx.fillStyle = '#9b9690';
                    ctx.fillText(activeSeg.label, cx, cy + 14);
                } else {
                    ctx.fillText(money(total), cx, cy + 4);
                }
                if (legendEl) {
                    legendEl.innerHTML = valid.map(s => `<span><span class="dot" style="background:${s.color}"></span>${s.label} (${fmt((s.value / total) * 100, 1)}%)</span>`).join('');
                }
                if (activeSeg && p >= 0.999) {
                    const rect = canvas.getBoundingClientRect();
                    _showChartTip(rect.left + cx, rect.top + cy - r * 0.6,
                        `<div class="ctp-title">${esc(activeSeg.label)}</div><div class="ctp-row"><span class="ctp-dot" style="background:${activeSeg.color}"></span><span class="ctp-val">${fmt((activeSeg.value/total)*100,1)}%</span></div>`);
                } else if (p >= 0.999) { _hideChartTip(); }
            }
            const sig = _chartSig('pie', canvasId, valid.map(s => [s.label, s.value]));
            _chartRedraw[canvasId] = (hoverPx, hoverPy) => {
                if (hoverPx == null) { frame(1, null); return; }
                const ang = Math.atan2(hoverPy - cy, hoverPx - cx);
                const d = Math.hypot(hoverPx - cx, hoverPy - cy);
                if (d > r || d < r * 0.55) { frame(1, null); return; }
                let a = ang;
                while (a < -Math.PI / 2) a += Math.PI * 2;
                frame(1, a);
            };
            _runChartAnim(canvasId, sig, 600, p => frame(p, null));
            _bindChartScrub(canvas, null, null, null, true);
        }

        // نربط أحداث اللمس/السحب مرة واحدة فقط لكل عنصر canvas — بيستدعي _chartRedraw[id] المُسجَّلة
        // آخر مرة اترسمت فيها هذه الرسمة تحديدًا (بدون إعادة تشغيل حركة الدخول، رسم فوري بس)
        function _bindChartScrub(canvas, pad, step, n, isPie) {
            if (canvas.dataset._scrubBound === '1') return;
            canvas.dataset._scrubBound = '1';
            canvas.style.touchAction = 'pan-y';
            const move = (clientX, clientY) => {
                const rect = canvas.getBoundingClientRect();
                const x = clientX - rect.left,
                    y = clientY - rect.top;
                const fn = _chartRedraw[canvas.id];
                if (fn) fn(x, y);
            };
            const end = () => { const fn = _chartRedraw[canvas.id]; if (fn) fn(null); _hideChartTip(); };
            canvas.addEventListener('pointerdown', e => move(e.clientX, e.clientY));
            canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons > 0) move(e.clientX, e.clientY); });
            canvas.addEventListener('pointerup', end);
            canvas.addEventListener('pointerleave', end);
            document.addEventListener('scroll', end, { passive: true });
        }

        function redrawDashboardChartsIfNeeded() {
            const b = getActiveBatch();
            if (!b) return;
            const m = computeMetrics(b), fin = computeFinance(b, m);
            requestAnimationFrame(() => drawDashboardCharts(b, m, fin));
        }
        function drawDashboardCharts(b, m, fin, suffix) {
            suffix = suffix || '';
            const series = m.series;
            if (!series || !series.length) return;
            const labels = series.map(r => 'يوم ' + r.age);
            drawLineChart('chartWeight' + suffix, labels, [
                { data: series.map(r => r.stdW || null), color: '#6B4226', dashed: true, label: 'المعيار' },
                { data: series.map(r => r.effWeight), color: '#D9A544', fill: true, points: true, label: 'الفعلي' }
            ]);
            drawBarChart('chartMort' + suffix, labels, series.map(r => r.cumMort + r.cumCull), '#C1443C');
            if (!suffix) {
                const uniRecs = (b.records || []).filter(r => Array.isArray(r.weightSample) && r.weightSample.length >= 3).sort((a, c) => a.age - c.age);
                if (uniRecs.length >= 2 && document.getElementById('chartUniformity')) {
                    const uLabels = uniRecs.map(r => 'يوم ' + r.age);
                    const cvVals = uniRecs.map(r => { const u = computeUniformity(r.weightSample); return u ? +u.cv.toFixed(1) : null; });
                    drawLineChart('chartUniformity', uLabels, [
                        { data: cvVals, color: '#C1443C', fill: true, points: true, label: 'التجانس CV%' },
                        { data: uLabels.map(() => 8), color: '#9b9690', dashed: true, label: 'الحد المستهدف' }
                    ]);
                }
            }
            drawComboChart('chartFeed' + suffix, labels, series.map(r => (r.feed != null && r.feed > 0) ? r.feed : null), '#2F4538', series.map(r => r.fcr || null), '#C1443C');
            const priceLog = getBatchMarketPriceLog(b);
            if (priceLog.length) {
                drawLineChart('chartMarketPrice' + suffix, priceLog.map(p => p.date.slice(5)),
                    [{ data: priceLog.map(p => p.price), color: '#B45A2E', fill: true, points: true, label: 'سعر البورصة' }]);
            } else {
                drawLineChart('chartMarketPrice' + suffix, [], []);
            }
        }

        function drawFinanceCharts(fin, suffix) {
            suffix = suffix || '';
            drawPieChart('chartCostPie' + suffix, 'costPieLegend' + suffix, [
                { label: 'علف', value: fin.feedCost, color: '#2F4538' },
                { label: 'كتاكيت', value: fin.chickCost, color: '#D9A544' },
                { label: 'أدوية ولقاحات', value: fin.medFromPurchases, color: '#C1443C' },
                { label: 'فرشة وتدفئة', value: fin.beddingFromPurchases, color: '#B45A2E' },
                { label: 'وقود التدفئة', value: fin.heatCost, color: '#6B4226' },
                { label: 'الذبح والتصنيع', value: fin.processingCost, color: '#9b9690' },
                { label: 'إضافات وكهرباء وعمالة وأخرى', value: fin.addFromPurchases + fin.utilFromPurchases + fin.laborFromPurchases + fin.otherFromPurchases, color: '#7a8c6a' },
                { label: 'بنود إضافية', value: fin.customCosts, color: '#4a6fa5' },
            ]);
            drawPieChart('chartRevPie' + suffix, 'revPieLegend' + suffix, [
                { label: 'إيراد اللحم', value: fin.meatRevenue, color: '#2C7A4B' },
                { label: 'إيراد السبلة', value: fin.litterRevenue, color: '#D9A544' },
                { label: 'بنود إضافية', value: fin.customRevenue, color: '#4a6fa5' },
            ]);
        }

        // ============ Notifications — إشعارات المتصفح ============
        // ============ صوت تنبيه داخل التطبيق (Web Audio API) — بديل يعمل فى كل المتصفحات حتى لو Notification API غير مدعومة، ولا يحتاج أي إذن خاص ============
        function playAlertBeep() {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                [880, 1046].forEach((freq, i) => {
                    const osc = ctx.createOscillator(), gain = ctx.createGain();
                    osc.type = 'sine'; osc.frequency.value = freq;
                    osc.connect(gain); gain.connect(ctx.destination);
                    const start = ctx.currentTime + i * 0.22;
                    gain.gain.setValueAtTime(0.0001, start);
                    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
                    osc.start(start); osc.stop(start + 0.22);
                });
            } catch (e) { showToast('⚠️ تعذّر تشغيل الصوت فى هذا المتصفح'); }
        }
        function toggleSoundAlert() {
            state.appSettings.soundAlertEnabled = document.getElementById('as_soundAlert').checked;
            persist();
            if (state.appSettings.soundAlertEnabled) playAlertBeep();
        }

        // ============ Service Worker للإشعارات — تسجيله ضروري لظهور الإشعارات فعليًا فى الستارة العلوية للموبايل ============
        // على أندرويد/كروم بالذات، استدعاء new Notification() مباشرة من صفحة الويب كتير بيتجاهله المتصفح
        // أو بيفشل بصمت من غير ما يوصل للستارة العلوية — الطريقة المدعومة فعليًا هي عبر Service Worker
        // (registration.showNotification). بما إن التطبيق ملف واحد بدون سيرفر، بنسجّل الـ Service Worker
        // من كود مكتوب جوه الملف نفسه (Blob URL) بدل ملف .js منفصل، عشان يفضل التطبيق ملف واحد كامل.
        // ملحوظة مهمة: ده بيشتغل بس لو التطبيق متفتح من رابط https (أو مُثبَّت كـ PWA)، مش لو بتفتح
        // الملف مباشرة من الجهاز (file://) — الـ Service Worker مش مسموح له يشتغل غير فى بيئة آمنة.
        const KATKOT_SW_SOURCE = `
            var CACHE_NAME = 'katkot-shell-v3'; // ⚠️ لازم يتزامن يدويًا مع sw.js — الاتنين نسخة واحدة من نفس الكود، ده بس خط دفاع تاني لو الملف الحقيقي فشل يتحمّل (404/مشكلة نشر)
            // ============ 🔒 (إصلاح) هنا كانت النسخة القديمة (v1) اللي ملهاش تخزين لسكريبتات Firebase —
            // لو ./sw.js الحقيقي فشل يتسجّل لأي سبب (404، مشكلة نشر على GitHub Pages)، التطبيق كان بيرجع
            // بصمت للنسخة القديمة دي وبيفقد كل فايدة تخزين Firebase من غير ما حد يلاحظ. دلوقتي الاتنين
            // نفس الكود بالظبط (نسخة من sw.js بتاريخ آخر تحديث)، فمفيش فرق فعلي فى السلوك أي النسختين اشتغلت.
            var FIREBASE_URLS = [
                'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
                'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
            ];
            importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
            importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
            try {
                firebase.initializeApp({
                    apiKey: "AIzaSyAvQkPnrzxuMJbqDiXxhHctxjhiM-LFG0M",
                    authDomain: "katkot-pro.firebaseapp.com",
                    projectId: "katkot-pro",
                    storageBucket: "katkot-pro.firebasestorage.app",
                    messagingSenderId: "364078349089",
                    appId: "1:364078349089:web:e1d2222a22251f859b9c60"
                });
                var messaging = firebase.messaging();
                messaging.onBackgroundMessage(function (payload) {
                    var title = (payload.notification && payload.notification.title) || '🐣 كتكوت برو';
                    var body = (payload.notification && payload.notification.body) || '';
                    self.registration.showNotification(title, {
                        body: body, dir: 'rtl', lang: 'ar',
                        icon: './icon-192x192-any.png', badge: './icon-192x192-any.png',
                        data: payload.data || {}
                    });
                });
            } catch (e) {}
            self.addEventListener('notificationclick', function (event) {
                event.notification.close();
                event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
                    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
                    if (clients.openWindow) return clients.openWindow('./');
                }));
            });
            self.addEventListener('install', function(e){
                self.skipWaiting();
                e.waitUntil(caches.open(CACHE_NAME).then(function(cache){
                    return Promise.all([
                        cache.add(self.registration.scope).catch(function(){}),
                        ...FIREBASE_URLS.map(function(url){
                            return cache.add(url).catch(function(){});
                        })
                    ]);
                }));
            });
            self.addEventListener('activate', function(e){
                e.waitUntil(Promise.all([
                    self.clients.claim(),
                    caches.keys().then(function(keys){
                        return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
                    })
                ]));
            });
            // بيخزّن نسخة من صفحة التطبيق نفسها (شل التطبيق) عشان تفتح حتى من غير إنترنت — نتيجة الشبكة
            // (Network-first) عشان لو أونلاين ياخد آخر نسخة محفوظة دايمًا، ولو أوفلاين يرجع لآخر نسخة متخزّنة.
            // سكريبتات Firebase: Cache-first (كود ثابت مربوط بإصدار محدد). أي طلبات تانية (Open-Meteo،
            // الخطوط...) بتعدي للشبكة عادي من غير تدخل، لأنها بيانات حية مفيش فايدة من تخزينها.
            self.addEventListener('fetch', function(event){
                var isAppShell = event.request.mode === 'navigate' ||
                    (event.request.method === 'GET' && event.request.url === self.registration.scope);
                var isFirebaseSdk = event.request.method === 'GET' && FIREBASE_URLS.indexOf(event.request.url) !== -1;
                if (isFirebaseSdk) {
                    event.respondWith(
                        caches.match(event.request).then(function(cached){
                            if (cached) return cached;
                            return fetch(event.request).then(function(resp){
                                var clone = resp.clone();
                                caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, clone); });
                                return resp;
                            });
                        })
                    );
                    return;
                }
                if (!isAppShell) return;
                event.respondWith(
                    fetch(event.request).then(function(resp){
                        var clone = resp.clone();
                        caches.open(CACHE_NAME).then(function(cache){ cache.put(self.registration.scope, clone); });
                        return resp;
                    }).catch(function(){
                        return caches.match(self.registration.scope).then(function(cached){ return cached || Response.error(); });
                    })
                );
            });
            self.addEventListener('notificationclick', function(event){
                event.notification.close();
                event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
                    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
                    if (self.clients.openWindow) return self.clients.openWindow('./');
                }));
            });
            // فحص دوري فى الخلفية (أفضل جهد فقط — مدعوم على أندرويد/كروم للتطبيقات المُثبَّتة كـPWA بس،
            // والتوقيت مش مضمون بدقة، المتصفح هو اللي بيقرر حسب استخدامك). بما إن الـService Worker مالوش
            // وصول لبيانات التطبيق (localStorage)، أقصى حاجة يقدر يعملها تذكير عام يفتح بيه التطبيق.
            self.addEventListener('periodicsync', function(event){
                if (event.tag === 'katkot-daily-check') {
                    event.waitUntil(self.registration.showNotification('كتكوت Pro 🐔', {
                        body: 'افتح التطبيق لمراجعة تنبيهات وأولويات دفعتك اليوم',
                        tag: 'katkot-nudge', renotify: true, vibrate: [200,100,200]
                    }));
                }
            });
        `;
        let katkotSwRegistration = null;
        // ============ تثبيت التطبيق على الشاشة الرئيسية (PWA) — يفعّل وضع "تطبيق مستقل" بكل مميزاته ============
        // أندرويد/كروم بيدعم "بروتوكول" التثبيت الرسمي (beforeinstallprompt) اللي بيدّينا زر تثبيت مباشر.
        // آيفون/سفاري لسه معندهوش الحدث ده خالص — التثبيت بيبقى يدوي بس (مشاركة ← إضافة للشاشة الرئيسية)،
        // فبنوريه تعليمات بدل الزر المباشر.
        let deferredInstallPrompt = null;
        function isStandaloneMode() {
            return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
        }
        function isIOSDevice() {
            return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
        }
        function updateInstallButtonVisibility() {
            const btn = document.getElementById('installAppBtn');
            if (!btn) return;
            if (isStandaloneMode()) { btn.style.display = 'none'; return; }
            const eligible = !!deferredInstallPrompt || isIOSDevice();
            btn.style.display = eligible ? '' : 'none';
            btn.textContent = deferredInstallPrompt ? '📲 تثبيت التطبيق على الجهاز' : '📲 كيفية التثبيت على آيفون';
        }
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            updateInstallButtonVisibility();
        });
        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            showToast('تم تثبيت التطبيق على جهازك بنجاح ✅');
            updateInstallButtonVisibility();
        });
        async function triggerInstallApp() {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                try { await deferredInstallPrompt.userChoice; } catch (e) {}
                deferredInstallPrompt = null;
                updateInstallButtonVisibility();
                return;
            }
            if (isIOSDevice()) {
                showInfo('📲 تثبيت التطبيق على آيفون',
                    'من متصفح Safari (مش أي متصفح تاني زي كروم على الآيفون، لازم يكون Safari بالذات):\n' +
                    '1. اضغط زر المشاركة (المربع وفيه سهم لأعلى) فى شريط الأدوات السفلي.\n' +
                    '2. اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).\n' +
                    '3. اضغط "إضافة".\n\n' +
                    'بعد كده هتلاقي أيقونة التطبيق على شاشتك الرئيسية، وهيفتح بملء الشاشة زي أي تطبيق عادي بدون شريط المتصفح.');
                return;
            }
            showToast('التطبيق مثبَّت بالفعل، أو المتصفح الحالي لا يدعم التثبيت المباشر');
        }

        async function registerKatkotServiceWorker() {
            if (!('serviceWorker' in navigator)) return null;
            try {
                // ============ ملف sw.js حقيقي منفصل (بدل Blob URL) — عشان أدوات فحص الـ PWA زي PWABuilder
                // تقدر تكتشفه وتحلله فعليًا؛ الـ Blob كان شغال للمستخدمين لكن غير مرئي لأدوات الفحص الخارجية.
                // لو الملف الحقيقي فشل لأي سبب (مثلاً 404)، بنرجع تلقائيًا لأسلوب Blob القديم كخط دفاع ثاني. ============
                let reg;
                try {
                    reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
                } catch (e2) {
                    const blob = new Blob([KATKOT_SW_SOURCE], { type: 'application/javascript' });
                    const swUrl = URL.createObjectURL(blob);
                    reg = await navigator.serviceWorker.register(swUrl, { scope: './' });
                }
                katkotSwRegistration = reg;
                if ('periodicSync' in reg && navigator.permissions) {
                    try {
                        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
                        if (status.state === 'granted') {
                            await reg.periodicSync.register('katkot-daily-check', { minInterval: 12 * 60 * 60 * 1000 });
                        }
                    } catch (e) { /* غير مدعوم فى هذا المتصفح — نتجاهل بهدوء */ }
                }
                return reg;
            } catch (e) { return null; /* غالبًا لأن الصفحة مش على https، أو المتصفح لا يدعم */ }
        }

        // بيبني الإشعار الفعلي، ويفضّل إرساله عبر الـService Worker (أكثر توافقًا مع موبايل أندرويد)
        // مع رجوع تلقائي لـnew Notification() لو الـService Worker مش متاح (غالبًا فى الديسكتوب)
        function showKatkotNotification(title, body, tag) {
            const opts = { body, tag: tag || 'katkot-daily-alerts', renotify: true, vibrate: [200, 100, 200], requireInteraction: false };
            const fallback = () => { try { new Notification(title, opts); } catch (e) {} };
            if (katkotSwRegistration) {
                katkotSwRegistration.showNotification(title, opts).catch(fallback);
            } else if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(fallback);
            } else {
                fallback();
            }
        }
        let lastNotifiedContentHash = null; // لمنع تكرار نفس الإشعار كل ما يتعمل فحص دوري لو المحتوى متغيّرش

        // ============ تنبيه فورى عند وصول الساعة المحددة لتنفيذ إضافة علف/ماء أو معاملة فرشة (لو حُدد وقت لها) ============
        let exactTimeNotifiedKeys = new Set(); // مفتاح لكل بند + تاريخ اليوم، لمنع تكرار نفس الإشعار خلال نفس الدقيقة/اليوم
        function checkExactTimeReminders() {
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const today0 = todayStr();
            // تنظيف مفاتيح الأيام السابقة عشان الـSet ما يكبرش على الفاضي
            exactTimeNotifiedKeys.forEach(k => { if (!k.endsWith(today0)) exactTimeNotifiedKeys.delete(k); });
            // ⚠️ إصلاح: كان الفحص بيتطابق حرفيًا مع الدقيقة بالظبط (مثال: 14:30 لازم يتفحص وهو 14:30 بالظبط).
            // متصفحات الموبايل (خصوصًا كروم أندرويد) بتوقف/تبطّئ الـ JS timers للتابات فى الخلفية، فلو
            // التطبيق كان مقفول/فى الخلفية وقت الموعد بالظبط، الإشعار كان بيتفوّت تمامًا ومفيش أي تعويض.
            // دلوقتي بنستخدم نافذة سماح (10 دقايق بعد الموعد): لو الوقت الحالي جواها ولسه محدش نبّه، ينبّه.
            const EXACT_TIME_GRACE_MINUTES = 10;
            const isDueNow = (timeStr) => {
                if (!timeStr) return false;
                const [hh, mm] = timeStr.split(':').map(Number);
                if (isNaN(hh) || isNaN(mm)) return false;
                const schedMinutes = hh * 60 + mm;
                return nowMinutes >= schedMinutes && nowMinutes <= schedMinutes + EXACT_TIME_GRACE_MINUTES;
            };
            activeBatches().forEach(b => {
                const m = computeMetrics(b);
                (b.feedAdditives || []).forEach(a => {
                    if (!a.active || !isDueNow(a.time) || !additiveActiveOnDay(a, m.todayAge)) return;
                    const key = `feed-${a.id}-${today0}`;
                    if (exactTimeNotifiedKeys.has(key)) return;
                    exactTimeNotifiedKeys.add(key);
                    if (state.appSettings.soundAlertEnabled) playAlertBeep();
                    showKatkotNotification('⏰ موعد إضافة العلف الآن', `${b.name}: ${a.name} — الجرعة ${a.dose} ${a.unit}/${a.per}`, `feed-${a.id}`);
                });
                (b.waterAdditives || []).forEach(a => {
                    if (!a.active || !isDueNow(a.time) || !additiveActiveOnDay(a, m.todayAge)) return;
                    const key = `water-${a.id}-${today0}`;
                    if (exactTimeNotifiedKeys.has(key)) return;
                    exactTimeNotifiedKeys.add(key);
                    if (state.appSettings.soundAlertEnabled) playAlertBeep();
                    showKatkotNotification('⏰ موعد إضافة الماء الآن', `${b.name}: ${a.name} — الجرعة ${a.dose} ${a.unit}/${a.per}`, `water-${a.id}`);
                });
                (b.treatmentLog || []).forEach(t => {
                    if (t.done || !isDueNow(t.time) || t.day !== m.todayAge) return;
                    const key = `treat-${t.id}-${today0}`;
                    if (exactTimeNotifiedKeys.has(key)) return;
                    exactTimeNotifiedKeys.add(key);
                    if (state.appSettings.soundAlertEnabled) playAlertBeep();
                    showKatkotNotification('⏰ موعد معاملة الفرشة/السبلة الآن', `${b.name}: ${t.name}`, `treat-${t.id}`);
                });
            });
        }

        function checkAndNotifyToday(manual) {
            const items = [];
            activeBatches().forEach(b => {
                const m = computeMetrics(b);
                const fin = computeFinance(b, m);
                const alerts = computeAlerts(b, m);
                const ins = computeInsights(b, m);
                const ops = computeOpsRisk(b, m);
                const hs = computeHealthScore(b, m, alerts, ins, ops);
                const saleAdv = computeMarketSaleAdvice(b, m, fin);
                // ============ نفس محرك القرار الموحّد المستخدم فى لوحة التحكم — نفس التلات أولويات اللي شايفها بالظبط، مش تفريغ كل التنبيهات الخام ============
                const unified = computeUnifiedPriorities(b, m, fin, alerts, ins, ops, hs, saleAdv);
                unified.top3.forEach(p => items.push(`${b.name} [${p.urgency}]: ${p.icon} ${p.text}`));
            });
            // ===== تذكير أسبوعي فعلي بالنسخ الاحتياطي (مش بس مؤشر لوني فى الإعدادات) =====
            const backupDays = state.lastBackupDate ? Math.floor((new Date(todayStr()) - new Date(state.lastBackupDate)) / 86400000) : null;
            if (backupDays === null || backupDays >= 7) {
                items.push(`💾 لم تُصدَّر نسخة احتياطية منذ ${backupDays === null ? 'بداية استخدام التطبيق' : backupDays + ' يوم'} — صدّرها الآن من الإعدادات`);
            }
            if (!items.length) { if (manual) showToast('لا توجد تنبيهات عاجلة اليوم ✅'); return; }
            const contentHash = items.slice(0, 3).join('|');
            if (!manual && contentHash === lastNotifiedContentHash) return; // نفس محتوى آخر إشعار وفحص تلقائي — تجنّب الإزعاج بتكرار
            if (state.appSettings.soundAlertEnabled) playAlertBeep();
            if (typeof Notification === 'undefined') { if (manual) showToast(items[0]); return; }
            if (Notification.permission === 'granted') {
                lastNotifiedContentHash = contentHash;
                showKatkotNotification('كتكوت Pro — أهم أولوياتك اليوم', items.slice(0, 3).join('\n'));
            } else if (manual) {
                showToast('فعّل الإشعارات أولاً من الإعدادات 🔔');
            }
        }

        // (تم نقل التفعيل الفعلي لـ requestNotificationPermission إلى 01-state-storage.js — بقى بيسجّل
        // رمز FCM حقيقي عشان التنبيهات توصل حتى لو التطبيق مقفول، مش مجرد إذن متصفح محلي بس)

        // ============ Export PDF / Print Report ============
        // ============ حفظ/مشاركة الملفات على الموبايل ============
        // على الموبايل (خصوصًا iOS Safari) رابط <a download> التقليدي أحيانًا يفتح الملف فى تبويب جديد
        // بدل ما يحفظه فى تطبيق "الملفات" فعليًا. الحل الموثوق: استخدام Web Share API لمشاركة الملف
        // (يفتح قائمة المشاركة الأصلية للموبايل، وفيها خيار "حفظ فى الملفات" مباشرة)، مع رجوع تلقائي
        // لطريقة التحميل الكلاسيكية لو المتصفح (غالبًا الديسكتوب) مش بيدعم مشاركة الملفات.
