/**
 * 실질 공포탐욕지수 웹 화면. 같은 출처의 /v1/snapshot.json(오늘 값) 과 /v1/history.json(1년 이력)을 그린다.
 * 숫자·문턱·문구는 src/core·src/text 에서만 온다(앱과 같은 모듈을 번들한다). 행동 지시 없이 지수만 보여준다.
 */
import { bandOf } from '../src/core/classify';
import { COMPARE_OFFSETS, DISPLAY_BANDS } from '../src/core/constants';
import { assessFreshness } from '../src/core/freshness';
import { parseHistory } from '../src/core/history';
import { parseSnapshot } from '../src/core/snapshot';
import type { Band, HistoryRow, IndexSymbol, RfgHistory, RfgSnapshot } from '../src/core/types';
import { APP_TITLE, COPY, DISCLAIMER, LABELS, WEB_COPY } from '../src/text/copy';
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
/** 차트에 그릴 거래일 수(약 1년) */
const CHART_DAYS = COMPARE_OFFSETS.year + 1;
const TABLE_ROWS = 20;

interface State {
  snapshot: RfgSnapshot;
  history: RfgHistory | null;
  index: IndexSymbol;
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
    state = { snapshot: snap.value, history: hist && hist.ok ? hist.value : null, index: readIndex() };
    render();
  } catch {
    app.innerHTML = `<p class="state">${esc(WEB_COPY.error)}</p><button class="retry" type="button">${esc(WEB_COPY.retry)}</button>`;
    app.querySelector('.retry')?.addEventListener('click', () => void load());
  }
}

/** 지수의 1년 이력. history.json 이 없으면 스냅샷의 60거래일 이력으로 대신한다. */
function seriesFor(s: State): HistoryRow[] {
  const h = s.history?.markets[s.index].rows;
  if (h && h.length > 0) return h;
  return s.snapshot.markets[s.index].history.map((r) => ({ date: r.date, rfg: r.rfg, p: r.p }));
}

function render(): void {
  if (!state) return;
  const s = state;
  const market = s.snapshot.markets[s.index];
  const latest = market.latest;
  const fresh = assessFreshness(s.snapshot, s.index, Date.now());
  const blocked = fresh.level === 'stale' || latest.rfg == null;
  const rows = seriesFor(s);

  let badge = '';
  if (fresh.level === 'delayed') badge = badgeHtml(COPY.freshness('delayed', fresh.tradingDaysBehind), '#fab219');
  else if (fresh.level === 'stale') badge = badgeHtml(COPY.freshness('stale', fresh.tradingDaysBehind), '#d03b3b');
  else if (latest.fg == null) badge = badgeHtml(COPY.fgMissing, '#fab219');

  app.innerHTML = `
    <header>
      <div class="header">
        <h1>${esc(APP_TITLE)}</h1>
        <div class="switch" role="group" aria-label="지수 선택">
          ${SYMBOLS.map((sym) => `<button type="button" data-index="${sym}" aria-pressed="${sym === s.index}">${esc(LABELS.index[sym])}</button>`).join('')}
        </div>
      </div>
      <p class="subtitle">${esc(WEB_COPY.subtitle)}</p>
      <div class="meta"><span>${esc(formatBasisLine(market))}</span>${badge}</div>
    </header>
    <section class="card" aria-label="${esc(LABELS.axis.rfg)}">
      ${blocked ? `<p class="blocked">${esc(fresh.level === 'stale' ? COPY.staleBlocked : COPY.fgMissing)}</p>` : gaugeHtml(latest.rfg)}
    </section>
    ${blocked ? '' : compareHtml(rows)}
    <section class="card">
      <h2>${esc(WEB_COPY.chartTitle)} · ${esc(LABELS.index[s.index])}</h2>
      <div class="chart" id="chart"></div>
      ${tableHtml(rows)}
    </section>
    ${componentsHtml(s)}
    <footer class="footer">
      <p>${esc(WEB_COPY.method())}</p>
      <p>${esc(WEB_COPY.sources)}</p>
      <p>${esc(DISCLAIMER.full)}</p>
      <p>${esc(WEB_COPY.updated(kstText(s.snapshot.generatedAtUtc)))}</p>
    </footer>`;

  app.querySelectorAll<HTMLButtonElement>('.switch button').forEach((b) =>
    b.addEventListener('click', () => {
      const i = b.dataset.index;
      if ((i === 'SPX' || i === 'NDX') && state) {
        state.index = i;
        saveIndex(i);
        render();
      }
    }),
  );

  const chartEl = document.getElementById('chart') as HTMLElement;
  const chartRows = rows.slice(-CHART_DAYS);
  chartObserver?.disconnect();
  let lastWidth = 0;
  chartObserver = new ResizeObserver(() => {
    const w = Math.round(chartEl.clientWidth);
    if (w !== lastWidth) {
      lastWidth = w;
      drawChart(chartEl, chartRows);
    }
  });
  chartObserver.observe(chartEl);
}

