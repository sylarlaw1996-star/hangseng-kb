// Weekly fund data update subagent script
// Run by cron: every Saturday 20:00

const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

const HOST = 'rbwm-api.hsbc.com.hk';
const BASE = '/pws-hk-hase-fsm-papi-prod-proxy/v1';
const KB_DIR = 'C:/Users/Administrator/hangseng-kb';
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', 'Accept-Language': 'zh-HK,zh;q=0.5' };

// ─── Encoding Fix Map ─────────────────────────────────────────────
const ENC_FIX_MAP = {
  '��合': '混合', '���': '服務', '��業': '行業', '行��': '行業',
  '��球': '環球', '��國': '中國', '機���': '機會', '每��': '每月',
  '���萊德': '貝萊德', '美��': '美元', '��司': '公司', '��菱': '霸菱',
  '投���': '投資', '基��': '基金', '��活': '靈活', '���限': '有限',
};
const ENC_FIX_ENTRIES = Object.entries(ENC_FIX_MAP).sort(function(a,b){return b[0].length-a[0].length;});

function fixEncoding(s) {
  if (!s) return s || '';
  var r = s;
  for (var i = 0; i < ENC_FIX_ENTRIES.length; i++) {
    r = r.split(ENC_FIX_ENTRIES[i][0]).join(ENC_FIX_ENTRIES[i][1]);
  }
  return r.replace(/\uFFFD/g, '').trim() || s;
}

// ─── Category Consolidation ────────────────────────────────────────
var CCYS = ['美元','港元','歐元','英鎊','瑞士法郎','澳幣','日圓','人民幣','新加坡元','紐元'];
var HEDGE_RE = / - (美元|港元|歐元|英鎊|瑞士法郎|澳幣|日圓|人民幣|新加坡元|紐元)對沖$/;

function toGroupCategory(cat) {
  var b = (cat || '').replace(HEDGE_RE, '');
  for (var i = 0; i < CCYS.length; i++) {
    if (b.indexOf(CCYS[i]) === 0) { b = b.slice(CCYS[i].length); break; }
  }
  return b.trim() || cat;
}

// ─── HTTP helper (fixed encoding) ──────────────────────────────────
function httpGet(p) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: HOST, path: BASE + p, headers: HEADERS }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        if (r.statusCode !== 200) reject(new Error('HTTP ' + r.statusCode));
        else resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      });
    }).on('error', reject);
  });
}

