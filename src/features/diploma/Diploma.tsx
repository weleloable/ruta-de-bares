import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { ChapaSellado } from '../../components/ChapaSellado';
import { fonts } from '../../lib/theme';
import { AvatarCana } from '../match/piezas';
import { MapaEstatico, type ParadaMapa } from './MapaEstatico';
import { MEDIDAS_MARCO, MarcoDiploma, type VarianteMarco } from './marcos';
import {
  CUENTA_INSTAGRAM,
  DIPLOMA_ALTO,
  DIPLOMA_ANCHO,
  cierreDiploma,
  lineaCompletado,
  rutaEnDiploma,
} from './textoDiploma';

/**
 * Diploma de credencial completa, en vertical 9:16 para subirlo a Instagram
 * (una story a 1080 x 1920 al exportarlo x3). Dos mitades, cada una con su
 * marco (marcos.tsx), como el anverso y el reverso de un diploma:
 *
 *   - arriba, el diploma: la ilustracion de Ruta de Bares ENTERA de fondo muy
 *     suave, "Diploma de honor", la foto de perfil dentro de la chapa verde de
 *     los sellos, "<nombre> ha completado: <RUTA>" y un cierre con guasa;
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

/**
 * Lo visible que queda la ilustracion de fondo (0 a 1). Se mezcla con
 * 'multiply', asi que el blanco del dibujo desaparece contra el papel y solo
 * quedan las lineas y los tonos. Mas alto compite con el texto; mas bajo se pierde.
 */
export const OPACIDAD_FONDO_DIPLOMA = 0.15;
/** El marco del diploma: el friso de tercios. Los demas siguen en marcos.tsx por si se quieren recuperar. */
export const MARCO_POR_DEFECTO: VarianteMarco = 'tercios';

export const Diploma = forwardRef<View, {
  nombre: string;
  ruta: string;
  foto: string | null;
  paradas: readonly ParadaMapa[];
  opacidadFondo?: number;
  marco?: VarianteMarco;
}>(function Diploma(
  { nombre, ruta, foto, paradas, opacidadFondo = OPACIDAD_FONDO_DIPLOMA, marco = MARCO_POR_DEFECTO },
  ref,
) {
  const { relleno, margenMapa, fondo } = MEDIDAS_MARCO[marco];
  return (
    <View ref={ref} collapsable={false} style={styles.diploma}>
      <View style={styles.mitad}>
        {/* La ilustracion ENTERA ('contain', "zoom out"), con los rotulos de
            arriba y abajo ("Ruta de Bares / Alcala de Henares") borrados: ruidaban
            detras del titulo. Cubriendo el marco ('cover') se recortaba el dibujo. */}
        <View style={[styles.cajaFondo, { top: fondo, left: fondo, right: fondo, bottom: fondo }]} pointerEvents="none">
          <Image
            source={require('../../../assets/marca/fondo-diploma.jpg')}
            style={[styles.fondo, { opacity: opacidadFondo }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <MarcoDiploma variante={marco} />

        <View style={[styles.contenido, { paddingVertical: relleno }]}>
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
            {/* Va en la mitad de arriba y no en el pie: en una historia de Instagram
                la barra de abajo (y la de arriba) tapan los bordes de la imagen. */}
            <Text style={styles.cuenta}>{CUENTA_INSTAGRAM}</Text>
          </View>
        </View>
      </View>

      <View style={styles.mitad}>
        <MarcoDiploma variante={marco} />
        <View style={[styles.mapa, { top: margenMapa, left: margenMapa }]}>
          <MapaEstatico paradas={paradas} ancho={DIPLOMA_ANCHO - 2 * margenMapa} alto={MITAD - 2 * margenMapa} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  diploma: { width: DIPLOMA_ANCHO, height: DIPLOMA_ALTO, backgroundColor: PAPEL, overflow: 'hidden' },
  mitad: { height: MITAD, backgroundColor: PAPEL, overflow: 'hidden' },
  cajaFondo: { position: 'absolute', overflow: 'hidden' },
  fondo: { width: '100%', height: '100%', mixBlendMode: 'multiply' },
  contenido: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 34,
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
  linea: { flex: 1, height: 1, backgroundColor: '#A9802A' },
  rombo: { width: 7, height: 7, backgroundColor: '#A9802A', transform: [{ rotate: '45deg' }] },
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
  cuenta: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2, color: TINTA_SUAVE, marginTop: 4 },
  mapa: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: TINTA,
  },
});
