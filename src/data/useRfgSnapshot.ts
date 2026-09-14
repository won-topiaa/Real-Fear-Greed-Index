import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { RfgSnapshot } from '../core/types';
import { readCachedSnapshot, writeCachedSnapshot } from './cache';
import { ClientError, type ClientErrorCode } from './client';
import { REFRESH } from './policy';
import { useRfgDeps } from './RfgContext';

export type DataErrorCode = ClientErrorCode | 'offline' | 'unknown';

export type DataState =
  | { status: 'loading'; cached?: RfgSnapshot }
  | { status: 'success'; data: RfgSnapshot; fromCache: boolean }
  | { status: 'error'; error: { code: DataErrorCode; message: string }; cached?: RfgSnapshot };

export interface UseRfgSnapshotResult {
  state: DataState;
  refresh: () => void;
  isRefreshing: boolean;
}

function toError(e: unknown): { code: DataErrorCode; message: string } {
  if (e instanceof ClientError) return { code: e.code, message: e.message };
  return { code: 'unknown', message: e instanceof Error ? e.message : 'unknown' };
}

/**
 * 상태 머신: 마운트 → 캐시(있으면 즉시 그림) → 요청 → 성공 시 캐시 갱신 / 실패 시 error+cached.
 * 포그라운드 복귀 시 REFRESH.minIntervalMs 가 지났으면 자동 갱신. 네트워크 실패를 목 데이터로 덮지 않는다.
 */
export function useRfgSnapshot(): UseRfgSnapshotResult {
  const { client, platform } = useRfgDeps();
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [isRefreshing, setRefreshing] = useState(false);
  const cachedRef = useRef<RfgSnapshot | undefined>(undefined);
  const lastSuccessRef = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;
    setRefreshing(true);
    try {
      const net = await platform.getNetworkStatus();
      if (net === 'OFFLINE') {
        if (mounted.current) setState({ status: 'error', error: { code: 'offline', message: 'offline' }, cached: cachedRef.current });
        return;
      }
      const data = await client.getSnapshot({ signal: ac.signal });
      if (ac.signal.aborted || !mounted.current) return;
      cachedRef.current = data;
      lastSuccessRef.current = platform.now();
      setState({ status: 'success', data, fromCache: false });
      await writeCachedSnapshot(platform.storage, data);
    } catch (e) {
      if (ac.signal.aborted || !mounted.current) return;
      setState({ status: 'error', error: toError(e), cached: cachedRef.current });
    } finally {
      if (mounted.current && inFlight.current === ac) setRefreshing(false);
    }
  }, [client, platform]);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const cached = await readCachedSnapshot(platform.storage);
      if (!mounted.current) return;
      if (cached) {
        cachedRef.current = cached;
        setState({ status: 'success', data: cached, fromCache: true });
      }
      await load();
    })();
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, [load, platform]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && platform.now() - lastSuccessRef.current >= REFRESH.minIntervalMs) void load();
    });
    return () => sub.remove();
  }, [load, platform]);

  return { state, refresh: () => void load(), isRefreshing };
}
