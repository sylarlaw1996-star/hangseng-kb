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

// 鈹€鈹€鈹€ Encoding Fix Map 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const ENC_FIX_MAP = {
  '锟斤拷鍚?: '娣峰悎', '锟斤拷锟?: '鏈嶅嫏', '锟斤拷妤?: '琛屾キ', '琛岋拷锟?: '琛屾キ',
  '锟斤拷鐞?: '鐠扮悆', '锟斤拷鍦?: '涓湅', '姗燂拷锟斤拷': '姗熸渻', '姣忥拷锟?: '姣忔湀',
  '锟斤拷锟借悐寰?: '璨濊悐寰?, '缇庯拷锟?: '缇庡厓', '锟斤拷鍙?: '鍏徃', '锟斤拷鑿?: '闇歌彵',
  '鎶曪拷锟斤拷': '鎶曡硣', '鍩猴拷锟?: '鍩洪噾', '锟斤拷娲?: '闈堟椿', '锟斤拷锟介檺': '鏈夐檺',
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

// 鈹€鈹€鈹€ Category Consolidation 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
var CCY_PREFIXES = ['缇庡厓','娓厓','姝愬厓','鑻遍帄','鐟炲＋娉曢儙','婢冲梗','鏃ュ湏','浜烘皯骞?,'鏂板姞鍧″厓','绱愬厓'];
var HEDGE_RE = / - (缇庡厓|娓厓|姝愬厓|鑻遍帄|鐟炲＋娉曢儙|婢冲梗|鏃ュ湏|浜烘皯骞鏂板姞鍧″厓|绱愬厓)灏嶆矕$/;
var LOCAL_CCY_RE = / - 鏈湴璨ㄥ梗$/;

function toGroupCategory(cat) {
  // Step 1: Normalize whitespace first
  var b = (cat || '').replace(/\s{2,}/g, ' ').trim();
  // Step 2: Strip trailing hedge suffixes (娆у厓/缇庡厓绛夊鍐?
  b = b.replace(HEDGE_RE, '');
  // Step 3: Strip 鏈湴璨ㄥ梗 suffix
  b = b.replace(LOCAL_CCY_RE, '');
  // Step 4: Strip leading currency prefix
  for (var i = 0; i < CCY_PREFIXES.length; i++) {
    var c = CCY_PREFIXES[i];
    if (b.indexOf(c) === 0) {
      // Don't strip if followed by 鍗€ (姝愬厓鍗€ = Eurozone, not EUR currency)
      var nextChar = b.charAt(c.length);
      if (nextChar === '鍗€') continue;
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

// 鈹€鈹€鈹€ Equity Subtype (琛屾キ vs 鍦板崁) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
var SECTOR_KEYWORDS = ['绉戞妧','鍋ュ悍璀风悊','娑堣不鍝佸強鏈嶅嫏','澶╃劧璩囨簮','鐠板鐢熸厠',
  '閲戣瀺鏈嶅嫏','鍩虹寤鸿ō','鑳芥簮','璨撮噾灞?,'鏇夸唬鑳芥簮','鐢熺墿绉戞妧','宸ユキ鐗╂枡','杈茬敘鍝?];
var REGION_KEYWORDS = ['涓湅','浜炴床','缇庡湅','姝愭床','鍗板害','鏃ユ湰','澶т腑鑿?,'棣欐腐',
  '鎷変竵缇庢床','鏉卞崝','闊撳湅','鍙扮仯','鑻卞湅','宸磋タ','寰峰湅','鐟炲＋','鎰忓ぇ鍒?,'瑗跨彮鐗?,
  '鍗板凹','瓒婂崡','婢虫床','闈炴床','鏂拌垐甯傚牬','姝愬厓鍗€','鐠扮悆'];

function getEquityType(groupCat) {
  if (!groupCat) return '';
  // Only classify if it's actually an equity fund
  var isEquity = groupCat.indexOf('鑲＄エ') >= 0 || groupCat.indexOf('琛屾キ') >= 0;
  if (!isEquity) return '';
  // Check if it's a sector fund
  for (var i = 0; i < SECTOR_KEYWORDS.length; i++) {
    if (groupCat.indexOf(SECTOR_KEYWORDS[i]) >= 0 && groupCat.indexOf('琛屾キ') >= 0) return '琛屾キ';
  }
  // Check if it's a region fund
  for (var i = 0; i < REGION_KEYWORDS.length; i++) {
    if (groupCat.indexOf(REGION_KEYWORDS[i]) >= 0) return '鍦板崁';
  }
  return '鍏朵粬';
}

// 鈹€鈹€鈹€ Region Category Consolidation (鍘诲ぇ涓皬鐩? 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// For region-type equity funds: strip market cap/style suffixes
// e.g. 缇庡湅澶у瀷鍧囪　鍨嬭偂绁?鈫?缇庡湅鑲＄エ, 姝愭床涓嶅寘鎷嫳鍦嬪ぇ鍨嬭偂绁?鈫?姝愭床鑲＄エ
var REGION_STRIP_RE = /(?:澶у瀷鍧囪　鍨媩澶у瀷澧為暦鍨媩澶у瀷鍍瑰€煎瀷|澶у瀷鑲＄エ|涓皬鍨嬭偂绁▅灏忓瀷鑲＄エ|涓瀷鑲＄エ|闈堟椿鍨嬭偂绁▅闈堟椿甯傚€煎瀷鑲＄エ|鑲＄エ鏀剁泭|涓嶅寘鎷琝S+)(?:鑲＄エ)?$/;
var REGION_SPECIAL_MAP = {
  '浜炴床涓嶅寘鎷棩鏈偂绁?: '浜炴床鑲＄エ',
  '浜炲お鍗€涓嶅寘鎷棩鏈偂绁ㄦ敹鐩?: '浜炲お鍗€鑲＄エ',
  '浜炲お鍗€涓嶅寘鎷棩鏈偂绁?: '浜炲お鍗€鑲＄エ',
  '浜炴床涓嶅寘鎷棩鏈腑灏忓瀷鑲＄エ': '浜炴床鑲＄エ',
  '浜炲お鍗€鑲＄エ': '浜炲お鍗€鑲＄エ',
  '浜炴床鑲＄エ': '浜炴床鑲＄エ',
  '澶т腑鑿偂绁?: '澶т腑鑿偂绁?,
  '鐠扮悆鏂拌垐甯傚牬鑲＄エ': '鐠扮悆鏂拌垐甯傚牬鑲＄エ',
  '鐠扮悆鏂拌垐甯傚牬涓皬鍨嬭偂绁?: '鐠扮悆鏂拌垐甯傚牬鑲＄エ',
  '婢虫床鍙婄磹瑗胯槶鑲＄エ': '婢崇磹鑲＄エ',
  '闈炴床鍙婁腑鏉辫偂绁?: '闈炴床鍙婁腑鏉辫偂绁?,
  '涓湅鑲＄エ - A鑲?: '涓湅鑲＄エ',
  '姝愬厓鍗€澶у瀷鑲＄エ': '姝愭床鑲＄エ',
  '姝愬厓鍗€涓瀷鑲＄エ': '姝愭床鑲＄エ',
};

function getRegionCategory(groupCat, equityType) {
  if (equityType !== '鍦板崁' || !groupCat) return groupCat || '';
  // Check special map first
  if (REGION_SPECIAL_MAP[groupCat]) return REGION_SPECIAL_MAP[groupCat];
  // Strip market cap/style suffix
  var stripped = groupCat.replace(REGION_STRIP_RE, '鑲＄エ');
  return stripped;
}

// 鈹€鈹€鈹€ Equity Style (澶т腑灏忕洡 / 澧為暦鍍瑰€? 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
var EQUITY_STYLE_MAP = {
  '澶у瀷鍧囪　鍨?: '澶у瀷',
  '澶у瀷澧為暦鍨?: '澶у瀷澧為暦',
  '澶у瀷鍍瑰€煎瀷': '澶у瀷鍍瑰€?,
  '涓皬鍨?: '涓皬鍨?,
  '涓瀷': '涓瀷',
  '灏忓瀷': '灏忓瀷',
  '闈堟椿鍨?: '闈堟椿鍨?,
  '鑲＄エ鏀剁泭': '鏀剁泭鍨?,
};

function getEquityStyle(groupCat) {
  if (!groupCat) return '';
  // Check equity style keywords
  for (var key in EQUITY_STYLE_MAP) {
    if (groupCat.indexOf(key) >= 0) return EQUITY_STYLE_MAP[key];
  }
  // Check if it has 琛屾キ but no size info
  if (groupCat.indexOf('琛屾キ') >= 0) return '缍滃悎';
  // Region equity without specific size = 缍滃悎
  if (groupCat.indexOf('鑲＄エ') >= 0 && groupCat.indexOf('鐠扮悆') < 0 && groupCat.indexOf('鏂拌垐甯傚牬') < 0) return '缍滃悎';
  return '';
}

// 鈹€鈹€鈹€ Balanced Fund Categorization (棰ㄩ毆灞ょ礆 + 鍦板崁) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
var BALANCED_RISK_MAP = {
  '淇濆畧鍨嬭偂鍌垫贩鍚?: '淇濆畧鍨?,
  '淇濆畧鍨嬭偂鍌垫贩鍚?- 鐠扮悆': '淇濆畧鍨?,
  '鑲″偟娣峰悎 鈥?20%-40%鑲＄エ': '淇濆畧鍨?,
  '骞宠　鍨嬭偂鍌垫贩鍚?: '骞宠　鍨?,
  '骞宠　鍨嬭偂鍌垫贩鍚?- 鐠扮悆': '骞宠　鍨?,
  '鑲″偟娣峰悎 鈥?40%-60%鑲＄エ': '骞宠　鍨?,
  '闈堟椿鍨嬭偂鍌垫贩鍚?: '闈堟椿鍨?,
  '閫插彇鍨嬭偂鍌垫贩鍚?: '閫插彇鍨?,
  '绌嶆サ鍨嬭偂鍌垫贩鍚?- 鐠扮悆': '绌嶆サ鍨?,
  '浜炴床鑲″偟娣峰悎': '骞宠　鍨?,
  '澶т腑鑿偂鍌垫贩鍚?: '骞宠　鍨?,
  '鐠扮悆鏂拌垐甯傚牬鑲″偟娣峰悎': '骞宠　鍨?,
};
var BALANCED_REGION_MAP = {
  '淇濆畧鍨嬭偂鍌垫贩鍚?: '鐠扮悆',
  '淇濆畧鍨嬭偂鍌垫贩鍚?- 鐠扮悆': '鐠扮悆',
  '鑲″偟娣峰悎 鈥?20%-40%鑲＄エ': '鐠扮悆',
  '骞宠　鍨嬭偂鍌垫贩鍚?: '鐠扮悆',
  '骞宠　鍨嬭偂鍌垫贩鍚?- 鐠扮悆': '鐠扮悆',
  '鑲″偟娣峰悎 鈥?40%-60%鑲＄エ': '鐠扮悆',
  '闈堟椿鍨嬭偂鍌垫贩鍚?: '鐠扮悆',
  '閫插彇鍨嬭偂鍌垫贩鍚?: '鐠扮悆',
  '绌嶆サ鍨嬭偂鍌垫贩鍚?- 鐠扮悆': '鐠扮悆',
  '浜炴床鑲″偟娣峰悎': '浜炴床',
  '澶т腑鑿偂鍌垫贩鍚?: '澶т腑鑿?,
  '鐠扮悆鏂拌垐甯傚牬鑲″偟娣峰悎': '鏂拌垐甯傚牬',
};

function isBalanced(groupCat) {
  if (!groupCat) return false;
  return groupCat.indexOf('鑲″偟娣峰悎') >= 0 || (groupCat.indexOf('娣峰悎') >= 0 && groupCat.indexOf('鍌靛埜') < 0 && groupCat.indexOf('鑲＄エ') < 0);
}
function getBalancedRisk(groupCat) { return BALANCED_RISK_MAP[groupCat] || '鍏朵粬'; }
function getBalancedRegion(groupCat) { return BALANCED_REGION_MAP[groupCat] || '鐠扮悆'; }

// 鈹€鈹€鈹€ Bond Fund Categorization (椤炲瀷 + 鍦板崁) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
var BOND_TYPE_MAP = {
  '鐠扮悆鍌靛埜 - 闈堟椿绛栫暐': '闈堟椿绛栫暐',
  '鍌靛埜 - 闈堟椿绛栫暐': '闈堟椿绛栫暐',
  '鐠扮悆澶氬厓鍖栧偟鍒?: '澶氬厓鍖?,
  '澶氬厓鍖栧偟鍒?: '澶氬厓鍖?,
  '澶氬厓鍖栧偟鍒?- 鐭湡': '澶氬厓鍖?,
  '楂樻敹鐩婂偟鍒?: '楂樻敹鐩?,
  '浜炴床楂樻敹鐩婂偟鍒?: '楂樻敹鐩?,
  '鐠扮悆楂樻敹鐩婂偟鍒?: '楂樻敹鐩?,
  '鐠扮悆楂樻敹鐩婂偟鍒?- 鑻辩灏嶆矕': '楂樻敹鐩?,
  '鐠扮悆浼佹キ鍌靛埜': '浼佹キ',
  '浼佹キ鍌靛埜': '浼佹キ',
  '鐠扮悆鏂拌垐甯傚牬浼佹キ鍌靛埜': '浼佹キ',
  '鏀垮簻鍌靛埜': '鏀垮簻',
  '娆＄礆鍌靛埜': '浼佹キ',
  '鐠扮悆閫氳劰鎺涢墹鍌靛埜 鈥?缇庡厓灏嶆矕': '閫氳劰鎺涢墹',
  '鐠扮悆閫氳劰鎺涢墹鍌靛埜': '閫氳劰鎺涢墹',
  '璨ㄥ梗甯傚牬 - 缇庡厓': '璨ㄥ梗甯傚牬',
  '浜炴床鍌靛埜': '缍滃悎',
  '鐠扮悆鏂拌垐甯傚牬鍌靛埜': '缍滃悎',
  '涓湅鍌靛埜': '缍滃悎',
  '鍌靛埜': '缍滃悎',
  '鍌靛埜 - 鍦ㄥ哺': '缍滃悎',
};
var BOND_REGION_MAP = {
  '鐠扮悆鍌靛埜 - 闈堟椿绛栫暐': '鐠扮悆',
  '鍌靛埜 - 闈堟椿绛栫暐': '鐠扮悆',
  '鐠扮悆澶氬厓鍖栧偟鍒?: '鐠扮悆',
  '澶氬厓鍖栧偟鍒?: '鐠扮悆',
  '澶氬厓鍖栧偟鍒?- 鐭湡': '鐠扮悆',
  '楂樻敹鐩婂偟鍒?: '鐠扮悆',
  '鐠扮悆楂樻敹鐩婂偟鍒?: '鐠扮悆',
  '鐠扮悆楂樻敹鐩婂偟鍒?- 鑻辩灏嶆矕': '鐠扮悆',
  '鐠扮悆浼佹キ鍌靛埜': '鐠扮悆',
  '浼佹キ鍌靛埜': '鐠扮悆',
  '鏀垮簻鍌靛埜': '鐠扮悆',
  '娆＄礆鍌靛埜': '鐠扮悆',
  '鐠扮悆閫氳劰鎺涢墹鍌靛埜 鈥?缇庡厓灏嶆矕': '鐠扮悆',
  '鐠扮悆閫氳劰鎺涢墹鍌靛埜': '鐠扮悆',
  '璨ㄥ梗甯傚牬 - 缇庡厓': '鐠扮悆',
  '浜炴床鍌靛埜': '浜炴床',
  '浜炴床楂樻敹鐩婂偟鍒?: '浜炴床',
  '鐠扮悆鏂拌垐甯傚牬鍌靛埜': '鏂拌垐甯傚牬',
  '鐠扮悆鏂拌垐甯傚牬浼佹キ鍌靛埜': '鏂拌垐甯傚牬',
  '涓湅鍌靛埜': '涓湅',
  '鍌靛埜': '鐠扮悆',
  '鍌靛埜 - 鍦ㄥ哺': '涓湅',
};

function isBond(groupCat) {
  if (!groupCat) return false;
  return (groupCat.indexOf('鍌靛埜') >= 0 || groupCat.indexOf('璨ㄥ梗甯傚牬') >= 0) && groupCat.indexOf('鑲″偟') < 0;
}
function getBondType(groupCat) { return BOND_TYPE_MAP[groupCat] || '鍏朵粬'; }
function getBondRegion(groupCat) { return BOND_REGION_MAP[groupCat] || '鐠扮悆'; }

// 鈹€鈹€鈹€ HTTP helper (fixed encoding) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

  // 鈹€鈹€ JS for dashboard (correct types) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
  console.log('Categories: ' + apiCategories.size + ' API 鈫?' + groupCategories.size + ' consolidated');
  console.log('Exports: funds_export.csv (new column: GroupCategory), funds_export.json, funds_data.js');
  console.log('Dashboard: dashboard.html');
}

updateKB().catch(function(e) { console.error('Fatal:', e); });
