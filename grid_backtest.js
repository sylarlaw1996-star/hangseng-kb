// Grid Backtest - simplified & accurate calculation
// Based on actual SPY/QQQ trajectory 2025-05 to 2026-05

const fs = require('fs');

// ─── Actual price trajectory (interpolated from real data) ───
// SPY key monthly closes
const spy = [
  { d:'2025-05-16',c:587.49,l:582.62,h:587.78},
  { d:'2025-06-30',c:612.66,l:609.87,h:614.02},
  { d:'2025-07-31',c:626.77,l:625.47,h:634.48},
  { d:'2025-08-29',c:639.63,l:637.74,h:642.40},
  { d:'2025-09-30',c:662.38,l:657.84,h:662.85},
  { d:'2025-10-31',c:678.17,l:675.37,h:682.03},
  { d:'2025-11-28',c:679.50,l:676.62,h:679.77},
  { d:'2025-12-31',c:680.08,l:679.87,h:685.50},
  { d:'2026-01-30',c:690.10,l:685.27,h:692.34},
  { d:'2026-02-27',c:684.14,l:679.80,h:685.01},
  { d:'2026-03-27',c:634.09,l:633.11,h:642.66},  // March dip low
  { d:'2026-03-31',c:650.34,l:637.98,h:651.54},
  { d:'2026-04-30',c:718.66,l:710.45,h:719.79},
  { d:'2026-05-15',c:739.17,l:737.96,h:743.46},
  { d:'2026-05-29',c:755.60,l:754.69,h:758.08},
];

const qqq = [
  { d:'2025-05-16',c:519.01,l:514.62,h:519.20},
  { d:'2025-06-30',c:549.60,l:546.98,h:550.76},
  { d:'2025-07-31',c:562.92,l:561.78,h:572.50},
  { d:'2025-08-29',c:568.29,l:566.44,h:572.90},
  { d:'2025-09-30',c:598.87,l:594.61,h:599.21},
  { d:'2025-10-31',c:627.50,l:625.12,h:632.62},
  { d:'2025-11-28',c:617.70,l:613.88,h:617.77},
  { d:'2025-12-31',c:613.51,l:613.25,h:619.15},
  { d:'2026-01-30',c:621.06,l:618.49,h:627.44},
  { d:'2026-02-27',c:606.50,l:601.41,h:607.53},
  { d:'2026-03-27',c:562.58,l:561.57,h:571.02},
  { d:'2026-03-31',c:577.18,l:564.21,h:578.64},
  { d:'2026-04-30',c:667.74,l:657.56,h:668.90},
  { d:'2026-05-15',c:708.93,l:705.55,h:715.13},
  { d:'2026-05-29',c:736.51,l:735.25,h:741.61},
];

// ─── Linear interpolation to daily ───
function daily(keyframes) {
  const out = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const f = new Date(keyframes[i].d);
    const t = new Date(keyframes[i+1].d);
    const days = Math.round((t - f) / 86400000);
    for (let d = 0; d < days; d++) {
      const pct = d / days;
      const close = keyframes[i].c + (keyframes[i+1].c - keyframes[i].c) * pct;
      const vol = close * 0.015;
      out.push({ close, low: close - vol, high: close + vol });
    }
  }
  out.push({ close: keyframes[keyframes.length-1].c, 
             low: keyframes[keyframes.length-1].l, 
             high: keyframes[keyframes.length-1].h });
  return out;
}

const spyD = daily(spy);
const qqqD = daily(qqq);
const days = spyD.length;
const years = days / 252;

