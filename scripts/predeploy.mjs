// `npm run deploy` 전에 자동 실행(npm predeploy 훅). 교훈 §6 "원격 세션에서 배포하면 목 앱이 올라간다" 를 코드로 막는다.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const doctor = spawnSync(process.execPath, [join(root, 'scripts/doctor.mjs')], { encoding: 'utf8' });
process.stdout.write(doctor.stdout);
if (doctor.status !== 0) fail('doctor 실패');

const local = existsSync(join(root, 'src/config.local.ts')) ? readFileSync(join(root, 'src/config.local.ts'), 'utf8') : '';
const apiBaseUrl = /apiBaseUrl:\s*['"]([^'"]*)['"]/.exec(local)?.[1] ?? '';
if (!apiBaseUrl) fail('src/config.local.ts 의 apiBaseUrl 이 비어 있음 → 목 데이터 앱이 배포됨');
if (!/^https:\/\//.test(apiBaseUrl)) fail('apiBaseUrl 은 https:// 로 시작해야 함');
if (/\/$/.test(apiBaseUrl)) fail('apiBaseUrl 은 / 로 끝나지 않아야 함');

const cfg = readFileSync(join(root, 'granite.config.ts'), 'utf8');
const icon = /icon:\s*['"]([^'"]*)['"]/.exec(cfg)?.[1] ?? '';
if (!/^https:\/\//.test(icon)) fail('granite.config.ts 의 brand.icon 이 https:// URL 이 아님');

// 원격/자동화 세션 지표. Claude Code 는 CLAUDECODE / CLAUDE_CODE_* 를 쓴다(실측).
const remoteMarkers = Object.keys(process.env).filter(
  (k) => ['CI', 'CODESPACES', 'SSH_CONNECTION', 'GITHUB_ACTIONS', 'CLAUDECODE'].includes(k) || k.startsWith('CLAUDE_CODE'),
);
if (remoteMarkers.length && !process.env.ALLOW_REMOTE_DEPLOY) {
  fail(`원격 환경 지표(${remoteMarkers.join(', ')}) — 배포는 키 있는 로컬 기계에서. 정말 원하면 ALLOW_REMOTE_DEPLOY=1`);
}

const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
if (status.status === 0 && status.stdout.trim()) console.warn('! 작업 트리가 dirty 함 — 커밋되지 않은 변경이 배포됨');

try {
  const cred = join(homedir(), '.ait', 'credentials');
  if (existsSync(cred)) {
    const profiles = readdirSync(dirname(cred)).length;
    const text = readFileSync(cred, 'utf8');
    const count = (text.match(/^\[/gm) ?? []).length;
    if (count > 1) console.warn(`! ~/.ait/credentials 에 프로필이 ${count}개 — 옛 키가 조용히 쓰일 수 있음. --profile 을 명시하거나 npx ait token remove`);
    void profiles;
  }
} catch {
  /* ignore */
}

console.log('✓ predeploy 통과');
