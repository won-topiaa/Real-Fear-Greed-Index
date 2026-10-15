import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_ENV } from '../src/env';
import { collectingLogger } from '../src/log';
import { collectFg } from '../src/sources/fg';
import { CNN_EARLIEST, cnnRequestStart, cnnUrl } from '../src/sources/cnn';
import { FileStore } from '../src/store/FileStore';
import { cnnJson, fakeFetch } from '../src/synth';
import type { Ctx } from '../src/types';
import type { FgPoint } from '../../src/core/types';

function ctx(fetchImpl: typeof fetch, now = '2026-09-11T22:30:00Z'): Ctx {
  return { fetchImpl, env: DEFAULT_ENV, nowUtcMs: Date.parse(now), log: collectingLogger(), timeoutMs: 1000, retries: 0 };
}

test('CNN 이력에 기대 거래일이 없으면 마감 후 현재값을 own 으로 채우고, 이력이 생기면 그 값으로 바꾼다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-fg-'));
  try {
    const store = new FileStore(dir);
    const hist: FgPoint[] = [
      { date: '2026-09-09', value: 40, source: 'cnn-historical' },
      { date: '2026-09-10', value: 43, source: 'cnn-historical' },
    ];
    const f = fakeFetch([{ match: (u) => u.includes('cnn.io'), body: cnnJson(hist, { score: 41.2, timestamp: '2026-09-11T23:59:58+00:00' }) }]);
    const r = await collectFg(ctx(f), store, '2026-09-11');
    assert.equal(r.report.status, 'ok');
    assert.equal(r.fgSource, 'cnn');
    assert.deepEqual(r.flags, []);
    assert.deepEqual(r.history.map((p) => [p.date, p.value, p.source]), [
      ['2026-09-09', 40, 'cnn-historical'],
      ['2026-09-10', 43, 'cnn-historical'],
      ['2026-09-11', 41.2, 'own'],
    ]);
    assert.equal((await store.readFgHistory()).length, 3);

    // 다음 실행: CNN 이력에 09-11 이 생기면 own 대신 그 값을 쓴다
    const f2 = fakeFetch([
      { match: (u) => u.includes('cnn.io'), body: cnnJson([...hist, { date: '2026-09-11', value: 39.5, source: 'cnn-historical' }], { score: 55 }) },
    ]);
    const r2 = await collectFg(ctx(f2, '2026-09-12T10:00:00Z'), store, '2026-09-11');
    assert.deepEqual(r2.history.find((p) => p.date === '2026-09-11'), { date: '2026-09-11', value: 39.5, source: 'cnn-historical' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CNN 이 나중에 고친 값으로 이전 실행의 잠정치를 바꾸고, 마감 전 날짜의 점은 받지 않는다', async () => {
  // 2026-10-14 실측: 00:42Z(20:42 ET) 실행이 본 10-14 값 32.42 → 08:05Z CNN 값 30.14.
  // 05:34Z 실행에는 UTC 자정이 지나 생긴 10-15 점(값은 10-14 것)이 있었다.
  const dir = await mkdtemp(join(tmpdir(), 'rfg-fg-'));
  try {
    const store = new FileStore(dir);
    const d13: FgPoint = { date: '2026-10-13', value: 44.11, source: 'cnn-historical' };
    const first = fakeFetch([
      { match: (u) => u.includes('cnn.io'), body: cnnJson([d13, { date: '2026-10-14', value: 32.42, source: 'cnn-historical' }], { score: 32.42, timestamp: '2026-10-15T00:42:00+00:00' }) },
    ]);
    const r1 = await collectFg(ctx(first, '2026-10-15T00:42:57Z'), store, '2026-10-14');
    assert.equal(r1.history.find((p) => p.date === '2026-10-14')?.value, 32.42);

    const early = fakeFetch([
      {
        match: (u) => u.includes('cnn.io'),
        body: cnnJson(
          [d13, { date: '2026-10-14', value: 32.33, source: 'cnn-historical' }, { date: '2026-10-15', value: 32.33, source: 'cnn-historical' }],
          { score: 32.33, timestamp: '2026-10-15T00:00:00+00:00' },
        ),
      },
    ]);
    const r2 = await collectFg(ctx(early, '2026-10-15T05:34:58Z'), store, '2026-10-14');
    assert.equal(r2.history.some((p) => p.date === '2026-10-15'), false);

    const finalized = fakeFetch([
      {
        match: (u) => u.includes('cnn.io'),
        body: cnnJson(
          [d13, { date: '2026-10-14', value: 30.14, source: 'cnn-historical' }, { date: '2026-10-15', value: 29.91, source: 'cnn-historical' }],
          { score: 29.91, timestamp: '2026-10-15T08:05:31+00:00' },
        ),
      },
    ]);
    const r3 = await collectFg(ctx(finalized, '2026-10-15T08:10:00Z'), store, '2026-10-14');
    assert.deepEqual(r3.flags, ['fg-date-mismatch']);
    assert.deepEqual(r3.history.map((p) => [p.date, p.value]), [
      ['2026-10-13', 44.11],
      ['2026-10-14', 30.14],
    ]);
    assert.deepEqual(await store.readFgHistory(), r3.history);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('timestamp 의 뉴욕 날짜가 기대 거래일과 다르면 fg-date-mismatch 플래그', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-fg-'));
  try {
    const f = fakeFetch([{ match: () => true, body: cnnJson([], { score: 50, timestamp: '2026-09-10T15:00:00+00:00' }) }]);
    const r = await collectFg(ctx(f), new FileStore(dir), '2026-09-11');
    assert.deepEqual(r.flags, ['fg-date-mismatch']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('장중 실행(현재값이 다음 거래일 것)이면 own 을 남기지 않아 기대 거래일의 마감 값을 덮어쓰지 않는다', async () => {
  // 2026-10-14 16:58Z 로컬 실행에서 실제로 난 사고: 10-14 장중 값 34.5 가 10-13 의 own 으로 박혀 마감 값 44.1 을 덮었다.
  const dir = await mkdtemp(join(tmpdir(), 'rfg-fg-'));
  try {
    const store = new FileStore(dir);
    const hist: FgPoint[] = [
      { date: '2026-10-12', value: 46.3, source: 'cnn-historical' },
      { date: '2026-10-13', value: 44.1, source: 'cnn-historical' },
    ];
    const f = fakeFetch([{ match: (u) => u.includes('cnn.io'), body: cnnJson(hist, { score: 34.5, timestamp: '2026-10-14T16:58:00+00:00' }) }]);
    const r = await collectFg(ctx(f, '2026-10-14T16:58:34Z'), store, '2026-10-13');
    assert.deepEqual(r.flags, ['fg-date-mismatch']);
    assert.deepEqual(r.history.find((p) => p.date === '2026-10-13'), { date: '2026-10-13', value: 44.1, source: 'cnn-historical' });
    assert.equal(r.history.some((p) => p.source === 'own'), false);
    assert.equal((await store.readFgHistory()).some((p) => p.source === 'own'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CNN 실패 시 저장소 히스토리로 폴백: fg-stale, 없으면 fg-missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-fg-'));
  try {
    const store = new FileStore(dir);
    const blocked = fakeFetch([{ match: () => true, status: 403, body: '<html>blocked</html>', contentType: 'text/html' }]);
    const r0 = await collectFg(ctx(blocked), store, '2026-09-11');
    assert.equal(r0.report.status, 'failed');
    assert.equal(r0.report.error, 'http_403');
    assert.deepEqual(r0.flags, ['fg-missing']);
    assert.equal(r0.fgSource, 'own-history');

    await store.writeFgHistory([{ date: '2026-09-10', value: 43, source: 'own' }]);
    const r1 = await collectFg(ctx(blocked), store, '2026-09-11');
    assert.deepEqual(r1.flags, ['fg-stale']);
    assert.equal(r1.report.asOf, '2026-09-10');
    assert.equal(r1.history.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('범위 밖 값은 실패로 취급하고 저장하지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-fg-'));
  try {
    const store = new FileStore(dir);
    const f = fakeFetch([{ match: () => true, body: cnnJson([], { score: 120 }) }]);
    const r = await collectFg(ctx(f), store, '2026-09-11');
    assert.equal(r.report.status, 'failed');
    assert.equal(r.report.error, 'range: score');
    assert.deepEqual(await store.readFgHistory(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CNN 요청 시작일: 이력이 없거나 앞·뒤가 비면 2020-07-15 부터 전부, 온전하면 최근 30일만', () => {
  const pt = (date: string): FgPoint => ({ date, value: 50, source: 'cnn-historical' });
  assert.equal(cnnRequestStart([], '2026-10-14'), CNN_EARLIEST);
  assert.equal(cnnRequestStart([pt('2024-10-14'), pt('2026-10-13')], '2026-10-14'), CNN_EARLIEST); // 앞이 비었다
  assert.equal(cnnRequestStart([pt('2020-07-15'), pt('2026-08-01')], '2026-10-14'), CNN_EARLIEST); // 최근이 비었다
  assert.equal(cnnRequestStart([pt('2020-07-15'), pt('2026-10-13')], '2026-10-14'), '2026-09-14');
  assert.equal(cnnUrl('2019-01-01').endsWith(`/graphdata/${CNN_EARLIEST}`), true); // 그 이전은 500 이라 당긴다
});
