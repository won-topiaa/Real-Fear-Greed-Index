/**
 * RFG 감시 워커(Cloudflare Worker, cron 매시 17분). 게시본이 늦으면 GitHub collect 워크플로를 workflow_dispatch 로 돌린다.
 * 판단은 decide.ts. 공개 주소가 없다(workers_dev = false) — cron 으로만 돈다.
 * 비밀값 GH_DISPATCH_TOKEN: 이 저장소 하나만, Actions 읽기·쓰기 권한의 fine-grained 토큰. 없으면 아무것도 하지 않는다.
 *   넣기: proxy/ 에서 `npx wrangler secret put GH_DISPATCH_TOKEN --config watchdog/wrangler.toml`
 * 배포: proxy/ 에서 `npm run deploy-watchdog`. 로그: `npx wrangler tail rfg-watchdog`.
 */
import { decide, type RunInfo } from './decide';

interface Env {
  GH_DISPATCH_TOKEN?: string;
  GH_REPO: string;
  GH_WORKFLOW: string;
  GH_REF: string;
  PAGES_BASE: string;
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

function gh(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${env.GH_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'rfg-watchdog',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

async function readCloseDates(env: Env, nowUtcMs: number): Promise<Record<string, string> | null> {
  try {
    // Pages 는 10분 캐시라 쿼리로 우회한다
    const res = await fetch(`${env.PAGES_BASE}/v1/snapshot.json?t=${nowUtcMs}`);
    if (!res.ok) return null;
    const snap = (await res.json()) as { markets?: Record<string, { closeDate?: unknown }> };
    const out: Record<string, string> = {};
    for (const [sym, m] of Object.entries(snap.markets ?? {})) if (typeof m.closeDate === 'string') out[sym] = m.closeDate;
    return out;
  } catch {
    return null;
  }
}

export async function check(env: Env, nowUtcMs: number): Promise<string> {
  if (!env.GH_DISPATCH_TOKEN) return 'skip: GH_DISPATCH_TOKEN 없음';
  const closeDates = await readCloseDates(env, nowUtcMs);
  const runsRes = await gh(env, `/actions/workflows/${env.GH_WORKFLOW}/runs?per_page=20`);
  if (!runsRes.ok) return `error: 실행 목록 ${runsRes.status}`;
  const body = (await runsRes.json()) as { workflow_runs?: Array<{ status: string; event: string; created_at: string }> };
  const runs: RunInfo[] = (body.workflow_runs ?? []).map((r) => ({ status: r.status, event: r.event, createdAt: r.created_at }));
  const d = decide({ nowUtcMs, closeDates, runs });
  if (!d.dispatch) return `no: ${d.reason}`;
  const res = await gh(env, `/actions/workflows/${env.GH_WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: env.GH_REF }) });
  return res.status === 204 ? `dispatched: ${d.reason}` : `error: dispatch ${res.status} (${d.reason})`;
}

export default {
  scheduled(_controller: unknown, env: Env, ctx: Ctx): void {
    ctx.waitUntil(check(env, Date.now()).then((m) => console.log(`[rfg-watchdog] ${m}`)));
  },
};
