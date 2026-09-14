import { closeAtUtcOf, isIsoDate } from './calendar';
import { DATA_GATES, RFG_PARAMS, type RfgParams } from './constants';
import type { IndexSymbol, IsoDate, MarketBlock, MarketFlag, PriceSource, RfgRow, RfgSnapshot } from './types';

const SYMBOLS: readonly IndexSymbol[] = ['SPX', 'NDX'];
const PRICE_SOURCES: readonly PriceSource[] = ['fred', 'stooq', 'yahoo'];
const MARKET_FLAGS: readonly MarketFlag[] = ['fg-stale', 'fg-missing', 'gap-warning', 'source-mismatch', 'fg-date-mismatch'];
const FG_SOURCES: readonly RfgSnapshot['fgSource'][] = ['cnn', 'own-history'];

export interface BuildSnapshotInput {
  rows: Record<IndexSymbol, readonly RfgRow[]>;
  priceSource: Record<IndexSymbol, PriceSource>;
  flags: Record<IndexSymbol, MarketFlag[]>;
  generatedAtUtc: string;
  expectedLatestTradingDate: IsoDate;
  holidays: readonly IsoDate[];
  fgSource: RfgSnapshot['fgSource'];
  disclaimerVersion: number;
  params?: RfgParams;
  historyDays?: number;
}

/** RFG 행 → 게시용 스냅샷. 원시 종가는 싣지 않는다(DESIGN §3.6). */
export function buildSnapshot(input: BuildSnapshotInput): RfgSnapshot {
  const params: RfgParams = { ...(input.params ?? RFG_PARAMS) };
  const historyDays = input.historyDays ?? DATA_GATES.HISTORY_DAYS;
  const markets = {} as Record<IndexSymbol, MarketBlock>;
  for (const sym of SYMBOLS) {
    const rows = input.rows[sym];
    const last = rows[rows.length - 1];
    if (last == null) throw new Error(`[buildSnapshot] no rows for ${sym}`);
    const { close: _close, ...latest } = last;
    const history = rows.slice(Math.max(0, rows.length - historyDays)).map((r) => ({ date: r.date, rfg: r.rfg, p: r.p, fear: r.fear }));
    markets[sym] = {
      closeDate: last.date,
      closeAtUtc: closeAtUtcOf(last.date),
      latest,
      history,
      priceSource: input.priceSource[sym],
      flags: [...input.flags[sym]],
    };
  }
  return {
    schemaVersion: 1,
    generatedAtUtc: input.generatedAtUtc,
    expectedLatestTradingDate: input.expectedLatestTradingDate,
    holidays: [...input.holidays],
    params,
    disclaimerVersion: input.disclaimerVersion,
    fgSource: input.fgSource,
    markets,
  };
}

export type SchemaError = { path: string; code: 'missing' | 'type' | 'range' | 'version' };
export type ParseResult = { ok: true; value: RfgSnapshot } | { ok: false; error: SchemaError };

class Fail {
  constructor(public readonly error: SchemaError) {}
}

function fail(path: string, code: SchemaError['code']): never {
  throw new Fail({ path, code });
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (v == null) fail(path, 'missing');
  if (typeof v !== 'object' || Array.isArray(v)) fail(path, 'type');
  return v as Record<string, unknown>;
}

function str(v: unknown, path: string): string {
  if (v == null) fail(path, 'missing');
  if (typeof v !== 'string') fail(path, 'type');
  return v;
}

function num(v: unknown, path: string): number {
  if (v == null) fail(path, 'missing');
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'type');
  return v;
}

function numOrNull(v: unknown, path: string, range?: [number, number]): number | null {
  if (v === null) return null;
  const n = num(v, path);
  if (range && (n < range[0] || n > range[1])) fail(path, 'range');
  return n;
}

function isoDate(v: unknown, path: string): IsoDate {
  const s = str(v, path);
  if (!isIsoDate(s)) fail(path, 'range');
  return s;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  const s = str(v, path);
  if (!allowed.includes(s as T)) fail(path, 'range');
  return s as T;
}

