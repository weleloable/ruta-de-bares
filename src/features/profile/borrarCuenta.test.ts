import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONFIRMAR_BORRADO,
  fotosABorrar,
  rutasDeFotos,
  textoDeImpedimentos,
  traducirErrorBorrado,
} from './borrarCuenta.ts';

describe('fotosABorrar (0032)', () => {
  const U = 'u1';
  it('todo menos lo retenido como prueba de una denuncia', () => {
    assert.deepEqual(fotosABorrar([`${U}/a.jpg`, `${U}/b.jpg`, `${U}/c.jpg`], [`${U}/b.jpg`]), [
      `${U}/a.jpg`,
      `${U}/c.jpg`,
    ]);
  });

  it('si solo queda la prueba, no queda nada que borrar: la cuenta se puede borrar igual', () => {
    assert.deepEqual(fotosABorrar([`${U}/b.jpg`], [`${U}/b.jpg`]), []);
  });

  it('sin pruebas, todo', () => {
    assert.deepEqual(fotosABorrar([`${U}/a.jpg`], []), [`${U}/a.jpg`]);
  });
});

describe('textoDeImpedimentos', () => {
  it('sin impedimentos, null: se puede seguir', () => {
    assert.equal(textoDeImpedimentos([]), null);
  });

  it('cada codigo del servidor tiene su frase, y ninguna es el codigo crudo', () => {
    for (const codigo of ['ADMIN_CANNOT_DELETE', 'OWNS_ROUTES']) {
      const texto = textoDeImpedimentos([codigo]);
      assert.ok(texto && !texto.includes(codigo), `${codigo} sin frase propia`);
    }
  });

  it('un codigo que esta version no conoce tambien PARA: mejor no borrar fotos a ciegas', () => {
    assert.match(textoDeImpedimentos(['ALGO_NUEVO']) ?? '', /no se puede borrar/);
  });

  it('con varios, sale el primero', () => {
    assert.equal(textoDeImpedimentos(['OWNS_ROUTES', 'ADMIN_CANNOT_DELETE']), textoDeImpedimentos(['OWNS_ROUTES']));
  });
});

describe('HAS_OPEN_REPORTS ya no impide borrarse (0032)', () => {
  it('si llegase (una base sin la 0032), cae en el codigo desconocido y PARA igual', () => {
    assert.match(textoDeImpedimentos(['HAS_OPEN_REPORTS']) ?? '', /no se puede borrar/);
  });
});

describe('CANA_BLOCKED ya no impide borrarse (0024)', () => {
  it('tener la cana desactivada no para el borrado', () => {
    // El servidor dejo de devolverlo. Si volviese (una base sin la 0024), cae
    // en la rama del codigo desconocido y PARA igual, que es lo prudente.
    assert.match(textoDeImpedimentos(['CANA_BLOCKED']) ?? '', /no se puede borrar/);
    assert.equal(textoDeImpedimentos([]), null);
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
  it('un admin lee que no puede, no el codigo interno, y a donde escribir', () => {
    const texto = traducirErrorBorrado('ADMIN_CANNOT_DELETE');
    assert.ok(!texto.includes('ADMIN_CANNOT_DELETE'));
    assert.match(texto, /administradores no pueden borrar/);
    // El art. 17 no admite "nunca": si la app no puede, tiene que decir por
    // donde si. El canal es el de la 0026.
    assert.match(texto, /Escribir a la organización/);
  });

  it('y lo mismo quien creo una ruta: no se le deja en un callejon', () => {
    assert.match(traducirErrorBorrado('OWNS_ROUTES'), /Escribir a la organización/);
  });

  it('el resto de impedimentos tambien llegan traducidos', () => {
    for (const codigo of ['OWNS_ROUTES', 'ADMIN_CANNOT_DELETE']) {
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
