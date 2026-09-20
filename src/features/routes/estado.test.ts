import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  avisoDeRutaTerminada,
  corteDeFin,
  estadoDeRuta,
  etiquetaEstado,
  HORA_FIN,
  puedeTerminarseAMano,
} from './estado.ts';

/** Una hora local concreta, sin pasar por ISO (que seria UTC). */
const local = (a: number, m: number, d: number, h = 0, min = 0) => new Date(a, m - 1, d, h, min);

const PUBLICADA = { is_published: true, event_date: '2026-09-20', finished_at: null };

describe('corteDeFin', () => {
  it('es el dia siguiente al evento, a las 08:00 locales', () => {
    const corte = corteDeFin('2026-09-20');
    assert.ok(corte);
    assert.equal(corte.getFullYear(), 2026);
    assert.equal(corte.getMonth(), 8); // septiembre
    assert.equal(corte.getDate(), 21);
    assert.equal(corte.getHours(), HORA_FIN);
  });

  it('cruza bien el fin de mes', () => {
    const corte = corteDeFin('2026-09-30');
    assert.equal(corte?.getMonth(), 9); // octubre
    assert.equal(corte?.getDate(), 1);
  });

  it('y el fin de ano', () => {
    const corte = corteDeFin('2026-12-31');
    assert.equal(corte?.getFullYear(), 2027);
    assert.equal(corte?.getDate(), 1);
  });

  it('sin fecha no hay corte: esa ruta no termina sola', () => {
    assert.equal(corteDeFin(null), null);
    assert.equal(corteDeFin(''), null);
    assert.equal(corteDeFin('no-es-una-fecha'), null);
  });

  it('se construye en hora local, no en UTC', () => {
    // `new Date('2026-09-21T08:00')` sin zona se interpreta como UTC en algunos
    // entornos, y en Espana adelantaria el corte una o dos horas.
    const corte = corteDeFin('2026-09-20');
    assert.equal(corte?.getHours(), 8, 'el corte tiene que caer a las 8 de la manana de aqui');
  });
});

describe('estadoDeRuta', () => {
  it('sin publicar es borrador, pase el tiempo que pase', () => {
    const borrador = { is_published: false, event_date: '2020-01-01', finished_at: null };
    assert.equal(estadoDeRuta(borrador, local(2026, 9, 25)), 'borrador');
  });

  it('publicada y antes del evento, publicada', () => {
    assert.equal(estadoDeRuta(PUBLICADA, local(2026, 9, 19, 12)), 'publicada');
  });

  it('EL CASO DE LA MEDIANOCHE: a las 02:00 del dia siguiente sigue en marcha', () => {
    // Una ruta de bares cruza las 12 por definicion. Con "la fecha ya paso" a
    // secas, esto se marcaria terminada mientras la gente sigue sellando.
    assert.equal(estadoDeRuta(PUBLICADA, local(2026, 9, 21, 2)), 'publicada');
    assert.equal(estadoDeRuta(PUBLICADA, local(2026, 9, 21, 7, 59)), 'publicada');
  });

  it('a las 08:00 del dia siguiente, terminada', () => {
    assert.equal(estadoDeRuta(PUBLICADA, local(2026, 9, 21, 8)), 'terminada');
    assert.equal(estadoDeRuta(PUBLICADA, local(2026, 9, 25)), 'terminada');
  });

  it('marcada a mano, terminada aunque la fecha no haya llegado', () => {
    const aMano = { is_published: true, event_date: '2026-12-31', finished_at: '2026-09-20T10:00:00Z' };
    assert.equal(estadoDeRuta(aMano, local(2026, 9, 20, 12)), 'terminada');
  });

  it('publicada SIN fecha no termina nunca sola', () => {
    // Por eso la 0027 exige fecha para publicar: si no, se escapa del aviso.
    const sinFecha = { is_published: true, event_date: null, finished_at: null };
    assert.equal(estadoDeRuta(sinFecha, local(2030, 1, 1)), 'publicada');
  });

  it('cada estado tiene su etiqueta', () => {
    for (const estado of ['borrador', 'publicada', 'terminada'] as const) {
      assert.ok(etiquetaEstado(estado).length > 0);
    }
  });
});

describe('puedeTerminarseAMano', () => {
  it('solo una publicada que sigue en marcha', () => {
    assert.equal(puedeTerminarseAMano(PUBLICADA, local(2026, 9, 19)), true);
  });

  it('un borrador no: no significa nada', () => {
    assert.equal(puedeTerminarseAMano({ is_published: false, event_date: '2026-09-20' }, local(2026, 9, 19)), false);
  });

  it('una que ya termino sola tampoco', () => {
    assert.equal(puedeTerminarseAMano(PUBLICADA, local(2026, 9, 25)), false);
  });
});

describe('avisoDeRutaTerminada', () => {
  it('mientras esta en marcha, no dice nada', () => {
    assert.equal(avisoDeRutaTerminada(PUBLICADA, local(2026, 9, 19)), null);
    assert.equal(avisoDeRutaTerminada(PUBLICADA, local(2026, 9, 21, 2)), null);
  });

  it('cuenta los dias, y dice que borrarla se lleva los datos', () => {
    const texto = avisoDeRutaTerminada(PUBLICADA, local(2026, 9, 24, 9)) ?? '';
    assert.match(texto, /hace 3 d/);
    assert.match(texto, /se van sus datos/);
  });

  it('el mismo dia y el dia siguiente se dicen con palabras', () => {
    assert.match(avisoDeRutaTerminada(PUBLICADA, local(2026, 9, 21, 9)) ?? '', /hoy/);
    assert.match(avisoDeRutaTerminada(PUBLICADA, local(2026, 9, 22, 9)) ?? '', /ayer/);
  });

  it('terminada a mano cuenta desde que se marco', () => {
    const aMano = { is_published: true, event_date: '2026-12-31', finished_at: '2026-09-20T10:00:00Z' };
    assert.match(avisoDeRutaTerminada(aMano, local(2026, 9, 22, 12)) ?? '', /hace 2 d|ayer/);
  });

  it('sin fecha y marcada a mano con basura, no revienta', () => {
    const rara = { is_published: true, event_date: null, finished_at: 'no-es-una-fecha' };
    const texto = avisoDeRutaTerminada(rara, local(2026, 9, 22));
    assert.ok(texto && texto.length > 0);
  });
});
