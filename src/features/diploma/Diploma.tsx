import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChapaSellado } from '../../components/ChapaSellado';
import { fonts } from '../../lib/theme';
import { AvatarCana } from '../match/piezas';
import { MapaEstatico } from './MapaEstatico';
import { DIPLOMA_ALTO, DIPLOMA_ANCHO, fraseDiploma } from './textoDiploma';

/**
 * Diploma de credencial completa, en vertical 9:16 para subirlo a Instagram
 * (una story a 1080 x 1920 al exportarlo x3). Dos mitades:
 *
 *   - arriba, un diploma como los de titulo universitario: doble marco con
 *     adornos en las esquinas, la ruta como titulo, la foto de perfil dentro de
 *     la chapa verde de los sellos y la frase de honor;
 *   - abajo, el mapa de la ruta (MapaEstatico).
 *
 * Mide siempre DIPLOMA_ANCHO x DIPLOMA_ALTO: quien lo muestra lo escala con un
 * transform en un contenedor PADRE, y quien lo exporta captura este nodo sin
 * ese transform. Por eso el transform no puede ir aqui.
 */
const MITAD = DIPLOMA_ALTO / 2;
const TAMANO_FOTO = 92;
// Tinta de diploma: marrones y dorado, no los de la app, para que no parezca una pantalla.
const PAPEL = '#FBF3DF';
const TINTA = '#3B2A17';
const ORO = '#A9802A';

export const Diploma = forwardRef<View, {
  nombre: string;
  ruta: string;
  foto: string | null;
  paradas: readonly { id: string; lat: number; lng: number }[];
}>(function Diploma({ nombre, ruta, foto, paradas }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.diploma}>
      <View style={styles.arriba}>
        <View style={styles.marcoExterior} />
        <View style={styles.marcoInterior} />
        {(['tl', 'tr', 'bl', 'br'] as const).map((esquina) => (
          <View key={esquina} style={[styles.adorno, ESQUINAS[esquina]]} />
        ))}

        <Text style={styles.sobretitulo}>DIPLOMA DE HONOR</Text>
        <Text style={styles.titulo} numberOfLines={2}>
          {ruta}
        </Text>

        <View style={styles.separador}>
          <View style={styles.linea} />
          <View style={styles.rombo} />
          <View style={styles.linea} />
        </View>

        <View style={styles.foto}>
          <AvatarCana nombre={nombre} foto={foto} tamano={TAMANO_FOTO} />
          <ChapaSellado tamanoLogo={TAMANO_FOTO} />
        </View>

        <Text style={styles.frase}>{fraseDiploma(nombre, ruta)}</Text>
      </View>

      <View style={styles.abajo}>
        <MapaEstatico paradas={paradas} ancho={DIPLOMA_ANCHO} alto={MITAD - BORDE} />
      </View>
    </View>
  );
});

const BORDE = 3;
const ESQUINAS = StyleSheet.create({
  tl: { top: 8, left: 8 },
  tr: { top: 8, right: 8 },
  bl: { bottom: 8, left: 8 },
  br: { bottom: 8, right: 8 },
});

const styles = StyleSheet.create({
  diploma: { width: DIPLOMA_ANCHO, height: DIPLOMA_ALTO, backgroundColor: PAPEL, overflow: 'hidden' },
  arriba: {
    height: MITAD,
    backgroundColor: PAPEL,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 34,
    paddingVertical: 22,
  },
  marcoExterior: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderWidth: 2.5,
    borderColor: TINTA,
  },
  marcoInterior: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: 1,
    borderColor: ORO,
  },
  adorno: { position: 'absolute', width: 10, height: 10, backgroundColor: ORO, transform: [{ rotate: '45deg' }] },
  sobretitulo: { fontSize: 9, letterSpacing: 3.5, fontWeight: '700', color: ORO },
  titulo: {
    fontFamily: fonts.title,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
    color: TINTA,
    textAlign: 'center',
  },
  separador: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 150 },
  linea: { flex: 1, height: 1, backgroundColor: ORO },
  rombo: { width: 7, height: 7, backgroundColor: ORO, transform: [{ rotate: '45deg' }] },
  foto: { width: TAMANO_FOTO, height: TAMANO_FOTO },
  frase: {
    fontFamily: fonts.title,
    fontSize: 15,
    lineHeight: 20,
    fontStyle: 'italic',
    color: TINTA,
    textAlign: 'center',
    // Mas estrecha que el marco: reparte la frase en dos lineas parecidas y no
    // deja "honores." solo en la segunda.
    maxWidth: 240,
  },
  // La linea de oro que separa las dos mitades.
  abajo: { height: MITAD, borderTopWidth: BORDE, borderTopColor: TINTA, backgroundColor: '#E8E2D4' },
});
