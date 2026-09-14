import type { RfgSnapshot } from '../core/types';

export type ClientErrorCode = 'timeout' | 'network' | 'http' | 'schema' | 'outdated';

export class ClientError extends Error {
  constructor(
    public readonly code: ClientErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

export interface RfgClient {
  readonly kind: 'http' | 'mock';
  getSnapshot(opts?: { signal?: AbortSignal }): Promise<RfgSnapshot>;
}

export interface CreateClientDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}
