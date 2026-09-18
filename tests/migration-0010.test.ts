import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0010 anade never_opened a la bandeja: una conexion recien abierta, sin un
 * solo mensaje, tambien pide atencion (la burbujita del icono de la pestana).
 * Lo que hay que asegurar es que empieza en true y se apaga al abrir el chat.
 */

const migraciones = [
  '0001_init.sql',
  '0002_guard_role_sql_editor.sql',
  '0004_tirate_una_cana.sql',
  '0005_cana_visto.sql',
  '0006_avatar_miniatura.sql',
  '0007_cana_solo_la_pregunta.sql',
  '0008_cana_bloqueos_denuncias.sql',
  '0009_cana_consentimiento_y_datos.sql',
  '0010_cana_chat_sin_abrir.sql',
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'), ('${LUIS}', 'luis@example.com'), ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Ruta publicada', true, '${ADMIN}');
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;

async function conectar(db: PGlite, a: Actor): Promise<string> {
  for (const uid of [ANA, LUIS]) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`);
  }
  await a.como(ANA);
  await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
  await a.como(LUIS);
  const [fila] = await filas(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, ANA]);
  return fila.connection_id as string;
}

describe('0010_cana_chat_sin_abrir.sql', async () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const sql = migraciones.at(-1) as string;
    assert.ok(!(await init()).parse(sql).error);
    assert.ok(!(await init()).parsePlpgsql(sql).error);
  });

  const db = await crearBase([...migraciones, migraciones.at(-1) as string]);
  await db.exec(DATOS);

  it('una conexion recien abierta viene marcada como sin abrir, para los dos', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a);
      for (const uid of [ANA, LUIS]) {
        await a.como(uid);
        const [chat] = await filas(db, 'select * from public.match_inbox($1)', [RUTA]);
        assert.equal(chat.connection_id, id);
        assert.equal(chat.never_opened, true, `${uid} deberia tener el chat sin abrir`);
        assert.equal(chat.unread_count, 0, 'sin mensajes no hay nada sin leer');
      }
    });
  });

  it('abrir el chat lo apaga, y solo para quien lo abrio', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a);
      await a.como(ANA);
      await db.query('select * from public.match_fetch_messages($1)', [id]);

      const [deAna] = await filas(db, 'select * from public.match_inbox($1)', [RUTA]);
      assert.equal(deAna.never_opened, false);

      await a.como(LUIS);
      const [deLuis] = await filas(db, 'select * from public.match_inbox($1)', [RUTA]);
      assert.equal(deLuis.never_opened, true, 'que Ana lo abra no apaga el de Luis');
    });
  });
});
