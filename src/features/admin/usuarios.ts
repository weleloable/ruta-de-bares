import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/database';
import { borrarFotosSobrantes } from '../profile/fotosSobrantes';
import { describirErrorUsuarios, sellosPorRuta, type RutaConSellos } from './usuariosReglas';

/**
 * Llamadas de la pantalla de Usuarios (0068). Todas exigen admin en el servidor
 * (`match_admin_require`): esconder el boton es comodidad, no la proteccion.
 */

type Fns = Database['public']['Functions'];
export type Usuario = Fns['admin_usuarios']['Returns'][number];
export type CuentaBorrada = Fns['admin_cuentas_borradas_lista']['Returns'][number];

function fallo(error: { message: string }): never {
  throw new Error(describirErrorUsuarios(error.message));
}

export async function listarUsuarios(busqueda: string): Promise<Usuario[]> {
  const { data, error } = await supabase.rpc('admin_usuarios', { p_busqueda: busqueda.trim() || null });
  if (error) fallo(error);
  return data ?? [];
}

/** Una cuenta por su id. Lanza «Esa cuenta ya no existe» si otro admin la borro. */
export async function obtenerUsuario(userId: string): Promise<Usuario> {
  const { data, error } = await supabase.rpc('admin_usuario', { p_user_id: userId });
  if (error) fallo(error);
  const fila = data?.[0];
  if (!fila) throw new Error(describirErrorUsuarios('NOT_FOUND'));
  return fila;
}

export async function sellosDeUsuario(userId: string): Promise<RutaConSellos[]> {
  const { data, error } = await supabase.rpc('admin_usuario_sellos', { p_user_id: userId });
  if (error) fallo(error);
  return sellosPorRuta(data ?? []);
}

export async function sellarAMano(userId: string, routeBarId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('admin_sellar', { p_user_id: userId, p_route_bar_id: routeBarId, p_motivo: motivo });
  if (error) fallo(error);
}

/**
 * Borra la cuenta y DESPUES sus fotos. Al reves que Borrar mi cuenta, que las
 * borra antes porque luego nadie podria: aqui un admin si puede, y la limpieza
 * de la 0032 ya trata como sobrante lo de una cuenta que no existe. Si esa
 * limpieza falla, la recoge la siguiente de cualquier admin; la cuenta ya esta
 * borrada, que es lo que se pidio.
 */
export async function borrarCuenta(userId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('admin_borrar_cuenta', { p_user_id: userId, p_motivo: motivo });
  if (error) fallo(error);
  await borrarFotosSobrantes('todas');
}

export async function listarCuentasBorradas(): Promise<CuentaBorrada[]> {
  const { data, error } = await supabase.rpc('admin_cuentas_borradas_lista');
  if (error) fallo(error);
  return data ?? [];
}
