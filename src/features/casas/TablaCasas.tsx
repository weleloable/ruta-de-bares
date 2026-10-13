import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';

import { colors, fonts } from '../../lib/theme';
import { CASAS, type IdCasa } from './casas';
import { Escudo } from './Escudo';
import { formatearPuntos, ordenarRanking, type FilaRanking, type FilaServidor } from './ranking';

type Props = {
  filas: FilaServidor[] | null;
  miCasa: IdCasa | null;
  error?: string | null;
  actualizando?: boolean;
  onActualizar?: () => void;
  onCasa?: (casa: IdCasa) => void;
  pie?: ReactNode;
};

/** Presentacion independiente del servidor; el desempate sigue en ranking.ts. */
export function TablaCasas({
  filas, miCasa, error, actualizando = false, onActualizar, onCasa, pie,
}: Props) {
  const [alto, setAlto] = useState(0);
  const { width, fontScale } = useWindowDimensions();
  const reducirMovimiento = useMovimientoReducido();
  const ordenadas = filas ? ordenarRanking(filas) : null;
  const compacta = alto > 0 && alto < 600;
  const digitos = Math.max(2, ...(filas ?? []).map((f) => formatearPuntos(f.puntos).length));
  // Con texto grande o cifras largas, la puntuacion tiene su propia linea.
  const apilada = width < 360 || fontScale > 1.25 || digitos > 4;
  const anchoPuntos = 100 * fontScale;

  return (
    <View style={styles.pantalla} onLayout={(e) => setAlto(e.nativeEvent.layout.height)}>
      <ScrollView
        testID="clasificacion-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.contenido}
        alwaysBounceVertical={false}
        refreshControl={onActualizar ? <RefreshControl refreshing={actualizando} onRefresh={onActualizar} tintColor={colors.stamp} /> : undefined}
      >
        {error ? (
          <View accessibilityRole="alert" style={styles.error}>
            <Text style={styles.errorTexto}>{filas ? 'No se pudo actualizar. Se muestra la última clasificación.' : 'No se pudo cargar la clasificación.'}</Text>
            {onActualizar ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Reintentar clasificación" disabled={actualizando} onPress={onActualizar} style={styles.reintentar}>
                <Ionicons name="refresh-outline" size={18} color={colors.stamp} />
                <Text style={styles.reintentarTexto}>Reintentar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {ordenadas ? (
          <View testID="clasificacion-filas" style={styles.filas}>
            {ordenadas.map((fila, indice) => (
              <FilaCasa
                key={fila.house}
                fila={fila}
                mia={fila.house === miCasa}
                compacta={compacta}
                apilada={apilada}
                anchoPuntos={anchoPuntos}
                reducirMovimiento={reducirMovimiento}
                ultima={indice === ordenadas.length - 1}
                onPress={onCasa ? () => onCasa(fila.house) : undefined}
              />
            ))}
          </View>
        ) : !error ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Cargando clasificación" style={styles.cargando}>
            <ActivityIndicator color={colors.stamp} />
            <Text style={styles.estadoTexto}>Cargando clasificación...</Text>
          </View>
        ) : <View style={styles.filas} />}

        {pie ? <View style={styles.pie}>{pie}</View> : null}
      </ScrollView>
    </View>
  );
}

function FilaCasa({ fila, mia, compacta, apilada, anchoPuntos, reducirMovimiento, ultima, onPress }: {
  fila: FilaRanking;
  mia: boolean;
  compacta: boolean;
  apilada: boolean;
  anchoPuntos: number;
  reducirMovimiento: boolean;
  ultima: boolean;
  onPress?: () => void;
}) {
  const casa = CASAS[fila.house];
  const tinta = casa.color;
  const diferencia = fila.lider
    ? 'Líder de la ruta'
    : fila.aLider > 0
      ? `A ${formatearPuntos(fila.aLider)} ${fila.aLider === 1 ? 'punto' : 'puntos'} del líder`
      : fila.puntos > 0 ? 'Empatada en cabeza' : 'Sin puntos todavía';

  return (
    <Pressable
      testID={`casa-${fila.house}`}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Puesto ${fila.puesto}. ${casa.nombre}. ${formatearPuntos(fila.puntos)} puntos. ${diferencia}.${mia ? ' Tu casa.' : ''}`}
      accessibilityHint={onPress ? 'Abre las aportaciones de esta casa' : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.fila, compacta && styles.filaCompacta, ultima && styles.ultima, pressed && onPress && styles.pulsada]}
    >
      <View style={[styles.identidadYPuntos, apilada && styles.apilada]}>
        <View style={styles.identidad}>
          <Escudo casa={fila.house} tamano={48} />
          <View style={styles.nombreCaja}>
            <Text style={styles.nombre}>{casa.nombre}</Text>
            {mia ? (
              <View style={styles.tuya}>
                <View style={[styles.marcaTuya, { backgroundColor: tinta }]} />
                <Text style={[styles.tuyaTexto, { color: tinta }]}>TU CASA</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.puntosCaja, !apilada && { width: anchoPuntos }]}>
          <Text testID={`puntos-${fila.house}`} style={[styles.puntos, { color: tinta }]}>{formatearPuntos(fila.puntos)}</Text>
          <Text style={styles.unidad}>PUNTOS</Text>
        </View>
      </View>
      <View style={styles.marcador}>
        <BarraCasa progreso={fila.progreso} tinta={tinta} reducirMovimiento={reducirMovimiento} casa={fila.house} />
        <Text style={styles.diferencia}>{diferencia}</Text>
      </View>
    </Pressable>
  );
}

function BarraCasa({ progreso, tinta, reducirMovimiento, casa }: {
  progreso: number; tinta: string; reducirMovimiento: boolean; casa: IdCasa;
}) {
  const avance = useRef(new Animated.Value(progreso)).current;
  useEffect(() => {
    if (reducirMovimiento) {
      avance.setValue(progreso);
      return;
    }
    const animacion = Animated.timing(avance, { toValue: progreso, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animacion.start();
    return () => animacion.stop();
  }, [avance, progreso, reducirMovimiento]);

  return (
    <View testID={`pista-${casa}`} style={styles.pista}>
      <Animated.View
        testID={`barra-${casa}`}
        style={[styles.barra, { backgroundColor: tinta, width: avance.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      >
        <View style={styles.brillo} />
        <View style={styles.remate} />
      </Animated.View>
      {[0.25, 0.5, 0.75].map((marca) => <View key={marca} style={[styles.division, { left: `${marca * 100}%` }]} />)}
    </View>
  );
}

function useMovimientoReducido() {
  const [reducido, setReducido] = useState(true);
  useEffect(() => {
    let vigente = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((valor) => { if (vigente) setReducido(valor); });
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducido);
    return () => { vigente = false; suscripcion.remove(); };
  }, []);
  return reducido;
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, minHeight: 0 },
  scroll: { flex: 1 },
  contenido: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, width: '100%', maxWidth: 760, alignSelf: 'center' },
  filas: { flexGrow: 1 },
  fila: { flexGrow: 1, flexShrink: 0, minHeight: 136, justifyContent: 'center', paddingVertical: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filaCompacta: { minHeight: 110, paddingVertical: 6, gap: 6 },
  ultima: { borderBottomWidth: 0 },
  identidadYPuntos: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  apilada: { flexDirection: 'column', alignItems: 'stretch' },
  identidad: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  nombreCaja: { flex: 1, gap: 5, minWidth: 0 },
  nombre: { fontFamily: fonts.title, fontSize: 19, lineHeight: 23, color: colors.ink, fontWeight: '600' },
  tuya: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  marcaTuya: { width: 3, height: 10, borderRadius: 1 },
  tuyaTexto: { fontSize: 10, lineHeight: 14, fontWeight: '800', flexShrink: 1 },
  puntosCaja: { alignItems: 'flex-end', flexShrink: 0 },
  puntos: { fontSize: 40, lineHeight: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unidad: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.inkSoft },
  marcador: { gap: 6 },
  pista: { height: 13, borderRadius: 2, backgroundColor: colors.paperDeep, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: colors.border },
  barra: { height: '100%', borderRadius: 2, overflow: 'hidden' },
  brillo: { position: 'absolute', left: 0, right: 0, top: 2, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  remate: { position: 'absolute', right: 3, top: 3, bottom: 2, width: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  division: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.paper, opacity: 0.65 },
  diferencia: { fontSize: 12, lineHeight: 16, color: colors.inkSoft },
  pulsada: { opacity: 0.7 },
  pie: { gap: 8, paddingTop: 8 },
  cargando: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  estadoTexto: { fontSize: 14, color: colors.inkSoft },
  error: { paddingVertical: 12, gap: 4 },
  errorTexto: { fontSize: 13, lineHeight: 18, color: colors.stamp },
  reintentar: { flexDirection: 'row', gap: 6, minHeight: 44, alignItems: 'center', alignSelf: 'flex-start' },
  reintentarTexto: { fontSize: 13, fontWeight: '700', color: colors.stamp },
});
