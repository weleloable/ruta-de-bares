import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Avisos de moderacion pendiente a admins (0066), la parte que no es SQL: la
 * casilla en Mi perfil (solo si el servidor manda `admin`) y la Edge Function.
 * La logica de a quien, cuando y que dice esta en tests/migration-0066.test.ts.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Mi perfil: casilla de moderacion pendiente', () => {
  const codigo = sinComentarios(leer('src/features/push/AjustesAvisos.tsx'));

  it('solo sale si el servidor manda la clave admin (es decir, solo a admins)', () => {
    assert.match(codigo, /\{prefs\.admin !== undefined \? \(\s*<Casilla\s+marcada=\{prefs\.admin\}/);
  });

  it('se guarda por su propia funcion, y las demas por la de siempre', () => {
    assert.match(
      codigo,
      /if \(clave === 'admin'\) await guardarAvisoAdmin\(valor\);\s*else if \(clave === 'anuncios'\) await guardarAvisoAnuncios\(valor\);\s*else await guardarPreferenciasAvisos\(nuevas\);/,
    );
    const api = sinComentarios(leer('src/features/push/api.ts'));
    assert.match(api, /rpc\('push_preferencias_admin_guardar', \{ p_admin: activado \}\)/);
    // Los anuncios (0074) tambien van por la suya: la de siempre no la conoce.
    assert.match(api, /rpc\('push_preferencias_anuncios_guardar', \{ p_anuncios: activado \}\)/);
    // La de siempre sigue con tres argumentos: la app en cache la llama asi.
    assert.match(api, /rpc\('push_preferencias_guardar', \{ p_paradas: p\.paradas, p_sorteo: p\.sorteo, p_cana: p\.cana \}\)/);
  });

  it('leer ignora un admin que no sea booleano (un servidor sin la 0066 no lo manda)', () => {
    const api = sinComentarios(leer('src/features/push/api.ts'));
    assert.match(api, /typeof d\.admin === 'boolean' \? \{ admin: d\.admin \} : \{\}/);
  });
});

describe('Edge Function enviar-avisos', () => {
  const codigo = sinComentarios(leer('supabase/functions/enviar-avisos/index.ts'));

  it('los avisos de decision de admin se sustituyen entre si (ya dicen cuantos hay), los informativos no, y duran 12 h', () => {
    assert.match(codigo, /aviso\.tipo === 'cana' \|\| \(aviso\.tipo === 'admin' && aviso\.url === '\/admin\/alertas'\) \? aviso\.tipo/);
    assert.match(codigo, /TTL: aviso\.tipo === 'admin' \? 12 \* 60 \* 60 : 15 \* 60/);
  });

  it('el resto de avisos siguen caducando a los 15 minutos', () => {
    assert.match(codigo, /: 15 \* 60/);
  });
});

describe('Tipos de la base', () => {
  it('database.ts conoce la funcion nueva', () => {
    assert.match(leer('src/types/database.ts'), /push_preferencias_admin_guardar: \{ Args: \{ p_admin: boolean \}/);
  });
});
