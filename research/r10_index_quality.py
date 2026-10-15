"""지수 품질(묘사 정확도) 기준의 가격 구조 그리드.

공포·탐욕 지수는 '지금 시장이 얼마나 무서운가'를 보여줘야 한다. 정답지는 실제로 일어난 일이다.
  공포 정답일: 1년 고점 대비 10% 이상 빠진 바닥(앞뒤 3개월 최저) 부근
  탐욕 정답일: 1년 고점 대비 −3% 이내이면서 63거래일 수익률 > 0 인 날(급락 뒤 회복한 날 포함)
지표
  auc   = P(지수_공포일 < 지수_탐욕일) — 1 이면 완벽히 가른다
  fear  = 공포 정답일의 지수 중앙값(낮을수록), greed = 탐욕 정답일의 지수 중앙값(높을수록)
  noise = 하루 평균 |변화|, flo/fhi = ≤20 / ≥80 비율
지수는 G = 100 − P (가격만의 공포·탐욕).
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
NS, MS, KS = (20, 60, 120, 252), (20, 50, 100, 200), (10, 20, 60)
WS = (252, 504, 756, 1260)
STEP = 10
WEIGHTS = [(a / STEP, b / STEP, (STEP - a - b) / STEP) for a in range(STEP + 1) for b in range(STEP + 1 - a)]
DATASETS = {
    "NASDAQCOM": ("NASDAQCOM", "1977-06-01", WS),
    "NIKKEI225": ("NIKKEI225", "1960-01-01", WS),
    "NASDAQ100": ("NASDAQ100", "1993-01-01", WS),
    "SP500": ("SP500", "2019-01-01", (252, 504)),
}


def truth_labels(c: np.ndarray, depth: float = 0.10, half: int = 63, near: int = 21, deep: float = 0.85, greed_dd: float = 0.03):
    """최근 1년 고점 기준으로 공포·탐욕 정답일 마스크를 만든다.
    바닥: 앞뒤 half 거래일 안의 최저 종가이면서 1년 고점 대비 −depth 이하인 날.
    공포 정답일: 바닥 ±5일, 그리고 바닥 ±near 일 안에서 낙폭이 바닥 낙폭의 deep 배 이상인 날.
    탐욕 정답일: 1년 고점 대비 −greed_dd 이내이면서 63일 수익률 > 0 (급락 뒤 회복한 날도 들어간다).
    """
    hi = pd.Series(c).rolling(252, min_periods=1).max().to_numpy()
    dd = c / hi - 1
    lo = pd.Series(c).rolling(2 * half + 1, center=True, min_periods=1).min().to_numpy()
    troughs = np.where((c <= lo) & (dd <= -depth))[0]
    fear = np.zeros(len(c), bool)
    for t in troughs:
        fear[max(0, t - 5): t + 6] = True
        a, b = max(0, t - near), min(len(c), t + near + 1)
        fear[a:b] |= dd[a:b] <= deep * dd[t]
    greed = (dd >= -greed_dd) & (L.roc(c, 63) > 0)
    return fear, greed & ~fear


def auc(x: np.ndarray, fear: np.ndarray, greed: np.ndarray) -> float:
    a, b = x[fear], x[greed]
    r = rankdata(np.concatenate([a, b]))
    return float((r[len(a):].sum() - len(b) * (len(b) + 1) / 2) / (len(a) * len(b)))


def quality(I: np.ndarray, fear: np.ndarray, greed: np.ndarray, rng: np.ndarray) -> dict | None:
    m = rng & ~np.isnan(I)
    if np.isnan(I[rng]).any():
        return None
    f, g = fear & m, greed & m
    d = np.abs(np.diff(I[m]))
    return {"auc": auc(I, f, g), "fear": float(np.median(I[f])), "greed": float(np.median(I[g])),
            "noise": float(d.mean()), "flo": float((I[m] <= 20).mean()), "fhi": float((I[m] >= 80).mean()),
            "nf": int(f.sum()), "ng": int(g.sum())}


_cache: dict = {}


def load(name):
    if name not in _cache:
        sid, start, _ = DATASETS[name]
        s = L.fred(sid).dropna()
        s = s[s > 0]
        c = s.to_numpy()
        fear, greed = truth_labels(c)
        _cache[name] = (c, fear, greed, s.index >= start)
    return _cache[name]


def task(args):
    name, n, m, k, W = args
    c, fear, greed, rng = load(name)
    dd, disp, rv = -L.rolling_drawdown(c, n), -L.rolling_disparity(c, m), L.realized_vol(c, k)
    pdd, pdisp, prv = (L.rolling_pct(x, W) for x in (dd, disp, rv))
    rows = []
    for a, b, g in WEIGHTS:
        for method in ("raw", "avg"):
            P = L.rolling_pct(a * dd + b * disp + g * rv, W) if method == "raw" else a * pdd + b * pdisp + g * prv
            q = quality(100 - P, fear, greed, rng)
            if q:
                rows.append({"data": name, "N": n, "M": m, "K": k, "W": W, "a": a, "b": b, "g": g, "method": method, **q})
    return rows


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name in DATASETS:
        c, fear, greed, rng = load(name)
        print(f"{name}: 공포 정답일 {int((fear & rng).sum())}, 탐욕 정답일 {int((greed & rng).sum())}, 평가일 {int(rng.sum())}")
    tasks = [(name, n, m, k, W) for name, (_, _, ws) in DATASETS.items() for n, m, k, W in itertools.product(NS, MS, KS, ws)]
    t0 = time.time()
    rows = []
    with Pool(10) as pool:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=1)):
            rows.extend(r)
            if (i + 1) % 100 == 0:
                print(f"{i + 1}/{len(tasks)} {time.time() - t0:.0f}s", flush=True)
    pd.DataFrame(rows).to_csv(OUT / "grid_index_quality.csv", index=False)
    print(f"done {len(rows)} rows in {time.time() - t0:.0f}s")
