import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Boton de MANTENER pulsado (servir la cana, abrir el grifo de la siembra), en
 * web. No usa Pressable a proposito: escucha el dedo directamente del navegador
 * (Pointer Events) y solo se suelta cuando ese dedo se levanta.
 *
 * Por que, con lo que se probo en Chrome con tactil emulado:
 *  - **Dos dedos.** React Native (tambien en web) tiene UN solo "dueno" del
 *    toque. Con Pressable, mantener "servir" con un dedo y mover el deslizador
 *    de inclinacion con el otro no funcionaba: o el deslizador no se movia, o
 *    le quitaba el toque al boton y este se soltaba solo. Y la tecnica del juego
 *    es justo esa: servir inclinado y enderezar al final.
 *  - **Gestos del navegador.** Si el dedo se desliza un poco, el navegador
 *    empieza a desplazar la pagina y cancela el toque (`pointercancel`); con una
 *    pulsacion larga, el movil abre la seleccion de texto o el menu contextual.
 *    `touch-action: none`, sin seleccion, sin menu y sin bocadillo de iOS.
 *  - **Salirse del boton.** Mirando el vaso, el dedo se va del boton sin
 *    levantarse. Se captura el puntero: sigue contando hasta que se levanta.
 *  - **Teclado y lector de pantalla** (lo daba Pressable y aqui hay que darlo a
 *    mano): con el foco, Espacio o Enter mantenidos son el dedo; y un "clic"
 *    sin puntero detras (el doble toque de TalkBack o VoiceOver) ALTERNA
 *    abrir y cerrar, porque con un lector no se puede mantener nada.
 *
 * La variante nativa (BotonMantener.tsx) usa Pressable no cancelable.
 */
