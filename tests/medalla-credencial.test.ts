import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * La medalla de credencial completa vive en la tarjeta de la credencial, a
 * tamano completo y pegada a la derecha, con los datos (ruta, fecha, barra) a
 * su izquierda, y NO se guarda: se deduce de los sellos. El sorteo es la
 * ultima fila de la misma tarjeta, no un recuadro suelto.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('pantalla Sellos', () => {
  const codigo = sinComentarios(leer('app/(tabs)/index.tsx'));

  it('pinta la medalla solo cuando la credencial esta completa', () => {
    assert.match(
      codigo,
      /\{credencialCompleta\(conseguidos, bares.length\) \? \(\s*<Medalla onPress=\{\(\) => setDiplomaAbierto\(true\)\} \/>\s*\) : null\}/,
    );
  });

  it('la medalla va a tamano completo: sin escala reducida', () => {
    assert.doesNotMatch(codigo, /medallaEscala|medallaHueco|scale:\s*0\.45/);
  });

  it('el globo verde "Ruta completa. Compostelana ganada." ya no existe', () => {
    assert.doesNotMatch(codigo, /Compostelana ganada/);
    assert.doesNotMatch(codigo, /<Banner tone="success">/);
  });

  it('la medalla va a la derecha de los datos, en una fila', () => {
    const cuerpo = /<View style=\{styles\.credencialCuerpo\}>([\s\S]*?)<BannerSorteo/.exec(codigo);
    assert.ok(cuerpo, 'no encuentro el cuerpo de la credencial');
    const iDatos = cuerpo[1].indexOf('styles.credencialDatos');
    const iMedalla = cuerpo[1].indexOf('<Medalla onPress=');
    assert.ok(iDatos > -1 && iMedalla > iDatos, 'la medalla tiene que ir despues de los datos');
    assert.match(codigo, /credencialCuerpo:\s*\{\s*flexDirection:\s*'row'/);
    assert.match(codigo, /credencialDatos:\s*\{\s*flex:\s*1/);
  });

  it('el titulo es el nombre de la ruta: ya no hay "Credenciales"', () => {
    assert.doesNotMatch(codigo, /Credenciales/);
    assert.match(codigo, /styles\.credencialNombre\][^>]*>\s*\{activeRoute\.name\}/);
  });

  it('el sorteo va dentro de la tarjeta, no como recuadro aparte', () => {
    const tarjeta = /<Card style=\{styles\.credencial\}>([\s\S]*?)<\/Card>/.exec(codigo);
    assert.ok(tarjeta, 'no encuentro la tarjeta');
    assert.match(tarjeta[1], /<BannerSorteo [^>]*enTarjeta/);
    assert.equal(codigo.match(/<BannerSorteo/g)?.length, 1, 'el sorteo no puede salir dos veces');
  });

  it('no hay nada persistido: ni tablas ni llamadas nuevas para la medalla', () => {
    assert.doesNotMatch(codigo, /supabase|route_completions|from\('/);
  });
});

describe('Medalla', () => {
  it('tiene etiqueta de accesibilidad', () => {
    assert.match(leer('src/components/Medalla.tsx'), /accessibilityLabel="Medalla: ruta completa\./);
  });
});
