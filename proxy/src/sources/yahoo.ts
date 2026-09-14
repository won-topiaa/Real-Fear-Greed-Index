/**
 * Yahoo Finance chart API (비공식). ^GSPC / ^NDX.
 * 알려진 형태 [검증 필요]: { chart: { result: [{ timestamp: number[], indicators: { quote: [{ close: (number|null)[] }] } }], error } }
 * timestamp 는 초 단위 epoch(장 시작 시각) → 뉴욕 날짜로 변환.
 */
import { nyDateOf } from '../../../src/core/calendar';
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

export const yahooAdapter: PriceAdapter = {
  id: 'yahoo',
  isEnabled: () => true,
  url: (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(YAHOO_SYMBOL[symbol])}?range=10y&interval=1d`,
  headers: (env: Env) => ({ 'User-Agent': env.CNN_USER_AGENT, Accept: 'application/json' }),
  parse: parseYahoo,
  normalize: normalizeYahoo,
};
