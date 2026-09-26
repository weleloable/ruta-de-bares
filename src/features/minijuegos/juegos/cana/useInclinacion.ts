import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';

import { anguloDesdeAcelerometro, limitarAngulo, suavizar } from './inclinacion';

/** Cuanto se espera a la primera lectura antes de dar el sensor por muerto. */
const ESPERA_SENSOR_MS = 1500;

export type ModoInclinacion = 'inicio' | 'sensor' | 'manual';

/**
 * De donde sale el angulo del vaso: del acelerometro o, si no lo hay, de un
 * deslizador / el teclado. El angulo va en una REF y no en estado: lo lee el
 * bucle de animacion a cada fotograma y el sensor escribe 20 veces por segundo.
 *
 * `empezar` hay que llamarlo desde un toque: iOS solo pide el permiso de
 * movimiento tras un gesto del usuario.
 */
export function useInclinacion() {
  const [modo, setModo] = useState<ModoInclinacion>('inicio');
  const angulo = useRef(0);
  const suscripcion = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parar = useCallback(() => {
    suscripcion.current?.remove();
    suscripcion.current = null;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  const usarManual = useCallback(() => {
    parar();
    angulo.current = 0;
    setModo('manual');
  }, [parar]);

  const empezar = useCallback(async () => {
    try {
      if (!(await Accelerometer.isAvailableAsync())) return usarManual();
      const permiso = await Accelerometer.requestPermissionsAsync();
      if (permiso.status !== 'granted') return usarManual();

      Accelerometer.setUpdateInterval(50);
      let recibido = false;
      suscripcion.current = Accelerometer.addListener(({ x, y, z }) => {
        const medido = anguloDesdeAcelerometro(x, y, z);
        if (medido === null) return;
        recibido = true;
        angulo.current = suavizar(angulo.current, medido);
      });
      setModo('sensor');
      // En escritorio el navegador dice "disponible" pero no manda lecturas
      // reales: sin ninguna a tiempo, se pasa al deslizador.
      temporizador.current = setTimeout(() => {
        if (!recibido) usarManual();
      }, ESPERA_SENSOR_MS);
    } catch {
      usarManual();
    }
  }, [usarManual]);

  const fijar = useCallback((grados: number) => {
    angulo.current = limitarAngulo(grados);
  }, []);

  useEffect(() => parar, [parar]);

  return { modo, angulo, empezar, usarManual, fijar };
}
