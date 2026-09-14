/**
 * FRED (공식, API 키). SP500 / NASDAQ100 일별 종가, 최근 10년.
 * 알려진 형태 [검증 필요]: { observations: [{ date: 'YYYY-MM-DD', value: '6543.21' | '.' }] } — '.' 은 휴장일/결측.
 * 전일 종가 반영 시각 [검증 필요] — 22:30 UTC 잡에서 자주 date_lag 면 우선순위를 Stooq 로 바꾼다.
 */
import { addCalendarDays, isIsoDate, nyDateOf } from '../../../src/core/calendar';
import type { IndexSymbol, PricePoint } from '../../../src/core/types';
import type { Env, PriceAdapter } from '../types';

export const FRED_SERIES: Record<IndexSymbol, string> = { SPX: 'SP500', NDX: 'NASDAQ100' };
const LOOKBACK_DAYS = 365 * 12;

export class FredSchemaError extends Error {
  constructor(public readonly path: string) {
    super(`schema: ${path}`);
  }
}

export function parseFred(text: string): Array<{ date: string; value: string }> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FredSchemaError('$ (not json)');
  }
  const obs = (json as { observations?: unknown } | null)?.observations;
  if (!Array.isArray(obs)) throw new FredSchemaError('observations');
  return obs.map((o, i) => {
    if (!o || typeof o !== 'object') throw new FredSchemaError(`observations[${i}]`);
    const r = o as Record<string, unknown>;
    if (typeof r.date !== 'string') throw new FredSchemaError(`observations[${i}].date`);
    if (typeof r.value !== 'string') throw new FredSchemaError(`observations[${i}].value`);
    return { date: r.date, value: r.value };
  });
}

/** '.' 결측 제거, 숫자 변환. 정렬·중복은 core validate 가 잡는다. */
export function normalizeFred(parsed: unknown): PricePoint[] {
  const rows = parsed as Array<{ date: string; value: string }>;
  const out: PricePoint[] = [];
  for (const r of rows) {
    if (r.value === '.' || r.value.trim() === '') continue;
    if (!isIsoDate(r.date)) throw new FredSchemaError(`date ${r.date}`);
    const close = Number(r.value);
    if (!Number.isFinite(close)) throw new FredSchemaError(`value ${r.value}`);
    out.push({ date: r.date, close });
  }
  return out;
}

export const fredAdapter: PriceAdapter = {
  id: 'fred',
  isEnabled: (env: Env) => env.FRED_API_KEY.trim().length > 0,
  url: (symbol, env, nowUtcMs) => {
    const start = addCalendarDays(nyDateOf(nowUtcMs), -LOOKBACK_DAYS);
    const q = new URLSearchParams({
      series_id: FRED_SERIES[symbol],
      api_key: env.FRED_API_KEY,
      file_type: 'json',
      observation_start: start,
    });
    return `https://api.stlouisfed.org/fred/series/observations?${q.toString()}`;
  },
  headers: () => ({ Accept: 'application/json' }),
  parse: parseFred,
  normalize: normalizeFred,
};
