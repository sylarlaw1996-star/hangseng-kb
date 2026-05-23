const fs = require('fs');
const DIR = 'C:/Users/Administrator/market-briefing';
const KB_DIR = 'C:/Users/Administrator/hangseng-kb/market-briefing';
const GITHUB_URL = 'https://github.com/sylarlaw1996-star/hangseng-kb';

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
function arrow(v) { return v >= 0 ? '▲' : '▼'; }
function colr(v) { return v >= 0 ? '🟢' : '🔴'; }
function idx(name) { return d.indices.find(function(i) { return i.name === name && !i.error; }); }
function fut(name) { return d.futures.find(function(f) { return f.name === name && !f.error; }); }
function fx(name) { return d.fx.find(function(f) { return f.pair === name && !f.error; }); }

const sp = idx('S&P 500'), nasdaq = idx('NASDAQ'), dow = idx('道瓊斯');
const hsi = idx('恒生指數'), hscei = idx('H股指數'), hstech = idx('恒生科技');
const sh = idx('上證綜指');
const nikkei = idx('日經225'), kospi = idx('韓國KOSPI'), tw = idx('台灣加權');
const gold = fut('黃金期貨'), oil = fut('WTI原油'), brent = fut('布蘭特原油'), copper = fut('銅期貨');
const usdhkd = fx('美元/港元'), usdcnh = fx('美元/離岸人民幣'), usdjpy = fx('美元/日圓');
const eurusd = fx('歐元/美元'), gbpusd = fx('英鎊/美元');

// Fund data helpers
function getFundsByCat(cat, sortKey, limit) {
  sortKey = sortKey || 9; limit = limit || 2;
  return FUNDS_DATA.filter(function(r) {
    return r[2] === cat && r[sortKey] && !isNaN(parseFloat(r[sortKey]));
  }).sort(function(a, b) {
    return parseFloat(b[sortKey]) - parseFloat(a[sortKey]);
  }).slice(0, limit);
}

// ─── News filtering: only market-relevant news ───
// Keywords that signal impact on equities, bonds, FX, rates
var MARKET_KEYWORDS = [
  // US markets
  '美股', '道指', '納指', '標普', 'S&P', 'NASDAQ', 'Dow',
  '七巨頭', '科技股', '英偉達', 'NVDA', '蘋果', '微軟', '特斯拉',
  '聯儲局', '美聯儲', 'Fed', '鮑威爾', '沃什', '沃勒',
  '利率', '加息', '降息', '減息',
  '通脹', 'CPI', 'PCE', '非農', '就業', '失業',
  '國債', '美債', 'Treasury', 'yield', '收益率曲線',
  'GDP', 'PMI', '經濟數據',
  // China
  'A股', '上證', '央行', '人行', '降準', '逆回購', 'LPR',
  '人民幣', '匯率', '離岸', '在岸',
  // HK
  '恒指', '港股', '金管局',
  // FX
  '美元', '日圓', '歐元', '英鎊', '港元', '外匯',
  // Commodities
  '原油', '黃金', '銅', '大宗商品', '油價',
  // General markets
  '股市', '債券', '債市', '降息贏家',
  '財報', '業績', '盈利',
  '關稅', '貿易戰', '貿易',
  'OPEC', '產油',
  // Central banks
  '央行', '貨幣政策', '量化寬鬆', '緊縮',
  '升息', '政策利率',
  // Important macro
  '消費', '零售', '工業生產',
  '財政', '赤字', '債務上限',
  '銀行', '信貸', '流動性',
  '通縮', '通脹',
  '制裁', '關稅',
  // Energy & market-moving
  '能源', '芯片', '半導體',
  'EV', '新能源',
  'REIT', '房地產'
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
  line += item.content;
  // Remove source numbering like "1. [财联社] "
  line = line.replace(/^\d+\.\s*\[.*?\]\s*/, '');
  if (line.length > 120) line = line.slice(0, 117) + '...';
  return line;
}

