"""지수 품질 2단계: 가격 후보 × 심리 결합 × 평활화.

창
  SPX_cnn : 2022-11 이후, NDX_cnn : 2020-07-15 이후, 심리 = 실제 CNN
  NDX_sfg          : 1993 이후, 심리 = SFG(FRED 근사, CNN 과 상관 0.82)
  NQC_sfg          : 나스닥 종합 1993 이후, 심리 = SFG
지표: r10 과 같은 auc·fear·greed·noise·flo·fhi + CNN 창의 CNN 상관(cnn_r) + VIX 와의 순위상관(vix_r, 지수가 낮을수록 VIX 가 높아야 → 음수를 뒤집어 기록).
선택: 하루 변동(noise) ≤ CNN(3.2) 이고 CNN 창의 CNN 상관 ≥ 0.8 인 것 중, 네 창의 최소 auc 가 가장 큰 것.
"""
import itertools
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L
from r02_proxy import components, sfg
from r06_composite import SFG_COLS, blend, price_p
from r10_index_quality import quality, truth_labels

OUT = Path(__file__).parent / "out"
WINDOWS = {
    "SPX_cnn": ("SP500", "CNN", "2022-11-01"),  # 5년 백분위 창 후보까지 모두 값이 있는 시점(FRED SP500 은 2016-10 부터)
    "NDX_cnn": ("NASDAQ100", "CNN", "2020-07-15"),
    "NDX_sfg": ("NASDAQ100", "SFG", "1993-01-01"),
    "NQC_sfg": ("NASDAQCOM", "SFG", "1993-01-01"),
}


def ema(x: np.ndarray, span: int) -> np.ndarray:
    if span <= 1:
        return x
    return pd.Series(x).ewm(span=span, adjust=False, ignore_na=True).mean().to_numpy() * np.where(np.isnan(x), np.nan, 1)


def price_index(c, d):
    """d = (N, M, K, W, α, β, γ, method). raw: 합성 후 백분위, avg: 성분별 백분위의 가중 평균."""
    n, m, k, W, a, b, g, method = d
    if method == "raw":
        return price_p(c, (n, m, k, W, a, b, g))
    return a * L.rolling_pct(-L.rolling_drawdown(c, n), W) + b * L.rolling_pct(-L.rolling_disparity(c, m), W) + g * L.rolling_pct(L.realized_vol(c, k), W)


def load_markets(p_defs):
    data = {}
    for sid in ("SP500", "NASDAQ100", "NASDAQCOM"):
        px = L.fred(sid).dropna()
        px = px[px > 0]
        c = px.to_numpy()
        S = {"CNN": L.asof_join(px.index, L.cnn_fg()).to_numpy(), "SFG": sfg(components(px), SFG_COLS, 252)}
        fear, greed = truth_labels(c)
        vix = L.asof_join(px.index, L.fred("VIXCLS")).to_numpy()
        data[sid] = (px, c, S, {k: price_index(c, d) for k, d in p_defs.items()}, fear, greed, vix)
    return data


def evaluate(data, pk, how, w, span):
    rec = {"P": pk, "how": how, "w": w, "span": span}
    for wn, (sid, sk, start) in WINDOWS.items():
        px, c, S, Ps, fear, greed, vix = data[sid]
        I = ema(blend(S[sk], Ps[pk], how, w), span)
        rng = px.index >= start
        q = quality(I, fear, greed, rng)
        if q is None:
            return None
        rec.update({f"{wn}_{k}": v for k, v in q.items()})
        mv = rng & ~np.isnan(I) & ~np.isnan(vix)
        rec[f"{wn}_vix_r"] = -float(pd.Series(I[mv]).corr(pd.Series(vix[mv]), method="spearman"))
        if sk == "CNN":
            m = rng & ~np.isnan(I)
            rec[f"{wn}_cnn_r"] = float(np.corrcoef(I[m], S["CNN"][m])[0, 1])
    return rec


if __name__ == "__main__":
    top = pd.read_csv(OUT / "index_quality_top.csv")
    p_defs = {f"p{i}": (int(r.N), int(r.M), int(r.K), int(r.W), r.a, r.b, r.g, r.method) for i, r in top.iterrows()}
    p_defs["v1"] = (60, 50, 20, 252, 0.5, 0.3, 0.2, "raw")
    p_defs["v2"] = (20, 20, 60, 756, 0.1, 0.1, 0.8, "raw")
    data = load_markets(p_defs)
    rows = []
    hows = [("linear", w / 10) for w in range(0, 11)] + [("geo", w / 10) for w in range(1, 10)]
    for pk, (how, w), span in itertools.product(p_defs, hows, (1, 3, 5, 10)):
        r = evaluate(data, pk, how, w, span)
        if r:
            rows.append(r)
    df = pd.DataFrame(rows)
    wins = list(WINDOWS)
    df["min_auc"] = df[[f"{w}_auc" for w in wins]].min(axis=1)
    df["max_noise"] = df[[f"{w}_noise" for w in wins]].max(axis=1)
    df["min_cnn_r"] = df[["SPX_cnn_cnn_r", "NDX_cnn_cnn_r"]].min(axis=1)
    df["min_vix_r"] = df[[f"{w}_vix_r" for w in wins]].min(axis=1)
    df.to_csv(OUT / "index_blend.csv", index=False)
    print(len(df), "rows")
