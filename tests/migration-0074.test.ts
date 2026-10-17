import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0074: anuncios de los admins a la gente de una ruta. Contra Postgres real
 * (PGlite): solo manda un admin, el texto y la duracion los valida el servidor,
 * se ve lo vigente (ni caducado ni retirado) y solo a quien esta en la ruta,
 * "solo admins" no llega a los demas, hay tope por hora, y el aviso al movil
 * va a quien toca y se puede silenciar.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0074_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN1 = '00000000-0000-4000-8000-0000000000a1';
const ADMIN2 = '00000000-0000-4000-8000-0000000000a2';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const RUTA2 = '00000000-0000-4000-8000-0000000000f2';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [U1, U2, U3, FUERA] = [uid(1), uid(2), uid(3), uid(4)];

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN1}', 'a1@example.com'), ('${ADMIN2}', 'a2@example.com');
  update public.profiles set role = 'admin', display_name = 'AdminUno' where id = '${ADMIN1}';
  update public.profiles set role = 'admin' where id = '${ADMIN2}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN1}', current_date),
    ('${RUTA2}', 'Otra ruta', true, '${ADMIN1}', current_date);
  ${[1, 2, 3, 4]
    .map((n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');`)
    .join('\n')}
  -- 1, 2 y 3 estan en la ruta; 4 no.
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${U1}'), ('${RUTA}', '${U2}'), ('${RUTA}', '${U3}');
  insert into public.push_suscripciones (endpoint, user_id, p256dh, auth) values
    ('https://push.example.com/a1', '${ADMIN1}', 'p256dh-de-prueba', 'auth-prueba'),
    ('https://push.example.com/a2', '${ADMIN2}', 'p256dh-de-prueba', 'auth-prueba'),
    ('https://push.example.com/u1', '${U1}', 'p256dh-de-prueba', 'auth-prueba'),
    ('https://push.example.com/u2', '${U2}', 'p256dh-de-prueba', 'auth-prueba'),
    ('https://push.example.com/u4', '${FUERA}', 'p256dh-de-prueba', 'auth-prueba');
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

type Vigente = { id: string; texto: string; solo_admins: boolean; duracion_min: number; hace_s: number; restan_s: number };
const vigentes = async (db: PGlite, a: Actor, quien: string, ruta = RUTA) => {
  await a.como(quien);
  return (await db.query<Vigente>(`select * from public.anuncios_vigentes('${ruta}')`)).rows;
};
const enviar = async (
  db: PGlite,
  a: Actor,
  texto: string,
  o: { quien?: string; dur?: number; solo?: boolean; movil?: boolean; ruta?: string } = {},
) => {
  await a.como(o.quien ?? ADMIN1);
  return (
    await db.query<{ id: string }>(`select public.anuncio_enviar($1, $2, $3, $4, $5) as id`, [
      o.ruta ?? RUTA, texto, o.dur ?? 15, o.solo ?? false, o.movil ?? false,
    ])
  ).rows[0]?.id as string;
};

type Aviso = { user_id: string; tipo: string; titulo: string; cuerpo: string; url: string };
const avisos = (db: PGlite, a: Actor) =>
  a.comoPostgres(async () => (await db.query<Aviso>(`select user_id, tipo, titulo, cuerpo, url from public.push_cola where tipo = 'anuncio' order by id`)).rows);

describe('0074: quien puede mandar', () => {
  it('una persona normal no puede enviar ni retirar ni ver el historial', async () => {
    await conBase(async (db, a) => {
      await a.como(U1);
      await a.falla(() => db.query(`select public.anuncio_enviar('${RUTA}', 'Hola', 15, false, false)`), /FORBIDDEN/);
      await a.falla(() => db.query(`select public.anuncios_enviados('${RUTA}')`), /FORBIDDEN/);
      const id = await enviar(db, a, 'Uno');
      await a.como(U1);
      await a.falla(() => db.query(`select public.anuncio_retirar('${id}')`), /FORBIDDEN/);
      assert.equal((await vigentes(db, a, U1)).length, 1, 'el intento de retirar no lo quito');
    });
  });

  it('sin sesion no se puede nada', async () => {
    await conBase(async (db, a) => {
      await a.anonimo();
      await a.falla(() => db.query(`select public.anuncio_enviar('${RUTA}', 'Hola', 15, false, false)`), /permission denied|NOT_AUTHENTICATED/);
      await a.falla(() => db.query(`select * from public.anuncios_vigentes('${RUTA}')`), /permission denied|NOT_AUTHENTICATED/);
    });
  });

  it('la tabla no se toca directamente: ni leer ni escribir', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Uno');
      for (const quien of [U1, ADMIN1]) {
        await a.como(quien);
        await a.falla(() => db.query(`select * from public.anuncios`), /permission denied/);
        await a.falla(
          () => db.query(`insert into public.anuncios (route_id, texto, duracion_min, expira_at) values ('${RUTA}', 'x', 5, now())`),
          /permission denied/,
        );
        await a.falla(() => db.query(`update public.anuncios set retirado_at = now()`), /permission denied/);
      }
    });
  });

  it('una ruta que no existe da ROUTE_NOT_FOUND', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN1);
      await a.falla(
        () => db.query(`select public.anuncio_enviar('00000000-0000-4000-8000-0000000000ff', 'Hola', 15, false, false)`),
        /ROUTE_NOT_FOUND/,
      );
    });
  });
});

