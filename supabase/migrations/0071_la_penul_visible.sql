-- Ruta de Bares - 0071: La Penul, el minijuego de la historia picante, se activa POR RUTA.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0070.
-- Idempotente: se puede re-ejecutar sin romper nada (solo anade una columna si
-- no existe; no toca datos ni funciones).
--
-- Orden de despliegue: esta migracion va ANTES que la app. La app nueva lee
-- `routes.la_penul_visible`; sin la columna, el editor no podria guardar el
-- interruptor. La app vieja no la lee y no nota nada.
--
-- Que hace
--
--   * `routes.la_penul_visible` (boolean, por defecto false). La Penul es una
--     historia interactiva para adultos: los admins la ven SIEMPRE; el resto de
--     la gente de la ruta, solo cuando un admin enciende este interruptor en el
--     editor. APAGADO por defecto: una ruta nueva o vieja no la ensena hasta que
--     un admin lo decide.
--
-- Quien lee y quien cambia: no hace falta ninguna policy nueva.
--   * routes_select (0004): la gente de la ruta publicada LEE la fila entera,
--     tambien esta columna (la app la necesita para decidir el menu).
--   * routes_write (0001): solo `is_admin()` escribe en `routes`, en TODAS sus
--     columnas. Un miembro normal no puede encenderselo.
--   tests/migration-0071.test.ts lo demuestra contra Postgres.
--
-- ESCONDERLO ES UNA SORPRESA, NO UN SECRETO. Este interruptor solo decide si el
-- juego sale en el MENU. El texto y las imagenes van dentro de la web publicada
-- (el bundle de JavaScript), asi que quien sepa mirarlo los encuentra aunque el
-- interruptor este apagado. No se protege nada con esto.

alter table public.routes add column if not exists la_penul_visible boolean not null default false;

comment on column public.routes.la_penul_visible is
  'La Penul (minijuego para adultos) sale en el menu para todo el mundo de la ruta. Los admins la ven siempre. Solo decide el menu: el contenido va en la web publicada (0071).';
