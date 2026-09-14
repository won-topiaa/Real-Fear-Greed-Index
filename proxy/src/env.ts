import { readFileSync } from 'node:fs';
import type { Env } from './types';

export const DEFAULT_ENV: Env = {
  FRED_API_KEY: '',
  CNN_USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  HEALTHCHECKS_PING_URL: '',
  PORT: 8787,
};

/** 최소 .env 파서. 따옴표·주석·빈 줄 처리. 의존성 없음. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** process.env → .env 파일 → 기본값 순으로 채운다. 값을 로그에 찍지 않는다. */
export function loadEnv(opts: { envFilePath?: string; processEnv?: NodeJS.ProcessEnv; overrides?: Partial<Env> } = {}): Env {
  const processEnv = opts.processEnv ?? process.env;
  let file: Record<string, string> = {};
  if (opts.envFilePath) {
    try {
      file = parseDotEnv(readFileSync(opts.envFilePath, 'utf8'));
    } catch {
      file = {};
    }
  }
  const pick = (key: keyof Env): string | undefined => processEnv[key] ?? file[key];
  const env: Env = {
    FRED_API_KEY: pick('FRED_API_KEY') ?? DEFAULT_ENV.FRED_API_KEY,
    CNN_USER_AGENT: pick('CNN_USER_AGENT') || DEFAULT_ENV.CNN_USER_AGENT,
    HEALTHCHECKS_PING_URL: pick('HEALTHCHECKS_PING_URL') ?? DEFAULT_ENV.HEALTHCHECKS_PING_URL,
    PORT: Number(pick('PORT') ?? DEFAULT_ENV.PORT) || DEFAULT_ENV.PORT,
  };
  return { ...env, ...opts.overrides };
}
