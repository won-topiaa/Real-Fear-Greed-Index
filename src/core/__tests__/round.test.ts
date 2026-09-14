import { roundForDisplay, roundTo } from '../round';

describe('roundTo — 반올림 한 곳', () => {
  test('정수 반올림, .5 는 올림', () => {
    expect(roundTo(69.5, 0)).toBe(70);
    expect(roundTo(69.49, 0)).toBe(69);
    expect(roundTo(20.4, 0)).toBe(20);
  });

  test('이진 표현 오차 흡수: 1.005 → 1.01, 1.495 → 1.50', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(1.495, 2)).toBe(1.5);
    expect(roundTo(1.505, 2)).toBe(1.51);
  });

  test('−0 은 0 으로', () => {
    expect(Object.is(roundTo(-0.04, 1), 0)).toBe(true);
  });

  test('비유한수는 그대로', () => {
    expect(roundTo(NaN, 1)).toBeNaN();
  });
});

describe('roundForDisplay', () => {
  test('점수 정수, FRM 소수 2자리, null 전파', () => {
    expect(roundForDisplay({ fg: 40.6, fear: 59.4, p: null, rfg: 57.55, frm: 0.5327 })).toEqual({
      fg: 41,
      fear: 59,
      p: null,
      rfg: 58,
      frm: 0.53,
    });
  });
});
