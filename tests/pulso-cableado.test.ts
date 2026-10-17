import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { JUEGOS_CON_DECIMALES, JUEGOS_MENOS_ES_MEJOR } from '../src/features/minijuegos/nota.ts';
import { BEBIDAS, ID_PULSO, PUNTUACION_MAXIMA, RONDAS } from '../src/features/minijuegos/juegos/pulso/modelo.ts';
import { CLIENTES, INTERIOR, PROPORCION_BANDEJA, PROPORCION_BEBIDA } from '../src/features/minijuegos/juegos/pulso/spritesGeometria.ts';

/**
 * Pulso de Camarero: lo que, si se desconecta, no da error. La nota perderia sus
 * decimales, el juego no saldria en el menu, un dibujo faltaria (hueco en blanco) o
 * el aviso de "falta una migracion" no nombraria la 0075.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const S = 'assets/pulso/sprites';

/** Ancho y alto de un PNG (cabecera IHDR) o de un JPG (marcador SOF). */
function medida(rel: string): { ancho: number; alto: number } {
  const b = readFileSync(join(raiz, rel));
  if (rel.endsWith('.png')) return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error(`${rel}: JPG raro`);
    const marca = b[i + 1] as number;
    const largo = b.readUInt16BE(i + 2);
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    i += 2 + largo;
  }
  throw new Error(`${rel}: sin SOF`);
}

describe('Pulso de Camarero: la nota', () => {
  it('lleva decimales y mas es mejor (no es un tiempo)', () => {
    assert.ok(JUEGOS_CON_DECIMALES.has(ID_PULSO));
    assert.ok(!JUEGOS_MENOS_ES_MEJOR.has(ID_PULSO));
    assert.equal(PUNTUACION_MAXIMA, 100);
    assert.match(leer('supabase/migrations/0075_pulso_de_camarero.sql'), /when 'pulso-de-camarero' then 100\b/);
  });

  it('esta en el menu: pantalla completa, con ranking, con detalle y que guarda en la ruta', () => {
    const juegos = leer('src/features/minijuegos/juegos.ts');
    assert.match(juegos, /id: ID_PULSO,\s+titulo: 'APARTA!!!',/);
    assert.equal(ID_PULSO, 'pulso-de-camarero');
    assert.match(leer('src/features/minijuegos/juegos/pulso/PulsoDeCamarero.tsx'), /<Text style=\{styles\.veloTitulo\}>APARTA!!!<\/Text>/);
    assert.doesNotMatch(leer('src/features/minijuegos/juegos.ts'), /titulo: 'Pulso de Camarero'/);
  });

  it('el suelo llega hasta abajo del todo (la escena mide bar + bandeja) y la bandeja va encima', () => {
    const c = leer('src/features/minijuegos/juegos/pulso/PulsoDeCamarero.tsx');
    assert.match(c, /const altoTotal = r\.alturaBar \+ r\.alturaBandeja;/);
    assert.match(c, /height: altoTotal, overflow: 'hidden'/);
    assert.match(c, /\(altoTotal - horizonte\) \/ SUELO_ALTO/);
    // La bandeja se pinta DESPUES de la escena, encima.
    assert.ok(c.indexOf('<ZonaBandeja') > c.indexOf('</Escena>'));
  });

  it('sin https avisa antes de empezar y sale el deslizador con su explicacion', () => {
    const c = leer('src/features/minijuegos/juegos/pulso/PulsoDeCamarero.tsx');
    assert.match(c, /window\.isSecureContext === false/);
    assert.match(c, /testID="pulso-aviso-http"/);
    assert.match(c, /Sin sensor de movimiento: arrastra para inclinar el móvil/);
  });

  it('el aviso de que falta una migracion nombra la 0075', () => {
    assert.match(leer('src/features/minijuegos/errores.ts'), /0075/);
  });

  it('reutiliza el sensor y el modo manual de La Caña, y no escribe otro', () => {
    const c = leer('src/features/minijuegos/juegos/pulso/PulsoDeCamarero.tsx');
    assert.match(c, /from '\.\.\/cana\/useInclinacion'/);
    assert.match(c, /from '\.\.\/cana\/inclinacion'/);
    assert.match(c, /from '\.\.\/cana\/teclado'/);
    assert.doesNotMatch(c, /expo-sensors|DeviceMotion|devicemotion|Accelerometer/);
    // El reloj de la logica es el del modelo: nada de Date.now() suelto.
    assert.doesNotMatch(leer('src/features/minijuegos/juegos/pulso/modelo.ts'), /Date\.now|performance\.now|Math\.random/);
  });

  it('el reloj del bucle va en MILISEGUNDOS (pasoDeTiempo los divide por 1000): con segundos la cuenta atras se queda en 3', () => {
    const c = leer('src/features/minijuegos/juegos/pulso/PulsoDeCamarero.tsx');
    assert.match(c, /function ahoraMs\(\): number \{\n  return typeof performance !== 'undefined' \? performance\.now\(\) : Date\.now\(\);\n\}/);
    assert.doesNotMatch(c, /performance\.now\(\) : Date\.now\(\)\) \/ 1000/);
    assert.match(c, /pasoDeTiempo\(t, ultimo, DT_MAX\)/);
    assert.match(c, /const t = ahoraMs\(\);/);
    // Y el contrato de pasoDeTiempo es el de ms -> s.
    assert.match(leer('src/features/minijuegos/reloj.ts'), /\(ahoraMs - ultimoMs\) \/ 1000/);
  });

  it('el record local guarda los decimales y los compara con mas-es-mejor', () => {
    const reglas = leer('src/features/minijuegos/recordsReglas.ts');
    assert.match(reglas, /Math\.round\(puntuacion \* 100\) \/ 100/);
    assert.doesNotMatch(reglas, /Math\.floor|parseInt|trunc/);
  });
});

