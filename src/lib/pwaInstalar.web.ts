import { useCallback, useSyncExternalStore } from 'react';

import { estaInstalada } from './pwaInstalada';

/**
 * Boton "Instalar App" en Mi perfil.
 *
 * El listener de `beforeinstallprompt` se registra al CARGAR EL MODULO
 * (`iniciarInstalarApp`, llamado desde app/_layout.tsx junto a `iniciarPwa`),
 * no dentro de un efecto de la pantalla de Perfil. Perfil esta detras del
 * login: si el evento llegase mientras se ve el login (el caso normal, es lo
 * primero que se pinta) un listener puesto solo al montar Perfil lo perderia
 * para siempre, porque el navegador no lo repite. Con el modulo escuchando
 * desde el arranque no importa cuando se visite Perfil: useInstalarApp() solo
 * LEE el estado ya capturado (useSyncExternalStore), igual que
 * AvisosCanaProvider lee su burbujita desde cualquier pestana.
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

let eventoCapturado: EventoInstalar | null = null;
let instalandoAhora = false;
let iniciado = false;
const oyentes = new Set<() => void>();

function avisar() {
  for (const oyente of oyentes) oyente();
}

export function iniciarInstalarApp(): void {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;

  const modoStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (estaInstalada(modoStandalone, iosStandalone)) return;

  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sin esto Chrome pinta su propia barra ademas del boton de la app.
    evento.preventDefault();
    eventoCapturado = evento as EventoInstalar;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    eventoCapturado = null;
    avisar();
  });
}

function suscribir(callback: () => void) {
  oyentes.add(callback);
  return () => oyentes.delete(callback);
}

export function useInstalarApp() {
  const disponible = useSyncExternalStore(suscribir, () => eventoCapturado !== null, () => false);
  const instalando = useSyncExternalStore(suscribir, () => instalandoAhora, () => false);

  const instalar = useCallback(async () => {
    const evento = eventoCapturado;
    if (!evento) return;
    instalandoAhora = true;
    avisar();
    try {
      await evento.prompt();
      await evento.userChoice;
      // Se acepte o no, el evento ya esta gastado: el navegador no lo repite.
    } finally {
      eventoCapturado = null;
      instalandoAhora = false;
      avisar();
    }
  }, []);

  return { disponible, instalando, instalar };
}
