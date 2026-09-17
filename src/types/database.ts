/**
 * Tipos del esquema. Escritos a mano contra
 * supabase/migrations/0001_init.sql: si cambia el SQL, cambia este fichero.
 *
 * Se puede regenerar con:
 *   npx supabase gen types typescript --project-id TU_REF > src/types/database.ts
 */

export type UserRole = 'admin' | 'user';

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type RouteRow = {
  id: string;
  name: string;
  description: string;
  event_date: string | null;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type RouteBarRow = {
  id: string;
  route_id: string;
  sort_order: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  opens_at: string;
  closes_at: string;
  notes: string;
  created_at: string;
};

export type StampRow = {
  id: string;
  user_id: string;
  route_bar_id: string;
  stamped_at: string;
  lat: number;
  lng: number;
  distance_m: number;
};

/**
 * Invitacion a UNA ruta (migracion 0004). No da cuenta: el alta es abierta.
 * Multiuso hasta agotar `max_uses` o caducar.
 *
 * El token va EN CLARO (a diferencia de las invitaciones de cuenta de 0001,
 * que guardaban su sha256): el historial tiene que poder volver a enseñar el
 * enlace. Lo unico que lo protege es la RLS, que solo deja leer a un admin.
 */
export type RouteInviteRow = {
  id: string;
  route_id: string;
  token: string;
  max_uses: number;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

/** Pertenencia a una ruta. Es lo que decide que rutas ve cada usuario. */
export type RouteMemberRow = {
  route_id: string;
  user_id: string;
  invite_id: string | null;
  joined_at: string;
};

type Insert<T, Opcionales extends keyof T> = Omit<T, Opcionales> & Partial<Pick<T, Opcionales>>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Insert<ProfileRow, 'display_name' | 'avatar_url' | 'role' | 'created_at' | 'updated_at'>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      routes: {
        Row: RouteRow;
        Insert: Insert<RouteRow, 'id' | 'description' | 'event_date' | 'is_published' | 'created_at' | 'updated_at'>;
        Update: Partial<RouteRow>;
        Relationships: [];
      };
      route_bars: {
        Row: RouteBarRow;
        Insert: Insert<RouteBarRow, 'id' | 'address' | 'radius_m' | 'notes' | 'created_at'>;
        Update: Partial<RouteBarRow>;
        Relationships: [];
      };
      stamps: {
        Row: StampRow;
        // Sin Insert util a proposito: los sellos solo se crean por claim_stamp().
        Insert: never;
        Update: never;
        Relationships: [];
      };
      route_invites: {
        Row: RouteInviteRow;
        // Sin Insert util a proposito: solo las crea create_route_invite(), que
        // es quien genera el token. El UPDATE existe para anular (revoked_at).
        Insert: never;
        Update: Partial<Pick<RouteInviteRow, 'revoked_at'>>;
        Relationships: [];
      };
      route_members: {
        Row: RouteMemberRow;
        // Igual que stamps: la unica via de entrada es redeem_route_invite().
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      distance_m: {
        Args: { lat1: number; lng1: number; lat2: number; lng2: number };
        Returns: number;
      };
      claim_stamp: {
        Args: { p_route_bar_id: string; p_lat: number; p_lng: number };
        Returns: StampRow;
      };
      is_route_member: {
        Args: { p_route_id: string };
        Returns: boolean;
      };
      /** El token vuelve aqui UNA sola vez: la tabla solo guarda su sha256. */
      create_route_invite: {
        Args: { p_route_id: string; p_max_uses: number; p_expires_in_hours: number };
        Returns: { invite_id: string; invite_token: string; invite_expires_at: string }[];
      };
      /** Devuelve el id de la ruta a la que acaba de entrar quien llama. */
      redeem_route_invite: {
        Args: { p_token: string };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
