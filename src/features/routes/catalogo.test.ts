import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buscarPorNombre,
  type BarCatalogo,
  direccionVisible,
  idsYaEnRuta,
  iniciales,
} from './catalogo.ts';

// La lista de verdad vive en Postgres (0036); esto es solo un catalogo de prueba.
const CATALOGO: readonly BarCatalogo[] = [
  { id: 'la-oveja-negra', name: 'La Oveja Negra', lat: 40.481562, lng: -3.364563 },
  { id: 'la-ruina', name: 'La Ruina', lat: 40.479937, lng: -3.370063 },
  { id: 'lola', name: 'Lola', lat: 40.482062, lng: -3.365437 },
];

describe('direccionVisible', () => {
  it('oculta un plus code, con o sin ciudad detras (asi lo guardaba la version anterior)', () => {
    assert.equal(direccionVisible('FJMQ+XP Alcala de Henares'), '');
    assert.equal(direccionVisible('FJMQ+XP'), '');
    assert.equal(direccionVisible('  fjmq+xp Alcalá de Henares '), '');
    assert.equal(direccionVisible('8CGRFJMQ+XP'), '');
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

describe('buscarPorNombre', () => {
  it('encuentra sin distinguir mayusculas ni espacios de los bordes', () => {
    assert.equal(buscarPorNombre('  la OVEJA negra ', CATALOGO)?.id, 'la-oveja-negra');
  });

  it('devuelve undefined para un bar que no esta en el catalogo', () => {
    assert.equal(buscarPorNombre('Bar de la esquina', CATALOGO), undefined);
  });
});

describe('idsYaEnRuta', () => {
  it('marca los bares del catalogo que ya estan en la ruta', () => {
    const ocupados = idsYaEnRuta(
      [
        { id: '1', name: 'La Ruina' },
        { id: '2', name: 'Un bar de antes del catalogo' },
      ],
      undefined,
      CATALOGO,
    );
    assert.deepEqual([...ocupados], ['la-ruina']);
  });

  it('no marca el bar que se esta editando: tiene que seguir disponible', () => {
    const ocupados = idsYaEnRuta(
      [
        { id: '1', name: 'La Ruina' },
        { id: '2', name: 'Lola' },
      ],
      '1',
      CATALOGO,
    );
    assert.deepEqual([...ocupados], ['lola']);
  });

  it('ruta vacia: nada ocupado', () => {
    assert.equal(idsYaEnRuta([], undefined, CATALOGO).size, 0);
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
