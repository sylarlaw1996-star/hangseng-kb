const fs = require('fs');
const DIR = 'C:/Users/Administrator/market-briefing';
const KB_DIR = 'C:/Users/Administrator/hangseng-kb/market-briefing';
const BRIEFING_URL = 'https://sylarlaw1996-star.github.io/hangseng-kb/market-briefing/briefing.html';

// Load latest market data
let data;
try {
  data = JSON.parse(fs.readFileSync(DIR + '/latest_data.json', 'utf-8'));
} catch(e) {
  console.error('No market data found. Run fetch_market.js first.');
  process.exit(1);
}

// Load fund data
let FUNDS_DATA = [];
try {
  const src = fs.readFileSync(KB_DIR + '/../funds_data.js', 'utf-8').replace(/\r/g, '');
  const start = src.indexOf('[');
  const content = src.slice(start);
  const end = content.lastIndexOf(']');
  FUNDS_DATA = JSON.parse(content.slice(0, end + 1));
} catch(e) {
  console.log('Fund data not available, skipping fund picks');
}

const d = data;
const date = d.date || new Date().toISOString().slice(0, 10);

// Helpers
function pct(v, dec) { return (v || 0).toFixed(dec || 2); }
function colr(v) { return v >= 0 ? '🟢' : '🔴'; }
function idx(name) { return d.indices.find(function(i) { return i.name === name && !i.error; }); }
function fut(name) { return d.futures.find(function(f) { return f.name === name && !f.error; }); }
function fx(name) { return d.fx.find(function(f) { return f.pair === name && !f.error; }); }

const sp = idx('S&P 500'), nasdaq = idx('NASDAQ'), dow = idx('道瓊斯');
const hsi = idx('恒生指數'), hscei = idx('H股指數');
const sh = idx('上證綜指');
const nikkei = idx('日經225'), kospi = idx('韓國KOSPI');
const gold = fut('黃金期貨'), oil = fut('WTI原油');
const usdcnh = fx('美元/離岸人民幣'), usdjpy = fx('美元/日圓');
const eurusd = fx('歐元/美元');
const usdhkd = fx('美元/港元');

// Risk level mapping (HSBC: decimal → 1-5)
function mapRisk(v) {
  if (v == null || v === 0) return 0;
  if (v < 2) return 1;
  if (v < 4) return 2;
  if (v < 6) return 3;
  if (v < 8) return 4;
  return 5;
}

// Fund data helpers: by risk level, sorted by 1Y return (col 10)
function fundsByRisk(rl, limit) {
  limit = limit || 3;
  return FUNDS_DATA.filter(function(r) {
    return mapRisk(r[18]) === rl && r[10] && !isNaN(parseFloat(r[10]));
  }).sort(function(a, b) {
    return parseFloat(b[10]) - parseFloat(a[10]);
  }).slice(0, limit);
}

function fundsByRiskAndCat(rl, cat, limit) {
  limit = limit || 2;
  return FUNDS_DATA.filter(function(r) {
    return mapRisk(r[18]) === rl && r[2] === cat && r[10] && !isNaN(parseFloat(r[10]));
  }).sort(function(a, b) {
    return parseFloat(b[10]) - parseFloat(a[10]);
  }).slice(0, limit);
}

// ─── News filtering ───
var MARKET_KEYWORDS = [
  '美股','道指','納指','標普','S&P','NASDAQ','Dow',
  '七巨頭','科技股','英偉達','NVDA','蘋果','微軟','特斯拉',
  '聯儲局','美聯儲','Fed','鮑威爾','沃什','沃勒',
  '利率','加息','降息','減息','利率決議',
  '通脹','CPI','PCE','非農','就業','失業','GDP','PMI',
  '國債','美債','Treasury','yield','收益率',
  'A股','上證','央行','人行','降準','逆回購','LPR',
  '人民幣','匯率','離岸','在岸','恒指','港股','金管局',
  '美元','日圓','歐元','英鎊','港元','外匯',
  '原油','黃金','銅','大宗商品','油價',
  '股市','債券','債市','降息贏家',
  '關稅','貿易戰','貿易','OPEC','產油',
  '貨幣政策','量化寬鬆','緊縮','升息',
  '消費','零售','工業生產','財政','赤字','信貸','流動性',
  '半導體','芯片','EV','能源',
  '財報','業績'
];

function isMarketRelevant(item) {
  var text = item.title + ' ' + item.content;
  return MARKET_KEYWORDS.some(function(kw) {
    return text.indexOf(kw) !== -1;
  });
}

function shortenNews(item) {
  var line = '';
  if (item.title) line += '【' + item.title + '】';
  if (item.source) line = '[' + item.source + '] ' + line;
  line += item.content;
  line = line.replace(/^\d+\.\s*/, '');
  if (line.length > 110) line = line.slice(0, 107) + '...';
  return line;
}

