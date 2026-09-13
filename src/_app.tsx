import { AppsInToss } from '@apps-in-toss/framework';
import type { InitialProps } from '@granite-js/react-native';
import React, { type PropsWithChildren } from 'react';
import { context } from '../require.context';

/**
 * 앱 컨테이너. Router 아래에 마운트되므로 여기의 ErrorBoundary는 Router 자체의 예외(예: _404 누락)는 잡지 못한다.
 * 그래서 `src/pages/_404.tsx`는 화면이 하나도 없어도 반드시 존재해야 한다.
 */
function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return <>{children}</>;
}

export default AppsInToss.registerApp(AppContainer, { context });
