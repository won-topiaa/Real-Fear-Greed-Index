"""최종 비교표: v1(현재까지의 엔진) vs v2(채택) — research/README.md 의 표를 이 출력으로 만든다."""
import sys
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L
from r06_composite import blend
from r08_signals import V1_P, V2_P, build

WINDOWS = [
    ("나스닥100 1995–2009 (SFG)", "NASDAQ100", "SFG", "1995-01-01", "2009-12-31"),
    ("나스닥100 2010–2026 (SFG)", "NASDAQ100", "SFG", "2010-01-01", "2100-01-01"),
    ("S&P500 2020–2026 (SFG)", "SP500", "SFG", "2020-01-01", "2100-01-01"),
    ("S&P500 2020.7–2026 (CNN)", "SP500", "CNN", "2020-07-15", "2100-01-01"),
    ("나스닥100 2020.7–2026 (CNN)", "NASDAQ100", "CNN", "2020-07-15", "2100-01-01"),
]


def pct(x):
    return f"{x * 100:+.1f}%" if np.isfinite(x) else "—"


if __name__ == "__main__":
    print("| 구간 | 평균 120일 | v1 역발상 IC | v2 역발상 IC | v1 ≤20 → 120일 | v2 ≤20 → 120일 | v1 ≥80 → 120일 | v2 ≥80 → 120일 |")
    print("|---|---|---|---|---|---|---|---|")
    for name, sid, sk, a, b in WINDOWS:
        px, c, S, P1, P2, down = build(sid, sk)
        mask = (px.index >= a) & (px.index <= b)
        v1, v2 = blend(S, P1, "linear", 0.4), blend(S, P2, "geo", 0.4)
        f120 = L.fwd_returns(c, 120)
        cells = []
        for I in (v1, v2):
            ics = []
            for h in (20, 60, 120, 250):
                f = L.fwd_returns(c, h)
                m = mask & ~np.isnan(I) & ~np.isnan(f)
                ics.append(spearmanr(I[m], f[m]).statistic)
            cells.append(-np.mean(ics))
        m = mask & ~np.isnan(v1) & ~np.isnan(v2) & ~np.isnan(f120)
        z = lambda I, cond: f120[m & cond(I)].mean() if (m & cond(I)).sum() >= 20 else np.nan
        print(f"| {name} | {pct(f120[m].mean())} | {cells[0]:+.3f} | {cells[1]:+.3f} | {pct(z(v1, lambda I: I <= 20))} | {pct(z(v2, lambda I: I <= 20))} | {pct(z(v1, lambda I: I >= 80))} | {pct(z(v2, lambda I: I >= 80))} |")

    print("\n| 구간 | 평균 60/120일 | v1 BUY 60/120일 (연 일수) | v2 BUY 60/120일 (연 일수) | 평균 60일 최대낙폭 | v1 RISK 60일 최대낙폭 | v2 RISK 60일 최대낙폭 |")
    print("|---|---|---|---|---|---|---|")
    for name, sid, sk, a, b in WINDOWS:
        px, c, S, P1, P2, down = build(sid, sk)
        mask = (px.index >= a) & (px.index <= b)
        fear = 100 - S
        v1, v2 = blend(S, P1, "linear", 0.4), blend(S, P2, "geo", 0.4)
        buy1 = (v1 <= 20) | ((fear >= 65) & (P1 <= 35))
        risk1 = (P1 / (fear + 1e-5) >= 1.5) & (P1 >= 60) & (fear >= 10)
        buy2 = ~down & (P2 >= 60) & (fear >= 50)
        risk2 = down & (v2 >= 40)
        f60, f120, dd = L.fwd_returns(c, 60), L.fwd_returns(c, 120), L.fwd_max_drawdown(c, 60)
        m = mask & ~np.isnan(f120) & ~np.isnan(S)
        yrs = m.sum() / 252

        def sig(s):
            sel = m & s
            return f"{pct(f60[sel].mean())} / {pct(f120[sel].mean())} ({sel.sum() / yrs:.0f}일)"

        print(f"| {name} | {pct(f60[m].mean())} / {pct(f120[m].mean())} | {sig(buy1)} | {sig(buy2)} | {pct(dd[m].mean())} | "
              f"{pct(dd[m & risk1].mean())} | {pct(dd[m & risk2].mean())} |")

    print("\n가격만 쓰는 장기 검증(심리 없음): 상승 추세 ∧ P≥60")
    print("| 시장 | 평균 60/120일 | 눌림 60/120일 | 승률(120일) | 연 일수 |")
    print("|---|---|---|---|---|")
    for sid, a in [("NASDAQCOM", "1977-06-01"), ("NIKKEI225", "1960-01-01")]:
        px, c, _, P1, P2, down = build(sid, None)
        f60, f120 = L.fwd_returns(c, 60), L.fwd_returns(c, 120)
        m = (px.index >= a) & ~np.isnan(f120) & ~np.isnan(P2)
        sel = m & ~down & (P2 >= 60)
        print(f"| {sid} {a[:4]}–2026 | {pct(f60[m].mean())} / {pct(f120[m].mean())} | {pct(f60[sel].mean())} / {pct(f120[sel].mean())} | "
              f"{(f120[sel] > 0).mean() * 100:.0f}% (평균 {(f120[m] > 0).mean() * 100:.0f}%) | {sel.sum() / (m.sum() / 252):.0f}일 |")
