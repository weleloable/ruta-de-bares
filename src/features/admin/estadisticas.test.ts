import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { embudoCana, resultadoPregunta, seccionesEstadisticas, type EstadisticasRuta } from './estadisticas.ts';

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

describe('embudoCana', () => {
  const e: EstadisticasRuta = {
    ...BASE,
    embudo: { en_la_ruta: 52, la_activaron: 44, con_conexion: 42, preguntaron: 26, con_un_si: 21 },
  };

  it('cinco pasos en orden, con la barra respecto a la gente de la ruta', () => {
    const filas = embudoCana(e);
    assert.deepEqual(
      filas.map((f) => [f.titulo, f.valor]),
      [
        ['En la ruta', 52],
        ['La activaron', 44],
        ['Hicieron conexión', 42],
        ['Preguntaron', 26],
        ['Tuvieron un sí', 21],
      ],
    );
    assert.equal(filas[0]?.proporcion, 1);
    assert.equal(filas[3]?.proporcion, 0.5);
    assert.equal(filas[4]?.destacada, true);
  });

  it('una ruta vacia no divide entre cero; sin datos de embudo, no hay filas', () => {
    const vacio = { ...BASE, embudo: { en_la_ruta: 0, la_activaron: 0, con_conexion: 0, preguntaron: 0, con_un_si: 0 } };
    for (const f of embudoCana(vacio)) assert.equal(f.proporcion, 0);
    assert.deepEqual(embudoCana(BASE), []);
  });
});

describe('resultadoPregunta', () => {
  const e: EstadisticasRuta = { ...BASE, pregunta: { si: 13, mas_tarde: 16, no: 1, sin_contestar: 14 } };

  it('las cuatro formas de acabar, con su porcentaje sobre las preguntas hechas', () => {
    const filas = resultadoPregunta(e);
    assert.deepEqual(
      filas.map((f) => [f.titulo, f.valor, f.porcentaje]),
      [
        ['Sí', 13, 30],
        ['Más tarde', 16, 36],
        ['No', 1, 2],
        ['Sin contestar', 14, 32],
      ],
    );
    assert.equal(filas[0]?.destacada, true);
  });

  it('sin preguntas, todo a cero y sin NaN', () => {
    const nada = { ...BASE, pregunta: { si: 0, mas_tarde: 0, no: 0, sin_contestar: 0 } };
    for (const f of resultadoPregunta(nada)) {
      assert.equal(f.porcentaje, 0);
      assert.equal(f.proporcion, 0);
    }
    assert.deepEqual(resultadoPregunta(BASE), []);
  });
});
