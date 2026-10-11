import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { seccionesEstadisticas, type EstadisticasRuta } from './estadisticas.ts';

const BASE: EstadisticasRuta = {
  ruta: { personas: 52, bares: 4, sellos: 1, han_sellado: 1, completaron: 0 },
  cana: { activada: 44, me_gusta: 305, conexiones: 94, conexiones_abiertas: 88, preguntas: 44, si: 13 },
  etiquetas: [],
  moderacion: { denuncias: 1, denuncias_sin_cerrar: 1, vetos: 0 },
};

const baldosa = (e: EstadisticasRuta, seccion: string, titulo: string) =>
  seccionesEstadisticas(e)
    .find((s) => s.titulo === seccion)
    ?.baldosas.find((b) => b.titulo === titulo);

describe('seccionesEstadisticas', () => {
  it('tres secciones, en el orden de la pantalla', () => {
    assert.deepEqual(
      seccionesEstadisticas(BASE).map((s) => s.titulo),
      ['La ruta', 'La Caña', 'Moderación'],
    );
  });

  it('cada cifra con su contexto, como en la maqueta', () => {
    assert.equal(baldosa(BASE, 'La ruta', 'Sello')?.detalle, 'de 208 posibles');
    assert.equal(baldosa(BASE, 'La ruta', 'Completaron')?.detalle, 'los 4 bares');
    assert.equal(baldosa(BASE, 'La Caña', 'La tienen activada')?.detalle, '85 % de la ruta');
    assert.equal(baldosa(BASE, 'La Caña', 'Me gusta')?.detalle, '7 por persona');
    assert.equal(baldosa(BASE, 'La Caña', 'Conexiones')?.detalle, '88 siguen abiertas');
    assert.equal(baldosa(BASE, 'La Caña', 'Sí a la caña')?.detalle, 'de 44 preguntas');
    assert.equal(baldosa(BASE, 'Moderación', 'Denuncia')?.detalle, '1 sin cerrar');
  });

  it('una ruta vacia no divide entre cero ni dice cosas raras', () => {
    const vacia: EstadisticasRuta = {
      ruta: { personas: 0, bares: 0, sellos: 0, han_sellado: 0, completaron: 0 },
      cana: { activada: 0, me_gusta: 0, conexiones: 0, conexiones_abiertas: 0, preguntas: 0, si: 0 },
      etiquetas: [],
      moderacion: { denuncias: 0, denuncias_sin_cerrar: 0, vetos: 0 },
    };
    const textos = seccionesEstadisticas(vacia).flatMap((s) => s.baldosas.map((b) => b.detalle));
    for (const t of textos) assert.doesNotMatch(t, /NaN|Infinity/, t);
    assert.equal(baldosa(vacia, 'La ruta', 'Sellos')?.detalle, 'la ruta no tiene bares');
    assert.equal(baldosa(vacia, 'La Caña', 'La tienen activada')?.detalle, '0 % de la ruta');
    assert.equal(baldosa(vacia, 'La Caña', 'Me gusta')?.detalle, 'nadie la tiene activada');
  });

  it('singular y plural', () => {
    const uno: EstadisticasRuta = {
      ...BASE,
      ruta: { ...BASE.ruta, bares: 1, personas: 1 },
      cana: { ...BASE.cana, conexiones: 1, conexiones_abiertas: 1, preguntas: 1 },
      moderacion: { denuncias: 2, denuncias_sin_cerrar: 0, vetos: 1 },
    };
    assert.equal(baldosa(uno, 'La ruta', 'Persona')?.valor, 1);
    assert.equal(baldosa(uno, 'La ruta', 'Completaron')?.detalle, 'el único bar');
    assert.equal(baldosa(uno, 'La Caña', 'Conexión')?.detalle, '1 sigue abierta');
    assert.equal(baldosa(uno, 'La Caña', 'Sí a la caña')?.detalle, 'de 1 pregunta');
    assert.equal(baldosa(uno, 'Moderación', 'Veto')?.detalle, 'puesto en esta ruta');
  });
});
