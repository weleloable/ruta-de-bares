import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import { pasoDeTiempo } from '../../reloj';
import type { PropsJuego } from '../../tipos';
import { cargarControl, guardarControl } from './control';
import type { Control } from './controlReglas';
import { useDeslizar } from './deslizar';
import { MAPAS, obstaculos } from './mapas';
import {
  alto,
  ancho,
  avanzar,
  crearEstado,
  DURACION_DOBLE,
  girar,
  intervalo,
  multiplicador,
  pasarTiempo,
  PUNTOS_JARRA,
  PUNTOS_TAPA,
  type Dir,
  type Estado,
  type Mapa,
} from './modelo';
import { Sprite } from './Sprite';
import { spriteDeAmigo } from './sprites';
import { useTecladoConga } from './teclado';

type Fase = 'inicio' | 'jugando' | 'pausa' | 'choque';

/** Un fotograma largo (pestana en segundo plano) no debe adelantar la conga varios pasos de golpe. */
const DT_MAX = 0.1;
/** Cuanto se deja ver el choque antes de la pantalla de resultado. */
const PAUSA_CHOQUE_MS = 900;
const BORDE = 3;
const DORADO = '#E0B020';
const SUELO = colors.paperDeep;

// En web el navegador no debe desplazar la pagina ni seleccionar texto al deslizar.
const sinGestosDelNavegador = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none' } : null) as object | null;

