import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  APLAZAMIENTOS_MAX,
  BIO_MAX,
  ETIQUETAS_MAX,
  PREGUNTA_ESPERA_MS,
  TEXTOS_POR_PERSONA,
  TEXTO_MAX,
  ZUMBIDO_ESPERA_MS,
} from '../src/features/match/reglas.ts';
import { leerFichero } from './pglite-supabase.ts';

/**
 * src/features/match/reglas.ts repite numeros de la migracion para la
 * interfaz. Si alguien cambia uno de los dos lados, la pantalla deja pasar lo
 * que el servidor rechaza (o bloquea lo que acepta) sin que nada falle. Esto
 * los compara leyendo el SQL real.
 */

const sql = leerFichero('supabase/migrations/0003_tirate_una_cana.sql').replace(/--.*$/gm, '');

describe('reglas.ts es espejo de 0003_tirate_una_cana.sql', () => {
  it('longitud maxima de la frase', () => {
    assert.match(sql, new RegExp(`bio\\s+text not null default '' check \\(char_length\\(bio\\) <= ${BIO_MAX}\\)`));
    assert.match(sql, new RegExp(`char_length\\(v_bio\\) > ${BIO_MAX}\\b`));
  });

  it('numero maximo de etiquetas', () => {
    assert.match(sql, new RegExp(`cardinality\\(v_tags\\) > ${ETIQUETAS_MAX}\\b`));
  });

  it('espera entre zumbidos', () => {
    assert.match(sql, new RegExp(`last_buzz_at <= now\\(\\) - interval '${ZUMBIDO_ESPERA_MS / 1000} seconds'`));
  });

  it('espera y limite de aplazamientos de la pregunta (D5)', () => {
    assert.match(sql, new RegExp(`question_answered_at \\+ interval '${PREGUNTA_ESPERA_MS / 60_000} minutes'`));
    assert.match(sql, new RegExp(`postpone_count >= ${APLAZAMIENTOS_MAX}\\b`));
    assert.match(sql, new RegExp(`check \\(postpone_count between 0 and ${APLAZAMIENTOS_MAX}\\)`));
  });

  it('textos tras el Si: cuantos por persona y cuantos caracteres (D7)', () => {
    assert.match(sql, new RegExp(`cm\\.texts_sent < ${TEXTOS_POR_PERSONA}\\b`));
    assert.match(sql, new RegExp(`char_length\\(v_body\\) > ${TEXTO_MAX}\\b`));
    assert.match(sql, new RegExp(`check \\(char_length\\(body\\) between 1 and ${TEXTO_MAX}\\)`));
  });
});
