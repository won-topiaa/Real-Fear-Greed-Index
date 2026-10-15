"""4단계: 신호 규칙. v2 지수 위에서 매수(BUY)·위험(RISK) 규칙 후보를 4개 시장에서 비교한다.

심리(Fear)가 필요한 규칙은 미국(NDX·SPX)에서만, 가격만 쓰는 규칙은 나스닥 종합·닛케이까지.
지표: 신호일 평균 60·120일 선행 로그수익률, 120일 승률, 60일 최대 낙폭 평균, 연간 신호일 수, 사건 수(연속 신호는 1건).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L
from r02_proxy import components, sfg
from r06_composite import SFG_COLS, blend, price_p

V2_P = (20, 20, 60, 756, 0.1, 0.1, 0.8)
V1_P = (60, 50, 20, 252, 0.5, 0.3, 0.2)


def events(sig):
    s = np.asarray(sig, dtype=bool)
    return int((s & ~np.r_[False, s[:-1]]).sum())


def table(name, sigs, c, mask):
    f60, f120, dd60 = L.fwd_returns(c, 60), L.fwd_returns(c, 120), L.fwd_max_drawdown(c, 60)
    m = mask & ~np.isnan(f120)
    yrs = m.sum() / 252
    print(f"\n== {name}  ({m.sum()} 거래일)  전체: 60일 {f60[m].mean()*100:+.1f}%  120일 {f120[m].mean()*100:+.1f}%  "
          f"승률 {(f120[m] > 0).mean()*100:.0f}%  60일 최대낙폭 {dd60[m].mean()*100:.1f}%")
    for k, s in sigs.items():
        sel = m & s
        n = sel.sum()
        if n < 10:
            print(f"  {k:34s} n={n}")
            continue
        print(f"  {k:34s} 60일 {f60[sel].mean()*100:+5.1f}%  120일 {f120[sel].mean()*100:+5.1f}%  승률 {(f120[sel] > 0).mean()*100:3.0f}%  "
              f"60일 최대낙폭 {dd60[sel].mean()*100:5.1f}%  연 {n/yrs:5.1f}일  사건 {events(sel)}")


def build(sid, sk):
    px = L.fred(sid).dropna()
    px = px[px > 0]
    c = px.to_numpy()
    if sk == "SFG":
        S = sfg(components(px), SFG_COLS, 252)
    elif sk == "CNN":
        S = L.asof_join(px.index, L.cnn_fg()).to_numpy()
    else:
        S = None
    P1, P2 = price_p(c, V1_P), price_p(c, V2_P)
    sma200 = pd.Series(c).rolling(200).mean().to_numpy()
    down = c < sma200
    return px, c, S, P1, P2, down


def us_signals(S, P1, P2, down):
    fear = 100 - S
    rfg1 = blend(S, P1, "linear", 0.4)
    rfg2 = blend(S, P2, "geo", 0.4)
    frm1 = P1 / (fear + 1e-5)
    frm2 = P2 / (fear + 1e-5)
    return {
        "[v1] BUY  RFG≤20 ∨ (Fear≥65∧P≤35)": (rfg1 <= 20) | ((fear >= 65) & (P1 <= 35)),
        "[v1] RISK FRM≥1.5 ∧ P≥60": (frm1 >= 1.5) & (P1 >= 60) & (fear >= 10),
        "[v2] BUY  RFG≤20": rfg2 <= 20,
        "[v2] BUY  RFG≤15": rfg2 <= 15,
        "[v2] BUY  RFG≤20 ∨ (Fear≥65∧P≤35)": (rfg2 <= 20) | ((fear >= 65) & (P2 <= 35)),
        "[v2] BUY  Fear≥70 ∧ P≥80": (fear >= 70) & (P2 >= 80),
        "[v2] RISK FRM≥1.5 ∧ P≥60": (frm2 >= 1.5) & (P2 >= 60) & (fear >= 10),
        "[v2] RISK 하락추세 ∧ 30≤RFG≤60": down & (rfg2 >= 30) & (rfg2 <= 60),
        "[v2] RISK 하락추세 ∧ P<80": down & (P2 < 80),
        "[v2] RISK 하락추세 ∧ P<80 ∧ Fear<70": down & (P2 < 80) & (fear < 70),
        "[v2] 과열 RFG≥80": rfg2 >= 80,
        "[v2] 과열 RFG≥80 ∧ 상승추세": (rfg2 >= 80) & ~down,
    }


def price_signals(P1, P2, down):
    return {
        "[가격] P≥80 (v1 P)": P1 >= 80,
        "[가격] P≥80 (v2 P)": P2 >= 80,
        "[가격] P≥90 (v2 P)": P2 >= 90,
        "[가격] 하락추세 ∧ P≥80 (투매)": down & (P2 >= 80),
        "[가격] 하락추세 ∧ P<80 (위험 후보)": down & (P2 < 80),
        "[가격] 상승추세 ∧ P≥60 (눌림)": ~down & (P2 >= 60),
        "[가격] 상승추세 ∧ P≤20 (평온)": ~down & (P2 <= 20),
    }


if __name__ == "__main__":
    for sid, sk, a, b in [("NASDAQ100", "SFG", "1995-01-01", "2009-12-31"), ("NASDAQ100", "SFG", "2010-01-01", "2100-01-01"),
                          ("SP500", "SFG", "2020-01-01", "2100-01-01"), ("SP500", "CNN", "2020-07-15", "2100-01-01"),
                          ("NASDAQ100", "CNN", "2020-07-15", "2100-01-01")]:
        px, c, S, P1, P2, down = build(sid, sk)
        mask = (px.index >= a) & (px.index <= b)
        table(f"{sid} {sk} {a[:4]}–{b[:4] if b < '2100' else '2026'}", us_signals(S, P1, P2, down), c, mask)
    for sid, a in [("NASDAQCOM", "1977-06-01"), ("NIKKEI225", "1960-01-01")]:
        px, c, _, P1, P2, down = build(sid, None)
        table(f"{sid} {a[:4]}–2026 (가격만)", price_signals(P1, P2, down), c, px.index >= a)
