#!/usr/bin/env node
/**
 * tests/run-all.js — يشغّل كل ملفات الاختبار (*.test.js) واحد ورا التاني ويرجّع
 * ملخص نهائي. لو أي ملف فشل، الأداة بترجّع exit code 1 (تصلح للربط بأي CI مستقبلًا).
 *
 * الاستخدام: node tests/run-all.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = __dirname;
const testFiles = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

console.log(`🧪 تشغيل ${testFiles.length} ملف اختبار...\n`);

let anyFailed = false;
for (const f of testFiles) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`▶ ${f}`);
    console.log('─'.repeat(50));
    try {
        const out = execFileSync('node', [path.join(dir, f)], { encoding: 'utf-8', timeout: 20000 });
        console.log(out);
    } catch (e) {
        anyFailed = true;
        console.log(e.stdout || '');
        console.error(`🔴 الملف ${f} فشل (exit code ${e.status})`);
    }
}

console.log(`\n${'='.repeat(50)}`);
console.log(anyFailed ? '🔴 فيه ملفات اختبار فشلت — راجع التفاصيل فوق' : '🎉 كل ملفات الاختبار نجحت بالكامل');
process.exit(anyFailed ? 1 : 0);