export function BotonMantener({
  onApretar,
  onSoltar,
  disabled = false,
  style,
  estiloPulsado,
  accessibilityLabel,
  accessibilityHint,
  children,
}: {
  onApretar: () => void;
  onSoltar: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  estiloPulsado?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  accessibilityHint?: string;
  children: ReactNode;
}) {
  const nodo = useRef<View>(null);
  const [pulsado, setPulsado] = useState(false);
  // Refs: los manejadores del DOM se registran una vez y leen siempre lo ultimo.
  const apretar = useRef(onApretar);
  const soltar = useRef(onSoltar);
  const apagado = useRef(disabled);
  apretar.current = onApretar;
  soltar.current = onSoltar;
  apagado.current = disabled;
  const dedo = useRef<number | null>(null);
  // Abierto con el teclado o alternado por un lector de pantalla (no es un dedo).
  const sinDedo = useRef<'tecla' | 'alterno' | null>(null);
  // Hora del ultimo pointerdown/tecla: el clic que el navegador manda DESPUES no es de un lector.
  const ultimoGesto = useRef(0);

  useEffect(() => {
    const el = nodo.current as unknown as HTMLElement | null;
    if (!el) return;
    // Sin gestos del navegador sobre el boton: ni desplazar, ni seleccionar, ni menu.
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.style.setProperty('-webkit-user-select', 'none');
    el.style.setProperty('-webkit-touch-callout', 'none');
    el.style.setProperty('-webkit-tap-highlight-color', 'transparent');

    /** Suelta lo que haya (dedo, tecla o alterno). Solo avisa si de verdad estaba abierto. */
    const soltarTodo = () => {
      if (dedo.current === null && sinDedo.current === null) return;
      dedo.current = null;
      sinDedo.current = null;
      setPulsado(false);
      soltar.current();
    };
    const terminar = (e: PointerEvent) => {
      if (dedo.current === null || e.pointerId !== dedo.current) return;
      // El navegador manda un `click` justo despues de levantar el dedo: no es de un lector
      // (si no se apuntase aqui, tras mantener mas de 0,7 s ese clic volveria a abrir).
      ultimoGesto.current = Date.now();
      soltarTodo();
    };
    const empezar = (e: PointerEvent) => {
      // Solo el boton principal del raton; con el dedo, cualquiera. Un segundo dedo sobre el boton no cuenta.
      if (apagado.current || dedo.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      ultimoGesto.current = Date.now();
      // Si estaba abierto por teclado o lector, el dedo lo hereda (no se abre dos veces).
      const yaAbierto = sinDedo.current !== null;
      sinDedo.current = null;
      dedo.current = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Sin captura (navegador antiguo): las escuchas de `window` cubren lo mismo.
      }
      setPulsado(true);
      if (!yaAbierto) apretar.current();
    };
    const esTecla = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter';
    const teclaAbajo = (e: KeyboardEvent) => {
      if (!esTecla(e)) return;
      e.preventDefault();
      ultimoGesto.current = Date.now();
      if (e.repeat || apagado.current || dedo.current !== null || sinDedo.current !== null) return;
      sinDedo.current = 'tecla';
      setPulsado(true);
      apretar.current();
    };
    const teclaArriba = (e: KeyboardEvent) => {
      if (!esTecla(e) || sinDedo.current !== 'tecla') return;
      ultimoGesto.current = Date.now();
      soltarTodo();
    };
    // Un clic SIN dedo ni tecla justo antes es de un lector de pantalla: alterna.
    const clic = () => {
      if (Date.now() - ultimoGesto.current < 700 || dedo.current !== null) return;
      if (sinDedo.current === 'alterno') return soltarTodo();
      if (apagado.current || sinDedo.current !== null) return;
      sinDedo.current = 'alterno';
      setPulsado(true);
      apretar.current();
    };
    // Perder la captura sin levantar el dedo (el navegador se la quita) tambien es soltar.
    const sinCaptura = (e: PointerEvent) => {
      if (dedo.current !== null && e.pointerId === dedo.current) soltarTodo();
    };
    const sinMenu = (e: Event) => e.preventDefault();
    // Si la pestana se va a segundo plano con el dedo puesto, no llegara el "levantar".
    const oculta = () => {
      if (document.hidden) soltarTodo();
    };
    // Alt-Tab con el raton apretado: la ventana pierde el foco y el "levantar" no llegara.
    const sinFoco = () => soltarTodo();

    el.addEventListener('pointerdown', empezar);
    el.addEventListener('lostpointercapture', sinCaptura);
    el.addEventListener('keydown', teclaAbajo);
    el.addEventListener('keyup', teclaArriba);
    el.addEventListener('click', clic);
    el.addEventListener('contextmenu', sinMenu);
    window.addEventListener('pointerup', terminar);
    window.addEventListener('pointercancel', terminar);
    window.addEventListener('blur', sinFoco);
    document.addEventListener('visibilitychange', oculta);
    return () => {
      el.removeEventListener('pointerdown', empezar);
      el.removeEventListener('lostpointercapture', sinCaptura);
      el.removeEventListener('keydown', teclaAbajo);
      el.removeEventListener('keyup', teclaArriba);
      el.removeEventListener('click', clic);
      el.removeEventListener('contextmenu', sinMenu);
      window.removeEventListener('pointerup', terminar);
      window.removeEventListener('pointercancel', terminar);
      window.removeEventListener('blur', sinFoco);
      document.removeEventListener('visibilitychange', oculta);
      // Desmontarse abierto (se acaba el paso, se sale del juego) tambien es soltar.
      if (dedo.current !== null || sinDedo.current !== null) {
        dedo.current = null;
        sinDedo.current = null;
        soltar.current();
      }
    };
  }, []);

  // Si se apaga con el dedo puesto (se acabo el tiempo), se suelta: no llegara nada mas que lo cierre.
  useEffect(() => {
    if (disabled && (dedo.current !== null || sinDedo.current !== null)) {
      dedo.current = null;
      sinDedo.current = null;
      setPulsado(false);
      soltar.current();
    }
  }, [disabled]);

  return (
    <View
      ref={nodo}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={[style, pulsado && estiloPulsado]}
    >
      {children}
    </View>
  );
}
