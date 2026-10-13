import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { colors, radius, space } from '../../lib/theme';
import { useSondeo } from '../../lib/useSondeo';
import { leerEstadoSorteo } from './api';
import { IconoSorteo } from './IconoSorteo';
import { textoBanner, type EstadoSorteo } from './sorteo';

/**
 * El sorteo en Sellos (0061): como se entra ("sella todos los bares"), si ya
 * estas dentro y, cuando se hace, quien ha ganado. Solo sale si la ruta tiene
 * sorteo. Se refresca al sellar (`sellos`) y cada minuto. `enTarjeta`: va como
 * ultima fila de la credencial, sin caja propia (ver AvisoSorteo).
 */
export function BannerSorteo({
  rutaId,
  sellos,
  enTarjeta = false,
}: {
  rutaId: string;
  sellos: number;
  enTarjeta?: boolean;
}) {
  const [estado, setEstado] = useState<EstadoSorteo | null>(null);

  const cargar = useCallback(async () => {
    setEstado(await leerEstadoSorteo(rutaId));
  }, [rutaId]);

  useEffect(() => {
    void cargar();
  }, [cargar, sellos]);
  useSondeo(cargar, 60_000);

  return estado ? <AvisoSorteo estado={estado} enTarjeta={enTarjeta} /> : null;
}

/**
 * El aviso en si, a partir del estado (se puede ensenar solo). Es UNA linea
 * ("Sorteo") para que Sellos quepa sin scroll; al tocarla se abre la
 * explicacion completa (premio, como se entra, si estas dentro o quien ha
 * ganado). Si has ganado, la linea lo dice y va en rojo. El icono es el del
 * premio, el que se sortea (o el sorteado, si ya se hizo).
 *
 * `enTarjeta`: sin caja ni borde propios, separada por una linea fina, para
 * ir dentro de la credencial y no como un recuadro suelto debajo de ella.
 */
export function AvisoSorteo({ estado, enTarjeta = false }: { estado: EstadoSorteo; enTarjeta?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const t = textoBanner(estado);
  if (!t) return null;
  const ganaste = estado.resultado?.soy_ganador === true;
  const premio = estado.resultado?.premio ?? estado.premio;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ganaste ? 'Has ganado el sorteo. Ver más' : 'Sorteo. Ver información'}
        onPress={() => setAbierto(true)}
        style={({ pressed }) => [
          styles.linea,
          enTarjeta && (ganaste ? styles.enTarjetaGanaste : styles.enTarjeta),
          ganaste && styles.lineaGanaste,
          pressed && styles.pulsada,
        ]}
      >
        <IconoSorteo tamano={22} ganaste={ganaste} premio={premio} />
        <Text style={[styles.lineaTexto, ganaste && styles.textoBlanco]} numberOfLines={1}>
          {ganaste ? '¡Has ganado el sorteo!' : 'Sorteo'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={ganaste ? colors.white : colors.beerDark} />
      </Pressable>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={styles.fondo} onPress={() => setAbierto(false)} accessibilityLabel="Cerrar">
          <Pressable style={styles.hoja} onPress={() => undefined}>
            <View style={styles.icono}>
              <IconoSorteo tamano={64} ganaste={ganaste} premio={premio} />
            </View>
            <Text style={styles.titulo}>{t.titulo}</Text>
            <Text style={styles.cuerpo}>{t.cuerpo}</Text>
            <Button title="Entendido" onPress={() => setAbierto(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  linea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.beerSoft,
    borderWidth: 1,
    borderColor: colors.beer,
  },
  lineaGanaste: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  // Dentro de la credencial: solo una raya arriba que la separa del progreso.
  enTarjeta: {
    marginTop: space.sm,
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: space.sm,
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'transparent',
  },
  // Ganar si merece su recuadro rojo, tambien dentro de la tarjeta.
  enTarjetaGanaste: { marginTop: space.sm },
  pulsada: { opacity: 0.75 },
  lineaTexto: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.ink },
  textoBlanco: { color: colors.white },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: space.lg },
  hoja: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    alignItems: 'stretch',
  },
  icono: { alignItems: 'center' },
  titulo: { fontSize: 20, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  cuerpo: { fontSize: 15, lineHeight: 21, color: colors.inkSoft, textAlign: 'center' },
});
