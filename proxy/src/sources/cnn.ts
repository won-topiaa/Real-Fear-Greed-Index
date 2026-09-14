/**
 * CNN Fear & Greed graphdata — 비공식 엔드포인트.
 * 알려진 형태 [검증 필요]:
 *   { fear_and_greed: { score, rating, timestamp?, previous_close?, ... },
 *     fear_and_greed_historical: { data: [{ x: epoch ms, y: 0..100, rating }] } }
 * 실응답은 `npm run inspect -- --source cnn` 으로 형태만 확인해 test/fixtures 에 30일치로 잘라 저장한다.
 */
import { nyDateOf } from '../../../src/core/calendar';
import type { FgPoint, IsoDate } from '../../../src/core/types';
import type { Env } from '../types';

export const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';

export interface CnnParsed {
  current: { score: number; rating: string | null; timestamp: string | null };
  historical: Array<{ x: number; y: number; rating: string | null }>;
}

export class CnnSchemaError extends Error {
  constructor(public readonly path: string) {
    super(`schema: ${path}`);
  }
}

export function cnnHeaders(env: Env): Record<string, string> {
  return { 'User-Agent': env.CNN_USER_AGENT, Accept: 'application/json, text/plain, */*' };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 형태 검사만 한다. 값의 범위는 validateCnn 이 본다. */
export function parseCnn(text: string): CnnParsed {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CnnSchemaError('$ (not json)');
  }
  if (!json || typeof json !== 'object') throw new CnnSchemaError('$');
  const root = json as Record<string, unknown>;
  const cur = root.fear_and_greed;
  if (!cur || typeof cur !== 'object') throw new CnnSchemaError('fear_and_greed');
  const c = cur as Record<string, unknown>;
  if (!isFiniteNumber(c.score)) throw new CnnSchemaError('fear_and_greed.score');
  const hist = root.fear_and_greed_historical;
  if (!hist || typeof hist !== 'object') throw new CnnSchemaError('fear_and_greed_historical');
  const data = (hist as Record<string, unknown>).data;
  if (!Array.isArray(data)) throw new CnnSchemaError('fear_and_greed_historical.data');
  const historical = data.map((d, i) => {
    if (!d || typeof d !== 'object') throw new CnnSchemaError(`fear_and_greed_historical.data[${i}]`);
    const o = d as Record<string, unknown>;
    if (!isFiniteNumber(o.x)) throw new CnnSchemaError(`fear_and_greed_historical.data[${i}].x`);
    if (!isFiniteNumber(o.y)) throw new CnnSchemaError(`fear_and_greed_historical.data[${i}].y`);
    return { x: o.x, y: o.y, rating: typeof o.rating === 'string' ? o.rating : null };
  });
  return {
    current: {
      score: c.score,
      rating: typeof c.rating === 'string' ? c.rating : null,
      timestamp: typeof c.timestamp === 'string' ? c.timestamp : null,
    },
    historical,
  };
}

/** 값 범위·시각 타당성. 문제가 있으면 분류 문자열을 돌려준다(없으면 null). */
export function validateCnn(parsed: CnnParsed, nowUtcMs: number): string | null {
  if (parsed.current.score < 0 || parsed.current.score > 100) return 'range: score';
  const minX = Date.UTC(2000, 0, 1);
  const maxX = nowUtcMs + 86_400_000;
  for (const h of parsed.historical) {
    if (h.y < 0 || h.y > 100) return 'range: historical.y';
    if (h.x < minX || h.x > maxX) return 'range: historical.x';
  }
  return null;
}

/**
 * historical.x → ET 거래일. [검증 필요] x 가 UTC 자정이면 UTC 날짜, 아니면 뉴욕 날짜로 해석한다.
 * inspect 스크립트가 앞 3개 x 를 두 해석으로 나란히 찍어 준다.
 */
export function cnnEpochToDate(x: number): IsoDate {
  if (x % 86_400_000 === 0) return new Date(x).toISOString().slice(0, 10);
  return nyDateOf(x);
}

/** historical → FgPoint(cnn-historical). 같은 날짜가 여러 개면 마지막 값. 날짜 오름차순. */
export function normalizeCnnHistory(parsed: CnnParsed): FgPoint[] {
  const byDate = new Map<IsoDate, FgPoint>();
  for (const h of parsed.historical) {
    byDate.set(cnnEpochToDate(h.x), { date: cnnEpochToDate(h.x), value: h.y, source: 'cnn-historical' });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
