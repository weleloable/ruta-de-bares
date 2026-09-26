import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * "Continuar con Google" en login y registro. Sin renderizador ni Google real
 * aqui, se vigila el cableado por codigo (como barra-superior.test.ts).
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('pantallas', () => {
  for (const pantalla of ['app/(auth)/login.tsx', 'app/(auth)/registro.tsx']) {
    it(`${pantalla} pinta el boton de Google`, () => {
      const codigo = sinComentarios(leer(pantalla));
      assert.match(codigo, /import \{ BotonGoogle \} from '\.\.\/\.\.\/src\/features\/auth\/BotonGoogle'/);
      assert.match(codigo, /<BotonGoogle\b/);
    });
  }

  it('el correo y contrasena siguen ahi: Google se AÑADE, no sustituye', () => {
    assert.match(leer('app/(auth)/login.tsx'), /title="Entrar"/);
    assert.match(leer('app/(auth)/registro.tsx'), /title="Crear cuenta"/);
  });

  it('el boton dice "Continuar con Google" y lleva el logo de Google', () => {
    const codigo = leer('src/features/auth/BotonGoogle.tsx');
    assert.match(codigo, /title="Continuar con Google"/);
    assert.match(codigo, /icon="logo-google"/);
  });

  it('un error de Google se ve en pantalla y el boton se libera', () => {
    const codigo = sinComentarios(leer('src/features/auth/BotonGoogle.tsx'));
    assert.match(codigo, /catch[\s\S]*setError\(/);
    assert.match(codigo, /finally\s*\{\s*setEnviando\(false\)/);
  });
});

describe('cliente de Supabase', () => {
  const codigo = sinComentarios(leer('src/lib/supabase.ts'));
  it("usa PKCE: volver de Google es una URL con ?code=", () => {
    assert.match(codigo, /flowType:\s*'pkce'/);
  });
  it('lee la sesion de la URL solo en web (en movil no hay URL que leer)', () => {
    assert.match(codigo, /detectSessionInUrl:\s*Platform\.OS === 'web'/);
  });
});

describe('las dos variantes de plataforma', () => {
  it('existen las dos, con la misma funcion', () => {
    for (const f of ['google.ts', 'google.web.ts']) {
      assert.match(leer(`src/features/auth/${f}`), /export async function signInWithGoogle\(\): Promise<boolean>/);
    }
  });

  it('la web NO importa expo-web-browser (modulo nativo) y el movil si', () => {
    assert.doesNotMatch(leer('src/features/auth/google.web.ts'), /expo-web-browser/);
    assert.match(leer('src/features/auth/google.ts'), /from 'expo-web-browser'/);
  });

  it('el movil vuelve por el esquema de la app y canjea el codigo', () => {
    const codigo = sinComentarios(leer('src/features/auth/google.ts'));
    assert.match(codigo, /Linking\.createURL\('auth-callback'\)/);
    assert.match(codigo, /skipBrowserRedirect:\s*true/);
    assert.match(codigo, /exchangeCodeForSession\(codigo\)/);
    assert.match(codigo, /openAuthSessionAsync\(data\.url, redirectTo\)/);
  });

  it('la web vuelve a la raiz de la app, con la subruta de Pages', () => {
    const codigo = sinComentarios(leer('src/features/auth/google.web.ts'));
    assert.match(codigo, /urlVueltaWeb\(window\.location\.origin, alcance\)/);
    assert.match(codigo, /rutasPwa\(Constants\.expoConfig\?\.experiments\?\.baseUrl\)/);
  });
});

describe('contrato con el resto de la app', () => {
  it('AuthProvider lo expone', () => {
    const codigo = leer('src/features/auth/AuthProvider.tsx');
    assert.match(codigo, /signInWithGoogle: \(\) => Promise<boolean>;/);
    assert.match(codigo, /^\s+signInWithGoogle,$/m);
  });

  it('existe la ruta a la que vuelve el movil y esta registrada', () => {
    assert.ok(existsSync(join(raiz, 'app/auth-callback.tsx')));
    assert.match(leer('app/_layout.tsx'), /<Stack\.Screen name="auth-callback"/);
  });

  it('el esquema rutadebares:// sigue en app.config.ts', () => {
    assert.match(leer('app.config.ts'), /scheme:\s*'rutadebares'/);
  });

  it('la politica de privacidad cuenta que datos da Google', () => {
    // El texto vive en legal/politica.ts, lo comparten la app y la web estatica.
    assert.match(leer('src/features/legal/politica.ts'), /Si entras con Google/);
  });

  it('expo-web-browser esta en package.json', () => {
    assert.match(leer('package.json'), /"expo-web-browser":/);
  });
});
