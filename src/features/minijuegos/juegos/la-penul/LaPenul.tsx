import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, space } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import type { PropsJuego } from '../../tipos';
import { BARRA, CIERRE, CREDITOS, ID_LA_PENUL, INICIO, NODOS, PERSONAS, RONDAS, TITULO_LA_PENUL } from './guion';
import { PROPORCION_PERSONAJE } from './imagenesGeometria';
import { crearMotor, leer, type Estado } from './motor';
import type { Fondo, Imagen, PersonaId } from './tipos';

/*
 * La Penul: historia interactiva para adultos, estilo novela visual. Aqui solo
 * se pinta; el guion es guion.ts (datos) y quien lo recorre, motor.ts (puro).
 *
 * Sin nota, sin ranking y sin puntos de casa: `resultadoPropio` en juegos.ts,
 * sin `enviar` ni `ranking`. Al llegar a un final se llama a onFinish con
 * puntuacion 0 (el menu no hace nada con ella: no guarda record).
 *
 * Que salga en el menu lo decide visibilidad.ts (admins siempre; el resto, si
 * la ruta lo enciende). Es una SORPRESA, no un secreto: todo esto va en la web
 * publicada.
 *
 * Cabe sin scroll: no hay ScrollView. Los textos largos se paginan en el guion
 * (guion.test.ts pone el tope) y el busto encoge con el hueco que queda.
 */

const FONDOS: Record<Fondo, number> = {
  bar: require('../../../../../assets/la-penul/fondos/bar.jpg') as number,
  portal: require('../../../../../assets/la-penul/fondos/portal.jpg') as number,
};

const IMAGENES: Record<Imagen, number> = {
  'peep-10': require('../../../../../assets/la-penul/personajes/peep-10.png') as number,
  'peep-17': require('../../../../../assets/la-penul/personajes/peep-17.png') as number,
  'peep-47': require('../../../../../assets/la-penul/personajes/peep-47.png') as number,
  'peep-48': require('../../../../../assets/la-penul/personajes/peep-48.png') as number,
  'peep-61': require('../../../../../assets/la-penul/personajes/peep-61.png') as number,
  'peep-91': require('../../../../../assets/la-penul/personajes/peep-91.png') as number,
  'peep-94': require('../../../../../assets/la-penul/personajes/peep-94.png') as number,
  'peep-96': require('../../../../../assets/la-penul/personajes/peep-96.png') as number,
};

const motor = crearMotor({ nodos: NODOS, inicio: INICIO, barra: BARRA, cierre: CIERRE, rondas: RONDAS });

type Fase = 'portada' | 'creditos' | 'jugando' | 'fundido' | 'final';

const KICKER = { bueno: 'Final feliz', calabazas: 'Calabazas', cierre: 'Cierre del bar' } as const;

const semilla = () => Math.floor(Math.random() * 2 ** 32);

/**
 * Las opciones no aceptan toques hasta que llevan este rato a la vista. "Seguir"
 * y la ultima opcion caen en el MISMO sitio de la pantalla: quien pasaba el
 * texto a toques rapidos elegia sin leerla la opcion de abajo, que casi siempre
 * es la de presionar (lo cazo el critico). Medio segundo basta para que el
 * segundo toque de un doble toque caiga en el vacio.
 */
export const ESPERA_OPCIONES_MS = 500;
// Decision: "Seguir" y el cuadro de texto NO llevan candado. Un doble toque puede
// saltarse una pagina de TEXTO (la replica a lo que elegiste), pero nunca elegir
// nada sin verlo, que es lo que importa. Ponerselo haria la lectura pesada.

