import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AL_BORRARLA } from '../routes/estado.ts';
import { avisosDeRutasTerminadas, COLETILLA_PURGA, rutasSinVer } from './rutasTerminadas.ts';

const AHORA = new Date('2026-09-26T12:00:00.000Z');
const DIA = 86_400_000;
const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA);
const fecha = (d: Date) => d.toISOString().slice(0, 10);

describe('avisosDeRutasTerminadas', () => {
  it('cuenta los dias que quedan hasta el limite y lo dice', () => {
    const [aviso] = avisosDeRutasTerminadas([{ routeId: 'r1', nombre: 'Ruta X', terminoEl: hace(6) }], AHORA, 30, fecha);
    assert.equal(aviso?.titulo, 'La ruta «Ruta X» ha terminado');
    assert.equal(aviso?.diasQuedan, 24);
    assert.match(aviso?.cuerpo ?? '', /^Terminó el 2026-09-20\. Hay que borrarla antes del 2026-10-20: quedan 24 días\./);
  });

  it('termina SIEMPRE con la frase de los datos de la gente, tal cual se pidio', () => {
    const avisos = avisosDeRutasTerminadas(
      [
        { routeId: 'a', nombre: 'A', terminoEl: hace(1) },
        { routeId: 'b', nombre: 'B', terminoEl: hace(29) },
        { routeId: 'c', nombre: 'C', terminoEl: hace(45) },
      ],
      AHORA,
      30,
      fecha,
    );
    for (const a of avisos) assert.ok(a.cuerpo.endsWith(COLETILLA_PURGA), a.cuerpo);
    assert.equal(
      COLETILLA_PURGA,
      'Al borrarla, también se borrarán todos los datos de la gente que participó en ella.',
    );
    // Y es la MISMA que dice el editor junto a cada ruta terminada.
    assert.equal(COLETILLA_PURGA, AL_BORRARLA);
  });

  it('el ultimo dia habla en singular', () => {
    const [aviso] = avisosDeRutasTerminadas([{ routeId: 'r', nombre: 'R', terminoEl: hace(29.5) }], AHORA, 30, fecha);
    assert.equal(aviso?.diasQuedan, 1);
    assert.match(aviso?.cuerpo ?? '', /queda 1 día\./);
  });

  it('vencido el plazo, lo dice en vez de contar dias negativos', () => {
    const [aviso] = avisosDeRutasTerminadas([{ routeId: 'r', nombre: 'R', terminoEl: hace(45) }], AHORA, 30, fecha);
    assert.ok((aviso?.diasQuedan ?? 1) <= 0);
    assert.match(aviso?.cuerpo ?? '', /El plazo para borrarla terminó el 2026-09-11\./);
    assert.doesNotMatch(aviso?.cuerpo ?? '', /quedan -/);
  });

  it('lo mas urgente primero', () => {
    const avisos = avisosDeRutasTerminadas(
      [
        { routeId: 'reciente', nombre: 'R', terminoEl: hace(1) },
        { routeId: 'vencida', nombre: 'V', terminoEl: hace(40) },
        { routeId: 'media', nombre: 'M', terminoEl: hace(20) },
      ],
      AHORA,
      30,
      fecha,
    );
    assert.deepEqual(
      avisos.map((a) => a.routeId),
      ['vencida', 'media', 'reciente'],
    );
  });
});

describe('rutasSinVer: lo que cuenta el punto rojo', () => {
  const avisos = avisosDeRutasTerminadas(
    [
      { routeId: 'a', nombre: 'A', terminoEl: hace(1) },
      { routeId: 'b', nombre: 'B', terminoEl: hace(2) },
    ],
    AHORA,
    30,
    fecha,
  );

  it('sin haber visto nada, todas', () => {
    assert.equal(rutasSinVer(avisos, new Set()), 2);
  });

  it('las vistas no cuentan, aunque el aviso siga en la bandeja', () => {
    assert.equal(rutasSinVer(avisos, new Set(['a'])), 1);
    assert.equal(rutasSinVer(avisos, new Set(['a', 'b'])), 0);
  });

  it('una vista de una ruta que ya no esta terminada no resta nada', () => {
    assert.equal(rutasSinVer(avisos, new Set(['otra'])), 2);
  });
});
