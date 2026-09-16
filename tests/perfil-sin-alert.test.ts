import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Cerrar sesion no puede depender de Alert.alert.
 *
 * En react-native-web, Alert.alert es literalmente `static alert() {}`: no
 * pinta dialogo y no llama a ningun callback. Como todo el trabajo real vive
 * dentro del onPress del boton destructivo, en la PWA el boton se quedaba
 * mudo: ni sesion cerrada, ni error, ni nada en consola. En nativo si
 * funcionaba, que es por lo que tardo en verse.
 *
 * La sustitucion es DialogoConfirmar, con Modal de react-native, que si
 * funciona en las dos plataformas. Este guardia evita que alguien vuelva a
 * meter Alert aqui por costumbre.
 *
 * Nota: invitaciones.tsx y el editor siguen usando Alert.alert y siguen rotos
 * en web por la misma razon. Estan fuera del alcance de este guardia a
 * proposito; cuando se arreglen, lo suyo es ampliar esta regla a esos
 * ficheros en vez de escribir otra.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8');

/** Quita comentarios para no confundir una explicacion con codigo vivo. */
export function usaAlert(codigo: string): boolean {
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return /\bAlert\s*\.\s*(alert|prompt)\s*\(/.test(sinComentarios) || /\bAlert\b[^\n]*from\s*'react-native'/.test(sinComentarios);
}

describe('Perfil no confirma con Alert (no existe en web)', () => {
  it('perfil.tsx no usa Alert', () => {
    assert.equal(usaAlert(leer('app/(tabs)/perfil.tsx')), false);
  });

  it('perfil.tsx pide confirmacion con DialogoConfirmar antes de cerrar sesion', () => {
    const codigo = leer('app/(tabs)/perfil.tsx');
    assert.match(codigo, /import \{ DialogoConfirmar \}/);
    assert.match(codigo, /<DialogoConfirmar/);
    // signOut solo se llama desde el onConfirmar del dialogo, nunca al pulsar
    // el boton de la pantalla: si no, el pop-up seria decorativo.
    assert.match(codigo, /onConfirmar=\{onConfirmarSalir\}/);
    assert.match(codigo, /async function onConfirmarSalir\(\)[\s\S]*?await signOut\(\)/);
  });

  it('el dialogo que lo sustituye tampoco usa Alert', () => {
    assert.equal(usaAlert(leer('src/features/profile/DialogoConfirmar.tsx')), false);
  });

  it('el guardia esta mirando algo: detecta el codigo original', () => {
    const original = `
      import { Alert, View } from 'react-native';
      Alert.alert('Cerrar sesion', 'Mensaje.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesion', style: 'destructive', onPress: async () => { await signOut(); } },
      ]);
    `;
    assert.equal(usaAlert(original), true);
  });

  it('no se confunde con un comentario que nombre Alert', () => {
    assert.equal(usaAlert('// Sustituye a Alert.alert, que en web no hace nada.\nconst a = 1;'), false);
  });
});