export function LaPenul({ onFinish, onSalir }: PropsJuego) {
  const insets = useSafeAreaInsets();
  const [fase, setFase] = useState<Fase>('portada');
  const [estado, setEstado] = useState<Estado>(() => motor.empezar(semilla()));
  // Cuantas partidas se han empezado: entra en la clave del candado, asi la
  // primera pantalla de una partida nueva no hereda el candado ya abierto.
  const [partida, setPartida] = useState(0);
  // Toques que han valido: tambien en la clave. Un toque que vale cierra el
  // candado, y si su accion no cambia de pantalla (un "Salir" que el anfitrion no
  // ejecuta, una eleccion que el motor rechaza) la clave cambia igual y el
  // candado se rearma: nunca se queda cerrado para siempre (lo cazo el critico).
  const [toques, setToques] = useState(0);
  const negro = useRef(new Animated.Value(0)).current;
  // Ref y no el estado: un segundo toque que llega antes de repintar tiene que verlo ya.
  const enFundido = useRef(false);
  const avisado = useRef(false);
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;

  const nodo = motor.nodoActual(estado);
  const paginas = motor.paginas(estado);
  const pagina = paginas[Math.min(estado.pagina, paginas.length - 1)];
  const ultima = motor.enUltimaPagina(estado);
  const final = motor.final(estado);
  const quien = motor.imagen(estado);

  // Candado de las opciones: se abren ESPERA_OPCIONES_MS despues de aparecer.
  // Por pantalla (nodo, pagina y partida): la que esta delante y la que ya esta abierta.
  const pantalla = `${partida}|${toques}|${fase}|${estado.nodo}|${estado.pagina}|${estado.rondas}|${estado.intentados.length}`;
  const pantallaRef = useRef(pantalla);
  pantallaRef.current = pantalla;
  const abierta = useRef<string | null>(null);
  const [abiertaEstado, setAbiertaEstado] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      abierta.current = pantalla;
      setAbiertaEstado(pantalla);
    }, ESPERA_OPCIONES_MS);
    return () => clearTimeout(id);
  }, [pantalla]);
  const opcionesAbiertas = abiertaEstado === pantalla;
  /** Envuelve un boton con el candado: si la pantalla acaba de aparecer, el toque no cuenta. */
  const conCandado = useCallback(
    (fn: () => void) => () => {
      if (abierta.current !== pantallaRef.current) return;
      // Un toque que vale cierra el candado hasta la pantalla nueva (o el rearme).
      abierta.current = null;
      setToques((n) => n + 1);
      fn();
    },
    [],
  );

  const empezar = useCallback(() => {
    avisado.current = false;
    enFundido.current = false;
    negro.setValue(0);
    setPartida((n) => n + 1);
    setEstado(motor.empezar(semilla()));
    setFase('jugando');
  }, [negro]);

  const seguir = useCallback(() => {
    // Durante el fundido no hay nada que tocar: un segundo toque reiniciaba la
    // animacion y su final se comia el fundido (lo cazo el critico).
    if (fase !== 'jugando' || enFundido.current) return;
    feedback.toque();
    if (!ultima) {
      setEstado((e) => motor.siguientePagina(e));
      return;
    }
    if (!final) return;
    // El final bueno se corta con un fundido a negro; los demas pasan directos a la portada.
    if (final.tipo === 'bueno') {
      enFundido.current = true;
      setFase('fundido');
      Animated.timing(negro, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }).start(() => setFase('final'));
    } else setFase('final');
  }, [fase, ultima, final, negro]);

  const elegir = useCallback((indice: number) => {
    // Candado: si las opciones de ESTA pantalla aun no estan abiertas, el toque no cuenta.
    if (abierta.current !== pantallaRef.current) return;
    // Un toque que vale cierra el candado: un segundo toque antes de repintar no
    // aplicaria el mismo indice a la pantalla siguiente.
    abierta.current = null;
    setToques((n) => n + 1);
    feedback.toque();
    setEstado((e) => motor.elegir(e, indice));
  }, []);

  // Al llegar a la portada del final: onFinish una sola vez por partida.
  useEffect(() => {
    if (fase !== 'final' || !final || avisado.current) return;
    avisado.current = true;
    alAcabar.current({ juego: ID_LA_PENUL, puntuacion: 0, detalles: { final: nodo.id, tipo: final.tipo } });
  }, [fase, final, nodo.id]);

  const arriba = Math.max(insets.top, space.md);
  const abajo = Math.max(insets.bottom, space.md);

  if (fase === 'portada' || fase === 'creditos') {
    return (
      <View style={styles.raiz}>
        <Image source={FONDOS.bar} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={[StyleSheet.absoluteFill, styles.velo]} />
        <View style={[styles.columna, { paddingTop: arriba, paddingBottom: abajo }]}>
          <BotonSalir onSalir={onSalir} />
          {fase === 'portada' ? (
            <View style={styles.portada} testID="penul-portada">
              <Text style={styles.exclusiva}>Exclusiva</Text>
              <Text style={styles.cabecera} accessibilityRole="header">
                {TITULO_LA_PENUL.toUpperCase()}
              </Text>
              <Text style={styles.subtitulo}>Una noche, tres rondas y muchas ganas.{'\n'}¿Con quién saldrás del bar?</Text>
              <Text style={styles.adultos}>+18 · Contenido para mayores de edad</Text>
            </View>
          ) : (
            <View style={styles.creditos} testID="penul-creditos">
              <Text style={styles.creditosTitulo}>Créditos</Text>
              {CREDITOS.map((c) => (
                <Text key={c} style={styles.creditosTexto}>
                  {c}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.botones}>
            {fase === 'portada' ? (
              <>
                <BotonGrande texto="Empezar la noche" onPress={empezar} principal />
                <BotonGrande texto="Créditos" onPress={() => setFase('creditos')} />
              </>
            ) : (
              <BotonGrande texto="Volver" onPress={() => setFase('portada')} principal />
            )}
          </View>
        </View>
      </View>
    );
  }

  if (fase === 'final' && final) {
    return (
      <View style={styles.raiz} testID="penul-final">
        <Image source={FONDOS[nodo.fondo]} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={[StyleSheet.absoluteFill, styles.veloFinal]} />
        <View style={[styles.columna, { paddingTop: arriba, paddingBottom: abajo }]}>
          <BotonSalir onSalir={onSalir} />
          <View style={styles.portada}>
            <Text style={[styles.exclusiva, final.tipo !== 'bueno' && styles.exclusivaMala]}>{KICKER[final.tipo]}</Text>
            <Text style={styles.titular} accessibilityRole="header" testID="penul-titular">
              {leer(final.titular, estado.genero)}
            </Text>
            <View style={styles.remate}>
              <Text style={styles.remateTexto}>{leer(final.remate, estado.genero)}</Text>
            </View>
          </View>
          {/* Con candado: "Salir" cae donde estaba "Ver el final", y el toque de mas para
              pasar el texto cerraba el juego sin dejar leer el final (lo cazo el critico). */}
          <View style={styles.botones}>
            <BotonGrande texto="Volver a jugar" onPress={conCandado(empezar)} principal bloqueado={!opcionesAbiertas} />
            {onSalir ? <BotonGrande texto="Salir" onPress={conCandado(onSalir)} bloqueado={!opcionesAbiertas} /> : null}
          </View>
        </View>
      </View>
    );
  }

  const opciones = ultima && !final ? motor.opciones(estado) : [];
  const enBarra = nodo.barra === true;

  return (
    <View style={styles.raiz}>
      <Image source={FONDOS[nodo.fondo]} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.veloSuave]} />
      <View style={[styles.columna, { paddingTop: arriba, paddingBottom: abajo }]}>
        <View style={styles.barraSuperior}>
          <BotonSalir onSalir={onSalir} />
          {/* En las escenas de un final no hay ronda que contar: el bar ya no importa. */}
          {final ? null : (
            <Text style={styles.ronda} testID="penul-ronda">
              {nodo.id === CIERRE ? 'Cierre' : `Ronda ${Math.min(estado.rondas + 1, RONDAS)} de ${RONDAS}`}
            </Text>
          )}
        </View>

        {/* El busto ocupa lo que dejan el texto y las opciones: encoge en pantallas bajas. */}
        <View style={styles.escena}>
          {quien && (!enBarra || motor.leyendoReplica(estado)) ? (
            <Image source={IMAGENES[quien]} style={styles.busto} contentFit="contain" contentPosition="bottom" />
          ) : null}
        </View>

        <Pressable
          testID="penul-texto"
          accessibilityRole={ultima && !final ? undefined : 'button'}
          accessibilityLabel={ultima && !final ? undefined : `${pagina?.texto ?? ''}. Seguir`}
          onPress={ultima && !final ? undefined : seguir}
          style={styles.cuadro}
        >
          {pagina?.habla ? <Text style={styles.quien}>{pagina.habla}</Text> : null}
          <Text style={[styles.texto, !pagina?.habla && styles.narracion]}>{pagina?.texto}</Text>
          {!ultima || final ? (
            <Text style={styles.seguirPista}>
              {estado.pagina + 1}/{paginas.length}  ·  {final && ultima ? 'Toca para ver el final' : 'Toca para seguir'}
            </Text>
          ) : null}
        </Pressable>

        {fase === 'fundido' ? null : final && ultima ? (
          <View style={styles.botones}>
            <BotonGrande texto="Ver el final" onPress={seguir} principal testID="penul-seguir" />
          </View>
        ) : !ultima ? (
          <View style={styles.botones}>
            <BotonGrande texto="Seguir" onPress={seguir} principal testID="penul-seguir" />
          </View>
        ) : enBarra ? (
          <Barra opciones={opciones} onElegir={elegir} bloqueado={!opcionesAbiertas} />
        ) : (
          <View style={styles.botones}>
            {opciones.map((o) => (
              <BotonGrande
                key={o.indice}
                texto={o.texto}
                onPress={() => elegir(o.indice)}
                testID={`penul-opcion-${o.indice}`}
                bloqueado={!opcionesAbiertas}
              />
            ))}
          </View>
        )}
      </View>
      {fase === 'fundido' ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.negro, { opacity: negro }]} /> : null}
    </View>
  );
}

