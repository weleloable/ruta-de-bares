import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0013 completa el contrato de admin para la bandeja de alertas: reclamar una
 * denuncia, leerla entera y contar las que quedan.
 *
 * Lo que hay que asegurar sobre Postgres real: que reclamar no se la quita a
 * quien ya la tenia, que el ticket trae lo que hace falta para decidir (foto
 * grande, ruta, si la cana sigue activa) y que nada de esto se le abre a quien
 * no es admin.
 */

const migraciones = [
  '0001_init.sql',
  '0002_guard_role_sql_editor.sql',
  '0005_tirate_una_cana.sql',
  '0006_cana_visto.sql',
  '0007_avatar_miniatura.sql',
  '0008_cana_solo_la_pregunta.sql',
  '0009_cana_bloqueos_denuncias.sql',
  '0013_cana_alertas_admin.sql',
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0013 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const EVA = '00000000-0000-4000-8000-00000000000c';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const ADMIN2 = '00000000-0000-4000-8000-00000000000e';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${EVA}', 'eva@example.com'),
    ('${ADMIN}', 'admin@example.com'),
    ('${ADMIN2}', 'jefa@example.com');
  update public.profiles set role = 'admin' where id in ('${ADMIN}', '${ADMIN2}');
  update public.profiles set avatar_url = 'https://ejemplo.test/foto.jpg',
                             avatar_thumb_url = 'https://ejemplo.test/foto-mini.jpg'
   where id = '${LUIS}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Compostelana de prueba', true, '${ADMIN}');
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

async function activar(db: PGlite, a: Actor, ...uids: string[]) {
  for (const uid of uids) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola')`);
  }
}

/** Ana denuncia a Luis por la foto. Devuelve el id de la denuncia. */
async function denunciaDeAna(db: PGlite, a: Actor): Promise<string> {
  await a.como(ANA);
  const [fila] = await filas(
    db,
    `select public.match_report($1, $2, 'foto', 'Esa foto no es suya', null, false) as id`,
    [RUTA, LUIS],
  );
  return fila.id as string;
}

describe('0013_cana_alertas_admin.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    // Una instancia del parser por llamada: parse() y parsePlpgsql() seguidos
    // sobre la misma revientan dentro del wasm con ficheros grandes.
    const resultado = (await init()).parse(m0013);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0013);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('las tres funciones nuevas son security definer con search_path fijado', () => {
    for (const nombre of ['match_admin_take', 'match_admin_report', 'match_admin_alert_count']) {
      const cuerpo = m0013.slice(m0013.indexOf(`function public.${nombre}`));
      const hasta = cuerpo.indexOf('$$;');
      assert.match(cuerpo.slice(0, hasta), /security definer/, `${nombre} sin security definer`);
      assert.match(cuerpo.slice(0, hasta), /set search_path = public/, `${nombre} sin search_path`);
    }
  });

  it('ninguna de las tres se le concede a anon', () => {
    const concesion = m0013.slice(m0013.indexOf('grant execute on function'));
    assert.match(concesion, /to authenticated;/);
    assert.doesNotMatch(concesion, /to anon/);
  });
});

