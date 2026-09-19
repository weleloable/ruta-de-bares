import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../lib/theme';
import { buscarPorNombre, iniciales } from './catalogo';
import { LOGOS } from './logos';

/**
 * Logo de un bar, buscado por nombre en el catalogo (route_bars no guarda el
 * logo, ver catalogo.ts). Un bar que no esta en el catalogo, por ejemplo uno
 * creado antes de que existiera, se pinta como un sello con sus iniciales: el
 * hueco nunca queda vacio.
 */
export function BarLogo({ nombre, tamano = 44 }: { nombre: string; tamano?: number }) {
  const caja = { width: tamano, height: tamano, borderRadius: radius.pill };
  const id = buscarPorNombre(nombre)?.id;
  const logo = id ? LOGOS[id] : undefined;

  if (logo) {
    return <Image source={logo} accessibilityLabel={`Logo de ${nombre}`} style={caja} />;
  }

  return (
    <View style={[styles.sello, caja]} accessibilityLabel={`Logo de ${nombre}`}>
      <Text style={[styles.iniciales, { fontSize: Math.round(tamano * 0.36) }]}>{iniciales(nombre)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sello: {
    backgroundColor: colors.stampSoft,
    borderWidth: 2,
    borderColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciales: { color: colors.stamp, fontWeight: '800', letterSpacing: 0.5 },
});