function fmtRet(v) {
  var n = parseFloat(v);
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

// ─── Build message ───
var msg = '';
msg += '📊 *每日市場簡報 · ' + date + '*\n\n';

// 1. Summary
msg += '📋 *口頭匯報總結*\n';
if (sp) msg += '美股🟢▲+' + pct(sp.changePct) + '%';
if (nasdaq) msg += ' | 納指🟢+' + pct(nasdaq.changePct) + '%';
if (hsi) msg += '\n港股恒指🔴-' + pct(Math.abs(hsi.changePct)) + '%';
if (sh) msg += ' | 上證🔴-' + pct(Math.abs(sh.changePct)) + '%';
if (nikkei || kospi) {
  msg += '\n亞洲：日經';
  msg += nikkei ? (nikkei.changePct >= 0 ? '🟢+' : '🔴') + pct(nikkei.changePct) + '%' : '-';
  msg += kospi ? ' | 韓國' + (kospi.changePct >= 0 ? '🟢+' : '🔴') + pct(kospi.changePct) + '%' : '';
}
msg += '\n';
if (gold) msg += '黃金$' + pct(gold.price) + (gold.changePct >= 0 ? '🟢+' : '🔴') + pct(gold.changePct) + '%';
if (oil) msg += ' | WTI$' + pct(oil.price) + (oil.changePct >= 0 ? '🟢+' : '🔴') + pct(oil.changePct) + '%';
msg += '\n';

// 2. News
msg += '\n📡 *今日要聞*\n';
try {
  var newsJson = JSON.parse(fs.readFileSync(DIR + '/latest_news.json', 'utf-8'));
  var filtered = newsJson.items.filter(isMarketRelevant).slice(0, 4);
  if (filtered.length === 0) {
    newsJson.items.slice(0, 2).forEach(function(item) {
      msg += '• ' + item.content.slice(0, 90) + '\n';
    });
  } else {
    filtered.forEach(function(item) {
      msg += '• ' + shortenNews(item) + '\n';
    });
  }
} catch(e) {
  msg += '• (新聞數據加載中)\n';
}

// 3. Key market data
msg += '\n📈 *重要市場數據*\n';
if (sp) msg += '• S&P 500: ' + pct(sp.price) + ' ' + colr(sp.changePct) + (sp.changePct >= 0 ? '▲+' : '▼') + pct(Math.abs(sp.changePct)) + '%\n';
if (nasdaq) msg += '• NASDAQ: ' + pct(nasdaq.price) + ' ' + colr(nasdaq.changePct) + (nasdaq.changePct >= 0 ? '▲+' : '▼') + pct(Math.abs(nasdaq.changePct)) + '%\n';
if (dow) msg += '• 道瓊斯: ' + pct(dow.price) + ' ' + colr(dow.changePct) + (dow.changePct >= 0 ? '▲+' : '▼') + pct(Math.abs(dow.changePct)) + '%\n';
if (hsi) msg += '• 恒生: ' + pct(hsi.price) + ' ' + colr(hsi.changePct) + (hsi.changePct >= 0 ? '▲+' : '▼') + pct(Math.abs(hsi.changePct)) + '%\n';
if (hscei) msg += '• H股: ' + pct(hscei.price) + ' ' + colr(hscei.changePct) + (hscei.changePct >= 0 ? '▲+' : '▼') + pct(Math.abs(hscei.changePct)) + '%\n';
if (sh) msg += '• 上證: ' + pct(sh.price) + ' ' + colr(sh.changePct) + (sh.changePct >= 0 ? '▲+' : '▼') + pct(Math.abs(sh.changePct)) + '%\n';
if (gold) msg += '• 黃金: $' + pct(gold.price) + ' ' + colr(gold.changePct) + (gold.changePct >= 0 ? '▲+' : '▼') + pct(Math.abs(gold.changePct)) + '%\n';
if (oil) msg += '• WTI: $' + pct(oil.price) + ' ' + colr(oil.changePct) + (oil.changePct >= 0 ? '▲+' : '▼') + pct(Math.abs(oil.changePct)) + '%\n';
if (usdhkd) msg += '• USD/HKD: ' + pct(usdhkd.price, 4);
if (usdcnh) msg += ' | USD/CNH: ' + pct(usdcnh.price, 4);
if (usdjpy) msg += ' | USD/JPY: ' + pct(usdjpy.price, 2) + '\n';

// 4. Product Strategy ── Risk Level Action Guide (only 3,4,5)
msg += '\n🎯 *恆生產品策略 · 風險等級行動指引*\n\n';

// Determine market sentiment
var hsiTrend = hsi ? parseFloat(hsi.changePct) : 0;
var usTrend = sp ? parseFloat(sp.changePct) : 0;
var marketBearish = hsiTrend < -0.5;
var marketBullish = usTrend > 0;

// ── Risk 3: 穩健增長型 ──
msg += '【風險等級 3 · 穩健增長】 → *持有 + 適度增持*\n';
var r3 = fundsByRisk(3, 3);
if (r3.length > 0) {
  msg += '行動：穩健配置，建議增持亞洲股債混合及基建產業\n';
  msg += '推薦基金：\n';
  r3.forEach(function(f) {
    msg += '  • ' + f[1].slice(0, 22) + '... | 1Y: ' + fmtRet(f[10]) + ' | ' + f[2].slice(0, 12) + '\n';
  });
} else {
  msg += '• 建議關注平衡型基金，月供爲主\n';
}

// ── Risk 4: 進取增長型 ──
msg += '\n【風險等級 4 · 進取增長】 → ';
var r4 = fundsByRisk(4, 3);
if (marketBearish) {
  msg += '*持有 + 精選增持*\n';
  msg += '行動：大市回調，建議趁低吸納優質亞洲債及收益型產品\n';
} else {
  msg += '*增持 + 建倉機遇*\n';
  msg += '行動：市場正面，建議增加亞洲債券及平衡型產品配置\n';
}
msg += '推薦基金：\n';
if (r4.length > 0) {
  r4.forEach(function(f) {
    msg += '  • ' + f[1].slice(0, 24) + '... | 1Y: ' + fmtRet(f[10]) + ' | ' + f[2].slice(0, 12) + '\n';
  });
}

// ── Risk 5: 積極型 ──
msg += '\n【風險等級 5 · 積極型】 → ';
var r5 = fundsByRisk(5, 3);
if (hsi && parseFloat(hsi.price) < 25000) {
  msg += '*減持 / 觀望*\n';
  msg += '行動：恒指弱勢，高風險倉位宜減持鎖利，轉向保本產品\n';
} else {
  msg += '*持有 + 精選加倉*\n';
  msg += '行動：高風險產品可保留，但控制倉位在半倉以下\n';
}
msg += '關注產品：\n';
if (r5.length > 0) {
  r5.forEach(function(f) {
    msg += '  • ' + f[1].slice(0, 24) + '... | 1Y: ' + fmtRet(f[10]) + '\n';
  });
}

// ── ELI 結構性產品 ──
msg += '\n【ELI 結構性產品 · 掛鈎標的建議】\n';
// Recommend sectors based on which markets are performing
var eliSectors = [];
if (kospi && parseFloat(kospi.changePct) > 2) eliSectors.push('韓國KOSPI ETF/大型權值股');
if (nikkei && parseFloat(nikkei.changePct) > 1) eliSectors.push('日經225指數');
if (sp && parseFloat(sp.changePct) > 0) eliSectors.push('美股科技七巨頭 (M7)');
eliSectors.push('恒指成分股（銀行/保險/公用）');

if (marketBearish) {
  msg += '市況波動加劇，建議：\n';
  msg += '  • 保本型ELI爲主（95%本金保障）\n';
  msg += '  • 掛鈎標的：銀行股/公用股等高防禦性板塊\n';
  msg += '  • 若恒指回升至25,500以上，可考慮恒指相關牛市ELI\n';
} else {
  msg += '市場走勢正面，建議組合：\n';
  msg += '  • 保本型佔70%：掛鈎高股息恒指成分股（中銀/滙豐/領展）\n';
  msg += '  • 進取型佔30%：掛鈎科技/消費板塊，潛在回報較高\n';
}
if (eliSectors.length > 0) {
  msg += '推薦掛鈎板塊：\n';
  eliSectors.forEach(function(s) {
    msg += '  • ' + s + '\n';
  });
}
msg += '期限建議：3-6個月爲主，避免鎖倉過長\n';

// ── 外匯交易操作 ──
msg += '\n【外匯交易操作】\n';
if (usdcnh) {
  var cnh = parseFloat(usdcnh.price);
  msg += '• USD/CNH: ' + pct(cnh, 4);
  if (cnh < 6.80) msg += ' CNH偏強，建議人民幣定存吸納';
  else msg += ' 區間震盪，觀望';
  msg += '\n';
}
if (usdjpy) msg += '• USD/JPY: ' + pct(usdjpy.price, 2) + ' 美元偏強，日圓弱勢延續\n';
if (eurusd) {
  msg += '• EUR/USD: ' + pct(eurusd.price, 4);
  if (parseFloat(eurusd.changePct) < 0) msg += ' 歐元承壓，暫避';
  else msg += ' 歐元有支撐，可小注';
  msg += '\n';
}
msg += '• 定存策略：人民幣短期利率吸引，建議佔外幣組合40-50%\n';

// Footer
msg += '\n───────────────\n';
msg += '完整日報儀表板：' + BRIEFING_URL + '\n';
msg += '───────────────\n';
msg += '_數據來源：Yahoo Finance + 恒生House View_\n';
msg += '_不構成投資建議_\n';

// Output
console.log(msg);

// Save for WhatsApp delivery
fs.writeFileSync(DIR + '/latest_briefing.txt', msg, 'utf-8');
console.log('\n--- Briefing saved to latest_briefing.txt ---');
