// 앱인토스 새 앱 체크리스트를 코드로 검사한다. 반나절짜리 흰 화면을 10초에 잡기 위한 스크립트.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  problems.push(msg);
  console.log(`  ✗ ${msg}`);
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
/icon:\s*['"]\.{0,2}\//.test(cfg) ? bad('brand.icon 이 파일 경로 — URL 이어야 함') : ok('brand.icon 이 경로 형태가 아님');
/scheme:\s*['"]intoss['"]/.test(cfg) ? ok('scheme = intoss') : bad('scheme 이 intoss 가 아님');

console.log('비밀값');
const gi = readFileSync(join(root, '.gitignore'), 'utf8');
for (const f of ['src/config.local.ts', 'proxy/.env']) {
  gi.split('\n').some((l) => l.trim() === f) ? ok(`${f} gitignore됨`) : bad(`${f} 가 .gitignore 에 없음`);
}

console.log(problems.length === 0 ? '\n모두 통과' : `\n문제 ${problems.length}건`);
process.exit(problems.length === 0 ? 0 : 1);
