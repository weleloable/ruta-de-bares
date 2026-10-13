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

  it('la medalla se deduce de los sellos (nivelMedalla) y solo la de oro abre el diploma', () => {
    assert.match(codigo, /const nivel = nivelMedalla\(conseguidos, bares\.length\);/);
    assert.match(
      codigo,
      /\{nivel \? \(\s*<Medalla\s+nivel=\{nivel\}\s+alto=\{altoDatos\}\s+onPress=\{nivel === 'oro' \? \(\) => setDiplomaAbierto\(true\) : undefined\}\s*\/>\s*\) : null\}/,
    );
  });

  it('la medalla mide lo que los datos: se mide el bloque y la medalla recibe ese alto', () => {
    assert.match(codigo, /<View style=\{styles\.credencialDatos\} onLayout=\{medirDatos\}>/);
    assert.match(codigo, /alto=\{altoDatos\}/);
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
    const iMedalla = cuerpo[1].indexOf('<Medalla');
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
  const codigo = leer('src/components/Medalla.tsx');

  it('cada nivel tiene su etiqueta de accesibilidad y solo la de oro habla del diploma', () => {
    assert.match(codigo, /oro: 'Medalla de oro: ruta completa\. Toca para ver tu diploma'/);
    assert.match(codigo, /plata: 'Medalla de plata: m.s de dos tercios de la ruta'/);
    assert.match(codigo, /bronce: 'Medalla de bronce: m.s de un tercio de la ruta'/);
    const etiquetas = /const ETIQUETAS[^=]*= \{([\s\S]*?)\n\};/.exec(codigo)?.[1] ?? '';
    assert.equal((etiquetas.match(/diploma/g) ?? []).length, 1, 'solo la etiqueta de oro menciona el diploma');
  });

  it('sin onPress (bronce y plata) no es un boton: no hace nada al pulsarla', () => {
    assert.match(codigo, /accessibilityRole=\{onPress \? 'button' : 'image'\}/);
    assert.match(codigo, /disabled=\{!onPress\}/);
  });

  it('el oro es la paleta de siempre y la caja reservada es la reducida', () => {
    assert.match(codigo, /oro: \{ disco: '#E2B53B', borde: '#A87B12', aro: '#EBC55A', aroBorde: '#F6DE8B', icono: '#6B4310' \}/);
    assert.match(codigo, /width: MEDALLA_ANCHO \* escala, height: MEDALLA_ALTO \* escala/);
  });
});
