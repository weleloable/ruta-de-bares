// Ruta de Bares - Edge Function `enviar-avisos` (migracion 0064).
//
// La despierta la base de datos (pg_net) cuando hay avisos en `push_cola`:
// los coge con `push_cola_reclamar`, los envia por Web Push a cada dispositivo
// de su persona y apunta el resultado con `push_cola_resultado` (los
// dispositivos que ya no existen se borran). Solo contesta a quien trae el
// secreto `x-avisos-secreto`, asi que hay que desactivar "Verify JWT".
//
// Secretos (Edge Functions > Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto:...) y AVISOS_SECRETO. SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type Dispositivo = { endpoint: string; p256dh: string; auth: string };
type Aviso = { id: number; tipo: string; titulo: string; cuerpo: string; url: string; dispositivos: Dispositivo[] };

const SECRETO = Deno.env.get('AVISOS_SECRETO') ?? '';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
);

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function enviar(aviso: Aviso, d: Dispositivo): Promise<'ok' | 'caducado' | 'fallo'> {
  try {
    await webpush.sendNotification(
      { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
      JSON.stringify({
        titulo: aviso.titulo,
        cuerpo: aviso.cuerpo,
        url: aviso.url,
        // Los de La Caña se pisan entre si: el ultimo sustituye al anterior. Los de
        // moderacion (admin, 0066) tambien: ya dicen cuantas cosas hay en total.
        tag: aviso.tipo === 'cana' || aviso.tipo === 'admin' ? aviso.tipo : `${aviso.tipo}-${aviso.id}`,
      }),
      // Un "abre en 10 min" que llega una hora tarde sobra: caduca a los 15 min.
      // Una denuncia o una foto por revisar sigue valiendo horas despues: 12 h.
      { TTL: aviso.tipo === 'admin' ? 12 * 60 * 60 : 15 * 60, urgency: aviso.tipo === 'admin' ? 'normal' : 'high' },
    );
    return 'ok';
  } catch (e) {
    const estado = (e as { statusCode?: number }).statusCode;
    if (estado === 404 || estado === 410) return 'caducado';
    console.error('enviar-avisos: fallo al enviar', estado, (e as Error).message);
    return 'fallo';
  }
}

Deno.serve(async (req) => {
  if (!SECRETO || req.headers.get('x-avisos-secreto') !== SECRETO) {
    return new Response('No autorizado', { status: 401 });
  }

  let enviados = 0;
  // Hasta 5 tandas de 200 por llamada; lo que quede, en la siguiente.
  for (let tanda = 0; tanda < 5; tanda++) {
    const { data, error } = await db.rpc('push_cola_reclamar', { p_limite: 200 });
    if (error) {
      console.error('enviar-avisos: push_cola_reclamar', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    const avisos = (data ?? []) as Aviso[];
    if (avisos.length === 0) break;

    const hechos: number[] = [];
    const caducados: string[] = [];
    await Promise.all(
      avisos.map(async (aviso) => {
        const resultados = await Promise.all(aviso.dispositivos.map((d) => enviar(aviso, d)));
        aviso.dispositivos.forEach((d, i) => {
          if (resultados[i] === 'caducado') caducados.push(d.endpoint);
        });
        // Hecho si llego a alguno o si ninguno puede recibirlo ya. Si todos
        // fallaron por otra cosa, se reintenta (hasta 3 veces).
        if (resultados.length === 0 || resultados.some((r) => r === 'ok') || resultados.every((r) => r === 'caducado')) {
          hechos.push(aviso.id);
        }
      }),
    );
    enviados += hechos.length;

    const { error: errorResultado } = await db.rpc('push_cola_resultado', { p_enviados: hechos, p_caducados: caducados });
    if (errorResultado) console.error('enviar-avisos: push_cola_resultado', errorResultado.message);
    if (avisos.length < 200) break;
  }

  return Response.json({ enviados });
});
