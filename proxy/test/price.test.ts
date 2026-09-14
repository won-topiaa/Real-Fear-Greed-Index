import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ENV } from '../src/env';
import { collectingLogger } from '../src/log';
import { selectPriceSeries } from '../src/sources/price';
import { fakeFetch, fredJson, stooqCsv, synthCloses, toPricePoints, tradingDatesEndingAt, yahooJson } from '../src/synth';
import type { Ctx } from '../src/types';

const EXPECTED = '2026-09-11';
const dates = tradingDatesEndingAt(EXPECTED, 400);
const closes = synthCloses(400, { seed: 1, start: 5000, driftPerDay: 0.0002, volPerDay: 0.008 });
const full = toPricePoints(dates, closes);
const lagging = full.slice(0, -1); // 전일까지만

function ctx(fetchImpl: typeof fetch, env = { ...DEFAULT_ENV, FRED_API_KEY: 'k' }): Ctx {
  return { fetchImpl, env, nowUtcMs: Date.parse('2026-09-11T22:30:00Z'), log: collectingLogger(), timeoutMs: 1000, retries: 0 };
}

test('기대 거래일까지 있는 첫 소스를 통째로 고른다: FRED 지연 → Stooq 채택, 교차검증 기록', async () => {
  const calls: string[] = [];
  const f = fakeFetch(
    [
      { match: (u) => u.includes('stlouisfed'), body: fredJson(lagging) },
      { match: (u) => u.includes('stooq'), body: stooqCsv(full), contentType: 'text/csv' },
      { match: (u) => u.includes('yahoo'), body: yahooJson(full) },
    ],
    calls,
  );
  const sel = await selectPriceSeries(ctx(f), 'SPX', EXPECTED);
  assert.equal(sel.chosen?.source, 'stooq');
  assert.equal(sel.chosen?.series.length, 400);
  assert.deepEqual(sel.reports.map((r) => [r.id, r.status]), [['fred', 'date_lag'], ['stooq', 'ok'], ['yahoo', 'ok']]);
  assert.equal(sel.reports[0]?.asOf, '2026-09-10');
  assert.equal(sel.crossCheck.length, 0);
  assert.equal(calls.length, 3);
});

test('FRED 키가 없으면 disabled, 소스 간 0.1% 초과 차이는 source-mismatch 경고', async () => {
  const off = full.map((p, i) => (i === full.length - 1 ? { ...p, close: p.close * 1.01 } : p));
  const f = fakeFetch([
    { match: (u) => u.includes('stooq'), body: stooqCsv(full), contentType: 'text/csv' },
    { match: (u) => u.includes('yahoo'), body: yahooJson(off) },
  ]);
  const sel = await selectPriceSeries(ctx(f, { ...DEFAULT_ENV, FRED_API_KEY: '' }), 'SPX', EXPECTED);
  assert.equal(sel.reports[0]?.status, 'disabled');
  assert.equal(sel.chosen?.source, 'stooq');
  assert.equal(sel.crossCheck.length, 1);
  assert.equal(sel.crossCheck[0]?.code, 'source-mismatch');
});

test('모든 소스가 지연/실패면 chosen 은 null', async () => {
  const f = fakeFetch([
    { match: (u) => u.includes('stlouisfed'), body: fredJson(lagging) },
    { match: (u) => u.includes('stooq'), body: 'No data', contentType: 'text/plain' },
    { match: (u) => u.includes('yahoo'), status: 500, body: 'boom' },
  ]);
  const sel = await selectPriceSeries(ctx(f), 'NDX', EXPECTED);
  assert.equal(sel.chosen, null);
  assert.deepEqual(sel.reports.map((r) => r.status), ['date_lag', 'failed', 'failed']);
  assert.match(sel.reports[1]?.error ?? '', /schema: header/);
  assert.equal(sel.reports[2]?.error, 'http_500');
});

test('26% 점프가 있는 소스는 invalid 로 거부한다', async () => {
  const jump = full.map((p, i) => (i === full.length - 1 ? { ...p, close: p.close * 1.3 } : p));
  const f = fakeFetch([
    { match: (u) => u.includes('stlouisfed'), body: fredJson(jump) },
    { match: (u) => u.includes('stooq'), body: stooqCsv(full), contentType: 'text/csv' },
    { match: (u) => u.includes('yahoo'), status: 404, body: '' },
  ]);
  const sel = await selectPriceSeries(ctx(f), 'SPX', EXPECTED);
  assert.equal(sel.reports[0]?.status, 'invalid');
  assert.equal(sel.reports[0]?.error, 'jump');
  assert.equal(sel.chosen?.source, 'stooq');
});

test('로그에 FRED 키가 찍히지 않는다', async () => {
  const log = collectingLogger();
  const f = fakeFetch([{ match: (u) => u.includes('stlouisfed'), status: 500, body: 'x' }]);
  const c: Ctx = { ...ctx(f), log };
  await selectPriceSeries(c, 'SPX', EXPECTED, { adapters: [(await import('../src/sources/fred')).fredAdapter] });
  assert.ok(log.lines.length > 0);
  for (const l of log.lines) assert.doesNotMatch(l, /api_key=k/);
});
