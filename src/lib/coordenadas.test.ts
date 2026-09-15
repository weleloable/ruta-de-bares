import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describirPunto,
  estadoCampoCoordenadas,
  formatCoordenadas,
  parseCoordenadas,
  type Punto,
} from './coordenadas.ts';

const SOL = { ok: true, punto: { lat: 40.4168, lng: -3.7038 } };

const URL_SITIO =
  'https://www.google.com/maps/place/Bar/@40.4100,-3.7100,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d40.4168!4d-3.7038!16s';

describe('parseCoordenadas', () => {
  it('acepta el formato que copia Google Maps', () => {
    assert.deepEqual(parseCoordenadas('40.41680, -3.70380'), SOL);
    assert.deepEqual(parseCoordenadas('40.416809423407, -3.703825813266'), {
      ok: true,
      punto: { lat: 40.416809423407, lng: -3.703825813266 },
    });
  });

  it('acepta coma sin espacio, punto y coma, espacio, tabulador y espacios alrededor', () => {
    for (const texto of [
      '40.4168,-3.7038',
      '40.4168; -3.7038',
      '40.4168 -3.7038',
      '40.4168\t-3.7038',
      '  40.4168 ,  -3.7038  ',
    ]) {
      assert.deepEqual(parseCoordenadas(texto), SOL, texto);
    }
  });

  it('acepta parentesis y corchetes en pareja, y rechaza los sueltos', () => {
    assert.deepEqual(parseCoordenadas('(40.4168, -3.7038)'), SOL);
    assert.deepEqual(parseCoordenadas('[ 40.4168, -3.7038 ]'), SOL);
    for (const texto of ['(40.4168, -3.7038', '40.4168, -3.7038)', '(40.4168, -3.7038]']) {
      assert.equal(parseCoordenadas(texto).ok, false, texto);
    }
  });

  it('acepta signo + y decimales sin cero delante', () => {
    assert.deepEqual(parseCoordenadas('+.5000, -.2500'), { ok: true, punto: { lat: 0.5, lng: -0.25 } });
  });

  it('acepta grados con hemisferio en las dos partes, con ° o º, incluida O de oeste', () => {
    assert.deepEqual(parseCoordenadas('40.4168° N, 3.7038° W'), SOL);
    assert.deepEqual(parseCoordenadas('40.4168º N, 3.7038º O'), SOL);
    assert.deepEqual(parseCoordenadas('40.4168°N, 3.7038°W'), SOL);
    assert.deepEqual(parseCoordenadas('40.4168 n 3.7038 o'), SOL);
    assert.deepEqual(parseCoordenadas('33.8688° S, 151.2093° E'), {
      ok: true,
      punto: { lat: -33.8688, lng: 151.2093 },
    });
  });

  it('rechaza hemisferio en una sola parte', () => {
    for (const texto of ['40.4168 N, 3.7038', '40.4168° N, 3.7038°', '40.4168, 3.7038 W', '40.4168, 3.7038 O']) {
      const resultado = parseCoordenadas(texto);
      assert.equal(resultado.ok, false, texto);
      assert.match(resultado.ok ? '' : resultado.error, /hemisferio/, texto);
    }
  });

  it('rechaza signo y hemisferio a la vez', () => {
    assert.equal(parseCoordenadas('-40.4168 S, 3.7038 W').ok, false);
  });

  it('exige 4 decimales: enteros y textos a medio teclear no son posiciones', () => {
    for (const texto of ['40, 41', '40 41', '-33,86', '40.4168, -3', '40.4168, -3.', '40.4168, -3.703', '40.416, -3.7038']) {
      assert.equal(parseCoordenadas(texto).ok, false, texto);
    }
    const corto = parseCoordenadas('40.4168, -3.703');
    assert.match(corto.ok ? '' : corto.error, /4 decimales/);
  });

  it('de una URL de un sitio usa el pin (!3d!4d), no el centro de la camara (@)', () => {
    assert.deepEqual(parseCoordenadas(URL_SITIO), SOL);
    for (const host of ['www.google.es', 'google.com', 'www.google.co.uk', 'www.google.com.ar']) {
      assert.deepEqual(parseCoordenadas(URL_SITIO.replace('www.google.com', host)), SOL, host);
    }
    assert.deepEqual(parseCoordenadas('https://maps.google.com/?q=Bar!3d40.4168!4d-3.7038'), SOL);
    assert.deepEqual(parseCoordenadas('https://www.google.com/maps/place/Bar/data=!3d40.4168!4d-3.7038'), SOL);
  });

  it('rechaza URLs sin pin, con varios pines, de otro host o con texto detras', () => {
    for (const [texto, motivo] of [
      ['https://www.google.com/maps/@40.4168,-3.7038,17z', /pin/],
      ['https://www.google.com/maps/place/!3d40.1111!4d-3.1111/!3d41.2222!4d2.2222', /varias/],
      // Un pin roto al lado de uno bueno tambien son dos posiciones.
      ['https://www.google.com/maps/place/X/data=!3d1.0000!4d2.0000x/!3d40.4168!4d-3.7038', /varias/],
      ['https://www.google.com/maps/place/X/data=!3d1!4d2/!3d40.4168!4d-3.7038', /varias/],
      ['https://www.google.com/maps/place/X/data=!3d1.0000!4d2.0000%2C/!3d40.4168!4d-3.7038', /varias/],
      ['https://www.google.com/maps/place/X/data=!3d40.4168!4d-3.7038#!3d1.0000!4d1.0000x', /varias/],
      ['https://www.google.com/maps/place/X/data=!3d40.4168!4d-3.7038!3d40.4168', /varias/],
      ['https://www.google.com/maps/place/X/data=!3d!3d40.4168!4d-3.7038', /varias/],
      ['https://www.google.com/maps/place/X/data=!3D1.0000!4D2.0000/!3d40.4168!4d-3.7038', /varias/],
      ['https://evil.example/?x=!3d10.0000!4d20.0000', /Google Maps/],
      ['https://google.evil/maps/place/X/data=!3d40.4169!4d-3.7035', /Google Maps/],
      ['https://google.com.x/maps/place/X/data=!3d40.4169!4d-3.7035', /Google Maps/],
      ['https://www.google.es.evil.com/maps/place/X/data=!3d40.4169!4d-3.7035', /Google Maps/],
      ['https://www.google.com/mapsevil/place/X/data=!3d40.4169!4d-3.7035', /Google Maps/],
      [`${URL_SITIO} hola 1.0000, 2.0000`, /Google Maps/],
    ] as const) {
      const resultado = parseCoordenadas(texto);
      assert.equal(resultado.ok, false, texto);
      assert.match(resultado.ok ? '' : resultado.error, motivo, texto);
    }
  });

  it('rechaza un pin cuyo numero no termina limpio en vez de cortarlo', () => {
    for (const cola of ['e2', '.9999', '%20hola', 'x']) {
      const texto = `https://www.google.com/maps/place/X/data=!3d40.4169!4d-3.7035${cola}`;
      assert.equal(parseCoordenadas(texto).ok, false, texto);
    }
    const loteLat = 'https://www.google.com/maps/place/X/data=!3d40.4169.5!4d-3.7035';
    assert.equal(parseCoordenadas(loteLat).ok, false);
  });

  it('no busca coordenadas dentro de otro texto', () => {
    for (const texto of ['40.4168, -3.7038 @1.0000,2.0000,', 'Bar @1.0000,2.0000,17z', '@40.4168,-3.7038,17z', 'Bar 40.4168, -3.7038']) {
      assert.equal(parseCoordenadas(texto).ok, false, texto);
    }
  });

  it('rechaza vacio, un solo numero, tres numeros, texto y notaciones raras', () => {
    for (const texto of ['   ', '40.4168', '40.1000, -3.7000, 12.0000', 'Puerta del Sol', '40.4168, abc', '1e1, 2e1', 'Infinity, 0.0000', '0x10, 0.0000']) {
      assert.equal(parseCoordenadas(texto).ok, false, texto);
    }
  });

  it('rechaza la coma decimal', () => {
    assert.equal(parseCoordenadas('40,4168, -3,7038').ok, false);
  });

  it('rechaza latitud y longitud fuera de rango con el mensaje de cada una', () => {
    const lat = parseCoordenadas('91.0000, 0.0000');
    const lng = parseCoordenadas('0.0000, -180.5000');
    assert.match(lat.ok ? '' : lat.error, /latitud/);
    assert.match(lng.ok ? '' : lng.error, /longitud/);
  });

  it('acepta los limites exactos', () => {
    assert.equal(parseCoordenadas('-90.0000, 180.0000').ok, true);
  });
});

