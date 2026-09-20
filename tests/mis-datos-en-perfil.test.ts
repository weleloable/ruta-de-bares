import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * "Mis datos" se entra desde Mi perfil, no desde la pestana Cana.
 *
 * Por que importa, y por que hay test: desde la pestana Cana no la alcanzaba
 * justo quien mas la necesita. Comprobado en navegador antes de moverla: a una
 * cuenta SUSPENDIDA esa pestana le ensena "Todavia no hay ruta", y a quien tiene
 * la cana desactivada por un admin, la pantalla de presentacion. Ninguna de las
 * dos tiene el boton. Y es a esas dos personas a quienes su aviso de sancion les
 * promete que pueden descargar o borrar sus datos (RGPD arts. 15 y 17).
 *
 * Sin renderizador de componentes en el repo, se vigila el cableado por codigo,
 * como borrar-cuenta.test.ts y barra-superior.test.ts.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('"Mis datos" fuera de la cana', () => {
  it('la pantalla ya no vive bajo app/cana/', () => {
    assert.ok(existsSync(join(raiz, 'app/mis-datos.tsx')), 'falta app/mis-datos.tsx');
    assert.ok(
      !existsSync(join(raiz, 'app/cana/mis-datos.tsx')),
      'sigue la copia vieja en app/cana/: expo-router serviria las dos rutas',
    );
  });

  it('Mi perfil lleva a ella', () => {
    const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx')).replace(/["`]/g, "'");
    assert.match(perfil, /router\.push\('\/mis-datos'\)/);
  });

  it('la pestana Cana ya no', () => {
    const cana = sinComentarios(leer('app/(tabs)/cana.tsx'));
    assert.doesNotMatch(cana, /mis-datos/);
  });

  it('esta registrada en el Stack con su ruta nueva', () => {
    const layout = leer('app/_layout.tsx');
    assert.match(layout, /<Stack\.Screen name="mis-datos"/);
    assert.doesNotMatch(layout, /name="cana\/mis-datos"/);
  });

  it('va ANTES de "Borrar Cuenta": descargar primero, borrar despues', () => {
    // Si el enlace de borrado quedase por encima, la pantalla ofreceria
    // destruirlo todo antes de ofrecer llevarselo.
    const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx')).replace(/["`]/g, "'");
    const iDatos = perfil.indexOf("'/mis-datos'");
    const iBorrar = perfil.indexOf('setConfirmandoBorrado(true)');
    assert.ok(iDatos > 0 && iBorrar > 0, 'no se encontraron los dos');
    assert.ok(iDatos < iBorrar, '"Mis datos" tiene que ir antes que "Borrar Cuenta"');
  });

  it('el JSON se puede leer entero: scroll en los dos ejes', () => {
    // El bug: solo habia un ScrollView `horizontal` con maxHeight 280, asi que
    // el JSON se cortaba por abajo sin forma de seguir leyendo.
    const pantalla = sinComentarios(leer('app/mis-datos.tsx'));
    assert.match(
      pantalla,
      /<ScrollView style=\{styles\.caja\} nestedScrollEnabled>\s*<ScrollView horizontal>/,
      'falta el ScrollView vertical por fuera del horizontal',
    );
  });
});