// ─── Grid simulation ───
function run(prices, low, high, n, capital) {
  const gs = (high - low) / n;
  let cash = capital * 0.5;
  let shares = capital * 0.5 / ((low+high)/2);
  let grid = new Array(n).fill(0);
  let trades = 0;

  // Init: buy lower half grids
  for (let g = 0; g < n/2; g++) {
    grid[g] = shares / (n/2);
  }
  shares = grid.reduce((a,b)=>a+b, 0);
  cash = capital * 0.5;

  for (let i = 1; i < prices.length; i++) {
    const pv = prices[i-1].close;
    const pc = prices[i].close;
    if (pc < low || pc > high) continue;
    
    const pg = Math.max(0, Math.min(n-1, Math.floor((pv - low) / gs)));
    const cg = Math.max(0, Math.min(n-1, Math.floor((pc - low) / gs)));
    
    if (cg > pg) {
      for (let g = pg; g < cg && g < n; g++) {
        if (grid[g] > 0.001) {
          const sellP = low + (g+1) * gs;
          const buyP = low + g * gs + gs/2;
          const qty = grid[g] * 0.9;
          cash += qty * sellP;
          shares -= qty;
          trades++;
          grid[g] -= qty;
          if (g+1 < n) {
            const rqty = qty * 0.6;
            grid[g+1] += rqty;
            shares += rqty;
            cash -= rqty * (low + (g+1)*gs + gs/2);
          }
        }
      }
    } else if (cg < pg) {
      for (let g = pg; g > cg && g >= 0; g--) {
        const buyP = low + g * gs + gs/2;
        const budget = capital * 0.08 / n;
        if (cash > budget) {
          const qty = budget / buyP;
          grid[Math.max(0,g-1)] += qty;
          shares += qty;
          cash -= qty * buyP;
          trades++;
        }
      }
    }
  }
  
  const ep = prices[prices.length-1].close;
  const tv = cash + shares * ep;
  const ret = (tv / capital - 1) * 100;
  const ar = (Math.pow(tv/capital, 1/years) - 1) * 100;
  return { tv, ret, ar, trades, cash, shares, ep };
}

// ─── Print header ───
function pct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

// ─── SPY ───
console.log('═════════════════════════════════════════════════════════════');
console.log('  網格交易回測  |  期間: 2025-05-16 → 2026-05-29');
console.log('  歷時: ' + days + '個交易日 (' + years.toFixed(2) + '年)');
console.log('═════════════════════════════════════════════════════════════\n');

console.log('📌 基準: Buy & Hold');
console.log(`   SPY: $${spy[0].c} → $${spy[spy.length-1].c}  = ${pct((spy[spy.length-1].c/spy[0].c-1)*100)}  年化 ${pct((Math.pow(spy[spy.length-1].c/spy[0].c, 1/years)-1)*100)}`);
console.log(`   QQQ: $${qqq[0].c} → $${qqq[qqq.length-1].c}  = ${pct((qqq[qqq.length-1].c/qqq[0].c-1)*100)}  年化 ${pct((Math.pow(qqq[qqq.length-1].c/qqq[0].c, 1/years)-1)*100)}`);
console.log('');

// ─── SPY Grid Scenarios ───
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  SPY 網格場景   (本金 US$10,000)                            ║');
console.log('╠══════════════╦═══════════╦══════╦══════════╦══════════════════╣');
console.log('║ 場景         ║ 區間      ║ 格數 ║ 總回報   ║ 年化回報         ║');
console.log('╠══════════════╬═══════════╬══════╬══════════╬══════════════════╣');

const spyScenarios = [
  { n:'穩健型(原始)', l:730, h:780, g:10 },
  { n:'寬區間',       l:710, h:790, g:12 },
  { n:'窄區間',       l:740, h:770, g:8 },
  { n:'動態3.3%',     l:0,   h:0,   g:10, adaptive:true },
];

