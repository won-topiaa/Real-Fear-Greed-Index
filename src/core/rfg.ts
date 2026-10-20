import { alignFgToTradingDays } from './align';
import { DATA_GATES, RFG_PARAMS, assertParams, type DataGates, type RfgParams } from './constants';
import { computePriceDamage } from './damage';
import type { FgPoint, PricePoint, RfgRow } from './types';

/** Fear_t = 100 − FG_t */
export function fearFromFg(fg: number): number {
  return 100 - fg;
}

/** RFG_t = w1·FG_t + w2·(100 − P_t). 평활 전 값(RFG_EMA_SPAN > 1 이면 computeRfgSeries 가 EMA 로 다듬는다) */
export function rfgOf(fg: number, p: number, params: RfgParams = RFG_PARAMS): number {
  return params.W1_SENTIMENT * fg + params.W2_PRICE * (100 - p);
}

/** FRM_t = P_t / (Fear_t + ε). 캡하지 않는다. 표시 게이트는 classify 가 담당. */
export function frmOf(p: number, fear: number, params: RfgParams = RFG_PARAMS): number {
  return p / (fear + params.EPSILON);
}

/**
 * 결측을 건너뛰는 지수이동평균. α = 2 / (span + 1). 첫 유효값에서 시작하고, 결측인 날은 null 을 내고 상태를 유지한다.
 * (pandas ewm(span, adjust=False, ignore_na=True) 와 같은 값 — research/ 와 대조)
 */
export function emaSkipNull(values: readonly (number | null)[], span: number): (number | null)[] {
  if (span <= 1) return [...values];
  const alpha = 2 / (span + 1);
  let state: number | null = null;
  return values.map((x) => {
    if (x == null) return null;
    state = state == null ? x : alpha * x + (1 - alpha) * state;
    return state;
  });
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
  const rows = damage.map((row, i) => {
    const a = aligned[i] ?? { fg: null, fgDate: null, fgStaleDays: null };
    const fear = a.fg == null ? null : fearFromFg(a.fg);
    const rfg = a.fg != null && row.p != null ? rfgOf(a.fg, row.p, params) : null;
    const frm = fear != null && row.p != null ? frmOf(row.p, fear, params) : null;
    return { ...row, fg: a.fg, fgDate: a.fgDate, fgStaleDays: a.fgStaleDays, fear, rfg, frm };
  });
  // RFG_EMA_SPAN > 1 이면 표시용 RFG 를 EMA 로 다듬는다. 구간 판정도 이 값으로 한다. 지금은 1(다듬지 않음) —
  // 다듬으면 심리·가격이 둘 다 오른 날에도 점수가 내리는 날이 생겼다(DESIGN §4.6).
  const smoothed = emaSkipNull(rows.map((r) => r.rfg), params.RFG_EMA_SPAN);
  return rows.map((r, i) => ({ ...r, rfg: smoothed[i] ?? null }));
}
