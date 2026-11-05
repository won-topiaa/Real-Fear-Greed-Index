/**
 * 감시 워커(proxy/watchdog/worker.ts)의 판단 — 순수 함수라 node 테스트로 검사한다(test/watchdog.test.ts).
 * GitHub 예약 실행은 2~7시간 늦고 가끔 건너뛰며, 통째로 멈추면 게시 점검(Freshness check)도 돌지 않아 아무도 모른다.
 * 그래서 GitHub 밖(Cloudflare cron)에서 게시본을 보고, 늦었으면 collect 워크플로를 직접 돌린다.
 * 돌리는 조건: 데이터가 나왔을 시각이 지났고, 게시본이 기대 거래일보다 늦고, 도는 실행·최근 실행이 없고, 그 거래일에 돌린 횟수가 상한 밑.
 */
import { NYSE_HOLIDAYS, closeAtUtcOf, expectedLatestTradingDate, tradingDaysBetween } from '../../src/core/calendar';
import type { IndexSymbol, IsoDate } from '../../src/core/types';

export const WATCHDOG = {
  /**
   * 기대 거래일의 이 시각(UTC)부터 돌린다. 매시 20분 cron(wrangler.toml)과 맞물려 첫 수집이 1년 내내 22:20Z = 07:20 KST 에 돈다.
   * 야후 최종값이 ^GSPC 16:34 ET · ^NDX 17:15 ET 쯤 굳어서(2026-11-05 실측) EST(22:15Z)에도 첫 게시값이 확정값이다.
   * 틱이 조금 앞서 와도 한 시간을 놓치지 않게 20분이 아니라 15분으로 둔다.
   */
  FIRST_RUN_UTC: '22:15',
  /** 종가 뒤 이 안에 만들어진 실행이 있으면 돌리지 않는다(그 실행과 wait-for-fred 에 맡긴다). 종가 전 실행은 그날 값을 못 받았으니 세지 않는다 */
  QUIET_MS: 110 * 60_000,
  /** 한 거래일(종가 뒤)에 workflow_dispatch 실행이 이만큼 쌓이면 더 돌리지 않는다 — 소스가 죽은 날 실패 메일이 쏟아지지 않게 */
  MAX_DISPATCHES_PER_DAY: 4,
} as const;

const SYMBOLS: readonly IndexSymbol[] = ['SPX', 'NDX'];

export interface RunInfo {
  /** GitHub workflow run status: queued · in_progress · waiting · requested · pending · completed */
  status: string;
  event: string;
  createdAt: string;
}

export interface WatchdogInput {
  nowUtcMs: number;
  /** 게시된 snapshot.json 의 지수별 closeDate. 게시본을 못 읽었으면 null */
  closeDates: Partial<Record<IndexSymbol, string>> | null;
  /** collect 워크플로의 최근 실행(최신 순 20개면 충분) */
  runs: readonly RunInfo[];
  holidays?: readonly IsoDate[];
}

export interface Decision {
  dispatch: boolean;
  reason: string;
  expected: IsoDate;
}

export function decide(input: WatchdogInput): Decision {
  const holidays = input.holidays ?? NYSE_HOLIDAYS;
  const expected = expectedLatestTradingDate(input.nowUtcMs, holidays);
  const closeMs = Date.parse(closeAtUtcOf(expected));
  const no = (reason: string): Decision => ({ dispatch: false, reason, expected });

  if (input.nowUtcMs < Date.parse(`${expected}T${WATCHDOG.FIRST_RUN_UTC}:00Z`)) return no(`${expected} 07:20 KST 대기 중`);

  let behind = 0;
  for (const sym of SYMBOLS) {
    const d = input.closeDates?.[sym];
    behind = Math.max(behind, d ? tradingDaysBetween(d, expected, holidays) : Number.POSITIVE_INFINITY);
  }
  if (behind <= 0) return no(`${expected} 까지 게시됨`);

  if (input.runs.some((r) => r.status !== 'completed')) return no('도는 실행이 있다');
  const quietFrom = Math.max(closeMs, input.nowUtcMs - WATCHDOG.QUIET_MS);
  if (input.runs.some((r) => Date.parse(r.createdAt) > quietFrom)) return no('최근 실행이 있다');
  const dispatched = input.runs.filter((r) => r.event === 'workflow_dispatch' && Date.parse(r.createdAt) >= closeMs).length;
  if (dispatched >= WATCHDOG.MAX_DISPATCHES_PER_DAY) return no(`${expected} 에 이미 ${dispatched}번 돌렸다`);

  const lag = Number.isFinite(behind) ? `${behind}거래일 늦음` : '게시본을 못 읽음';
  return { dispatch: true, reason: `${expected} 기준 ${lag}`, expected };
}
