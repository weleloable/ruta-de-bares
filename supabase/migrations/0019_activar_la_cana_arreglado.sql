-- Ruta de Bares - 0019: arregla activar la cana, que la 0015 rompio.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0018.
-- Idempotente: se puede re-ejecutar.
--
-- Que estaba roto: activar Tirate una cana por primera vez (o despues de borrar
-- tus datos) fallaba con
--
--     function public.match_set_tags(uuid, text[]) does not exist
--
-- La 0015 tenia que anadirle DOS comprobaciones a `match_activate` (cuenta
-- suspendida y cana vetada) y, en vez de partir del cuerpo que ya funcionaba,
-- lo reescribio de memoria. En esa reescritura:
--
--   * se llamaba a `match_set_tags`, que no existe: las etiquetas se guardan con
--     `match_save_bio_and_tags(uid, bio, tags)`, junto con la frase;
--   * por eso, ademas, las etiquetas no se guardaban nunca;
--   * y el consentimiento y la mayoria de edad se escribian en dos `update`
--     sueltos en vez de en el mismo que enciende la cana, con `clock_timestamp`
--     en lugar de `now()` y sin el `coalesce` que impide que volver a activar
--     pise la fecha del primer consentimiento.
--
-- Solo lo notaba quien activaba la cana POR PRIMERA VEZ (`first_activated_at is
-- null`): a quien ya la habia activado alguna vez y solo la reactivaba, la rama
-- de la frase y las etiquetas ni le tocaba. Y los tests de la 0015 pasaban
-- `p_tag_ids => null`, que es justo el caso que no entra por ahi.
--
-- Esta migracion vuelve al cuerpo de la 0010 tal cual y le anade, y solo, las
-- dos comprobaciones que la 0015 queria meter.

create or replace function public.match_activate(
  p_adult_confirmed boolean default false,
  p_bio text default null,
  p_tag_ids text[] default null,
  p_consent_version text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_perfil  public.match_profiles%rowtype;
  v_version text := btrim(coalesce(p_consent_version, ''));
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  -- Lo unico que anade la 0015: una cuenta suspendida no entra en la cana.
  if public.esta_suspendida(v_uid) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = 'P0001';
  end if;

  insert into public.match_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_perfil from public.match_profiles mp where mp.user_id = v_uid for update;

  -- Y lo otro: el veto va ANTES que nada, para no hacerle rellenar la frase y
  -- las etiquetas a quien va a recibir un no al final.
  if v_perfil.blocked_at is not null then
    raise exception 'CANA_BLOCKED' using errcode = 'P0001';
  end if;

  if v_perfil.adult_confirmed_at is null and not coalesce(p_adult_confirmed, false) then
    raise exception 'ADULT_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;
  if v_perfil.consent_at is null then
    if v_version = '' then
      raise exception 'CONSENT_REQUIRED' using errcode = 'P0001';
    end if;
    if char_length(v_version) > 40 then
      raise exception 'CONSENT_VERSION_INVALID' using errcode = '22023';
    end if;
  end if;
  if v_perfil.first_activated_at is null or p_bio is not null then
    perform public.match_save_bio_and_tags(v_uid, p_bio, p_tag_ids);
  end if;

  update public.match_profiles mp
     set is_active = true,
         adult_confirmed_at = coalesce(mp.adult_confirmed_at, now()),
         first_activated_at = coalesce(mp.first_activated_at, now()),
         -- Se guarda el primero que se dio; volver a activar no lo pisa.
         consent_version = coalesce(mp.consent_version, nullif(v_version, '')),
         consent_at = coalesce(mp.consent_at, case when v_version <> '' then now() end),
         updated_at = now()
   where mp.user_id = v_uid;
end;
$$;

revoke all on function public.match_activate(boolean, text, text[], text) from public, anon;
grant execute on function public.match_activate(boolean, text, text[], text) to authenticated;
