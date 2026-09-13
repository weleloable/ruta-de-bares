import { formatSchedule, formatSealedAt, formatTime } from '../src/lib/format';

describe('formatTime', () => {
  it('strips seconds from a Postgres time value', () => {
    expect(formatTime('19:30:00')).toBe('19:30');
  });

  it('returns the input unchanged if it does not look like HH:MM', () => {
    expect(formatTime('garbage')).toBe('garbage');
  });
});

describe('formatSchedule', () => {
  it('joins start and end time with an en dash', () => {
    expect(formatSchedule('19:00:00', '20:30:00')).toBe('19:00 – 20:30');
  });
});

describe('formatSealedAt', () => {
  it('formats an ISO timestamp as day/month · HH:MM', () => {
    // Local time, so build the expected string from the same Date to avoid
    // hardcoding a timezone-dependent hour in the assertion.
    const iso = '2026-09-13T19:42:00.000Z';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    expect(formatSealedAt(iso)).toBe(`${day}/${month} · ${hours}:${minutes}`);
  });
});
