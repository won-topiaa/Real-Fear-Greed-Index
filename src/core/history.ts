import { isIsoDate } from './calendar';
import { HISTORY_MAX_DAYS } from './constants';
import type { ComponentSeries } from './damage';
import { roundTo } from './round';
import type { ComponentsBlock, HistoryRow, IndexSymbol, IsoDate, RfgHistory, RfgRow } from './types';

const SYMBOLS: readonly IndexSymbol[] = ['SPX', 'NDX'];
const DIGITS = 2;

const r2 = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : roundTo(v, DIGITS));

export interface BuildHistoryInput {
  rows: Record<IndexSymbol, readonly RfgRow[]>;
  components: Record<IndexSymbol, ComponentSeries>;
  generatedAtUtc: string;
  days?: number;
}

/**
 * RFG 행 → 공개 이력(GET /v1/history.json). DESIGN §3.6 에 따라 CNN 원값(fg, fear)은 싣지 않고 RFG·P 만 싣는다.
 * 최근 days 행 가운데 RFG 가 처음 계산된 행부터 싣는다(앞쪽 결측은 자른다).
 * components 는 최신 행의 세부 지표(원시값은 비율 그대로, 백분위는 소수 2자리).
 */
export function buildHistory(input: BuildHistoryInput): RfgHistory {
  const days = input.days ?? HISTORY_MAX_DAYS;
  const markets = {} as RfgHistory['markets'];
  for (const sym of SYMBOLS) {
    const rows = input.rows[sym];
    const last = rows.length - 1;
    const lastRow = rows[last];
    if (lastRow == null) throw new Error(`[buildHistory] no rows for ${sym}`);
    const c = input.components[sym];
    const at = <T,>(xs: readonly (T | null)[]): T | null => xs[last] ?? null;
    let start = Math.max(0, rows.length - days);
    while (start < last && rows[start]?.rfg == null) start++;
    markets[sym] = {
      rows: rows.slice(start).map((r) => ({ date: r.date, rfg: r2(r.rfg), p: r2(r.p) })),
      components: {
        date: lastRow.date,
        dd: at(c.dd),
        disp: at(c.disp),
        rv: at(c.rv),
        pdd: r2(at(c.pdd)),
        pdisp: r2(at(c.pdisp)),
        prv: r2(at(c.prv)),
      },
    };
  }
  return { schemaVersion: 1, generatedAtUtc: input.generatedAtUtc, markets };
}

export type HistoryParseResult = { ok: true; value: RfgHistory } | { ok: false; error: { path: string } };

class Fail {
  constructor(public readonly path: string) {}
}

function num(v: unknown, path: string, range?: [number, number]): number | null {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Fail(path);
  if (range && (v < range[0] || v > range[1])) throw new Fail(path);
  return v;
}

function date(v: unknown, path: string): IsoDate {
  if (typeof v !== 'string' || !isIsoDate(v)) throw new Fail(path);
  return v;
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) throw new Fail(path);
  return v as Record<string, unknown>;
}

/** 의존성 없는 런타임 검증. 날짜는 오름차순이어야 한다. 웹 화면은 이 함수를 통과한 이력만 그린다. */
export function parseHistory(input: unknown): HistoryParseResult {
  try {
    const o = obj(input, '$');
    if (o.schemaVersion !== 1) throw new Fail('$.schemaVersion');
    if (typeof o.generatedAtUtc !== 'string' || !Number.isFinite(Date.parse(o.generatedAtUtc))) throw new Fail('$.generatedAtUtc');
    const mo = obj(o.markets, '$.markets');
    const markets = {} as RfgHistory['markets'];
    for (const sym of SYMBOLS) {
      const path = `$.markets.${sym}`;
      const m = obj(mo[sym], path);
      if (!Array.isArray(m.rows)) throw new Fail(`${path}.rows`);
      let prev = '';
      const rows: HistoryRow[] = m.rows.map((x, i) => {
        const ro = obj(x, `${path}.rows[${i}]`);
        const d = date(ro.date, `${path}.rows[${i}].date`);
        if (d <= prev) throw new Fail(`${path}.rows[${i}].date`);
        prev = d;
        return { date: d, rfg: num(ro.rfg, `${path}.rows[${i}].rfg`, [0, 100]), p: num(ro.p, `${path}.rows[${i}].p`, [0, 100]) };
      });
      const co = obj(m.components, `${path}.components`);
      const components: ComponentsBlock = {
        date: date(co.date, `${path}.components.date`),
        dd: num(co.dd, `${path}.components.dd`),
        disp: num(co.disp, `${path}.components.disp`),
        rv: num(co.rv, `${path}.components.rv`),
        pdd: num(co.pdd, `${path}.components.pdd`, [0, 100]),
        pdisp: num(co.pdisp, `${path}.components.pdisp`, [0, 100]),
        prv: num(co.prv, `${path}.components.prv`, [0, 100]),
      };
      markets[sym] = { rows, components };
    }
    return { ok: true, value: { schemaVersion: 1, generatedAtUtc: o.generatedAtUtc, markets } };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: { path: e.path } };
    throw e;
  }
}
