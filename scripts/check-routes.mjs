// pages/*.tsx ↔ src/pages/*.tsx ↔ src/router.gen.ts 동기화 검사. router.gen.ts 는 수동 유지(DESIGN §6.2).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const reexports = readdirSync(join(root, 'pages')).filter((f) => f.endsWith('.tsx'));
const screens = readdirSync(join(root, 'src', 'pages')).filter((f) => f.endsWith('.tsx'));

for (const f of reexports) {
  const src = readFileSync(join(root, 'pages', f), 'utf8').trim();
  const name = f.replace(/\.tsx$/, '');
  const expected = `export { Route } from 'pages/${name}';`;
  if (src !== expected) problems.push(`pages/${f} 는 정확히 \`${expected}\` 한 줄이어야 함`);
  if (!screens.includes(f)) problems.push(`pages/${f} 에 대응하는 src/pages/${f} 없음`);
}
for (const f of screens) {
  if (!reexports.includes(f)) problems.push(`src/pages/${f} 를 재수출하는 pages/${f} 없음`);
}

const routePaths = new Set();
for (const f of screens) {
  const src = readFileSync(join(root, 'src', 'pages', f), 'utf8');
  const m = /createRoute\(\s*['"]([^'"]+)['"]/.exec(src);
  if (!m) problems.push(`src/pages/${f} 에 createRoute('<path>') 없음`);
  else routePaths.add(m[1]);
}
if (!routePaths.has('/_404')) problems.push("src/pages/_404.tsx 가 createRoute('/_404') 를 export 해야 함(없으면 흰 화면)");

const gen = readFileSync(join(root, 'src', 'router.gen.ts'), 'utf8');
const inputBlock = /interface RegisterScreenInput \{([\s\S]*?)\}/.exec(gen)?.[1] ?? '';
const screenBlock = /interface RegisterScreen \{([\s\S]*?)\}/.exec(gen)?.[1] ?? '';
const keysOf = (block) => new Set([...block.matchAll(/'([^']+)':/g)].map((m) => m[1]));
const inputKeys = keysOf(inputBlock);
const screenKeys = keysOf(screenBlock);
for (const p of routePaths) {
  if (!inputKeys.has(p)) problems.push(`router.gen.ts RegisterScreenInput 에 '${p}' 없음`);
  if (!screenKeys.has(p)) problems.push(`router.gen.ts RegisterScreen 에 '${p}' 없음`);
}
for (const k of inputKeys) if (!routePaths.has(k)) problems.push(`router.gen.ts 에 '${k}' 가 있지만 createRoute 가 없음`);

if (problems.length) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`  ✓ 라우트 ${[...routePaths].sort().join(', ')} 동기화됨`);
