import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RfgSnapshot } from '../../src/core/types';
import { checkPublished, checkSummary } from '../src/check';
import { DEFAULT_ENV } from '../src/env';
import type { StatusJson } from '../src/publish';
import type { SourceReport } from '../src/types';

const env = { ...DEFAULT_ENV, YAHOO_PROXY_URL: 'https://a.example.workers.dev/,https://b.example.workers.dev/' };
// 기대 거래일 2026-10-16(금, EDT 종가 20:00Z) → 오류 시한 10-17 08:00Z
const MORNING = Date.parse('2026-10-17T00:40:00Z');
const EVENING = Date.parse('2026-10-17T08:00:00Z');

function snap(spx: string, ndx: string): RfgSnapshot {
  return { markets: { SPX: { closeDate: spx, priceSource: 'fred' }, NDX: { closeDate: ndx, priceSource: 'yahoo' } } } as unknown as RfgSnapshot;
}

function status(sources: Array<Partial<SourceReport>>, result: StatusJson['result'] = 'ok'): StatusJson {
  return {
    runAtUtc: '',
    runId: 't',
    result,
    expectedLatestTradingDate: '2026-10-16',
    sources: sources.map((s) => ({ id: 'fred', status: 'ok', fetchedAtUtc: null, asOf: null, error: null, ...s }) as SourceReport),
    published: { generatedAtUtc: null, unchanged: false, markets: { SPX: 'new', NDX: 'new' } },
    checks: { crossCheck: { SPX: [], NDX: [] }, closesAvailable: { SPX: 0, NDX: 0 }, fgHistoryPoints: 0 },
    errors: [],
  };
}

test('둘 다 최신이고 소스가 정상이면 경고·오류 없음 (Stooq 실패는 알고 있는 차단이라 무시)', () => {
  const r = checkPublished({ snapshot: snap('2026-10-16', '2026-10-16'), status: status([{ id: 'stooq', symbol: 'SPX', status: 'failed', error: 'http_403' }]), env, nowUtcMs: MORNING });
  assert.equal(r.expected, '2026-10-16');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.match(checkSummary(r), /이상 없음/);
});

test('하루 늦은 지수: 종가 12시간 전에는 경고, 지나면 오류', () => {
  const s = snap('2026-10-16', '2026-10-15');
  const morning = checkPublished({ snapshot: s, status: status([]), env, nowUtcMs: MORNING });
  assert.deepEqual(morning.errors, []);
  assert.match(morning.warnings[0] ?? '', /NDX 가 1거래일 늦다/);
  const evening = checkPublished({ snapshot: s, status: status([]), env, nowUtcMs: EVENING });
  assert.equal(evening.overdue, true);
  assert.match(evening.errors[0] ?? '', /NDX 가 1거래일 늦다.*12시간/);
  // 주말(일요일)에도 금요일 값이 없으면 계속 오류
  assert.equal(checkPublished({ snapshot: s, status: status([]), env, nowUtcMs: Date.parse('2026-10-18T22:30:00Z') }).errors.length, 1);
});

test('소스 실패·프록시 미설정·교차검증 경고, 수집 실패는 오류', () => {
  const st = status(
    [
      { id: 'yahoo', symbol: 'NDX', status: 'failed', error: 'http_429' },
      { id: 'yahoo', symbol: 'SPX', status: 'ok', fallbacks: ['#1 http_403'] },
      { id: 'cnn', status: 'failed', error: 'http_403' },
    ],
    'failed',
  );
  st.checks.crossCheck.SPX = [{ code: 'source-mismatch', index: 0, date: '2026-10-16', fatal: false }];
  const r = checkPublished({ snapshot: snap('2026-10-16', '2026-10-16'), status: st, env: DEFAULT_ENV, nowUtcMs: MORNING });
  assert.match(r.errors[0] ?? '', /수집 실패/);
  assert.ok(r.warnings.some((w) => w.startsWith('yahoo/NDX failed: http_429')));
  assert.ok(r.warnings.some((w) => w.startsWith('cnn failed')));
  assert.ok(r.warnings.some((w) => w.startsWith('yahoo/SPX: 앞선 프록시 실패(#1 http_403)')));
  assert.ok(r.warnings.some((w) => w.includes('source-mismatch')));
  assert.ok(r.warnings.some((w) => w.includes('YAHOO_PROXY_URL')));
});

test('게시본이 없으면 오류, 휴장일 목록이 곧 끝나면 경고·이미 끝났으면 오류', () => {
  assert.match(checkPublished({ snapshot: null, status: null, env, nowUtcMs: MORNING }).errors[0] ?? '', /snapshot/);
  const s = snap('2026-10-16', '2026-10-16');
  const soon = checkPublished({ snapshot: s, status: status([]), env, nowUtcMs: Date.parse('2026-11-15T00:00:00Z'), holidays: ['2026-11-26', '2026-12-25'] });
  assert.ok(soon.warnings.some((w) => w.includes('2027년 휴장일')));
  const gone = checkPublished({ snapshot: s, status: status([]), env, nowUtcMs: MORNING, holidays: ['2025-12-25'] });
  assert.ok(gone.errors.some((e) => e.includes('NYSE_HOLIDAYS')));
});
