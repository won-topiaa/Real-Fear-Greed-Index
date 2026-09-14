import { diffCalendarDays, isIsoDate } from './calendar';
import { DATA_GATES, type DataGates } from './constants';
import type { FgPoint, PricePoint, ValidationIssue } from './types';

/**
 * 종가 시계열 검증. fatal 이 하나라도 있으면 그 소스는 쓰지 않는다.
 * gap 은 경고(장기 휴장 케이스 수동 확인용).
 */
export function validatePriceSeries(prices: readonly PricePoint[], gates: DataGates = DATA_GATES): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < prices.length; i++) {
    const cur = prices[i] as PricePoint;
    if (!isIsoDate(cur.date)) {
      issues.push({ code: 'unsorted', index: i, date: cur.date, fatal: true, detail: 'invalid date' });
      continue;
    }
    if (!Number.isFinite(cur.close)) {
      issues.push({ code: 'non-finite', index: i, date: cur.date, fatal: true });
    } else if (cur.close <= 0) {
      issues.push({ code: 'non-positive', index: i, date: cur.date, fatal: true });
    }
    if (i === 0) continue;
    const prev = prices[i - 1] as PricePoint;
    if (cur.date === prev.date) {
      issues.push({ code: 'duplicate-date', index: i, date: cur.date, fatal: true });
    } else if (cur.date < prev.date) {
      issues.push({ code: 'unsorted', index: i, date: cur.date, fatal: true });
    } else if (isIsoDate(prev.date)) {
      const gap = diffCalendarDays(prev.date, cur.date);
      if (gap > gates.MAX_CALENDAR_GAP_DAYS) {
        issues.push({ code: 'gap', index: i, date: cur.date, fatal: false, detail: `${gap} calendar days` });
      }
    }
    if (Number.isFinite(cur.close) && cur.close > 0 && Number.isFinite(prev.close) && prev.close > 0) {
      const r = Math.abs(Math.log(cur.close / prev.close));
      if (r > gates.MAX_ABS_LOG_RETURN) {
        issues.push({ code: 'jump', index: i, date: cur.date, fatal: true, detail: `|log return| = ${r.toFixed(4)}` });
      }
    }
  }
  if (prices.length < gates.MIN_CLOSES) {
    issues.push({ code: 'too-short', fatal: true, detail: `${prices.length} < ${gates.MIN_CLOSES}` });
  }
  return issues;
}

/**
 * 두 소스의 겹치는 최근 lastNDays 거래일 종가를 비교한다. 상대오차 > maxRelError 면 'source-mismatch'(경고).
 * a 의 마지막 lastNDays 날짜 중 b 에도 있는 날짜만 비교한다.
 */
export function crossCheckPriceSeries(
  a: readonly PricePoint[],
  b: readonly PricePoint[],
  lastNDays: number,
  maxRelError: number,
): ValidationIssue[] {
  const bByDate = new Map<string, number>();
  for (const p of b) bByDate.set(p.date, p.close);
  const issues: ValidationIssue[] = [];
  const start = Math.max(0, a.length - lastNDays);
  for (let i = start; i < a.length; i++) {
    const pa = a[i] as PricePoint;
    const cb = bByDate.get(pa.date);
    if (cb == null || !(cb > 0)) continue;
    const rel = Math.abs(pa.close - cb) / cb;
    if (rel > maxRelError) {
      issues.push({ code: 'source-mismatch', index: i, date: pa.date, fatal: false, detail: `rel error ${rel.toFixed(5)}` });
    }
  }
  return issues;
}

/** FG 관측 시계열 검증: 날짜 유효·오름차순·유일, 값은 0~100 유한수. */
export function validateFgSeries(fg: readonly FgPoint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < fg.length; i++) {
    const cur = fg[i] as FgPoint;
    if (!isIsoDate(cur.date)) {
      issues.push({ code: 'unsorted', index: i, date: cur.date, fatal: true, detail: 'invalid date' });
    }
    if (!Number.isFinite(cur.value)) {
      issues.push({ code: 'non-finite', index: i, date: cur.date, fatal: true });
    } else if (cur.value < 0 || cur.value > 100) {
      issues.push({ code: 'out-of-range', index: i, date: cur.date, fatal: true, detail: String(cur.value) });
    }
    if (i === 0) continue;
    const prev = fg[i - 1] as FgPoint;
    if (cur.date === prev.date) issues.push({ code: 'duplicate-date', index: i, date: cur.date, fatal: true });
    else if (cur.date < prev.date) issues.push({ code: 'unsorted', index: i, date: cur.date, fatal: true });
  }
  return issues;
}