describe('formatCoordenadas', () => {
  it('lo que se ve vuelve exactamente al mismo punto (sin redondeo)', () => {
    for (const punto of [
      { lat: 40.416809423407, lng: -3.703825813266 },
      { lat: 40.5, lng: -3 },
      { lat: 0, lng: 0.1 + 0.2 },
      { lat: 1e-7, lng: -2.5e-9 },
      { lat: 89.99999999999999, lng: 1.23e-10 },
      { lat: 3.169490014762266e-7, lng: -1e-21 },
      { lat: -0, lng: Number.MIN_VALUE },
      { lat: -90, lng: 180 },
    ]) {
      const texto = formatCoordenadas(punto);
      assert.deepStrictEqual(parseCoordenadas(texto), { ok: true, punto }, texto);
    }
  });

  it('propiedad: 20000 puntos al azar (muchos diminutos) vuelven exactos', () => {
    // PRNG con semilla fija (mulberry32): el test es determinista.
    let semilla = 0x5eed;
    const azar = () => {
      semilla = (semilla + 0x6d2b79f5) | 0;
      let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const valor = (limite: number) => {
      const escala = azar() < 0.5 ? 1 : 10 ** -Math.floor(azar() * 320);
      return (azar() * 2 - 1) * limite * escala;
    };
    for (let i = 0; i < 20000; i += 1) {
      const punto = { lat: valor(90), lng: valor(180) };
      const texto = formatCoordenadas(punto);
      const resultado = parseCoordenadas(texto);
      assert.ok(
        resultado.ok && Object.is(resultado.punto.lat, punto.lat) && Object.is(resultado.punto.lng, punto.lng),
        `${JSON.stringify(punto)} -> "${texto}"`,
      );
    }
  });

  it('rellena hasta 4 decimales cuando el numero tiene menos', () => {
    assert.equal(formatCoordenadas({ lat: 40.5, lng: -3 }), '40.5000, -3.0000');
  });
});

describe('describirPunto', () => {
  it('pone hemisferios en castellano', () => {
    assert.equal(describirPunto({ lat: 40.4168, lng: -3.7038 }), '40.4168° N, 3.7038° O');
    assert.equal(describirPunto({ lat: -33.8688, lng: 151.2093 }), '33.8688° S, 151.2093° E');
  });

  it('muestra el valor exacto que se guarda, sin redondear', () => {
    assert.equal(describirPunto({ lat: 40.416809, lng: -3.703825813266 }), '40.416809° N, 3.703825813266° O');
    assert.equal(describirPunto({ lat: 3.169490014762266e-7, lng: -1e-6 }), '0.0000003169490014762266° N, 0.000001° O');
  });
});

describe('estadoCampoCoordenadas', () => {
  /** Lo que hace el campo web: una llamada por pulsacion. */
  function teclear(texto: string) {
    const vistos: { prefijo: string; punto: Punto }[] = [];
    let final = estadoCampoCoordenadas('');
    for (let i = 1; i <= texto.length; i += 1) {
      final = estadoCampoCoordenadas(texto.slice(0, i));
      if (final.punto) vistos.push({ prefijo: texto.slice(0, i), punto: final.punto });
    }
    return { vistos, final };
  }

  it('regresion: coma decimal tecleada letra a letra nunca da una posicion', () => {
    for (const texto of ['40,4168, -3,7038', '41,38 2,17']) {
      const { vistos, final } = teclear(texto);
      assert.deepEqual(vistos, [], texto);
      assert.equal(final.punto, null);
      assert.notEqual(final.error, null);
    }
  });

  it('regresion: tecleando cualquier formato aceptado, ningun punto intermedio se aleja mas de 0.0001° del final', () => {
    for (const texto of [
      '40.416809, -3.703825',
      '40.4168° N, 3.7038° W',
      '40.4168º N, 3.7038º O',
      '40.4168°N, 3.7038°W',
      '40.4168 S, 3.7038 W',
      '33.8688° S, 151.2093° E',
      '(40.4168, -3.7038)',
      '[40.4168; -3.7038]',
      '+.5000, -.2500',
      URL_SITIO,
    ]) {
      const { vistos, final } = teclear(texto);
      assert.ok(final.punto, `el texto final deberia ser valido: ${texto}`);
      const destino = final.punto;
      for (const { prefijo, punto } of vistos) {
        assert.ok(
          Math.abs(punto.lat - destino.lat) < 1e-4 && Math.abs(punto.lng - destino.lng) < 1e-4,
          `"${prefijo}" da ${JSON.stringify(punto)}, lejos de ${JSON.stringify(destino)}`,
        );
      }
    }
  });

  it('borrar el campo quita el punto sin mostrar error', () => {
    assert.deepEqual(estadoCampoCoordenadas('   '), { punto: null, error: null });
  });
});