function parseLatest(v: unknown, path: string): MarketBlock['latest'] {
  const o = obj(v, path);
  return {
    date: isoDate(o.date, `${path}.date`),
    dd: numOrNull(o.dd, `${path}.dd`),
    disp: numOrNull(o.disp, `${path}.disp`),
    rv: numOrNull(o.rv, `${path}.rv`),
    composite: numOrNull(o.composite, `${path}.composite`),
    p: numOrNull(o.p, `${path}.p`, [0, 100]),
    fg: numOrNull(o.fg, `${path}.fg`, [0, 100]),
    fgDate: o.fgDate === null ? null : isoDate(o.fgDate, `${path}.fgDate`),
    fgStaleDays: numOrNull(o.fgStaleDays, `${path}.fgStaleDays`),
    fear: numOrNull(o.fear, `${path}.fear`, [0, 100]),
    rfg: numOrNull(o.rfg, `${path}.rfg`, [0, 100]),
    frm: numOrNull(o.frm, `${path}.frm`),
  };
}

function parseMarket(v: unknown, path: string): MarketBlock {
  const o = obj(v, path);
  const historyRaw = o.history;
  if (historyRaw == null) fail(`${path}.history`, 'missing');
  if (!Array.isArray(historyRaw)) fail(`${path}.history`, 'type');
  const history = historyRaw.map((h, i) => {
    const ho = obj(h, `${path}.history[${i}]`);
    return {
      date: isoDate(ho.date, `${path}.history[${i}].date`),
      rfg: numOrNull(ho.rfg, `${path}.history[${i}].rfg`, [0, 100]),
      p: numOrNull(ho.p, `${path}.history[${i}].p`, [0, 100]),
      fear: numOrNull(ho.fear, `${path}.history[${i}].fear`, [0, 100]),
    };
  });
  const flagsRaw = o.flags;
  if (flagsRaw == null) fail(`${path}.flags`, 'missing');
  if (!Array.isArray(flagsRaw)) fail(`${path}.flags`, 'type');
  const flags = flagsRaw.map((f, i) => oneOf(f, MARKET_FLAGS, `${path}.flags[${i}]`));
  return {
    closeDate: isoDate(o.closeDate, `${path}.closeDate`),
    closeAtUtc: str(o.closeAtUtc, `${path}.closeAtUtc`),
    latest: parseLatest(o.latest, `${path}.latest`),
    history,
    priceSource: oneOf(o.priceSource, PRICE_SOURCES, `${path}.priceSource`),
    flags,
  };
}

/** 의존성 없는 런타임 검증. 앱은 이 함수를 통과한 스냅샷만 그린다. */
export function parseSnapshot(input: unknown): ParseResult {
  try {
    const o = obj(input, '$');
    if (o.schemaVersion == null) fail('$.schemaVersion', 'missing');
    if (o.schemaVersion !== 1) fail('$.schemaVersion', 'version');
    const generatedAtUtc = str(o.generatedAtUtc, '$.generatedAtUtc');
    if (!Number.isFinite(Date.parse(generatedAtUtc))) fail('$.generatedAtUtc', 'range');
    const expectedLatestTradingDate = isoDate(o.expectedLatestTradingDate, '$.expectedLatestTradingDate');
    const holidaysRaw = o.holidays;
    if (holidaysRaw == null) fail('$.holidays', 'missing');
    if (!Array.isArray(holidaysRaw)) fail('$.holidays', 'type');
    const holidays = holidaysRaw.map((h, i) => isoDate(h, `$.holidays[${i}]`));
    const paramsRaw = obj(o.params, '$.params');
    const params = {} as RfgParams;
    for (const key of Object.keys(RFG_PARAMS) as (keyof RfgParams)[]) {
      params[key] = num(paramsRaw[key], `$.params.${key}`);
    }
    const disclaimerVersion = num(o.disclaimerVersion, '$.disclaimerVersion');
    const fgSource = oneOf(o.fgSource, FG_SOURCES, '$.fgSource');
    const marketsRaw = obj(o.markets, '$.markets');
    const markets = {} as Record<IndexSymbol, MarketBlock>;
    for (const sym of SYMBOLS) markets[sym] = parseMarket(marketsRaw[sym], `$.markets.${sym}`);
    return {
      ok: true,
      value: { schemaVersion: 1, generatedAtUtc, expectedLatestTradingDate, holidays, params, disclaimerVersion, fgSource, markets },
    };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.error };
    throw e;
  }
}
