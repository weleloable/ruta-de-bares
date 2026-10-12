import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, radius, space, typography } from '../../lib/theme';
import { useSondeo } from '../../lib/useSondeo';
import { CASAS, esCasa, ORDEN_CASAS } from './casas';
import { Escudo } from './Escudo';
import { destacadas, origenes, origenPrincipal, type Destacada, type FilaEstadistica, type Origen } from './datosEstadisticas';
import { formatearPuntos } from './ranking';

/** Un color por origen de los puntos (la leyenda dice cual es cual). */
const COLOR_ORIGEN: Record<Origen['id'], string> = {
  sellos: '#A82C24',
  consumo: '#C67A1E',
  juegos: '#2F6B4F',
  social: '#3B6EA8',
  otros: '#8A7A68',
};

/**
 * Estadisticas de las casas en la ruta (0057): quien destaca en que, siempre
 * por persona, y de donde saca cada casa sus puntos. Va en la pestana Casas,
 * debajo de la tabla.
 */
export function EstadisticasCasas({ rutaId }: { rutaId: string }) {
  const [filas, setFilas] = useState<FilaEstadistica[] | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('casas_estadisticas', { p_route_id: rutaId });
    // Sin la 0057 no existe la funcion: se calla (la pestana sigue valiendo sin esto).
    if (error || !data) return;
    setFilas(
      data
        .filter((f) => esCasa(f.house))
        .map((f) => ({
          ...f,
          p_sellos: Number(f.p_sellos),
          p_consumo: Number(f.p_consumo),
          p_juegos: Number(f.p_juegos),
          p_social: Number(f.p_social),
          p_otros: Number(f.p_otros),
        })),
    );
  }, [rutaId]);

  useEffect(() => {
    setFilas(null);
    void cargar();
  }, [cargar]);
  useSondeo(cargar, 30_000);

  return <PanelEstadisticas filas={filas} />;
}

/** El panel en si, a partir de las filas del servidor (se puede ensenar solo). */
export function PanelEstadisticas({ filas }: { filas: FilaEstadistica[] | null }) {
  if (!filas) return null;
  const hayPuntos = filas.some((f) => origenes(f).some((o) => o.puntos > 0) || f.sellos > 0 || f.consumiciones > 0);
  if (!hayPuntos) return null;

  const ordenadas = [...filas].sort((a, b) => ORDEN_CASAS.indexOf(a.house as never) - ORDEN_CASAS.indexOf(b.house as never));
  return (
    <View style={styles.raiz}>
      <Card style={styles.tarjeta}>
        <Text style={typography.sectionTitle}>Quién destaca</Text>
        <Text style={typography.muted}>Siempre en proporción a la gente de cada casa, para que ser más no sea ventaja.</Text>
        {destacadas(filas).map((d) => (
          <Destacado key={d.id} d={d} />
        ))}
      </Card>

      <Card style={styles.tarjeta}>
        <Text style={typography.sectionTitle}>De dónde sacan los puntos</Text>
        {ordenadas.map((f) => (
          <OrigenCasa key={f.house} fila={f} />
        ))}
        <View style={styles.leyenda}>
          {(['sellos', 'consumo', 'juegos', 'social', 'otros'] as const).map((id) => (
            <View key={id} style={styles.leyendaItem}>
              <View style={[styles.cuadro, { backgroundColor: COLOR_ORIGEN[id] }]} />
              <Text style={styles.leyendaTexto}>{origenes(ordenadas[0]!).find((o) => o.id === id)?.nombre}</Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

function Destacado({ d }: { d: Destacada }) {
  const casas = d.casas.filter(esCasa);
  return (
    <View style={styles.destacado}>
      <Text style={styles.icono}>{d.icono}</Text>
      <View style={styles.destTextos}>
        <Text style={styles.destTitulo}>{d.titulo}</Text>
        <Text style={styles.destExplica}>{d.explicacion}</Text>
      </View>
      {casas.length > 0 && d.valor !== null ? (
        <View style={styles.ganadora}>
          <View style={styles.escudos}>
            {casas.map((c) => (
              <Escudo key={c} casa={c} tamano={26} />
            ))}
          </View>
          <Text style={styles.ganadoraNombre} numberOfLines={1}>
            {casas.map((c) => CASAS[c].nombre).join(' y ')}
          </Text>
          <Text style={styles.ganadoraValor}>{`${formatearPuntos(d.valor)} ${d.unidad}`}</Text>
        </View>
      ) : (
        <Text style={styles.nadie}>Aún nadie</Text>
      )}
    </View>
  );
}

function OrigenCasa({ fila }: { fila: FilaEstadistica }) {
  if (!esCasa(fila.house)) return null;
  const c = CASAS[fila.house];
  const lista = origenes(fila);
  const total = lista.reduce((s, o) => s + Math.max(0, o.puntos), 0);
  const principal = origenPrincipal(fila);
  return (
    <View style={styles.origenCasa}>
      <View style={styles.origenCabecera}>
        <Escudo casa={fila.house} tamano={24} />
        <Text style={styles.origenNombre}>{c.nombre}</Text>
        <Text style={styles.origenResumen} numberOfLines={1}>
          {principal && total > 0 ? `Sobre todo ${principal.nombre.toLowerCase()} (${Math.round((100 * principal.puntos) / total)}%)` : 'Sin puntos aún'}
        </Text>
      </View>
      <View style={styles.pista} accessibilityLabel={`${c.nombre}: ${lista.map((o) => `${o.nombre} ${formatearPuntos(o.puntos)}`).join(', ')}`}>
        {total > 0
          ? lista
              .filter((o) => o.puntos > 0)
              .map((o) => <View key={o.id} style={{ flex: o.puntos, backgroundColor: COLOR_ORIGEN[o.id] }} />)
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.lg },
  tarjeta: { gap: space.md },
  destacado: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icono: { fontSize: 26, width: 34, textAlign: 'center' },
  destTextos: { flex: 1, gap: 1 },
  destTitulo: { fontSize: 15, fontWeight: '800', color: colors.ink },
  destExplica: { fontSize: 11, color: colors.inkSoft },
  ganadora: { alignItems: 'center', gap: 1, maxWidth: 130 },
  escudos: { flexDirection: 'row', gap: 2 },
  ganadoraNombre: { fontSize: 12, fontWeight: '800', color: colors.ink },
  ganadoraValor: { fontSize: 10, color: colors.inkSoft, textAlign: 'center' },
  nadie: { fontSize: 12, color: colors.inkFaint },
  origenCasa: { gap: 4 },
  origenCabecera: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  origenNombre: { fontSize: 14, fontWeight: '800', color: colors.ink },
  origenResumen: { flex: 1, fontSize: 11, color: colors.inkSoft, textAlign: 'right' },
  pista: { flexDirection: 'row', height: 12, borderRadius: radius.pill, backgroundColor: colors.paperDeep, overflow: 'hidden' },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cuadro: { width: 10, height: 10, borderRadius: 2 },
  leyendaTexto: { fontSize: 11, color: colors.inkSoft },
});
