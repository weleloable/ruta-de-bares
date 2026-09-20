import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { Loading } from '../src/components/ui';
import { AuthProvider, useAuth } from '../src/features/auth/AuthProvider';
import { leerInvitacionPendiente } from '../src/features/invites/pendiente';
import { AvisosCanaProvider } from '../src/features/match/AvisosCana';
import { NotificacionesProvider } from '../src/features/notificaciones/Notificaciones';
import { ActiveRouteProvider } from '../src/features/routes/ActiveRouteProvider';
import { iniciarPwa } from '../src/lib/pwa';
import { iniciarInstalarApp } from '../src/lib/pwaInstalar';
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
// Idem: si se esperara al efecto de Mi perfil, `beforeinstallprompt` podria
// llegar (y perderse, el navegador no lo repite) mientras se ve el login,
// que es la primera pantalla y esta antes que Perfil.
iniciarInstalarApp();

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
      <Stack.Screen name="editor/[routeId]/bar-nuevo" options={{ title: 'Bar nuevo' }} />
      <Stack.Screen name="invitaciones" options={{ title: 'Invitaciones' }} />
      <Stack.Screen name="avisos" options={{ title: 'Avisos' }} />
      <Stack.Screen name="mis-datos" options={{ title: 'Mis datos' }} />
      <Stack.Screen name="admin/alertas" options={{ title: 'Alertas de administración' }} />
      <Stack.Screen name="admin/alerta/[reportId]" options={{ title: 'Alerta' }} />
      <Stack.Screen name="admin/foto/[requestId]" options={{ title: 'Foto de perfil' }} />
      <Stack.Screen name="admin/moderacion" options={{ title: 'Moderación' }} />
      <Stack.Screen name="cana/presentacion" options={{ title: 'Preséntate' }} />
      <Stack.Screen name="cana/persona/[userId]" options={{ title: 'Tírate una caña' }} />
      <Stack.Screen name="cana/chat/[connectionId]" options={{ title: 'Chat' }} />
      <Stack.Screen name="cana/bloqueados" options={{ title: 'Personas bloqueadas' }} />
      <Stack.Screen name="cana/condiciones" options={{ title: 'Cómo funciona la caña' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ActiveRouteProvider>
        {/* Encima del Stack: la burbujita de la cana tiene que verse desde
            cualquier pestana, no solo desde la de la cana. */}
        <AvisosCanaProvider>
          {/* Idem para el punto rojo de Mi perfil: junta la cana, los avisos de
              moderacion y las alertas de admin (ver Notificaciones.tsx). */}
          <NotificacionesProvider>
            <StatusBar style="dark" />
            <AuthGate />
          </NotificacionesProvider>
        </AvisosCanaProvider>
      </ActiveRouteProvider>
    </AuthProvider>
  );
}
