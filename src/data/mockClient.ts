/**
 * 목 프로바이더. apiBaseUrl 이 비어 있을 때만 쓰인다(config.isMock). 네트워크 실패의 폴백이 아니다.
 * 픽스처는 proxy `npm run build-fixtures` 가 core 로 생성한 스냅샷이며 손으로 편집하지 않는다.
 */
import type { MockScenario } from '../config';
import { parseSnapshot } from '../core/snapshot';
import type { RfgSnapshot } from '../core/types';
import { ClientError, type RfgClient } from './client';
import bearTrap from './fixtures/bear_trap.json';
import capitulation from './fixtures/capitulation.json';
import complacency from './fixtures/complacency.json';
import delayed from './fixtures/delayed.json';
import euphoria from './fixtures/euphoria.json';
import fgMissing from './fixtures/fg_missing.json';
import healthyBull from './fixtures/healthy_bull.json';
import normal from './fixtures/normal.json';
import stale from './fixtures/stale.json';

const FIXTURES: Record<MockScenario, unknown> = {
  normal,
  capitulation,
  bear_trap: bearTrap,
  complacency,
  euphoria,
  healthy_bull: healthyBull,
  delayed,
  stale,
  fg_missing: fgMissing,
};

export const MOCK_SCENARIOS = Object.keys(FIXTURES) as MockScenario[];

export interface MockClientOptions {
  scenario?: MockScenario;
  /** 응답 지연(ms). 로딩 상태 확인용. */
  delayMs?: number;
  /** 처음 N 번은 네트워크 오류로 실패시킨다. 오류 상태 확인용. */
  failTimes?: number;
  now?: () => number;
}

/** 픽스처를 파싱해 돌려준다. generatedAtUtc 만 현재 시각으로 바꿔 앱이 스냅샷의 기대 거래일을 믿게 한다(시나리오별 신선도 재현). */
export function loadMockSnapshot(scenario: MockScenario, nowUtcMs: number): RfgSnapshot {
  const raw = FIXTURES[scenario];
  const parsed = parseSnapshot(raw);
  if (!parsed.ok) throw new Error(`[mock] fixture ${scenario} invalid at ${parsed.error.path} (${parsed.error.code}) — run proxy build-fixtures`);
  return { ...parsed.value, generatedAtUtc: new Date(nowUtcMs).toISOString() };
}

export function createMockClient(o: MockClientOptions = {}): RfgClient {
  const scenario = o.scenario ?? 'normal';
  const now = o.now ?? Date.now;
  let failures = o.failTimes ?? 0;
  return {
    kind: 'mock',
    async getSnapshot() {
      if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
      if (failures > 0) {
        failures--;
        throw new ClientError('network', 'mock failure');
      }
      return loadMockSnapshot(scenario, now());
    },
  };
}
