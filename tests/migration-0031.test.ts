import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { crearBase, escenario, leerFichero } from './pglite-supabase.ts';

/**
 * 0031: "Ver lo que guardamos" trae tambien lo del sistema de acceso.
 *
 * La politica dice que al entrar con Google se guardan correo, nombre, foto e
 * identificador de la cuenta de Google, y que la descarga lo trae TODO. Hasta
 * la 0031 no lo traia. Lo que se asegura sobre Postgres real:
 *  1. lo de Google sale en la descarga de quien entro con Google;
 *  2. solo lo SUYO: nunca las formas de entrar de otra persona;
 *  3. el resto de la descarga no cambia (la 0031 parte del cuerpo de la 0025).
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const nombres = readdirSync(join(raiz, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql') && f < '0032')
  .sort();
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';

const DE_GOOGLE = {
  sub: '112233445566778899',
  email: 'ana@gmail.com',
  name: 'Ana García',
  picture: 'https://lh3.googleusercontent.com/a/foto-de-ana',
  email_verified: true,
};

const DATOS = `
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ANA}', 'ana@gmail.com', '${JSON.stringify(DE_GOOGLE)}'),
    ('${LUIS}', 'luis@example.com', '{}');
  insert into auth.identities (user_id, provider, provider_id, identity_data) values
    ('${ANA}', 'google', '${DE_GOOGLE.sub}', '${JSON.stringify(DE_GOOGLE)}'),
    ('${LUIS}', 'email', '${LUIS}', '{"sub":"${LUIS}","email":"luis@example.com"}');
`;

type Acceso = {
  formas_de_entrar: { via: string; datos: Record<string, unknown> }[];
  metadatos_de_la_cuenta: Record<string, unknown>;
};
type Exportacion = { acceso: Acceso; cuenta: { correo: string }; cana: unknown; sellos: unknown[] };

describe('0031: la descarga trae lo del sistema de acceso', () => {
  it('quien entro con Google ve lo que dio Google: nombre, foto, correo e identificador', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      const { rows } = await db.query<{ d: Exportacion }>(`select public.export_my_data() as d`);
      const acceso = rows[0]?.d.acceso;
      assert.equal(acceso?.formas_de_entrar.length, 1);
      assert.equal(acceso?.formas_de_entrar[0]?.via, 'google');
      assert.deepEqual(acceso?.formas_de_entrar[0]?.datos, DE_GOOGLE);
      assert.equal(acceso?.metadatos_de_la_cuenta.name, 'Ana García');
    });
    await db.close();
  });

  it('solo lo suyo: Luis no ve nada de Google ni de Ana', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(LUIS);
      const { rows } = await db.query<{ d: Exportacion }>(`select public.export_my_data() as d`);
      const texto = JSON.stringify(rows[0]?.d);
      assert.deepEqual(
        rows[0]?.d.acceso.formas_de_entrar.map((f) => f.via),
        ['email'],
      );
      assert.ok(!texto.includes('Ana García'));
      assert.ok(!texto.includes(DE_GOOGLE.sub));
    });
    await db.close();
  });

  it('el resto de la descarga sigue ahi', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      const { rows } = await db.query<{ d: Exportacion }>(`select public.export_my_data() as d`);
      const d = rows[0]?.d;
      assert.equal(d?.cuenta.correo, 'ana@gmail.com');
      // La direccion de la foto parece un enlace y no descarga nada: se avisa.
      assert.match(String((d as unknown as { sobre_las_fotos: string }).sobre_las_fotos), /no son enlaces/);
      assert.ok(Array.isArray(d?.sellos));
      assert.ok(d?.cana);
    });
    await db.close();
  });

  it('sin sesion no hay descarga', async () => {
    const db = await crearBase(migraciones);
    await assert.rejects(db.query(`select public.export_my_data()`), /NOT_AUTHENTICATED/);
    await db.close();
  });
});
