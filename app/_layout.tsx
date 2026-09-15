import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { Loading } from '../src/components/ui';
import { AuthProvider, useAuth } from '../src/features/auth/AuthProvider';
import { iniciarPwa } from '../src/features/pwa/pwa';
import { ActiveRouteProvider } from '../src/features/routes/ActiveRouteProvider';
import { colors, fonts } from '../src/lib/theme';

// Al cargar el modulo y no en un efecto: el navegador lanza el aviso de
// instalacion (beforeinstallprompt) una sola vez al cargar la pagina, y si
// nadie lo escucha en ese momento se pierde. En nativo no hace nada.
iniciarPwa();

/**
 * Portero de la navegacion.
 *
 * Vive en un componente aparte porque el redirect tiene que correr DENTRO del
 * arbol de <AuthProvider> y DESPUES de que el Stack haya montado: navegar antes
 * de que exista el navegador es el clasico "attempted to navigate before
 * mounting the Root Layout".
 */
function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const enZonaPublica = segments[0] === '(auth)';

    if (!session && !enZonaPublica) {
      router.replace('/login');
    } else if (session && enZonaPublica) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  if (loading) return <Loading label="Abriendo la credencial..." />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.title, fontSize: 18 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="editor/[routeId]/index" options={{ title: 'Editar ruta' }} />
      <Stack.Screen name="editor/[routeId]/bar" options={{ title: 'Bar de la ruta' }} />
      <Stack.Screen name="invitaciones" options={{ title: 'Invitaciones' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ActiveRouteProvider>
        <StatusBar style="dark" />
        <AuthGate />
      </ActiveRouteProvider>
    </AuthProvider>
  );
}
