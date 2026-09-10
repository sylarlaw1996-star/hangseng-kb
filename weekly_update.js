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

// ─── Balanced / Bond / Equity-style classification ──────────────
// Derived from last-known-good 30-col data (HEAD~2:funds_data.js).
// Explicit lookup maps for known groupCategory values + keyword fallbacks.

var BAL_RISK_MAP = {
  '亞洲股債混合': '平衡型', '大中華股債混合': '平衡型', '環球新興市場股債混合': '平衡型',
  '平衡型股債混合': '平衡型', '平衡型股債混合 - 環球': '平衡型', '股債混合 – 40%-60%股票': '平衡型',
  '保守型股債混合': '保守型', '保守型股債混合 - 環球': '保守型', '股債混合 – 20%-40%股票': '保守型',
  '靈活型股債混合': '靈活型', '進取型股債混合': '進取型', '積極型股債混合 - 環球': '積極型'
};
var BAL_REGION_MAP = { '亞洲股債混合': '亞洲', '大中華股債混合': '大中華', '環球新興市場股債混合': '新興市場' };

var BOND_TYPE_MAP = {
  '亞洲債券': '綜合', '中國債券': '綜合', '債券': '綜合', '債券 - 在岸': '綜合', '環球新興市場債券': '綜合',
  '亞洲高收益債券': '高收益', '高收益債券': '高收益', '環球高收益債券': '高收益', '環球高收益債券 - 英磅對沖': '高收益',
  '企業債券': '企業', '環球企業債券': '企業', '環球新興市場企業債券': '企業', '次級債券': '企業',
  '政府債券': '政府',
  '多元化債券': '多元化', '多元化債券 - 短期': '多元化', '環球多元化債券': '多元化',
  '債券 - 靈活策略': '靈活策略', '環球債券 - 靈活策略': '靈活策略',
  '環球通脹掛鉤債券': '通脹掛鉤', '環球通脹掛鉤債券 – 美元對沖': '通脹掛鉤',
  '貨幣市場 - 美元': '貨幣市場', '債券 - 超短期': '其他'
};
var BOND_REGION_MAP = {
  '亞洲債券': '亞洲', '亞洲高收益債券': '亞洲', '中國債券': '中國', '債券 - 在岸': '中國',
  '環球新興市場債券': '新興市場', '環球新興市場企業債券': '新興市場'
};

