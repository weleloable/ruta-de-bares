import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LOGO_MAX_CARACTERES,
  NOMBRE_MAX,
  PREFIJO_ID,
  aFilaCompartida,
  desdeFilaCompartida,
  desdeFilasCompartidas,
  fusionarCatalogo,
  pendientesDeSubir,
  traducirErrorAlta,
} from './catalogoPropio.ts';
import { CATALOGO_BARES, type BarCatalogo } from './catalogo.ts';

const LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const UUID = '5f0c2f6e-8f3e-4a62-9d0b-0a5b4a2f9c11';

const fila = (cambios: Record<string, unknown> = {}) => ({
  id: UUID,
  name: 'La Cepa',
  lat: 40.48,
  lng: -3.36,
  logo: LOGO,
  ...cambios,
});

const local = (id: string, name: string): BarCatalogo => ({ id, name, lat: 40.48, lng: -3.36, propio: true });

describe('desdeFilaCompartida: lo que llega de catalog_bars', () => {
  it('una fila buena sale como bar propio con el logo, y el id lleva el prefijo', () => {
    assert.deepEqual(desdeFilaCompartida(fila()), {
      id: `${PREFIJO_ID}${UUID}`,
      name: 'La Cepa',
      lat: 40.48,
      lng: -3.36,
      logoUri: LOGO,
      propio: true,
    });
  });

  it('sin logo no inventa uno', () => {
    const bar = desdeFilaCompartida(fila({ logo: null }));
    assert.ok(bar);
    assert.equal('logoUri' in bar, false);
  });

  it('un logo que no es imagen o pasa del tope pierde el logo pero no el bar', () => {
    for (const logo of ['http://malo.example/x.png', 'data:text/html;base64,AA', `data:image/png;${'A'.repeat(LOGO_MAX_CARACTERES)}`]) {
      const bar = desdeFilaCompartida(fila({ logo }));
      assert.ok(bar, logo.slice(0, 20));
      assert.equal('logoUri' in bar, false);
    }
  });

  it('descarta lo roto: sin id, sin nombre, coordenadas malas o no es un objeto', () => {
    for (const roto of [null, 'x', 42, fila({ id: '' }), fila({ id: 7 }), fila({ name: '   ' }), fila({ name: null }), fila({ lat: 91 }), fila({ lng: 'a' }), fila({ lat: 0, lng: 0 })]) {
      assert.equal(desdeFilaCompartida(roto), null, JSON.stringify(roto));
    }
  });

  it('recorta el nombre', () => {
    assert.equal(desdeFilaCompartida(fila({ name: '  La Cepa  ' }))?.name, 'La Cepa');
  });
});

describe('desdeFilasCompartidas', () => {
  it('null o undefined (sin permiso, sin datos) es una lista vacia', () => {
    assert.deepEqual(desdeFilasCompartidas(null), []);
    assert.deepEqual(desdeFilasCompartidas(undefined), []);
  });

  it('una fila rota no tumba las demas', () => {
    const salida = desdeFilasCompartidas([fila(), { basura: true }, fila({ id: 'otro', name: 'Otro' })]);
    assert.deepEqual(salida.map((b) => b.name), ['La Cepa', 'Otro']);
  });

  it('dos nombres iguales sin distinguir mayusculas dejan el primero', () => {
    const salida = desdeFilasCompartidas([fila(), fila({ id: 'b', name: ' la cepa ' })]);
    assert.equal(salida.length, 1);
    assert.equal(salida[0].id, `${PREFIJO_ID}${UUID}`);
  });

  it('lo que sale se mezcla con la lista cerrada sin pisarla', () => {
    const fusion = fusionarCatalogo(CATALOGO_BARES, desdeFilasCompartidas([fila(), fila({ id: 'x', name: 'Anexo' })]));
    assert.equal(fusion.length, CATALOGO_BARES.length + 1);
    assert.ok(fusion.some((b) => b.name === 'La Cepa'));
    assert.equal(fusion.filter((b) => b.name === 'Anexo').length, 1);
  });
});

describe('aFilaCompartida: lo que se inserta', () => {
  it('lleva el autor que se le pasa (la policy exige que sea quien tiene la sesion)', () => {
    assert.deepEqual(aFilaCompartida({ name: ' La Cepa ', lat: 1, lng: 2, logoUri: LOGO }, 'uid-1'), {
      name: 'La Cepa',
      lat: 1,
      lng: 2,
      logo: LOGO,
      created_by: 'uid-1',
    });
  });

  it('sin logo manda null explicito', () => {
    assert.equal(aFilaCompartida({ name: 'A', lat: 1, lng: 2 }, 'u').logo, null);
  });

  it('no manda un nombre mas largo que el tope de la tabla', () => {
    assert.equal(aFilaCompartida({ name: 'x'.repeat(NOMBRE_MAX + 10), lat: 1, lng: 2 }, 'u').name.length, NOMBRE_MAX);
  });
});

describe('pendientesDeSubir: la migracion de lo que solo estaba en el dispositivo', () => {
  it('sube lo que no esta en la tabla', () => {
    const pendientes = pendientesDeSubir([local('propio-a', 'La Cepa'), local('propio-b', 'Otro')], []);
    assert.deepEqual(pendientes.map((b) => b.name), ['La Cepa', 'Otro']);
  });

  it('no sube lo que ya esta, sin distinguir mayusculas (la unique lo rechazaria)', () => {
    const remotos = desdeFilasCompartidas([fila()]);
    assert.deepEqual(pendientesDeSubir([local('propio-a', ' la cepa ')], remotos), []);
  });

  it('dos locales con el mismo nombre suben uno solo', () => {
    assert.equal(pendientesDeSubir([local('propio-a', 'X'), local('propio-b', 'x')], []).length, 1);
  });

  it('sin locales no hay nada que subir', () => {
    assert.deepEqual(pendientesDeSubir([], desdeFilasCompartidas([fila()])), []);
  });
});

describe('traducirErrorAlta', () => {
  it('distingue nombre repetido, falta de permiso y el resto', () => {
    assert.match(traducirErrorAlta({ code: '23505', message: 'x' }), /Ya hay un bar con ese nombre/);
    assert.match(traducirErrorAlta({ code: '42501', message: 'x' }), /administradores/);
    assert.match(traducirErrorAlta({ message: 'fetch failed' }), /No se pudo guardar/);
  });

  it('nunca ensena el mensaje crudo de Postgres', () => {
    assert.doesNotMatch(traducirErrorAlta({ code: '23505', message: 'duplicate key value violates catalog_bars_name_key' }), /duplicate|catalog_bars/);
  });
});
