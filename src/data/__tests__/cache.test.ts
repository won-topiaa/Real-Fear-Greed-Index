import { readCachedSnapshot, readSelectedIndex, writeCachedSnapshot, writeSelectedIndex } from '../cache';
import { loadMockSnapshot } from '../mockClient';
import { createMemoryPlatform } from '../platform';
import { CACHE_KEYS } from '../policy';

describe('cache', () => {
  test('스냅샷 왕복, 깨진 값·버전 불일치는 null', async () => {
    const p = createMemoryPlatform();
    expect(await readCachedSnapshot(p.storage)).toBeNull();
    const s = loadMockSnapshot('normal', Date.now());
    await writeCachedSnapshot(p.storage, s);
    expect(await readCachedSnapshot(p.storage)).toEqual(s);
    await p.storage.setItem(CACHE_KEYS.snapshot, '{not json');
    expect(await readCachedSnapshot(p.storage)).toBeNull();
    await p.storage.setItem(CACHE_KEYS.snapshot, JSON.stringify({ ...s, schemaVersion: 2 }));
    expect(await readCachedSnapshot(p.storage)).toBeNull();
  });

  test('선택 지수: 기본 SPX, 잘못된 값은 기본값', async () => {
    const p = createMemoryPlatform();
    expect(await readSelectedIndex(p.storage)).toBe('SPX');
    await writeSelectedIndex(p.storage, 'NDX');
    expect(await readSelectedIndex(p.storage)).toBe('NDX');
    await p.storage.setItem(CACHE_KEYS.index, 'XXX');
    expect(await readSelectedIndex(p.storage)).toBe('SPX');
  });
});
