-- Ruta de Bares - 0030: las 30 etiquetas de La Caña, en primera persona, con
-- referencias de cultura pop y de bar, y en orden alfabetico.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0029.
-- Idempotente: se puede re-ejecutar sin romper nada (es un UPDATE por id fijo,
-- no redefine ninguna funcion).
--
-- Por que existe. Las de la 0029 describian a la persona en tercera ("Le pone
-- chupitos") y sonaban a ficha. Las etiquetas las elige cada cual para
-- presentarse, asi que se escriben como las diria ella misma, y se sustituyen
-- todas. La 0029 ya estaba publicada, por eso esto es una migracion nueva y no
-- una edicion de aquella.
--
-- Se reutilizan los mismos 30 ids ('etiqueta-1' a 'etiqueta-30'): quien ya
-- tenia marcada una etiqueta la conserva con el texto nuevo en vez de
-- perderla. Los ids no se ven en ningun sitio, por eso no siguen el orden.
--
-- El orden alfabetico se guarda en `sort_order` y no se calcula en la app: la
-- app ya pide el catalogo ordenado por esa columna, y asi el orden lo decide la
-- base para cualquier pantalla. Es el orden del español, sin contar la "¡" ni
-- los puntos suspensivos (Intl.Collator('es', { ignorePunctuation: true })).
-- Quien anada una etiqueta tiene que renumerar, o cae al final.
--
-- La regla de fondo sigue siendo la de la 0029: nada que toque las categorias
-- especiales del art. 9 del RGPD (orientacion, salud, religion, ideologia,
-- afiliacion sindical). "Me va eso del horoscopo" es una aficion, no una
-- creencia; "Therian" va sin mas, sin nada que presuponga el genero de nadie.
-- Maximo 40 caracteres por etiqueta (check de la 0005).

update public.match_tags t
   set label = v.label, sort_order = v.sort_order
  from (values
    ('etiqueta-28', 'Clara con limón y sin vergüenza',         1),
    ('etiqueta-19', 'Coleccionista de funkos',                 2),
    ('etiqueta-30', 'De cañas con Chanquete',                  3),
    ('etiqueta-9',  'De cañas con colegas',                    4),
    ('etiqueta-6',  'De cañas con Don Quijote',                5),
    ('etiqueta-8',  'De cañas con Fernando Alonso',            6),
    ('etiqueta-7',  'De cañas con... Mejor me callo',          7),
    ('etiqueta-10', 'De cañas con quien sea',                  8),
    ('etiqueta-4',  'Digo "bro" 4 veces por frase',            9),
    ('etiqueta-11', 'Farmeo aura',                             10),
    ('etiqueta-24', 'Hago masa madre',                         11),
    ('etiqueta-15', 'Hakuna Matata',                           12),
    ('etiqueta-20', 'Juego al Catan como si fuera la guerra',  13),
    ('etiqueta-23', 'Llevo el Strava hasta al baño',           14),
    ('etiqueta-1',  'Me apunto a un Bombardino Cocodrilo',     15),
    ('etiqueta-14', 'Me va eso del horóscopo',                 16),
    ('etiqueta-22', 'Mis plantas tienen nombre',               17),
    ('etiqueta-27', 'Muy Paquita Salas',                       18),
    ('etiqueta-5',  'No dejo una caña a medias',               19),
    ('etiqueta-13', 'NPC en la vida real',                     20),
    ('etiqueta-17', 'Otaku de manual',                         21),
    ('etiqueta-3',  '¡Quiero mi bocadillo!',                   22),
    ('etiqueta-25', 'Red flag andante',                        23),
    ('etiqueta-16', 'Siuuuuu',                                 24),
    ('etiqueta-18', 'Swiftie',                                 25),
    ('etiqueta-29', 'Team 0,0',                                26),
    ('etiqueta-26', 'Te gano a un hidalgo',                    27),
    ('etiqueta-21', 'Tengo un podcast (lo escucha mi madre)',  28),
    ('etiqueta-12', 'Therian',                                 29),
    ('etiqueta-2',  'Tung Tung Sahur',                         30)
  ) as v(id, label, sort_order)
 where t.id = v.id;
