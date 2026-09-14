import { useEffect, useState } from 'react';
import type { RfgSnapshot } from '../core/types';
import { readCachedSnapshot } from './cache';
import { useRfgDeps } from './RfgContext';

/**
 * 캐시만 읽는 가벼운 훅(정보 화면용). 네트워크 요청·AppState 리스너를 만들지 않는다.
 * 홈이 성공할 때마다 캐시를 갱신하므로 정보 화면은 마지막 정상 스냅샷을 본다.
 */
export function useCachedSnapshot(): RfgSnapshot | null {
  const { platform } = useRfgDeps();
  const [snapshot, setSnapshot] = useState<RfgSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    readCachedSnapshot(platform.storage).then((s) => alive && setSnapshot(s));
    return () => {
      alive = false;
    };
  }, [platform]);
  return snapshot;
}
