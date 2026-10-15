import { RFG_PARAMS, type RfgParams } from './constants';
import { rollingDisparity, rollingDrawdown, rollingPercentileRank, rollingRealizedVol } from './series';
import type { DamageRow, PricePoint } from './types';

/**
 * P_t = [α·pct(−DD)_t + β·pct(−DISP)_t + γ·pct(RV)_t] / (α + β + γ)   (v2, DESIGN §4)
 * 입력은 성분별 W 롤링 백분위(0~100). 하나라도 null 이면 null. 결과도 0~100.
 * v1 은 원시값을 먼저 합성한 뒤 백분위를 냈다 — 단위가 다른 성분(낙폭·이격도·연율 변동성)이 섞여 변동성이 지배했다.
 */
export function compositeDamage(
  pdd: number | null,
  pdisp: number | null,
  prv: number | null,
  p: RfgParams = RFG_PARAMS,
): number | null {
  if (pdd == null || pdisp == null || prv == null) return null;
  return (p.ALPHA_DD * pdd + p.BETA_DISP * pdisp + p.GAMMA_RV * prv) / (p.ALPHA_DD + p.BETA_DISP + p.GAMMA_RV);
}

const negate = (xs: readonly (number | null)[]): (number | null)[] => xs.map((x) => (x == null ? null : -x));

export interface ComponentSeries {
  dd: (number | null)[];
  disp: (number | null)[];
  rv: (number | null)[];
  /** 성분별 W 롤링 백분위(0~100, 클수록 훼손). 낙폭·이격도는 부호를 뒤집어 백분위를 낸다. */
  pdd: (number | null)[];
  pdisp: (number | null)[];
  prv: (number | null)[];
}

/** 종가 → 세 성분의 원시값과 성분별 백분위. computePriceDamage 와 웹 구성 요소 카드가 같이 쓴다. */
export function computeComponentSeries(prices: readonly PricePoint[], p: RfgParams = RFG_PARAMS): ComponentSeries {
  const closes = prices.map((x) => x.close);
  const dd = rollingDrawdown(closes, p.DD_WINDOW_N);
  const disp = rollingDisparity(closes, p.SMA_WINDOW_M);
  const rv = rollingRealizedVol(closes, p.RV_WINDOW_K, p.ANNUALIZATION_DAYS);
  return {
    dd,
    disp,
    rv,
    pdd: rollingPercentileRank(negate(dd), p.PERCENTILE_WINDOW_W),
    pdisp: rollingPercentileRank(negate(disp), p.PERCENTILE_WINDOW_W),
    prv: rollingPercentileRank(rv, p.PERCENTILE_WINDOW_W),
  };
}

/** 종가 시계열 → DD/DISP/RV/Composite/P 행. FG 는 여기서 다루지 않는다. v2 에서 composite 는 P 와 같은 값이다. */
export function computePriceDamage(prices: readonly PricePoint[], p: RfgParams = RFG_PARAMS): DamageRow[] {
  const { dd, disp, rv, pdd, pdisp, prv } = computeComponentSeries(prices, p);
  return prices.map((pt, t) => {
    const composite = compositeDamage(pdd[t] ?? null, pdisp[t] ?? null, prv[t] ?? null, p);
    return {
      date: pt.date,
      close: pt.close,
      dd: dd[t] ?? null,
      disp: disp[t] ?? null,
      rv: rv[t] ?? null,
      composite,
      p: composite,
    };
  });
}
