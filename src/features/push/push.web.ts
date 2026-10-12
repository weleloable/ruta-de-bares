import { supabase } from '../../lib/supabase';
import { estaInstalada } from '../../lib/pwaInstalada';
import { CLAVE_PUBLICA_PUSH, claveABytes, decidirEstado, type EstadoAvisos } from './estado';

/**
 * Avisos en el movil por Web Push (0064). El service worker (public/sw.js) es
 * quien los ensena; aqui se pide permiso, se suscribe el navegador y se guarda
 * la suscripcion en Supabase (`push_guardar`). En desarrollo no hay service
 * worker, asi que sale "no-soportado".
 */

function esIos(): boolean {
  const n = navigator as Navigator & { maxTouchPoints?: number };
  // iPadOS se presenta como Mac: se distingue por la pantalla tactil.
  return /iPhone|iPad|iPod/.test(n.userAgent) || (/Macintosh/.test(n.userAgent) && (n.maxTouchPoints ?? 0) > 1);
}

function instalada(): boolean {
  const modoStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return estaInstalada(modoStandalone, iosStandalone);
}

const soportado = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** El registro del service worker, si lo hay (sin esperar a `ready`, que en desarrollo no llega nunca). */
async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!soportado()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

async function guardar(s: PushSubscription): Promise<void> {
  const j = s.toJSON();
  const { error } = await supabase.rpc('push_guardar', {
    p_endpoint: s.endpoint,
    p_p256dh: j.keys?.p256dh ?? '',
    p_auth: j.keys?.auth ?? '',
  });
  if (error) throw new Error(/PGRST202|Could not find the function/i.test(error.message) ? 'Falta aplicar la migración 0064 en Supabase.' : error.message);
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (typeof window === 'undefined') return 'no-soportado';
  const reg = await registro();
  const suscrito = reg ? (await reg.pushManager.getSubscription()) !== null : false;
  return decidirEstado({
    soportado: soportado() && reg !== null,
    ios: esIos(),
    instalada: instalada(),
    permiso: 'Notification' in window ? Notification.permission : null,
    suscrito,
  });
}

/** Pide permiso (tiene que ser tras pulsar un boton), suscribe y guarda. */
export async function activarAvisos(): Promise<EstadoAvisos> {
  const reg = await registro();
  if (!reg) return estadoAvisos();
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return estadoAvisos();
  const s =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(CLAVE_PUBLICA_PUSH) }));
  await guardar(s);
  return 'activo';
}

/** Quita la suscripcion de este dispositivo (en Supabase y en el navegador). */
export async function desactivarAvisos(): Promise<void> {
  const reg = await registro();
  const s = reg ? await reg.pushManager.getSubscription() : null;
  if (!s) return;
  await supabase.rpc('push_borrar', { p_endpoint: s.endpoint });
  await s.unsubscribe();
}

/**
 * Al abrir la app: si ya hay permiso, vuelve a guardar la suscripcion (el
 * navegador puede cambiarla, o puede haber entrado otra persona en este movil).
 */
export async function sincronizarAvisos(): Promise<void> {
  try {
    if (!soportado() || Notification.permission !== 'granted') return;
    const reg = await registro();
    const s = reg ? await reg.pushManager.getSubscription() : null;
    if (s) await guardar(s);
  } catch {
    // Sin red o sin la 0064: se intentara la proxima vez.
  }
}
