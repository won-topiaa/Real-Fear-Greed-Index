// CNN Fear & Greed 일별 이력(2020-07-15 이후가 API 한계)을 research/data/cnn_fg.csv 로 받는다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const start = process.argv[2] ?? '2020-07-15';
const r = await fetch(`https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${start}`, {
  headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: 'https://edition.cnn.com/', Origin: 'https://edition.cnn.com' },
});
if (!r.ok) throw new Error(`cnn http ${r.status}`);
const j = await r.json();
// x 가 UTC 자정이면 UTC 날짜, 아니면(당일 장중 값) 뉴욕 날짜 — proxy/src/sources/cnn.ts 의 cnnEpochToDate 와 같은 규칙.
const toDate = (x) => (x % 86400000 === 0 ? new Date(x).toISOString().slice(0, 10) : new Date(x).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
const byDate = new Map();
for (const p of j.fear_and_greed_historical.data) byDate.set(toDate(p.x), p.y);
const rows = [...byDate].sort(([a], [b]) => a.localeCompare(b));
mkdirSync(join(here, 'data'), { recursive: true });
writeFileSync(join(here, 'data/cnn_fg.csv'), 'date,fg\n' + rows.map(([d, v]) => `${d},${v}`).join('\n') + '\n');
console.log(`cnn_fg ${rows[0][0]} -> ${rows.at(-1)[0]} n=${rows.length}`);
