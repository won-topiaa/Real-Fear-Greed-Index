import { DATA_GATES } from '../constants';
import type { PricePoint } from '../types';
import { crossCheckPriceSeries, validateFgSeries, validatePriceSeries } from '../validate';

const gates = { ...DATA_GATES, MIN_CLOSES: 3 };

function codes(issues: { code: string }[]): string[] {
  return issues.map((i) => i.code);
}

describe('validatePriceSeries', () => {
  test('정상 시계열은 issue 없음', () => {
    const ok: PricePoint[] = [
      { date: '2026-09-09', close: 100 },
      { date: '2026-09-10', close: 101 },
      { date: '2026-09-11', close: 102 },
    ];
    expect(validatePriceSeries(ok, gates)).toEqual([]);
  });

  test('역순 → unsorted, 중복 → duplicate-date (fatal)', () => {
    const rev: PricePoint[] = [
      { date: '2026-09-11', close: 100 },
      { date: '2026-09-10', close: 101 },
      { date: '2026-09-10', close: 102 },
    ];
    const issues = validatePriceSeries(rev, gates);
    expect(codes(issues)).toEqual(expect.arrayContaining(['unsorted', 'duplicate-date']));
    expect(issues.every((i) => i.fatal)).toBe(true);
  });

  test('NaN → non-finite, 0 → non-positive', () => {
    const bad: PricePoint[] = [
      { date: '2026-09-09', close: NaN },
      { date: '2026-09-10', close: 0 },
      { date: '2026-09-11', close: 100 },
    ];
    expect(codes(validatePriceSeries(bad, gates))).toEqual(expect.arrayContaining(['non-finite', 'non-positive']));
  });

  test('|로그수익률| > 0.25 → jump (fatal); 26% 갭', () => {
    const jump: PricePoint[] = [
      { date: '2026-09-09', close: 100 },
      { date: '2026-09-10', close: 130 },
      { date: '2026-09-11', close: 131 },
    ];
    const issues = validatePriceSeries(jump, gates);
    expect(codes(issues)).toContain('jump');
    expect(issues.find((i) => i.code === 'jump')?.fatal).toBe(true);
  });

  test('달력 간격 > 5일 → gap (경고, non-fatal)', () => {
    const gap: PricePoint[] = [
      { date: '2026-09-01', close: 100 },
      { date: '2026-09-13', close: 101 },
      { date: '2026-09-14', close: 102 },
    ];
    const issues = validatePriceSeries(gap, gates);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'gap', fatal: false });
  });

  test('길이 < MIN_CLOSES → too-short (fatal); 운영 게이트는 311', () => {
    const short: PricePoint[] = [{ date: '2026-09-11', close: 100 }];
    expect(validatePriceSeries(short)).toContainEqual(expect.objectContaining({ code: 'too-short', fatal: true, detail: '1 < 311' }));
  });
});

describe('crossCheckPriceSeries', () => {
  const a: PricePoint[] = [
    { date: '2026-09-09', close: 100 },
    { date: '2026-09-10', close: 101 },
    { date: '2026-09-11', close: 102 },
  ];
  test('0.1% 이내면 issue 없음, 넘으면 source-mismatch(경고)', () => {
    const same = a.map((p) => ({ ...p, close: p.close * 1.0005 }));
    expect(crossCheckPriceSeries(a, same, 20, 0.001)).toEqual([]);
    const off = a.map((p) => (p.date === '2026-09-11' ? { ...p, close: p.close * 1.002 } : p));
    const issues = crossCheckPriceSeries(a, off, 20, 0.001);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'source-mismatch', date: '2026-09-11', fatal: false });
  });
});

describe('validateFgSeries', () => {
  test('범위 밖·중복·역순', () => {
    const issues = validateFgSeries([
      { date: '2026-09-10', value: 101, source: 'own' },
      { date: '2026-09-10', value: 50, source: 'own' },
      { date: '2026-09-09', value: 50, source: 'own' },
    ]);
    expect(codes(issues)).toEqual(expect.arrayContaining(['out-of-range', 'duplicate-date', 'unsorted']));
  });
});
