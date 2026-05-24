# 市場簡報系統 · WORKFLOW

> V2.1 · 2026-05-25（加入口頭匯報話術）

## 目錄結構

```
market-briefing/
├── briefing.html              ← 每日市場簡報 Dashboard（主頁面）
├── fetch_market.js            ← 市場數據擷取（32個標的）
├── fetch_news.js              ← 財經新聞擷取（華爾街見聞 + 財聯社）
├── fetch_competitor_rates.js  ← 競品利率數據（V2 新增）
├── generate_briefing.js       ← 生成每日文字簡報（含產品策略 + 競品對比）
├── push_daily.ps1             ← 推送腳本（個人版）
├── push_daily_group.ps1       ← 推送腳本（WhatsApp 群組版）
├── latest_data.json / .js     ← 原始市場數據
├── latest_news.json / .txt    ← 新聞數據
├── competitor_rates.json      ← 競品利率數據（V2 新增）
├── latest_briefing.txt        ← 生成的最終簡報
├── latest_talking_points.txt  ← 早會口頭匯報話術（V2.1 新增）
└── news-tower/
    └── news-tower.html        ← 重大事件追蹤子頁面
```

## 自動化 Pipeline（Windows Task Scheduler）

**排程任務：** `Market_Briefing_Fetch` → 每日 07:00（港股開市前）
**實際執行順序：**

```
push_daily_group.ps1
  ├── [1/5] fetch_market.js           ← Yahoo Finance 市場數據
  ├── [2/5] fetch_news.js             ← 華爾街見聞 + 財聯社
  ├── [3/5] fetch_competitor_rates.js ← 讀取競品利率（V2）
  ├── [4/5] generate_briefing.js      ← 生成完整簡報 + 複製到 GitHub
  └── [5/5] WhatsApp 推送 + Git Push
```

**競品利率更新（V2 新增）：**
- OpenClaw Cron Job: `更新競品利率數據` → 週一至週五 06:50
- 透過 Gemini Web Search 自動搜索最新利率並更新 `competitor_rates.json`
- 內容包括：HKD/USD 定存利率、P Rate、HIBOR、開戶優惠

## 簡報涵蓋範圍

### 📊 市場數據（Yahoo Finance）
- 美股 4 個 + 港股 3 個 + A股 3 個
- 亞太 5 個 + 歐洲 4 個 = 19 大指數
- 期貨：黃金、白銀、銅、WTI/布倫特原油
- 外匯：USD 8 個主要貨幣對

### 🏦 競品利率對比（Gemini Search → V2 新增）
- HKD 定存利率：恆生 vs 匯豐 vs 中銀 vs 渣打
- USD 定存利率：匯豐等
- 最優惠利率 P Rate（細P/大P）
- 1M HIBOR 報價
- 各銀行開戶優惠摘要

### 🎯 產品策略指引
- 風險等級 3/4/5 基金推薦（從 1019 基金庫選取）
- ELI 結構性產品掛鈎建議
- 外匯交易操作建議
- 按市況動態調整（牛市/熊市）

### 📢 口頭匯報話術（V2.1 新增）
- 每天早上自動生成「早會三分鐘口頭匯報」提示卡
- 結構：開場定調 → 三個關鍵數字 → 產品策略一句 → 結尾過渡
- 另附「客戶一對一版本」，可直接複製到對話
- 輸出：`latest_talking_points.txt`
- 在 Dashboard（briefing.html）上部設有可折疊區塊，點擊展開即看

## 競品利率更新方式

### 方法一：自動（建議）
OpenClaw Cron Job 每週一至五 06:50 自動執行 Gemini Web Search
→ 更新 `competitor_rates.json`

### 方法二：手動
```bash
cd C:\Users\Administrator\market-briefing
node fetch_competitor_rates.js
```
然後手動編輯 `competitor_rates.json` 或等待下一次自動更新。

## 手動推送簡報

```bash
cd C:\Users\Administrator\market-briefing
.\push_daily_group.ps1    # 推送到 WhatsApp 群組 + GitHub
.\push_daily.ps1          # 推送到個人 WhatsApp
```

## 競品利率 JSON 結構

```json
{
  "lastUpdated": "2026-05-24",
  "timeDepositRates": {
    "hkd": { "hangseng": { "rates": {"3M": 2.20, "6M": 2.00} } },
    "usd": { ... }
  },
  "mortgageRates": {
    "primeRates": { "hangseng": {"pRate": 5.00} },
    "hibor": { "1M": 2.60 }
  },
  "accountPromotions": { ... }
}
```

## 投資建議邏輯

- 新客戶（未建倉）：推薦外幣定存入門 + SimplyFund 月供降低風險
- 持倉客戶：保本投資存款鎖定回報 / ELI 追求高收益
- 黃金/原油：根據價格走勢動態調整建議

## V3 計劃（待定）
- 接入基金數據（已完成，從 hangseng-kb 取 FUNDS_DATA）
- AI 生成更多元的每日摘要
- 個別標的深度分析
- 客戶持倉比對
- 競品利率自動圖表化
