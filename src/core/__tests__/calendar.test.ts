import {
  NYSE_HOLIDAYS,
  addCalendarDays,
  closeAtUtcOf,
  diffCalendarDays,
  etOffsetMinutes,
  expectedLatestTradingDate,
  isIsoDate,
  isTradingDay,
  nyDateOf,
  tradingDaysBetween,
} from '../calendar';

const T = (iso: string) => Date.parse(iso);

describe('calendar — DST 순수 산술', () => {
  test('2026 DST 시작: 3월 둘째 일요일(3/8) 07:00Z 경계', () => {
    expect(etOffsetMinutes(T('2026-03-08T06:59:00Z'))).toBe(-300);
    expect(etOffsetMinutes(T('2026-03-08T07:00:00Z'))).toBe(-240);
  });

  test('2026 DST 종료: 11월 첫째 일요일(11/1) 06:00Z 경계', () => {
    expect(etOffsetMinutes(T('2026-11-01T05:59:00Z'))).toBe(-240);
    expect(etOffsetMinutes(T('2026-11-01T06:00:00Z'))).toBe(-300);
  });

  test('2027 DST 시작 3/14, 종료 11/7', () => {
    expect(etOffsetMinutes(T('2027-03-14T07:00:00Z'))).toBe(-240);
    expect(etOffsetMinutes(T('2027-03-14T06:59:00Z'))).toBe(-300);
    expect(etOffsetMinutes(T('2027-11-07T06:00:00Z'))).toBe(-300);
  });

  test('nyDateOf: 자정 전후', () => {
    expect(nyDateOf(T('2026-09-12T03:59:00Z'))).toBe('2026-09-11'); // 23:59 EDT
    expect(nyDateOf(T('2026-09-12T04:00:00Z'))).toBe('2026-09-12');
    expect(nyDateOf(T('2026-01-17T04:59:00Z'))).toBe('2026-01-16'); // 23:59 EST
  });
});

describe('calendar — 거래일', () => {
  test('주말·휴장일은 거래일이 아니다', () => {
    expect(isTradingDay('2026-09-12')).toBe(false); // 토
    expect(isTradingDay('2026-09-07')).toBe(false); // Labor Day
    expect(isTradingDay('2026-09-11')).toBe(true);
    expect(NYSE_HOLIDAYS).toContain('2027-12-24');
  });

  test('tradingDaysBetween: from < d ≤ to 인 거래일 수, 역방향은 음수', () => {
    expect(tradingDaysBetween('2026-09-11', '2026-09-14')).toBe(1);
    expect(tradingDaysBetween('2026-09-04', '2026-09-08')).toBe(1); // 9/7 휴장
    expect(tradingDaysBetween('2026-09-11', '2026-09-11')).toBe(0);
    expect(tradingDaysBetween('2026-09-14', '2026-09-11')).toBe(-1);
    expect(tradingDaysBetween('2026-09-11', '2026-09-17')).toBe(4);
  });

  test('expectedLatestTradingDate: 16:00 ET 전후, 주말, 휴장일', () => {
    expect(expectedLatestTradingDate(T('2026-09-11T19:59:00Z'))).toBe('2026-09-10'); // 15:59 EDT
    expect(expectedLatestTradingDate(T('2026-09-11T20:00:00Z'))).toBe('2026-09-11'); // 16:00 EDT
    expect(expectedLatestTradingDate(T('2026-09-12T12:00:00Z'))).toBe('2026-09-11'); // 토
    expect(expectedLatestTradingDate(T('2026-09-07T22:00:00Z'))).toBe('2026-09-04'); // Labor Day
    expect(expectedLatestTradingDate(T('2026-09-12T22:30:00Z'))).toBe('2026-09-11'); // 잡 시각(토)
    expect(expectedLatestTradingDate(T('2026-01-16T20:30:00Z'))).toBe('2026-01-15'); // EST 15:30
  });

  test('closeAtUtcOf: EDT 20:00Z, EST 21:00Z', () => {
    expect(closeAtUtcOf('2026-09-11')).toBe('2026-09-11T20:00:00.000Z');
    expect(closeAtUtcOf('2026-01-16')).toBe('2026-01-16T21:00:00.000Z');
  });

  test('달력 산술과 IsoDate 검사', () => {
    expect(diffCalendarDays('2026-09-11', '2026-09-14')).toBe(3);
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-9-1')).toBe(false);
    expect(isIsoDate('2026-09-01')).toBe(true);
  });
});
