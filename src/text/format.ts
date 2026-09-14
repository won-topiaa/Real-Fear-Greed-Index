/**
 * 화면·스토어 그림이 공유하는 포맷 함수. 순수 TS, Intl 미사용(Hermes 편차 회피).
 * 반올림은 core/round.roundTo 한 곳만 거친다.
 */
import { DISPLAY_DIGITS } from '../core/constants';
import { roundTo } from '../core/round';
import type { IsoDate, MarketBlock } from '../core/types';

export const EMPTY = '—';
/** 유니코드 마이너스(U+2212). 하이픈과 구분한다. */
const MINUS = '−';
const KST_OFFSET_MS = 9 * 3_600_000;
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function parseIso(d: IsoDate): { y: number; m: number; day: number; dow: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, day));
  if (Number.isNaN(dt.getTime())) return null;
  return { y, m: mo, day, dow: dt.getUTCDay() };
}

/** FG·Fear·P·RFG — 정수. 63.4 → '63', null → '—' */
export function formatScore(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return EMPTY;
  return String(roundTo(v, DISPLAY_DIGITS.score));
}

/** 비율 → 퍼센트. −0.0431 → '−4.3%'. signed 면 양수에 '+'. */
export function formatPercent(ratio: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (ratio == null || !Number.isFinite(ratio)) return EMPTY;
  const pct = roundTo(ratio * 100, DISPLAY_DIGITS.ratioPercent);
  const body = Math.abs(pct).toFixed(DISPLAY_DIGITS.ratioPercent);
  const sign = pct < 0 ? MINUS : opts.signed && pct > 0 ? '+' : '';
  return `${sign}${body}%`;
}

/** FRM — 소수 2자리 배수. 0.532 → '0.53배' */
export function formatFrm(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return EMPTY;
  return `${roundTo(v, DISPLAY_DIGITS.frm).toFixed(DISPLAY_DIGITS.frm)}배`;
}

/** UTC ISO → 한국 시각(UTC+9 고정 산술). */
export function formatKst(utcIso: string): { date: IsoDate; time: string } {
  const ms = Date.parse(utcIso);
  if (!Number.isFinite(ms)) return { date: EMPTY, time: EMPTY };
  const d = new Date(ms + KST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return { date: d.toISOString().slice(0, 10), time: `${hh}:${mm}` };
}

export function weekdayKo(d: IsoDate): string {
  const p = parseIso(d);
  return p ? WEEKDAY_KO[p.dow] ?? EMPTY : EMPTY;
}

/** '2026-09-11' → long '9월 11일(금)' | short '9/11' */
export function formatTradingDate(d: IsoDate, style: 'long' | 'short' = 'long'): string {
  const p = parseIso(d);
  if (!p) return EMPTY;
  return style === 'short' ? `${p.m}/${p.day}` : `${p.m}월 ${p.day}일(${WEEKDAY_KO[p.dow]})`;
}

/** '미국 9/11(금) 마감 기준 · 한국 9/12 05:00' */
export function formatBasisLine(m: Pick<MarketBlock, 'closeDate' | 'closeAtUtc'>): string {
  const us = `${formatTradingDate(m.closeDate, 'short')}(${weekdayKo(m.closeDate)})`;
  const kst = formatKst(m.closeAtUtc);
  const kstDate = kst.date === EMPTY ? EMPTY : formatTradingDate(kst.date, 'short');
  return `미국 ${us} 마감 기준 · 한국 ${kstDate} ${kst.time}`;
}

export function formatTradingDaysAgo(n: number): string {
  return n <= 0 ? '오늘' : `${n}거래일 전`;
}
