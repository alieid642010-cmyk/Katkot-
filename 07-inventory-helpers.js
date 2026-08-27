        function normalizeArabicName(name) {
            if (!name) return '';
            return name.toString().trim().toLowerCase()
                .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
                .replace(/[إأآا]/g, 'ا')
                .replace(/ى/g, 'ي')
                .replace(/\s+/g, ' ')
                .trim();
        }

        // ============ مكوّن واجهة قابل لإعادة الاستخدام (المرحلة 2 من خطة الهندسة) ============
        // نمط "جدول أو حالة فارغة" ده كان متكرر يدويًا فى ~7 أماكن على الأقل بنفس الشكل بالظبط:
        // <div class="card scroll-x">${hasData?`<table><thead>...</thead><tbody>...</tbody></table>`:`<div class="empty">...</div>`}</div>
        // الدالة دي بتاخد نفس المدخلات (شرط وجود بيانات، صفوف الرأس كـHTML جاهز، صفوف الجسم كـHTML جاهز،
        // أيقونة ونص حالة الفراغ، ومعرّف tbody اختياري للاستخدام مع liveFilterTable) وترجع بالظبط نفس الناتج
        // النصي اللي كان بيتكتب يدويًا فى كل مكان — الهدف تنظيم وتقليل تكرار بس، من غير أي تغيير فى الشكل النهائي.
        function renderTableOrEmpty(hasData, headersHtml, rowsHtml, emptyIcon, emptyText, tbodyId) {
            if (!hasData) return `<div class="card scroll-x"><div class="empty"><div class="ico">${emptyIcon}</div>${emptyText}</div></div>`;
            const tbodyAttr = tbodyId ? ` id="${tbodyId}"` : '';
            return `<div class="card scroll-x"><table><thead><tr>${headersHtml}</tr></thead><tbody${tbodyAttr}>${rowsHtml}</tbody></table></div>`;
        }

        // ============ مكوّن سطر إحصائي قابل لإعادة الاستخدام (المرحلة 2) ============
        // نمط <div class="stat-line"><span class="k">مفتاح</span><span class="v">قيمة</span></div> كان
        // متكرر يدويًا فى 157 مكان تقريبًا عبر التطبيق (الداشبورد، التحليلات، الجدوى، المخاطر، إلخ).
        // الدالة دي بترجع نفس الـHTML بالظبط. opts اختيارية لتخصيص الـstyle/id لأي من العناصر التلاتة.
        function statLine(k, v, opts) {
            opts = opts || {};
            const lineAttr = (opts.lineStyle ? ` style="${opts.lineStyle}"` : '') + (opts.lineId ? ` id="${opts.lineId}"` : '');
            const kAttr = opts.kStyle ? ` style="${opts.kStyle}"` : '';
            const vAttr = (opts.vStyle ? ` style="${opts.vStyle}"` : '') + (opts.vId ? ` id="${opts.vId}"` : '');
            return `<div class="stat-line"${lineAttr}><span class="k"${kAttr}>${k}</span><span class="v"${vAttr}>${v}</span></div>`;
        }

        // ============ بحث/فلترة فورية داخل الجداول الطويلة (سجل يومي، مخزن، مشتريات، مبيعات) ============
        // فلترة على مستوى الـ DOM مباشرة (إخفاء/إظهار صفوف) بدل استدعاء render() الكامل، عشان التركيز
        // (focus) على خانة البحث ميضاعش مع كل حرف يكتبه المستخدم. تستخدم normalizeArabicName نفسها
        // المستخدمة فى مطابقة أصناف المخزن، فالبحث بيتجاهل الهمزات/التشكيل (مثلاً "إضافة" = "اضافه").
        function liveFilterTable(inputEl, tbodyId) {
            const q = normalizeArabicName(inputEl.value);
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;
            let visibleCount = 0;
            Array.from(tbody.rows).forEach(row => {
                const match = !q || normalizeArabicName(row.textContent).includes(q);
                row.style.display = match ? '' : 'none';
                if (match) visibleCount++;
            });
            const countEl = document.getElementById(tbodyId + '_count');
            if (countEl) countEl.textContent = q ? `${visibleCount} نتيجة` : '';
        }

        function levenshtein(a, b) {
            if (a === b) return 0;
            if (!a.length) return b.length;
            if (!b.length) return a.length;
            const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
            for (let j = 0; j <= b.length; j++) dp[0][j] = j;
            for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
                        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
                }
            }
            return dp[a.length][b.length];
        }

        function findSimilarInvItem(b, name, category) {
            const norm = normalizeArabicName(name);
            if (norm.length < 3) return null;
            let best = null, bestDist = Infinity;
            b.inventory.forEach(it => {
                if (it.category !== category) return;
                const itNorm = normalizeArabicName(it.name);
                if (itNorm === norm) return;
                const dist = levenshtein(norm, itNorm);
                const threshold = Math.max(1, Math.floor(Math.max(norm.length, itNorm.length) * 0.2));
                if (dist <= threshold && dist < bestDist) { best = it; bestDist = dist; }
            });
            return best;
        }

        // ⚠️ إصلاح: لازم نطابق بالاسم + التصنيف معًا. النظام بيسمح (بتحذير فقط) بوجود صنفين
        // بنفس الاسم فى تصنيفين مختلفين، فلو تجاهلنا التصنيف هنا، أي عملية خصم/إضافة/عكس
        // ممكن تمسك أول صنف مطابق بالاسم بس وتخصم أو تضيف على الصنف الغلط فى التصنيف الغلط.
        function findInvItem(b, name, category) {
            const key = normalizeArabicName(name);
            return b.inventory.find(i => normalizeArabicName(i.name) === key && (!category || i.category === category));
        }

        function ensureInvItem(b, name, category, unit) {
            let it = findInvItem(b, name, category);
            if (!it) {
                const similar = findSimilarInvItem(b, name, category);
                if (similar) {
                    showToast(`⚠️ يوجد صنف مشابه "${similar.name}" فى المخزون — تأكد أنه نفس الصنف بنفس الاسم بالضبط لتفادى التكرار (أو استخدم "دمج الأصناف المكررة")`);
                }
                it = { id: uid(), name, category, unit, balance: 0 };
                b.inventory.push(it);
            }
            return it;
        }

        // ============ تحويل الوحدات ============
        // المشكلة الأصلية: الصنف الواحد يمكن أن يُشترى بوحدة (مثال: لتر، عبوة) وتُحسب جرعة
        // استخدامه بوحدة أخرى تمامًا (مثال: مل، جم) — والنظام كان يخصم الرقمين من نفس الرصيد
        // مباشرة وكأنهما بنفس الوحدة، فيظهر نقص/رصيد سالب ضخم وغير منطقي رغم توفر الكمية الفعلية.
        // نُحوّل هنا فقط بين وحدات "متوافقة فيزيائيًا" (وزن مع وزن، حجم مع حجم). الوحدات العددية
        // (عبوة/جرعة/قطعة/طائر/عملية/أخرى) لا يمكن تحويلها تلقائيًا لأنها تعتمد على محتوى العبوة،
        // فتظهر رسالة تنبيه صريحة بدل خصم خاطئ صامت.
        const UNIT_FAMILY = {
            'كجم': 'weight', 'جم': 'weight', 'طن': 'weight', 'شيكارة (25كجم)': 'weight',
            'لتر': 'volume', 'مل': 'volume', 'سم': 'volume',
        };
        const UNIT_FACTOR = { // القيمة المكافئة بالوحدة القياسية لكل عائلة (كجم للوزن، لتر للحجم)
            'كجم': 1, 'جم': 0.001, 'طن': 1000, 'شيكارة (25كجم)': 25,
            'لتر': 1, 'مل': 0.001, 'سم': 0.001,
        };

        // يحوّل qty من fromUnit إلى toUnit. يرجع null لو الوحدتان غير متوافقتين فيزيائيًا
        // (مثال: تحويل "جرعة" إلى "لتر" غير ممكن تلقائيًا).
        function convertUnitQty(qty, fromUnit, toUnit) {
            if (!fromUnit || !toUnit || fromUnit === toUnit) return qty;
            const famFrom = UNIT_FAMILY[fromUnit], famTo = UNIT_FAMILY[toUnit];
            if (!famFrom || !famTo || famFrom !== famTo) return null;
            return qty * UNIT_FACTOR[fromUnit] / UNIT_FACTOR[toUnit];
        }

        // يحل كمية جرعة/تنفيذ مُدخلة بوحدتها الأصلية (مثال: جم أو مل) إلى وحدة الصنف الفعلية
        // المسجلة بالمخزن (يُنشئ الصنف بهذه الوحدة لو كان جديدًا تمامًا). لو الصنف موجود بوحدة
        // من عائلة مختلفة تمامًا، ترجع qty بقيمة null للدلالة على عدم إمكانية التحويل التلقائي.
        // يحدد الصنف المطابق للاسم/التصنيف، أو ينشئ صنف جديد بنفس منطق تطبيع الوحدة المستخدم
        // فى stockIn (وزن/حجم يتحوّلوا لوحدة قياسية موحدة) — بدون أي تعديل على الرصيد.
        // مستخدمة فى تعديل حركة مخزون قديمة (editMovement) لو المستخدم غيّر اسم/تصنيف الصنف.
        function resolveOrCreateInvItemForName(b, name, category, unit) {
            const existing = findInvItem(b, name, category);
            if (existing) return existing;
            let baseUnit = unit;
            if (UNIT_FAMILY[unit] === 'weight') baseUnit = 'كجم';
            else if (UNIT_FAMILY[unit] === 'volume') baseUnit = 'لتر';
            return ensureInvItem(b, name, category, baseUnit);
        }

        function resolveInvQty(b, name, category, doseQty, doseUnit) {
            const it = ensureInvItem(b, name, category, doseUnit || 'قطعة');
            if (it.unit === doseUnit) return { it, qty: doseQty };
            return { it, qty: convertUnitQty(doseQty, doseUnit, it.unit) };
        }

        function stockIn(b, name, category, unit, qty, date, note, expiryDate) {
            // ⚠️ إصلاح: كانت الدالة بترجع null بصمت لو الكمية صفر/سالبة، فيتحفظ المشترى
            // بـ stocked:false من غير أي تنبيه للمستخدم إن المخزون ما اتحدّثش فعليًا.
            if (qty <= 0) {
                showToast('⚠️ كمية الصنف صفر أو غير صحيحة — لم تُضَف أي كمية للمخزون');
                return null;
            }
            const existing = findInvItem(b, name, category);
            if (existing) {
                const converted = convertUnitQty(qty, unit, existing.unit);
                if (converted == null) {
                    showToast(`⚠️ وحدة "${unit}" لا تتوافق مع وحدة "${existing.unit}" المسجلة مسبقًا لصنف "${name}" — لم تُضَف الكمية تلقائيًا. صحّح الوحدة أو استخدم "دمج الأصناف المكررة".`);
                    return { item: existing, qty: 0, unit: existing.unit, mismatch: true };
                }
                existing.balance += converted;
                if (expiryDate) existing.expiryDate = expiryDate; // آخر شحنة واردة هى المرجع لتاريخ الصلاحية المعروض
                b.stockMovements.push({ id: uid(), date, itemId: existing.id, itemName: existing.name, type: 'in', qty: converted, note });
                return { item: existing, qty: converted, unit: existing.unit, mismatch: false };
            }
            // صنف جديد تمامًا: نطبّع وحدات الوزن/الحجم لوحدة قياسية موحدة (كجم / لتر) حتى تتوافق
            // تلقائيًا مع أي شراء أو تنفيذ لاحق لنفس الصنف بوحدة أخرى من نفس العائلة.
            let baseUnit = unit, baseQty = qty;
            if (UNIT_FAMILY[unit] === 'weight') { baseUnit = 'كجم'; baseQty = qty * UNIT_FACTOR[unit]; }
            else if (UNIT_FAMILY[unit] === 'volume') { baseUnit = 'لتر'; baseQty = qty * UNIT_FACTOR[unit]; }
            const it = ensureInvItem(b, name, category, baseUnit);
            it.balance += baseQty;
            if (expiryDate) it.expiryDate = expiryDate;
            b.stockMovements.push({ id: uid(), date, itemId: it.id, itemName: it.name, type: 'in', qty: baseQty, note });
            return { item: it, qty: baseQty, unit: baseUnit, mismatch: false };
        }

        function stockOutByItem(b, itemId, qty, date, note) {
            const it = b.inventory.find(i => i.id === itemId);
            if (!it) return;
            it.balance -= qty;
            b.stockMovements.push({ id: uid(), date, itemId, itemName: it.name, type: 'out', qty, note });
        }

        // خصم/حذف من المخزن دون احتسابه استهلاكًا فعليًا (تلف، فقد، جرد، تصحيح خطأ إدخال...).
        // يُخصم من الرصيد فقط ولا يدخل ضمن حساب متوسط الصرف اليومي أو تقدير الأيام المتبقية،
        // بعكس stockOutByItem التي تُستخدم للاستهلاك الحقيقي (تنفيذ يومي، تحصين، معاملة فرشة).
        function stockAdjustByItem(b, itemId, qty, date, note) {
            const it = b.inventory.find(i => i.id === itemId);
            if (!it) return;
            it.balance -= qty;
            b.stockMovements.push({ id: uid(), date, itemId, itemName: it.name, type: 'adjust', qty, note });
        }

        // فحص كفاية الرصيد قبل أي خصم تلقائي (تنفيذ إضافة/تحصين/معاملة). لو الرصيد غير كافٍ،
        // يعرض تحذيرًا صريحًا بدل تنفيذ الخصم بصمت وترك رصيد سالب مفاجئ للمستخدم.
        // "نعم، تأكيد" = تنفيذ الخصم كاملاً رغم النقص. "إلغاء" = التوقف بدون تنفيذ.
        function confirmIfShort(itemName, unit, balance, qty, actionLabel, onProceed) {
            if (balance >= qty) { onProceed(); return; }
            const shortage = qty - balance;
            // ⚠️ إصلاح: لو الرصيد صفر (أو قريب من الصفر) من الأساس، ده مؤشر قوي إن الصنف
            // ده اسمه مكتوب غير مطابق لاسم الصنف وقت الشراء (بدل نقص فعلي فى المخزون)،
            // فبنوضّح ده صراحة فى رسالة التحذير بدل ما تبان كأنها نقص طبيعي بس.
            const likelyNameMismatch = balance <= 0;
            showConfirm(
                `⚠️ رصيد "${itemName}" الحالي ${fmt(balance,2)} ${unit || ''}، والكمية المطلوب خصمها ${actionLabel} هي ${fmt(qty,2)} ${unit || ''}.\n` +
                `سيصبح الرصيد سالبًا بمقدار ${fmt(shortage,2)} ${unit || ''}.\n` +
                (likelyNameMismatch
                    ? `⚠️ الرصيد صفر من الأساس — الأرجح إن اسم الصنف هنا مش مطابق حرفيًا لاسم الصنف وقت الشراء (راجع تبويب المخزون وتأكد من الاسم بالظبط قبل التأكيد).\n\n`
                    : `تأكد أن مشتريات هذا الصنف مسجَّلة فعليًا فى المخزن بنفس الاسم تمامًا.\n\n`) +
                `اضغط "نعم، تأكيد" للتنفيذ وخصم الكمية كاملة رغم النقص (سيظهر رصيد سالب حتى تُصحّح المخزون)، أو "إلغاء" للتوقف الآن ومراجعة المخزون أولاً.`,
                onProceed,
                '⚠️ نقص فى رصيد المخزن'
            );
        }

        function reverseStockMovement(b, itemName, category, qty, unit) {
            const it = findInvItem(b, itemName, category);
            if (!it) return;
            let finalQty = qty;
            if (unit && unit !== it.unit) { const c = convertUnitQty(qty, unit, it.unit); if (c != null) finalQty = c; }
            it.balance -= finalQty;
            b.stockMovements.push({ id: uid(), date: todayStr(), itemId: it.id, itemName: it.name, type: 'out',
                qty: finalQty, note: 'تصحيح/حذف' });
        }

        function reverseStockOut(b, itemName, category, qty, unit) {
            const it = findInvItem(b, itemName, category);
            if (!it) return;
            let finalQty = qty;
            if (unit && unit !== it.unit) { const c = convertUnitQty(qty, unit, it.unit); if (c != null) finalQty = c; }
            it.balance += finalQty;
            b.stockMovements.push({ id: uid(), date: todayStr(), itemId: it.id, itemName: it.name, type: 'in',
                qty: finalQty, note: 'إرجاع/تصحيح' });
        }

        // ============ Daily record CRUD ============
        let editingDailyDate = null;
        // تتبع وجود تعديلات غير محفوظة فى مودال تسجيل اليوم، لتحذير المستخدم لو حاول يقفل الصفحة بالغلط
        let dailyFormDirty = false;
        document.addEventListener('DOMContentLoaded', () => {
            const overlay = document.getElementById('dailyModalOverlay');
            if (overlay) overlay.addEventListener('input', () => { dailyFormDirty = true; }, true);
        });
        window.addEventListener('beforeunload', (e) => {
            const overlay = document.getElementById('dailyModalOverlay');
            if (dailyFormDirty && overlay && overlay.classList.contains('show')) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        });

        // يملأ نموذج التسجيل اليومي بكل بيانات سجل موجود (يُستخدم عند التعديل، وعند فتح تسجيل نهار/ليل
        // لتاريخ له سجل محفوظ بالفعل، حتى لا تُفقد بيانات القسم الآخر المُدخلة سابقًا لنفس اليوم).
