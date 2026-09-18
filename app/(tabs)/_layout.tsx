import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { BarraSuperior } from '../../src/components/BarraSuperior';
import { colors } from '../../src/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.stamp,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // Misma barra en todas las pestanas, titulada con el title de cada una
        // (el mismo texto que su boton en la barra de abajo).
        header: ({ options }) => <BarraSuperior titulo={options.title ?? ''} />,
        // React Navigation reserva el hueco del notch con este color aunque el
        // header sea propio: sin esto se ve mas claro que el resto de la barra.
        headerStyle: { backgroundColor: colors.paperDeep },
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sellos',
          tabBarIcon: ({ color, size }) => <Ionicons name="ribbon" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ruta"
        options={{
          title: 'Ruta',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
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
