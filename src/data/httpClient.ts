import { parseSnapshot } from '../core/snapshot';
import type { RfgSnapshot } from '../core/types';
import { ClientError, type RfgClient } from './client';
import { SNAPSHOT_PATH } from './contract';
import { RETRY } from './policy';

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  retry?: { attempts: number; backoffMs: readonly number[] };
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function isRetryable(e: unknown): boolean {
  return e instanceof ClientError && (e.code === 'network' || e.code === 'timeout' || (e.code === 'http' && (e.status ?? 0) >= 500));
}

/** 정적 게시 스냅샷을 받아 런타임 검증한다. 검증 실패한 데이터는 절대 화면에 가지 않는다. */
export function createHttpClient(o: HttpClientOptions): RfgClient {
  const fetchImpl = o.fetchImpl ?? fetch;
  const retry = o.retry ?? RETRY;
  const sleep = o.sleep ?? defaultSleep;
  const url = `${o.baseUrl.replace(/\/+$/, '')}${SNAPSHOT_PATH}`;

  async function once(signal?: AbortSignal): Promise<RfgSnapshot> {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ac.abort(), o.timeoutMs);
    try {
      let res: Response;
      try {
        // RN 의 AbortSignal 타입과 표준 타입이 달라 캐스팅한다(런타임은 같은 객체).
        res = await fetchImpl(url, { signal: ac.signal as unknown as RequestInit['signal'], headers: { Accept: 'application/json' } });
      } catch (e) {
        if (signal?.aborted) throw new ClientError('network', 'aborted');
        const name = (e as { name?: string })?.name;
        throw new ClientError(name === 'AbortError' ? 'timeout' : 'network', name === 'AbortError' ? 'timeout' : 'network');
      }
      if (!res.ok) throw new ClientError('http', `http_${res.status}`, res.status);
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new ClientError('schema', 'not json');
      }
      const parsed = parseSnapshot(json);
      if (!parsed.ok) {
        throw new ClientError(parsed.error.code === 'version' ? 'outdated' : 'schema', `${parsed.error.path}: ${parsed.error.code}`);
      }
      return parsed.value;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    kind: 'http',
    async getSnapshot(opts = {}) {
      let last: unknown;
      for (let attempt = 0; attempt <= retry.attempts; attempt++) {
        if (attempt > 0) await sleep(retry.backoffMs[Math.min(attempt - 1, retry.backoffMs.length - 1)] ?? 0);
        try {
          return await once(opts.signal);
        } catch (e) {
          last = e;
          if (!isRetryable(e) || opts.signal?.aborted) throw e;
        }
      }
      throw last instanceof Error ? last : new ClientError('network', 'network');
    },
  };
}
