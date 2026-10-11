import { useCallback, useEffect, useRef, useState } from 'react';

import {
  anguloDesdeAcelerometro,
  limitarAngulo,
  suavizar,
  type ModoInclinacion,
  type MotivoManual,
} from './inclinacion';

/** Cuanto se espera a la primera lectura antes de dar el sensor por muerto. */
const ESPERA_SENSOR_MS = 1500;

/** Lo que Safari en iOS anade a DeviceMotionEvent: hay que pedir permiso (y dentro de un toque). */
type ConPermiso = { requestPermission?: () => Promise<'granted' | 'denied' | 'default'> };

/**
 * Inclinacion en WEB, leyendo la gravedad del evento `devicemotion` del
 * navegador. NO usa `expo-sensors` en web a proposito, por tres cosas que se
 * vieron en su codigo (node_modules/expo-sensors/build/ExponentAccelerometer.web.js):
 *  1. Su "acelerometro" web emite los ANGULOS de `deviceorientation` en
 *     radianes, no la gravedad: `anguloDesdeAcelerometro` daba un angulo
 *     deformado. Aqui se lee `accelerationIncludingGravity`, la misma magnitud
 *     que da el acelerometro nativo, y se usa la misma formula.
 *  2. Antes de pedir el permiso espera a recibir un evento, y en iPhone no
 *     llega ninguno hasta tener permiso: se rendia y pasaba al deslizador.
 *     Ademas lo pedia despues de un `await`, fuera del toque, y Safari lo ignora.
 *     Aqui `empezar` pide el permiso lo PRIMERO, sincrono, dentro del toque.
 *  3. Los sensores de movimiento solo funcionan con https. En `http://` (probar
 *     en el movil contra el ordenador por la IP) no llegan nunca: se detecta y se
 *     dice en pantalla en vez de cambiar al deslizador sin explicar por que.
 *
 * Misma forma que el hook nativo (useInclinacion.ts): CanaPerfecta no distingue.
 */
export function useInclinacion() {
  const [modo, setModo] = useState<ModoInclinacion>('inicio');
  const [motivo, setMotivo] = useState<MotivoManual | null>(null);
  const angulo = useRef(0);
  const quitarEscucha = useRef<(() => void) | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cada eleccion (empezar, pasar al deslizador, salir) invalida lo anterior. El
  // permiso de iOS contesta TARDE: si mientras tanto se eligio el deslizador o se
  // salio del juego, su respuesta ya no manda.
  const intento = useRef(0);
  // Pidiendo permiso: un segundo toque en "Empezar" no abre otro dialogo.
  const pidiendo = useRef(false);

  const parar = useCallback(() => {
    quitarEscucha.current?.();
    quitarEscucha.current = null;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  const usarManual = useCallback(
    (porque: MotivoManual = 'elegido') => {
      intento.current += 1;
      pidiendo.current = false;
      parar();
      angulo.current = 0;
      setMotivo(porque);
      setModo('manual');
    },
    [parar],
  );

  const escuchar = useCallback(() => {
    // Nunca dos escuchas a la vez: la segunda dejaria la primera huerfana, pisando el angulo.
    parar();
    let recibido = false;
    const alMoverse = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g) return;
      const medido = anguloDesdeAcelerometro(g.x ?? Number.NaN, g.y ?? Number.NaN, g.z ?? Number.NaN);
      if (medido === null) return;
      recibido = true;
      // Mismo tope que el deslizador: el movil apaisado daria 90 grados.
      angulo.current = limitarAngulo(suavizar(angulo.current, medido));
    };
    window.addEventListener('devicemotion', alMoverse);
    quitarEscucha.current = () => window.removeEventListener('devicemotion', alMoverse);
    setMotivo(null);
    setModo('sensor');
    // En escritorio el navegador tiene el evento pero no manda lecturas reales.
    temporizador.current = setTimeout(() => {
      if (!recibido) usarManual('sin-sensor');
    }, ESPERA_SENSOR_MS);
  }, [usarManual]);

  /** Llamarlo SIEMPRE desde un toque, y sin `await` antes: iOS solo da el permiso dentro del gesto. */
  const empezar = useCallback(() => {
    // Lo primero, https: en una pagina insegura Chrome ni siquiera expone
    // DeviceMotionEvent, y se tomaria por "no hay sensor" (se vio en Chrome).
    if (typeof window !== 'undefined' && !window.isSecureContext) return usarManual('https');
    if (typeof window === 'undefined' || typeof window.DeviceMotionEvent === 'undefined') {
      return usarManual('sin-sensor');
    }
    const pedir = (window.DeviceMotionEvent as unknown as ConPermiso).requestPermission;
    if (!pedir) return escuchar();
    if (pidiendo.current) return;
    pidiendo.current = true;
    const mio = ++intento.current;
    pedir
      .call(window.DeviceMotionEvent)
      .then((r) => {
        // Llego tarde: ya se eligio el deslizador, se volvio a empezar o se salio.
        if (mio !== intento.current) return;
        pidiendo.current = false;
        if (r === 'granted') escuchar();
        else usarManual('permiso');
      })
      .catch(() => {
        if (mio === intento.current) usarManual('permiso');
      });
  }, [escuchar, usarManual]);

  const fijar = useCallback((grados: number) => {
    angulo.current = limitarAngulo(grados);
  }, []);

  // Al salir: se para todo y se invalida un permiso que aun este por contestar.
  useEffect(
    () => () => {
      intento.current += 1;
      parar();
    },
    [parar],
  );

  return { modo, motivo, angulo, empezar, usarManual, fijar };
}
