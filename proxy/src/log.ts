import type { Logger } from './types';

const PATTERNS: Array<[RegExp, string]> = [
  [/(api_key=)[^&\s"']+/gi, '$1***'],
  [/(token=)[^&\s"']+/gi, '$1***'],
  [/(Bearer\s+)[^\s"']+/g, '$1***'],
  [/(hc-ping\.com\/)[^\s"'/]+/g, '$1***'],
];

/** 로그에 비밀값이 새지 않도록 URL 쿼리·헤더 값을 가린다. 테스트로 고정. */
export function maskSecrets(s: string): string {
  return PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
}

export function createLogger(prefix = 'rfg'): Logger {
  const line = (level: string, msg: string) => `${new Date().toISOString()} ${level} [${prefix}] ${maskSecrets(msg)}`;
  return {
    info: (m) => console.log(line('info', m)),
    warn: (m) => console.warn(line('warn', m)),
    error: (m) => console.error(line('error', m)),
  };
}

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

/** 테스트용: 메시지를 모으는 로거 */
export function collectingLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => void lines.push(`info ${maskSecrets(m)}`),
    warn: (m) => void lines.push(`warn ${maskSecrets(m)}`),
    error: (m) => void lines.push(`error ${maskSecrets(m)}`),
  };
}
