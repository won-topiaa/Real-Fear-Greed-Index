import { NYSE_HOLIDAYS } from '../calendar';
import { RFG_PARAMS } from '../constants';
import { assessFreshness } from '../freshness';
import { computeRfgSeries } from '../rfg';
import { buildSnapshot, parseSnapshot } from '../snapshot';
import type { RfgSnapshot } from '../types';
import { FG_POINTS, PRICES, TINY_PARAMS } from '../__fixtures__/tiny';

function makeSnapshot(): RfgSnapshot {
  const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS);
  return buildSnapshot({
    rows: { SPX: rows, NDX: rows },
    priceSource: { SPX: 'stooq', NDX: 'fred' },
    flags: { SPX: [], NDX: ['fg-stale'] },
    generatedAtUtc: '2026-08-14T22:31:00.000Z',
    expectedLatestTradingDate: '2026-08-14',
    holidays: NYSE_HOLIDAYS,
    fgSource: 'cnn',
    disclaimerVersion: 1,
    params: TINY_PARAMS,
    historyDays: 4,
  });
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe('buildSnapshot', () => {
  test('원시 종가는 싣지 않고, 히스토리는 historyDays 행, closeAtUtc 는 EDT 20:00Z', () => {
    const s = makeSnapshot();
    expect(s.markets.SPX.closeDate).toBe('2026-08-14');
    expect(s.markets.SPX.closeAtUtc).toBe('2026-08-14T20:00:00.000Z');
    expect('close' in s.markets.SPX.latest).toBe(false);
    expect(s.markets.SPX.history).toHaveLength(4);
    expect(s.markets.SPX.history[3]?.rfg).toBeCloseTo(96, 6);
    expect(s.markets.NDX.flags).toEqual(['fg-stale']);
    expect(s.params.PERCENTILE_WINDOW_W).toBe(4);
  });
});

describe('parseSnapshot — 런타임 검증', () => {
  test('직렬화 왕복 후 통과하고 내용이 같다', () => {
    const s = makeSnapshot();
    const r = parseSnapshot(clone(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(clone(s));
  });

  test.each([
    ['schemaVersion 2', (o: any) => (o.schemaVersion = 2), '$.schemaVersion', 'version'],
    ['generatedAtUtc 누락', (o: any) => delete o.generatedAtUtc, '$.generatedAtUtc', 'missing'],
    ['p 범위 밖', (o: any) => (o.markets.SPX.latest.p = 101), '$.markets.SPX.latest.p', 'range'],
    ['flags 미지 값', (o: any) => (o.markets.SPX.flags = ['bogus']), '$.markets.SPX.flags[0]', 'range'],
    ['params 키 누락', (o: any) => delete o.params.EPSILON, '$.params.EPSILON', 'missing'],
    ['history 타입', (o: any) => (o.markets.NDX.history = 'x'), '$.markets.NDX.history', 'type'],
    ['NDX 누락', (o: any) => delete o.markets.NDX, '$.markets.NDX', 'missing'],
    ['날짜 형식', (o: any) => (o.expectedLatestTradingDate = '2026/08/14'), '$.expectedLatestTradingDate', 'range'],
  ])('%s → 실패', (_name, mutate, path, code) => {
    const o: any = clone(makeSnapshot());
    mutate(o);
    const r = parseSnapshot(o);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ path, code });
  });

  test('운영 params 를 담은 스냅샷도 통과', () => {
    const s = clone(makeSnapshot());
    s.params = { ...RFG_PARAMS };
    expect(parseSnapshot(s).ok).toBe(true);
  });
});

describe('assessFreshness — 거래일 기준 (DESIGN §3.5)', () => {
  const s = makeSnapshot(); // closeDate 2026-08-14(금), expected 2026-08-14, generated 금 22:31Z

  test('금요일 스냅샷을 일요일 밤(ET)에 봐도 fresh', () => {
    const r = assessFreshness(s, 'SPX', Date.parse('2026-08-17T00:00:00Z'));
    expect(r).toEqual({ level: 'fresh', tradingDaysBehind: 0, expected: '2026-08-14' });
  });

  test('스냅샷이 48시간 넘게 오래되면 기기 시각으로 기대 거래일을 다시 계산: 3거래일 → delayed', () => {
    const r = assessFreshness(s, 'SPX', Date.parse('2026-08-19T23:00:00Z')); // 수요일 마감 후 → 17,18,19
    expect(r).toEqual({ level: 'delayed', tradingDaysBehind: 3, expected: '2026-08-19' });
  });

  test('4거래일 이상 → stale', () => {
    const r = assessFreshness(s, 'SPX', Date.parse('2026-08-20T23:00:00Z'));
    expect(r.level).toBe('stale');
    expect(r.tradingDaysBehind).toBe(4);
  });

  test('스냅샷이 최신이면 기기 시계가 틀려도 스냅샷의 기대 거래일을 믿는다', () => {
    const r = assessFreshness(s, 'SPX', Date.parse('2026-08-15T10:00:00Z')); // 12h 뒤
    expect(r.level).toBe('fresh');
  });
});
