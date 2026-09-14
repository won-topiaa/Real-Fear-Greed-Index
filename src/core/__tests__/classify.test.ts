import { classify } from '../classify';
import { THRESHOLDS } from '../constants';

function row(over: Partial<{ fg: number | null; fear: number | null; p: number | null; rfg: number | null; frm: number | null }>) {
  const fear = over.fear === undefined ? 50 : over.fear;
  const fg = over.fg === undefined ? (fear == null ? null : 100 - fear) : over.fg;
  return { fg, fear, p: over.p === undefined ? 50 : over.p, rfg: over.rfg === undefined ? 50 : over.rfg, frm: over.frm === undefined ? 1 : over.frm };
}

describe('classify — 사분면 경계 (반올림 값으로 판정, DESIGN §4.3)', () => {
  test.each([
    [70, 70, 'Q1'],
    [69.5, 70, 'Q1'], // 69.5 → 70
    [69.49, 70, 'NEUTRAL'], // 69.49 → 69
    [70, 69.5, 'Q1'],
    [39, 60, 'Q2'],
    [40, 60, 'NEUTRAL'], // Fear < 40 아님
    [39.5, 60, 'NEUTRAL'], // 39.5 → 40
    [39, 59.5, 'Q2'], // 59.5 → 60
    [39, 39, 'Q3'],
    [39, 40, 'NEUTRAL'],
    [39, 39.5, 'NEUTRAL'], // 39.5 → 40
    [60, 39, 'Q4'],
    [59.5, 39, 'Q4'], // 59.5 → 60
    [59.49, 39, 'NEUTRAL'],
    [60, 39.5, 'NEUTRAL'], // P 39.5 → 40
    [50, 50, 'NEUTRAL'],
  ] as const)('Fear %p, P %p → %s', (fear, p, expected) => {
    expect(classify(row({ fear, p })).quadrant).toBe(expected);
  });

  test('사분면은 서로 겹치지 않는다(격자 전수)', () => {
    for (let fear = 0; fear <= 100; fear += 5) {
      for (let p = 0; p <= 100; p += 5) {
        const q = classify(row({ fear, p })).quadrant;
        const inQ1 = fear >= 70 && p >= 70;
        const inQ2 = fear < 40 && p >= 60;
        const inQ3 = fear < 40 && p < 40;
        const inQ4 = fear >= 60 && p < 40;
        const count = [inQ1, inQ2, inQ3, inQ4].filter(Boolean).length;
        expect(count).toBeLessThanOrEqual(1);
        expect(q).toBe(inQ1 ? 'Q1' : inQ2 ? 'Q2' : inQ3 ? 'Q3' : inQ4 ? 'Q4' : 'NEUTRAL');
      }
    }
  });
});

describe('classify — RFG 구간', () => {
  test.each([
    [20, 'CAPITULATION'],
    [20.4, 'CAPITULATION'],
    [20.5, 'MID'],
    [79.49, 'MID'],
    [79.5, 'EUPHORIA'],
    [80, 'EUPHORIA'],
    [null, 'UNKNOWN'],
  ] as const)('RFG %p → %s', (rfg, expected) => {
    expect(classify(row({ rfg })).rfgZone).toBe(expected);
  });
});

describe('classify — FRM 해석과 표시 게이트', () => {
  test.each([
    [0.49, 30, 'FAKE_FEAR'],
    [0.495, 30, 'ALIGNED'], // 0.495 → 0.50
    [0.5, 30, 'ALIGNED'],
    [1.5, 30, 'ALIGNED'],
    [1.495, 30, 'ALIGNED'], // → 1.50
    [1.505, 30, 'HIDDEN_CRASH'], // → 1.51
    [2, 9, 'SUPPRESSED'], // Fear < FRM_MIN_FEAR
    [2, 9.5, 'HIDDEN_CRASH'], // 9.5 → 10, 게이트 통과
    [null, 30, 'UNKNOWN'],
  ] as const)('FRM %p, Fear %p → %s', (frm, fear, expected) => {
    expect(classify(row({ frm, fear })).frmZone).toBe(expected);
  });

  test('Fear < 10 이면 frmOk = false 이고 리스크 시그널도 false', () => {
    const c = classify(row({ frm: 2, fear: 9, p: 70 }));
    expect(c.gates.frmOk).toBe(false);
    expect(c.signals.risk).toBe(false);
  });
});

describe('classify — 시그널 (보고서 §5.1, 화면 미노출)', () => {
  test('BUY: RFG ≤ 20 또는 (Fear ≥ 65 ∧ P ≤ 35), 각각 독립', () => {
    expect(classify(row({ rfg: 20, fear: 30, p: 50 })).signals.buy).toBe(true);
    expect(classify(row({ rfg: 50, fear: 65, p: 35 })).signals.buy).toBe(true);
    expect(classify(row({ rfg: 50, fear: 65, p: 36 })).signals.buy).toBe(false);
    expect(classify(row({ rfg: 50, fear: 64, p: 35 })).signals.buy).toBe(false);
    expect(classify(row({ rfg: 21, fear: 30, p: 50 })).signals.buy).toBe(false);
  });

  test('RISK: FRM ≥ 1.5 ∧ P ≥ 60 (포함), 모델 B 의 >1.5 와 별개', () => {
    expect(classify(row({ frm: 1.5, p: 60, fear: 30 })).signals.risk).toBe(true);
    expect(classify(row({ frm: 1.5, p: 60, fear: 30 })).frmZone).toBe('ALIGNED');
    expect(classify(row({ frm: 1.5, p: 59, fear: 30 })).signals.risk).toBe(false);
    expect(classify(row({ frm: 1.49, p: 60, fear: 30 })).signals.risk).toBe(false);
    expect(THRESHOLDS.SIGNAL_RISK.FRM_MIN).toBe(THRESHOLDS.FRM_HIDDEN_CRASH_MIN);
  });

  test('결측이면 UNKNOWN 이고 시그널은 모두 false, gates 는 false', () => {
    const c = classify({ fg: null, fear: null, p: null, rfg: null, frm: null });
    expect(c.quadrant).toBe('UNKNOWN');
    expect(c.rfgZone).toBe('UNKNOWN');
    expect(c.frmZone).toBe('UNKNOWN');
    expect(c.signals).toEqual({ buy: false, risk: false });
    expect(c.gates).toEqual({ fgOk: false, pOk: false, frmOk: false });
  });

  test('rounded 는 판정에 쓴 값이며 표시 정밀도와 같다', () => {
    const c = classify(row({ fear: 59.6, p: 31.4, rfg: 57.55, frm: 0.5327 }));
    expect(c.rounded).toEqual({ fg: 40, fear: 60, p: 31, rfg: 58, frm: 0.53 });
  });
});
