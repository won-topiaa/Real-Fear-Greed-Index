import { DATA_GATES, RFG_PARAMS, THRESHOLDS } from '../../core/constants';
import { COPY, DISCLAIMER, FRM_MEANING, LABELS, QUADRANT_DESCRIPTION, a11ySummary } from '../copy';

const FORBIDDEN = ['매수', '매도', '헤지', '수익 실현', '추천', '청산'];

function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') {
    try {
      const r = (v as (...a: string[]) => unknown)('1', '2', '3');
      allStrings(r, out);
    } catch {
      /* 인자 형태가 다른 함수는 건너뜀 */
    }
  } else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

describe('copy — 문구는 상수를 보간한다', () => {
  test('gaugeLegend 에 20/80 이 상수에서 들어간다', () => {
    const s = COPY.gaugeLegend();
    expect(s).toContain(String(THRESHOLDS.RFG_CAPITULATION_MAX));
    expect(s).toContain(String(THRESHOLDS.RFG_EUPHORIA_MIN));
  });

  test('describeIndicators 가 N/M/K/W 를 포함', () => {
    const d = COPY.describeIndicators();
    expect(d.dd).toContain(String(RFG_PARAMS.DD_WINDOW_N));
    expect(d.disp).toContain(String(RFG_PARAMS.SMA_WINDOW_M));
    expect(d.rv).toContain(String(RFG_PARAMS.RV_WINDOW_K));
    expect(d.p).toContain(String(RFG_PARAMS.PERCENTILE_WINDOW_W));
  });

  test('thresholdTable 은 사분면 4 + 구간 2 + FRM 3 = 9행이고 70/60/40/0.5/1.5 를 담는다', () => {
    const rows = COPY.thresholdTable();
    expect(rows).toHaveLength(9);
    const text = rows.map((r) => r.rule).join(' ');
    for (const n of [THRESHOLDS.Q1.FEAR_MIN, THRESHOLDS.Q2.P_MIN, THRESHOLDS.Q3.P_MAX, THRESHOLDS.FRM_FAKE_FEAR_MAX, THRESHOLDS.FRM_HIDDEN_CRASH_MIN]) {
      expect(text).toContain(String(n));
    }
  });

  test('SUPPRESSED 문구는 FRM_MIN_FEAR 를 보간', () => {
    expect(FRM_MEANING.SUPPRESSED).toContain(String(DATA_GATES.FRM_MIN_FEAR));
  });

  test('freshness 문구', () => {
    expect(COPY.freshness('fresh', 0)).toBe('');
    expect(COPY.freshness('delayed', 2)).toContain('2거래일');
    expect(COPY.freshness('stale', 5)).toContain('보여주지 않아요');
  });

  test('행동 지시 금지 단어가 없다', () => {
    const strings = [...allStrings(COPY), ...allStrings(LABELS), ...allStrings(QUADRANT_DESCRIPTION), ...allStrings(FRM_MEANING), ...allStrings(DISCLAIMER)];
    expect(strings.length).toBeGreaterThan(20);
    for (const s of strings) for (const w of FORBIDDEN) expect(s).not.toContain(w);
  });

  test('a11ySummary', () => {
    expect(a11ySummary('63', 'MID', 'NEUTRAL')).toBe('실질 공포탐욕지수 63, 중간 구간, 뚜렷한 국면 아님');
  });
});
