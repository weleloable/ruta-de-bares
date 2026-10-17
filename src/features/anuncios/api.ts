import { supabase } from '../../lib/supabase';
import { anuncioDeFila, type Anuncio, type AnuncioBase, type DuracionMin, type FilaVigente } from './reglas';

/**
 * Anuncios de los admins a una ruta (0074). Todo pasa por funciones del
 * servidor: la tabla no tiene permisos para la app, y quien puede mandar lo
 * decide Postgres (`anuncio_enviar` exige ser admin), no esta pantalla.
 */

/** Lo vigente de esta ruta para quien llama. Sin la 0074, o sin red, devuelve null (nunca rompe la pestana Ruta). */
export async function listarVigentes(rutaId: string): Promise<Anuncio[] | null> {
  const { data, error } = await supabase.rpc('anuncios_vigentes', { p_route: rutaId });
  if (error || !Array.isArray(data)) return null;
  const recibido = Date.now();
  return (data as FilaVigente[]).map((f) => anuncioDeFila(f, recibido));
}

export type Enviado = AnuncioBase & {
  id: string;
  texto: string;
  avisarMovil: boolean;
  autor: string;
  estado: 'vigente' | 'caducado' | 'retirado';
};

type FilaEnviado = {
  id: string;
  texto: string;
  solo_admins: boolean;
  avisar_movil: boolean;
  duracion_min: number;
  autor: string;
  restan_s: number;
  estado: Enviado['estado'];
};

/** Lo enviado a esta ruta, para que un admin lo vea y retire. Lanza si falla (esta pantalla si debe decir por que). */
export async function listarEnviados(rutaId: string): Promise<Enviado[]> {
  const { data, error } = await supabase.rpc('anuncios_enviados', { p_route: rutaId });
  if (error) throw new Error(error.message);
  const recibido = Date.now();
  return ((data ?? []) as FilaEnviado[]).map((f) => ({
    ...anuncioDeFila(
      { id: f.id, texto: f.texto, solo_admins: f.solo_admins, duracion_min: f.duracion_min, hace_s: 0, restan_s: f.restan_s },
      recibido,
    ),
    retirado: f.estado === 'retirado',
    avisarMovil: f.avisar_movil,
    autor: f.autor,
    estado: f.estado,
  }));
}

export async function enviarAnuncio(
  rutaId: string,
  texto: string,
  opciones: { duracionMin: DuracionMin; soloAdmins: boolean; avisarMovil: boolean },
): Promise<void> {
  const { error } = await supabase.rpc('anuncio_enviar', {
    p_route: rutaId,
    p_texto: texto,
    p_duracion: opciones.duracionMin,
    p_solo_admins: opciones.soloAdmins,
    p_avisar_movil: opciones.avisarMovil,
  });
  if (error) throw new Error(error.message);
}

export async function retirarAnuncio(id: string): Promise<void> {
  const { error } = await supabase.rpc('anuncio_retirar', { p_id: id });
  if (error) throw new Error(error.message);
}