/** La barra: las seis caras en dos filas de tres, y Paco abajo. Quien ya te dio largas, tachado. */
function Barra({
  opciones,
  onElegir,
  bloqueado,
}: {
  opciones: ReturnType<typeof motor.opciones>;
  onElegir(indice: number): void;
  bloqueado: boolean;
}) {
  const personas = opciones.filter((o) => o.persona);
  const otras = opciones.filter((o) => !o.persona);
  return (
    <View style={styles.barra}>
      <View style={styles.caras}>
        {personas.map((o) => {
          const p = PERSONAS[o.persona as PersonaId];
          return (
            <Pressable
              key={o.indice}
              testID={`penul-persona-${o.persona}`}
              accessibilityRole="button"
              accessibilityLabel={o.tachada ? `${p.nombre}: ya lo intentaste` : `${p.nombre}. ${p.donde}`}
              accessibilityState={{ disabled: o.tachada }}
              disabled={o.tachada}
              onPress={() => onElegir(o.indice)}
              style={({ pressed }) => [styles.cara, o.tachada && styles.caraTachada, bloqueado && styles.bloqueado, pressed && styles.pulsado]}
            >
              <Image source={IMAGENES[p.imagen]} style={styles.caraImagen} contentFit="contain" contentPosition="top" />
              <Text style={styles.caraNombre} numberOfLines={1}>
                {p.nombre}
              </Text>
              <Text style={styles.caraDonde} numberOfLines={2}>
                {o.tachada ? 'Ya lo intentaste' : p.donde}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {otras.map((o) => (
        <BotonGrande key={o.indice} texto={o.texto} onPress={() => onElegir(o.indice)} testID={`penul-opcion-${o.indice}`} bloqueado={bloqueado} />
      ))}
    </View>
  );
}

function BotonGrande({
  texto,
  onPress,
  principal = false,
  testID,
  bloqueado = false,
}: {
  texto: string;
  onPress(): void;
  principal?: boolean;
  testID?: string;
  /** Candado de las opciones recien aparecidas: se ven, pero aun no se pueden tocar. */
  bloqueado?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: bloqueado }}
      onPress={onPress}
      style={({ pressed }) => [styles.boton, principal && styles.botonPrincipal, bloqueado && styles.bloqueado, pressed && styles.pulsado]}
    >
      <Text style={[styles.botonTexto, principal && styles.botonTextoPrincipal]}>{texto}</Text>
    </Pressable>
  );
}

function BotonSalir({ onSalir }: { onSalir?: () => void }) {
  if (!onSalir) return <View style={styles.salirHueco} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Salir del juego" onPress={onSalir} hitSlop={10} style={styles.salir}>
      <Text style={styles.salirTexto}>✕</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#140b1e', overflow: 'hidden' },
  velo: { backgroundColor: 'rgba(20, 11, 30, 0.55)' },
  veloSuave: { backgroundColor: 'rgba(20, 11, 30, 0.18)' },
  veloFinal: { backgroundColor: 'rgba(10, 5, 15, 0.72)' },
  negro: { backgroundColor: '#000' },
  columna: { flex: 1, paddingHorizontal: space.lg, gap: space.sm, width: '100%', maxWidth: 560, alignSelf: 'center' },
  barraSuperior: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  salir: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246, 239, 226, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  salirHueco: { width: 40, height: 40 },
  salirTexto: { fontSize: 18, fontWeight: '800', color: colors.ink },
  ronda: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.paper,
    backgroundColor: 'rgba(36, 26, 18, 0.7)',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    overflow: 'hidden',
  },
  escena: { flex: 1, minHeight: 0, alignItems: 'flex-end', justifyContent: 'flex-end' },
  busto: { height: '100%', aspectRatio: PROPORCION_PERSONAJE, maxWidth: '72%' },
  cuadro: {
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.beerDark,
    padding: space.md,
    gap: space.xs,
  },
  quien: {
    alignSelf: 'flex-start',
    marginTop: -space.md - 14,
    backgroundColor: colors.stamp,
    color: colors.white,
    fontFamily: fonts.title,
    fontWeight: '800',
    fontSize: 15,
    paddingHorizontal: space.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  texto: { fontSize: 17, lineHeight: 24, color: colors.ink },
  narracion: { fontStyle: 'italic', color: colors.inkSoft },
  seguirPista: { fontSize: 12, color: colors.inkFaint, textAlign: 'right' },
  botones: { gap: space.sm },
  boton: {
    minHeight: 50,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.beerDark,
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  botonPrincipal: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  botonTexto: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.ink },
  botonTextoPrincipal: { color: colors.white, textAlign: 'center' },
  pulsado: { opacity: 0.8 },
  bloqueado: { opacity: 0.6 },
  barra: { gap: space.sm },
  caras: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'space-between' },
  cara: {
    width: '31.5%',
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.beerDark,
    padding: space.xs,
    alignItems: 'center',
  },
  caraTachada: { opacity: 0.4 },
  caraImagen: { width: '100%', aspectRatio: 1.15 },
  caraNombre: { fontSize: 15, fontWeight: '800', color: colors.ink, fontFamily: fonts.title },
  caraDonde: { fontSize: 11, lineHeight: 14, color: colors.inkSoft, textAlign: 'center', minHeight: 28 },
  // Portadas (titulo y finales): aire de revista de los 2000, con la letra y los colores del tema.
  portada: { flex: 1, justifyContent: 'center', gap: space.md },
  exclusiva: {
    alignSelf: 'flex-start',
    transform: [{ rotate: '-4deg' }],
    backgroundColor: colors.beer,
    color: colors.white,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: space.md,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  exclusivaMala: { backgroundColor: colors.stamp },
  cabecera: {
    fontFamily: fonts.title,
    fontSize: 72,
    lineHeight: 76,
    fontWeight: '900',
    color: colors.paper,
    letterSpacing: -1,
    textShadowColor: colors.stamp,
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0,
  },
  subtitulo: { fontFamily: fonts.title, fontSize: 20, lineHeight: 27, fontStyle: 'italic', color: colors.paper },
  adultos: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '800',
    color: colors.paper,
    borderWidth: 2,
    borderColor: colors.paper,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  titular: {
    fontFamily: fonts.title,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
    color: colors.paper,
    textTransform: 'uppercase',
    textShadowColor: colors.stamp,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  remate: { backgroundColor: colors.paper, borderLeftWidth: 6, borderLeftColor: colors.beer, padding: space.md, borderRadius: radius.sm },
  remateTexto: { fontFamily: fonts.title, fontStyle: 'italic', fontSize: 18, lineHeight: 25, color: colors.ink },
  creditos: { flex: 1, justifyContent: 'center', gap: space.md },
  creditosTitulo: { fontFamily: fonts.title, fontSize: 30, fontWeight: '900', color: colors.paper },
  creditosTexto: { fontSize: 15, lineHeight: 22, color: colors.paper },
});
