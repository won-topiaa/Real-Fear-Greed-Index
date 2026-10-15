// web/ 를 public/ 로 빌드한다: main.ts(+ src/core·src/text) → app.js 번들, index.html·style.css 복사.
// 수집(collect)이 public/v1/* 를 쓴 뒤, 배포 전에 돈다. 타입 검사는 package.json 의 build-web 이 먼저 한다.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
await copyFile(join(web, 'style.css'), join(out, 'style.css'));
// 링크 미리보기 이미지(og:image). 원본은 web/og/card.html — 바꾸면 그 파일 주석의 명령으로 web/og.png 를 다시 찍는다.
await copyFile(join(web, 'og.png'), join(out, 'og.png'));
// 캐시 무효화: GitHub Pages 는 모든 파일을 10분 캐시한다(헤더를 바꿀 수 없다). 주소가 같으면 배포 뒤에도 브라우저가 예전 app.js 를
// 쓰므로, 내용 해시를 쿼리로 붙여 새 index.html 이 항상 새 app.js·style.css 를 받게 한다.
const hash = async (f) => createHash('sha256').update(await readFile(join(out, f))).digest('hex').slice(0, 10);
const html = (await readFile(join(web, 'index.html'), 'utf8'))
  .replace('./style.css', `./style.css?v=${await hash('style.css')}`)
  .replace('./app.js', `./app.js?v=${await hash('app.js')}`)
  // SNS 는 이미지 주소별로 캐시하므로 이미지를 바꾸면 주소도 바뀌게 한다
  .replace('/og.png"', `/og.png?v=${await hash('og.png')}"`);
if (!html.includes('app.js?v=') || !html.includes('style.css?v=') || !html.includes('og.png?v=')) {
  throw new Error('index.html 의 자산 경로를 찾지 못했다');
}
await writeFile(join(out, 'index.html'), html);
console.log(`web → ${out}`);
