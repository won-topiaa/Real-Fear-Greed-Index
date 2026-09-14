import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cnnEpochToDate, normalizeCnnHistory, parseCnn, validateCnn } from '../src/sources/cnn';
import { normalizeFred, parseFred } from '../src/sources/fred';
import { normalizeStooq, parseStooq } from '../src/sources/stooq';
import { normalizeYahoo, parseYahoo } from '../src/sources/yahoo';
import { cnnJson, fredJson, stooqCsv, yahooJson } from '../src/synth';
import type { FgPoint, PricePoint } from '../../src/core/types';

const SERIES: PricePoint[] = [
  { date: '2026-09-09', close: 6500.12 },
  { date: '2026-09-10', close: 6510.5 },
  { date: '2026-09-11', close: 6498.01 },
];

test('FRED: 형태 가정 픽스처 파싱, "." 결측 제거 [검증 필요]', () => {
  const rows = parseFred(fredJson(SERIES, { holes: ['2026-09-10'] }));
  assert.equal(rows.length, 3);
  const out = normalizeFred(rows);
  assert.deepEqual(out, [
    { date: '2026-09-09', close: 6500.12 },
    { date: '2026-09-11', close: 6498.01 },
  ]);
});

test('FRED: 잘못된 형태는 명확히 실패한다', () => {
  assert.throws(() => parseFred('not json'), /schema: \$/);
  assert.throws(() => parseFred('{"observations": "x"}'), /schema: observations/);
  assert.throws(() => parseFred('{"observations": [{"date": 1, "value": "1"}]}'), /observations\[0\]\.date/);
  assert.throws(() => normalizeFred([{ date: '2026-09-09', value: 'abc' }]), /value abc/);
  assert.deepEqual(normalizeFred(parseFred('{"observations": []}')), []);
});

test('Stooq: CSV 파싱, "No data" 는 schema 실패 [검증 필요]', () => {
  const out = normalizeStooq(parseStooq(stooqCsv(SERIES)));
  assert.deepEqual(out, SERIES);
  assert.throws(() => parseStooq('No data'), /schema: header/);
  assert.throws(() => parseStooq(''), /schema: empty/);
  assert.throws(() => parseStooq('Date,Open,High,Low,Close,Volume\n2026-09-09,1,2'), /row 1/);
  assert.throws(() => normalizeStooq([{ Date: '2026-09-09', Close: 'x' }]), /Close x/);
});

test('Yahoo: timestamp→뉴욕 날짜, null 종가 제거 [검증 필요]', () => {
  const out = normalizeYahoo(parseYahoo(yahooJson(SERIES, { nulls: ['2026-09-10'] })));
  assert.deepEqual(out, [
    { date: '2026-09-09', close: 6500.12 },
    { date: '2026-09-11', close: 6498.01 },
  ]);
  assert.throws(() => parseYahoo('{"chart":{"result":null,"error":{"code":"Not Found"}}}'), /chart\.error/);
  assert.throws(() => parseYahoo('{"chart":{"result":[{"timestamp":[1],"indicators":{"quote":[{"close":[1,2]}]}}]}}'), /length/);
  assert.throws(() => parseYahoo('{"chart":{"result":[{"timestamp":["a"],"indicators":{"quote":[{"close":[1]}]}}]}}'), /timestamp\[0\]/);
});

test('CNN: 형태 가정 픽스처 파싱·검증·정규화 [검증 필요]', () => {
  const hist: FgPoint[] = [
    { date: '2026-09-09', value: 40.1, source: 'cnn-historical' },
    { date: '2026-09-10', value: 43.5, source: 'cnn-historical' },
  ];
  const parsed = parseCnn(cnnJson(hist, { score: 41.2, timestamp: '2026-09-11T23:59:58+00:00' }));
  assert.equal(parsed.current.score, 41.2);
  assert.equal(validateCnn(parsed, Date.parse('2026-09-12T00:00:00Z')), null);
  assert.deepEqual(normalizeCnnHistory(parsed), hist);
});

test('CNN: 범위·형태 오류', () => {
  assert.throws(() => parseCnn('{}'), /fear_and_greed$/);
  assert.throws(() => parseCnn('{"fear_and_greed":{"score":"41"},"fear_and_greed_historical":{"data":[]}}'), /score/);
  assert.throws(() => parseCnn('{"fear_and_greed":{"score":41},"fear_and_greed_historical":{"data":[{"x":"a","y":1}]}}'), /data\[0\]\.x/);
  const parsed = parseCnn('{"fear_and_greed":{"score":141},"fear_and_greed_historical":{"data":[]}}');
  assert.equal(validateCnn(parsed, Date.now()), 'range: score');
  const future = parseCnn(`{"fear_and_greed":{"score":41},"fear_and_greed_historical":{"data":[{"x":${Date.UTC(2099, 0, 1)},"y":50}]}}`);
  assert.equal(validateCnn(future, Date.parse('2026-09-12T00:00:00Z')), 'range: historical.x');
});

test('CNN: epoch → 날짜 규칙 (UTC 자정이면 UTC 날짜, 아니면 뉴욕 날짜)', () => {
  assert.equal(cnnEpochToDate(Date.UTC(2026, 8, 11)), '2026-09-11');
  assert.equal(cnnEpochToDate(Date.parse('2026-09-12T03:30:00Z')), '2026-09-11'); // 23:30 EDT
  assert.equal(cnnEpochToDate(Date.parse('2026-09-12T04:30:00Z')), '2026-09-12');
});
