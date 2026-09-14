import { resolve } from 'node:path';
import { collect } from './collect';
import { loadEnv } from './env';
import { createLogger } from './log';
import { startStaticServer } from './serve';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  return fallback;
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
      process.exitCode = r.result === 'failed' ? 1 : 0;
      return;
    }
    case 'serve': {
      await startStaticServer({ dir: resolve(arg('dir', './public') as string), port: Number(arg('port', String(env.PORT))), log });
      return;
    }
    default:
      console.error('usage: tsx src/cli.ts <collect|serve> [--out dir] [--data dir] [--now iso] [--env path] [--dir dir] [--port n]');
      process.exitCode = 2;
  }
}

main().catch((e) => {
  log.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exitCode = 1;
});
