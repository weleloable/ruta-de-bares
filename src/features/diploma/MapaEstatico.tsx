import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../lib/theme';
import { BarLogo } from '../routes/BarLogo';
import { calcularVista, proyectar, teselas, tramo } from './proyeccionMapa';

/**
 * El mapa de la ruta como imagen fija: teselas de OpenStreetMap, la linea
 * discontinua roja de la pantalla Ruta y una marca por parada. No pide la
 * ubicacion ni se mueve, y son Views e Images normales, asi que se puede
 * convertir en PNG (a diferencia de Leaflet o Google Maps) y se ve igual en
 * web y en movil.
 *
 * La marca de cada parada es, segun `marca`, el SELLO del bar (su logo dentro de
 * un aro rojo) o un numero como el de la pantalla Ruta.
 *
 * El zoom es el justo para que las paradas toquen los margenes (ver
 * proyeccionMapa.ts). La atribucion de OpenStreetMap va dentro, en una
 * esquina: la licencia la exige visible y este mapa acaba en una imagen que se
 * comparte.
 */
const RADIO_SELLO = 17;
const RADIO_NUMERO = 12;
/** Cuanto se deja libre entre la marca y el borde del mapa. */
const AIRE = 8;

export type ParadaMapa = { id: string; nombre: string; lat: number; lng: number };

export function MapaEstatico({
  paradas,
  ancho,
  alto,
  marca = 'sellos',
}: {
  /** En el orden de la ruta. */
  paradas: readonly ParadaMapa[];
  ancho: number;
  alto: number;
  marca?: 'sellos' | 'numeros';
}) {
  const radio = marca === 'sellos' ? RADIO_SELLO : RADIO_NUMERO;
  const vista = calcularVista(paradas, ancho, alto, radio + AIRE, 18);
  const posiciones = paradas.map((p) => proyectar(p, vista));
  const tramos = posiciones.slice(1).map((p, i) => tramo(posiciones[i], p));

  return (
    <View style={[styles.mapa, { width: ancho, height: alto }]} accessibilityLabel="Mapa de la ruta">
      {teselas(vista, ancho, alto).map((t) => (
        <Image
          key={`${t.zoom}/${t.x}/${t.y}`}
          source={{ uri: t.url }}
          style={{ position: 'absolute', left: t.izquierda, top: t.arriba, width: t.lado, height: t.lado }}
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
        <View
          key={paradas[i].id}
          style={[
            styles.pin,
            marca === 'sellos' ? styles.sello : styles.numero,
            { left: p.x - radio, top: p.y - radio, width: radio * 2, height: radio * 2, borderRadius: radio },
          ]}
        >
          {marca === 'sellos' ? (
            <BarLogo nombre={paradas[i].nombre} tamano={radio * 2 - 4} />
          ) : (
            <Text style={styles.pinNumero}>{i + 1}</Text>
          )}
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
    borderWidth: 2,
    borderColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#241A12',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  numero: { backgroundColor: colors.stamp },
  // Fondo claro por si el logo del bar tiene transparencias.
  sello: { backgroundColor: colors.card },
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
