import { expectedLatestTradingDate, isIsoDate, tradingDaysBetween } from './calendar';
import { DATA_GATES, type DataGates } from './constants';
import type { IndexSymbol, IsoDate, RfgSnapshot } from './types';

export type Freshness = 'fresh' | 'delayed' | 'stale' | 'unknown';

export interface FreshnessAssessment {
  level: Freshness;
  /** 기대 최신 거래일 대비 몇 거래일 뒤졌는가(0 이상) */
  tradingDaysBehind: number;
  expected: IsoDate;
}

/**
 * 거래일 기준 신선도(DESIGN §3.5). 벽시계 시간이 아니라 기대 최신 거래일과의 거래일 차이로 판정한다.
 * 스냅샷의 expectedLatestTradingDate 를 우선 쓰고, 스냅샷 자체가 오래됐을 때만 기기 시각으로 다시 계산한다.
 */
export function assessFreshness(
  snapshot: RfgSnapshot,
  symbol: IndexSymbol,
  nowUtcMs: number,
  gates: DataGates = DATA_GATES,
): FreshnessAssessment {
  const market = snapshot.markets[symbol];
  const generatedMs = Date.parse(snapshot.generatedAtUtc);
  let expected = snapshot.expectedLatestTradingDate;
  if (!Number.isFinite(generatedMs) || nowUtcMs - generatedMs > gates.SNAPSHOT_SELF_CLOCK_AFTER_HOURS * 3_600_000) {
    expected = expectedLatestTradingDate(nowUtcMs, snapshot.holidays);
  }
  if (!isIsoDate(expected) || !isIsoDate(market.closeDate)) {
    return { level: 'unknown', tradingDaysBehind: 0, expected };
  }
  const behind = Math.max(0, tradingDaysBetween(market.closeDate, expected, snapshot.holidays));
  const level: Freshness = behind === 0 ? 'fresh' : behind <= gates.STALE_AFTER_TRADING_DAYS ? 'delayed' : 'stale';
  return { level, tradingDaysBehind: behind, expected };
}