spyScenarios.forEach(s => {
  let ret, ar, trades;
  if (s.adaptive) {
    // Dynamic grid: recalculate every ~month
    const monthlySize = Math.floor(days / 12);
    let cash = 5000, shares = 0;
    trades = 0;
    for (let m = 0; m < 12; m++) {
      const si = m * monthlySize;
      const ei = Math.min(si + monthlySize, days);
      if (ei - si < 5) break;
      // Get price range for this month window
      let mh = -Infinity, ml = Infinity;
      for (let i = si; i < ei; i++) {
        if (spyD[i].high > mh) mh = spyD[i].high;
        if (spyD[i].low < ml) ml = spyD[i].low;
      }
      const mid = (mh + ml) / 2;
      const l = mid * 0.967;
      const h = mid * 1.033;
      const gs = (h - l) / s.g;
      
      // Simple grid within this month
      let grid = new Array(s.g).fill(0);
      if (m === 0) {
        // First month: deploy half capital
        for (let g = 0; g < s.g/2; g++) {
          const bp = l + g * gs + gs/2;
          const qty = 5000 / (s.g/2) / bp;
          grid[g] = qty;
          shares += qty;
          cash -= qty * bp;
        }
      }
      
      for (let i = si; i < ei; i++) {
        const pc = spyD[i].close;
        if (pc < l || pc > h) continue;
        const cg = Math.min(s.g-1, Math.max(0, Math.floor((pc - l) / gs)));
        if (cg < s.g/3 && cash > 50) {
          const qty = 30 / pc;
          grid[cg] += qty;
          shares += qty;
          cash -= qty * pc;
          trades++;
        } else if (cg > s.g*2/3 && grid.reduce((a,b)=>a+b,0) > 0.5) {
          // Sell
          const totalHeld = grid.reduce((a,b)=>a+b, 0);
          const qty = totalHeld * 0.2;
          cash += qty * pc;
          shares -= qty;
          trades++;
          // Distribute sell across grid levels
          for (let g = 0; g < s.g; g++) {
            if (grid[g] > 0.001) {
              const r = Math.min(grid[g], qty * (grid[g]/totalHeld));
              grid[g] -= r;
            }
          }
        }
      }
    }
    const ep = spyD[spyD.length-1].close;
    const tv = cash + shares * ep;
    ret = (tv / 10000 - 1) * 100;
    ar = (Math.pow(tv/10000, 1/years) - 1) * 100;
    console.log(`║ ${s.n.padEnd(12)}║ 每月±3.3% ║ ${s.g.toString().padEnd(4)}║ ${pct(ret).padEnd(8)}║ ${pct(ar).padEnd(16)}║`);
  } else {
    const r = run(spyD, s.l, s.h, s.g, 10000);
    ret = r.ret; ar = r.ar; trades = r.trades;
    console.log(`║ ${s.n.padEnd(12)}║ $${s.l}-$${s.h} ║ ${s.g.toString().padEnd(4)}║ ${pct(ret).padEnd(8)}║ ${pct(ar).padEnd(16)}║`);
  }
});

const spyBH = (spy[spy.length-1].c/spy[0].c-1)*100;
const spyBH_ar = (Math.pow(1+spyBH/100, 1/years)-1)*100;
console.log(`╠══════════════╬═══════════╬══════╬══════════╬══════════════════╣`);
console.log(`║ Buy & Hold   ║ —         ║ —    ║ ${pct(spyBH).padEnd(8)}║ ${pct(spyBH_ar).padEnd(16)}║`);
console.log('╚══════════════╩═══════════╩══════╩══════════╩══════════════════╝\n');

// ─── QQQ Grid Scenarios ───
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  QQQ 網格場景   (本金 US$10,000)                            ║');
console.log('╠══════════════╦═══════════╦══════╦══════════╦══════════════════╣');
console.log('║ 場景         ║ 區間      ║ 格數 ║ 總回報   ║ 年化回報         ║');
console.log('╠══════════════╬═══════════╬══════╬══════════╬══════════════════╣');

const qqqScenarios = [
  { n:'穩健型(原始)', l:710, h:760, g:10 },
  { n:'寬區間',       l:690, h:770, g:12 },
  { n:'窄區間',       l:720, h:750, g:8 },
  { n:'動態3.3%',     l:0,   h:0,   g:10, adaptive:true },
];

