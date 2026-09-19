import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../lib/theme';
import { buscarPorNombre, iniciales } from './catalogo';
import { useCatalogo } from './catalogoStore';
import { LOGOS } from './logos';

/**
 * Logo de un bar, buscado por nombre en el catalogo vivo (route_bars no guarda
 * el logo, ver catalogo.ts): los de la lista cerrada salen de assets/bares/ y
 * los propios de la imagen guardada en el dispositivo. Un bar que no esta en el
 * catalogo, o un propio en otro dispositivo, se pinta como un sello con sus
 * iniciales: el hueco nunca queda vacio.
 *
 * `uri` fuerza una imagen concreta: es la vista previa de un bar que aun no se
 * ha guardado, cuando todavia no esta en el catalogo.
 */
export function BarLogo({ nombre, tamano = 44, uri }: { nombre: string; tamano?: number; uri?: string | null }) {
  const catalogo = useCatalogo();
  const caja = { width: tamano, height: tamano, borderRadius: radius.pill };
  const bar = buscarPorNombre(nombre, catalogo);
  const fuente = uri ? { uri } : bar?.logoUri ? { uri: bar.logoUri } : bar ? LOGOS[bar.id] : undefined;

  if (fuente) {
    return <Image source={fuente} accessibilityLabel={`Logo de ${nombre}`} style={caja} />;
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
