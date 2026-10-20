/**
 * 수집 → 검증 → 계산 → 게시 (DESIGN §7.2).
 * 실패 모드: 지수 하나가 실패하면 그 지수는 이전 스냅샷 블록을 유지(partial). 둘 다 없으면 게시하지 않는다(failed).
 * status.json 은 결과와 무관하게 — 예기치 못한 예외가 나도 — 항상 쓴다.
 */
import { NYSE_HOLIDAYS, expectedLatestTradingDate, nyDateOf } from '../../src/core/calendar';
import { DATA_GATES, RFG_PARAMS, minClosesForSnapshot } from '../../src/core/constants';
import { computeComponentSeries } from '../../src/core/damage';
import { buildHistoryMarket } from '../../src/core/history';
import { computeRfgSeries } from '../../src/core/rfg';
import { buildSnapshot } from '../../src/core/snapshot';
import type { IndexSymbol, MarketBlock, MarketFlag, PricePoint, RfgHistory, RfgRow, RfgSnapshot, ValidationIssue } from '../../src/core/types';
import { DISCLAIMER } from '../../src/text/copy';
import { silentLogger } from './log';
import { publishHistory, publishSnapshot, readPublishedHistory, readPublishedSnapshot, writeHeadersFile, writeStatus, type StatusJson } from './publish';
import { collectFg } from './sources/fg';
import { PRICE_ADAPTERS, selectPriceSeries } from './sources/price';
import { FileStore } from './store/FileStore';
import type { Ctx, Env, Logger, PriceAdapter } from './types';

export const SYMBOLS: readonly IndexSymbol[] = ['SPX', 'NDX'];
const RAW_KEEP_DAYS = 30;

export interface CollectOptions {
  outDir: string;
  dataDir: string;
  env: Env;
  nowUtcMs?: number;
  fetchImpl?: typeof fetch;
  log?: Logger;
  timeoutMs?: number;
  retries?: number;
  runId?: string;
  adapters?: readonly PriceAdapter[];
  /** 테스트에서 healthchecks 핑을 끈다 */
  ping?: boolean;
}

export interface CollectResult {
  result: StatusJson['result'];
  status: StatusJson;
  snapshot: RfgSnapshot | null;
}

async function ping(ctx: Ctx, ok: boolean): Promise<void> {
  const url = ctx.env.HEALTHCHECKS_PING_URL.trim();
  if (!url) return;
  try {
    await ctx.fetchImpl(ok ? url : `${url.replace(/\/$/, '')}/fail`, { method: 'GET' });
  } catch (e) {
    ctx.log.warn(`healthchecks ping failed: ${e instanceof Error ? e.message : 'unknown'}`);
  }
}

function emptyStatus(runAtUtc: string, runId: string, expected: string): StatusJson {
  return {
    runAtUtc,
    runId,
    result: 'failed',
    expectedLatestTradingDate: expected,
    sources: [],
    published: { generatedAtUtc: null, unchanged: false, markets: { SPX: 'none', NDX: 'none' } },
    checks: { crossCheck: { SPX: [], NDX: [] }, closesAvailable: { SPX: 0, NDX: 0 }, fgHistoryPoints: 0 },
    errors: [],
  };
}

