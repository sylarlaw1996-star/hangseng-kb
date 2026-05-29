const fs = require('fs');
const https = require('https');
const path = require('path');

const HOST = 'rbwm-api.hsbc.com.hk';
const BASE = '/pws-hk-hase-fsm-papi-prod-proxy/v1';
const KB_DIR = 'C:/Users/Administrator/hangseng-kb';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Accept': 'application/json',
  'Accept-Language': 'zh-HK,zh;q=0.9'
};

// ─── Encoding Fix Map ─────────────────────────────────────────────
const ENC_FIX_MAP = {
  '��合': '混合', '���': '服務', '��業': '行業', '行��': '行業',
  '��球': '環球', '��國': '中國', '機���': '機會', '每��': '每月',
  '���萊德': '貝萊德', '美��': '美元', '��司': '公司', '��菱': '霸菱',
  '投���': '投資', '基��': '基金', '��活': '靈活', '���限': '有限',
};
const ENC_FIX_ENTRIES = Object.entries(ENC_FIX_MAP).sort(function(a,b){return b[0].length-a[0].length;});

function fixEncoding(str) {
  if (!str || typeof str !== 'string') return str || '';
  var fixed = str;
  for (var i = 0; i < ENC_FIX_ENTRIES.length; i++) {
    var bad = ENC_FIX_ENTRIES[i][0];
    var good = ENC_FIX_ENTRIES[i][1];
    fixed = fixed.split(bad).join(good);
  }
  fixed = fixed.replace(/\uFFFD/g, '');
  fixed = fixed.trim();
  return fixed || str;
}

// ─── Category Consolidation ────────────────────────────────────────
var CCY_PREFIXES = ['美元','港元','歐元','英鎊','瑞士法郎','澳幣','日圓','人民幣','新加坡元','紐元'];
var HEDGE_RE = / - (美元|港元|歐元|英鎊|瑞士法郎|澳幣|日圓|人民幣|新加坡元|紐元)對沖$/;
var LOCAL_CCY_RE = / - 本地貨幣$/;

function toGroupCategory(cat) {
  // Step 1: Normalize whitespace first
  var b = (cat || '').replace(/\s{2,}/g, ' ').trim();
  // Step 2: Strip trailing hedge suffixes (欧元/美元等对冲)
  b = b.replace(HEDGE_RE, '');
  // Step 3: Strip 本地貨幣 suffix
  b = b.replace(LOCAL_CCY_RE, '');
  // Step 4: Strip leading currency prefix
  for (var i = 0; i < CCY_PREFIXES.length; i++) {
    var c = CCY_PREFIXES[i];
    if (b.indexOf(c) === 0) {
      // Don't strip if followed by 區 (歐元區 = Eurozone, not EUR currency)
      var nextChar = b.charAt(c.length);
      if (nextChar === '區') continue;
      b = b.slice(c.length); break;
    }
  }
  b = b.trim();
  return b || cat;
}

function getGroupCategory(catName) {
  var fixed = fixEncoding(catName);
  return toGroupCategory(fixed);
}

// ─── Equity Subtype (行業 vs 地區) ─────────────────────────────────
var SECTOR_KEYWORDS = ['科技','健康護理','消費品及服務','天然資源','環境生態',
  '金融服務','基礎建設','能源','貴金屬','替代能源','生物科技','工業物料','農產品'];
var REGION_KEYWORDS = ['中國','亞洲','美國','歐洲','印度','日本','大中華','香港',
  '拉丁美洲','東協','韓國','台灣','英國','巴西','德國','瑞士','意大利','西班牙',
  '印尼','越南','澳洲','非洲','新興市場','歐元區','環球'];

function getEquityType(groupCat) {
  if (!groupCat) return '';
  // Only classify if it's actually an equity fund
  var isEquity = groupCat.indexOf('股票') >= 0 || groupCat.indexOf('行業') >= 0;
  if (!isEquity) return '';
  // Check if it's a sector fund
  for (var i = 0; i < SECTOR_KEYWORDS.length; i++) {
    if (groupCat.indexOf(SECTOR_KEYWORDS[i]) >= 0 && groupCat.indexOf('行業') >= 0) return '行業';
  }
  // Check if it's a region fund
  for (var i = 0; i < REGION_KEYWORDS.length; i++) {
    if (groupCat.indexOf(REGION_KEYWORDS[i]) >= 0) return '地區';
  }
  return '其他';
}

