/**
 * Parejas de Barra: lo que, si se desconecta, no da error y deja el juego mal.
 *
 *  - las caras de las cartas existen y son del tamano que pinta el juego
 *    (las genera scripts/generar-cartas-parejas.py, no se editan a mano);
 *  - el juego esta en el menu, con ranking y protegido contra un tiempo de mas;
 *  - el menu no pinta "0" como record de un juego de tiempo;
 *  - nada compara notas con > a pelo fuera de nota.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SIMBOLOS } from '../src/features/minijuegos/juegos/parejas/modelo.ts';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

/** Ancho y alto de un PNG, de su cabecera IHDR. */
function medidas(ruta: string): [number, number] {
  const b = readFileSync(join(raiz, ruta));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${ruta} no es un PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('las cuatro caras dibujadas existen, cuadradas de 256 px, y los escudos no tienen PNG', () => {
  const dibujadas = SIMBOLOS.filter((s) => !['mahou', 'cruzcampo', 'estrella', 'alhambra'].includes(s));
  assert.deepEqual([...dibujadas].sort(), ['chapa', 'jarra', 'pato', 'rxb']);
  for (const s of dibujadas) {
    assert.deepEqual(medidas(`assets/parejas/${s}.png`), [256, 256], s);
    // Un PNG de 256 px no deberia pasar de ~150 KB: si pesa mas, algo se genero mal.
    assert.ok(statSync(join(raiz, `assets/parejas/${s}.png`)).size < 150_000, s);
  }
  assert.deepEqual(readdirSync(join(raiz, 'assets/parejas')).sort(), ['chapa.png', 'jarra.png', 'pato.png', 'rxb.png']);
});

test('el componente usa esas caras y los escudos de las casas (sin redibujarlos)', () => {
  const c = leer('src/features/minijuegos/juegos/parejas/ParejasDeBarra.tsx');
  for (const s of ['pato', 'rxb', 'jarra', 'chapa']) assert.match(c, new RegExp(`assets/parejas/${s}\\.png`));
  assert.match(c, /<Escudo casa=/);
  // El juego no mira el reloj del sistema: performance.now (monotono) via `ahora()`.
  assert.doesNotMatch(c.replace(/performance\.now\(\) : Date\.now\(\)/, ''), /Date\.now\(\)/);
});

test('en web la carta NO es un Pressable: cuenta el pointerdown (un toque rapido no se pierde)', () => {
  const w = leer('src/features/minijuegos/juegos/parejas/ZonaCarta.web.tsx');
  assert.match(w, /addEventListener\('pointerdown', abajo\)/);
  assert.doesNotMatch(w, /<Pressable/);
  // Teclado y lector de pantalla, que el Pressable daba solo.
  assert.match(w, /e\.detail === 0/);
  assert.match(w, /e\.key !== 'Enter' && e\.key !== ' '/);
  // Y la carta usa ZonaCarta, no un Pressable propio.
  const c = leer('src/features/minijuegos/juegos/parejas/ParejasDeBarra.tsx');
  assert.match(c, /<ZonaCarta/);
  assert.doesNotMatch(c, /<Pressable/);
  // En nativo, onPress: es lo que manda el doble toque de TalkBack (onPressIn, no).
  assert.match(leer('src/features/minijuegos/juegos/parejas/ZonaCarta.tsx'), /onPress=\{onTocar\}/);
});

test('esta en el menu con ranking, Detalle, y no envia un tiempo fuera de rango', () => {
  const j = leer('src/features/minijuegos/juegos.ts');
  assert.match(j, /id: ID_PAREJAS,[\s\S]*?Detalle: DetalleParejas,[\s\S]*?ranking: true,[\s\S]*?if \(!notaValida\(r\.puntuacion\)\) \{\s*throw/);
});

test('sin record, el menu pinta una raya y no "0"', () => {
  const m = leer('src/features/minijuegos/MenuMinijuegos.tsx');
  assert.match(m, /records\[activo\.id\] === undefined \? '—'/);
  assert.doesNotMatch(m, /records\[activo\.id\] \?\? 0/);
});

test('el record local recibe el sentido de nota.ts (nadie compara con > a pelo)', () => {
  const r = leer('src/features/minijuegos/records.ts');
  assert.match(r, /aplicarPuntuacion\([\s\S]*?\(nueva, anterior\) =>\s*esMejorNota\(juego, nueva, anterior\)/);
  const reglas = leer('src/features/minijuegos/recordsReglas.ts');
  // `mejora` obligatorio: sin valor por defecto.
  // \r?\n: con git en Windows (autocrlf) el fichero sale con CRLF.
  assert.match(reglas, /mejora: \(nueva: number, anterior: number\) => boolean,\r?\n\): \{/);
});
