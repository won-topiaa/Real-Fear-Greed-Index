"""2단계: 심리(S) × 가격(P) 결합 구조.

I 는 0(공포)~100(탐욕). fear_s = 100 − S, fear_p = P.
  linear : I = w·S + (1−w)·(100 − P)                      — 현재 엔진(w=0.4)
  geo    : I = 100 − (fear_s+1)^w · (fear_p+1)^(1−w) + 1   — 둘 다 공포여야 극단
  minf   : I = 100 − min(fear_s, fear_p)                   — 둘 중 약한 공포
  maxf   : I = 100 − max(fear_s, fear_p)                   — 둘 중 강한 공포
  rerank : 위 결과를 다시 롤링 백분위(504)로 — 20/80 문턱의 빈도를 되살린다
선택은 NDX 1995–2009(SFG) 에서만, 나머지는 검증.
"""
import itertools
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L
from r02_proxy import components, sfg

OUT = Path(__file__).parent / "out"
SFG_COLS = ["momentum", "vix_vs_ma", "safe_haven", "strength"]
P_DEFS = {
    "P_v1": (60, 50, 20, 252, 0.5, 0.3, 0.2),
    "P_rv": (20, 20, 60, 756, 0.0, 0.0, 1.0),
    "P_star": (20, 20, 60, 756, 0.1, 0.1, 0.8),
    "P_mix": (60, 50, 60, 756, 0.3, 0.2, 0.5),
    "P_v1w": (60, 50, 20, 756, 0.5, 0.3, 0.2),
}
WINDOWS = {
    "NDX_tr": ("NASDAQ100", "SFG", "1995-01-01", "2009-12-31"),
    "NDX_te": ("NASDAQ100", "SFG", "2010-01-01", "2100-01-01"),
    "SPX_te": ("SP500", "SFG", "2020-01-01", "2100-01-01"),
    "NDX_cnn": ("NASDAQ100", "CNN", "2020-07-15", "2100-01-01"),
    "SPX_cnn": ("SP500", "CNN", "2020-07-15", "2100-01-01"),
}


def price_p(c, d):
    n, m, k, W, a, b, g = d
    return L.norm_pct(a * -L.rolling_drawdown(c, n) + b * -L.rolling_disparity(c, m) + g * L.realized_vol(c, k), W)


def blend(S, P, how, w):
    fs, fp = 100 - S, P
    if how == "linear":
        return w * S + (1 - w) * (100 - P)
    if how == "geo":
        return 100 - (np.power(fs + 1, w) * np.power(fp + 1, 1 - w) - 1)
    if how == "minf":
        return 100 - np.minimum(fs, fp)
    if how == "maxf":
        return 100 - np.maximum(fs, fp)
    raise ValueError(how)


def metrics(I, c, mask):
    out = {}
    ics = []
    for h in (20, 60, 120, 250):
        f = L.fwd_returns(c, h)
        m = mask & ~np.isnan(I) & ~np.isnan(f)
        from scipy.stats import spearmanr
        ic = spearmanr(I[m], f[m]).statistic
        ics.append(ic)
        out[f"ic{h}"] = ic
        if h in (60, 120):
            lo, hi = m & (I <= 20), m & (I >= 80)
            out[f"lo{h}"] = f[lo].mean() if lo.sum() >= 20 else np.nan
            out[f"hi{h}"] = f[hi].mean() if hi.sum() >= 20 else np.nan
            out[f"base{h}"] = f[m].mean()
    m = mask & ~np.isnan(I)
    out["flo"] = (I[m] <= 20).mean()
    out["fhi"] = (I[m] >= 80).mean()
    out["q"] = -np.mean(ics)
    out["edge120"] = out["lo120"] - out["hi120"]
    out["sharpe_edge"] = L.tilt_strategy(I, c, mask)["sharpe_edge"]
    return out


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    data = {}
    for sid in ("NASDAQ100", "SP500"):
        px = L.fred(sid).dropna()
        c = px.to_numpy()
        S = {"SFG": sfg(components(px), SFG_COLS, 252), "CNN": L.asof_join(px.index, L.cnn_fg()).to_numpy()}
        Ps = {k: price_p(c, d) for k, d in P_DEFS.items()}
        data[sid] = (px, c, S, Ps)
    rows = []
    hows = [("linear", w / 10) for w in range(11)] + [("geo", w / 10) for w in range(1, 10)] + [("minf", None), ("maxf", None)]
    for pk, (how, w), rr in itertools.product(P_DEFS, hows, (False, True)):
        rec = {"P": pk, "how": how, "w": w, "rerank": rr}
        for wn, (sid, sk, a, b) in WINDOWS.items():
            px, c, S, Ps = data[sid]
            I = blend(S[sk], Ps[pk], how, w if w is not None else 0.5)
            if rr:
                if sk == "CNN":
                    continue  # CNN 이력(2020-07~)으로는 롤링 재백분위 워밍업이 평가 창을 잡아먹는다
                I = L.rolling_pct(I, 504)
            mask = (px.index >= a) & (px.index <= b)
            if np.isnan(I[mask]).mean() > 0.02:
                continue
            for k, v in metrics(I, c, mask).items():
                rec[f"{wn}_{k}"] = v
        rows.append(rec)
    df = pd.DataFrame(rows)
    df.to_csv(OUT / "grid_composite.csv", index=False)
    print(len(df), "rows")
