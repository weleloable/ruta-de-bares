import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { isValidTokenShape } from './link.ts';
import {
  VIGENCIA_MS,
  guardarInvitacionPendiente,
  leerInvitacionPendiente,
  olvidarInvitacionPendiente,
  tomarInvitacionPendiente,
  type Almacen,
} from './pendiente.ts';

const TOKEN = 'aB3-_dEfGhIjKlMnOpQrStUvWxYz0123456789abcde';
const OTRO = 'zZ9-_dEfGhIjKlMnOpQrStUvWxYz0123456789abcde';
const AHORA = 1_800_000_000_000;

/** localStorage de mentira. `roto` simula cookies bloqueadas / modo privado. */
function crearAlmacen(roto = false): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  const falla = () => {
    throw new Error('SecurityError');
  };
  return {
    datos,
    getItem: roto ? falla : (k) => datos.get(k) ?? null,
    setItem: roto ? falla : (k, v) => void datos.set(k, v),
    removeItem: roto ? falla : (k) => void datos.delete(k),
  };
}

describe('invitacion pendiente (solo memoria)', () => {
  beforeEach(() => olvidarInvitacionPendiente({ almacen: null }));
  const sin = { almacen: null } as const;

  it('sin nada guardado no devuelve nada', () => {
    assert.equal(tomarInvitacionPendiente(sin), null);
  });

  it('guarda y devuelve el token', () => {
    guardarInvitacionPendiente(TOKEN, sin);
    assert.equal(tomarInvitacionPendiente(sin), TOKEN);
  });

  it('es de un solo uso: la segunda vez ya no esta', () => {
    guardarInvitacionPendiente(TOKEN, sin);
    tomarInvitacionPendiente(sin);
    assert.equal(
      tomarInvitacionPendiente(sin),
      null,
      'un token que revive mete a alguien en una ruta que ya no esperaba',
    );
  });

  it('guardar otro pisa al anterior: vale el ultimo enlace abierto', () => {
    guardarInvitacionPendiente(TOKEN, sin);
    guardarInvitacionPendiente(OTRO, sin);
    assert.equal(tomarInvitacionPendiente(sin), OTRO);
  });

  it('olvidar lo borra sin tener que consumirlo', () => {
    guardarInvitacionPendiente(TOKEN, sin);
    olvidarInvitacionPendiente(sin);
    assert.equal(tomarInvitacionPendiente(sin), null);
  });
});

describe('leerInvitacionPendiente (lo que usa AuthGate: no destruye)', () => {
  beforeEach(() => olvidarInvitacionPendiente({ almacen: null }));

  it('leerla dos veces devuelve lo mismo: el efecto de AuthGate se repite', () => {
    guardarInvitacionPendiente(TOKEN, { almacen: null });
    assert.equal(leerInvitacionPendiente({ almacen: null }), TOKEN);
    assert.equal(leerInvitacionPendiente({ almacen: null }), TOKEN);
  });

  it('tambien desde el almacen tras una recarga, sin borrarlo', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    olvidarInvitacionPendiente({ almacen: null });
    assert.equal(leerInvitacionPendiente({ almacen, ahora: AHORA }), TOKEN);
    assert.equal(leerInvitacionPendiente({ almacen, ahora: AHORA }), TOKEN);
    assert.equal(almacen.datos.size, 1);
  });

  it('solo olvidar (lo que hace /invitacion al mostrarse con sesion) la consume', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    leerInvitacionPendiente({ almacen, ahora: AHORA });
    olvidarInvitacionPendiente({ almacen });
    assert.equal(leerInvitacionPendiente({ almacen, ahora: AHORA }), null);
  });

  it('respeta la caducidad de 24 h', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    olvidarInvitacionPendiente({ almacen: null });
    assert.equal(leerInvitacionPendiente({ almacen, ahora: AHORA + VIGENCIA_MS + 1 }), null);
  });
});

describe('guardarInvitacionPendiente rechaza lo que no es un token', () => {
  beforeEach(() => olvidarInvitacionPendiente({ almacen: null }));

  it('un valor con mala forma no queda ni en memoria ni en el almacen', () => {
    // El token acaba en una ruta del router: no puede entrar nada que no sea
    // base64url de 43 caracteres, venga de donde venga.
    const almacen = crearAlmacen();
    for (const malo of ['corto', `${TOKEN}&x=1`, `${TOKEN}#`, '', '../../admin', '"><script>']) {
      guardarInvitacionPendiente(malo, { almacen, ahora: AHORA });
      assert.equal(leerInvitacionPendiente({ almacen, ahora: AHORA }), null, malo);
      assert.equal(almacen.datos.size, 0, malo);
    }
  });

  it('un valor malo no pisa el valido que ya habia', () => {
    guardarInvitacionPendiente(TOKEN, { almacen: null });
    guardarInvitacionPendiente('corto', { almacen: null });
    assert.equal(leerInvitacionPendiente({ almacen: null }), TOKEN);
  });
});