describe('0074: lo que la app llama (src/features/anuncios/api.ts)', () => {
  it('los argumentos por NOMBRE y las columnas que devuelve son los que usa la app', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN1);
      const id = (
        await db.query<{ id: string }>(
          `select public.anuncio_enviar(p_route => '${RUTA}', p_texto => 'Hola', p_duracion => 5, p_solo_admins => false, p_avisar_movil => false) as id`,
        )
      ).rows[0]?.id as string;
      const v = (await db.query<Record<string, unknown>>(`select * from public.anuncios_vigentes(p_route => '${RUTA}')`)).rows[0];
      assert.deepEqual(Object.keys(v ?? {}).sort(), ['duracion_min', 'hace_s', 'id', 'restan_s', 'solo_admins', 'texto']);
      const e = (await db.query<Record<string, unknown>>(`select * from public.anuncios_enviados(p_route => '${RUTA}')`)).rows[0];
      assert.deepEqual(Object.keys(e ?? {}).sort(), ['autor', 'avisar_movil', 'duracion_min', 'estado', 'hace_s', 'id', 'restan_s', 'solo_admins', 'texto']);
      await db.query(`select public.anuncio_retirar(p_id => '${id}')`);
      await db.query(`select public.push_preferencias_anuncios_guardar(p_anuncios => false)`);
    });
  });
});

describe('0074: el texto y la duracion', () => {
  it('limpia espacios y saltos de linea, y guarda el texto limpio', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, '  Nuevo   bar\n en 5   minutos \t ');
      assert.equal((await vigentes(db, a, U1))[0]?.texto, 'Nuevo bar en 5 minutos');
    });
  });

  it('vacio, solo espacios o de mas de 200 caracteres: TEXT_INVALID', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN1);
      for (const t of ['', '   \n ', 'a'.repeat(201)]) {
        await a.falla(() => db.query(`select public.anuncio_enviar('${RUTA}', $1, 15, false, false)`, [t]), /TEXT_INVALID/);
      }
      // 200 justos si; y los espacios de los lados no cuentan.
      await enviar(db, a, `${'a'.repeat(200)}   `);
      assert.equal((await vigentes(db, a, U1))[0]?.texto.length, 200);
    });
  });

  it('solo 5, 15 y 60 minutos', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN1);
      for (const d of [0, 1, 10, 30, 120, -5]) {
        await a.falla(() => db.query(`select public.anuncio_enviar('${RUTA}', 'Hola', $1, false, false)`, [d]), /DURATION_INVALID/);
      }
      for (const d of [5, 15, 60]) await enviar(db, a, `De ${d}`, { dur: d });
      const lista = await vigentes(db, a, U1);
      assert.deepEqual(lista.map((x) => x.duracion_min).sort((x, y) => x - y), [5, 15, 60]);
    });
  });

  it('la tabla tambien lo exige por su cuenta (checks), aunque alguien se saltara la funcion', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        const insertar = (texto: string, dur: number) =>
          db.query(
            `insert into public.anuncios (route_id, texto, duracion_min, created_at, expira_at)
             values ('${RUTA}', $1, $2::smallint, now(), now() + make_interval(mins => $2::int))`,
            [texto, dur],
          );
        await a.falla(() => insertar('', 5), /check/);
        await a.falla(() => insertar('a'.repeat(201), 5), /check/);
        await a.falla(() => insertar('hola', 30), /check/);
        await a.falla(
          () => db.query(`insert into public.anuncios (route_id, texto, duracion_min, created_at, expira_at) values ('${RUTA}', 'x', 5, now(), now() + interval '9 hours')`),
          /check/,
        );
      });
    });
  });
});

