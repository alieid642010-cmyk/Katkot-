#!/usr/bin/env node
/**
 * build.js — يجمّع مصادر "كتكوت برو" المنظّمة (جذر الريبو مباشرة: app-logic/, templates/,
 * styles/, boot/) فى ملف HTML واحد جاهز للنشر (dist/index.html)، بنفس فكرة توزيع الملف
 * الواحد الحالية (GitHub Pages / PWA / تحويل APK) بدون أي تغيير فى السلوك.
 *
 * ⚠️ إصلاح: كان قبل كده بيدوّر على src/app-logic و src/templates...، لكن الريبو الفعلي على
 * GitHub بيحتفظ بالمجلدات دي فى الجذر مباشرة (زي ما هو مرفوع). عدّلنا SRC يشاور على __dirname
 * نفسه عشان build.js يشتغل صح على شكل الريبو الحقيقي من غير ما تحتاج تعمل مجلد src/ يدوي.
 *
 * الاستخدام: node build.js
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const OUT = path.join(__dirname, 'dist', 'index.html');

function read(p) { return fs.readFileSync(p, 'utf-8'); }

function readManifestModules(dir, manifestFile) {
    const manifest = JSON.parse(read(path.join(dir, manifestFile)));
    return manifest.map(f => read(path.join(dir, f))).join('');
}

const headBeforeStyle = read(path.join(SRC, 'templates', 'head-before-style.html'));
const css = read(path.join(SRC, 'styles', 'main.css'));
const headAfterStyle = read(path.join(SRC, 'templates', 'head-after-style.html'));
const betweenBodyAndBoot = read(path.join(SRC, 'templates', 'between-body-and-boot.html'));
const bootJs = read(path.join(SRC, 'boot', '00-dark-mode-flash-prevention.js'));
const appShell = read(path.join(SRC, 'templates', 'app-shell.html'));
const appLogic = readManifestModules(path.join(SRC, 'app-logic'), 'manifest.json');
const tail = read(path.join(SRC, 'templates', 'tail.html'));

const html =
    headBeforeStyle +
    '<style>' + css + '</style>' +
    headAfterStyle +
    '<body>' +
    betweenBodyAndBoot +
    '<script>' + bootJs + '</script>' +
    appShell +
    '<script>' + appLogic +
    tail;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf-8');
console.log('✅ تم البناء:', OUT, `(${html.length.toLocaleString()} حرف)`);
