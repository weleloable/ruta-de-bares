import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors, fonts } from '../../lib/theme';
import { formatearPuntos } from './ranking';
import { reglasInfo, type LimitesRuta } from './reglasInfo';
import { textoCondicion } from './retos';

export type RetoPuntos = {
  id: string; nombre: string; descripcion: string; puntos: number;
  tipo: string; objetivo: number; categoria: string | null; hora_limite: string | null;
};
export type DatosPuntos = { puntos: Record<string, number>; limites: LimitesRuta; retos: RetoPuntos[] };

export function DesplegablePuntos({ abierto, datos, error, onCambiar, onReintentar, retos }: {
  abierto: boolean;
  datos: DatosPuntos | null;
  error: string | null;
  onCambiar: (abierto: boolean) => void;
  onReintentar: () => void;
  retos?: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [espacioArriba, setEspacioArriba] = useState<number | null>(null);
  const boton = useRef<View>(null);

  useEffect(() => {
    if (!abierto || Platform.OS !== 'web') return;
    const cerrar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onCambiar(false);
      (boton.current as unknown as HTMLElement | null)?.focus();
    };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [abierto, onCambiar]);

  return (
    <View style={styles.raiz} onLayout={(e) => setEspacioArriba(Math.max(0, e.nativeEvent.layout.y - 8))}>
      {abierto ? (
        <View testID="puntos-desplegable" style={[styles.panel, { maxHeight: Math.min(520, espacioArriba ?? height * 0.62) }]}>
          <View style={styles.cabecera}>
            <Text accessibilityRole="header" style={styles.titulo}>Cada punto cuenta</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar formas de conseguir puntos" onPress={() => onCambiar(false)} style={styles.icono}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView testID="puntos-scroll" style={styles.scroll} contentContainerStyle={styles.contenido} nestedScrollEnabled>
            {error ? (
              <View accessibilityRole="alert" style={styles.error}>
                <Text style={styles.errorTexto}>{datos ? 'No se pudieron actualizar los valores. Se muestran los últimos disponibles.' : 'No se pudieron cargar los puntos.'}</Text>
                <Pressable accessibilityRole="button" onPress={onReintentar} style={styles.reintentar}>
                  <Ionicons name="refresh-outline" size={17} color={colors.stamp} />
                  <Text style={styles.reintentarTexto}>Reintentar</Text>
                </Pressable>
              </View>
            ) : null}
            {!datos && !error ? <ActivityIndicator accessibilityLabel="Cargando formas de conseguir puntos" color={colors.stamp} style={styles.cargando} /> : null}
            {datos ? <>
              {reglasInfo(datos.puntos, datos.limites).map((regla) => (
                <View key={regla.titulo} style={styles.regla}>
                  <View style={styles.linea}>
                    <Text style={styles.nombre}>{regla.titulo}</Text>
                    {regla.puntos !== null ? <Text style={styles.puntos}>{regla.puntos}</Text> : null}
                  </View>
                  <Text style={styles.descripcion}>{regla.texto}</Text>
                  {regla.titulo === 'Retos' ? datos.retos.map((reto) => (
                    <View key={reto.id} style={styles.reto}>
                      <View style={styles.linea}>
                        <Text style={styles.nombreReto}>{reto.nombre}</Text>
                        <Text style={styles.puntos}>+{formatearPuntos(reto.puntos)}</Text>
                      </View>
                      <Text style={styles.descripcion}>{textoCondicion(reto)}</Text>
                      {reto.descripcion ? <Text style={styles.descripcion}>{reto.descripcion}</Text> : null}
                    </View>
                  )) : null}
                </View>
              ))}
              {retos}
              <Text style={styles.nota}>Los importes corresponden a la configuración actual. Las opciones sin alcohol puntúan igual.</Text>
            </> : null}
          </ScrollView>
        </View>
      ) : null}
      <Pressable
        ref={boton}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        accessibilityLabel="Cómo conseguir puntos"
        onPress={() => onCambiar(!abierto)}
        style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.stamp} />
        <Text style={styles.botonTexto}>Cómo conseguir puntos</Text>
        <Ionicons name={abierto ? 'chevron-down' : 'chevron-up'} size={17} color={colors.inkSoft} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { zIndex: 2, paddingHorizontal: 20, marginBottom: 24, maxWidth: 760, alignSelf: 'center', width: '100%' },
  panel: { position: 'absolute', bottom: '100%', left: 20, right: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, borderTopWidth: 3, borderTopColor: colors.stamp, borderRadius: 4, overflow: 'hidden' },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  titulo: { flex: 1, fontFamily: fonts.title, fontSize: 21, color: colors.ink, paddingVertical: 12 },
  icono: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  contenido: { paddingHorizontal: 16, paddingBottom: 16 },
  regla: { paddingVertical: 14, gap: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  linea: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 4, justifyContent: 'space-between' },
  nombre: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  puntos: { fontSize: 17, fontWeight: '800', color: colors.stamp, fontVariant: ['tabular-nums'] },
  descripcion: { fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  reto: { marginTop: 10, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.borderStrong, gap: 4 },
  nombreReto: { fontSize: 14, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  nota: { paddingTop: 16, fontSize: 12, lineHeight: 18, color: colors.inkSoft },
  boton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.borderStrong },
  botonTexto: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  pulsado: { opacity: 0.7 },
  error: { paddingVertical: 12 },
  errorTexto: { fontSize: 13, lineHeight: 19, color: colors.stamp },
  reintentar: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  reintentarTexto: { color: colors.stamp, fontSize: 14, fontWeight: '700' },
  cargando: { paddingVertical: 24 },
});
