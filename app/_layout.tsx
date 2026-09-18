import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { Loading } from '../src/components/ui';
import { AuthProvider, useAuth } from '../src/features/auth/AuthProvider';
import { leerInvitacionPendiente } from '../src/features/invites/pendiente';
import { ActiveRouteProvider } from '../src/features/routes/ActiveRouteProvider';
import { iniciarPwa } from '../src/lib/pwa';
import { colors, fonts } from '../src/lib/theme';

/**
 * Con que pantalla "debajo" se abre una ruta a la que se entra directamente.
 *
 * Al recargar (F5) o abrir un enlace a /cana/persona/<id>, la app arranca en
 * esa pantalla y la pila esta vacia: sin esto no hay flecha de volver y la
 * persona se queda encerrada ahi. Con el ancla, expo-router mete las pestanas
 * debajo y la flecha aparece.
 */
export const unstable_settings = {
  anchor: '(tabs)',
};

// Al cargar el modulo y no en un efecto: el service worker se registra en
// cuanto la pagina termina de cargar, sin esperar a que monte ningun
// componente. En nativo no hace nada.
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

    const enAuth = segments[0] === '(auth)';
    // /invitacion es publica a proposito: si exigiera sesion, abrir el enlace
    // de una ruta sin haberla iniciado acabaria en /login y el token se
    // perderia por el camino. La pantalla se apana sola con y sin sesion.
    const enInvitacion = segments[0] === 'invitacion';

    if (!session && !enAuth && !enInvitacion) {
      router.replace('/login');
    } else if (session && enAuth) {
      // Si se llego aqui por un enlace de ruta, se vuelve a el en vez de a la
      // pantalla de inicio: el usuario venia a entrar en esa ruta.
      // Solo se LEE: este efecto se repite (supabase-js reemite la sesion) y un
      // borrado aqui haria que la segunda pasada mandase a "/". La borra
      // /invitacion cuando se muestra con sesion.
      const pendiente = leerInvitacionPendiente();
      if (pendiente) router.replace({ pathname: '/invitacion', params: { token: pendiente } });
      else router.replace('/');
    }
  }, [session, loading, segments, router]);

  if (loading) return <Loading label="Abriendo la credencial..." />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        // Mismo color que "Detras de la barra" en Mi perfil (perfil.tsx,
        // styles.tituloTarjeta): headerTintColor por si solo no siempre llega
        // al texto del titulo en Android nativo, hay que fijarlo aqui tambien.
        headerTitleStyle: { fontFamily: fonts.title, fontSize: 18, color: '#8A7A69' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="editor" options={{ title: 'Editor de rutas' }} />
      <Stack.Screen name="invitacion" options={{ title: 'Entrar en una ruta' }} />
      <Stack.Screen name="editor/[routeId]/index" options={{ title: 'Editar ruta' }} />
      <Stack.Screen name="editor/[routeId]/bar" options={{ title: 'Bar de la ruta' }} />
      <Stack.Screen name="invitaciones" options={{ title: 'Invitaciones' }} />
      <Stack.Screen name="cana/presentacion" options={{ title: 'Preséntate' }} />
      <Stack.Screen name="cana/persona/[userId]" options={{ title: 'Tírate una caña' }} />
      <Stack.Screen name="cana/chat/[connectionId]" options={{ title: 'Chat' }} />
      <Stack.Screen name="cana/bloqueados" options={{ title: 'Personas bloqueadas' }} />
      <Stack.Screen name="cana/condiciones" options={{ title: 'Cómo funciona la caña' }} />
      <Stack.Screen name="cana/mis-datos" options={{ title: 'Mis datos' }} />
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
