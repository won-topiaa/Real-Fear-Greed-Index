/**
 * 앱인토스 프레임워크 의존을 인터페이스 뒤에 숨긴다. 이 파일은 프레임워크를 import 하지 않는다(테스트·목 경로).
 * 실기기 구현은 platform.framework.ts 에 있고 RfgProvider 만 그것을 import 한다.
 */
export type NetworkStatus = 'OFFLINE' | 'WIFI' | '2G' | '3G' | '4G' | '5G' | 'WWAN' | 'UNKNOWN';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface Platform {
  storage: KeyValueStorage;
  getNetworkStatus(): Promise<NetworkStatus>;
  getOperationalEnvironment(): 'toss' | 'sandbox' | 'unknown';
  now(): number;
}

export function createMemoryPlatform(overrides: Partial<Platform> & { initial?: Record<string, string> } = {}): Platform {
  const map = new Map<string, string>(Object.entries(overrides.initial ?? {}));
  const { initial: _initial, ...rest } = overrides;
  return {
    storage: {
      getItem: async (k) => map.get(k) ?? null,
      setItem: async (k, v) => void map.set(k, v),
      removeItem: async (k) => void map.delete(k),
    },
    getNetworkStatus: async () => 'WIFI',
    getOperationalEnvironment: () => 'sandbox',
    now: () => Date.now(),
    ...rest,
  };
}
