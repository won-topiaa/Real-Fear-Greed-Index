/**
 * 홈 화면 뷰모델. 페이지와 스토어 그림 스크립트가 같은 함수를 호출한다(DESIGN §6.5).
 * 화면에 보이는 모든 문자열·수치·상태는 여기서만 만들어진다. 순수 TS.
 */
import { classify } from '../core/classify';
import { assessFreshness, type Freshness } from '../core/freshness';
import type { Classification, IndexSymbol, RfgSnapshot } from '../core/types';
import type { DataState } from '../data/state';
import { APP_TITLE, COPY, DISCLAIMER, FRM_MEANING, LABELS, QUADRANT_DESCRIPTION, a11ySummary } from './copy';
import { EMPTY, formatBasisLine, formatFrm, formatPercent, formatScore } from './format';

export type HomeMode = 'mock' | 'loading' | 'ready' | 'delayed' | 'stale' | 'fg-missing' | 'error-with-cache' | 'error' | 'offline' | 'outdated';

export interface HomeViewModel {
  mode: HomeMode;
  title: string;
  index: IndexSymbol;
  indexLabel: Record<IndexSymbol, string>;
  /** 상단 배지(샘플/지연/오래됨). null 이면 없음 */
  badge: { text: string; tone: 'gray' | 'yellow' | 'red' } | null;
  /** 오류 배너(캐시 표시 중) */
  banner: string | null;
  basisLine: string | null;
  /** 점수·사분면·FRM 표시 허용 여부(stale/fg-missing/outdated 면 false) */
  showScores: boolean;
  rfg: string;
  rfgValue: number | null;
  rfgZoneLabel: string;
  gaugeTicks: { capitulation: number; euphoria: number };
  gaugeLegend: string;
  fear: string;
  fearValue: number | null;
  p: string;
  pValue: number | null;
  frm: string;
  quadrant: Classification['quadrant'];
  quadrantLabel: string;
  quadrantDescription: string;
  frmSentence: string | null;
  frmMeaning: string;
  detailLine: string | null;
  sparkline: Array<number | null>;
  sparklineCaption: string;
  a11ySummary: string;
  disclaimer: string;
  /** 데이터 없음 상태의 본문 문구 */
  emptyMessage: string | null;
  retryLabel: string;
  aboutLabel: string;
  freshness: Freshness | null;
  sandboxLabel: string | null;
}

export interface SelectHomeArgs {
  state: DataState;
  index: IndexSymbol;
  isMock: boolean;
  nowUtcMs: number;
  thresholds: { capitulation: number; euphoria: number };
  environment?: 'toss' | 'sandbox' | 'unknown';
}

function base(args: SelectHomeArgs, mode: HomeMode): HomeViewModel {
  return {
    mode,
    title: APP_TITLE,
    index: args.index,
    indexLabel: LABELS.index,
    badge: null,
    banner: null,
    basisLine: null,
    showScores: false,
    rfg: EMPTY,
    rfgValue: null,
    rfgZoneLabel: LABELS.rfgZone.UNKNOWN,
    gaugeTicks: args.thresholds,
    gaugeLegend: COPY.gaugeLegend(),
    fear: EMPTY,
    fearValue: null,
    p: EMPTY,
    pValue: null,
    frm: EMPTY,
    quadrant: 'UNKNOWN',
    quadrantLabel: LABELS.quadrant.UNKNOWN,
    quadrantDescription: QUADRANT_DESCRIPTION.UNKNOWN,
    frmSentence: null,
    frmMeaning: FRM_MEANING.UNKNOWN,
    detailLine: null,
    sparkline: [],
    sparklineCaption: COPY.sparklineCaption(),
    a11ySummary: `${APP_TITLE} ${EMPTY}`,
    disclaimer: DISCLAIMER.short,
    emptyMessage: null,
    retryLabel: COPY.retry,
    aboutLabel: COPY.aboutLink,
    freshness: null,
    sandboxLabel: args.environment === 'sandbox' ? '샌드박스' : null,
  };
}

