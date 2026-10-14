import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0066: avisos al movil para los admins cuando entra una denuncia, una foto por
 * aprobar o un mensaje a la organizacion. Solo a admins, con su preferencia, sin
 * avisar a quien lo provoca, y sin datos de nadie en el texto.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0066_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN1 = '00000000-0000-4000-8000-0000000000a1';
const ADMIN2 = '00000000-0000-4000-8000-0000000000a2';
const ADMIN3 = '00000000-0000-4000-8000-0000000000a3'; // admin sin avisos activados
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values
    ('${ADMIN1}', 'a1@example.com'), ('${ADMIN2}', 'a2@example.com'), ('${ADMIN3}', 'a3@example.com');
  update public.profiles set role = 'admin' where id in ('${ADMIN1}', '${ADMIN2}', '${ADMIN3}');
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN1}', current_date);
  ${[1, 2, 3]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = 'Persona${n}' where id = '${uid(n)}';
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`,
    )
    .join('\n')}
  -- Dos personas normales con avisos activados: por mucho que los tengan, esto no es para ellas.
  insert into public.push_suscripciones (endpoint, user_id, p256dh, auth) values
    ('https://push.example.com/a1', '${ADMIN1}', 'p256dh-de-prueba', 'auth-prueba'),
    ('https://push.example.com/a2', '${ADMIN2}', 'p256dh-de-prueba', 'auth-prueba'),
    ('https://push.example.com/u1', '${uid(1)}', 'p256dh-de-prueba', 'auth-prueba'),
    ('https://push.example.com/u2', '${uid(2)}', 'p256dh-de-prueba', 'auth-prueba');
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

type Aviso = { user_id: string; tipo: string; titulo: string; cuerpo: string; url: string };
const avisosAdmin = (db: PGlite, a: Actor) =>
  a.comoPostgres(async () => (await db.query<Aviso>(`select user_id, tipo, titulo, cuerpo, url from public.push_cola where tipo = 'admin' order by id`)).rows);

const denunciar = async (db: PGlite, a: Actor, quien = uid(1), a_quien = uid(2)) => {
  await a.como(quien);
  return (await db.query<{ id: string }>(`select public.match_report('${RUTA}', '${a_quien}', 'acoso', 'detalle privado', null, false) as id`)).rows[0]?.id;
};

describe('0066: avisos a admins', () => {
  it('una denuncia avisa a los admins con avisos activados, y a nadie mas', async () => {
    await conBase(async (db, a) => {
      // Para poder denunciar hay que estar dentro y con La Cana (la denuncia exige estar en la ruta).
      await a.comoPostgres(() => db.exec(`insert into public.match_profiles (user_id, is_active) values ('${uid(1)}', true), ('${uid(2)}', true) on conflict do nothing`));
      await denunciar(db, a);
      const avisos = await avisosAdmin(db, a);
      assert.deepEqual(avisos.map((x) => x.user_id).sort(), [ADMIN1, ADMIN2].sort(), 'solo los dos admins con dispositivo');
      assert.equal(avisos[0]?.url, '/admin/alertas');
      assert.match(avisos[0]?.titulo ?? '', /Denuncia nueva/);
    });
  });

  it('el aviso no lleva nombres ni el texto de la denuncia', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`insert into public.match_profiles (user_id, is_active) values ('${uid(1)}', true), ('${uid(2)}', true) on conflict do nothing`));
      await denunciar(db, a);
      const texto = JSON.stringify(await avisosAdmin(db, a));
      for (const privado of ['Persona1', 'Persona2', 'detalle privado', 'acoso', 'u1@example.com']) {
        assert.ok(!texto.includes(privado), `el aviso lleva "${privado}"`);
      }
    });
  });

  it('el aviso dice cuantas cosas hay por revisar en total', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`insert into public.match_profiles (user_id, is_active) values ('${uid(1)}', true), ('${uid(2)}', true), ('${uid(3)}', true) on conflict do nothing`));
      await denunciar(db, a, uid(1), uid(2));
      await denunciar(db, a, uid(3), uid(2));
      const avisos = await avisosAdmin(db, a);
      const ultimo = avisos.filter((x) => x.user_id === ADMIN1).at(-1);
      assert.match(ultimo?.cuerpo ?? '', /Hay 2 cosas por revisar/);
      const primero = avisos.filter((x) => x.user_id === ADMIN1)[0];
      assert.doesNotMatch(primero?.cuerpo ?? '', /Hay \d+ cosas/, 'con una sola no se cuenta');
    });
  });

  it('una foto de perfil por aprobar avisa; la de un admin (se aprueba sola) no', async () => {
    await conBase(async (db, a) => {
      const subir = async (quien: string, nombre: string) => {
        const [foto, mini] = [`${quien}/${nombre}.jpg`, `${quien}/${nombre}-mini.jpg`];
        await a.comoPostgres(() => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [foto, mini]));
        const url = (r: string) => `https://x.supabase.co/storage/v1/object/public/avatars/${r}`;
        await a.como(quien);
        return (await db.query<{ r: string }>('select public.avatar_request_submit($1, $2, $3, $4) as r', [foto, mini, url(foto), url(mini)])).rows[0]?.r;
      };
      assert.equal(await subir(uid(1), 'a'), 'pendiente');
      const tras = await avisosAdmin(db, a);
      assert.deepEqual(tras.map((x) => x.user_id).sort(), [ADMIN1, ADMIN2].sort());
      assert.match(tras[0]?.titulo ?? '', /Foto de perfil/);
      // Una admin se aprueba sola: no hay nada que decidir, no avisa.
      assert.equal(await subir(ADMIN1, 'b'), 'aprobada');
      assert.equal((await avisosAdmin(db, a)).length, tras.length, 'una foto ya aprobada avisa');
    });
  });
  it('un mensaje o una reclamacion a la organizacion avisa, y el titulo distingue', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await db.query(`select public.send_admin_message('contacto', 'Hola, tengo una duda', null)`);
      await db.query(`select public.send_admin_message('reclamacion', 'No estoy de acuerdo', null)`);
      const avisos = (await avisosAdmin(db, a)).filter((x) => x.user_id === ADMIN1);
      assert.deepEqual(avisos.map((x) => x.titulo.replace(/^\S+\s/, '')), ['Mensaje nuevo', 'Reclamación nueva']);
      assert.ok(!JSON.stringify(avisos).includes('tengo una duda'), 'el aviso lleva el texto del mensaje');
    });
  });

  it('un admin que escribe a la organizacion no se avisa a si mismo, pero si al otro', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN1);
      await db.query(`select public.send_admin_message('contacto', 'Prueba', null)`);
      const avisos = await avisosAdmin(db, a);
      assert.deepEqual(avisos.map((x) => x.user_id), [ADMIN2]);
    });
  });

  it('quien no es admin nunca recibe avisos de admin, tenga o no dispositivos', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(3));
      await db.query(`select public.send_admin_message('contacto', 'Hola', null)`);
      const para = (await avisosAdmin(db, a)).map((x) => x.user_id);
      assert.ok(!para.includes(uid(1)) && !para.includes(uid(2)), 'se avisa a personas normales');
    });
  });

  it('un admin que ya no lo es deja de recibirlos (se mira el rol al encolar)', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`update public.profiles set role = 'user' where id = '${ADMIN2}'`));
      await a.como(uid(1));
      await db.query(`select public.send_admin_message('contacto', 'Hola', null)`);
      assert.deepEqual((await avisosAdmin(db, a)).map((x) => x.user_id), [ADMIN1]);
    });
  });

  it('cada admin elige: con la preferencia a false no le llega', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN2);
      await db.query(`select public.push_preferencias_admin_guardar(false)`);
      await a.como(uid(1));
      await db.query(`select public.send_admin_message('contacto', 'Hola', null)`);
      assert.deepEqual((await avisosAdmin(db, a)).map((x) => x.user_id), [ADMIN1]);
      // y volver a activarla funciona
      await a.como(ADMIN2);
      await db.query(`select public.push_preferencias_admin_guardar(true)`);
      await a.como(uid(2));
      await db.query(`select public.send_admin_message('contacto', 'Otra', null)`);
      assert.ok((await avisosAdmin(db, a)).some((x) => x.user_id === ADMIN2));
    });
  });

  it('la preferencia de admin no la tocan ni la ven las personas normales', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => db.query(`select public.push_preferencias_admin_guardar(false)`), /FORBIDDEN/);
      const normal = (await db.query<{ p: Record<string, unknown> }>(`select public.push_preferencias_leer() as p`)).rows[0]?.p;
      assert.ok(normal && !('admin' in normal), 'una persona normal ve la clave admin');
      await a.como(ADMIN1);
      const admin = (await db.query<{ p: Record<string, unknown> }>(`select public.push_preferencias_leer() as p`)).rows[0]?.p;
      assert.equal(admin?.admin, true, 'un admin ve su preferencia, activada por defecto');
    });
  });

  it('guardar las preferencias de siempre (3 argumentos) no pisa la de admin', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN1);
      await db.query(`select public.push_preferencias_admin_guardar(false)`);
      await db.query(`select public.push_preferencias_guardar(true, false, true)`);
      const p = (await db.query<{ p: Record<string, unknown> }>(`select public.push_preferencias_leer() as p`)).rows[0]?.p;
      assert.deepEqual([p?.admin, p?.paradas, p?.sorteo], [false, true, false]);
    });
  });

  it('los avisos de siempre (parada, sorteo, cana) siguen respetando sus preferencias', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await db.query(`select public.push_preferencias_guardar(true, true, false)`);
      await a.comoPostgres(() => db.exec(`select public.avisos_encolar('${uid(1)}', 'cana', 'prueba-cana', 't', 'c', '/cana')`));
      await a.comoPostgres(() => db.exec(`select public.avisos_encolar('${uid(1)}', 'sorteo', 'prueba-sorteo', 't', 'c', '/')`));
      const tipos = await a.comoPostgres(async () => (await db.query<{ tipo: string }>(`select tipo from public.push_cola where clave like 'prueba-%'`)).rows.map((r) => r.tipo));
      assert.deepEqual(tipos, ['sorteo']);
    });
  });

  it('lo interno no se puede llamar desde la API', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN1);
      for (const q of [
        `select public.admin_pendientes_total()`,
        `select public.avisos_a_admins('x', 't', 'c', null)`,
        `select public.avisos_encolar('${ADMIN1}', 'admin', 'x', 't', 'c', '/')`,
      ]) {
        await a.falla(() => db.query(q), /permission denied|42501/);
      }
    });
  });

  it('el mismo hecho no avisa dos veces (la clave lo impide)', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`select public.avisos_a_admins('hecho-1', 'T', 'Q', null); select public.avisos_a_admins('hecho-1', 'T', 'Q', null)`));
      const n = (await avisosAdmin(db, a)).length;
      assert.equal(n, 2, 'dos admins con dispositivo, un aviso cada uno');
    });
  });
});
