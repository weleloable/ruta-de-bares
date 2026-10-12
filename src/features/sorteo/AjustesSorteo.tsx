import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import type { RouteRow } from '../../types/database';
import { Casilla } from '../match/piezas';
import { updateRoute } from '../routes/api';
import { leerEstadoSorteo, realizarSorteo } from './api';
import { PersonasSorteo } from './PersonasSorteo';
import { RuletaSorteo } from './RuletaSorteo';
import type { EstadoSorteo, ResultadoSorteo } from './sorteo';

/**
 * El sorteo de la ruta en el editor (0061): activarlo, escribir el premio y,
 * cuando acabe la ruta, hacerlo con la ruleta. Entra quien ha sellado todos los
 * bares (admins incluidos), menos quien pidio no participar (0063, "Quién
 * participa"). Repetirlo pide un motivo, que queda registrado.
 */
export function AjustesSorteo({ ruta }: { ruta: RouteRow }) {
  const [activo, setActivo] = useState(ruta.sorteo_activo ?? false);
  const [premio, setPremio] = useState(ruta.sorteo_premio ?? '');
  const [estado, setEstado] = useState<EstadoSorteo | null>(null);
  const [resultado, setResultado] = useState<ResultadoSorteo | null>(null);
  const [repitiendo, setRepitiendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado(await leerEstadoSorteo(ruta.id));
  }, [ruta.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(cambio: Partial<Pick<RouteRow, 'sorteo_activo' | 'sorteo_premio'>>) {
    setError(null);
    try {
      await updateRoute(ruta.id, cambio);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el sorteo.');
    }
  }

  async function sortear(conMotivo?: string) {
    setOcupado(true);
    setError(null);
    try {
      setResultado(await realizarSorteo(ruta.id, conMotivo));
      setRepitiendo(false);
      setMotivo('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer el sorteo.');
    } finally {
      setOcupado(false);
    }
  }

  const hecho = estado?.resultado ?? null;
  return (
    <Card style={styles.tarjeta}>
      <Text style={typography.sectionTitle}>Sorteo</Text>
      <Text style={typography.muted}>
        Entra quien selle todos los bares de la ruta (también los admins). En Sellos sale un aviso con el premio.
      </Text>
      <Casilla
        marcada={activo}
        texto="Hay sorteo en esta ruta"
        onCambiar={(m) => {
          setActivo(m);
          void guardar({ sorteo_activo: m });
        }}
      />
      {activo ? (
        <Field
          label="Premio"
          value={premio}
          maxLength={60}
          onChangeText={setPremio}
          onBlur={() => void guardar({ sorteo_premio: premio.trim() })}
          placeholder="una camiseta"
          hint="Se lee como «Sorteamos una camiseta»."
        />
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {activo && estado ? (
        <Text style={typography.body}>
          {`${estado.participantes} ${estado.participantes === 1 ? 'persona ha' : 'personas han'} sellado todos los bares y ${estado.participantes === 1 ? 'entra' : 'entran'} en el sorteo.`}
        </Text>
      ) : null}

      {hecho ? (
        <View style={styles.resultado}>
          <Text style={typography.body}>{`🎉 Ganó ${hecho.ganador ?? '—'}${hecho.suplentes.length > 0 ? ` · suplentes: ${hecho.suplentes.join(', ')}` : ''}.`}</Text>
          {repitiendo ? (
            <>
              <Field label="Motivo para repetirlo" value={motivo} onChangeText={setMotivo} placeholder="El ganador no estaba" />
              <View style={styles.acciones}>
                <Button title="Cancelar" variant="ghost" onPress={() => setRepitiendo(false)} />
                <Button title="Repetir el sorteo" loading={ocupado} onPress={() => void sortear(motivo)} />
              </View>
            </>
          ) : (
            <Button title="Repetir el sorteo" variant="ghost" onPress={() => setRepitiendo(true)} />
          )}
        </View>
      ) : activo ? (
        <Button
          title="Hacer el sorteo"
          icon="gift-outline"
          loading={ocupado}
          disabled={!estado || estado.participantes === 0}
          onPress={() => void sortear()}
        />
      ) : null}

      {activo ? <PersonasSorteo routeId={ruta.id} onCambio={() => void cargar()} /> : null}

      <RuletaSorteo
        resultado={resultado}
        premio={premio}
        onCerrar={() => {
          setResultado(null);
          void cargar();
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  tarjeta: { gap: space.sm },
  resultado: { gap: space.sm },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
