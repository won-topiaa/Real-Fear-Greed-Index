/**
 * 파일 저장소. 관측 누적(fg/history.json)·소스별 종가 캐시·원문 보관(30일).
 * 쓰기는 임시 파일 → rename 으로 원자적이다.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { addCalendarDays, isIsoDate } from '../../../src/core/calendar';
import type { FgPoint, IndexSymbol, IsoDate, PricePoint, PriceSource } from '../../../src/core/types';

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeTextAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, path);
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, JSON.stringify(value, null, 2) + '\n');
}

export class FileStore {
  constructor(public readonly dataDir: string) {}

  private fgPath(): string {
    return join(this.dataDir, 'fg', 'history.json');
  }

  async readFgHistory(): Promise<FgPoint[]> {
    const v = await readJsonFile<{ points?: FgPoint[] }>(this.fgPath());
    return v?.points ?? [];
  }

  async writeFgHistory(points: readonly FgPoint[]): Promise<void> {
    await writeJsonAtomic(this.fgPath(), { points });
  }

  private pricePath(symbol: IndexSymbol, source: PriceSource): string {
    return join(this.dataDir, 'prices', `${symbol}.${source}.json`);
  }

  async readPriceCache(symbol: IndexSymbol, source: PriceSource): Promise<PricePoint[] | null> {
    const v = await readJsonFile<{ points?: PricePoint[] }>(this.pricePath(symbol, source));
    return v?.points ?? null;
  }

  async writePriceCache(symbol: IndexSymbol, source: PriceSource, points: readonly PricePoint[], fetchedAtUtc: string): Promise<void> {
    await writeJsonAtomic(this.pricePath(symbol, source), { symbol, source, fetchedAtUtc, points });
  }

  /** 원문 응답 보관(디버그·재처리). 값 자체가 비밀은 아니지만 gitignore 된 디렉터리에만 둔다. */
  async saveRaw(date: IsoDate, name: string, text: string): Promise<void> {
    await writeTextAtomic(join(this.dataDir, 'raw', date, name), text);
  }

  /** keepDays 보다 오래된 raw/{date} 디렉터리를 지운다. */
  async pruneRaw(nowDate: IsoDate, keepDays: number): Promise<string[]> {
    const rawDir = join(this.dataDir, 'raw');
    let entries: string[];
    try {
      entries = await readdir(rawDir);
    } catch {
      return [];
    }
    const cutoff = addCalendarDays(nowDate, -keepDays);
    const removed: string[] = [];
    for (const name of entries) {
      if (!isIsoDate(name) || name >= cutoff) continue;
      await rm(join(rawDir, name), { recursive: true, force: true });
      removed.push(name);
    }
    return removed;
  }
}