function kstText(utc: string): string {
  const k = formatKst(utc);
  return k.date === EMPTY ? EMPTY : `${formatTradingDate(k.date, 'short')} ${k.time}`;
}

function badgeHtml(text: string, dot: string): string {
  return `<span class="badge" style="--dot:${dot}">${esc(text)}</span>`;
}

function bandLabelHtml(b: Band): string {
  return `<span class="swatch" style="--sw:${BAND_COLOR[b]}"></span>${esc(bandText(b))}`;
}

// ── 게이지 ────────────────────────────────────────────────────────────────

function gaugeHtml(value: number | null): string {
  const band = bandOf(value);
  const W = 320;
  const cx = 160;
  const cy = 168;
  const r = 128;
  const sw = 24;
  const pt = (v: number, rad: number): [number, number] => {
    const th = Math.PI * (1 - v / 100);
    return [cx + rad * Math.cos(th), cy - rad * Math.sin(th)];
  };
  const f = (n: number): string => n.toFixed(2);
  const gap = (2 / (Math.PI * r)) * 100; // 2px 표면 간격을 값 단위로
  const arcs = DISPLAY_BANDS.map((b, i) => {
    const v0 = (BAND_EDGES[i] ?? 0) + (i > 0 ? gap / 2 : 0);
    const v1 = (BAND_EDGES[i + 1] ?? 100) - (i < DISPLAY_BANDS.length - 1 ? gap / 2 : 0);
    const [x0, y0] = pt(v0, r);
    const [x1, y1] = pt(v1, r);
    return `<path d="M${f(x0)} ${f(y0)} A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}" stroke="${BAND_COLOR[b.key]}" stroke-width="${sw}" fill="none"/>`;
  }).join('');
  const ticks = [0, 25, 50, 75, 100]
    .map((v) => {
      const [x, y] = pt(v, r + sw / 2 + 12);
      return `<text x="${f(x)}" y="${f(y + 4)}" text-anchor="middle" style="fill:var(--muted);font-size:11px">${v}</text>`;
    })
    .join('');
  let needle = '';
  if (value != null) {
    const [tx, ty] = pt(Math.max(0, Math.min(100, value)), r - sw / 2 - 8);
    needle = `<line x1="${cx}" y1="${cy}" x2="${f(tx)}" y2="${f(ty)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="var(--ink)" stroke="var(--surface)" stroke-width="3"/>`;
  }
  const ends = `<text x="${cx - r}" y="${cy + 22}" text-anchor="middle" style="fill:var(--ink-2);font-size:12px;font-weight:600">${esc(WEB_COPY.scaleEnds.fear)}</text>
    <text x="${cx + r}" y="${cy + 22}" text-anchor="middle" style="fill:var(--ink-2);font-size:12px;font-weight:600">${esc(WEB_COPY.scaleEnds.greed)}</text>`;
  const label = `${LABELS.axis.rfg} ${formatScore(value)}, ${bandText(band)}`;
  return `<div class="gauge">
      <svg viewBox="-14 0 ${W + 28} ${cy + 30}" role="img" aria-label="${esc(label)}">${arcs}${ticks}${needle}${ends}</svg>
      <div class="hero">${esc(formatScore(value))}</div>
      <div class="band-label">${bandLabelHtml(band)}</div>
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

function drawChart(el: HTMLElement, rows: HistoryRow[]): void {
  if (rows.length < 2) {
    el.innerHTML = `<p class="note">${esc(WEB_COPY.chartEmpty)}</p>`;
    return;
  }
  const width = Math.max(280, Math.round(el.clientWidth));
  const height = 220;
  const m = { l: 30, r: 34, t: 10, b: 26 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const n = rows.length;
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

  // 월이 바뀌는 첫 거래일에 눈금. 좁으면 격월.
  const monthStarts: number[] = [];
  for (let i = 1; i < n; i++) if ((rows[i]?.date ?? '').slice(0, 7) !== (rows[i - 1]?.date ?? '').slice(0, 7)) monthStarts.push(i);
  const step = width < 520 ? 2 : 1;
  const xTicks = monthStarts
    .filter((_, k) => k % step === 0)
    .map((i) => {
      const d = rows[i]?.date ?? '';
      const mo = Number(d.slice(5, 7));
      const text = mo === 1 ? `${d.slice(0, 4)}년` : `${mo}월`;
      return `<line x1="${f(x(i))}" x2="${f(x(i))}" y1="${f(y(0))}" y2="${f(y(0) + 4)}" stroke="var(--axis)"/>
        <text class="tick" x="${f(x(i))}" y="${f(y(0) + 17)}" text-anchor="middle">${text}</text>`;
    })
    .join('');

  // 결측에서 끊기는 선
  let d = '';
  let pen = false;
  rows.forEach((r, i) => {
    if (r.rfg == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${f(x(i))} ${f(y(r.rfg))}`;
    pen = true;
  });

  let lastIdx = n - 1;
  while (lastIdx >= 0 && rows[lastIdx]?.rfg == null) lastIdx--;
  const lastRow = rows[lastIdx];
  const end =
    lastRow && lastRow.rfg != null
      ? `<circle cx="${f(x(lastIdx))}" cy="${f(y(lastRow.rfg))}" r="4.5" fill="${BAND_COLOR[bandOf(lastRow.rfg)]}" stroke="var(--surface)" stroke-width="2"/>
         <text class="end-label" x="${f(x(lastIdx) + 8)}" y="${f(y(lastRow.rfg) + 4)}">${esc(formatScore(lastRow.rfg))}</text>`
      : '';

  const summary = lastRow ? `${WEB_COPY.chartTitle}: ${formatTradingDate(rows[0]?.date ?? '', 'short')}부터 ${formatTradingDate(lastRow.date, 'short')}까지, 최근 ${formatScore(lastRow.rfg)}` : WEB_COPY.chartTitle;
  el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summary)}">
      ${washes}${grid}${base}${yTicks}${xTicks}
      <path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${end}
      <line class="xhair" x1="0" x2="0" y1="${m.t}" y2="${f(y(0))}" stroke="var(--ink-2)" stroke-width="1" visibility="hidden"/>
      <circle class="hdot" r="5" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>
      <rect class="hit" x="${m.l}" y="0" width="${f(iw)}" height="${height}" fill="transparent"/>
    </svg>
    <div class="tooltip" role="status"></div>`;

  const svg = el.querySelector('svg') as SVGSVGElement;
  const xhair = el.querySelector('.xhair') as SVGLineElement;
  const hdot = el.querySelector('.hdot') as SVGCircleElement;
  const tip = el.querySelector('.tooltip') as HTMLDivElement;
  const hide = (): void => {
    xhair.setAttribute('visibility', 'hidden');
    hdot.setAttribute('visibility', 'hidden');
    tip.dataset.show = 'false';
  };
  const show = (clientX: number): void => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    const row = rows[i];
    if (!row || row.rfg == null) return hide();
    const cx = x(i);
    const cy = y(row.rfg);
    const b = bandOf(row.rfg);
    xhair.setAttribute('x1', f(cx));
    xhair.setAttribute('x2', f(cx));
    xhair.setAttribute('visibility', 'visible');
    hdot.setAttribute('cx', f(cx));
    hdot.setAttribute('cy', f(cy));
    hdot.setAttribute('fill', BAND_COLOR[b]);
    hdot.setAttribute('visibility', 'visible');
    tip.innerHTML = `${esc(formatTradingDate(row.date))}<br><strong>${esc(formatScore(row.rfg))}</strong> · ${bandLabelHtml(b)}`;
    const scale = rect.width / width;
    const left = Math.max(70, Math.min(rect.width - 70, cx * scale));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, cy * scale - 64)}px`;
    tip.dataset.show = 'true';
  };
  const hit = el.querySelector('.hit') as SVGRectElement;
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
}

function tableHtml(rows: HistoryRow[]): string {
  const recent = rows.slice(-TABLE_ROWS).reverse();
  if (recent.length === 0) return '';
  const body = recent
    .map((r) => `<tr><td>${esc(formatTradingDate(r.date))}</td><td>${esc(formatScore(r.rfg))}</td><td>${r.rfg == null ? EMPTY : esc(bandText(bandOf(r.rfg)))}</td></tr>`)
    .join('');
  const h = WEB_COPY.tableHead;
  return `<details><summary>${esc(WEB_COPY.tableTitle)}</summary>
      <table><thead><tr><th>${esc(h.date)}</th><th>${esc(h.rfg)}</th><th>${esc(h.band)}</th></tr></thead><tbody>${body}</tbody></table>
    </details>`;
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

void load();
