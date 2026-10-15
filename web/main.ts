/**
 * 실질 공포탐욕지수 웹 화면. 같은 출처의 /v1/snapshot.json(오늘 값) 과 /v1/history.json(1년 이력)을 그린다.
 * 숫자·문턱·문구는 src/core·src/text 에서만 온다(앱과 같은 모듈을 번들한다). 행동 지시 없이 지수만 보여준다.
 */
import { bandOf } from '../src/core/classify';
import { CHART_RANGES, COMPARE_OFFSETS, DISPLAY_BANDS } from '../src/core/constants';
import { assessFreshness } from '../src/core/freshness';
import { parseHistory } from '../src/core/history';
import { parseSnapshot } from '../src/core/snapshot';
import type { Band, HistoryRow, IndexSymbol, RfgHistory, RfgSnapshot } from '../src/core/types';
import { APP_TITLE, COPY, DISCLAIMER, LABELS, WEB_COPY } from '../src/text/copy';
import { WORLD_EVENTS } from '../src/text/events';
import { EMPTY, formatBasisLine, formatKst, formatPercent, formatScore, formatTradingDate } from '../src/text/format';

const SYMBOLS: readonly IndexSymbol[] = ['SPX', 'NDX'];
const BAND_COLOR: Record<Band, string> = {
  EXTREME_FEAR: 'var(--b-ef)',
  FEAR: 'var(--b-f)',
  NEUTRAL: 'var(--b-n)',
  GREED: 'var(--b-g)',
  EXTREME_GREED: 'var(--b-eg)',
  UNKNOWN: 'var(--muted)',
};
/** 구간 경계(표시값). 정수 판정과 맞추려고 상한 + 0.5 를 경계로 그린다. */
const BAND_EDGES: number[] = [0, ...DISPLAY_BANDS.map((b) => Math.min(100, b.max + 0.5))];
const STORAGE_KEY = 'rfg.index';
const RANGE_KEY = 'rfg.range';
/** 예전에 '두 지수 함께 보기'를 저장하던 키. 이제 저장하지 않고, 남아 있으면 지운다(기본은 한 지수씩 따로 보기). */
const LEGACY_COMPARE_KEY = 'rfg.compare';
/** 비교 모드의 선 색(배경 띠의 빨강·파랑과 겹치지 않게 잉크·보라). dataviz 검증: 정상·CVD ΔE ≥ 30, 대비 ≥ 3:1 */
const SERIES_COLOR: Record<IndexSymbol, string> = { SPX: 'var(--s-spx)', NDX: 'var(--s-ndx)' };
type RangeKey = keyof typeof CHART_RANGES | 'max';
const RANGE_KEYS: readonly RangeKey[] = ['y1', 'y3', 'y5', 'max'];
/** 이보다 많은 거래일을 그리면 눈금을 월 대신 연 단위로 */
const YEARLY_TICKS_AFTER = 520;
const TABLE_ROWS = 20;

interface State {
  snapshot: RfgSnapshot;
  history: RfgHistory | null;
  index: IndexSymbol;
  range: RangeKey;
  compare: boolean;
  /** 주요 사건 목록에서 고른 항목(WORLD_EVENTS 인덱스) */
  eventIdx: number;
  /** 고른 사건을 추이 차트에 세로선으로 표시할지(사용자가 사건을 고르거나 '차트에서 보기'를 누르면 켠다) */
  markEvent: boolean;
}

/** 차트에 그릴 한 선: 공통 날짜 축에 맞춘 값 */
interface ChartSeries {
  key: IndexSymbol;
  label: string;
  color: string;
  values: (number | null)[];
}

const app = document.getElementById('app') as HTMLElement;
let state: State | null = null;
let chartObserver: ResizeObserver | null = null;

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const bandText = (b: Band): string => LABELS.band[b];

function readIndex(): IndexSymbol {
  const q = new URLSearchParams(location.search).get('i');
  if (q === 'SPX' || q === 'NDX') return q;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'SPX' || v === 'NDX') return v;
  } catch {
    /* 저장소를 못 쓰는 환경 — 기본값 */
  }
  return 'SPX';
}

function saveIndex(i: IndexSymbol): void {
  try {
    localStorage.setItem(STORAGE_KEY, i);
  } catch {
    /* 무시 */
  }
}

function readRange(): RangeKey {
  try {
    const v = localStorage.getItem(RANGE_KEY);
    if (v && (RANGE_KEYS as readonly string[]).includes(v)) return v as RangeKey;
  } catch {
    /* 기본값 */
  }
  return 'y1';
}

function clearLegacyCompare(): void {
  try {
    localStorage.removeItem(LEGACY_COMPARE_KEY);
  } catch {
    /* 무시 */
  }
}

function saveRange(r: RangeKey): void {
  try {
    localStorage.setItem(RANGE_KEY, r);
  } catch {
    /* 무시 */
  }
}

/** 기간에 맞춘 공통 날짜 축. 요청한 기간보다 이력이 짧으면 있는 만큼(short). */
function rangeAxis(dates: string[], range: RangeKey): { dates: string[]; short: boolean } {
  if (range === 'max') return { dates, short: false };
  const days = CHART_RANGES[range] + 1;
  return { dates: dates.slice(-days), short: dates.length < days };
}

