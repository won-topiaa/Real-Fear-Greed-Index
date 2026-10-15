import { bandOf } from '../classify';
import { computeComponentSeries } from '../damage';
import { buildHistory, parseHistory } from '../history';
import { computeRfgSeries } from '../rfg';
import { EXPECTED, FG_POINTS, PRICES, TINY_PARAMS, expectSeries } from '../__fixtures__/tiny';

describe('bandOf — 웹 게이지 5구간 (CNN 관례, 반올림 정수로 판정)', () => {
  test.each([
    [0, 'EXTREME_FEAR'],
    [24.49, 'EXTREME_FEAR'],
    [24.5, 'FEAR'], // → 25
    [44, 'FEAR'],
    [45, 'NEUTRAL'],
    [55.4, 'NEUTRAL'],
    [55.5, 'GREED'], // → 56
    [75, 'GREED'],
    [76, 'EXTREME_GREED'],
    [100, 'EXTREME_GREED'],
    [null, 'UNKNOWN'],
    [Number.NaN, 'UNKNOWN'],
  ] as const)('%p → %s', (v, expected) => {
    expect(bandOf(v)).toBe(expected);
  });
});

describe('computeComponentSeries — 성분별 원시값과 백분위', () => {
  test('손계산 표의 DD·DISP·RV 와 성분별 백분위 열과 일치', () => {
    const c = computeComponentSeries(PRICES, TINY_PARAMS);
    expectSeries(c.dd, EXPECTED.dd);
    expectSeries(c.disp, EXPECTED.disp);
    expectSeries(c.rv, EXPECTED.rv);
    expectSeries(c.pdd, EXPECTED.pdd, 3);
    expectSeries(c.pdisp, EXPECTED.pdisp, 3);
    expectSeries(c.prv, EXPECTED.prv, 3);
  });
});

describe('buildHistory / parseHistory — 공개 1년 이력 계약', () => {
  const rows = computeRfgSeries(PRICES, FG_POINTS, TINY_PARAMS);
  const components = computeComponentSeries(PRICES, TINY_PARAMS);
  const history = buildHistory({
    rows: { SPX: rows, NDX: rows },
    components: { SPX: components, NDX: components },
    generatedAtUtc: '2026-08-14T22:30:00.000Z',
    days: 6,
  });

  test('최근 days 행만, RFG·P 는 소수 2자리, CNN 원값(fg·fear)은 싣지 않는다', () => {
    const m = history.markets.SPX;
    expect(m.rows).toHaveLength(6);
    expect(m.rows[0]?.date).toBe('2026-08-07');
    expect(m.rows[5]).toEqual({ date: '2026-08-14', rfg: 80, p: 35 });
    expect(m.rows[2]).toEqual({ date: '2026-08-11', rfg: 57.67, p: 38.33 });
    expect(Object.keys(m.rows[0] ?? {}).sort()).toEqual(['date', 'p', 'rfg']);
  });

  test('components 는 최신 행: 원시 비율 그대로, 백분위 소수 2자리', () => {
    expect(history.markets.SPX.components).toEqual({
      date: '2026-08-14',
      dd: 0,
      disp: components.disp[9],
      rv: components.rv[9],
      pdd: 50,
      pdisp: 33.33,
      prv: 0,
    });
  });

  test('JSON 왕복 후 parseHistory 통과, 깨진 입력은 경로와 함께 실패', () => {
    const r = parseHistory(JSON.parse(JSON.stringify(history)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(history);
    expect(parseHistory({ ...history, schemaVersion: 2 })).toEqual({ ok: false, error: { path: '$.schemaVersion' } });
    const reversed = JSON.parse(JSON.stringify(history));
    reversed.markets.NDX.rows.reverse();
    expect(parseHistory(reversed)).toEqual({ ok: false, error: { path: '$.markets.NDX.rows[1].date' } });
    const outOfRange = JSON.parse(JSON.stringify(history));
    outOfRange.markets.SPX.rows[0].rfg = 101;
    expect(parseHistory(outOfRange)).toEqual({ ok: false, error: { path: '$.markets.SPX.rows[0].rfg' } });
  });
});
