import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { createMockClient } from '../../data/mockClient';
import { createMemoryPlatform } from '../../data/platform';
import { RfgDepsProvider } from '../../data/RfgContext';
import { COPY, DISCLAIMER } from '../../text/copy';
import { AboutScreen } from '../AboutScreen';

const NOW = Date.parse('2026-09-12T00:00:00Z');

test('AboutScreen: 면책 전문·상수 보간 문구·임계값 표·앱 정보', async () => {
  render(
    <RfgDepsProvider value={{ client: createMockClient({ scenario: 'normal', now: () => NOW }), platform: createMemoryPlatform({ now: () => NOW }), isMock: true }}>
      <AboutScreen appInfo={{ appName: 'real-fear-greed-index', deploymentId: 'dep-1' }} />
    </RfgDepsProvider>,
  );
  expect(screen.getByTestId('disclaimer-full')).toHaveTextContent(DISCLAIMER.full);
  expect(screen.getByText(`· ${COPY.describeIndicators().dd}`)).toBeTruthy();
  for (const row of COPY.thresholdTable()) expect(screen.getByText(row.rule)).toBeTruthy();
  expect(screen.getByText('real-fear-greed-index · dep-1')).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId('generated-at')).toHaveTextContent(/2026-09-12 09:00/));
  expect(screen.queryByTestId('params-differ')).toBeNull();
});
