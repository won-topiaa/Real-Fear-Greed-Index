import {
  computeLogReturns,
  rollingDisparity,
  rollingDrawdown,
  rollingPercentileRank,
  rollingRealizedVol,
  rollingSma,
} from '../series';
import { CLOSES, EXPECTED, TINY_PARAMS, expectSeries } from '../__fixtures__/tiny';

describe('series — 보고서 §2.2 롤링 지표 (손계산 픽스처)', () => {
  test('r_t = ln(Close_t / Close_{t-1}), r[0] 은 null', () => {
    expectSeries(computeLogReturns(CLOSES), EXPECTED.r);
  });

  test('DD_t: 현재 포함 N개 창의 고점 대비, 창 미달은 null', () => {
    expectSeries(rollingDrawdown(CLOSES, TINY_PARAMS.DD_WINDOW_N), EXPECTED.dd);
  });

  test('DISP_t: SMA_M 대비 이격도', () => {
    expectSeries(rollingDisparity(CLOSES, TINY_PARAMS.SMA_WINDOW_M), EXPECTED.disp);
    const sma = rollingSma(CLOSES, 3);
    expect(sma[3]).toBeCloseTo((102 + 101 + 105) / 3, 10);
  });

  test('RV_t: 표본표준편차(K−1)·평균 차감·√252, 종가 K+1개 필요', () => {
    expectSeries(rollingRealizedVol(CLOSES, TINY_PARAMS.RV_WINDOW_K, TINY_PARAMS.ANNUALIZATION_DAYS), EXPECTED.rv);
  });

  test('RV 검산 i=3: 수익률 창 평균 0.016264, 표본분산 6.0215e−4', () => {
    const r = [0.019803, -0.009852, 0.03884];
    const mean = r.reduce((a, b) => a + b, 0) / 3;
    const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / 2;
    expect(Math.sqrt(252) * Math.sqrt(v)).toBeCloseTo(0.389533, 4);
  });
});

describe('rollingPercentileRank — DESIGN §4.1 확정 정의', () => {
  test('단조 증가 → 마지막 100, 단조 감소 → 0', () => {
    expect(rollingPercentileRank([1, 2, 3, 4, 5], 5)[4]).toBe(100);
    expect(rollingPercentileRank([5, 4, 3, 2, 1], 5)[4]).toBe(0);
  });

  test('전부 동률 → 50', () => {
    expect(rollingPercentileRank([7, 7, 7, 7], 4)[3]).toBe(50);
  });

  test('창 미달과 창 안 null 은 null', () => {
    const out = rollingPercentileRank([null, 1, 2, 3, 4], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull(); // 창 [null,1,2]
    expect(out[3]).toBe(100); // 창 [1,2,3]
    expect(out[4]).toBe(100);
  });

  test('정확식: (#less + 0.5·(#eq − 1)) / (W − 1) × 100', () => {
    // 창 [1, 2, 2, 3], 현재 2 → less 1, eq 2 → (1 + 0.5) / 3 = 50
    expect(rollingPercentileRank([1, 2, 3, 2], 4)[3]).toBeCloseTo(50, 10);
    // 창 [3, 1, 2, 2], 현재 2 → less 1, eq 2 → 50 ; 창 [1,3,2,2.5] 현재 2.5 → less 2 → 2/3
    expect(rollingPercentileRank([1, 3, 2, 2.5], 4)[3]).toBeCloseTo((2 / 3) * 100, 10);
  });

  test('픽스처 P 열과 일치', () => {
    expectSeries(rollingPercentileRank(EXPECTED.composite, TINY_PARAMS.PERCENTILE_WINDOW_W), EXPECTED.p, 3);
  });

  test('W < 2 면 전부 null', () => {
    expect(rollingPercentileRank([1, 2, 3], 1)).toEqual([null, null, null]);
  });
});
