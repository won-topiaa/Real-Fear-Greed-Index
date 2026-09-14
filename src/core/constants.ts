/**
 * 모든 숫자의 유일한 출처.
 * - RFG_PARAMS  : 계산 파라미터(보고서 §2 권장값). 하나 바꾸면 파이프라인·앱·백테스트·스토어 그림이 함께 바뀐다.
 * - THRESHOLDS  : 보고서 §3·§4·§5.1 문턱 그대로. 점수가 아니라 "이름을 붙이거나 막는" 경계.
 * - DATA_GATES  : 보고서에 없는 운영 결정. 이 조건을 못 넘으면 값을 깎지 않고 "말하지 않는다".
 * - DISPLAY_DIGITS : 표시 정밀도. 판정도 같은 정밀도로 반올림한 값을 쓴다(DESIGN §4.3).
 */

export const RFG_PARAMS = {
  /** N — 고점 대비 낙폭 창(거래일) */
  DD_WINDOW_N: 60,
  /** M — 단순이동평균 창(거래일) */
  SMA_WINDOW_M: 50,
  /** K — 실현 변동성 창(수익률 개수) */
  RV_WINDOW_K: 20,
  /** √252 연율화 상수. 창 W 와 우연히 같은 숫자지만 다른 상수다. */
  ANNUALIZATION_DAYS: 252,
  /** W — 백분위 롤링 창(거래일) */
  PERCENTILE_WINDOW_W: 252,
  /** α — Composite_Damage 의 (−DD) 가중치 */
  ALPHA_DD: 0.5,
  /** β — Composite_Damage 의 (−DISP) 가중치 */
  BETA_DISP: 0.3,
  /** γ — Composite_Damage 의 RV 가중치 */
  GAMMA_RV: 0.2,
  /** w1 — RFG 의 심리(FG) 가중치 */
  W1_SENTIMENT: 0.4,
  /** w2 — RFG 의 실질 가격(100 − P) 가중치 */
  W2_PRICE: 0.6,
  /** ε — FRM 분모 */
  EPSILON: 1e-5,
} as const;

export type RfgParams = { -readonly [K in keyof typeof RFG_PARAMS]: number };

export const THRESHOLDS = {
  /** RFG ≤ 20 실질적 항복 */
  RFG_CAPITULATION_MAX: 20,
  /** RFG ≥ 80 실질적 과열 */
  RFG_EUPHORIA_MIN: 80,
  /** FRM < 0.5 가짜 공포(공포 과대평가) */
  FRM_FAKE_FEAR_MAX: 0.5,
  /** FRM > 1.5 안일함의 붕괴(공포 과소평가). 0.5 ≤ FRM ≤ 1.5 는 일치 */
  FRM_HIDDEN_CRASH_MIN: 1.5,
  /** 제1사분면 패닉 투매: Fear ≥ 70 ∧ P ≥ 70 */
  Q1: { FEAR_MIN: 70, P_MIN: 70 },
  /** 제2사분면 은밀한 붕괴: Fear < 40 ∧ P ≥ 60 */
  Q2: { FEAR_MAX: 40, P_MIN: 60 },
  /** 제3사분면 건전한 상승: Fear < 40 ∧ P < 40 */
  Q3: { FEAR_MAX: 40, P_MAX: 40 },
  /** 제4사분면 가짜 공포: Fear ≥ 60 ∧ P < 40 */
  Q4: { FEAR_MIN: 60, P_MAX: 40 },
  /** 극단적 매수 시그널(보고서 §5.1): RFG ≤ 20 ∨ (Fear ≥ 65 ∧ P ≤ 35). v1 화면 미노출, 백테스트용 */
  SIGNAL_BUY: { RFG_MAX: 20, FEAR_MIN: 65, P_MAX: 35 },
  /** 리스크 관리 시그널(보고서 §5.1): FRM ≥ 1.5 ∧ P ≥ 60. 모델 B 의 '>1.5' 와 별개 상수 */
  SIGNAL_RISK: { FRM_MIN: 1.5, P_MIN: 60 },
} as const;