function isBalanced(gc) {
  if (!gc) return false;
  if (gc.indexOf('股債混合') >= 0) return true;
  return gc.indexOf('混合') >= 0 && gc.indexOf('債券') < 0 && gc.indexOf('股票') < 0;
}
function isBond(gc) {
  if (!gc) return false;
  return (gc.indexOf('債券') >= 0 || gc.indexOf('貨幣市場') >= 0) && gc.indexOf('股債') < 0;
}
function getBalancedRisk(gc) {
  if (BAL_RISK_MAP[gc]) return BAL_RISK_MAP[gc];
  if (gc.indexOf('保守') >= 0) return '保守型';
  if (gc.indexOf('平衡') >= 0) return '平衡型';
  if (gc.indexOf('靈活') >= 0) return '靈活型';
  if (gc.indexOf('進取') >= 0) return '進取型';
  if (gc.indexOf('積極') >= 0) return '積極型';
  return '其他';
}
function getBalancedRegion(gc) {
  if (BAL_REGION_MAP[gc]) return BAL_REGION_MAP[gc];
  if (gc.indexOf('亞洲') >= 0) return '亞洲';
  if (gc.indexOf('大中華') >= 0) return '大中華';
  if (gc.indexOf('新興市場') >= 0) return '新興市場';
  return '環球';
}
function getBondType(gc) {
  if (BOND_TYPE_MAP[gc]) return BOND_TYPE_MAP[gc];
  if (gc.indexOf('高收益') >= 0) return '高收益';
  if (gc.indexOf('企業') >= 0 || gc.indexOf('次級') >= 0) return '企業';
  if (gc.indexOf('政府') >= 0) return '政府';
  if (gc.indexOf('多元化') >= 0) return '多元化';
  if (gc.indexOf('靈活') >= 0) return '靈活策略';
  if (gc.indexOf('貨幣市場') >= 0) return '貨幣市場';
  if (gc.indexOf('通脹掛鉤') >= 0) return '通脹掛鉤';
  if (gc.indexOf('超短期') >= 0 || gc.indexOf('短期') >= 0) return '其他';
  return '綜合';
}
function getBondRegion(gc) {
  if (BOND_REGION_MAP[gc]) return BOND_REGION_MAP[gc];
  if (gc.indexOf('中國') >= 0) return '中國';
  if (gc.indexOf('亞洲') >= 0) return '亞洲';
  if (gc.indexOf('新興市場') >= 0) return '新興市場';
  return '環球';
}
function getEquityStyle(gc) {
  if (!gc) return '';
  if (gc.indexOf('大型增長型') >= 0) return '大型增長';
  if (gc.indexOf('大型價值型') >= 0) return '大型價值';
  if (gc.indexOf('大型均衡型') >= 0) return '大型';
  if (gc.indexOf('中小型') >= 0) return '中小型';
  if (gc.indexOf('中型') >= 0) return '中型';
  if (gc.indexOf('小型') >= 0) return '小型';
  if (gc.indexOf('靈活型') >= 0) return '靈活型';
  if (gc.indexOf('股票收益') >= 0) return '收益型';
  if ((gc.indexOf('股票') >= 0 || gc.indexOf('行業') >= 0) && gc.indexOf('環球') < 0 && gc.indexOf('新興市場') < 0) return '綜合';
  return '';
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
    f.balancedRisk = isBalanced(gc) ? getBalancedRisk(gc) : '';
    f.balancedRegion = isBalanced(gc) ? getBalancedRegion(gc) : '';
    f.bondType = isBond(gc) ? getBondType(gc) : '';
    f.bondRegion = isBond(gc) ? getBondRegion(gc) : '';
    f.equityStyle = getEquityStyle(gc);
  });

  // 3. Generate exports
  console.log('[3/4] Generating exports...');

  // JSON (with groupCategory)
  fs.writeFileSync(path.join(KB_DIR, 'funds_export.json'), JSON.stringify(allFunds, null, 2), 'utf-8');

  // CSV
  var csv = 'FundCode,FundName,Category,GroupCategory,FundHouse,WMC,Subscribe,Price,PriceDate,Currency,Risk,RetYTD(%),Ret1W(%),Ret1M(%),Ret3M(%),Ret6M(%),Ret1Y(%),Ret2Y(%),Ret3Y(%),Ret5Y(%),Yield(%),YieldDate,MgmtFee(%),ISIN,StarRating,BalancedRisk,BalancedRegion,BondType,BondRegion,EquityStyle\n';
  allFunds.forEach((f) => {
    csv += [f.fundCode, esc(f.fundName), esc(f.categoryName), esc(f.groupCategory), esc(f.fundHouse),
      f.isWMC ? 'Y' : 'N', f.canSubscribe ? 'Y' : 'N', f.price, f.priceDate || '', f.currency, f.riskLevel,
      fmt(f.returnYTD), fmt(f.return1W), fmt(f.return1M), fmt(f.return3M), fmt(f.return6M),
      fmt(f.return1Y), fmt(f.return2Y), fmt(f.return3Y), fmt(f.return5Y),
      fmt(f.yield), f.yieldDate, f.managementFee, f.isin, f.starRating || '',
      esc(f.balancedRisk || ''), esc(f.balancedRegion || ''), esc(f.bondType || ''), esc(f.bondRegion || ''), esc(f.equityStyle || '')
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
      esc(f.regionCategory || '') + ',' +
      esc(f.balancedRisk || '') + ',' +
      esc(f.balancedRegion || '') + ',' +
      esc(f.bondType || '') + ',' +
      esc(f.bondRegion || '') + ',' +
      esc(f.equityStyle || '') + ']';
    if (i < allFunds.length - 1) js += ',';
    js += '\n';
  });
  js += '];\n';
  fs.writeFileSync(path.join(KB_DIR, 'funds_data.js'), js, 'utf-8');

  // 4. Git push (skip when HASE_SKIP_GIT=1, e.g. manual runs that commit separately)
  console.log('[4/4] Git push...');
  if (process.env.HASE_SKIP_GIT === '1') {
    console.log('  -> HASE_SKIP_GIT=1, skipping commit/push');
  } else {
    try {
      execSync('git add -A', { cwd: KB_DIR, stdio: 'pipe' });
      execSync('git diff --cached --quiet', { cwd: KB_DIR, stdio: 'pipe' });
      console.log('  -> No changes, skip commit');
    } catch(e) {
      execSync('git commit -m "weekly: fund update ' + new Date().toISOString().slice(0, 10) + '"', { cwd: KB_DIR, stdio: 'pipe' });
      execSync('git push', { cwd: KB_DIR, stdio: 'pipe' });
      console.log('  -> Pushed to GitHub');
    }
  }

  var garbled = allFunds.filter(function(f){return /\uFFFD/.test(f.fundName+f.categoryName+f.fundHouse);}).length;
  var apiCats = new Set(allFunds.map(function(f){return f.categoryName;}));
  var grpCats = new Set(allFunds.map(function(f){return f.groupCategory;}));

  console.log('\n=== Complete: ' + allFunds.length + ' funds, ' + allFunds.filter(function(f){return f.isWMC;}).length + ' WMC');
  console.log('Encoding fixes: yes, remaining garbled: ' + garbled);
  console.log('Categories: ' + apiCats.size + ' API -> ' + grpCats.size + ' consolidated');
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });
