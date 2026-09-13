# Fund Dashboard Data-Pipeline Fix Report

Date: 2026-09-10
Repo: `C:\Users\Administrator\hangseng-kb`

## Root cause

`weekly_update.js` only emitted **25 columns** (indices 0–24) into `funds_data.js`,
while `dashboard.html` reads **30 columns** via:

```js
var FC = { CODE:0, NAME:1, CAT:2, WMC:3, SUB:4, PRICE:5, PDATE:6, CCY:7, RISK:8,
  YTD:9, W1:10, M1:11, M3:12, M6:13, Y1:14, Y2:15, Y3:16, Y5:17, YIELD:18,
  MGT:19, STAR:20, HOUSE:21, GROUP_CAT:22, EQUITY_TYPE:23, REGION_CAT:24,
  BAL_RISK:25, BAL_REGION:26, BOND_TYPE:27, BOND_REGION:28, EQUITY_STYLE:29 };
```

Columns 25–29 (`BAL_RISK`, `BAL_REGION`, `BOND_TYPE`, `BOND_REGION`, `EQUITY_STYLE`)
were `undefined`, so the dashboard fell back to its `|| '其他'` / `|| '環球'` defaults —
producing a single "其他"/"環球" bar on the Balanced tab and empty Bond/Equity-style charts.

## Changes

All in `weekly_update.js`:

1. Added a classification block after `toGroupCategory()`:
   - `isBalanced(gc)` — contains `股債混合`, or contains `混合` but not `債券`/`股票`.
   - `isBond(gc)` — contains `債券` or `貨幣市場`, but not `股債`.
   - `getBalancedRisk` / `getBalancedRegion` — explicit lookup maps (12/3 known categories)
     + keyword fallbacks (保守/平衡/靈活/進取/積極; 亞洲/大中華/新興市場, default 環球).
   - `getBondType` / `getBondRegion` — explicit lookup maps (23/6 known categories)
     + keyword fallbacks (高收益/企業/次級/政府/多元化/靈活/貨幣市場/通脹掛鉤/超短期→其他; 中國/亞洲/新興市場, default 環球).
   - `getEquityStyle` — keyword rules (大型增長型→大型增長, 大型價值型→大型價值,
     大型均衡型→大型, 中小型→中小型, 中型→中型, 小型→小型, 靈活型→靈活型, 股票收益→收益型;
     fallback 綜合 for 股票/行業 without 環球/新興市場).
2. Populated `balancedRisk/balancedRegion/bondType/bondRegion/equityStyle` on each fund object.
3. Emitted the 5 new columns in `funds_data.js` (indices 25–29), `funds_export.csv`
   (5 new trailing columns), and `funds_export.json` (5 new fields).
4. Added a backward-compatible `HASE_SKIP_GIT=1` guard to the auto commit/push step
   (cron does not set it, so cron behaviour is unchanged).

## Verification — match rate vs last-known-good (HEAD~2:funds_data.js)

- New `funds_data.js`: **1044 funds × 30 columns**, 0 garbled (`\uFFFD`) chars.
- Old `HEAD~2:funds_data.js`: **1037 funds × 30 columns**.
- Matched by `fundCode` (index 0): **1035 common funds**.
- Compared columns 25–29 (5 cells × 1035 = 5175 cells).

| Column | Matches | Mismatches | Rate |
|--------|---------|------------|------|
| 25 BAL_RISK    | 1034 | 1 | 99.90% |
| 26 BAL_REGION  | 1035 | 0 | 100% |
| 27 BOND_TYPE   | 1035 | 0 | 100% |
| 28 BOND_REGION | 1035 | 0 | 100% |
| 29 EQUITY_STYLE| 1034 | 1 | 99.90% |
| **Total** | **5173** | **2** | **99.96%** |

The 2 mismatches are a single fund (**U42970**) that the data provider re-categorised
between snapshots:

- OLD groupCat `歐元積極型股債混合 - 環球` → (積極型, 環球, style="")
- NEW groupCat `歐元靈活型股債混合 - 環球` → (靈活型, 環球, style="靈活型")

The new output is correct for the new category name (the `- 環球` suffix category is new,
handled by the keyword fallback). Not a bug. Match rate **99.96% ≥ 95% target** ✅.

## Dashboard rendering review (`renderBarChart` / `buildChartHtml`)

Reviewed lines 830–945. **No clear rendering bug found.** The negative-bar rendering uses
`margin-left` on `.bar-fill` inside `.bar-track`, but `.bar-track` is `position:relative`
(block, *not* flex — flex is on `.bar-row`), so `width:X% + margin-left:(100-X)%` correctly
draws a right-aligned negative bar. Only cosmetic note: `.bar-fill{min-width:2px}` can make
near-zero bars 1–2px wide, clipped by `overflow:hidden`. No fix applied.

## Verification commands

```powershell
cd C:\Users\Administrator\hangseng-kb
node --check weekly_update.js
$env:HASE_SKIP_GIT='1'; node weekly_update.js   # regenerate, skip auto-push

# compare new vs HEAD~2 (cols 25-29 by fundCode)
python -c "import subprocess,json,re; ..."      # see match-rate script above

# garbled check
python -c "print(open('funds_data.js',encoding='utf-8').read().count('\ufffd'))"  # -> 0
```

## Git

- Commit `89af581` — `fix: restore 30-col fund data (balanced/bond/equity style)`
- Pushed to `origin/main` (`800df3d..89af581`).
- Left untracked (not committed): `_old_update_funds.js`, `_old_update_funds_u8.js`,
  `_reference_update_funds.js` (investigation artifacts).

## Remaining uncertainty

- Keyword fallbacks for *future* category names are best-effort; only categories present in
  HEAD~2 are ground-truth-verified. New categories will be classified by keyword rules and
  should be spot-checked if the provider adds new fund types.
- `EQUITY_STYLE` intentionally follows the historical keyword behaviour (not strictly
  "equity-only"): balanced funds whose groupCategory contains `靈活型` or `股票` also get a
  style value (e.g. `靈活型股債混合` → `靈活型`). This matches HEAD~2 exactly.
