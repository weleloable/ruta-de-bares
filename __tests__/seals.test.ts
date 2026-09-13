import { buildStampEntries, computeGroupProgress, computeProgress } from '../src/lib/seals';
import type { Bar, Seal } from '../src/types/domain';

function makeBar(overrides: Partial<Bar>): Bar {
  return {
    id: 'bar-1',
    routeId: 'route-1',
    name: 'Bar Test',
    address: null,
    latitude: 0,
    longitude: 0,
    startTime: '19:00:00',
    endTime: '20:00:00',
    orderIndex: 0,
    ...overrides,
  };
}

function makeSeal(overrides: Partial<Seal>): Seal {
  return {
    id: 'seal-1',
    routeId: 'route-1',
    barId: 'bar-1',
    userId: 'user-1',
    sealedAt: '2026-09-13T19:42:00.000Z',
    ...overrides,
  };
}

describe('buildStampEntries', () => {
  it('marks sealed bars with their timestamp and unsealed ones as null', () => {
    const bars = [
      makeBar({ id: 'bar-1', orderIndex: 0 }),
      makeBar({ id: 'bar-2', orderIndex: 1 }),
    ];
    const seals = [makeSeal({ barId: 'bar-1', sealedAt: '2026-09-13T19:42:00.000Z' })];

    const entries = buildStampEntries(bars, seals);

    expect(entries).toEqual([
      { bar: bars[0], sealedAt: '2026-09-13T19:42:00.000Z' },
      { bar: bars[1], sealedAt: null },
    ]);
  });

  it('sorts by orderIndex regardless of input order', () => {
    const bars = [makeBar({ id: 'bar-2', orderIndex: 1 }), makeBar({ id: 'bar-1', orderIndex: 0 })];
    const entries = buildStampEntries(bars, []);
    expect(entries.map((e) => e.bar.id)).toEqual(['bar-1', 'bar-2']);
  });
});

describe('computeProgress', () => {
  it('is not complete with zero bars', () => {
    expect(computeProgress([])).toEqual({ sealed: 0, total: 0, complete: false });
  });

  it('is complete only when every bar is sealed', () => {
    const entries = buildStampEntries(
      [makeBar({ id: 'bar-1', orderIndex: 0 }), makeBar({ id: 'bar-2', orderIndex: 1 })],
      [makeSeal({ barId: 'bar-1' }), makeSeal({ barId: 'bar-2', id: 'seal-2' })]
    );
    expect(computeProgress(entries)).toEqual({ sealed: 2, total: 2, complete: true });
  });

  it('is not complete when some bars are missing', () => {
    const entries = buildStampEntries(
      [makeBar({ id: 'bar-1', orderIndex: 0 }), makeBar({ id: 'bar-2', orderIndex: 1 })],
      [makeSeal({ barId: 'bar-1' })]
    );
    expect(computeProgress(entries)).toEqual({ sealed: 1, total: 2, complete: false });
  });
});

describe('computeGroupProgress', () => {
  it('counts distinct bars sealed per user, sorted best first', () => {
    const seals = [
      { userId: 'u1', barId: 'bar-1' },
      { userId: 'u1', barId: 'bar-2' },
      { userId: 'u2', barId: 'bar-1' },
    ];
    expect(computeGroupProgress(2, seals)).toEqual([
      { userId: 'u1', sealed: 2 },
      { userId: 'u2', sealed: 1 },
    ]);
  });

  it('never reports more sealed bars than the route has (duplicate seal rows)', () => {
    const seals = [
      { userId: 'u1', barId: 'bar-1' },
      { userId: 'u1', barId: 'bar-1' },
    ];
    expect(computeGroupProgress(1, seals)).toEqual([{ userId: 'u1', sealed: 1 }]);
  });
});
