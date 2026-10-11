import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { space, typography } from '../../../lib/theme';
import type { RouteRow } from '../../../types/database';
import { getRouteWithBars, updateRoute } from '../../routes/api';
import { describirErrorPanel } from '../acciones';
import { titularGanadoras } from '../GanadoraRuta';
import { Podio, type PuestoCasa } from '../Podio';
import { Chips } from './piezas';

type Temporada = { id: string; nombre: string };
type Resultado = { ganadoras: string[]; resultado: PuestoCasa[]; cerrada_at: string } | null;
const SIN = '__sin';

/**
 * Cerrar la ruta (guarda el resultado para el historico y ensena la ganadora),
 * reabrirla, reiniciarla (anula todos sus puntos con motivo) y temporadas.
 */
export function Cierre({ rutaId }: { rutaId: string | null }) {
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [nueva, setNueva] = useState('');
  const [ruta, setRuta] = useState<RouteRow | null>(null);
  const [resultado, setResultado] = useState<Resultado>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('temporadas').select('id, nombre').order('created_at', { ascending: false });
    setTemporadas(data ?? []);
    if (!rutaId) {
      setRuta(null);
      setResultado(null);
      return;
    }
    const detalle = await getRouteWithBars(rutaId).catch(() => null);
    setRuta(detalle?.route ?? null);
    const { data: r, error: e } = await supabase.rpc('casas_resultado', { p_route_id: rutaId });
    if (e) setError(/PGRST202|Could not find/i.test(e.message) ? 'Falta aplicar la migración 0049 en Supabase.' : e.message);
    setResultado((r as Resultado) ?? null);
  }, [rutaId]);

  useEffect(() => {
    setAviso(null);
    void cargar();
  }, [cargar]);

  async function hacer(accion: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setOcupado(true);
    setError(null);
    const { error: e } = await accion();
    setOcupado(false);
    if (e) return setError(describirErrorPanel(e.message));
    setAviso(ok);
    await cargar();
  }

  async function crearTemporada() {
    if (!nueva.trim()) return;
    await hacer(() => supabase.from('temporadas').insert({ nombre: nueva.trim() }), `Temporada «${nueva.trim()}» creada.`);
    setNueva('');
  }

  async function ponerTemporada(id: string) {
    if (!ruta) return;
    try {
      setRuta(await updateRoute(ruta.id, { temporada_id: id === SIN ? null : id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  }

  return (
    <View style={styles.raiz}>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {aviso ? <Banner tone="success">{aviso}</Banner> : null}

      {ruta ? (
        <Card style={styles.tarjeta}>
          <Text style={typography.sectionTitle}>{ruta.name}</Text>
          {resultado ? (
            <>
              <Text style={typography.muted}>
                {`Cerrada el ${new Date(resultado.cerrada_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}. ${titularGanadoras(resultado.ganadoras)}`}
              </Text>
              <Podio resultado={resultado.resultado} tamano={0.7} />
              <View style={styles.acciones}>
                <Button
                  title="Reabrir"
                  variant="ghost"
                  disabled={ocupado}
                  onPress={() => void hacer(() => supabase.rpc('casas_reabrir_ruta', { p_route_id: ruta.id }), 'Ruta reabierta.')}
                />
                <Button
                  title="Volver a cerrar"
                  variant="secondary"
                  loading={ocupado}
                  onPress={() => void hacer(() => supabase.rpc('casas_cerrar_ruta', { p_route_id: ruta.id }), 'Resultado actualizado.')}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={typography.muted}>
                Al cerrarla se guarda el resultado de las casas para el histórico (aunque la ruta se borre luego) y quien
                estuvo en ella ve la pantalla de la casa ganadora.
              </Text>
              <Button
                title="Cerrar la ruta y proclamar ganadora"
                icon="trophy-outline"
                loading={ocupado}
                onPress={() => void hacer(() => supabase.rpc('casas_cerrar_ruta', { p_route_id: ruta.id }), '¡Ruta cerrada!')}
              />
            </>
          )}

          <Text style={typography.overline}>Temporada</Text>
          <Chips
            opciones={[{ id: SIN, texto: 'Sin temporada' }, ...temporadas.map((t) => ({ id: t.id, texto: t.nombre }))]}
            elegida={ruta.temporada_id ?? SIN}
            onElegir={(id) => void ponerTemporada(id)}
          />

          {reiniciando ? (
            <View style={styles.reinicio}>
              <Text style={typography.muted}>
                Se anulan TODOS los puntos de esta ruta (quedan en el historial, tachados, con el motivo) y se reabre.
              </Text>
              <Field label="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Por qué se reinicia" />
              <View style={styles.acciones}>
                <Button title="Cancelar" variant="ghost" onPress={() => setReiniciando(false)} />
                <Button
                  title="Anular todos los puntos"
                  loading={ocupado}
                  onPress={() =>
                    void hacer(
                      () => supabase.rpc('casas_admin_anular_ruta', { p_route_id: ruta.id, p_motivo: motivo }),
                      'Puntos de la ruta anulados.',
                    ).then(() => {
                      setReiniciando(false);
                      setMotivo('');
                    })
                  }
                />
              </View>
            </View>
          ) : (
            <Button title="Reiniciar puntos de la ruta" variant="ghost" icon="refresh-outline" onPress={() => setReiniciando(true)} />
          )}
        </Card>
      ) : (
        <Text style={typography.muted}>Elige una ruta para cerrarla, reabrirla o ponerle temporada.</Text>
      )}

      <Card style={styles.tarjeta}>
        <Text style={typography.sectionTitle}>Temporadas</Text>
        <Text style={typography.muted}>Un grupo de rutas. El histórico se puede ver entero o por temporada.</Text>
        {temporadas.map((t) => (
          <Text key={t.id} style={typography.body}>{`• ${t.nombre}`}</Text>
        ))}
        <Field label="Nueva temporada" value={nueva} onChangeText={setNueva} maxLength={60} placeholder="Otoño 2026" />
        <Button title="Crear temporada" variant="secondary" disabled={!nueva.trim() || ocupado} onPress={() => void crearTemporada()} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.md },
  tarjeta: { gap: space.sm },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, flexWrap: 'wrap' },
  reinicio: { gap: space.sm },
});