/** 여러 지수의 이력을 날짜 합집합 축에 맞춘다. 그 지수의 이력이 없는 날은 null. */
function alignSeries(list: { key: IndexSymbol; rows: HistoryRow[] }[], range: RangeKey): { dates: string[]; short: boolean; series: ChartSeries[]; starts: Record<string, string> } {
  const all = Array.from(new Set(list.flatMap((l) => l.rows.map((r) => r.date)))).sort();
  const axis = rangeAxis(all, range);
  const series = list.map((l) => {
    const byDate = new Map(l.rows.map((r) => [r.date, r.rfg] as const));
    return { key: l.key, label: LABELS.index[l.key], color: SERIES_COLOR[l.key], values: axis.dates.map((d) => byDate.get(d) ?? null) };
  });
  const starts: Record<string, string> = {};
  for (const l of list) starts[l.key] = l.rows[0]?.date ?? '';
  return { ...axis, series, starts };
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function load(): Promise<void> {
  app.innerHTML = `<p class="state">${esc(WEB_COPY.loading)}</p>`;
  try {
    const [snapRaw, histRaw] = await Promise.all([fetchJson('./v1/snapshot.json'), fetchJson('./v1/history.json').catch(() => null)]);
    const snap = parseSnapshot(snapRaw);
    if (!snap.ok) throw new Error(`snapshot ${snap.error.path}`);
    const hist = histRaw == null ? null : parseHistory(histRaw);
    clearLegacyCompare();
    state = { snapshot: snap.value, history: hist && hist.ok ? hist.value : null, index: readIndex(), range: readRange(), compare: false, eventIdx: WORLD_EVENTS.length - 1, markEvent: false };
    render();
  } catch {
    app.innerHTML = `<p class="state">${esc(WEB_COPY.error)}</p><button class="retry" type="button">${esc(WEB_COPY.retry)}</button>`;
    app.querySelector('.retry')?.addEventListener('click', () => void load());
  }
}

/** 지수의 이력. history.json 이 없으면 스냅샷의 60거래일 이력으로 대신한다. */
function seriesFor(s: State, sym: IndexSymbol = s.index): HistoryRow[] {
  const h = s.history?.markets[sym].rows;
  if (h && h.length > 0) return h;
  return s.snapshot.markets[sym].history.map((r) => ({ date: r.date, rfg: r.rfg, p: r.p }));
}

type Page = 'home' | 'trend' | 'events' | 'components' | 'method';
const PAGES: readonly Page[] = ['home', 'trend', 'events', 'components', 'method'];

function currentPage(): Page {
  const p = location.hash.replace(/^#\/?/, '') as Page;
  return PAGES.includes(p) ? p : 'home';
}

function go(page: Page): void {
  const hash = page === 'home' ? '#/' : `#/${page}`;
  if (location.hash === hash) render();
  else location.hash = hash; // hashchange → render
}

// ── 아이콘(선 아이콘, currentColor) ──────────────────────────────────────
const ICON = {
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="var(--ink)"/><path d="M8 20a8 8 0 0 1 16 0" fill="none" stroke="var(--b-f)" stroke-width="3.2" stroke-linecap="round"/><path d="M16 20l5-6" stroke="var(--surface)" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="20" r="2" fill="var(--surface)"/></svg>',
  trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l5-6 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 6h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  events: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15" r="2" fill="currentColor"/></svg>',
  components: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  method: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="currentColor"/></svg>',
  compare: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l4-5 3 3 5-6 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  sentiment: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/></svg>',
  change: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17V7M7 7l-3 3M7 7l3 3M17 7v10M17 17l-3-3M17 17l3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
} as const;

function render(): void {
  if (!state) return;
  const page = currentPage();
  chartObserver?.disconnect();
  chartObserver = null;
  app.innerHTML = page === 'home' ? homeHtml(state) : detailHtml(state, page);
  bindCommon();
  if (page === 'trend') mountChart(state);
}

/** 오늘 값 표시 가능 여부와 상태 띠·배지 문구 */
function freshnessOf(s: State): { blocked: boolean; level: 'ok' | 'warn' | 'bad'; text: string } {
  const market = s.snapshot.markets[s.index];
  const fresh = assessFreshness(s.snapshot, s.index, Date.now());
  const basis = formatBasisLine(market);
  if (fresh.level === 'stale') return { blocked: true, level: 'bad', text: COPY.freshness('stale', fresh.tradingDaysBehind) };
  if (market.latest.rfg == null) return { blocked: true, level: 'warn', text: COPY.fgMissing };
  if (fresh.level === 'delayed') return { blocked: false, level: 'warn', text: `${basis} · ${COPY.freshness('delayed', fresh.tradingDaysBehind)}` };
  return { blocked: false, level: 'ok', text: WEB_COPY.statusFresh(basis) };
}

function indexSwitchHtml(s: State): string {
  return `<div class="switch" role="group" aria-label="지수 선택">
      ${SYMBOLS.map((sym) => `<button type="button" data-index="${sym}" aria-pressed="${sym === s.index}">${esc(LABELS.index[sym])}</button>`).join('')}
    </div>`;
}

// ── 홈 ───────────────────────────────────────────────────────────────────

function homeHtml(s: State): string {
  const latest = s.snapshot.markets[s.index].latest;
  const f = freshnessOf(s);
  const rows = seriesFor(s);
  const prev = rows[rows.length - 2]?.rfg ?? null;
  const change = latest.rfg != null && prev != null ? signedScore(latest.rfg, prev) : EMPTY;
  const spx = s.snapshot.markets.SPX.latest.rfg;
  const ndx = s.snapshot.markets.NDX.latest.rfg;
  const stat = (icon: string, value: string, label: string, band: Band | null): string => `<div class="stat">
        <div class="stat-top"><span class="stat-icon">${icon}</span><span class="stat-value">${esc(value)}</span></div>
        <div class="stat-label">${band ? `<span class="swatch" style="--sw:${BAND_COLOR[band]}"></span>` : ''}${esc(label)}</div>
      </div>`;
  const tiles = (['trend', 'events', 'components', 'method'] as const)
    .map(
      (k) => `<a class="tile-link" href="#/${k}">
        <span class="tile-icon tile-${k}">${ICON[k]}</span>
        <span class="tile-title">${esc(WEB_COPY.pages[k].title)}</span>
        <span class="tile-desc">${esc(WEB_COPY.pages[k].desc)}</span>
      </a>`,
    )
    .join('');
  return `
    <header class="topbar">
      <a class="brand" href="#/" aria-label="${esc(APP_TITLE)}"><span class="logo">${ICON.logo}</span><span class="brand-name">${esc(APP_TITLE)}</span></a>
      ${indexSwitchHtml(s)}
    </header>
    <section class="hero" aria-label="${esc(LABELS.axis.rfg)}">
      ${f.blocked ? `<p class="blocked">${esc(f.text)}</p>` : arcGaugeHtml(latest.rfg)}
      <div class="status status-${f.level}"><span class="status-dot"></span>${esc(f.text)}</div>
    </section>
    <section class="card stats" aria-label="요약">
      ${stat(ICON.sentiment, formatScore(latest.fg), WEB_COPY.stats.sentiment, latest.fg == null ? null : bandOf(latest.fg))}
      ${stat(ICON.components, formatScore(latest.p == null ? null : 100 - latest.p), WEB_COPY.stats.price, latest.p == null ? null : bandOf(100 - latest.p))}
      ${stat(ICON.change, change, WEB_COPY.stats.change, null)}
    </section>
    <h2 class="section-title">${esc(WEB_COPY.promoSection)}</h2>
    <section class="card promo">
      <div class="promo-body">
        <span class="promo-icon">${ICON.compare}</span>
        <div class="promo-title">${esc(WEB_COPY.promoTitle(formatScore(spx), formatScore(ndx)))}</div>
        <p class="promo-desc">${esc(WEB_COPY.promoDesc)}</p>
      </div>
      <button type="button" class="pill" data-promo>${esc(WEB_COPY.promoCta)}</button>
    </section>
    <h2 class="section-title">${esc(WEB_COPY.exploreSection)}</h2>
    <nav class="tiles" aria-label="${esc(WEB_COPY.exploreSection)}">${tiles}</nav>
    <p class="fine">${esc(DISCLAIMER.short)} ${esc(WEB_COPY.updated(kstText(s.snapshot.generatedAtUtc)))}</p>`;
}

// ── 상세 화면 ─────────────────────────────────────────────────────────────

function detailHtml(s: State, page: Exclude<Page, 'home'>): string {
  const f = freshnessOf(s);
  let body = '';
  if (page === 'trend') body = `${f.blocked ? '' : compareHtml(seriesFor(s))}${trendCardHtml(s)}`;
  else if (page === 'events') body = eventsHtml(s);
  else if (page === 'components') body = componentsHtml(s);
  else
    body = `<section class="card method">
        <h2>${esc(WEB_COPY.pages.method.title)}</h2>
        <p>${esc(WEB_COPY.subtitle)}</p>
        <p>${esc(WEB_COPY.method())}</p>
        ${legendHtml('chart-legend')}
      </section>
      <section class="card method">
        <p>${esc(WEB_COPY.sources)}</p>
        <p>${esc(DISCLAIMER.full)}</p>
        <p class="note">${esc(WEB_COPY.updated(kstText(s.snapshot.generatedAtUtc)))}</p>
      </section>`;
  // 주요 사건은 두 지수를 함께 보여주고, 계산 방법은 지수와 무관하다
  const showSwitch = page === 'trend' || page === 'components';
  return `
    <nav class="detail-nav">
      <a class="back" href="#/">${ICON.back}<span>${esc(WEB_COPY.back)}</span></a>
      ${page === 'method' ? '' : `<a class="info" href="#/method" aria-label="${esc(WEB_COPY.infoLabel)}">${ICON.method}</a>`}
    </nav>
    <h1 class="page-title">${esc(WEB_COPY.pages[page].title)}</h1>
    <div class="status status-${f.level}"><span class="status-dot"></span>${esc(f.text)}</div>
    ${showSwitch ? `<div class="detail-switch">${indexSwitchHtml(s)}</div>` : ''}
    ${body}`;
}

function trendCardHtml(s: State): string {
  const rows = seriesFor(s);
  const chartSyms: IndexSymbol[] = s.compare ? [...SYMBOLS] : [s.index];
  const chart = alignSeries(chartSyms.map((k) => ({ key: k, rows: seriesFor(s, k) })), s.range);
  const axisStart = chart.dates[0] ?? '';
  // 시작일 안내: 한 지수면 기간이 이력보다 길 때, 비교면 기간 시작보다 늦게 시작하는 지수마다
  const startNotes = s.compare
    ? chartSyms.filter((k) => (chart.starts[k] ?? '') > axisStart).map((k) => WEB_COPY.seriesStart(LABELS.index[k], formatYmd(chart.starts[k] ?? '')))
    : chart.short || s.range === 'max'
      ? [WEB_COPY.dataStart(formatYmd(rows[0]?.date ?? ''))]
      : [];
  const chartTitle = s.compare ? `${LABELS.index.SPX} · ${LABELS.index.NDX}` : LABELS.index[s.index];
  return `<section class="card" id="chart-card">
      <div class="card-head">
        <h2>${esc(WEB_COPY.chartTitle)} · ${esc(chartTitle)}</h2>
        <div class="controls">
          <button type="button" class="toggle" data-compare aria-pressed="${s.compare}">${esc(WEB_COPY.compareToggle)}</button>
          <div class="switch small" role="group" aria-label="${esc(WEB_COPY.rangeLabel)}">
            ${RANGE_KEYS.map((k) => `<button type="button" data-range="${k}" aria-pressed="${k === s.range}">${esc(WEB_COPY.ranges[k])}</button>`).join('')}
          </div>
        </div>
      </div>
      ${s.compare ? seriesLegendHtml(chart.series) : ''}
      ${legendHtml('chart-legend')}
      ${startNotes.map((t) => `<p class="note">${esc(t)}</p>`).join('')}
      <div class="chart" id="chart"></div>
      ${tableHtml(chart.dates, chart.series)}
    </section>`;
}

function mountChart(s: State): void {
  const chartEl = document.getElementById('chart');
  if (!chartEl) return;
  const chartSyms: IndexSymbol[] = s.compare ? [...SYMBOLS] : [s.index];
  const chart = alignSeries(chartSyms.map((k) => ({ key: k, rows: seriesFor(s, k) })), s.range);
  let lastWidth = 0;
  chartObserver = new ResizeObserver(() => {
    const w = Math.round(chartEl.clientWidth);
    if (w !== lastWidth) {
      lastWidth = w;
      const ev = s.markEvent ? WORLD_EVENTS[s.eventIdx] : undefined;
      drawChart(chartEl, chart.dates, chart.series, s.compare, ev ? { date: ev.date, label: ev.title } : null);
    }
  });
  chartObserver.observe(chartEl);
}

/** 모든 화면 공통 이벤트. 요소가 있는 화면에서만 붙는다. */
function bindCommon(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-index]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = b.dataset.index;
      if ((i === 'SPX' || i === 'NDX') && state) {
        state.index = i;
        saveIndex(i);
        render();
      }
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = b.dataset.range as RangeKey | undefined;
      if (r && RANGE_KEYS.includes(r) && state) {
        state.range = r;
        saveRange(r);
        render();
      }
    }),
  );
  app.querySelector<HTMLButtonElement>('[data-compare]')?.addEventListener('click', () => {
    if (!state) return;
    state.compare = !state.compare; // 이번 방문 동안만(저장하지 않는다)
    render();
  });
  // '추이' 타일은 기본 보기(선택한 지수 하나)로 연다. 겹쳐 보기는 '비교 보기'·'두 지수 함께 보기'로만 켠다.
  app.querySelector<HTMLAnchorElement>('.tile-link[href="#/trend"]')?.addEventListener('click', () => {
    if (state) state.compare = false;
  });
  app.querySelector<HTMLButtonElement>('[data-promo]')?.addEventListener('click', () => {
    if (!state) return;
    state.compare = true;
    go('trend');
  });
  // 주요 사건: 고르면 차트에 표시할 사건이 바뀌고, '차트에서 보기'는 그 날짜가 들어가는 가장 짧은 기간으로 추이 화면을 연다
  const pickEvent = (i: number, focusId: string): void => {
    if (!state) return;
    state.eventIdx = Math.max(0, Math.min(WORLD_EVENTS.length - 1, i));
    state.markEvent = true;
    render();
    document.getElementById(focusId)?.focus();
  };
  const s = state;
  if (!s) return;
  app.querySelector<HTMLSelectElement>('#event-select')?.addEventListener('change', (e) => pickEvent(Number((e.target as HTMLSelectElement).value), 'event-select'));
  app.querySelector('#event-prev')?.addEventListener('click', () => pickEvent(s.eventIdx - 1, 'event-prev'));
  app.querySelector('#event-next')?.addEventListener('click', () => pickEvent(s.eventIdx + 1, 'event-next'));
  app.querySelector('#event-chart')?.addEventListener('click', () => {
    const ev = WORLD_EVENTS[s.eventIdx];
    if (!ev) return;
    s.markEvent = true;
    s.range = rangeCovering(ev.date, [...SYMBOLS].map((k) => seriesFor(s, k)));
    saveRange(s.range);
    go('trend');
  });
}