function withSnapshot(vm: HomeViewModel, snapshot: RfgSnapshot, args: SelectHomeArgs): HomeViewModel {
  const market = snapshot.markets[args.index];
  const fresh = assessFreshness(snapshot, args.index, args.nowUtcMs);
  const c = classify(market.latest);
  const out: HomeViewModel = { ...vm, freshness: fresh.level, basisLine: formatBasisLine(market) };

  out.sparkline = market.history.map((h) => h.rfg);
  out.detailLine = COPY.detailLine(formatPercent(market.latest.dd, { signed: true }), formatPercent(market.latest.disp, { signed: true }), formatPercent(market.latest.rv));

  if (fresh.level === 'stale') {
    out.mode = 'stale';
    out.sparkline = []; // RFG 는 차단 — 추이도 보여주지 않는다
    out.badge = { text: COPY.freshness('stale', fresh.tradingDaysBehind), tone: 'red' };
    out.emptyMessage = COPY.staleBlocked;
    out.a11ySummary = `${APP_TITLE} ${COPY.staleBlocked}`;
    return out;
  }
  if (fresh.level === 'delayed') {
    out.mode = 'delayed';
    out.badge = { text: COPY.freshness('delayed', fresh.tradingDaysBehind), tone: 'yellow' };
  } else {
    out.mode = 'ready';
  }

  // P 축은 FG 와 무관하게 표시
  out.p = formatScore(c.rounded.p);
  out.pValue = c.rounded.p;

  if (!c.gates.fgOk) {
    out.mode = 'fg-missing';
    out.emptyMessage = COPY.fgMissing;
    out.a11ySummary = `${APP_TITLE} ${COPY.fgMissing}`;
    return out;
  }

  out.showScores = true;
  out.rfg = formatScore(c.rounded.rfg);
  out.rfgValue = c.rounded.rfg;
  out.rfgZoneLabel = LABELS.rfgZone[c.rfgZone];
  out.fear = formatScore(c.rounded.fear);
  out.fearValue = c.rounded.fear;
  out.quadrant = c.quadrant;
  out.quadrantLabel = c.quadrant === 'NEUTRAL' ? COPY.quadrantNone(out.fear, out.p) : LABELS.quadrant[c.quadrant];
  out.quadrantDescription = QUADRANT_DESCRIPTION[c.quadrant];
  out.frmMeaning = FRM_MEANING[c.frmZone];
  if (c.gates.frmOk) {
    out.frm = formatFrm(c.rounded.frm);
    out.frmSentence = COPY.frmSentence(out.fear, out.p, out.frm);
  } else {
    out.frm = EMPTY;
    out.frmSentence = null;
  }
  out.a11ySummary = a11ySummary(out.rfg, c.rfgZone, c.quadrant);
  return out;
}

export function selectHomeViewModel(args: SelectHomeArgs): HomeViewModel {
  const { state } = args;
  const snapshot = state.status === 'success' ? state.data : state.cached;

  if (state.status === 'error' && state.error.code === 'outdated') {
    const vm = base(args, 'outdated');
    vm.emptyMessage = COPY.outdated;
    return vm;
  }

  if (!snapshot) {
    if (state.status === 'loading') return base(args, 'loading');
    const vm = base(args, state.status === 'error' && state.error.code === 'offline' ? 'offline' : 'error');
    vm.emptyMessage = vm.mode === 'offline' ? COPY.offline : COPY.errorNoCache;
    return vm;
  }

  let vm = withSnapshot(base(args, 'ready'), snapshot, args);
  if (state.status === 'error') {
    vm.mode = 'error-with-cache';
    vm.banner = state.error.code === 'offline' ? COPY.offline : COPY.errorWithCache(snapshot.markets[args.index].closeDate);
  }
  if (args.isMock) {
    const badge = vm.badge ? { text: `${COPY.mockBadge} · ${vm.badge.text}`, tone: vm.badge.tone } : { text: COPY.mockBadge, tone: 'gray' as const };
    vm = { ...vm, mode: 'mock', badge };
  }
  return vm;
}