// ─── Region Category Consolidation (去大中小盤) ────────────────────
// For region-type equity funds: strip market cap/style suffixes
// e.g. 美國大型均衡型股票 → 美國股票, 歐洲不包括英國大型股票 → 歐洲股票
var REGION_STRIP_RE = /(?:大型均衡型|大型增長型|大型價值型|大型股票|中小型股票|小型股票|中型股票|靈活型股票|靈活市值型股票|股票收益|不包括\S+)(?:股票)?$/;
var REGION_SPECIAL_MAP = {
  '亞洲不包括日本股票': '亞洲股票',
  '亞太區不包括日本股票收益': '亞太區股票',
  '亞太區不包括日本股票': '亞太區股票',
  '亞洲不包括日本中小型股票': '亞洲股票',
  '亞太區股票': '亞太區股票',
  '亞洲股票': '亞洲股票',
  '大中華股票': '大中華股票',
  '環球新興市場股票': '環球新興市場股票',
  '環球新興市場中小型股票': '環球新興市場股票',
  '澳洲及紐西蘭股票': '澳紐股票',
  '非洲及中東股票': '非洲及中東股票',
  '中國股票 - A股': '中國股票',
  '歐元區大型股票': '歐洲股票',
  '歐元區中型股票': '歐洲股票',
};

function getRegionCategory(groupCat, equityType) {
  if (equityType !== '地區' || !groupCat) return groupCat || '';
  // Check special map first
  if (REGION_SPECIAL_MAP[groupCat]) return REGION_SPECIAL_MAP[groupCat];
  // Strip market cap/style suffix
  var stripped = groupCat.replace(REGION_STRIP_RE, '股票');
  return stripped;
}

// ─── Equity Style (大中小盤 / 增長價值) ───────────────────────────
var EQUITY_STYLE_MAP = {
  '大型均衡型': '大型',
  '大型增長型': '大型增長',
  '大型價值型': '大型價值',
  '中小型': '中小型',
  '中型': '中型',
  '小型': '小型',
  '靈活型': '靈活型',
  '股票收益': '收益型',
};

function getEquityStyle(groupCat) {
  if (!groupCat) return '';
  // Check equity style keywords
  for (var key in EQUITY_STYLE_MAP) {
    if (groupCat.indexOf(key) >= 0) return EQUITY_STYLE_MAP[key];
  }
  // Check if it has 行業 but no size info
  if (groupCat.indexOf('行業') >= 0) return '綜合';
  // Region equity without specific size = 綜合
  if (groupCat.indexOf('股票') >= 0 && groupCat.indexOf('環球') < 0 && groupCat.indexOf('新興市場') < 0) return '綜合';
  return '';
}

// ─── Balanced Fund Categorization (風險層級 + 地區) ───────────────
var BALANCED_RISK_MAP = {
  '保守型股債混合': '保守型',
  '保守型股債混合 - 環球': '保守型',
  '股債混合 – 20%-40%股票': '保守型',
  '平衡型股債混合': '平衡型',
  '平衡型股債混合 - 環球': '平衡型',
  '股債混合 – 40%-60%股票': '平衡型',
  '靈活型股債混合': '靈活型',
  '進取型股債混合': '進取型',
  '積極型股債混合 - 環球': '積極型',
  '亞洲股債混合': '平衡型',
  '大中華股債混合': '平衡型',
  '環球新興市場股債混合': '平衡型',
};
var BALANCED_REGION_MAP = {
  '保守型股債混合': '環球',
  '保守型股債混合 - 環球': '環球',
  '股債混合 – 20%-40%股票': '環球',
  '平衡型股債混合': '環球',
  '平衡型股債混合 - 環球': '環球',
  '股債混合 – 40%-60%股票': '環球',
  '靈活型股債混合': '環球',
  '進取型股債混合': '環球',
  '積極型股債混合 - 環球': '環球',
  '亞洲股債混合': '亞洲',
  '大中華股債混合': '大中華',
  '環球新興市場股債混合': '新興市場',
};

function isBalanced(groupCat) {
  if (!groupCat) return false;
  return groupCat.indexOf('股債混合') >= 0 || (groupCat.indexOf('混合') >= 0 && groupCat.indexOf('債券') < 0 && groupCat.indexOf('股票') < 0);
}
function getBalancedRisk(groupCat) { return BALANCED_RISK_MAP[groupCat] || '其他'; }
function getBalancedRegion(groupCat) { return BALANCED_REGION_MAP[groupCat] || '環球'; }

