import type { RfgParams } from './constants';

/** 'YYYY-MM-DD'. 미국 동부(ET) 기준 거래일. */
export type IsoDate = string;

export type IndexSymbol = 'SPX' | 'NDX';

export interface PricePoint {
  date: IsoDate;
  close: number;
}

export interface FgPoint {
  date: IsoDate;
  /** CNN Fear & Greed 값, 0~100 */
  value: number;
  observedAtUtc?: string;
  /** own = 우리 잡이 마감 후 직접 관측, cnn-historical = CNN historical 백필, seed = 외부 CSV(v1 미사용) */
  source: 'own' | 'cnn-historical' | 'seed';
}

/** 가격 손상도 행. 창 미달 구간은 null. */
export interface DamageRow {
  date: IsoDate;
  close: number;
  /** DD_t */
  dd: number | null;
  /** DISP_t */
  disp: number | null;
  /** RV_t (연율화) */
  rv: number | null;
  /** Composite_Damage_t — v2: 성분별 백분위의 가중 평균(0~100) = P_t */
  composite: number | null;
  /** P_t, 0~100 */
  p: number | null;
}

export interface RfgRow extends DamageRow {
  /** FG_t (as-of 조인 결과) */
  fg: number | null;
  /** 실제로 쓰인 FG 관측 날짜 */
  fgDate: IsoDate | null;
  /** date − fgDate (달력일) */
  fgStaleDays: number | null;
  /** Fear_t = 100 − FG_t */
  fear: number | null;
  /** RFG_t — 표시값(RFG_EMA_SPAN 지수이동평균. 1 이면 rfgOf 그대로) */
  rfg: number | null;
  /** FRM_t (캡하지 않은 원시값) */
  frm: number | null;
}

export type Quadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'NEUTRAL' | 'UNKNOWN';
export type RfgZone = 'CAPITULATION' | 'MID' | 'EUPHORIA' | 'UNKNOWN';
export type FrmZone = 'FAKE_FEAR' | 'ALIGNED' | 'HIDDEN_CRASH' | 'SUPPRESSED' | 'UNKNOWN';
/** 웹 게이지 5구간(DISPLAY_BANDS) */
export type Band = 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED' | 'UNKNOWN';

export interface RoundedValues {
  fg: number | null;
  fear: number | null;
  p: number | null;
  rfg: number | null;
  frm: number | null;
}

export interface Classification {
  quadrant: Quadrant;
  rfgZone: RfgZone;
  frmZone: FrmZone;
  /** 보고서 §5.1. v1 화면 미노출. */
  signals: { buy: boolean; risk: boolean };
  /** "이유를 말할 자격". false 면 해당 문장을 만들지 않는다. */
  gates: { fgOk: boolean; pOk: boolean; frmOk: boolean };
  /** 판정에 쓴 값 = 화면에 보이는 값 */
  rounded: RoundedValues;
}

export type ValidationCode =
  | 'unsorted'
  | 'duplicate-date'
  | 'non-finite'
  | 'non-positive'
  | 'out-of-range'
  | 'jump'
  | 'gap'
  | 'too-short'
  | 'source-mismatch';

export interface ValidationIssue {
  code: ValidationCode;
  index?: number;
  date?: IsoDate;
  fatal: boolean;
  detail?: string;
}

export type MarketFlag = 'fg-stale' | 'fg-missing' | 'gap-warning' | 'source-mismatch' | 'fg-date-mismatch';
export type PriceSource = 'fred' | 'stooq' | 'yahoo';

export interface HistoryPoint {
  date: IsoDate;
  rfg: number | null;
  p: number | null;
  fear: number | null;
}

export interface MarketBlock {
  closeDate: IsoDate;
  closeAtUtc: string;
  /** 원시 종가(close)는 싣지 않는다(DESIGN §3.6) */
  latest: Omit<RfgRow, 'close'>;
  /** 최근 HISTORY_DAYS 거래일, 오래된 → 최신 */
  history: HistoryPoint[];
  priceSource: PriceSource;
  flags: MarketFlag[];
}

export interface RfgSnapshot {
  schemaVersion: 1;
  generatedAtUtc: string;
  expectedLatestTradingDate: IsoDate;
  holidays: readonly IsoDate[];
  params: RfgParams;
  disclaimerVersion: number;
  fgSource: 'cnn' | 'own-history';
  markets: Record<IndexSymbol, MarketBlock>;
}

/** 공개 1년 이력의 한 행. CNN 원값은 싣지 않는다(DESIGN §3.6) — RFG 와 P 만. 소수 2자리. */
export interface HistoryRow {
  date: IsoDate;
  rfg: number | null;
  p: number | null;
}

/** 최신 거래일의 가격 훼손 세부 지표. pdd·pdisp·prv 는 성분별 W 백분위(0~100, 클수록 훼손) */
export interface ComponentsBlock {
  date: IsoDate;
  dd: number | null;
  disp: number | null;
  rv: number | null;
  pdd: number | null;
  pdisp: number | null;
  prv: number | null;
}

/** GET /v1/history.json — 웹 화면의 1년 추이·비교·구성 요소 카드용 */
export interface RfgHistory {
  schemaVersion: 1;
  generatedAtUtc: string;
  markets: Record<IndexSymbol, { rows: HistoryRow[]; components: ComponentsBlock }>;
}
