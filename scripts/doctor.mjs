// 앱인토스 새 앱 체크리스트를 코드로 검사한다. 반나절짜리 흰 화면을 10초에 잡기 위한 스크립트.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const warnings = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  problems.push(msg);
  console.log(`  ✗ ${msg}`);
};
const warn = (msg) => {
  warnings.push(msg);
  console.log(`  ! ${msg}`);
};

const mustExist = [
  ['index.ts', 'dev 서버가 Error: Can\'t resolve \'./index\' 로 멈춤'],
  ['src/pages/_404.tsx', '흰 화면 — granite 라우터가 /_404 없으면 첫 렌더에서 throw'],
  ['pages/_404.tsx', 'require.context(\'./pages\')가 /_404 를 못 찾음'],
  ['babel.config.js', 'babel-preset-granite 미적용'],
  ['react-native.config.js', 'reactNativePath 미지정'],
  ['require.context.ts', '화면 목록을 못 만듦'],
  ['src/_app.tsx', 'AppsInToss.registerApp 진입점 없음'],
];
console.log('파일 존재');
for (const [file, why] of mustExist) {
  existsSync(join(root, file)) ? ok(file) : bad(`${file} 없음 → ${why}`);
}

console.log('버전');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const pinned = { 'react-native': '0.84.0', react: '19.2.3', '@types/react': '19.2.3' };
for (const [name, want] of Object.entries(pinned)) {
  deps[name] === want ? ok(`${name} ${want}`) : bad(`${name} 는 ${want} 이어야 함 (현재 ${deps[name] ?? '없음'})`);
}
const granite = Object.entries(deps).filter(([n]) => n.startsWith('@granite-js/') || n === 'babel-preset-granite');
const graniteVersions = new Set(granite.map(([, v]) => v));
if (graniteVersions.size === 1) {
  ok(`@granite-js/* 단일 버전 ${[...graniteVersions][0]}`);
} else {
  bad(`@granite-js/* 버전이 섞여 있음: ${[...graniteVersions].join(', ')}`);
}
if (granite.some(([, v]) => v === '1.0.18')) {
  bad('@granite-js/* 가 1.0.18 — ait migrate 가 내린 값. 최신으로 되돌릴 것 (useKeyboardHeight 없음)');
}
pkg.scripts?.build === 'ait build' ? ok('scripts.build = ait build') : bad('scripts.build 가 ait build 가 아님 → .ait 산출물이 안 만들어짐');