export function CongaCervecera({ onFinish }: PropsJuego) {
  // Hoy hay un solo mapa; los siguientes se eligen aqui (MAPAS ya es una lista).
  const mapa = MAPAS[0];
  const [estado, setEstado] = useState<Estado>(() => crearEstado(mapa, Math.random));
  const [fase, setFase] = useState<Fase>('inicio');
  const [control, setControl] = useState<Control>('deslizar');
  const [area, setArea] = useState({ w: 0, h: 0 });

  // Refs para el bucle: leer el estado de React dentro de rAF leeria uno viejo.
  const estadoRef = useRef(estado);
  const faseRef = useRef<Fase>('inicio');
  const acumulado = useRef(0);
  const terminado = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;

  const cambiarFase = useCallback((f: Fase) => {
    faseRef.current = f;
    setFase(f);
  }, []);

  useEffect(() => {
    let vigente = true;
    cargarControl().then((c) => vigente && setControl(c));
    return () => {
      vigente = false;
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  const acabar = useCallback(
    (e: Estado) => {
      if (terminado.current) return;
      terminado.current = true;
      cambiarFase('choque');
      if (e.causa !== 'completo') feedback.fallo();
      temporizador.current = setTimeout(() => {
        alAcabar.current({
          juego: 'conga-cervecera',
          puntuacion: e.puntos,
          detalles: { amigos: e.amigos.length, segundos: Math.round(e.tiempo), jarras: e.jarras },
        });
      }, PAUSA_CHOQUE_MS);
    },
    [cambiarFase],
  );

  useEffect(() => {
    let raf = 0;
    let ultimo = Date.now();
    const bucle = () => {
      const ahora = Date.now();
      const dt = pasoDeTiempo(ahora, ultimo, DT_MAX);
      ultimo = ahora;
      if (faseRef.current === 'jugando') {
        const antes = estadoRef.current;
        let e = pasarTiempo(antes, dt);
        acumulado.current += dt;
        let pasos = 0;
        // Un paso por cada `intervalo` acumulado; el tope evita una rafaga si el reloj dio un salto.
        while (e.vivo && acumulado.current >= intervalo(e.jarras) && pasos < 3) {
          acumulado.current -= intervalo(e.jarras);
          const previo = e;
          e = avanzar(e, mapa, Math.random);
          pasos++;
          if (e.vivo && e.puntos > previo.puntos) feedback.acierto();
        }
        estadoRef.current = e;
        // Solo se repinta cuando algo cambia de verdad (no 60 veces por segundo).
        if (pasos > 0 || e.items.length !== antes.items.length || segundosDoble(e) !== segundosDoble(antes)) {
          setEstado(e);
        }
        if (!e.vivo) acabar(e);
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, [mapa, acabar]);

  const girarA = useCallback((dir: Dir) => {
    if (faseRef.current !== 'jugando') return;
    estadoRef.current = girar(estadoRef.current, dir);
  }, []);

  const empezar = useCallback(() => {
    acumulado.current = 0;
    cambiarFase('jugando');
  }, [cambiarFase]);
  const pausar = useCallback(() => {
    if (faseRef.current === 'jugando') cambiarFase('pausa');
  }, [cambiarFase]);
  const seguir = useCallback(() => {
    if (faseRef.current === 'pausa') cambiarFase('jugando');
  }, [cambiarFase]);
  const alternar = useCallback(() => {
    const f = faseRef.current;
    if (f === 'inicio') empezar();
    else if (f === 'jugando') pausar();
    else if (f === 'pausa') seguir();
  }, [empezar, pausar, seguir]);

  // Si la app pasa a segundo plano, la partida se pausa sola.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (s) => s !== 'active' && pausar());
    return () => suscripcion.remove();
  }, [pausar]);

  const elegirControl = useCallback((c: Control) => {
    setControl(c);
    guardarControl(c);
  }, []);

  useTecladoConga({ girar: girarA, alternar }, true);
  const manejadores = useDeslizar(girarA, control === 'deslizar');

  const celda =
    area.w > 0 && area.h > 0
      ? Math.max(8, Math.floor(Math.min((area.w - BORDE * 2) / ancho(mapa), (area.h - BORDE * 2) / alto(mapa))))
      : 0;
  const doble = multiplicador(estado) === 2;
  const jugando = fase === 'jugando' || fase === 'pausa';

  return (
    <View style={[styles.raiz, sinGestosDelNavegador]} {...manejadores}>
      <View style={styles.hud}>
        <Dato etiqueta="Puntos" valor={estado.puntos} />
        <Dato etiqueta="Amigos" valor={estado.amigos.length} />
        <View style={styles.hudCentro}>
          {doble ? (
            <View style={styles.doble}>
              <Text style={styles.dobleTexto}>×2 · {segundosDoble(estado)} s</Text>
            </View>
          ) : null}
        </View>
        {jugando ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={fase === 'pausa' ? 'Seguir jugando' : 'Pausar'}
            onPress={alternar}
            hitSlop={8}
            style={styles.botonPausa}
          >
            <Ionicons name={fase === 'pausa' ? 'play' : 'pause'} size={24} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>

      <View
        style={styles.area}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setArea((a) => (a.w === width && a.h === height ? a : { w: width, h: height }));
        }}
      >
        {celda > 0 ? (
          <View
            style={[
              styles.tablero,
              {
                width: celda * ancho(mapa) + BORDE * 2,
                height: celda * alto(mapa) + BORDE * 2,
                borderColor: doble ? DORADO : colors.ink,
              },
            ]}
          >
            <Escenario mapa={mapa} celda={celda} />
            {estado.items.map((it) => {
              // En el ultimo par de segundos, la tapa y la dorada parpadean: se van a ir.
              const aPunto = it.caduca !== null && it.caduca - estado.tiempo < 2 && Math.floor(estado.tiempo * 4) % 2 === 0;
              return (
                <Casilla
                  key={`${it.tipo}-${it.pos.x}-${it.pos.y}`}
                  id={it.tipo}
                  x={it.pos.x}
                  y={it.pos.y}
                  celda={celda}
                  opacidad={aPunto ? 0.35 : 1}
                />
              );
            })}
            {estado.cuerpo.map((p, i) => (
              <Casilla
                key={i}
                id={i === 0 ? 'jugador' : spriteDeAmigo(estado.amigos[i - 1] ?? 0)}
                x={p.x}
                y={p.y}
                celda={celda}
              />
            ))}
          </View>
        ) : null}

        {fase === 'inicio' ? <Inicio control={control} onControl={elegirControl} onEmpezar={empezar} /> : null}
        {fase === 'pausa' ? (
          <View style={styles.velo}>
            <Card style={styles.tarjeta}>
              <Text style={typography.cardTitle}>Pausa</Text>
              <Button title="Seguir" onPress={seguir} />
            </Card>
          </View>
        ) : null}
        {fase === 'choque' ? (
          <View style={styles.choque}>
            <Text style={styles.choqueTexto}>
              {estado.causa === 'completo' ? '¡Mapa lleno!' : estado.causa === 'conga' ? '¡Te has pisado la conga!' : '¡Pumba! Contra la pared'}
            </Text>
          </View>
        ) : null}
      </View>

      {control === 'cruceta' ? <Cruceta onGirar={girarA} /> : null}
    </View>
  );
}

/** Segundos que le quedan al doble, redondeados hacia arriba (0 si no hay). */
function segundosDoble(e: Estado): number {
  return Math.max(0, Math.min(DURACION_DOBLE, Math.ceil(e.dobleHasta - e.tiempo)));
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      <Text style={styles.datoValor}>{valor}</Text>
    </View>
  );
}

/** Suelo y obstaculos: no cambian en toda la partida, asi que se dibujan una vez. */
const Escenario = memo(function Escenario({ mapa, celda }: { mapa: Mapa; celda: number }) {
  return (
    <View
      style={{ width: celda * ancho(mapa), height: celda * alto(mapa), backgroundColor: SUELO }}
      renderToHardwareTextureAndroid
    >
      {obstaculos(mapa).map((o) => (
        <Casilla key={`${o.x}-${o.y}`} id={o.id} x={o.x} y={o.y} celda={celda} />
      ))}
    </View>
  );
});
const Casilla = memo(function Casilla({
  id,
  x,
  y,
  celda,
  opacidad = 1,
}: {
  id: string;
  x: number;
  y: number;
  celda: number;
  opacidad?: number;
}) {
  return (
    <View style={{ position: 'absolute', left: x * celda, top: y * celda, opacity: opacidad }}>
      <Sprite id={id} celda={celda} />
    </View>
  );
});

function Inicio({
  control,
  onControl,
  onEmpezar,
}: {
  control: Control;
  onControl: (c: Control) => void;
  onEmpezar: () => void;
}) {
  return (
    <View style={styles.velo}>
      <ScrollView contentContainerStyle={styles.veloContenido}>
        <Card style={styles.tarjeta}>
          <Text style={typography.cardTitle}>La Conga Cervecera</Text>
          <Text style={[typography.muted, styles.centrado]}>
            Guía la conga por el casco histórico de Alcalá. No te choques con los edificios ni contigo misma.
          </Text>
          <View style={styles.leyenda}>
            <Leyenda id="jarra" texto={`+1 amigo y ${PUNTOS_JARRA} puntos`} />
            <Leyenda id="tapa" texto={`${PUNTOS_TAPA} puntos, dura poco`} />
            <Leyenda id="dorada" texto={`Puntos dobles ${DURACION_DOBLE} s`} />
          </View>
          <Text style={styles.etiqueta}>Controles</Text>
          <View style={styles.opciones}>
            <View style={styles.opcion}>
              <Button
                title="Deslizar"
                variant={control === 'deslizar' ? 'primary' : 'secondary'}
                onPress={() => onControl('deslizar')}
              />
            </View>
            <View style={styles.opcion}>
              <Button
                title="Cruceta"
                variant={control === 'cruceta' ? 'primary' : 'secondary'}
                onPress={() => onControl('cruceta')}
              />
            </View>
          </View>
          <Text style={[typography.muted, styles.centrado]}>
            {control === 'deslizar' ? 'Desliza el dedo por la pantalla para girar.' : 'Usa los botones de abajo para girar.'}
          </Text>
          <Button title="Empezar" onPress={onEmpezar} />
        </Card>
      </ScrollView>
    </View>
  );
}

function Leyenda({ id, texto }: { id: string; texto: string }) {
  return (
    <View style={styles.leyendaFila}>
      <Sprite id={id} celda={28} />
      <Text style={typography.muted}>{texto}</Text>
    </View>
  );
}

const FLECHAS: Record<Dir, { icono: 'chevron-up' | 'chevron-down' | 'chevron-back' | 'chevron-forward'; etiqueta: string }> = {
  arriba: { icono: 'chevron-up', etiqueta: 'Girar arriba' },
  abajo: { icono: 'chevron-down', etiqueta: 'Girar abajo' },
  izquierda: { icono: 'chevron-back', etiqueta: 'Girar a la izquierda' },
  derecha: { icono: 'chevron-forward', etiqueta: 'Girar a la derecha' },
};

function Cruceta({ onGirar }: { onGirar: (d: Dir) => void }) {
  const flecha = (dir: Dir) => (
    // onPressIn y no onPress: el giro cuenta al tocar, no al levantar el dedo.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={FLECHAS[dir].etiqueta}
      onPressIn={() => onGirar(dir)}
      style={({ pressed }) => [styles.flecha, pressed && styles.flechaPulsada]}
    >
      <Ionicons name={FLECHAS[dir].icono} size={34} color={colors.white} />
    </Pressable>
  );
  return (
    <View style={styles.cruceta}>
      {flecha('arriba')}
      <View style={styles.crucetaFila}>
        {flecha('izquierda')}
        {flecha('abajo')}
        {flecha('derecha')}
      </View>
    </View>
  );
}

const TAM_FLECHA = 60;

const styles = StyleSheet.create({
  raiz: { flex: 1, gap: space.sm },
  hud: { flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: 48 },
  hudCentro: { flex: 1, alignItems: 'center' },
  dato: { minWidth: 56 },
  datoEtiqueta: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.inkSoft },
  datoValor: { fontSize: 24, fontWeight: '800', color: colors.beerDark },
  doble: { backgroundColor: DORADO, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  dobleTexto: { fontSize: 14, fontWeight: '800', color: colors.ink },
  botonPausa: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.beerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tablero: { borderWidth: BORDE, borderRadius: radius.sm, overflow: 'hidden' },
  velo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(246, 239, 226, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
  },
  veloContenido: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  tarjeta: { alignItems: 'center', gap: space.md, maxWidth: 420, width: '100%' },
  centrado: { textAlign: 'center' },
  leyenda: { alignSelf: 'stretch', gap: space.xs },
  leyendaFila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  etiqueta: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.inkSoft },
  opciones: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  opcion: { flex: 1 },
  choque: { pointerEvents: 'none', position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0, alignItems: 'center', justifyContent: 'center' },
  choqueTexto: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    backgroundColor: colors.danger,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    textAlign: 'center',
  },
  cruceta: { alignItems: 'center', gap: space.sm, paddingBottom: space.sm },
  crucetaFila: { flexDirection: 'row', gap: space.sm },
  flecha: {
    width: TAM_FLECHA + 12,
    height: TAM_FLECHA,
    borderRadius: radius.lg,
    backgroundColor: colors.beer,
    borderWidth: 1,
    borderColor: colors.beerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flechaPulsada: { backgroundColor: colors.beerDark },
});
