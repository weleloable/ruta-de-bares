import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Red RAPIDA y PARCIAL sobre el cableado del encuadre en los componentes.
 *
 * Lo que de verdad demuestra el comportamiento del mapa web es
 * `npm run verificar:web` (Chrome headless, mide pixeles). Esto corre en cada
 * commit sin navegador y caza las regresiones tipicas leyendo el codigo; no
 * puede cazarlas todas, porque leer codigo no es ejecutarlo. Para el mapa
 * nativo es la unica red automatica: no hay dispositivo en los tests.
 *
 * Tolera los cambios de formato habituales (comentarios, literales de texto,
 * saltos de linea, orden de dependencias, genericos, llaves opcionales, nombres
 * de variables locales), no cualquier reescritura. Si un refactor correcto lo
 * pone en rojo, se ajusta el test: la verdad es `npm run verificar:web`. Cada
 * comprobacion se prueba contra versiones rotas a proposito y contra cambios
 * inocuos.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');

function normalizar(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
    .replace(/\s+/g, ' ');
}

function argumentos(codigo: string, desdeParentesis: number): string | null {
  let nivel = 0;
  for (let i = desdeParentesis; i < codigo.length; i += 1) {
    if (codigo[i] === '(') nivel += 1;
    else if (codigo[i] === ')') {
      nivel -= 1;
      if (nivel === 0) return codigo.slice(desdeParentesis + 1, i);
    }
  }
  return null;
}

/** Dependencias (array final de los argumentos), ordenadas; null si no hay array. */
function dependencias(args: string): string[] | null {
  const m = /\[([^[\]]*)\]\s*,?\s*$/.exec(args);
  if (!m) return null;
  return m[1]
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
    .sort();
}

/** Argumentos de `const <nombre> = <hook><Generico>(...)`. */
function hookConst(codigo: string, nombre: string, hook: string): string | null {
  const m = new RegExp(`const ${nombre} = ${hook}(?:<.*?>)?\\(`).exec(codigo);
  return m ? argumentos(codigo, m.index + m[0].length - 1) : null;
}

/** Argumentos de cada llamada a `funcion(` en el codigo. */
function llamadas(codigo: string, funcion: string): string[] {
  const lista: string[] = [];
  for (const m of codigo.matchAll(new RegExp(`\\b${funcion}\\(`, 'g'))) {
    const args = argumentos(codigo, m.index! + m[0].length - 1);
    if (args) lista.push(args);
  }
  return lista;
}

const cuantas = (texto: string, patron: RegExp) => (texto.match(new RegExp(patron.source, 'g')) ?? []).length;
const iguales = (a: string[] | null, b: string[]) => a !== null && a.join(',') === [...b].sort().join(',');

