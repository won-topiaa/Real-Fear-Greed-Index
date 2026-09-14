import type { IndexSymbol } from '../core/types';

/** 요청 정책. 네트워크·타임아웃·5xx 만 재시도한다. 4xx 는 즉시 실패. */
export const RETRY = { attempts: 2, backoffMs: [800, 2400] as readonly number[] } as const;

/** 포그라운드 복귀 시 마지막 성공에서 이만큼 지났으면 자동 갱신 */
export const REFRESH = { minIntervalMs: 10 * 60_000 } as const;

export const CACHE_KEYS = { snapshot: 'rfg.snapshot.v1', index: 'rfg.index' } as const;

export const DEFAULT_INDEX: IndexSymbol = 'SPX';
