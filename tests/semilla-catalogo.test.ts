import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, it } from 'node:test';

import { direccionVisible } from '../src/features/routes/catalogo.ts';
import { LOGO_MAX_CARACTERES } from '../src/features/routes/catalogoPropio.ts';
import { RADIO_INICIAL_M, validateBarDraft } from '../src/features/routes/validation.ts';

/**
 * La semilla de `catalog_bars` (scripts/semilla-catalogo/ -> migracion 0036).
 *
 * Aqui viven los chequeos que antes hacia `catalogo.test.ts` sobre la lista del
 * codigo, y uno nuevo que es el que importa: que la migracion que se PEGA en
 * Supabase dice lo mismo que las fuentes. Si alguien edita bares.json y no
 * regenera (`python scripts/generar-semilla-catalogo.py`), esto falla.
 */

type Bar = { id: string; nombre: string; plusCode: string; lat: number; lng: number };

const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const bares: Bar[] = JSON.parse(leer('scripts/semilla-catalogo/bares.json'));
const sql = leer('supabase/migrations/0036_catalogo_en_tabla.sql');

/** Las filas del `insert ... values` de la migracion: (nombre, lat, lng, logo). */
function filasDelInsert(): { nombre: string; lat: number; lng: number; logo: string }[] {
  const cuerpo = sql.slice(sql.indexOf('insert into public.catalog_bars'), sql.indexOf('on conflict'));
  const filas = [...cuerpo.matchAll(/^\s+\('((?:[^']|'')*)', ([\d.\-]+), ([\d.\-]+), '(data:image\/png;base64,[A-Za-z0-9+/=]+)'\)/gm)];
  return filas.map((m) => ({ nombre: (m[1] as string).replace(/''/g, "'"), lat: Number(m[2]), lng: Number(m[3]), logo: m[4] as string }));
}

describe('bares.json (las fuentes)', () => {
  it('son los 14 bares de la lista final', () => {
    assert.equal(bares.length, 14);
  });

  it('ids y nombres son unicos (el nombre es la clave: la unique de la tabla y el logo de la parada)', () => {
    const nombres = bares.map((b) => b.nombre.trim().toLowerCase());
    assert.equal(new Set(bares.map((b) => b.id)).size, bares.length);
    assert.equal(new Set(nombres).size, nombres.length);
  });

  it('cada bar pasa la misma validacion que el servidor exigiria al guardar la parada', () => {
    const ahora = new Date('2026-01-01T19:00:00Z');
    const despues = new Date('2026-01-01T20:00:00Z');
    for (const bar of bares) {
      const problemas = validateBarDraft({
        name: bar.nombre,
        address: '',
        lat: bar.lat,
        lng: bar.lng,
        radiusM: RADIO_INICIAL_M,
        opensAt: ahora,
        closesAt: despues,
        notes: '',
      });
      assert.deepEqual(problemas, [], `${bar.id}: ${problemas.join(' ')}`);
    }
  });

  it('todas las posiciones caen en el casco de Alcala de Henares (caza un digito mal copiado)', () => {
    // Caja generosa alrededor del centro (40.482, -3.364): unos 2,5 km de lado.
    for (const bar of bares) {
      assert.ok(bar.lat > 40.47 && bar.lat < 40.495, `${bar.id} lat ${bar.lat}`);
      assert.ok(bar.lng > -3.38 && bar.lng < -3.35, `${bar.id} lng ${bar.lng}`);
    }
  });

  it('el plus code de Google Maps esta bien formado, no se repite y es interno (nunca se ensena)', () => {
    const codigos = bares.map((b) => b.plusCode);
    for (const c of codigos) assert.match(c, /^[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2}$/);
    assert.equal(new Set(codigos).size, codigos.length);
    for (const bar of bares) assert.equal(direccionVisible(`${bar.plusCode} Alcala de Henares`), '', bar.id);
  });

  it('cada bar tiene su logo en scripts/semilla-catalogo/logos/', () => {
    for (const bar of bares) assert.ok(existsSync(`scripts/semilla-catalogo/logos/${bar.id}.png`), bar.id);
  });
});

describe('0036 dice lo mismo que las fuentes', () => {
  it('tiene una fila por bar, con el mismo nombre y las mismas coordenadas', () => {
    const filas = filasDelInsert();
    assert.deepEqual(
      filas.map(({ nombre, lat, lng }) => ({ nombre, lat, lng })),
      bares.map(({ nombre, lat, lng }) => ({ nombre, lat, lng })),
    );
  });

  it('cada logo es un PNG que cabe en el tope de la tabla', () => {
    for (const fila of filasDelInsert()) {
      assert.ok(fila.logo.length <= LOGO_MAX_CARACTERES, `${fila.nombre}: ${fila.logo.length}`);
      const bytes = Buffer.from(fila.logo.split(',')[1] as string, 'base64');
      assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', fila.nombre);
    }
  });

  it('el fichero se puede pegar en el SQL Editor sin colgarlo (menos de 300 KB)', () => {
    assert.ok(statSync('supabase/migrations/0036_catalogo_en_tabla.sql').size < 300_000);
  });

  it('es idempotente por construccion: ignora nombres ya presentes y solo toca paradas sin logo', () => {
    assert.match(sql, /on conflict \(lower\(btrim\(name\)\)\) do nothing/);
    assert.match(sql, /and rb\.logo is null/);
  });

  it('ya no queda lista de bares ni logos empaquetados en la app', () => {
    assert.equal(existsSync('src/features/routes/logos.ts'), false);
    assert.equal(existsSync('assets/bares'), false);
    assert.doesNotMatch(leer('src/features/routes/catalogo.ts'), /CATALOGO_BARES|plusCode/);
    assert.doesNotMatch(leer('src/features/routes/BarLogo.tsx'), /LOGOS|require\(/);
  });
});
