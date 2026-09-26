-- Ruta de Bares - 0033: que admin ha visto ya el aviso de una ruta terminada.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0032.
-- Idempotente: se puede re-ejecutar sin romper nada (no define funciones; todo
-- lleva "if not exists" o se borra y se crea).
--
-- Por que existe. Cuando una ruta termina, la bandeja de Alertas de
-- administracion le ensena a TODOS los admins un aviso: hay que borrarla antes
-- de que pasen DIAS_CONSERVACION dias (30), porque borrarla es lo que se lleva
-- los datos de la gente que participo (0027). Ese aviso se queda hasta que la
-- ruta se borra. Lo que se apaga antes es el PUNTO ROJO de Mi perfil: en cuanto
-- ese admin ha visto el aviso una vez. Para saber "ya lo vio" hace falta
-- guardarlo, y en la base y no en el movil: si no, el punto volveria a salir en
-- cada dispositivo.
--
-- Que una ruta este terminada NO se guarda aqui ni en ningun sitio: se deduce
-- del cierre de su ultimo bar (routes/estado.ts). Esta tabla solo dice "este
-- admin ya vio el aviso de esta ruta", y la app cruza las dos cosas.
--
-- Una fila por admin y ruta, y cae sola al borrar la ruta (cascade): cuando la
-- ruta se purga, el aviso ya no existe y no hay nada que recordar.

create table if not exists public.admin_rutas_terminadas_vistas (
  admin_id  uuid not null references public.profiles (id) on delete cascade,
  route_id  uuid not null references public.routes (id) on delete cascade,
  vista_el  timestamptz not null default now(),
  primary key (admin_id, route_id)
);

alter table public.admin_rutas_terminadas_vistas enable row level security;

-- Cada admin ve y apunta SOLO lo suyo: que otro admin lo haya visto no apaga tu
-- punto. Quien no es admin no lee ni escribe nada aqui.
drop policy if exists admin_rutas_vistas_select on public.admin_rutas_terminadas_vistas;
create policy admin_rutas_vistas_select on public.admin_rutas_terminadas_vistas
  for select to authenticated
  using (admin_id = auth.uid() and public.is_admin());

drop policy if exists admin_rutas_vistas_insert on public.admin_rutas_terminadas_vistas;
create policy admin_rutas_vistas_insert on public.admin_rutas_terminadas_vistas
  for insert to authenticated
  with check (admin_id = auth.uid() and public.is_admin());

-- Ni actualizar ni borrar: "ya lo vi" no se deshace, y la fila se va sola con
-- la ruta. Tampoco TRUNCATE (la 0022 lo quito de todas las tablas).
revoke all on table public.admin_rutas_terminadas_vistas from anon, authenticated;
grant select, insert on table public.admin_rutas_terminadas_vistas to authenticated;
