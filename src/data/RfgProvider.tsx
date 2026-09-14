import React, { useMemo, type PropsWithChildren } from 'react';
import { config } from '../config';
import { createClient } from './createClient';
import { createFrameworkPlatform } from './platform.framework';
import { RfgDepsProvider, type RfgDeps } from './RfgContext';

/** 실제 앱 배선: config → 클라이언트(목/HTTP), 프레임워크 플랫폼. _app.tsx 에서만 쓴다. */
export function RfgProvider({ children }: PropsWithChildren) {
  const deps = useMemo<RfgDeps>(() => ({ client: createClient(config), platform: createFrameworkPlatform(), isMock: config.isMock }), []);
  return <RfgDepsProvider value={deps}>{children}</RfgDepsProvider>;
}