/** date 이상인 첫 행의 인덱스(없으면 −1). 행은 날짜 오름차순. */
function rowAtOrAfter(rows: HistoryRow[], date: string): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((rows[mid]?.date ?? '') < date) lo = mid + 1;
    else hi = mid;
  }
  return lo < rows.length ? lo : -1;
}

/** 날짜가 들어가는 가장 짧은 기간 버튼. 가장 긴 이력 기준으로 그날부터 끝까지의 거래일을 센다. */
function rangeCovering(date: string, lists: HistoryRow[][]): RangeKey {
  const longest = lists.reduce((a, b) => (b.length > a.length ? b : a), [] as HistoryRow[]);
  const i = rowAtOrAfter(longest, date);
  if (i < 0) return 'y1';
  const span = longest.length - 1 - i;
  // 사건 앞쪽도 조금 보이도록 여유 10거래일
  for (const k of ['y1', 'y3', 'y5'] as const) if (span + 10 <= CHART_RANGES[k]) return k;
  return 'max';
}

/** '2022-10-21' → '2022년 10월 21일' */
function formatYmd(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return y && m && day ? `${y}년 ${m}월 ${day}일` : EMPTY;
}

function kstText(utc: string): string {
  const k = formatKst(utc);
  return k.date === EMPTY ? EMPTY : `${formatTradingDate(k.date, 'short')} ${k.time}`;
}

