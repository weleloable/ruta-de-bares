import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filasGlobal, lineasCsvExtra, repartoCasas, resumenAuditoria, type AuditoriaRuta, type GlobalRutas } from './actividadExtra.ts';

const AUDITORIA: AuditoriaRuta = {
  anulados: { n: 3, puntos: 30, motivos: [{ motivo: 'Selló desde casa', n: 2 }, { motivo: 'Prueba; "rara"', n: 1 }] },
  ajustes: { n: 2, puntos: 6 },
  cambios_casa: 1,
};

describe('estadisticas extra', () => {
  it('reparto de casas: de mas a menos gente, con porcentajes y una frase de equilibrio', () => {
    const r = repartoCasas([
      { house: 'mahou', miembros: 5, puntos: 100 },
      { house: 'cruzcampo', miembros: 5, puntos: 60 },
      { house: 'estrella', miembros: 6, puntos: 40 },
      { house: 'alhambra', miembros: 4, puntos: 0 },
    ]);
    assert.deepEqual(r.filas.map((f) => [f.nombre, f.miembros, f.pctGente, f.pctPuntos]), [
      ['Estrella Galicia', 6, 30, 20],
      ['Mahou', 5, 25, 50],
      ['Cruzcampo', 5, 25, 30],
      ['Alhambra', 4, 20, 0],
    ]);
    assert.match(r.equilibrio, /Hay 2 personas de diferencia entre Estrella Galicia \(6\) y Alhambra \(4\)/);
  });

  it('equilibrio: igualado, desigual o vacio', () => {
    assert.match(repartoCasas([{ house: 'mahou', miembros: 5, puntos: 0 }, { house: 'estrella', miembros: 4, puntos: 0 }]).equilibrio, /igualado/);
    assert.match(
      repartoCasas([{ house: 'mahou', miembros: 9, puntos: 0 }, { house: 'estrella', miembros: 4, puntos: 0 }]).equilibrio,
      /5 personas de diferencia entre Mahou \(9\) y Estrella Galicia \(4\)/,
    );
    assert.match(repartoCasas([]).equilibrio, /Todavía no hay nadie/);
  });

  it('auditoria: frases con singular/plural y efecto neto con signo', () => {
    const r = resumenAuditoria(AUDITORIA);
    assert.equal(r.anulados, '3 movimientos anulados (30 puntos)');
    assert.equal(r.ajustes, '2 ajustes a mano, efecto neto +6');
    assert.equal(r.cambios, '1 cambio de casa');
    assert.equal(r.hayAlgo, true);
    const vacia = resumenAuditoria({ anulados: { n: 0, puntos: 0, motivos: [] }, ajustes: { n: 0, puntos: 0 }, cambios_casa: 0 });
    assert.equal(vacia.hayAlgo, false);
    assert.equal(vacia.anulados, '0 movimientos anulados');
    assert.equal(resumenAuditoria({ ...AUDITORIA, ajustes: { n: 1, puntos: -4 } }).ajustes, '1 ajuste a mano, efecto neto -4');
  });

  it('global: una fila por ruta, con barra de sellos y estado de cierre', () => {
    const g: GlobalRutas = {
      totales: { rutas: 2, personas: 30, sellos: 150, consumiciones: 60, encuentros: 12, retos: 9 },
      rutas: [
        { nombre: 'Segunda', fecha: '2026-10-17', personas: 20, bares: 5, sellos: 100, completaron: 12, consumiciones: 40, cerrada: false, ganadoras: [] },
        { nombre: 'Primera', fecha: null, personas: 10, bares: 4, sellos: 50, completaron: 3, consumiciones: 20, cerrada: true, ganadoras: ['mahou', 'alhambra'] },
      ],
    };
    const f = filasGlobal(g);
    assert.deepEqual(f.map((x) => [x.pctSellos, x.completaron, x.cierre]), [
      [100, '12 de 20 completaron', 'Sin cerrar'],
      [50, '3 de 10 completaron', 'Ganó Mahou y Alhambra'],
    ]);
    assert.equal(f[1]?.fecha, 'sin fecha');
    assert.equal(filasGlobal({ ...g, rutas: [{ ...g.rutas[0]!, cerrada: true }] })[0]?.cierre, 'Cerrada, sin ganadora');
  });

  it('lineas de CSV de casas y auditoria, con comillas escapadas', () => {
    const l = lineasCsvExtra([{ house: 'mahou', miembros: 5, puntos: 100 }], AUDITORIA);
    assert.ok(l.includes('Casas;Mahou: personas;5'));
    assert.ok(l.includes('Auditoría;Cambios de casa;1'));
    assert.ok(l.includes('Auditoría;"Motivo: Prueba; ""rara""";1'));
    assert.deepEqual(lineasCsvExtra(null, null), []);
  });
});
