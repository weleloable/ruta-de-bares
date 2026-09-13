import { currentLocalTime, isWithinTimeWindow } from '../src/lib/schedule';

describe('isWithinTimeWindow (turno normal, no cruza medianoche)', () => {
  it('is true at the exact start', () => {
    expect(isWithinTimeWindow('19:00:00', '19:00:00', '20:00:00')).toBe(true);
  });

  it('is true at the exact end', () => {
    expect(isWithinTimeWindow('20:00:00', '19:00:00', '20:00:00')).toBe(true);
  });

  it('is true in the middle', () => {
    expect(isWithinTimeWindow('19:30:00', '19:00:00', '20:00:00')).toBe(true);
  });

  it('is false before the start', () => {
    expect(isWithinTimeWindow('18:59:59', '19:00:00', '20:00:00')).toBe(false);
  });

  it('is false after the end', () => {
    expect(isWithinTimeWindow('20:00:01', '19:00:00', '20:00:00')).toBe(false);
  });
});

describe('isWithinTimeWindow (turno que cruza medianoche)', () => {
  it('is true right after the start, late at night', () => {
    expect(isWithinTimeWindow('23:45:00', '23:30:00', '01:00:00')).toBe(true);
  });

  it('is true right before the end, past midnight', () => {
    expect(isWithinTimeWindow('00:45:00', '23:30:00', '01:00:00')).toBe(true);
  });

  it('is false in the middle of the day, outside the window', () => {
    expect(isWithinTimeWindow('12:00:00', '23:30:00', '01:00:00')).toBe(false);
  });

  it('is false just before the start', () => {
    expect(isWithinTimeWindow('23:29:59', '23:30:00', '01:00:00')).toBe(false);
  });

  it('is false just after the end', () => {
    expect(isWithinTimeWindow('01:00:01', '23:30:00', '01:00:00')).toBe(false);
  });
});

describe('currentLocalTime', () => {
  it('formats a Date as HH:MM:SS', () => {
    const d = new Date(2026, 8, 13, 9, 5, 3); // 13 sep 2026, 09:05:03 local
    expect(currentLocalTime(d)).toBe('09:05:03');
  });

  it('pads midnight correctly', () => {
    const d = new Date(2026, 8, 13, 0, 0, 0);
    expect(currentLocalTime(d)).toBe('00:00:00');
  });
});
