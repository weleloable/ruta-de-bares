import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Card } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { space, typography } from '../../../lib/theme';
import type { Database, RouteBarRow, RouteRow } from '../../../types/database';
import { Casilla } from '../../match/piezas';
import { Paso } from '../../routes/AjustesCana';
import { getRouteWithBars, updateRoute } from '../../routes/api';
import { describirErrorPanel, nombreAccion } from '../acciones';
import { EditorRetos } from '../EditorRetos';

type Regla = Database['public']['Functions']['casas_admin_reglas']['Returns'][number];
type Limites = Pick<RouteRow, 'consumo_minutos' | 'consumo_por_bar' | 'consumo_por_ruta' | 'variedad_max' | 'qr_max' | 'racha_repetible'>;

/** Los mismos rangos que `routes_consumo_check` y `routes_qr_max_check`. */
const LIMITES: { campo: Exclude<keyof Limites, 'racha_repetible'>; etiqueta: string; min: number; max: number; paso: number; unidad?: string }[] = [
  { campo: 'consumo_minutos', etiqueta: 'Espera entre consumiciones', min: 0, max: 240, paso: 5, unidad: 'min' },
  { campo: 'consumo_por_bar', etiqueta: 'Consumiciones que puntúan por bar', min: 0, max: 10, paso: 1 },
  { campo: 'consumo_por_ruta', etiqueta: 'Consumiciones que puntúan por ruta', min: 0, max: 50, paso: 1 },
  { campo: 'variedad_max', etiqueta: 'Bonus de categoría nueva por ruta', min: 0, max: 6, paso: 1 },
  { campo: 'qr_max', etiqueta: 'Encuentros QR que puntúan por persona', min: 0, max: 50, paso: 1 },
];

/**
 * Lo que vale cada accion (para todas las rutas) y, de la ruta elegida, sus
 * limites y sus retos. Cada toque se guarda al momento.
 */
export function Reglas({ rutaId }: { rutaId: string | null }) {
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [ruta, setRuta] = useState<RouteRow | null>(null);
  const [bares, setBares] = useState<RouteBarRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('casas_admin_reglas');
    if (e) setError(describirErrorPanel(e.message));
    else setReglas(data ?? []);
    if (rutaId) {
      const detalle = await getRouteWithBars(rutaId).catch(() => null);
      setRuta(detalle?.route ?? null);
      setBares(detalle?.bars ?? []);
    } else {
      setRuta(null);
      setBares([]);
    }
  }, [rutaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiarRegla(action: string, points: number) {
    setReglas((rs) => rs.map((r) => (r.action === action ? { ...r, points } : r)));
    setOcupado(true);
    const { error: e } = await supabase.rpc('casas_admin_regla', { p_action: action, p_points: points });
    setOcupado(false);
    if (e) {
      setError(describirErrorPanel(e.message));
      await cargar();
    }
  }

  async function cambiarRuta(cambio: Partial<Limites>) {
    if (!ruta) return;
    const previa = ruta;
    setRuta({ ...ruta, ...cambio });
    setOcupado(true);
    try {
      setRuta(await updateRoute(ruta.id, cambio));
    } catch (e) {
      setRuta(previa);
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <View style={styles.raiz}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Card style={styles.tarjeta}>
        <Text style={typography.sectionTitle}>Puntos por acción</Text>
        <Text style={typography.muted}>
          Para todas las rutas. Vale para lo que se consiga a partir de ahora; los podios de minijuegos se recalculan al
          momento.
        </Text>
        {reglas.map((r) => (
          <Paso
            key={r.action}
            etiqueta={r.label || nombreAccion(r.action)}
            valor={`+${r.points}`}
            puedeBajar={!ocupado && r.points > 0}
            puedeSubir={!ocupado && r.points < 1000}
            onBajar={() => void cambiarRegla(r.action, Math.max(0, r.points - 1))}
            onSubir={() => void cambiarRegla(r.action, Math.min(1000, r.points + 1))}
          />
        ))}
      </Card>

      {ruta ? (
        <>
          <Card style={styles.tarjeta}>
            <Text style={typography.sectionTitle}>{`Límites en ${ruta.name}`}</Text>
            {LIMITES.map((l) => {
              const v = ruta[l.campo] ?? 0;
              return (
                <Paso
                  key={l.campo}
                  etiqueta={l.etiqueta}
                  valor={`${v}${l.unidad ? ` ${l.unidad}` : ''}`}
                  puedeBajar={!ocupado && v > l.min}
                  puedeSubir={!ocupado && v < l.max}
                  onBajar={() => void cambiarRuta({ [l.campo]: Math.max(l.min, v - l.paso) })}
                  onSubir={() => void cambiarRuta({ [l.campo]: Math.min(l.max, v + l.paso) })}
                />
              );
            })}
            <Casilla
              marcada={ruta.racha_repetible}
              desactivada={ocupado}
              texto="La racha de casa puede puntuar más de una vez en el mismo bar"
              onCambiar={(m) => void cambiarRuta({ racha_repetible: m })}
            />
          </Card>
          <EditorRetos ruta={ruta} bares={bares} />
        </>
      ) : (
        <Text style={typography.muted}>Elige una ruta para cambiar sus límites y sus retos.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.md },
  tarjeta: { gap: space.sm },
});
