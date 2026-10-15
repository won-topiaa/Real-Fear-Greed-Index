"""RFG 엔진 연구용 공통 모듈 — 데이터 적재, 구성 요소, 롤링 백분위, 평가 지표.

수식은 src/core 와 같은 정의를 따른다(롤링 백분위: 자기 포함·평균순위·분모 W−1, 창 안 결측이면 결측).
데이터는 research/data/ (gitignore). fetch_fred.mjs · fetch_cnn.mjs 로 받는다.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view
from scipy.stats import spearmanr

DATA = Path(__file__).resolve().parent / "data"
ANN = 252


# ---------------------------------------------------------------- 데이터

def fred(series_id: str) -> pd.Series:
    df = pd.read_csv(DATA / "fred" / f"{series_id}.csv", parse_dates=["date"])
    return df.set_index("date")["value"].astype(float).rename(series_id)


def cnn_fg() -> pd.Series:
    df = pd.read_csv(DATA / "cnn_fg.csv", parse_dates=["date"])
    return df.set_index("date")["fg"].astype(float).rename("cnn_fg")


def asof_join(index: pd.DatetimeIndex, s: pd.Series, max_stale_days: int = 5) -> pd.Series:
    """거래일 index 에 s 를 as-of 조인. 마지막 관측이 max_stale_days 달력일보다 오래되면 결측 (src/core/align.ts 와 같은 규칙)."""
    s = s.dropna().sort_index()
    left = pd.DataFrame({"date": index})
    right = pd.DataFrame({"date": s.index, "v": s.values, "src": s.index})
    m = pd.merge_asof(left, right, on="date", direction="backward")
    stale = (m["date"] - m["src"]).dt.days
    v = m["v"].where(stale <= max_stale_days)
    return pd.Series(v.values, index=index, name=s.name)


# ---------------------------------------------------------------- 구성 요소 (모두 종가 배열 기준, 오래된→최신)

def rolling_drawdown(c: np.ndarray, n: int) -> np.ndarray:
    hi = pd.Series(c).rolling(n, min_periods=n).max().to_numpy()
    return (c - hi) / hi


def rolling_disparity(c: np.ndarray, m: int) -> np.ndarray:
    sma = pd.Series(c).rolling(m, min_periods=m).mean().to_numpy()
    return (c - sma) / sma


def log_returns(c: np.ndarray) -> np.ndarray:
    r = np.full(len(c), np.nan)
    r[1:] = np.log(c[1:] / c[:-1])
    return r


def realized_vol(c: np.ndarray, k: int) -> np.ndarray:
    """표본표준편차(K−1)·평균 차감·연율화. 수익률 K개 → 종가 K+1개 필요."""
    r = pd.Series(log_returns(c))
    return (r.rolling(k, min_periods=k).std(ddof=1) * np.sqrt(ANN)).to_numpy()


def downside_vol(c: np.ndarray, k: int) -> np.ndarray:
    r = pd.Series(log_returns(c))
    neg = r.clip(upper=0.0)
    return (np.sqrt((neg**2).rolling(k, min_periods=k).mean()) * np.sqrt(ANN)).to_numpy()


def roc(c: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(c), np.nan)
    out[n:] = np.log(c[n:] / c[:-n])
    return out


# ---------------------------------------------------------------- 정규화

def rolling_pct(values: np.ndarray, w: int) -> np.ndarray:
    """src/core rollingPercentileRank 와 같은 정의. 0..100."""
    v = np.asarray(values, dtype=float)
    out = np.full(len(v), np.nan)
    if len(v) < w or w < 2:
        return out
    win = sliding_window_view(v, w)
    cur = win[:, -1:]
    less = (win < cur).sum(1)
    eq = (win == cur).sum(1)
    p = (less + 0.5 * (eq - 1)) / (w - 1) * 100.0
    bad = np.isnan(win).any(1)
    p[bad] = np.nan
    out[w - 1:] = p
    return out


def expanding_pct(values: np.ndarray, min_n: int = 252) -> np.ndarray:
    """확장 창 백분위(전체 과거 대비). 결측은 건너뛴다."""
    import bisect

    v = np.asarray(values, dtype=float)
    out = np.full(len(v), np.nan)
    hist: list[float] = []
    for t, x in enumerate(v):
        if np.isnan(x):
            continue
        bisect.insort(hist, x)
        n = len(hist)
        if n < min_n:
            continue
        lo = bisect.bisect_left(hist, x)
        hi = bisect.bisect_right(hist, x)
        out[t] = (lo + 0.5 * (hi - lo - 1)) / (n - 1) * 100.0
    return out


def norm_pct(values: np.ndarray, w: int | str) -> np.ndarray:
    return expanding_pct(values) if w == "exp" else rolling_pct(values, int(w))


# ---------------------------------------------------------------- 평가

def fwd_returns(c: np.ndarray, h: int) -> np.ndarray:
    out = np.full(len(c), np.nan)
    out[:-h] = np.log(c[h:] / c[:-h])
    return out


def fwd_max_drawdown(c: np.ndarray, h: int) -> np.ndarray:
    """t 이후 h 거래일 안에서 c_t 대비 최저 로그수익률(0 이하)."""
    out = np.full(len(c), np.nan)
    lc = np.log(c)
    win = sliding_window_view(lc, h + 1)  # [t .. t+h]
    out[: len(win)] = np.minimum((win[:, 1:] - win[:, :1]).min(1), 0.0)
    return out


@dataclass
class Eval:
    ic: dict[int, float]          # Spearman(index, fwd_h). 역발상 지수면 음수가 좋다
    t: dict[int, float]           # 겹침 보정 근사 t (유효 표본 n/h)
    zone_lo: dict[int, float]     # index ≤ lo 일 때 평균 선행 로그수익률
    zone_hi: dict[int, float]     # index ≥ hi 일 때
    base: dict[int, float]        # 전체 평균
    n_lo: int
    n_hi: int
    n: int


def evaluate(index: np.ndarray, c: np.ndarray, mask: np.ndarray | None = None,
             horizons=(20, 60, 120), lo: float = 20, hi: float = 80) -> Eval:
    ic, tt, zl, zh, base = {}, {}, {}, {}, {}
    m0 = ~np.isnan(index) if mask is None else (~np.isnan(index) & mask)
    n_lo = int((m0 & (index <= lo)).sum())
    n_hi = int((m0 & (index >= hi)).sum())
    for h in horizons:
        f = fwd_returns(c, h)
        m = m0 & ~np.isnan(f)
        n = int(m.sum())
        if n < 3 * h:
            ic[h] = tt[h] = zl[h] = zh[h] = base[h] = np.nan
            continue
        r = spearmanr(index[m], f[m]).statistic
        ic[h] = float(r)
        ne = max(n / h - 2, 1)
        tt[h] = float(r * np.sqrt(ne) / np.sqrt(max(1 - r * r, 1e-12)))
        base[h] = float(f[m].mean())
        sl = m & (index <= lo)
        sh = m & (index >= hi)
        zl[h] = float(f[sl].mean()) if sl.any() else np.nan
        zh[h] = float(f[sh].mean()) if sh.any() else np.nan
    return Eval(ic, tt, zl, zh, base, n_lo, n_hi, int(m0.sum()))


def tilt_strategy(index: np.ndarray, c: np.ndarray, mask: np.ndarray | None = None) -> dict[str, float]:
    """지수를 비중으로 쓰는 단순 전략: 비중 = (100 − index)/100 (0~1), 다음 날 수익률에 적용. 거래비용 0."""
    r = np.zeros(len(c))
    r[1:] = c[1:] / c[:-1] - 1
    w = np.clip((100 - index) / 100.0, 0, 1)
    w = np.concatenate([[np.nan], w[:-1]])  # t 종가에 정한 비중은 t+1 수익률에 적용
    m = ~np.isnan(w)
    if mask is not None:
        m &= np.concatenate([[False], mask[:-1]])
    rs = (w * r)[m]
    rb = r[m]
    w_avg = float(np.nanmean(w[m]))

    def stats(x):
        eq = np.cumprod(1 + x)
        yrs = len(x) / ANN
        cagr = eq[-1] ** (1 / yrs) - 1
        vol = x.std(ddof=1) * np.sqrt(ANN)
        mdd = (eq / np.maximum.accumulate(eq) - 1).min()
        return cagr, vol, (x.mean() * ANN) / vol if vol > 0 else np.nan, mdd

    sc, sv, ss, sm = stats(rs)
    # 같은 평균 비중의 고정 비중 대비 — 타이밍 효과만 본다
    bc, bv, bs, bm = stats(rb * w_avg)
    return {"cagr": sc, "vol": sv, "sharpe": ss, "mdd": sm, "w_avg": w_avg,
            "static_cagr": bc, "static_sharpe": bs, "static_mdd": bm,
            "sharpe_edge": ss - bs}
