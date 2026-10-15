// FRED 시리즈 전체 이력을 research/data/fred/<ID>.csv 로 받는다. 키는 proxy/.env 에서 읽고 출력하지 않는다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(here, '../proxy/.env'), 'utf8');
const key = env.match(/^FRED_API_KEY=(\w+)/m)?.[1];
if (!key) throw new Error('FRED_API_KEY 없음');
const out = join(here, 'data/fred');
mkdirSync(out, { recursive: true });

const ids = process.argv.slice(2);
for (const id of ids) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=1900-01-01`;
  const r = await fetch(url);
  if (!r.ok) { console.log(`${id.padEnd(14)} http=${r.status}`); continue; }
  const obs = (await r.json()).observations.filter((o) => o.value !== '.');
  writeFileSync(join(out, `${id}.csv`), 'date,value\n' + obs.map((o) => `${o.date},${o.value}`).join('\n') + '\n');
  console.log(`${id.padEnd(14)} ${obs[0]?.date} -> ${obs.at(-1)?.date}  n=${obs.length}`);
}
