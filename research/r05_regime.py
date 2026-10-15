"""가설: 가격 훼손의 역발상 효과는 장기 추세 국면에 따라 갈린다.
P(현재 엔진) 5분위 × 국면(종가 vs 200일선)별 60·120일 선행 로그수익률 평균."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L

SETS = [("NASDAQCOM", "1973-01-01"), ("NIKKEI225", "1955-01-01"), ("NASDAQ100", "1990-01-01"), ("SP500", "2017-10-15")]
for sid, start in SETS:
    s = L.fred(sid).dropna()
    s = s[s > 0]
    c = s.to_numpy()
    P = L.rolling_pct(0.5 * -L.rolling_drawdown(c, 60) + 0.3 * -L.rolling_disparity(c, 50) + 0.2 * L.realized_vol(c, 20), 252)
    sma200 = pd.Series(c).rolling(200).mean().to_numpy()
    up = c > sma200
    for h in (60, 120):
        f = L.fwd_returns(c, h)
        m = (s.index >= start) & ~np.isnan(P) & ~np.isnan(f) & ~np.isnan(sma200)
        q = np.digitize(P, [20, 40, 60, 80])  # 0..4 (4 = 훼손 최상위)
        lines = []
        for name, reg in (("상승추세", up), ("하락추세", ~up)):
            cells = []
            for k in range(5):
                sel = m & reg & (q == k)
                cells.append(f"{f[sel].mean()*100:+6.1f}%({sel.sum():5d})" if sel.sum() > 30 else "     -       ")
            lines.append(f"  {name} " + " ".join(cells))
        print(f"\n== {sid} h={h}  전체평균 {f[m].mean()*100:+.1f}%   P 5분위: 낮은 훼손 → 높은 훼손")
        print("\n".join(lines))
