"""TS 엔진(v2)과 이 연구 코드의 값이 같은지 proxy 가 만든 스냅샷으로 확인한다."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rfg_lib as L

snap = json.load(open(Path(__file__).parent.parent / "proxy/public/v1/snapshot.json"))
fg = L.cnn_fg()
for sym, sid in [("SPX", "SP500"), ("NDX", "NASDAQ100")]:
    s = L.fred(sid).dropna()
    s = s[s.index >= "2015-01-01"] if sid == "NASDAQ100" else s  # proxy 는 FRED 를 observation_start 없이 받되 SPX 는 10년뿐
    c = s.to_numpy()
    dd, disp, rv = L.rolling_drawdown(c, 252), L.rolling_disparity(c, 200), L.realized_vol(c, 20)
    comp = 0.5 * L.rolling_pct(-dd, 1260) + 0.3 * L.rolling_pct(-disp, 1260) + 0.2 * L.rolling_pct(rv, 1260)
    p = comp
    f = L.asof_join(s.index, fg).to_numpy()
    rfg = 0.6 * f + 0.4 * (100 - p)  # RFG_EMA_SPAN = 1(다듬지 않음, 2026-10-20)
    i = s.index.get_loc(pd.Timestamp(snap["markets"][sym]["closeDate"]))
    got = dict(dd=dd[i], disp=disp[i], rv=rv[i], composite=comp[i], p=p[i], fg=f[i], rfg=rfg[i])
    want = snap["markets"][sym]["latest"]
    print(sym, "  ".join(f"{k}: {got[k]:.6f} vs {want[k]:.6f}" for k in got))
