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

  test('evaluateSignals: 다섯 전략 모두 통계를 내고 FG 커버리지·평가 가능 행 수를 보고한다', () => {
    const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS);
    const report = evaluateSignals(rows, { horizons: [1, 2] });
    expect(report.horizons).toEqual([1, 2]);
    expect(Object.keys(report.strategies).sort()).toEqual(['cnn-only-fear65', 'q1-capitulation', 'q4-bear-trap', 'rfg-buy', 'risk']);
    // 픽스처에서 Fear ≥ 65 인 행 없음; P 는 i=6 부터 → 평가 가능 행 4개
    expect(report.strategies['cnn-only-fear65'].count).toBe(0);
    expect(report.strategies['q4-bear-trap'].count).toBe(0);
    expect(report.strategies['q1-capitulation'].count).toBe(0);
    expect(report.strategies.risk.count).toBe(0);
    expect(report.evaluableRows).toBe(4);
    expect(report.fgCoverage).toEqual({ from: '2026-08-03', to: '2026-08-14', rowsWithFg: 10 });
  });

  test('강제 시그널 1건(i=0): n·평균·승률·SNR·사건 수·underwater 를 손계산과 대조', () => {
    const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS).map((r, i) => (i === 0 ? { ...r, rfg: 10 } : r));
    const report = evaluateSignals(rows, { horizons: [1, 2] });
    const s = report.strategies['rfg-buy'];
    expect(s.count).toBe(1);
    expect(s.events).toBe(1);
    expect(s.n).toEqual([1, 1]);
    // 100 → 102 (T+1), 100 → 101 (T+2)
    expect(s.meanReturn[0]).toBeCloseTo(Math.log(1.02), 10);
    expect(s.meanReturn[1]).toBeCloseTo(Math.log(1.01), 10);
    expect(s.medianReturn).toEqual(s.meanReturn);
    expect(s.winRate).toEqual([1, 1]);
    expect(s.snr.every((v) => Number.isNaN(v))).toBe(true); // n = 1 → 표준편차 없음
    // horizon 2 안에서는 100 아래로 내려가지 않음
    expect(s.maxUnderwater).toBe(0);
    expect(s.meanUnderwater).toBe(0);
    expect(s.meanUnderwaterDays).toBe(0);
    // 평가 가능 행 4개 → 연 환산 = 1 / (4/252)
    expect(s.signalsPerYear).toBeCloseTo(252 / 4, 10);
  });

  test('underwater: 시그널 이후 최저 누적 로그수익률과 수면 아래 기간', () => {
    // i=3(105) 에 시그널: 이후 103, 99, 104, 106, ... → 최저 ln(99/105), 105 아래 기간 2일(103, 99) 후 104 에서도 아직 <105 → 3일, 106 에서 회복
    const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS).map((r, i) => (i === 3 ? { ...r, rfg: 10 } : r));
    const s = evaluateSignals(rows, { horizons: [6] }).strategies['rfg-buy'];
    expect(s.maxUnderwater).toBeCloseTo(Math.log(99 / 105), 10);
    expect(s.meanUnderwaterDays).toBe(3);
  });

  test('연속된 시그널 일은 하나의 사건으로 센다; 승률은 > 0 만 센다', () => {
    const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS).map((r, i) => (i === 7 || i === 8 ? { ...r, rfg: 10 } : r));
    const s = evaluateSignals(rows, { horizons: [1] }).strategies['rfg-buy'];
    expect(s.count).toBe(2);
    expect(s.events).toBe(1);
    // i=7: 106 → 106 (0, 승리 아님), i=8: 106 → 110 (양수)
    expect(s.n).toEqual([2]);
    expect(s.winRate[0]).toBe(0.5);
    expect(s.snr[0]).toBeCloseTo(Math.log(110 / 106) / 2 / Math.sqrt(((Math.log(110 / 106) / 2) ** 2 * 2) / 1), 10);
  });
});
