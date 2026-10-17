import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readFileSync } from 'node:fs';

import { RONDAS } from './modelo.ts';
import { ALTO_CABECERA, ANCHO_MAXIMO, colocarBebidas, ESCALA_ATRAS, INCLINACION_DIBUJO, MARGEN, PROPORCION_BEBIDA, RELACION_BANDEJA, repartir, TAMANO_BEBIDA } from './pantalla.ts';

describe('el reparto cabe sin scroll', () => {
  for (const alto of [740, 808, 915]) {
    it(`360 x ${alto}`, () => {
      const r = repartir(360, alto);
      assert.equal(r.cabe, true, JSON.stringify(r));
      assert.equal(r.total, alto, 'cabecera + bar + bandeja = todo el alto, ni mas ni menos');
      assert.ok(r.alturaBar >= 150 && r.alturaBandeja >= 300, JSON.stringify(r));
      assert.ok(r.bandejaAncho >= 250, `bandeja de ${r.bandejaAncho}px`);
    });
  }

  it('la bandeja, girada hasta el tope del dibujo, cabe a lo ancho y a lo alto en la zona', () => {
    for (const [ancho, alto] of [[360, 740], [360, 808], [360, 915], [390, 844], [320, 700], [768, 1024], [1280, 900]] as const) {
      const r = repartir(ancho, alto);
      const a = (INCLINACION_DIBUJO * Math.PI) / 180;
      const w = r.bandejaAncho;
      const h = r.bandejaAlto;
      assert.ok(w * Math.cos(a) + h * Math.sin(a) <= r.ancho - 2 * MARGEN + 1, `${ancho}x${alto}: se sale por los lados`);
      assert.ok(w * Math.sin(a) + h * Math.cos(a) <= r.alturaBandeja, `${ancho}x${alto}: se sale por abajo`);
    }
  });

  it('no se pasa de grande en una tablet o un PC y el bar tiene un maximo', () => {
    const r = repartir(1600, 1200);
    assert.equal(r.ancho, ANCHO_MAXIMO);
    assert.ok(r.bandejaAncho <= ANCHO_MAXIMO - 2 * MARGEN);
    assert.ok(r.alturaBar <= 420);
  });

  it('crece con el alto: mas pantalla, mas bar y mas bandeja (hasta el tope de ancho)', () => {
    const a = repartir(360, 740);
    const b = repartir(360, 915);
    assert.ok(b.alturaBar > a.alturaBar && b.alturaBandeja > a.alturaBandeja);
    assert.ok(b.bandejaAncho >= a.bandejaAncho);
  });

  it('con una ventana minuscula no revienta y dice que no cabe', () => {
    const r = repartir(200, 200);
    assert.equal(r.cabe, false);
    assert.ok(Number.isFinite(r.bandejaAncho));
    assert.equal(ALTO_CABECERA, 44);
  });
});

describe('las bebidas sobre la bandeja', () => {
  for (const [ancho, alto] of [[360, 740], [360, 915], [480, 900]] as const) {
    for (let ronda = 0; ronda < 3; ronda++) {
      it(`ronda ${ronda + 1} en ${ancho}x${alto}: cada bebida dentro de la bandeja y sin pisar a la de al lado`, () => {
        const r = repartir(ancho, alto);
        const tipos = RONDAS[ronda]?.bebidas ?? [];
        const huecos = colocarBebidas(tipos, r.bandejaAncho, r.bandejaAlto);
        assert.equal(huecos.length, tipos.length);
        huecos.forEach((h, i) => {
          assert.ok(h.x >= 0 && h.x + h.ancho <= r.bandejaAncho + 0.01, `${tipos[i]} se sale por los lados`);
          assert.ok(h.y >= 0 && h.y + h.alto <= r.bandejaAlto + 0.01, `${tipos[i]} se sale por arriba o abajo`);
          assert.ok(h.ancho > 20 && h.alto > 20, `${tipos[i]} es diminuta`);
          assert.ok(Math.abs(h.ancho / h.alto - PROPORCION_BEBIDA) < 1e-6, 'se deforma');
        });
        for (const f of [0, 1]) {
          const fila = huecos.filter((h) => h.fila === f).sort((a, b) => a.x - b.x);
          for (let i = 1; i < fila.length; i++) {
            const a = fila[i - 1] as { x: number; ancho: number };
            assert.ok(a.x + a.ancho <= (fila[i] as { x: number }).x + 0.01, 'dos bebidas se pisan');
          }
        }
      });
    }
  }

  it('en perspectiva: la fila de atras esta mas arriba, mas pequena y en un tramo mas estrecho que la de delante', () => {
    const r = repartir(360, 808);
    const tipos = ['cana', 'cana', 'cana', 'cana', 'cana', 'cana', 'cana', 'cana'];
    const h = colocarBebidas(tipos, r.bandejaAncho, r.bandejaAlto);
    const atras = h.filter((x) => x.fila === 0);
    const delante = h.filter((x) => x.fila === 1);
    assert.equal(atras.length, 4);
    assert.equal(delante.length, 4);
    const base = (x: { y: number; alto: number }) => x.y + x.alto;
    assert.ok(base(atras[0] as { y: number; alto: number }) < base(delante[0] as { y: number; alto: number }), 'la de atras apoya mas arriba');
    assert.ok((atras[0] as { alto: number }).alto < (delante[0] as { alto: number }).alto, 'y se ve mas pequena');
    assert.ok(ESCALA_ATRAS > 0.6 && ESCALA_ATRAS < 1);
    const ancho = (f: { x: number; ancho: number }[]) => Math.max(...f.map((x) => x.x + x.ancho)) - Math.min(...f.map((x) => x.x));
    assert.ok(ancho(atras) < ancho(delante), 'y en un tramo mas estrecho');
  });

  it('el chupito es mas bajo que la botella y la proporcion es la de los dibujos generados', () => {
    const g = readFileSync(new URL('./spritesGeometria.ts', import.meta.url), 'utf8');
    assert.match(g, /PROPORCION_BANDEJA = 560 \/ 380;/);
    assert.equal(RELACION_BANDEJA, 380 / 560);
    assert.ok((TAMANO_BEBIDA.chupito as number) < (TAMANO_BEBIDA.cana as number) && (TAMANO_BEBIDA.cana as number) < (TAMANO_BEBIDA.botella as number));
    const geom = readFileSync(new URL('./spritesGeometria.ts', import.meta.url), 'utf8');
    assert.match(geom, /PROPORCION_BEBIDA = 160 \/ 220;/);
    assert.equal(PROPORCION_BEBIDA, 160 / 220);
  });
});
