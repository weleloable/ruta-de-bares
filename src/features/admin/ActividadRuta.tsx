import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space, typography } from '../../lib/theme';
import { CASAS, esCasa } from '../casas/casas';
import { Escudo } from '../casas/Escudo';
import {
  filasBares,
  filasHoras,
  filasJuegos,
  filasParticipacion,
  filasRetos,
  resumenConsumo,
  type ActividadRuta,
} from './actividad';
import { repartoCasas, resumenAuditoria, type AuditoriaRuta, type CasaDatos } from './actividadExtra';
import { formatearNota } from '../minijuegos/nota';

export type SeccionActividad = 'participacion' | 'bares' | 'actividad' | 'juegos' | 'casas' | 'auditoria';

/**
 * Las secciones nuevas de Estadisticas (0058). Todo son totales de la ruta,
 * nunca nada por persona. Las barras son Views: sin librerias de graficos.
 */
export function SeccionesActividad({
  a,
  seccion,
  casas = null,
  auditoria = null,
}: {
  a: ActividadRuta;
  seccion: SeccionActividad;
  casas?: CasaDatos[] | null;
  auditoria?: AuditoriaRuta | null;
}) {
  if (seccion === 'casas') return <Casas casas={casas} />;
  if (seccion === 'auditoria') return <Auditoria a={auditoria} />;
  if (seccion === 'participacion') return <Participacion a={a} />;
  if (seccion === 'bares') return <Bares a={a} />;
  if (seccion === 'actividad') return <Actividad a={a} />;
  return <Juegos a={a} />;
}

function Casas({ casas }: { casas: CasaDatos[] | null }) {
  if (!casas) return <Text style={typography.muted}>No se pudo leer el reparto de las casas.</Text>;
  const r = repartoCasas(casas);
  return (
    <View style={styles.seccion}>
      <Text style={typography.overline}>Personas por casa</Text>
      <View style={styles.tarjeta}>
        {r.filas.map((f) => (
          <View key={f.house} style={styles.casaFila}>
            {esCasa(f.house) ? <Escudo casa={f.house} tamano={22} /> : null}
            <View style={styles.casaCuerpo}>
              <View style={styles.barraCabecera}>
                <Text style={styles.barraEtiqueta}>{f.nombre}</Text>
                <Text style={styles.barraValor}>{`${f.miembros} · ${f.pctGente} %`}</Text>
              </View>
              <View style={styles.barraPista}>
                <View
                  style={[
                    styles.barraRelleno,
                    { width: `${f.pctGente}%`, backgroundColor: esCasa(f.house) ? CASAS[f.house].color : colors.beer },
                  ]}
                />
              </View>
            </View>
          </View>
        ))}
        <Text style={typography.muted}>{r.equilibrio}</Text>
      </View>

      <Text style={[typography.overline, styles.subtitulo]}>Puntos por casa</Text>
      <View style={styles.tarjeta}>
        {[...r.filas]
          .sort((x, y) => y.puntos - x.puntos)
          .map((f) => (
            <Barra key={f.house} etiqueta={f.nombre} valor={`${f.puntos} · ${f.pctPuntos} %`} pct={f.pctPuntos} />
          ))}
        <Text style={typography.muted}>El detalle de cada casa está en Mi perfil → Casas y puntuaciones.</Text>
      </View>
    </View>
  );
}