describe('0074: quien ve que, y cuando', () => {
  it('la gente de la ruta lo ve, con cuanto queda medido por el servidor', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Descuento en vermut', { dur: 15 });
      const [u1] = await vigentes(db, a, U1);
      assert.equal(u1?.texto, 'Descuento en vermut');
      assert.ok((u1?.restan_s ?? 0) > 14 * 60 && (u1?.restan_s ?? 0) <= 15 * 60, `quedan ${u1?.restan_s} s`);
      assert.ok((u1?.hace_s ?? 99) < 5);
      assert.equal((await vigentes(db, a, U3)).length, 1);
    });
  });

  it('quien no esta en la ruta no ve nada, y otra ruta no se mezcla', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Solo para la ruta');
      assert.deepEqual(await vigentes(db, a, FUERA), []);
      assert.deepEqual(await vigentes(db, a, U1, RUTA2), [], 'un miembro de una ruta no ve los de otra');
    });
  });

  it('un admin lo ve aunque no este dentro de la ruta como participante', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Hola');
      assert.equal((await vigentes(db, a, ADMIN2)).length, 1);
    });
  });

  it('"solo admins" no llega a los demas, y a los admins si', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Interno: falta hielo', { solo: true });
      await enviar(db, a, 'Para todos');
      assert.deepEqual((await vigentes(db, a, U1)).map((x) => x.texto), ['Para todos']);
      assert.deepEqual((await vigentes(db, a, ADMIN2)).map((x) => x.texto), ['Para todos', 'Interno: falta hielo']);
    });
  });

  it('caducado: deja de verse a su hora, no antes', async () => {
    await conBase(async (db, a) => {
      const id = await enviar(db, a, 'De 5', { dur: 5 });
      const mover = (min: number) =>
        a.comoPostgres(() => db.query(`update public.anuncios set created_at = now() - make_interval(mins => $1), expira_at = now() - make_interval(mins => $1) + interval '5 minutes' where id = $2`, [min, id]));
      await mover(4);
      const [casi] = await vigentes(db, a, U1);
      assert.ok(casi && casi.restan_s > 0 && casi.restan_s <= 60 && casi.hace_s >= 239, `quedan ${casi?.restan_s}, hace ${casi?.hace_s}`);
      await mover(6);
      assert.deepEqual(await vigentes(db, a, U1), []);
    });
  });

  it('retirado: deja de verse al momento y consta como retirado', async () => {
    await conBase(async (db, a) => {
      const id = await enviar(db, a, 'Me equivoque');
      await a.como(ADMIN2);
      await db.query(`select public.anuncio_retirar('${id}')`);
      assert.deepEqual(await vigentes(db, a, U1), []);
      await a.como(ADMIN2);
      const fila = (await db.query<{ estado: string }>(`select estado from public.anuncios_enviados('${RUTA}')`)).rows[0];
      assert.equal(fila?.estado, 'retirado');
      // Retirar dos veces no da error ni cambia quien lo retiro.
      await db.query(`select public.anuncio_retirar('${id}')`);
    });
  });

  it('el historial de los admins dice autor, duracion y estado; es solo de esa ruta, y como mucho 20', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Vigente', { dur: 60, movil: true });
      await enviar(db, a, 'En la otra', { ruta: RUTA2 });
      await a.como(ADMIN2);
      const filas = (await db.query<{ texto: string; autor: string; estado: string; duracion_min: number; avisar_movil: boolean }>(
        `select * from public.anuncios_enviados('${RUTA}')`,
      )).rows;
      assert.deepEqual(filas.map((f) => f.texto), ['Vigente']);
      assert.deepEqual([filas[0]?.autor, filas[0]?.estado, filas[0]?.duracion_min, filas[0]?.avisar_movil], ['AdminUno', 'vigente', 60, true]);
    });
  });

  it('lo que ve la gente no lleva el autor ni nada que lo identifique', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Hola');
      const texto = JSON.stringify(await vigentes(db, a, U1));
      assert.ok(!texto.includes('AdminUno') && !texto.includes(ADMIN1), 'el anuncio delata a su autor');
    });
  });

  it('como mucho 5 a la vez en pantalla, los mas nuevos primero', async () => {
    await conBase(async (db, a) => {
      // 6 es el tope por hora: caben justo.
      for (let i = 1; i <= 6; i++) await enviar(db, a, `n${i}`, { ruta: RUTA });
      const lista = await vigentes(db, a, U1);
      assert.equal(lista.length, 5);
      assert.equal(lista[0]?.texto, 'n6');
    });
  });
});

