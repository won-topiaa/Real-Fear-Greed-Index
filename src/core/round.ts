import { DISPLAY_DIGITS } from './constants';
import type { RfgRow, RoundedValues } from './types';

/**
 * 반올림 한 곳. 표시와 판정이 모두 이 함수를 거친다(DESIGN §4.3).
 * - .5 는 0 에서 먼 쪽으로(half away from zero): 69.5 → 70, −2.65 → −2.7. 부호에 대칭이라 DD/DISP 같은 음수 표시도 일관된다.
 *   판정에 쓰는 값(FG, Fear, P, RFG, FRM)은 모두 0 이상이므로 JS Math.round 와 결과가 같다.
 * - 1.005 같은 이진 표현 오차는 (1 + ε) 보정으로 흡수한다.
 * - −0 은 0 으로 정규화한다.
 */
export function roundTo(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** digits;
  const sign = v < 0 ? -1 : 1;
  const r = (sign * Math.round(Math.abs(v) * f * (1 + Number.EPSILON))) / f;
  return Object.is(r, -0) ? 0 : r;
}

function roundOrNull(v: number | null, digits: number): number | null {
  return v == null ? null : roundTo(v, digits);
}

/** 화면에 보이는 정밀도로 반올림한 값. classify() 가 이 값으로 판정한다. */
export function roundForDisplay(row: Pick<RfgRow, 'fg' | 'fear' | 'p' | 'rfg' | 'frm'>): RoundedValues {
  return {
    fg: roundOrNull(row.fg, DISPLAY_DIGITS.score),
    fear: roundOrNull(row.fear, DISPLAY_DIGITS.score),
    p: roundOrNull(row.p, DISPLAY_DIGITS.score),
    rfg: roundOrNull(row.rfg, DISPLAY_DIGITS.score),
    frm: roundOrNull(row.frm, DISPLAY_DIGITS.frm),
  };
}
