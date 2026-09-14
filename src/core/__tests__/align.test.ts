import { alignFgToTradingDays, mergeFgHistory } from '../align';
import type { FgPoint } from '../types';

describe('alignFgToTradingDays — as-of 조인 (DESIGN §3.4)', () => {
  const tradingDates = ['2026-09-14', '2026-09-15', '2026-09-16'];

  test('토요일 관측 FG 가 월요일 행에 붙고 fgStaleDays = 2, 화요일은 3', () => {
    const fg: FgPoint[] = [{ date: '2026-09-12', value: 41, source: 'own' }];
    const out = alignFgToTradingDays(tradingDates, fg, 5);
    expect(out[0]).toEqual({ fg: 41, fgDate: '2026-09-12', fgStaleDays: 2 });
    expect(out[1]).toEqual({ fg: 41, fgDate: '2026-09-12', fgStaleDays: 3 });
  });

  test('허용일수를 넘으면 결측(null)', () => {
    const fg: FgPoint[] = [{ date: '2026-09-07', value: 41, source: 'own' }];
    const out = alignFgToTradingDays(tradingDates, fg, 5);
    expect(out[0]).toEqual({ fg: null, fgDate: null, fgStaleDays: null }); // 7일
  });

  test('미래 관측은 쓰지 않고, 출력 길이는 거래일 수와 같다(휴장일 FG 는 행을 만들지 않음)', () => {
    const fg: FgPoint[] = [
      { date: '2026-09-15', value: 50, source: 'own' },
      { date: '2026-09-13', value: 45, source: 'own' }, // 일요일 관측(정렬 전 순서 섞음)
    ];
    const out = alignFgToTradingDays(tradingDates, fg, 5);
    expect(out).toHaveLength(3);
    expect(out[0]?.fg).toBe(45);
    expect(out[1]?.fg).toBe(50);
    expect(out[2]).toEqual({ fg: 50, fgDate: '2026-09-15', fgStaleDays: 1 });
  });

  test('관측이 하나도 없으면 전부 null', () => {
    expect(alignFgToTradingDays(tradingDates, [], 5).every((x) => x.fg === null)).toBe(true);
  });
});

describe('mergeFgHistory — 날짜 유일, own > cnn-historical > seed, 같은 소스면 기존 값 유지', () => {
  test('own 이 cnn-historical 을 대체하고, cnn-historical 은 own 을 대체하지 못한다', () => {
    const existing: FgPoint[] = [
      { date: '2026-09-10', value: 40, source: 'cnn-historical' },
      { date: '2026-09-11', value: 42, source: 'own' },
    ];
    const incoming: FgPoint[] = [
      { date: '2026-09-10', value: 41, source: 'own' },
      { date: '2026-09-11', value: 99, source: 'cnn-historical' },
      { date: '2026-09-09', value: 38, source: 'cnn-historical' },
    ];
    const merged = mergeFgHistory(existing, incoming);
    expect(merged.map((p) => p.date)).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
    expect(merged[1]).toEqual({ date: '2026-09-10', value: 41, source: 'own' });
    expect(merged[2]?.value).toBe(42);
  });

  test('같은 소스의 같은 날짜는 첫 관측을 유지한다(정정은 무시)', () => {
    const merged = mergeFgHistory(
      [{ date: '2026-09-10', value: 40, source: 'own' }],
      [{ date: '2026-09-10', value: 45, source: 'own' }],
    );
    expect(merged).toEqual([{ date: '2026-09-10', value: 40, source: 'own' }]);
  });
});
