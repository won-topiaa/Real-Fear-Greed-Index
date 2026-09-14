import { DATA_GATES, RFG_PARAMS, assertParams, minClosesForSnapshot, minClosesRequired } from '../constants';
import { computeRfgSeries, fearFromFg, frmOf, rfgOf } from '../rfg';
import { EXPECTED, FG_POINTS, PRICES, TINY_PARAMS, expectSeries } from '../__fixtures__/tiny';

describe('rfg — 모델 A/B 와 시계열 조립', () => {
  test('Fear_t = 100 − FG_t', () => {
    expect(fearFromFg(41)).toBe(59);
  });

  test('RFG_t = 0.4·FG + 0.6·(100 − P), FRM_t = P / (Fear + ε)', () => {
    expect(rfgOf(55, 200 / 3)).toBeCloseTo(42, 10);
    expect(frmOf(200 / 3, 45)).toBeCloseTo((200 / 3) / (45 + 1e-5), 10);
  });

  test('computeRfgSeries 가 손계산 표 전체와 일치', () => {
    const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS);
    expectSeries(rows.map((r) => r.dd), EXPECTED.dd);
    expectSeries(rows.map((r) => r.disp), EXPECTED.disp);
    expectSeries(rows.map((r) => r.rv), EXPECTED.rv);
    expectSeries(rows.map((r) => r.composite), EXPECTED.composite);
    expectSeries(rows.map((r) => r.p), EXPECTED.p, 3);
    expectSeries(rows.map((r) => r.fear), EXPECTED.fear);
    expectSeries(rows.map((r) => r.rfg), EXPECTED.rfg, 3);
    expectSeries(rows.map((r) => r.frm), EXPECTED.frm, 3);
    expect(rows.every((r, i) => r.fgDate === PRICES[i]?.date && r.fgStaleDays === 0)).toBe(true);
  });

  test('첫 P 인덱스 = max(N,M,K+1) − 1 + W − 1 = 6, minClosesRequired(tiny) = 7', () => {
    const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS);
    expect(rows[5]?.p).toBeNull();
    expect(rows[6]?.p).not.toBeNull();
    expect(minClosesRequired(TINY_PARAMS)).toBe(7);
  });

  test('운영 상수: minClosesRequired = 311, minClosesForSnapshot = 370 (DATA_GATES 와 일치)', () => {
    expect(minClosesRequired(RFG_PARAMS)).toBe(311);
    expect(minClosesRequired()).toBe(DATA_GATES.MIN_CLOSES);
    expect(minClosesForSnapshot()).toBe(DATA_GATES.MIN_CLOSES_FOR_SNAPSHOT);
    expect(minClosesForSnapshot()).toBe(DATA_GATES.MIN_CLOSES + DATA_GATES.HISTORY_DAYS - 1);
  });

  test('assertParams: w1 + w2 ≠ 1 이면 throw', () => {
    expect(() => assertParams({ ...RFG_PARAMS, W1_SENTIMENT: 0.5 })).toThrow(/w1 \+ w2/);
    expect(() => assertParams({ ...RFG_PARAMS, DD_WINDOW_N: 1 })).toThrow(/DD_WINDOW_N/);
    expect(() => assertParams(RFG_PARAMS)).not.toThrow();
  });

  test('FG 가 없는 거래일은 fg/fear/rfg/frm 만 null, P 는 계산', () => {
    const rows = computeRfgSeries(PRICES, [], TINY_PARAMS);
    expect(rows[6]?.p).not.toBeNull();
    expect(rows[6]?.fg).toBeNull();
    expect(rows[6]?.rfg).toBeNull();
    expect(rows[6]?.frm).toBeNull();
  });
});
