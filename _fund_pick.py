# -*- coding: utf-8 -*-
import json, sys

with open(r'C:\Users\Administrator\hangseng-kb\funds_export.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

subs = [d for d in data if d.get('canSubscribe')]

def show(regs, label, n=12):
    print('=' * 25, label, '=' * 25)
    arr = [d for d in subs if d.get('regionCategory') in regs]
    def sk(d):
        try:
            st = float(d.get('starRating') or 0)
        except Exception:
            st = 0
        try:
            r1 = float(d.get('return1Y') or -999)
        except Exception:
            r1 = -999
        return (st, r1)
    arr.sort(key=sk, reverse=True)
    print('count:', len(arr))
    for d in arr[:n]:
        pdf = 'Y' if d.get('pdfFs') else 'N'
        print(d.get('fundName'), '|', d.get('fundHouse'), '|', d.get('categoryName'),
              '| WMC=', d.get('isWMC'), '| R', d.get('riskLevel'), '|', d.get('currency'),
              '| YTD=', d.get('returnYTD'), '1Y=', d.get('return1Y'), '3Y=', d.get('return3Y'),
              '| star=', d.get('starRating'), '| fee=', d.get('managementFee'),
              'load=', d.get('frontLoad'), '| pdf=', pdf)

show(['中國股票', '大中華股票', '大中華股債混合', '中國債券'], 'CHINA')
show(['美國股票'], 'US EQUITY')
show(['環球股票'], 'GLOBAL EQUITY')
show(['亞洲股票', '亞太區股票'], 'ASIA EQUITY')