function toArray(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
const fmt = (v) => (v == null || v === '') ? 0 : +Number(v).toFixed(2);
const esc = (s) => '"' + (s || '').replace(/"/g, '""') + '"';

async function main() {
  console.log('=== HASE Fund Weekly Update ===\n');

  // 1. Fetch categories
  console.log('[1/4] Fetching sectors...');
  const allSectors = [];
  for (const g of ['B', 'F', 'E', 'O']) {
    const r = await httpGet('/Categories?type=S&sectorGroup=' + g);
    const arr = r.CategoryPerformanceDataResponse.CategoryPerformanceDataResult.ArrayOfCategoryPerformance.CategoryPerformance;
    toArray(arr).forEach((s) => allSectors.push({ id: s.Id }));
  }
  console.log('  -> ' + allSectors.length + ' sectors');

  // 2. Fetch funds
  console.log('[2/4] Fetching funds...');
  const allFunds = [];
  const seen = new Set();
  for (let i = 0; i < allSectors.length; i++) {
    process.stdout.write('  [' + (i + 1) + '/' + allSectors.length + '] ' + allSectors[i].id + '...');
    try {
      const r = await httpGet('/Funds?fundCategory=' + allSectors[i].id);
      toArray(r.QuickRank.FundRecords).forEach((f) => {
        const code = f.hsFundCode || '';
        if (!code || seen.has(code)) return;
        seen.add(code);
        const rawName = f.FundName || '';
        const rawCat = f.CategoryName || '';
        const rawHouse = f.hsFundHouseName || '';
        allFunds.push({
          fundCode: code,
          fundName: fixEncoding(rawName),
          categoryName: fixEncoding(rawCat),
          groupCategory: toGroupCategory(fixEncoding(rawCat)),
          fundHouse: fixEncoding(rawHouse),
          isWMC: f.IsWMC === 'Y', canSubscribe: f.AvailableForSubscribe === 'Y',
          price: f.Price || 0, priceDate: f.SubscriptionPriceDate || f.RedemptionPriceDate || '',
          currency: f.CurrencyName || '', riskLevel: f.hsRiskLevel || '',
          returnYTD: f.ReturnYTD, return1W: f.Return1Week, return1M: f.Return1Month,
          return3M: f.Return3Month, return6M: f.Return6Month,
          return1Y: f.Return1Year, return2Y: f.Return2Y, return3Y: f.Return3Y, return5Y: f.Return5Y,
          yield: f.Yield, yieldDate: f.YieldDate || '',
          managementFee: f.ManagementFee, starRating: f.StarRating, isin: f.ISIN || ''
        });
      });
      process.stdout.write(' ' + toArray(r.QuickRank.FundRecords).length + '\n');
    } catch(e) {
      process.stdout.write(' error\n');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log('  -> ' + allFunds.length + ' unique funds');

  // 2.5 Compute equityType and regionCategory
  var SECTOR_KW = ['科技','健康護理','消費品及服務','天然資源','環境生態','金融服務','基礎建設','能源','貴金屬','替代能源','生物科技','工業物料','農產品'];
  var REGION_KW = ['中國','亞洲','美國','歐洲','印度','日本','大中華','香港','拉丁美洲','東協','韓國','台灣','英國','巴西','德國','瑞士','意大利','西班牙','印尼','越南','澳洲','非洲','新興市場'];
  var REGION_STRIP = /(?:大型均衡型|大型增長型|大型價值型|大型股票|中小型股票|小型股票|中型股票|靈活型股票|股票收益|不包括\S+)(?:股票)?$/;
  var REGION_SPECIAL = {'亞洲不包括日本股票':'亞洲股票','亞太區不包括日本股票收益':'亞太區股票','亞太區不包括日本股票':'亞太區股票','亞洲不包括日本中小型股票':'亞洲股票','亞太區股票':'亞太區股票','亞洲股票':'亞洲股票','大中華股票':'大中華股票','環球新興市場股票':'環球新興市場股票','環球新興市場中小型股票':'環球新興市場股票','澳洲及紐西蘭股票':'澳紐股票','非洲及中東股票':'非洲及中東股票','中國股票 - A股':'中國股票'};
  allFunds.forEach(function(f) {
    var gc = f.groupCategory;
    var isEquity = gc && (gc.indexOf('股票')>=0 || gc.indexOf('行業')>=0);
    var et = '';
    if (isEquity) {
      var isSector = false;
      for (var i=0;i<SECTOR_KW.length;i++) { if(gc.indexOf(SECTOR_KW[i])>=0 && gc.indexOf('行業')>=0) { isSector=true; break; } }
      if (isSector) { et = '行業'; }
      else {
        var isRegion = false;
        for (var i=0;i<REGION_KW.length;i++) { if(gc.indexOf(REGION_KW[i])>=0) { isRegion=true; break; } }
        et = isRegion ? '地區' : '其他';
      }
    }
    f.equityType = et;
    f.regionCategory = (et==='地區') ? (REGION_SPECIAL[gc] || gc.replace(REGION_STRIP,'股票')) : '';
  });

  // 3. Generate exports
  console.log('[3/4] Generating exports...');

  // JSON (with groupCategory)
  fs.writeFileSync(path.join(KB_DIR, 'funds_export.json'), JSON.stringify(allFunds, null, 2), 'utf-8');

  // CSV
  var csv = 'FundCode,FundName,Category,GroupCategory,FundHouse,WMC,Subscribe,Price,PriceDate,Currency,Risk,RetYTD(%),Ret1W(%),Ret1M(%),Ret3M(%),Ret6M(%),Ret1Y(%),Ret2Y(%),Ret3Y(%),Ret5Y(%),Yield(%),YieldDate,MgmtFee(%),ISIN,StarRating\n';
  allFunds.forEach((f) => {
    csv += [f.fundCode, esc(f.fundName), esc(f.categoryName), esc(f.groupCategory), esc(f.fundHouse),
      f.isWMC ? 'Y' : 'N', f.canSubscribe ? 'Y' : 'N', f.price, f.priceDate || '', f.currency, f.riskLevel,
      fmt(f.returnYTD), fmt(f.return1W), fmt(f.return1M), fmt(f.return3M), fmt(f.return6M),
      fmt(f.return1Y), fmt(f.return2Y), fmt(f.return3Y), fmt(f.return5Y),
      fmt(f.yield), f.yieldDate, f.managementFee, f.isin, f.starRating || ''
    ].join(',') + '\n';
  });
  fs.writeFileSync(path.join(KB_DIR, 'funds_export.csv'),
    Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(csv, 'utf-8')]));

  // JS for dashboard - correct types (strings "", numbers bare)
  // 0=code 1=name 2=cat 3=wmc 4=sub 5=price 6=pdate 7=ccy 8=risk
  // 9-18=returns 19=yield 20=mgmt 21=star 22=house 23=groupCat
  var js = 'const FUNDS_DATA=[\n';
  allFunds.forEach((f, i) => {
    js += '[' +
      esc(f.fundCode) + ',' + esc(f.fundName) + ',' + esc(f.categoryName) + ',' +
      (f.isWMC ? 1 : 0) + ',' + (f.canSubscribe ? 1 : 0) + ',' +
      (f.price || 0) + ',' + esc(f.priceDate) + ',' + esc(f.currency) + ',' +
      (f.riskLevel || 0) + ',' +
      fmt(f.returnYTD) + ',' + fmt(f.return1W) + ',' + fmt(f.return1M) + ',' +
      fmt(f.return3M) + ',' + fmt(f.return6M) + ',' + fmt(f.return1Y) + ',' +
      fmt(f.return2Y) + ',' + fmt(f.return3Y) + ',' + fmt(f.return5Y) + ',' +
      fmt(f.yield) + ',' + (f.managementFee || 0) + ',' + (f.starRating || 0) + ',' +
      esc(f.fundHouse) + ',' + esc(f.groupCategory) + ',' +
      esc(f.equityType || '') + ',' +
      esc(f.regionCategory || '') + ']';
    if (i < allFunds.length - 1) js += ',';
    js += '\n';
  });
  js += '];\n';
  fs.writeFileSync(path.join(KB_DIR, 'funds_data.js'), js, 'utf-8');

  // 4. Git push
  console.log('[4/4] Git push...');
  try {
    execSync('git add -A', { cwd: KB_DIR, stdio: 'pipe' });
    execSync('git diff --cached --quiet', { cwd: KB_DIR, stdio: 'pipe' });
    console.log('  -> No changes, skip commit');
  } catch(e) {
    execSync('git commit -m "weekly: fund update ' + new Date().toISOString().slice(0, 10) + '"', { cwd: KB_DIR, stdio: 'pipe' });
    execSync('git push', { cwd: KB_DIR, stdio: 'pipe' });
    console.log('  -> Pushed to GitHub');
  }

  var garbled = allFunds.filter(function(f){return /\uFFFD/.test(f.fundName+f.categoryName+f.fundHouse);}).length;
  var apiCats = new Set(allFunds.map(function(f){return f.categoryName;}));
  var grpCats = new Set(allFunds.map(function(f){return f.groupCategory;}));

  console.log('\n=== Complete: ' + allFunds.length + ' funds, ' + allFunds.filter(function(f){return f.isWMC;}).length + ' WMC');
  console.log('Encoding fixes: yes, remaining garbled: ' + garbled);
  console.log('Categories: ' + apiCats.size + ' API -> ' + grpCats.size + ' consolidated');
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });
