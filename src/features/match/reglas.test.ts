import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  APLAZAMIENTOS_MAX,
  BIO_MAX,
  ETIQUETAS_MAX,
  FILTROS,
  PREGUNTA_ESPERA_MS,
  SOLAPE_SONDEO_MS,
  TEXTOS_POR_PERSONA,
  TEXTO_MAX,
  ZUMBIDO_ESPERA_MS,
  alternarEtiqueta,
  chatsPendientes,
  contarPorFiltro,
  describirErrorCana,
  desdeParaSondeo,
  esperaZumbidoMs,
  estadoPestana,
  estadoPregunta,
  estadoTarjeta,
  fusionarMensajes,
  pasaFiltro,
  teTocaResponder,
  validarPresentacion,
  vistaPreviaChat,
  hayQueMarcarVisto,
  quitarMeGustaRompeConexion,
  type EstadoTarjeta,
  type FilaBandeja,
} from './reglas.ts';

describe('estadoTarjeta', () => {
  it('sin nada es nueva; abierta sin Me gusta es Visto; con Me gusta es Me gusta', () => {
    assert.equal(estadoTarjeta({ my_vote: null, connection_id: null }), 'nuevo');
    assert.equal(estadoTarjeta({ my_vote: 'seen', connection_id: null }), 'visto');
    assert.equal(estadoTarjeta({ my_vote: 'like', connection_id: null }), 'me-gusta');
  });

  it('la conexion gana a tu voto: es lo que el servidor dice ahora mismo', () => {
    assert.equal(estadoTarjeta({ my_vote: 'like', connection_id: 'c1' }), 'conexion');
  });
});

describe('filtros de la grilla', () => {
  const estados: EstadoTarjeta[] = ['nuevo', 'nuevo', 'me-gusta', 'visto', 'conexion'];

  it('en el orden de la especificacion, con Visto en lugar de No me gusta', () => {
    assert.deepEqual(
      FILTROS.map((f) => f.etiqueta),
      ['Todos', 'Me gusta', 'Visto', 'Conexiones', 'Nuevos'],
    );
  });

  it('Me gusta incluye las conexiones (D6) y Todos lo incluye todo', () => {
    assert.deepEqual(contarPorFiltro(estados), {
      todos: 5,
      'me-gusta': 2,
      visto: 1,
      conexiones: 1,
      nuevos: 2,
    });
  });

  it('cada estado cae en Todos y en al menos otro filtro', () => {
    for (const estado of ['nuevo', 'me-gusta', 'visto', 'conexion'] as const) {
      const donde = FILTROS.filter((f) => pasaFiltro(f.id, estado)).map((f) => f.id);
      assert.ok(donde.includes('todos') && donde.length >= 2, `${estado} solo aparece en ${donde}`);
    }
  });
});

describe('mensajes del chat por polling', () => {
  const m = (id: string, segundo: number) => ({ id, created_at: new Date(Date.UTC(2026, 8, 19, 20, 0, segundo)).toISOString() });

  it('fusiona sin repetidos y ordena por hora, tambien un mensaje que llega tarde', () => {
    const actuales = [m('a', 1), m('c', 5)];
    const traidos = [m('c', 5), m('b', 3), m('d', 7)];
    assert.deepEqual(
      fusionarMensajes(actuales, traidos).map((x) => x.id),
      ['a', 'b', 'c', 'd'],
    );
  });

  it('con la misma hora desempata por id, para que el orden no baile entre consultas', () => {
    assert.deepEqual(
      fusionarMensajes([m('z', 1)], [m('y', 1)]).map((x) => x.id),
      ['y', 'z'],
    );
  });

  it('pide desde el ultimo mensaje menos el solape, o todo si no hay nada', () => {
    assert.equal(desdeParaSondeo([]), null);
    assert.equal(desdeParaSondeo([m('a', 1), m('b', 30)]), new Date(Date.UTC(2026, 8, 19, 20, 0, 20)).toISOString());
    assert.equal(SOLAPE_SONDEO_MS, 10_000);
  });
});

describe('esperaZumbidoMs', () => {
  const ahora = new Date(Date.UTC(2026, 8, 19, 20, 0, 40));
  it('sin zumbido previo o pasados 30 s, se puede ya', () => {
    assert.equal(esperaZumbidoMs(null, ahora), 0);
    assert.equal(esperaZumbidoMs(new Date(Date.UTC(2026, 8, 19, 20, 0, 10)).toISOString(), ahora), 0);
  });
  it('dentro de los 30 s dice cuanto falta', () => {
    assert.equal(esperaZumbidoMs(new Date(Date.UTC(2026, 8, 19, 20, 0, 30)).toISOString(), ahora), 20_000);
    assert.equal(ZUMBIDO_ESPERA_MS, 30_000);
  });
});

