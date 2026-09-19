import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ModeracionRow } from '../../types/database';
import {
  agruparModeraciones,
  conAlgoVigente,
  etiquetaAccion,
  filtrarModeraciones,
} from './moderaciones.ts';

function fila(parcial: Partial<ModeracionRow> = {}): ModeracionRow {
  return {
    tipo: 'accion',
    user_id: 'u-luis',
    user_name: 'Luis',
    route_id: null,
    route_name: '',
    motivo: '',
    accion: 'foto_retirada',
    cuando: '2026-09-18T19:00:00.000Z',
    ...parcial,
  };
}

describe('moderaciones: se juntan por persona', () => {
  it('cuatro filas de la misma persona son una sola entrada', () => {
    const [persona, ...resto] = agruparModeraciones([
      fila({ tipo: 'cuenta', motivo: 'Acoso grave', cuando: '2026-09-18T21:00:00.000Z' }),
      fila({ tipo: 'cana', motivo: 'Frase fuera de tono' }),
      fila({ tipo: 'ruta', route_id: 'r1', route_name: 'Compostelana', motivo: 'Acoso' }),
      fila({ tipo: 'accion', accion: 'foto_retirada' }),
    ]);
    assert.equal(resto.length, 0);
    assert.equal(persona.nombre, 'Luis');
    assert.equal(persona.suspension?.motivo, 'Acoso grave');
    assert.equal(persona.vetoCana?.motivo, 'Frase fuera de tono');
    assert.deepEqual(persona.vetosRuta.map((v) => v.routeName), ['Compostelana']);
    assert.deepEqual(persona.historial.map((h) => h.accion), ['foto_retirada']);
    assert.equal(persona.ultima, '2026-09-18T21:00:00.000Z', 'la fecha es la mas reciente de todas');
  });

  it('varias rutas vetadas caben en la misma persona', () => {
    const [persona] = agruparModeraciones([
      fila({ tipo: 'ruta', route_id: 'r1', route_name: 'Compostelana' }),
      fila({ tipo: 'ruta', route_id: 'r2', route_name: 'La del año pasado' }),
    ]);
    assert.equal(persona.vetosRuta.length, 2);
  });

  it('quien borro su cuenta se agrupa por nombre y no se mezcla con otra', () => {
    const agrupadas = agruparModeraciones([
      fila({ tipo: 'ruta', user_id: null, user_name: '(cuenta borrada)', route_id: 'r1', route_name: 'Ruta' }),
      fila({ tipo: 'accion', user_id: null, user_name: 'Luis', accion: 'expulsada_de_ruta' }),
    ]);
    assert.equal(agrupadas.length, 2, 'son dos filas distintas: una sin nombre y otra con el de entonces');
    assert.equal(agrupadas.every((m) => m.userId === null), true);
  });

  it('si alguna fila trae el id, la persona se considera viva', () => {
    const [persona] = agruparModeraciones([
      fila({ tipo: 'accion', user_id: 'u-luis' }),
      fila({ tipo: 'cana', user_id: 'u-luis' }),
    ]);
    assert.equal(persona.userId, 'u-luis');
  });
});

describe('moderaciones: que urge mirar', () => {
  const conVeto = fila({ tipo: 'cana', user_id: 'u-a', user_name: 'Ana', motivo: 'Motivo' });
  const soloHistorial = fila({ tipo: 'accion', user_id: 'u-b', user_name: 'Berta', accion: 'foto_retirada' });

  it('con algo vigente deja fuera a quien solo tiene historial', () => {
    const agrupadas = agruparModeraciones([conVeto, soloHistorial]);
    assert.deepEqual(conAlgoVigente(agrupadas).map((m) => m.nombre), ['Ana']);
  });

  it('quien tiene algo puesto va primero en la lista', () => {
    // Berta es mas reciente, pero lo accionable manda.
    const agrupadas = agruparModeraciones([
      fila({ tipo: 'cana', user_id: 'u-a', user_name: 'Ana', cuando: '2026-09-01T10:00:00.000Z' }),
      fila({ tipo: 'accion', user_id: 'u-b', user_name: 'Berta', cuando: '2026-09-18T10:00:00.000Z' }),
    ]);
    assert.deepEqual(agrupadas.map((m) => m.nombre), ['Ana', 'Berta']);
  });

  it('el filtro "todas" las ensena todas', () => {
    const agrupadas = agruparModeraciones([conVeto, soloHistorial]);
    assert.equal(filtrarModeraciones(agrupadas, 'todas').length, 2);
    assert.equal(filtrarModeraciones(agrupadas, 'vigentes').length, 1);
  });
});

describe('moderaciones: como se nombra cada accion', () => {
  it('traduce las que conoce y deja pasar las que no', () => {
    assert.equal(etiquetaAccion('foto_retirada'), 'Foto retirada');
    assert.equal(etiquetaAccion('cuenta_suspendida'), 'Cuenta suspendida');
    assert.equal(etiquetaAccion('algo_nuevo'), 'algo_nuevo');
  });
});
