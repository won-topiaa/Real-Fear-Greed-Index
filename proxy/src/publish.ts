/**
 * 게시. snapshot.json 은 parseSnapshot 자기검증을 통과한 경우에만 교체한다. status.json 은 항상 쓴다.
 */
import { join } from 'node:path';
import { parseSnapshot } from '../../src/core/snapshot';
import type { IndexSymbol, IsoDate, RfgSnapshot, ValidationIssue } from '../../src/core/types';
import { readJsonFile, writeJsonAtomic } from './store/FileStore';
import type { SourceReport } from './types';

export const SNAPSHOT_PATH = join('v1', 'snapshot.json');
export const STATUS_PATH = join('v1', 'status.json');

export interface StatusJson {
  runAtUtc: string;
  runId: string;
  result: 'ok' | 'partial' | 'failed';
  expectedLatestTradingDate: IsoDate;
  sources: SourceReport[];
  published: { generatedAtUtc: string | null; unchanged: boolean; markets: Record<IndexSymbol, 'new' | 'previous' | 'none'> };
  checks: {
    crossCheck: Record<IndexSymbol, ValidationIssue[]>;
    closesAvailable: Record<IndexSymbol, number>;
    fgHistoryPoints: number;
  };
  errors: string[];
}

export async function readPublishedSnapshot(outDir: string): Promise<RfgSnapshot | null> {
  const raw = await readJsonFile<unknown>(join(outDir, SNAPSHOT_PATH));
  if (raw == null) return null;
  const r = parseSnapshot(raw);
  return r.ok ? r.value : null;
}

export async function publishSnapshot(outDir: string, snapshot: RfgSnapshot): Promise<void> {
  const r = parseSnapshot(JSON.parse(JSON.stringify(snapshot)));
  if (!r.ok) throw new Error(`[publish] snapshot failed self-validation at ${r.error.path} (${r.error.code})`);
  await writeJsonAtomic(join(outDir, SNAPSHOT_PATH), snapshot);
}

export async function writeStatus(outDir: string, status: StatusJson): Promise<void> {
  await writeJsonAtomic(join(outDir, STATUS_PATH), status);
}
