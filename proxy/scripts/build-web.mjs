// web/ 를 public/ 로 빌드한다: main.ts(+ src/core·src/text) → app.js 번들, index.html·style.css 복사.
// 수집(collect)이 public/v1/* 를 쓴 뒤, 배포 전에 돈다. 타입 검사는 package.json 의 build-web 이 먼저 한다.
import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '../../web');
const out = resolve(here, '../public');
await mkdir(out, { recursive: true });
await build({
  entryPoints: [join(web, 'main.ts')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: join(out, 'app.js'),
  legalComments: 'none',
  logLevel: 'info',
});
for (const f of ['index.html', 'style.css']) await copyFile(join(web, f), join(out, f));
console.log(`web → ${out}`);
