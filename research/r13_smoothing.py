"""평활 비교: 3일 EMA(2026-10-15 채택) vs 다듬기 없음(2026-10-20 채택) — 같은 가격 구조·같은 심리 결합에서 평활만 바꾼다.

r12 지표(정확도·공포일/탐욕일 중앙값·VIX 일치·CNN 상관·하루 변동·≤20/≥80) 에 화면에서 보이는 지표를 더한다.
  큰 출렁임 : 화면 정수 점수가 하루에 5점 이상 움직인 날 비율
  구간 바뀜 : 5구간(0–24/25–44/45–55/56–75/76–100) 이름이 바뀐 횟수(연 환산)
  방향 어긋남: 심리·실질 가격이 둘 다 오른(내린) 날에 화면 점수는 내린(오른) 날 비율 — 2026-10-19 같은 날
  바닥 시차 : 가격 바닥(1년 고점 −10% 이상, 앞뒤 3개월 최저) 날 기준으로 지수 최저가 며칠 뒤에 오는가(±10일 안)
출력: out/smoothing_tables.md, out/smoothing_daily.csv (차트용)
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from r06_composite import blend
from r10_index_quality import quality, truth_labels
from r11_index_blend import ema, price_index
from r12_final_index import FINAL_P, WINDOWS, build

OUT = Path(__file__).parent / "out"
VARIANTS = {"3일 EMA(이전)": 3, "다듬기 없음(채택)": 1}
BANDS = np.array([24, 44, 55, 75])  # DISPLAY_BANDS 상한(포함)


def screen(x):
    """웹과 같은 정수 반올림(Math.round 는 .5 를 올린다)."""
    return np.floor(x + 0.5)


def band(x):
    return np.searchsorted(BANDS, screen(x), side="left")


def troughs(c, depth=0.10, half=63):
    hi = pd.Series(c).rolling(252, min_periods=1).max().to_numpy()
    lo = pd.Series(c).rolling(2 * half + 1, center=True, min_periods=1).min().to_numpy()
    return np.where((c <= lo) & (c / hi - 1 <= -depth))[0]


def screen_metrics(I, S, G, c, rng):
    m = rng & ~np.isnan(I)
    idx = np.where(m)[0]
    s = screen(I[idx])
    ds = np.diff(s)
    years = len(idx) / 252
    dS, dG = np.diff(S[idx]), np.diff(G[idx])
    both_up, both_dn = (dS > 0) & (dG > 0), (dS < 0) & (dG < 0)
    wrong = (both_up & (ds < 0)) | (both_dn & (ds > 0))
    lags = []
    for t in troughs(c):
        if not m[t]:
            continue
        a, b = max(0, t - 10), min(len(c), t + 11)
        lags.append(int(np.nanargmin(I[a:b])) + a - t)
    return {
        "big": float((np.abs(ds) >= 5).mean()),
        "flips": float((np.diff(band(I[idx])) != 0).sum() / years),
        "wrong": float(wrong.mean()),
        "wrong_n": int(wrong.sum()),
        "lag": float(np.mean(lags)) if lags else np.nan,
        "n_tr": len(lags),
    }


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    lines = [
        "| 구간 | 엔진 | 정확도(AUC) | 공포일 중앙값 | 탐욕일 중앙값 | VIX 일치 | CNN 상관 | 하루 변동 | 5점↑ 출렁임 | 구간 바뀜(연) | 방향 어긋남 | 바닥 시차(일) |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    daily = []
    for name, sid, sk, start in WINDOWS:
        px, c, S, vix = build(sid)
        fear, greed = truth_labels(c)
        rng = px.index >= start
        G = 100 - price_index(c, FINAL_P)
        raw = blend(S[sk], price_index(c, FINAL_P), "linear", 0.6)
        for lab, span in VARIANTS.items():
            I = ema(raw, span)
            q = quality(I, fear, greed, rng)
            mv = rng & ~np.isnan(I) & ~np.isnan(vix)
            vr = -pd.Series(I[mv]).corr(pd.Series(vix[mv]), method="spearman")
            cr = np.corrcoef(I[rng], S["CNN"][rng])[0, 1] if sk == "CNN" else np.nan
            sm = screen_metrics(I, S[sk], G, c, rng)
            lines.append(
                f"| {name} | {lab} | {q['auc']:.3f} | {q['fear']:.0f} | {q['greed']:.0f} | {vr:.2f} | {'—' if np.isnan(cr) else f'{cr:.2f}'} | "
                f"{q['noise']:.1f} | {sm['big'] * 100:.0f}% | {sm['flips']:.0f} | {sm['wrong'] * 100:.1f}% ({sm['wrong_n']}일) | "
                f"{sm['lag']:+.1f} ({sm['n_tr']}개) |"
            )
        if sk == "CNN" and sid in ("SP500", "NASDAQ100"):
            d = pd.DataFrame({"date": px.index, "market": sid, "close": c, "cnn": S["CNN"], "price": G,
                              "ema3": ema(raw, 3), "raw": raw})
            daily.append(d[rng])

    df = pd.concat(daily)
    df.round(2).to_csv(OUT / "smoothing_daily.csv", index=False)

    lines += ["", "주요 날짜 (CNN / 3일 EMA / 다듬기 없음)", "",
              "| 날짜 | 상황 | S&P 500 | 나스닥 100 |", "|---|---|---|---|"]
    events = [("2022-06-16", "2022 약세장 1차 바닥"), ("2022-10-12", "2022 약세장 바닥"), ("2023-10-27", "2023 가을 조정 바닥"),
              ("2024-08-05", "엔 캐리 청산 급락"), ("2024-12-06", "사상 최고가 부근"), ("2025-04-03", "관세 발표 다음 날"),
              ("2025-04-08", "관세 급락 바닥"), ("2025-04-09", "관세 유예 급반등"), ("2025-05-30", "급락 후 회복"),
              ("2026-03-20", "2026 봄 조정"), ("2026-10-14", "최근 급락"), ("2026-10-16", "최근"), ("2026-10-19", "최근")]
    f = lambda x: f"{x:.0f}" if np.isfinite(x) else "—"
    for d, label in events:
        cells = []
        for sid in ("SP500", "NASDAQ100"):
            r = df[(df.market == sid) & (df.date == d)]
            cells.append("—" if r.empty else f"{f(r.cnn.iloc[0])} / {f(r.ema3.iloc[0])} / {f(r.raw.iloc[0])}")
        lines.append(f"| {d} | {label} | " + " | ".join(cells) + " |")

    text = "\n".join(lines)
    (OUT / "smoothing_tables.md").write_text(text + "\n")
    print(text)
