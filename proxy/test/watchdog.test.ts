import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WATCHDOG, decide, type RunInfo } from '../watchdog/decide';

// 2026-10-19(월) EDT 종가 = 20:00Z. 감시는 종가 2.5시간 뒤(22:30Z)부터 본다.
const MON_2317 = Date.parse('2026-10-19T23:17:00Z');
const done = (createdAt: string, event = 'schedule'): RunInfo => ({ status: 'completed', event, createdAt });
const OLD_RUNS = [done('2026-10-19T14:45:00Z'), done('2026-10-19T09:20:00Z')];

test('감시: 종가 뒤 대기 시간 전에는 돌리지 않는다(EDT 22:30Z, EST 23:30Z)', () => {
  const stale = { SPX: '2026-10-16', NDX: '2026-10-16' };
  assert.equal(decide({ nowUtcMs: Date.parse('2026-10-19T22:17:00Z'), closeDates: stale, runs: OLD_RUNS }).dispatch, false);
  assert.equal(decide({ nowUtcMs: Date.parse('2026-10-19T22:31:00Z'), closeDates: stale, runs: OLD_RUNS }).dispatch, true);
  // 11-02(월)은 EST — 종가 21:00Z, 23:17Z 는 아직 대기
  const est = { SPX: '2026-10-30', NDX: '2026-10-30' };
  assert.equal(decide({ nowUtcMs: Date.parse('2026-11-02T23:17:00Z'), closeDates: est, runs: [] }).dispatch, false);
  assert.equal(decide({ nowUtcMs: Date.parse('2026-11-03T00:17:00Z'), closeDates: est, runs: [] }).dispatch, true);
});

test('감시: 게시본이 늦으면 돌리고, 한 지수만 늦어도 돌린다', () => {
  const d = decide({ nowUtcMs: MON_2317, closeDates: { SPX: '2026-10-16', NDX: '2026-10-16' }, runs: OLD_RUNS });
  assert.deepEqual(d, { dispatch: true, reason: '2026-10-19 기준 1거래일 늦음', expected: '2026-10-19' });
  assert.equal(decide({ nowUtcMs: MON_2317, closeDates: { SPX: '2026-10-19', NDX: '2026-10-16' }, runs: OLD_RUNS }).dispatch, true);
  assert.equal(decide({ nowUtcMs: MON_2317, closeDates: null, runs: OLD_RUNS }).reason, '2026-10-19 기준 게시본을 못 읽음');
});

test('감시: 이미 최신이면, 주말·휴장일이면 돌리지 않는다', () => {
  assert.equal(decide({ nowUtcMs: MON_2317, closeDates: { SPX: '2026-10-19', NDX: '2026-10-19' }, runs: OLD_RUNS }).dispatch, false);
  // 일요일: 기대 거래일은 금요일
  const sun = decide({ nowUtcMs: Date.parse('2026-10-18T12:17:00Z'), closeDates: { SPX: '2026-10-16', NDX: '2026-10-16' }, runs: [] });
  assert.equal(sun.expected, '2026-10-16');
  assert.equal(sun.dispatch, false);
  // 추수감사절(11-26) 다음 새벽: 기대 거래일은 11-25
  const tg = decide({ nowUtcMs: Date.parse('2026-11-27T03:17:00Z'), closeDates: { SPX: '2026-11-25', NDX: '2026-11-25' }, runs: [] });
  assert.equal(tg.expected, '2026-11-25');
  assert.equal(tg.dispatch, false);
});

test('감시: 도는 실행·최근 실행이 있으면 맡기고, 그 거래일에 돌린 횟수가 상한이면 멈춘다', () => {
  const stale = { SPX: '2026-10-16', NDX: '2026-10-16' };
  const running = [{ status: 'in_progress', event: 'schedule', createdAt: '2026-10-19T20:00:00Z' }, ...OLD_RUNS];
  assert.equal(decide({ nowUtcMs: MON_2317, closeDates: stale, runs: running }).reason, '도는 실행이 있다');
  const recent = [done(new Date(MON_2317 - WATCHDOG.QUIET_MS + 60_000).toISOString()), ...OLD_RUNS];
  assert.equal(decide({ nowUtcMs: MON_2317, closeDates: stale, runs: recent }).reason, '최근 실행이 있다');

  const later = Date.parse('2026-10-20T08:17:00Z');
  const dispatches = (n: number) => Array.from({ length: n }, (_, i) => done(`2026-10-19T2${i}:30:00Z`, 'workflow_dispatch'));
  assert.equal(decide({ nowUtcMs: later, closeDates: stale, runs: dispatches(WATCHDOG.MAX_DISPATCHES_PER_DAY - 1) }).dispatch, true);
  assert.equal(decide({ nowUtcMs: later, closeDates: stale, runs: dispatches(WATCHDOG.MAX_DISPATCHES_PER_DAY) }).dispatch, false);
  // 종가 전의 수동 실행은 세지 않는다
  const before = Array.from({ length: 5 }, (_, i) => done(`2026-10-19T1${i}:00:00Z`, 'workflow_dispatch'));
  assert.equal(decide({ nowUtcMs: later, closeDates: stale, runs: before }).dispatch, true);
});
