/** 앱이 소비하는 게시 계약(DESIGN §7.1). 타입과 검증기는 core 에 있고 여기서는 경로만 더한다. */
export type { HistoryPoint, IndexSymbol, MarketBlock, MarketFlag, RfgSnapshot } from '../core/types';
export { parseSnapshot } from '../core/snapshot';

export const SNAPSHOT_PATH = '/v1/snapshot.json';
export const STATUS_PATH = '/v1/status.json';
