import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isIsoDate } from '../../src/core/calendar';
import type { IndexSymbol } from '../../src/core/types';
import { checkPublished, checkSummary } from './check';
import { SYMBOLS, collect } from './collect';
import { loadEnv } from './env';
import { createLogger, maskSecrets } from './log';
import { STATUS_PATH, readPublishedSnapshot, type StatusJson } from './publish';
import { startStaticServer } from './serve';
import { readJsonFile } from './store/FileStore';
import { laggingSymbols, waitForFred } from './wait';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  return fallback;
}

/** GitHub Actions 단계 출력(steps.<id>.outputs.<name>). 로컬에서는 아무것도 안 한다. */
function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

/** GitHub Actions 주석(::warning:: / ::error::) — 실행 요약·실패 메일에 보인다. 로컬에서는 로그로. */
function annotate(level: 'warning' | 'error', msg: string): void {
  const text = maskSecrets(msg).replace(/\r?\n/g, ' ');
  if (process.env.GITHUB_ACTIONS) console.log(`::${level}::${text}`);
  else log[level === 'error' ? 'error' : 'warn'](text);
}

function parseSymbols(text: string): IndexSymbol[] {
  const out = text.split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of out) if (!(SYMBOLS as readonly string[]).includes(s)) throw new Error(`invalid symbol: ${s}`);
  return out as IndexSymbol[];
}

const command = process.argv[2];
const log = createLogger();
const env = loadEnv({ envFilePath: resolve(process.cwd(), arg('env', '.env') as string) });

async function main(): Promise<void> {
  switch (command) {
    case 'collect': {
      const nowArg = arg('now');
      const nowUtcMs = nowArg ? Date.parse(nowArg) : undefined;
      if (nowArg && !Number.isFinite(nowUtcMs)) throw new Error(`invalid --now: ${nowArg}`);
      const r = await collect({
        outDir: resolve(arg('out', './public') as string),
        dataDir: resolve(arg('data', './.cache') as string),
        env,
        log,
        nowUtcMs,
        runId: process.env.GITHUB_RUN_ID ? `gha-${process.env.GITHUB_RUN_ID}` : undefined,
      });
      log.info(`result=${r.result} errors=${r.status.errors.length}`);
      const lagging = laggingSymbols(r.status, Date.parse(r.status.runAtUtc));
      if (lagging.length > 0) log.info(`lagging=${lagging.join(',')} (FRED not yet at ${r.status.expectedLatestTradingDate})`);
      setOutput('expected', r.status.expectedLatestTradingDate);
      setOutput('lagging', lagging.join(','));
      process.exitCode = r.result === 'failed' ? 1 : 0;
      return;
    }
    case 'wait': {
      const symbols = parseSymbols(arg('symbols', '') as string);
      const expected = arg('expected');
      if (symbols.length === 0) throw new Error('--symbols is empty');
      if (!isIsoDate(expected)) throw new Error(`invalid --expected: ${expected}`);
      const intervalMs = Number(arg('interval-min', '10')) * 60_000;
      const maxWaitMs = Number(arg('max-wait-min', '300')) * 60_000;
      if (!(intervalMs > 0) || !(maxWaitMs > 0)) throw new Error('invalid --interval-min / --max-wait-min');
      const ready = await waitForFred({ symbols, expected, env, log, intervalMs, maxWaitMs });
      log.info(`ready=${ready.join(',') || 'none'}`);
      if (ready.length === 0) annotate('warning', `FRED ${symbols.join(',')} 가 시한까지 ${expected} 에 닿지 않았다 — 야후도 실패한 날이다. 다음 예약 실행·게시 점검을 볼 것`);
      setOutput('ready', ready.join(','));
      return;
    }
    case 'check': {
      const outDir = resolve(arg('out', './public') as string);
      const nowArg = arg('now');
      const nowUtcMs = nowArg ? Date.parse(nowArg) : Date.now();
      if (!Number.isFinite(nowUtcMs)) throw new Error(`invalid --now: ${nowArg}`);
      const status = await readJsonFile<StatusJson>(join(outDir, STATUS_PATH)).catch(() => null);
      const r = checkPublished({ snapshot: await readPublishedSnapshot(outDir), status, env, nowUtcMs });
      const summary = checkSummary(r);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
      else console.log(summary);
      for (const w of r.warnings) annotate('warning', w);
      for (const e of r.errors) annotate('error', e);
      process.exitCode = r.errors.length > 0 ? 1 : 0;
      return;
    }
    case 'serve': {
      await startStaticServer({ dir: resolve(arg('dir', './public') as string), port: Number(arg('port', String(env.PORT))), log });
      return;
    }
    default:
      console.error('usage: tsx src/cli.ts <collect|wait|check|serve> [--out dir] [--data dir] [--now iso] [--env path] [--symbols SPX,NDX --expected date [--interval-min n] [--max-wait-min n]] [--dir dir] [--port n]');
      process.exitCode = 2;
  }
}

main().catch((e) => {
  log.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exitCode = 1;
});
