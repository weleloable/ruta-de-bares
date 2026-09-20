-- Ruta de Bares - 0029: el catalogo de etiquetas deja de ser provisional.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0028.
-- Idempotente: se puede re-ejecutar sin romper nada (son UPDATE por id fijo e
-- INSERT ... ON CONFLICT DO NOTHING, no redefine ninguna funcion).
--
-- Por que existe. La 0005 sembro 8 etiquetas placeholder ('Etiqueta 1' a
-- 'Etiqueta 8') con una nota explicita: "PROVISIONAL: la lista real se decide
-- mas adelante y nunca debe incluir categorias sensibles (orientacion, salud,
-- religion)". Esta migracion es esa decision: sustituye las 8 placeholder por
-- su version real y anade 22 mas, hasta 30 en total.
--
-- La regla de fondo, para quien anada o cambie una etiqueta en el futuro:
-- SOLO rasgos de comportamiento en la ruta (que bebe, como se lo monta, si
-- madruga), NUNCA nada de identidad. El art. 9 del RGPD considera "categoria
-- especial" (mas protegida, y en principio prohibida de tratar sin una base
-- legal reforzada) la orientacion sexual, la salud, la religion, la ideologia
-- politica y la afiliacion sindical. Ninguna etiqueta puede tocar eso, ni de
-- lejos (nada de dietas o alergias, que roza salud).
--
-- No se tocan los `id` de las 8 primeras (siguen siendo 'etiqueta-1' a
-- 'etiqueta-8'): son internos, no se ven en ningun sitio, y cambiarlos
-- forzaria a mover las filas de match_profile_tags en vez de un UPDATE de una
-- columna. Las 22 nuevas siguen la misma numeracion, 'etiqueta-9' a
-- 'etiqueta-30'.

update public.match_tags set label = 'Le pone chupitos'                    where id = 'etiqueta-1';
update public.match_tags set label = 'De cerveza artesana'                 where id = 'etiqueta-2';
update public.match_tags set label = 'Se apunta a un Bombardino Cocodrilo' where id = 'etiqueta-3';
update public.match_tags set label = 'Buena conversación'                  where id = 'etiqueta-4';
update public.match_tags set label = 'El alma de la fiesta'                where id = 'etiqueta-5';
update public.match_tags set label = 'Madruga poco'                        where id = 'etiqueta-6';
update public.match_tags set label = 'Le va la marcha'                     where id = 'etiqueta-7';
update public.match_tags set label = 'Se apunta a lo que sea'              where id = 'etiqueta-8';

insert into public.match_tags (id, label, sort_order) values
  ('etiqueta-9',  'Pide la ronda sin que se lo pidan',  9),
  ('etiqueta-10', 'Conoce el mejor bar de tapas',       10),
  ('etiqueta-11', 'Nunca falla a un brindis',           11),
  ('etiqueta-12', 'Se sabe el nombre del camarero',     12),
  ('etiqueta-13', 'Prefiere el vermú',                  13),
  ('etiqueta-14', 'Sin prisa por el siguiente bar',     14),
  ('etiqueta-15', 'El primero en pedir otra',           15),
  ('etiqueta-16', 'Buen ojo para el mapa',              16),
  ('etiqueta-17', 'Lleva chicle de repuesto',           17),
  ('etiqueta-18', 'Más de charla que de barra',         18),
  ('etiqueta-19', 'Monta el karaoke espontáneo',        19),
  ('etiqueta-20', 'Aguanta bien el ritmo',              20),
  ('etiqueta-21', 'Fan de las tapas gratis',            21),
  ('etiqueta-22', 'Se anima con cualquier excusa',      22),
  ('etiqueta-23', 'Puntual en cada parada',             23),
  ('etiqueta-24', 'El de las fotos de grupo',           24),
  ('etiqueta-25', 'Le pierde un buen vinilo',           25),
  ('etiqueta-26', 'Siempre tiene un chiste malo',       26),
  ('etiqueta-27', 'Buen gusto con la cerveza',          27),
  ('etiqueta-28', 'No falta a ningún sello',            28),
  ('etiqueta-29', 'Le va charlar con desconocidos',     29),
  ('etiqueta-30', 'Anima a repetir la ruta',             30)
on conflict (id) do nothing;
