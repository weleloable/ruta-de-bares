import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { etiquetaDeCuenta } from './avisos.ts';

/**
 * La etiqueta bajo el nombre en Mi perfil.
 *
 * El bug que arregla: `my_restrictions()` existia en SQL y `misRestricciones()`
 * en el cliente, pero no los llamaba ninguna pantalla, asi que a una cuenta
 * SUSPENDIDA Mi perfil le seguia poniendo "Participante". La persona entraba,
 * se encontraba la app a medias y no sabia por que.
 */

const SIN_NADA = { suspended: false, cana_blocked: false };

describe('etiquetaDeCuenta', () => {
  it('a una cuenta normal, "Participante"', () => {
    assert.deepEqual(etiquetaDeCuenta(false, SIN_NADA), { texto: 'Participante', tono: 'normal' });
  });

  it('a un admin, "Administrador"', () => {
    assert.deepEqual(etiquetaDeCuenta(true, SIN_NADA), { texto: 'Administrador', tono: 'admin' });
  });

  it('a una cuenta suspendida se lo dice, que es el bug que se arregla', () => {
    const e = etiquetaDeCuenta(false, { suspended: true, cana_blocked: false });
    assert.equal(e.texto, 'Cuenta suspendida');
    assert.equal(e.tono, 'sancion');
  });

  it('a quien tiene la cana desactivada tambien', () => {
    const e = etiquetaDeCuenta(false, { suspended: false, cana_blocked: true });
    assert.equal(e.texto, 'Caña desactivada');
    assert.equal(e.tono, 'sancion');
  });

  it('la suspension gana al veto de cana: es la sancion que lo explica todo', () => {
    // A quien esta suspendida tambien le falla la cana; decirle "Caña
    // desactivada" seria contarle el sintoma pequeno.
    const e = etiquetaDeCuenta(false, { suspended: true, cana_blocked: true });
    assert.equal(e.texto, 'Cuenta suspendida');
  });

  it('una sancion gana al rol de admin, aunque no deberia poder pasar', () => {
    // A un admin no se le veta (TARGET_IS_ADMIN), asi que esto no ocurre por la
    // via normal. Si ocurriese, enterarse de la sancion importa mas que el rol.
    assert.equal(etiquetaDeCuenta(true, { suspended: true, cana_blocked: false }).texto, 'Cuenta suspendida');
  });

  it('mientras no se sabe (la consulta aun no ha vuelto, o fallo) se ensena la normal', () => {
    // No es una puerta, es un aviso: quien esta suspendido lo nota igual en
    // cuanto intenta algo, y el servidor es quien decide.
    assert.deepEqual(etiquetaDeCuenta(false, null), { texto: 'Participante', tono: 'normal' });
    assert.deepEqual(etiquetaDeCuenta(true, null), { texto: 'Administrador', tono: 'admin' });
  });
});
