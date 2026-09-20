import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * "Mis datos" ya no es una pantalla propia: vive dentro de "Privacidad".
 *
 * Antes era `app/mis-datos.tsx`, a la que Mi perfil llevaba con un boton
 * "Mis datos" separado de "Política de privacidad y datos". Dos pantallas
 * casi iguales (una decia que datos se recogen, la otra dejaba descargarlos) y
 * un enlace cruzado entre ellas. Se fusionaron: el boton de Mi perfil pasa a
 * llevar a /privacidad, y el recuadro "Ver lo que guardamos" (antes la
 * pantalla entera) vive ahi dentro, donde antes estaba el boton
 * "Cómo funciona La Caña".
 *
 * Por que sigue habiendo test, y por que a una cuenta suspendida le importa: a
 * una cuenta suspendida o con La Caña desactivada por un admin, la pestana
 * Cana le sale vacia, y es justo a quien su aviso de sancion le promete que
 * puede llevarse o borrar sus datos (RGPD arts. 15 y 17). Mientras la entrada
 * este en Mi perfil (fuera de la pestana Cana), eso se cumple igual con la
 * fusion.
 *
 * Sin renderizador de componentes en el repo, se vigila el cableado por
 * codigo, como borrar-cuenta.test.ts y barra-superior.test.ts.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('"Mis datos" se fusiono con Privacidad', () => {
  it('app/mis-datos.tsx ya no existe, en ningun sitio', () => {
    assert.ok(!existsSync(join(raiz, 'app/mis-datos.tsx')), 'sigue app/mis-datos.tsx: la fusion no se completo');
    assert.ok(!existsSync(join(raiz, 'app/cana/mis-datos.tsx')), 'sigue la copia mas vieja bajo app/cana/');
  });

  it('ya no esta registrada en el Stack raiz', () => {
    assert.doesNotMatch(leer('app/_layout.tsx'), /name="mis-datos"/);
  });

  it('Mi perfil lleva a /privacidad, con el texto "Política de privacidad y datos"', () => {
    const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx')).replace(/["`]/g, "'");
    assert.match(perfil, /router\.push\('\/privacidad'\)/);
    assert.match(perfil, /title='Política de privacidad y datos'/);
    assert.doesNotMatch(perfil, /router\.push\('\/mis-datos'\)/);
  });

  it('va ANTES de "Borrar Cuenta": descargar y leer primero, borrar despues', () => {
    const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx')).replace(/["`]/g, "'");
    const iDatos = perfil.indexOf("'/privacidad'");
    const iBorrar = perfil.indexOf('setConfirmandoBorrado(true)');
    assert.ok(iDatos > 0 && iBorrar > 0, 'no se encontraron los dos');
    assert.ok(iDatos < iBorrar, '"Política de privacidad y datos" tiene que ir antes que "Borrar Cuenta"');
  });

  const privacidad = sinComentarios(leer('app/privacidad.tsx'));

  it('privacidad.tsx tiene el recuadro "Ver lo que guardamos", donde estaba el boton a condiciones', () => {
    assert.match(privacidad, /Ver lo que guardamos/);
    assert.match(privacidad, /exportMyData\(\)/);
    // Y el boton que habia antes, "Cómo funciona La Caña", ya no esta: lo
    // sustituye el recuadro, no conviven los dos.
    assert.doesNotMatch(privacidad, /Cómo funciona La Caña/);
    assert.doesNotMatch(privacidad, /cana\/condiciones/);
  });

  it('el JSON se puede leer entero: scroll en los dos ejes', () => {
    // El bug original: solo habia un ScrollView `horizontal` con maxHeight
    // 280, asi que el JSON se cortaba por abajo sin forma de seguir leyendo.
    // Se traslado el recuadro entero; el arreglo tiene que haber viajado con el.
    assert.match(
      privacidad,
      /<ScrollView style=\{styles\.caja\} nestedScrollEnabled>\s*<ScrollView horizontal>/,
      'falta el ScrollView vertical por fuera del horizontal',
    );
  });

  it('copiar y descargar siguen ahi, con su propio estado de error', () => {
    assert.match(privacidad, /Clipboard\.setStringAsync\(datos\)/);
    assert.match(privacidad, /errorDatos/);
  });
});
