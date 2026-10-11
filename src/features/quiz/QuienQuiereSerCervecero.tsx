import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../../lib/theme';
import { feedback } from '../minijuegos/feedback';
import { cargarRecords } from '../minijuegos/records';
import type { PropsDetalle, PropsJuego } from '../minijuegos/tipos';
import { BANCO } from './banco';
import { CONFIG, ID_JUEGO, NOMBRE_NIVEL } from './config';
import { nuevaPartida, reducir } from './partida';
import type { Accion, EstadoPartida } from './tipos';
import { CLAVE_VISTAS, leerVistas } from './vistas';

const LETRAS = ['A', 'B', 'C', 'D'] as const;
const IDS_BANCO: ReadonlySet<string> = new Set(BANCO.preguntas.map((p) => p.id));

const TEXTO_FINAL = {
  gano: { titulo: '¡Maestro cervecero!', cuerpo: 'Has acertado las cinco. Invita a una ronda.' },
  fallo: { titulo: 'Fallaste', cuerpo: 'La próxima tiras mejor la caña.' },
  tiempo: { titulo: 'Se acabó el tiempo', cuerpo: 'La espuma no espera.' },
  plantado: { titulo: 'Te plantaste a tiempo', cuerpo: 'Más vale caña en mano que barril volando.' },
} as const;

type Desenlace = keyof typeof TEXTO_FINAL;

/** Lo que el juego anade a la tarjeta final del menu: como acabo la partida. */
export function DetalleQuiz({ resultado }: PropsDetalle) {
  const d = resultado.detalles ?? {};
  const desenlace = (typeof d.desenlace === 'string' && d.desenlace in TEXTO_FINAL ? d.desenlace : 'fallo') as Desenlace;
  const aciertos = Number(d.aciertos ?? 0);
  return (
    <View style={styles.detalle}>
      <Text style={styles.detalleTitulo}>{TEXTO_FINAL[desenlace].titulo}</Text>
      <Text style={typography.muted}>
        {TEXTO_FINAL[desenlace].cuerpo} {aciertos === 1 ? '1 acierto' : `${aciertos} aciertos`} de 5.
      </Text>
    </View>
  );
}

async function guardarVistas(vistas: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE_VISTAS, JSON.stringify(vistas));
  } catch {
    // Sin almacen (modo privado): se juega igual, solo se podran repetir preguntas.
  }
}

export function QuienQuiereSerCervecero({ onFinish }: PropsJuego) {
  const [vistas, setVistas] = useState<readonly string[]>([]);
  const [record, setRecord] = useState<number | null>(null);
  const [estado, setEstado] = useState<EstadoPartida | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const crudo = await AsyncStorage.getItem(CLAVE_VISTAS);
        if (vivo) setVistas(leerVistas(crudo, IDS_BANCO));
      } catch {
        // Sin almacen: empieza sin historial.
      }
      const records = await cargarRecords();
      if (vivo) setRecord(records[ID_JUEGO] ?? 0);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const jugar = useCallback(() => {
    const e = nuevaPartida(BANCO, vistas, Math.random);
    void guardarVistas(e.vistas);
    setEstado(e);
  }, [vistas]);

  if (!estado) return <Inicio record={record} onJugar={jugar} />;
  return <Partida estado={estado} setEstado={setEstado} onFinish={onFinish} />;
}

function Inicio({ record, onJugar }: { record: number | null; onJugar: () => void }) {
  return (
    <ScrollView style={styles.fondo} contentContainerStyle={styles.centrado}>
      <Ionicons name="help-circle" size={64} color={colors.beer} />
      <Text style={styles.titulo}>¿Quién quiere ser cervecero?</Text>
      <View style={styles.reglas}>
        <Text style={styles.regla}>5 preguntas, cada una más difícil. Si fallas, se acaba.</Text>
        <Text style={styles.regla}>Te quedas con 2 puntos si pasas la segunda. Puedes plantarte antes de responder.</Text>
        <Text style={styles.regla}>Tienes 3 comodines, uno de cada, y {CONFIG.segundos} segundos por pregunta.</Text>
      </View>
      <Text style={styles.record}>Tu mejor puntuación: {record ?? '…'}</Text>
      <Pressable accessibilityRole="button" onPress={onJugar} style={({ pressed }) => [styles.jugar, pressed && styles.pulsado]}>
        <Text style={styles.jugarTexto}>Jugar</Text>
      </Pressable>
    </ScrollView>
  );
}

