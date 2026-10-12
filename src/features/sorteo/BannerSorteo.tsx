import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space } from '../../lib/theme';
import { useSondeo } from '../../lib/useSondeo';
import { leerEstadoSorteo } from './api';
import { textoBanner, type EstadoSorteo } from './sorteo';

/**
 * El banner del sorteo en Sellos (0061): como se entra ("sella todos los
 * bares"), si ya estas dentro y, cuando se hace, quien ha ganado. Solo sale si
 * la ruta tiene sorteo. Se refresca al sellar (`sellos`) y cada minuto.
 */
export function BannerSorteo({ rutaId, sellos }: { rutaId: string; sellos: number }) {
  const [estado, setEstado] = useState<EstadoSorteo | null>(null);

  const cargar = useCallback(async () => {
    setEstado(await leerEstadoSorteo(rutaId));
  }, [rutaId]);

  useEffect(() => {
    void cargar();
  }, [cargar, sellos]);
  useSondeo(cargar, 60_000);

  return estado ? <AvisoSorteo estado={estado} /> : null;
}

/** El banner en si, a partir del estado (se puede ensenar solo). */
export function AvisoSorteo({ estado }: { estado: EstadoSorteo }) {
  const t = textoBanner(estado);
  if (!t) return null;
  return (
    <View style={[styles.banner, t.destacado && styles.destacado]} accessibilityRole="summary">
      <Text style={styles.icono}>{t.icono}</Text>
      <View style={styles.textos}>
        <Text style={[styles.titulo, t.destacado && styles.tituloDestacado]}>{t.titulo}</Text>
        <Text style={[styles.cuerpo, t.destacado && styles.cuerpoDestacado]}>{t.cuerpo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.beerSoft,
    borderWidth: 1,
    borderColor: colors.beer,
  },
  destacado: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  icono: { fontSize: 30 },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 15, fontWeight: '900', color: colors.ink },
  tituloDestacado: { color: colors.white },
  cuerpo: { fontSize: 13, color: colors.inkSoft },
  cuerpoDestacado: { color: colors.white },
});
