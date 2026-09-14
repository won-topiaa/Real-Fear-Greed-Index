/**
 * 미국 동부(ET) 달력. Intl 을 쓰지 않는 순수 산술이라 앱(Hermes)과 잡(Node)이 같은 코드를 쓴다.
 * - DST: 3월 둘째 일요일 02:00 (EST) 시작, 11월 첫째 일요일 02:00 (EDT) 종료.
 * - 휴장일은 연 단위 목록. doctor 가 11월부터 내년 목록 존재를 검사한다.
 */
import type { IsoDate } from './types';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** NYSE 휴장일(관측일 기준). 매년 갱신. */
export const NYSE_HOLIDAYS: readonly IsoDate[] = [
  // 2025
  '2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
];

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is IsoDate {
  if (typeof s !== 'string') return false;
  const m = ISO_DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d;
}

function toUtcMidnight(d: IsoDate): number {
  const m = ISO_DATE_RE.exec(d);
  if (!m) throw new Error(`invalid IsoDate: ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

function nthSundayUtc(year: number, monthIndex: number, nth: number): number {
  const first = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay(); // 0 = Sunday
  const firstSunday = 1 + ((7 - first) % 7);
  return firstSunday + (nth - 1) * 7;
}

/** ET 오프셋(분). EDT −240, EST −300. */
export function etOffsetMinutes(utcMs: number): number {
  const year = new Date(utcMs).getUTCFullYear();
  // DST 시작: 3월 둘째 일요일 02:00 EST = 07:00 UTC
  const start = Date.UTC(year, 2, nthSundayUtc(year, 2, 2), 7);
  // DST 종료: 11월 첫째 일요일 02:00 EDT = 06:00 UTC
  const end = Date.UTC(year, 10, nthSundayUtc(year, 10, 1), 6);
  return utcMs >= start && utcMs < end ? -240 : -300;
}

/** UTC 시각 → 뉴욕 달력 날짜 */
export function nyDateOf(utcMs: number): IsoDate {
  return fromUtcMs(utcMs + etOffsetMinutes(utcMs) * MINUTE_MS);
}

/** UTC 시각 → 뉴욕 시각의 하루 중 분(0~1439) */
function nyMinuteOfDay(utcMs: number): number {
  const shifted = utcMs + etOffsetMinutes(utcMs) * MINUTE_MS;
  const d = new Date(shifted);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function diffCalendarDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / DAY_MS);
}

export function addCalendarDays(d: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMidnight(d) + days * DAY_MS);
}

export function isTradingDay(date: IsoDate, holidays: readonly IsoDate[] = NYSE_HOLIDAYS): boolean {
  const dow = new Date(toUtcMidnight(date)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidays.includes(date);
}

/** from < d ≤ to 인 거래일 수. to < from 이면 음수. */
export function tradingDaysBetween(from: IsoDate, to: IsoDate, holidays: readonly IsoDate[] = NYSE_HOLIDAYS): number {
  if (from === to) return 0;
  const sign = from < to ? 1 : -1;
  const [lo, hi] = sign === 1 ? [from, to] : [to, from];
  let count = 0;
  let cur = addCalendarDays(lo, 1);
  while (cur <= hi) {
    if (isTradingDay(cur, holidays)) count++;
    cur = addCalendarDays(cur, 1);
  }
  return sign * count;
}

const MARKET_CLOSE_MINUTE = 16 * 60;

/** 지금 시각 기준 "종가가 있어야 할" 최신 미국 거래일. 16:00 ET 이전이면 전 거래일. */
export function expectedLatestTradingDate(nowUtcMs: number, holidays: readonly IsoDate[] = NYSE_HOLIDAYS): IsoDate {
  let candidate = nyDateOf(nowUtcMs);
  if (nyMinuteOfDay(nowUtcMs) < MARKET_CLOSE_MINUTE) candidate = addCalendarDays(candidate, -1);
  while (!isTradingDay(candidate, holidays)) candidate = addCalendarDays(candidate, -1);
  return candidate;
}

/** 해당 거래일 16:00 ET 를 UTC ISO 로. EDT 면 20:00Z, EST 면 21:00Z. */
export function closeAtUtcOf(date: IsoDate): string {
  const noonUtc = toUtcMidnight(date) + 12 * 60 * MINUTE_MS;
  const offset = etOffsetMinutes(noonUtc);
  return new Date(toUtcMidnight(date) + MARKET_CLOSE_MINUTE * MINUTE_MS - offset * MINUTE_MS).toISOString();
}
