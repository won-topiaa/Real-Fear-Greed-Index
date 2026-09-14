import type { AppConfig } from '../config';
import type { CreateClientDeps, RfgClient } from './client';
import { createHttpClient } from './httpClient';
import { createMockClient } from './mockClient';

/** isMock 이면 목, 아니면 HTTP. 네트워크 실패 시 목으로 떨어지는 경로는 없다. */
export function createClient(config: AppConfig, deps: CreateClientDeps = {}): RfgClient {
  if (config.isMock) return createMockClient({ scenario: config.mockScenario, now: deps.now });
  return createHttpClient({ baseUrl: config.apiBaseUrl, timeoutMs: config.requestTimeoutMs, fetchImpl: deps.fetchImpl });
}
