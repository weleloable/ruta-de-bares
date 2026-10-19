import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarraSuperior } from '../../src/components/BarraSuperior';
import { BotonSellos } from '../../src/components/BotonSellos';
import { useSinLeer } from '../../src/features/anuncios/almacen';
import { SondeoAnuncios } from '../../src/features/anuncios/SondeoAnuncios';
import { DescubrimientoCasa } from '../../src/features/casas/DescubrimientoCasa';
import { AvisoPolitica } from '../../src/features/legal/AvisoPolitica';
import { useAvisosCana } from '../../src/features/match/AvisosCana';
import { InvitacionAvisos } from '../../src/features/push/InvitacionAvisos';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { colors } from '../../src/lib/theme';

export default function TabsLayout() {
  const { avisos } = useAvisosCana();
  const { activeRoute } = useActiveRoute();
  const { isAdmin } = useAuth();
  const anunciosSinLeer = useSinLeer(activeRoute?.id, isAdmin);
  const insets = useSafeAreaInsets();
  const margenInferior = Math.max(insets.bottom, 8);

  return (
    <>
    {/* Encima de las pestanas: sale una vez, cuando ya tienes casa y no la has visto. */}
    <DescubrimientoCasa />
    {/* Si cambia la politica, un aviso una vez (espera a que se cierre el de la casa). */}
    <AvisoPolitica />
    {/* "¿Te avisamos?": una vez, ya en una ruta y sin los otros dos delante. */}
    <InvitacionAvisos />
    {/* Mantiene al dia los anuncios de la ruta: la burbuja de Ruta se enciende desde cualquier pestana. */}
    <SondeoAnuncios rutaId={activeRoute?.id} />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.stamp,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          // El margen del indicador de inicio se suma al alto de los botones.
          height: 64 + margenInferior,
          paddingTop: 8,
          paddingBottom: margenInferior,
          overflow: 'visible',
        },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // Misma barra en todas las pestanas. Por defecto, titulada con el
        // title de cada una (el mismo texto que su boton en la barra de
        // abajo); si una pestana pone ademas headerTitle, manda ese en la
        // cabecera y el title corto se queda solo abajo (caso de "Caña": no
        // cabe entero en la barra con cinco pestanas, pero la cabecera si
        // tiene sitio). Bug encontrado al comprobar esto en pantalla:
        // headerTitle llevaba puesto desde siempre y no se leia en ningun
        // sitio, asi que la cabecera de esa pestana decia "Caña" a secas.
        header: ({ options }) => (
          <BarraSuperior titulo={(typeof options.headerTitle === 'string' ? options.headerTitle : null) ?? options.title ?? ''} />
        ),
        // React Navigation reserva el hueco del notch con este color aunque el
        // header sea propio: sin esto se ve mas claro que el resto de la barra.
        headerStyle: { backgroundColor: colors.paperDeep },
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      {/* El orden de la barra de abajo es el de estas pantallas: Ruta, Casas, Sellos, Caña, Juegos. */}
      <Tabs.Screen
        name="ruta"
        options={{
          title: 'Ruta',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
          // Igual que la burbuja de Caña: cuantos anuncios de la organizacion llevas sin leer.
          tabBarBadge: anunciosSinLeer > 0 ? anunciosSinLeer : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.stamp, color: colors.white, fontSize: 11, fontWeight: '800' },
        }}
      />
      <Tabs.Screen
        name="casas"
        options={{
          // La competicion entre casas: tabla en directo, retos y estadisticas.
          title: 'Casas',
          tabBarIcon: ({ color, size }) => <Ionicons name="shield" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          // La tercera de la barra (el centro) y la importante: un disco del color de
          // marca que sobresale (BotonSellos). Sigue siendo a donde llevan '/' y el
          // enlace de invitacion.
          title: 'Sellos',
          tabBarIcon: ({ color, size }) => <Ionicons name="ribbon" color={color} size={size} />,
          tabBarButton: (props) => (
            <BotonSellos
              onPress={props.onPress}
              onLongPress={props.onLongPress}
              seleccionada={props.accessibilityState?.selected === true}
              etiqueta={props.accessibilityLabel}
              testID={props.testID}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cana"
        options={{
          // "La Caña" no cabe en la barra con cinco pestanas: nombre corto
          // abajo y completo en la cabecera.
          title: 'Caña',
          headerTitle: 'La Caña',
          tabBarIcon: ({ color, size }) => <Ionicons name="beer" color={color} size={size} />,
          // Conexion nueva o novedad en un chat: la misma cuenta que la
          // burbujita de "Chats" dentro de la pestana.
          tabBarBadge: avisos > 0 ? avisos : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.stamp, color: colors.white, fontSize: 11, fontWeight: '800' },
        }}
      />
      <Tabs.Screen
        name="minijuegos"
        options={{
          title: 'Juegos',
          // Siempre a la vista: dentro de una ruta, con su ranking; fuera, en "modo libre"
          // (los records se quedan en el movil y no cuentan para nada).
          tabBarIcon: ({ color, size }) => <Ionicons name="game-controller" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Mi perfil',
          // Sin boton abajo: se entra por el avatar de BarraSuperior.
          href: null,
        }}
      />
    </Tabs>
    </>
  );
}
