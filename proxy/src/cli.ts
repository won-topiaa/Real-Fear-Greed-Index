import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isIsoDate } from '../../src/core/calendar';
import type { IndexSymbol } from '../../src/core/types';
import { SYMBOLS, collect } from './collect';
import { loadEnv } from './env';
import { createLogger } from './log';
import { startStaticServer } from './serve';
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
      setOutput('ready', ready.join(','));
      return;
    }
    case 'serve': {
      await startStaticServer({ dir: resolve(arg('dir', './public') as string), port: Number(arg('port', String(env.PORT))), log });
      return;
    }
    default:
      console.error('usage: tsx src/cli.ts <collect|wait|serve> [--out dir] [--data dir] [--now iso] [--env path] [--symbols SPX,NDX --expected date [--interval-min n] [--max-wait-min n]] [--dir dir] [--port n]');
      process.exitCode = 2;
  }
}

main().catch((e) => {
  log.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exitCode = 1;
});
