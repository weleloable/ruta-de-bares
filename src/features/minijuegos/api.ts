import { supabase } from '../../lib/supabase';
import type { MaestroBeerRow, MinigameRankingRow } from '../../types/database';
import { traducirErrorMinijuegos } from './errores';

/**
 * Llamadas a las funciones de la 0030. Quien comprueba que estas dentro de la
 * ruta, que no estas suspendida y que la nota es creible es Postgres, no esto:
 * aqui solo se pasan los datos y se traduce el error.
 */

export type ResultadoNota = { best: number; isRecord: boolean };

export async function enviarNota(routeId: string, game: string, score: number): Promise<ResultadoNota> {
  const { data, error } = await supabase.rpc('minigame_submit_score', {
    p_route_id: routeId,
    p_game: game,
    p_score: Math.round(score),
  });
  if (error) throw new Error(traducirErrorMinijuegos(error.message));
  return { best: data.best, isRecord: data.is_record };
}

export async function cargarRanking(routeId: string, game: string, limite = 50): Promise<MinigameRankingRow[]> {
  const { data, error } = await supabase.rpc('minigame_ranking', {
    p_route_id: routeId,
    p_game: game,
    p_limit: limite,
  });
  if (error) throw new Error(traducirErrorMinijuegos(error.message));
  return data ?? [];
}

/** La receta que sale de Maestro Cervecero, en porcentajes enteros (0..100). */
export type RecetaEnviada = {
  nombre: string;
  malta: string;
  levadura: string;
  maceracion: number;
  amargor: number;
  aroma: number;
};

/** El servidor NO recibe la nota ni el estilo: los calcula el a partir de la receta. */
export async function enviarCerveza(routeId: string, r: RecetaEnviada): Promise<void> {
  const { error } = await supabase.rpc('maestro_submit_beer', {
    p_route_id: routeId,
    p_name: r.nombre,
    p_malta: r.malta,
    p_levadura: r.levadura,
    p_maceracion: r.maceracion,
    p_amargor: r.amargor,
    p_aroma: r.aroma,
  });
  if (error) throw new Error(traducirErrorMinijuegos(error.message));
}

export async function listarCervezas(
  routeId: string,
  opciones: { limite?: number; desplazamiento?: number; soloMias?: boolean } = {},
): Promise<MaestroBeerRow[]> {
  const { data, error } = await supabase.rpc('maestro_list_beers', {
    p_route_id: routeId,
    p_limit: opciones.limite ?? 50,
    p_offset: opciones.desplazamiento ?? 0,
    p_only_mine: opciones.soloMias ?? false,
  });
  if (error) throw new Error(traducirErrorMinijuegos(error.message));
  return data ?? [];
}

export async function borrarCerveza(id: string): Promise<void> {
  const { error } = await supabase.rpc('maestro_delete_beer', { p_beer_id: id });
  if (error) throw new Error(traducirErrorMinijuegos(error.message));
}