// ─── Build message ───
var msg = '';
msg += '📊 *每日市場簡報 · ' + date + '*\n\n';

// 1. Oral summary
msg += '📋 *口頭匯報總結*\n';
msg += '美股昨夜' + colr(sp ? sp.changePct : 0);
if (sp && sp.changePct >= 0) msg += '▲+' + pct(sp.changePct) + '%';
else if (sp) msg += '▼' + pct(sp.changePct) + '%';

if (nasdaq) {
  msg += '，納指' + colr(nasdaq.changePct);
  if (nasdaq.changePct >= 0) msg += '▲+' + pct(nasdaq.changePct) + '%';
  else msg += '▼' + pct(nasdaq.changePct) + '%';
}
msg += '。\n';

if (dow) {
  msg += '道指' + colr(dow.changePct);
  if (dow.changePct >= 0) msg += '▲+' + pct(dow.changePct) + '%，';
  else msg += '▼' + pct(dow.changePct) + '%，';
}

if (hsi) {
  msg += '港股恒指' + colr(hsi.changePct);
  if (hsi.changePct >= 0) msg += '▲+' + pct(hsi.changePct) + '%';
  else msg += '▼' + pct(Math.abs(hsi.changePct)) + '%';
}
msg += '。\n';

if (sh) {
  msg += '上證' + colr(sh.changePct);
  if (sh.changePct >= 0) msg += '▲+' + pct(sh.changePct) + '%';
  else msg += '▼' + pct(Math.abs(sh.changePct)) + '%。\n';
}

if (nikkei) {
  msg += '日經' + colr(nikkei.changePct);
  if (nikkei.changePct >= 0) msg += '▲+' + pct(nikkei.changePct) + '%';
  else msg += '▼' + pct(Math.abs(nikkei.changePct)) + '%';
}
if (kospi) {
  msg += '，韓國' + colr(kospi.changePct);
  if (kospi.changePct >= 0) msg += '▲+' + pct(kospi.changePct) + '%';
  else msg += '▼' + pct(Math.abs(kospi.changePct)) + '%';
}
msg += '。\n';

if (gold) {
  msg += '黃金$' + pct(gold.price) + colr(gold.changePct);
  if (gold.changePct >= 0) msg += '▲+' + pct(gold.changePct) + '%。';
  else msg += '▼' + pct(Math.abs(gold.changePct)) + '%。';
}

if (oil) {
  msg += ' WTI$' + pct(oil.price) + colr(oil.changePct);
  if (oil.changePct >= 0) msg += '▲+' + pct(oil.changePct) + '%';
  else msg += '▼' + pct(Math.abs(oil.changePct)) + '%';
}
msg += '\n';

