import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CONFIRMAR_BORRADO, rutasDeFotos, textoDeImpedimentos, traducirErrorBorrado } from './borrarCuenta.ts';

describe('textoDeImpedimentos', () => {
  it('sin impedimentos, null: se puede seguir', () => {
    assert.equal(textoDeImpedimentos([]), null);
  });

  it('cada codigo del servidor tiene su frase, y ninguna es el codigo crudo', () => {
    for (const codigo of ['ADMIN_CANNOT_DELETE', 'OWNS_ROUTES', 'HAS_OPEN_REPORTS', 'CANA_BLOCKED']) {
      const texto = textoDeImpedimentos([codigo]);
      assert.ok(texto && !texto.includes(codigo), `${codigo} sin frase propia`);
    }
  });

  it('un codigo que esta version no conoce tambien PARA: mejor no borrar fotos a ciegas', () => {
    assert.match(textoDeImpedimentos(['ALGO_NUEVO']) ?? '', /no se puede borrar/);
  });

  it('con varios, sale el primero', () => {
    assert.equal(textoDeImpedimentos(['OWNS_ROUTES', 'CANA_BLOCKED']), textoDeImpedimentos(['OWNS_ROUTES']));
  });
});

describe('rutasDeFotos', () => {
  it('antepone la carpeta de la persona: la policy de storage exige el uid como primera carpeta', () => {
    assert.deepEqual(rutasDeFotos('u1', ['avatar-1.jpg', 'thumb-1.jpg']), ['u1/avatar-1.jpg', 'u1/thumb-1.jpg']);
  });

  it('sin fotos no hay nada que borrar', () => {
    assert.deepEqual(rutasDeFotos('u1', []), []);
  });

  it('ignora entradas vacias (storage.list a veces devuelve un marcador de carpeta)', () => {
    assert.deepEqual(rutasDeFotos('u1', ['', 'a.jpg']), ['u1/a.jpg']);
  });
});

describe('traducirErrorBorrado', () => {
  it('un admin lee que no puede, no el codigo interno', () => {
    assert.equal(
      traducirErrorBorrado('ADMIN_CANNOT_DELETE'),
      'Los administradores no pueden borrar su cuenta desde la app.',
    );
  });

  it('el resto de impedimentos tambien llegan traducidos', () => {
    for (const codigo of ['OWNS_ROUTES', 'HAS_OPEN_REPORTS', 'CANA_BLOCKED']) {
      assert.equal(traducirErrorBorrado(codigo), textoDeImpedimentos([codigo]));
    }
  });

  it('sesion caducada', () => {
    assert.match(traducirErrorBorrado('NOT_AUTHENTICATED'), /sesion ha caducado/);
  });

  it('migracion sin aplicar: lo dice claro en vez de un error de PostgREST', () => {
    const postgrest = 'Could not find the function public.delete_my_account without parameters in the schema cache';
    assert.match(traducirErrorBorrado(postgrest), /migracion 0021/);
  });

  it('cualquier otro mensaje pasa tal cual', () => {
    assert.equal(traducirErrorBorrado('fallo de red'), 'fallo de red');
  });
});

describe('CONFIRMAR_BORRADO', () => {
  it('avisa de que no se deshace y de lo que se pierde', () => {
    assert.match(CONFIRMAR_BORRADO.mensaje, /No se puede deshacer/);
    for (const cosa of ['sellos', 'foto', 'chats']) assert.match(CONFIRMAR_BORRADO.mensaje, new RegExp(cosa));
  });

  it('es honesto con lo que se conserva: el registro de moderacion Y las denuncias en las que se participo (0015 y 0017)', () => {
    assert.match(CONFIRMAR_BORRADO.mensaje, /registro de moderación/);
    assert.match(CONFIRMAR_BORRADO.mensaje, /denuncias en las que participaste/);
  });

  it('no promete lo que no cumple: ya no dice que solo se conserva si hubo sancion', () => {
    assert.doesNotMatch(CONFIRMAR_BORRADO.mensaje, /si hubo alguna sanción/);
  });
});
