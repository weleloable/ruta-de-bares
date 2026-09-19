import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buscarPorNombre,
  CATALOGO_BARES,
  direccionVisible,
  idsYaEnRuta,
  iniciales,
} from './catalogo.ts';
import { RADIO_INICIAL_M, validateBarDraft } from './validation.ts';

describe('direccionVisible', () => {
  it('oculta un plus code, con o sin ciudad detras (asi lo guardaba la version anterior)', () => {
    assert.equal(direccionVisible('FJMQ+XP Alcala de Henares'), '');
    assert.equal(direccionVisible('FJMQ+XP'), '');
    assert.equal(direccionVisible('  fjmq+xp Alcalá de Henares '), '');
    assert.equal(direccionVisible('8CGRFJMQ+XP'), '');
  });

  it('un plus code guardado por cada bar del catalogo se oculta', () => {
    for (const bar of CATALOGO_BARES) {
      assert.equal(direccionVisible(`${bar.plusCode} Alcala de Henares`), '', bar.id);
    }
  });

  it('una direccion de verdad pasa tal cual (sin espacios de los bordes)', () => {
    assert.equal(direccionVisible('Calle Mayor 12'), 'Calle Mayor 12');
    assert.equal(direccionVisible('  Plaza de Cervantes  '), 'Plaza de Cervantes');
  });

  it('una direccion que solo lleva un + en medio no se confunde con un plus code', () => {
    assert.equal(direccionVisible('Calle A+B 4'), 'Calle A+B 4');
  });

  it('vacio sigue vacio', () => {
    assert.equal(direccionVisible(''), '');
  });
});

describe('CATALOGO_BARES', () => {
  it('no esta vacio', () => {
    assert.ok(CATALOGO_BARES.length > 0);
  });

  it('ids y nombres son unicos (el nombre es la clave para recuperar el logo)', () => {
    const ids = CATALOGO_BARES.map((b) => b.id);
    const nombres = CATALOGO_BARES.map((b) => b.name.trim().toLowerCase());
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(nombres).size, nombres.length);
  });

  it('cada entrada pasa la misma validacion que el servidor exigiria al guardar', () => {
    const ahora = new Date('2026-01-01T19:00:00Z');
    const despues = new Date('2026-01-01T20:00:00Z');
    for (const bar of CATALOGO_BARES) {
      const problemas = validateBarDraft({
        name: bar.name,
        address: '',
        lat: bar.lat,
        lng: bar.lng,
        radiusM: RADIO_INICIAL_M,
        opensAt: ahora,
        closesAt: despues,
        notes: '',
      });
      assert.deepEqual(problemas, [], `${bar.id}: ${problemas.join(' ')}`);
    }
  });

  it('son los 14 bares de la lista final', () => {
    assert.equal(CATALOGO_BARES.length, 14);
  });

  it('todas las posiciones caen en el casco de Alcala de Henares (caza un digito mal copiado)', () => {
    // Caja generosa alrededor del centro (40.482, -3.364): unos 2,5 km de lado.
    for (const bar of CATALOGO_BARES) {
      assert.ok(bar.lat > 40.47 && bar.lat < 40.495, `${bar.id} lat ${bar.lat}`);
      assert.ok(bar.lng > -3.38 && bar.lng < -3.35, `${bar.id} lng ${bar.lng}`);
    }
  });

  it('el plus code de Google Maps esta bien formado y no se repite', () => {
    const codigos = CATALOGO_BARES.map((b) => b.plusCode);
    for (const c of codigos) assert.match(c, /^[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2}$/);
    assert.equal(new Set(codigos).size, codigos.length);
  });

  it('el plus code es interno: el catalogo no tiene direccion que ensenar', () => {
    for (const bar of CATALOGO_BARES) {
      assert.equal('address' in bar, false, bar.id);
    }
  });

  it('ninguna entrada esta en (0, 0), el valor que validateBarDraft trata como "sin marcar"', () => {
    for (const bar of CATALOGO_BARES) {
      assert.ok(!(bar.lat === 0 && bar.lng === 0), bar.id);
    }
  });
});

describe('buscarPorNombre', () => {
  it('encuentra sin distinguir mayusculas ni espacios de los bordes', () => {
    assert.equal(buscarPorNombre('  la OVEJA negra ')?.id, 'la-oveja-negra');
  });

  it('devuelve undefined para un bar que no esta en el catalogo', () => {
    assert.equal(buscarPorNombre('Bar de la esquina'), undefined);
  });
});

describe('idsYaEnRuta', () => {
  it('marca los bares del catalogo que ya estan en la ruta', () => {
    const ocupados = idsYaEnRuta([
      { id: '1', name: 'La Ruina' },
      { id: '2', name: 'Un bar de antes del catalogo' },
    ]);
    assert.deepEqual([...ocupados], ['la-ruina']);
  });

  it('no marca el bar que se esta editando: tiene que seguir disponible', () => {
    const ocupados = idsYaEnRuta(
      [
        { id: '1', name: 'La Ruina' },
        { id: '2', name: 'Lola' },
      ],
      '1',
    );
    assert.deepEqual([...ocupados], ['lola']);
  });

  it('ruta vacia: nada ocupado', () => {
    assert.equal(idsYaEnRuta([]).size, 0);
  });
});

describe('iniciales', () => {
  it('toma la primera letra de las dos primeras palabras', () => {
    assert.equal(iniciales('La Oveja Negra'), 'LO');
    assert.equal(iniciales('Green Factory'), 'GF');
  });

  it('una palabra da una letra', () => {
    assert.equal(iniciales('bar'), 'B');
  });

  it('vacio o solo espacios no revienta', () => {
    assert.equal(iniciales(''), '?');
    assert.equal(iniciales('   '), '?');
  });

  it('no parte un caracter fuera del BMP en dos', () => {
    assert.equal(iniciales('🍺 Bar'), '🍺B');
  });
});
