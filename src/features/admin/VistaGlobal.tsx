import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space, typography } from '../../lib/theme';
import { Chips } from '../casas/panel/piezas';
import { filasGlobal, type GlobalRutas } from './actividadExtra';

const TODAS = '__todas';

/**
 * Estadisticas de TODAS las rutas que existen (0059), o de las de una
 * temporada, para compararlas. Solo totales. Las rutas se borran a los pocos
 * dias y con ellas sus numeros: lo que se conserva para siempre es el
 * resultado de las casas (ranking historico).
 */
export function VistaGlobal({
  g,
  temporadas,
  temporada,
  onTemporada,
}: {
  g: GlobalRutas | null;
  temporadas: { id: string; nombre: string }[];
  temporada: string | null;
  onTemporada: (id: string | null) => void;
}) {
  const t = g?.totales;
  const filas = g ? filasGlobal(g) : [];
  return (
    <View style={styles.seccion}>
      {temporadas.length > 0 ? (
        <Chips
          opciones={[{ id: TODAS, texto: 'Todas las temporadas' }, ...temporadas.map((x) => ({ id: x.id, texto: x.nombre }))]}
          elegida={temporada ?? TODAS}
          onElegir={(id) => onTemporada(id === TODAS ? null : id)}
        />
      ) : null}

      {t ? (
        <View style={styles.rejilla}>
          <Baldosa valor={t.rutas} titulo={t.rutas === 1 ? 'Ruta' : 'Rutas'} detalle="que existen ahora" />
          <Baldosa valor={t.personas} titulo="Personas distintas" detalle="repartidas en esas rutas" />
          <Baldosa valor={t.sellos} titulo="Sellos" detalle="en total" />
          <Baldosa valor={t.consumiciones} titulo="Consumiciones" detalle="apuntadas" />
          <Baldosa valor={t.encuentros} titulo="Encuentros QR" detalle="entre parejas" />
          <Baldosa valor={t.retos} titulo="Retos conseguidos" detalle="en total" />
        </View>
      ) : null}

      <Text style={[typography.overline, styles.subtitulo]}>Compara las rutas</Text>
      <View style={styles.tarjeta}>
        {filas.length === 0 ? <Text style={typography.muted}>No hay rutas{temporada ? ' en esta temporada' : ''}.</Text> : null}
        {filas.map((f, i) => (
          <View key={`${i}-${f.nombre}`} style={styles.ruta} accessible accessibilityLabel={`${f.nombre}, ${f.fecha}. ${f.completaron}. ${f.cierre}`}>
            <View style={styles.rutaCabecera}>
              <Text style={styles.rutaNombre} numberOfLines={1}>
                {f.nombre}
              </Text>
              <Text style={styles.rutaFecha}>{f.fecha}</Text>
            </View>
            <View style={styles.pista}>
              <View style={[styles.relleno, { width: `${f.pctSellos}%` }]} />
            </View>
            <Text style={styles.rutaDetalle}>{`${f.completaron} · ${f.consumiciones} consumiciones · ${f.cierre}`}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.nota}>
        Las rutas se borran a los pocos días y sus cifras con ellas. Lo que se conserva es el resultado de las casas: míralo en el ranking histórico.
      </Text>
    </View>
  );
}

function Baldosa({ valor, titulo, detalle }: { valor: number; titulo: string; detalle: string }) {
  return (
    <View style={styles.baldosa} accessible accessibilityLabel={`${titulo}: ${valor}, ${detalle}`}>
      <Text style={styles.cifra}>{valor}</Text>
      <Text style={styles.cifraTitulo}>{titulo}</Text>
      <Text style={styles.cifraDetalle}>{detalle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: { gap: space.sm },
  subtitulo: { marginTop: space.sm },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  baldosa: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: 2,
  },
  cifra: { fontFamily: fonts.title, fontSize: 28, color: colors.ink, fontVariant: ['tabular-nums'] },
  cifraTitulo: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  cifraDetalle: { fontSize: 12, color: colors.inkFaint },
  tarjeta: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  ruta: { gap: 4 },
  rutaCabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  rutaNombre: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.ink },
  rutaFecha: { fontSize: 12, color: colors.inkSoft },
  pista: { height: 8, borderRadius: radius.pill, backgroundColor: colors.paperDeep, overflow: 'hidden' },
  relleno: { height: '100%', backgroundColor: colors.beer },
  rutaDetalle: { fontSize: 12, color: colors.inkSoft },
  nota: { fontSize: 12.5, color: colors.inkFaint },
});
