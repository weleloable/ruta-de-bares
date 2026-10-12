import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reglasInfo, type LimitesRuta } from './reglasInfo.ts';

const PUNTOS = { sello: 10, consumicion: 2, categoria_nueva: 5, ruta_completa: 20, podio_1: 10, podio_2: 7, podio_3: 5, racha: 6, qr: 5 };
const RUTA: LimitesRuta = { consumo_minutos: 30, consumo_por_bar: 1, consumo_por_ruta: 6, variedad_max: 3, qr_max: 5, racha_repetible: false };

const por = (puntos: Readonly<Record<string, number>> = PUNTOS, ruta = RUTA) => Object.fromEntries(reglasInfo(puntos, ruta).map((r) => [r.titulo, r]));

describe('reglas de puntos (boton i)', () => {
  it('cubre todas las formas de ganar puntos, con los valores reales', () => {
    const r = reglasInfo(PUNTOS, RUTA);
    assert.deepEqual(
      r.map((x) => x.titulo),
      ['Sellar un bar', 'Completar la ruta', 'Consumición', 'Categoría nueva', 'Podio de los minijuegos', 'Racha de casa', 'Encuentro por QR', 'Retos'],
    );
    assert.equal(por()['Sellar un bar']?.puntos, '+10');
    assert.equal(por()['Podio de los minijuegos']?.puntos, '10 · 7 · 5');
    assert.equal(por({ ...PUNTOS, sello: 25 })['Sellar un bar']?.puntos, '+25', 'si un admin cambia la regla, cambia el texto');
  });

  it('los limites de la ruta salen en el texto', () => {
    const t = por()['Consumición']!.texto;
    assert.match(t, /solo puntúa la primera/);
    assert.match(t, /6 consumiciones como máximo en toda la ruta/);
    assert.match(t, /30 minutos/);
    assert.match(t, /con alcohol que sin él/);
    const t2 = por(PUNTOS, { ...RUTA, consumo_por_bar: 3, consumo_minutos: 0 })['Consumición']!.texto;
    assert.match(t2, /puntúan las 3 primeras/);
    assert.doesNotMatch(t2, /minutos/);
    assert.match(por()['Encuentro por QR']!.texto, /hasta 5 encuentros/);
    assert.match(por()['Racha de casa']!.texto, /Solo una vez por casa y bar/);
    assert.match(por(PUNTOS, { ...RUTA, racha_repetible: true })['Racha de casa']!.texto, /Puede repetirse/);
  });

  it('si no se pudieron leer los puntos, no inventa cifras', () => {
    const r = por({}, RUTA);
    assert.equal(r['Sellar un bar']?.puntos, null);
    assert.equal(r['Podio de los minijuegos']?.puntos, null);
  });
});
