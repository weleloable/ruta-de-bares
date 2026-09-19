import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATALOGO_BARES, buscarPorNombre, idsYaEnRuta } from './catalogo.ts';
import {
  CENTRO_POR_DEFECTO,
  LOGO_MAX_CARACTERES,
  NOMBRE_MAX,
  crearBarPropio,
  fusionarCatalogo,
  leerPropios,
  nuevoId,
  serializarPropios,
  validarBarPropio,
  type BorradorBarPropio,
} from './catalogoPropio.ts';
import { validateBarDraft } from './validation.ts';

const LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function borrador(cambios: Partial<BorradorBarPropio> = {}): BorradorBarPropio {
  return { nombre: 'La Cepa', punto: { lat: 40.4823, lng: -3.3641 }, logoUri: LOGO, ...cambios };
}

describe('validarBarPropio', () => {
  it('acepta un borrador completo', () => {
    assert.deepEqual(validarBarPropio(borrador(), CATALOGO_BARES), []);
  });

  it('la imagen es opcional: sin ella sale un sello con iniciales', () => {
    assert.deepEqual(validarBarPropio(borrador({ logoUri: null }), CATALOGO_BARES), []);
  });

  it('pide nombre, sin contar espacios', () => {
    assert.equal(validarBarPropio(borrador({ nombre: '   ' }), []).length, 1);
    assert.equal(validarBarPropio(borrador({ nombre: '' }), []).length, 1);
  });

  it('limita la longitud del nombre', () => {
    assert.deepEqual(validarBarPropio(borrador({ nombre: 'a'.repeat(NOMBRE_MAX) }), []), []);
    assert.equal(validarBarPropio(borrador({ nombre: 'a'.repeat(NOMBRE_MAX + 1) }), []).length, 1);
  });

  it('rechaza un nombre que ya esta en la lista cerrada, sin distinguir mayusculas', () => {
    const errores = validarBarPropio(borrador({ nombre: '  la OVEJA negra ' }), CATALOGO_BARES);
    assert.equal(errores.length, 1);
    assert.match(errores[0], /Ya hay un bar/);
  });

  it('rechaza un nombre que ya esta entre los propios', () => {
    assert.equal(validarBarPropio(borrador(), [{ name: 'la cepa' }]).length, 1);
  });

  it('pide ubicacion: sin punto, fuera de rango o en (0, 0)', () => {
    assert.equal(validarBarPropio(borrador({ punto: null }), []).length, 1);
    assert.equal(validarBarPropio(borrador({ punto: { lat: 91, lng: 0 } }), []).length, 1);
    assert.equal(validarBarPropio(borrador({ punto: { lat: 0, lng: 0 } }), []).length, 1);
    assert.equal(validarBarPropio(borrador({ punto: { lat: Number.NaN, lng: 3 } }), []).length, 1);
  });

  it('rechaza una imagen que no es una data URL de imagen o pesa demasiado', () => {
    assert.equal(validarBarPropio(borrador({ logoUri: 'https://x.test/a.png' }), []).length, 1);
    assert.equal(validarBarPropio(borrador({ logoUri: 'data:text/html;base64,AAAA' }), []).length, 1);
    const enorme = `data:image/jpeg;base64,${'A'.repeat(LOGO_MAX_CARACTERES)}`;
    assert.equal(validarBarPropio(borrador({ logoUri: enorme }), []).length, 1);
  });

  it('acumula todos los errores en vez de parar en el primero', () => {
    assert.equal(validarBarPropio(borrador({ nombre: '', punto: null }), []).length, 2);
  });
});

describe('crearBarPropio', () => {
  it('recorta el nombre y marca el bar como propio, sin plus code', () => {
    const bar = crearBarPropio(borrador({ nombre: '  La Cepa  ' }), 'propio-x');
    assert.deepEqual(bar, {
      id: 'propio-x',
      name: 'La Cepa',
      lat: 40.4823,
      lng: -3.3641,
      logoUri: LOGO,
      propio: true,
    });
  });

  it('sin imagen no deja un logoUri vacio', () => {
    assert.equal('logoUri' in crearBarPropio(borrador({ logoUri: null }), 'propio-x'), false);
  });

  it('el resultado pasa la misma validacion que el servidor exige a un bar', () => {
    const bar = crearBarPropio(borrador(), 'propio-x');
    const problemas = validateBarDraft({
      name: bar.name,
      address: '',
      lat: bar.lat,
      lng: bar.lng,
      radiusM: 50,
      opensAt: new Date('2026-01-01T19:00:00Z'),
      closesAt: new Date('2026-01-01T20:00:00Z'),
      notes: '',
    });
    assert.deepEqual(problemas, []);
  });

  it('se niega a crear sin ubicacion (habia que validar antes)', () => {
    assert.throws(() => crearBarPropio(borrador({ punto: null }), 'propio-x'));
  });
});

