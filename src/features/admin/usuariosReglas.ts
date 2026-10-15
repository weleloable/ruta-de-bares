/**
 * Piezas puras de la pantalla de Usuarios (0068), sin red, para node --test.
 * Las llamadas estan en usuarios.ts.
 */

/** Los codigos que gritan admin_sellar / admin_borrar_cuenta, en lenguaje de persona. */
export function describirErrorUsuarios(mensaje: string): string {
  const codigo =
    /\b(NOT_ADMIN|NOT_AUTHENTICATED|REASON_REQUIRED|REASON_TOO_LONG|SELF|ROUTE_NOT_PUBLISHED|ROUTE_NOT_FOUND|ROUTE_BANNED|ACCOUNT_SUSPENDED|NOT_FOUND|TARGET_IS_ADMIN|OWNS_ROUTES|BAR_NOT_FOUND|NOT_STAMPABLE|NOT_A_MEMBER)\b/.exec(
      mensaje,
    )?.[1];
  switch (codigo) {
    case 'NOT_ADMIN':
      return 'Esto es solo para quien está detrás de la barra.';
    case 'NOT_AUTHENTICATED':
      return 'Vuelve a entrar en tu cuenta.';
    case 'REASON_REQUIRED':
      return 'Escribe el motivo (al menos 3 letras).';
    case 'REASON_TOO_LONG':
      return 'El motivo no puede pasar de 300 caracteres.';
    case 'SELF':
      return 'Sobre tu propia cuenta no: tu cuenta se borra desde Mi perfil, y tu sello te lo pone otro admin.';
    case 'ROUTE_NOT_PUBLISHED':
      return 'La ruta aún no está publicada: publícala antes de sellar.';
    case 'NOT_FOUND':
      return 'Esa cuenta ya no existe.';
    case 'ROUTE_NOT_FOUND':
      return 'Esa ruta ya no existe: se ha borrado.';
    case 'ROUTE_BANNED':
      return 'Esa persona está vetada de esa ruta. Para meterla, retira antes el veto en Moderación.';
    case 'ACCOUNT_SUSPENDED':
      return 'Esa cuenta está suspendida. Levanta la suspensión en Moderación antes de meterla en una ruta.';
    case 'TARGET_IS_ADMIN':
      return 'A un administrador no se le borra desde aquí. Quítale antes el rol en Supabase.';
    case 'OWNS_ROUTES':
      return 'Esta cuenta creó rutas: bórralas o pásalas a otra persona antes.';
    case 'BAR_NOT_FOUND':
      return 'Ese bar ya no está en la ruta.';
    case 'NOT_STAMPABLE':
      return 'Esa parada no es un bar: no se sella.';
    case 'NOT_A_MEMBER':
      return 'Esta persona ya no está en esa ruta.';
    default:
      // Sellar mientras otro admin borra la cuenta: la clave ajena salta en crudo.
      if (/foreign key/i.test(mensaje)) return 'Esa cuenta ya no existe.';
      return mensaje;
  }
}

export type SelloFila = {
  route_id: string;
  ruta: string;
  route_bar_id: string;
  bar: string;
  orden: number;
  opens_at: string;
  closes_at: string;
  sellado_at: string | null;
  sellado_por: string | null;
  sellado_motivo: string | null;
};

export type RutaConSellos = { routeId: string; ruta: string; sellados: number; bares: SelloFila[] };

/** Las filas planas del servidor, una tarjeta por ruta, en el orden en que llegan. */
export function sellosPorRuta(filas: readonly SelloFila[]): RutaConSellos[] {
  const rutas: RutaConSellos[] = [];
  for (const f of filas) {
    let r = rutas.find((x) => x.routeId === f.route_id);
    if (!r) {
      r = { routeId: f.route_id, ruta: f.ruta, sellados: 0, bares: [] };
      rutas.push(r);
    }
    r.bares.push(f);
    if (f.sellado_at) r.sellados += 1;
  }
  return rutas;
}

/** 'cerrado' si ya cerro, 'sin-abrir' si aun no ha abierto, null si esta abierto. */
export function estadoPlazo(f: Pick<SelloFila, 'opens_at' | 'closes_at'>, ahora: Date): 'cerrado' | 'sin-abrir' | null {
  if (ahora.getTime() > new Date(f.closes_at).getTime()) return 'cerrado';
  if (ahora.getTime() < new Date(f.opens_at).getTime()) return 'sin-abrir';
  return null;
}