console.log('granite.config.ts');
const cfg = readFileSync(join(root, 'granite.config.ts'), 'utf8');
/^\s*target\s*:/m.test(cfg) ? bad('target 이 적혀 있음 → 0.84 번들까지 0.72 변환을 받아 두 번들이 같아짐') : ok('target 없음');
const iconMatch = /icon:\s*['"]([^'"]*)['"]/.exec(cfg);
const icon = iconMatch ? iconMatch[1] : '';
if (/^\.{0,2}\//.test(icon)) bad('brand.icon 이 파일 경로 — 이미지 URL 이어야 함');
else if (icon === '') warn('brand.icon 이 비어 있음 — 배포 전 https:// URL 로 채울 것 (predeploy 에서는 실패)');
else if (!/^https:\/\//.test(icon)) bad('brand.icon 은 https:// URL 이어야 함');
else ok('brand.icon URL');
/scheme:\s*['"]intoss['"]/.test(cfg) ? ok('scheme = intoss') : bad('scheme 이 intoss 가 아님');
/permissions:\s*\[\s*\]/.test(cfg) ? ok('permissions: [] (위치·연락처·사진 미사용 선언)') : warn('permissions 가 비어 있지 않음 — 심사 선언과 실제 사용이 일치하는지 확인');

console.log('권한·광고 미사용 선언과 소스 일치');
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const appSources = walk(join(root, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
const forbiddenSymbols = ['useGeolocation', 'getCurrentLocation', 'fetchContacts', 'getClipboardText', 'InlineAd', 'loadFullScreenAd', 'showFullScreenAd', 'Analytics'];
const used = forbiddenSymbols.filter((s) => new RegExp(`\\b${s}\\b`).test(appSources));
used.length === 0 ? ok('위치·연락처·클립보드·광고·분석 심볼 미사용') : bad(`선언과 다른 심볼 사용: ${used.join(', ')}`);

console.log('비밀값');
const gi = readFileSync(join(root, '.gitignore'), 'utf8');
for (const f of ['src/config.local.ts', 'proxy/.env']) {
  gi.split('\n').some((l) => l.trim() === f) ? ok(`${f} gitignore됨`) : bad(`${f} 가 .gitignore 에 없음`);
}
const tracked = spawnSync('git', ['ls-files', 'src/config.local.ts', 'proxy/.env'], { cwd: root, encoding: 'utf8' });
if (tracked.status === 0) {
  tracked.stdout.trim() === '' ? ok('비밀 파일이 git 에 추적되지 않음') : bad(`비밀 파일이 git 에 추적됨: ${tracked.stdout.trim().replace(/\n/g, ', ')}`);
}

console.log('상수 정합성');
try {
  const constants = readFileSync(join(root, 'src/core/constants.ts'), 'utf8');
  const num = (key) => Number(/\b${key}\b/.source && new RegExp(`${key}:\\s*([\\d.]+)`).exec(constants)?.[1]);
  const N = num('DD_WINDOW_N'), M = num('SMA_WINDOW_M'), K = num('RV_WINDOW_K'), W = num('PERCENTILE_WINDOW_W');
  const H = num('HISTORY_DAYS'), MIN = num('MIN_CLOSES'), MINS = num('MIN_CLOSES_FOR_SNAPSHOT');
  const expectMin = Math.max(N, M, K + 1) + W - 1;
  MIN === expectMin ? ok(`MIN_CLOSES ${MIN} = max(N,M,K+1)+W−1`) : bad(`MIN_CLOSES ${MIN} ≠ ${expectMin}`);
  MINS === expectMin + H - 1 ? ok(`MIN_CLOSES_FOR_SNAPSHOT ${MINS}`) : bad(`MIN_CLOSES_FOR_SNAPSHOT ${MINS} ≠ ${expectMin + H - 1}`);
} catch (e) {
  bad(`constants.ts 를 읽지 못함: ${e.message}`);
}

console.log('휴장일 목록');
try {
  const cal = readFileSync(join(root, 'src/core/calendar.ts'), 'utf8');
  const now = new Date();
  const nextYear = now.getUTCFullYear() + (now.getUTCMonth() >= 10 ? 1 : 0);
  const years = new Set([...cal.matchAll(/'(\d{4})-\d{2}-\d{2}'/g)].map((m) => Number(m[1])));
  years.has(now.getUTCFullYear()) ? ok(`NYSE_HOLIDAYS ${now.getUTCFullYear()} 있음`) : bad(`NYSE_HOLIDAYS 에 ${now.getUTCFullYear()} 없음`);
  if (nextYear !== now.getUTCFullYear()) years.has(nextYear) ? ok(`NYSE_HOLIDAYS ${nextYear} 있음`) : warn(`11월 이후: NYSE_HOLIDAYS 에 ${nextYear} 목록을 추가할 것`);
} catch (e) {
  bad(`calendar.ts 를 읽지 못함: ${e.message}`);
}

console.log('계약(골든 스냅샷)');
const goldenPath = join(root, 'proxy/test/golden/snapshot.json');
if (existsSync(goldenPath)) {
  try {
    const g = JSON.parse(readFileSync(goldenPath, 'utf8'));
    const copy = readFileSync(join(root, 'src/text/copy.ts'), 'utf8');
    const dv = Number(/version:\s*(\d+)/.exec(copy)?.[1]);
    g.disclaimerVersion === dv ? ok(`disclaimerVersion ${dv} 일치`) : bad(`골든 disclaimerVersion ${g.disclaimerVersion} ≠ copy.ts ${dv} — proxy build-fixtures 재실행`);
    g.schemaVersion === 1 ? ok('골든 schemaVersion 1') : bad('골든 schemaVersion 이 1 이 아님');
    const constants = readFileSync(join(root, 'src/core/constants.ts'), 'utf8');
    const paramsBlock = /export const RFG_PARAMS = \{([\s\S]*?)\} as const;/.exec(constants)?.[1] ?? '';
    const appParams = Object.fromEntries([...paramsBlock.matchAll(/^\s*([A-Z0-9_]+):\s*([\d.e-]+),/gm)].map((m) => [m[1], Number(m[2])]));
    const diff = Object.keys(appParams).filter((k) => g.params?.[k] !== appParams[k]);
    diff.length === 0 && Object.keys(appParams).length > 0 ? ok('골든 params == RFG_PARAMS') : bad(`골든 params 가 RFG_PARAMS 와 다름: ${diff.join(', ') || '파싱 실패'} — proxy build-fixtures 재실행`);
  } catch (e) {
    bad(`골든 스냅샷 파싱 실패: ${e.message}`);
  }
} else {
  warn('proxy/test/golden/snapshot.json 없음 — cd proxy && npm run build-fixtures');
}

console.log('빌드 산출물(있으면)');
const aitFiles = readdirSync(root).filter((f) => f.endsWith('.ait'));
if (aitFiles.length === 0) {
  ok('.ait 없음(검사 생략)');
} else {
  try {
    // 의존성 없는 ZIP 중앙 디렉터리 읽기(.ait 는 zip). 파일명 → 압축 전 크기.
    const buf = readFileSync(join(root, aitFiles[0]));
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('EOCD 를 찾지 못함');
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    // 앞에 여분 바이트가 붙은 zip 은 중앙 디렉터리 오프셋이 어긋날 수 있어 시그니처를 다시 찾는다.
    if (buf.readUInt32LE(off) !== 0x02014b50) off = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const sizes = {};
    for (let n = 0; n < count && off >= 0 && off + 46 <= buf.length; n++) {
      if (buf.readUInt32LE(off) !== 0x02014b50) break;
      const size = buf.readUInt32LE(off + 24);
      const nameLen = buf.readUInt16LE(off + 28);
      const extraLen = buf.readUInt16LE(off + 30);
      const commentLen = buf.readUInt16LE(off + 32);
      const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
      sizes[name] = size;
      off += 46 + nameLen + extraLen + commentLen;
    }
    const ios84 = sizes['bundle.ios.0_84_0.js'];
    const ios72 = sizes['bundle.ios.0_72_6.js'];
    if (ios84 && ios72 && ios84 !== ios72) ok(`${aitFiles[0]}: 두 런타임 번들 크기가 다름 (0.84 ${ios84} / 0.72 ${ios72})`);
    else bad(`${aitFiles[0]}: 두 런타임 번들이 같거나 없음 — granite.config.ts 의 target 오염 의심`);
  } catch (e) {
    warn(`.ait 검사 실패: ${e.message}`);
  }
}

console.log('라우트 동기화');
const routes = spawnSync(process.execPath, [join(root, 'scripts/check-routes.mjs')], { encoding: 'utf8' });
process.stdout.write(routes.stdout);
if (routes.status !== 0) problems.push('check-routes 실패');

console.log('순수 모듈·문구 규칙');
const pure = spawnSync(process.execPath, [join(root, 'scripts/check-pure-modules.mjs')], { encoding: 'utf8' });
process.stdout.write(pure.stdout);
if (pure.status !== 0) problems.push('check-pure-modules 실패');

console.log(problems.length === 0 ? `\n모두 통과${warnings.length ? ` (경고 ${warnings.length}건)` : ''}` : `\n문제 ${problems.length}건`);
process.exit(problems.length === 0 ? 0 : 1);
