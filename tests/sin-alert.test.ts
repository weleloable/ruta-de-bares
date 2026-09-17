import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Alert.alert no puede aparecer en NINGUNA pantalla.
 *
 * En react-native-web, Alert.alert es literalmente `static alert() {}`: no
 * pinta dialogo y no llama a ningun callback. Como el trabajo real suele vivir
 * dentro del onPress del boton destructivo, en la PWA el boton se queda mudo:
 * ni accion, ni error, ni nada en consola. En nativo si funciona, que es por lo
 * que tarda tanto en verse.
 *
 * Este guardia empezo mirando solo perfil.tsx, y el mismo fallo aparecio otras
 * TRES veces: "Anular" en invitaciones, "Borrar" en el editor de rutas y
 * "Quitar el bar" en el editor de bares. Los tres estuvieron rotos en web sin
 * que nadie lo notara, y el propio guardia los daba por deuda conocida.
 *
 * De ahi que ahora escanee toda la app en vez de nombrar ficheros: la lista a
 * mano es justo lo que dejo pasar los otros tres. La sustitucion es
 * DialogoConfirmar (Modal de react-native), que funciona en las dos plataformas.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8');

/** Quita comentarios para no confundir una explicacion con codigo vivo. */
export function usaAlert(codigo: string): boolean {
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return (
    /\bAlert\s*\.\s*(alert|prompt)\s*\(/.test(sinComentarios) ||
    /\bAlert\b[^\n]*from\s*'react-native'/.test(sinComentarios)
  );
}

/** Todos los .ts/.tsx de una carpeta, recursivo, sin tests. */
function codigoDe(carpeta: string): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(join(raiz, dir), { withFileTypes: true })) {
      const rel = join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(rel);
      else if (/\.tsx?$/.test(entrada.name) && !entrada.name.includes('.test.')) {
        salida.push(rel.split('\\').join('/'));
      }
    }
  };
  recorrer(carpeta);
  return salida;
}

const ficheros = [...codigoDe('app'), ...codigoDe('src')];

describe('ninguna pantalla confirma con Alert (no existe en web)', () => {
  it('el guardia mira algo: hay ficheros que revisar', () => {
    assert.ok(ficheros.length > 20, `solo encontre ${ficheros.length} ficheros`);
    assert.ok(ficheros.includes('app/(tabs)/perfil.tsx'));
    assert.ok(ficheros.includes('app/invitaciones.tsx'));
  });

  for (const fichero of ficheros) {
    it(`${fichero} no usa Alert`, () => {
      assert.equal(
        usaAlert(leer(fichero)),
        false,
        `${fichero} usa Alert: en web ese boton no hara nada. Usa DialogoConfirmar.`,
      );
    });
  }
});

describe('los cuatro sitios que estuvieron rotos usan el dialogo de verdad', () => {
  // No basta con no usar Alert: hay que confirmar con algo. Un boton que borra
  // sin preguntar tambien seria "no usa Alert" y seria peor.
  const conDialogo: [string, string][] = [
    ['app/(tabs)/perfil.tsx', 'onConfirmarSalir'],
    ['app/invitaciones.tsx', 'onAnularConfirmado'],
    ['app/editor.tsx', 'onBorrarConfirmado'],
    ['app/editor/[routeId]/index.tsx', 'onBorrarConfirmado'],
  ];

  for (const [fichero, manejador] of conDialogo) {
    it(`${fichero} confirma con DialogoConfirmar`, () => {
      const codigo = leer(fichero);
      assert.match(codigo, /import \{ DialogoConfirmar \}/, `${fichero} no importa el dialogo`);
      assert.match(codigo, /<DialogoConfirmar/, `${fichero} no pinta el dialogo`);
      // La accion destructiva cuelga del onConfirmar, no del boton de la
      // pantalla: si no, el pop-up seria decorativo.
      assert.match(
        codigo,
        new RegExp(`onConfirmar=\\{${manejador}\\}`),
        `${fichero} no engancha la accion al onConfirmar del dialogo`,
      );
    });
  }
});

describe('el detector funciona', () => {
  it('caza el codigo original de "Cerrar sesion"', () => {
    const original = `
      import { Alert, View } from 'react-native';
      Alert.alert('Cerrar sesion', 'Mensaje.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesion', style: 'destructive', onPress: async () => { await signOut(); } },
      ]);
    `;
    assert.equal(usaAlert(original), true);
  });

  it('caza tambien el import suelto, aunque aun no se use', () => {
    assert.equal(usaAlert("import { Alert, View } from 'react-native';"), true);
  });

  it('no se confunde con un comentario que nombre Alert', () => {
    assert.equal(
      usaAlert('// Sustituye a Alert.alert, que en web no hace nada.\nconst a = 1;'),
      false,
    );
  });

  it('no se confunde con un bloque /* */ que lo explique', () => {
    assert.equal(usaAlert('/* Con Alert.alert esto no hacia nada */\nconst a = 1;'), false);
  });

  it('no marca una variable que se llame parecido', () => {
    assert.equal(usaAlert('const alertas = [];\nmostrarAlerta();'), false);
  });
});
