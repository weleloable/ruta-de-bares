<<<<<<< HEAD
/**
 * Tipos del esquema. Escritos a mano contra supabase/migrations/ (0001 y
 * 0003): si cambia el SQL, cambia este fichero.
 *
 * Se puede regenerar con:
 *   npx supabase gen types typescript --project-id TU_REF > src/types/database.ts
 */

export type UserRole = 'admin' | 'user';

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  /** Version de 400 px para las listas (0006). NULL en fotos anteriores. */
  avatar_thumb_url: string | null;
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

// --- Tirate una cana (0003_tirate_una_cana.sql) -----------------------------

export type MatchVote = 'like' | 'dislike';
export type BeerQuestionState = 'none' | 'pending' | 'postponed' | 'accepted' | 'rejected';
export type BeerAnswer = 'yes' | 'no' | 'later';
export type MatchMessageKind = 'question' | 'answer' | 'text';

/** Catalogo de etiquetas: la unica tabla match_* que la app lee. */
export type MatchCatalogRow = {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export type MatchProfileState = {
  is_active: boolean;
  bio: string;
  tag_ids: string[];
  adult_confirmed: boolean;
  has_activated_before: boolean;
  /** Version de las condiciones que acepto al activar; null si nunca activo (0009). */
  consent_version: string | null;
};

export type MatchGridRow = {
  user_id: string;
  display_name: string;
  /** Foto grande: la ficha se abre desde esta misma fila. */
  avatar_url: string | null;
  /** La que pinta la casilla de la grilla; cae en avatar_url si no hay (0006). */
  avatar_thumb_url: string | null;
  bio: string;
  tag_ids: string[];
  my_vote: MatchVote | null;
  connection_id: string | null;
  unread_count: number;
};

export type MatchInboxRow = {
  connection_id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  question_state: BeerQuestionState;
  question_asked_by: string | null;
  last_kind: MatchMessageKind | null;
  last_sender_id: string | null;
  last_at: string;
  unread_count: number;
  /** Nunca has abierto este chat: conexion nueva (0010). */
  never_opened: boolean;
};

export type MatchConnectionDetail = {
  connection_id: string;
  route_id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  question_state: BeerQuestionState;
  question_asked_by: string | null;
  question_asked_at: string | null;
  question_answered_at: string | null;
  postpone_count: number;
  my_texts_sent: number;
  other_texts_sent: number;
  server_now: string;
};

/** Motivos que acepta match_report (0008). */
export type MatchReportReason = 'foto' | 'acoso' | 'suplantacion' | 'menor' | 'otro';

export type MatchBlockedRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

export type MatchMessageRow = {
  id: string;
  connection_id: string;
  sender_id: string;
  kind: MatchMessageKind;
  answer: BeerAnswer | null;
  body: string | null;
  created_at: string;
};

type Insert<T, Opcionales extends keyof T> = Omit<T, Opcionales> & Partial<Pick<T, Opcionales>>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Insert<
          ProfileRow,
          'display_name' | 'avatar_url' | 'avatar_thumb_url' | 'role' | 'created_at' | 'updated_at'
        >;
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
      // Del resto de tablas match_* no hay entrada a proposito: no tienen
      // privilegios para la app y todo pasa por las funciones de abajo, asi
      // que un supabase.from('match_votes') ni siquiera compila.
      match_tags: {
        Row: MatchCatalogRow;
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
      is_route_participant: {
        Args: { p_route_id: string; p_user_id: string };
        Returns: boolean;
      };
      match_get_profile: {
        Args: Record<string, never>;
        Returns: MatchProfileState[];
      };
      match_activate: {
        Args: {
          p_adult_confirmed?: boolean;
          p_bio?: string | null;
          p_tag_ids?: string[] | null;
          p_consent_version?: string | null;
        };
        Returns: undefined;
      };
      match_export_my_data: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      match_delete_my_data: {
        Args: Record<string, never>;
        Returns: { conexiones: number; votos: number; mensajes: number };
      };
      match_deactivate: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      match_update_profile: {
        Args: { p_bio: string; p_tag_ids?: string[] | null };
        Returns: undefined;
      };
      match_grid: {
        Args: { p_route_id: string };
        Returns: MatchGridRow[];
      };
      match_vote: {
        Args: { p_route_id: string; p_target_id: string; p_value: MatchVote };
        Returns: { my_vote: MatchVote; connection_id: string | null }[];
      };
      match_inbox: {
        Args: { p_route_id: string };
        Returns: MatchInboxRow[];
      };
      match_get_connection: {
        Args: { p_connection_id: string };
        Returns: MatchConnectionDetail[];
      };
      match_fetch_messages: {
        Args: { p_connection_id: string; p_after?: string | null };
        Returns: MatchMessageRow[];
      };
      match_block: {
        Args: { p_target_id: string };
        Returns: undefined;
      };
      match_unblock: {
        Args: { p_target_id: string };
        Returns: undefined;
      };
      match_blocked_list: {
        Args: Record<string, never>;
        Returns: MatchBlockedRow[];
      };
      match_report: {
        Args: {
          p_route_id: string;
          p_target_id: string;
          p_reason: MatchReportReason;
          p_detail?: string;
          p_connection_id?: string | null;
          p_block?: boolean;
        };
        Returns: string;
      };
      match_send_text: {
        Args: { p_connection_id: string; p_body: string };
        Returns: MatchMessageRow[];
      };
      match_ask_beer: {
        Args: { p_connection_id: string };
        Returns: MatchMessageRow[];
      };
      match_answer_beer: {
        Args: { p_connection_id: string; p_answer: BeerAnswer };
        Returns: { question_state: BeerQuestionState; is_open: boolean }[];
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
=======
/**
 * Tipos del esquema. Escritos a mano contra supabase/migrations/ (0001, 0003
 * y 0004): si cambia el SQL, cambia este fichero.
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

// --- Tirate una cana (0004_tirate_una_cana.sql) -----------------------------

/** 'seen' = Visto: abriste su ficha sin darle Me gusta, o lo quitaste (0004). */
export type MatchVote = 'like' | 'seen';
export type BeerQuestionState = 'none' | 'pending' | 'postponed' | 'accepted' | 'rejected';
export type BeerAnswer = 'yes' | 'no' | 'later';
export type MatchMessageKind = 'gif' | 'buzz' | 'question' | 'answer' | 'text';

/** Catalogo de etiquetas y de GIFs: las dos unicas tablas match_* que la app lee. */
export type MatchCatalogRow = {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export type MatchProfileState = {
  is_active: boolean;
  bio: string;
  tag_ids: string[];
  adult_confirmed: boolean;
  has_activated_before: boolean;
};

export type MatchGridRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  tag_ids: string[];
  my_vote: MatchVote | null;
  connection_id: string | null;
  unread_count: number;
};

export type MatchInboxRow = {
  connection_id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  question_state: BeerQuestionState;
  question_asked_by: string | null;
  last_kind: MatchMessageKind | null;
  last_sender_id: string | null;
  last_at: string;
  unread_count: number;
};

export type MatchConnectionDetail = {
  connection_id: string;
  route_id: string;
  other_user_id: string;
  display_name: string;
  avatar_url: string | null;
  question_state: BeerQuestionState;
  question_asked_by: string | null;
  question_asked_at: string | null;
  question_answered_at: string | null;
  postpone_count: number;
  my_texts_sent: number;
  other_texts_sent: number;
  my_last_buzz_at: string | null;
  server_now: string;
};

export type MatchMessageRow = {
  id: string;
  connection_id: string;
  sender_id: string;
  kind: MatchMessageKind;
  gif_id: string | null;
  answer: BeerAnswer | null;
  body: string | null;
  created_at: string;
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
      // Del resto de tablas match_* no hay entrada a proposito: no tienen
      // privilegios para la app y todo pasa por las funciones de abajo, asi
      // que un supabase.from('match_votes') ni siquiera compila.
      match_tags: {
        Row: MatchCatalogRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      match_gifs: {
        Row: MatchCatalogRow;
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
      is_route_participant: {
        Args: { p_route_id: string; p_user_id: string };
        Returns: boolean;
      };
      match_get_profile: {
        Args: Record<string, never>;
        Returns: MatchProfileState[];
      };
      match_activate: {
        Args: { p_adult_confirmed?: boolean; p_bio?: string | null; p_tag_ids?: string[] | null };
        Returns: undefined;
      };
      match_deactivate: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      match_update_profile: {
        Args: { p_bio: string; p_tag_ids?: string[] | null };
        Returns: undefined;
      };
      match_grid: {
        Args: { p_route_id: string };
        Returns: MatchGridRow[];
      };
      match_mark_seen: {
        Args: { p_route_id: string; p_target_id: string };
        Returns: undefined;
      };
      match_set_like: {
        Args: { p_route_id: string; p_target_id: string; p_liked: boolean };
        Returns: { my_vote: MatchVote; connection_id: string | null }[];
      };
      match_inbox: {
        Args: { p_route_id: string };
        Returns: MatchInboxRow[];
      };
      match_get_connection: {
        Args: { p_connection_id: string };
        Returns: MatchConnectionDetail[];
      };
      match_fetch_messages: {
        Args: { p_connection_id: string; p_after?: string | null };
        Returns: MatchMessageRow[];
      };
      match_send_gif: {
        Args: { p_connection_id: string; p_gif_id: string };
        Returns: MatchMessageRow[];
      };
      match_send_buzz: {
        Args: { p_connection_id: string };
        Returns: MatchMessageRow[];
      };
      match_send_text: {
        Args: { p_connection_id: string; p_body: string };
        Returns: MatchMessageRow[];
      };
      match_ask_beer: {
        Args: { p_connection_id: string };
        Returns: MatchMessageRow[];
      };
      match_answer_beer: {
        Args: { p_connection_id: string; p_answer: BeerAnswer };
        Returns: { question_state: BeerQuestionState; is_open: boolean }[];
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
>>>>>>> f992d72 (Tirate una cana: solo Me gusta, y "Visto" en lugar de No me gusta)
