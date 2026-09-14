/**
 * Stooq (비공식, 키 불필요). CSV `Date,Open,High,Low,Close,Volume`.
 * [검증 필요] 데이터 없을 때 200 + 본문 `No data` 로 알려짐 → 헤더 없으면 schema 실패.
 */
import { isIsoDate } from '../../../src/core/calendar';
import type { IndexSymbol, PricePoint } from '../../../src/core/types';
import type { Env, PriceAdapter } from '../types';

export const STOOQ_SYMBOL: Record<IndexSymbol, string> = { SPX: '^spx', NDX: '^ndx' };

export class StooqSchemaError extends Error {
  constructor(public readonly path: string) {
    super(`schema: ${path}`);
  }
}

export function parseStooq(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const header = lines[0];
  if (!header) throw new StooqSchemaError('empty');
  const cols = header.split(',').map((c) => c.trim());
  if (!cols.includes('Date') || !cols.includes('Close')) throw new StooqSchemaError(`header: ${header.slice(0, 40)}`);
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',');
    if (cells.length < cols.length) throw new StooqSchemaError(`row ${i + 1}: ${cells.length} cells`);
    const row: Record<string, string> = {};
    cols.forEach((c, j) => (row[c] = (cells[j] ?? '').trim()));
    return row;
  });
}

export function normalizeStooq(parsed: unknown): PricePoint[] {
  const rows = parsed as Array<Record<string, string>>;
  const out: PricePoint[] = [];
  for (const r of rows) {
    const date = r.Date ?? '';
    const closeRaw = r.Close ?? '';
    if (!isIsoDate(date)) throw new StooqSchemaError(`Date ${date}`);
    if (closeRaw === '' || closeRaw === 'null') continue;
    const close = Number(closeRaw);
    if (!Number.isFinite(close)) throw new StooqSchemaError(`Close ${closeRaw}`);
    out.push({ date, close });
  }
  return out;
}

export const stooqAdapter: PriceAdapter = {
  id: 'stooq',
  isEnabled: () => true,
  url: (symbol) => `https://stooq.com/q/d/l/?s=${encodeURIComponent(STOOQ_SYMBOL[symbol])}&i=d`,
  headers: (env: Env) => ({ 'User-Agent': env.CNN_USER_AGENT, Accept: 'text/csv, text/plain, */*' }),
  parse: parseStooq,
  normalize: normalizeStooq,
};