describe('nuevoId', () => {
  it('empieza por propio- y es determinista', () => {
    assert.equal(nuevoId(1_700_000_000_000, 0.5), nuevoId(1_700_000_000_000, 0.5));
    assert.match(nuevoId(1_700_000_000_000, 0.5), /^propio-[0-9a-z]+-[0-9a-z]+$/);
  });

  it('dos altas en el mismo milisegundo con distinto azar no chocan', () => {
    assert.notEqual(nuevoId(1, 0.1), nuevoId(1, 0.9));
  });

  it('el azar en el limite (casi 1) no rompe el formato', () => {
    assert.match(nuevoId(1, 0.9999999), /^propio-[0-9a-z]+-[0-9a-z]+$/);
  });
});

describe('serializarPropios / leerPropios', () => {
  it('ida y vuelta sin perder nada', () => {
    const propios = [crearBarPropio(borrador(), 'propio-a'), crearBarPropio(borrador({ nombre: 'Otro', logoUri: null }), 'propio-b')];
    assert.deepEqual(leerPropios(serializarPropios(propios)), propios);
  });

  it('nada guardado, vacio o basura dan lista vacia', () => {
    assert.deepEqual(leerPropios(null), []);
    assert.deepEqual(leerPropios(''), []);
    assert.deepEqual(leerPropios('{no es json'), []);
    assert.deepEqual(leerPropios('{"a":1}'), []);
    assert.deepEqual(leerPropios('"texto"'), []);
  });

  it('descarta solo las entradas rotas y conserva las buenas', () => {
    const bueno = crearBarPropio(borrador(), 'propio-ok');
    const json = JSON.stringify([
      null,
      'texto',
      { id: 'sin-prefijo', name: 'X', lat: 40, lng: -3 },
      { id: 'propio-sin-nombre', name: '  ', lat: 40, lng: -3 },
      { id: 'propio-fuera', name: 'Y', lat: 500, lng: -3 },
      { id: 'propio-texto', name: 'Z', lat: '40', lng: -3 },
      bueno,
    ]);
    assert.deepEqual(leerPropios(json), [bueno]);
  });

  it('una imagen rota pierde la imagen pero no el bar', () => {
    const json = JSON.stringify([{ id: 'propio-a', name: 'Bar A', lat: 40.4, lng: -3.3, logoUri: 'http://x/a.png' }]);
    assert.deepEqual(leerPropios(json), [{ id: 'propio-a', name: 'Bar A', lat: 40.4, lng: -3.3, propio: true }]);
  });

  it('siempre devuelve los bares marcados como propios, aunque el JSON no lo diga', () => {
    const json = JSON.stringify([{ id: 'propio-a', name: 'Bar A', lat: 40.4, lng: -3.3 }]);
    assert.equal(leerPropios(json)[0].propio, true);
  });
});

describe('fusionarCatalogo', () => {
  it('la lista cerrada va primero y los propios detras', () => {
    const propio = crearBarPropio(borrador(), 'propio-a');
    const lista = fusionarCatalogo(CATALOGO_BARES, [propio]);
    assert.equal(lista.length, CATALOGO_BARES.length + 1);
    assert.equal(lista[0].id, CATALOGO_BARES[0].id);
    assert.equal(lista.at(-1)?.id, 'propio-a');
  });

  it('un propio con el nombre de uno cerrado se descarta: manda el que lleva logo de assets', () => {
    const choque = crearBarPropio(borrador({ nombre: 'Lola' }), 'propio-lola');
    const lista = fusionarCatalogo(CATALOGO_BARES, [choque]);
    assert.equal(lista.length, CATALOGO_BARES.length);
    assert.equal(buscarPorNombre('lola', lista)?.id, 'lola');
  });

  it('dos propios con el mismo nombre o id: solo entra el primero', () => {
    const a = crearBarPropio(borrador({ nombre: 'Igual' }), 'propio-1');
    const b = crearBarPropio(borrador({ nombre: 'igual' }), 'propio-2');
    const c = crearBarPropio(borrador({ nombre: 'Distinto' }), 'propio-1');
    assert.equal(fusionarCatalogo([], [a, b, c]).length, 1);
  });

  it('no muta la lista cerrada', () => {
    const antes = CATALOGO_BARES.length;
    fusionarCatalogo(CATALOGO_BARES, [crearBarPropio(borrador(), 'propio-a')]);
    assert.equal(CATALOGO_BARES.length, antes);
  });

  it('un bar propio se puede marcar como ya en la ruta y se busca por nombre como los demas', () => {
    const propio = crearBarPropio(borrador(), 'propio-a');
    const lista = fusionarCatalogo(CATALOGO_BARES, [propio]);
    assert.equal(buscarPorNombre('la cepa', lista)?.id, 'propio-a');
    assert.deepEqual([...idsYaEnRuta([{ id: 'b1', name: 'La Cepa' }], undefined, lista)], ['propio-a']);
  });
});

describe('CENTRO_POR_DEFECTO', () => {
  it('cae dentro de Alcala de Henares', () => {
    assert.ok(CENTRO_POR_DEFECTO.lat > 40.47 && CENTRO_POR_DEFECTO.lat < 40.495);
    assert.ok(CENTRO_POR_DEFECTO.lng > -3.38 && CENTRO_POR_DEFECTO.lng < -3.35);
  });
});
