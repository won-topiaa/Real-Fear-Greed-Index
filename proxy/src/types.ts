import type { IndexSymbol, IsoDate, PricePoint, PriceSource, ValidationIssue } from '../../src/core/types';

export type SourceId = PriceSource | 'cnn';
export type SourceStatus = 'ok' | 'failed' | 'disabled' | 'date_lag' | 'invalid';

export interface SourceReport {
  id: SourceId;
  symbol?: IndexSymbol;
  status: SourceStatus;
  fetchedAtUtc: string | null;
  /** 소스가 제공한 최신 거래일 */
  asOf: IsoDate | null;
  /** 값이 아닌 분류 문자열. 비밀값·URL 쿼리는 넣지 않는다. */
  error: string | null;
  issues?: ValidationIssue[];
}

export interface Env {
  FRED_API_KEY: string;
  CNN_USER_AGENT: string;
  HEALTHCHECKS_PING_URL: string;
  PORT: number;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface Ctx {
  fetchImpl: typeof fetch;
  env: Env;
  nowUtcMs: number;
  log: Logger;
  timeoutMs: number;
  /** 네트워크 재시도 횟수(테스트에서 0) */
  retries: number;
}

/** 종가 소스 어댑터. fetch(URL·헤더) → parse(형태) → normalize(공통 타입). 검증은 price.ts 가 core 로 한다. */
export interface PriceAdapter {
  id: PriceSource;
  isEnabled(env: Env): boolean;
  url(symbol: IndexSymbol, env: Env, nowUtcMs: number): string;
  headers(env: Env): Record<string, string>;
  parse(text: string): unknown;
  normalize(parsed: unknown): PricePoint[];
}
