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
        name="editor"
        options={{
          title: 'Editor',
          // Sin boton abajo: se entra desde la tarjeta de admins de Perfil ("Detrás de la barra").
          // href: null SOLO oculta el boton, la url /editor sigue abriendo la
          // pantalla. Quien impide entrar a un no-admin es el if (!isAdmin) de
          // editor.tsx, y la RLS de la base de datos quien impide escribir.
          href: null,
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