function Partida({
  estado,
  setEstado,
  onFinish,
}: {
  estado: EstadoPartida;
  setEstado: (f: (e: EstadoPartida | null) => EstadoPartida | null) => void;
  onFinish: PropsJuego['onFinish'];
}) {
  const [restante, setRestante] = useState(CONFIG.segundos);
  const [plantando, setPlantando] = useState(false);
  const terminado = useRef(false);

  const enviar = useCallback(
    (accion: Accion) =>
      setEstado((e) => (e ? reducir(e, accion, { banco: BANCO, azar: Math.random, config: CONFIG }) : e)),
    [setEstado],
  );

  // Reloj: se arma con cada pregunta (tambien tras el cambio de ronda) y solo corre
  // mientras se puede responder. Marca una hora limite en vez de contar ticks:
  // una pestana en segundo plano no se queda "congelada" con tiempo de sobra.
  useEffect(() => {
    if (estado.fase !== 'respondiendo') return;
    const limite = Date.now() + CONFIG.segundos * 1000;
    setRestante(CONFIG.segundos);
    const id = setInterval(() => {
      const quedan = Math.max(0, Math.ceil((limite - Date.now()) / 1000));
      setRestante(quedan);
      if (quedan <= 0) {
        clearInterval(id);
        enviar({ tipo: 'tiempoAgotado' });
      }
    }, 250);
    return () => clearInterval(id);
  }, [estado.pregunta.id, estado.fase, enviar]);

  // Suspense: una pausa corta antes de revelar.
  useEffect(() => {
    if (estado.fase !== 'suspense') return;
    const id = setTimeout(() => enviar({ tipo: 'revelar' }), CONFIG.suspenseMs);
    return () => clearTimeout(id);
  }, [estado.fase, enviar]);

  useEffect(() => {
    if (estado.fase === 'revelada') (estado.acierto ? feedback.acierto : feedback.fallo)();
  }, [estado.fase, estado.acierto]);

  useEffect(() => {
    setPlantando(false);
    void guardarVistas(estado.vistas);
  }, [estado.pregunta.id, estado.vistas]);

  // Al terminar, el menu enseña la tarjeta de resultado (puntos, record, otra vez).
  useEffect(() => {
    if (estado.fase !== 'fin' || terminado.current) return;
    terminado.current = true;
    const aciertos = estado.desenlace === 'gano' ? 5 : estado.indice;
    onFinish({
      juego: ID_JUEGO,
      puntuacion: estado.puntos,
      detalles: { desenlace: estado.desenlace ?? 'fallo', aciertos },
    });
  }, [estado, onFinish]);

  const acumulados = estado.indice === 0 ? 0 : CONFIG.premios[estado.indice - 1];
  const revelada = estado.fase === 'revelada';
  const bloqueada = estado.fase !== 'respondiendo';
  const ultima = estado.indice === CONFIG.premios.length - 1;

  return (
    <ScrollView style={styles.fondo} contentContainerStyle={styles.partida}>
      <Escalera indice={estado.indice} />

      <View style={styles.cabeceraPregunta}>
        <Text style={styles.nivel}>
          {NOMBRE_NIVEL[estado.indice]} · {CONFIG.premios[estado.indice]} {CONFIG.premios[estado.indice] === 1 ? 'punto' : 'puntos'}
        </Text>
        <View
          accessible
          accessibilityRole="timer"
          accessibilityLabel={`Quedan ${restante} segundos`}
          style={[styles.reloj, restante <= 10 && estado.fase === 'respondiendo' && styles.relojUrgente]}
        >
          <Ionicons name="timer" size={16} color={colors.paper} />
          <Text style={styles.relojTexto}>{restante}</Text>
        </View>
      </View>

      <Text style={styles.pregunta}>{estado.pregunta.pregunta}</Text>

      <View style={styles.opciones}>
        {estado.opciones.map((o, i) => {
          const eliminada = estado.eliminadas.includes(i);
          const marcada = estado.seleccion === i;
          const esCorrecta = revelada && o.correcta;
          const esFallo = revelada && marcada && !o.correcta;
          const voto = estado.voto?.[i];
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ disabled: eliminada || bloqueada, selected: marcada }}
              accessibilityLabel={`Respuesta ${LETRAS[i]}: ${o.texto}${esCorrecta ? '. Correcta' : ''}${esFallo ? '. Tu respuesta, incorrecta' : ''}`}
              disabled={eliminada || bloqueada}
              onPress={() => {
                feedback.toque();
                enviar({ tipo: 'elegir', opcion: i });
              }}
              style={({ pressed }) => [
                styles.opcion,
                marcada && styles.opcionMarcada,
                esCorrecta && styles.opcionCorrecta,
                esFallo && styles.opcionFallo,
                eliminada && styles.opcionEliminada,
                pressed && styles.pulsado,
              ]}
            >
              {voto ? <View style={[styles.votoBarra, { width: `${voto}%` }]} /> : null}
              <View style={[styles.letra, marcada && styles.letraMarcada]}>
                <Text style={styles.letraTexto}>{LETRAS[i]}</Text>
              </View>
              <Text style={[styles.opcionTexto, eliminada && styles.textoApagado]}>{eliminada ? '—' : o.texto}</Text>
              {voto !== undefined && estado.voto && !eliminada ? <Text style={styles.votoPct}>{voto}%</Text> : null}
              {esCorrecta ? <Ionicons name="checkmark-circle" size={26} color={colors.paper} /> : null}
              {esFallo ? <Ionicons name="close-circle" size={26} color={colors.paper} /> : null}
            </Pressable>
          );
        })}
      </View>

      {estado.fase === 'respondiendo' && estado.seleccion !== null ? (
        <View style={styles.confirmar}>
          <Text style={styles.confirmarTexto}>¿Respuesta definitiva? ({LETRAS[estado.seleccion]})</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => enviar({ tipo: 'confirmar' })}
            style={({ pressed }) => [styles.jugar, styles.botonAncho, pressed && styles.pulsado]}
          >
            <Text style={styles.jugarTexto}>Sí, definitiva</Text>
          </Pressable>
        </View>
      ) : null}

      {estado.fase === 'suspense' ? <Text style={styles.suspense}>Respuesta bloqueada… veamos…</Text> : null}

      {revelada ? (
        <View style={styles.resultado}>
          <Text style={[styles.resultadoTitulo, !estado.acierto && styles.resultadoMal]}>
            {estado.acierto ? '¡Correcto!' : estado.causaFallo === 'tiempo' ? 'Se acabó el tiempo' : 'Incorrecto'}
          </Text>
          {!estado.acierto ? <Text style={styles.explicacion}>La respuesta era: {estado.pregunta.correcta}.</Text> : null}
          <Text style={styles.dato}>Dato curioso: {estado.pregunta.explicacion}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => enviar({ tipo: 'siguiente' })}
            style={({ pressed }) => [styles.jugar, styles.botonAncho, pressed && styles.pulsado]}
          >
            <Text style={styles.jugarTexto}>{!estado.acierto || ultima ? 'Ver resultado' : 'Siguiente pregunta'}</Text>
          </Pressable>
        </View>
      ) : null}

      {estado.fase === 'respondiendo' ? (
        <>
          <View style={styles.comodines}>
            <BotonComodin icono="contrast" texto="50:50" usado={estado.usados.cincuenta} onPress={() => enviar({ tipo: 'comodin', comodin: 'cincuenta' })} />
            <BotonComodin icono="people" texto="El voto del bar" usado={estado.usados.voto} onPress={() => enviar({ tipo: 'comodin', comodin: 'voto' })} />
            <BotonComodin icono="swap-horizontal" texto="Cambio de ronda" usado={estado.usados.cambio} onPress={() => enviar({ tipo: 'comodin', comodin: 'cambio' })} />
          </View>

          {plantando ? (
            <View style={styles.confirmar}>
              <Text style={styles.confirmarTexto}>
                ¿Plantarte con {acumulados} {acumulados === 1 ? 'punto' : 'puntos'}?
              </Text>
              <View style={styles.fila}>
                <Pressable accessibilityRole="button" onPress={() => enviar({ tipo: 'plantarse' })} style={[styles.secundario, styles.flex]}>
                  <Text style={styles.secundarioTexto}>Sí, plantarme</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setPlantando(false)} style={[styles.secundario, styles.flex]}>
                  <Text style={styles.secundarioTexto}>Seguir jugando</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setPlantando(true)} style={styles.secundario}>
              <Text style={styles.secundarioTexto}>
                Plantarme con {acumulados} {acumulados === 1 ? 'punto' : 'puntos'}
              </Text>
            </Pressable>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Escalera({ indice }: { indice: number }) {
  return (
    <View style={styles.escalera} accessibilityLabel={`Pregunta ${indice + 1} de ${CONFIG.premios.length}`}>
      {CONFIG.premios.map((premio, i) => {
        const actual = i === indice;
        const superada = i < indice;
        const segura = i === CONFIG.nivelSeguro - 1;
        return (
          <View key={i} style={[styles.peldano, actual && styles.peldanoActual, superada && styles.peldanoSuperado]}>
            <Text style={[styles.peldanoNum, actual && styles.peldanoTextoActual]}>{i + 1}</Text>
            <Text style={[styles.peldanoPuntos, actual && styles.peldanoTextoActual]}>{premio}</Text>
            {segura ? <Ionicons name="lock-closed" size={11} color={actual ? colors.ink : colors.beer} /> : <View style={styles.hueco} />}
          </View>
        );
      })}
    </View>
  );
}

function BotonComodin({
  icono,
  texto,
  usado,
  onPress,
}: {
  icono: ComponentProps<typeof Ionicons>['name'];
  texto: string;
  usado: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Comodín ${texto}${usado ? ', ya usado' : ''}`}
      accessibilityState={{ disabled: usado }}
      disabled={usado}
      onPress={onPress}
      style={({ pressed }) => [styles.comodin, usado && styles.comodinUsado, pressed && styles.pulsado]}
    >
      <Ionicons name={usado ? 'close' : icono} size={22} color={usado ? colors.inkFaint : colors.beer} />
      <Text style={[styles.comodinTexto, usado && styles.textoApagado]}>{texto}</Text>
    </Pressable>
  );
}

// Paleta del tema (ink, beer, paper...) sobre fondo oscuro; los velos son paper con alfa.
const VELO = 'rgba(246, 239, 226, 0.08)';
const VELO_FUERTE = 'rgba(246, 239, 226, 0.16)';

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.ink, borderRadius: radius.lg },
  centrado: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg, flexGrow: 1 },
  partida: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  titulo: { fontSize: 26, color: colors.paper, fontWeight: '800', textAlign: 'center' },
  reglas: { gap: space.sm, alignSelf: 'stretch' },
  regla: { color: colors.paper, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  record: { color: colors.beer, fontWeight: '800', fontSize: 15 },
  jugar: {
    minHeight: 52,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.beer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonAncho: { alignSelf: 'stretch' },
  jugarTexto: { color: colors.ink, fontWeight: '800', fontSize: 17 },
  pulsado: { opacity: 0.85 },
  escalera: { flexDirection: 'row', gap: space.xs },
  peldano: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: VELO,
  },
  peldanoActual: { backgroundColor: colors.beer },
  peldanoSuperado: { backgroundColor: VELO_FUERTE },
  peldanoNum: { color: colors.inkFaint, fontSize: 11, fontWeight: '700' },
  peldanoPuntos: { color: colors.paper, fontSize: 16, fontWeight: '800' },
  peldanoTextoActual: { color: colors.ink },
  hueco: { height: 11 },
  cabeceraPregunta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nivel: { color: colors.beer, fontWeight: '800', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  reloj: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: VELO_FUERTE,
    minWidth: 64,
    justifyContent: 'center',
  },
  relojUrgente: { backgroundColor: colors.stamp },
  relojTexto: { color: colors.paper, fontWeight: '800', fontSize: 16 },
  pregunta: { color: colors.paper, fontSize: 19, fontWeight: '700', lineHeight: 26 },
  opciones: { gap: space.sm },
  opcion: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.beerDark,
    backgroundColor: VELO,
    overflow: 'hidden',
  },
  opcionMarcada: { borderColor: colors.beer, backgroundColor: 'rgba(198, 122, 30, 0.35)' },
  opcionCorrecta: { backgroundColor: colors.green, borderColor: colors.green },
  opcionFallo: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  opcionEliminada: { opacity: 0.35 },
  votoBarra: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(198, 122, 30, 0.35)' },
  votoPct: { color: colors.paper, fontWeight: '800', fontSize: 14 },
  letra: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.beerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letraMarcada: { backgroundColor: colors.beer },
  letraTexto: { color: colors.paper, fontWeight: '800' },
  opcionTexto: { flex: 1, color: colors.paper, fontSize: 16, fontWeight: '600' },
  textoApagado: { color: colors.inkFaint },
  confirmar: { gap: space.sm, alignItems: 'center' },
  confirmarTexto: { color: colors.paper, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  suspense: { color: colors.beer, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  resultado: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: VELO },
  resultadoTitulo: { color: colors.paper, fontSize: 20, fontWeight: '800' },
  resultadoMal: { color: '#F0D6D2' },
  explicacion: { color: colors.paper, fontSize: 15, fontWeight: '700' },
  dato: { color: colors.paper, fontSize: 14, lineHeight: 20 },
  comodines: { flexDirection: 'row', gap: space.sm },
  comodin: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.beerDark,
    backgroundColor: VELO,
    padding: space.xs,
  },
  comodinUsado: { borderColor: VELO_FUERTE },
  comodinTexto: { color: colors.paper, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  secundario: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkFaint,
    paddingHorizontal: space.lg,
  },
  secundarioTexto: { color: colors.paper, fontWeight: '700', fontSize: 14 },
  fila: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  flex: { flex: 1 },
  detalle: { alignItems: 'center', gap: space.xs },
  detalleTitulo: { fontSize: 18, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
});

