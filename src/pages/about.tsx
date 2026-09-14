import { env } from '@apps-in-toss/framework';
import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { AboutScreen } from '../screens/AboutScreen';

export const Route = createRoute('/about', {
  component: AboutPage,
});

function readAppInfo(): { appName: string; deploymentId: string } | undefined {
  try {
    return { appName: env.getAppName(), deploymentId: env.getDeploymentId() };
  } catch {
    return undefined;
  }
}

function AboutPage() {
  return <AboutScreen appInfo={readAppInfo()} />;
}
