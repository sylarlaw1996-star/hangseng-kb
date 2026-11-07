import subprocess, json, sys
from collections import defaultdict
import statistics
sys.stdout.reconfigure(encoding='utf-8')

def load_commit(commit):
    p = subprocess.run(['git','show', f'{commit}:funds_export.json'],
                       capture_output=True, cwd=r'C:\Users\Administrator\hangseng-kb')
    raw = p.stdout
    if raw.startswith(b'\xef\xbb\xbf'):
        raw = raw[3:]
    return json.loads(raw.decode('utf-8', errors='replace'), strict=False)

before = load_commit('784726d')
after  = load_commit('5545de3')
b = {f['fundCode']: f for f in before}
a = {f['fundCode']: f for f in after}

# 細分分類：用 groupCategory（合併後組別），沒有的退回 categoryName
def cat(f):
    return f.get('groupCategory') or f.get('categoryName') or '未分類'

rows = []
for code in set(b) & set(a):
    pb = b[code].get('price'); pa = a[code].get('price')
    if pb and pa:
        rows.append({
            'name': a[code].get('fundName',''),
            'risk': a[code].get('riskLevel'),
            'cat': cat(a[code]),
            'ret': (pa-pb)/pb*100
        })

# 按分類聚合
cats = defaultdict(list)
for x in rows:
    cats[x['cat']].append(x['ret'])

agg = []
for c, rets in cats.items():
    agg.append({
        'cat': c,
        'n': len(rets),
        'avg': statistics.mean(rets),
        'med': statistics.median(rets),
        'up': sum(1 for r in rets if r>0)/len(rets)*100,
        'best': max(rets),
        'worst': min(rets),
    })
agg.sort(key=lambda x: -x['avg'])

print(f'基金細分分類共 {len(agg)} 類，期間 10/29→11/05\n')
print('========== 分類平均回報排行榜（全部） ==========')
for i,x in enumerate(agg,1):
    print(f'{i:>2}. {x["avg"]:+6.2f}%  ({x["n"]:>3}檔, 中位{x["med"]:+.2f}%, 上漲{x["up"]:.0f}%)  {x["cat"]}')
    print(f'       最好 {x["best"]:+.2f}% / 最差 {x["worst"]:+.2f}%')
