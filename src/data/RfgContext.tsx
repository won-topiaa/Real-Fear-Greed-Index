import React, { createContext, useContext, type PropsWithChildren } from 'react';
import type { RfgClient } from './client';
import type { Platform } from './platform';

export interface RfgDeps {
  client: RfgClient;
  platform: Platform;
  isMock: boolean;
}

const RfgDepsContext = createContext<RfgDeps | null>(null);

/** 테스트·목에서 의존성을 주입하는 자리. 실제 앱은 RfgProvider(프레임워크 연결)를 쓴다. */
export function RfgDepsProvider({ value, children }: PropsWithChildren<{ value: RfgDeps }>) {
  return <RfgDepsContext.Provider value={value}>{children}</RfgDepsContext.Provider>;
}

export function useRfgDeps(): RfgDeps {
  const deps = useContext(RfgDepsContext);
  if (!deps) throw new Error('RfgDepsProvider 가 없습니다. _app.tsx 의 RfgProvider 로 감싸세요.');
  return deps;
}
