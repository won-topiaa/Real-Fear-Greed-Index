import { AppsInToss } from '@apps-in-toss/framework';
import type { InitialProps } from '@granite-js/react-native';
import React, { type PropsWithChildren } from 'react';
import { context } from '../require.context';
import { RfgProvider } from './data/RfgProvider';

/**
 * 앱 컨테이너. Router 아래에 마운트되므로 여기의 ErrorBoundary는 Router 자체의 예외(예: _404 누락)는 잡지 못한다.
 * 그래서 `src/pages/_404.tsx`는 화면이 하나도 없어도 반드시 존재해야 한다.
 * registerApp 이 이미 TDSProvider(light, primary=brand) 로 감싸므로 Provider 를 추가하지 않는다.
 */
function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return <RfgProvider>{children}</RfgProvider>;
}

export default AppsInToss.registerApp(AppContainer, { context });
