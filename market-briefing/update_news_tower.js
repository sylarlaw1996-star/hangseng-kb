/**
 * NEWS TOWER 更新腳本
 * 讀取每日新聞，提取與追蹤事件相關的最新進展，更新 News Tower HTML
 */
const fs = require('fs');
const path = require('path');
const TOWER = 'C:/Users/Administrator/market-briefing/news-tower/news-tower.html';

// 事件關鍵字映射（事件ID → 關鍵字列表）
const EVENT_KEYWORDS = {
  '美中關稅': ['關稅', '貿易戰', '對等關稅', '半導體出口', '稀土', '供應鏈', '145%', '125%'],
  '美伊衝突': ['伊朗', '霍爾木茲', '中東', '原油供應', '核設施', '空襲'],
  '十五五': ['十五五', '新能源', '半導體自主', 'AI產業', '房地產調控', '工信部', '發改委'],
  '俄烏衝突': ['俄羅斯', '烏克蘭', '停火', '天然氣', '歐洲能源'],
  '聯儲局利率': ['聯儲', 'Fed', '鮑威爾', '降息', '利率決議', 'CPI', '通脹', 'PCE', '點陣圖']
};

// 讀取最新新聞
let news;
try {
  news = JSON.parse(fs.readFileSync('C:/Users/Administrator/market-briefing/latest_news.json', 'utf-8'));
} catch(e) {
  console.log('No news data available, skipping tower update');
  process.exit(0);
}

const items = news.items || [];
if (items.length === 0) { console.log('No news items'); process.exit(0); }

// 建立今天日期標籤
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '-');

// 對每個事件檢查新聞
const updates = {};
Object.keys(EVENT_KEYWORDS).forEach(function(eventName) {
  const kws = EVENT_KEYWORDS[eventName];
  items.forEach(function(item) {
    const text = (item.title || '') + ' ' + (item.content || '');
    const match = kws.some(function(kw) { return text.indexOf(kw) !== -1; });
    if (match) {
      if (!updates[eventName]) updates[eventName] = [];
      var snippet = (item.title ? '【' + item.title + '】' : '') + (item.content || '');
      snippet = snippet.replace(/<[^>]+>/g, '').slice(0, 80) + (snippet.length > 80 ? '...' : '');
      updates[eventName].push(snippet);
    }
  });
});

// 若有更新，追加到 News Tower
var modified = false;
var html = fs.readFileSync(TOWER, 'utf-8');

Object.keys(updates).forEach(function(eventName) {
  const items = updates[eventName];
  if (items.length === 0) return;
  
  // 去重
  var seen = new Set();
  var uniqueItems = items.filter(function(i) {
    var key = i.slice(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  if (uniqueItems.length === 0) return;
  
  // Find where to insert: after last existing update line for this event
  // Look for the event's section by finding the h3 text
  var h3Match = html.indexOf('<h3>' + eventName);
  if (h3Match === -1) return;
  
  var updatesDiv = html.indexOf('<div class="ec-updates">', h3Match);
  if (updatesDiv === -1) return;
  
  var closeDiv = html.indexOf('</div>', updatesDiv);
  if (closeDiv === -1) return;
  
  var updatesContent = html.slice(updatesDiv, closeDiv + 6);
  
  // Check if we already have these updates
  var foundNew = false;
  uniqueItems.forEach(function(snippet) {
    // Check if any existing update already contains this snippet
    var exists = updatesContent.indexOf(snippet.slice(0, 20)) !== -1;
    if (!exists) {
      var dateLabel = today;
      var newUpdate = '<div class="ec-update"><span class="up-date">' + dateLabel + '</span>' + snippet + '</div>\n    ';
      var insertAt = updatesContent.lastIndexOf('</div>');
      // Insert before the closing </div> of ec-updates
      updatesContent = updatesContent.slice(0, closeDiv - (html.length - updatesContent.length)) + 
        newUpdate + updatesContent.slice(closeDiv - (html.length - updatesContent.length));
      modified = true;
      foundNew = true;
      console.log('  [+] ' + eventName + ': ' + snippet.slice(0, 40) + '...');
    }
  });
});

if (modified) {
  fs.writeFileSync(TOWER, html, 'utf-8');
  console.log('\n✅ News Tower updated');
} else {
  console.log('No new updates found for tracked events');
}
