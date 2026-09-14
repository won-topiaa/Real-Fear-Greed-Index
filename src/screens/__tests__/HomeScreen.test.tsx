import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { createMockClient } from '../../data/mockClient';
import { createMemoryPlatform, type Platform } from '../../data/platform';
import { RfgDepsProvider } from '../../data/RfgContext';
import type { RfgClient } from '../../data/client';
import { COPY, LABELS } from '../../text/copy';
import { HomeScreen } from '../HomeScreen';

const NOW = Date.parse('2026-09-12T00:00:00Z');

function renderHome(client: RfgClient, platform: Platform = createMemoryPlatform({ now: () => NOW }), isMock = false, onOpenAbout?: () => void) {
  return render(
    <RfgDepsProvider value={{ client, platform, isMock }}>
      <HomeScreen onOpenAbout={onOpenAbout} />
    </RfgDepsProvider>,
  );
}

describe('HomeScreen', () => {
  test('normal: 값·구간·기준일·면책이 보이고 배지는 없다', async () => {
    renderHome(createMockClient({ scenario: 'normal', now: () => NOW }));
    await waitFor(() => expect(screen.getByTestId('gauge-value')).toHaveTextContent('66'));
    expect(screen.getByTestId('gauge-zone')).toHaveTextContent(LABELS.rfgZone.MID);
    expect(screen.getByTestId('basis-line')).toHaveTextContent(/미국 9\/11\(금\) 마감 기준/);
    expect(screen.getByTestId('disclaimer')).toHaveTextContent(/투자 조언이 아니에요/);
    expect(screen.queryByTestId('badge')).toBeNull();
    expect(screen.getByTestId('frm-sentence')).toHaveTextContent(/전이 0\.38배/);
    expect(screen.getByTestId('cell-Q1')).toBeTruthy();
  });

  test('mock 모드: 샘플 데이터 배지가 항상 보인다', async () => {
    renderHome(createMockClient({ scenario: 'capitulation', now: () => NOW }), undefined, true);
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent(COPY.mockBadge));
    expect(screen.getByTestId('quadrant-label')).toHaveTextContent(LABELS.quadrant.Q1);
  });

  test('stale: 점수 대신 차단 문구', async () => {
    renderHome(createMockClient({ scenario: 'stale', now: () => NOW }));
    await waitFor(() => expect(screen.getByTestId('blocked-message')).toHaveTextContent(COPY.staleBlocked));
    expect(screen.queryByTestId('gauge')).toBeNull();
    expect(screen.getByTestId('detail-line')).toBeTruthy();
  });

  test('오류(캐시 없음): 오류 문구와 다시 시도 → 성공', async () => {
    const client = createMockClient({ scenario: 'normal', failTimes: 1, now: () => NOW });
    renderHome(client);
    await waitFor(() => expect(screen.getByText(COPY.errorNoCache)).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText(COPY.retry));
    });
    await waitFor(() => expect(screen.getByTestId('gauge-value')).toHaveTextContent('66'));
  });

  test('오프라인: 안내 문구', async () => {
    const platform = createMemoryPlatform({ now: () => NOW, getNetworkStatus: async () => 'OFFLINE' });
    renderHome(createMockClient({ scenario: 'normal', now: () => NOW }), platform);
    await waitFor(() => expect(screen.getByText(COPY.offline)).toBeTruthy());
  });

  test('지수 전환은 저장되고 NDX 블록을 그린다', async () => {
    const platform = createMemoryPlatform({ now: () => NOW });
    renderHome(createMockClient({ scenario: 'normal', now: () => NOW }), platform);
    await waitFor(() => expect(screen.getByTestId('gauge-value')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('index-NDX'));
    });
    await waitFor(async () => expect(await platform.storage.getItem('rfg.index')).toBe('NDX'));
  });

  test('정보 화면 링크', async () => {
    const onOpenAbout = jest.fn();
    renderHome(createMockClient({ scenario: 'normal', now: () => NOW }), undefined, false, onOpenAbout);
    await waitFor(() => expect(screen.getByTestId('gauge-value')).toBeTruthy());
    fireEvent.press(screen.getByText(`${COPY.aboutLink} ›`));
    expect(onOpenAbout).toHaveBeenCalled();
  });
});