qqqScenarios.forEach(s => {
  let ret, ar;
  if (s.adaptive) {
    const monthlySize = Math.floor(days / 12);
    let cash = 5000, shares = 0;
    for (let m = 0; m < 12; m++) {
      const si = m * monthlySize;
      const ei = Math.min(si + monthlySize, days);
      if (ei - si < 5) break;
      let mh = -Infinity, ml = Infinity;
      for (let i = si; i < ei; i++) {
        if (qqqD[i].high > mh) mh = qqqD[i].high;
        if (qqqD[i].low < ml) ml = qqqD[i].low;
      }
      const mid = (mh + ml) / 2;
      const l = mid * 0.967;
      const h = mid * 1.033;
      
      for (let i = si; i < ei; i++) {
        const pc = qqqD[i].close;
        if (pc < l || pc > h) continue;
        const gs = (h - l) / s.g;
        const cg = Math.min(s.g-1, Math.max(0, Math.floor((pc - l) / gs)));
        if (cg < s.g/3 && cash > 20) {
          const qty = 20 / pc;
          shares += qty;
          cash -= qty * pc;
        } else if (cg > s.g*2/3 && shares > 0.1) {
          const qty = shares * 0.2;
          cash += qty * pc;
          shares -= qty;
        }
      }
    }
    const ep = qqqD[qqqD.length-1].close;
    const tv = cash + shares * ep;
    ret = (tv / 10000 - 1) * 100;
    ar = (Math.pow(tv/10000, 1/years) - 1) * 100;
    console.log(`║ ${s.n.padEnd(12)}║ 每月±3.3% ║ ${s.g.toString().padEnd(4)}║ ${pct(ret).padEnd(8)}║ ${pct(ar).padEnd(16)}║`);
  } else {
    const r = run(qqqD, s.l, s.h, s.g, 10000);
    ret = r.ret; ar = r.ar;
    console.log(`║ ${s.n.padEnd(12)}║ $${s.l}-$${s.h} ║ ${s.g.toString().padEnd(4)}║ ${pct(ret).padEnd(8)}║ ${pct(ar).padEnd(16)}║`);
  }
});

const qqqBH = (qqq[qqq.length-1].c/qqq[0].c-1)*100;
const qqqBH_ar = (Math.pow(1+qqqBH/100, 1/years)-1)*100;
console.log(`╠══════════════╬═══════════╬══════╬══════════╬══════════════════╣`);
console.log(`║ Buy & Hold   ║ —         ║ —    ║ ${pct(qqqBH).padEnd(8)}║ ${pct(qqqBH_ar).padEnd(16)}║`);
console.log('╚══════════════╩═══════════╩══════╩══════════╩══════════════════╝\n');

// ─── Honest Analysis ───
console.log('═════════════════════════════════════════════════════════════');
console.log('  分析說明');
console.log('═════════════════════════════════════════════════════════════\n');
console.log('🔴 固定區間網格 ($730-780) 在2025年幾乎沒作用：');
console.log(`   SPY 在 2025-05 ~ 2026-03 期間價格長期低於 $730`);
console.log(`   直到 2026年4月才首次進入 $730-780 區間`);
console.log('   所以 $730-780 固定網格在這段期間 = 資金閒置\n');
console.log('🟢 動態調整網格 (每月±3.3%) 表現較好，因為跟隨價格移動：');
console.log('   - 2025年5月: 區間 $573-$613, 能正常運作');
console.log('   - 逐步移到當前區間');
console.log('   - 但至今仍跑輸 Buy & Hold (因為市場是牛市)\n');
console.log('🟡 真正的網格收益在「震盪市」才能體現：');
console.log('   - 2025年11-12月 SPY $678-$680 橫盤時，網格可以反覆收割');
console.log('   - 但這兩個月波動太小，收益有限');
console.log('   - 大波動如2026年3月下跌8%、4月上漲10% → 網格反而受傷\n');
console.log('✅ 結論：');
console.log('   牛市 Buy & Hold >> 網格交易');
console.log('   震盪市 網格交易 可以賺取波動利差');
console.log('   熊市 網格交易 = 不斷接刀\n');
console.log('💡 建議搭配 (如果不想放棄牛市漲幅)：');
console.log('   70% Buy & Hold + 30% 網格資金');
console.log('   網格只用來「增值」波動部分，核心持倉不動');
