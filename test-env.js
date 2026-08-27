#!/usr/bin/env node
/**
 * test-env.js — بيئة تشغيل مصغّرة (Sandbox) تسمح بتحميل ملف التطبيق كامل داخل Node
 * (من غير متصفح حقيقي) عشان نقدر ننادي دوال الحساب النقية (compute*) مباشرة ونتأكد
 * إنها بترجع الأرقام الصح، من غير ما نلمس أي DOM أو نشغّل التطبيق فعليًا.
 *
 * الفكرة: التطبيق مبني بانضباط (بفضل اتفاقية تسمية compute* = دالة حسابية نقية، بدون
 * DOM) — أثبتنا آليًا إن 70 من 71 دالة compute* لا تلمس document/localStorage خالص.
 * ده معناه نقدر نحمّل الملف كامل فى بيئة وهمية (بدون متصفح حقيقي)، وننادي أي دالة
 * compute* منها مباشرة زي أي دالة JavaScript عادية.
 *
 * الاستخدام: لا تستخدم هذا الملف مباشرة — استورد { runInSandbox } منه فى ملفات الاختبار.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function buildDistIfNeeded() {
    const distPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (!fs.existsSync(distPath)) {
        require('child_process').execSync('node ' + path.join(__dirname, '..', 'build.js'));
    }
    return distPath;
}

function extractMainScript(htmlPath) {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    if (scripts.length < 2) throw new Error('لم يتم العثور على السكربت الرئيسي فى الملف المبني');
    return scripts[1]; // السكربت الرئيسي (الأول هو سكربت منع ومضة الوضع الليلي)
}

// حد أدنى من الـ stubs الكافية عشان التطبيق "يتحمّل" فى Node بدون تشغيل فعلي —
// مفيش أي منطق حقيقي هنا، بس عشان الكود ميحصلش فيه Exception وهو بيتحمّل.
function makeFakeDom() {
    const noop = () => {};
    const fakeStorage = (() => {
        const store = {};
        return {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; },
            clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        };
    })();
    const fakeElement = {
        style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        addEventListener: noop, removeEventListener: noop, setAttribute: noop, getAttribute: () => null,
        appendChild: noop, remove: noop, focus: noop, blur: noop, click: noop,
        querySelector: () => null, querySelectorAll: () => [],
        get value() { return ''; }, set value(v) {}, get innerHTML() { return ''; }, set innerHTML(v) {},
        get checked() { return false; }, set checked(v) {},
    };
    return {
        document: {
            getElementById: () => fakeElement,
            querySelector: () => null, querySelectorAll: () => [],
            addEventListener: noop, removeEventListener: noop,
            createElement: () => ({ ...fakeElement }),
            body: fakeElement, documentElement: { ...fakeElement, setAttribute: noop, classList: fakeElement.classList },
            readyState: 'complete',
        },
        window: { addEventListener: noop, removeEventListener: noop, scrollX: 0, scrollY: 0, scrollTo: noop, location: { reload: noop, href: '' }, innerWidth: 400, innerHeight: 800, navigator: { onLine: true, vibrate: noop } },
        localStorage: fakeStorage,
        navigator: { onLine: true, vibrate: noop, userAgent: 'node-test-sandbox' },
        performance: { now: () => Date.now() },
        console,
        setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, // ⚠️ عمدًا بلا تنفيذ حقيقي: التطبيق بيسجّل مؤقّتات دورية (تنبيهات/طقس) حقيقية بـ setInterval الحقيقية، ولو سبناها شغالة هتخلي عملية Node عالقة (hang) لحد الأبد بعد ما تخلص الاختبارات لأنها بتستنى المؤقّتات دي.
        location: { reload: noop, href: '' },
        alert: noop, confirm: () => true,
        fetch: () => Promise.reject(new Error('fetch disabled in test sandbox')),
        Image: function () { return { ...fakeElement }; },
        CustomEvent: function (name, opts) { return { name, ...opts }; },
        requestAnimationFrame: cb => setTimeout(cb, 0),
    };
}

/**
 * يحمّل التطبيق كامل فى Sandbox معزول، ويرجّع الـ context بتاعه — كل الدوال المُعرّفة
 * فى أعلى مستوى بالسكربت (بما فيها كل دوال compute*) بتبقى متاحة كـ context.اسم_الدالة
 */
function loadAppSandbox() {
    const distPath = buildDistIfNeeded();
    const scriptSrc = extractMainScript(distPath);
    const fakeDom = makeFakeDom();
    const context = { ...fakeDom };
    context.window = context; // زي المتصفح: window هو نفسه الـ global scope
    context.self = context;
    context.globalThis = context;
    context.addEventListener = fakeDom.window.addEventListener;
    context.removeEventListener = fakeDom.window.removeEventListener;
    context.scrollTo = fakeDom.window.scrollTo;
    vm.createContext(context);
    try {
        vm.runInContext(scriptSrc, context, { filename: 'katkot-pro-main.js', timeout: 10000 });
    } catch (e) {
        // بعض الأخطاء متوقعة (مثلاً محاولة تشغيل مؤقّتات فعلية أو Firebase) — نتجاهلها
        // طالما الدوال المطلوبة للاختبار اتعرّفت بنجاح قبل حصول الخطأ.
        console.warn('⚠️ تحذير أثناء تحميل السكربت فى بيئة الاختبار (متوقع جزئيًا):', e.message);
    }
    return context;
}

let _cachedSandbox = null;
function getSandbox() {
    if (!_cachedSandbox) _cachedSandbox = loadAppSandbox();
    return _cachedSandbox;
}

/**
 * ⚠️ مهم: متغيرات زي currentRole/currentWorker متعرّفة بـ `let` فى أعلى مستوى السكربت.
 * فى Node's vm module، متغيرات `let`/`const` بتتخزن فى Lexical Environment خاص بالسكربت
 * نفسه، مش كـ property عادي على الـ context — فتعديلها من برّه بـ (ctx.currentRole = ...)
 * مش هيأثر عليها خالص. الحل: ننفّذ سطر تعديل بسيط *جوه* نفس الـ context عشان يلمس
 * نفس الـ binding الحقيقي. استخدم الدالة دي بدل ما تعدّل الـ context مباشرة.
 */
function setGlobals(ctx, updates) {
    const assignments = Object.keys(updates).map(k => `${k} = ${JSON.stringify(updates[k])};`).join(' ');
    vm.runInContext(assignments, ctx);
}

module.exports = { getSandbox, setGlobals };
