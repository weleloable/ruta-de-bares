import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, EmptyState, Screen } from '../../components/ui';
import { useBloqueoRecarga } from '../../lib/bloqueoRecarga';
import { colors, radius, space, typography } from '../../lib/theme';
import { feedback } from './feedback';
import { JUEGOS } from './juegos';
import { ListaCervezas } from './ListaCervezas';
import { Ranking } from './Ranking';
import { formatearNota } from './nota';
import { cargarRecords, registrarPuntuacion } from './records';
import type { Records } from './recordsReglas';
import type { JuegoDef, ResultadoJuego } from './tipos';

type Vista = 'juego' | 'ranking' | 'cervezas';

/**
 * Menu de la pestana Juegos: lista los juegos con su record y, al elegir uno,
 * lo monta a pantalla completa. El juego solo conoce `onFinish`; el guardado
 * del record vive aqui para que ningun juego dependa del almacen.
 *
 * `rutaId` es la ruta en la que se juega: con ella, el resultado se guarda
 * tambien en el servidor (ranking y cervezas, solo visibles dentro de esa ruta).
 * Sin ella (pruebas en local, sin cuenta) todo sigue funcionando pero solo con
 * el record de este dispositivo.
 */
export function MenuMinijuegos({ rutaId, nombreRuta }: { rutaId: string | null; nombreRuta?: string }) {
  const [records, setRecords] = useState<Records>({});
  const [activo, setActivo] = useState<JuegoDef | null>(null);
  const [vista, setVista] = useState<Vista>('juego');
  const [ultimo, setUltimo] = useState<{ resultado: ResultadoJuego; esRecord: boolean } | null>(null);
  // Resultado de guardar en la ruta: null = sin novedad, texto = lo que se le dice a la persona.
  const [guardado, setGuardado] = useState<{ tono: 'success' | 'error'; texto: string } | null>(null);

  // Con una partida en marcha, una version nueva no recarga la app al volver del
  // segundo plano (lib/versionApp.ts): se perderia la partida.
  useBloqueoRecarga(activo !== null && vista === 'juego' && ultimo === null);

  const abrir = useCallback(async (juego: JuegoDef, v: Vista = 'juego') => {
    // Se relee el record al abrir: es lo que enseñara la pantalla de resultado.
    setRecords(await cargarRecords());
    setUltimo(null);
    setGuardado(null);
    setVista(v);
    setActivo(juego);
  }, []);

  const terminar = useCallback(
    async (resultado: ResultadoJuego) => {
      const juego = activo;
      // Este se encarga el solo de su resultado: el menu no hace nada visible.
      if (juego?.resultadoPropio) return;
      const esRecord = await registrarPuntuacion(resultado.juego, resultado.puntuacion);
      if (esRecord) feedback.record();
      setRecords(await cargarRecords());
      setUltimo({ resultado, esRecord });

      // El record local ya esta a salvo: lo de la ruta puede fallar (sin red,
      // demasiado rapido) y solo se avisa, no se pierde nada del dispositivo.
      if (rutaId && juego?.enviar) {
        setGuardado(null);
        try {
          await juego.enviar(rutaId, resultado);
          setGuardado({ tono: 'success', texto: 'Guardado en tu ruta.' });
        } catch (e) {
          setGuardado({
            tono: 'error',
            texto: `No se pudo guardar en la ruta: ${e instanceof Error ? e.message : 'error desconocido'}`,
          });
        }
      }
    },
    [activo, rutaId],
  );

  const salir = useCallback(async () => {
    setActivo(null);
    setUltimo(null);
    setGuardado(null);
    setVista('juego');
    setRecords(await cargarRecords());
  }, []);

  if (activo) {
    const Juego = activo.Componente;
    // Los de pantalla completa tapan todo (cabecera y pestanas) y traen su boton
    // de salir. Al terminar se cierra y se ve la tarjeta de resultado de siempre.
    if (activo.pantallaCompleta && vista === 'juego' && !ultimo) {
      return (
        <Modal visible animationType="none" onRequestClose={salir}>
          <Juego onFinish={terminar} onSalir={salir} />
        </Modal>
      );
    }
    const titulo = vista === 'ranking' ? `Ranking · ${activo.titulo}` : vista === 'cervezas' ? 'Cervezas de la ruta' : activo.titulo;
    return (
      <Screen>
        <View style={styles.cabecera}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={salir}
            hitSlop={12}
            style={styles.salir}
          >
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={[typography.sectionTitle, styles.titulo]} numberOfLines={1}>{titulo}</Text>
        </View>

        {vista === 'ranking' && rutaId ? (
          <ScrollView contentContainerStyle={styles.lista}>
            {nombreRuta ? <Text style={typography.muted}>Ruta: {nombreRuta}</Text> : null}
            {activo.RankingPropio ? <activo.RankingPropio rutaId={rutaId} /> : <Ranking rutaId={rutaId} juego={activo.id} />}
          </ScrollView>
        ) : vista === 'cervezas' && rutaId ? (
          <ScrollView contentContainerStyle={styles.lista}>
            {nombreRuta ? <Text style={typography.muted}>Ruta: {nombreRuta}</Text> : null}
            <ListaCervezas rutaId={rutaId} />
          </ScrollView>
        ) : ultimo ? (
          <ScrollView contentContainerStyle={styles.lista}>
            <Card style={styles.resultado}>
              <Text style={typography.overline}>{ultimo.esRecord ? '¡Nuevo récord!' : 'Fin de la partida'}</Text>
              {/* Un tiempo largo ("123,45 s") no cabe a 64 px en un movil de 360 de ancho. */}
              <Text
                style={[styles.puntos, formatearNota(ultimo.resultado.juego, ultimo.resultado.puntuacion).length > 6 && styles.puntosLargos]}
                numberOfLines={1}
              >
                {formatearNota(ultimo.resultado.juego, ultimo.resultado.puntuacion)}
              </Text>
              {activo.Detalle ? <activo.Detalle resultado={ultimo.resultado} /> : null}
              {/* Sin record, una raya y no "0": en un juego de tiempo, 0,00 s seria un record imposible de batir. */}
              <Text style={typography.muted}>
                Tu récord: {records[activo.id] === undefined ? '—' : formatearNota(activo.id, records[activo.id])}
              </Text>
              {guardado ? <Banner tone={guardado.tono}>{guardado.texto}</Banner> : null}
              <Button title="Otra vez" onPress={() => { setUltimo(null); setGuardado(null); }} />
              {rutaId && activo.ranking ? (
                <Button title="Ver ranking" variant="secondary" onPress={() => setVista('ranking')} />
              ) : null}
              {rutaId && activo.cervezas ? (
                <Button title="Ver cervezas de la ruta" variant="secondary" onPress={() => setVista('cervezas')} />
              ) : null}
              <Button title="Salir" variant="ghost" onPress={salir} />
            </Card>
          </ScrollView>
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
      <Text style={typography.muted}>
        {nombreRuta ? `Partidas cortas para el rato entre bar y bar. Ruta: ${nombreRuta}.` : 'Partidas cortas para el rato entre bar y bar.'}
      </Text>
      {JUEGOS.length === 0 ? (
        <EmptyState title="Muy pronto" body="Estamos sirviendo los primeros juegos." />
      ) : (
        JUEGOS.map((juego) => {
          // Ranking o cervezas de la ruta: un boton a la DERECHA de la tarjeta (1/5 del
          // ancho, el mismo alto), no una fila entera debajo. Asi cada juego ocupa una
          // sola altura y caben mas en pantalla.
          const lateral: { vista: Vista; icono: 'trophy' | 'list'; texto: string; etiqueta: string } | null =
            rutaId && (juego.ranking || juego.RankingPropio)
              ? { vista: 'ranking', icono: 'trophy', texto: 'Ranking', etiqueta: `Ranking de la ruta de ${juego.titulo}` }
              : rutaId && juego.cervezas
                ? { vista: 'cervezas', icono: 'list', texto: 'Cervezas', etiqueta: 'Cervezas de la ruta' }
                : null;
          return (
            <View key={juego.id} style={styles.juego}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Jugar a ${juego.titulo}`}
                onPress={() => abrir(juego)}
                style={({ pressed }) => [styles.principal, pressed && styles.pulsado]}
              >
                <Card style={styles.fila}>
                  <View style={styles.icono}>
                    <Ionicons name={juego.icono} size={30} color={colors.beerDark} />
                  </View>
                  <View style={styles.textos}>
                    <Text style={typography.cardTitle}>{juego.titulo}</Text>
                    <Text style={typography.muted}>{juego.descripcion}</Text>
                    {records[juego.id] !== undefined ? (
                      <Text style={styles.record}>Récord: {formatearNota(juego.id, records[juego.id])}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={colors.inkFaint} />
                </Card>
              </Pressable>
              {lateral ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={lateral.etiqueta}
                  onPress={() => abrir(juego, lateral.vista)}
                  style={({ pressed }) => [styles.lateral, pressed && styles.pulsado]}
                >
                  <Ionicons name={lateral.icono} size={24} color={colors.beerDark} />
                  <Text style={styles.lateralTexto} numberOfLines={1} adjustsFontSizeToFit>
                    {lateral.texto}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titulo: { flex: 1 },
  salir: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  lista: { gap: space.md, paddingBottom: space.xl },
  resultado: { alignItems: 'center' },
  puntos: { fontSize: 64, fontWeight: '800', color: colors.beerDark },
  puntosLargos: { fontSize: 44 },
  // La tarjeta del juego (4/5) y, a su derecha, ranking o cervezas (1/5), con el mismo alto.
  juego: { flexDirection: 'row', alignItems: 'stretch', gap: space.sm },
  // minWidth 0: en web un elemento flex no encoge por debajo de su contenido, y el
  // texto largo empujaba el boton de ranking fuera de la pantalla.
  principal: { flex: 4, minWidth: 0 },
  fila: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 88 },
  lateral: {
    flex: 1,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.xs,
  },
  lateralTexto: { fontSize: 11, fontWeight: '700', color: colors.beerDark },
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
