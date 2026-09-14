import { THRESHOLDS } from '../../core/constants';
import { loadMockSnapshot } from '../../data/mockClient';
import type { DataState } from '../../data/state';
import { COPY, LABELS } from '../copy';
import { EMPTY } from '../format';
import { selectHomeViewModel, type SelectHomeArgs } from '../viewmodel';

const NOW = Date.parse('2026-09-12T00:00:00Z');
const thresholds = { capitulation: THRESHOLDS.RFG_CAPITULATION_MAX, euphoria: THRESHOLDS.RFG_EUPHORIA_MIN };

function args(state: DataState, over: Partial<SelectHomeArgs> = {}): SelectHomeArgs {
  return { state, index: 'SPX', isMock: false, nowUtcMs: NOW, thresholds, ...over };
}

describe('selectHomeViewModel — 홈 상태표 (DESIGN §6.3)', () => {
  test('loading: 캐시 없음', () => {
    const vm = selectHomeViewModel(args({ status: 'loading' }));
    expect(vm.mode).toBe('loading');
    expect(vm.showScores).toBe(false);
    expect(vm.basisLine).toBeNull();
  });

  test('ready: 값·구간·사분면·FRM 문장·기준일', () => {
    const data = loadMockSnapshot('normal', NOW);
    const vm = selectHomeViewModel(args({ status: 'success', data, fromCache: false }));
    expect(vm.mode).toBe('ready');
    expect(vm.showScores).toBe(true);
    expect(vm.rfg).toBe('66');
    expect(vm.rfgZoneLabel).toBe(LABELS.rfgZone.MID);
    expect(vm.quadrant).toBe('NEUTRAL');
    expect(vm.quadrantLabel).toBe(COPY.quadrantNone('54', '21'));
    expect(vm.frmSentence).toBe(COPY.frmSentence('54', '21', '0.38배'));
    expect(vm.basisLine).toBe('미국 9/11(금) 마감 기준 · 한국 9/12 05:00');
    expect(vm.badge).toBeNull();
    expect(vm.sparkline).toHaveLength(60);
    expect(vm.a11ySummary).toContain('66');
    expect(vm.detailLine).toContain('60일 고점 대비');
  });

  test('delayed: 노란 배지, 값은 표시', () => {
    const data = loadMockSnapshot('delayed', NOW);
    const vm = selectHomeViewModel(args({ status: 'success', data, fromCache: false }));
    expect(vm.mode).toBe('delayed');
    expect(vm.badge).toEqual({ text: COPY.freshness('delayed', 2), tone: 'yellow' });
    expect(vm.showScores).toBe(true);
  });

  test('stale: 빨간 배지, 점수·사분면·FRM 차단(—)', () => {
    const data = loadMockSnapshot('stale', NOW);
    const vm = selectHomeViewModel(args({ status: 'success', data, fromCache: false }));
    expect(vm.mode).toBe('stale');
    expect(vm.badge?.tone).toBe('red');
    expect(vm.showScores).toBe(false);
    expect(vm.rfg).toBe(EMPTY);
    expect(vm.frmSentence).toBeNull();
    expect(vm.emptyMessage).toBe(COPY.staleBlocked);
    expect(vm.detailLine).not.toBeNull(); // DD/DISP/RV 는 보여준다
    expect(vm.sparkline).toEqual([]); // RFG 추이는 차단
  });

  test('fg-missing: P 축만, 문장 없음', () => {
    const data = loadMockSnapshot('fg_missing', NOW);
    const vm = selectHomeViewModel(args({ status: 'success', data, fromCache: false }));
    expect(vm.mode).toBe('fg-missing');
    expect(vm.showScores).toBe(false);
    expect(vm.p).toBe('21');
    expect(vm.fear).toBe(EMPTY);
    expect(vm.emptyMessage).toBe(COPY.fgMissing);
  });

  test('mock: 회색 샘플 배지가 항상 보이고, 지연 배지와 합쳐진다', () => {
    const vm = selectHomeViewModel(args({ status: 'success', data: loadMockSnapshot('normal', NOW), fromCache: false }, { isMock: true }));
    expect(vm.mode).toBe('mock');
    expect(vm.badge).toEqual({ text: COPY.mockBadge, tone: 'gray' });
    const vm2 = selectHomeViewModel(args({ status: 'success', data: loadMockSnapshot('delayed', NOW), fromCache: false }, { isMock: true }));
    expect(vm2.badge?.text).toContain(COPY.mockBadge);
    expect(vm2.badge?.tone).toBe('yellow');
  });

  test('error-with-cache: 이전 값 표시 + 배너', () => {
    const cached = loadMockSnapshot('normal', NOW);
    const vm = selectHomeViewModel(args({ status: 'error', error: { code: 'network', message: 'x' }, cached }));
    expect(vm.mode).toBe('error-with-cache');
    expect(vm.showScores).toBe(true);
    expect(vm.banner).toBe(COPY.errorWithCache('2026-09-11'));
  });

  test('error 없음 캐시: 오류 문구 + 재시도, 목 데이터로 대체하지 않는다', () => {
    const vm = selectHomeViewModel(args({ status: 'error', error: { code: 'network', message: 'x' } }));
    expect(vm.mode).toBe('error');
    expect(vm.emptyMessage).toBe(COPY.errorNoCache);
    expect(vm.basisLine).toBeNull();
  });

  test('offline: 캐시 없으면 offline 문구, 캐시 있으면 배너', () => {
    const vm = selectHomeViewModel(args({ status: 'error', error: { code: 'offline', message: 'x' } }));
    expect(vm.mode).toBe('offline');
    expect(vm.emptyMessage).toBe(COPY.offline);
    const vm2 = selectHomeViewModel(args({ status: 'error', error: { code: 'offline', message: 'x' }, cached: loadMockSnapshot('normal', NOW) }));
    expect(vm2.banner).toBe(COPY.offline);
  });

  test('outdated: 표시 차단 + 업데이트 안내(캐시가 있어도)', () => {
    const vm = selectHomeViewModel(args({ status: 'error', error: { code: 'outdated', message: 'x' }, cached: loadMockSnapshot('normal', NOW) }));
    expect(vm.mode).toBe('outdated');
    expect(vm.showScores).toBe(false);
    expect(vm.emptyMessage).toBe(COPY.outdated);
  });

  test('지수 전환: NDX 블록을 읽는다', () => {
    const data = loadMockSnapshot('capitulation', NOW);
    const spx = selectHomeViewModel(args({ status: 'success', data, fromCache: false }, { index: 'SPX' }));
    const ndx = selectHomeViewModel(args({ status: 'success', data, fromCache: false }, { index: 'NDX' }));
    expect(spx.quadrant).toBe('Q1');
    expect(ndx.index).toBe('NDX');
    expect(ndx.rfg).not.toBe(EMPTY);
  });

  test('FRM 억제(euphoria: Fear 7 < 10): 배수 — 이고 문장 없음, 억제 사유 문구', () => {
    const vm = selectHomeViewModel(args({ status: 'success', data: loadMockSnapshot('euphoria', NOW), fromCache: false }));
    expect(vm.frm).toBe(EMPTY);
    expect(vm.frmSentence).toBeNull();
    expect(vm.frmMeaning).toContain('10 미만');
  });
});
