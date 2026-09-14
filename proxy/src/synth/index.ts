/**
 * 결정적 합성 데이터 생성기. 픽스처·골든·e2e 테스트가 공유한다.
 * 실응답이 아니라 "알려진 형태"를 본뜬 것이므로 파서 테스트의 근거는 되지만 형태의 증거는 아니다 [검증 필요].
 */
import { addCalendarDays, isTradingDay, NYSE_HOLIDAYS } from '../../../src/core/calendar';
import type { FgPoint, IsoDate, PricePoint } from '../../../src/core/types';

/** mulberry32 — 시드 고정 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 표준정규 근사(Box–Muller) */
function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** end 에서 거꾸로 count 개 거래일. 오래된 → 최신. */
export function tradingDatesEndingAt(end: IsoDate, count: number): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = end;
  while (out.length < count) {
    if (isTradingDay(cur, NYSE_HOLIDAYS)) out.push(cur);
    cur = addCalendarDays(cur, -1);
  }
  return out.reverse();
}

export interface Regime {
  /** 마지막 몇 거래일에 적용 */
  lastDays: number;
  driftPerDay: number;
  volPerDay: number;
}

export interface SynthCloseOptions {
  seed: number;
  start: number;
  driftPerDay: number;
  volPerDay: number;
  regimes?: Regime[];
}

/** 기하 랜덤워크 + 마지막 구간 레짐(폭락·랠리) */
export function synthCloses(count: number, o: SynthCloseOptions): number[] {
  const rand = mulberry32(o.seed);
  const out: number[] = [];
  let price = o.start;
  for (let i = 0; i < count; i++) {
    const fromEnd = count - i;
    const regime = o.regimes?.find((r) => fromEnd <= r.lastDays);
    const drift = regime?.driftPerDay ?? o.driftPerDay;
    const vol = regime?.volPerDay ?? o.volPerDay;
    price = price * Math.exp(drift + vol * gauss(rand));
    out.push(Math.round(price * 100) / 100);
  }
  return out;
}

export function toPricePoints(dates: readonly IsoDate[], closes: readonly number[]): PricePoint[] {
  return dates.map((date, i) => ({ date, close: closes[i] as number }));
}

/** FG 시계열: 기본값 주변 진동 + 마지막 구간 고정값 */
export function synthFg(dates: readonly IsoDate[], o: { seed: number; base: number; amp: number; lastDays?: number; lastValue?: number; source?: FgPoint['source'] }): FgPoint[] {
  const rand = mulberry32(o.seed);
  const n = dates.length;
  return dates.map((date, i) => {
    const fromEnd = n - i;
    let value = o.base + o.amp * Math.sin(i / 9) + (rand() - 0.5) * 6;
    if (o.lastDays != null && o.lastValue != null && fromEnd <= o.lastDays) value = o.lastValue;
    value = Math.max(0, Math.min(100, Math.round(value * 10) / 10));
    return { date, value, source: o.source ?? 'own' };
  });
}

// ── 알려진 형태를 본뜬 응답 직렬화 [검증 필요] ─────────────────────────────

export function fredJson(series: readonly PricePoint[], opts: { holes?: IsoDate[] } = {}): string {
  const holes = new Set(opts.holes ?? []);
  return JSON.stringify({
    realtime_start: '2026-09-12',
    realtime_end: '2026-09-12',
    observation_start: series[0]?.date ?? '',
    observation_end: series[series.length - 1]?.date ?? '',
    units: 'lin',
    output_type: 1,
    file_type: 'json',
    order_by: 'observation_date',
    sort_order: 'asc',
    count: series.length,
    offset: 0,
    limit: 100000,
    observations: series.map((p) => ({
      realtime_start: '2026-09-12',
      realtime_end: '2026-09-12',
      date: p.date,
      value: holes.has(p.date) ? '.' : p.close.toFixed(2),
    })),
  });
}

export function stooqCsv(series: readonly PricePoint[]): string {
  const lines = ['Date,Open,High,Low,Close,Volume'];
  for (const p of series) {
    lines.push(`${p.date},${(p.close * 0.999).toFixed(2)},${(p.close * 1.004).toFixed(2)},${(p.close * 0.995).toFixed(2)},${p.close.toFixed(2)},0`);
  }
  return lines.join('\n') + '\n';
}

export function yahooJson(series: readonly PricePoint[], opts: { nulls?: IsoDate[] } = {}): string {
  const nulls = new Set(opts.nulls ?? []);
  // 장 시작 09:30 ET ≈ 13:30Z(EDT) — 뉴욕 날짜 변환이 같은 날짜를 내도록 낮 시각을 쓴다
  const timestamp = series.map((p) => Math.floor(Date.parse(`${p.date}T14:30:00Z`) / 1000));
  return JSON.stringify({
    chart: {
      result: [
        {
          meta: { symbol: '^GSPC', currency: 'USD', regularMarketPrice: series[series.length - 1]?.close ?? 0 },
          timestamp,
          indicators: { quote: [{ close: series.map((p) => (nulls.has(p.date) ? null : p.close)) }] },
        },
      ],
      error: null,
    },
  });
}

export function cnnJson(history: readonly FgPoint[], current: { score: number; rating?: string; timestamp?: string }): string {
  return JSON.stringify({
    fear_and_greed: {
      score: current.score,
      rating: current.rating ?? 'neutral',
      timestamp: current.timestamp ?? null,
      previous_close: history[history.length - 1]?.value ?? current.score,
      previous_1_week: history[history.length - 6]?.value ?? current.score,
      previous_1_month: history[history.length - 22]?.value ?? current.score,
      previous_1_year: history[0]?.value ?? current.score,
    },
    fear_and_greed_historical: {
      timestamp: history[history.length - 1] ? Date.parse(`${history[history.length - 1]?.date}T00:00:00Z`) : 0,
      score: current.score,
      rating: current.rating ?? 'neutral',
      data: history.map((h) => ({ x: Date.parse(`${h.date}T00:00:00Z`), y: h.value, rating: 'neutral' })),
    },
  });
}

export interface FakeRoute {
  match: (url: string) => boolean;
  status?: number;
  body: string | (() => string);
  contentType?: string;
}

/** 라우트 표로 응답하는 가짜 fetch. 매치 없으면 404. */
export function fakeFetch(routes: FakeRoute[], calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const route = routes.find((r) => r.match(url));
    if (!route) return new Response('not found', { status: 404 });
    const body = typeof route.body === 'function' ? route.body() : route.body;
    return new Response(body, { status: route.status ?? 200, headers: { 'content-type': route.contentType ?? 'application/json' } });
  }) as typeof fetch;
}
