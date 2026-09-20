import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Nadie pinta una foto de perfil sin firmarla (0023).
 *
 * Por que hay un guardia y no solo los cambios: el bucket `avatars` es privado,
 * asi que lo que hay en `profiles.avatar_url` ya NO descarga nada. Poner ese
 * valor en un `<Image>` no da error, da un hueco vacio, y eso se cuela en una
 * revision con facilidad. Este test recorre TODA pantalla y componente y falla
 * si alguno mete un campo de avatar en un `uri` sin pasar por
 * `useAvatarFirmado` / `useRutaFirmada`.
 *
 * Es el mismo tipo de red que leaflet-solo-web.test.ts: barata, y caza el fallo
 * en el commit en vez de en la pantalla de alguien.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Lo que guarda una URL o una ruta de foto de perfil. */
const CAMPOS_DE_FOTO =
  /\b(avatar_url|avatar_thumb_url|foto_path|thumb_path|current_avatar_url|current_avatar_thumb_url|reported_avatar_url)\b/;

/**
 * ¿Esta linea mete un campo de foto en un `uri:` tal cual? Una sola funcion,
 * usada por el barrido Y por su autoprueba: escritas por separado, la copia del
 * test se queda vieja y dice que todo va bien (paso al escribir esto).
 */
function pintaSinFirmar(linea: string): boolean {
  const uri = linea.match(/\buri:\s*([^}]*)/);
  return uri !== null && CAMPOS_DE_FOTO.test(uri[1] as string);
}

function ficheros(): string[] {
  return globSync('{app,src}/**/*.tsx', { cwd: raiz })
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !f.includes('.test.'));
}

describe('ninguna pantalla pinta un avatar sin firmar', () => {
  it('el detector funciona: reconoce una linea mala y no una buena', () => {
    // Sin esto, cualquier fallo del regex se leeria como "todo correcto".
    assert.equal(pintaSinFirmar('<Image source={{ uri: profile.avatar_url }} />'), true);
    assert.equal(pintaSinFirmar('source={{ uri: persona.avatar_thumb_url ?? persona.avatar_url }}'), true);
    assert.equal(pintaSinFirmar('source={{ uri: urlPublicaAvatar(fila.thumb_path) }}'), true);
    assert.equal(pintaSinFirmar('<Image source={{ uri: firmada }} />'), false);
    assert.equal(pintaSinFirmar('const foto = persona.avatar_url;'), false);
  });

  it('hay algo que vigilar: varios sitios firman', () => {
    // Si un refactor renombrase los hooks, el barrido pasaria a mirar al vacio
    // y diria que todo esta bien.
    const usan = ficheros().filter((f) => /useAvatarFirmado|useRutaFirmada/.test(leer(f)));
    assert.ok(usan.length >= 3, `se esperaban varios sitios firmando y hay ${usan.length}`);
  });

  it('ningun `uri:` recibe un campo de foto tal cual', () => {
    const culpables: string[] = [];
    for (const fichero of ficheros()) {
      for (const linea of sinComentarios(leer(fichero)).split('\n')) {
        if (pintaSinFirmar(linea)) culpables.push(`${fichero}: ${linea.trim().slice(0, 100)}`);
      }
    }
    assert.deepEqual(culpables, [], `estos pintan una URL sin firmar y saldran en blanco:\n${culpables.join('\n')}`);
  });

  it('AvatarCana firma por dentro, que es lo que salva a las pantallas que lo usan', () => {
    const piezas = sinComentarios(leer('src/features/match/piezas.tsx'));
    const cuerpo = piezas.slice(piezas.indexOf('export function AvatarCana'));
    assert.match(cuerpo, /useAvatarFirmado\(foto\)/);
  });

  it('la firma se olvida al perder la sesion', () => {
    // Una firma es una llave temporal concedida a quien la pidio: la siguiente
    // persona que entre en este movil no debe heredarla.
    const auth = sinComentarios(leer('src/features/auth/AuthProvider.tsx'));
    assert.match(auth, /olvidarFirmasDeAvatar\(\)/);
    const sinSesion = auth.slice(auth.indexOf('if (!nuevaSesion)'));
    assert.ok(
      sinSesion.indexOf('olvidarFirmasDeAvatar()') < sinSesion.indexOf('return'),
      'tiene que limpiarse en la rama de "sin sesion"',
    );
  });

  it('lo que se guarda sigue siendo la URL identificadora, no una firmada', () => {
    // Guardar una firmada dejaria el perfil apuntando a un enlace que caduca en
    // 15 minutos, y `avatar_admin_decide` (0020) ademas la rechazaria.
    const api = sinComentarios(leer('src/features/admin/api.ts'));
    assert.match(api, /p_foto_url:\s*decision\.aprobar\s*\?\s*urlPublicaAvatar/);
  });
});
