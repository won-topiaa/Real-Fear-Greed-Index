import { diffCalendarDays } from './calendar';
import type { FgPoint, IsoDate } from './types';

export interface AlignedFg {
  fg: number | null;
  fgDate: IsoDate | null;
  fgStaleDays: number | null;
}

/**
 * FG 를 마스터 달력(종가 거래일)에 as-of 조인한다(DESIGN §3.4).
 * 거래일 d 의 FG = fgDate ≤ d 인 관측 중 최신. d − fgDate > maxStalenessDays 면 결측.
 */
export function alignFgToTradingDays(
  tradingDates: readonly IsoDate[],
  fg: readonly FgPoint[],
  maxStalenessDays: number,
): AlignedFg[] {
  const sorted = [...fg].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: AlignedFg[] = [];
  let j = -1;
  for (const d of tradingDates) {
    while (j + 1 < sorted.length && (sorted[j + 1] as FgPoint).date <= d) j++;
    const cand = j >= 0 ? (sorted[j] as FgPoint) : null;
    if (cand == null) {
      out.push({ fg: null, fgDate: null, fgStaleDays: null });
      continue;
    }
    const stale = diffCalendarDays(cand.date, d);
    if (stale > maxStalenessDays) {
      out.push({ fg: null, fgDate: null, fgStaleDays: null });
      continue;
    }
    out.push({ fg: cand.value, fgDate: cand.date, fgStaleDays: stale });
  }
  return out;
}

const SOURCE_PRIORITY: Record<FgPoint['source'], number> = { 'cnn-historical': 3, own: 2, seed: 1 };

/**
 * 날짜 유일 병합(DESIGN §3.3). 같은 날짜면 소스 우선순위(cnn-historical > own > seed)가 높은 쪽.
 * cnn-historical 끼리는 새로 받은 값이 이긴다 — CNN 은 그날 값을 다음 날 새벽(ET)에 확정하므로 마감 직후 값은 잠정치다
 * (2026-10-14: 마감 뒤 32.4 → 확정 30.1). own·seed 끼리는 기존 값 유지. 결과는 날짜 오름차순.
 */
export function mergeFgHistory(existing: readonly FgPoint[], incoming: readonly FgPoint[]): FgPoint[] {
  const byDate = new Map<IsoDate, FgPoint>();
  for (const p of existing) byDate.set(p.date, p);
  for (const p of incoming) {
    const cur = byDate.get(p.date);
    const rank = SOURCE_PRIORITY[p.source];
    if (cur == null || rank > SOURCE_PRIORITY[cur.source] || (rank === SOURCE_PRIORITY[cur.source] && p.source === 'cnn-historical')) {
      byDate.set(p.date, p);
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
