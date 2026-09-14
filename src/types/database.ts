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

export type InviteRow = {
  id: string;
  token_hash: string;
  label: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
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
      invites: {
        Row: InviteRow;
        Insert: Insert<InviteRow, 'id' | 'label' | 'created_at' | 'used_at' | 'used_by'>;
        Update: Partial<InviteRow>;
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
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
