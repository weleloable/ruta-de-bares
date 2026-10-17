import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  inclinacionConSigno,
  limitarAngulo,
  type ModoInclinacion,
  type MotivoManual,
} from './inclinacion';
import { useGiro } from './useGiro';

/** Cuanto se espera a la primera lectura antes de dar el sensor por muerto. */
const ESPERA_SENSOR_MS = 1500;

/**
 * De donde sale el angulo del vaso: del acelerometro o, si no lo hay, de un
 * deslizador / el teclado. El angulo va en una REF y no en estado: lo lee el
 * bucle de animacion a cada fotograma y el sensor escribe 20 veces por segundo.
 *
 * `empezar` hay que llamarlo desde un toque: iOS solo pide el permiso de
 * movimiento tras un gesto del usuario.
 *
 * Esta es la version NATIVA (acelerometro de expo-sensors, que en nativo si da
 * la gravedad en g). En web se usa useInclinacion.web.ts: alli expo-sensors da
 * otra cosa (ver ese fichero).
 */
export function useInclinacion() {
  const [modo, setModo] = useState<ModoInclinacion>('inicio');
  const [motivo, setMotivo] = useState<MotivoManual | null>(null);
  const { objetivo, giro, avanzarGiro, apuntar, reiniciar } = useGiro();
  const suscripcion = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parar = useCallback(() => {
    suscripcion.current?.remove();
    suscripcion.current = null;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  const usarManual = useCallback(
    (porque: MotivoManual = 'elegido') => {
      parar();
      reiniciar();
      setMotivo(porque);
      setModo('manual');
    },
    [parar, reiniciar],
  );

  const empezar = useCallback(async () => {
    try {
      if (!(await Accelerometer.isAvailableAsync())) return usarManual('sin-sensor');
      const permiso = await Accelerometer.requestPermissionsAsync();
      if (permiso.status !== 'granted') return usarManual('permiso');

      Accelerometer.setUpdateInterval(50);
      let recibido = false;
      suscripcion.current = Accelerometer.addListener(({ x, y, z }) => {
        const medido = inclinacionConSigno(x, y, z);
        if (medido === null) return;
        recibido = true;
        // Solo se apunta: el suavizado lo hace `avanzarGiro` en cada fotograma.
        apuntar(medido);
      });
      setMotivo(null);
      setModo('sensor');
      // En escritorio el navegador dice "disponible" pero no manda lecturas
      // reales: sin ninguna a tiempo, se pasa al deslizador.
      temporizador.current = setTimeout(() => {
        if (!recibido) usarManual('sin-sensor');
      }, ESPERA_SENSOR_MS);
    } catch {
      usarManual('sin-sensor');
    }
  }, [usarManual]);

  /** Del deslizador o el teclado: siempre hacia un lado (positivo). */
  const fijar = useCallback(
    (grados: number) => apuntar(limitarAngulo(grados)),
    [apuntar],
  );

  useEffect(() => parar, [parar]);

  /** Del deslizador de Pulso de Camarero: CON signo (-60 a 60), a diferencia de `fijar`, que solo da un lado. */
  const fijarConSigno = useCallback((grados: number) => apuntar(grados), [apuntar]);

  return { modo, motivo, objetivo, giro, avanzarGiro, empezar, usarManual, fijar, fijarConSigno };
}
