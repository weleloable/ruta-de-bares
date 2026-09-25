import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { BarraSuperior } from '../../src/components/BarraSuperior';
import { useAvisosCana } from '../../src/features/match/AvisosCana';
import { colors } from '../../src/lib/theme';

export default function TabsLayout() {
  const { avisos } = useAvisosCana();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.stamp,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
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
      {/* El orden de la barra de abajo es el de estas pantallas: Ruta, Sellos, Caña. */}
      <Tabs.Screen
        name="ruta"
        options={{
          title: 'Ruta',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          // La segunda de la barra. Sigue siendo a donde llevan '/' y el enlace de
          // invitacion, como cuando estaba oculta.
          title: 'Sellos',
          tabBarIcon: ({ color, size }) => <Ionicons name="ribbon" color={color} size={size} />,
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
        name="perfil"
        options={{
          title: 'Mi perfil',
          // Sin boton abajo: se entra por el avatar de BarraSuperior.
          href: null,
        }}
      />
    </Tabs>
  );
}
