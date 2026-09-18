import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  APLAZAMIENTOS_MAX,
  BIO_MAX,
  ETIQUETAS_MAX,
  PREGUNTA_ESPERA_MS,
  TEXTOS_POR_PERSONA,
  TEXTO_MAX,
  DETALLE_MAX,
  MOTIVOS_DENUNCIA,
} from '../src/features/match/reglas.ts';
import { leerFichero } from './pglite-supabase.ts';

/**
 * src/features/match/reglas.ts repite numeros de la migracion para la
 * interfaz. Si alguien cambia uno de los dos lados, la pantalla deja pasar lo
 * que el servidor rechaza (o bloquea lo que acepta) sin que nada falle. Esto
 * los compara leyendo el SQL real.
 */

const sql = leerFichero('supabase/migrations/0004_tirate_una_cana.sql').replace(/--.*$/gm, '');
// La 0007 rehizo match_send_text (un solo texto por persona) y retiro GIFs y
// zumbidos, asi que esos limites hay que buscarlos alli.
const sql0007 = leerFichero('supabase/migrations/0007_cana_solo_la_pregunta.sql').replace(/--.*$/gm, '');
const sql0008 = leerFichero('supabase/migrations/0008_cana_bloqueos_denuncias.sql').replace(/--.*$/gm, '');

describe('reglas.ts es espejo de 0004_tirate_una_cana.sql', () => {
  it('longitud maxima de la frase', () => {
    assert.match(sql, new RegExp(`bio\\s+text not null default '' check \\(char_length\\(bio\\) <= ${BIO_MAX}\\)`));
    assert.match(sql, new RegExp(`char_length\\(v_bio\\) > ${BIO_MAX}\\b`));
  });

  it('numero maximo de etiquetas', () => {
    assert.match(sql, new RegExp(`cardinality\\(v_tags\\) > ${ETIQUETAS_MAX}\\b`));
  });

  it('espera y limite de aplazamientos de la pregunta (D5)', () => {
    assert.match(sql, new RegExp(`question_answered_at \\+ interval '${PREGUNTA_ESPERA_MS / 60_000} minutes'`));
    assert.match(sql, new RegExp(`postpone_count >= ${APLAZAMIENTOS_MAX}\\b`));
    assert.match(sql, new RegExp(`check \\(postpone_count between 0 and ${APLAZAMIENTOS_MAX}\\)`));
  });

  it('textos tras el Si: cuantos por persona y cuantos caracteres (D7)', () => {
    assert.match(sql0007, new RegExp(`cm\\.texts_sent < ${TEXTOS_POR_PERSONA}\\b`));
    assert.match(sql0007, new RegExp(`check \\(texts_sent between 0 and ${TEXTOS_POR_PERSONA}\\)`));
    assert.match(sql0007, new RegExp(`char_length\\(v_body\\) > ${TEXTO_MAX}\\b`));
    assert.match(sql, new RegExp(`check \\(char_length\\(body\\) between 1 and ${TEXTO_MAX}\\)`));
  });

  it('la cana se queda sin GIFs ni zumbidos (0007)', () => {
    assert.match(sql0007, /drop function if exists public\.match_send_gif/);
    assert.match(sql0007, /drop function if exists public\.match_send_buzz/);
    assert.match(sql0007, /drop table if exists public\.match_gifs/);
    assert.match(sql0007, /drop column if exists last_buzz_at/);
    assert.match(sql0007, /check \(kind in \('question', 'answer', 'text'\)\)/);
  });

  it('los motivos de denuncia son los mismos que acepta el SQL (0008)', () => {
    const enSql = sql0008.match(/reason in \(([^)]+)\)/)?.[1] ?? '';
    const motivos = [...enSql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual(MOTIVOS_DENUNCIA.map((m) => m.id), motivos);
  });

  it('longitud del detalle de la denuncia', () => {
    assert.match(sql0008, new RegExp(`check \\(char_length\\(detail\\) <= ${DETALLE_MAX}\\)`));
    assert.match(sql0008, new RegExp(`char_length\\(coalesce\\(p_detail, ''\\)\\) > ${DETALLE_MAX}`));
  });
});
