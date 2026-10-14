import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Red rapida y PARCIAL (lee el codigo): al corregir un bar (0067) las dos
 * validaciones de nombre, la de la pantalla y la del almacen, tienen que quitar
 * el propio bar. Si una se olvida, guardar sin cambiar el nombre dice "Ya hay un
 * bar con ese nombre" y no deja guardar (paso: lo cazo una persona, no un test).
 */
const leer = (ruta: string) => readFileSync(ruta, 'utf8');

describe('corregir un bar: el propio bar no es un nombre repetido', () => {
  it('la pantalla bar-nuevo valida contra el catalogo SIN el bar que edita', () => {
    const codigo = leer('app/editor/[routeId]/bar-nuevo.tsx');
    assert.match(codigo, /validarBarPropio\(borrador, existentesSin\(catalogo, editando \? catalogoId : null\)\)/);
  });

  it('editarBarPropio valida contra el catalogo SIN el bar que edita', () => {
    const codigo = leer('src/features/routes/catalogoStore.ts');
    assert.match(codigo, /validarBarPropio\(borrador, existentesSin\(fusion, id\)\)/);
  });
});
