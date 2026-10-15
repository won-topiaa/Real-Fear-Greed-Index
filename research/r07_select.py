"""3단계: 최종 선택. 견고한 P 후보 × 심리 가중치 × 결합 방식을 5개 창에서 평가하고 최악 창 기준(maximin)으로 고른다.

창별 점수
  q    = −mean Spearman IC(I, fwd_h), h ∈ {20,60,120,250}
  qs   = 공포 5분위(하위 20%) − 탐욕 5분위(상위 20%) 의 120일 선행 로그수익률 차 — 분위로 빈도를 맞춘다
  edge = 지수 ≤ 20 평균 − 지수 ≥ 80 평균 (120일, 실제 문턱)
"""
import itertools
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L
from r02_proxy import components, sfg
from r06_composite import SFG_COLS, WINDOWS, blend, price_p

OUT = Path(__file__).parent / "out"
P_DEFS = {
    "v1": (60, 50, 20, 252, 0.5, 0.3, 0.2),
    "star": (20, 20, 60, 756, 0.1, 0.1, 0.8),
    "rv": (20, 20, 60, 756, 0.0, 0.0, 1.0),
    "a": (20, 50, 60, 756, 0.2, 0.0, 0.8),
    "b": (60, 20, 60, 756, 0.1, 0.1, 0.8),
    "c504": (20, 20, 60, 504, 0.1, 0.1, 0.8),
    "d1260": (20, 20, 60, 1260, 0.1, 0.1, 0.8),
    "e": (60, 50, 60, 756, 0.3, 0.2, 0.5),
    "f": (20, 20, 20, 756, 0.1, 0.1, 0.8),
    "g": (252, 50, 60, 756, 0.2, 0.1, 0.7),
}


def window_metrics(I, c, mask):
    out, ics = {}, []
    for h in (20, 60, 120, 250):
        f = L.fwd_returns(c, h)
        m = mask & ~np.isnan(I) & ~np.isnan(f)
        ics.append(spearmanr(I[m], f[m]).statistic)
        if h == 120:
            lo_q, hi_q = np.quantile(I[m], [0.2, 0.8])
            out["qs"] = f[m & (I <= lo_q)].mean() - f[m & (I >= hi_q)].mean()
            lo, hi = m & (I <= 20), m & (I >= 80)
            out["edge"] = (f[lo].mean() if lo.sum() >= 20 else np.nan) - (f[hi].mean() if hi.sum() >= 20 else np.nan)
            out["flo"], out["fhi"] = (I[m] <= 20).mean(), (I[m] >= 80).mean()
    out["q"] = -float(np.mean(ics))
    return out


if __name__ == "__main__":
    data = {}
    for sid in ("NASDAQ100", "SP500"):
        px = L.fred(sid).dropna()
        c = px.to_numpy()
        S = {"SFG": sfg(components(px), SFG_COLS, 252), "CNN": L.asof_join(px.index, L.cnn_fg()).to_numpy()}
        data[sid] = (px, c, S, {k: price_p(c, d) for k, d in P_DEFS.items()})
    rows = []
    for pk, how, w in itertools.product(P_DEFS, ("linear", "geo"), [i / 10 for i in range(11)]):
        if how == "geo" and w in (0.0, 1.0):
            continue
        rec = {"P": pk, "how": how, "w": w}
        for wn, (sid, sk, a, b) in WINDOWS.items():
            px, c, S, Ps = data[sid]
            I = blend(S[sk], Ps[pk], how, w)
            mask = (px.index >= a) & (px.index <= b)
            if np.isnan(I[mask]).mean() > 0.02:
                rec = None
                break
            rec.update({f"{wn}_{k}": v for k, v in window_metrics(I, c, mask).items()})
        if rec:
            rows.append(rec)
    df = pd.DataFrame(rows)
    wins = list(WINDOWS)
    df["min_q"] = df[[f"{w}_q" for w in wins]].min(axis=1)
    df["min_qs"] = df[[f"{w}_qs" for w in wins]].min(axis=1)
    df["mean_q"] = df[[f"{w}_q" for w in wins]].mean(axis=1)
    df["mean_qs"] = df[[f"{w}_qs" for w in wins]].mean(axis=1)
    # 두 기준의 창별 순위를 합친 최악 창 순위
    for w in wins:
        df[f"{w}_rank"] = (df[f"{w}_q"].rank(pct=True) + df[f"{w}_qs"].rank(pct=True)) / 2
    df["min_rank"] = df[[f"{w}_rank" for w in wins]].min(axis=1)
    df.to_csv(OUT / "select.csv", index=False)
    pd.set_option("display.width", 250)
    cols = ["P", "how", "w", "min_rank", "min_q", "mean_q", "min_qs", "mean_qs"] + [f"{w}_q" for w in wins] + [f"{w}_qs" for w in wins]
    print("maximin(창별 q·qs 순위) 상위 20")
    print(df.sort_values("min_rank", ascending=False).head(20)[cols].round(3).to_string(index=False))
    print("\n현재 엔진")
    print(df[(df.P == "v1") & (df.how == "linear") & (df.w == 0.4)][cols].round(3).to_string(index=False))
    print(f"\n후보 {len(df)}개")
