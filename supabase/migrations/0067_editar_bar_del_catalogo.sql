-- Ruta de Bares - 0067: corregir un bar del catalogo (nombre, ubicacion, imagen).
-- Pegar entero en SQL Editor (Supabase > SQL Editor > New query > Run), DESPUES
-- de la 0066.
-- Idempotente: se puede re-ejecutar sin romper nada (`drop policy if exists`,
-- los `grant` se repiten sin efecto). No rehace ninguna funcion.
--
-- El problema. La 0035 dejo `catalog_bars` con select / insert / delete y SIN
-- update, a proposito ("se anade y se borra"). Resultado: un bar propio con la
-- ubicacion o la imagen mal puestas no se podia arreglar; habia que borrarlo y
-- crearlo otra vez.
--
-- Quien puede. La MISMA regla que borrar: un admin edita los bares que creo el,
-- y cualquier admin los que no tienen autor (los 14 originales de la 0036 y los
-- de quien borro su cuenta). Nadie edita el de otro admin.
--
-- Que se puede tocar. SOLO nombre, ubicacion e imagen (permiso por COLUMNAS):
-- `created_by` y `created_at` no, o se podria quedar uno con el bar de otro
-- cambiandole el autor. Los topes de siempre (nombre 1-60, coordenadas, logo
-- <= 300.000 caracteres) y el nombre unico los siguen aplicando los check y el
-- indice de la 0035.
--
-- Lo que NO cambia. Una ruta que ya uso el bar lleva SU COPIA (`route_bars`:
-- nombre, posicion y logo, para que no dependa del catalogo ni la lea un
-- jugador). Corregir el bar aqui no toca esas paradas: se actualizan al volver
-- a guardar la parada en el editor de la ruta, que es cuando se vuelve a copiar.

grant update (name, lat, lng, logo) on public.catalog_bars to authenticated;

drop policy if exists catalog_bars_update on public.catalog_bars;
create policy catalog_bars_update on public.catalog_bars
  for update to authenticated
  using (public.is_admin() and (created_by = auth.uid() or created_by is null))
  with check (public.is_admin() and (created_by = auth.uid() or created_by is null));
