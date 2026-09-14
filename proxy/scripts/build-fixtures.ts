/**
 * 합성 시나리오 → 앱 목 픽스처(src/data/fixtures/*.json) + e2e 골든(proxy/test/golden/snapshot.json).
 * 각 시나리오가 의도한 국면을 실제로 만드는지 classify 로 검증한다. 손으로 편집하지 말 것.
 *
 * 골든은 collect() 를 합성 소스로 실제 실행해 만든다(어댑터·선택 규칙·게시까지 통과한 결과).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../../src/core/classify';
import { NYSE_HOLIDAYS } from '../../src/core/calendar';
import { computeRfgSeries } from '../../src/core/rfg';
import { buildSnapshot } from '../../src/core/snapshot';
import { DISCLAIMER } from '../../src/text/copy';
import { collect } from '../src/collect';
import { DEFAULT_ENV } from '../src/env';
import { silentLogger } from '../src/log';
import { writeJsonAtomic } from '../src/store/FileStore';
import { cnnJson, fakeFetch, fredJson, stooqCsv, yahooJson } from '../src/synth';
import { makeScenario, SCENARIO_KEYS, SCENARIO_NOW_UTC, scenarioExpectedDate } from '../src/synth/scenarios';

const here = dirname(fileURLToPath(import.meta.url));
const APP_FIXTURES_DIR = resolve(here, '../../src/data/fixtures');
const GOLDEN_PATH = resolve(here, '../test/golden/snapshot.json');
const GENERATED_AT = '2026-09-11T22:31:00.000Z';

async function main(): Promise<void> {
  const summary: string[] = [];
  for (const key of SCENARIO_KEYS) {
    const s = makeScenario(key);
    const rows = { SPX: computeRfgSeries(s.prices.SPX, s.fg), NDX: computeRfgSeries(s.prices.NDX, s.fg) };
    const flags = { SPX: [] as never[], NDX: [] as never[] };
    const snapshot = buildSnapshot({
      rows,
      priceSource: { SPX: 'fred', NDX: 'fred' },
      flags: s.fg.length === 0 ? { SPX: ['fg-missing'], NDX: ['fg-missing'] } : flags,
      generatedAtUtc: GENERATED_AT,
      expectedLatestTradingDate: scenarioExpectedDate(s),
      holidays: NYSE_HOLIDAYS,
      fgSource: s.fg.length === 0 ? 'own-history' : 'cnn',
      disclaimerVersion: DISCLAIMER.version,
    });
    const c = classify(snapshot.markets.SPX.latest);
    if (c.quadrant !== s.expect.quadrant || c.rfgZone !== s.expect.rfgZone) {
      throw new Error(`scenario ${key}: expected ${s.expect.quadrant}/${s.expect.rfgZone}, got ${c.quadrant}/${c.rfgZone} (rounded ${JSON.stringify(c.rounded)})`);
    }
    await writeJsonAtomic(join(APP_FIXTURES_DIR, `${key}.json`), snapshot);
    summary.push(`${key.padEnd(13)} ${c.quadrant.padEnd(8)} ${c.rfgZone.padEnd(13)} rfg=${c.rounded.rfg} fear=${c.rounded.fear} p=${c.rounded.p} frm=${c.rounded.frm} expected=${snapshot.expectedLatestTradingDate}`);
  }

  // 골든: collect() 를 normal 시나리오의 합성 소스로 실행
  const s = makeScenario('normal');
  const fgHist = s.fg.slice(0, -1).map((p) => ({ ...p, source: 'cnn-historical' as const }));
  const current = s.fg[s.fg.length - 1]!;
  const dir = await mkdtemp(join(tmpdir(), 'rfg-golden-'));
  try {
    const r = await collect({
      outDir: join(dir, 'public'),
      dataDir: join(dir, 'cache'),
      env: { ...DEFAULT_ENV, FRED_API_KEY: 'test-key' },
      nowUtcMs: Date.parse(SCENARIO_NOW_UTC),
      fetchImpl: fakeFetch([
        { match: (u) => u.includes('cnn.io'), body: cnnJson(fgHist, { score: current.value, timestamp: '2026-09-11T20:05:00+00:00' }) },
        { match: (u) => u.includes('stlouisfed') && u.includes('SP500'), body: fredJson(s.prices.SPX) },
        { match: (u) => u.includes('stlouisfed') && u.includes('NASDAQ100'), body: fredJson(s.prices.NDX) },
        { match: (u) => u.includes('stooq') && u.includes('spx'), body: stooqCsv(s.prices.SPX), contentType: 'text/csv' },
        { match: (u) => u.includes('stooq') && u.includes('ndx'), body: stooqCsv(s.prices.NDX), contentType: 'text/csv' },
        { match: (u) => u.includes('yahoo') && u.includes('GSPC'), body: yahooJson(s.prices.SPX) },
        { match: (u) => u.includes('yahoo') && u.includes('NDX'), body: yahooJson(s.prices.NDX) },
      ]),
      log: silentLogger,
      retries: 0,
      runId: 'test',
      ping: false,
    });
    if (r.result !== 'ok' || !r.snapshot) throw new Error(`golden collect failed: ${r.status.errors.join('; ')}`);
    await writeJsonAtomic(GOLDEN_PATH, r.snapshot);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  console.log(summary.join('\n'));
  console.log(`wrote ${SCENARIO_KEYS.length} fixtures → ${APP_FIXTURES_DIR}\nwrote golden → ${GOLDEN_PATH}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
