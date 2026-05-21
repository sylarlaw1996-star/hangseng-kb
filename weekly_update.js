// Weekly fund data update subagent script
// Run by cron: every Saturday 20:00

const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

const HOST = 'rbwm-api.hsbc.com.hk';
const BASE = '/pws-hk-hase-fsm-papi-prod-proxy/v1';
const KB_DIR = 'C:/Users/Administrator/hangseng-kb';
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', 'Accept-Language': 'zh-HK,zh;q=0.9' };

function httpGet(p) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: HOST, path: BASE + p, headers: HEADERS }, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => {
        if (r.statusCode !== 200) reject(new Error(`HTTP ${r.statusCode}`));
        else resolve(JSON.parse(d));
      });
    }).on('error', reject);
  });
}

function toArray(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
const fmt = (v) => (v == null || v === '') ? 0 : +Number(v).toFixed(2);

function fixGarbled(s) {
  if (!s) return s;
  s = s.replace(/\uFFFD/g, '');
  s = s.replace('中國債', '中國債券').replace('色派息', '特色派息');
  s = s.replace('行業股', '行業股票').replace('境生態', '環境生態');
  s = s.replace('本股票', '日本股票').replace('市值', '市值型');
  s = s.replace('鄧普頓資', '鄧普頓投資').replace('聯環球資', '聯環球投資');
  s = s.replace('貝萊資產', '貝萊德資產').replace('景順投資理', '景順投資管理');
  s = s.replace('富達基', '富達基金').replace('投資管', '投資管理');
  s = s.replace('摩根資管理', '摩根資產管理');
  return s;
}

async function main() {
  console.log('=== HASE Fund Weekly Update ===\n');

  // 1. Fetch categories
  console.log('[1/4] Fetching sectors...');
  const allSectors = [];
  for (const g of ['B', 'F', 'E', 'O']) {
    const r = await httpGet(`/Categories?type=S&sectorGroup=${g}`);
    const arr = r.CategoryPerformanceDataResponse.CategoryPerformanceDataResult.ArrayOfCategoryPerformance.CategoryPerformance;
    toArray(arr).forEach((s) => allSectors.push({ id: s.Id }));
  }
  console.log(`  -> ${allSectors.length} sectors`);

  // 2. Fetch funds
  console.log('[2/4] Fetching funds...');
  const allFunds = [];
  const seen = new Set();
  for (let i = 0; i < allSectors.length; i++) {
    process.stdout.write(`  [${i + 1}/${allSectors.length}] ${allSectors[i].id}...`);
    try {
      const r = await httpGet(`/Funds?fundCategory=${allSectors[i].id}`);
      toArray(r.QuickRank.FundRecords).forEach((f) => {
        const code = f.hsFundCode || '';
        if (!code || seen.has(code)) return;
        seen.add(code);
        allFunds.push({
          fundCode: code, fundName: fixGarbled(f.FundName || ''),
          categoryName: fixGarbled(f.CategoryName || ''),
          fundHouse: fixGarbled(f.hsFundHouseName || ''),
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
      process.stdout.write(` ${toArray(r.QuickRank.FundRecords).length}\n`);
    } catch { process.stdout.write(' error\n'); }
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`  -> ${allFunds.length} unique funds`);

  // 3. Generate exports
  console.log('[3/4] Generating exports...');

  // JSON
  fs.writeFileSync(path.join(KB_DIR, 'funds_export.json'), JSON.stringify(allFunds, null, 2), 'utf-8');

  // CSV
  const esc = (s) => '"' + (s || '').replace(/"/g, '""') + '"';
  let csv = 'FundCode,FundName,Category,FundHouse,WMC,Subscribe,Price,PriceDate,Currency,Risk,RetYTD(%),Ret1W(%),Ret1M(%),Ret3M(%),Ret6M(%),Ret1Y(%),Ret2Y(%),Ret3Y(%),Ret5Y(%),Yield(%),YieldDate,MgmtFee(%),ISIN,StarRating\n';
  allFunds.forEach((f) => {
    csv += [f.fundCode, esc(f.fundName), esc(f.categoryName), esc(f.fundHouse),
      f.isWMC ? 'Y' : 'N', f.canSubscribe ? 'Y' : 'N', f.price, f.priceDate || '', f.currency, f.riskLevel,
      fmt(f.returnYTD), fmt(f.return1W), fmt(f.return1M), fmt(f.return3M), fmt(f.return6M),
      fmt(f.return1Y), fmt(f.return2Y), fmt(f.return3Y), fmt(f.return5Y),
      fmt(f.yield), f.yieldDate, f.managementFee, f.isin, f.starRating || ''
    ].join(',') + '\n';
  });
  fs.writeFileSync(path.join(KB_DIR, 'funds_export.csv'),
    Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(csv, 'utf-8')]));

  // JS for dashboard
  const esc2 = (s) => (s || '').replace(/"/g, '""');
  let js = 'const FUNDS_DATA=[\n';
  allFunds.forEach((f, i) => {
    js += `["${f.fundCode}","${esc2(f.fundName)}","${esc2(f.categoryName)}",${f.isWMC ? 1 : 0},${f.canSubscribe ? 1 : 0},${f.price || 0},"${f.priceDate || ''}","${f.currency || ''}",${f.riskLevel || 0},${fmt(f.returnYTD)},${fmt(f.return1W)},${fmt(f.return1M)},${fmt(f.return3M)},${fmt(f.return6M)},${fmt(f.return1Y)},${fmt(f.return2Y)},${fmt(f.return3Y)},${fmt(f.return5Y)},${fmt(f.yield)},${f.managementFee || 0},${f.starRating || 0},"${esc2(f.fundHouse)}"]`;
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
  } catch {
    execSync(`git commit -m "weekly: fund update ${new Date().toISOString().slice(0, 10)}"`, { cwd: KB_DIR, stdio: 'pipe' });
    execSync('git push', { cwd: KB_DIR, stdio: 'pipe' });
    console.log('  -> Pushed to GitHub');
  }

  console.log(`\n=== Complete: ${allFunds.length} funds, ${allFunds.filter((f) => f.isWMC).length} WMC`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
