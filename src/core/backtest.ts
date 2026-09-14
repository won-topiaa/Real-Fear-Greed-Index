import { classify } from './classify';
import { THRESHOLDS } from './constants';
import type { IsoDate, RfgRow } from './types';

/** 보고서 §5.2 평가 지표. 앱 화면에는 쓰지 않는다. */

export type StrategyKey = 'rfg-buy' | 'cnn-only-fear65' | 'q4-bear-trap' | 'q1-capitulation' | 'risk';

export interface StrategyStats {
  count: number;
  /** horizons 순서대로 평균 로그 선행수익률 */
  meanReturn: number[];
  medianReturn: number[];
  /** horizons 순서대로 선행수익률 > 0 비율 */
  winRate: number[];
  /** 시그널 이후 maxHorizon 거래일 안의 최저 누적 로그수익률(0 이하). 고통 구간의 깊이. */
  maxUnderwater: number;
  signalsPerYear: number;
}

export interface BacktestReport {
  horizons: number[];
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

  const years = rows.length / perYear;
  const strategies = {} as Record<StrategyKey, StrategyStats>;
  for (const key of Object.keys(conditions) as StrategyKey[]) {
    const idx: number[] = [];
    for (let i = 0; i < rows.length; i++) if (conditions[key](i)) idx.push(i);
    const perH = horizons.map((_, hi) => idx.map((i) => (fwd[hi] as (number | null)[])[i]).filter((v): v is number => v != null));
    let maxUnderwater = 0;
    for (const i of idx) {
      const base = closes[i] as number;
      for (let k = 1; k <= maxH && i + k < closes.length; k++) {
        const r = Math.log((closes[i + k] as number) / base);
        if (r < maxUnderwater) maxUnderwater = r;
      }
    }
    strategies[key] = {
      count: idx.length,
      meanReturn: perH.map(mean),
      medianReturn: perH.map(median),
      winRate: perH.map((xs) => (xs.length === 0 ? NaN : xs.filter((v) => v > 0).length / xs.length)),
      maxUnderwater,
      signalsPerYear: years > 0 ? idx.length / years : NaN,
    };
  }

  const withFg = rows.filter((r) => r.fg != null);
  return {
    horizons,
    strategies,
    fgCoverage: { from: withFg[0]?.date ?? null, to: withFg[withFg.length - 1]?.date ?? null, rowsWithFg: withFg.length },
  };
}
