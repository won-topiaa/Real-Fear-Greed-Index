import { DATA_GATES, THRESHOLDS } from './constants';
import { roundForDisplay } from './round';
import type { Classification, FrmZone, Quadrant, RfgRow, RfgZone } from './types';

type Thresholds = typeof THRESHOLDS;
type Gates = typeof DATA_GATES;

/**
 * 국면 분류. 입력은 표시 정밀도로 반올림한 값(DESIGN §4.3) — 화면의 숫자와 라벨이 어긋나지 않는다.
 * 부등호 방향은 constants.ts 주석이 유일한 진실이다.
 */
export function classify(
  row: Pick<RfgRow, 'fg' | 'fear' | 'p' | 'rfg' | 'frm'>,
  t: Thresholds = THRESHOLDS,
  g: Gates = DATA_GATES,
): Classification {
  const r = roundForDisplay(row);
  const fgOk = r.fg != null && r.fear != null;
  const pOk = r.p != null;
  const frmOk = r.frm != null && r.fear != null && r.fear >= g.FRM_MIN_FEAR;

  let quadrant: Quadrant = 'UNKNOWN';
  if (r.fear != null && r.p != null) {
    const fear = r.fear;
    const p = r.p;
    if (fear >= t.Q1.FEAR_MIN && p >= t.Q1.P_MIN) quadrant = 'Q1';
    else if (fear < t.Q2.FEAR_MAX && p >= t.Q2.P_MIN) quadrant = 'Q2';
    else if (fear < t.Q3.FEAR_MAX && p < t.Q3.P_MAX) quadrant = 'Q3';
    else if (fear >= t.Q4.FEAR_MIN && p < t.Q4.P_MAX) quadrant = 'Q4';
    else quadrant = 'NEUTRAL';
  }

  let rfgZone: RfgZone = 'UNKNOWN';
  if (r.rfg != null) {
    if (r.rfg <= t.RFG_CAPITULATION_MAX) rfgZone = 'CAPITULATION';
    else if (r.rfg >= t.RFG_EUPHORIA_MIN) rfgZone = 'EUPHORIA';
    else rfgZone = 'MID';
  }

  let frmZone: FrmZone = 'UNKNOWN';
  if (r.frm != null && r.fear != null) {
    if (r.fear < g.FRM_MIN_FEAR) frmZone = 'SUPPRESSED';
    else if (r.frm < t.FRM_FAKE_FEAR_MAX) frmZone = 'FAKE_FEAR';
    else if (r.frm > t.FRM_HIDDEN_CRASH_MIN) frmZone = 'HIDDEN_CRASH';
    else frmZone = 'ALIGNED';
  }

  const buy =
    (r.rfg != null && r.rfg <= t.SIGNAL_BUY.RFG_MAX) ||
    (r.fear != null && r.p != null && r.fear >= t.SIGNAL_BUY.FEAR_MIN && r.p <= t.SIGNAL_BUY.P_MAX);
  const risk = frmOk && r.frm != null && r.p != null && r.frm >= t.SIGNAL_RISK.FRM_MIN && r.p >= t.SIGNAL_RISK.P_MIN;

  return { quadrant, rfgZone, frmZone, signals: { buy, risk }, gates: { fgOk, pOk, frmOk }, rounded: r };
}
