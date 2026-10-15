"""기준선: 현재 엔진(v1)과 그 부품(CNN, SFG, P)의 역발상 성능.

지수가 낮을수록(공포) 이후 수익률이 높아야 좋은 공포·탐욕 지수다 → IC 음수, lo60 > hi60.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L
from r02_proxy import components, sfg

SFG_COLS = ["momentum", "vix_vs_ma", "safe_haven", "strength"]


def build(sid: str, start: str | None = None):
    px = L.fred(sid).dropna()
    if start:
        px = px[px.index >= start]
    c = px.to_numpy()
    comp = components(px)
    s = sfg(comp, SFG_COLS, 252)
    cnn = L.asof_join(px.index, L.cnn_fg()).to_numpy()
    dd, disp, rv = L.rolling_drawdown(c, 60), L.rolling_disparity(c, 50), L.realized_vol(c, 20)
    P = L.rolling_pct(0.5 * -dd + 0.3 * -disp + 0.2 * rv, 252)
    return px, c, {"P_greed(100-P)": 100 - P, "SFG": s, "CNN": cnn,
                   "RFG_v1(SFG)": 0.4 * s + 0.6 * (100 - P), "RFG_v1(CNN)": 0.4 * cnn + 0.6 * (100 - P)}


def row(name, x, c, mask):
    e = L.evaluate(x, c, mask, horizons=(20, 60, 120, 250))
    t = L.tilt_strategy(x, c, mask)
    ic = " ".join(f"{e.ic[h]:+.3f}({e.t[h]:+.1f})" for h in (20, 60, 120, 250))
    return (f"  {name:16s} n={e.n:5d}  IC20/60/120/250(t) {ic}  "
            f"≤20: {e.zone_lo[60]*100:+5.1f}% (n={e.n_lo:4d})  ≥80: {e.zone_hi[60]*100:+5.1f}% (n={e.n_hi:4d})  "
            f"전체 {e.base[60]*100:+4.1f}%  샤프차 {t['sharpe_edge']:+.2f}")


if __name__ == "__main__":
    for sid, periods in [("NASDAQ100", [("1991-01-01", "2009-12-31"), ("2010-01-01", "2026-12-31"), ("2020-07-15", "2026-12-31")]),
                         ("SP500", [("2017-10-15", "2026-12-31"), ("2020-07-15", "2026-12-31")])]:
        px, c, xs = build(sid)
        for a, b in periods:
            mask = (px.index >= a) & (px.index <= b)
            print(f"\n== {sid} {a} → {b}   (60일 선행수익률 기준 구간 평균)")
            for name, x in xs.items():
                if np.isnan(x[mask]).all():
                    continue
                print(row(name, x, c, mask))
