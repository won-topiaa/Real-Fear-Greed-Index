// (1) src/core, src/text 에 react / react-native / node import 금지 — 파이프라인·스크립트가 같이 쓰는 순수 모듈.
// (2) src/pages, src/screens, src/ui 의 문자열 리터럴에 문턱 숫자(20/80/40/60/70/0.5/1.5) 하드코딩 금지 — 상수는 core 에서 보간.
//     StyleSheet.create 블록과 `// numbers-ok` 표시 줄은 허용.
// (3) 화면 문구에 행동 지시 금지 단어 없음(투자 권유 오인 방지).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === '__fixtures__' || name === 'fixtures') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const PURE_DIRS = ['src/core', 'src/text'];
const FORBIDDEN_IMPORT = /^\s*import\s[^;]*from\s+['"](react|react-native|react-native\/.*|node:.*|fs|path|http|https|os|@apps-in-toss\/.*|@granite-js\/.*)['"]/m;
for (const d of PURE_DIRS) {
  for (const f of walk(join(root, d))) {
    const src = readFileSync(f, 'utf8');
    const m = FORBIDDEN_IMPORT.exec(src);
    if (m) problems.push(`${relative(root, f)}: 순수 모듈에 금지 import (${m[1]})`);
  }
}

const UI_DIRS = ['src/pages', 'src/screens', 'src/ui'];
const THRESHOLD_NUMBERS = /(^|[^\d.])(20|80|40|60|70|0\.5|1\.5)(?![\d.%])/;
const FORBIDDEN_WORDS = ['매수', '매도', '헤지', '수익 실현', '추천', '청산'];
for (const d of UI_DIRS) {
  for (const f of walk(join(root, d))) {
    const src = readFileSync(f, 'utf8');
    const lines = src.split('\n');
    let inStyle = false;
    let depth = 0;
    lines.forEach((line, i) => {
      if (/StyleSheet\.create\(/.test(line)) {
        inStyle = true;
        depth = 0;
      }
      if (inStyle) {
        depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
        if (depth <= 0 && /\}\)/.test(line)) inStyle = false;
        return;
      }
      if (/numbers-ok/.test(line)) return;
      const strings = line.match(/(['"`])(?:(?!\1).)*\1/g) ?? [];
      for (const s of strings) {
        if (THRESHOLD_NUMBERS.test(s)) problems.push(`${relative(root, f)}:${i + 1}: 문턱 숫자 리터럴 ${s} — core 상수를 보간한 COPY 를 쓸 것`);
      }
      for (const w of FORBIDDEN_WORDS) {
        if (line.includes(w)) problems.push(`${relative(root, f)}:${i + 1}: 금지 단어 '${w}' (행동 지시 문구는 쓰지 않는다)`);
      }
    });
  }
}
for (const f of walk(join(root, 'src/text'))) {
  const src = readFileSync(f, 'utf8');
  for (const w of FORBIDDEN_WORDS) {
    if (src.includes(w)) problems.push(`${relative(root, f)}: 금지 단어 '${w}'`);
  }
}

if (problems.length) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('  ✓ 순수 모듈 import 규칙 · 화면 숫자 리터럴 · 금지 단어 검사 통과');
