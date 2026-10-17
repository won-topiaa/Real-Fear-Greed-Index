/**
 * 늦게 올라오는 FRED 종가를 기다린다.
 * 확인한 반영 시각(2026-10-16·17): SP500 은 19:02 CT(≈ 00:00Z), NASDAQ100 은 22:37 CT(≈ 03:37Z)
 * — 둘 다 22:30Z 본실행보다 늦고, NASDAQ100 은 01:00Z 재시도보다도 늦다. 게다가 GitHub 예약 실행은 매일 2~6시간 늦게 돈다.
 * 그래서 본실행에서 FRED 가 하루 전 값까지만 준(date_lag) 지수가 있으면, 워크플로의 wait 잡이 FRED 최신 관측일만 주기적으로 확인하고
 * 올라오면 수집을 새로 한 번 돌린다(.github/workflows/collect.yml).
 */
import { closeAtUtcOf } from '../../src/core/calendar';
import type { IndexSymbol, IsoDate } from '../../src/core/types';
import { SYMBOLS } from './collect';
import { fetchText } from './http';
import { silentLogger } from './log';
import type { StatusJson } from './publish';
import { FRED_SERIES, normalizeFred, parseFred } from './sources/fred';
import type { Ctx, Env, Logger } from './types';

/** 기대 거래일 종가 뒤 이 시간까지만 기다린다(EDT 면 12:00Z = 21:00 KST). 주말 실행이 금요일 값을 붙잡고 기다리지 않게 한다. */
export const WAIT_AFTER_CLOSE_MS = 16 * 60 * 60_000;
export const DEFAULT_WAIT_INTERVAL_MS = 10 * 60_000;
/** GitHub 호스티드 잡 한도(6시간) 안쪽 */
export const DEFAULT_MAX_WAIT_MS = 300 * 60_000;

export function waitDeadlineMs(expected: IsoDate): number {
  return Date.parse(closeAtUtcOf(expected)) + WAIT_AFTER_CLOSE_MS;
}

/** 이번 실행에서 새로 못 만든 지수 중, FRED 가 아직 하루 전 값까지만 준 것. 기다릴 시한이 지났으면 비운다. */
export function laggingSymbols(status: StatusJson, nowUtcMs: number): IndexSymbol[] {
  if (nowUtcMs >= waitDeadlineMs(status.expectedLatestTradingDate)) return [];
  return SYMBOLS.filter(
    (sym) =>
      status.published.markets[sym] !== 'new' &&
      status.sources.some((r) => r.id === 'fred' && r.symbol === sym && r.status === 'date_lag'),
  );
}

/** FRED 최신 관측일(휴장일 '.' 제외). 최근 몇 건만 받는다. */
export async function latestFredDate(ctx: Ctx, symbol: IndexSymbol): Promise<IsoDate | null> {
  const q = new URLSearchParams({
    series_id: FRED_SERIES[symbol],
    api_key: ctx.env.FRED_API_KEY,
    file_type: 'json',
    sort_order: 'desc',
    limit: '10',
  });
  const res = await fetchText(ctx, `https://api.stlouisfed.org/fred/series/observations?${q.toString()}`, { Accept: 'application/json' });
  const points = normalizeFred(parseFred(res.text));
  return points.reduce<IsoDate | null>((max, p) => (max == null || p.date > max ? p.date : max), null);
}

export interface WaitOptions {
  symbols: readonly IndexSymbol[];
  expected: IsoDate;
  env: Env;
  log?: Logger;
  fetchImpl?: typeof fetch;
  intervalMs?: number;
  maxWaitMs?: number;
  /** 테스트용 시계·잠 */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * interval 마다 FRED 를 확인해 expected 까지 올라온 지수를 돌려준다(하나라도 올라오면 바로).
 * 시한(종가 16시간 뒤, 최대 maxWait)까지 없으면 빈 배열. 확인 중 오류는 기록만 하고 계속 기다린다.
 */
export async function waitForFred(opts: WaitOptions): Promise<IndexSymbol[]> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? silentLogger;
  const intervalMs = opts.intervalMs ?? DEFAULT_WAIT_INTERVAL_MS;
  const deadline = Math.min(now() + (opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS), waitDeadlineMs(opts.expected));
  log.info(`waiting for FRED ${opts.symbols.join(',')} to reach ${opts.expected} (every ${intervalMs / 60_000}m until ${new Date(deadline).toISOString()})`);

  while (now() + intervalMs <= deadline) {
    await sleep(intervalMs);
    const ctx: Ctx = { fetchImpl: opts.fetchImpl ?? fetch, env: opts.env, nowUtcMs: now(), log, timeoutMs: 20_000, retries: 2 };
    const ready: IndexSymbol[] = [];
    for (const sym of opts.symbols) {
      try {
        const latest = await latestFredDate(ctx, sym);
        log.info(`fred/${sym}: latest ${latest ?? 'none'}`);
        if (latest != null && latest >= opts.expected) ready.push(sym);
      } catch (e) {
        log.warn(`fred/${sym}: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }
    if (ready.length > 0) return ready;
  }
  log.warn(`FRED ${opts.symbols.join(',')} did not reach ${opts.expected} by ${new Date(deadline).toISOString()}`);
  return [];
}