/** 색 안내: 각 색이 어느 구간·점수 범위인지 이름과 함께 적는다(색만으로 뜻을 전하지 않는다). */
function legendHtml(extraClass = ''): string {
  let lo = 0;
  const items = DISPLAY_BANDS.map((b) => {
    const range = `${lo}–${b.max}`;
    lo = b.max + 1;
    return `<span class="item" role="listitem">${bandLabelHtml(b.key)}<span class="range">${range}</span></span>`;
  }).join('');
  return `<div class="legend ${extraClass}" role="list" aria-label="${esc(WEB_COPY.legendLabel)}">${items}</div>`;
}

function bandLabelHtml(b: Band): string {
  return `<span class="swatch" style="--sw:${BAND_COLOR[b]}"></span>${esc(bandText(b))}`;
}

// ── 게이지 ────────────────────────────────────────────────────────────────

/** 굵은 원호 게이지(홈): 0~값까지 채우고 끝에 흰 손잡이. 색은 그 값의 구간색. */
function arcGaugeHtml(value: number | null): string {
  const band = bandOf(value);
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const cx = 160;
  const cy = 172;
  const r = 128;
  const sw = 34;
  const pt = (val: number): [number, number] => {
    const th = Math.PI * (1 - val / 100);
    return [cx + r * Math.cos(th), cy - r * Math.sin(th)];
  };
  const f = (n: number): string => n.toFixed(2);
  const [x0, y0] = pt(0);
  const [x1, y1] = pt(100);
  const [xv, yv] = pt(v);
  const track = `<path d="M${f(x0)} ${f(y0)} A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}" class="arc-track" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
  // 채운 부분은 공포(빨강) → 중립(회색) → 탐욕(파랑) 그라데이션. 반원에서 x 는 값에 단조라, 각 구간 가운데 값의 x 에 그 구간색을 두면
  // 손잡이 위치의 색이 그 값의 구간색과 맞는다.
  const xn = (val: number): number => (1 - Math.cos((Math.PI * val) / 100)) / 2;
  let lo = 0;
  const stops = DISPLAY_BANDS.map((b) => {
    const mid = (lo + b.max) / 2;
    lo = b.max + 1;
    return `<stop offset="${(xn(mid) * 100).toFixed(1)}%" style="stop-color:${BAND_COLOR[b.key]}"/>`;
  }).join('');
  const grad = `<linearGradient id="arc-grad" gradientUnits="userSpaceOnUse" x1="${cx - r}" y1="0" x2="${cx + r}" y2="0">${stops}</linearGradient>`;
  const fill = value == null || v < 0.5 ? '' : `<path d="M${f(x0)} ${f(y0)} A${r} ${r} 0 0 1 ${f(xv)} ${f(yv)}" stroke="url(#arc-grad)" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
  const knob = value == null ? '' : `<circle cx="${f(xv)}" cy="${f(yv)}" r="${sw / 2 - 4}" class="arc-knob"/>`;
  const label = `${LABELS.axis.rfg} ${formatScore(value)}, ${bandText(band)}`;
  return `<div class="arc-gauge" style="--glow:${BAND_COLOR[band]}">
      <div class="arc-wrap">
        <svg viewBox="0 0 320 ${cy + sw / 2 + 4}" role="img" aria-label="${esc(label)}">
          <defs>${grad}<filter id="knob-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.25"/></filter></defs>
          ${track}${fill}${knob}
        </svg>
        <div class="arc-center">
          <div class="arc-label">${esc(WEB_COPY.gaugeLabel)}</div>
          <div class="arc-value">${esc(formatScore(value))}</div>
          <div class="arc-band">${bandLabelHtml(band)}</div>
        </div>
      </div>
      ${legendHtml('gauge-legend')}
    </div>`;
}

