import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { publishSnapshot, readPublishedSnapshot, SNAPSHOT_PATH } from '../src/publish';
import { writeJsonAtomic } from '../src/store/FileStore';
import { computeRfgSeries } from '../../src/core/rfg';
import { buildSnapshot } from '../../src/core/snapshot';
import { NYSE_HOLIDAYS } from '../../src/core/calendar';
import { makeScenario } from '../src/synth/scenarios';
import type { RfgSnapshot } from '../../src/core/types';

function makeSnapshot(): RfgSnapshot {
  const s = makeScenario('normal');
  const rows = { SPX: computeRfgSeries(s.prices.SPX, s.fg), NDX: computeRfgSeries(s.prices.NDX, s.fg) };
  return buildSnapshot({
    rows,
    priceSource: { SPX: 'stooq', NDX: 'stooq' },
    flags: { SPX: [], NDX: [] },
    generatedAtUtc: '2026-09-11T22:31:00.000Z',
    expectedLatestTradingDate: '2026-09-11',
    holidays: NYSE_HOLIDAYS,
    fgSource: 'cnn',
    disclaimerVersion: 1,
  });
}

test('publishSnapshot: 자기검증 통과 시에만 쓰고, 임시 파일을 남기지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-pub-'));
  try {
    const snap = makeSnapshot();
    await publishSnapshot(dir, snap);
    const back = await readPublishedSnapshot(dir);
    assert.ok(back);
    assert.equal(back?.markets.SPX.closeDate, '2026-09-11');
    assert.equal('close' in (back?.markets.SPX.latest ?? {}), false);
    const files = await readdir(join(dir, 'v1'));
    assert.deepEqual(files, ['snapshot.json']);

    const broken = JSON.parse(JSON.stringify(snap)) as RfgSnapshot;
    (broken.markets.SPX.latest as { p: number | null }).p = 250;
    await assert.rejects(() => publishSnapshot(dir, broken), /self-validation at \$\.markets\.SPX\.latest\.p/);
    // 이전 파일은 그대로
    const text = await readFile(join(dir, SNAPSHOT_PATH), 'utf8');
    assert.equal((JSON.parse(text) as RfgSnapshot).markets.SPX.latest.p, snap.markets.SPX.latest.p);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readPublishedSnapshot: 없거나 깨진 파일은 null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rfg-pub-'));
  try {
    assert.equal(await readPublishedSnapshot(dir), null);
    await writeJsonAtomic(join(dir, SNAPSHOT_PATH), { schemaVersion: 2 });
    assert.equal(await readPublishedSnapshot(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
