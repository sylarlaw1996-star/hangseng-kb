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

function httpGet(p) {
  return new Promise(function(resolve, reject) {
    https.get({ hostname: HOST, path: BASE + p, headers: HEADERS }, function(r) {
      let d = '';
      r.on('data', function(c) { d += c; });
      r.on('end', function() {
        if (r.statusCode !== 200) reject(new Error('HTTP ' + r.statusCode));
        else resolve(JSON.parse(d));
      });
    }).on('error', function(e) { reject(e); });
  });
}

function toArray(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
function fmt(v) { return (v === null || v === undefined || v === '') ? 0 : Number(Number(v).toFixed(2)); }

async function updateKB() {
  console.log('=== HASE Fund Knowledge Base Update ===\n');

  // Step 1: Fetch all sectors
  console.log('[1/5] Fetching sector categories...');
  const groups = ['B', 'F', 'E', 'O'];
  const allSectors = [];
  for (const g of groups) {
    const r = await httpGet('/Categories?type=S&sectorGroup=' + g);
    const perfArr = r.CategoryPerformanceDataResponse.CategoryPerformanceDataResult.ArrayOfCategoryPerformance.CategoryPerformance;
    toArray(perfArr).forEach(function(s) { allSectors.push({ id: s.Id, name: s.Name }); });
  }
  console.log('  -> ' + allSectors.length + ' sectors found');

  // Step 2: Fetch all funds
  console.log('[2/5] Fetching fund data...');
  const allFunds = [];
  const seen = new Set();
  for (let i = 0; i < allSectors.length; i++) {
    process.stdout.write('  [' + (i+1) + '/' + allSectors.length + '] ' + allSectors[i].id + '...');
    try {
      const r = await httpGet('/Funds?fundCategory=' + allSectors[i].id);
      const records = toArray(r.QuickRank.FundRecords);
      records.forEach(function(f) {
        const code = f.hsFundCode || '';
        if (!code || seen.has(code)) return;
        seen.add(code);
        allFunds.push({
          fundCode: code, fundName: f.FundName || '',
          categoryName: f.CategoryName || '',
          fundGroupName: f.FundGroupName || '',
          fundHouse: f.hsFundHouseName || '',
          isWMC: f.IsWMC === 'Y', canSubscribe: f.AvailableForSubscribe === 'Y',
          price: f.Price || 0, priceDate: f.SubscriptionPriceDate || f.RedemptionPriceDate || '',
          currency: f.CurrencyName || '', riskLevel: f.hsRiskLevel || '',
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
  const pdfDir = path.join(KB_DIR, 'pdfs');
  let pdfNew = 0, pdfSkip = 0;
  for (let i = 0; i < allFunds.length; i++) {
    const f = allFunds[i];
    const pdfUrl = f.pdfFs;
    if (!pdfUrl) { pdfSkip++; continue; }
    const dateStr = (pdfUrl.match(/_(\d{8})\.pdf$/) || [,''])[1].slice(0, 6) || new Date().toISOString().slice(0, 7).replace('-', '');
    const subDir = path.join(pdfDir, dateStr);
    const filePath = path.join(subDir, dateStr + ' ' + f.fundCode + '.pdf');
    if (fs.existsSync(filePath)) { pdfSkip++; continue; }
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    try {
      await new Promise(function(resolve, reject) {
        const u = new URL(pdfUrl);
        https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, function(r) {
          if (r.statusCode !== 200) { resolve(false); return; }
          const chunks = [];
          r.on('data', function(c) { chunks.push(c); });
          r.on('end', function() {
            const buf = Buffer.concat(chunks);
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
  let csv = 'FundCode,FundName,Category,WMC,Subscribe,Price,PriceDate,Currency,Risk,RetYTD(%),Ret1W(%),Ret1M(%),Ret3M(%),Ret6M(%),Ret1Y(%),Ret2Y(%),Ret3Y(%),Ret5Y(%),Yield(%),YieldDate,MgmtFee(%),ISIN,PageURL,StarRating\n';
  allFunds.forEach(function(f) {
    csv += [
      f.fundCode, '"' + (f.fundName || '').replace(/"/g, '""') + '"',
      '"' + (f.categoryName || '').replace(/"/g, '""') + '"',
      f.isWMC ? 'Y' : 'N', f.canSubscribe ? 'Y' : 'N',
      f.price, f.priceDate || '', f.currency, f.riskLevel,
      fmt(f.returnYTD), fmt(f.return1W), fmt(f.return1M), fmt(f.return3M),
      fmt(f.return6M), fmt(f.return1Y), fmt(f.return2Y), fmt(f.return3Y), fmt(f.return5Y),
      fmt(f.yield), f.yieldDate, f.managementFee, f.isin, f.url, f.starRating || ''
    ].join(',') + '\n';
  });
  fs.writeFileSync(path.join(KB_DIR, 'funds_export.csv'), Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]), Buffer.from(csv, 'utf-8')]));

  // JS data for dashboard
  let js = 'const FUNDS_DATA=[\n';
  allFunds.forEach(function(f, i) {
    js += '["' + f.fundCode + '",' +
      '"' + (f.fundName || '').replace(/"/g, '""') + '",' +
      '"' + (f.categoryName || '').replace(/"/g, '""') + '",' +
      (f.isWMC ? 1 : 0) + ',' + (f.canSubscribe ? 1 : 0) + ',' +
      (f.price || 0) + ',"' + (f.priceDate || '') + '","' + (f.currency || '') + '",' +
      (f.riskLevel || 0) + ',' +
      fmt(f.returnYTD) + ',' + fmt(f.return1W) + ',' + fmt(f.return1M) + ',' +
      fmt(f.return3M) + ',' + fmt(f.return6M) + ',' + fmt(f.return1Y) + ',' +
      fmt(f.return2Y) + ',' + fmt(f.return3Y) + ',' + fmt(f.return5Y) + ',' +
      fmt(f.yield) + ',' + (f.managementFee || 0) + ',' + (f.starRating || 0) + ']';
    if (i < allFunds.length - 1) js += ',';
    js += '\n';
  });
  js += '];\n';
  fs.writeFileSync(path.join(KB_DIR, 'funds_data.js'), js, 'utf-8');

  // Step 5: Summary
  const wmcC = allFunds.filter(function(f) { return f.isWMC; }).length;
  const closedC = allFunds.filter(function(f) { return !f.canSubscribe; }).length;
  console.log('[5/5] Complete!\n');
  console.log('=== SUMMARY ===');
  console.log('Sectors scanned: ' + allSectors.length);
  console.log('Total funds: ' + allFunds.length);
  console.log('WMC funds: ' + wmcC);
  console.log('Not subscribable: ' + closedC);
  console.log('PDFs new: ' + pdfNew + ', cached: ' + pdfSkip);
  console.log('Exports: funds_export.csv, funds_export.json, funds_data.js');
  console.log('Dashboard: dashboard.html (loads funds_data.js)');
}

updateKB().catch(function(e) { console.error('Fatal:', e); });
