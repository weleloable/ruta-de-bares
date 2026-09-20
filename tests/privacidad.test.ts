import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CORREO_PRIVACIDAD, PENDIENTE, RESPONSABLE } from '../src/features/legal/responsable.ts';

/**
 * La informacion sobre el tratamiento de datos (RGPD art. 13).
 *
 * Lo que vigila, y por que:
 *  - que se enlace DONDE se recogen los datos (registro y canje de invitacion),
 *    no escondida en un rincon: el art. 13 obliga a informar en ese momento;
 *  - que mientras el responsable y el correo sean provisionales, la pantalla
 *    lo diga en voz alta. Una politica con huecos, publicada en silencio,
 *    promete cosas que nadie se ha comprometido a cumplir;
 *  - que el texto del HMAC diga las tres cosas que hay que decir, porque es la
 *    parte que menos se entiende y la que peor sienta si sale por sorpresa.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const pantalla = sinComentarios(leer('app/privacidad.tsx'));

describe('se informa donde se recogen los datos', () => {
  it('en el registro', () => {
    const registro = sinComentarios(leer('app/(auth)/registro.tsx')).replace(/["`]/g, "'");
    assert.match(registro, /router\.push\('\/privacidad'\)/);
    assert.match(registro, /Al crear la cuenta aceptas/);
  });

  it('y al canjear una invitacion, que es la otra puerta de entrada', () => {
    const invitacion = sinComentarios(leer('app/invitacion.tsx')).replace(/["`]/g, "'");
    assert.match(invitacion, /router\.push\('\/privacidad'\)/);
    assert.match(invitacion, /Al entrar aceptas/);
  });

  it('la pantalla esta registrada en el Stack', () => {
    assert.match(leer('app/_layout.tsx'), /<Stack\.Screen name="privacidad"/);
  });

  it('se llega SIN sesion, que es cuando se registra la gente', () => {
    // AuthGate manda al login todo lo que no sea publico. /privacidad tiene que
    // estar en esa lista: el art. 13 obliga a informar ANTES de recoger los
    // datos, y el registro se hace sin sesion. Sin esto, el enlace del registro
    // rebota al login (paso, y el test que habia no lo cazo porque solo miraba
    // que AuthGate existiera).
    const layout = sinComentarios(leer('app/_layout.tsx'));
    assert.match(layout, /const enPrivacidad = segments\[0\] === 'privacidad';/);
    const guardia = /if \(!session && ([^)]*)\)/.exec(layout);
    assert.ok(guardia, 'no encuentro el redirect al login');
    assert.match(guardia[1] as string, /!enPrivacidad/);
  });
});

describe('mientras sea un borrador, se dice', () => {
  it('los valores siguen siendo provisionales y la pantalla avisa', () => {
    if (!PENDIENTE) {
      // Ya se cerro: entonces no puede quedar ningun hueco sin rellenar.
      assert.ok(!RESPONSABLE.includes('PENDIENTE'), 'PENDIENTE es false pero el responsable sigue sin nombre');
      assert.ok(!CORREO_PRIVACIDAD.includes('PENDIENTE'), 'PENDIENTE es false pero el correo sigue sin rellenar');
      return;
    }
    assert.match(pantalla, /\{PENDIENTE \?/, 'el aviso de borrador tiene que depender de PENDIENTE');
    assert.match(pantalla, /Borrador/);
  });

  it('el responsable y el correo salen de UN solo sitio', () => {
    // Escritos a mano en la pantalla, al rellenarlos se olvidaria alguno.
    assert.match(pantalla, /\{RESPONSABLE\}/);
    assert.match(pantalla, /\{CORREO_PRIVACIDAD\}/);
  });
});

describe('el texto dice lo que tiene que decir', () => {
  it('lo que se recoge, incluido el GPS de los sellos', () => {
    assert.match(pantalla, /coordenadas y hora/);
  });

  it('cuanto se conserva, sacado de la constante', () => {
    assert.match(pantalla, /\{DIAS_CONSERVACION\}/);
  });

  it('que el registro de moderacion sobrevive al borrado de la cuenta', () => {
    // Es lo mas sorprendente de todo y por eso hay que contarlo antes.
    assert.match(pantalla, /registro de moderación[\s\S]{0,120}borres tu cuenta/);
  });

  it('los derechos, y a donde reclamar si no convence la respuesta', () => {
    for (const trozo of ['Descargar todo lo tuyo', 'Borrar tu cuenta', 'Reclamar una decisi', 'aepd.es']) {
      assert.ok(pantalla.includes(trozo), `falta "${trozo}"`);
    }
  });

  it('que se puede avisar SIN tener cuenta (DSA art. 16)', () => {
    assert.match(pantalla, /no hace falta\s*\n?\s*registrarse para avisarnos/);
  });

  it('y que la edad no se comprueba de verdad', () => {
    assert.match(pantalla, /No lo verificamos/);
  });
});

describe('el HMAC del correo se explica entero', () => {
  const seccion = pantalla.slice(pantalla.indexOf('huella de tu correo'));

  it('que NO es el correo y no sirve para identificar a nadie', () => {
    assert.match(seccion, /no se puede leer/);
    assert.match(seccion, /no sirve para buscarte/);
  });

  it('para que esta: motivos legales y seguridad del servicio', () => {
    assert.match(seccion, /motivos legales/);
    assert.match(seccion, /denuncia/);
    assert.match(seccion, /seguro para el/);
  });

  it('que no se comparte con nadie y cuando muere', () => {
    assert.match(seccion, /Jamás se comparte/);
    assert.match(seccion, /se levanta la sanción/);
  });

  it('y que sale en la descarga de datos, como todo lo demas', () => {
    // Decir que se guarda y esconderlo al pedir los datos seria lo peor de
    // los dos mundos.
    assert.match(seccion, /Mis datos/);
  });
});
