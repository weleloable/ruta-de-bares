import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reglasInfo, type LimitesRuta } from './reglasInfo.ts';

const PUNTOS = { sello: 10, consumicion: 2, categoria_nueva: 5, ruta_completa: 20, podio_1: 10, podio_2: 7, podio_3: 5, racha: 6, qr: 5 };
const RUTA: LimitesRuta = { consumo_minutos: 30, consumo_por_bar: 1, consumo_por_ruta: 6, variedad_max: 3, qr_max: 5, racha_repetible: false };

const por = (puntos: Readonly<Record<string, number>> = PUNTOS, ruta = RUTA) => Object.fromEntries(reglasInfo(puntos, ruta).map((r) => [r.titulo, r]));

describe('reglas de puntos (desplegable)', () => {
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
    assert.match(t, /hasta 1 por bar y 6 por ruta/);
    assert.match(t, /30 min/);
    assert.match(t, /Sin alcohol puntúa igual/);
    const t2 = por(PUNTOS, { ...RUTA, consumo_por_bar: 3, consumo_minutos: 0 })['Consumición']!.texto;
    assert.match(t2, /hasta 3 por bar/);
    assert.doesNotMatch(t2, /Espera/);
    assert.match(por()['Encuentro por QR']!.texto, /Hasta 5 encuentros/);
    assert.match(por()['Racha de casa']!.texto, /Una vez por casa y bar/);
    assert.match(por(PUNTOS, { ...RUTA, racha_repetible: true })['Racha de casa']!.texto, /Puede repetirse/);
  });

  it('indica que no puntuan las consumiciones cuando cualquiera de sus limites es cero', () => {
    for (const limite of ['consumo_por_bar', 'consumo_por_ruta'] as const) {
      assert.equal(por(PUNTOS, { ...RUTA, [limite]: 0 })['Consumición']!.texto, 'No puntúa en esta ruta.');
    }
  });

  it('si no se pudieron leer los puntos, no inventa cifras', () => {
    const r = por({}, RUTA);
    assert.equal(r['Sellar un bar']?.puntos, null);
    assert.equal(r['Podio de los minijuegos']?.puntos, null);
  });

  it('refleja todos los importes editables, incluso si el admin los deja a cero', () => {
    const acciones = {
      sello: 'Sellar un bar',
      ruta_completa: 'Completar la ruta',
      consumicion: 'Consumición',
      categoria_nueva: 'Categoría nueva',
      racha: 'Racha de casa',
      qr: 'Encuentro por QR',
    };
    for (const valor of [0, 37, 1000]) {
      const reglas = por(Object.fromEntries(Object.keys(PUNTOS).map((accion) => [accion, valor])));
      for (const titulo of Object.values(acciones)) assert.equal(reglas[titulo]?.puntos, `+${valor}`);
      assert.equal(reglas['Podio de los minijuegos']?.puntos, `${valor} · ${valor} · ${valor}`);
      assert.equal(reglas['Retos']?.puntos, null, 'cada reto tiene su propio importe');
    }
  });
});
