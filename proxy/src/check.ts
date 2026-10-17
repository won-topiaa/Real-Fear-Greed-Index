/**
 * 게시 상태 점검(2026-10-17). 갱신 지연이 다시 생겨도 조용히 넘어가지 않게 매 수집 뒤에 돈다.
 * - 기대 거래일 종가 12시간 뒤(EDT 08:00Z = 17:00 KST)에도 하루 이상 늦은 지수가 있으면 오류 → 워크플로 실패 → GitHub 실패 메일.
 *   그 전에는 경고만(야후·FRED·대기 잡이 아직 채울 수 있다).
 * - 소스 실패(FRED·야후·CNN), 야후 전용 프록시 실패(예비로 받은 경우 포함)·미설정, 교차검증 경고, 휴장일 목록 만료를 경고로 남긴다.
 */
import { NYSE_HOLIDAYS, closeAtUtcOf, expectedLatestTradingDate, tradingDaysBetween } from '../../src/core/calendar';
import type { IsoDate, RfgSnapshot } from '../../src/core/types';
import { SYMBOLS } from './collect';
import type { StatusJson } from './publish';
import type { Env } from './types';

export const OVERDUE_AFTER_CLOSE_MS = 12 * 60 * 60_000;
/** 휴장일 목록이 이 기간 안에 끝나면 경고 */
const HOLIDAY_HORIZON_MS = 60 * 24 * 60 * 60_000;
/** 막혀 있는 걸 알고 쓰는 소스 — 실패해도 경고하지 않는다 */
const KNOWN_BLOCKED = new Set(['stooq']);

export interface CheckInput {
  snapshot: RfgSnapshot | null;
  status: StatusJson | null;
  env: Env;
  nowUtcMs: number;
  holidays?: readonly IsoDate[];
}

export interface CheckResult {
  expected: IsoDate;
  overdue: boolean;
  rows: Array<{ symbol: string; closeDate: string; behind: number; priceSource: string }>;
  warnings: string[];
  errors: string[];
}

export function checkPublished(input: CheckInput): CheckResult {
  const holidays = input.holidays ?? NYSE_HOLIDAYS;
  const expected = expectedLatestTradingDate(input.nowUtcMs, holidays);
  const overdue = input.nowUtcMs >= Date.parse(closeAtUtcOf(expected)) + OVERDUE_AFTER_CLOSE_MS;
  const r: CheckResult = { expected, overdue, rows: [], warnings: [], errors: [] };

  if (!input.snapshot) {
    r.errors.push('게시된 snapshot.json 이 없다');
  } else {
    for (const sym of SYMBOLS) {
      const m = input.snapshot.markets[sym];
      const behind = Math.max(0, tradingDaysBetween(m.closeDate, expected, holidays));
      r.rows.push({ symbol: sym, closeDate: m.closeDate, behind, priceSource: m.priceSource });
      if (behind === 0) continue;
      const msg = `${sym} 가 ${behind}거래일 늦다(게시 ${m.closeDate}, 기대 ${expected})`;
      (overdue ? r.errors : r.warnings).push(overdue ? `${msg} — 종가 12시간이 지났다` : msg);
    }
  }

  if (input.status) {
    if (input.status.result === 'failed') r.errors.push(`수집 실패: ${input.status.errors.slice(0, 3).join('; ')}`);
    for (const s of input.status.sources) {
      if (KNOWN_BLOCKED.has(s.id)) continue;
      const label = `${s.id}${s.symbol ? `/${s.symbol}` : ''}`;
      if (s.status === 'failed' || s.status === 'invalid' || s.status === 'disabled') {
        r.warnings.push(`${label} ${s.status}: ${s.error ?? ''}`.trim());
      } else if (s.fallbacks?.length) {
        r.warnings.push(`${label}: 앞선 프록시 실패(${s.fallbacks.join(', ')}) — 예비 프록시로 받았다`);
      }
    }
    for (const sym of SYMBOLS) {
      if ((input.status.checks.crossCheck[sym] ?? []).length > 0) r.warnings.push(`${sym} 소스 간 종가 차이 > 0.1% (source-mismatch)`);
    }
  } else {
    r.warnings.push('status.json 이 없다');
  }

  if (!input.env.YAHOO_PROXY_URL.trim()) r.warnings.push('YAHOO_PROXY_URL 이 없다 — 야후는 직접 접속이 429 라 FRED 가 늦는 날 채울 소스가 없다');

  const lastHolidayYear = Math.max(...holidays.map((d) => Number(d.slice(0, 4))));
  const nowYear = new Date(input.nowUtcMs).getUTCFullYear();
  const horizonYear = new Date(input.nowUtcMs + HOLIDAY_HORIZON_MS).getUTCFullYear();
  if (lastHolidayYear < nowYear) r.errors.push(`NYSE_HOLIDAYS 가 ${lastHolidayYear}년까지뿐 — 휴장일을 거래일로 보고 하루 늦었다고 판단한다`);
  else if (lastHolidayYear < horizonYear) r.warnings.push(`NYSE_HOLIDAYS 가 ${lastHolidayYear}년까지뿐 — ${horizonYear}년 휴장일을 src/core/calendar.ts 에 추가할 것`);

  return r;
}

/** GitHub 단계 요약(마크다운) */
export function checkSummary(r: CheckResult): string {
  const lines = [
    `### 게시 점검 (기대 거래일 ${r.expected})`,
    '',
    '| 지수 | 게시 기준일 | 늦음 | 종가 소스 |',
    '|---|---|---|---|',
    ...r.rows.map((x) => `| ${x.symbol} | ${x.closeDate} | ${x.behind === 0 ? '—' : `${x.behind}거래일`} | ${x.priceSource} |`),
    '',
    ...r.errors.map((e) => `- ❌ ${e}`),
    ...r.warnings.map((w) => `- ⚠️ ${w}`),
  ];
  if (r.errors.length === 0 && r.warnings.length === 0) lines.push('- ✅ 이상 없음');
  return `${lines.join('\n')}\n`;
}
