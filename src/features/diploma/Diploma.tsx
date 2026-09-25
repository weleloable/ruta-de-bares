import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { ChapaSellado } from '../../components/ChapaSellado';
import { fonts } from '../../lib/theme';
import { AvatarCana } from '../match/piezas';
import { MapaEstatico } from './MapaEstatico';
import {
  DIPLOMA_ALTO,
  DIPLOMA_ANCHO,
  cierreDiploma,
  lineaCompletado,
  rutaEnDiploma,
} from './textoDiploma';

/**
 * Diploma de credencial completa, en vertical 9:16 para subirlo a Instagram
 * (una story a 1080 x 1920 al exportarlo x3). Dos mitades, cada una con su
 * doble marco, como el anverso y el reverso de un diploma:
 *
 *   - arriba, el diploma: la ilustracion de Ruta de Bares de fondo muy suave,
 *     "Diploma de honor", la foto de perfil dentro de la chapa verde de los
 *     sellos, "<nombre> ha completado: <RUTA>" y un cierre con guasa;
 *   - abajo, el reverso: el mapa de la ruta (MapaEstatico) dentro de su marco.
 *
 * Mide siempre DIPLOMA_ANCHO x DIPLOMA_ALTO: quien lo muestra lo escala con un
 * transform en un contenedor PADRE, y quien lo exporta captura este nodo sin
 * ese transform. Por eso el transform no puede ir aqui.
 */
const MITAD = DIPLOMA_ALTO / 2;
const TAMANO_FOTO = 82;
// Tinta de diploma: marrones y dorado, no los de la app, para que no parezca una pantalla.
const PAPEL = '#FBF3DF';
const TINTA = '#3B2A17';
const TINTA_SUAVE = '#6B4E22';
const ORO = '#A9802A';

/**
 * Lo visible que queda la ilustracion de fondo (0 a 1). Se mezcla con
 * 'multiply', asi que el blanco del dibujo desaparece contra el papel y solo
 * quedan las lineas y los tonos. Mas alto compite con el texto; mas bajo se pierde.
 */
export const OPACIDAD_FONDO_DIPLOMA = 0.18;

/** Doble marco con un rombo en cada esquina: el mismo en las dos mitades. */
function Marco() {
  return (
    <>
      <View style={styles.marcoExterior} pointerEvents="none" />
      <View style={styles.marcoInterior} pointerEvents="none" />
      {(['tl', 'tr', 'bl', 'br'] as const).map((esquina) => (
        <View key={esquina} style={[styles.adorno, ESQUINAS[esquina]]} pointerEvents="none" />
      ))}
    </>
  );
}

export const Diploma = forwardRef<View, {
  nombre: string;
  ruta: string;
  foto: string | null;
  paradas: readonly { id: string; lat: number; lng: number }[];
  opacidadFondo?: number;
}>(function Diploma({ nombre, ruta, foto, paradas, opacidadFondo = OPACIDAD_FONDO_DIPLOMA }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.diploma}>
      <View style={styles.mitad}>
        <View style={styles.cajaFondo} pointerEvents="none">
          <Image
            source={require('../../../assets/marca/fondo-diploma.jpg')}
            style={[styles.fondo, { opacity: opacidadFondo }]}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
        <Marco />

        <View style={styles.contenido}>
          <Text style={styles.titulo}>DIPLOMA DE HONOR</Text>

          <View style={styles.separador}>
            <View style={styles.linea} />
            <View style={styles.rombo} />
            <View style={styles.linea} />
          </View>

          <View style={styles.foto}>
            <AvatarCana nombre={nombre} foto={foto} tamano={TAMANO_FOTO} />
            <ChapaSellado tamanoLogo={TAMANO_FOTO} />
          </View>

          <View style={styles.textos}>
            <Text style={styles.completado}>{lineaCompletado(nombre)}</Text>
            <Text style={styles.ruta} numberOfLines={2}>
              {rutaEnDiploma(ruta)}
            </Text>
            <Text style={styles.cierre}>{cierreDiploma(nombre, ruta)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.mitad}>
        <Marco />
        <View style={styles.mapa}>
          <MapaEstatico paradas={paradas} ancho={DIPLOMA_ANCHO - 2 * MARGEN_MAPA} alto={MITAD - 2 * MARGEN_MAPA} />
        </View>
      </View>
    </View>
  );
});

/** Hueco entre el borde de la mitad y el mapa: deja ver los dos marcos. */
const MARGEN_MAPA = 23;
const ESQUINAS = StyleSheet.create({
  tl: { top: 8, left: 8 },
  tr: { top: 8, right: 8 },
  bl: { bottom: 8, left: 8 },
  br: { bottom: 8, right: 8 },
});

const styles = StyleSheet.create({
  diploma: { width: DIPLOMA_ANCHO, height: DIPLOMA_ALTO, backgroundColor: PAPEL, overflow: 'hidden' },
  mitad: { height: MITAD, backgroundColor: PAPEL, overflow: 'hidden' },
  // La ilustracion queda DENTRO del marco exterior (10 px): si se saliera, se
  // veria el dibujo por fuera del marco.
  cajaFondo: { position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, overflow: 'hidden' },
  // La ilustracion ya viene recortada SIN su rotulo ("Ruta de Bares / Alcala de
  // Henares"), que chocaria con el titulo: solo cigüeñas, torres y adoquines.
  // 'cover' la ajusta a la caja recortando un poco por los lados.
  fondo: { width: '100%', height: '100%', mixBlendMode: 'multiply' },
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
  contenido: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 30,
    paddingVertical: 20,
  },
  titulo: {
    fontFamily: fonts.title,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 3,
    color: TINTA,
    textAlign: 'center',
  },
  separador: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 150 },
  linea: { flex: 1, height: 1, backgroundColor: ORO },
  rombo: { width: 7, height: 7, backgroundColor: ORO, transform: [{ rotate: '45deg' }] },
  foto: { width: TAMANO_FOTO, height: TAMANO_FOTO },
  textos: { alignItems: 'center', gap: 4 },
  completado: { fontFamily: fonts.title, fontSize: 14, lineHeight: 18, fontStyle: 'italic', color: TINTA_SUAVE, textAlign: 'center' },
  ruta: {
    fontFamily: fonts.title,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: 1,
    color: TINTA,
    textAlign: 'center',
  },
  cierre: {
    fontFamily: fonts.title,
    fontSize: 12.5,
    lineHeight: 16,
    fontStyle: 'italic',
    color: TINTA_SUAVE,
    textAlign: 'center',
    maxWidth: 250,
    marginTop: 2,
  },
  mapa: {
    position: 'absolute',
    top: MARGEN_MAPA,
    left: MARGEN_MAPA,
    borderWidth: 1,
    borderColor: TINTA,
  },
});
