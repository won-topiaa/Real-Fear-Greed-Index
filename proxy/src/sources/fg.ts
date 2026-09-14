/**
 * FG_t 수집 (DESIGN §3.3). 마감 후 잡이 처음 관측한 CNN 현재값을 거래일 t 의 FG 로 기록한다.
 * historical 은 백필에만 쓰고, 같은 날짜는 own > cnn-historical, 첫 관측 유지.
 */
import { mergeFgHistory } from '../../../src/core/align';
import { nyDateOf } from '../../../src/core/calendar';
import type { FgPoint, IsoDate, MarketFlag } from '../../../src/core/types';
import { validateFgSeries } from '../../../src/core/validate';
import { fetchText } from '../http';
import type { FileStore } from '../store/FileStore';
import type { Ctx, SourceReport } from '../types';
import { CNN_URL, cnnHeaders, normalizeCnnHistory, parseCnn, validateCnn } from './cnn';

export interface FgCollection {
  /** 병합된 전체 히스토리(계산 입력) */
  history: FgPoint[];
  report: SourceReport;
  flags: MarketFlag[];
  fgSource: 'cnn' | 'own-history';
  raw: string | null;
}

export async function collectFg(ctx: Ctx, store: FileStore, expected: IsoDate): Promise<FgCollection> {
  const previous = await store.readFgHistory();
  const fetchedAtUtc = new Date(ctx.nowUtcMs).toISOString();
  const base: SourceReport = { id: 'cnn', status: 'failed', fetchedAtUtc, asOf: null, error: null };
  const flags: MarketFlag[] = [];

  try {
    const res = await fetchText(ctx, CNN_URL, cnnHeaders(ctx.env));
    const parsed = parseCnn(res.text);
    const rangeError = validateCnn(parsed, ctx.nowUtcMs);
    if (rangeError) throw new Error(rangeError);

    const own: FgPoint = { date: expected, value: parsed.current.score, observedAtUtc: fetchedAtUtc, source: 'own' };
    const historical = normalizeCnnHistory(parsed);
    const merged = mergeFgHistory(previous, [...historical, own]);
    const issues = validateFgSeries(merged).filter((i) => i.fatal);
    if (issues.length > 0) throw new Error(`invalid: ${issues.map((i) => i.code).join(',')}`);
    await store.writeFgHistory(merged);

    if (parsed.current.timestamp) {
      const ts = Date.parse(parsed.current.timestamp);
      if (Number.isFinite(ts) && nyDateOf(ts) !== expected) flags.push('fg-date-mismatch');
    }
    return { history: merged, report: { ...base, status: 'ok', asOf: expected }, flags, fgSource: 'cnn', raw: res.text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    ctx.log.warn(`cnn: ${msg}`);
    const last = previous[previous.length - 1];
    flags.push(last ? 'fg-stale' : 'fg-missing');
    return {
      history: previous,
      report: { ...base, status: 'failed', asOf: last?.date ?? null, error: msg.slice(0, 80) },
      flags,
      fgSource: 'own-history',
      raw: null,
    };
  }
}
