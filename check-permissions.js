#!/usr/bin/env node
/**
 * check-permissions.js — حارس آلي ضد رجوع ثغرة "Action-Level Authorization Bypass"
 * (نفس فئة الثغرة اللي اتكشفت واتصلحت فى 6 دوال: saveBatch, saveDaily, saveCustom,
 *  addHouse, removeHouse, saveBiosecurity).
 *
 * القاعدة: أي دالة اسمها بيبدأ بـ save/delete/add/remove/update وبتُعدّل بيانات فعلية
 * (بتستخدم persist() أو state.* أو localStorage) لازم يكون فيها نداء requirePermission(...)
 * أو تحقق يدوي من currentRole فى أول 3 أسطر من جسمها.
 *
 * الاستخدام: node check-permissions.js   (يشتغل تلقائيًا قبل build.js لو حبيت تربطه بـ npm script)
 * يرجّع exit code 1 لو لقى دالة مكشوفة، عشان يوقف أي CI/pipeline مستقبلي.
 */
const fs = require('fs');
const path = require('path');

const APP_LOGIC_DIR = path.join(__dirname, 'app-logic');
const MUTATOR_PREFIX = /^(save|delete|add|remove|update)[A-Z]/;
// دوال معروفة إنها لا تحتاج تحقق صلاحية (قراءة فقط أو مساعدة داخلية بحتة رغم اسمها)
const ALLOWLIST = new Set([
    // تعدّل مسودة محلية (stdRefRows) قبل الحفظ فقط — البوابة الحقيقية هي saveStdRefs() المحمية بالفعل
    'updateStdRefCell', 'addStdRefRow', 'removeStdRefRow',
    // قائمة المزارع المعروفة لهذا الجهاز فقط (localStorage) — بيانات المزرعة نفسها آمنة على السحابة دائمًا
    'saveFarmsList', 'removeFarmFromListUI', 'removeFarmFromList',
    // دوال تخزين داخلية منخفضة المستوى — بتتنادى من دوال أعلى محمية بالفعل بـ requirePermission
    'saveAuth', 'saveToStorage',
    // تعدّل مصفوفة صور مسودة محلية (dailyPhotoDataArr) قبل حفظ السجل اليومي — البوابة الحقيقية saveDaily() محمية
    'removeDailyPhoto',
    // واجهة بحتة (تبديل class فقط) — لا تعديل بيانات ولا persist()
    'updateOnboardingStepUI',
]);

function findTopLevelFunctions(src) {
    const re = /^        (async )?function ([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*\{/gm;
    const results = [];
    let m;
    while ((m = re.exec(src)) !== null) {
        results.push({ name: m[2], start: m.index, bodyStart: m.index + m[0].length });
    }
    return results;
}

function bodyHasGuard(src, bodyStart) {
    // نفحص أول ~400 حرف من جسم الدالة (تقريبًا أول 3-5 أسطر) بحثًا عن نمط تحقق صلاحية
    const window = src.slice(bodyStart, bodyStart + 400);
    return /requirePermission\s*\(|currentRole\s*!==|currentRole\s*===/.test(window);
}

function looksLikeMutator(src, funcStart, name) {
    if (!MUTATOR_PREFIX.test(name)) return false;
    // نتأكد إن الدالة فعلاً بتعدّل بيانات (مش بس اسمها كده) بفحص أول 800 حرف
    const window = src.slice(funcStart, funcStart + 2000);
    return /persist\s*\(|state\.[a-zA-Z]+\s*(\.push|\.filter|\.splice|\s*=)|localStorage\.setItem/.test(window);
}

let violations = [];
const files = fs.readdirSync(APP_LOGIC_DIR).filter(f => f.endsWith('.js'));

for (const file of files) {
    const src = fs.readFileSync(path.join(APP_LOGIC_DIR, file), 'utf-8');
    const funcs = findTopLevelFunctions(src);
    for (const fn of funcs) {
        if (ALLOWLIST.has(fn.name)) continue;
        if (!looksLikeMutator(src, fn.start, fn.name)) continue;
        if (!bodyHasGuard(src, fn.bodyStart)) {
            violations.push({ file, name: fn.name });
        }
    }
}

if (violations.length) {
    console.error(`🔴 ${violations.length} دالة تعديل/حذف من غير تحقق صلاحية ظاهر:\n`);
    for (const v of violations) {
        console.error(`   - ${v.name}()  →  ${v.file}`);
    }
    console.error(`\nراجعها يدويًا: لو فعلًا محتاجة صلاحية، ضيف requirePermission('scope') فى أول سطرين.`);
    console.error(`لو متأكد إنها آمنة عمدًا (نادرًا)، ضيفها لـ ALLOWLIST فى أول الملف ده مع سبب فى تعليق.`);
    process.exit(1);
} else {
    console.log(`✅ كل الدوال (${files.length} ملف) اللي بتعدّل بيانات فيها تحقق صلاحية ظاهر.`);
    process.exit(0);
}
