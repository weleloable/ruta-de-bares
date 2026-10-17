import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Anuncios (0074): que las piezas esten enganchadas donde tienen que estar.
 * Ninguna da error si se olvida: la tira no saldria, la burbuja no se
 * encenderia o el boton de admin no estaria. Es una red PARCIAL y barata; la
 * prueba de verdad es verla en pantalla.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');

describe('anuncios: cableado', () => {
  it('la tira va DENTRO del bloque superior que mide la pestana Ruta (el mapa se encuadra con su alto)', () => {
    const ruta = leer('app/(tabs)/ruta.tsx');
    const abre = ruta.indexOf('onLayout={medirSuperior}');
    const cierra = ruta.indexOf('onLayout={medirPie}');
    const tira = ruta.indexOf('<TablonAnuncios');
    assert.ok(abre > 0 && cierra > abre && tira > abre && tira < cierra, 'TablonAnuncios no esta entre medirSuperior y medirPie');
  });

  it('el sondeo y la burbuja viven en el layout de las pestanas, no en la de Ruta', () => {
    const layout = leer('app/(tabs)/_layout.tsx');
    assert.match(layout, /<SondeoAnuncios rutaId=\{activeRoute\?\.id\} \/>/);
    assert.match(layout, /tabBarBadge: anunciosSinLeer > 0 \? anunciosSinLeer : undefined/);
    const trozoRuta = layout.slice(layout.indexOf('name="ruta"'), layout.indexOf('name="ruta"') + 700);
    assert.match(trozoRuta, /tabBarBadge/, 'la burbuja esta en otra pestana que no es Ruta');
  });

  it('el sondeo no usa useSondeo (se para al cambiar de pantalla y la burbuja tiene que seguir)', () => {
    assert.doesNotMatch(leer('src/features/anuncios/SondeoAnuncios.tsx').replace(/\/\*[\s\S]*?\*\//g, ''), /useSondeo/);
  });

  it('el boton de Mi perfil y la pantalla estan registrados', () => {
    assert.match(leer('app/(tabs)/perfil.tsx'), /router\.push\('\/admin\/anuncio'\)/);
    assert.match(leer('app/_layout.tsx'), /name="admin\/anuncio"/);
    assert.ok(existsSync(join(raiz, 'app/admin/anuncio.tsx')));
  });

  it('ya no queda nada del prototipo en memoria', () => {
    assert.ok(!existsSync(join(raiz, 'src/features/anuncios/almacenDemo.ts')));
    for (const f of ['app/(tabs)/_layout.tsx', 'app/admin/anuncio.tsx', 'src/features/anuncios/TablonAnuncios.tsx']) {
      assert.doesNotMatch(leer(f), /almacenDemo|Versión de prueba/, f);
    }
  });

  it('enviar y retirar van al servidor con los argumentos de la 0074', () => {
    const api = leer('src/features/anuncios/api.ts');
    assert.match(api, /rpc\('anuncio_enviar', \{\s*p_route: rutaId,\s*p_texto: texto,\s*p_duracion: opciones\.duracionMin,\s*p_solo_admins: opciones\.soloAdmins,\s*p_avisar_movil: opciones\.avisarMovil,\s*\}\)/);
    assert.match(api, /rpc\('anuncio_retirar', \{ p_id: id \}\)/);
    assert.match(api, /rpc\('anuncios_vigentes', \{ p_route: rutaId \}\)/);
    assert.match(api, /rpc\('anuncios_enviados', \{ p_route: rutaId \}\)/);
  });
});
