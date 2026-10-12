import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  filasBares,
  filasHoras,
  filasJuegos,
  filasParticipacion,
  filasRetos,
  nombreFicheroCsv,
  porcentaje,
  resumenConsumo,
  resumenCsv,
  type ActividadRuta,
} from './actividad.ts';
import type { EstadisticasRuta } from './estadisticas.ts';

const ACTIVIDAD: ActividadRuta = {
  participacion: { personas: 20, sellaron: 18, consumieron: 10, qr: 5, jugaron: 8, cana: 12, retos: 4, activos_30min: 6 },
  bares: [
    { nombre: 'Uno', sellos: 18 },
    { nombre: 'Dos', sellos: 12 },
    { nombre: 'Tres', sellos: 9 },
  ],
  horas: [
    { hora: new Date(2026, 9, 17, 20).toISOString(), sellos: 5 },
    { hora: new Date(2026, 9, 17, 22).toISOString(), sellos: 12 },
  ],
  consumiciones: { total: 30, puntuan: 24, personas: 10, por_categoria: { tercio: 12, jarra: 6, vino: 3, sidra: 0, chupito: 3, sin_alcohol: 6 } },
  juegos: [{ juego: 'cana-perfecta', jugadores: 8, mejor: 95 }, { juego: 'juego-raro', jugadores: 2, mejor: null }],
  retos: [
    { nombre: 'Peregrino', activo: true, puntos: 15, plazas: 3, conseguidos: 2 },
    { nombre: 'Imposible', activo: true, puntos: 50, plazas: null, conseguidos: 0 },
    { nombre: 'Viejo', activo: false, puntos: 5, plazas: null, conseguidos: 0 },
  ],
  qr: { encuentros: 7, puntuan: 5 },
};

const GENERAL: EstadisticasRuta = {
  ruta: { personas: 20, bares: 3, sellos: 39, han_sellado: 18, completaron: 9 },
  cana: { activada: 12, me_gusta: 30, conexiones: 5, conexiones_abiertas: 4, preguntas: 8, si: 6 },
  etiquetas: [],
  moderacion: { denuncias: 1, denuncias_sin_cerrar: 0, vetos: 0 },
};

describe('estadisticas de actividad', () => {
  it('porcentajes sin dividir por cero', () => {
    assert.equal(porcentaje(1, 3), 33);
    assert.equal(porcentaje(5, 0), 0);
  });

  it('participacion: porcentaje de la gente de la ruta', () => {
    const p = Object.fromEntries(filasParticipacion(ACTIVIDAD).map((f) => [f.id, f.pct]));
    assert.deepEqual(p, { sellaron: 90, consumieron: 50, qr: 25, jugaron: 40, cana: 60, retos: 20 });
  });

  it('bares: el mas y el menos sellado, y cuantos llegan al ultimo', () => {
    const { filas, resumen } = filasBares(ACTIVIDAD);
    assert.deepEqual(filas.map((f) => f.pct), [100, 67, 50]);
    assert.deepEqual(resumen, ['Más sellado: Uno (18).', 'Menos sellado: Tres (9).', 'De cada 10 personas que sellan el primer bar, 5 sellan el último.']);
    assert.deepEqual(filasBares({ ...ACTIVIDAD, bares: [] }).resumen, []);
  });

  it('horas: sin huecos entre la primera y la ultima, con el pico marcado', () => {
    const h = filasHoras(ACTIVIDAD);
    assert.deepEqual(h.map((x) => [x.etiqueta, x.sellos, x.pico]), [['20:00', 5, false], ['21:00', 0, false], ['22:00', 12, true]]);
    assert.deepEqual(filasHoras({ ...ACTIVIDAD, horas: [] }), []);
  });

  it('consumiciones: media, % sin alcohol y % que puntuan', () => {
    const c = resumenConsumo(ACTIVIDAD);
    assert.deepEqual([c.total, c.media, c.sinAlcoholPct, c.puntuanPct, c.sinPuntos], [30, '3', 20, 80, 6]);
    assert.equal(c.categorias.find((x) => x.id === 'tercio')?.pct, 40);
    assert.equal(resumenConsumo({ ...ACTIVIDAD, consumiciones: { total: 0, puntuan: 0, personas: 0, por_categoria: {} } }).media, '0');
  });

  it('juegos con nombre, y retos que nadie consigue', () => {
    assert.deepEqual(filasJuegos(ACTIVIDAD).map((j) => [j.nombre, j.pct]), [['La Caña Perfecta', 40], ['juego-raro', 10]]);
    const r = filasRetos(ACTIVIDAD);
    assert.deepEqual(r.map((x) => [x.texto, x.sinNadie]), [['2 de 3 plazas', false], ['0 personas', true], ['0 personas', false]]);
  });

  it('el CSV lleva todo, con ; y comillas bien escapadas', () => {
    const csv = resumenCsv('Ruta "de" las; Fiestas', GENERAL, ACTIVIDAD, new Date('2026-10-17T20:00:00Z'));
    const lineas = csv.split('\r\n');
    assert.equal(lineas[0], 'Sección;Dato;Valor');
    assert.ok(lineas.includes('Ruta;Nombre;"Ruta ""de"" las; Fiestas"'));
    assert.ok(lineas.includes('La ruta;Sellos;39'));
    assert.ok(lineas.includes('Bares;Tres;9'));
    assert.ok(lineas.includes('Consumiciones;Sin alcohol;6'));
    assert.ok(lineas.includes('QR;Que puntúan;5'));
    assert.ok(lineas.includes('Retos;Imposible;0'));
  });

  it('nombre de fichero seguro', () => {
    assert.equal(nombreFicheroCsv('Ruta de las Fiestas ¡Ñam!', new Date(2026, 9, 17)), 'resumen-ruta-de-las-fiestas-nam-2026-10-17.csv');
    assert.equal(nombreFicheroCsv('???', new Date(2026, 0, 5)), 'resumen-ruta-2026-01-05.csv');
  });
});
