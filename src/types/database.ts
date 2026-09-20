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
export type MatchReportResolution =
  | 'sin_accion'
  | 'foto_retirada'
  | 'cana_desactivada'
  | 'expulsada_de_ruta'
  | 'cuenta_suspendida'
  | 'otra';

/** Una fila de la bandeja: match_admin_reports (0009). Solo para admins. */
export type MatchAdminReportRow = {
  id: string;
  created_at: string;
  status: MatchReportStatus;
  reason: MatchReportReason;
  detail: string;
  route_id: string;
  reporter_id: string | null;
  reporter_name: string;
  /** null si esa persona se borro la cuenta; el nombre se conserva (0017). */
  reported_id: string | null;
  reported_name: string;
  mensajes: number;
  notified_at: string | null;
  handled_by: string | null;
  handled_at: string | null;
  resolution: MatchReportResolution | null;
};

/** El ticket abierto: match_admin_report (0013, ampliada en la 0014). */
export type MatchAdminTicketRow = MatchAdminReportRow & {
  route_name: string;
  reported_avatar_url: string | null;
  reported_bio: string;
  reported_active: boolean;
  /** Si sigue en la ruta: sin esto se ofreceria expulsar a quien ya no esta. */
  reported_in_route: boolean;
  reported_is_admin: boolean;
  /** Vetos vigentes (0015): deciden si se ofrece vetar o retirar el veto. */
  reported_cana_blocked: boolean;
  reported_route_banned: boolean;
  reported_suspended: boolean;
  handled_by_name: string | null;
  handler_note: string;
};

/** Acciones de moderacion que se le comunican a la persona (0015). */
export type NoticeAction =
  | 'foto_retirada'
  | 'cana_desactivada'
  | 'expulsada_de_ruta'
  | 'cuenta_suspendida'
  | 'cana_reactivada'
  | 'veto_de_ruta_retirado'
  | 'cuenta_reactivada';

/**
 * Un aviso al usuario: my_notices (0015). `reason` es el motivo que se le
 * ensena; la nota interna de quien modera NO viaja aqui.
 */
export type UserNoticeRow = {
  id: string;
  action: NoticeAction;
  route_id: string | null;
  route_name: string;
  reason: string;
  created_at: string;
  read_at: string | null;
};

/** Lo que le impide usar la app ahora mismo: my_restrictions (0015). */
export type MyRestrictionsRow = {
  suspended: boolean;
  suspended_reason: string;
  suspended_at: string | null;
  cana_blocked: boolean;
  cana_reason: string;
};

/** Lo que se le ha hecho a alguien: match_admin_moderaciones (0018). */
export type ModeracionRow = {
  /** Los tres primeros son vetos VIGENTES y se levantan; 'accion' es historial. */
  tipo: 'cuenta' | 'ruta' | 'cana' | 'accion';
  /** null si esa persona se borro la cuenta: el nombre se guardo al sancionar. */
  user_id: string | null;
  user_name: string;
  route_id: string | null;
  route_name: string;
  motivo: string;
  /** Solo en 'accion': foto_retirada, expulsada_de_ruta, veto_retirado... */
  accion: string;
  cuando: string;
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

/** 0020: la foto de perfil nueva pasa por revision de un admin. */
export type AvatarRequestStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'sustituida';

/** Una solicitud de foto, tal como la ve su autora (la RLS solo deja las propias). */
export type AvatarRequestRow = {
  id: string;
  user_id: string;
  /** Ruta dentro del bucket `avatars`: <uid>/<nombre>. La URL la construye la app. */
  foto_path: string;
  thumb_path: string;
  status: AvatarRequestStatus;
  /** El motivo del rechazo; null si no esta rechazada. */
  reason: string | null;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
};

/** Lo que ve el admin: avatar_admin_requests (0020). Nunca trae las sustituidas. */
export type AvatarAdminRequestRow = {
  id: string;
  created_at: string;
  status: Exclude<AvatarRequestStatus, 'sustituida'>;
  reason: string | null;
  user_id: string;
  user_name: string;
  foto_path: string;
  thumb_path: string;
  /** La foto que tiene puesta ahora, para compararla con la nueva. */
  current_avatar_url: string | null;
  current_avatar_thumb_url: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
};

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
      // 0020. Sin Insert ni Update a proposito: solo se escribe por
      // avatar_request_submit() y avatar_admin_decide().
      avatar_requests: {
        Row: AvatarRequestRow;
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
      delete_my_account_blockers: {
        Args: Record<string, never>;
        Returns: string[];
      };
      delete_my_account: {
        Args: Record<string, never>;
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
      // 0020: la foto de perfil nueva pasa por revision. Las URL solo las usa el
      // servidor si quien llama es admin; para el resto se ignoran.
      avatar_request_submit: {
        Args: { p_foto_path: string; p_thumb_path: string; p_foto_url?: string | null; p_thumb_url?: string | null };
        Returns: 'pendiente' | 'aprobada';
      };
      avatar_admin_requests: {
        Args: { p_solo_pendientes?: boolean };
        Returns: AvatarAdminRequestRow[];
      };
      avatar_admin_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      avatar_admin_decide: {
        Args: {
          p_request_id: string;
          p_approve: boolean;
          p_reason?: string;
          p_foto_url?: string | null;
          p_thumb_url?: string | null;
        };
        Returns: undefined;
      };
      match_admin_take: {
        Args: { p_report_id: string };
        Returns: boolean;
      };
      match_admin_mark_notified: {
        Args: { p_report_id: string };
        Returns: undefined;
      };
      // 0015: p_reason es el motivo que se le ensena a la persona y es
      // OBLIGATORIO (el servidor grita REASON_REQUIRED); p_note es la nota
      // interna, que no sale del panel.
      match_admin_remove_photo: {
        Args: { p_user_id: string; p_reason: string; p_report_id?: string | null; p_note?: string };
        Returns: undefined;
      };
      match_admin_deactivate: {
        Args: { p_user_id: string; p_reason: string; p_report_id?: string | null; p_note?: string };
        Returns: undefined;
      };
      match_admin_suspend: {
        Args: { p_user_id: string; p_reason: string; p_report_id?: string | null; p_note?: string };
        Returns: undefined;
      };
      match_admin_lift_cana: {
        Args: { p_user_id: string; p_note?: string };
        Returns: boolean;
      };
      match_admin_lift_route_ban: {
        Args: { p_user_id: string; p_route_id: string; p_note?: string };
        Returns: boolean;
      };
      match_admin_unsuspend: {
        Args: { p_user_id: string; p_note?: string };
        Returns: boolean;
      };
      match_admin_moderaciones: {
        Args: Record<string, never>;
        Returns: ModeracionRow[];
      };
      my_notices: {
        Args: Record<string, never>;
        Returns: UserNoticeRow[];
      };
      my_notice_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      mark_notices_read: {
        Args: Record<string, never>;
        Returns: number;
      };
      my_restrictions: {
        Args: Record<string, never>;
        Returns: MyRestrictionsRow[];
      };
      match_admin_resolve: {
        Args: { p_report_id: string; p_resolution: MatchReportResolution; p_note?: string };
        Returns: undefined;
      };
      // 0014: la medida para cuando lo demas se queda corto. Devuelve si de
      // verdad estaba dentro de la ruta.
      match_admin_remove_from_route: {
        Args: {
          p_user_id: string;
          p_route_id: string;
          p_reason: string;
          p_report_id?: string | null;
          p_note?: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
