import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Cableado de la revision de fotos de perfil (0020).
 *
 * Guardia de lectura de codigo, como navegacion-atras.test.ts: la logica pura
 * y el SQL tienen sus tests (fotoRevision.test.ts, migration-0020.test.ts), pero
 * las uniones entre ellos son faciles de romper sin que nada falle. Lo mas
 * grave seria que la app volviese a escribir profiles.avatar_url ella misma:
 * el servidor lo rechazaria (AVATAR_NEEDS_REVIEW) y la persona veria un error
 * en vez de "en revision".
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (ruta: string) =>
  leer(ruta)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('subir foto: pasa por revision, no escribe el perfil', () => {
  const api = sinComentarios('src/features/profile/api.ts');

  it('llama a avatar_request_submit', () => {
    assert.match(api, /rpc\(\s*'avatar_request_submit'/);
  });

  it('ya no escribe avatar_url ni avatar_thumb_url en profiles', () => {
    assert.doesNotMatch(api, /avatar_url\s*:/);
    assert.doesNotMatch(api, /avatar_thumb_url\s*:/);
  });

  it('sube sin upsert: la 0020 quito el permiso de sobrescribir', () => {
    assert.match(api, /upsert:\s*false/);
    assert.doesNotMatch(api, /upsert:\s*true/);
  });

  it('los nombres de fichero salen de nombresFicheroAvatar, con azar', () => {
    assert.match(api, /nombresFicheroAvatar\(userId,\s*Date\.now\(\),\s*Math\.random\)/);
  });
});

describe('Mi perfil', () => {
  const perfil = sinComentarios('app/(tabs)/perfil.tsx');

  it('cuenta lo que devuelve el envio: un admin ve la foto cambiada, el resto "en revision"', () => {
    assert.match(perfil, /mensajeTrasEnviar\(/);
    assert.doesNotMatch(perfil, /Foto de perfil actualizada/);
  });

  it('enseña el aviso de la ultima solicitud (en revision o rechazada con motivo)', () => {
    assert.match(perfil, /avisoDeSolicitud\(/);
    assert.match(perfil, /ultimaSolicitudFoto\(/);
  });
});

describe('Alertas de administracion', () => {
  it('la pantalla de decidir esta registrada en el layout raiz', () => {
    assert.ok(leer('app/_layout.tsx').includes('name="admin/foto/[requestId]"'));
  });

  it('la bandeja lee las dos fuentes y lleva cada tipo a su ticket', () => {
    const bandeja = sinComentarios('app/admin/alertas.tsx');
    assert.match(bandeja, /listarAlertas\(/);
    assert.match(bandeja, /listarSolicitudesFoto\(/);
    assert.match(bandeja, /'\/admin\/foto\/\[requestId\]'/);
    assert.match(bandeja, /'\/admin\/alerta\/\[reportId\]'/);
  });

  it('una fuente caida no tumba la otra: allSettled, no Promise.all', () => {
    const bandeja = sinComentarios('app/admin/alertas.tsx');
    assert.match(bandeja, /Promise\.allSettled/);
  });

  it('la burbuja de Mi perfil suma las fotos pendientes a las denuncias', () => {
    const api = sinComentarios('src/features/admin/api.ts');
    const cuerpo = api.slice(api.indexOf('export async function contarAlertas'));
    assert.match(cuerpo.slice(0, cuerpo.indexOf('\n}\n')), /contarSolicitudesFoto\(\)/);
  });

  it('la pantalla de decidir ensena la MINIATURA, no solo la foto grande: es lo que ven los demas y el servidor no puede verificarla', () => {
    // Desde la 0023 el bucket es privado y las dos se firman (`useRutaFirmada`)
    // en vez de construirse como URL publica, pero lo que se vigila aqui es lo
    // mismo: que se pinten LAS DOS.
    const pantalla = sinComentarios('app/admin/foto/[requestId].tsx');
    assert.match(pantalla, /useRutaFirmada\(fila\?\.foto_path\)/);
    assert.match(pantalla, /useRutaFirmada\(fila\?\.thumb_path\)/);
    assert.match(pantalla, /source=\{\{ uri: fotoNueva/);
    assert.match(pantalla, /source=\{\{ uri: miniaturaNueva/);
  });

  it('la pantalla de decidir manda las URL solo al aprobar y el motivo solo al rechazar', () => {
    const api = sinComentarios('src/features/admin/api.ts');
    assert.match(api, /p_foto_url:\s*decision\.aprobar\s*\?\s*urlPublicaAvatar/);
    assert.match(api, /p_reason:\s*decision\.aprobar\s*\?\s*''\s*:\s*decision\.motivo/);
  });
});

describe('cada codigo de error que lanza la migracion esta traducido en la app', () => {
  const sql = leer('supabase/migrations/0020_foto_perfil_con_revision.sql');
  // Solo los que estan en sentencias `raise exception 'CODIGO'`, no los de los comentarios.
  const codigos = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]))];
  const traductores = leer('src/features/profile/fotoRevision.ts') + leer('src/features/admin/api.ts');

  it('la migracion lanza codigos (si no, esta prueba no vigila nada)', () => {
    assert.ok(codigos.length >= 10, `solo ${codigos.length}: ¿ha cambiado el formato del raise?`);
  });

  it('todos aparecen en un traductor', () => {
    const sinTraducir = codigos.filter((c) => !traductores.includes(c));
    assert.deepEqual(sinTraducir, []);
  });

  it('y el patron de codigos de la bandeja de admin incluye los que decide un admin', () => {
    const api = leer('src/features/admin/api.ts');
    for (const c of ['NOT_ADMIN', 'REQUEST_NOT_FOUND', 'REQUEST_NOT_PENDING', 'REASON_REQUIRED', 'REASON_TOO_LONG', 'INVALID_URL', 'FILE_MISSING']) {
      const patron = api.slice(api.indexOf('function codigo('), api.indexOf('function describirError'));
      assert.ok(patron.includes(c), `${c} no esta en el patron de ErrorAdmin`);
    }
  });
});
