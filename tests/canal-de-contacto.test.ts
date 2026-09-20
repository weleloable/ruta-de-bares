import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * El canal de contacto y reclamacion, cableado (0026).
 *
 * Lo que vigila, y por que cada cosa:
 *  - que la entrada de Mi perfil NO este escondida tras ninguna condicion: es
 *    el punto de contacto del art. 12 del DSA y tiene que estar siempre;
 *  - que cada aviso restrictivo lleve su boton de reclamar, con el id pegado:
 *    es el art. 20, y sin el id la reclamacion no se ata a ninguna decision;
 *  - que la pantalla NO copie los guardianes de la 0016 (estar en una ruta, no
 *    estar sancionado), que es el error facil y rompe justo lo que se busca.
 *
 * Sin renderizador de componentes en el repo, se lee el codigo, como
 * borrar-cuenta.test.ts y barra-superior.test.ts.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('entrada desde Mi perfil (DSA art. 12)', () => {
  const perfil = sinComentarios(leer('app/(tabs)/perfil.tsx')).replace(/["`]/g, "'");

  it('lleva a /contacto', () => {
    assert.match(perfil, /router\.push\('\/contacto'\)/);
  });

  it('no esta detras de isAdmin ni de ninguna condicion', () => {
    // Un punto de contacto que solo ven algunos no es un punto de contacto.
    const boton = /title='Escribir a la organización'[\s\S]{0,200}?\/>/.exec(perfil);
    assert.ok(boton, 'no encuentro el boton');
    const antes = perfil.slice(Math.max(0, perfil.indexOf(boton[0]) - 220), perfil.indexOf(boton[0]));
    assert.doesNotMatch(antes, /isAdmin \?|restricciones\?\.|suspended/);
  });

  it('va en la misma tarjeta que Avisos y Mis datos', () => {
    const iAvisos = perfil.indexOf("router.push('/avisos')");
    const iDatos = perfil.indexOf("router.push('/mis-datos')");
    const iContacto = perfil.indexOf("router.push('/contacto')");
    assert.ok(iAvisos > -1 && iDatos > -1 && iContacto > -1);
    assert.ok(iContacto > iDatos && iDatos > iAvisos, 'el orden es Avisos, Mis datos, Escribir');
  });
});

describe('entrada desde un aviso (DSA art. 20)', () => {
  const avisos = sinComentarios(leer('app/avisos.tsx')).replace(/["`]/g, "'");

  it('cada aviso restrictivo lleva su boton de reclamar', () => {
    assert.match(avisos, /texto\.restriccion \?/);
    assert.match(avisos, /No estoy de acuerdo con esta decisión/);
  });

  it('lleva el id del aviso pegado: sin el no se ata a ninguna decision', () => {
    assert.match(avisos, /pathname: '\/contacto', params: \{ aviso: aviso\.id/);
  });

  it('una buena noticia no ofrece reclamar', () => {
    // Levantar un veto no se reclama: el boton tiene que estar DENTRO de la
    // rama de `restriccion`, no suelto debajo.
    // (Ojo al anclar: `texto.restriccion ?` sale antes en el color del punto.)
    const bloque = /\{texto\.restriccion \? \(([\s\S]*?)\) : null\}/.exec(avisos);
    assert.ok(bloque, 'no encuentro la rama de restriccion del pie del aviso');
    assert.match(bloque[1] as string, /No estoy de acuerdo/);
  });
});

describe('la pantalla de contacto', () => {
  const pantalla = sinComentarios(leer('app/contacto.tsx'));

  it('NO copia los guardianes de la 0016', () => {
    // Quien mas necesita escribir es justo la cuenta suspendida o expulsada.
    for (const guardia of ['esta_suspendida', 'is_route_participant', 'misRestricciones', 'useActiveRoute']) {
      assert.ok(!pantalla.includes(guardia), `la pantalla comprueba ${guardia} y no deberia`);
    }
  });

  it('distingue reclamacion de contacto por el parametro del aviso', () => {
    assert.match(pantalla, /esReclamacion \? 'reclamacion' : 'contacto'/);
    assert.match(pantalla, /esReclamacion \? aviso : null/);
  });

  it('no deja enviar vacio', () => {
    assert.match(pantalla, /disabled=\{!cuerpoValido\(texto\)\}/);
  });

  it('ensena lo que ya se envio y que contestaron', () => {
    assert.match(pantalla, /misMensajes\(\)/);
    assert.match(pantalla, /pieDeMiMensaje\(m\)/);
  });
});

describe('la bandeja del admin', () => {
  const bandeja = sinComentarios(leer('app/admin/alertas.tsx'));
  const ticket = sinComentarios(leer('app/admin/mensaje/[messageId].tsx'));

  it('los mensajes son una tercera fuente, y fallan por su cuenta', () => {
    assert.match(bandeja, /listarAlertasMensajes\(true\)/);
    assert.match(bandeja, /Promise\.allSettled/);
  });

  it('un mensaje abre su propio ticket', () => {
    assert.match(bandeja, /alerta\.tipo === 'mensaje'/);
    assert.match(bandeja, /pathname: '\/admin\/mensaje\/\[messageId\]'/);
  });

  it('el ticket se reclama al abrirlo, como una denuncia', () => {
    assert.match(ticket, /reclamarMensaje\(messageId\)/);
    // Antes de leerlo, para que la lista ya venga con el estado nuevo.
    assert.ok(ticket.indexOf('reclamarMensaje') < ticket.indexOf('await cargar()'));
  });

  it('responder exige texto y avisa del conflicto de interes', () => {
    assert.match(ticket, /disabled=\{!motivoValido\(respuesta\)\}/);
    assert.match(ticket, /avisoDeConflicto\(fila\)/);
  });

  it('la burbujita de Mi perfil los suma', () => {
    const api = sinComentarios(leer('src/features/admin/api.ts'));
    const cuerpo = api.slice(api.indexOf('export async function contarAlertas'));
    assert.match(cuerpo.slice(0, cuerpo.indexOf('\n}\n')), /contarMensajes\(\)/);
  });
});

describe('el aviso de respuesta', () => {
  it('existe como accion y no se marca como restriccion', () => {
    // Si lo fuera, saldria en rojo y con boton de reclamar la respuesta a la
    // propia reclamacion.
    const avisos = leer('src/features/notices/avisos.ts');
    assert.match(avisos, /respuesta_organizacion: \{[\s\S]*?restriccion: false/);
    assert.match(leer('src/types/database.ts'), /'respuesta_organizacion'/);
  });

  it('el SQL lo admite en la lista cerrada de user_notices', () => {
    // Sin esto, responder revienta con una violacion de la restriccion.
    const sql = leer('supabase/migrations/0026_canal_de_contacto.sql');
    assert.match(sql, /user_notices_action_check[\s\S]*?'respuesta_organizacion'/);
    // Y los que ya habia siguen dentro.
    for (const accion of ['foto_retirada', 'cana_desactivada', 'cuenta_reactivada', 'veto_de_ruta_retirado']) {
      assert.match(sql, new RegExp(`'${accion}'`), `${accion} se ha caido de la restriccion`);
    }
  });

  it('el texto de "como reclamar" ya no miente', () => {
    // Decia "habla con quien organiza la ruta" y no habia ningun sitio.
    const avisos = leer('src/features/notices/avisos.ts');
    const texto = /export const COMO_RECLAMAR =([\s\S]*?);/.exec(avisos)?.[1] ?? '';
    assert.match(texto, /reclamarlo|aquí/);
  });
});
