import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_ENV } from '../src/env';
import { collectingLogger } from '../src/log';
import { collectFg } from '../src/sources/fg';
import { FileStore } from '../src/store/FileStore';
import { cnnJson, fakeFetch } from '../src/synth';
import type { Ctx } from '../src/types';
import type { FgPoint } from '../../src/core/types';

function ctx(fetchImpl: typeof fetch, now = '2026-09-11T22:30:00Z'): Ctx {
  return { fetchImpl, env: DEFAULT_ENV, nowUtcMs: Date.parse(now), log: collectingLogger(), timeoutMs: 1000, retries: 0 };
}

test('마감 후 관측한 현재값을 기대 거래일의 own 으로 기록하고 historical 은 백필', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-fg-'));
  try {
    const store = new FileStore(dir);
    const hist: FgPoint[] = [
      { date: '2026-09-09', value: 40, source: 'cnn-historical' },
      { date: '2026-09-10', value: 43, source: 'cnn-historical' },
      { date: '2026-09-11', value: 44, source: 'cnn-historical' }, // 같은 날짜: own 이 이긴다
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

    // 다음날 다시 돌면 첫 관측 유지(정정 무시)
    const f2 = fakeFetch([{ match: (u) => u.includes('cnn.io'), body: cnnJson(hist, { score: 55 }) }]);
    const r2 = await collectFg(ctx(f2, '2026-09-12T22:30:00Z'), store, '2026-09-11');
    assert.equal(r2.history.find((p) => p.date === '2026-09-11')?.value, 41.2);
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
