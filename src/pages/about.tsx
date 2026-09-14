import { env } from '@apps-in-toss/framework';
import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { AboutScreen } from '../screens/AboutScreen';

export const Route = createRoute('/about', {
  component: AboutPage,
});

function readAppInfo(): { appName: string; deploymentId: string } | undefined {
  try {
    // 타입은 string 이지만 런타임에서 undefined 일 수 있다(global.__appsInToss?.deploymentId)
    return { appName: String(env.getAppName() ?? ''), deploymentId: String(env.getDeploymentId() ?? '') };
  } catch {
    return undefined;
  }
}

function AboutPage() {
  return <AboutScreen appInfo={readAppInfo()} />;
}
