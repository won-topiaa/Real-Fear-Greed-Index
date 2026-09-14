/**
 * 사용자에게 보이는 모든 문구. 숫자는 core 상수를 보간해서만 만든다(JSX 에 숫자 리터럴 금지).
 * 행동을 지시하는 문구(사고팔라는 권유 등)는 쓰지 않는다 — 국면 서술만. doctor 가 금지 단어를 검사한다.
 * 순수 TS: react/react-native import 금지(스토어 그림 스크립트가 그대로 import).
 */
import { DATA_GATES, RFG_PARAMS as P, THRESHOLDS as T } from '../core/constants';
import type { Freshness } from '../core/freshness';
import type { FrmZone, IndexSymbol, Quadrant, RfgZone } from '../core/types';

export const APP_TITLE = '실질 공포탐욕지수';

export const DISCLAIMER = {
  version: 1,
  short: '이 지수는 투자 조언이 아니에요.',
  full:
    '이 지수는 공개된 연구 보고서의 산식을 그대로 계산해 보여주는 참고 자료예요. ' +
    '투자 권유나 자문이 아니며, 어떤 결정의 근거로도 쓰지 마세요. ' +
    '값은 미국 정규장 마감 후 하루 한 번 갱신되고 실시간이 아니에요. ' +
    '심리 지표는 비공식 경로로 수집한 값이라 예고 없이 중단될 수 있어요.',
} as const;

export const LABELS: {
  index: Record<IndexSymbol, string>;
  quadrant: Record<Quadrant, string>;
  rfgZone: Record<RfgZone, string>;
  frmZone: Record<FrmZone, string>;
  axis: { fear: string; p: string; frm: string; rfg: string; fg: string };
} = {
  index: { SPX: 'S&P 500', NDX: '나스닥 100' },
  quadrant: {
    Q1: '패닉 투매',
    Q2: '은밀한 붕괴',
    Q3: '건전한 상승',
    Q4: '가짜 공포',
    NEUTRAL: '뚜렷한 국면 아님',
    UNKNOWN: '판정 불가',
  },
  rfgZone: { CAPITULATION: '실질적 항복', MID: '중간 구간', EUPHORIA: '실질적 과열', UNKNOWN: '판정 불가' },
  frmZone: {
    FAKE_FEAR: '공포 과대평가',
    ALIGNED: '공포와 가격 일치',
    HIDDEN_CRASH: '공포 과소평가',
    SUPPRESSED: '표시 안 함',
    UNKNOWN: '판정 불가',
  },
  axis: { fear: '심리 공포도', p: '실질 훼손도', frm: '전이 배수', rfg: '실질 공포탐욕지수', fg: '심리 지수' },
};

/** 국면 서술. 행동 지시 없음. */
export const QUADRANT_DESCRIPTION: Record<Quadrant, string> = {
  Q1: '심리와 지수가 함께 극단적으로 무너진 상태예요.',
  Q2: '지수는 크게 훼손됐지만 심리는 아직 낙관적인 상태예요.',
  Q3: '낮은 변동성 속에 지수가 견조하고 심리도 안정적인 상태예요.',
  Q4: '심리는 얼어붙었지만 지수는 견조한 상태예요.',
  NEUTRAL: '보고서의 네 국면 어디에도 뚜렷하게 속하지 않는 구간이에요.',
  UNKNOWN: '심리 또는 가격 데이터가 없어 국면을 판정하지 않았어요.',
};

export const FRM_MEANING: Record<FrmZone, string> = {
  FAKE_FEAR: "심리에 비해 지수는 덜 빠졌어요. 보고서는 이를 '가짜 공포'로 분류해요.",
  ALIGNED: '심리와 지수 낙폭이 대체로 같은 보폭이에요.',
  HIDDEN_CRASH: "심리보다 지수가 더 빠르게 무너지고 있어요. 보고서는 이를 '안일함의 붕괴'로 분류해요.",
  SUPPRESSED: `심리 공포도가 ${DATA_GATES.FRM_MIN_FEAR} 미만이라 전이 배수를 보여주지 않아요.`,
  UNKNOWN: '실질 훼손도를 아직 계산하지 못해 전이 효율을 말할 수 없어요.',
};