export const DATA_GATES = {
  /** 보고서 외: FG 를 거래일에 as-of 조인할 때 허용하는 달력일 수 */
  FG_MAX_STALENESS_DAYS: 5,
  /** 보고서 외: Fear 가 이보다 작으면 FRM 표시·시그널 억제(분모 발산, 극단적 탐욕에선 '공포 전이'가 무의미) */
  FRM_MIN_FEAR: 10,
  /** 보고서 외: 기대 최신 거래일보다 이만큼 넘게 뒤지면 RFG·사분면·FRM 표시 차단 */
  STALE_AFTER_TRADING_DAYS: 3,
  /** 보고서 외: 일간 |로그수익률| 이 이보다 크면 소스 오염 의심 → 해당 소스 거부 */
  MAX_ABS_LOG_RETURN: 0.25,
  /** 보고서 외: 거래일 사이 달력 간격이 이보다 크면 경고 */
  MAX_CALENDAR_GAP_DAYS: 5,
  /** 보고서 외: 스냅샷 히스토리 길이(거래일) */
  HISTORY_DAYS: 60,
  /** = minClosesRequired(RFG_PARAMS). 테스트가 일치를 검사한다. */
  MIN_CLOSES: 311,
  /** = MIN_CLOSES + HISTORY_DAYS − 1. 테스트가 일치를 검사한다. */
  MIN_CLOSES_FOR_SNAPSHOT: 370,
  /** 보고서 외: 스냅샷이 이보다 오래되면 앱이 기기 시각으로 기대 거래일을 다시 계산한다 */
  SNAPSHOT_SELF_CLOCK_AFTER_HOURS: 48,
} as const;

export type DataGates = { -readonly [K in keyof typeof DATA_GATES]: number };

export const DISPLAY_DIGITS = {
  /** FG, Fear, P, RFG — 정수 */
  score: 0,
  /** DD, DISP, RV 를 % 로 보일 때 — 소수 1자리 */
  ratioPercent: 1,
  /** FRM — 소수 2자리 */
  frm: 2,
} as const;

/** 파라미터 불변식. 위반하면 모듈을 쓰는 쪽이 즉시 죽어야 한다(조용히 다른 숫자를 만들지 않는다). */
export function assertParams(p: RfgParams): void {
  const fail = (msg: string): never => {
    throw new Error(`[RFG_PARAMS] ${msg}`);
  };
  if (Math.abs(p.W1_SENTIMENT + p.W2_PRICE - 1) > 1e-12) fail('w1 + w2 must equal 1');
  if (p.W1_SENTIMENT <= 0 || p.W2_PRICE <= 0) fail('w1, w2 must be > 0');
  if (p.ALPHA_DD + p.BETA_DISP + p.GAMMA_RV <= 0) fail('alpha + beta + gamma must be > 0');
  for (const key of ['DD_WINDOW_N', 'SMA_WINDOW_M', 'RV_WINDOW_K', 'PERCENTILE_WINDOW_W'] as const) {
    const v = p[key];
    if (!Number.isInteger(v) || v < 2) fail(`${key} must be an integer >= 2`);
  }
  if (!(p.ANNUALIZATION_DAYS > 0)) fail('ANNUALIZATION_DAYS must be > 0');
  if (!(p.EPSILON > 0)) fail('EPSILON must be > 0');
}

/** P_t 가 처음 정의되기까지 필요한 최소 종가 개수: max(N, M, K+1) + W − 1 (DESIGN §4.2) */
export function minClosesRequired(p: RfgParams = RFG_PARAMS): number {
  return Math.max(p.DD_WINDOW_N, p.SMA_WINDOW_M, p.RV_WINDOW_K + 1) + p.PERCENTILE_WINDOW_W - 1;
}

/** 스냅샷 히스토리 historyDays 행을 모두 채우기 위한 최소 종가 개수 */
export function minClosesForSnapshot(p: RfgParams = RFG_PARAMS, historyDays: number = DATA_GATES.HISTORY_DAYS): number {
  return minClosesRequired(p) + historyDays - 1;
}
