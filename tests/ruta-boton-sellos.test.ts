import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Cabecera de Ruta: boton de Sellos y atribucion del mapa.
 *
 * Guardia de lectura de codigo, como barra-superior.test.ts: el comportamiento
 * de verdad (donde cae el boton, que el nombre largo no lo empuje fuera) se ve
 * en un navegador, pero estas uniones son faciles de romper sin que nada falle:
 *  - Sellos ya no tiene boton abajo, asi que si el de Ruta desaparece o cambia
 *    de icono, la pantalla queda sin acceso o con dos iconos distintos.
 *  - La atribucion de OpenStreetMap es un REQUISITO de su licencia y de las
 *    condiciones de las teselas: puede dejar de ser un enlace (se quito porque
 *    un toque torcido sacaba a la gente de la app) pero no puede desaparecer.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const sinComentarios = (ruta: string) =>
  readFileSync(join(raiz, ruta), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const ruta = sinComentarios('app/(tabs)/ruta.tsx');
const layout = sinComentarios('app/(tabs)/_layout.tsx');

/** El icono de la pestana de un Tabs.Screen, p. ej. "ribbon". */
function iconoDePestana(nombre: string): string | null {
  const bloque = layout.split('<Tabs.Screen').find((b) => b.includes(`name="${nombre}"`));
  return bloque ? (/<Ionicons\s+name="([a-z-]+)"/.exec(bloque)?.[1] ?? null) : null;
}

describe('Ruta: boton de acceso a Sellos', () => {
  it('lleva a Sellos (la pestana de "/")', () => {
    assert.match(ruta, /router\.navigate\(\s*'\/'\s*\)/);
  });

  it('usa EL MISMO icono que tenia Sellos en la barra de abajo', () => {
    const icono = iconoDePestana('index');
    assert.ok(icono, 'Sellos ya no declara un tabBarIcon: ¿se movio el icono?');
    assert.match(ruta, new RegExp(`<Ionicons\\s+name="${icono}"`), `ruta.tsx no usa el icono "${icono}" de Sellos`);
  });

  it('es solo un simbolo, pero accesible: sin texto visible y con etiqueta para lector de pantalla', () => {
    assert.match(ruta, /accessibilityLabel="Ver mis sellos"/);
    assert.match(ruta, /accessibilityRole="button"/);
    const boton = ruta.slice(ruta.indexOf('accessibilityLabel="Ver mis sellos"'), ruta.indexOf('</Pressable>', ruta.indexOf('Ver mis sellos')));
    assert.doesNotMatch(boton, /<Text\b/, 'el boton no debe llevar texto');
  });

  it('esta en la cabecera y a la derecha: el texto va en un bloque que se estira y el boton detras', () => {
    const cabecera = ruta.slice(ruta.indexOf('style={styles.cabecera}'), ruta.indexOf('{error ?'));
    const texto = cabecera.indexOf('styles.cabeceraTexto');
    const boton = cabecera.indexOf('Ver mis sellos');
    assert.ok(texto > 0 && boton > 0, 'falta el bloque de texto o el boton en la cabecera');
    assert.ok(texto < boton, 'el boton tiene que ir DESPUES del texto para quedar a la derecha');
    assert.match(ruta, /cabecera:\s*\{[\s\S]*?flexDirection:\s*'row'/);
    // Sin minWidth 0 un nombre de ruta largo empuja el boton fuera de la cabecera.
    assert.match(ruta, /cabeceraTexto:\s*\{[^}]*minWidth:\s*0/);
  });

  it('mide al menos 44 px: el minimo tocable de un boton solo de icono', () => {
    const m = /botonSellos:\s*\{[^}]*width:\s*(\d+)[^}]*height:\s*(\d+)/.exec(ruta);
    assert.ok(m, 'no encuentro el estilo botonSellos');
    assert.ok(Number(m[1]) >= 44 && Number(m[2]) >= 44, `mide ${m[1]}x${m[2]}`);
  });
});

describe('Sellos: ya no esta en la barra de abajo', () => {
  it('su pestana sigue existiendo pero oculta (href: null): es a donde llevan "/" y la invitacion', () => {
    const bloque = layout.split('<Tabs.Screen').find((b) => b.includes('name="index"')) ?? '';
    assert.match(bloque, /\bhref:\s*null\s*,/);
    assert.match(bloque, /title:\s*'Sellos'/);
  });
});

describe('Atribucion de OpenStreetMap en la cabecera de Ruta', () => {
  it('sigue VISIBLE en web: es un requisito de la licencia, no un adorno', () => {
    assert.match(ruta, /Mapa:\s*©\s*OpenStreetMap/);
    assert.match(ruta, /Platform\.OS\s*===\s*'web'/);
  });

  it('pero ya no es un enlace: no abre la web de OpenStreetMap con un toque torcido', () => {
    assert.doesNotMatch(ruta, /Linking/);
    assert.doesNotMatch(ruta, /openURL/);
    assert.doesNotMatch(ruta, /OSM_COPYRIGHT_URL/);
    assert.doesNotMatch(ruta, /openstreetmap\.org/);
    // Ni marcado como enlace para el lector de pantalla, que anunciaria algo que no hace.
    const atribucion = ruta.slice(ruta.indexOf('styles.atribucion') - 40, ruta.indexOf('Mapa:') + 40);
    assert.doesNotMatch(atribucion, /accessibilityRole="link"/);
    assert.doesNotMatch(atribucion, /onPress/);
  });
});
