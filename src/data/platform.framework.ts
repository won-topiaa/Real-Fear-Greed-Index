/**
 * 실기기 플랫폼. Storage / getNetworkStatus / getOperationalEnvironment 는 설치본 d.ts 로 확인한 API 다.
 * 정적 import 만 쓴다 — 함수 안의 require 는 esbuild 가 프레임워크 CJS 빌드를 중복으로 번들에 넣는다.
 */
import { Storage, getNetworkStatus, getOperationalEnvironment } from '@apps-in-toss/framework';
import type { NetworkStatus, Platform } from './platform';

export function createFrameworkPlatform(): Platform {
  return {
    storage: {
      getItem: async (k) => {
        try {
          const v: unknown = await Storage.getItem(k);
          return typeof v === 'string' ? v : null;
        } catch {
          return null;
        }
      },
      setItem: async (k, v) => {
        try {
          await Storage.setItem(k, v);
        } catch {
          /* 저장 실패는 치명적이지 않다 */
        }
      },
      removeItem: async (k) => {
        try {
          await Storage.removeItem(k);
        } catch {
          /* ignore */
        }
      },
    },
    getNetworkStatus: async () => {
      try {
        return (await getNetworkStatus()) as NetworkStatus;
      } catch {
        return 'UNKNOWN';
      }
    },
    getOperationalEnvironment: () => {
      try {
        const v: string = getOperationalEnvironment();
        return v === 'toss' || v === 'sandbox' ? v : 'unknown';
      } catch {
        return 'unknown';
      }
    },
    now: () => Date.now(),
  };
}