// ── 과거 값 ───────────────────────────────────────────────────────────────

function compareHtml(rows: HistoryRow[]): string {
  const last = rows.length - 1;
  const items = (Object.keys(COMPARE_OFFSETS) as (keyof typeof COMPARE_OFFSETS)[]).map((k) => {
    const row = rows[last - COMPARE_OFFSETS[k]];
    const v = row?.rfg ?? null;
    const b = bandOf(v);
    const when = row ? formatTradingDate(row.date, 'short') : '';
    return `<div class="tile" title="${esc(when)}">
        <div class="label">${esc(WEB_COPY.compare[k])}</div>
        <div class="value">${esc(formatScore(v))}</div>
        <div class="band">${v == null ? '' : bandLabelHtml(b)}</div>
      </div>`;
  });
  return `<section class="card"><h2>${esc(WEB_COPY.compareTitle)}</h2><div class="compare">${items.join('')}</div></section>`;
}

// ── 1년 추이 차트 ─────────────────────────────────────────────────────────

function drawChart(el: HTMLElement, dates: string[], series: ChartSeries[], compare: boolean, marker: { date: string; label: string } | null): void {
  const n = dates.length;
  if (n < 2 || series.every((sr) => sr.values.every((v) => v == null))) {
    el.innerHTML = `<p class="note">${esc(WEB_COPY.chartEmpty)}</p>`;
    return;
  }
  const width = Math.max(280, Math.round(el.clientWidth));
  const height = 220;
  // 비교 모드는 선 끝에 '지수 이름 값' 라벨이 붙어 오른쪽 여백이 더 필요하다
  const m = { l: 30, r: compare ? 92 : 34, t: 10, b: 26 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const x = (i: number): number => m.l + (i / (n - 1)) * iw;
  const y = (v: number): number => m.t + (1 - v / 100) * ih;
  const f = (v: number): string => v.toFixed(1);

  const washes = DISPLAY_BANDS.map((b, i) => {
    const lo = BAND_EDGES[i] ?? 0;
    const hi = BAND_EDGES[i + 1] ?? 100;
    return `<rect x="${m.l}" y="${f(y(hi))}" width="${f(iw)}" height="${f(y(lo) - y(hi))}" style="fill:${BAND_COLOR[b.key]};fill-opacity:var(--wash)"/>`;
  }).join('');
  const grid = [25, 50, 75].map((v) => `<line x1="${m.l}" x2="${m.l + iw}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="var(--grid)" stroke-width="1"/>`).join('');
  const base = `<line x1="${m.l}" x2="${m.l + iw}" y1="${f(y(0))}" y2="${f(y(0))}" stroke="var(--axis)" stroke-width="1"/>`;
  const yTicks = [0, 25, 50, 75, 100].map((v) => `<text class="tick" x="${m.l - 6}" y="${f(y(v) + 4)}" text-anchor="end">${v}</text>`).join('');

  // 기간이 짧으면 월이 바뀌는 첫 거래일(좁으면 격월), 길면 해가 바뀌는 첫 거래일에 눈금
  const yearly = n > YEARLY_TICKS_AFTER;
  const key = (d: string): string => (yearly ? d.slice(0, 4) : d.slice(0, 7));
  const starts: number[] = [];
  for (let i = 1; i < n; i++) if (key(dates[i] ?? '') !== key(dates[i - 1] ?? '')) starts.push(i);
  // 눈금 글자가 겹치지 않도록 평균 간격이 46px 이상이 되게 솎는다(좁은 화면의 '최대' 등)
  const step = Math.max(1, Math.ceil(46 / (iw / Math.max(1, starts.length + 1))));
  const xTicks = starts
    .filter((_, k) => k % step === 0)
    .map((i) => {
      const d = dates[i] ?? '';
      const mo = Number(d.slice(5, 7));
      const text = yearly || mo === 1 ? `${d.slice(0, 4)}년` : `${mo}월`;
      return `<line x1="${f(x(i))}" x2="${f(x(i))}" y1="${f(y(0))}" y2="${f(y(0) + 4)}" stroke="var(--axis)"/>
        <text class="tick" x="${f(x(i))}" y="${f(y(0) + 17)}" text-anchor="middle">${text}</text>`;
    })
    .join('');

  // 결측에서 끊기는 선. 한 지수면 잉크, 비교면 지수 색
  const lineColor = (sr: ChartSeries): string => (compare ? sr.color : 'var(--ink)');
  const paths = series
    .map((sr) => {
      let d = '';
      let pen = false;
      sr.values.forEach((v, i) => {
        if (v == null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${f(x(i))} ${f(y(v))}`;
        pen = true;
      });
      return `<path d="${d}" fill="none" stroke="${lineColor(sr)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join('');

  // 끝점과 라벨. 비교 모드에서 라벨이 13px 안으로 붙으면 벌리고 짧은 연결선으로 잇는다(라벨을 겹쳐 쌓지 않는다).
  const ends = series
    .map((sr) => {
      let i = n - 1;
      while (i >= 0 && sr.values[i] == null) i--;
      const v = i >= 0 ? sr.values[i] : null;
      return v == null ? null : { sr, i, v, yv: y(v), yl: y(v) };
    })
    .filter((e): e is { sr: ChartSeries; i: number; v: number; yv: number; yl: number } => e != null)
    .sort((a, b) => a.yv - b.yv);
  for (let k = 1; k < ends.length; k++) {
    const prev = ends[k - 1];
    const cur = ends[k];
    if (prev && cur && cur.yl - prev.yl < 13) {
      const mid = (prev.yl + cur.yl) / 2;
      prev.yl = mid - 6.5;
      cur.yl = mid + 6.5;
    }
  }
  const endMarks = ends
    .map((e) => {
      const cx = x(e.i);
      const dotFill = compare ? e.sr.color : BAND_COLOR[bandOf(e.v)];
      const text = compare ? `${e.sr.label} ${formatScore(e.v)}` : formatScore(e.v);
      const leader = Math.abs(e.yl - e.yv) > 0.5 ? `<line x1="${f(cx + 4)}" y1="${f(e.yv)}" x2="${f(cx + 10)}" y2="${f(e.yl)}" stroke="var(--muted)" stroke-width="1"/>` : '';
      return `<circle cx="${f(cx)}" cy="${f(e.yv)}" r="4.5" fill="${dotFill}" stroke="var(--surface)" stroke-width="2"/>${leader}
        <text class="end-label" x="${f(cx + 12)}" y="${f(e.yl + 4)}">${esc(text)}</text>`;
    })
    .join('');

  // 주요 사건 표시: 그 날짜(또는 다음 거래일)에 세로선과 이름. 축 범위 밖이면 그리지 않는다.
  let markerSvg = '';
  if (marker && marker.date >= (dates[0] ?? '') && marker.date <= (dates[n - 1] ?? '')) {
    let mi = 0;
    while (mi < n - 1 && (dates[mi] ?? '') < marker.date) mi++;
    const mx = x(mi);
    const right = mx > m.l + iw * 0.6;
    markerSvg = `<line x1="${f(mx)}" x2="${f(mx)}" y1="${m.t}" y2="${f(y(0))}" stroke="var(--ink)" stroke-width="1.5"/>
      <text x="${f(right ? mx - 6 : mx + 6)}" y="${m.t + 12}" text-anchor="${right ? 'end' : 'start'}" class="marker-label">${esc(marker.label)}</text>`;
  }

  const summary = `${WEB_COPY.chartTitle}: ${formatTradingDate(dates[0] ?? '', 'short')}부터 ${formatTradingDate(dates[n - 1] ?? '', 'short')}까지, ${ends
    .map((e) => `${e.sr.label} ${formatScore(e.v)}`)
    .join(', ')}`;
  el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summary)}">
      ${washes}${grid}${base}${yTicks}${xTicks}
      ${markerSvg}
      ${paths}
      ${endMarks}
      <line class="xhair" x1="0" x2="0" y1="${m.t}" y2="${f(y(0))}" stroke="var(--ink-2)" stroke-width="1" visibility="hidden"/>
      ${series.map((_, k) => `<circle class="hdot" data-k="${k}" r="5" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`).join('')}
      <rect class="hit" x="${m.l}" y="0" width="${f(iw)}" height="${height}" fill="transparent"/>
    </svg>
    <div class="tooltip" role="status"></div>`;

  const svg = el.querySelector('svg') as SVGSVGElement;
  const xhair = el.querySelector('.xhair') as SVGLineElement;
  const hdots = Array.from(el.querySelectorAll<SVGCircleElement>('.hdot'));
  const tip = el.querySelector('.tooltip') as HTMLDivElement;
  const hide = (): void => {
    xhair.setAttribute('visibility', 'hidden');
    hdots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    tip.dataset.show = 'false';
  };
  const show = (clientX: number): void => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    const vals = series.map((sr) => sr.values[i] ?? null);
    if (vals.every((v) => v == null)) return hide();
    const cx = x(i);
    xhair.setAttribute('x1', f(cx));
    xhair.setAttribute('x2', f(cx));
    xhair.setAttribute('visibility', 'visible');
    let top = Infinity;
    series.forEach((sr, k) => {
      const dot = hdots[k];
      const v = vals[k];
      if (!dot) return;
      if (v == null) {
        dot.setAttribute('visibility', 'hidden');
        return;
      }
      dot.setAttribute('cx', f(cx));
      dot.setAttribute('cy', f(y(v)));
      dot.setAttribute('fill', compare ? sr.color : BAND_COLOR[bandOf(v)]);
      dot.setAttribute('visibility', 'visible');
      top = Math.min(top, y(v));
    });
    const lines = series.map((sr, k) => {
      const v = vals[k] ?? null;
      const key = compare ? `<span class="series-key" style="--c:${sr.color}"></span>${esc(sr.label)} ` : '';
      return `${key}<strong>${esc(formatScore(v))}</strong>${v == null ? '' : ` · ${bandLabelHtml(bandOf(v))}`}`;
    });
    const [a, b] = vals;
    if (compare && a != null && b != null) lines.push(`<span class="muted">${esc(WEB_COPY.diff(signedScore(a, b)))}</span>`);
    const d = dates[i] ?? '';
    tip.innerHTML = `${esc(`${d.slice(0, 4)}년 ${formatTradingDate(d)}`)}<br>${lines.join('<br>')}`;
    const scale = rect.width / width;
    const left = Math.max(80, Math.min(rect.width - 80, cx * scale));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, top * scale - (compare ? 96 : 64))}px`;
    tip.dataset.show = 'true';
  };
  const hit = el.querySelector('.hit') as SVGRectElement;
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
}

/** 반올림한 두 점수의 차이를 부호와 함께: +3, −2, 0 */
function signedScore(a: number, b: number): string {
  const d = Number(formatScore(a)) - Number(formatScore(b));
  return d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0';
}

function seriesLegendHtml(series: ChartSeries[]): string {
  return `<div class="legend chart-legend series-legend" role="list" aria-label="${esc(WEB_COPY.seriesLegend)}">${series
    .map((sr) => `<span class="item" role="listitem"><span class="series-key" style="--c:${sr.color}"></span>${esc(sr.label)}</span>`)
    .join('')}</div>`;
}

function tableHtml(dates: string[], series: ChartSeries[]): string {
  const idx = dates.map((_, i) => i).slice(-TABLE_ROWS).reverse();
  if (idx.length === 0) return '';
  const h = WEB_COPY.tableHead;
  const one = series.length === 1;
  const head = one
    ? `<th>${esc(h.date)}</th><th>${esc(h.rfg)}</th><th>${esc(h.band)}</th>`
    : `<th>${esc(h.date)}</th>${series.map((sr) => `<th>${esc(sr.label)}</th>`).join('')}<th>${esc(WEB_COPY.diffHead)}</th>`;
  const body = idx
    .map((i) => {
      const vals = series.map((sr) => sr.values[i] ?? null);
      const date = `<td>${esc(formatTradingDate(dates[i] ?? ''))}</td>`;
      if (one) {
        const v = vals[0] ?? null;
        return `<tr>${date}<td>${esc(formatScore(v))}</td><td>${v == null ? EMPTY : esc(bandText(bandOf(v)))}</td></tr>`;
      }
      const [a, b] = vals;
      const diff = a != null && b != null ? signedScore(a, b) : EMPTY;
      return `<tr>${date}${vals.map((v) => `<td>${esc(formatScore(v))}</td>`).join('')}<td>${esc(diff)}</td></tr>`;
    })
    .join('');
  return `<details><summary>${esc(WEB_COPY.tableTitle)}</summary>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </details>`;
}

// ── 주요 사건 때의 지수 ───────────────────────────────────────────────────

function eventsHtml(s: State): string {
  const ev = WORLD_EVENTS[s.eventIdx];
  if (!ev) return '';
  const firstDates = [...SYMBOLS].map((k) => seriesFor(s, k)[0]?.date ?? '').filter((d) => d !== '').sort();
  const options = WORLD_EVENTS.map(
    (e, i) => `<option value="${i}"${i === s.eventIdx ? ' selected' : ''}>${esc(`${e.date.slice(0, 4)}.${e.date.slice(5, 7)} ${e.title}`)}</option>`,
  ).join('');
  const when = WEB_COPY.eventWhen;
  const blocks = SYMBOLS.map((sym) => {
    const rows = seriesFor(s, sym);
    const label = LABELS.index[sym];
    const start = rows[0]?.date ?? '';
    if (rows.length === 0 || ev.date < start) {
      return `<div class="ev-index"><div class="ev-name">${esc(label)}</div><p class="note">${esc(WEB_COPY.eventNoData(label, formatYmd(start)))}</p></div>`;
    }
    const i = rowAtOrAfter(rows, ev.date);
    const cell = (name: string, row: HistoryRow | undefined, big: boolean): string => {
      const v = row?.rfg ?? null;
      return `<div class="ev-cell${big ? ' big' : ''}" title="${esc(row ? formatYmd(row.date) : '')}">
          <div class="label">${esc(name)}</div>
          <div class="value">${esc(formatScore(v))}</div>
          <div class="band">${v == null ? '' : bandLabelHtml(bandOf(v))}</div>
        </div>`;
    };
    return `<div class="ev-index">
        <div class="ev-name">${esc(label)}</div>
        <div class="ev-cells">${cell(when.day, rows[i], true)}${cell(when.week, rows[i + COMPARE_OFFSETS.week], false)}${cell(when.month, rows[i + COMPARE_OFFSETS.month], false)}</div>
      </div>`;
  }).join('');
  return `<section class="card" id="events">
      <h2>${esc(WEB_COPY.eventsTitle)}</h2>
      <p class="note">${esc(WEB_COPY.eventsNote(formatYmd(firstDates[0] ?? '')))}</p>
      <div class="ev-picker">
        <button type="button" class="toggle" id="event-prev" aria-label="${esc(WEB_COPY.eventPrev)}"${s.eventIdx === 0 ? ' disabled' : ''}>‹</button>
        <select id="event-select" aria-label="${esc(WEB_COPY.eventPick)}">${options}</select>
        <button type="button" class="toggle" id="event-next" aria-label="${esc(WEB_COPY.eventNext)}"${s.eventIdx === WORLD_EVENTS.length - 1 ? ' disabled' : ''}>›</button>
      </div>
      <div class="ev-head">
        <div class="ev-date">${esc(formatYmd(ev.date))} (${esc(weekdayOf(ev.date))})</div>
        <div class="ev-title">${esc(ev.title)}</div>
        <p class="ev-desc">${esc(ev.description)}</p>
      </div>
      <div class="ev-grid">${blocks}</div>
      <button type="button" class="toggle ev-chart" id="event-chart">${esc(WEB_COPY.eventShowChart)}</button>
    </section>`;
}

function weekdayOf(d: string): string {
  const t = formatTradingDate(d);
  const m = /\((.)\)/.exec(t);
  return m?.[1] ?? '';
}

// ── 구성 요소 ─────────────────────────────────────────────────────────────

function meterRow(name: string, score: number | null, detail: string, sub = false): string {
  const b = bandOf(score);
  const w = score == null ? 0 : Math.max(0, Math.min(100, score));
  return `<div class="row${sub ? ' sub' : ''}">
      <div class="row-head"><span class="name">${esc(name)}</span><span class="score">${esc(formatScore(score))}${score == null ? '' : ` · ${esc(bandText(b))}`}</span></div>
      <div class="meter" role="img" aria-label="${esc(`${name} ${formatScore(score)}`)}"><span style="width:${w}%;--fill:${BAND_COLOR[b]}"></span></div>
      ${detail ? `<div class="detail">${esc(detail)}</div>` : ''}
    </div>`;
}

function componentsHtml(s: State): string {
  const latest = s.snapshot.markets[s.index].latest;
  const c = s.history?.markets[s.index].components;
  const inv = (v: number | null | undefined): number | null => (v == null ? null : 100 - v);
  const rows = [
    meterRow(WEB_COPY.sentiment, latest.fg, ''),
    meterRow(WEB_COPY.price, inv(latest.p), ''),
    meterRow(WEB_COPY.ddName, inv(c?.pdd), WEB_COPY.dd(formatPercent(latest.dd, { signed: true })), true),
    meterRow(WEB_COPY.dispName, inv(c?.pdisp), WEB_COPY.disp(formatPercent(latest.disp, { signed: true })), true),
    meterRow(WEB_COPY.rvName, inv(c?.prv), WEB_COPY.rv(formatPercent(latest.rv)), true),
  ];
  return `<section class="card"><h2>${esc(WEB_COPY.componentsTitle)}</h2><p class="note">${esc(WEB_COPY.componentsNote)}</p><div class="rows">${rows.join('')}</div></section>`;
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

void load();
