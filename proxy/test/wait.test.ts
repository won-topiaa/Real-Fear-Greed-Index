import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ENV } from '../src/env';
import { collectingLogger } from '../src/log';
import type { StatusJson } from '../src/publish';
import { fakeFetch, fredJson, synthCloses, toPricePoints, tradingDatesEndingAt } from '../src/synth';
import type { SourceReport } from '../src/types';
import { laggingSymbols, waitDeadlineMs, waitForFred } from '../src/wait';

const EXPECTED = '2026-10-16'; // 금요일, EDT → 종가 20:00Z, 기다림 시한 10-17 12:00Z
const FIRST_RUN = Date.parse('2026-10-17T00:40:00Z');
const env = { ...DEFAULT_ENV, FRED_API_KEY: 'k' };

const dates = tradingDatesEndingAt(EXPECTED, 30);
const full = toPricePoints(dates, synthCloses(30, { seed: 3, start: 20000, driftPerDay: 0.0002, volPerDay: 0.01 }));
const lagging = full.slice(0, -1);

function report(symbol: 'SPX' | 'NDX', status: SourceReport['status'], id: SourceReport['id'] = 'fred'): SourceReport {
  return { id, symbol, status, fetchedAtUtc: null, asOf: null, error: status === 'ok' ? null : status };
}

function statusWith(markets: StatusJson['published']['markets'], sources: SourceReport[]): StatusJson {
  return {
    runAtUtc: new Date(FIRST_RUN).toISOString(),
    runId: 't',
    result: 'partial',
    expectedLatestTradingDate: EXPECTED,
    sources,
    published: { generatedAtUtc: null, unchanged: false, markets },
    checks: { crossCheck: { SPX: [], NDX: [] }, closesAvailable: { SPX: 0, NDX: 0 }, fgHistoryPoints: 0 },
    errors: [],
  };
}

/** 잠들 때마다 시계를 그만큼 넘기는 가짜 시계 */
function fakeClock(start: number) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

test('laggingSymbols: FRED 가 하루 전 값이라 이전 블록을 쓴 지수만 기다린다', () => {
  const s = statusWith({ SPX: 'new', NDX: 'previous' }, [report('SPX', 'ok'), report('NDX', 'date_lag'), report('NDX', 'failed', 'stooq')]);
  assert.deepEqual(laggingSymbols(s, FIRST_RUN), ['NDX']);
  // 둘 다 늦으면 둘 다
  const both = statusWith({ SPX: 'none', NDX: 'none' }, [report('SPX', 'date_lag'), report('NDX', 'date_lag')]);
  assert.deepEqual(laggingSymbols(both, FIRST_RUN), ['SPX', 'NDX']);
});

test('laggingSymbols: FRED 실패(지연 아님)·새로 계산됨·시한 지남이면 기다리지 않는다', () => {
  assert.deepEqual(laggingSymbols(statusWith({ SPX: 'new', NDX: 'previous' }, [report('NDX', 'failed')]), FIRST_RUN), []);
  assert.deepEqual(laggingSymbols(statusWith({ SPX: 'new', NDX: 'new' }, [report('NDX', 'date_lag')]), FIRST_RUN), []);
  const s = statusWith({ SPX: 'new', NDX: 'previous' }, [report('NDX', 'date_lag')]);
  assert.equal(waitDeadlineMs(EXPECTED), Date.parse('2026-10-17T12:00:00Z'));
  assert.deepEqual(laggingSymbols(s, Date.parse('2026-10-17T12:00:00Z')), []);
  // 일요일 실행(기대 거래일은 여전히 금요일)
  assert.deepEqual(laggingSymbols(s, Date.parse('2026-10-18T22:30:00Z')), []);
});

test('waitForFred: 올라올 때까지 간격마다 최신 몇 건만 확인하고, 올라온 지수를 돌려준다', async () => {
  const clock = fakeClock(FIRST_RUN);
  const calls: string[] = [];
  let polls = 0;
  const f = fakeFetch([{ match: (u) => u.includes('NASDAQ100'), body: () => (++polls >= 3 ? fredJson(full) : fredJson(lagging)) }], calls);
  const log = collectingLogger();
  const ready = await waitForFred({ symbols: ['NDX'], expected: EXPECTED, env, log, fetchImpl: f, intervalMs: 600_000, now: clock.now, sleep: clock.sleep });
  assert.deepEqual(ready, ['NDX']);
  assert.equal(calls.length, 3);
  assert.deepEqual(clock.sleeps, [600_000, 600_000, 600_000]);
  assert.ok(calls.every((u) => u.includes('sort_order=desc') && u.includes('limit=10')));
  assert.ok(log.lines.every((l) => !l.includes('api_key=k')));
});

test('waitForFred: 둘 중 먼저 올라온 지수만으로 바로 끝낸다(나머지는 다음 실행이 기다린다)', async () => {
  const clock = fakeClock(FIRST_RUN);
  const f = fakeFetch([
    { match: (u) => u.includes('SP500'), body: fredJson(full) },
    { match: (u) => u.includes('NASDAQ100'), body: fredJson(lagging) },
  ]);
  const ready = await waitForFred({ symbols: ['SPX', 'NDX'], expected: EXPECTED, env, fetchImpl: f, intervalMs: 600_000, now: clock.now, sleep: clock.sleep });
  assert.deepEqual(ready, ['SPX']);
  assert.equal(clock.sleeps.length, 1);
});

test('waitForFred: 오류는 건너뛰고 계속 보며, 시한(최대 대기·종가 16시간 뒤)이 지나면 빈 배열', async () => {
  const clock = fakeClock(FIRST_RUN);
  const calls: string[] = [];
  const f = fakeFetch([{ match: (u) => u.includes('NASDAQ100'), status: 400, body: 'bad' }], calls);
  const ready = await waitForFred({ symbols: ['NDX'], expected: EXPECTED, env, fetchImpl: f, intervalMs: 600_000, maxWaitMs: 60 * 60_000, now: clock.now, sleep: clock.sleep });
  assert.deepEqual(ready, []);
  assert.equal(calls.length, 6); // 60분 / 10분
  assert.ok(clock.now() <= FIRST_RUN + 60 * 60_000);

  // 종가 16시간 뒤(12:00Z)가 먼저 오면 그때까지만: 11:00Z 시작 → 최대 대기 5시간이어도 6번
  const late = fakeClock(Date.parse('2026-10-17T11:00:00Z'));
  const lateCalls: string[] = [];
  const g = fakeFetch([{ match: (u) => u.includes('NASDAQ100'), body: fredJson(lagging) }], lateCalls);
  assert.deepEqual(await waitForFred({ symbols: ['NDX'], expected: EXPECTED, env, fetchImpl: g, intervalMs: 600_000, now: late.now, sleep: late.sleep }), []);
  assert.equal(lateCalls.length, 6);
});