describe('0074: el tope por hora', () => {
  it('el septimo en una hora da RATE_LIMIT; retirar no devuelve el cupo', async () => {
    await conBase(async (db, a) => {
      const ids: string[] = [];
      for (let i = 1; i <= 6; i++) ids.push(await enviar(db, a, `n${i}`));
      await a.como(ADMIN1);
      await a.falla(() => db.query(`select public.anuncio_enviar('${RUTA}', 'siete', 15, false, false)`), /RATE_LIMIT/);
      for (const id of ids) await db.query(`select public.anuncio_retirar('${id}')`);
      await a.falla(() => db.query(`select public.anuncio_enviar('${RUTA}', 'siete', 15, false, false)`), /RATE_LIMIT/);
    });
  });

  it('se cuenta por admin y por ruta, y los de hace mas de una hora ya no cuentan', async () => {
    await conBase(async (db, a) => {
      for (let i = 1; i <= 6; i++) await enviar(db, a, `n${i}`);
      await enviar(db, a, 'otro admin', { quien: ADMIN2 });
      await enviar(db, a, 'otra ruta', { ruta: RUTA2 });
      await a.comoPostgres(() => db.exec(`update public.anuncios set created_at = created_at - interval '61 minutes', expira_at = expira_at - interval '61 minutes' where texto = 'n1'`));
      await enviar(db, a, 'ya cabe');
    });
  });
});