function Auditoria({ a }: { a: AuditoriaRuta | null }) {
  if (!a) return <Text style={typography.muted}>No se pudo leer la auditoría de la ruta.</Text>;
  const r = resumenAuditoria(a);
  return (
    <View style={styles.seccion}>
      <Text style={typography.overline}>Lo que se ha tocado a mano</Text>
      <View style={styles.tarjeta}>
        <Text style={typography.body}>{r.anulados}</Text>
        <Text style={typography.body}>{r.ajustes}</Text>
        <Text style={typography.body}>{r.cambios}</Text>
        {!r.hayAlgo ? <Text style={typography.muted}>Nada tocado a mano en esta ruta.</Text> : null}
      </View>
      {r.motivos.length > 0 ? (
        <>
          <Text style={[typography.overline, styles.subtitulo]}>Motivos de anulación más repetidos</Text>
          <View style={styles.tarjeta}>
            {r.motivos.map((m) => (
              <View key={m.motivo} style={styles.reto}>
                <Text style={styles.retoNombre}>{m.motivo}</Text>
                <Text style={styles.retoTexto}>{`×${m.n}`}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.nota}>Los motivos son lo que escribió quien administra. El detalle movimiento a movimiento está en Casas y puntuaciones.</Text>
    </View>
  );
}

function Participacion({ a }: { a: ActividadRuta }) {
  const filas = filasParticipacion(a);
  return (
    <View style={styles.seccion}>
      <Text style={typography.overline}>Quién ha usado qué</Text>
      <View style={styles.tarjeta}>
        <Text style={typography.muted}>{`De ${a.participacion.personas} ${a.participacion.personas === 1 ? 'persona' : 'personas'} en la ruta.`}</Text>
        {filas.map((f) => (
          <Barra key={f.id} etiqueta={f.titulo} valor={`${f.valor} · ${f.pct} %`} pct={f.pct} />
        ))}
      </View>
      <View style={styles.tarjeta}>
        <Text style={styles.cifra}>{a.participacion.activos_30min}</Text>
        <Text style={styles.cifraTitulo}>Activas ahora</Text>
        <Text style={styles.cifraDetalle}>con un sello, una consumición o un encuentro en los últimos 30 minutos</Text>
      </View>
    </View>
  );
}

function Bares({ a }: { a: ActividadRuta }) {
  const { filas, resumen } = filasBares(a);
  return (
    <View style={styles.seccion}>
      <Text style={typography.overline}>Sellos por bar</Text>
      <View style={styles.tarjeta}>
        {filas.length === 0 ? <Text style={typography.muted}>La ruta no tiene bares.</Text> : null}
        {filas.map((f, i) => (
          <Barra key={`${i}-${f.nombre}`} etiqueta={`${i + 1}. ${f.nombre}`} valor={String(f.sellos)} pct={f.pct} />
        ))}
      </View>
      {resumen.length > 0 ? (
        <View style={styles.tarjeta}>
          {resumen.map((t) => (
            <Text key={t} style={typography.body}>
              {t}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Actividad({ a }: { a: ActividadRuta }) {
  const horas = filasHoras(a);
  const c = resumenConsumo(a);
  return (
    <>
      <View style={styles.seccion}>
        <Text style={typography.overline}>Sellos por hora</Text>
        <View style={styles.tarjeta}>
          {horas.length === 0 ? (
            <Text style={typography.muted}>Todavía no hay sellos.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grafico}>
              {horas.map((h) => (
                <View key={h.etiqueta} style={styles.columna} accessible accessibilityLabel={`${h.etiqueta}: ${h.sellos} sellos`}>
                  <Text style={styles.columnaValor}>{h.sellos}</Text>
                  <View style={styles.columnaPista}>
                    <View style={[styles.columnaRelleno, { height: `${Math.max(h.pct, h.sellos > 0 ? 4 : 0)}%` }, h.pico && styles.columnaPico]} />
                  </View>
                  <Text style={styles.columnaHora}>{h.etiqueta}</Text>
                </View>
              ))}
            </ScrollView>
          )}
          {horas.some((h) => h.pico) ? <Text style={typography.muted}>El pico, en rojo.</Text> : null}
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={typography.overline}>Consumiciones</Text>
        <View style={styles.rejilla}>
          <Baldosa valor={c.total} titulo="Apuntadas" detalle={`${c.media} por persona que apunta`} />
          <Baldosa valor={`${c.sinAlcoholPct} %`} titulo="Sin alcohol" detalle="del total" />
          <Baldosa valor={`${c.puntuanPct} %`} titulo="Puntúan" detalle={`${c.sinPuntos} sin puntos por los topes`} />
        </View>
        <View style={styles.tarjeta}>
          {c.categorias.map((k) => (
            <Barra key={k.id} etiqueta={k.nombre} valor={`${k.n} · ${k.pct} %`} pct={k.pct} />
          ))}
        </View>
        <Text style={styles.nota}>Solo el total de la ruta por categoría: nada dice quién bebió qué.</Text>
      </View>
    </>
  );
}

function Juegos({ a }: { a: ActividadRuta }) {
  const juegos = filasJuegos(a);
  const retos = filasRetos(a);
  return (
    <>
      <View style={styles.seccion}>
        <Text style={typography.overline}>Minijuegos</Text>
        <View style={styles.tarjeta}>
          {juegos.length === 0 ? <Text style={typography.muted}>Nadie ha jugado todavía.</Text> : null}
          {juegos.map((j) => (
            <Barra
              key={j.nombre}
              etiqueta={j.nombre}
              valor={`${j.jugadores} ${j.jugadores === 1 ? 'jugador' : 'jugadores'}${j.mejor !== null ? ` · mejor ${formatearNota(j.juego, j.mejor)}` : ''}`}
              pct={j.pct}
            />
          ))}
          <Text style={typography.muted}>Solo se guarda la mejor nota de cada persona, no cuántas partidas.</Text>
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={typography.overline}>Retos</Text>
        <View style={styles.tarjeta}>
          {retos.length === 0 ? <Text style={typography.muted}>Esta ruta no tiene retos.</Text> : null}
          {retos.map((r) => (
            <View key={r.nombre} style={styles.reto}>
              <Text style={[styles.retoNombre, !r.activo && styles.apagado]} numberOfLines={1}>
                {r.nombre}
                {r.activo ? '' : ' (desactivado)'}
              </Text>
              <Text style={[styles.retoTexto, r.sinNadie && styles.aviso]}>{r.sinNadie ? 'Nadie aún' : r.texto}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.seccion}>
        <Text style={typography.overline}>Encuentros por QR</Text>
        <View style={styles.rejilla}>
          <Baldosa valor={a.qr.encuentros} titulo="Encuentros" detalle="parejas distintas" />
          <Baldosa valor={a.qr.puntuan} titulo="Puntúan" detalle={`${a.qr.encuentros - a.qr.puntuan} topados`} />
        </View>
      </View>
    </>
  );
}

function Barra({ etiqueta, valor, pct }: { etiqueta: string; valor: string; pct: number }) {
  return (
    <View style={styles.barraFila} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <View style={styles.barraCabecera}>
        <Text style={styles.barraEtiqueta} numberOfLines={1}>
          {etiqueta}
        </Text>
        <Text style={styles.barraValor}>{valor}</Text>
      </View>
      <View style={styles.barraPista}>
        <View style={[styles.barraRelleno, { width: `${Math.min(100, Math.max(0, pct))}%` }]} />
      </View>
    </View>
  );
}

function Baldosa({ valor, titulo, detalle }: { valor: number | string; titulo: string; detalle: string }) {
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
  casaFila: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  casaCuerpo: { flex: 1, gap: 3 },
  tarjeta: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
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
  nota: { fontSize: 12.5, color: colors.inkFaint },
  barraFila: { gap: 3 },
  barraCabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  barraEtiqueta: { flex: 1, fontSize: 14, color: colors.ink },
  barraValor: { fontSize: 13, fontWeight: '700', color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  barraPista: { height: 8, borderRadius: radius.pill, backgroundColor: colors.paperDeep, overflow: 'hidden' },
  barraRelleno: { height: '100%', backgroundColor: colors.beer },
  grafico: { alignItems: 'flex-end', gap: space.sm, paddingVertical: space.xs },
  columna: { width: 38, alignItems: 'center', gap: 2 },
  columnaValor: { fontSize: 11, fontWeight: '700', color: colors.inkSoft },
  columnaPista: { height: 90, width: 22, justifyContent: 'flex-end', backgroundColor: colors.paperDeep, borderRadius: 4, overflow: 'hidden' },
  columnaRelleno: { width: '100%', backgroundColor: colors.beer },
  columnaPico: { backgroundColor: colors.stamp },
  columnaHora: { fontSize: 10, color: colors.inkFaint },
  reto: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  retoNombre: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  retoTexto: { fontSize: 13, color: colors.inkSoft },
  aviso: { color: colors.stamp, fontWeight: '700' },
  apagado: { color: colors.inkFaint },
});