export const COPY = {
  /** 측정값을 문장에 넣는다. 재보지 않은 값으로 이유를 말하지 않는다. */
  frmSentence: (fear: string, p: string, frm: string): string => `심리 공포도 ${fear}, 실질 훼손도 ${p} → 전이 ${frm}.`,
  quadrantNone: (fear: string, p: string): string => `뚜렷한 국면 아님 (공포도 ${fear}, 훼손도 ${p})`,
  freshness: (level: Freshness, tradingDaysBehind: number): string => {
    switch (level) {
      case 'fresh':
        return '';
      case 'delayed':
        return `${tradingDaysBehind}거래일 전 값이에요 · 갱신이 늦어지고 있어요`;
      case 'stale':
        return `${tradingDaysBehind}거래일 전 값이라 지수를 보여주지 않아요`;
      default:
        return '데이터 상태를 확인할 수 없어요';
    }
  },
  gaugeLegend: (): string => `${T.RFG_CAPITULATION_MAX} 이하 실질적 항복 · ${T.RFG_EUPHORIA_MIN} 이상 실질적 과열`,
  describeIndicators: (): { dd: string; disp: string; rv: string; p: string } => ({
    dd: `${P.DD_WINDOW_N}일 고점 대비 낙폭`,
    disp: `${P.SMA_WINDOW_M}일 이동평균 대비 이격도`,
    rv: `${P.RV_WINDOW_K}일 실현 변동성(연율)`,
    p: `최근 ${P.PERCENTILE_WINDOW_W}거래일 안에서의 가격 훼손도 백분위`,
  }),
  detailLine: (dd: string, disp: string, rv: string): string =>
    `${P.DD_WINDOW_N}일 고점 대비 ${dd} · ${P.SMA_WINDOW_M}일선 대비 ${disp} · ${P.RV_WINDOW_K}일 변동성 ${rv}`,
  thresholdTable: (): Array<{ key: string; rule: string }> => [
    { key: LABELS.rfgZone.CAPITULATION, rule: `실질 공포탐욕지수 ${T.RFG_CAPITULATION_MAX} 이하` },
    { key: LABELS.rfgZone.EUPHORIA, rule: `실질 공포탐욕지수 ${T.RFG_EUPHORIA_MIN} 이상` },
    { key: LABELS.quadrant.Q1, rule: `공포도 ${T.Q1.FEAR_MIN} 이상, 훼손도 ${T.Q1.P_MIN} 이상` },
    { key: LABELS.quadrant.Q2, rule: `공포도 ${T.Q2.FEAR_MAX} 미만, 훼손도 ${T.Q2.P_MIN} 이상` },
    { key: LABELS.quadrant.Q3, rule: `공포도 ${T.Q3.FEAR_MAX} 미만, 훼손도 ${T.Q3.P_MAX} 미만` },
    { key: LABELS.quadrant.Q4, rule: `공포도 ${T.Q4.FEAR_MIN} 이상, 훼손도 ${T.Q4.P_MAX} 미만` },
    { key: LABELS.frmZone.FAKE_FEAR, rule: `전이 배수 ${T.FRM_FAKE_FEAR_MAX} 미만` },
    { key: LABELS.frmZone.ALIGNED, rule: `전이 배수 ${T.FRM_FAKE_FEAR_MAX} 이상 ${T.FRM_HIDDEN_CRASH_MIN} 이하` },
    { key: LABELS.frmZone.HIDDEN_CRASH, rule: `전이 배수 ${T.FRM_HIDDEN_CRASH_MIN} 초과` },
  ],
  paramsSummary: (): string =>
    `가중치 ${P.W1_SENTIMENT}(심리) / ${P.W2_PRICE}(실질 가격) · 훼손도 합성 ${P.ALPHA_DD}/${P.BETA_DISP}/${P.GAMMA_RV}(낙폭/이격도/변동성)`,
  mockBadge: '샘플 데이터',
  mockHint: '프록시 주소가 비어 있어 예시 값을 보여줘요.',
  sourcesNotice: '심리 지표: CNN Business Fear & Greed Index(비공식 경로로 수집). 지수: FRED, Stooq. 참고용이며 실시간이 아니에요.',
  refreshNotice: '미국 정규장 마감 후 하루 한 번 갱신돼요.',
  fgMissing: '심리 데이터를 아직 못 받았어요.',
  staleBlocked: '데이터가 오래되어 지수를 보여주지 않아요.',
  errorNoCache: '값을 불러오지 못했어요.',
  errorWithCache: (closeDate: string): string => `새 값을 못 받았어요 · 마지막 ${closeDate} 값`,
  offline: '인터넷 연결을 확인해 주세요.',
  outdated: '앱 업데이트가 필요해요.',
  retry: '다시 시도',
  aboutLink: '계산 방식과 출처',
  sparklineCaption: (): string => `최근 ${DATA_GATES.HISTORY_DAYS}거래일`,
  serverParamsDiffer: '서버가 계산한 기준 값이 앱 설정과 달라요. 화면은 서버 기준 값이에요.',
} as const;

/** 접근성 문장. 게이지·사분면 그림의 accessibilityLabel 로 쓴다. */
export function a11ySummary(rfg: string, zone: RfgZone, quadrant: Quadrant): string {
  return `${APP_TITLE} ${rfg}, ${LABELS.rfgZone[zone]}, ${LABELS.quadrant[quadrant]}`;
}
