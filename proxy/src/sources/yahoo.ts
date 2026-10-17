/**
 * Yahoo Finance chart API (비공식). ^GSPC / ^NDX.
 * 형태: { chart: { result: [{ timestamp: number[], indicators: { quote: [{ close: (number|null)[] }] } }], error } }
 * timestamp 는 초 단위 epoch(장 시작 시각) → 뉴욕 날짜로 변환. 장중에는 오늘 봉(현재가)이 붙는다 — price.ts 가 기대 거래일 뒤를 버린다.
 * 직접 접속은 429(집 IP 도 마찬가지)라 YAHOO_PROXY_URL(Cloudflare Worker)을 거친다. 2026-10-17 확인: 미국 마감 직후 값이 있고
 * (FRED NASDAQ100 은 ≈ 03:37Z), FRED 와 겹치는 날 종가 차이는 NDX 13년 최대 0.085%, SPX 10년 최대 0.12%(하루).
 */
import { addCalendarDays, nyDateOf } from '../../../src/core/calendar';
import type { IndexSymbol, PricePoint } from '../../../src/core/types';
import type { Env, PriceAdapter } from '../types';

export const YAHOO_SYMBOL: Record<IndexSymbol, string> = { SPX: '^GSPC', NDX: '^NDX' };

export class YahooSchemaError extends Error {
  constructor(public readonly path: string) {
    super(`schema: ${path}`);
  }
}

export interface YahooParsed {
  timestamp: number[];
  close: (number | null)[];
}

export function parseYahoo(text: string): YahooParsed {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new YahooSchemaError('$ (not json)');
  }
  const chart = (json as { chart?: unknown } | null)?.chart as { result?: unknown; error?: unknown } | undefined;
  if (!chart) throw new YahooSchemaError('chart');
  if (chart.error) throw new YahooSchemaError('chart.error');
  const result = Array.isArray(chart.result) ? chart.result[0] : undefined;
  if (!result || typeof result !== 'object') throw new YahooSchemaError('chart.result[0]');
  const r = result as { timestamp?: unknown; indicators?: { quote?: Array<{ close?: unknown }> } };
  if (!Array.isArray(r.timestamp)) throw new YahooSchemaError('chart.result[0].timestamp');
  const close = r.indicators?.quote?.[0]?.close;
  if (!Array.isArray(close)) throw new YahooSchemaError('chart.result[0].indicators.quote[0].close');
  if (close.length !== r.timestamp.length) throw new YahooSchemaError('timestamp/close length');
  const timestamp = r.timestamp.map((t, i) => {
    if (typeof t !== 'number' || !Number.isFinite(t)) throw new YahooSchemaError(`timestamp[${i}]`);
    return t;
  });
  const closes = close.map((c, i) => {
    if (c === null) return null;
    if (typeof c !== 'number' || !Number.isFinite(c)) throw new YahooSchemaError(`close[${i}]`);
    return c;
  });
  return { timestamp, close: closes };
}

export function normalizeYahoo(parsed: unknown): PricePoint[] {
  const p = parsed as YahooParsed;
  const out: PricePoint[] = [];
  p.timestamp.forEach((t, i) => {
    const c = p.close[i];
    if (c == null) return;
    out.push({ date: nyDateOf(t * 1000), close: c });
  });
  return out;
}

/**
 * 조회 시작일 — FRED 와 같은 창으로 맞춰 어느 소스로 계산해도 이력 시작일이 같게 한다.
 * NDX 는 fred.ts 와 같은 365×13일, SPX 는 FRED 가 주는 10년(같은 날짜 10년 전부터).
 */
export function yahooStartDate(symbol: IndexSymbol, nowUtcMs: number): string {
  const today = nyDateOf(nowUtcMs);
  if (symbol === 'NDX') return addCalendarDays(today, -365 * 13);
  return `${Number(today.slice(0, 4)) - 10}${today.slice(4)}`;
}

export function yahooUrl(symbol: IndexSymbol, env: Env, nowUtcMs: number): string {
  const period1 = Math.floor(Date.parse(`${yahooStartDate(symbol, nowUtcMs)}T00:00:00Z`) / 1000);
  const period2 = Math.floor(nowUtcMs / 1000);
  const direct = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(YAHOO_SYMBOL[symbol])}?period1=${period1}&period2=${period2}&interval=1d`;
  const proxy = env.YAHOO_PROXY_URL.trim();
  if (!proxy) return direct;
  return `${proxy}${proxy.includes('?') ? '&' : '?'}url=${encodeURIComponent(direct)}`;
}

export const yahooAdapter: PriceAdapter = {
  id: 'yahoo',
  isEnabled: () => true,
  url: yahooUrl,
  headers: (env: Env) => ({ 'User-Agent': env.CNN_USER_AGENT, Accept: 'application/json' }),
  parse: parseYahoo,
  normalize: normalizeYahoo,
};
