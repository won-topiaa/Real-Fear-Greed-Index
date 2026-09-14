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

const SOURCE_PRIORITY: Record<FgPoint['source'], number> = { own: 3, 'cnn-historical': 2, seed: 1 };

/**
 * 날짜 유일 병합. 같은 날짜면 소스 우선순위(own > cnn-historical > seed)가 높은 쪽,
 * 같은 우선순위면 기존 값 유지(첫 관측 불변). 결과는 날짜 오름차순.
 */
export function mergeFgHistory(existing: readonly FgPoint[], incoming: readonly FgPoint[]): FgPoint[] {
  const byDate = new Map<IsoDate, FgPoint>();
  for (const p of existing) byDate.set(p.date, p);
  for (const p of incoming) {
    const cur = byDate.get(p.date);
    if (cur == null || SOURCE_PRIORITY[p.source] > SOURCE_PRIORITY[cur.source]) byDate.set(p.date, p);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
