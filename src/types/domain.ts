// Tipos del dominio, en espejo del esquema de supabase/migrations/0001_init.sql.
// Cambiar aquí y allí a la vez: son el contrato entre app y base de datos.

export type Role = 'admin' | 'user';

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  createdAt: string;
}

export interface Route {
  id: string;
  year: number;
  name: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

/** Bar tal como lo ve un usuario normal (bars_public: sin qr_secret). */
export interface Bar {
  id: string;
  routeId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** Formato "HH:MM:SS" tal como lo devuelve Postgres para columnas `time`. */
  startTime: string;
  endTime: string;
  orderIndex: number;
}

export interface Seal {
  id: string;
  routeId: string;
  barId: string;
  userId: string;
  sealedAt: string;
}

/** Un bar de la ruta combinado con si el usuario ya lo tiene sellado. */
export interface StampEntry {
  bar: Bar;
  sealedAt: string | null;
}
