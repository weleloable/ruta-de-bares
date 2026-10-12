import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0061: copa, margen de sellado, sorteo y nueva puntuacion del quiz.
 */

const todas = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
const hasta = (tope: string) => todas.filter((f) => f <= tope).map((n) => leerFichero(`supabase/migrations/${n}`));
const migraciones = hasta('0061_zzz');

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const QUIZ = 'quien-quiere-ser-cervecero';

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin', display_name = 'Admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at, tipo) values
    ('${BAR(1)}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours', 'bar'),
    ('${BAR(2)}', '${RUTA}', 1, 'Dos', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours', 'bar'),
    ('${BAR(3)}', '${RUTA}', 2, 'Foto', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours', 'foto');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ADMIN}');
  ${[1, 2, 3]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = 'Persona${n}' where id = '${uid(n)}';
              insert into public.user_houses (user_id, house) values ('${uid(n)}', 'mahou');
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`,
    )
    .join('\n')}
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>, lista = migraciones) {
  const db = await crearBase(lista);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

const sellar = async (db: PGlite, a: Actor, quien: string, bar: number) => {
  await a.como(quien);
  return db.query('select public.claim_stamp($1, 40.48, -3.36)', [BAR(bar)]);
};

describe('0061: copa', () => {
  it('se puede apuntar una copa, y en los retos con alcohol sigue el tope de 3', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, uid(1), 1);
      await a.como(uid(1));
      const { rows } = await db.query<{ r: { puntua: boolean } }>(`select public.registrar_consumicion($1, 'copa') as r`, [BAR(1)]);
      assert.equal(rows[0]?.r.puntua, true);
      await a.como(ADMIN);
      await a.falla(
        () => db.query(`insert into public.retos (route_id, nombre, tipo, objetivo, categoria, puntos) values ($1, 'Copas', 'consumiciones_categoria', 4, 'copa', 5)`, [RUTA]),
        /retos_condicion_check/,
      );
      await db.query(`insert into public.retos (route_id, nombre, tipo, objetivo, categoria, puntos) values ($1, 'Copas', 'consumiciones_categoria', 2, 'copa', 5)`, [RUTA]);
    });
  });
});

describe('0061: margen de sellado', () => {
  it('con margen se sella antes de abrir y despues de cerrar; sin el, no', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() =>
        db.exec(`update public.route_bars set opens_at = now() + interval '20 minutes', closes_at = now() + interval '1 hour' where id = '${BAR(1)}';
                 update public.route_bars set opens_at = now() - interval '2 hours', closes_at = now() - interval '20 minutes' where id = '${BAR(2)}';`),
      );
      await a.falla(() => sellar(db, a, uid(1), 1), /TOO_EARLY/);
      await a.falla(() => sellar(db, a, uid(1), 2), /TOO_LATE/);
      await a.comoPostgres(() => db.exec(`update public.route_bars set margen_min = 30 where tipo = 'bar'`));
      await sellar(db, a, uid(1), 1);
      await sellar(db, a, uid(1), 2);
      await a.comoPostgres(async () => {
        await a.falla(() => db.exec(`update public.route_bars set margen_min = 200 where id = '${BAR(1)}'`), /route_bars_margen_check/);
        const { rows } = await db.query<{ m: number }>(`select margen_min as m from public.route_bars where id = '${BAR(3)}'`);
        assert.equal(rows[0]?.m, 0, 'por defecto, sin margen');
      });
    });
  });
});

describe('0061: sorteo', () => {
  const estado = async (db: PGlite, a: Actor, quien: string) => {
    await a.como(quien);
    return (await db.query<{ r: { activo: boolean; participantes: number; dentro: boolean; resultado: { ganador: string; soy_ganador: boolean; suplentes: string[] } | null } }>(
      'select public.sorteo_estado($1) as r',
      [RUTA],
    )).rows[0]!.r;
  };
  const sortear = async (db: PGlite, a: Actor, motivo: string | null = null) => {
    await a.como(ADMIN);
    return (await db.query<{ r: { ganador: string; suplentes: string[]; participantes: number; nombres: string[] } }>(
      'select public.sorteo_realizar($1, $2) as r',
      [RUTA, motivo],
    )).rows[0]!.r;
  };

  it('solo con el sorteo activo, y solo entra quien ha sellado todos los bares (admins incluidos)', async () => {
    await conBase(async (db, a) => {
      await a.falla(() => sortear(db, a), /SORTEO_INACTIVO/);
      await a.comoPostgres(() => db.exec(`update public.routes set sorteo_activo = true, sorteo_premio = 'una camiseta' where id = '${RUTA}'`));
      await a.falla(() => sortear(db, a), /NO_PARTICIPANTS/);
      // Persona1 y Admin sellan los dos bares; Persona2, solo uno. La foto no cuenta.
      for (const quien of [uid(1), ADMIN]) {
        await sellar(db, a, quien, 1);
        await sellar(db, a, quien, 2);
      }
      await sellar(db, a, uid(2), 1);
      assert.deepEqual([(await estado(db, a, uid(1))).dentro, (await estado(db, a, uid(2))).dentro], [true, false]);
      const r = await sortear(db, a);
      assert.equal(r.participantes, 2);
      assert.ok(['Persona1', 'Admin'].includes(r.ganador));
      assert.deepEqual([...r.nombres].sort(), ['Admin', 'Persona1']);
      assert.equal(r.suplentes.length, 1, 'solo queda otra persona de suplente');
      const visto = await estado(db, a, uid(3));
      assert.equal(visto.resultado?.ganador, r.ganador, 'toda la ruta ve quien ha ganado');
      assert.equal(visto.resultado?.soy_ganador, false);
    });
  });

  it('no se repite a escondidas: hace falta un motivo y queda registrado', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`update public.routes set sorteo_activo = true where id = '${RUTA}'`));
      await sellar(db, a, uid(1), 1);
      await sellar(db, a, uid(1), 2);
      await sortear(db, a);
      await a.falla(() => sortear(db, a), /ALREADY_DRAWN/);
      await a.falla(() => sortear(db, a, 'x'), /REASON_REQUIRED/);
      await sortear(db, a, 'El ganador no estaba');
      await a.comoPostgres(async () => {
        const { rows } = await db.query<{ vigente: boolean; motivo: string | null }>('select vigente, motivo from public.sorteos order by realizado_at, vigente');
        assert.equal(rows.length, 2);
        assert.equal(rows.filter((x) => x.vigente).length, 1);
        assert.ok(rows.some((x) => x.vigente && x.motivo === 'El ganador no estaba'));
      });
      await a.como(uid(1));
      await a.falla(() => db.query('select public.sorteo_realizar($1)', [RUTA]), /FORBIDDEN/);
    });
  });
});

describe('0061: quiz', () => {
  const enviar = async (db: PGlite, a: Actor, quien: string, puntos: number, ms: number | null) => {
    await a.como(quien);
    await a.comoPostgres(() => db.exec(`update public.minigame_scores set last_submit_at = now() - interval '1 minute'`));
    await a.como(quien);
    return (await db.query<{ r: { best: number; best_ms: number; is_record: boolean } }>(
      'select public.minigame_submit_score($1, $2, $3, $4) as r',
      [RUTA, QUIZ, puntos, ms],
    )).rows[0]!.r;
  };

  it('vacia las notas de la escala vieja y no las nuevas', async () => {
    const db = await crearBase(hasta('0060_zzz'));
    await db.exec(DATOS);
    try {
      await escenario(db, async (a) => {
        await a.comoPostgres(() =>
          db.exec(`insert into public.minigame_scores (route_id, user_id, game, best_score, best_at)
                   values ('${RUTA}', '${uid(1)}', '${QUIZ}', 25, now()), ('${RUTA}', '${uid(1)}', 'cana-perfecta', 90, now())`),
        );
        await a.comoPostgres(() => db.exec(leerFichero(`supabase/migrations/${todas.find((f) => f.startsWith('0061'))}`)));
        await a.comoPostgres(async () => {
          const { rows } = await db.query<{ game: string }>('select game from public.minigame_scores');
          assert.deepEqual(rows.map((r) => r.game), ['cana-perfecta']);
        });
      });
    } finally {
      await db.close();
    }
  });

  it('un punto por acierto (0 a 5), con tiempo obligatorio; a igualdad, gana quien tardo menos', async () => {
    await conBase(async (db, a) => {
      await a.falla(() => enviar(db, a, uid(1), 6, 1000), /INVALID_SCORE/);
      await a.falla(() => enviar(db, a, uid(1), 3, null), /INVALID_TIME/);
      assert.deepEqual(await enviar(db, a, uid(1), 3, 40000), { best: 3, best_ms: 40000, is_record: true });
      assert.equal((await enviar(db, a, uid(1), 3, 50000)).is_record, false, 'mismos puntos, mas lento: no mejora');
      assert.deepEqual(await enviar(db, a, uid(1), 3, 30000), { best: 3, best_ms: 30000, is_record: true });
      assert.equal((await enviar(db, a, uid(1), 2, 1000)).best, 3, 'menos puntos, aunque sea rapido, no mejora');
      await enviar(db, a, uid(2), 3, 25000);
      await enviar(db, a, uid(3), 4, 90000);
      await a.como(uid(1));
      const { rows } = await db.query<{ display_name: string; score: number; ms: number }>('select * from public.minigame_ranking($1, $2)', [RUTA, QUIZ]);
      assert.deepEqual(rows.map((r) => [r.display_name, r.score, r.ms]), [['Persona3', 4, 90000], ['Persona2', 3, 25000], ['Persona1', 3, 30000]]);
      // El podio de las casas desempata igual.
      await a.comoPostgres(async () => {
        const { rows: podio } = await db.query<{ puesto: number; user_id: string }>(
          `select puesto, user_id from public.casas_podios($1) where juego = $2 order by puesto`,
          [RUTA, QUIZ],
        );
        assert.deepEqual(podio.map((p) => p.user_id), [uid(3), uid(2), uid(1)]);
      });
    });
  });

  it('los otros juegos siguen igual (sin tiempo)', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      const { rows } = await db.query<{ r: { best: number; best_ms: number | null } }>(
        `select public.minigame_submit_score($1, 'cana-perfecta', 80) as r`,
        [RUTA],
      );
      assert.deepEqual(rows[0]?.r, { best: 80, best_ms: null, is_record: true });
    });
  });
});