describe('bandeja de chats', () => {
  const YO = 'yo';
  const fila = (cambios: Partial<FilaBandeja>): FilaBandeja => ({
    question_state: 'none',
    question_asked_by: null,
    last_kind: null,
    last_sender_id: null,
    unread_count: 0,
    ...cambios,
  });

  it('una pregunta que te han hecho manda sobre el ultimo mensaje', () => {
    const f = fila({ question_state: 'pending', question_asked_by: 'otra', last_kind: 'gif', last_sender_id: 'otra' });
    assert.equal(teTocaResponder(f, YO), true);
    assert.equal(vistaPreviaChat(f, YO), 'Te ha preguntado si os tomáis una cerveza');
  });

  it('tu pregunta sin responder no te pide nada a ti', () => {
    const f = fila({ question_state: 'pending', question_asked_by: YO });
    assert.equal(teTocaResponder(f, YO), false);
    assert.equal(vistaPreviaChat(f, YO), 'Esperando su respuesta a la cerveza');
  });

  it('distingue lo que has mandado tu de lo que te han mandado', () => {
    assert.equal(vistaPreviaChat(fila({ last_kind: 'buzz', last_sender_id: YO }), YO), 'Tú: un zumbido');
    assert.equal(vistaPreviaChat(fila({ last_kind: 'buzz', last_sender_id: 'otra' }), YO), 'Te ha mandado un zumbido');
    assert.equal(vistaPreviaChat(fila({}), YO), 'Nueva conexión: saluda con un GIF');
  });

  it('cuenta conversaciones pendientes, no mensajes', () => {
    const filas = [
      fila({ unread_count: 3 }),
      fila({ question_state: 'pending', question_asked_by: 'otra' }),
      fila({ question_state: 'pending', question_asked_by: YO }),
      fila({}),
    ];
    assert.equal(chatsPendientes(filas, YO), 2);
  });
});

describe('estadoPregunta', () => {
  const YO = 'yo';
  const OTRA = 'otra';
  const ahora = new Date(Date.UTC(2026, 8, 19, 22, 0, 0));
  const haceMin = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
  const conexion = (cambios: Partial<Parameters<typeof estadoPregunta>[0]>) => ({
    question_state: 'none' as const,
    question_asked_by: null,
    question_answered_at: null,
    postpone_count: 0,
    my_texts_sent: 0,
    ...cambios,
  });

  it('sin preguntar, cualquiera puede (D4)', () => {
    assert.deepEqual(estadoPregunta(conexion({}), YO, ahora), { tipo: 'disponible', tuvoAplazamiento: false });
  });

  it('una pregunta pendiente: la espera quien pregunto y la responde la otra persona', () => {
    const pendiente = conexion({ question_state: 'pending', question_asked_by: OTRA });
    assert.deepEqual(estadoPregunta(pendiente, OTRA, ahora), { tipo: 'esperando-respuesta' });
    assert.deepEqual(estadoPregunta(pendiente, YO, ahora), { tipo: 'te-toca-responder', ultimoAplazamiento: false });
  });

  it('avisa cuando aplazar otra vez seria el ultimo aplazamiento', () => {
    const segunda = conexion({ question_state: 'pending', question_asked_by: OTRA, postpone_count: 1 });
    assert.deepEqual(estadoPregunta(segunda, YO, ahora), { tipo: 'te-toca-responder', ultimoAplazamiento: true });
  });

  it(`aplazada: hay que esperar ${PREGUNTA_ESPERA_MS / 60_000} min desde la respuesta, y luego vuelve a estar disponible`, () => {
    const aplazada = conexion({
      question_state: 'postponed',
      question_asked_by: YO,
      question_answered_at: haceMin(10),
      postpone_count: 1,
    });
    assert.deepEqual(estadoPregunta(aplazada, YO, ahora), {
      tipo: 'aplazada',
      disponibleEnMs: 20 * 60_000,
      teLoAplazaron: true,
    });
    assert.equal((estadoPregunta(aplazada, OTRA, ahora) as { teLoAplazaron: boolean }).teLoAplazaron, false);
    assert.deepEqual(estadoPregunta({ ...aplazada, question_answered_at: haceMin(31) }, YO, ahora), {
      tipo: 'disponible',
      tuvoAplazamiento: true,
    });
  });

  it(`tras ${APLAZAMIENTOS_MAX} aplazamientos no se pregunta mas, aunque haya pasado la espera`, () => {
    const agotada = conexion({ question_state: 'postponed', question_answered_at: haceMin(90), postpone_count: 2 });
    assert.deepEqual(estadoPregunta(agotada, YO, ahora), { tipo: 'sin-mas-preguntas' });
  });

  it(`aceptada: ${TEXTOS_POR_PERSONA} textos por persona (D7)`, () => {
    const aceptada = conexion({ question_state: 'accepted' });
    assert.deepEqual(estadoPregunta(aceptada, YO, ahora), { tipo: 'aceptada', textosRestantes: 2 });
    assert.deepEqual(estadoPregunta({ ...aceptada, my_texts_sent: 2 }, YO, ahora), {
      tipo: 'aceptada',
      textosRestantes: 0,
    });
    assert.equal(TEXTO_MAX, 120);
  });
});

