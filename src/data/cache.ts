import { parseSnapshot } from '../core/snapshot';
import type { IndexSymbol, RfgSnapshot } from '../core/types';
import type { KeyValueStorage } from './platform';
import { CACHE_KEYS, DEFAULT_INDEX } from './policy';

/** 마지막 정상 스냅샷. 깨졌거나 버전이 다르면 null(표시하지 않는다). */
export async function readCachedSnapshot(storage: KeyValueStorage): Promise<RfgSnapshot | null> {
  const text = await storage.getItem(CACHE_KEYS.snapshot);
  if (!text) return null;
  try {
    const r = parseSnapshot(JSON.parse(text));
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

export async function writeCachedSnapshot(storage: KeyValueStorage, snapshot: RfgSnapshot): Promise<void> {
  await storage.setItem(CACHE_KEYS.snapshot, JSON.stringify(snapshot));
}

export async function readSelectedIndex(storage: KeyValueStorage): Promise<IndexSymbol> {
  const v = await storage.getItem(CACHE_KEYS.index);
  return v === 'SPX' || v === 'NDX' ? v : DEFAULT_INDEX;
}

export async function writeSelectedIndex(storage: KeyValueStorage, symbol: IndexSymbol): Promise<void> {
  await storage.setItem(CACHE_KEYS.index, symbol);
}
