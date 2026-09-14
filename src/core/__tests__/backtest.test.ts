import { evaluateSignals, forwardReturns } from '../backtest';
import { computeRfgSeries } from '../rfg';
import { FG_POINTS, PRICES, TINY_PARAMS } from '../__fixtures__/tiny';

describe('backtest — 보고서 §5.2', () => {
  test('forwardReturns: ln(close[t+h]/close[t]), 끝은 null', () => {
    const r = forwardReturns([100, 110, 121], 1);
    expect(r[0]).toBeCloseTo(Math.log(1.1), 10);
    expect(r[1]).toBeCloseTo(Math.log(1.1), 10);
    expect(r[2]).toBeNull();
  });

  test('evaluateSignals: 다섯 전략 모두 통계를 내고 FG 커버리지를 보고한다', () => {
    const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS);
    const report = evaluateSignals(rows, { horizons: [1, 2] });
    expect(report.horizons).toEqual([1, 2]);
    expect(Object.keys(report.strategies).sort()).toEqual(['cnn-only-fear65', 'q1-capitulation', 'q4-bear-trap', 'rfg-buy', 'risk']);
    // fear ≥ 65: FG 40 (i=5) → Fear 60 아님; 픽스처에서 Fear ≥ 65 인 행 없음
    expect(report.strategies['cnn-only-fear65'].count).toBe(0);
    // i=7: Fear 20, P 33.3 → Q3? Fear<40 ∧ P<40 → Q3. i=8,9: Fear 18/10, P 0 → Q3. i=6: Fear 45, P 66.7 → NEUTRAL
    expect(report.strategies['q4-bear-trap'].count).toBe(0);
    expect(report.strategies['q1-capitulation'].count).toBe(0);
    expect(report.strategies.risk.count).toBe(0);
    expect(report.fgCoverage).toEqual({ from: '2026-08-03', to: '2026-08-14', rowsWithFg: 10 });
    expect(report.strategies['rfg-buy'].maxUnderwater).toBeLessThanOrEqual(0);
  });

  test('maxUnderwater 는 시그널 이후 최저 누적 로그수익률', () => {
    // RFG 를 강제로 낮춰 첫 행에서 buy 가 나오게 한다
    const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS).map((r, i) => (i === 0 ? { ...r, rfg: 10 } : r));
    const report = evaluateSignals(rows, { horizons: [1] });
    expect(report.strategies['rfg-buy'].count).toBe(1);
    // 100 → 최저 99 (i=5) 이내 horizon 1 안이라 [1] 창은 102 → 최저 없음 → 0
    expect(report.strategies['rfg-buy'].maxUnderwater).toBe(0);
    const r60 = evaluateSignals(rows, { horizons: [6] });
    expect(r60.strategies['rfg-buy'].maxUnderwater).toBeCloseTo(Math.log(99 / 100), 10);
  });
});
