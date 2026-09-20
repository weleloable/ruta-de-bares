import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CACHE_MS, crearCacheFirmas, FIRMA_SEGUNDOS, rutaDesdeUrlPublica } from './avatarUrl.ts';

const UID = '1d3359be-3845-40bb-967f-a0fa6310f5cd';
const BASE = `http://192.168.1.19:54321/storage/v1/object/public/avatars/${UID}`;

describe('rutaDesdeUrlPublica', () => {
  it('saca la ruta de lo que guarda profiles.avatar_url', () => {
    assert.equal(rutaDesdeUrlPublica(`${BASE}/avatar-mf1-abc123.jpg`), `${UID}/avatar-mf1-abc123.jpg`);
  });

  it('vale igual con el host de produccion', () => {
    const url = `https://abcdefgh.supabase.co/storage/v1/object/public/avatars/${UID}/avatar-x.jpg`;
    assert.equal(rutaDesdeUrlPublica(url), `${UID}/avatar-x.jpg`);
  });

  it('sin foto, null', () => {
    assert.equal(rutaDesdeUrlPublica(null), null);
    assert.equal(rutaDesdeUrlPublica(undefined), null);
    assert.equal(rutaDesdeUrlPublica(''), null);
  });

  it('una URL de otro sitio no se convierte en ruta', () => {
    // Si esto colase, se firmaria una ruta inventada por quien escribio la fila.
    assert.equal(rutaDesdeUrlPublica('https://ejemplo.test/otra/cosa.jpg'), null);
    assert.equal(rutaDesdeUrlPublica(`https://x.test/storage/v1/object/public/otros/${UID}/a.jpg`), null);
  });

  it('tira la query y el fragmento: una firma vieja no es una ruta', () => {
    assert.equal(rutaDesdeUrlPublica(`${BASE}/avatar-x.jpg?token=abc`), `${UID}/avatar-x.jpg`);
    assert.equal(rutaDesdeUrlPublica(`${BASE}/avatar-x.jpg#algo`), `${UID}/avatar-x.jpg`);
  });

  it('exige la forma <uid>/<fichero>, un solo nivel', () => {
    assert.equal(rutaDesdeUrlPublica(`${BASE}/sub/carpeta/a.jpg`), null);
    assert.equal(rutaDesdeUrlPublica(`http://x/storage/v1/object/public/avatars/no-es-uuid/a.jpg`), null);
    assert.equal(rutaDesdeUrlPublica(`${BASE}/`), null);
  });

  it('no deja salir de la carpeta', () => {
    assert.equal(rutaDesdeUrlPublica(`${BASE}/../otro/a.jpg`), null);
    assert.equal(rutaDesdeUrlPublica(`http://x/storage/v1/object/public/avatars/../secreto.jpg`), null);
  });

  it('acepta la miniatura, que es el mismo nombre con sufijo', () => {
    assert.equal(rutaDesdeUrlPublica(`${BASE}/avatar-mf1-abc-mini.jpg`), `${UID}/avatar-mf1-abc-mini.jpg`);
  });
});

describe('cache de firmas', () => {
  it('devuelve lo guardado mientras no caduque', () => {
    let reloj = 1_000;
    const cache = crearCacheFirmas(() => reloj);
    cache.guardar('a/b.jpg', 'https://firmada');
    assert.equal(cache.leer('a/b.jpg'), 'https://firmada');
    reloj += CACHE_MS - 1;
    assert.equal(cache.leer('a/b.jpg'), 'https://firmada');
  });

  it('al caducar devuelve null y suelta la entrada', () => {
    let reloj = 1_000;
    const cache = crearCacheFirmas(() => reloj);
    cache.guardar('a/b.jpg', 'https://firmada');
    reloj += CACHE_MS;
    assert.equal(cache.leer('a/b.jpg'), null);
    assert.equal(cache.tamano, 0, 'no deberia acumular entradas muertas');
  });

  it('lo que entrega tiene margen de sobra antes de que caduque la firma', () => {
    // Si la cache durase lo mismo que la firma, la ultima lectura serviria una
    // URL a punto de morir y la imagen no llegaria a cargar.
    assert.ok(CACHE_MS < FIRMA_SEGUNDOS * 1000, 'la cache tiene que durar menos que la firma');
    assert.ok(FIRMA_SEGUNDOS * 1000 - CACHE_MS >= 120_000, 'deja al menos dos minutos de margen');
  });

  it('lo que no se ha guardado, null', () => {
    const cache = crearCacheFirmas();
    assert.equal(cache.leer('nada'), null);
  });

  it('vaciar la deja limpia: las firmas son de una persona', () => {
    const cache = crearCacheFirmas();
    cache.guardar('a/b.jpg', 'https://firmada');
    cache.vaciar();
    assert.equal(cache.leer('a/b.jpg'), null);
  });
});