// ─── Bond Fund Categorization (類型 + 地區) ───────────────────────
var BOND_TYPE_MAP = {
  '環球債券 - 靈活策略': '靈活策略',
  '債券 - 靈活策略': '靈活策略',
  '環球多元化債券': '多元化',
  '多元化債券': '多元化',
  '多元化債券 - 短期': '多元化',
  '高收益債券': '高收益',
  '亞洲高收益債券': '高收益',
  '環球高收益債券': '高收益',
  '環球高收益債券 - 英磅對沖': '高收益',
  '環球企業債券': '企業',
  '企業債券': '企業',
  '環球新興市場企業債券': '企業',
  '政府債券': '政府',
  '次級債券': '企業',
  '環球通脹掛鉤債券 – 美元對沖': '通脹掛鉤',
  '環球通脹掛鉤債券': '通脹掛鉤',
  '貨幣市場 - 美元': '貨幣市場',
  '亞洲債券': '綜合',
  '環球新興市場債券': '綜合',
  '中國債券': '綜合',
  '債券': '綜合',
  '債券 - 在岸': '綜合',
};
var BOND_REGION_MAP = {
  '環球債券 - 靈活策略': '環球',
  '債券 - 靈活策略': '環球',
  '環球多元化債券': '環球',
  '多元化債券': '環球',
  '多元化債券 - 短期': '環球',
  '高收益債券': '環球',
  '環球高收益債券': '環球',
  '環球高收益債券 - 英磅對沖': '環球',
  '環球企業債券': '環球',
  '企業債券': '環球',
  '政府債券': '環球',
  '次級債券': '環球',
  '環球通脹掛鉤債券 – 美元對沖': '環球',
  '環球通脹掛鉤債券': '環球',
  '貨幣市場 - 美元': '環球',
  '亞洲債券': '亞洲',
  '亞洲高收益債券': '亞洲',
  '環球新興市場債券': '新興市場',
  '環球新興市場企業債券': '新興市場',
  '中國債券': '中國',
  '債券': '環球',
  '債券 - 在岸': '中國',
};

function isBond(groupCat) {
  if (!groupCat) return false;
  return (groupCat.indexOf('債券') >= 0 || groupCat.indexOf('貨幣市場') >= 0) && groupCat.indexOf('股債') < 0;
}
function getBondType(groupCat) { return BOND_TYPE_MAP[groupCat] || '其他'; }
function getBondRegion(groupCat) { return BOND_REGION_MAP[groupCat] || '環球'; }

// ─── HTTP helper (fixed encoding) ──────────────────────────────────
function httpGet(p) {
  return new Promise(function(resolve, reject) {
    https.get({ hostname: HOST, path: BASE + p, headers: HEADERS }, function(r) {
      var chunks = [];
      r.on('data', function(c) { chunks.push(c); });
      r.on('end', function() {
        if (r.statusCode !== 200) reject(new Error('HTTP ' + r.statusCode));
        else {
          var raw = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(raw));
        }
      });
    }).on('error', function(e) { reject(e); });
  });
}

