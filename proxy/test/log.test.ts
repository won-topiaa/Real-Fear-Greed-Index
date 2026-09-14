import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectingLogger, maskSecrets } from '../src/log';

test('maskSecrets: api_key·token·Bearer·hc-ping 을 가린다', () => {
  assert.equal(maskSecrets('https://api.stlouisfed.org/x?series_id=SP500&api_key=abcdef123&file_type=json'), 'https://api.stlouisfed.org/x?series_id=SP500&api_key=***&file_type=json');
  assert.equal(maskSecrets('Authorization: Bearer sk-live-123'), 'Authorization: Bearer ***');
  assert.equal(maskSecrets('https://hc-ping.com/0000-1111/fail'), 'https://hc-ping.com/***/fail');
  assert.equal(maskSecrets('token=zzz&x=1'), 'token=***&x=1');
});

test('collectingLogger 도 마스킹한다', () => {
  const log = collectingLogger();
  log.warn('GET https://x?api_key=SECRET');
  assert.deepEqual(log.lines, ['warn GET https://x?api_key=***']);
});
