"""최종 비교표(지수 품질 기준): CNN · v1 · 채택안 — research/README.md 의 표를 이 출력으로 만든다."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L
from r02_proxy import components, sfg
from r06_composite import SFG_COLS, blend, price_p
from r10_index_quality import quality, truth_labels
from r11_index_blend import ema, price_index

FINAL_P = (252, 200, 20, 1260, 0.5, 0.3, 0.2, "avg")
FINAL_SPAN = 1  # 2026-10-15 채택 때는 3, 2026-10-20 다듬기 없음으로 변경(r13_smoothing.py)
V1_P = (60, 50, 20, 252, 0.5, 0.3, 0.2)
WINDOWS = [
    ("S&P500 2022.11– (CNN)", "SP500", "CNN", "2022-11-01"),
    ("나스닥100 2020.7– (CNN)", "NASDAQ100", "CNN", "2020-07-15"),
    ("나스닥100 1993– (SFG)", "NASDAQ100", "SFG", "1993-01-01"),
    ("나스닥종합 1993– (SFG)", "NASDAQCOM", "SFG", "1993-01-01"),
]


def build(sid):
    px = L.fred(sid).dropna()
    px = px[px > 0]
    c = px.to_numpy()
    S = {"CNN": L.asof_join(px.index, L.cnn_fg()).to_numpy(), "SFG": sfg(components(px), SFG_COLS, 252)}
    vix = L.asof_join(px.index, L.fred("VIXCLS")).to_numpy()
    return px, c, S, vix


if __name__ == "__main__":
    print("| 구간 | 지수 | 정확도(AUC) | 공포일 중앙값 | 탐욕일 중앙값 | VIX 일치 | CNN 상관 | 하루 변동 | ≤20 / ≥80 비율 |")
    print("|---|---|---|---|---|---|---|---|---|")
    for name, sid, sk, start in WINDOWS:
        px, c, S, vix = build(sid)
        fear, greed = truth_labels(c)
        rng = px.index >= start
        idx = {
            "v1": blend(S[sk], price_p(c, V1_P), "linear", 0.4),
            "채택안": ema(blend(S[sk], price_index(c, FINAL_P), "linear", 0.6), FINAL_SPAN),
        }
        if sk == "CNN":
            idx = {"CNN": S["CNN"], **idx}
        for lab, I in idx.items():
            q = quality(I, fear, greed, rng)
            m = rng & ~np.isnan(I) & ~np.isnan(vix)
            vr = -pd.Series(I[m]).corr(pd.Series(vix[m]), method="spearman")
            cr = np.corrcoef(I[rng], S["CNN"][rng])[0, 1] if sk == "CNN" else np.nan
            print(f"| {name} | {lab} | {q['auc']:.3f} | {q['fear']:.0f} | {q['greed']:.0f} | {vr:.2f} | {'—' if np.isnan(cr) else f'{cr:.2f}'} | "
                  f"{q['noise']:.1f} | {q['flo'] * 100:.0f}% / {q['fhi'] * 100:.0f}% |")

    print("\n주요 날짜 (CNN · v1 · 채택안)")
    print("| 날짜 | 상황 | S&P 1년 고점 대비 | S&P CNN / v1 / 채택안 | 나스닥100 1년 고점 대비 | 나스닥100 CNN / v1 / 채택안 |")
    print("|---|---|---|---|---|---|")
    events = [("2022-06-16", "2022 약세장 1차 바닥"), ("2022-10-12", "2022 약세장 바닥"), ("2023-10-27", "2023 가을 조정 바닥"),
              ("2024-08-05", "엔 캐리 청산 급락"), ("2024-12-06", "사상 최고가 부근"), ("2025-04-08", "관세 급락 바닥"),
              ("2025-05-30", "급락 후 회복"), ("2025-07-31", "사상 최고가 부근"), ("2026-03-20", "2026 봄 조정"), ("2026-10-13", "최근")]
    cache = {sid: build(sid) for sid in ("SP500", "NASDAQ100")}
    for d, label in events:
        cells = []
        for sid in ("SP500", "NASDAQ100"):
            px, c, S, _ = cache[sid]
            v1 = blend(S["CNN"], price_p(c, V1_P), "linear", 0.4)
            fin = ema(blend(S["CNN"], price_index(c, FINAL_P), "linear", 0.6), FINAL_SPAN)
            hi = pd.Series(c).rolling(252, min_periods=1).max().to_numpy()
            i = px.index.get_indexer([pd.Timestamp(d)], method="nearest")[0]
            f = lambda x: f"{x:.0f}" if np.isfinite(x) else "—"
            cells += [f"{(c[i] / hi[i] - 1) * 100:+.1f}%", f"{f(S['CNN'][i])} / {f(v1[i])} / {f(fin[i])}"]
        print(f"| {d} | {label} | " + " | ".join(cells) + " |")
