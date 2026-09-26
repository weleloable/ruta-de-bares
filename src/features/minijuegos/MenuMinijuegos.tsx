import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, Screen } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import { feedback } from './feedback';
import { JUEGOS } from './juegos';
import { cargarRecords, registrarPuntuacion } from './records';
import type { Records } from './recordsReglas';
import type { JuegoDef, ResultadoJuego } from './tipos';

/**
 * Menu de la pestana Juegos: lista los juegos con su record y, al elegir uno,
 * lo monta a pantalla completa. El juego solo conoce `onFinish`; el guardado
 * del record vive aqui para que ningun juego dependa del almacen.
 */
export function MenuMinijuegos() {
  const [records, setRecords] = useState<Records>({});
  const [activo, setActivo] = useState<JuegoDef | null>(null);
  const [ultimo, setUltimo] = useState<{ resultado: ResultadoJuego; esRecord: boolean } | null>(null);

  const abrir = useCallback(async (juego: JuegoDef) => {
    // Se relee el record al abrir: es lo que enseñara la pantalla de resultado.
    setRecords(await cargarRecords());
    setUltimo(null);
    setActivo(juego);
  }, []);

  const terminar = useCallback(async (resultado: ResultadoJuego) => {
    const esRecord = await registrarPuntuacion(resultado.juego, resultado.puntuacion);
    if (esRecord) feedback.record();
    setRecords(await cargarRecords());
    setUltimo({ resultado, esRecord });
  }, []);

  const salir = useCallback(async () => {
    setActivo(null);
    setUltimo(null);
    setRecords(await cargarRecords());
  }, []);

  if (activo) {
    const Juego = activo.Componente;
    return (
      <Screen>
        <View style={styles.cabecera}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Salir del juego"
            onPress={salir}
            hitSlop={12}
            style={styles.salir}
          >
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={typography.sectionTitle}>{activo.titulo}</Text>
        </View>

        {ultimo ? (
          <Card style={styles.resultado}>
            <Text style={typography.overline}>{ultimo.esRecord ? '¡Nuevo récord!' : 'Fin de la partida'}</Text>
            <Text style={styles.puntos}>{ultimo.resultado.puntuacion}</Text>
            <Text style={typography.muted}>Tu récord: {records[activo.id] ?? 0}</Text>
            <Button title="Otra vez" onPress={() => setUltimo(null)} />
            <Button title="Salir" variant="secondary" onPress={salir} />
          </Card>
        ) : (
          // Mientras se ve el resultado el juego esta desmontado, asi que
          // "Otra vez" lo monta de nuevo y la partida empieza desde cero.
          <Juego onFinish={terminar} />
        )}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={typography.muted}>Partidas de un minuto para el rato entre bar y bar.</Text>
      {JUEGOS.length === 0 ? (
        <EmptyState title="Muy pronto" body="Estamos sirviendo los primeros juegos." />
      ) : (
        JUEGOS.map((juego) => (
          <Pressable
            key={juego.id}
            accessibilityRole="button"
            accessibilityLabel={`Jugar a ${juego.titulo}`}
            onPress={() => abrir(juego)}
            style={({ pressed }) => pressed && styles.pulsado}
          >
            <Card style={styles.fila}>
              <View style={styles.icono}>
                <Ionicons name={juego.icono} size={30} color={colors.beerDark} />
              </View>
              <View style={styles.textos}>
                <Text style={typography.cardTitle}>{juego.titulo}</Text>
                <Text style={typography.muted}>{juego.descripcion}</Text>
                {records[juego.id] !== undefined ? (
                  <Text style={styles.record}>Récord: {records[juego.id]}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.inkFaint} />
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  salir: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  resultado: { alignItems: 'center' },
  puntos: { fontSize: 64, fontWeight: '800', color: colors.beerDark },
  fila: { flexDirection: 'row', alignItems: 'center', minHeight: 88 },
  pulsado: { opacity: 0.85 },
  icono: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.beerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1, gap: 2 },
  record: { fontSize: 13, fontWeight: '700', color: colors.beerDark },
});
