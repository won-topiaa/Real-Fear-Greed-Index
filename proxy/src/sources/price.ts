/**
 * 종가 소스 선택 규칙 — "한 창은 한 소스" (DESIGN §3.2).
 * 우선순위대로 fetch → parse → normalize → core 검증. 기대 최신 거래일까지 있는 첫 소스의 시계열을 통째로 쓴다.
 * 성공한 소스가 2개 이상이면 최근 20거래일 교차검증(0.1%)을 status 에 남긴다(게시는 함).
 */
import { DATA_GATES, type DataGates } from '../../../src/core/constants';
import type { IndexSymbol, IsoDate, PricePoint, PriceSource, ValidationIssue } from '../../../src/core/types';
import { crossCheckPriceSeries, validatePriceSeries } from '../../../src/core/validate';
import { fetchText, type FetchTextResult } from '../http';
import type { Ctx, PriceAdapter, SourceReport } from '../types';
import { fredAdapter } from './fred';
import { stooqAdapter } from './stooq';
import { yahooAdapter } from './yahoo';

export const PRICE_ADAPTERS: readonly PriceAdapter[] = [fredAdapter, stooqAdapter, yahooAdapter];

export interface PriceSelection {
  chosen: { source: PriceSource; series: PricePoint[] } | null;
  reports: SourceReport[];
  crossCheck: ValidationIssue[];
  /** 원문 저장용(소스별) */
  raw: Partial<Record<PriceSource, string>>;
}

export interface SelectOptions {
  adapters?: readonly PriceAdapter[];
  gates?: DataGates;
  crossCheckDays?: number;
  crossCheckMaxRelError?: number;
}

function sortByDate(series: PricePoint[]): PricePoint[] {
  return [...series].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 주소를 앞에서부터 시도해 첫 성공 응답을 돌려준다(fallbacks: 그 앞에서 실패한 주소들). 모두 실패하면 마지막 오류. */
async function fetchFirst(ctx: Ctx, urls: readonly string[], headers: Record<string, string>, label: string): Promise<{ res: FetchTextResult; fallbacks: string[] }> {
  let lastErr: unknown = new Error('no url');
  const fallbacks: string[] = [];
  for (const [i, url] of urls.entries()) {
    try {
      return { res: await fetchText(ctx, url, headers), fallbacks };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : 'unknown';
      fallbacks.push(`#${i + 1} ${msg.slice(0, 40)}`);
      if (i < urls.length - 1) ctx.log.warn(`${label}: ${msg} via #${i + 1} — trying next`);
    }
  }
  throw lastErr;
}

export async function selectPriceSeries(ctx: Ctx, symbol: IndexSymbol, expected: IsoDate, opts: SelectOptions = {}): Promise<PriceSelection> {
  const adapters = opts.adapters ?? PRICE_ADAPTERS;
  const gates = opts.gates ?? DATA_GATES;
  const reports: SourceReport[] = [];
  const raw: Partial<Record<PriceSource, string>> = {};
  const valid: Array<{ source: PriceSource; series: PricePoint[] }> = [];
  let chosen: PriceSelection['chosen'] = null;

  for (const adapter of adapters) {
    const base: SourceReport = { id: adapter.id, symbol, status: 'failed', fetchedAtUtc: null, asOf: null, error: null };
    if (!adapter.isEnabled(ctx.env)) {
      reports.push({ ...base, status: 'disabled', error: 'disabled' });
      continue;
    }
    let series: PricePoint[];
    try {
      const got = await fetchFirst(ctx, adapter.urls?.(symbol, ctx.env, ctx.nowUtcMs) ?? [adapter.url(symbol, ctx.env, ctx.nowUtcMs)], adapter.headers(ctx.env), `${adapter.id}/${symbol}`);
      const res = got.res;
      if (got.fallbacks.length > 0) base.fallbacks = got.fallbacks;
      raw[adapter.id] = res.text;
      // 기대 거래일 뒤의 봉(야후 장중 현재가 등)은 아직 확정 종가가 아니다
      series = sortByDate(adapter.normalize(adapter.parse(res.text))).filter((p) => p.date <= expected);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      reports.push({ ...base, fetchedAtUtc: new Date(ctx.nowUtcMs).toISOString(), error: msg.slice(0, 80) });
      ctx.log.warn(`${adapter.id}/${symbol}: ${msg}`);
      continue;
    }
    const fetchedAtUtc = new Date(ctx.nowUtcMs).toISOString();
    const asOf = series[series.length - 1]?.date ?? null;
    const issues = validatePriceSeries(series, gates);
    const fatal = issues.filter((i) => i.fatal);
    if (fatal.length > 0) {
      reports.push({ ...base, status: 'invalid', fetchedAtUtc, asOf, error: fatal.map((i) => i.code).join(','), issues: fatal.slice(0, 5) });
      ctx.log.warn(`${adapter.id}/${symbol}: invalid (${fatal.map((i) => i.code).join(',')})`);
      continue;
    }
    valid.push({ source: adapter.id, series });
    if (asOf !== expected) {
      reports.push({ ...base, status: 'date_lag', fetchedAtUtc, asOf, error: 'date_lag', issues: issues.slice(0, 5) });
      ctx.log.info(`${adapter.id}/${symbol}: date_lag (asOf ${asOf}, expected ${expected})`);
      continue;
    }
    reports.push({ ...base, status: 'ok', fetchedAtUtc, asOf, error: null, issues: issues.slice(0, 5) });
    if (!chosen) chosen = { source: adapter.id, series };
  }

  const crossCheck: ValidationIssue[] = [];
  if (chosen) {
    for (const other of valid) {
      if (other.source === chosen.source) continue;
      crossCheck.push(...crossCheckPriceSeries(chosen.series, other.series, opts.crossCheckDays ?? 20, opts.crossCheckMaxRelError ?? 0.001));
    }
  }
  return { chosen, reports, crossCheck, raw };
}
