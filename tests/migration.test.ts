import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import init from 'pg-query-emscripten';

/**
 * La migracion es la pieza de mas riesgo del repositorio: gobierna permisos y
 * reglas de sellado, y un error solo aparece al pegarla en el SQL Editor de
 * Supabase, con medio esquema ya creado.
 *
 * pg-query-emscripten es el parser REAL de Postgres compilado a wasm, asi que
 * esto no es una aproximacion con expresiones regulares: si pasa aqui, la
 * gramatica es correcta.
 *
 * Lo que este test NO cubre, y hay que probar contra el proyecto de verdad
 * (lista de verificacion de docs/SETUP.md): que las tablas referenciadas
 * existan, que las policies dejen pasar a quien deben, y que claim_stamp
 * conceda y niegue sellos como toca.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const migracion = readFileSync(join(raiz, 'supabase/migrations/0001_init.sql'), 'utf8');

const pg = await init();

describe('0001_init.sql', () => {
  it('la gramatica SQL es valida para Postgres', () => {
    const resultado = pg.parse(migracion);
    // El parser devuelve null, no undefined, cuando no hay error.
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    // Si el fichero se vacia o se trunca, el parser dice "ok" con 0 sentencias.
    assert.ok(
      (resultado.parse_tree?.stmts?.length ?? 0) > 40,
      'la migracion parece truncada',
    );
  });

  it('los cuerpos plpgsql compilan', () => {
    const resultado = pg.parsePlpgsql(migracion);
    assert.ok(!resultado.error, `error en plpgsql: ${JSON.stringify(resultado.error)}`);
    // claim_stamp, handle_new_user, guard_profile_role y los bloques DO.
    assert.ok(
      (resultado.plpgsql_funcs?.length ?? 0) >= 3,
      'faltan cuerpos plpgsql por validar',
    );
  });

  it('RLS esta activado en las cinco tablas', () => {
    for (const tabla of ['profiles', 'routes', 'route_bars', 'stamps', 'invites']) {
      assert.match(
        migracion,
        new RegExp(`alter table public\\.${tabla}\\s+enable row level security`),
        `${tabla} sin RLS`,
      );
    }
  });

  it('stamps no tiene ninguna via de INSERT para el cliente', () => {
    // El unico camino es claim_stamp, que es SECURITY DEFINER. Una policy de
    // INSERT en stamps abriria la puerta a inventarse sellos sin pisar el bar.
    assert.ok(
      !/create policy \w+ on public\.stamps\s+for insert/i.test(migracion),
      'alguien ha anadido una policy de INSERT en stamps',
    );
    assert.match(migracion, /revoke insert, update on public\.stamps from authenticated/);
  });

  it('claim_stamp comprueba ventana horaria, geocerca y publicacion', () => {
    const cuerpo = /create or replace function public\.claim_stamp[\s\S]*?\n\$\$;/.exec(migracion);
    assert.ok(cuerpo, 'no se encuentra claim_stamp');
    for (const marca of ['TOO_EARLY', 'TOO_LATE', 'TOO_FAR_', 'ROUTE_NOT_PUBLISHED']) {
      assert.ok(cuerpo[0].includes(marca), `claim_stamp ya no levanta ${marca}`);
    }
    assert.ok(cuerpo[0].includes('security definer'), 'claim_stamp sin security definer');
  });

  it('invites guarda la huella del token, nunca el token', () => {
    assert.match(migracion, /token_hash text not null unique/);
    assert.ok(
      !/\btoken text\b/.test(migracion),
      'hay una columna de token en claro en el esquema',
    );
  });
});