// 2. Market-relevant news only
msg += '\n📡 *今日要聞*\n';
try {
  var newsJson = JSON.parse(fs.readFileSync(DIR + '/latest_news.json', 'utf-8'));
  var filtered = newsJson.items.filter(isMarketRelevant).slice(0, 5);
  if (filtered.length === 0) {
    // Fallback: include anyway if nothing relevant
    var fallback = newsJson.items.slice(0, 3);
    fallback.forEach(function(item) {
      msg += '• ' + item.content.slice(0, 100) + '\n';
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
if (usdhkd) msg += '• USD/HKD: ' + pct(usdhkd.price, 4) + '\n';
if (usdcnh) msg += '• USD/CNH: ' + pct(usdcnh.price, 4) + '\n';
if (usdjpy) msg += '• USD/JPY: ' + pct(usdjpy.price, 2) + '\n';
if (eurusd) msg += '• EUR/USD: ' + pct(eurusd.price, 4) + '\n';

// 4. Product Strategy
msg += '\n🎯 *產品策略建議*\n';

// 4a. Funds
msg += '\n【基金建倉建議】\n';
if (FUNDS_DATA.length > 0) {
  var asiaMixed = getFundsByCat('亞洲股債混合', 10, 2);
  var chinaEq = getFundsByCat('中國股票', 10, 2);
  var usEq = getFundsByCat('美國大型均衡型股票', 10, 2);
  var bondAsia = getFundsByCat('亞洲債券', 10, 2);

  if (asiaMixed.length > 0) {
    msg += '• 亞洲股債混合（恒生評級正面）\n';
    asiaMixed.forEach(function(f) {
      var ret = parseFloat(f[10]);
      msg += '  - ' + f[1].slice(0, 20) + '... | 1Y: ' + (ret >= 0 ? '+' : '') + pct(ret, 1) + '% | ' + (f[8]||'') + '★\n';
    });
  }
  if (chinaEq.length > 0) {
    msg += '• 中國股票\n';
    chinaEq.forEach(function(f) {
      var ret = parseFloat(f[10]);
      msg += '  - ' + f[1].slice(0, 20) + '... | 1Y: ' + (ret >= 0 ? '+' : '') + pct(ret, 1) + '%\n';
    });
  }
  if (usEq.length > 0) {
    msg += '• 美國大型股\n';
    usEq.forEach(function(f) {
      var ret = parseFloat(f[10]);
      msg += '  - ' + f[1].slice(0, 20) + '... | 1Y: ' + (ret >= 0 ? '+' : '') + pct(ret, 1) + '%\n';
    });
  }
  if (bondAsia.length > 0) {
    msg += '• 亞洲債券\n';
    bondAsia.forEach(function(f) {
      var ret = parseFloat(f[10]);
      msg += '  - ' + f[1].slice(0, 20) + '... | 1Y: ' + (ret >= 0 ? '+' : '') + pct(ret, 1) + '%\n';
    });
  }

  msg += '\n• 建議月供策略：SimplyFund定期定額\n';
  msg += '• 新客戶可考慮外幣定存入門 + 月供基金組合\n';
} else {
  msg += '• 基金數據加載中\n';
  msg += '• 建議月供：SimplyFund定期定額\n';
}

// 4b. Structured Products (ELI)
msg += '\n【ELI結構性產品】\n';
if (hsi) {
  var hsiLevel = parseFloat(hsi.price);
  msg += '• 恒指現報' + pct(hsiLevel) + '，短線支持25,000\n';
  if (hsiLevel >= 25300) msg += '• 若站穩25,300以上，可考慮掛鈎恒指成分股ELI\n';
  else msg += '• 保本型產品爲主\n';
}
msg += '• 建議選擇90%-95%保本結構\n';
msg += '• 可將部分定存轉向保本投資存款鎖定回報\n';

// 4c. FX Trading
msg += '\n【外匯交易操作】\n';
if (usdcnh) {
  var cnh = parseFloat(usdcnh.price);
  msg += '• USD/CNH: ' + pct(cnh, 4);
  if (cnh < 6.80) msg += ' CNH偏強，支持位6.78\n';
  else msg += ' CNH偏弱區間\n';
}
if (usdjpy) msg += '• USD/JPY: ' + pct(usdjpy.price, 2) + '，短線美元偏強\n';
if (eurusd) {
  msg += '• EUR/USD: ' + pct(eurusd.price, 4);
  if (parseFloat(eurusd.changePct) < 0) msg += ' 歐元承壓';
  else msg += ' 歐元有支撐';
  msg += '\n';
}
msg += '• 人民幣短期定存利率吸引，可配置外幣定存\n';

// 5. Footer
msg += '\n───────────────\n';
msg += '完整日報 & GitHub：' + GITHUB_URL + '\n';
msg += '───────────────\n';
msg += '_數據：Yahoo Finance + 恒生House View_\n';
msg += '_不構成投資建議_\n';

// Output
console.log(msg);

// Save for WhatsApp delivery
fs.writeFileSync(DIR + '/latest_briefing.txt', msg, 'utf-8');
console.log('\n--- Briefing saved to latest_briefing.txt ---');
