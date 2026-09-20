import { useCallback, useEffect, useRef, useState } from 'react';

import { estaInstalada } from './pwaInstalada';

/**
 * Boton "Instalar App" en Mi perfil.
 *
 * El navegador dispara `beforeinstallprompt` solo cuando la PWA es instalable
 * Y TODAVIA NO ESTA instalada (Chrome/Edge/Android). Con eso basta para
 * "aparece solo si falta instalar": si el evento no llega, no se ofrece nada.
 * Safari (iOS/iPadOS) nunca lo dispara -- ahi no hay boton posible, toca
 * "Compartir > Anadir a pantalla de inicio" a mano -- por eso ademas se
 * comprueba `display-mode: standalone` y `navigator.standalone`: si ya esta
 * instalada por esa via, tampoco se escucha el evento.
 */

interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function yaInstalada(): boolean {
  if (typeof window === 'undefined') return true;
  const modoStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return estaInstalada(modoStandalone, iosStandalone);
}

export function useInstalarApp() {
  const eventoRef = useRef<EventoInstalar | null>(null);
  const [disponible, setDisponible] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || yaInstalada()) return;

    function onBeforeInstallPrompt(evento: Event) {
      // Sin esto Chrome pinta su propia barra ademas del boton de la app.
      evento.preventDefault();
      eventoRef.current = evento as EventoInstalar;
      setDisponible(true);
    }
    function onAppInstalled() {
      eventoRef.current = null;
      setDisponible(false);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const instalar = useCallback(async () => {
    const evento = eventoRef.current;
    if (!evento) return;
    setInstalando(true);
    try {
      await evento.prompt();
      await evento.userChoice;
      // Se acepte o no, el evento ya esta gastado: el navegador no lo repite.
    } finally {
      eventoRef.current = null;
      setDisponible(false);
      setInstalando(false);
    }
  }, []);

  return { disponible, instalando, instalar };
}
