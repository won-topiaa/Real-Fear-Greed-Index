import { RFG_PARAMS, type RfgParams } from './constants';
import { rollingDisparity, rollingDrawdown, rollingPercentileRank, rollingRealizedVol } from './series';
import type { DamageRow, PricePoint } from './types';

/** Composite_Damage_t = α·(−DD_t) + β·(−DISP_t) + γ·RV_t. 하나라도 null 이면 null. */
export function compositeDamage(
  dd: number | null,
  disp: number | null,
  rv: number | null,
  p: RfgParams = RFG_PARAMS,
): number | null {
  if (dd == null || disp == null || rv == null) return null;
  return p.ALPHA_DD * -dd + p.BETA_DISP * -disp + p.GAMMA_RV * rv;
}

/** 종가 시계열 → DD/DISP/RV/Composite/P 행. FG 는 여기서 다루지 않는다. */
export function computePriceDamage(prices: readonly PricePoint[], p: RfgParams = RFG_PARAMS): DamageRow[] {
  const closes = prices.map((x) => x.close);
  const dd = rollingDrawdown(closes, p.DD_WINDOW_N);
  const disp = rollingDisparity(closes, p.SMA_WINDOW_M);
  const rv = rollingRealizedVol(closes, p.RV_WINDOW_K, p.ANNUALIZATION_DAYS);
  const composite = closes.map((_, t) => compositeDamage(dd[t] ?? null, disp[t] ?? null, rv[t] ?? null, p));
  const pct = rollingPercentileRank(composite, p.PERCENTILE_WINDOW_W);
  return prices.map((pt, t) => ({
    date: pt.date,
    close: pt.close,
    dd: dd[t] ?? null,
    disp: disp[t] ?? null,
    rv: rv[t] ?? null,
    composite: composite[t] ?? null,
    p: pct[t] ?? null,
  }));
}
