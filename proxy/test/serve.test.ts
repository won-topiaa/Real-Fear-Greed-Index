import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cacheControlFor, startStaticServer } from '../src/serve';
import { writeJsonAtomic } from '../src/store/FileStore';

test('정적 서버: 캐시 헤더·404·경로 탈출 방지', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-serve-'));
  const server = await startStaticServer({ dir, port: 0 });
  try {
    await writeJsonAtomic(join(dir, 'v1', 'snapshot.json'), { hello: 1 });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const ok = await fetch(`http://127.0.0.1:${port}/v1/snapshot.json`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'public, max-age=600, stale-while-revalidate=86400');
    assert.deepEqual(await ok.json(), { hello: 1 });
    const missing = await fetch(`http://127.0.0.1:${port}/v1/nope.json`);
    assert.equal(missing.status, 404);
    const escape = await fetch(`http://127.0.0.1:${port}/../../etc/passwd`);
    assert.equal(escape.status, 404);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('cacheControlFor', () => {
  assert.equal(cacheControlFor('/v1/status.json'), 'public, max-age=60');
  assert.equal(cacheControlFor('/static/icon.png'), 'public, max-age=86400');
  assert.equal(cacheControlFor('/x'), 'no-store');
});
