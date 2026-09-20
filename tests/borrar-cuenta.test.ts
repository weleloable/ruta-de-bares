import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * "Borrar Cuenta" en Mi perfil, debajo de "Cerrar sesion".
 *
 * Sin renderizador de componentes en el repo, se vigila el cableado por codigo
 * (como barra-superior.test.ts). Lo que importa: que tocar el enlace NO borre
 * nada sin pasar por la confirmacion, que el borrado de verdad solo se llame
 * desde el boton del dialogo, y el orden fotos -> cuenta de api.ts.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Perfil: enlace "Borrar Cuenta"', () => {
  const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx')).replace(/["`]/g, "'");

  it('esta debajo de "Cerrar sesion"', () => {
    const iCerrar = perfil.indexOf("title='Cerrar sesion'");
    const iBorrar = perfil.indexOf('Borrar Cuenta');
    assert.ok(iCerrar > -1 && iBorrar > -1);
    assert.ok(iBorrar > iCerrar, 'Borrar Cuenta tiene que ir despues de Cerrar sesion');
  });

  it('lleva el simbolo de prohibido (ban) y el texto subrayado', () => {
    assert.match(perfil, /<Ionicons name='ban'/);
    assert.match(perfil, /borrarCuentaTexto:\s*\{[^}]*textDecorationLine:\s*'underline'[^}]*\}/);
  });

  it('pulsarlo solo abre la confirmacion, no borra', () => {
    const enlace = /<Pressable((?:=>|[^>])*?)>\s*<Ionicons name='ban'/.exec(perfil);
    assert.ok(enlace, 'no encuentro el Pressable del enlace');
    assert.match(enlace[1], /onPress=\{\(\) => setConfirmandoBorrado\(true\)\}/);
    assert.doesNotMatch(enlace[1], /deleteMyAccount/);
  });

  it('se le ensena a todos, admins incluidos: el impedimento se explica con un mensaje, no escondiendo el enlace', () => {
    assert.doesNotMatch(perfil, /\{!isAdmin \? \(\s*<Pressable/);
  });

  it('un doble toque no lanza dos borrados', () => {
    assert.match(perfil, /if \(!profile \|\| borrando\) return;/);
  });

  it('el borrado solo se llama desde onConfirmarBorrado, que cuelga del dialogo', () => {
    assert.equal(perfil.split('deleteMyAccount(').length - 1, 1, 'deleteMyAccount se llama en mas de un sitio');
    assert.match(perfil, /async function onConfirmarBorrado\(\)[\s\S]*?await deleteMyAccount\(profile\.id\)/);
    const dialogo = /<DialogoConfirmar\s+visible=\{confirmandoBorrado\}([\s\S]*?)\/>/.exec(perfil);
    assert.ok(dialogo, 'no hay DialogoConfirmar para el borrado');
    assert.match(dialogo[1], /destructivo/);
    assert.match(dialogo[1], /onConfirmar=\{onConfirmarBorrado\}/);
    assert.match(dialogo[1], /onCancelar=\{\(\) => setConfirmandoBorrado\(false\)\}/);
    assert.match(dialogo[1], /ocupado=\{borrando\}/);
  });

  it('si falla, sube al aviso de error: esta arriba del todo y el enlace abajo', () => {
    const fn = /async function onConfirmarBorrado\(\)([\s\S]*?)\n  }\n/.exec(perfil);
    assert.ok(fn);
    assert.match(fn[1], /catch[\s\S]*scrollRef\.current\?\.scrollTo\(\{ y: 0/);
    assert.match(perfil, /<ScrollView ref=\{scrollRef\}/);
    assert.match(perfil, /\{error \? <Banner tone='error'>\{error\}<\/Banner> : null\}/);
  });

  it('pase lo que pase (exito o fallo) el dialogo se cierra y el boton se libera: finally', () => {
    const fn = /async function onConfirmarBorrado\(\)([\s\S]*?)\n  }\n/.exec(perfil);
    assert.ok(fn);
    assert.match(fn[1], /catch[\s\S]*setError\(/);
    assert.match(fn[1], /finally\s*\{[^}]*setConfirmandoBorrado\(false\)[^}]*setBorrando\(false\)[^}]*\}/);
  });
});

