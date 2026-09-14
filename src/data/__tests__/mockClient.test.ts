import { classify } from '../../core/classify';
import { assessFreshness } from '../../core/freshness';
import { createMockClient, loadMockSnapshot, MOCK_SCENARIOS } from '../mockClient';

const NOW = Date.parse('2026-09-12T00:00:00Z');

describe('mockClient — 픽스처는 core 가 생성한 스냅샷이며 의도한 국면을 만든다', () => {
  test.each([
    ['normal', 'NEUTRAL', 'MID', 'fresh'],
    ['capitulation', 'Q1', 'CAPITULATION', 'fresh'],
    ['bear_trap', 'Q4', 'MID', 'fresh'],
    ['complacency', 'Q2', 'MID', 'fresh'],
    ['euphoria', 'Q3', 'EUPHORIA', 'fresh'],
    ['healthy_bull', 'Q3', 'MID', 'fresh'],
    ['delayed', 'NEUTRAL', 'MID', 'delayed'],
    ['stale', 'NEUTRAL', 'MID', 'stale'],
    ['fg_missing', 'UNKNOWN', 'UNKNOWN', 'fresh'],
  ] as const)('%s → %s / %s / %s', (scenario, quadrant, zone, freshness) => {
    const s = loadMockSnapshot(scenario, NOW);
    const c = classify(s.markets.SPX.latest);
    expect(c.quadrant).toBe(quadrant);
    expect(c.rfgZone).toBe(zone);
    expect(assessFreshness(s, 'SPX', NOW).level).toBe(freshness);
    expect('close' in s.markets.SPX.latest).toBe(false);
  });

  test('시나리오 목록은 9개', () => {
    expect(MOCK_SCENARIOS).toHaveLength(9);
  });

  test('failTimes 만큼 network 오류 후 성공, generatedAtUtc 는 현재 시각', async () => {
    const client = createMockClient({ scenario: 'normal', failTimes: 2, now: () => NOW });
    await expect(client.getSnapshot()).rejects.toMatchObject({ code: 'network' });
    await expect(client.getSnapshot()).rejects.toMatchObject({ code: 'network' });
    const s = await client.getSnapshot();
    expect(s.generatedAtUtc).toBe(new Date(NOW).toISOString());
    expect(client.kind).toBe('mock');
  });
});
