import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { crearBase, leerFichero } from './pglite-supabase.ts';

/**
 * 0030: el catalogo de etiquetas de La Caña.
 *
 * Se prueba contra Postgres real porque el check de la 0005 (1 a 40 caracteres)
 * solo salta al aplicar: una etiqueta de 41 revienta la migracion entera al
 * pegarla en el SQL Editor, y ninguna lectura del fichero lo cazaria.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const nombres = readdirSync(join(raiz, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql') && f < '0031')
  .sort();
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

type Fila = { id: string; label: string; is_active: boolean };

describe('0030: etiquetas de La Caña', () => {
  it('aplica sobre todas las anteriores y deja exactamente 30, activas', async () => {
    const db = await crearBase(migraciones);
    const { rows } = await db.query<Fila>(`select id, label, is_active from public.match_tags`);
    assert.equal(rows.length, 30);
    assert.ok(rows.every((r) => r.is_active));
    await db.close();
  });

  it('no queda ninguna de las viejas en tercera persona', async () => {
    const db = await crearBase(migraciones);
    const { rows } = await db.query<Fila>(`select id, label from public.match_tags`);
    const etiquetas = rows.map((r) => r.label);
    for (const vieja of ['Le pone chupitos', 'Etiqueta 1', 'Se apunta a un Bombardino Cocodrilo']) {
      assert.ok(!etiquetas.includes(vieja), `sigue "${vieja}"`);
    }
    assert.ok(etiquetas.includes('Me apunto a un Bombardino Cocodrilo'));
    assert.ok(etiquetas.includes('Tung Tung Sahur'));
    await db.close();
  });

  it('las 30 son distintas', async () => {
    const db = await crearBase(migraciones);
    const { rows } = await db.query<Fila>(`select label from public.match_tags`);
    assert.equal(new Set(rows.map((r) => r.label.toLowerCase())).size, 30);
    await db.close();
  });

  it('pedidas como las pide la app (por sort_order), salen en orden alfabetico', async () => {
    // Mismo criterio que la cabecera de la 0030: sin contar la "¡" ni los "...".
    const db = await crearBase(migraciones);
    const { rows } = await db.query<Fila>(`select label from public.match_tags order by sort_order`);
    const etiquetas = rows.map((r) => r.label);
    const col = new Intl.Collator('es', { sensitivity: 'base', ignorePunctuation: true });
    assert.deepEqual(etiquetas, [...etiquetas].sort(col.compare));
    assert.equal(etiquetas[0], 'Clara con limón y sin vergüenza');
    assert.ok(etiquetas.includes('De cañas con colegas'));
    assert.ok(!etiquetas.includes('De cañas con Rosalía'));
    await db.close();
  });

  it('se puede re-ejecutar sin cambiar nada', async () => {
    const db = await crearBase(migraciones);
    const antes = (await db.query<Fila>(`select id, label from public.match_tags order by id`)).rows;
    await db.exec(migraciones.at(-1) as string);
    const despues = (await db.query<Fila>(`select id, label from public.match_tags order by id`)).rows;
    assert.deepEqual(despues, antes);
    await db.close();
  });
});