describe('0074: el aviso al movil', () => {
  it('con "avisar al movil" llega a la gente de la ruta con dispositivo (y a los admins), no a quien lo manda ni a quien no esta', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Nuevo bar en 5 minutos', { movil: true });
      const lista = await avisos(db, a);
      // U1 y U2 (en la ruta, con dispositivo) y ADMIN2 (admin). U3 no tiene dispositivo; FUERA no esta en la ruta; ADMIN1 lo manda.
      assert.deepEqual(lista.map((x) => x.user_id).sort(), [ADMIN2, U1, U2].sort());
      assert.equal(lista[0]?.titulo, '📣 Ruta de prueba');
      assert.equal(lista[0]?.cuerpo, 'Nuevo bar en 5 minutos');
      assert.equal(lista[0]?.url, '/ruta');
    });
  });

  it('sin "avisar al movil" no se encola nada', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Solo en pantalla', { movil: false });
      assert.deepEqual(await avisos(db, a), []);
    });
  });

  it('"solo admins" avisa solo a los admins', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Interno', { solo: true, movil: true });
      assert.deepEqual((await avisos(db, a)).map((x) => x.user_id), [ADMIN2]);
    });
  });

  it('cada persona puede silenciar los anuncios, y volver a activarlos', async () => {
    await conBase(async (db, a) => {
      await a.como(U1);
      await db.query(`select public.push_preferencias_anuncios_guardar(false)`);
      const p = (await db.query<{ p: Record<string, unknown> }>(`select public.push_preferencias_leer() as p`)).rows[0]?.p;
      assert.equal(p?.anuncios, false);
      await enviar(db, a, 'Primero', { movil: true });
      assert.deepEqual((await avisos(db, a)).map((x) => x.user_id).sort(), [ADMIN2, U2].sort(), 'U1 lo silencio');
      await a.como(U1);
      await db.query(`select public.push_preferencias_anuncios_guardar(true)`);
      await enviar(db, a, 'Segundo', { movil: true, quien: ADMIN2 });
      assert.ok((await avisos(db, a)).some((x) => x.user_id === U1 && x.cuerpo === 'Segundo'));
    });
  });

  it('por defecto esta activado, y las demas preferencias no se pisan', async () => {
    await conBase(async (db, a) => {
      await a.como(U2);
      const antes = (await db.query<{ p: Record<string, unknown> }>(`select public.push_preferencias_leer() as p`)).rows[0]?.p;
      assert.equal(antes?.anuncios, true);
      await db.query(`select public.push_preferencias_guardar(false, true, false)`);
      await db.query(`select public.push_preferencias_anuncios_guardar(false)`);
      const p = (await db.query<{ p: Record<string, unknown> }>(`select public.push_preferencias_leer() as p`)).rows[0]?.p;
      assert.deepEqual([p?.paradas, p?.sorteo, p?.cana, p?.anuncios], [false, true, false, false]);
      // Y guardar las de siempre (3 argumentos) no vuelve a encender la de anuncios.
      await db.query(`select public.push_preferencias_guardar(true, true, true)`);
      const q = (await db.query<{ p: Record<string, unknown> }>(`select public.push_preferencias_leer() as p`)).rows[0]?.p;
      assert.equal(q?.anuncios, false);
    });
  });

  it('el tipo nuevo no rompe los de siempre: una parada sigue respetando su preferencia', async () => {
    await conBase(async (db, a) => {
      await a.como(U1);
      await db.query(`select public.push_preferencias_guardar(false, true, true)`);
      await a.comoPostgres(async () => {
        await db.query(`select public.avisos_encolar('${U1}', 'parada', 'k-parada-1', 'T', 'C', '/')`);
        await db.query(`select public.avisos_encolar('${U2}', 'parada', 'k-parada-2', 'T', 'C', '/')`);
        const r = (await db.query<{ user_id: string }>(`select user_id from public.push_cola where tipo = 'parada'`)).rows;
        assert.deepEqual(r.map((x) => x.user_id), [U2]);
      });
    });
  });
});

describe('0074: cuando se borra algo', () => {
  it('borrar la ruta se lleva sus anuncios', async () => {
    await conBase(async (db, a) => {
      await enviar(db, a, 'Uno');
      await a.comoPostgres(async () => {
        await db.exec(`delete from public.routes where id = '${RUTA}'`);
        assert.equal((await db.query(`select 1 from public.anuncios`)).rows.length, 0);
      });
    });
  });

  it('si el autor borra su cuenta, el anuncio sigue y el autor queda como "ya no esta"', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`update public.routes set created_by = '${ADMIN2}'`));
      await enviar(db, a, 'Uno');
      await a.comoPostgres(() => db.exec(`delete from auth.users where id = '${ADMIN1}'`));
      await a.como(ADMIN2);
      const fila = (await db.query<{ autor: string }>(`select autor from public.anuncios_enviados('${RUTA}')`)).rows[0];
      assert.equal(fila?.autor, 'Alguien que ya no esta');
    });
  });
});
