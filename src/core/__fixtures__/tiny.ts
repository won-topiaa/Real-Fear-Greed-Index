/**
 * 손계산 픽스처(DESIGN §9.1). 파라미터를 작게 주입(N=3, M=3, K=3, W=4)해 손으로 검산 가능하다.
 * 기대값은 보고서 수식으로 직접 유도한 값이며 구현을 복사한 것이 아니다.
 */
import { RFG_PARAMS, type RfgParams } from '../constants';
import type { FgPoint, PricePoint } from '../types';

export const TINY_PARAMS: RfgParams = {
  ...RFG_PARAMS,
  DD_WINDOW_N: 3,
  SMA_WINDOW_M: 3,
  RV_WINDOW_K: 3,
  PERCENTILE_WINDOW_W: 4,
};

/** 2026-08-03(월) ~ 2026-08-14(금), 연속 거래일 10개 */
export const DATES = [
  '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
  '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
];
export const CLOSES = [100, 102, 101, 105, 103, 99, 104, 106, 106, 110];
export const FG = [70, 72, 68, 75, 60, 40, 55, 80, 82, 90];

export const PRICES: PricePoint[] = DATES.map((date, i) => ({ date, close: CLOSES[i] as number }));
export const FG_POINTS: FgPoint[] = DATES.map((date, i) => ({ date, value: FG[i] as number, source: 'own' }));

const N = null;
export const EXPECTED = {
  r: [N, 0.019803, -0.009852, 0.03884, -0.019231, -0.039609, 0.049271, 0.019048, 0, 0.037041],
  dd: [N, N, -0.009804, 0, -0.019048, -0.057143, 0, 0, 0, 0],
  disp: [N, N, 0, 0.022727, 0, -0.032573, 0.019608, 0.029126, 0.006329, 0.024845],
  rv: [N, N, N, 0.389533, 0.494882, 0.646184, 0.739132, 0.717398, 0.394415, 0.294046],
  composite: [N, N, N, 0.071088, 0.1085, 0.16758, 0.141944, 0.134742, 0.076984, 0.051356],
  p: [N, N, N, N, N, N, 200 / 3, 100 / 3, 0, 0],
  fear: FG.map((v) => 100 - v),
  rfg: [N, N, N, N, N, N, 42, 72, 92.8, 96],
  frm: [N, N, N, N, N, N, (200 / 3) / (45 + 1e-5), (100 / 3) / (20 + 1e-5), 0, 0],
} as const;

export function expectSeries(actual: readonly (number | null)[], expected: readonly (number | null)[], digits = 5): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((e, i) => {
    const a = actual[i];
    if (e == null) {
      expect(a).toBeNull();
    } else {
      expect(a).not.toBeNull();
      expect(a as number).toBeCloseTo(e, digits);
    }
  });
}
