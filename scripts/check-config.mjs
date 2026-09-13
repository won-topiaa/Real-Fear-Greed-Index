// 비밀값을 화면에 찍지 않고 "채워졌는지"와 글자 수만 보여준다. 캡처해서 공유해도 안전하다.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function report(label, value) {
  const len = (value ?? '').trim().length;
  console.log(`${label.padEnd(28)} ${len > 0 ? `채워짐 (${len}자)` : '비어 있음'}`);
}

function extract(source, key) {
  const match = source.match(new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]*)['"\`]`));
  return match ? match[1] : '';
}

const appConfigPath = join(root, 'src', 'config.local.ts');
console.log('== 앱 (src/config.local.ts) ==');
if (!existsSync(appConfigPath)) {
  console.log('파일 없음 → npm install 을 다시 실행하면 예시 파일이 복사돼요.');
} else {
  const src = readFileSync(appConfigPath, 'utf8');
  report('apiBaseUrl', extract(src, 'apiBaseUrl'));
  report('appToken', extract(src, 'appToken'));
  console.log(`모드: ${extract(src, 'apiBaseUrl').trim() ? '실데이터(프록시)' : '목 데이터 — 이 상태로 배포하면 안 돼요'}`);
}

const envPath = join(root, 'proxy', '.env');
console.log('\n== 프록시 (proxy/.env) ==');
if (!existsSync(envPath)) {
  console.log('파일 없음 → proxy/.env.example 을 복사해 만드세요.');
} else {
  const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      }),
  );
  for (const key of Object.keys(env).sort()) {
    report(key, env[key]);
  }
}