describe('invitacion pendiente (reflejada en localStorage, web)', () => {
  beforeEach(() => olvidarInvitacionPendiente({ almacen: null }));

  it('sobrevive a una recarga: memoria vacia, el token sigue en el almacen', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    // Recarga de pagina = el modulo se evalua de nuevo con la memoria a null.
    olvidarInvitacionPendiente({ almacen: null });
    assert.equal(tomarInvitacionPendiente({ almacen, ahora: AHORA + 1000 }), TOKEN);
  });

  it('tomar lo borra tambien del almacen: de un solo uso', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    tomarInvitacionPendiente({ almacen, ahora: AHORA });
    assert.equal(almacen.datos.size, 0);
    assert.equal(tomarInvitacionPendiente({ almacen, ahora: AHORA }), null);
  });

  it('olvidar borra el almacen', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    olvidarInvitacionPendiente({ almacen });
    assert.equal(almacen.datos.size, 0);
  });

  it('caduca a las 24 h: un enlace olvidado no revive una semana despues', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    olvidarInvitacionPendiente({ almacen: null });
    assert.equal(tomarInvitacionPendiente({ almacen, ahora: AHORA + VIGENCIA_MS + 1 }), null);
    assert.equal(almacen.datos.size, 0, 'el caducado se limpia, no se queda ahi');
  });

  it('justo dentro de la vigencia todavia vale', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    olvidarInvitacionPendiente({ almacen: null });
    assert.equal(tomarInvitacionPendiente({ almacen, ahora: AHORA + VIGENCIA_MS }), TOKEN);
  });

  it('un reloj que va hacia atras (guardado en el futuro) no cuela el token', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA + 10_000 });
    olvidarInvitacionPendiente({ almacen: null });
    assert.equal(tomarInvitacionPendiente({ almacen, ahora: AHORA }), null);
  });

  it('el almacen es entrada no fiable: basura, JSON raro o token con mala forma se ignoran', () => {
    const almacen = crearAlmacen();
    const clave = 'rutadebares.invitacion-pendiente';
    const malos = [
      'no es json',
      'null',
      '"texto"',
      '{}',
      JSON.stringify({ token: 42, guardadoEn: AHORA }),
      JSON.stringify({ token: TOKEN }),
      JSON.stringify({ token: TOKEN, guardadoEn: 'ayer' }),
      JSON.stringify({ token: 'corto', guardadoEn: AHORA }),
      JSON.stringify({ token: `${TOKEN}<script>`, guardadoEn: AHORA }),
    ];
    for (const malo of malos) {
      almacen.datos.set(clave, malo);
      assert.equal(tomarInvitacionPendiente({ almacen, ahora: AHORA }), null, malo);
    }
  });

  it('acepta y rechaza exactamente lo mismo que isValidTokenShape (link.ts)', () => {
    const casos = [
      TOKEN,
      OTRO,
      TOKEN.slice(0, 42),
      `${TOKEN}x`,
      `${TOKEN.slice(0, 42)}+`,
      `${TOKEN.slice(0, 42)}=`,
      `${TOKEN.slice(0, 42)}&`,
      `${TOKEN.slice(0, 42)}#`,
      '',
    ];
    const almacen = crearAlmacen();
    for (const caso of casos) {
      almacen.datos.set(
        'rutadebares.invitacion-pendiente',
        JSON.stringify({ token: caso, guardadoEn: AHORA }),
      );
      const esperado = isValidTokenShape(caso) ? caso : null;
      assert.equal(tomarInvitacionPendiente({ almacen, ahora: AHORA }), esperado, caso);
    }
  });

  it('un almacen que lanza (cookies bloqueadas) no rompe nada: queda la memoria', () => {
    const roto = crearAlmacen(true);
    assert.doesNotThrow(() => guardarInvitacionPendiente(TOKEN, { almacen: roto }));
    assert.equal(tomarInvitacionPendiente({ almacen: roto }), TOKEN);
    assert.doesNotThrow(() => olvidarInvitacionPendiente({ almacen: roto }));
  });

  it('la memoria manda sobre el almacen cuando las dos tienen algo', () => {
    const almacen = crearAlmacen();
    guardarInvitacionPendiente(TOKEN, { almacen, ahora: AHORA });
    guardarInvitacionPendiente(OTRO, { almacen: null });
    assert.equal(tomarInvitacionPendiente({ almacen, ahora: AHORA }), OTRO);
    assert.equal(almacen.datos.size, 0, 'y el del almacen tambien se descarta');
  });
});
