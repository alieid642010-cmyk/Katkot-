        function getFeedStages(b) {
            const cfg = AS();
            const starterKg = (b && b.feedStageStarterKg != null) ? b.feedStageStarterKg : cfg.feedStageStarterKg;
            const growerKg = (b && b.feedStageGrowerKg != null) ? b.feedStageGrowerKg : cfg.feedStageGrowerKg;
            return [
                { key: 'starter', label: 'بادئ', icon: '🐣', targetKg: starterKg },
                { key: 'grower', label: 'نامي', icon: '🐤', targetKg: growerKg },
                { key: 'finisher', label: 'ناهي', icon: '🐔', targetKg: null }
            ];
        }
        // ============ (جديد) برنامج التحويل التدريجي بين نوعين علف — يُعرَّف مرة واحدة فى الإعدادات ويُطبَّق تلقائيًا فى التسجيل اليومي ============
        // b.feedTransitions = [{ id, fromFeed, toFeed, startAge, days: [{fromPct}, ...] }]
        // days[i].fromPct = نسبة "fromFeed" فى يوم رقم (i+1) من التحويل (عمر القطيع = startAge + i). الباقي لـ toFeed تلقائيًا (100 - fromPct).
        function getActiveFeedTransition(b, age) {
            if (!b || !b.feedTransitions) return null;
            for (const t of b.feedTransitions) {
                if (!t.days || !t.days.length) continue;
                const idx = age - t.startAge;
                if (idx >= 0 && idx < t.days.length) {
                    const fromPct = Math.max(0, Math.min(100, t.days[idx].fromPct));
                    return { transition: t, dayNum: idx + 1, totalDays: t.days.length, fromPct, toPct: 100 - fromPct };
                }
            }
            return null;
        }
        // حفظ كميات مراحل العلف (بادئ/نامي) خاصة بدفعة معيّنة — من داخل تبويب الإنتاج مباشرة
        function saveFeedStageForBatch() {
            if (!requirePermission('production')) return; // 🔒 Red Team fix (جولة 3)
            const b = getActiveBatch();
            if (!b) return;
            const starter = parseFloat(document.getElementById('fs_starterKg').value);
            const grower = parseFloat(document.getElementById('fs_growerKg').value);
            b.feedStageStarterKg = isNaN(starter) ? null : starter;
            b.feedStageGrowerKg = isNaN(grower) ? null : grower;
            persist();
            logAudit(b, `🌾 تعديل كميات مراحل العلف: بادئ ${b.feedStageStarterKg ?? '—'} كجم / نامي ${b.feedStageGrowerKg ?? '—'} كجم`);
            render();
            showToast('✅ تم حفظ برنامج مراحل العلف لهذه الدفعة');
        }

        function getFeedStageInfo(b, m) {
            if (!m || !(m.cumFeed > 0)) return null;
            const stages = getFeedStages(b);
            const avgBirds = Math.max(((b.startCount || 0) + (m.liveCount || 0)) / 2, 1);
            const cumPerBirdKg = (m.cumFeed || 0) / avgBirds;
            let cumulative = 0;
            for (let i = 0; i < stages.length; i++) {
                const s = stages[i];
                const stageStartKg = cumulative;
                const stageEndKg = s.targetKg != null ? cumulative + s.targetKg : Infinity;
                if (cumPerBirdKg < stageEndKg || s.targetKg == null) {
                    return {
                        stage: s, stageIndex: i, cumPerBirdKg, stageStartKg, stageEndKg,
                        remainingKg: s.targetKg != null ? Math.max(stageEndKg - cumPerBirdKg, 0) : null,
                        pctOfStage: s.targetKg != null ? Math.min(Math.max((cumPerBirdKg - stageStartKg) / s.targetKg, 0), 1) * 100 : 100,
                        nextStage: stages[i + 1] || null
                    };
                }
                cumulative = stageEndKg;
            }
            return null;
        }

        // ============ ربط "صنف العلف المُختار فى التسجيل اليومي" بـ"مرحلة العلف الفعلية المحسوبة" ============
        // بدون الربط ده، الاثنين بيمشوا منفصلين: المرحلة بتتحدد تلقائيًا من الاستهلاك التراكمي، لكن
        // صنف العلف فى القائمة بيفضل زي ما اختاره المستخدم آخر مرة يدويًا — لو نسي يغيّره عند التحويل
        // (مثلاً من بادئ لنامي)، كل توقعات نفاذ المخزون واقتراحات إعادة الطلب هتفضل مبنية على الصنف
        // القديم غلط، رغم إن الدفعة فعليًا بقت بتاكل صنف تاني.
        const FEED_STAGE_KEYWORDS = {
            starter: ['بادئ', 'بادي', 'بادى', 'starter'],
            grower: ['نامي', 'نامى', 'ناما', 'grower', 'growing'],
            finisher: ['ناهي', 'ناهى', 'نهائي', 'نهائى', 'finisher', 'finishing']
        };
        // يحاول يخمّن مرحلة صنف علف من اسمه النصي الحر (المستخدم بيكتب الاسم زي ما هو عايز، مفيش قائمة مقفولة)
        function guessFeedItemStageKey(name) {
            if (!name) return null;
            const n = String(name).toLowerCase();
            for (const key of Object.keys(FEED_STAGE_KEYWORDS)) {
                if (FEED_STAGE_KEYWORDS[key].some(kw => n.includes(kw.toLowerCase()))) return key;
            }
            return null;
        }
        // يدوّر فى أصناف العلف بالمخزن على أول صنف اسمه يطابق مرحلة معينة (بادئ/نامي/ناهي)
        function findInventoryItemForStage(feedItems, stageKey) {
            return (feedItems || []).find(it => guessFeedItemStageKey(it.name) === stageKey) || null;
        }
        // بيرجّع تحذير جاهز للعرض لو صنف العلف المُختار فى النموذج مش متوافق مع المرحلة الفعلية المحسوبة،
        // ومعاه اسم الصنف الصح لو موجود بالمخزن (عشان نقدر نحوّل الاختيار تلقائيًا بدل ما نسيب المستخدم يكتشف بنفسه)
        function checkFeedItemStageMismatch(b, m, selectedName) {
            const stageInfo = getFeedStageInfo(b, m);
            if (!stageInfo) return null;
            const expectedKey = stageInfo.stage.key;
            const feedItems = (b.inventory || []).filter(it => it.category === 'علف');
            const matchForExpected = findInventoryItemForStage(feedItems, expectedKey);
            const selectedKey = guessFeedItemStageKey(selectedName);
            if (selectedKey && selectedKey === expectedKey) return null; // متوافق، مفيش داعي تحذير
            if (!selectedKey) return null; // اسم الصنف مفيهوش كلمة دالة على مرحلة (اسم عام "علف" مثلاً) — متجاهله بدل تحذير كل يوم بلا فايدة
            return {
                expectedStage: stageInfo.stage, selectedStageKey: selectedKey,
                suggestedItem: matchForExpected, cumPerBirdKg: stageInfo.cumPerBirdKg
            };
        }

        // ============ تتبع صلاحية اللقاحات/الأدوية فى المخزون ============
        const EXPIRY_WARN_DAYS = 30;
        function computeExpiryAlerts(b) {
            const today = todayStr();
            const rows = (b.inventory || []).filter(it => it.expiryDate && it.balance > 0).map(it => {
                const daysLeft = Math.floor((new Date(it.expiryDate) - new Date(today)) / 86400000);
                let level = 'ok';
                if (daysLeft < 0) level = 'expired';
                else if (daysLeft <= EXPIRY_WARN_DAYS) level = 'warn';
                return { ...it, daysLeft, level };
            }).filter(r => r.level !== 'ok').sort((a, c) => a.daysLeft - c.daysLeft);
            return rows;
        }
        function renderExpirySection(b) {
            const rows = computeExpiryAlerts(b);
            if (!rows.length) return '';
            return `<div class="section" style="margin-top:0;"><div class="section-head"><h2>⏳ صلاحية اللقاحات/الأدوية</h2></div>
                <div class="card" style="padding:0;">
                    ${rows.map(r => `<div class="check-row"><div class="txt">
                        <div style="font-weight:800;">${esc(r.name)}</div>
                        <div class="day">الرصيد: ${fmt(r.balance,1)} ${r.unit} · صلاحية حتى ${r.expiryDate}</div>
                    </div>
                    <span class="pill ${r.level==='expired'?'bad':'warn'}" style="font-size:11px;">${r.level==='expired' ? `منتهي منذ ${Math.abs(r.daysLeft)} يوم` : `متبقٍ ${r.daysLeft} يوم`}</span></div>`).join('')}
                </div>
            </div>`;
        }
        // ============ (جديد) كشف تعارض الإضافات النشطة تلقائيًا — حسب قواعد يعرّفها المستخدم بنفسه فى الإعدادات (مش معرفة بيطرية من التطبيق) ============
        function checkAdditiveConflicts(b, m) {
            const alerts = [];
            const rules = state.conflictRules || [];
            if (!rules.length) return alerts;
            const age = m.todayAge;
            const todayDateStr = todayStr();
            const activeItems = [
                ...(b.feedAdditives || []).filter(a => a.active && additiveActiveOnDay(a, age)).map(a => ({ label: `${esc(a.name)} (إضافة علف)`, text: `${a.name} ${a.notes || ''}` })),
                ...(b.waterAdditives || []).filter(a => a.active && additiveActiveOnDay(a, age)).map(a => ({ label: `${esc(a.name)} (إضافة ماء)`, text: `${a.name} ${a.notes || ''}` })),
                // إضافات خارج الجدول المُعطاة النهاردة بالذات — جرعة نقطية فبنعتبرها "سارية" ليوم إعطائها فقط
                ...(b.quickInterventions || []).filter(qi => qi.date === todayDateStr).map(qi => ({ label: `${esc(qi.name)} (${qi.type === 'water' ? 'إضافة ماء' : 'إضافة علف'} — خارج الجدول)`, text: `${qi.name} ${qi.note || ''}` })),
            ];
            if (activeItems.length < 2) return alerts;
            const today = todayStr();
            if (!b.loggedConflicts) b.loggedConflicts = [];
            rules.forEach(rule => {
                if (!rule.a || !rule.b) return;
                const matchA = activeItems.filter(it => it.text.includes(rule.a));
                const matchB = activeItems.filter(it => it.text.includes(rule.b));
                // لازم يكونوا صنفين مختلفين فعليًا نشطين مع بعض، مش نفس الصنف بيطابق الكلمتين
                const pairFound = matchA.some(ia => matchB.some(ib => ia !== ib));
                if (pairFound) {
                    alerts.push({ level: 'danger', dedupeKey: `conflict_${rule.id}`,
                        text: `⚠️ تعارض محتمل: عندك حاليًا "${rule.a}" و"${rule.b}" نشطين مع بعض${rule.note ? ` — ${esc(rule.note)}` : ''} (القاعدة دي إنت اللي عرّفتها فى الإعدادات).` });
                    // ============ (جديد) توصية #5: توثيق تلقائي فى سجل التدقيق — مرة واحدة بس لكل قاعدة/يوم عشان السجل مايتكررش ============
                    const logKey = `conflict_${rule.id}_${today}`;
                    if (!b.loggedConflicts.includes(logKey)) {
                        b.loggedConflicts.push(logKey);
                        if (b.loggedConflicts.length > 200) b.loggedConflicts.splice(0, b.loggedConflicts.length - 200);
                        logAudit(b, `⚠️ تعارض إضافات مكتشف تلقائيًا (عمر يوم ${age}): "${rule.a}" مع "${rule.b}"${rule.note ? ' — ' + rule.note : ''}`);
                    }
                }
            });
            return alerts;
        }
        // ============ (جديد) توصية #4: كشف قفزة مفاجئة فى معدل النفوق اليومي (مش التراكمي) — إنذار مبكر أسرع من أي مؤشر تراكمي ============
        function checkMortalitySpike(b, m) {
            const alerts = [];
            const series = (m.series || []).filter(r => r.age > 0 && r.mort != null);
            if (series.length < 4) return alerts;
            const last = series[series.length - 1];
            const liveBeforeLast = (last.liveCount || 0) + (last.mort || 0) + (last.cull || 0);
            if (liveBeforeLast <= 0) return alerts;
            const todayRate = ((last.mort || 0) / liveBeforeLast) * 100;
            const prior = series.slice(-6, -1); // آخر 5 أيام سابقة (لو متوفرين) كخط أساس للمقارنة
            if (prior.length < 3) return alerts;
            const priorRates = prior.map(r => {
                const liveBefore = (r.liveCount || 0) + (r.mort || 0) + (r.cull || 0);
                return liveBefore > 0 ? ((r.mort || 0) / liveBefore) * 100 : 0;
            });
            const avgPrior = priorRates.reduce((a, c) => a + c, 0) / priorRates.length;
            // شرط مزدوج (نسبي + مطلق) عشان مانطلعش تنبيه من تذبذب طبيعي بسيط بين يوم ويوم
            if (todayRate >= 0.5 && todayRate >= avgPrior * 3 && (todayRate - avgPrior) >= 0.3) {
                alerts.push({ level: 'danger', dedupeKey: `mortspike_${last.age}`,
                    text: `🚨 قفزة مفاجئة فى معدل النفوق اليومي: النهارده ${fmt(todayRate,2)}% مقابل متوسط ${fmt(avgPrior,2)}% فى آخر ${prior.length} أيام — إشارة إنذار مبكر أسرع من نسبة النفوق التراكمية، راجع الحالة فورًا.` });
            }
            return alerts;
        }
        function computeAlerts(b, m) {
            const alerts = [];
            const cfg = AS();
            alerts.push(...checkAdditiveConflicts(b, m));
            alerts.push(...checkMortalitySpike(b, m));
            // ===== خطة المساحة/التحضين والتجهيزات (علافات/سقايات) — مبنية تلقائيًا من بيانات تسجيل الدفعة =====
            (() => {
                if (!b.executedPlanItems) b.executedPlanItems = {};
                const plan = computeEquipmentPlan(b, m);
                const todayAge = m.todayAge;
                if (plan.broodingPlan) {
                    const stage = plan.broodingPlan.find(r => todayAge <= r.untilDay);
                    if (stage) {
                        const key = `broodPlan_${stage.untilDay}`;
                        if (!b.executedPlanItems[key]) {
                            alerts.push({ level: stage.ok ? 'info' : 'warn', planKey: key,
                                text: `🔥 توسعة التحضين (لحد يوم ${stage.untilDay}): افتح ${stage.pct}% من مساحة العنبر (${stage.openArea} م²) — يتحمل حتى ${stage.maxBirds} كتكوت${!stage.ok ? ' ⚠️ أقل من عدد الكتاكيت عندك، فكّر فى منطقة أوسع' : ''}.` });
                        }
                    }
                }
                const stageRow = plan.rows.find(r => todayAge >= r.fromDay && todayAge <= r.toDay);
                if (stageRow) {
                    const key = `equipPlan_${stageRow.fromDay}_${stageRow.toDay}`;
                    if (!b.executedPlanItems[key]) {
                        alerts.push({ level: 'info', planKey: key,
                            text: `🍽️ تجهيزات المرحلة (يوم ${stageRow.fromDay}-${stageRow.toDay}): محتاج ${stageRow.feeders} علافة (${stageRow.feederNote}) و ${stageRow.drinkers} نبل/سقاية (${stageRow.drinkerNote}).` });
                    }
                }
            })();
            // (تمت إزالة تنبيه "صيانة معدات مستحقة" مع إزالة نظام ساعات تشغيل المعدات والصيانة)

            // ===== صلاحية اللقاحات/الأدوية =====
            const expiryRows = computeExpiryAlerts(b);
            expiryRows.slice(0, 3).forEach(r => {
                alerts.push({ level: r.level === 'expired' ? 'danger' : 'warn',
                    actionLabel: '📦 راجع المخزون', actionOnclick: "goToManagementSub('inventory')",
                    text: r.level === 'expired' ? `⏳ صنف منتهي الصلاحية فى المخزون: ${r.name} (منذ ${Math.abs(r.daysLeft)} يوم) — لا تستخدمه` : `⏳ صنف قرب انتهاء الصلاحية: ${r.name} (متبقٍ ${r.daysLeft} يوم) — استخدمه أو استبدله قريبًا` });
            });
            // ===== موجة حر/برد متوقعة خلال 3 أيام قادمة (من آخر تحقق طقس محفوظ، لو لسه حديث خلال آخر 18 ساعة) =====
            if (state.farmWeatherForecast && state.farmWeatherForecast.fetchedAt) {
                const ageHours = (new Date() - new Date(state.farmWeatherForecast.fetchedAt)) / 3600000;
                if (ageHours <= 18) {
                    const prep = computeHeatColdPrepSchedule(b, m, state.farmWeatherForecast.forecastDays);
                    if (prep) {
                        const dayNames = ['غدًا','بعد غد','بعد 3 أيام'];
                        const worst = prep.find(r => r.level === 'heat') || prep.find(r => r.level === 'cold');
                        if (worst) {
                            const idx = prep.indexOf(worst);
                            const label = worst.level === 'heat' ? 'موجة حرارة' : 'موجة برودة';
                            const icon = worst.level === 'heat' ? '🔥' : '❄️';
                            alerts.push({ level: 'warn', text: `${icon} ${label} متوقعة ${dayNames[idx] || ('بعد ' + worst.offset + ' أيام')} (${worst.date}) — جهّز التبريد/التهوية أو التدفئة الآن مقدمًا، راجع تفاصيل الجدول فى الإعدادات ← الطقس` });
                        }
                    }
                }
            }
            // ===== العلف أوشك على النفاذ: نفس توقع الاستهلاك المستخدم فى تبويب المخزن، لكن كتنبيه رئيسي بدل ما يفضل مدفون هناك =====
            const feedForecastForAlert = computeFeedForecast(b, m, 10);
            if (feedForecastForAlert.stockOutInDays != null) {
                if (feedForecastForAlert.stockOutInDays <= 2) {
                    alerts.push({ level: 'danger', actionLabel: '🛒 سجّل شراء علف', actionOnclick: 'openPurchaseModal()',
                        text: `🌾⛔ العلف أوشك على النفاذ تمامًا (يكفي ~${fmt(feedForecastForAlert.stockOutInDays,0)} يوم فقط حسب معدل الاستهلاك المتوقع) — دبّر توريد عاجل الآن` });
                } else if (feedForecastForAlert.stockOutInDays <= 5) {
                    alerts.push({ level: 'warn', actionLabel: '🛒 سجّل شراء علف', actionOnclick: 'openPurchaseModal()',
                        text: `🌾 مخزون العلف يكفي ~${fmt(feedForecastForAlert.stockOutInDays,0)} يوم فقط حسب معدل الاستهلاك المتوقع — جهّز الشراء القادم قريبًا` });
                }
            }
            // ===== تحذير: قيمة مشتريات العلف المسجّلة أقل بكتير من التقدير القياسي (كمية مستهلكة فعليًا × متوسط سعر) =====
            // الحسابات المالية بتثق بأول عملية شراء مسجّلة بالكامل وتلغي التقدير الاحتياطي فورًا (شوف computeFinanceRaw).
            // لو فيه فجوة كبيرة، الأرجح إن شحنات علف اتستخدمت فعليًا لكن ما اتسجّلتش كمشترى، فالربح الظاهر يبقى متضخّم وهمي.
            (() => {
                const feedFromPurchases = b.purchases.filter(p => p.type === 'علف').reduce((s, p) => s + p.total, 0);
                const feedEstimate = (m.cumFeed || 0) * (b.feedprice || 0);
                if (feedFromPurchases > 0 && feedEstimate > 0 && feedFromPurchases < feedEstimate * 0.5) {
                    alerts.push({ level: 'warn', actionLabel: '🧾 سجل المشتريات', actionOnclick: "goToManagementSub('inventory')",
                        text: `💰 قيمة مشتريات العلف المسجّلة (${money(feedFromPurchases)}) أقل من نص التقدير القياسي (${money(feedEstimate)}) بناءً على الكمية المستهلكة فعليًا — الأرجح إن فيه شحنات علف اتستخدمت لكن ما اتسجّلتش كمشترى، فالربح الظاهر فى تبويب المالية ممكن يكون متضخّم وهمي. راجع سجل المشتريات.` });
                }
            })();
            // ===== مرحلة العلف (بادئ/نامي/ناهي): تنبيه استباقي قبل ميعاد التحويل، مبني على الاستهلاك الفعلي لا التقويم =====
            const feedStageInfo = getFeedStageInfo(b, m);
            if (feedStageInfo && feedStageInfo.nextStage && feedStageInfo.remainingKg != null) {
                if (feedStageInfo.remainingKg <= 0.02) {
                    alerts.push({ level: 'warn', text: `🌾 حسب الاستهلاك الفعلي المسجَّل، القطيع أنهى تقريبًا كمية علف ${feedStageInfo.stage.icon} ${feedStageInfo.stage.label} — جهّز التحويل لعلف ${feedStageInfo.nextStage.icon} ${feedStageInfo.nextStage.label} الآن` });
                } else if (feedStageInfo.remainingKg <= Math.max(feedStageInfo.stage.targetKg * 0.15, 0.05)) {
                    alerts.push({ level: 'info', text: `🌾 اقترب ميعاد التحويل من علف ${feedStageInfo.stage.icon} ${feedStageInfo.stage.label} لعلف ${feedStageInfo.nextStage.icon} ${feedStageInfo.nextStage.label} — باقي ~${fmt(feedStageInfo.remainingKg*1000,0)} جم/طائر تقريبًا` });
                }
            }
            // ===== تنبيه استباقي: إضافة شغالة دلوقتي فى الدفعة، وتاريخها عبر الدورات السابقة سلبي أو بدون تأثير =====
            {
                const activeNow = [
                    ...(b.feedAdditives || []).filter(a => a.active !== false && additiveActiveOnDay(a, m.todayAge)).map(a => ({ ...a, kind: 'علف' })),
                    ...(b.waterAdditives || []).filter(a => a.active !== false && additiveActiveOnDay(a, m.todayAge)).map(a => ({ ...a, kind: 'ماء' })),
                ];
                if (activeNow.length) {
                    const histRows = computeCrossCycleItemEffectiveness(b.species);
                    if (histRows) {
                        activeNow.forEach(a => {
                            const prefix = normalizeArabicName(a.name + ' (' + a.kind + ')');
                            const match = histRows.find(r => normalizeArabicName(r.name).startsWith(prefix) && (r.verdict === 'worsen' || r.verdict === 'none'));
                            if (match) {
                                alerts.push({ level: match.verdict === 'worsen' ? 'warn' : 'info',
                                    text: match.verdict === 'worsen'
                                        ? `💊⚠️ "${a.name}" (${a.kind}) شغالة دلوقتي، وسجّلها عبر ${match.cycles} دورة سابقة بيقول دايمًا بيفرق بالسلب — راجع الجرعة/الداعي لاستخدامها الآن`
                                        : `💊 "${a.name}" (${a.kind}) شغالة دلوقتي، وما ظهرش لها أثر واضح فى ${match.cycles} دورة سابقة — فرصة تراجع جدواها قبل تكرارها فى الدورات القادمة` });
                            }
                        });
                    }
                }
            }
            // ===== تنبيهات ناتجة عن ترابط تشيك ليست العمليات والأمان الحيوي =====
            const ops = computeOpsRisk(b, m);
            if (ops.checklistRate != null && ops.checklistRate < 60) {
                alerts.push({ level: 'warn', actionLabel: '🛡️ التشيك ليست', actionOnclick: 'openBiosecurityModal()',
                    text: `✅ الالتزام بتشيك ليست العمليات اليومية منخفض (${fmt(ops.checklistRate,0)}% متوسط آخر أيام) — راجع البنود غير المنفذة` });
            }
            if (ops.bioDaysSince != null && ops.bioDaysSince > 10) {
                alerts.push({ level: ops.bioDaysSince > 20 ? 'danger' : 'warn', actionLabel: '🛡️ سجّل أمان حيوي', actionOnclick: 'openBiosecurityModal()',
                    text: `🛡️ لا توجد إجراءات أمان حيوي مسجّلة منذ ${ops.bioDaysSince} يوم — سجّل تعقيم/مكافحة أو تأكد من تنفيذها` });
            }
            // ===== تجانس القطيع (Uniformity/CV%) — من آخر عيّنة أوزان فردية مسجّلة =====
            const uni = getLatestUniformity(b);
            if (uni && uni.age >= m.todayAge - 5) { // نعتبرها حديثة لو خلال آخر 5 أيام فقط
                if (uni.cv > 12) alerts.push({ level: 'danger', text: `📏 تجانس القطيع ضعيف (تفاوت ${fmt(uni.cv,1)}%، يوم ${uni.age}) — ${fmt(uni.pctWithin10,0)}% فقط من العيّنة قريبة من المتوسط، راجع توزيع العلافات/الكثافة` });
                else if (uni.cv > 8) alerts.push({ level: 'warn', text: `📏 تجانس القطيع متوسط (تفاوت ${fmt(uni.cv,1)}%، يوم ${uni.age}) — الهدف الصناعي أقل من 8%` });
            }
            // ===== جودة مياه الشرب — من آخر قراءة pH/ملوحة مسجّلة =====
            const lastWaterQ = [...b.records].reverse().find(r => r.waterPh != null || r.waterSalinity != null);
            if (lastWaterQ) {
                if (lastWaterQ.waterPh != null && (lastWaterQ.waterPh < 6 || lastWaterQ.waterPh > 8)) {
                    alerts.push({ level: 'warn', actionLabel: '💧 سجّل قراءة جديدة', actionOnclick: "openDailyModal('day')",
                        text: `💧 pH مياه الشرب خارج النطاق المثالي (${fmt(lastWaterQ.waterPh,1)}، يوم ${lastWaterQ.age}) — المعدل المثالي 6-8` });
                }
                if (lastWaterQ.waterSalinity != null && lastWaterQ.waterSalinity > 3000) {
                    alerts.push({ level: 'danger', actionLabel: '💧 سجّل قراءة جديدة', actionOnclick: "openDailyModal('day')",
                        text: `💧 ملوحة مياه الشرب مرتفعة جدًا (${fmt(lastWaterQ.waterSalinity,0)} ppm، يوم ${lastWaterQ.age}) — قد تؤثر على استهلاك الماء والنمو، يُنصح بمراجعة مصدر المياه` });
                } else if (lastWaterQ.waterSalinity != null && lastWaterQ.waterSalinity > 1500) {
                    alerts.push({ level: 'warn', actionLabel: '💧 سجّل قراءة جديدة', actionOnclick: "openDailyModal('day')",
                        text: `💧 ملوحة مياه الشرب أعلى من المثالي (${fmt(lastWaterQ.waterSalinity,0)} ppm، يوم ${lastWaterQ.age}) — المعدل المثالي أقل من 1500 ppm` });
                }
            }
            // ===== الإجهاد البيئي المُركّب الآن (آخر سجل) — تنبيه فورى بخلاف الارتباط الإحصائي التاريخي =====
            const lastRecForStress = [...b.records].sort((a, c) => c.age - a.age)[0];
            if (lastRecForStress && lastRecForStress.age >= m.todayAge - 1) {
                const envNow = computeEnvStressForRecord(b, lastRecForStress);
                if (envNow && envNow.stress >= 12) {
                    alerts.push({ level: 'danger', actionLabel: '📝 سجّل قراءة جديدة', actionOnclick: "openDailyModal('day')",
                        text: `🌡️💧🌬️ الإجهاد البيئي المُركّب مرتفع جدًا الآن (${envNow.parts.join('/')||'حرارة/رطوبة/أمونيا'}) — تدخّل فوري بالتهوية/التبريد` });
                } else if (envNow && envNow.stress >= 6) {
                    alerts.push({ level: 'warn', actionLabel: '📝 سجّل قراءة جديدة', actionOnclick: "openDailyModal('day')",
                        text: `🌡️💧🌬️ الإجهاد البيئي المُركّب مرتفع نسبيًا الآن (${envNow.parts.join('/')||'حرارة/رطوبة/أمونيا'}) — راقب التهوية` });
                }
            }
            // ===== بروتوكول توصيات التهوية — تُدرج التنبيهات العاجلة منه ضمن التنبيهات العامة، والبروتوكول الكامل معروض فى تبويب العمليات =====
            computeVentilationPlan(b, m).filter(v => v.level === 'danger' || v.level === 'warn')
                .forEach(v => alerts.push({ level: v.level, text: v.text }));

            // ===== فترة الراحة بين الدورات — مقارنة فعلية بتاريخ أرشفة آخر دورة من نفس النوع =====
            if (m.todayAge <= 10) {
                const lastArchived = state.batches.filter(x => x.id !== b.id && x.species === b.species && x.status === 'مؤرشفة' && x.archivedDate)
                    .sort((x, c) => c.archivedDate.localeCompare(x.archivedDate))[0];
                if (lastArchived) {
                    const gapDays = daysBetween(lastArchived.archivedDate, b.startDate);
                    const requiredRest = cfg.restDaysBetweenCycles;
                    if (gapDays < requiredRest) {
                        alerts.push({ level: gapDays < requiredRest / 2 ? 'danger' : 'warn',
                            text: `🧹 فترة الراحة قبل هذه الدورة كانت ${gapDays} يوم فقط (المفروض ${requiredRest} يوم على الأقل) — تأكد من اكتمال التنظيف والتعقيم` });
                    }
                }
            }
            // ===== الجدوى الاقتصادية — مقارنة تكلفة كيلو اللحم الجارية بمتوسط دورات المزرعة السابقة المكتملة (مؤشر مبكر أوثق من ROI قبل البيع) =====
            if (m.todayAge >= 21) {
                const finA = computeFinance(b, m);
                const prevCycles = state.batches.filter(x => x.id !== b.id && x.species === b.species && x.status === 'مؤرشفة' && x.records && x.records.length > 5);
                if (finA.costPerKg > 0 && prevCycles.length >= 2) {
                    const prevCosts = prevCycles.map(x => computeFinance(x, computeMetrics(x)).costPerKg).filter(c => c > 0);
                    if (prevCosts.length >= 2) {
                        const avgPrevCost = prevCosts.reduce((s, c) => s + c, 0) / prevCosts.length;
                        const diffPct = ((finA.costPerKg - avgPrevCost) / avgPrevCost) * 100;
                        if (diffPct > 20) alerts.push({ level: 'warn', text: `💰 تكلفة كيلو اللحم الجارية (${fmt(finA.costPerKg,2)} ج) أعلى من متوسط دوراتك السابقة (${fmt(avgPrevCost,2)} ج) بـ ${fmt(diffPct,0)}% — راجع هيكل التكاليف` });
                    }
                }
            }
            // ===== قرار البيع العاجل: تنبيه مستقل فى نظام التنبيهات العام (مش بس داشبورد الدفعة) لو بورصة الدواجن بتوصي بالبيع الآن =====
            {
                const finForSale = computeFinance(b, m);
                const saleAdvAlert = computeMarketSaleAdvice(b, m, finForSale);
                if (saleAdvAlert.osd && saleAdvAlert.nextRow) {
                    if (saleAdvAlert.nextRow.densityUnsafe) {
                        alerts.push({ level: 'danger', actionLabel: '🎯 روح لقرار البيع', actionOnclick: "setTab('dashboard')",
                            text: `🎯⚠️ الكثافة المتوقعة غدًا (${fmt(saleAdvAlert.nextRow.projDensity,1)} كجم/م²) هتتخطى الحد الآمن — الأفضل تبيع الآن حتى لو الربح الحدي لسه موجب` });
                    } else if (saleAdvAlert.nextRow.marginalProfit <= 0) {
                        alerts.push({ level: 'danger', actionLabel: '🎯 روح لقرار البيع', actionOnclick: "setTab('dashboard')",
                            text: `🎯🔴 سعر البورصة الحالي (${fmt(saleAdvAlert.priceForCalc,2)} ج/كجم) تحت سعر التعادل المطلوب (${fmt(saleAdvAlert.nextRow.breakEvenPrice,2)} ج/كجم) — الأفضل تبيع الآن` });
                    }
                }
            }
            b.vaccineLog.forEach(v => {
                if (!v.done) {
                    if (m.todayAge > v.day + cfg.vaccGraceDays) alerts.push({ level: 'danger',
                        actionLabel: '✓ اتحصّن', actionOnclick: `toggleVaccine('${v.id}')`,
                        text: `⚠️ فاتك معاد تحصين "${v.name}" (كان فى يوم ${v.day}) - العمر الحالي ${m.todayAge} يوم` });
                    else if (m.todayAge >= v.day) alerts.push({ level: 'warn',
                        actionLabel: '✓ اتحصّن', actionOnclick: `toggleVaccine('${v.id}')`,
                        text: `💉 موعد تحصين "${v.name}" اليوم (يوم ${v.day})` });
                    else if (v.day - m.todayAge <= cfg.vaccAdvanceDays) alerts.push({ level: 'info',
                        text: `💉 تحصين قادم: "${v.name}" بعد ${v.day - m.todayAge} يوم` });
                }
            });
            b.treatmentLog.forEach(t => {
                if (!t.done) {
                    if (m.todayAge > t.day + cfg.treatGraceDays) alerts.push({ level: 'warn',
                        actionLabel: '✓ اديته', actionOnclick: `toggleTreatment('${t.id}')`,
                        text: `🧴 فاتك معاد "${t.name}" (كان فى يوم ${t.day})` });
                    else if (m.todayAge >= t.day) alerts.push({ level: 'info',
                        actionLabel: '✓ اديته', actionOnclick: `toggleTreatment('${t.id}')`,
                        text: `🧴 موعد اليوم: "${t.name}"${timeLabel(t.time)}` });
                }
            });
            // ===== تنبيهات إضافات العلف (بداية/نهاية/سارية اليوم) =====
            (b.feedAdditives || []).forEach(a => {
                if (!a.active) return;
                const { from, to } = additiveDayRange(a);
                const isToday = additiveActiveOnDay(a, m.todayAge);
                if (m.todayAge === from) alerts.push({ level: 'warn',
                    text: `🌾 موعد بدء إضافة العلف اليوم: "${a.name}" (${additiveDayLabel(a)}) — ${additivePeriodLabel(a)}${timeLabel(a.time)} — الجرعة ${a.dose} ${a.unit}/${a.per}` });
                else if (m.todayAge === to) alerts.push({ level: 'warn',
                    text: `🌾 اليوم آخر يوم لإضافة العلف: "${a.name}" (${additivePeriodLabel(a)})${timeLabel(a.time)}` });
                else if (isToday) alerts.push({ level: 'info',
                    text: `🌾 إضافة العلف سارية اليوم: "${a.name}" (${additivePeriodLabel(a)})${timeLabel(a.time)} — الجرعة ${a.dose} ${a.unit}/${a.per}` });
            });
            // ===== تنبيهات إضافات الماء (بداية/نهاية/سارية اليوم) =====
            (b.waterAdditives || []).forEach(a => {
                if (!a.active) return;
                const { from, to } = additiveDayRange(a);
                const isToday = additiveActiveOnDay(a, m.todayAge);
                if (m.todayAge === from) alerts.push({ level: 'warn',
                    text: `💧 موعد بدء إضافة الماء اليوم: "${a.name}" (${additiveDayLabel(a)}) — ${additivePeriodLabel(a)}${timeLabel(a.time)} — الجرعة ${a.dose} ${a.unit}/${a.per}` });
                else if (m.todayAge === to) alerts.push({ level: 'warn',
                    text: `💧 اليوم آخر يوم لإضافة الماء: "${a.name}" (${additivePeriodLabel(a)})${timeLabel(a.time)}` });
                else if (isToday) alerts.push({ level: 'info',
                    text: `💧 إضافة الماء سارية اليوم: "${a.name}" (${additivePeriodLabel(a)})${timeLabel(a.time)} — الجرعة ${a.dose} ${a.unit}/${a.per}` });
            });
            // ===== تنبيهات فترة سحب الأدوية/المضادات الحيوية قبل الذبح (سلامة غذائية) =====
            function checkWithdrawal(a, kind) {
                if (!a.active || !a.withdrawalDays) return;
                const { to } = additiveDayRange(a);
                const safeAge = to + a.withdrawalDays;
                if (m.todayAge > to && m.todayAge <= safeAge) {
                    alerts.push({ level: 'danger',
                        text: `⛔ لا تذبح الآن! "${a.name}" (${kind}) لسه فى فترة السحب — آمن للذبح ابتداءً من يوم ${safeAge} (متبقي ${safeAge - m.todayAge} يوم)` });
                } else if (m.todayAge >= additiveDayRange(a).from && m.todayAge <= to) {
                    alerts.push({ level: 'warn',
                        text: `⚠️ "${a.name}" (${kind}) نشطة حاليًا، وفترة سحبها ${a.withdrawalDays} يوم بعد آخر جرعة (يوم ${to}) — لا يُذبح القطيع قبل يوم ${safeAge}` });
                }
                if (b.targetAge && b.targetAge < safeAge) {
                    alerts.push({ level: 'danger',
                        text: `📦⛔ عمر البيع المستهدف (${b.targetAge}) أقرب من نهاية فترة سحب "${a.name}" (${kind}) — آمن من يوم ${safeAge} فقط. أجّل البيع أو أوقف الجرعة مبكرًا` });
                }
            }
            (b.feedAdditives || []).forEach(a => checkWithdrawal(a, 'علف'));
            (b.waterAdditives || []).forEach(a => checkWithdrawal(a, 'ماء'));
            // جرعات خارج الجدول بفترة سحب > 0 — بتتحول لبند نقطي (from=to=يوم الجرعة) وتدخل نفس فحص السلامة الغذائية
            (b.quickInterventions || []).forEach(qi => {
                if (!qi.withdrawalDays) return;
                const doseAge = daysBetween(b.startDate, qi.date);
                checkWithdrawal({ active: true, name: qi.name, withdrawalDays: qi.withdrawalDays, from: doseAge, to: doseAge }, qi.type === 'water' ? 'ماء (خارج الجدول)' : 'علف (خارج الجدول)');
            });
            // ===== تنبيه استباقي بالنمط: انخفاض العلف عن المعيار 3 أيام متتالية (إنذار مبكر قبل تفاقم المشكلة) =====
            {
                // بنستبعد أي يوم لسه نهاره وليله مش مكتملين مع بعض (مثلاً نهار اليوم اتسجل ولسه
                // الليل لأ)، عشان ميتحسبش كـ"يوم كامل ناقص" غلط ضمن الـ3 أيام المتتالية.
                const sortedRecs = [...b.records].filter(r => r.feedDay != null && r.feedNight != null).sort((a, c) => a.age - c.age);
                if (sortedRecs.length >= 3) {
                    const last3 = sortedRecs.slice(-3);
                    const ratios = last3.map(r => {
                        const refs = getRefsForDay(b, r.age);
                        const liveAtDay = (m.series.find(s => s.date === r.date) || {}).liveCount || m.liveCount;
                        const stdFlockKg = (refs.feed * liveAtDay) / 1000;
                        return (stdFlockKg > 0 && r.feed != null) ? r.feed / stdFlockKg : null;
                    }).filter(v => v != null);
                    if (ratios.length === 3 && ratios.every(v => v < 0.9)) {
                        alerts.push({ level: 'danger',
                            text: `📉 نمط تحذيري: استهلاك العلف أقل من 90% من المعيار لـ 3 أيام متتالية — غالبًا مؤشر مبكر لمشكلة صحية أو بيئية، راجع القطيع فورًا قبل تفاقم الموقف` });
                    }
                }
            }
            // ===== كشف شذوذ إحصائي (Z-score) — مقارنة قراءة اليوم بمتوسط وانحراف أداء الدفعة نفسها مؤخرًا =====
            // بدل عتبة ثابتة، بيتأقلم مع طبيعة كل دفعة على حدة (مفيد جدًا لو معاييرك المرجعية غير دقيقة 100%)
            {
                function zScoreCheck(field, label, unit, minAbsForAlert, detrend) {
                    // القيم الخام لبعض المؤشرات (العلف/الماء/الحرارة) بتتصاعد أو تتناقص طبيعيًا مع عمر القطيع
                    // حسب المنحنى المرجعي — لو قارناها خام هيطلع "شذوذ" وهمي كل يوم بسبب الاتجاه الطبيعي نفسه
                    // مش بسبب مشكلة حقيقية. فبدل القيمة الخام، بنستخدم "الانحراف عن المعيار لنفس العمر" لإزالة
                    // أثر الاتجاه الطبيعي (نفس فكرة كشف شذوذ الوزن أعلاه بالظبط).
                    // للحقول اللي بتتجمع من نهار+ليل (علف/ماء/نفوق)، لازم اليوم يكون مكتمل القسمين
                    // قبل ما يدخل فى حساب الأساس أو "قراءة اليوم"، وإلا يوم لسه نهاره بس هيبان
                    // "منخفض بشكل غير طبيعي" غلط لأنه فعليًا نص يوم مش يوم كامل.
                    const dayNightKeys = { feed: ['feedDay', 'feedNight'], water: ['waterDay', 'waterNight'], mort: ['mortDay', 'mortNight'] };
                    const reqKeys = dayNightKeys[field];
                    const sortedRecs = [...m.series].filter(r => r.age > 0 && r[field] != null && (!reqKeys || (r[reqKeys[0]] != null && r[reqKeys[1]] != null)));
                    if (sortedRecs.length < 8) return; // محتاج تاريخ كافٍ لحساب خط أساس موثوق
                    const points = sortedRecs.map(r => {
                        if (!detrend) return { raw: r[field], val: r[field] };
                        const refs = getRefsForDay(b, r.age);
                        let refVal = null;
                        if (field === 'feed') refVal = (refs.feed * (r.liveCount || 0)) / 1000;
                        else if (field === 'water') refVal = (refs.water * (r.liveCount || 0)) / 1000;
                        else if (field === 'temp') refVal = refs.temp;
                        return { raw: r[field], val: refVal != null ? (r[field] - refVal) : r[field] };
                    });
                    const today = points[points.length - 1];
                    const baseline = points.slice(-8, -1); // آخر 7 أيام سابقة (باستثناء اليوم الحالي)
                    const n = baseline.length;
                    const mean = baseline.reduce((s, p) => s + p.val, 0) / n;
                    const variance = baseline.reduce((s, p) => s + Math.pow(p.val - mean, 2), 0) / n;
                    const std = Math.sqrt(variance);
                    if (std < 0.0001) return; // لا يوجد تفاوت كافٍ فى الأساس للمقارنة
                    const z = (today.val - mean) / std;
                    if (Math.abs(z) >= 2 && Math.abs(today.val - mean) >= (minAbsForAlert || 0)) {
                        alerts.push({ level: Math.abs(z) >= 3 ? 'danger' : 'warn',
                            text: `📊 ${label} اليوم ${z>0?'أعلى':'أقل'} من المعتاد بشكل ملحوظ: ${fmt(today.raw,1)} ${unit} — مختلف بوضوح عن نمط آخر أسبوع لنفس الدفعة` });
                    }
                }
                zScoreCheck('feed', 'استهلاك العلف', 'كجم', 0.5, true);
                zScoreCheck('water', 'استهلاك الماء', 'لتر', 1, true);
                zScoreCheck('temp', 'حرارة العنبر', '°م', 0.5, true);
                zScoreCheck('mort', 'عدد النفوق اليومي', 'طائر', 1, false);
            }
            // ===== تحليلات ذكية مركّبة: شذوذ إحصائي فى انحراف الوزن + مؤشر "احتمالية مشكلة قادمة" — تُدرج فى التنبيهات العامة لو واضحة =====
            {
                const insForAlerts = computeInsights(b, m);
                if (insForAlerts.weightZAnomaly) {
                    const wz = insForAlerts.weightZAnomaly;
                    alerts.push({ level: Math.abs(wz.z) >= 3 ? 'danger' : 'warn',
                        text: `📏⚠️ آخر وزنة (يوم ${wz.age}) مختلفة بوضوح عن باقي وزنات هذه الدفعة — الانحراف عن المعياري (${fmt(wz.dev,1)}%) خارج عن المعتاد، تأكد من دقة الميزان أو راجع السبب` });
                }
                if (insForAlerts.riskIndex && insForAlerts.riskIndex.level !== 'ok') {
                    const ri = insForAlerts.riskIndex;
                    alerts.push({ level: ri.level,
                        text: `🧭 احتمالية مشكلة قادمة ${ri.level === 'danger' ? 'مرتفعة' : 'متوسطة'} (${ri.score}/100) — الأسباب: ${ri.reasons.join('، ') || 'عدة إشارات مجتمعة'}` });
                }
            }
            // ===== تنبيه استباقي من "قاعدة معرفة الحوادث": نمط مشكلة تكرر عبر دوراتك السابقة قريب من العمر الحالي =====
            {
                const kb = computeIncidentKnowledgeBase(b.species);
                if (kb && kb.length) {
                    const upcoming = kb.filter(e => e.ageCenter >= m.todayAge && e.ageCenter <= m.todayAge + 5)
                        .sort((a, c) => a.ageCenter - c.ageCenter)[0];
                    if (upcoming) {
                        const daysAway = upcoming.ageCenter - m.todayAge;
                        const solTxt = upcoming.bestSolution
                            ? ` — الحل اللي نجح غالبًا سابقًا: "${upcoming.bestSolution.name}" (نجح فى ${fmt(upcoming.bestSolution.successRate*100,0)}% من ${upcoming.bestSolution.timesUsed} محاولة)`
                            : ' — لسه مفيش حل مُثبت مرتبط بهذا النمط فى بياناتك';
                        alerts.push({ level: 'warn',
                            text: `🧠 تنبيه من خبرة دوراتك السابقة: "${upcoming.category}" حصل فى ${upcoming.cyclesAffected} من دوراتك حوالي يوم ${upcoming.ageCenter}${daysAway > 0 ? ' (بعد ' + daysAway + ' يوم من عمر النهاردة)' : ' (زي عمر النهاردة تقريبًا)'}${solTxt}` });
                    }
                }
            }
            // ===== مؤشر "الاتجاه" خلال آخر أيام: فرق كبير بين مؤشر "مرتفع ومستقر" ومؤشر "مرتفع وبيزيد" — نفس القيمة الحالية ممكن يكون معناها مختلف تمامًا =====
            {
                const recentDays = [...b.records].sort((a, c) => a.age - c.age).filter(r => r.age > 0).slice(-4);
                if (recentDays.length >= 3) {
                    // اتجاه النفوق كنسبة من الأحياء وقتها (مش عدد مطلق) عشان ما يتأثرش بتناقص القطيع الطبيعي مع الوقت
                    const mortRatioSeries = recentDays.map(r => {
                        const row = m.series.find(x => x.date === r.date);
                        return (row && row.liveCount > 0) ? (((r.mort || 0) + (r.cull || 0)) / row.liveCount) * 100 : null;
                    }).filter(v => v != null);
                    const mortTrend = trendDirection(mortRatioSeries);
                    const currentDailyMortPct = mortRatioSeries[mortRatioSeries.length - 1];
                    if (mortTrend && currentDailyMortPct != null && currentDailyMortPct > 0.3) {
                        const label = mortTrend === 'up' ? '📈 مرتفع وبيزيد يوم بعد يوم — لسه مش مستقر، تدخّل الآن قبل ما يتفاقم'
                            : mortTrend === 'down' ? '📉 مرتفع لكن بيتحسن تدريجيًا — استمر على نفس الإجراءات الحالية'
                            : '➖ مرتفع لكن مستقر عند نفس المستوى — لسه محتاج علاج للسبب، مش بس مراقبة';
                        alerts.push({ level: mortTrend === 'up' ? 'danger' : 'warn',
                            text: `🧭 اتجاه معدل النفوق اليومي (آخر ${recentDays.length} أيام فعلية): ${label}` });
                    }
                    // اتجاه الإجهاد البيئي المُركّب
                    const stressSeriesRecent = recentDays.map(r => { const s = computeEnvStressForRecord(b, r); return s ? s.stress : null; }).filter(v => v != null);
                    const stressTrend = trendDirection(stressSeriesRecent);
                    const currentStress = stressSeriesRecent[stressSeriesRecent.length - 1];
                    if (stressTrend && currentStress != null && currentStress >= 6) {
                        const label = stressTrend === 'up' ? '📈 الإجهاد بيزيد يوم بعد يوم' : stressTrend === 'down' ? '📉 الإجهاد بيقل تدريجيًا — التدخل الحالي بيأتي بنتيجة' : '➖ الإجهاد مستقر عند نفس المستوى المرتفع';
                        alerts.push({ level: stressTrend === 'up' ? 'danger' : 'warn',
                            text: `🧭 اتجاه الإجهاد البيئي المُركّب (آخر ${recentDays.length} أيام فعلية): ${label}` });
                    }
                }
            }
            if (b.targetAge) {
                if (m.todayAge >= b.targetAge + cfg.targetAgeAdvanceDays) alerts.push({ level: 'danger', actionLabel: '🎯 روح لقرار البيع', actionOnclick: "setTab('dashboard')",
                    text: `📦 القطيع تجاوز العمر المستهدف للبيع (${b.targetAge} يوم) منذ ${m.todayAge - b.targetAge} يوم` });
                else if (m.todayAge >= b.targetAge) alerts.push({ level: 'warn', actionLabel: '🎯 روح لقرار البيع', actionOnclick: "setTab('dashboard')",
                    text: `📦 القطيع وصل لعمر البيع المستهدف (${b.targetAge} يوم) - وقت البيع!` });
                else if (b.targetAge - m.todayAge <= cfg.targetAgeAdvanceDays) alerts.push({ level: 'info',
                    text: `📦 اقترب موعد البيع المستهدف بعد ${b.targetAge - m.todayAge} يوم` });
            }
            if (b.targetWeight && m.avgWeightG >= b.targetWeight) alerts.push({ level: 'info', actionLabel: '🎯 روح لقرار البيع', actionOnclick: "setTab('dashboard')",
                text: `⚖️ الوزن الحالي وصل للهدف (${fmt(b.targetWeight, 0)} جم) - فكّر فى البيع` });
            // ⚠️ إصلاح: كان بيعمل تنبيه منفصل لكل صنف نافذ فى المخزن — لو 6-7 أصناف خلصوا مع بعض (شائع قرب
            // نهاية الدورة)، الشاشة بتتغرق بكروت متكررة الشكل، وكل واحد محتاج "كتم" لوحده. دلوقتي تنبيه واحد
            // مجمّع لكل الأصناف الناقصة، بمفتاح ثابت (مش مبني على النص) عشان الكتم يفضل شغّال حتى لو تغيّرت
            // قائمة الأصناف الناقصة تفصيليًا.
            const outOfStockItems = b.inventory.filter(it => it.balance <= 0);
            if (outOfStockItems.length === 1) {
                alerts.push({ level: 'danger', key: 'lowStockGroup', actionLabel: '🛒 سجّل شراء', actionOnclick: 'openPurchaseModal()',
                    text: `📦 نواقص فى المخزن: "${outOfStockItems[0].name}" (الرصيد ${fmt(outOfStockItems[0].balance, 1)} ${outOfStockItems[0].unit})` });
            } else if (outOfStockItems.length > 1) {
                alerts.push({ level: 'danger', key: 'lowStockGroup', actionLabel: '🛒 سجّل شراء', actionOnclick: 'openPurchaseModal()',
                    text: `📦 نواقص فى المخزن (${outOfStockItems.length} صنف): ${outOfStockItems.map(it => `"${it.name}" (${fmt(it.balance, 1)} ${it.unit})`).join('، ')}` });
            }
            // ===== ربط تلقائي: توقع نفاذ العلف (منحنى استهلاك متصاعد) قبل الوصول لعمر البيع المستهدف — تحذير مبكر قبل نفاذ فعلي =====
            if (b.targetAge && b.targetAge > m.todayAge) {
                const ff = computeFeedForecast(b, m, b.targetAge - m.todayAge);
                if (ff.currentBalanceKg != null) {
                    const targetRow = ff.rows[ff.rows.length - 1];
                    if (targetRow && ff.currentBalanceKg < targetRow.cumFeedKg) {
                        const shortfall = targetRow.cumFeedKg - ff.currentBalanceKg;
                        const level = ff.stockOutInDays != null && ff.stockOutInDays <= 5 ? 'danger' : 'warn';
                        alerts.push({ level, actionLabel: '🛒 سجّل شراء علف', actionOnclick: 'openPurchaseModal()',
                            text: `🌾🔮 مخزون العلف الحالي مش هيكفي للوصول لعمر البيع المستهدف (${b.targetAge} يوم) — ناقص حوالي ${fmt(shortfall,0)} كجم${ff.stockOutInDays!=null?` (متوقع النفاذ خلال ~${ff.stockOutInDays} يوم)`:''}، بناءً على منحنى الاستهلاك المتصاعد وليس متوسط ثابت` });
                    }
                }
            }
            {
                const remCatIcon2 = { feed: '🌾', water: '💧', medication: '💊', maintenance: '🔧', other: '📌' };
                b.reminders.filter(r => !r.done && r.date <= todayStr()).forEach(r => alerts.push({ level: r.date < todayStr() ? 'danger' : 'warn',
                    actionLabel: '✓ خلصت التذكير', actionOnclick: `toggleReminder('${r.id}')`,
                    text: `${remCatIcon2[r.category]||'🔔'} ${r.date < todayStr() ? 'متأخر' : 'مستحق اليوم'}: ${r.title}${r.repeatDays > 0 ? ' (تذكير متكرر)' : ''}` }));
            }
            // ===== مستحقات آجلة متأخرة (للموردين أو من العملاء) — ترابط مباشر بين وحدة المشتريات/المبيعات ووحدة التنبيهات =====
            {
                const overduePur = (b.purchases || []).filter(p => p.paid === false && p.dueDate && p.dueDate < todayStr());
                const overdueSal = (b.sales || []).filter(s => s.paid === false && s.dueDate && s.dueDate < todayStr());
                if (overduePur.length) {
                    const sum = overduePur.reduce((s, p) => s + p.total, 0);
                    alerts.push({ level: 'warn', actionLabel: '💳 سجل المشتريات', actionOnclick: "goToManagementSub('inventory')",
                        text: `💳 لديك ${overduePur.length} مستحق سداد متأخر لموردين بإجمالي ${money(sum)} — راجع سجل المشتريات` });
                }
                if (overdueSal.length) {
                    const sum = overdueSal.reduce((s, x) => s + x.total, 0);
                    alerts.push({ level: 'warn', actionLabel: '💳 سجل المبيعات', actionOnclick: "goToManagementSub('inventory')",
                        text: `💳 لديك ${overdueSal.length} مستحق تحصيل متأخر من عملاء بإجمالي ${money(sum)} — راجع سجل المبيعات` });
                }
            }
            const lastRec = b.records.length ? [...b.records].sort((a, c) => a.age - c.age)[b.records.length - 1] : null;
            if (lastRec && lastRec.date === todayStr()) {
                const refs = getRefsForDay(b, lastRec.age);
                const liveAtThatDay = (m.series.find(s => s.date === lastRec.date) || {}).liveCount || m.liveCount;
                const stdFeedFlockKg = (refs.feed * liveAtThatDay) / 1000;
                const stdWaterFlockL = (refs.water * liveAtThatDay) / 1000;
                // مقارنة "الاستهلاك اليومي مقابل المعيار" تفترض إجمالي يوم كامل (نهار + ليل)، فلازم
                // نتأكد إن السجل مكتمل القسمين قبل المقارنة، وإلا هيطلع تنبيه غلط لو اتسجل نص يوم بس
                // (مثلاً النهار فقط ولسه الليل معلش) لأن الرقم هيبان أقل من المعيار طبيعيًا.
                const dayNightComplete = lastRec.feedDay != null && lastRec.feedNight != null;
                if (dayNightComplete && stdFeedFlockKg > 0 && lastRec.feed > 0 && lastRec.feed < stdFeedFlockKg * 0.85) {
                    const pct = ((1 - lastRec.feed / stdFeedFlockKg) * 100).toFixed(0);
                    alerts.push({ level: 'danger',
                        text: `🌾 نقص فى العلف اليوم بنسبة ${pct}% عن المعيار (${fmt(lastRec.feed, 1)} كجم بدل ${fmt(stdFeedFlockKg, 1)} كجم) - مؤشر مشكلة يستلزم المتابعة` });
                }
                if (dayNightComplete && stdWaterFlockL > 0 && lastRec.water > 0 && lastRec.water < stdWaterFlockL * 0.85) {
                    const pct = ((1 - lastRec.water / stdWaterFlockL) * 100).toFixed(0);
                    alerts.push({ level: 'danger',
                        text: `💧 نقص فى استهلاك الماء اليوم بنسبة ${pct}% عن المعيار (${fmt(lastRec.water, 1)} لتر بدل ${fmt(stdWaterFlockL, 1)} لتر) - قد يدل على مرض أو عطل فى المساقي` });
                }
                if (lastRec.temp != null && refs.temp) {
                    const diff = Math.abs(lastRec.temp - refs.temp);
                    if (diff > 2) {
                        const isCold = lastRec.temp < refs.temp;
                        const noHeatWarning = (isCold && (b.heattype === 'none')) ? ' — لا يوجد مصدر تدفئة مُسجَّل لهذه الدفعة أصلًا! راجع بيانات الدفعة وجهّز مصدر تدفئة عاجل' : '';
                        const level = (diff > 4 || noHeatWarning) ? 'danger' : 'warn';
                        alerts.push({ level,
                            text: `🌡️ درجة الحرارة ${lastRec.temp}°C ${lastRec.temp > refs.temp ? 'أعلى' : 'أقل'} من المثلى (${fmt(refs.temp, 1)}°C) بفارق ${fmt(diff, 1)}°C${noHeatWarning}` });
                    }
                }
                if (lastRec.humidity != null && refs.humidity) {
                    const diff = Math.abs(lastRec.humidity - refs.humidity);
                    if (diff > cfg.humidityDiffThreshold) {
                        alerts.push({ level: 'warn',
                            text: `💧 الرطوبة ${lastRec.humidity}% ${lastRec.humidity > refs.humidity ? 'أعلى' : 'أقل'} من المثلى (${refs.humidity.toFixed(0)}%)` });
                    }
                }
                if (lastRec.tempDay != null && lastRec.tempNight != null) {
                    const dnDiff = Math.abs(lastRec.tempDay - lastRec.tempNight);
                    if (dnDiff >= 6) {
                        alerts.push({ level: dnDiff >= 9 ? 'danger' : 'warn',
                            text: `🌡️🌙 تفاوت حرارى كبير بين النهار والليل اليوم (${fmt(dnDiff,1)}°C) — راجع التدفئة/التهوية الليلية لتقليل الإجهاد الحرارى` });
                    }
                }
                if ((lastRec.mortDay || 0) + (lastRec.mortNight || 0) >= 3 && lastRec.mortNight > lastRec.mortDay && lastRec.mortNight >= (lastRec.mortDay || 0) * 2) {
                    alerts.push({ level: 'warn',
                        text: `💀🌙 نفوق الليل (${lastRec.mortNight}) أعلى وضوحًا من نفوق النهار (${lastRec.mortDay || 0}) اليوم — راجع التدفئة/التهوية الليلية أو احتمال دخول حيوانات مفترسة` });
                }
            }
            // ===== تنبيهات ذكية: مقارنة الأداء بالمتوسط التاريخي لدفعات سابقة من نفس النوع =====
            if (m.age >= 3) {
                const peers = state.batches.filter(x => x.id !== b.id && x.species === b.species && x.records && x.records.length > 0);
                const histRatesAtAge = [];
                peers.forEach(hb => {
                    const hm = computeMetrics(hb);
                    const rec = [...hm.series].reverse().find(s => s.age <= m.age);
                    if (rec && rec.age >= m.age - 2 && hb.startCount > 0) {
                        histRatesAtAge.push(((rec.cumMort + rec.cumCull) / hb.startCount) * 100);
                    }
                });
                if (histRatesAtAge.length >= 2) {
                    const avgHistRate = histRatesAtAge.reduce((a, c) => a + c, 0) / histRatesAtAge.length;
                    if (avgHistRate > cfg.mortCompareMinRate && m.mortRate > avgHistRate * cfg.mortCompareHighMult && (m.mortRate - avgHistRate) > 1) {
                        alerts.push({ level: 'danger',
                            text: `📉 نسبة النفوق الحالية (${fmt(m.mortRate,1)}%) أعلى من متوسط أدائك التاريخي عند نفس العمر (${fmt(avgHistRate,1)}%) لدفعات سابقة من نفس النوع — راجع الأسباب المحتملة` });
                    } else if (avgHistRate > cfg.mortCompareMinRate && m.mortRate < avgHistRate * cfg.mortCompareLowMult) {
                        alerts.push({ level: 'info',
                            text: `✅ نسبة النفوق الحالية (${fmt(m.mortRate,1)}%) أفضل من متوسطك التاريخي عند نفس العمر (${fmt(avgHistRate,1)}%) — استمر على نفس النهج` });
                    }
                }
                // مقارنة FCR بالقرب من عمر البيع المستهدف
                if (b.targetAge && m.age >= b.targetAge - cfg.fcrCompareWindowDays && m.fcr) {
                    const histFcrs = peers.map(hb => computeMetrics(hb).fcr).filter(v => v != null && v > 0);
                    if (histFcrs.length >= 2) {
                        const avgHistFcr = histFcrs.reduce((a, c) => a + c, 0) / histFcrs.length;
                        if (m.fcr > avgHistFcr * 1.1) {
                            alerts.push({ level: 'warn',
                                text: `🌾 معامل التحويل الغذائي الحالي (${fmt(m.fcr,2)}) أعلى (أضعف) من متوسطك التاريخي (${fmt(avgHistFcr,2)}) — يزيد من تكلفة الإنتاج` });
                        }
                    }
                }
            }
            // ============ 🔴 إصلاح Red Team: "تجاهل" بقى ثابت لحد ما يحصل تغيير حقيقي، مش بيرجع يظهر تلقائيًا كل يوم ============
            // قبل كده: كتم التنبيه كان بيتفك تلقائيًا كل يوم (مقارنة بتاريخ اليوم بالظبط) حتى لو نفس المشكلة
            // بالظبط لسه قائمة زي ما هي — إزعاج يومي لحاجة المستخدم قال صراحة إنها مش مهمة. دلوقتي: التجاهل
            // (dismissAlert) بيفضل ساري طالما نفس المشكلة مستمرة، ومبيترفعش إلا فى حالتين حقيقيتين:
            // (أ) تصعيد واضح فى الخطورة (كان warn وبقى danger) — يتم كشفه هنا قبل ما نحدد a.dismissed،
            // (ب) المشكلة اتحلت فعلاً وبعدين رجعت من الصفر — بيتصفّر تلقائيًا فى logAlertHistory تحت.
            alerts.forEach(a => {
                if (!a.key) a.key = alertKeyFromText(a.text);
                const dKey = 'alert_' + a.key;
                const entry = b.dismissedAlerts && b.dismissedAlerts[dKey];
                if (entry && typeof entry === 'object' && entry.level === 'warn' && a.level === 'danger') {
                    delete b.dismissedAlerts[dKey]; // تصعيد حقيقي فى الخطورة — يستاهل يظهر تاني حتى لو كان متجاهل بمستوى أخف
                }
                a.dismissed = isDismissedToday(b, dKey);
                a.dismissCount = (b.alertDismissCount && b.alertDismissCount[a.key]) || 0;
            });
            logAlertHistory(b, alerts);
            return alerts;
        }

        function updateBatchCreateButtonUI() {
            const btn = document.getElementById('newBatchBtn');
            if (!btn) return;
            const allowed = currentRole === 'owner' || workerHasPermission('createBatch');
            btn.style.display = allowed ? 'block' : 'none';
        }

        function refreshInvDatalist() {
            const b = getActiveBatch();
            const dl = document.getElementById('dl_invItems');
            if (!dl) return;
            if (!b) { dl.innerHTML = ''; return; }
            const names = [...new Set(b.inventory.map(i => i.name))];
            dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
        }

        // ============ Render Router ============
        // ============ مؤشر الاتصال (أونلاين/أوفلاين) — التطبيق يعمل بالكامل بدون إنترنت،
        // هذا المؤشر بس يوضّح للمستخدم إن بياناته آمنة محليًا وإن الاتصال مش شرط لعمل التطبيق.
