import { isIsoDate, isTradingDay } from '../../core/calendar';
import { WORLD_EVENTS } from '../events';

describe('WORLD_EVENTS — 주요 사건 목록', () => {
  test('날짜는 ISO, 오래된 → 최신, 중복 없음, 지수 계산 시작(2020-07-15) 이후', () => {
    let prev = '';
    for (const e of WORLD_EVENTS) {
      expect(isIsoDate(e.date)).toBe(true);
      expect(e.date > prev).toBe(true);
      expect(e.date >= '2020-07-15').toBe(true);
      prev = e.date;
    }
  });

  test('모든 날짜가 미국 거래일(주말·알려진 휴장일 아님)', () => {
    for (const e of WORLD_EVENTS) expect([e.date, isTradingDay(e.date)]).toEqual([e.date, true]);
  });

  test('제목·설명이 비어 있지 않다', () => {
    for (const e of WORLD_EVENTS) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.description.trim().length).toBeGreaterThan(0);
    }
  });
});
