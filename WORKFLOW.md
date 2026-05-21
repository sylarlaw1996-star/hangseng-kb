# 恒生基金知識庫 — 更新工作流

> 最後更新：2026-05-19

## 整體架構

```
恒生 API (rbwm-api.hsbc.com.hk) ──→ update_funds.js ──→ funds_export.json
                                   │                  ├── funds_export.csv
                                   │                  ├── funds_data.js
                                   │                  └── pdfs/{YYYYMM}/*.pdf
                                   │
                                   └── dashboard.html ←── funds_data.js
```

## 執行更新

打開終端機，執行：

```bash
cd C:\Users\Administrator\hangseng-kb
node update_funds.js
```

這個腳本會自動完成以下 5 個步驟：

### Step 1 — 取得基金類別
- 調用 `GET /Categories?type=S&sectorGroup=B|F|E|O`
- 掃描 4 個大類下的所有 133+ 個子類別

### Step 2 — 取得基金數據
- 對每個子類別調用 `GET /Funds?fundCategory=<Id>`
- 用 fund code 去重，確保 1019+ 隻基金不重複
- 收集 PriceDate、YTD/1W/1M/3M/6M/1Y 回報、WMC 狀態等完整欄位

### Step 3 — 下載新 PDF
- 對每隻有 `DocFS_FilePath` 的基金下載資料單張
- 按 `{YYYYMM}/{YYYYMM} {FundCode}.pdf` 命名歸檔
- 已存在的 PDF 自動跳過，只下載新的

### Step 4 — 匯出 3 種格式
| 檔案 | 用途 | 編碼 |
|------|------|------|
| `funds_export.json` | 完整數據，供程式處理 | UTF-8 |
| `funds_export.csv` | Excel 可直接打開 | UTF-8 BOM |
| `funds_data.js` | Dashboard 載入的數據 | UTF-8 |

### Step 5 — 輸出摘要
顯示基金總數、WMC 數量、不接受認購數量、新下載 PDF 數量。

## 排程自動化建議

如果要每日自動更新，可以設定 cron job：

```bash
# 每天早上 8:00 執行更新
0 8 * * * cd C:\Users\Administrator\hangseng-kb && node update_funds.js
```

或者透過 OpenClaw 的 cron 工具設定定時任務。

## 注意事項

### 資料來源限制
- API 來自 `rbwm-api.hsbc.com.hk`（HSBC 零售財富管理 API）
- 部分欄位（如基金規模、星級評等）只在交易日更新
- PDF 資料單張的日期從 URL 中提取（`_20260301.pdf` → `202603`）

### 已知限制
- API 不需登入驗證，但可能隨時變更
- 基金價格為前一交易日收市價
- 部分基金的 PDF 為空（返回非 PDF 內容）

### 手動修正
- CSV 中文顯示異常：用 UTF-8 BOM 編碼即可
- 如需手動補充基金資料，直接編輯 `funds_export.json`，然後重新執行 `update_funds.js` 中的 Step 4 即可

## 架構圖

```
┌────────────────────────────────────────────────┐
│                恒生 RBWM API                    │
│  rbwm-api.hsbc.com.hk/pws-hk-hase-fsm-papi-   │
│          prod-proxy/v1/                        │
├────────────────────────────────────────────────┤
│  GET /Categories?type=S&sectorGroup=B/F/E/O    │
│  → 回傳 133 個投資市場組別及其一年平均回報     │
├────────────────────────────────────────────────┤
│  GET /Funds?fundCategory={CategoryId}           │
│  → 回傳該組別下所有基金之詳細資訊              │
├────────────────────────────────────────────────┤
│  每隻基金包含：                                 │
│  hsFundCode, FundName, Price, PriceDate,        │
│  Return1Week~5Y, IsWMC, AvailableForSubscribe,  │
│  DocFS_FilePath(PDF連結), 風險等級, 星級等      │
└────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────┐
│              update_funds.js                    │
├────────────────────────────────────────────────┤
│  ① 掃描 133 個類別                             │
│  ② 抓取全部基金（去重）                        │
│  ③ 下載缺失的 PDF 資料單張                    │
│  ④ 輸出: .json / .csv / .js                   │
└────────────────────────────────────────────────┘
         │
         ▼
┌───────────┬──────────────┬─────────────┐
│ .json     │ .csv         │ funds_data  │
│ 完整數據   │ Excel匯出    │ .js         │
│           │              │ Dashboard   │
└───────────┴──────────────┴─────┬───────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │ dashboard.html │
                        │ 基金列表頁籤    │
                        │ 可排序·可篩選   │
                        └────────────────┘
```