describe('0013_cana_alertas_admin.sql: la bandeja de alertas', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('quien no es admin no puede reclamar, leer ni contar', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const denuncia = await denunciaDeAna(db, a);
      await a.como(ANA);
      await a.falla(rpc(db, 'select public.match_admin_take($1)', [denuncia]), /NOT_ADMIN/);
    });
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(rpc(db, 'select * from public.match_admin_report($1)', [RUTA]), /NOT_ADMIN/);
    });
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(rpc(db, 'select public.match_admin_alert_count()'), /NOT_ADMIN/);
    });
  });

  it('reclamarla la pone en revision y no se la quita a quien ya la tenia', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const denuncia = await denunciaDeAna(db, a);

      await a.como(ADMIN);
      const [primera] = await filas(db, 'select public.match_admin_take($1) as tomada', [denuncia]);
      assert.equal(primera.tomada, true);

      // La segunda persona que abre el mismo ticket no falla, pero tampoco
      // consta como quien lo cogio.
      await a.como(ADMIN2);
      const [segunda] = await filas(db, 'select public.match_admin_take($1) as tomada', [denuncia]);
      assert.equal(segunda.tomada, false, 'reclamar dos veces no es un fallo, pero no cuenta');

      const [ticket] = await filas(db, 'select * from public.match_admin_report($1)', [denuncia]);
      assert.equal(ticket.status, 'en_revision');

      await a.comoPostgres(async () => {
        const apuntes = await filas(
          db,
          `select admin_id from public.match_moderation_log where action = 'denuncia_en_revision'`,
        );
        assert.deepEqual(apuntes.map((f) => f.admin_id), [ADMIN], 'solo se apunta quien la cogio de verdad');
      });
    });
  });

  it('una denuncia ya resuelta no se puede reclamar', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const denuncia = await denunciaDeAna(db, a);
      await a.como(ADMIN);
      await db.query(`select public.match_admin_resolve($1, 'sin_accion', '')`, [denuncia]);
      const [fila] = await filas(db, 'select public.match_admin_take($1) as tomada', [denuncia]);
      assert.equal(fila.tomada, false);
      const [ticket] = await filas(db, 'select * from public.match_admin_report($1)', [denuncia]);
      assert.equal(ticket.status, 'resuelta');
    });
  });

  it('el ticket trae lo que hace falta para decidir', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const denuncia = await denunciaDeAna(db, a);
      await a.como(ADMIN);
      const [ticket] = await filas(db, 'select * from public.match_admin_report($1)', [denuncia]);

      assert.equal(ticket.reason, 'foto');
      assert.equal(ticket.detail, 'Esa foto no es suya');
      assert.equal(ticket.route_name, 'Compostelana de prueba');
      assert.equal(ticket.reporter_name, 'ana');
      assert.equal(ticket.reported_name, 'luis');
      // La grande, no la miniatura: sobre 400 px no se decide retirar una foto.
      assert.equal(ticket.reported_avatar_url, 'https://ejemplo.test/foto.jpg');
      assert.equal(ticket.reported_bio, 'Hola');
      assert.equal(ticket.reported_active, true);
      assert.equal(Number(ticket.mensajes), 0);
      assert.equal(ticket.handled_by, null);
      assert.equal(ticket.handled_by_name, null);
    });
  });

  it('tras resolverla, el ticket dice quien y con que nota', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const denuncia = await denunciaDeAna(db, a);
      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2, $3)', [LUIS, denuncia, 'Aviso dado']);
      await db.query(`select public.match_admin_resolve($1, 'cana_desactivada', 'Hablado con ella')`, [denuncia]);

      const [ticket] = await filas(db, 'select * from public.match_admin_report($1)', [denuncia]);
      assert.equal(ticket.status, 'resuelta');
      assert.equal(ticket.resolution, 'cana_desactivada');
      assert.equal(ticket.handled_by_name, 'admin');
      assert.equal(ticket.handler_note, 'Hablado con ella');
      assert.equal(ticket.reported_active, false, 'el ticket refleja que su cana ya esta apagada');
    });
  });

  it('el ticket se abre aunque quien esta denunciado nunca activara la cana', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA);
      const denuncia = await denunciaDeAna(db, a);
      await a.como(ADMIN);
      const [ticket] = await filas(db, 'select * from public.match_admin_report($1)', [denuncia]);
      assert.equal(ticket.reported_name, 'luis');
      assert.equal(ticket.reported_active, false);
      assert.equal(ticket.reported_bio, '');
    });
  });

  it('la cuenta del boton mira lo que queda sin cerrar, no el historico', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS, EVA);
      const primera = await denunciaDeAna(db, a);
      // La segunda la pone otra persona: solo se admite una denuncia viva por
      // pareja (REPORT_ALREADY_PENDING en la 0009).
      await a.como(EVA);
      const [otra] = await filas(
        db,
        `select public.match_report($1, $2, 'otro', 'Otra cosa mas', null, false) as id`,
        [RUTA, LUIS],
      );

      await a.como(ADMIN);
      const cuenta = async () => Number((await filas(db, 'select public.match_admin_alert_count() as n'))[0].n);
      assert.equal(await cuenta(), 2);

      // Reclamar no la cierra: sigue contando.
      await db.query('select public.match_admin_take($1)', [primera]);
      assert.equal(await cuenta(), 2);

      await db.query(`select public.match_admin_resolve($1, 'sin_accion', '')`, [primera]);
      assert.equal(await cuenta(), 1);
      await db.query(`select public.match_admin_resolve($1, 'sin_accion', '')`, [otra.id]);
      assert.equal(await cuenta(), 0);
    });
  });

  it('el ticket sigue sin dar ninguna via a los chats (D10)', async () => {
    // match_admin_report no devuelve ni una columna de la conversacion: lo unico
    // que se puede leer son los mensajes que la denuncia copio.
    const cuerpo = m0013.slice(m0013.indexOf('function public.match_admin_report'));
    const hasta = cuerpo.indexOf('$$;');
    assert.doesNotMatch(cuerpo.slice(0, hasta), /match_messages|match_connections/);
  });
});
