import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { FAMILIA } from '../scripts/generar-iconos-avisos.mjs';

/**
 * Iconos de los avisos del movil: public/icono-aviso.js decide cual lleva cada
 * aviso y scripts/generar-iconos-avisos.mjs genera los PNG.
 *
 * Lo que se rompe sin que nadie lo vea: que el servidor cambie el emoji de un
 * titulo (el aviso saldria con el icono equivocado), que se pida un icono que
 * no existe (saldria sin imagen) o que el service worker deje de cargar la
 * regla.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8');

type Datos = { tag: string; titulo: string; url: string };
function cargarRegla(): (d: Datos) => string | null {
  const contexto: { self: { iconoDeAviso?: (d: Datos) => string | null } } = { self: {} };
  vm.runInNewContext(leer('public/icono-aviso.js'), contexto);
  assert.equal(typeof contexto.self.iconoDeAviso, 'function');
  return contexto.self.iconoDeAviso as (d: Datos) => string | null;
}
const icono = cargarRegla();

/** Todo el SQL de las migraciones, para comprobar que los titulos existen de verdad. */
const sql = readdirSync(join(raiz, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => leer(`supabase/migrations/${f}`))
  .join('\n');

// [tag, titulo, url, icono esperado, trozo del titulo tal y como lo escribe el SQL]
const CASOS: [string, string, string, string, string][] = [
  ['parada-1', '🍺 En 10 min abre La Taberna', '/', 'bar', "'🍺 En '"],
  ['parada-2', '📸 En 5 min: Foto', '/', 'foto', "'📸 En '"],
  ['parada-3', '📍 En 8 min: Puerta', '/', 'otra', "'📍 En '"],
  ['ultimo_bar-4', '🎽 ¡Te falta 1 bar para el sorteo!', '/', 'falta', '🎽 ¡Te falta 1 bar para el sorteo!'],
  ['sorteo-5', '🎉 ¡Has ganado el sorteo!', '/', 'gana', '🎉 ¡Has ganado el sorteo!'],
  ['sorteo-6', '🎽 Sorteo hecho: has quedado de suplente', '/', 'sorteo', '🎽 Sorteo hecho: has quedado de suplente'],
  ['sorteo-7', '🎽 Sorteo de una camiseta', '/', 'sorteo', "'🎽 Sorteo de '"],
  ['cana', '🍻 ¡Nueva conexión en La Caña!', '/cana', 'conexion', '🍻 ¡Nueva conexión en La Caña!'],
  ['cana', '📳 Anton te ha dado un toque', '/cana', 'toque', "'📳 '"],
  ['cana', '🍺 Maria tiene una pregunta para ti', '/cana', 'pregunta', "' tiene una pregunta para ti'"],
  ['cana', '💬 Arturo te ha contestado', '/cana', 'mensaje', "' te ha contestado'"],
  ['cana', '💬 Arturo te ha escrito', '/cana', 'mensaje', "' te ha escrito'"],
  ['admin', '🚩 Denuncia nueva', '/admin/alertas', 'alerta', '🚩 Denuncia nueva'],
  ['admin', '📷 Foto de perfil por aprobar', '/admin/alertas', 'alerta', '📷 Foto de perfil por aprobar'],
  ['admin-9', '🚪 Expulsión de una ruta', '/admin/moderacion', 'info', '🚪 Expulsión de una ruta'],
];

describe('que icono lleva cada aviso', () => {
  for (const [tag, titulo, url, esperado, enSql] of CASOS) {
    it(`${titulo} -> ${esperado}`, () => {
      assert.equal(icono({ tag, titulo, url }), esperado);
      assert.ok(sql.includes(enSql), `el servidor ya no escribe ${enSql}: revisa public/icono-aviso.js`);
    });
  }

  it('el pregunta-de-cerveza y el abre-un-bar empiezan igual (🍺) y no se confunden: decide el tipo', () => {
    assert.equal(icono({ tag: 'parada-1', titulo: '🍺 x', url: '/' }), 'bar');
    assert.equal(icono({ tag: 'cana', titulo: '🍺 x', url: '/cana' }), 'pregunta');
  });

  it('lo que no conoce sale con el icono de la app, sin romper', () => {
    assert.equal(icono({ tag: 'otro-3', titulo: 'x', url: '/' }), null);
    assert.equal(icono({} as Datos), null);
  });

  it('los cinco tipos del servidor tienen regla', () => {
    // La 0064 lo declara en la tabla y la 0066 lo rehace con `add constraint`.
    const tipos = /check \(tipo in \(([^)]*)\)\)/g;
    const vistos = new Set<string>();
    for (const m of sql.matchAll(tipos)) for (const t of m[1].matchAll(/'(\w+)'/g)) vistos.add(t[1]);
    for (const t of ['parada', 'ultimo_bar', 'sorteo', 'cana', 'admin']) {
      assert.ok(vistos.has(t), `el SQL ya no tiene el tipo ${t}`);
      assert.notEqual(icono({ tag: t, titulo: '', url: '' }), null, t);
    }
  });
});

