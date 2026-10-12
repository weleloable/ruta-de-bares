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
import { NIVELES, nuevaPartida, PUNTOS_MAXIMOS, reducir } from './partida';
import type { Accion, BancoPreguntas, EstadoPartida } from './tipos';
import { CLAVE_VISTAS, leerVistas } from './vistas';

const LETRAS = ['A', 'B', 'C', 'D'] as const;
const IDS_BANCO: ReadonlySet<string> = new Set(BANCO.preguntas.map((p) => p.id));

const TEXTO_FINAL = {
  gano: { titulo: '¡Maestro cervecero!', cuerpo: 'Has acertado las cinco. Invita a una ronda.' },
  fallo: { titulo: 'Fallaste', cuerpo: 'La próxima tiras mejor la caña.' },
  tiempo: { titulo: 'Se acabó el tiempo', cuerpo: 'La espuma no espera.' },
} as const;

/** "41,3 s" */
export function segundosTexto(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toString().replace('.', ',')} s`;
}

type Desenlace = keyof typeof TEXTO_FINAL;

/** Lo que el juego anade a la tarjeta final del menu: como acabo la partida. */
export function DetalleQuiz({ resultado }: PropsDetalle) {
  const d = resultado.detalles ?? {};
  const desenlace = (typeof d.desenlace === 'string' && d.desenlace in TEXTO_FINAL ? d.desenlace : 'fallo') as Desenlace;
  const aciertos = Number(d.aciertos ?? 0);
  const ms = typeof d.ms === 'number' ? d.ms : null;
  return (
    <View style={styles.detalle}>
      <Text style={styles.detalleTitulo}>{TEXTO_FINAL[desenlace].titulo}</Text>
      <Text style={typography.muted}>
        {TEXTO_FINAL[desenlace].cuerpo} {aciertos === 1 ? '1 acierto' : `${aciertos} aciertos`} de {PUNTOS_MAXIMOS}
        {ms !== null ? `, en ${segundosTexto(ms)}` : ''}.
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
  // Hasta leer las vistas no se deja jugar: si no, la primera partida guardaba su
  // lista ENCIMA de la del almacen y se perdia el historial (volvian a salir preguntas).
  const [listo, setListo] = useState(false);
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
      if (vivo) setListo(true);
      try {
        const records = await cargarRecords();
        if (vivo) setRecord(records[ID_JUEGO] ?? 0);
      } catch {
        if (vivo) setRecord(0);
      }
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

  if (!estado) return <Inicio record={record} listo={listo} onJugar={jugar} />;
  return <Partida estado={estado} setEstado={setEstado} onFinish={onFinish} />;
}

function Inicio({ record, listo, onJugar }: { record: number | null; listo: boolean; onJugar: () => void }) {
  return (
    <ScrollView style={styles.fondo} contentContainerStyle={styles.centrado}>
      <Ionicons name="help-circle" size={64} color={colors.beer} />
      <Text style={styles.titulo}>¿Quién quiere ser cervecero?</Text>
      <View style={styles.reglas}>
        <Text style={styles.regla}>5 preguntas, cada una más difícil. Si fallas, se acaba.</Text>
        <Text style={styles.regla}>Un punto por cada acierto. Si empatas, gana quien haya contestado antes.</Text>
        <Text style={styles.regla}>Tienes 3 comodines, uno de cada, y {CONFIG.segundos} segundos por pregunta.</Text>
      </View>
      <Text style={styles.record}>Tu mejor puntuación: {record ?? '…'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !listo }}
        disabled={!listo}
        onPress={onJugar}
        style={({ pressed }) => [styles.jugar, !listo && styles.opcionEliminada, pressed && styles.pulsado]}
      >
        <Text style={styles.jugarTexto}>Jugar</Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * La partida TIENE QUE CABER SIN SCROLL (como todos los juegos): a 740 px de
 * ventana, con la barra de arriba, las pestanas y la cabecera, le quedan ~540.
 * Por eso todo es compacto y la parte de abajo tiene un alto casi fijo: la
 * confirmacion ("Si, definitiva") NO se anade debajo, ocupa la fila fija (sin
 * respuesta marcada, esa fila solo dice "Elige una respuesta"), y al revelar, el
 * resultado ocupa el sitio de comodines y botones.
 * La respuesta buena ya sale en verde en su opcion: no se repite en texto.
 * `npm run verificar:juego` lo mide con los textos MAS LARGOS del banco.
 * El ScrollView se queda solo como red para pantallas aun mas bajas.
 *
 * Se exporta (con `banco`) para que el verificador la monte con esa pregunta.
 */
export function Partida({
  estado,
  setEstado,
  onFinish,
  banco = BANCO,
}: {
  estado: EstadoPartida;
  setEstado: (f: (e: EstadoPartida | null) => EstadoPartida | null) => void;
  onFinish: PropsJuego['onFinish'];
  banco?: BancoPreguntas;
}) {
  const [restante, setRestante] = useState(CONFIG.segundos);
  // Cuando salio la pregunta que se esta contestando: de aqui sale el tiempo que desempata.
  const inicio = useRef(Date.now());
  const terminado = useRef(false);
  const tardado = () => Date.now() - inicio.current;

  const enviar = useCallback(
    (accion: Accion) => setEstado((e) => (e ? reducir(e, accion, { banco, azar: Math.random, config: CONFIG }) : e)),
    [setEstado, banco],
  );

  // Reloj: se arma con cada pregunta (tambien tras el cambio de ronda) y solo corre
  // mientras se puede responder. Marca una hora limite en vez de contar ticks:
  // una pestana en segundo plano no se queda "congelada" con tiempo de sobra.
  useEffect(() => {
    if (estado.fase !== 'respondiendo') return;
    const limite = Date.now() + CONFIG.segundos * 1000;
    inicio.current = Date.now();
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
    void guardarVistas(estado.vistas);
  }, [estado.pregunta.id, estado.vistas]);

  // Al terminar, el menu enseña la tarjeta de resultado (puntos, record, otra vez).
  useEffect(() => {
    if (estado.fase !== 'fin' || terminado.current) return;
    terminado.current = true;
    onFinish({
      juego: ID_JUEGO,
      puntuacion: estado.puntos,
      // `ms` desempata en el ranking de la ruta (0061): menos es mejor.
      detalles: { desenlace: estado.desenlace ?? 'fallo', aciertos: estado.puntos, ms: estado.ms },
    });
  }, [estado, onFinish]);

  const revelada = estado.fase === 'revelada';
  const bloqueada = estado.fase !== 'respondiendo';
  const ultima = estado.indice === NIVELES.length - 1;

  return (
    <ScrollView style={styles.fondo} contentContainerStyle={styles.partida}>
      <Escalera indice={estado.indice} />

      <View style={styles.cabeceraPregunta}>
        <Text style={styles.nivel}>
          {NOMBRE_NIVEL[estado.indice]} · llevas {estado.indice} {estado.indice === 1 ? 'punto' : 'puntos'}
        </Text>
        <View
          accessible
          accessibilityRole="timer"
          accessibilityLabel={`Quedan ${restante} segundos`}
          style={[styles.reloj, restante <= 10 && estado.fase === 'respondiendo' && styles.relojUrgente]}
        >
          <Ionicons name="timer" size={14} color={colors.paper} />
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
              {esCorrecta ? <Ionicons name="checkmark-circle" size={22} color={colors.paper} /> : null}
              {esFallo ? <Ionicons name="close-circle" size={22} color={colors.paper} /> : null}
            </Pressable>
          );
        })}
      </View>

      {estado.fase === 'respondiendo' ? (
        <>
          <View style={styles.comodines}>
            <BotonComodin icono="contrast" texto="50:50" usado={estado.usados.cincuenta} onPress={() => enviar({ tipo: 'comodin', comodin: 'cincuenta' })} />
            <BotonComodin icono="people" texto="Voto del bar" usado={estado.usados.voto} onPress={() => enviar({ tipo: 'comodin', comodin: 'voto' })} />
            <BotonComodin icono="swap-horizontal" texto="Cambio de ronda" usado={estado.usados.cambio} onPress={() => enviar({ tipo: 'comodin', comodin: 'cambio', ms: tardado() })} />
          </View>

          {/* Una sola fila de alto fijo: lo que cambia es lo que hay dentro, nunca se anade otra. */}
          <View style={styles.fila}>
            {estado.seleccion !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`¿Respuesta definitiva? Sí, la ${LETRAS[estado.seleccion]}`}
                onPress={() => enviar({ tipo: 'confirmar', ms: tardado() })}
                style={({ pressed }) => [styles.jugar, styles.flexAncho, pressed && styles.pulsado]}
              >
                <Text style={styles.jugarTextoFila} numberOfLines={1}>
                  Sí, definitiva ({LETRAS[estado.seleccion]})
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.secundario, styles.flex]}>
                <Text style={styles.secundarioTexto} numberOfLines={1}>
                  Elige una respuesta
                </Text>
              </View>
            )}
          </View>
        </>
      ) : null}

      {estado.fase === 'suspense' ? <Text style={styles.suspense}>Respuesta bloqueada… veamos…</Text> : null}

      {revelada ? (
        <View style={styles.resultado}>
          <View style={styles.filaResultado}>
            <Text style={[styles.resultadoTitulo, !estado.acierto && styles.resultadoMal]} numberOfLines={1}>
              {estado.acierto ? '¡Correcto!' : estado.causaFallo === 'tiempo' ? '¡Sin tiempo!' : 'Incorrecto'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => enviar({ tipo: 'siguiente' })}
              style={({ pressed }) => [styles.jugar, styles.botonResultado, pressed && styles.pulsado]}
            >
              <Text style={styles.jugarTextoFila} numberOfLines={1}>
                {!estado.acierto || ultima ? 'Ver resultado' : 'Siguiente'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.dato}>{estado.pregunta.explicacion}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Escalera({ indice }: { indice: number }) {
  return (
    <View style={styles.escalera} accessibilityLabel={`Pregunta ${indice + 1} de ${NIVELES.length}`}>
      {NIVELES.map((nivel, i) => {
        const actual = i === indice;
        const superada = i < indice;
        // Cada peldano vale un punto: el numero es lo que llevas al acertarla.
        return (
          <View key={nivel} style={[styles.peldano, actual && styles.peldanoActual, superada && styles.peldanoSuperado]}>
            <Text style={[styles.peldanoPuntos, actual && styles.peldanoTextoActual]}>{nivel}</Text>
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
      <Ionicons name={usado ? 'close' : icono} size={18} color={usado ? colors.inkFaint : colors.beer} />
      <Text style={[styles.comodinTexto, usado && styles.textoApagado]} numberOfLines={1}>
        {texto}
      </Text>
    </Pressable>
  );
}

// Paleta del tema (ink, beer, paper...) sobre fondo oscuro; los velos son paper con alfa.
const VELO = 'rgba(246, 239, 226, 0.08)';
const VELO_FUERTE = 'rgba(246, 239, 226, 0.16)';

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colors.ink, borderRadius: radius.lg },
  centrado: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg, flexGrow: 1 },
  partida: { padding: space.md, gap: space.sm },
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
  jugarTexto: { color: colors.ink, fontWeight: '800', fontSize: 17 },
  jugarTextoFila: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  pulsado: { opacity: 0.85 },
  escalera: { flexDirection: 'row', gap: space.xs },
  peldano: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: VELO,
  },
  peldanoActual: { backgroundColor: colors.beer },
  peldanoSuperado: { backgroundColor: VELO_FUERTE },
  peldanoPuntos: { color: colors.paper, fontSize: 14, fontWeight: '800' },
  peldanoTextoActual: { color: colors.ink },
  cabeceraPregunta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nivel: { color: colors.beer, fontWeight: '800', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  reloj: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: VELO_FUERTE,
    minWidth: 56,
    justifyContent: 'center',
  },
  relojUrgente: { backgroundColor: colors.stamp },
  relojTexto: { color: colors.paper, fontWeight: '800', fontSize: 15 },
  pregunta: { color: colors.paper, fontSize: 16, fontWeight: '700', lineHeight: 21 },
  opciones: { gap: 6 },
  opcion: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
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
  votoPct: { color: colors.paper, fontWeight: '800', fontSize: 13 },
  letra: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.beerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letraMarcada: { backgroundColor: colors.beer },
  letraTexto: { color: colors.paper, fontWeight: '800', fontSize: 13 },
  opcionTexto: { flex: 1, color: colors.paper, fontSize: 15, fontWeight: '600', lineHeight: 19 },
  textoApagado: { color: colors.inkFaint },
  suspense: { color: colors.beer, fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: space.md },
  resultado: { gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: VELO },
  filaResultado: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  resultadoTitulo: { flex: 1, color: colors.paper, fontSize: 18, fontWeight: '800' },
  resultadoMal: { color: '#F0D6D2' },
  botonResultado: { minHeight: 44, paddingHorizontal: space.lg },
  dato: { color: colors.paper, fontSize: 13, lineHeight: 18 },
  comodines: { flexDirection: 'row', gap: space.sm },
  comodin: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.beerDark,
    backgroundColor: VELO,
    paddingHorizontal: 2,
  },
  comodinUsado: { borderColor: VELO_FUERTE },
  comodinTexto: { color: colors.paper, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  secundario: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.inkFaint,
    paddingHorizontal: space.md,
  },
  secundarioTexto: { color: colors.paper, fontWeight: '700', fontSize: 14 },
  fila: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', minHeight: 48 },
  flex: { flex: 1, minHeight: 48, paddingHorizontal: space.sm },
  flexAncho: { flex: 1.6, minHeight: 48, paddingHorizontal: space.sm },
  detalle: { alignItems: 'center', gap: space.xs },
  detalleTitulo: { fontSize: 18, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
});