describe('Pulso de Camarero: los dibujos', () => {
  it('estan todos, a su tamano, y sprites.ts los pide uno a uno', () => {
    const sprites = leer('src/features/minijuegos/juegos/pulso/sprites.ts');
    const fijos = ['bandeja.png', 'charco.png', 'gota.png', 'fondo.jpg', 'suelo.jpg', 'mesa.png', 'taburete.png'];
    for (const f of fijos) {
      assert.ok(existsSync(join(raiz, S, f)), `falta ${f}`);
      assert.ok(sprites.includes(`assets/pulso/sprites/${f}`), `sprites.ts no pide ${f}`);
    }
    const bandeja = medida(`${S}/bandeja.png`);
    assert.ok(Math.abs(bandeja.ancho / bandeja.alto - PROPORCION_BANDEJA) < 1e-9);
    for (const tipo of Object.keys(BEBIDAS)) {
      for (const capa of ['vidrio', 'liquido']) {
        const rel = `${S}/bebidas/${tipo}-${capa}.png`;
        assert.ok(existsSync(join(raiz, rel)), `falta ${rel}`);
        assert.ok(sprites.includes(`assets/pulso/sprites/bebidas/${tipo}-${capa}.png`), `sprites.ts no pide ${rel}`);
        const m = medida(rel);
        assert.ok(Math.abs(m.ancho / m.alto - PROPORCION_BEBIDA) < 1e-9, `${rel} no tiene la proporcion de la geometria`);
      }
      const g = (INTERIOR as Record<string, { arriba: number; abajo: number }>)[tipo];
      assert.ok(g && g.arriba >= 0 && g.abajo <= 1 && g.arriba < g.abajo, `INTERIOR de ${tipo}`);
    }
    assert.deepEqual(Object.keys(INTERIOR).sort(), Object.keys(BEBIDAS).sort());
  });

  it('los 12 clientes estan, con borde, del mismo tamano y pedidos en sprites.ts', () => {
    const sprites = leer('src/features/minijuegos/juegos/pulso/sprites.ts');
    assert.equal(CLIENTES.length, 12);
    const medidas = new Set<string>();
    for (const c of CLIENTES) {
      const rel = `${S}/clientes/${c}.png`;
      assert.ok(existsSync(join(raiz, rel)), `falta ${rel}`);
      assert.ok(sprites.includes(rel.replace('assets', '../../../../../assets').replace(/^\.\.\/\.\.\/\.\.\/\.\.\/\.\.\//, '../../../../../')), `sprites.ts no pide ${c}`);
      assert.ok(existsSync(join(raiz, `assets/barman/clientes/${c}.png`)), `el original de ${c} no esta`);
      const m = medida(rel);
      medidas.add(`${m.ancho}x${m.alto}`);
    }
    assert.equal(medidas.size, 1, `tamanos distintos: ${[...medidas]}`);
  });

  it('los clientes son Open Peeps con licencia: estan citados donde estan sus originales y en la tarjeta de fin', () => {
    const creditos = leer('assets/barman/clientes/CREDITOS.md');
    assert.match(creditos, /Open Peeps/);
    assert.match(creditos, /CC0/);
    assert.match(leer('src/features/minijuegos/juegos/pulso/DetallePulso.tsx'), /Open Peeps de Pablo Stanley/);
  });

  it('no se tocan a mano: el script lo dice y la geometria dice que esta generada', () => {
    assert.match(leer('src/features/minijuegos/juegos/pulso/spritesGeometria.ts'), /GENERADO por scripts\/generar-pulso\.py/);
    assert.match(leer('scripts/generar-pulso.py'), /NO se editan a mano/);
  });
});

describe('Pulso de Camarero: las rondas y la pantalla', () => {
  it('tres rondas con la pantalla completa y sin boton durante la ronda', () => {
    assert.equal(RONDAS.length, 3);
    const c = leer('src/features/minijuegos/juegos/pulso/PulsoDeCamarero.tsx');
    // Los unicos botones: Empezar / Volver (intro), Seguir / Salir (pausa) y la X de la cabecera.
    const botones = [...c.matchAll(/<Button\s+title="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(botones)].sort(), ['Empezar', 'Salir', 'Seguir', 'Seguir jugando', 'Volver'].sort());
  });
});
