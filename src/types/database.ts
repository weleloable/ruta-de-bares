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
  /** Version de 400 px para las listas (0007). NULL en fotos anteriores. */
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

// --- Tirate una cana (0005_tirate_una_cana.sql) -----------------------------

/** 'seen' = Visto: abriste su ficha sin darle Me gusta, o lo quitaste (0005). */
export type MatchVote = 'like' | 'seen';
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
  /** Version de las condiciones que acepto al activar; null si nunca activo (0010). */
  consent_version: string | null;
};

export type MatchGridRow = {
  user_id: string;
  display_name: string;
  /** Foto grande: la ficha se abre desde esta misma fila. */
  avatar_url: string | null;
  /** La que pinta la casilla de la grilla; cae en avatar_url si no hay (0007). */
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
  /** Nunca has abierto este chat: conexion nueva (0011). */
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

/** Motivos que acepta match_report (0009). */
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

/** En que punto esta una denuncia (0009). */
export type MatchReportStatus = 'pendiente' | 'en_revision' | 'resuelta';

/** Como se cierra una denuncia (0009). */
export type MatchReportResolution = 'sin_accion' | 'foto_retirada' | 'cana_desactivada' | 'otra';

/** Una fila de la bandeja: match_admin_reports (0009). Solo para admins. */
export type MatchAdminReportRow = {
  id: string;
  created_at: string;
  status: MatchReportStatus;
  reason: MatchReportReason;
  detail: string;
  route_id: string;
  reporter_id: string;
  reporter_name: string;
  reported_id: string;
  reported_name: string;
  mensajes: number;
  notified_at: string | null;
  handled_by: string | null;
  handled_at: string | null;
  resolution: MatchReportResolution | null;
};

/** El ticket abierto: match_admin_report (0013). Solo para admins. */
export type MatchAdminTicketRow = MatchAdminReportRow & {
  route_name: string;
  reported_avatar_url: string | null;
  reported_bio: string;
  reported_active: boolean;
  handled_by_name: string | null;
  handler_note: string;
};

/**
 * Un mensaje COPIADO al denunciar: match_admin_report_messages (0009). No es
 * una lectura del chat, que sigue cerrado tambien para los admins (D10).
 */
export type MatchAdminReportMessageRow = {
  message_id: string;
  sender_id: string;
  kind: MatchMessageKind;
  body: string | null;
  answer: BeerAnswer | null;
  created_at: string;
};

type Insert<T, Opcionales extends keyof T> = Omit<T, Opcionales> & Partial<Pick<T, Opcionales>>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Insert<ProfileRow, 'display_name' | 'avatar_url' | 'avatar_thumb_url' | 'role' | 'created_at' | 'updated_at'>;
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
      // Bandeja de "Alertas de administracion" (0009 y 0013). Todas exigen
      // is_admin() en el servidor; el rol del cliente solo decide que se pinta.
      match_admin_reports: {
        Args: { p_solo_pendientes?: boolean };
        Returns: MatchAdminReportRow[];
      };
      match_admin_report: {
        Args: { p_report_id: string };
        Returns: MatchAdminTicketRow[];
      };
      match_admin_report_messages: {
        Args: { p_report_id: string };
        Returns: MatchAdminReportMessageRow[];
      };
      match_admin_alert_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      match_admin_take: {
        Args: { p_report_id: string };
        Returns: boolean;
      };
      match_admin_mark_notified: {
        Args: { p_report_id: string };
        Returns: undefined;
      };
      match_admin_remove_photo: {
        Args: { p_user_id: string; p_report_id?: string | null; p_note?: string };
        Returns: undefined;
      };
      match_admin_deactivate: {
        Args: { p_user_id: string; p_report_id?: string | null; p_note?: string };
        Returns: undefined;
      };
      match_admin_resolve: {
        Args: { p_report_id: string; p_resolution: MatchReportResolution; p_note?: string };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
