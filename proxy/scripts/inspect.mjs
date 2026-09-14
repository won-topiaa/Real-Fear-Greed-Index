#!/usr/bin/env node
/**
 * 외부 소스의 실제 응답 "형태"를 확인한다. 값·키는 출력하지 않는다.
 *   node scripts/inspect.mjs --source cnn|fred|stooq|yahoo [--symbol SPX|NDX] [--save]
 * --save 는 test/fixtures/<source>.<symbol>.recorded.{json,csv} 로 저장(CNN 은 historical 을 30일로 자름).
 * 이 스크립트를 로컬에서 1회 실행하는 것이 M2 의 0번 작업이다(DESIGN §3.3).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const source = opt('source');
const symbol = opt('symbol', 'SPX');
const save = args.includes('--save');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function loadEnvFile() {
  try {
    const text = await readFile(resolve(here, '../.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env */
  }
}

function shape(v, depth = 0) {
  if (Array.isArray(v)) return `array(${v.length})${v.length ? ` of ${shape(v[0], depth + 1)}` : ''}`;
  if (v === null) return 'null';
  if (typeof v === 'object') {
    if (depth > 3) return 'object';
    return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(', ')} }`;
  }
  return typeof v;
}

function nyDate(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function main() {
  await loadEnvFile();
  let url;
  let headers = { 'User-Agent': UA };
  switch (source) {
    case 'cnn':
      url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
      headers.Accept = 'application/json, text/plain, */*';
      break;
    case 'fred': {
      const key = process.env.FRED_API_KEY;
      if (!key) throw new Error('FRED_API_KEY 가 없습니다 (proxy/.env)');
      const id = symbol === 'NDX' ? 'NASDAQ100' : 'SP500';
      url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=2015-01-01`;
      break;
    }
    case 'stooq':
      url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol === 'NDX' ? '^ndx' : '^spx')}&i=d`;
      break;
    case 'yahoo':
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol === 'NDX' ? '^NDX' : '^GSPC')}?range=1mo&interval=1d`;
      break;
    default:
      console.error('usage: node scripts/inspect.mjs --source cnn|fred|stooq|yahoo [--symbol SPX|NDX] [--save]');
      process.exitCode = 2;
      return;
  }
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(`status=${res.status} content-type=${res.headers.get('content-type')} bytes=${text.length}`);
  let outName = `${source}.${symbol}.recorded.json`;
  let outText = text;
  if (source === 'stooq') {
    const lines = text.split(/\r?\n/).filter(Boolean);
    console.log(`header: ${lines[0]}`);
    console.log(`rows: ${lines.length - 1}, first: ${lines[1]?.split(',')[0]}, last: ${lines[lines.length - 1]?.split(',')[0]}`);
    outName = `${source}.${symbol}.recorded.csv`;
  } else {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.log(`not json. head: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
      return;
    }
    console.log(`shape: ${shape(json)}`);
    if (source === 'cnn') {
      const cur = json.fear_and_greed ?? {};
      console.log(`fear_and_greed keys: ${Object.keys(cur).join(', ')}`);
      if (cur.timestamp) console.log(`timestamp → NY date ${nyDate(Date.parse(cur.timestamp))}`);
      const data = json.fear_and_greed_historical?.data ?? [];
      console.log(`historical points: ${data.length}`);
      for (const d of data.slice(0, 3)) {
        console.log(`  x=${d.x} utcMidnight=${d.x % 86400000 === 0} utcDate=${new Date(d.x).toISOString().slice(0, 10)} nyDate=${nyDate(d.x)}`);
      }
      const last = data[data.length - 1];
      if (last) console.log(`  last x=${last.x} utcDate=${new Date(last.x).toISOString().slice(0, 10)} nyDate=${nyDate(last.x)}`);
      if (save) {
        outText = JSON.stringify({ ...json, fear_and_greed_historical: { ...json.fear_and_greed_historical, data: data.slice(-30) } });
      }
    }
    if (source === 'fred') {
      const obs = json.observations ?? [];
      console.log(`observations: ${obs.length}, first: ${obs[0]?.date}, last: ${obs[obs.length - 1]?.date}, dots: ${obs.filter((o) => o.value === '.').length}`);
    }
    if (source === 'yahoo') {
      const r = json.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      console.log(`timestamps: ${ts.length}, first → NY ${ts[0] ? nyDate(ts[0] * 1000) : '-'}, last → NY ${ts.length ? nyDate(ts[ts.length - 1] * 1000) : '-'}`);
    }
  }
  if (save) {
    const dir = resolve(here, '../test/fixtures');
    await mkdir(dir, { recursive: true });
    const path = join(dir, outName);
    await writeFile(path, outText, 'utf8');
    console.log(`saved ${path}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
