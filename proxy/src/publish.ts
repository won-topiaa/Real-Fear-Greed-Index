/**
 * 게시. snapshot.json 은 parseSnapshot 자기검증을 통과한 경우에만 교체한다. status.json 은 항상 쓴다.
 * 캐시 헤더는 public/_headers 로 함께 쓴다(DESIGN §7.1). 지금 게시처인 GitHub Pages 는 이 파일을 읽지 않는다 — Cloudflare 로 옮길 때 그대로 쓰인다.
 */
import { join } from 'node:path';
import { parseHistory } from '../../src/core/history';
import { parseSnapshot } from '../../src/core/snapshot';
import type { IndexSymbol, IsoDate, RfgHistory, RfgSnapshot, ValidationIssue } from '../../src/core/types';
import { readJsonFile, writeJsonAtomic, writeTextAtomic } from './store/FileStore';
import type { SourceReport } from './types';

export const SNAPSHOT_PATH = join('v1', 'snapshot.json');
export const STATUS_PATH = join('v1', 'status.json');
export const HISTORY_PATH = join('v1', 'history.json');
export const HEADERS_PATH = '_headers';

/** Cloudflare `_headers` 형식(Pages·Workers 정적 자산 공통). 로컬 serve.ts 의 cacheControlFor 와 같은 값. */
export const HEADERS_FILE = `/v1/snapshot.json
  Cache-Control: public, max-age=600, stale-while-revalidate=86400
  Access-Control-Allow-Origin: *
/v1/status.json
  Cache-Control: public, max-age=60
  Access-Control-Allow-Origin: *
/v1/history.json
  Cache-Control: public, max-age=600, stale-while-revalidate=86400
  Access-Control-Allow-Origin: *
/static/*
  Cache-Control: public, max-age=86400
/
  Cache-Control: public, max-age=300
/index.html
  Cache-Control: public, max-age=300
/app.js
  Cache-Control: public, max-age=300
/style.css
  Cache-Control: public, max-age=300
`;

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

/** 이전 게시본. 없거나, JSON 이 깨졌거나, 계약을 통과하지 못하면 null(= 이전 없음으로 취급). */
export async function readPublishedSnapshot(outDir: string): Promise<RfgSnapshot | null> {
  let raw: unknown;
  try {
    raw = await readJsonFile<unknown>(join(outDir, SNAPSHOT_PATH));
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
  if (raw == null) return null;
  const r = parseSnapshot(raw);
  return r.ok ? r.value : null;
}

/** 이전 게시 이력. 없거나 깨졌거나 계약을 통과하지 못하면 null. partial 인 날 실패한 지수의 이력을 이어 쓰는 데 쓴다. */
export async function readPublishedHistory(outDir: string): Promise<RfgHistory | null> {
  let raw: unknown;
  try {
    raw = await readJsonFile<unknown>(join(outDir, HISTORY_PATH));
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
  if (raw == null) return null;
  const r = parseHistory(raw);
  return r.ok ? r.value : null;
}

export async function publishSnapshot(outDir: string, snapshot: RfgSnapshot): Promise<void> {
  const r = parseSnapshot(JSON.parse(JSON.stringify(snapshot)));
  if (!r.ok) throw new Error(`[publish] snapshot failed self-validation at ${r.error.path} (${r.error.code})`);
  await writeJsonAtomic(join(outDir, SNAPSHOT_PATH), snapshot);
}

/** 1년 이력. parseHistory 자기검증을 통과한 경우에만 쓴다. */
export async function publishHistory(outDir: string, history: RfgHistory): Promise<void> {
  const r = parseHistory(JSON.parse(JSON.stringify(history)));
  if (!r.ok) throw new Error(`[publish] history failed self-validation at ${r.error.path}`);
  await writeJsonAtomic(join(outDir, HISTORY_PATH), history, { compact: true });
}

export async function writeStatus(outDir: string, status: StatusJson): Promise<void> {
  await writeJsonAtomic(join(outDir, STATUS_PATH), status);
}

export async function writeHeadersFile(outDir: string): Promise<void> {
  await writeTextAtomic(join(outDir, HEADERS_PATH), HEADERS_FILE);
}