function problemasMapa(fuente: string, { web }: { web: boolean }): string[] {
  const codigo = normalizar(fuente);
  const problemas: string[] = [];
  const posiciones = web ? 'puntos' : 'coordenadas';

  const encuadrar = hookConst(codigo, 'encuadrar', 'useCallback');
  const depsEncuadrar = web ? ['mapa', 'puntos', 'control'] : ['coordenadas'];
  if (!encuadrar) problemas.push('no hay const encuadrar = useCallback(...)');
  else if (!iguales(dependencias(encuadrar), depsEncuadrar)) {
    problemas.push(`encuadrar depende de [${dependencias(encuadrar)}], se esperaba [${depsEncuadrar}]`);
  }

  if (!/const firma = bars ?\. ?map\(/.test(codigo)) {
    problemas.push('firma no sale de las posiciones de los bares: una recarga igual reencuadraria');
  }
  const memo = hookConst(codigo, posiciones, 'useMemo');
  if (!memo || !iguales(dependencias(memo), ['firma'])) {
    problemas.push(`${posiciones} no es un useMemo con dependencias [firma]`);
  }

  const efectos = llamadas(codigo, 'useEffect');
  // Efecto de montaje / cambio de posiciones: solo encuadra, y solo depende de encuadrar.
  const montaje = efectos.find((args) =>
    /^\s*\(\) => (?:\{ ?encuadrar\( ?\);? ?\}|encuadrar\( ?\)) ?,/.test(args),
  );
  if (!montaje || !iguales(dependencias(montaje), ['encuadrar'])) {
    problemas.push(`el efecto de montaje depende de [${montaje ? dependencias(montaje) : 'no existe'}], se esperaba [encuadrar]`);
  }

  const medida = efectos.find((args) => args.includes('control.medir('));
  if (!medida) problemas.push('no hay efecto con control.medir');
  else {
    if (!/if \( ?control\.medir\( ?hayMedida ?\) ?\) ?\{? ?encuadrar\( ?\)/.test(medida) || cuantas(medida, /encuadrar\(/) !== 1) {
      problemas.push('el efecto de la medida no encuadra SOLO cuando control.medir(hayMedida) lo dice');
    }
    const deps = dependencias(medida);
    if (!deps || !deps.includes('hayMedida') || !deps.includes('encuadrar')) {
      problemas.push(`el efecto de la medida depende de [${deps}]: sin hayMedida la primera medida no llega`);
    }
  }

  if (web) {
    if (!encuadrar || !/if \( ?!control\.pedir\(/.test(encuadrar)) {
      problemas.push('encuadrar no pregunta a control.pedir: se encuadraria con el mapa oculto');
    }
    const observador = llamadas(codigo, 'observarTamano').find((args) => args.includes('encuadrar('));
    if (
      !observador ||
      !/if \( ?tieneTamano && control\.recuperarTamano\( ?\) ?\) ?\{? ?encuadrar\(/.test(observador) ||
      cuantas(observador, /encuadrar\(/) !== 1
    ) {
      problemas.push('volver a la pestana encuadra sin que control.recuperarTamano lo pida');
    }
  } else {
    const camara = llamadas(codigo, 'animateCamera')[0] ?? '';
    if (!/heading: ?0/.test(camara) || !/pitch: ?0/.test(camara)) {
      problemas.push('irA no fija heading: 0 y pitch: 0: con el mapa girado el bar cae bajo el carrusel');
    }
  }
  return problemas;
}

function problemasMedicion(fuente: string): string[] {
  const codigo = normalizar(fuente);
  const problemas: string[] = [];
  for (const setter of ['setAltoSuperior', 'setAltoPie']) {
    const callback = llamadas(codigo, 'useCallback').find((args) => args.includes(`${setter}(`));
    if (!callback) {
      problemas.push(`no hay useCallback que llame a ${setter}`);
      continue;
    }
    const guardado = new RegExp(`if \\( ?(\\w+) ?> ?0 ?\\) ?\\{? ?${setter}\\(`).test(callback);
    if (!guardado || cuantas(callback, new RegExp(`${setter}\\(`)) !== 1) {
      problemas.push(`${setter} no se llama SOLO cuando el alto es mayor que 0 (pestana oculta)`);
    }
    if (/\.y\b|\{[^{}]*\by\b[^{}]*\} ?= ?[\w.]*layout\b/.test(callback)) {
      problemas.push(`${setter}: se usa la posicion (y); en web onLayout no avisa si solo se mueve`);
    }
  }
  const huecos = hookConst(codigo, 'huecos', 'useMemo') ?? '';
  if (!/(\w+) > 0 && (\w+) > 0/.test(huecos)) {
    problemas.push('los huecos se calculan sin exigir las dos medidas mayores que 0');
  }
  return problemas;
}

describe('cableado del encuadre (red rapida y parcial)', () => {
  const web = leer('src/components/RutaMapa.web.tsx');
  const nativo = leer('src/components/RutaMapa.tsx');
  const ruta = leer('app/(tabs)/ruta.tsx');

  it('RutaMapa.web.tsx', () => assert.deepEqual(problemasMapa(web, { web: true }), []));
  it('RutaMapa.tsx (nativo)', () => assert.deepEqual(problemasMapa(nativo, { web: false }), []));
  it('ruta.tsx', () => assert.deepEqual(problemasMedicion(ruta), []));

  /** Aplica una mutacion tolerante a espacios; si no encaja, el test lo dice. */
  const mutar = (texto: string, de: RegExp, a: string) => {
    const resultado = texto.replace(de, a);
    assert.notEqual(resultado, texto, `la mutacion ${de} ya no encaja con el codigo: actualizala`);
    return resultado;
  };

  describe('detecta regresiones', () => {
    const casos: [string, 'web' | 'nativo', RegExp, string][] = [
      ['medidas en deps de encuadrar', 'web', /(const encuadrar[\s\S]*?\[\s*mapa,\s*puntos,\s*control)(\s*\])/, '$1, huecos$2'],
      ['bars en deps de encuadrar', 'nativo', /(\[\s*coordenadas)(\s*\],?\s*\);)/, '$1, bars$2'],
      ['medidas en el efecto de montaje', 'web', /(encuadrar\(\);\s*\},\s*\[\s*encuadrar)(\s*\])/, '$1, huecos$2'],
      ['efecto de montaje sin dependencias', 'nativo', /(encuadrar\(\);\s*\}),\s*\[\s*encuadrar\s*\]/, '$1'],
      ['firma = bars', 'web', /const firma = bars\.map\([^;]*;/, 'const firma = bars;'],
      ['sin useMemo en las posiciones', 'nativo', /const coordenadas = useMemo\([\s\S]*?\n {2}\);/, 'const coordenadas = bars.map((b) => ({ latitude: b.lat, longitude: b.lng }));'],
      ['medida sin condicion', 'web', /if \(control\.medir\(hayMedida\)\) encuadrar\(\);/, 'control.medir(hayMedida); if (hayMedida) encuadrar();'],
      ['medida con else que encuadra', 'nativo', /if \(control\.medir\(hayMedida\)\) encuadrar\(\);/, 'if (control.medir(hayMedida)) encuadrar(); else if (hayMedida) encuadrar();'],
      ['hayMedida fuera de deps', 'web', /\[\s*hayMedida,\s*encuadrar,\s*control\s*\]/, '[encuadrar, control]'],
      ['volver a la pestana encuadra siempre', 'web', /(if \(tieneTamano && control\.recuperarTamano\(\)\) encuadrar\(\);)/, '$1 if (tieneTamano) encuadrar();'],
      ['sin heading/pitch en irA', 'nativo', /\s*heading: 0,\s*pitch: 0,/, ''],
    ];
    for (const [nombre, cual, de, a] of casos) {
      it(`${cual}: ${nombre}`, () => {
        const fuente = cual === 'web' ? web : nativo;
        assert.ok(problemasMapa(mutar(fuente, de, a), { web: cual === 'web' }).length > 0);
      });
    }

    it('ruta: sin filtro de 0', () => {
      assert.ok(problemasMedicion(ruta.replaceAll('if (alto > 0) ', '')).length >= 2);
    });
    it('ruta: filtro vacio y set incondicional', () => {
      assert.ok(problemasMedicion(mutar(ruta, /if \(alto > 0\) setAltoPie\(/, 'if (alto > 0) {}\n    setAltoPie(')).length > 0);
    });
    it('ruta: posicion leida a traves de una variable', () => {
      const roto = mutar(
        ruta,
        /const alto = Math\.round\(evento\.nativeEvent\.layout\.height\);/,
        'const l = evento.nativeEvent.layout; const alto = Math.round(l.y + l.height);',
      );
      assert.ok(problemasMedicion(roto).some((p) => /posicion/.test(p)));
    });
    it('ruta: huecos con medidas de 0', () => {
      assert.ok(problemasMedicion(mutar(ruta, /altoSuperior > 0 && altoPie > 0/, 'altoSuperior >= 0 && altoPie >= 0')).length > 0);
    });
  });

  describe('no da falsos positivos con cambios inocuos', () => {
    it('dependencias reordenadas y en varias lineas, con comentarios', () => {
      const r = mutar(web, /\[mapa, puntos, control\]/, '[\n      control, // el control\n      mapa,\n      puntos,\n    ]');
      assert.deepEqual(problemasMapa(r, { web: true }), []);
    });
    it('generico en useCallback', () => {
      const r = mutar(web, /const encuadrar = useCallback\(/, 'const encuadrar = useCallback<(animar?: boolean) => void>(');
      assert.deepEqual(problemasMapa(r, { web: true }), []);
    });
    it('efecto de montaje sin llaves y con coma final en las dependencias', () => {
      const r = mutar(web, /useEffect\(\(\) => \{\s*encuadrar\(\);\s*\}, \[encuadrar\]\);/, 'useEffect(() => encuadrar(), [encuadrar,]);');
      assert.deepEqual(problemasMapa(r, { web: true }), []);
    });
    it('firma partida en varias lineas (como la deja prettier)', () => {
      const r = mutar(nativo, /const firma = bars\.map\(/, 'const firma = bars\n    .map(');
      assert.deepEqual(problemasMapa(r, { web: false }), []);
    });
    it('llaves en el if de la medida', () => {
      const r = mutar(nativo, /if \(control\.medir\(hayMedida\)\) encuadrar\(\);/, 'if (control.medir(hayMedida)) {\n      encuadrar();\n    }');
      assert.deepEqual(problemasMapa(r, { web: false }), []);
    });
    it('variable local renombrada y texto con la palabra "y"', () => {
      const r = mutar(
        ruta,
        /const alto = Math\.round\(evento\.nativeEvent\.layout\.height\);\s*if \(alto > 0\) setAltoPie\(\(previo\) => \(previo === alto \? previo : alto\)\);/,
        "const etiqueta = 'alto y pie'; const { height } = evento.nativeEvent.layout; const h = Math.round(height); if (h > 0) setAltoPie((previo) => (previo === h ? previo : h));",
      );
      assert.deepEqual(problemasMedicion(r), []);
    });
  });
});
