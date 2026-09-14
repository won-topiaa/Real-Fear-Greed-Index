import { maskSecrets } from './log';
import type { Ctx } from './types';

export interface FetchTextResult {
  status: number;
  text: string;
  contentType: string;
}

export class HttpError extends Error {
  constructor(
    public readonly kind: 'http' | 'timeout' | 'network',
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

const BACKOFF_MS = [2_000, 8_000, 30_000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 타임아웃·재시도가 있는 텍스트 fetch. 로그에는 마스킹된 URL 만 남긴다.
 * 4xx 는 재시도하지 않는다(차단·인증 문제는 반복해도 같다). 5xx·네트워크·타임아웃만 재시도.
 */
export async function fetchText(ctx: Ctx, url: string, headers: Record<string, string> = {}): Promise<FetchTextResult> {
  let lastErr: HttpError | null = null;
  for (let attempt = 0; attempt <= ctx.retries; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] as number);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ctx.timeoutMs);
    try {
      const res = await ctx.fetchImpl(url, { headers, signal: ac.signal, redirect: 'follow' });
      const text = await res.text();
      const contentType = res.headers.get('content-type') ?? '';
      if (res.status >= 500) {
        lastErr = new HttpError('http', res.status, `http_${res.status}`);
        ctx.log.warn(`GET ${maskSecrets(url)} → ${res.status} (attempt ${attempt + 1})`);
        continue;
      }
      if (res.status >= 400) throw new HttpError('http', res.status, `http_${res.status}`);
      return { status: res.status, text, contentType };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      const isAbort = (e as { name?: string })?.name === 'AbortError';
      lastErr = new HttpError(isAbort ? 'timeout' : 'network', null, isAbort ? 'timeout' : 'network');
      ctx.log.warn(`GET ${maskSecrets(url)} → ${lastErr.message} (attempt ${attempt + 1})`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new HttpError('network', null, 'network');
}
