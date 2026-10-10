import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../lib/theme';
import { buscarPorNombre, iniciales } from './catalogo';
import { useCatalogo } from './catalogoStore';

/**
 * Logo de un bar. Orden: `uri` (vista previa de un bar aun sin guardar), `logo`
 * (el de la parada, `route_bars.logo`, copiado del catalogo al anadirla: es el
 * unico que puede tener un jugador, que no lee `catalog_bars`) y el del catalogo
 * vivo, buscado por nombre (lo ven los admins). Sin ninguno se pinta un sello
 * con las iniciales: el hueco nunca queda vacio.
 */
export function BarLogo({
  nombre,
  tamano = 44,
  uri,
  logo,
}: {
  nombre: string;
  tamano?: number;
  uri?: string | null;
  logo?: string | null;
}) {
  const catalogo = useCatalogo();
  const caja = { width: tamano, height: tamano, borderRadius: radius.pill };
  const bar = buscarPorNombre(nombre, catalogo);
  // `logo` es el de la parada (route_bars.logo): lo unico que tiene un jugador, que no lee el catalogo.
  const guardado = uri ?? logo ?? bar?.logoUri;
  const fuente = guardado ? { uri: guardado } : undefined;

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
