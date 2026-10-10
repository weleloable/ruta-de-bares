-- Ruta de Bares - 0035: el catalogo de bares propios se comparte entre admins.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0034.
-- Idempotente: se puede re-ejecutar sin romper nada (`if not exists`, `drop
-- policy if exists`, `add column if not exists`). No rehace ninguna funcion.
--
-- Que arregla. Un admin creaba un bar propio (nombre, ubicacion y logo del
-- sello) y se guardaba SOLO en su dispositivo (AsyncStorage / localStorage):
-- los demas admins no lo veian en el desplegable y, aunque alguien lo anadiese
-- a una ruta, a `route_bars` solo llegaban nombre y posicion, asi que los
-- jugadores veian un sello con iniciales. Dos cambios:
--
--   * `catalog_bars`: el catalogo compartido. Lo LEEN y lo ESCRIBEN los admins,
--     nadie mas. No es publica a proposito: los nombres de los bares de una ruta
--     sin publicar son una sorpresa para el grupo.
--   * `route_bars.logo`: el logo se COPIA a la parada al anadirla a una ruta,
--     igual que ya se copian nombre y posicion. Asi la ruta no depende del
--     catalogo, y los jugadores, que no pueden leer `catalog_bars`, ven el sello.
--
-- ORDEN DE DESPLIEGUE: esta migracion va ANTES que la app (al reves que la
-- 0023). La app nueva escribe `route_bars.logo` en cada parada; sin la columna,
-- Postgres contesta que no existe y no se puede guardar NINGUN bar, tampoco los
-- de la lista cerrada. La app vieja con la migracion ya pegada funciona igual.
--
-- Decisiones que conviene conocer:
--
--   * **Solo se anade y se borra, no se edita** (hay `insert` y `delete`, no
--     `update`). Editar un bar compartido cambiaria el logo o el nombre que
--     otros admins ya copiaron a sus rutas, y sin historial no se sabria quien.
--   * **Borrar solo lo borra quien lo creo** (o un admin si el autor borro su
--     cuenta: `created_by` queda a null, y un bar sin dueno no se podria quitar
--     nunca). Lo copiado a `route_bars` no se toca: las rutas siguen igual.
--   * **El nombre es unico sin distinguir mayusculas**: es la clave con la que
--     se recupera el logo y con la que el editor marca "ya esta en la ruta".
--   * **El logo es una data URL de 256 px** (ver `logoPropio.ts`), dentro de la
--     fila, con tope de 300.000 caracteres. No hay bucket de Storage: son unos
--     15-40 KB por bar y evita policies, URL firmadas y ficheros huerfanos.
--     Si crece (fotos grandes, cientos de bares), ahi es donde deja de valer.
--   * El tope se repite en `route_bars.logo`, porque esa columna la escribe el
--     cliente tambien y no tiene por que pasar por `catalog_bars`.

create table if not exists public.catalog_bars (
  id         uuid primary key default gen_random_uuid(),
  name       text not null
             check (length(btrim(name)) between 1 and 60),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  logo       text
             check (logo is null or (logo like 'data:image/%' and length(logo) <= 300000)),
  -- `set null` y no `cascade`: borrarse la cuenta no se lleva el bar de otros.
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Sin distinguir mayusculas ni espacios de los bordes, como `normalizar()` en
-- catalogoPropio.ts.
create unique index if not exists catalog_bars_name_key
  on public.catalog_bars (lower(btrim(name)));

alter table public.catalog_bars enable row level security;

-- La API de la app solo hace select / insert / delete. Lo demas (update,
-- truncate...) fuera: la RLS no protege de truncate (ver 0022).
revoke all on public.catalog_bars from anon, authenticated;
grant select, insert, delete on public.catalog_bars to authenticated;

drop policy if exists catalog_bars_select on public.catalog_bars;
create policy catalog_bars_select on public.catalog_bars
  for select to authenticated
  using (public.is_admin());

-- `created_by = auth.uid()`: nadie anade un bar a nombre de otro admin.
drop policy if exists catalog_bars_insert on public.catalog_bars;
create policy catalog_bars_insert on public.catalog_bars
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

drop policy if exists catalog_bars_delete on public.catalog_bars;
create policy catalog_bars_delete on public.catalog_bars
  for delete to authenticated
  using (public.is_admin() and (created_by = auth.uid() or created_by is null));

-- El logo viaja con la parada. Nullable: los bares de la lista cerrada llevan su
-- logo en assets/ y los propios sin imagen salen con iniciales.
alter table public.route_bars add column if not exists logo text;

alter table public.route_bars drop constraint if exists route_bars_logo_valido;
alter table public.route_bars add constraint route_bars_logo_valido
  check (logo is null or (logo like 'data:image/%' and length(logo) <= 300000));
