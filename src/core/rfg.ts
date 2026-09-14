import { alignFgToTradingDays } from './align';
import { DATA_GATES, RFG_PARAMS, assertParams, type DataGates, type RfgParams } from './constants';
import { computePriceDamage } from './damage';
import type { FgPoint, PricePoint, RfgRow } from './types';

/** Fear_t = 100 − FG_t */
export function fearFromFg(fg: number): number {
  return 100 - fg;
}

/** RFG_t = w1·FG_t + w2·(100 − P_t) */
export function rfgOf(fg: number, p: number, params: RfgParams = RFG_PARAMS): number {
  return params.W1_SENTIMENT * fg + params.W2_PRICE * (100 - p);
}

/** FRM_t = P_t / (Fear_t + ε). 캡하지 않는다. 표시 게이트는 classify 가 담당. */
export function frmOf(p: number, fear: number, params: RfgParams = RFG_PARAMS): number {
  return p / (fear + params.EPSILON);
}

/**
 * 종가 + FG 관측 → RFG 행 시계열. 파이프라인·백테스트·목 픽스처 생성이 모두 이 함수를 쓴다.
 * 마스터 달력은 종가 날짜. FG 는 as-of 조인(gates.FG_MAX_STALENESS_DAYS).
 */
export function computeRfgSeries(
  prices: readonly PricePoint[],
  fg: readonly FgPoint[],
  params: RfgParams = RFG_PARAMS,
  gates: DataGates = DATA_GATES,
): RfgRow[] {
  assertParams(params);
  const damage = computePriceDamage(prices, params);
  const aligned = alignFgToTradingDays(
    prices.map((x) => x.date),
    fg,
    gates.FG_MAX_STALENESS_DAYS,
  );
  return damage.map((row, i) => {
    const a = aligned[i] ?? { fg: null, fgDate: null, fgStaleDays: null };
    const fear = a.fg == null ? null : fearFromFg(a.fg);
    const rfg = a.fg != null && row.p != null ? rfgOf(a.fg, row.p, params) : null;
    const frm = fear != null && row.p != null ? frmOf(row.p, fear, params) : null;
    return { ...row, fg: a.fg, fgDate: a.fgDate, fgStaleDays: a.fgStaleDays, fear, rfg, frm };
  });
}
