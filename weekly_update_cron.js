// Cron wrapper: 跑 weekly_update.js, 只輸出精簡摘要 (供 Discord announce)
const { spawnSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'weekly_update.js');
const r = spawnSync(process.execPath, [script], { encoding: 'utf-8', cwd: __dirname, timeout: 9 * 60 * 1000 });
const out = (r.stdout || '') + (r.stderr || '');

if (r.status !== 0) {
  console.error('基金更新失敗 (exit ' + r.status + '):\n' + out.slice(-1800));
  process.exit(r.status || 1);
}

const m = out.match(/=== Complete: (.+)$/m);
const g = out.match(/remaining garbled: (\d+)/);
const c = out.match(/Categories: (.+)$/m);
var summary = '💰 基金數據已更新';
if (m) summary += ' · ' + m[1].trim();
if (g) summary += ' · 亂碼 ' + g[1];
if (c) summary += ' · ' + c[1].trim();
console.log(summary);
