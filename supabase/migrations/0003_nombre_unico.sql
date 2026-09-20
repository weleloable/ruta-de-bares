-- Ruta de Bares - 0003: nombre visible unico, sin espacios, maximo 30 caracteres.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0002.
-- Idempotente: se puede re-ejecutar sin romper nada.
--
-- Por que existe: dos personas con el mismo "Nombre de bartalla" son
-- indistinguibles en la compostelana y en cualquier ranking futuro. La regla
-- vive aqui y no solo en el cliente (rules.ts / api.ts son un espejo, nunca la
-- autoridad, ver CLAUDE.md): un UPDATE hecho a mano en el SQL Editor o desde
-- otra clave de servicio tiene que respetar el mismo limite.
--
-- No se distinguen mayusculas de minusculas ("Marta" y "MARTA" chocan) porque
-- para la gente son el mismo nombre.

-- ---------------------------------------------------------------------------
-- Backfill: normaliza ANTES de imponer la regla las filas que ya la
-- incumplirian (nombres puestos cuando no habia limite). Sin esto, el ALTER
-- TABLE de mas abajo falla con "check constraint ... is violated by some row"
-- en cuanto exista un solo "Il Doctore" con espacio, y la migracion no se
-- puede aplicar (visto en real: asi se encontro este caso).
--
-- Mismo criterio que handle_new_user: sin espacios, <= 30, y si dos filas
-- coinciden despues de normalizar se le anade "-2", "-3"... a la mas
-- reciente; created_at manda, la cuenta mas antigua se queda con el nombre
-- limpio.
-- ---------------------------------------------------------------------------
do $$
declare
  fila      record;
  v_base    text;
  v_intento text;
  v_sufijo  int;
begin
  for fila in
    select id, display_name
    from public.profiles
    where length(display_name) > 30 or display_name ~ '\s'
    order by created_at
  loop
    v_base := left(regexp_replace(fila.display_name, '\s', '', 'g'), 30);
    if v_base = '' then
      v_base := 'rutero';
    end if;

    v_intento := v_base;
    v_sufijo := 1;
    while exists (
      select 1 from public.profiles
      where lower(display_name) = lower(v_intento) and id <> fila.id
    ) loop
      v_sufijo := v_sufijo + 1;
      v_intento := left(v_base, 30 - length('-' || v_sufijo::text)) || '-' || v_sufijo::text;
    end loop;

    update public.profiles set display_name = v_intento where id = fila.id;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Forma valida: sin espacios (ni tabulaciones ni saltos de linea), <= 30.
-- El '' del default de la columna sigue siendo valido (longitud 0, sin
-- espacios): el trigger de abajo nunca deja una fila con el nombre vacio,
-- pero un ALTER a mano en el SQL Editor no tiene por que romperse por eso.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_display_name_formato'
  ) then
    alter table public.profiles
      add constraint profiles_display_name_formato
      check (length(display_name) <= 30 and display_name !~ '\s');
  end if;
end
$$;

-- Parcial (WHERE display_name <> '') y no total: dos filas con '' no deberian
-- poder darse en la practica (el trigger siempre pone un nombre), pero un
-- indice total las bloquearia con un error de unicidad mas dificil de leer
-- que el CHECK de arriba si algo insertase '' a mano.
create unique index if not exists profiles_display_name_lower_idx
  on public.profiles (lower(display_name))
  where display_name <> '';

-- ---------------------------------------------------------------------------
-- El alta (handle_new_user, 0001) tiene que seguir funcionando SIEMPRE, ya
-- venga el nombre de la invitacion o del email: si dos personas coinciden en
-- el nombre por defecto (dos "eduardo" de dominios distintos, por ejemplo),
-- el INSERT violaria la unicidad de arriba y toda la creacion de la cuenta
-- fallaria (el trigger corre en la misma transaccion que auth.users). En vez
-- de eso, se prueba el nombre y si esta cogido se le anade "-2", "-3", etc.
-- hasta encontrar uno libre. El limite de 30 se respeta quitandole sitio a la
-- base para que quepa el sufijo.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base    text;
  v_intento text;
  v_sufijo  int := 1;
begin
  v_base := regexp_replace(
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    '\s', '', 'g'
  );
  v_base := left(v_base, 30);
  if v_base = '' then
    v_base := 'rutero';
  end if;

  v_intento := v_base;
  while exists (
    select 1 from public.profiles where lower(display_name) = lower(v_intento)
  ) loop
    v_sufijo := v_sufijo + 1;
    -- left(v_base, 30 - largo_sufijo) deja sitio exacto para "-N": si v_base ya
    -- mide 30, el sufijo desplaza el final en vez de superar el limite.
    v_intento := left(v_base, 30 - length('-' || v_sufijo::text)) || '-' || v_sufijo::text;
  end loop;

  insert into public.profiles (id, display_name)
  values (new.id, v_intento)
  on conflict (id) do nothing;
  return new;
end;
$$;
