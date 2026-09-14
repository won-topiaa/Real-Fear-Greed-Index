/**
 * 보고서 §5.2 백테스트 리포트. 같은 core 코드를 쓴다.
 * 입력: --data ./.cache (수집 잡의 종가 캐시 + FG 히스토리) 또는 --scenario <key> (합성).
 * 출력: docs/backtest/<date>.md
 */
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateSignals } from '../../src/core/backtest';
import { computeRfgSeries } from '../../src/core/rfg';
import type { FgPoint, IndexSymbol, PricePoint, RfgRow } from '../../src/core/types';
import { FileStore, readJsonFile, writeTextAtomic } from '../src/store/FileStore';
import { makeScenario, type ScenarioKey } from '../src/synth/scenarios';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function loadFromCache(dataDir: string, symbol: IndexSymbol): Promise<{ prices: PricePoint[]; fg: FgPoint[] } | null> {
  const store = new FileStore(dataDir);
  const files = (await readdir(join(dataDir, 'prices')).catch(() => [])).filter((f) => f.startsWith(`${symbol}.`));
  const first = files[0];
  if (!first) return null;
  const cached = await readJsonFile<{ points: PricePoint[] }>(join(dataDir, 'prices', first));
  if (!cached) return null;
  return { prices: cached.points, fg: await store.readFgHistory() };
}

function pct(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : '—';
}

function render(symbol: IndexSymbol, rows: RfgRow[], source: string): string {
  const report = evaluateSignals(rows);
  const lines: string[] = [];
  lines.push(`## ${symbol} (${source}, ${rows.length} rows, FG ${report.fgCoverage.from ?? '—'} ~ ${report.fgCoverage.to ?? '—'}, ${report.fgCoverage.rowsWithFg} rows)`);
  lines.push('');
  lines.push(`| 전략 | 횟수 | 연간 | ${report.horizons.map((h) => `T+${h} 평균`).join(' | ')} | ${report.horizons.map((h) => `T+${h} 승률`).join(' | ')} | 최대 underwater |`);
  lines.push(`|---|---|---|${report.horizons.map(() => '---').join('|')}|${report.horizons.map(() => '---').join('|')}|---|`);
  for (const [key, s] of Object.entries(report.strategies)) {
    lines.push(`| ${key} | ${s.count} | ${Number.isFinite(s.signalsPerYear) ? s.signalsPerYear.toFixed(1) : '—'} | ${s.meanReturn.map(pct).join(' | ')} | ${s.winRate.map(pct).join(' | ')} | ${pct(s.maxUnderwater)} |`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const scenario = arg('scenario') as ScenarioKey | undefined;
  const dataDir = resolve(arg('data', './.cache') as string);
  const outDir = resolve(here, '../../docs/backtest');
  const sections: string[] = [];
  for (const symbol of ['SPX', 'NDX'] as const) {
    let input: { prices: PricePoint[]; fg: FgPoint[] } | null = null;
    let source = 'cache';
    if (scenario) {
      const s = makeScenario(scenario);
      input = { prices: s.prices[symbol], fg: s.fg };
      source = `scenario:${scenario}`;
    } else {
      input = await loadFromCache(dataDir, symbol);
    }
    if (!input) {
      sections.push(`## ${symbol}\n\n데이터 없음 (${dataDir}). 수집 잡을 먼저 돌리거나 --scenario 를 쓰세요.`);
      continue;
    }
    sections.push(render(symbol, computeRfgSeries(input.prices, input.fg), source));
  }
  const date = new Date().toISOString().slice(0, 10);
  const body = `# RFG 백테스트 리포트 (${date})\n\n보고서 §5.2 지표. 파라미터는 src/core/constants.ts 의 RFG_PARAMS. 합성 시나리오 결과는 방법 검증용이지 성과 근거가 아니다.\n\n${sections.join('\n\n')}\n`;
  const path = join(outDir, `${date}${scenario ? `-${scenario}` : ''}.md`);
  await writeTextAtomic(path, body);
  console.log(body);
  console.log(`\nwrote ${path}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
