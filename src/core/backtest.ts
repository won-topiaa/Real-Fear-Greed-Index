import { classify } from './classify';
import { THRESHOLDS } from './constants';
import type { IsoDate, RfgRow } from './types';

/** 보고서 §5.2 평가 지표. 앱 화면에는 쓰지 않는다. */

export type StrategyKey = 'rfg-buy' | 'cnn-only-fear65' | 'q4-bear-trap' | 'q1-capitulation' | 'risk';

export interface StrategyStats {
  /** 시그널이 켜진 거래일 수 */
  count: number;
  /** 연속된 시그널 일을 하나로 묶은 사건 수 */
  events: number;
  /** horizons 순서대로, 선행수익률을 잴 수 있었던 시그널 일 수 */
  n: number[];
  /** horizons 순서대로 평균 로그 선행수익률 */
  meanReturn: number[];
  medianReturn: number[];
  /** horizons 순서대로 선행수익률 > 0 비율 */
  winRate: number[];
  /** horizons 순서대로 신호 대 잡음비 = 평균 / 표본표준편차 (n < 2 면 NaN) */
  snr: number[];
  /** 시그널 이후 maxHorizon 거래일 안의 최저 누적 로그수익률 — 전체 시그널 중 최악(0 이하) */
  maxUnderwater: number;
  /** 시그널별 최저 누적 로그수익률의 평균(0 이하) */
  meanUnderwater: number;
  /** 시그널별로 누적수익률이 0 미만인 상태가 이어진 거래일 수의 평균(고통 구간 길이, 최대 maxHorizon) */
  meanUnderwaterDays: number;
  /** 평가 가능 구간(P 와 FG 가 모두 있는 행) 기준 연간 시그널 수 */
  signalsPerYear: number;
}

export interface BacktestReport {
  horizons: number[];
  /** 평가 가능 행 수(P·FG 모두 있음). signalsPerYear 의 분모. */
  evaluableRows: number;
  strategies: Record<StrategyKey, StrategyStats>;
  fgCoverage: { from: IsoDate | null; to: IsoDate | null; rowsWithFg: number };
}

/** ln(close[t+h] / close[t]). t+h 가 범위를 벗어나면 null. */
export function forwardReturns(closes: readonly number[], horizon: number): (number | null)[] {
  return closes.map((c, t) => {
    const f = closes[t + horizon];
    if (f == null || c == null || !(c > 0) || !(f > 0)) return null;
    return Math.log(f / c);
  });
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sampleStd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

/** 시그널 i 이후 maxH 일 안의 최저 누적수익률과 수면 아래 기간 */
function underwaterOf(closes: readonly number[], i: number, maxH: number): { depth: number; days: number } {
  const base = closes[i] as number;
  let depth = 0;
  let days = 0;
  let recovered = false;
  for (let k = 1; k <= maxH && i + k < closes.length; k++) {
    const r = Math.log((closes[i + k] as number) / base);
    if (r < depth) depth = r;
    if (!recovered) {
      if (r < 0) days++;
      else recovered = true;
    }
  }
  return { depth, days };
}

export function evaluateSignals(
  rows: readonly RfgRow[],
  opts: { horizons?: number[]; thresholds?: typeof THRESHOLDS; tradingDaysPerYear?: number } = {},
): BacktestReport {
  const horizons = opts.horizons ?? [5, 20, 60];
  const t = opts.thresholds ?? THRESHOLDS;
  const perYear = opts.tradingDaysPerYear ?? 252;
  const closes = rows.map((r) => r.close);
  const fwd = horizons.map((h) => forwardReturns(closes, h));
  const maxH = Math.max(...horizons);
  const cls = rows.map((r) => classify(r, t));
  const evaluableRows = rows.filter((r) => r.p != null && r.fg != null).length;
  const years = evaluableRows / perYear;

  const conditions: Record<StrategyKey, (i: number) => boolean> = {
    'rfg-buy': (i) => (cls[i] as ReturnType<typeof classify>).signals.buy,
    'cnn-only-fear65': (i) => {
      const fear = (cls[i] as ReturnType<typeof classify>).rounded.fear;
      return fear != null && fear >= t.SIGNAL_BUY.FEAR_MIN;
    },
    'q4-bear-trap': (i) => (cls[i] as ReturnType<typeof classify>).quadrant === 'Q4',
    'q1-capitulation': (i) => (cls[i] as ReturnType<typeof classify>).quadrant === 'Q1',
    risk: (i) => (cls[i] as ReturnType<typeof classify>).signals.risk,
  };

  const strategies = {} as Record<StrategyKey, StrategyStats>;
  for (const key of Object.keys(conditions) as StrategyKey[]) {
    const idx: number[] = [];
    for (let i = 0; i < rows.length; i++) if (conditions[key](i)) idx.push(i);
    const perH = horizons.map((_, hi) => idx.map((i) => (fwd[hi] as (number | null)[])[i]).filter((v): v is number => v != null));
    const uw = idx.map((i) => underwaterOf(closes, i, maxH));
    let events = 0;
    idx.forEach((i, k) => {
      if (k === 0 || i !== (idx[k - 1] as number) + 1) events++;
    });
    strategies[key] = {
      count: idx.length,
      events,
      n: perH.map((xs) => xs.length),
      meanReturn: perH.map(mean),
      medianReturn: perH.map(median),
      winRate: perH.map((xs) => (xs.length === 0 ? NaN : xs.filter((v) => v > 0).length / xs.length)),
      snr: perH.map((xs) => {
        const sd = sampleStd(xs);
        return Number.isFinite(sd) && sd > 0 ? mean(xs) / sd : NaN;
      }),
      maxUnderwater: uw.length === 0 ? 0 : Math.min(0, ...uw.map((u) => u.depth)),
      meanUnderwater: uw.length === 0 ? NaN : mean(uw.map((u) => u.depth)),
      meanUnderwaterDays: uw.length === 0 ? NaN : mean(uw.map((u) => u.days)),
      signalsPerYear: years > 0 ? idx.length / years : NaN,
    };
  }

  const withFg = rows.filter((r) => r.fg != null);
  return {
    horizons,
    evaluableRows,
    strategies,
    fgCoverage: { from: withFg[0]?.date ?? null, to: withFg[withFg.length - 1]?.date ?? null, rowsWithFg: withFg.length },
  };
}