function toArray(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
function fmt(v) { return (v === null || v === undefined || v === '') ? 0 : Number(Number(v).toFixed(2)); }

function esc(s) { return '"' + (s || '').replace(/"/g, '""') + '"'; }

async function updateKB() {
  console.log('=== HASE Fund Knowledge Base Update ===\n');

  // Step 1: Fetch all sectors
  console.log('[1/5] Fetching sector categories...');
  var groups = ['B', 'F', 'E', 'O'];
  var allSectors = [];
  for (var g = 0; g < groups.length; g++) {
    var r = await httpGet('/Categories?type=S&sectorGroup=' + groups[g]);
    var perfArr = r.CategoryPerformanceDataResponse.CategoryPerformanceDataResult.ArrayOfCategoryPerformance.CategoryPerformance;
    toArray(perfArr).forEach(function(s) { allSectors.push({ id: s.Id, name: s.Name }); });
  }
  console.log('  -> ' + allSectors.length + ' sectors found');

  // Step 2: Fetch all funds
  console.log('[2/5] Fetching fund data...');
  var allFunds = [];
  var seen = new Set();
  for (var i = 0; i < allSectors.length; i++) {
    process.stdout.write('  [' + (i+1) + '/' + allSectors.length + '] ' + allSectors[i].id + '...');
    try {
      var r = await httpGet('/Funds?fundCategory=' + allSectors[i].id);
      var records = toArray(r.QuickRank.FundRecords);
      records.forEach(function(f) {
        var code = f.hsFundCode || '';
        if (!code || seen.has(code)) return;
        seen.add(code);

        var rawName = f.FundName || '';
        var rawCat = f.CategoryName || '';
        var rawHouse = f.hsFundHouseName || '';
        var fixedName = fixEncoding(rawName);
        var fixedCat = fixEncoding(rawCat);
        var fixedHouse = fixEncoding(rawHouse);

        allFunds.push({
          fundCode: code,
          fundName: fixedName,
          categoryName: fixedCat,
          groupCategory: getGroupCategory(rawCat),
          fundGroupName: f.FundGroupName || '',
          fundHouse: fixedHouse,
          isWMC: f.IsWMC === 'Y',
          canSubscribe: f.AvailableForSubscribe === 'Y',
          price: f.Price || 0,
          priceDate: f.SubscriptionPriceDate || f.RedemptionPriceDate || '',
          currency: f.CurrencyName || '',
          riskLevel: f.hsRiskLevel || '',
          returnYTD: f.ReturnYTD, return1W: f.Return1Week, return1M: f.Return1Month,
          return3M: f.Return3Month, return6M: f.Return6Month,
          return1Y: f.Return1Year, return2Y: f.Return2Y, return3Y: f.Return3Y, return5Y: f.Return5Y,
          yield: f.Yield, yieldDate: f.YieldDate || '',
          managementFee: f.ManagementFee, frontLoad: f.FrontLoad,
          fundSize: f.FundSize, inceptionDate: f.InceptionDate,
          isin: f.ISIN || '', starRating: f.StarRating,
          pdfFs: f.DocFS_FilePath || '',
          url: 'https://www.hangseng.com/zh-hk/fundsupermart/fund/fundinfo/?fundCode=' + code
        });
        // Compute equityType after push (need groupCategory)
        var lastIdx = allFunds.length - 1;
        allFunds[lastIdx].equityType = getEquityType(allFunds[lastIdx].groupCategory);
        allFunds[lastIdx].regionCategory = getRegionCategory(allFunds[lastIdx].groupCategory, allFunds[lastIdx].equityType);
        var gc = allFunds[lastIdx].groupCategory;
        allFunds[lastIdx].balancedRisk = isBalanced(gc) ? getBalancedRisk(gc) : '';
        allFunds[lastIdx].balancedRegion = isBalanced(gc) ? getBalancedRegion(gc) : '';
        allFunds[lastIdx].bondType = isBond(gc) ? getBondType(gc) : '';
        allFunds[lastIdx].bondRegion = isBond(gc) ? getBondRegion(gc) : '';
        allFunds[lastIdx].equityStyle = getEquityStyle(gc);
      });
      process.stdout.write(' ' + records.length + '\n');
    } catch(e) {
      process.stdout.write(' error\n');
    }
    await new Promise(function(r) { setTimeout(r, 50); });
  }
  console.log('  -> ' + allFunds.length + ' unique funds collected');

  // Step 3: Download new PDFs
  console.log('[3/5] Downloading new PDFs...');
  var pdfDir = path.join(KB_DIR, 'pdfs');
  var pdfNew = 0, pdfSkip = 0;
  for (var i = 0; i < allFunds.length; i++) {
    var f = allFunds[i];
    if (!f.pdfFs) { pdfSkip++; continue; }
    var dateStr = (f.pdfFs.match(/_(\d{8})\.pdf$/) || [,''])[1].slice(0, 6) || new Date().toISOString().slice(0, 7).replace('-', '');
    var subDir = path.join(pdfDir, dateStr);
    var filePath = path.join(subDir, dateStr + ' ' + f.fundCode + '.pdf');
    if (fs.existsSync(filePath)) { pdfSkip++; continue; }
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    try {
      await new Promise(function(resolve, reject) {
        var u = new URL(f.pdfFs);
        https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, function(r) {
          if (r.statusCode !== 200) { resolve(false); return; }
          var chunks = [];
          r.on('data', function(c) { chunks.push(c); });
          r.on('end', function() {
            var buf = Buffer.concat(chunks);
            if (buf.length > 10 && buf[0] === 0x25 && buf[1] === 0x50) {
              fs.writeFileSync(filePath, buf);
              resolve(true);
            } else resolve(false);
          });
        }).on('error', function() { resolve(false); });
      });
      pdfNew++;
    } catch(e) { /* skip */ }
    if (i % 50 === 0) process.stdout.write('  PDFs: ' + pdfNew + ' new, ' + pdfSkip + ' cached\r');
  }
  console.log('  PDFs: ' + pdfNew + ' new, ' + pdfSkip + ' cached');

  // Step 4: Generate exports
  console.log('[4/5] Generating export files...');

  // JSON
  fs.writeFileSync(path.join(KB_DIR, 'funds_export.json'), JSON.stringify(allFunds, null, 2), 'utf-8');

  // CSV (UTF-8 BOM)
  var csv = 'FundCode,FundName,Category,GroupCategory,WMC,Subscribe,Price,PriceDate,Currency,Risk,RetYTD(%),Ret1W(%),Ret1M(%),Ret3M(%),Ret6M(%),Ret1Y(%),Ret2Y(%),Ret3Y(%),Ret5Y(%),Yield(%),YieldDate,MgmtFee(%),ISIN,PageURL,StarRating\n';
  allFunds.forEach(function(f) {
    csv += [
      f.fundCode, esc(f.fundName), esc(f.categoryName), esc(f.groupCategory),
      f.isWMC ? 'Y' : 'N', f.canSubscribe ? 'Y' : 'N',
      f.price, f.priceDate || '', f.currency, f.riskLevel,
      fmt(f.returnYTD), fmt(f.return1W), fmt(f.return1M), fmt(f.return3M),
      fmt(f.return6M), fmt(f.return1Y), fmt(f.return2Y), fmt(f.return3Y), fmt(f.return5Y),
      fmt(f.yield), f.yieldDate, f.managementFee, f.isin, f.url, f.starRating || ''
    ].join(',') + '\n';
  });
  fs.writeFileSync(path.join(KB_DIR, 'funds_export.csv'), Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]), Buffer.from(csv, 'utf-8')]));

  // ── JS for dashboard (correct types) ─────────────────────────
  // 0=code  1=name  2=cat  3=wmc  4=sub  5=price  6=pdate  7=ccy  8=risk
  // 9-18=returns(ytd,1w,1m,3m,6m,1y,2y,3y,5y)  19=yield  20=mgmt  21=star  22=house  23=groupCat
  var js = 'const FUNDS_DATA=[\n';
  allFunds.forEach(function(f, i) {
    js += '[' +
      esc(f.fundCode) + ',' +
      esc(f.fundName) + ',' +
      esc(f.categoryName) + ',' +
      (f.isWMC ? 1 : 0) + ',' + (f.canSubscribe ? 1 : 0) + ',' +
      (f.price || 0) + ',' + esc(f.priceDate) + ',' + esc(f.currency) + ',' +
      (f.riskLevel || 0) + ',' +
      fmt(f.returnYTD) + ',' + fmt(f.return1W) + ',' + fmt(f.return1M) + ',' +
      fmt(f.return3M) + ',' + fmt(f.return6M) + ',' + fmt(f.return1Y) + ',' +
      fmt(f.return2Y) + ',' + fmt(f.return3Y) + ',' + fmt(f.return5Y) + ',' +
      fmt(f.yield) + ',' + (f.managementFee || 0) + ',' + (f.starRating || 0) + ',' +
      esc(f.fundHouse) + ',' +
      esc(f.groupCategory) + ',' +
      esc(f.equityType) + ',' +
      esc(f.regionCategory) + ',' +
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

  // Step 5: Summary
  var wmcC = allFunds.filter(function(f) { return f.isWMC; }).length;
  var closedC = allFunds.filter(function(f) { return !f.canSubscribe; }).length;
  var garbledCheck = allFunds.filter(function(f) { return /\uFFFD/.test(f.fundName + f.categoryName + f.fundHouse); }).length;
  var apiCategories = new Set(allFunds.map(function(f){return f.categoryName;}));
  var groupCategories = new Set(allFunds.map(function(f){return f.groupCategory;}));

  console.log('[5/5] Complete!\n');
  console.log('=== SUMMARY ===');
  console.log('Sectors scanned: ' + allSectors.length);
  console.log('Total funds: ' + allFunds.length);
  console.log('WMC funds: ' + wmcC);
  console.log('Not subscribable: ' + closedC);
  console.log('PDFs new: ' + pdfNew + ', cached: ' + pdfSkip);
  console.log('Encoding fixes applied: yes (' + ENC_FIX_ENTRIES.length + ' patterns)');
  console.log('Remaining garbled entries: ' + garbledCheck + ' (should be 0)');
  console.log('Categories: ' + apiCategories.size + ' API → ' + groupCategories.size + ' consolidated');
  console.log('Exports: funds_export.csv (new column: GroupCategory), funds_export.json, funds_data.js');
  console.log('Dashboard: dashboard.html');
}

updateKB().catch(function(e) { console.error('Fatal:', e); });
