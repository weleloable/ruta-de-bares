import { CHECK_IN_RADIUS_METERS, haversineMeters, isWithinCheckInRadius } from '../src/lib/geo';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(40.4168, -3.7038, 40.4168, -3.7038)).toBeCloseTo(0, 6);
  });

  it('matches a known distance: Puerta del Sol to Plaza Mayor, Madrid (~350m)', () => {
    // Coordenadas públicas de ambas plazas. La distancia real en línea recta
    // es de unos 350-400m; comprobamos un rango generoso para no acoplar el
    // test a decimales de una fuente externa concreta.
    const sol = { lat: 40.4169, lon: -3.7035 };
    const plazaMayor = { lat: 40.4155, lon: -3.7074 };
    const distance = haversineMeters(sol.lat, sol.lon, plazaMayor.lat, plazaMayor.lon);
    expect(distance).toBeGreaterThan(300);
    expect(distance).toBeLessThan(500);
  });

  it('is symmetric', () => {
    const a = haversineMeters(40.41, -3.70, 40.42, -3.71);
    const b = haversineMeters(40.42, -3.71, 40.41, -3.70);
    expect(a).toBeCloseTo(b, 9);
  });

  it('gives ~111km for one degree of latitude', () => {
    const distance = haversineMeters(0, 0, 1, 0);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });
});

describe('isWithinCheckInRadius', () => {
  it('accepts exactly the boundary', () => {
    expect(isWithinCheckInRadius(CHECK_IN_RADIUS_METERS)).toBe(true);
  });

  it('rejects just over the boundary', () => {
    expect(isWithinCheckInRadius(CHECK_IN_RADIUS_METERS + 0.01)).toBe(false);
  });

  it('accepts zero distance', () => {
    expect(isWithinCheckInRadius(0)).toBe(true);
  });
});
