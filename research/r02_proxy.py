"""FRED 만으로 CNN F&G 를 근사하는 심리 지수(SFG)를 만들고, 2020-07 이후 실제 CNN 과의 일치도를 잰다."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L


def components(px: pd.Series) -> pd.DataFrame:
    """px: 지수 종가(거래일 index). 각 열은 '클수록 탐욕' 방향."""
    idx = px.index
    c = px.to_numpy()
    vix = L.asof_join(idx, L.fred("VIXCLS")).to_numpy()
    baa = L.asof_join(idx, L.fred("DBAA")).to_numpy()
    aaa = L.asof_join(idx, L.fred("DAAA")).to_numpy()
    y10 = L.asof_join(idx, L.fred("DGS10")).to_numpy() / 100
    # 10년물 근사 총수익: 듀레이션 8.5, 캐리 y/252
    dy = np.r_[np.nan, np.diff(y10)]
    bond_r = -8.5 * dy + np.r_[np.nan, y10[:-1]] / 252
    bond_cum = pd.Series(bond_r).rolling(20, min_periods=20).sum().to_numpy()
    stock_cum = L.roc(c, 20)
    vix_ma50 = pd.Series(vix).rolling(50, min_periods=50).mean().to_numpy()
    hi252 = pd.Series(c).rolling(252, min_periods=252).max().to_numpy()
    lo252 = pd.Series(c).rolling(252, min_periods=252).min().to_numpy()
    return pd.DataFrame({
        "momentum": L.rolling_disparity(c, 125),          # CNN: S&P vs 125일선
        "vix_vs_ma": -(vix / vix_ma50 - 1),                # CNN: VIX vs 50일선
        "vix_level": -vix,
        "safe_haven": stock_cum - bond_cum,                # CNN: 20일 주식 − 채권 수익률
        "credit": -(baa - y10 * 100),                      # 정크 대신 Baa − 10년물 스프레드(좁을수록 탐욕)
        "credit_q": -(baa - aaa),                          # Baa − Aaa
        "strength": (c - lo252) / (hi252 - lo252),         # 52주 고저 대비 위치(신고가·신저가 대용)
        "rv_inv": -L.realized_vol(c, 20),
    }, index=idx)


def sfg(comp: pd.DataFrame, cols, w=504) -> np.ndarray:
    pcts = np.column_stack([L.norm_pct(comp[k].to_numpy(), w) for k in cols])
    return pcts.mean(1)


if __name__ == "__main__":
    px = L.fred("SP500").dropna()
    comp = components(px)
    fg = L.asof_join(px.index, L.cnn_fg()).to_numpy()
    ov = ~np.isnan(fg)
    print(f"overlap days {ov.sum()}  {px.index[ov][0].date()} -> {px.index[ov][-1].date()}")
    print("\n개별 구성 요소 백분위(W=504) vs CNN  (pearson)")
    for k in comp:
        p = L.norm_pct(comp[k].to_numpy(), 504)
        m = ov & ~np.isnan(p)
        print(f"  {k:12s} r={np.corrcoef(p[m], fg[m])[0,1]:.3f}")
    print("\n조합 vs CNN")
    sets = {
        "cnn5(mom,vixma,haven,credit,strength)": ["momentum", "vix_vs_ma", "safe_haven", "credit", "strength"],
        "+vix_level": ["momentum", "vix_vs_ma", "safe_haven", "credit", "strength", "vix_level"],
        "+vix_level+rv": ["momentum", "vix_vs_ma", "safe_haven", "credit", "strength", "vix_level", "rv_inv"],
        "mom,vixma,haven,strength": ["momentum", "vix_vs_ma", "safe_haven", "strength"],
        "mom,vix_level,strength,credit": ["momentum", "vix_level", "strength", "credit"],
    }
    for name, cols in sets.items():
        for w in (252, 504, 1260):
            s = sfg(comp, cols, w)
            m = ov & ~np.isnan(s)
            r = np.corrcoef(s[m], fg[m])[0, 1]
            mae = np.abs(s[m] - fg[m]).mean()
            print(f"  {name:40s} W={w:<5d} r={r:.3f}  MAE={mae:5.1f}")
