        function setDailyEventsSubTab(id) { dailyEventsSubTab = id; render(); }
        // فتح قسم "سجلات وأحداث إضافية" على تبويب فرعي مُحدَّد من زرار إجراء سريع — لازم كمان نجبر القسم يكون مفتوح
        // (مش بس نبدّل التبويب الداخلي) لأن قسم الأحداث ثاني قسم فى الصفحة وبيتقفل تلقائيًا افتراضيًا لو المستخدم لسه ماخصصش حاجة
        function openDailyEventsSubTab(id) {
            dailyEventsSubTab = id;
            toggleSectionOpen('daily', DAILY_EVENTS_SECTION_KEY, true, 'السجل اليومي (نهار / ليل)');
            render();
            // ============ 🔧 إصلاح: القسم ده غالبًا تحت التاب/الجدول اليومي وبعيد عن الشاشة الظاهرة —
            // من غير scrollIntoView الزرار كان بيغيّر الحالة فعليًا (والقسم بيتفتح) لكن المستخدم مش شايف
            // أي تغيير على الشاشة لو كان لسه فوق فى الصفحة، فحاسس إن الزرار "مش شغال" خالص. ============
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const el = document.getElementById('dailyEventsSection');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            });
        }

        function renderDailyTab(b, m) {
            const todayRec = b.records.find(r => r.date === todayStr());
            // ============ 🔧 إصلاح: نعتمد على علم dayEntered/nightEntered الصريح (مُسجَّل وقت الحفظ حسب الوضع
            // المفتوح فعليًا) بدل الاستنتاج من feedDay/mortDay مش null — لأنهم كانوا دايمًا أرقام (مش null) حتى
            // لو القسم كان مخفي، فكانت الحالتين بيظهروا "تم التسجيل" مع بعض حتى لو اتسجلت فترة واحدة بس.
            // لسجلات قديمة قبل الإصلاح (dayEntered/nightEntered غير معرَّفين)، نرجع للطريقة القديمة كتقدير احتياطي. ============
            const dayDone = !!(todayRec && (todayRec.dayEntered !== undefined ? todayRec.dayEntered : (todayRec.feedDay != null || todayRec.mortDay != null)));
            const nightDone = !!(todayRec && (todayRec.nightEntered !== undefined ? todayRec.nightEntered : (todayRec.feedNight != null || todayRec.mortNight != null)));
            const statusCard = `<div class="daily-status-card">
                <div class="item">☀️ نهار اليوم<br><b style="color:${dayDone?'var(--green)':'var(--red)'};">${dayDone?'✅ تم التسجيل':'⏳ لم يُسجَّل بعد'}</b></div>
                <div class="item">🌙 ليل اليوم<br><b style="color:${nightDone?'var(--green)':'var(--red)'};">${nightDone?'✅ تم التسجيل':'⏳ لم يُسجَّل بعد'}</b></div>
            </div>`;
            // إجراءات سريعة مجمّعة فى بطاقة واحدة بدل صفوف منفصلة متناثرة
            const quickBtns = statusCard + `<div class="card daily-quick-actions">
                <button class="btn gold" onclick="openDailyModal('day')">☀️ تسجيل النهار</button>
                <button class="btn tone-info" onclick="openDailyModal('night')">🌙 تسجيل الليل</button>
                <button class="btn tone-warning" onclick="openQuickIntModal()">➕ إضافة خارج الجدول</button>
                <button class="btn tone-danger" onclick="openIncidentModal()">📓 تسجيل حادثة</button>
                <button class="btn ghost" onclick="openBiosecurityModal()">🛡️ أمان حيوي سريع</button>
                <button class="btn tone-success" onclick="shareWhatsapp()">📲 مشاركة واتساب</button>
            </div>`;
            if (b.records.length === 0) return quickBtns + renderDailyEventsSection(b) + `<div class="card empty"><div class="ico">📋</div>لا توجد سجلات يومية بعد. سجّل قراءة النهار أو الليل من الأزرار أعلاه.</div>`;
            const realDates = new Set(b.records.map(r => r.date));
            const dn = (d, n, unit) => (d == null && n == null) ? '—' : `☀️${d != null ? fmt(d,1) : '—'} / 🌙${n != null ? fmt(n,1) : '—'}${unit ? ' ' + unit : ''}`;
            const dnInt = (d, n) => (d == null && n == null) ? '—' : `☀️${d ?? 0} / 🌙${n ?? 0}`;
            const rows = [...m.series].filter(r => realDates.has(r.date)).reverse().map(r => `
                <tr><td>${r.age}</td><td>${r.date}</td><td style="font-size:11px;white-space:nowrap;">${r.mort + r.cull}<br><span style="color:var(--muted);">${dnInt(r.mortDay, r.mortNight)}</span></td><td>${r.liveCount.toLocaleString('ar-EG')}</td>
                <td style="font-size:11px;white-space:nowrap;">${dn(r.feedDay, r.feedNight)}</td>
                <td style="font-size:11px;white-space:nowrap;">${dn(r.waterDay, r.waterNight)}</td>
                <td>${r.weight ? fmt(r.weight, 0) : '—'}</td><td>${r.fcr ? (r.weightIsEstimated ? '~' : '') + fmt(r.fcr, 2) : '—'}</td>
                <td style="font-size:11px;white-space:nowrap;">${dn(r.tempDay, r.tempNight)}</td>
                <td style="font-size:11px;white-space:nowrap;">${dn(r.humidityDay, r.humidityNight)}</td>
                <td>${r.health != null ? r.health + '/10' : '—'}${r.clinicalSigns ? ' 🩺' : ''}</td><td>${r.light != null ? fmt(r.light, 1) : '—'}</td>
                <td style="font-size:11px;">${r.analysis ? `<div class="cell-clip" style="width:120px;" onclick="showRecordDetail('${r.date}')">📊 ${esc(r.analysis.split(' | ')[0])}${r.analysis.includes(' | ')?' …':''}</div>` : '—'}</td>
                <td style="font-size:11px;">${(r.notesDay||r.notesNight||r.notes) ? `<div class="cell-clip" style="width:110px;" onclick="showRecordDetail('${r.date}')">📝 ${esc(r.notesDay||r.notesNight||r.notes)}</div>` : '—'}</td>
                <td><button class="btn ghost sm" onclick="editDailyRecord('${r.date}')">تعديل</button> ${getRecordPhotos(r).length ? `<button class="btn ghost sm" onclick="viewRecordPhotos('${r.date}')">📷 ${getRecordPhotos(r).length}</button>` : ''} <button class="btn danger sm" onclick="deleteRecord('${r.date}')">حذف</button></td></tr>`).join('');
            return quickBtns + `<div class="section" style="margin-top:0;"><div class="section-head"><h2>السجل اليومي (نهار / ليل)</h2><span class="tag">${b.records.length} سجل</span></div>
                <div class="card" style="padding:8px 10px;margin-bottom:8px;display:flex;gap:8px;align-items:center;">
                    <input type="text" placeholder="🔍 بحث بالتاريخ أو الملاحظات أو التحليل..." oninput="liveFilterTable(this,'dailyRecordsBody')" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;">
                    <span id="dailyRecordsBody_count" style="font-size:11px;color:var(--muted);white-space:nowrap;"></span>
                </div>
                <div class="card scroll-x"><table><thead><tr><th>العمر</th><th>التاريخ</th><th>نفوق ☀️/🌙</th><th>المتبقي</th><th>علف ☀️/🌙</th><th>ماء ☀️/🌙</th><th>وزن</th><th>FCR</th><th>حرارة ☀️/🌙</th><th>رطوبة ☀️/🌙</th><th>صحة</th><th>إضاءة</th><th>تحليل تلقائي</th><th>ملاحظات</th><th></th></tr></thead>
                <tbody id="dailyRecordsBody">${rows}</tbody></table></div>
                <details style="margin-top:8px;"><summary style="font-weight:800;color:var(--barn-dark);cursor:pointer;padding:6px 0;font-size:12.5px;">ℹ️ الصيغ وطريقة التسجيل</summary>
                <div class="formula-box">
                    FCR = إجمالي العلف ÷ (الكتلة الحيوية الحالية − الكتلة الحيوية الابتدائية)<br>
                    ADG = (الوزن الحالي − وزن البداية) ÷ عمر القطيع بالأيام<br>
                    💡 برنامج الإضاءة المُوصى به عمومًا: الأسبوع الأول 23 ساعة إضاءة / 1 ساعة إظلام، ثم تدريجيًا حتى 18-20 ساعة إضاءة / 4-6 ساعات إظلام.<br>
                    كل كمية علف تُسجَّل هنا (نهار + ليل) تُخصم تلقائيًا من مخزون "علف". التحليل التلقائي يقارن قراءتى النهار والليل لرصد أى تفاوت قد يشير لمشكلة تهوية أو تدفئة.<br>
                    💡 سجّل النهار عند جولة الصباح، وسجّل الليل عند جولة المساء — كل زر يفتح نموذجًا مختصرًا بحقول القسم المطلوب فقط، وتُجمَّع البيانات تلقائيًا فى سجل يوم واحد. اضغط "تعديل" لعرض/تصحيح السجل الكامل (نهار + ليل معًا).
                </div></details>
            </div>
            ${renderDailyEventsSection(b)}`;
        }

        // ============ سجلات وأحداث إضافية اليوم (إضافات خارج الجدول / حوادث) — قسم واحد بتبويبات فرعية ============
        // ملحوظة: "الأمان الحيوي" اتشال من هنا وبقى زرار مستقل بيفتح مودال منفصل (openBiosecurityModal) — نفس المكان زي ما كان، بس عرضه بقى فورًا بدون الحاجة تلف لتحت الصفحة.
        const DAILY_EVENTS_SECTION_KEY = '📓 سجلات وأحداث إضافية';
        function renderDailyEventsSection(b) {
            const tabs = [
                { id: 'additives', label: `➕ إضافات خارج الجدول (${(b.quickInterventions||[]).length})` },
                { id: 'incidents', label: `📓 حوادث (${(b.incidents||[]).length})` },
            ];
            const nav = `<div class="settings-subnav">${tabs.map(t => `<button class="ssnav-btn ${dailyEventsSubTab===t.id?'active':''}" onclick="setDailyEventsSubTab('${t.id}')">${t.label}</button>`).join('')}</div>`;
            let body = '';
            if (dailyEventsSubTab === 'additives') {
                const list = [...(b.quickInterventions || [])].sort((a, c) => c.dateTime.localeCompare(a.dateTime)).slice(0, 20);
                const rows = list.map(it => `<div class="check-row"><div class="txt">
                        <div style="font-weight:800;">${it.type === 'feed' ? '🌾' : '💧'} ${esc(it.name || '')} — ${fmt(it.qty,2)} ${it.unit}</div>
                        <div class="day">${it.dateTime.replace('T',' الساعة ')} · ${esc(it.reason || '')}${it.enteredBy ? ' · بواسطة ' + esc(it.enteredBy) : ''}</div>
                        ${it.note ? `<div style="font-size:11px;color:var(--muted);">${esc(it.note)}</div>` : ''}
                    </div>
                    <button class="btn danger sm" onclick="deleteQuickIntervention('${it.id}')">حذف</button>
                </div>`).join('');
                body = `<p style="font-size:11px;color:var(--muted);margin:8px 0;line-height:1.6;">أي إضافة أو مكمل تضيفه فعليًا على العلف أو فى الماء بشكل طارئ خارج برنامج الإضافات المجدول.</p>
                    <button class="btn gold block" onclick="openQuickIntModal()">➕ إضافة الآن</button>
                    ${list.length ? `<div class="card" style="margin-top:8px;">${rows}</div>` : `<div class="card empty" style="padding:14px;margin-top:8px;"><div class="ico">➕</div>لا توجد إضافات خارج الجدول مسجَّلة بعد.</div>`}`;
            } else if (dailyEventsSubTab === 'incidents') {
                const list = [...(b.incidents || [])].sort((a, c) => c.date.localeCompare(a.date)).slice(0, 15);
                const rows = list.map(it => `<div class="check-row"><div class="txt">
                        <div style="font-weight:800;">${INCIDENT_SEVERITY_LABEL[it.severity] || ''} ${esc(it.category)} — ${esc(it.title)}</div>
                        <div class="day">يوم ${it.age} (${it.date})${it.solution ? ' · الحل: ' + esc(it.solution) : ''} · ${INCIDENT_OUTCOME_LABEL[it.outcome] || ''}${it.enteredBy ? ' · بواسطة ' + esc(it.enteredBy) : ''}</div>
                        ${it.notes ? `<div style="font-size:11px;color:var(--muted);">${esc(it.notes)}</div>` : ''}
                    </div>
                    <button class="btn danger sm" onclick="deleteIncident('${it.id}')">حذف</button>
                </div>`).join('');
                body = `<p style="font-size:11px;color:var(--muted);margin:8px 0;line-height:1.6;">سجّل أي حادثة أثّرت على الدفعة والحل ونتيجته — تدخل تلقائيًا فى "🧠 قاعدة معرفة الحوادث" (تبويب الإنتاج).</p>
                    <div class="row-actions" style="margin:0;">
                        <button class="btn gold" style="flex:1;" onclick="openIncidentModal()">📓 تسجيل حادثة</button>
                        <button class="btn ghost" style="flex:1;" onclick="openIncidentKbModal()">🧠 قاعدة المعرفة</button>
                    </div>
                    ${list.length ? `<div class="card" style="margin-top:8px;">${rows}</div>` : `<div class="card empty" style="padding:14px;margin-top:8px;"><div class="ico">📓</div>لا توجد حوادث مُسجَّلة بعد.</div>`}`;
            }
            return `<div class="section" id="dailyEventsSection" style="margin-top:0;"><div class="section-head"><h2>${DAILY_EVENTS_SECTION_KEY}</h2></div>
                ${nav}${body}
            </div>`;
        }

        // ============ 🛡️ الأمان الحيوي — بقى مودال مستقل (نفس المحتوى بالظبط، بس بيتفتح فورًا فوق الشاشة بدل ما يتضم لتبويبات "سجلات وأحداث إضافية") ============
        function renderBiosecurityModalBody(b) {
            const today = todayStr();
            const bioTypes = ['👨‍⚕️ زيارة طبيب بيطري', '🚗 دخول زائر', '🚙 دخول مركبة/سيارة', '🧴 تطهير ورش مطهرات', '🚪 تعقيم مدخل العنبر', '🐀 مكافحة قوارض/حشرات', '📌 أخرى'];
            const bioRows = [...(b.biosecurityLog || [])].sort((a,c)=>c.date.localeCompare(a.date)).slice(0, 15).map(e => `
                <tr><td>${e.date}${e.stage ? `<br><span class="pill ${e.stage==='before'?'warn':'ok'}" style="font-size:9.5px;">${e.stage==='before'?'قبل':'بعد'}</span>` : ''}</td><td style="text-align:right;">${esc(e.type)}${e.photo ? ` <button class="btn ghost xs" onclick="viewBioPhoto('${e.id}')">📷</button>` : ''}</td><td style="text-align:right;font-size:11px;color:var(--muted);">${esc(e.note)||''}</td>
                <td><button class="btn ghost sm owner-only" onclick="editBiosecurity('${e.id}')">✏️</button> <button class="btn danger sm owner-only" onclick="deleteBiosecurity('${e.id}')">حذف</button></td></tr>`).join('');
            const bioBeforePhotos = (b.biosecurityLog || []).filter(e => e.stage === 'before' && e.photo).sort((a,c)=>c.date.localeCompare(a.date));
            const bioAfterPhotos = (b.biosecurityLog || []).filter(e => e.stage === 'after' && e.photo).sort((a,c)=>c.date.localeCompare(a.date));
            const cleaningCompareHtml = (bioBeforePhotos.length && bioAfterPhotos.length) ? `
                <div class="card" style="margin-top:10px;">
                    <div style="font-weight:800;font-size:13px;margin-bottom:8px;">🧽 آخر مقارنة قبل/بعد التنظيف والتطهير</div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <div style="text-align:center;"><img src="${bioBeforePhotos[0].photo}" style="max-width:130px;border-radius:8px;border:1px solid var(--line);"><div style="font-size:11px;color:var(--muted);margin-top:2px;">قبل — ${bioBeforePhotos[0].date}</div></div>
                        <div style="text-align:center;"><img src="${bioAfterPhotos[0].photo}" style="max-width:130px;border-radius:8px;border:1px solid var(--line);"><div style="font-size:11px;color:var(--muted);margin-top:2px;">بعد — ${bioAfterPhotos[0].date}</div></div>
                    </div>
                </div>` : '';
            return `<p style="font-size:11px;color:var(--muted);margin:8px 0;">سجّل زيارة طبيب، دخول زوار/مركبة، أو حدث تطهير بضغطة واحدة.</p>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                    ${bioTypes.map((t,i) => `<button type="button" class="btn ghost sm bio-chip" data-idx="${i}" onclick="selectBioChip(${i})" style="border-radius:20px;">${t}</button>`).join('')}
                </div>
                <select id="bio_type" style="display:none;">${bioTypes.map(t => `<option>${t.replace(/^\S+\s/,'')}</option>`).join('')}</select>
                <div id="bioExtraFields" style="display:none;">
                    <div class="form-grid" style="margin-top:8px;">
                        <div class="field"><label>التاريخ</label><input id="bio_date" type="date" value="${today}"></div>
                        <div class="field"><label>المرحلة (لو تنظيف/تطهير)</label>
                            <select id="bio_stage"><option value="">غير محدد</option><option value="before">📷 قبل التنظيف</option><option value="after">📷 بعد التنظيف</option></select>
                        </div>
                        <div class="field full"><label>ملاحظة</label><input id="bio_note" placeholder="اختياري"></div>
                        <div class="field full"><label>صورة توثيقية (اختياري)</label>
                            <input type="file" id="bio_photo_input" accept="image/*" capture="environment" onchange="handleBioPhotoUpload(event)">
                            <div id="bio_photo_preview" style="margin-top:6px;"></div>
                        </div>
                    </div>
                    <button class="btn gold block" id="bioSaveBtn" style="margin-top:8px;" onclick="saveBiosecurity()">+ تسجيل الحدث</button>
                </div>
                <div class="card scroll-x" style="margin-top:8px;">
                    ${bioRows ? `<table><thead><tr><th>التاريخ</th><th>النوع</th><th>ملاحظة</th><th></th></tr></thead><tbody>${bioRows}</tbody></table>`
                    : `<div class="empty"><div class="ico">🛡️</div>لا توجد سجلات أمان حيوي بعد.</div>`}
                    ${cleaningCompareHtml}
                </div>`;
        }
        function openBiosecurityModal() {
            const b = getActiveBatch();
            if (!b) { showToast('⚠️ فعّل دفعة نشطة أولاً'); return; }
            document.getElementById('bioModalTitle').textContent = `🛡️ أمان حيوي (${(b.biosecurityLog||[]).length})`;
            document.getElementById('bioModalBody').innerHTML = renderBiosecurityModalBody(b);
            openModal('bioModalOverlay');
        }
        // بعد أي حفظ/تعديل/حذف فى سجل الأمان الحيوي، لو المودال مفتوح لسه، نعيد رسم محتواه فورًا (بدل إغلاقه) عشان المستخدم يشوف النتيجة فى نفس الشاشة
        function refreshBiosecurityModalIfOpen() {
            const overlay = document.getElementById('bioModalOverlay');
            const b = getActiveBatch();
            if (overlay && overlay.classList.contains('show') && b) {
                document.getElementById('bioModalTitle').textContent = `🛡️ أمان حيوي (${(b.biosecurityLog||[]).length})`;
                document.getElementById('bioModalBody').innerHTML = renderBiosecurityModalBody(b);
            }
        }

        // ============ Inventory + Purchases + Sales (مدمج) ============
        // ============ شريط بصري لمستوى المخزون (مستوحى من مستهلك/متاح بشريط لوني متدرج) ============
