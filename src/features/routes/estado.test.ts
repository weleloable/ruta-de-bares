import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  avisoDeRutaTerminada,
  cierreDelUltimoBar,
  corteDeFin,
  estadoDeRuta,
  etiquetaEstado,
  finDeLaRuta,
  HORA_FIN,
  puedeTerminarseAMano,
} from './estado.ts';

/** Una hora local concreta, sin pasar por ISO (que seria UTC). */
const local = (a: number, m: number, d: number, h = 0, min = 0) => new Date(a, m - 1, d, h, min);

const PUBLICADA = { is_published: true, event_date: '2026-09-20', finished_at: null };

/** Una ruta de tres bares: el ultimo cierra a las 03:00 del dia siguiente. */
const bar = (orden: number, cierra: Date) => ({ sort_order: orden, closes_at: cierra.toISOString() });
const CON_BARES = {
  is_published: true,
  event_date: '2026-09-20',
  finished_at: null,
  route_bars: [
    bar(0, local(2026, 9, 20, 21)),
    bar(2, local(2026, 9, 21, 3)),
    bar(1, local(2026, 9, 20, 23, 30)),
  ],
};

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


describe('cierreDelUltimoBar', () => {
  it('es el de mayor sort_order, no el que cierra mas tarde', () => {
    // El orden de la ruta manda: si el segundo bar cerrase a las 06:00 por un
    // error de quien la monto, la ruta no acaba a las 06:00.
    const raros = [bar(0, local(2026, 9, 21, 6)), bar(1, local(2026, 9, 20, 23))];
    assert.equal(cierreDelUltimoBar(raros)?.getTime(), local(2026, 9, 20, 23).getTime());
  });

  it('con los bares desordenados da igual', () => {
    assert.equal(cierreDelUltimoBar(CON_BARES.route_bars)?.getTime(), local(2026, 9, 21, 3).getTime());
  });

  it('sin bares, o sin horas, null', () => {
    assert.equal(cierreDelUltimoBar([]), null);
    assert.equal(cierreDelUltimoBar(null), null);
    assert.equal(cierreDelUltimoBar(undefined), null);
    assert.equal(cierreDelUltimoBar([{ sort_order: 0, closes_at: null }]), null);
  });

  it('una hora ilegible no revienta', () => {
    assert.equal(cierreDelUltimoBar([{ sort_order: 0, closes_at: 'ayer por la noche' }]), null);
  });
});

describe('una ruta termina cuando cierra su ultimo bar', () => {
  it('mientras el ultimo bar sigue abierto, la ruta esta en marcha', () => {
    assert.equal(estadoDeRuta(CON_BARES, local(2026, 9, 21, 2, 30)), 'publicada');
  });

  it('al cerrar el ultimo bar, terminada', () => {
    assert.equal(estadoDeRuta(CON_BARES, local(2026, 9, 21, 3)), 'terminada');
  });

  it('el horario de los bares MANDA sobre la red del dia siguiente', () => {
    // Un ultimo bar que cierra pronto termina la ruta pronto: a las 22:00 ya
    // esta acabada, sin esperar a las 08:00 del dia siguiente.
    const corta = { ...CON_BARES, route_bars: [bar(0, local(2026, 9, 20, 22))] };
    assert.equal(estadoDeRuta(corta, local(2026, 9, 20, 22, 1)), 'terminada');
    // Y uno que cierra tarde la alarga: a las 08:00 del dia siguiente (la red
    // antigua) todavia estaria en marcha si cerrase a las 10:00.
    const larga = { ...CON_BARES, route_bars: [bar(0, local(2026, 9, 21, 10))] };
    assert.equal(estadoDeRuta(larga, local(2026, 9, 21, 9)), 'publicada');
  });

  it('sin bares se usa la red: 08:00 del dia siguiente', () => {
    const sinBares = { ...CON_BARES, route_bars: [] };
    assert.equal(estadoDeRuta(sinBares, local(2026, 9, 21, 7, 59)), 'publicada');
    assert.equal(estadoDeRuta(sinBares, local(2026, 9, 21, 8)), 'terminada');
  });

  it('finDeLaRuta prefiere el bar y cae a la fecha si no hay', () => {
    assert.equal(finDeLaRuta(CON_BARES)?.getTime(), local(2026, 9, 21, 3).getTime());
    assert.equal(finDeLaRuta({ ...CON_BARES, route_bars: [] })?.getTime(), corteDeFin('2026-09-20')?.getTime());
    assert.equal(finDeLaRuta({ is_published: true, event_date: null }), null);
  });

  it('el aviso cuenta los dias desde que cerro el ultimo bar', () => {
    assert.match(avisoDeRutaTerminada(CON_BARES, local(2026, 9, 24, 12)) ?? '', /hace 3 d/);
  });
});
