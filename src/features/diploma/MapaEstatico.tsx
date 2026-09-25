import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../lib/theme';
import { calcularVista, proyectar, teselas, tramo, LADO_TESELA } from './proyeccionMapa';

/**
 * El mapa de la ruta como imagen fija: teselas de OpenStreetMap, la linea
 * discontinua roja de la pantalla Ruta y las paradas numeradas. No pide la
 * ubicacion ni se mueve, y son Views e Images normales, asi que se puede
 * convertir en PNG (a diferencia de Leaflet o Google Maps) y se ve igual en
 * web y en movil. Las paradas van en rojo con el numero en blanco, como una
 * parada sellada en la pantalla Ruta.
 *
 * La atribucion de OpenStreetMap va dentro, en una esquina: la licencia la
 * exige visible y este mapa acaba en una imagen que se comparte.
 */
const RADIO_PIN = 12;
const MARGEN = RADIO_PIN + 22;

export function MapaEstatico({
  paradas,
  ancho,
  alto,
}: {
  /** En el orden de la ruta. */
  paradas: readonly { id: string; lat: number; lng: number }[];
  ancho: number;
  alto: number;
}) {
  const vista = calcularVista(paradas, ancho, alto, MARGEN);
  const posiciones = paradas.map((p) => proyectar(p, vista));
  const tramos = posiciones.slice(1).map((p, i) => tramo(posiciones[i], p));

  return (
    <View style={[styles.mapa, { width: ancho, height: alto }]} accessibilityLabel="Mapa de la ruta">
      {teselas(vista, ancho, alto).map((t) => (
        <Image
          key={`${t.zoom}/${t.x}/${t.y}`}
          source={{ uri: t.url }}
          style={{ position: 'absolute', left: t.izquierda, top: t.arriba, width: LADO_TESELA, height: LADO_TESELA }}
        />
      ))}

      {tramos.map((t, i) => (
        <View
          key={`t${i}`}
          style={[
            styles.tramo,
            { left: t.x, top: t.y - 2, width: t.largo, transform: [{ rotate: `${t.grados}deg` }] },
          ]}
        >
          {Array.from({ length: Math.ceil(t.largo / 20) }, (_, k) => (
            <View key={k} style={styles.trazo} />
          ))}
        </View>
      ))}

      {posiciones.map((p, i) => (
        <View key={paradas[i].id} style={[styles.pin, { left: p.x - RADIO_PIN, top: p.y - RADIO_PIN }]}>
          <Text style={styles.pinNumero}>{i + 1}</Text>
        </View>
      ))}

      <Text style={styles.atribucion}>© OpenStreetMap</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapa: { overflow: 'hidden', backgroundColor: '#E8E2D4' },
  // Se gira sobre su extremo izquierdo: asi el trazo arranca exactamente en la parada.
  tramo: {
    position: 'absolute',
    height: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    transformOrigin: '0px 2px',
  },
  // 12 de trazo y 8 de hueco, igual que dashArray '12 8' de la pantalla Ruta.
  trazo: { width: 12, height: 4, marginRight: 8, backgroundColor: colors.stamp },
  pin: {
    position: 'absolute',
    width: RADIO_PIN * 2,
    height: RADIO_PIN * 2,
    borderRadius: RADIO_PIN,
    backgroundColor: colors.stamp,
    borderWidth: 2,
    borderColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#241A12',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinNumero: { color: colors.white, fontWeight: '800', fontSize: 12 },
  atribucion: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    fontSize: 9,
    color: '#3A3327',
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 4,
  },
});
