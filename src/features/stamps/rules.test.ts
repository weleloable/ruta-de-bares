import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeVerdict,
  distanceMeters,
  evaluateStamp,
  formatDuration,
  verdictFromServerError,
  type StampableBar,
} from './rules.ts';

const PUERTA_DEL_SOL = { lat: 40.4168, lng: -3.7038 };
const PLAZA_MAYOR = { lat: 40.4155, lng: -3.7074 };

function bar(overrides: Partial<StampableBar> = {}): StampableBar {
  return {
    id: 'bar-1',
    lat: PUERTA_DEL_SOL.lat,
    lng: PUERTA_DEL_SOL.lng,
    radiusM: 120,
    opensAt: new Date('2026-09-19T18:00:00Z'),
    closesAt: new Date('2026-09-19T19:30:00Z'),
    ...overrides,
  };
}

describe('distanceMeters', () => {
  it('es cero en el mismo punto', () => {
    assert.equal(distanceMeters(PUERTA_DEL_SOL, PUERTA_DEL_SOL), 0);
  });

  it('mide Sol - Plaza Mayor dentro del margen conocido (~325 m)', () => {
    // Referencia: calculo haversine independiente sobre esas coordenadas.
    const d = distanceMeters(PUERTA_DEL_SOL, PLAZA_MAYOR);
    assert.ok(d > 310 && d < 340, `esperaba ~325 m, dio ${d}`);
  });

  it('un grado de latitud son ~111.2 km', () => {
    const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    assert.ok(Math.abs(d - 111195) < 50, `dio ${d}`);
  });

  it('es simetrica', () => {
    assert.equal(
      distanceMeters(PUERTA_DEL_SOL, PLAZA_MAYOR),
      distanceMeters(PLAZA_MAYOR, PUERTA_DEL_SOL),
    );
  });

  it('no devuelve NaN en antipodas (dominio de asin)', () => {
    const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    assert.ok(Number.isFinite(d));
    assert.ok(Math.abs(d - Math.PI * 6371008.8) < 1);
  });
});

describe('evaluateStamp', () => {
  const dentroDeLaVentana = new Date('2026-09-19T18:30:00Z');

  it('listo cuando esta dentro del radio y de la ventana', () => {
    const v = evaluateStamp({
      bar: bar(),
      position: PUERTA_DEL_SOL,
      now: dentroDeLaVentana,
      alreadyStamped: false,
    });
    assert.deepEqual(v, { status: 'ready' });
  });

  it('demasiado pronto antes de opens_at, con el tiempo que falta', () => {
    const v = evaluateStamp({
      bar: bar(),
      position: PUERTA_DEL_SOL,
      now: new Date('2026-09-19T17:35:00Z'),
      alreadyStamped: false,
    });
    assert.equal(v.status, 'too_early');
    assert.equal(v.status === 'too_early' && v.opensInMs, 25 * 60 * 1000);
  });

  it('demasiado tarde despues de closes_at', () => {
    const v = evaluateStamp({
      bar: bar(),
      position: PUERTA_DEL_SOL,
      now: new Date('2026-09-19T19:30:01Z'),
      alreadyStamped: false,
    });
    assert.equal(v.status, 'too_late');
  });

  it('los bordes de la ventana son inclusivos, igual que el SQL', () => {
    for (const now of [new Date('2026-09-19T18:00:00Z'), new Date('2026-09-19T19:30:00Z')]) {
      const v = evaluateStamp({
        bar: bar(),
        position: PUERTA_DEL_SOL,
        now,
        alreadyStamped: false,
      });
      assert.equal(v.status, 'ready', `borde ${now.toISOString()}`);
    }
  });

  it('demasiado lejos informa de los metros que faltan', () => {
    const v = evaluateStamp({
      bar: bar({ radiusM: 100 }),
      position: PLAZA_MAYOR,
      now: dentroDeLaVentana,
      alreadyStamped: false,
    });
    assert.equal(v.status, 'too_far');
    if (v.status === 'too_far') {
      assert.ok(v.distanceM > 310);
      assert.ok(Math.abs(v.missingM - (v.distanceM - 100)) < 1e-9);
    }
  });

  it('justo en el borde del radio cuenta como dentro', () => {
    const d = distanceMeters(PUERTA_DEL_SOL, PLAZA_MAYOR);
    const v = evaluateStamp({
      bar: bar({ radiusM: Math.ceil(d) }),
      position: PLAZA_MAYOR,
      now: dentroDeLaVentana,
      alreadyStamped: false,
    });
    assert.equal(v.status, 'ready');
  });

  it('un sello ya conseguido gana a la ventana cerrada', () => {
    const v = evaluateStamp({
      bar: bar(),
      position: null,
      now: new Date('2027-01-01T00:00:00Z'),
      alreadyStamped: true,
    });
    assert.deepEqual(v, { status: 'already' });
  });

  it('sin ubicacion, la ventana se evalua igualmente', () => {
    assert.equal(
      evaluateStamp({
        bar: bar(),
        position: null,
        now: new Date('2026-09-19T10:00:00Z'),
        alreadyStamped: false,
      }).status,
      'too_early',
    );
    assert.equal(
      evaluateStamp({
        bar: bar(),
        position: null,
        now: dentroDeLaVentana,
        alreadyStamped: false,
      }).status,
      'no_location',
    );
  });
});

describe('verdictFromServerError', () => {
  it('extrae la distancia de TOO_FAR_n', () => {
    const v = verdictFromServerError('TOO_FAR_312');
    assert.equal(v?.status, 'too_far');
    assert.equal(v?.status === 'too_far' && v.distanceM, 312);
  });

  it('reconoce el error aunque PostgREST le anada prefijos', () => {
    assert.equal(verdictFromServerError('P0001: TOO_EARLY')?.status, 'too_early');
    assert.equal(verdictFromServerError('error: TOO_LATE')?.status, 'too_late');
  });

  it('devuelve null para errores que no son de regla', () => {
    assert.equal(verdictFromServerError('network request failed'), null);
    assert.equal(verdictFromServerError('BAR_NOT_FOUND'), null);
  });
});

describe('describeVerdict', () => {
  it('cubre todos los estados sin devolver undefined', () => {
    const estados = [
      { status: 'ready' },
      { status: 'already' },
      { status: 'too_early', opensInMs: 90 * 60 * 1000 },
      { status: 'too_late' },
      { status: 'too_far', distanceM: 300, missingM: 180 },
      { status: 'too_far', distanceM: 300, missingM: Number.NaN },
      { status: 'no_location' },
    ] as const;
    for (const estado of estados) {
      const texto = describeVerdict(estado);
      assert.ok(texto.length > 0, JSON.stringify(estado));
      assert.ok(!texto.includes('NaN'), texto);
      assert.ok(!texto.includes('undefined'), texto);
    }
  });
});

describe('formatDuration', () => {
  it('formatea minutos, horas y dias', () => {
    assert.equal(formatDuration(0), '0 min');
    assert.equal(formatDuration(-5000), '0 min');
    assert.equal(formatDuration(25 * 60 * 1000), '25 min');
    assert.equal(formatDuration(60 * 60 * 1000), '1 h');
    assert.equal(formatDuration(95 * 60 * 1000), '1 h 35 min');
    assert.equal(formatDuration(50 * 60 * 60 * 1000), '2 d 2 h');
  });
});
