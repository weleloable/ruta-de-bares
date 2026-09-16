import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BIO_MAX, ETIQUETAS_MAX, ZUMBIDO_ESPERA_MS } from '../src/features/match/reglas.ts';
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
});