describe('api.ts: deleteMyAccount', () => {
  const api = sinComentarios(leer('src/features/profile/api.ts'));
  const cuerpo = /export async function deleteMyAccount[\s\S]*$/.exec(api)?.[0] ?? '';

  it('orden: primero pregunta si se puede, luego borra fotos, luego la cuenta', () => {
    const iPregunta = cuerpo.indexOf("rpc('delete_my_account_blockers')");
    const iFotos = cuerpo.indexOf('.remove(');
    const iCuenta = cuerpo.indexOf("rpc('delete_my_account')");
    assert.ok(iPregunta > -1 && iFotos > -1 && iCuenta > -1);
    assert.ok(iPregunta < iFotos, 'las fotos no se pueden perder por una cuenta que luego no se borra');
    assert.ok(iFotos < iCuenta, 'Storage no se puede tocar despues: la persona ya no existiria');
  });

  it('un impedimento corta ANTES de las fotos', () => {
    const iCorta = cuerpo.indexOf('if (motivo) throw new Error(motivo);');
    assert.ok(iCorta > -1 && iCorta < cuerpo.indexOf('.remove('));
  });

  it('no se fia de que remove no de error: cuenta lo borrado y relista', () => {
    assert.match(cuerpo, /borrados \?\? \[\]\)\.length < rutas\.length/);
    assert.match(cuerpo, /quedan/);
  });

  it('el bucle esta acotado', () => {
    assert.match(cuerpo, /for \(let vuelta = 0; vuelta < \d+; vuelta\+\+\)/);
  });

  it('cierra la sesion en local, no global', () => {
    assert.match(cuerpo, /signOut\(\{ scope: 'local' \}\)/);
  });
});

describe('contrato SQL <-> app', () => {
  it('la funcion que llama la app existe en la migracion 0021 y en los tipos', () => {
    assert.match(leer('supabase/migrations/0021_borrar_mi_cuenta.sql'), /function public\.delete_my_account\(\)/);
    assert.match(leer('supabase/migrations/0021_borrar_mi_cuenta.sql'), /function public\.delete_my_account_blockers\(\)/);
    const tipos = leer('src/types/database.ts');
    assert.match(tipos, /delete_my_account:\s*\{\s*Args: Record<string, never>;/);
    assert.match(tipos, /delete_my_account_blockers:\s*\{\s*Args: Record<string, never>;\s*Returns: string\[\];/);
  });

  /**
   * Se lee la ULTIMA migracion que redefine la funcion, no la 0021 fija: la
   * 0024 le quito `CANA_BLOCKED` y, leyendo solo la 0021, este test exigia una
   * frase para un codigo que el servidor ya no emite. Una migracion publicada
   * no se edita, se anade la siguiente, asi que el contrato lo marca la ultima.
   */
  function ultimoBlockers(): string {
    const dir = join(raiz, 'supabase/migrations');
    const ficheros = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const cual = ficheros
      .filter((f) => /function public\.delete_my_account_blockers\(\)/.test(leer(`supabase/migrations/${f}`)))
      .at(-1);
    assert.ok(cual, 'ninguna migracion define delete_my_account_blockers()');
    return leer(`supabase/migrations/${cual}`).replace(/--.*$/gm, '');
  }

  it('todos los codigos que emite el SQL tienen frase en la app', () => {
    const codigos = [...ultimoBlockers().matchAll(/array_append\(v_res, '([A-Z_]+)'::text\)/g)].map((m) => m[1]);
    assert.ok(codigos.length >= 3, `se esperaban varios impedimentos y salieron ${codigos.length}`);
    const app = leer('src/features/profile/borrarCuenta.ts');
    for (const codigo of codigos) assert.match(app, new RegExp(`\\b${codigo}:`), `${codigo} sin texto en borrarCuenta.ts`);
  });

  it('y la app no inventa impedimentos que el servidor ya no emite', () => {
    // Al reves que el anterior: una frase para un codigo muerto le diria a
    // alguien que no puede borrarse por algo que ya no le afecta.
    const sql = ultimoBlockers();
    const app = leer('src/features/profile/borrarCuenta.ts');
    const cuerpoMapa = app.slice(app.indexOf('const IMPEDIMENTOS'), app.indexOf('/** El primer impedimento'));
    const enLaApp = [...cuerpoMapa.matchAll(/^\s{2}([A-Z_]+):/gm)].map((m) => m[1]);
    assert.ok(enLaApp.length >= 3);
    for (const codigo of enLaApp) {
      assert.match(sql, new RegExp(`'${codigo}'`), `${codigo} tiene frase en la app y el SQL ya no lo emite`);
    }
  });
});
