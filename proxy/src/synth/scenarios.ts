/**
 * 목 모드·스토어 그림·e2e 가 공유하는 시나리오. 각 시나리오는 의도한 국면을 실제로 만들어야 하며
 * build-fixtures 가 classify 로 검증한다(의도와 다르면 실패).
 */
import { addCalendarDays, expectedLatestTradingDate, isTradingDay, NYSE_HOLIDAYS } from '../../../src/core/calendar';
import { DATA_GATES } from '../../../src/core/constants';
import type { FgPoint, IsoDate, PricePoint, Quadrant, RfgZone } from '../../../src/core/types';
import { synthCloses, synthFg, toPricePoints, tradingDatesEndingAt } from './index';

export type ScenarioKey = 'normal' | 'capitulation' | 'bear_trap' | 'complacency' | 'euphoria' | 'healthy_bull' | 'delayed' | 'stale' | 'fg_missing';

export const SCENARIO_KEYS: readonly ScenarioKey[] = ['normal', 'capitulation', 'bear_trap', 'complacency', 'euphoria', 'healthy_bull', 'delayed', 'stale', 'fg_missing'];

/** 시나리오의 마지막 거래일(고정). 잡 시각은 그 다음날 22:30Z 로 둔다. */
export const SCENARIO_CLOSE_DATE: IsoDate = '2026-09-11';
export const SCENARIO_NOW_UTC = '2026-09-11T22:30:00.000Z';
const CLOSES_COUNT = 420;
const FG_DAYS = 150;

export interface Scenario {
  key: ScenarioKey;
  prices: Record<'SPX' | 'NDX', PricePoint[]>;
  fg: FgPoint[];
  /** 기대 최신 거래일을 마지막 종가일보다 이만큼(거래일) 뒤로 민다 — delayed/stale 재현 */
  expectedTradingDaysAhead: number;
  expect: { quadrant: Quadrant; rfgZone: RfgZone };
}

function build(key: ScenarioKey, o: { seedSpx: number; seedNdx: number; drift: number; vol: number; regimes?: Parameters<typeof synthCloses>[1]['regimes']; fgBase: number; fgLast?: number; fgLastDays?: number; ahead?: number; noFg?: boolean; expect: Scenario['expect'] }): Scenario {
  const dates = tradingDatesEndingAt(SCENARIO_CLOSE_DATE, CLOSES_COUNT);
  const spx = synthCloses(CLOSES_COUNT, { seed: o.seedSpx, start: 5600, driftPerDay: o.drift, volPerDay: o.vol, regimes: o.regimes });
  const ndx = synthCloses(CLOSES_COUNT, { seed: o.seedNdx, start: 20500, driftPerDay: o.drift * 1.2, volPerDay: o.vol * 1.25, regimes: o.regimes?.map((r) => ({ ...r, driftPerDay: r.driftPerDay * 1.2, volPerDay: r.volPerDay * 1.25 })) });
  const fgDates = dates.slice(-FG_DAYS);
  const fg = o.noFg ? [] : synthFg(fgDates, { seed: o.seedSpx + 7, base: o.fgBase, amp: 8, lastDays: o.fgLastDays ?? 12, lastValue: o.fgLast ?? o.fgBase });
  return { key, prices: { SPX: toPricePoints(dates, spx), NDX: toPricePoints(dates, ndx) }, fg, expectedTradingDaysAhead: o.ahead ?? 0, expect: o.expect };
}

export function makeScenario(key: ScenarioKey): Scenario {
  switch (key) {
    case 'normal':
      return build(key, { seedSpx: 11, seedNdx: 12, drift: 0.0003, vol: 0.008, fgBase: 50, fgLast: 46, expect: { quadrant: 'NEUTRAL', rfgZone: 'MID' } });
    case 'capitulation':
      return build(key, {
        seedSpx: 21, seedNdx: 22, drift: 0.0003, vol: 0.007,
        regimes: [{ lastDays: 35, driftPerDay: -0.009, volPerDay: 0.028 }],
        fgBase: 45, fgLast: 12, fgLastDays: 15,
        expect: { quadrant: 'Q1', rfgZone: 'CAPITULATION' },
      });
    case 'bear_trap':
      return build(key, {
        seedSpx: 31, seedNdx: 32, drift: 0.0004, vol: 0.006,
        regimes: [{ lastDays: 60, driftPerDay: 0.0012, volPerDay: 0.005 }],
        fgBase: 45, fgLast: 22, fgLastDays: 8,
        expect: { quadrant: 'Q4', rfgZone: 'MID' },
      });
    case 'complacency':
      return build(key, {
        seedSpx: 41, seedNdx: 42, drift: 0.0003, vol: 0.007,
        regimes: [{ lastDays: 30, driftPerDay: -0.007, volPerDay: 0.022 }],
        fgBase: 62, fgLast: 74, fgLastDays: 10,
        expect: { quadrant: 'Q2', rfgZone: 'MID' },
      });
    case 'euphoria':
      return build(key, {
        seedSpx: 51, seedNdx: 52, drift: 0.0004, vol: 0.006,
        regimes: [{ lastDays: 60, driftPerDay: 0.0025, volPerDay: 0.004 }],
        fgBase: 70, fgLast: 93, fgLastDays: 10,
        expect: { quadrant: 'Q3', rfgZone: 'EUPHORIA' },
      });
    case 'healthy_bull':
      return build(key, {
        seedSpx: 68, seedNdx: 72, drift: 0.0004, vol: 0.006,
        regimes: [{ lastDays: 60, driftPerDay: 0.0015, volPerDay: 0.005 }],
        fgBase: 60, fgLast: 68, fgLastDays: 10,
        expect: { quadrant: 'Q3', rfgZone: 'MID' },
      });
    case 'delayed':
      return build(key, { seedSpx: 11, seedNdx: 12, drift: 0.0003, vol: 0.008, fgBase: 50, fgLast: 46, ahead: 2, expect: { quadrant: 'NEUTRAL', rfgZone: 'MID' } });
    case 'stale':
      return build(key, { seedSpx: 11, seedNdx: 12, drift: 0.0003, vol: 0.008, fgBase: 50, fgLast: 46, ahead: DATA_GATES.STALE_AFTER_TRADING_DAYS + 2, expect: { quadrant: 'NEUTRAL', rfgZone: 'MID' } });
    case 'fg_missing':
      return build(key, { seedSpx: 11, seedNdx: 12, drift: 0.0003, vol: 0.008, fgBase: 50, noFg: true, expect: { quadrant: 'UNKNOWN', rfgZone: 'UNKNOWN' } });
  }
}

/** 시나리오의 기대 최신 거래일 (ahead 만큼 미래 거래일) — delayed/stale 재현용 */
export function scenarioExpectedDate(s: Scenario): IsoDate {
  let date = expectedLatestTradingDate(Date.parse(SCENARIO_NOW_UTC), NYSE_HOLIDAYS);
  for (let i = 0; i < s.expectedTradingDaysAhead; i++) {
    do {
      date = addCalendarDays(date, 1);
    } while (!isTradingDay(date, NYSE_HOLIDAYS));
  }
  return date;
}
