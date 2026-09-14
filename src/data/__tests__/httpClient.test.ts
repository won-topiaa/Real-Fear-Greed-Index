import { ClientError } from '../client';
import { createHttpClient } from '../httpClient';
import normal from '../fixtures/normal.json';

function fetchSequence(responses: Array<() => Response | Promise<Response>>): { fetchImpl: typeof fetch; calls: number } {
  const state = { calls: 0 };
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const i = state.calls++;
    const r = responses[Math.min(i, responses.length - 1)];
    if (!r) throw new Error('no response');
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return r();
  }) as typeof fetch;
  return { fetchImpl, get calls() { return state.calls; } } as { fetchImpl: typeof fetch; calls: number };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noSleep = async () => undefined;

// granite jest 프리셋은 가짜 타이머를 켠다. 이 파일은 실제 타임아웃 동작을 검사하므로 실제 타이머를 쓴다.
beforeAll(() => jest.useRealTimers());

describe('httpClient', () => {
  test('정상 응답을 parseSnapshot 으로 검증해 돌려준다', async () => {
    const f = fetchSequence([json(normal)]);
    const client = createHttpClient({ baseUrl: 'https://x.test/', timeoutMs: 1000, fetchImpl: f.fetchImpl, sleep: noSleep });
    const s = await client.getSnapshot();
    expect(s.schemaVersion).toBe(1);
    expect(s.markets.SPX.closeDate).toBe('2026-09-11');
    expect(f.calls).toBe(1);
  });

  test('5xx 는 재시도(총 3회) 후 성공', async () => {
    const f = fetchSequence([json({}, 503), json({}, 500), json(normal)]);
    const client = createHttpClient({ baseUrl: 'https://x.test', timeoutMs: 1000, fetchImpl: f.fetchImpl, sleep: noSleep });
    await expect(client.getSnapshot()).resolves.toBeTruthy();
    expect(f.calls).toBe(3);
  });

  test('4xx 는 재시도하지 않고 http 오류', async () => {
    const f = fetchSequence([json({}, 404)]);
    const client = createHttpClient({ baseUrl: 'https://x.test', timeoutMs: 1000, fetchImpl: f.fetchImpl, sleep: noSleep });
    await expect(client.getSnapshot()).rejects.toMatchObject({ code: 'http', status: 404 });
    expect(f.calls).toBe(1);
  });

  test('네트워크 오류는 재시도 소진 후 network', async () => {
    const f = fetchSequence([() => Promise.reject(new TypeError('Network request failed'))]);
    const client = createHttpClient({ baseUrl: 'https://x.test', timeoutMs: 1000, fetchImpl: f.fetchImpl, sleep: noSleep });
    await expect(client.getSnapshot()).rejects.toMatchObject({ code: 'network' });
    expect(f.calls).toBe(3);
  });

  test('타임아웃은 timeout 코드로 재시도', async () => {
    let attempts = 0;
    // 실제 fetch 처럼 signal 이 abort 되면 AbortError 로 거부한다(폴링으로 폴리필 차이를 흡수).
    const fetchImpl = ((_u: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        attempts++;
        const timer = setInterval(() => {
          if (init?.signal?.aborted) {
            clearInterval(timer);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          }
        }, 1);
      })) as typeof fetch;
    const client = createHttpClient({ baseUrl: 'https://x.test', timeoutMs: 5, fetchImpl, sleep: noSleep, retry: { attempts: 1, backoffMs: [0] } });
    await expect(client.getSnapshot()).rejects.toMatchObject({ code: 'timeout' });
    expect(attempts).toBe(2);
  });

  test('스키마 실패는 schema, schemaVersion 불일치는 outdated (재시도 없음)', async () => {
    const bad = fetchSequence([json({ ...normal, markets: {} })]);
    const c1 = createHttpClient({ baseUrl: 'https://x.test', timeoutMs: 1000, fetchImpl: bad.fetchImpl, sleep: noSleep });
    await expect(c1.getSnapshot()).rejects.toMatchObject({ code: 'schema' });
    expect(bad.calls).toBe(1);
    const old = fetchSequence([json({ ...normal, schemaVersion: 2 })]);
    const c2 = createHttpClient({ baseUrl: 'https://x.test', timeoutMs: 1000, fetchImpl: old.fetchImpl, sleep: noSleep });
    await expect(c2.getSnapshot()).rejects.toBeInstanceOf(ClientError);
    await expect(c2.getSnapshot()).rejects.toMatchObject({ code: 'outdated' });
  });

  test('JSON 이 아니면 schema', async () => {
    const f = fetchSequence([() => new Response('<html>', { status: 200 })]);
    const client = createHttpClient({ baseUrl: 'https://x.test', timeoutMs: 1000, fetchImpl: f.fetchImpl, sleep: noSleep });
    await expect(client.getSnapshot()).rejects.toMatchObject({ code: 'schema' });
  });
});