describe('ficha: Visto y quitar Me gusta', () => {
  it('solo quitar el Me gusta de una conexion pide confirmacion', () => {
    assert.equal(quitarMeGustaRompeConexion('conexion'), true);
    assert.equal(quitarMeGustaRompeConexion('me-gusta'), false);
  });

  it('abrir la ficha apunta Visto solo si aun no habia nada, como el servidor', () => {
    assert.equal(hayQueMarcarVisto('nuevo'), true);
    for (const estado of ['me-gusta', 'visto', 'conexion'] as const) assert.equal(hayQueMarcarVisto(estado), false);
  });
});

describe('validarPresentacion', () => {
  it('acepta una frase con espacios alrededor y sin etiquetas', () => {
    assert.deepEqual(validarPresentacion({ bio: '  Vengo por el vermut  ', etiquetas: [] }), []);
  });

  it('exige frase, como el servidor (BIO_REQUIRED)', () => {
    assert.equal(validarPresentacion({ bio: '   ', etiquetas: [] }).length, 1);
  });

  it(`cuenta el limite de ${BIO_MAX} sobre la frase recortada`, () => {
    assert.deepEqual(validarPresentacion({ bio: ` ${'x'.repeat(BIO_MAX)} `, etiquetas: [] }), []);
    assert.equal(validarPresentacion({ bio: 'x'.repeat(BIO_MAX + 1), etiquetas: [] }).length, 1);
  });

  it(`no deja mas de ${ETIQUETAS_MAX} etiquetas distintas`, () => {
    const seis = ['a', 'b', 'c', 'd', 'e', 'f'];
    assert.equal(validarPresentacion({ bio: 'Hola', etiquetas: seis }).length, 1);
    // Repetidas cuentan una vez, como el distinct del SQL.
    assert.deepEqual(validarPresentacion({ bio: 'Hola', etiquetas: ['a', 'a', 'b', 'c', 'd', 'e'] }), []);
  });
});

describe('alternarEtiqueta', () => {
  it('marca y desmarca sin mutar la seleccion', () => {
    const inicial = ['a'];
    assert.deepEqual(alternarEtiqueta(inicial, 'b'), ['a', 'b']);
    assert.deepEqual(alternarEtiqueta(inicial, 'a'), []);
    assert.deepEqual(inicial, ['a']);
  });

  it('con el maximo alcanzado no anade, pero si deja quitar', () => {
    const llena = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(alternarEtiqueta(llena, 'f'), llena);
    assert.deepEqual(alternarEtiqueta(llena, 'c'), ['a', 'b', 'd', 'e']);
  });
});

describe('estadoPestana', () => {
  const perfil = (is_active: boolean, adult_confirmed: boolean, has_activated_before: boolean) => ({
    is_active,
    adult_confirmed,
    has_activated_before,
  });

  it('sin ruta no hay nada que activar, aunque este activado', () => {
    assert.deepEqual(estadoPestana(false, perfil(true, true, true)), { tipo: 'sin-ruta' });
  });

  it('la primera vez pide mayoria de edad y presentacion', () => {
    assert.deepEqual(estadoPestana(true, null), { tipo: 'desactivado', primeraVez: true, pideMayoriaDeEdad: true });
    assert.deepEqual(estadoPestana(true, perfil(false, false, false)), {
      tipo: 'desactivado',
      primeraVez: true,
      pideMayoriaDeEdad: true,
    });
  });

  it('tras pausar no vuelve a pedir nada (D8)', () => {
    assert.deepEqual(estadoPestana(true, perfil(false, true, true)), {
      tipo: 'desactivado',
      primeraVez: false,
      pideMayoriaDeEdad: false,
    });
    assert.deepEqual(estadoPestana(true, perfil(true, true, true)), { tipo: 'activado' });
  });
});

describe('describirErrorCana', () => {
  it('traduce los codigos del SQL aunque lleguen con prefijo', () => {
    assert.equal(describirErrorCana('BUZZ_TOO_SOON'), 'Espera un poco antes de otro zumbido.');
    assert.equal(describirErrorCana('ERROR: P0001: TEXT_LIMIT_REACHED'), 'Ya has enviado tus dos mensajes.');
  });

  it('no confunde un codigo con otro que lo contiene', () => {
    assert.equal(describirErrorCana('TEXT_LOCKED'), 'Podréis escribir cuando se acepte la cerveza.');
    assert.notEqual(describirErrorCana('QUESTION_ALREADY_ANSWERED'), describirErrorCana('QUESTION_ALREADY_PENDING'));
  });

  it('deja pasar lo que no es un codigo', () => {
    assert.equal(describirErrorCana('Failed to fetch'), 'Failed to fetch');
  });
});