/** Ancho, alto y tipo de color (6 = RGBA) del PNG, de su cabecera IHDR. */
function cabeceraPng(rel: string) {
  const b = readFileSync(join(raiz, rel));
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${rel} no es un PNG`);
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), color: b[25] };
}

describe('los ficheros', () => {
  it('cada icono que puede pedir la regla existe, a 192 px y con transparencia', () => {
    const pedidos = new Set(CASOS.map((c) => c[3]));
    assert.deepEqual([...pedidos].sort(), Object.keys(FAMILIA).sort(), 'la regla y el generador no piden los mismos iconos');
    for (const n of pedidos) {
      assert.deepEqual(cabeceraPng(`public/icons/avisos/${n}.png`), { ancho: 192, alto: 192, color: 6 }, n);
    }
  });

  it('no sobra ningun PNG y esta la silueta de la barra de estado', () => {
    const ficheros = readdirSync(join(raiz, 'public/icons/avisos')).sort();
    assert.deepEqual(ficheros, [...Object.keys(FAMILIA).map((n) => `${n}.png`), 'badge.png'].sort());
    assert.deepEqual(cabeceraPng('public/icons/avisos/badge.png'), { ancho: 96, alto: 96, color: 6 });
  });

  it('el service worker carga la regla y pone icono y silueta', () => {
    const sw = leer('public/sw.js');
    assert.match(sw, /importScripts\('icono-aviso\.js'\)/);
    assert.match(sw, /icon: icono,/);
    assert.match(sw, /badge: BADGE,/);
    assert.match(sw, /icons\/avisos\/\$\{nombre\}\.png/);
  });
});

describe('el service worker, ejecutado', () => {
  /** Monta sw.js en un self de mentira y le manda un push; devuelve lo que pinto. */
  async function pintar(datos: unknown, conRegla = true) {
    const oyentes: Record<string, (e: unknown) => void> = {};
    const pintadas: { titulo: string; opciones: { icon: string; badge: string; body: string } }[] = [];
    const self = {
      location: new URL('https://weleloable.github.io/ruta-de-bares/sw.js'),
      addEventListener: (tipo: string, fn: (e: unknown) => void) => {
        oyentes[tipo] = fn;
      },
      registration: {
        showNotification: async (titulo: string, opciones: { icon: string; badge: string; body: string }) => {
          pintadas.push({ titulo, opciones });
        },
      },
      skipWaiting: () => undefined,
      clients: { claim: () => undefined },
    } as Record<string, unknown>;
    const contexto = {
      self,
      URL,
      caches: {},
      fetch: () => Promise.reject(new Error('sin red')),
      Response: class {},
      importScripts: (fichero: string) => {
        if (!conRegla) throw new Error('no carga');
        vm.runInNewContext(leer(`public/${fichero}`), contexto);
      },
    };
    vm.runInNewContext(leer('public/sw.js'), contexto);
    let espera: Promise<unknown> = Promise.resolve();
    oyentes.push({ data: { json: () => datos, text: () => '' }, waitUntil: (p: Promise<unknown>) => (espera = p) });
    await espera;
    return pintadas[0];
  }

  it('un toque de La Caña sale con su icono y la silueta de la barra', async () => {
    const n = await pintar({ titulo: '📳 Anton te ha dado un toque', cuerpo: 'En La Caña.', url: '/cana', tag: 'cana' });
    assert.equal(n.titulo, '📳 Anton te ha dado un toque');
    assert.equal(n.opciones.icon, 'https://weleloable.github.io/ruta-de-bares/icons/avisos/toque.png');
    assert.equal(n.opciones.badge, 'https://weleloable.github.io/ruta-de-bares/icons/avisos/badge.png');
  });

  it('un aviso desconocido, o sin la regla cargada, sale con el icono de la app', async () => {
    const app = 'https://weleloable.github.io/ruta-de-bares/icons/icon-192.png';
    assert.equal((await pintar({ titulo: 'x', tag: 'nuevo-1' })).opciones.icon, app);
    assert.equal((await pintar({ titulo: '🍺 x', tag: 'parada-1' }, false)).opciones.icon, app);
  });
});
