"""1단계: 가격 훼손 P 구조 그리드.

G = 100 − P (가격 쪽 '탐욕'). 역발상 지수가 좋으려면 G 와 선행수익률의 순위상관(IC)이 음수여야 한다.
q = −mean(IC_h), h ∈ {20,60,120,250}. 학습 구간에서 고르고 나머지 구간·시장에서 확인한다.

결합 방식
  raw  : P = pct(α·(−DD) + β·(−DISP) + γ·RV, W)            — 현재 엔진
  pctr : P = pct(α·pct(−DD,W) + β·pct(−DISP,W) + γ·pct(RV,W), 252) — 구성 요소별 백분위 후 가중합, 다시 백분위
  avg  : P = α·pct(−DD) + β·pct(−DISP) + γ·pct(RV)          — 재백분위 없음
"""
from __future__ import annotations

import itertools
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import rankdata

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L

OUT = Path(__file__).parent / "out"
HORIZONS = (20, 60, 120, 250)
NS, MS, KS = (20, 60, 120, 252), (20, 50, 100, 200), (10, 20, 60)
WS = (252, 504, 756, 1260, "exp")
STEP = 10
WEIGHTS = [(a / STEP, b / STEP, (STEP - a - b) / STEP) for a in range(STEP + 1) for b in range(STEP + 1 - a)]

DATASETS = {
    # 이름: (FRED id, [(split, 시작, 끝)], 허용 W)
    "NASDAQCOM": ("NASDAQCOM", [("train", "1977-06-01", "2005-12-31"), ("test", "2006-01-01", "2100-01-01")], WS),
    "NIKKEI225": ("NIKKEI225", [("test", "1960-01-01", "2100-01-01")], WS),
    "SP500": ("SP500", [("test", "2019-01-01", "2100-01-01")], (252, 504, "exp")),
}

_cache: dict = {}


def load(name):
    if name not in _cache:
        sid, splits, _ = DATASETS[name]
        s = L.fred(sid).dropna()
        s = s[s > 0]
        c = s.to_numpy()
        idx = s.index
        prep = []
        for split, a, b in splits:
            rng = (idx >= a) & (idx <= b)
            per_h = {}
            for h in HORIZONS:
                f = L.fwd_returns(c, h)
                m = rng & ~np.isnan(f)
                per_h[h] = (m, rankdata(f[m]), f[m])
            r1 = np.r_[np.nan, c[1:] / c[:-1] - 1]
            prep.append((split, rng, per_h, r1))
        _cache[name] = (c, idx, prep)
    return _cache[name]


def pearson(x, y):
    x = x - x.mean()
    y = y - y.mean()
    d = np.sqrt((x * x).sum() * (y * y).sum())
    return float((x * y).sum() / d) if d > 0 else np.nan


def score(G, c, prep):
    out = {}
    for split, rng, per_h, r1 in prep:
        ics = []
        for h in HORIZONS:
            m, rf, f = per_h[h]
            g = G[m]
            if np.isnan(g).any():
                return None  # 평가 구간 안에 워밍업 미달 — 이 W 로는 공정 비교 불가
            ic = pearson(rankdata(g), rf)
            ics.append(ic)
            out[f"{split}_ic{h}"] = ic
            if h == 60:
                lo, hi = g <= 20, g >= 80
                out[f"{split}_lo60"] = float(f[lo].mean()) if lo.any() else np.nan
                out[f"{split}_hi60"] = float(f[hi].mean()) if hi.any() else np.nan
                out[f"{split}_base60"] = float(f.mean())
                out[f"{split}_flo"] = float(lo.mean())
                out[f"{split}_fhi"] = float(hi.mean())
        out[f"{split}_q"] = -float(np.mean(ics))
        # 기울임 전략: 비중 = G/100 이 아니라 (100 − G)/100 = P/100 — 훼손이 클수록 더 산다
        w = np.r_[np.nan, (100 - G[:-1]) / 100]
        mm = rng & ~np.isnan(w) & ~np.isnan(r1)
        rs, rb = w[mm] * r1[mm], r1[mm] * np.nanmean(w[mm])
        sr = lambda x: x.mean() / x.std(ddof=1) * np.sqrt(252)
        out[f"{split}_sharpe_edge"] = float(sr(rs) - sr(rb))
    return out


def task(args):
    name, n, m, k, W = args
    c, idx, prep = load(name)
    dd, disp, rv = -L.rolling_drawdown(c, n), -L.rolling_disparity(c, m), L.realized_vol(c, k)
    pdd, pdisp, prv = (L.norm_pct(x, W) for x in (dd, disp, rv))
    rows = []
    for a, b, g in WEIGHTS:
        for method in ("raw", "pctr", "avg"):
            if method == "raw":
                P = L.norm_pct(a * dd + b * disp + g * rv, W)
            else:
                avg = a * pdd + b * pdisp + g * prv
                P = L.norm_pct(avg, W if W == "exp" else 252) if method == "pctr" else avg  # 재백분위는 252 고정(긴 W 의 이중 워밍업 방지)
            s = score(100 - P, c, prep)
            if s is None:
                continue
            rows.append({"data": name, "N": n, "M": m, "K": k, "W": str(W), "a": a, "b": b, "g": g, "method": method, **s})
    return rows


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    tasks = [(name, n, m, k, W) for name, (_, _, ws) in DATASETS.items() for n, m, k, W in itertools.product(NS, MS, KS, ws)]
    t0 = time.time()
    rows = []
    with Pool(10) as pool:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=1)):
            rows.extend(r)
            if (i + 1) % 50 == 0:
                print(f"{i + 1}/{len(tasks)} tasks, {len(rows)} rows, {time.time() - t0:.0f}s", flush=True)
    df = pd.DataFrame(rows)
    df.to_csv(OUT / "grid_price.csv", index=False)
    print(f"done {len(df)} rows in {time.time() - t0:.0f}s")