export async function collect(opts: CollectOptions): Promise<CollectResult> {
  const nowUtcMs = opts.nowUtcMs ?? Date.now();
  const ctx: Ctx = {
    fetchImpl: opts.fetchImpl ?? fetch,
    env: opts.env,
    nowUtcMs,
    log: opts.log ?? silentLogger,
    timeoutMs: opts.timeoutMs ?? 20_000,
    retries: opts.retries ?? 2,
  };
  const runAtUtc = new Date(nowUtcMs).toISOString();
  const runId = opts.runId ?? `local-${runAtUtc}`;
  const expected = expectedLatestTradingDate(nowUtcMs, NYSE_HOLIDAYS);
  const status = emptyStatus(runAtUtc, runId, expected);
  let snapshot: RfgSnapshot | null = null;

  try {
    const r = await collectInner(ctx, opts, runAtUtc, runId, expected, status);
    snapshot = r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.log.error(`unexpected failure: ${msg}`);
    status.result = 'failed';
    status.errors.push(`unexpected: ${msg.slice(0, 200)}`);
    snapshot = null;
  }

  try {
    await writeHeadersFile(opts.outDir);
    await writeStatus(opts.outDir, status);
  } catch (e) {
    ctx.log.error(`status write failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (opts.ping !== false) await ping(ctx, status.result !== 'failed');
  return { result: status.result, status, snapshot };
}

async function collectInner(ctx: Ctx, opts: CollectOptions, runAtUtc: string, runId: string, expected: string, status: StatusJson): Promise<RfgSnapshot | null> {
  const store = new FileStore(opts.dataDir);
  const errors = status.errors;
  const sources = status.sources;
  const crossCheck = status.checks.crossCheck;
  const closesAvailable = status.checks.closesAvailable;
  const marketsOrigin = status.published.markets;

  ctx.log.info(`run ${runId} expected=${expected}`);
  const previous = await readPublishedSnapshot(opts.outDir);

  // 1. FG
  const fg = await collectFg(ctx, store, expected);
  sources.push(fg.report);
  status.checks.fgHistoryPoints = fg.history.length;
  if (fg.raw) await store.saveRaw(expected, 'cnn.json', fg.raw);

  // 2. 지수별 종가 → 계산
  const rows: Partial<Record<IndexSymbol, RfgRow[]>> = {};
  const prices: Partial<Record<IndexSymbol, readonly PricePoint[]>> = {};
  const priceSource: Partial<Record<IndexSymbol, MarketBlock['priceSource']>> = {};
  const flags: Record<IndexSymbol, MarketFlag[]> = { SPX: [...fg.flags], NDX: [...fg.flags] };
  const minCloses = minClosesForSnapshot(RFG_PARAMS, DATA_GATES.HISTORY_DAYS);

  for (const sym of SYMBOLS) {
    const sel = await selectPriceSeries(ctx, sym, expected, { adapters: opts.adapters ?? PRICE_ADAPTERS });
    sources.push(...sel.reports);
    crossCheck[sym] = sel.crossCheck as ValidationIssue[];
    for (const [src, text] of Object.entries(sel.raw)) await store.saveRaw(expected, `${sym}.${src}.txt`, text);
    if (!sel.chosen) {
      errors.push(`${sym}: no price source reached ${expected}`);
      continue;
    }
    await store.writePriceCache(sym, sel.chosen.source, sel.chosen.series, runAtUtc);
    closesAvailable[sym] = sel.chosen.series.length;
    if (sel.chosen.series.length < minCloses) {
      errors.push(`${sym}: ${sel.chosen.series.length} closes < ${minCloses}`);
      continue;
    }
    const computed = computeRfgSeries(sel.chosen.series, fg.history);
    const last = computed[computed.length - 1];
    if (!last || last.date !== expected) {
      errors.push(`${sym}: last row ${last?.date ?? 'none'} != ${expected}`);
      continue;
    }
    if (last.fg == null && !flags[sym].includes('fg-missing')) flags[sym].push('fg-missing');
    if (last.fgStaleDays != null && last.fgStaleDays > 0 && !flags[sym].includes('fg-stale')) flags[sym].push('fg-stale');
    if (sel.crossCheck.length > 0) flags[sym].push('source-mismatch');
    if (sel.reports.some((r) => r.status === 'ok' && r.issues?.some((i) => i.code === 'gap'))) flags[sym].push('gap-warning');
    rows[sym] = computed;
    prices[sym] = sel.chosen.series;
    priceSource[sym] = sel.chosen.source;
    marketsOrigin[sym] = 'new';
  }

  // 3. 스냅샷 조립 — 실패한 지수는 이전 블록 유지
  let snapshot: RfgSnapshot | null = null;
  const newSymbols = SYMBOLS.filter((s) => rows[s] != null);
  if (newSymbols.length > 0) {
    const built = buildSnapshot({
      rows: {
        SPX: rows.SPX ?? rows.NDX ?? [],
        NDX: rows.NDX ?? rows.SPX ?? [],
      },
      priceSource: { SPX: priceSource.SPX ?? priceSource.NDX ?? 'stooq', NDX: priceSource.NDX ?? priceSource.SPX ?? 'stooq' },
      flags,
      generatedAtUtc: runAtUtc,
      expectedLatestTradingDate: expected,
      holidays: NYSE_HOLIDAYS,
      fgSource: fg.fgSource,
      disclaimerVersion: DISCLAIMER.version,
    });
    const markets = { ...built.markets };
    let complete = true;
    for (const sym of SYMBOLS) {
      if (rows[sym]) continue;
      if (previous?.markets[sym]) {
        markets[sym] = previous.markets[sym];
        marketsOrigin[sym] = 'previous';
      } else {
        complete = false;
      }
    }
    if (complete) snapshot = { ...built, markets };
  }

  if (snapshot && SYMBOLS.every((s) => marketsOrigin[s] === 'new')) status.result = 'ok';
  else if (snapshot) status.result = 'partial';
  else status.result = 'failed';

  const unchanged = snapshot != null && previous != null && SYMBOLS.every((s) => previous.markets[s].closeDate === snapshot!.markets[s].closeDate);
  status.published.unchanged = unchanged;

  if (snapshot) {
    try {
      await publishSnapshot(opts.outDir, snapshot);
      ctx.log.info(`published snapshot for ${expected} (${status.result}${unchanged ? ', unchanged' : ''})`);
      // 이력(웹 화면용)도 스냅샷처럼 지수마다: 새로 계산한 지수는 새 이력, 이전 블록을 쓴 지수는 이전 이력.
      // 화면은 스냅샷의 오늘 값과 이력의 전일·1개월 값을 함께 쓰므로 두 파일의 날짜가 지수마다 같아야 한다.
      // 이전 이력이 없어 한 지수라도 채울 수 없으면 바꾸지 않는다.
      try {
        const prevHistory = await readPublishedHistory(opts.outDir);
        const historyMarkets: Partial<RfgHistory['markets']> = {};
        for (const sym of SYMBOLS) {
          const symRows = rows[sym];
          const symPrices = prices[sym];
          if (symRows && symPrices) historyMarkets[sym] = buildHistoryMarket(sym, symRows, computeComponentSeries(symPrices));
          else if (prevHistory) historyMarkets[sym] = prevHistory.markets[sym];
        }
        if (historyMarkets.SPX && historyMarkets.NDX) {
          await publishHistory(opts.outDir, { schemaVersion: 1, generatedAtUtc: runAtUtc, markets: { SPX: historyMarkets.SPX, NDX: historyMarkets.NDX } });
        }
      } catch (e) {
        errors.push(`history: ${e instanceof Error ? e.message : 'publish failed'}`);
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'publish failed');
      snapshot = null;
      status.result = 'failed';
    }
  } else {
    ctx.log.error(`no snapshot published: ${errors.join('; ')}`);
  }
  status.published.generatedAtUtc = snapshot?.generatedAtUtc ?? previous?.generatedAtUtc ?? null;

  await store.pruneRaw(nyDateOf(ctx.nowUtcMs), RAW_KEEP_DAYS);
  return snapshot;
}
