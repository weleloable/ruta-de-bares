// Genera la politica de privacidad como pagina HTML estatica:
//   node scripts/generar-privacidad.mjs <carpeta-de-salida> [baseUrl]
// p. ej. `node scripts/generar-privacidad.mjs dist /ruta-de-bares`, que deja
// dist/privacidad/index.html.
//
// Por que existe: Google, para verificar el "Continuar con Google", exige la
// politica en el cuerpo de una pagina HTML propia que responda 200. La web es
// una app de una sola pagina y en GitHub Pages `/privacidad` no existia como
// fichero: la servia `404.html` con codigo 404 y sin una linea de la politica
// en el HTML (la pinta JavaScript). Con una carpeta real, Pages responde 200.
//
// El texto sale de src/features/legal/politica.ts, el mismo que pinta la
// pantalla de la app: no hay una segunda copia que pueda quedarse vieja.
// Consecuencia asumida: al recargar /privacidad en el navegador se ve esta
// pagina y no la pantalla de la app; la descarga de datos solo esta en la app.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { NOMBRE_APP, politica } from '../src/features/legal/politica.ts';
import {
  CORREO_PRIVACIDAD,
  DIAS_CONSERVACION,
  PENDIENTE,
  RESPONSABLE,
  VERSION_POLITICA,
} from '../src/features/legal/responsable.ts';

const escapar = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Las URL del texto (la politica de datos de Google, la pagina de conexiones)
// tienen que poder pulsarse. Se escapa ANTES y se enlaza despues: una URL no
// lleva nada que el escape cambie salvo '&', que en un href escapado es valido.
const conEnlaces = (s) =>
  escapar(s).replace(/https?:\/\/[^\s)<]+/g, (url) => {
    const limpia = url.replace(/[.,]$/, '');
    const cola = url.slice(limpia.length);
    return `<a href="${limpia}" rel="noopener">${limpia}</a>${cola}`;
  });

export function paginaPrivacidad(baseUrl = '') {
  const texto = politica({
    responsable: RESPONSABLE,
    correo: CORREO_PRIVACIDAD,
    diasConservacion: DIAS_CONSERVACION,
  });
  const inicio = `${baseUrl.replace(/\/$/, '')}/`;

  const secciones = texto.secciones
    .map((s) => {
      const bloques = s.bloques
        .map(
          (b) =>
            (b.subtitulo ? `<h3>${escapar(b.subtitulo)}</h3>` : '') +
            `<ul>${b.puntos.map((p) => `<li>${conEnlaces(p)}</li>`).join('')}</ul>`,
        )
        .join('');
      return `<section><h2>${escapar(s.titulo)}</h2>${bloques}</section>`;
    })
    .join('\n');

  const verLoQueGuardamos =
    `<section><h2>${escapar(texto.verLoQueGuardamos.titulo)}</h2>` +
    '<p>Dentro de la app: Mi perfil &gt; Política de privacidad y datos &gt; Ver mis datos.</p>' +
    texto.verLoQueGuardamos.parrafos.map((p) => `<p>${escapar(p)}</p>`).join('') +
    '</section>';

  const borrador = PENDIENTE
    ? '<p class="aviso">Borrador. Falta cerrar quién responde de los datos y el correo de contacto.</p>'
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de privacidad · ${escapar(NOMBRE_APP)}</title>
<meta name="description" content="Qué datos recoge ${escapar(NOMBRE_APP)}, para qué, quién los ve y cómo borrarlos.">
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #F6EFE2; color: #241A12;
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 42rem; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 1.8rem; line-height: 1.2;
    margin: 0 0 4px; text-wrap: balance; }
  h2 { font-family: Georgia, "Times New Roman", serif; font-size: 1.2rem; margin: 32px 0 8px; }
  h3 { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: #6B5B4B; margin: 16px 0 4px; }
  ul { padding-left: 1.2rem; margin: 0; }
  li { margin: 6px 0; }
  li::marker { color: #9A5A11; }
  a { color: #9A5A11; font-weight: 600; overflow-wrap: anywhere; }
  .version { color: #6B5B4B; margin: 0 0 16px; }
  .aviso { background: #F3E1C6; border: 1px solid #D9C9AE; border-radius: 12px; padding: 12px 14px; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #D9C9AE; }
</style>
</head>
<body>
<main>
<h1>Política de privacidad de ${escapar(NOMBRE_APP)}</h1>
<p class="version">Versión ${escapar(VERSION_POLITICA)}</p>
${borrador}
<p>${escapar(texto.presentacion)}</p>
${secciones}
${verLoQueGuardamos}
<footer><a href="${escapar(inicio)}">Abrir ${escapar(NOMBRE_APP)}</a></footer>
</main>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [salida, baseUrl = ''] = process.argv.slice(2);
  if (!salida) {
    console.error('Uso: node scripts/generar-privacidad.mjs <carpeta-de-salida> [baseUrl]');
    process.exit(1);
  }
  const carpeta = join(salida, 'privacidad');
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'index.html'), paginaPrivacidad(baseUrl));
  console.log(`Politica de privacidad estatica: ${join(carpeta, 'index.html')}`);
}
