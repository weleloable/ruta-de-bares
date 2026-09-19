import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Cableado del punto rojo de notificaciones y de la barra superior.
 *
 * Guardia de lectura de codigo, como barra-superior.test.ts: reglas.test.ts
 * prueba las cuentas, pero que el punto se pinte de verdad en la esquina del
 * boton de Mi perfil, que la campanita no vuelva y que el contador se mantenga
 * al dia son uniones entre ficheros que ninguna otra prueba vigila.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (ruta: string) =>
  leer(ruta)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const barra = sinComentarios('src/components/BarraSuperior.tsx');
const proveedor = sinComentarios('src/features/notificaciones/Notificaciones.tsx');

function ficherosDe(carpeta: string): string[] {
  return readdirSync(join(raiz, carpeta)).flatMap((n) => {
    const ruta = `${carpeta}/${n}`;
    if (statSync(join(raiz, ruta)).isDirectory()) return ficherosDe(ruta);
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [ruta] : [];
  });
}

describe('barra superior: sin campanita', () => {
  it('no hay ningun boton ni icono de notificaciones (no habra pantalla de notificaciones)', () => {
    assert.doesNotMatch(barra, /notifications-outline/);
    assert.doesNotMatch(barra, /accessibilityLabel="Notificaciones"/);
    assert.doesNotMatch(barra, /Ionicons/);
  });

  it('en ningun sitio de app/ ni src/ queda el icono de la campanita', () => {
    const conCampanita = [...ficherosDe('app'), ...ficherosDe('src')].filter((f) =>
      /notifications(-outline)?['"]/.test(sinComentarios(f)),
    );
    assert.deepEqual(conCampanita, []);
  });
});

describe('punto rojo en el boton de Mi perfil', () => {
  it('se pinta SOLO si hay notificaciones y dentro del boton de Mi perfil', () => {
    assert.match(barra, /hay\s*\?\s*<View\s+style=\{styles\.punto\}/);
    const boton = barra.slice(barra.indexOf("router.navigate('/perfil')"), barra.indexOf('</Pressable>', barra.indexOf("router.navigate('/perfil')")));
    assert.match(boton, /styles\.punto/, 'el punto no esta dentro del boton de perfil');
  });

  it('es un circulo entero de rojo en la esquina superior derecha', () => {
    const m = /punto:\s*\{([^}]*)\}/.exec(barra);
    assert.ok(m, 'no encuentro el estilo punto');
    assert.match(m[1], /position:\s*'absolute'/);
    assert.match(m[1], /top:\s*-?\d+/);
    assert.match(m[1], /right:\s*-?\d+/);
    assert.doesNotMatch(m[1], /\b(bottom|left):/);
    assert.match(m[1], /borderRadius:\s*radius\.pill/);
    assert.match(m[1], /backgroundColor:\s*colors\.(stamp|danger)/);
    assert.match(m[1], /width:\s*LADO_PUNTO/);
    assert.match(m[1], /height:\s*LADO_PUNTO/);
  });

  it('no roba el toque: pointerEvents none, el boton sigue recibiendo el pulsado', () => {
    assert.match(barra, /styles\.punto\}\s+pointerEvents="none"/);
  });

  it('el lector de pantalla oye la cuenta en la etiqueta del boton', () => {
    assert.match(barra, /accessibilityLabel=\{etiquetaBotonPerfil\(fuentes\)\}/);
  });
});

describe('el contador se mantiene al dia', () => {
  it('el proveedor esta montado por encima del Stack, junto al de la cana', () => {
    const layout = sinComentarios('app/_layout.tsx');
    assert.match(layout, /<NotificacionesProvider>[\s\S]*<AuthGate\s*\/>[\s\S]*<\/NotificacionesProvider>/);
  });

  it('la barra pide refrescar al cambiar de pantalla: asi se apaga al volver de Avisos', () => {
    assert.match(barra, /usePathname\(\)/);
    assert.match(barra, /useEffect\(\(\)\s*=>\s*\{\s*refrescar\(\);\s*\},\s*\[ruta,\s*refrescar\]\)/);
  });

  it('refrescar es estable (useCallback): si cambiase con cada contador, cada cambio provocaria otra consulta', () => {
    assert.match(proveedor, /const refrescar = useCallback\(\(\) => void mirar\(\), \[mirar\]\)/);
  });

  it('una peticion que llega mientras se pregunta se REPITE al terminar, no se descarta', () => {
    assert.match(proveedor, /if \(enCurso\.current\) \{\s*repetir\.current = true;\s*return;\s*\}/);
    assert.match(proveedor, /while \(repetir\.current\)/);
  });

  it('descarta la respuesta tardia de la persona anterior (cerrar sesion no hereda su punto)', () => {
    assert.match(proveedor, /yoActual\.current !== yo/);
  });

  it('las alertas solo se piden a los admins', () => {
    assert.match(proveedor, /isAdmin \? contarAlertas\(\) : Promise\.resolve\(0\)/);
  });

  it('cada fuente falla por su cuenta: allSettled, no Promise.all', () => {
    assert.match(proveedor, /Promise\.allSettled/);
  });

  it('suma las tres fuentes, incluida la de la cana que ya existia', () => {
    assert.match(proveedor, /useAvisosCana\(\)/);
    assert.match(proveedor, /totalNotificaciones\(fuentes\)/);
  });
});
