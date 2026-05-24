const fs = require('fs');
const DIR = 'C:/Users/Administrator/market-briefing';
const KB_DIR = 'C:/Users/Administrator/hangseng-kb/market-briefing';
const BRIEFING_URL = 'https://sylarlaw1996-star.github.io/hangseng-kb/market-briefing/briefing.html';
const FUNDS_URL = 'https://sylarlaw1996-star.github.io/hangseng-kb/funds_data.js';

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

// Load competitor rates (for HIBOR and rate context)
let COMPETITOR_RATES = null;
try {
  COMPETITOR_RATES = JSON.parse(fs.readFileSync(DIR + '/competitor_rates.json', 'utf-8'));
} catch(e) {
  console.log('Competitor rates not available');
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
function fmtRet(v) { var n = parseFloat(v); return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }

// Risk level mapping (HSBC decimal -> 1-5)
function mapRisk(v) {
  if (v == null || v === 0) return 0;
  if (v < 2) return 1; if (v < 4) return 2; if (v < 6) return 3; if (v < 8) return 4;
  return 5;
}
function fundsByRisk(rl, limit) {
  limit = limit || 3;
  return FUNDS_DATA.filter(function(r) {
    return mapRisk(r[18]) === rl && r[10] && !isNaN(parseFloat(r[10]));
  }).sort(function(a, b) { return parseFloat(b[10]) - parseFloat(a[10]); }).slice(0, limit);
}
function sectorPicks(kws, rl, limit) {
  if (!FUNDS_DATA || FUNDS_DATA.length === 0) return [];
  return FUNDS_DATA.filter(function(r) {
    if (mapRisk(r[18]) !== rl) return false;
    if (!r[10] || isNaN(parseFloat(r[10]))) return false;
    var cat = r[2] || '';
    return kws.some(function(kw) { return cat.indexOf(kw) !== -1; });
  }).sort(function(a, b) { return parseFloat(b[10]) - parseFloat(a[10]); }).slice(0, limit);
}

const sp = idx('S&P 500'), nasdaq = idx('NASDAQ'), dow = idx('道瓊斯');
const hsi = idx('恒生指數'), hscei = idx('H股指數'), hstech = idx('恒生科技');
const sh = idx('上證綜指');
const nikkei = idx('日經225');
const gold = fut('黃金期貨'), oil = fut('WTI原油');
const dxy = fx('美元指數'), usdhkd = fx('美元/港元'), usdcnh = fx('美元/人民幣'), usdjpy = fx('美元/日圓');

// ════════════════════════════════════════════
// BRIEFING TEXT
// ════════════════════════════════════════════

let msg = '';
msg += '📊 *每日市場簡報 · ' + date + '*\n\n';

msg += '📋 *口頭匯報總結*\n';
msg += '美股' + colr(sp ? sp.changePct : 0) + arrow(sp ? sp.changePct : 0) + (sp && sp.changePct >= 0 ? '+' : '') + pct(sp ? sp.changePct : 0) + '%';
if (nasdaq) msg += '，納指' + colr(nasdaq.changePct) + arrow(nasdaq.changePct) + (nasdaq.changePct >= 0 ? '+' : '') + pct(nasdaq.changePct) + '%';
msg += '\n';
msg += '港股恒指' + colr(hsi ? hsi.changePct : 0) + arrow(hsi ? hsi.changePct : 0) + (hsi && hsi.changePct >= 0 ? '+' : '') + pct(hsi ? hsi.changePct : 0) + '%';
if (hstech) msg += '，科技' + colr(hstech.changePct) + arrow(hstech.changePct) + (hstech.changePct >= 0 ? '+' : '') + pct(hstech.changePct) + '%';
msg += '\n';
msg += '上證' + colr(sh ? sh.changePct : 0) + arrow(sh ? sh.changePct : 0) + (sh && sh.changePct >= 0 ? '+' : '') + pct(sh ? sh.changePct : 0) + '%\n';
if (gold) msg += '黃金$' + pct(gold.price) + colr(gold.changePct) + arrow(gold.changePct) + (gold.changePct >= 0 ? '+' : '') + pct(gold.changePct) + '%\n';
if (oil) msg += 'WTI$' + pct(oil.price) + colr(oil.changePct) + arrow(oil.changePct) + (oil.changePct >= 0 ? '+' : '') + pct(oil.changePct) + '%\n';

// News
msg += '\n📡 *今日要聞*\n';
try {
  var newsJson = JSON.parse(fs.readFileSync(DIR + '/latest_news.json', 'utf-8'));
  var items = (newsJson.items || []).slice(0, 4);
  items.forEach(function(item) {
    var line = '';
    if (item.title) line += '【' + item.title + '】';
    if (item.content) line += item.content;
    if (line.length > 110) line = line.slice(0, 107) + '...';
    msg += '• ' + (item.source ? '[' + item.source + '] ' : '') + line + '\n';
  });
} catch(e) {
  msg += '• (新聞加載中)\n';
}

// Key market data
msg += '\n📈 *重要市場數據*\n';
msg += '• S&P 500: ' + (sp ? pct(sp.price) : '-') + ' ' + colr(sp ? sp.changePct : 0) + arrow(sp ? sp.changePct : 0) + (sp && sp.changePct >= 0 ? '+' : '') + pct(sp ? sp.changePct : 0) + '%\n';
msg += '• NASDAQ: ' + (nasdaq ? pct(nasdaq.price) : '-') + ' ' + colr(nasdaq ? nasdaq.changePct : 0) + (nasdaq && nasdaq.changePct >= 0 ? '+' : '') + pct(nasdaq ? nasdaq.changePct : 0) + '%\n';
msg += '• 恒生: ' + (hsi ? pct(hsi.price) : '-') + ' ' + colr(hsi ? hsi.changePct : 0) + (hsi && hsi.changePct >= 0 ? '+' : '') + pct(hsi ? hsi.changePct : 0) + '%\n';
msg += '• 上證: ' + (sh ? pct(sh.price) : '-') + ' ' + colr(sh ? sh.changePct : 0) + (sh && sh.changePct >= 0 ? '+' : '') + pct(sh ? sh.changePct : 0) + '%\n';
msg += '• 黃金: ' + (gold ? '$' + pct(gold.price) : '-') + ' ' + colr(gold ? gold.changePct : 0) + (gold && gold.changePct >= 0 ? '+' : '') + pct(gold ? gold.changePct : 0) + '%\n';
msg += '• WTI: ' + (oil ? '$' + pct(oil.price) : '-') + ' ' + colr(oil ? oil.changePct : 0) + (oil && oil.changePct >= 0 ? '+' : '') + pct(oil ? oil.changePct : 0) + '%\n';
if (dxy) msg += '• 美元指數: ' + pct(dxy.price, 2) + '\n';
if (usdhkd) msg += '• USD/HKD: ' + pct(usdhkd.price, 4) + ' | ';
if (usdcnh) msg += 'USD/CNH: ' + pct(usdcnh.price, 4) + '\n';

// Fund picks by risk level (only with data)
if (FUNDS_DATA.length > 0) {
  msg += '\n🎯 *基金推薦（風險等級）*\n';
  var r3 = fundsByRisk(3, 2), r4 = fundsByRisk(4, 2);
  if (r3.length > 0) {
    msg += '【R3 穩健】\n';
    r3.forEach(function(f) { msg += '• ' + f[1].slice(0, 24) + '... | 1Y:' + fmtRet(f[10]) + ' | ' + f[2].slice(0, 12) + '\n'; });
  }
  if (r4.length > 0) {
    msg += '【R4 進取】\n';
    r4.forEach(function(f) { msg += '• ' + f[1].slice(0, 24) + '... | 1Y:' + fmtRet(f[10]) + ' | ' + f[2].slice(0, 12) + '\n'; });
  }
}

// Competitor rates section
if (COMPETITOR_RATES && COMPETITOR_RATES.timeDepositRates) {
  msg += '\n🏦 *HKD定存利率對比（新資金）*\n';
  var hkd = COMPETITOR_RATES.timeDepositRates.hkd;
  if (hkd) {
    Object.keys(hkd).forEach(function(key) {
      var bank = hkd[key];
      if (!bank.rates) return;
      var r3 = bank.rates['3M'] !== null && bank.rates['3M'] !== undefined ? bank.rates['3M'].toFixed(2) + '%' : '-';
      var r6 = bank.rates['6M'] !== null && bank.rates['6M'] !== undefined ? bank.rates['6M'].toFixed(2) + '%' : '-';
      msg += '• ' + bank.name + ' ' + r3 + '(3M)/' + r6 + '(6M)';
      if (bank.note && bank.note !== '') msg += ' (' + bank.note.slice(0, 10) + '..)';
      msg += '\n';
    });
  }
  if (COMPETITOR_RATES.mortgageRates && COMPETITOR_RATES.mortgageRates.hibor) {
    msg += '• 1M HIBOR: ' + (COMPETITOR_RATES.mortgageRates.hibor['1M'] || '?') + '%\n';
  }
}

msg += '\n───────────────\n';
msg += '完整日報：' + BRIEFING_URL + '\n';
msg += '_數據：Yahoo Finance + House View_';

console.log(msg);
fs.writeFileSync(DIR + '/latest_briefing.txt', msg, 'utf-8');
console.log('\n--- Briefing saved ---');

// ════════════════════════════════════════════
// TALKING POINTS — 早會三分鐘（書面語·閉環邏輯）
// ════════════════════════════════════════════
//
// 結構：
//   1) 市場回顧（昨夜外圍 + 港股）
//   2) 今日事件掛鈎（按優先級：聯儲>通脹>中國政策>貿易>財報>能源）
//   3) 周期判斷 + House View 立場
//   4) 三層級產品策略（保守/穩健/進取）× 目標年化回報區間
//   5) 閉環風險提示

var talk = '';
var spChg = sp ? parseFloat(sp.changePct) : 0;
var hsiChg = hsi ? parseFloat(hsi.changePct) : 0;
var goldChg = gold ? parseFloat(gold.changePct) : 0;
var hibor1M = (COMPETITOR_RATES && COMPETITOR_RATES.mortgageRates && COMPETITOR_RATES.mortgageRates.hibor) ? COMPETITOR_RATES.mortgageRates.hibor['1M'] : null;

// ── 周期判斷 ──
var cycleLabel = '';
var marketDesc = '';
var isHIBORHigh = hibor1M !== null && hibor1M >= 2.5;

if (Math.abs(hsiChg) > 1.5) {
  cycleLabel = 'trend';
  marketDesc = hsiChg > 0 ? '方向偏上，動能較強' : '方向偏下，避險情緒升溫';
} else if (Math.abs(hsiChg) > 0.5) {
  cycleLabel = 'mild';
  marketDesc = hsiChg > 0 ? '溫和上升，但動能不強，尚未擺脫區間' : '輕微偏軟，市場等待催化劑';
} else {
  cycleLabel = 'flat';
  marketDesc = '區間震盪格局，方向尚未確立';
}

// ── House View 立場推導 ──
var hvStance = '';
if (cycleLabel === 'trend' && hsiChg > 0) hvStance = 'House View維持正面看法，認為宏觀環境支持權益類資產，但提醒波動可能上升';
else if (cycleLabel === 'trend') hvStance = 'House View轉向審慎，建議降低風險敞口';
else if (cycleLabel === 'mild' && hsiChg > 0) hvStance = 'House View維持中性偏正面，認同基本面未惡化，但短期缺乏大幅向上催化劑';
else if (cycleLabel === 'mild') hvStance = 'House View維持中性，認為回調屬技術性調整，非基本面轉向';
else hvStance = 'House View維持中性配置，建議關注結構性機會而非方向性押注';

// ── 今日事件掛鈎（從新聞提取）───
var eventHook = '';
try {
  var nj = JSON.parse(fs.readFileSync(DIR + '/latest_news.json', 'utf-8'));
  var ni = nj.items || [];
  var fed = ni.filter(function(n) { var t = n.title + n.content; return t.includes('聯儲') || t.includes('Fed') || t.includes('鮑威爾'); });
  var cpi = ni.filter(function(n) { var t = n.title + n.content; return t.includes('CPI') || t.includes('通脹') || t.includes('PCE'); });
  var cnPol = ni.filter(function(n) { var t = n.title + n.content; return (t.includes('央行') || t.includes('降準') || t.includes('LPR') || t.includes('逆回購')) && !n.source.includes('华尔街'); });
  var trade = ni.filter(function(n) { var t = n.title + n.content; return t.includes('關稅') || t.includes('貿易'); });
  var earn = ni.filter(function(n) { var t = n.title + n.content; return t.includes('財報') || t.includes('業績'); });
  var oilNews = ni.filter(function(n) { var t = n.title + n.content; return t.includes('OPEC') || t.includes('原油') || t.includes('油價'); });

  if (fed.length > 0) eventHook = fed[0].content.slice(0, 50) + '。若偏鴿則利於利率敏感板塊，若偏鷹則避險情緒可能上升。';
  else if (cpi.length > 0) eventHook = cpi[0].content.slice(0, 50) + '。通脹路徑將直接影響市場對後續利率路徑的預期。';
  else if (cnPol.length > 0) eventHook = cnPol[0].content.slice(0, 50) + '。政策發力方向可能帶動相關板塊表現。';
  else if (trade.length > 0) eventHook = trade[0].content.slice(0, 50) + '。貿易局勢變化將影響出口導向行業及市場整體風險偏好。';
  else if (earn.length > 0) eventHook = earn[0].content.slice(0, 50) + '。業績期為個股及板塊篩選提供參考。';
  else if (oilNews.length > 0) eventHook = oilNews[0].content.slice(0, 50) + '。油價波動直接影響能源板塊及整體通脹預期。';
} catch(e) {}

// ── 產品策略 ──
var sCons = '', sBal = '', sAgg = '';

// 保守型（目標年化 3%-5%）
if (isHIBORHigh) {
  sCons = '核心倉位建議短年期定存。目前3M/6M港元定存年利率約2%，美元定存可達3%以上。在高息環境下鎖定收益率，不受後續減息影響，是目前風險調整後收益最優的底倉配置。';
} else {
  sCons = '利率環境趨鬆，短存收益率回落，建議轉向R3穩健型基金。';
  var infra = sectorPicks(['基建', '基礎'], 3, 1);
  if (infra.length > 0) sCons += '可關注' + infra[0][1].slice(0, 14) + '，配置基建板塊，具備防禦性同時參與經濟復甦。';
}

// 穩健型（目標年化 5%-8%）
if (cycleLabel === 'trend' && hsiChg > 0) {
  sBal += '市場趨勢明確，可適度增配權益類基金。';
  var divFunds = sectorPicks(['股息', '收益', '平衡'], 3, 1);
  if (divFunds.length > 0) sBal += '推薦' + divFunds[0][1].slice(0, 14) + '（過去一年回報' + fmtRet(divFunds[0][10]) + '），以股息收益為底倉。';
  sBal += '亦可搭配保本ELI掛鈎恒指成分股，95%本金保障下參與潛在升幅。';
} else if (cycleLabel === 'flat') {
  sBal += '市場無明顯方向，適合以股債混合策略應對。';
  var balFunds = sectorPicks(['平衡'], 3, 1);
  if (balFunds.length > 0) sBal += '可關注' + balFunds[0][1].slice(0, 14) + '（過去一年回報' + fmtRet(balFunds[0][10]) + '），進可攻退可守。';
  sBal += '如客戶要求更高彈性，可小注配置保本ELI掛鈎銀行股。';
} else if (hsiChg >= 0) {
  sBal += '市場溫和上升但非強趨勢，建議以收益型產品為主。';
  var incFunds = sectorPicks(['收益', '債券', '股息'], 3, 1);
  if (incFunds.length > 0) sBal += '以' + incFunds[0][1].slice(0, 14) + '為底倉，過去一年回報' + fmtRet(incFunds[0][10]) + '。';
  sBal += '若客戶希望增加進攻元素，可選保本ELI掛公用或銀行股。';
} else {
  sBal += '市場偏軟，建議以收益型產品及定存為主。';
  var incFunds2 = sectorPicks(['收益', '債券', '股息'], 3, 1);
  if (incFunds2.length > 0) sBal += '以' + incFunds2[0][1].slice(0, 14) + '為底倉，過去一年回報' + fmtRet(incFunds2[0][10]) + '。';
  sBal += '不建議在此時增加權益類倉位。';
}

// 進取型（目標年化 8%+）
var r4Funds = fundsByRisk(4, 2);
if (cycleLabel === 'trend' && hsiChg > 0) {
  sAgg += '趨勢有利權益類資產，可增持亞洲及新興市場股票基金。';
  if (r4Funds.length > 0) sAgg += '可關注' + r4Funds[0][1].slice(0, 14) + '，過去一年回報' + fmtRet(r4Funds[0][10]) + '。';
  sAgg += '建議倉位控制在總資產30%以內，配合保本ELI覆蓋下行風險。';
} else if (cycleLabel === 'flat') {
  sAgg += '區間震盪環境下不宜重倉押注方向。建議以保本ELI參與市場為主要手段，倉位控制15%以內。';
  if (r4Funds.length > 0) sAgg += '如客戶堅持持有權益類產品，以' + r4Funds[0][1].slice(0, 14) + '作衛星配置，回報' + fmtRet(r4Funds[0][10]) + '。';
} else if (hsiChg >= 0) {
  sAgg += '市場微升但動能有限，不宜追高。建議以保本ELI掛鈎指數或藍籌股為主，倉位控制在20%以內，既有參與權益的彈性，又有本金保障。';
} else {
  sAgg += '市場偏軟，進取型客戶同樣應以守為攻。建議暫緩新增權益類倉位，先以短年期定存或保本ELI替代，待市況明朗後再進場。';
}

// ── 閉環風險提示 ──
var riskNote = '以上策略的主要風險：';
if (isHIBORHigh && cycleLabel === 'flat') {
  riskNote += '區間震盪格局下若市場出現超預期事件（地緣風險升溫、通脹反彈），高息環境可能持續更長時間，定存到期再投資可能面臨利率下行。分散配置、控制單一產品倉位是最穩妥的做法。';
} else if (cycleLabel === 'trend' && hsiChg > 0) {
  riskNote += '若上漲行情由資金面而非基本面驅動，後續回調風險不容忽視。ELI的95%本金保障可部分緩解下行衝擊，但無法完全規避市場風險。';
} else if (cycleLabel === 'trend') {
  riskNote += '若市場下行由基本面惡化引發，保本產品雖能保住本金，但客戶可能錯過後續反彈。建議保持流動性，為下一輪機會做準備。';
} else {
  riskNote += '區間震盪格局下最大風險是市場突然選擇方向。分散配置、控制單一產品倉位是當前最穩妥的做法。';
}

// ── 組裝 ──
talk += '📢 早會三分鐘 · ' + date + '\n\n';
talk += '昨夜美股' + (sp && sp.price ? (spChg >= 0 ? '造好，S&P收' + pct(sp.price) + '，漲' + pct(Math.abs(spChg)) + '%' : '偏軟，S&P收' + pct(sp.price) + '，跌' + pct(Math.abs(spChg)) + '%') : '缺乏明確方向') + '。港股恒指昨日收' + (hsi ? pct(hsi.price) : '?') + '，' + marketDesc + '。\n\n';
if (eventHook) talk += eventHook + '\n\n';
talk += '當前' + (isHIBORHigh ? '高息環境，短端利率仍在相對高位。' : '利率環境偏鬆。') + marketDesc + '。' + hvStance + '。\n\n';
talk += '基於以上判斷，今日各層級客戶策略如下：\n\n';
talk += '■ 保守型（目標年化3%-5%）：' + sCons + '\n\n';
talk += '■ 穩健型（目標年化5%-8%）：' + sBal + '\n\n';
talk += '■ 進取型（目標年化8%以上）：' + sAgg + '\n\n';
talk += '【風險提示】' + riskNote + '\n\n';
talk += '以上策略以恆生現有產品框架為基礎，結合當前市場條件與House View立場推導。如有更新數據或事件，明日早會將同步調整。\n\n';
talk += '───────────────\n\n';

// 客戶版本
talk += '💬 客戶版本（直接複製）\n\n';
talk += '早上好，簡單更新一下市場情況。\n';
talk += '昨夜美股' + (sp && sp.price ? (spChg >= 0 ? '上升' : '下跌') + pct(Math.abs(spChg)) + '%' : '變化不大') + '，恒指目前' + (hsi ? pct(hsi.price) + '點' : '?') + '。\n';
if (eventHook) talk += eventHook.replace(/。.*$/, '。') + '\n';
talk += '\n基於市場情況，有三個參考方向：\n';
talk += '1. 保守選擇：短年期定存鎖定收益，年化回報約3%-5%\n';
talk += '2. 穩健選擇：' + (cycleLabel === 'flat' ? '股債平衡型基金' : cycleLabel === 'trend' ? '權益類+保本ELI組合' : '收益型產品') + '，目標年化5%-8%\n';
talk += '3. 進取選擇：' + (cycleLabel === 'flat' ? '保本ELI為主（倉位<15%）' : cycleLabel === 'trend' ? '可增持權益類基金（倉位<30%）' : '以守為攻，暫緩新增倉位') + '，目標年化8%以上\n';
talk += '\n以上建議已考慮當前市場環境和House View立場。如需針對個人組合做調整，隨時溝通。';

fs.writeFileSync(DIR + '/latest_talking_points.txt', talk, 'utf-8');
console.log('\n--- Talking points saved ---');
console.log(talk);
