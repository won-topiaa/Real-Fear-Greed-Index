import { EMPTY, formatBasisLine, formatFrm, formatKst, formatPercent, formatScore, formatTradingDate, formatTradingDaysAgo, weekdayKo } from '../format';

describe('format — 표 테스트', () => {
  test('formatScore', () => {
    expect(formatScore(63.4)).toBe('63');
    expect(formatScore(69.5)).toBe('70');
    expect(formatScore(null)).toBe(EMPTY);
    expect(formatScore(NaN)).toBe(EMPTY);
  });

  test('formatPercent: 유니코드 마이너스, signed', () => {
    expect(formatPercent(-0.0431)).toBe('−4.3%');
    expect(formatPercent(0.0431)).toBe('4.3%');
    expect(formatPercent(0.0431, { signed: true })).toBe('+4.3%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(-0.0004)).toBe('0.0%');
    expect(formatPercent(null)).toBe(EMPTY);
  });

  test('formatFrm', () => {
    expect(formatFrm(0.532)).toBe('0.53배');
    expect(formatFrm(1.5)).toBe('1.50배');
    expect(formatFrm(null)).toBe(EMPTY);
  });

  test('formatKst: UTC+9 고정, 자정 넘김', () => {
    expect(formatKst('2026-09-11T20:00:00Z')).toEqual({ date: '2026-09-12', time: '05:00' });
    expect(formatKst('2026-01-16T21:00:00Z')).toEqual({ date: '2026-01-17', time: '06:00' });
    expect(formatKst('nope')).toEqual({ date: EMPTY, time: EMPTY });
  });

  test('formatTradingDate / weekdayKo', () => {
    expect(formatTradingDate('2026-09-11')).toBe('9월 11일(금)');
    expect(formatTradingDate('2026-09-11', 'short')).toBe('9/11');
    expect(weekdayKo('2026-09-13')).toBe('일');
    expect(formatTradingDate('bad')).toBe(EMPTY);
  });

  test('formatBasisLine', () => {
    expect(formatBasisLine({ closeDate: '2026-09-11', closeAtUtc: '2026-09-11T20:00:00.000Z' })).toBe('미국 9/11(금) 마감 기준 · 한국 9/12 05:00');
  });

  test('formatTradingDaysAgo', () => {
    expect(formatTradingDaysAgo(0)).toBe('오늘');
    expect(formatTradingDaysAgo(2)).toBe('2거래일 전');
  });
});
