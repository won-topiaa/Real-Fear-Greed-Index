import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { collect } from '../src/collect';
import { DEFAULT_ENV } from '../src/env';
import { collectingLogger } from '../src/log';
import { STATUS_PATH } from '../src/publish';
import { cnnJson, fakeFetch, fredJson, stooqCsv, yahooJson } from '../src/synth';
import { makeScenario, SCENARIO_NOW_UTC } from '../src/synth/scenarios';
import { classify } from '../../src/core/classify';
import { parseSnapshot } from '../../src/core/snapshot';
import type { StatusJson } from '../src/publish';

const GOLDEN_PATH = new URL('./golden/snapshot.json', import.meta.url);

function routesFor(scenarioKey: 'normal' | 'capitulation', opts: { fredLag?: boolean; cnnDown?: boolean; ndxDown?: boolean } = {}) {
  const s = makeScenario(scenarioKey);
  const fgHist = s.fg.slice(0, -1).map((p) => ({ ...p, source: 'cnn-historical' as const }));
  const current = s.fg[s.fg.length - 1]!;
  const fredSpx = opts.fredLag ? s.prices.SPX.slice(0, -1) : s.prices.SPX;
  return [
    { match: (u: string) => u.includes('cnn.io'), status: opts.cnnDown ? 403 : 200, body: cnnJson(fgHist, { score: current.value, timestamp: '2026-09-11T20:05:00+00:00' }) },
    { match: (u: string) => u.includes('stlouisfed') && u.includes('SP500'), body: fredJson(fredSpx) },
    { match: (u: string) => u.includes('stlouisfed') && u.includes('NASDAQ100'), status: opts.ndxDown ? 500 : 200, body: fredJson(s.prices.NDX) },
    { match: (u: string) => u.includes('stooq') && u.includes('spx'), body: stooqCsv(s.prices.SPX), contentType: 'text/csv' },
    { match: (u: string) => u.includes('stooq') && u.includes('ndx'), status: opts.ndxDown ? 500 : 200, body: stooqCsv(s.prices.NDX), contentType: 'text/csv' },
    { match: (u: string) => u.includes('yahoo') && u.includes('GSPC'), body: yahooJson(s.prices.SPX) },
    { match: (u: string) => u.includes('yahoo') && u.includes('NDX'), status: opts.ndxDown ? 500 : 200, body: yahooJson(s.prices.NDX) },
  ];
}

async function run(dir: string, routes: ReturnType<typeof routesFor>, now = SCENARIO_NOW_UTC) {
  return collect({
    outDir: join(dir, 'public'),
    dataDir: join(dir, 'cache'),
    env: { ...DEFAULT_ENV, FRED_API_KEY: 'test-key' },
    nowUtcMs: Date.parse(now),
    fetchImpl: fakeFetch(routes),
    log: collectingLogger(),
    retries: 0,
    runId: 'test',
    ping: false,
  });
}

test('e2e: 합성 소스 → 스냅샷이 골든과 일치하고 parseSnapshot 을 통과한다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-collect-'));
  try {
    const r = await run(dir, routesFor('normal'));
    assert.equal(r.result, 'ok');
    assert.ok(r.snapshot);
    const parsed = parseSnapshot(JSON.parse(await readFile(join(dir, 'public', 'v1', 'snapshot.json'), 'utf8')));
    assert.ok(parsed.ok);
    let golden: unknown = null;
    try {
      golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf8'));
    } catch {
      golden = null;
    }
    assert.ok(golden, 'golden/snapshot.json 이 없다 — `npm run build-fixtures` 로 생성');
    assert.deepEqual(r.snapshot, golden);
    assert.equal(r.snapshot?.markets.SPX.priceSource, 'fred');
    assert.equal(r.snapshot?.fgSource, 'cnn');
    assert.equal(r.snapshot?.markets.SPX.history.length, 60);
    const status = JSON.parse(await readFile(join(dir, 'public', STATUS_PATH), 'utf8')) as StatusJson;
    assert.equal(status.result, 'ok');
    assert.equal(status.published.unchanged, false);
    assert.deepEqual(status.published.markets, { SPX: 'new', NDX: 'new' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('FRED 지연이면 Stooq 로 채택되고 status 에 date_lag 가 남는다; 재실행은 unchanged', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-collect-'));
  try {
    const r = await run(dir, routesFor('normal', { fredLag: true }));
    assert.equal(r.result, 'ok');
    assert.equal(r.snapshot?.markets.SPX.priceSource, 'stooq');
    assert.equal(r.snapshot?.markets.NDX.priceSource, 'fred');
    assert.equal(r.status.sources.find((s) => s.id === 'fred' && s.symbol === 'SPX')?.status, 'date_lag');
    const r2 = await run(dir, routesFor('normal', { fredLag: true }), '2026-09-12T01:00:00.000Z');
    assert.equal(r2.status.published.unchanged, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('한 지수의 모든 소스가 죽으면 이전 블록을 유지(partial); 이전이 없으면 failed 이고 snapshot 은 안 쓴다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-collect-'));
  try {
    const failed = await run(dir, routesFor('normal', { ndxDown: true }));
    assert.equal(failed.result, 'failed');
    assert.equal(failed.snapshot, null);
    await assert.rejects(() => readFile(join(dir, 'public', 'v1', 'snapshot.json')));
    const status = JSON.parse(await readFile(join(dir, 'public', STATUS_PATH), 'utf8')) as StatusJson;
    assert.equal(status.result, 'failed');
    assert.ok(status.errors.some((e) => e.startsWith('NDX')));

    const ok = await run(dir, routesFor('normal'));
    assert.equal(ok.result, 'ok');
    const partial = await run(dir, routesFor('normal', { ndxDown: true }), '2026-09-12T01:00:00.000Z');
    assert.equal(partial.result, 'partial');
    assert.deepEqual(partial.status.published.markets, { SPX: 'new', NDX: 'previous' });
    assert.equal(partial.snapshot?.markets.NDX.closeDate, '2026-09-11');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CNN 이 막히고 히스토리도 없으면 fg-missing 으로 게시(P 만 있음)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-collect-'));
  try {
    const r = await run(dir, routesFor('normal', { cnnDown: true }));
    assert.equal(r.result, 'ok');
    assert.equal(r.snapshot?.fgSource, 'own-history');
    assert.deepEqual(r.snapshot?.markets.SPX.flags, ['fg-missing']);
    assert.equal(r.snapshot?.markets.SPX.latest.fg, null);
    assert.ok(r.snapshot?.markets.SPX.latest.p != null);
    assert.equal(classify(r.snapshot!.markets.SPX.latest).quadrant, 'UNKNOWN');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('capitulation 시나리오는 실제로 Q1·실질적 항복을 만든다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-collect-'));
  try {
    const r = await run(dir, routesFor('capitulation'));
    assert.equal(r.result, 'ok');
    const c = classify(r.snapshot!.markets.SPX.latest);
    assert.equal(c.quadrant, 'Q1');
    assert.equal(c.rfgZone, 'CAPITULATION');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
