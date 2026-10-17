"""Genera los dibujos de Pulso de Camarero: assets/pulso/sprites/ y su geometria.

    python scripts/generar-pulso.py

Los PNG generados NO se editan a mano. Pillow con supermuestreo (se dibuja a 4x
y se reduce), sin SVG (obliga a recompilar el development build) ni librerias.

  * bandeja.png: la bandeja EN PRIMERA PERSONA, como la ve el camarero que la lleva: un trapecio (el
    borde de delante, ancho y cerca; el de atras, estrecho y lejos), el canto de delante a la vista y
    sus dos manos agarrandola por las esquinas de abajo.
  * bebidas/<tipo>-vidrio.png y <tipo>-liquido.png: cada bebida en DOS capas del
    mismo tamano. El liquido va debajo y la app lo recorta por abajo segun el
    nivel (INTERIOR dice entre que alturas esta el hueco del vaso); el vidrio va
    encima, translucido. Asi "se vacia" sin tener un dibujo por nivel.
  * charco.png y gota.png: lo que se derrama.
  * fondo.jpg y suelo.jpg: la pared del bar y el suelo con tablas en perspectiva.
    Los dos mas anchos que la pantalla, para poder desplazarlos de lado cuando
    el camarero gira (parallax).
  * mesa.png y taburete.png: lo que se cruza en el camino.
  * clientes/*.png: los bustos de Open Peeps (originales en assets/barman/clientes/,
    CC0, ver su CREDITOS.md) con borde claro de pegatina, tomados de
    generar-barman.py, y unas piernas debajo para que tengan los pies en el suelo.
  * src/features/minijuegos/juegos/pulso/spritesGeometria.ts: proporciones e
    INTERIOR de cada vaso, para reservar el hueco exacto sin medir las imagenes.

tests/pulso-sprites.test.ts comprueba que esta todo y con su tamano.
"""

import importlib.util
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.dont_write_bytecode = True

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'assets' / 'pulso' / 'sprites'
GEOMETRIA = RAIZ / 'src' / 'features' / 'minijuegos' / 'juegos' / 'pulso' / 'spritesGeometria.ts'

_spec = importlib.util.spec_from_file_location('barman', RAIZ / 'scripts' / 'generar-barman.py')
B = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(B)

S = 4  # supermuestreo
TINTA = (36, 26, 18, 255)
CREMA = (246, 239, 226)


class Lz:
    """Lienzo transparente de `w` x `h` px que se dibuja a S veces el tamano."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))

    def mascara(self, dibujar):
        m = Image.new('L', self.img.size, 0)
        dibujar(ImageDraw.Draw(m), S)
        return m

    def pegar(self, mascara, c1, c2=None, y0=None, y1=None):
        """Rellena la mascara con `c1` o con un degradado vertical c1 -> c2 entre y0 e y1 (en px finales)."""
        if c2 is None:
            capa = Image.new('RGBA', self.img.size, c1)
        else:
            y0 = 0 if y0 is None else y0
            y1 = self.h if y1 is None else y1
            capa = Image.new('RGBA', self.img.size, c1)
            d = ImageDraw.Draw(capa)
            for y in range(self.img.size[1]):
                t = min(max((y / S - y0) / max(y1 - y0, 1e-6), 0), 1)
                d.line([(0, y), (self.img.size[0], y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(c1, c2)))
        capa.putalpha(Image.composite(capa.getchannel('A'), Image.new('L', capa.size, 0), mascara))
        self.img = Image.alpha_composite(self.img, capa)

    def trazo(self, mascara, color, grosor):
        """Contorno de la mascara: la dilata y resta la mascara."""
        gorda = mascara.filter(ImageFilter.MaxFilter(2 * round(grosor * S / 2) + 1))
        borde = Image.composite(gorda, Image.new('L', gorda.size, 0), gorda)
        borde = Image.eval(borde, lambda v: v)
        borde = Image.frombytes('L', gorda.size, bytes(max(a - b, 0) for a, b in zip(gorda.tobytes(), mascara.tobytes())))
        capa = Image.new('RGBA', self.img.size, color)
        capa.putalpha(borde)
        self.img = Image.alpha_composite(self.img, capa)

    def sombra_suave(self, mascara, desplaza=(0, 3), radio=4, alfa=90):
        m = mascara.filter(ImageFilter.GaussianBlur(radio * S))
        capa = Image.new('RGBA', self.img.size, (0, 0, 0, 255))
        capa.putalpha(m.point(lambda v: v * alfa // 255))
        desplazada = Image.new('RGBA', self.img.size, (0, 0, 0, 0))
        desplazada.paste(capa, (desplaza[0] * S, desplaza[1] * S))
        self.img = Image.alpha_composite(desplazada, self.img)

    def final(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)


def guardar(img, ruta):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    img.save(ruta, optimize=True)


def poli(pts):
    return lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255)


def elipse(cx, cy, rx, ry):
    return lambda d, s: d.ellipse([(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s], fill=255)


def rrect(x0, y0, x1, y1, r):
    return lambda d, s: d.rounded_rectangle([x0 * s, y0 * s, x1 * s, y1 * s], radius=r * s, fill=255)


def union(lz, *fs):
    return lz.mascara(lambda d, s: [f(d, s) for f in fs])


# ---------------------------------------------------------------------------
# Bebidas: vidrio + liquido en el mismo lienzo
# ---------------------------------------------------------------------------
ANCHO_BEBIDA, ALTO_BEBIDA = 160, 220

CERVEZA = ((250, 200, 70, 255), (222, 140, 26, 255))
VINO = ((176, 34, 52, 255), (110, 14, 30, 255))
ROSA = ((246, 120, 120, 255), (206, 56, 74, 255))
CHUPITO = ((240, 214, 130, 255), (206, 142, 50, 255))
RON = ((222, 140, 60, 255), (150, 76, 22, 255))
VIDRIO = (232, 244, 249, 70)
BRILLO = (255, 255, 255, 150)


def lienzo():
    return Lz(ANCHO_BEBIDA, ALTO_BEBIDA)


def dibujar_bebida(nombre, cuerpo, interior, colores, extra_vidrio=None, extra_opaco=None, boca=None):
    """`cuerpo` e `interior`: listas de poligonos (px del lienzo). Devuelve (vidrio, liquido, (arriba, abajo) del interior en fraccion)."""
    ys = [y for pol in interior for _, y in pol]
    arriba, abajo = min(ys), max(ys)
    liq = lienzo()
    liq.pegar(union(liq, *[poli(p) for p in interior]), colores[0], colores[1], arriba, abajo)
    vid = lienzo()
    mc = union(vid, *[poli(p) for p in cuerpo])
    if extra_opaco:
        extra_opaco(vid)
    vid.sombra_suave(mc, (0, 4), 3, 70)
    vid.pegar(mc, VIDRIO)
    vid.trazo(mc, TINTA, 2.4)
    # Brillo del lado izquierdo.
    xs = [x for pol in cuerpo for x, _ in pol]
    x0, x1 = min(xs), max(xs)
    vid.pegar(union(vid, rrect(x0 + (x1 - x0) * 0.16, arriba + 6, x0 + (x1 - x0) * 0.26, abajo - 6, 4)), BRILLO)
    if extra_vidrio:
        extra_vidrio(vid)
    if boca:
        # El borde del vaso visto desde un poco mas arriba (el camarero mira su bandeja desde arriba y
        # de frente): una elipse en la boca, en vez de un corte recto.
        cx, cy, rx, ry = boca
        mb = vid.mascara(elipse(cx, cy, rx, ry))
        vid.pegar(mb, (255, 255, 255, 110))
        vid.trazo(mb, TINTA, 2.2)
    return vid.final(), liq.final(), (arriba / ALTO_BEBIDA, abajo / ALTO_BEBIDA)


def trapecio(cx, y0, y1, w0, w1):
    return [(cx - w0 / 2, y0), (cx + w0 / 2, y0), (cx + w1 / 2, y1), (cx - w1 / 2, y1)]


def bebida_cana():
    cuerpo = [trapecio(80, 38, 202, 78, 62)]
    interior = [trapecio(80, 46, 194, 68, 54)]
    return dibujar_bebida('cana', cuerpo, interior, CERVEZA, boca=(80, 38, 39, 8))


def bebida_jarra():
    cuerpo = [trapecio(70, 32, 204, 100, 90)]
    asa = [(114, 70), (146, 70), (150, 80), (150, 150), (146, 160), (114, 160), (114, 146), (134, 146), (136, 140), (136, 90), (134, 84), (114, 84)]
    interior = [trapecio(70, 42, 194, 88, 78)]
    def asa_f(l):
        m = union(l, poli(asa))
        l.pegar(m, VIDRIO)
        l.trazo(m, TINTA, 2.4)
    return dibujar_bebida('jarra', cuerpo + [asa], interior, CERVEZA, extra_vidrio=asa_f, boca=(70, 32, 50, 9))


def bebida_balon():
    # Copa de balon: bola sobre un pie.
    bola = [(80 + 56 * math.cos(a), 92 + 62 * math.sin(a)) for a in [i * math.pi / 30 for i in range(60)]]
    pie = [(76, 150), (84, 150), (84, 196), (76, 196)]
    base = [(46, 212), (114, 212), (108, 198), (52, 198)]
    interior = [[(80 + 48 * math.cos(a), 94 + 54 * math.sin(a)) for a in [i * math.pi / 30 for i in range(60)] if 94 + 54 * math.sin(a) > 80] + []]
    # El interior es el fondo de la bola: se cierra con una recta a la altura del liquido maximo.
    pts = [(80 + 48 * math.cos(a), 94 + 54 * math.sin(a)) for a in [i * math.pi / 40 for i in range(0, 41)]]
    y_max = 74
    interior = [[p for p in pts if p[1] >= y_max]]
    return dibujar_bebida('balon', [bola, pie, base], interior, VINO, boca=(80, 36, 26, 6))


def bebida_cocktel():
    # Copa ancha en V sobre un pie fino.
    copa = [(14, 42), (146, 42), (84, 124), (76, 124)]
    pie = [(77, 124), (83, 124), (83, 198), (77, 198)]
    base = [(46, 212), (114, 212), (104, 198), (56, 198)]
    interior = [[(20, 48), (140, 48), (83, 120), (77, 120)]]
    return dibujar_bebida('cocktel', [copa, pie, base], interior, ROSA, boca=(80, 42, 66, 9))


def bebida_chupito():
    cuerpo = [trapecio(80, 100, 206, 70, 52)]
    interior = [trapecio(80, 112, 196, 60, 44)]
    return dibujar_bebida('chupito', cuerpo, interior, CHUPITO, boca=(80, 100, 35, 6))


def bebida_botella():
    # Botella de espirituoso con etiqueta y tapon.
    cuerpo = [[(54, 90), (106, 90), (106, 204), (100, 210), (60, 210), (54, 204)], [(70, 30), (90, 30), (90, 92), (106, 112), (54, 112), (70, 92)]]
    interior = [[(58, 112), (102, 112), (102, 202), (96, 206), (64, 206), (58, 202)]]

    def etiqueta(l):
        l.pegar(union(l, rrect(54, 146, 106, 186, 3)), (246, 239, 226, 235))
        l.pegar(union(l, rrect(62, 156, 98, 162, 2)), (168, 44, 36, 255))
        l.pegar(union(l, rrect(62, 170, 90, 175, 2)), (92, 60, 30, 255))

    def tapon(l):
        m = union(l, rrect(68, 20, 92, 36, 3))
        l.pegar(m, (168, 44, 36, 255))
        l.trazo(m, TINTA, 2)

    return dibujar_bebida('botella', cuerpo, interior, RON, extra_vidrio=lambda l: (etiqueta(l), tapon(l)))


BEBIDAS = {
    'chupito': bebida_chupito,
    'cana': bebida_cana,
    'jarra': bebida_jarra,
    'balon': bebida_balon,
    'cocktel': bebida_cocktel,
    'botella': bebida_botella,
}


# ---------------------------------------------------------------------------
# La bandeja, el charco, la gota
# ---------------------------------------------------------------------------
BANDEJA_W, BANDEJA_H = 560, 380


def bandeja():
    """La bandeja vista por el camarero que la lleva, con sus manos: trapecio en perspectiva."""
    lz = Lz(BANDEJA_W, BANDEJA_H)
    lejos, cerca = 62, 300
    fl, fr = 96, 464      # extremos del borde de ATRAS (estrecho y lejano)
    nl, nr = 16, 544      # extremos del borde de DELANTE (ancho y cercano)
    sup = [(fl + 18, lejos), (fr - 18, lejos), (fr, lejos + 10), (nr, cerca - 16), (nr - 14, cerca),
           (nl + 14, cerca), (nl, cerca - 16), (fl, lejos + 10)]
    superficie = lz.mascara(poli(sup))
    # El canto: la superficie dilatada, en acero.
    canto = superficie.filter(ImageFilter.MaxFilter(2 * 6 * S + 1))
    lz.sombra_suave(canto, (0, 14), 12, 120)
    lz.pegar(canto, (196, 202, 208, 255), (118, 124, 132, 255), lejos - 8, cerca + 8)
    lz.trazo(canto, TINTA, 3)
    # La superficie hundida: mas oscura al fondo (lejos) y mas clara cerca.
    lz.pegar(superficie, (176, 182, 190, 255), (236, 240, 244, 255), lejos, cerca)
    lz.trazo(superficie, (70, 76, 86, 220), 2)
    # Una luz suave en el centro.
    lz.pegar(lz.mascara(elipse(280, 190, 170, 46)), (255, 255, 255, 60))
    # El canto de DELANTE, que se ve de frente.
    frente = lz.mascara(poli([(nl + 14, cerca + 2), (nr - 14, cerca + 2), (nr - 8, cerca + 34), (nl + 8, cerca + 34)]))
    lz.pegar(frente, (150, 156, 164, 255), (96, 102, 110, 255), cerca, cerca + 34)
    lz.trazo(frente, TINTA, 3)
    lz.pegar(lz.mascara(rrect(40, cerca + 6, 520, cerca + 11, 2)), (255, 255, 255, 140))
    # Las manos: dos mangas blancas que suben desde abajo y los dedos agarrando el canto.
    for lado in (-1, 1):
        def x(v, lado=lado):
            return v if lado < 0 else BANDEJA_W - v
        manga = lz.mascara(poli([(x(0), 372), (x(40), 316), (x(118), 336), (x(92), BANDEJA_H), (x(0), BANDEJA_H)]))
        lz.pegar(manga, (250, 248, 243, 255), (214, 210, 200, 255), 316, BANDEJA_H)
        lz.trazo(manga, TINTA, 3)
        lz.pegar(lz.mascara(poli([(x(52), 326), (x(100), 342), (x(96), 350), (x(46), 334)])), (190, 186, 176, 140))
        mano = lz.mascara(elipse(x(92), 322, 38, 22))
        lz.pegar(mano, (238, 192, 152, 255), (212, 160, 122, 255), 300, 344)
        lz.trazo(mano, TINTA, 3)
        # Los dedos, curvados sobre el canto.
        for k in range(3):
            dedo = lz.mascara(rrect(x(70 + 18 * k) - 8, 296, x(70 + 18 * k) + 8, 322, 8))
            lz.pegar(dedo, (240, 196, 156, 255), (214, 164, 126, 255), 296, 322)
            lz.trazo(dedo, TINTA, 2.2)
    return lz.final()


def charco():
    lz = Lz(180, 70)
    m = lz.mascara(lambda d, s: d.ellipse([6 * s, 8 * s, 174 * s, 62 * s], fill=255))
    lz.pegar(m, (240, 190, 70, 190), (206, 134, 30, 200), 8, 62)
    lz.pegar(lz.mascara(lambda d, s: d.ellipse([30 * s, 16 * s, 80 * s, 26 * s], fill=255)), (255, 255, 255, 130))
    return lz.final()


def gota():
    lz = Lz(28, 40)
    m = lz.mascara(lambda d, s: (d.polygon([(14 * s, 3 * s), (24 * s, 26 * s), (4 * s, 26 * s)], fill=255), d.ellipse([3 * s, 16 * s, 25 * s, 38 * s], fill=255)))
    lz.pegar(m, (250, 205, 90, 235), (214, 140, 30, 245), 3, 38)
    lz.pegar(lz.mascara(lambda d, s: d.ellipse([8 * s, 22 * s, 13 * s, 30 * s], fill=255)), (255, 255, 255, 170))
    return lz.final()


# ---------------------------------------------------------------------------
# El bar: pared del fondo, suelo con perspectiva, mesa y taburete
# ---------------------------------------------------------------------------
ESCENA_ANCHO = 1100  # mas ancho que cualquier pantalla: el mundo se desplaza de lado
FONDO_ALTO = 330
SUELO_ALTO = 330


def fondo():
    rnd = random.Random(7)
    img = Image.new('RGB', (ESCENA_ANCHO, FONDO_ALTO))
    d = ImageDraw.Draw(img)
    for y in range(FONDO_ALTO):
        t = y / FONDO_ALTO
        d.line([(0, y), (ESCENA_ANCHO, y)], fill=(round(86 - 26 * t), round(52 - 18 * t), round(34 - 10 * t)))
    # Ladrillo/tabla vertical de la pared.
    for x in range(0, ESCENA_ANCHO, 46):
        d.line([(x, 0), (x, FONDO_ALTO)], fill=(64, 38, 24), width=2)
    # Estanterias con botellas.
    for y_estante in (84, 168, 252):
        d.rectangle([0, y_estante, ESCENA_ANCHO, y_estante + 7], fill=(40, 24, 14))
        x = 14
        while x < ESCENA_ANCHO - 30:
            alto = rnd.randint(36, 66)
            ancho = rnd.randint(14, 24)
            color = rnd.choice([(40, 96, 58), (150, 84, 30), (168, 44, 36), (200, 168, 70), (60, 90, 140), (120, 130, 60)])
            d.rounded_rectangle([x, y_estante - alto, x + ancho, y_estante], radius=5, fill=color, outline=(24, 16, 10))
            d.rectangle([x + ancho // 3, y_estante - alto - 12, x + 2 * ancho // 3, y_estante - alto], fill=color, outline=(24, 16, 10))
            d.rectangle([x + 3, y_estante - alto + 8, x + 5, y_estante - 6], fill=tuple(min(c + 70, 255) for c in color))
            x += ancho + rnd.randint(6, 22)
    # Focos calidos.
    luz = Image.new('RGBA', img.size, (0, 0, 0, 0))
    dl = ImageDraw.Draw(luz)
    for cx in range(120, ESCENA_ANCHO, 260):
        dl.ellipse([cx - 90, -60, cx + 90, 120], fill=(255, 196, 96, 70))
    luz = luz.filter(ImageFilter.GaussianBlur(28))
    img = Image.alpha_composite(img.convert('RGBA'), luz).convert('RGB')
    return img


def suelo():
    """Tablas de madera que convergen en el horizonte (arriba, al centro)."""
    img = Image.new('RGB', (ESCENA_ANCHO, SUELO_ALTO))
    d = ImageDraw.Draw(img)
    for y in range(SUELO_ALTO):
        t = y / SUELO_ALTO
        d.line([(0, y), (ESCENA_ANCHO, y)], fill=(round(70 + 90 * t), round(44 + 56 * t), round(28 + 30 * t)))
    horizonte = (ESCENA_ANCHO / 2, -40)
    for i in range(-14, 15):
        xb = ESCENA_ANCHO / 2 + i * 120
        d.line([horizonte, (xb, SUELO_ALTO)], fill=(48, 28, 18), width=3)
    # Juntas transversales, mas separadas cuanto mas cerca.
    y = 4.0
    paso = 5.0
    while y < SUELO_ALTO:
        d.line([(0, y), (ESCENA_ANCHO, y)], fill=(54, 32, 20), width=2)
        y += paso
        paso *= 1.22
    # Una luz suave del techo.
    luz = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(luz).ellipse([200, 40, ESCENA_ANCHO - 200, 300], fill=(255, 210, 140, 46))
    luz = luz.filter(ImageFilter.GaussianBlur(50))
    return Image.alpha_composite(img.convert('RGBA'), luz).convert('RGB')


def mesa():
    lz = Lz(360, 300)
    tablero = lz.mascara(lambda d, s: d.ellipse([20 * s, 40 * s, 340 * s, 120 * s], fill=255))
    patas = union(lz, rrect(70, 100, 98, 270, 6), rrect(262, 100, 290, 270, 6), rrect(166, 110, 194, 250, 6))
    lz.sombra_suave(union(lz, elipse(180, 272, 150, 20)), (0, 0), 8, 120)
    lz.pegar(patas, (108, 66, 34, 255), (70, 40, 20, 255), 100, 270)
    lz.trazo(patas, TINTA, 3)
    lz.pegar(tablero, (214, 160, 98, 255), (168, 112, 58, 255), 40, 120)
    lz.trazo(tablero, TINTA, 3.4)
    lz.pegar(lz.mascara(lambda d, s: d.ellipse([60 * s, 52 * s, 200 * s, 74 * s], fill=255)), (255, 255, 255, 80))
    # Un vaso y una servilleta en la mesa.
    lz.pegar(union(lz, rrect(220, 50, 244, 90, 4)), (240, 236, 220, 255))
    return lz.final()


def taburete():
    lz = Lz(220, 320)
    asiento = lz.mascara(lambda d, s: d.ellipse([20 * s, 30 * s, 200 * s, 90 * s], fill=255))
    patas = union(lz, poli([(52, 70), (70, 70), (50, 300), (30, 300)]), poli([(150, 70), (168, 70), (190, 300), (170, 300)]), rrect(40, 190, 180, 204, 5))
    lz.sombra_suave(union(lz, elipse(110, 302, 90, 12)), (0, 0), 6, 120)
    lz.pegar(patas, (110, 116, 124, 255), (66, 70, 78, 255), 70, 300)
    lz.trazo(patas, TINTA, 3)
    lz.pegar(asiento, (176, 44, 38, 255), (128, 28, 24, 255), 30, 90)
    lz.trazo(asiento, TINTA, 3.4)
    lz.pegar(lz.mascara(lambda d, s: d.ellipse([46 * s, 40 * s, 120 * s, 56 * s], fill=255)), (255, 255, 255, 90))
    return lz.final()


# ---------------------------------------------------------------------------
# Clientes
# ---------------------------------------------------------------------------
PANTALONES = [(54, 64, 92), (92, 70, 48), (44, 44, 52), (100, 52, 60), (60, 84, 70), (78, 78, 92)]


def cliente(origen: Path, n: int) -> Image.Image:
    busto = B.pegatina(origen)
    ancho, alto_busto = busto.size
    alto_piernas = round(ancho * 0.62)
    lz = Lz(ancho, alto_piernas + 20)
    color = PANTALONES[n % len(PANTALONES)]
    medio = ancho // 2
    for x0, x1 in ((medio - 90, medio - 6), (medio + 6, medio + 90)):
        m = lz.mascara(lambda d, s, x0=x0, x1=x1: d.rounded_rectangle([x0 * s, 0, x1 * s, (alto_piernas - 6) * s], radius=12 * s, fill=255))
        lz.pegar(m, color + (255,), tuple(max(c - 30, 0) for c in color) + (255,), 0, alto_piernas)
        lz.trazo(m, TINTA, 3)
        zapato = lz.mascara(lambda d, s, x0=x0, x1=x1: d.rounded_rectangle([(x0 - 4) * s, (alto_piernas - 22) * s, (x1 + 4) * s, (alto_piernas + 10) * s], radius=12 * s, fill=255))
        lz.pegar(zapato, (36, 28, 24, 255))
    piernas = lz.final()
    # La sombra en el suelo.
    total = Image.new('RGBA', (ancho, alto_busto + alto_piernas), (0, 0, 0, 0))
    sombra = Image.new('RGBA', total.size, (0, 0, 0, 0))
    ImageDraw.Draw(sombra).ellipse([10, total.height - 30, ancho - 10, total.height - 2], fill=(0, 0, 0, 90))
    total = Image.alpha_composite(total, sombra.filter(ImageFilter.GaussianBlur(5)))
    total.alpha_composite(piernas, (0, alto_busto - 24))
    total.alpha_composite(busto, (0, 0))
    return total.resize((round(total.width * 0.5), round(total.height * 0.5)), Image.LANCZOS)


def main() -> None:
    for sub in ('bebidas', 'clientes'):
        (SALIDA / sub).mkdir(parents=True, exist_ok=True)
    interior = {}
    for nombre, f in BEBIDAS.items():
        vidrio, liquido, (a, b) = f()
        guardar(vidrio, SALIDA / 'bebidas' / f'{nombre}-vidrio.png')
        guardar(liquido, SALIDA / 'bebidas' / f'{nombre}-liquido.png')
        interior[nombre] = (round(a, 4), round(b, 4))
    guardar(bandeja(), SALIDA / 'bandeja.png')
    guardar(charco(), SALIDA / 'charco.png')
    guardar(gota(), SALIDA / 'gota.png')
    guardar(mesa(), SALIDA / 'mesa.png')
    guardar(taburete(), SALIDA / 'taburete.png')
    fondo().save(SALIDA / 'fondo.jpg', quality=82, optimize=True)
    suelo().save(SALIDA / 'suelo.jpg', quality=82, optimize=True)

    origenes = sorted((RAIZ / 'assets' / 'barman' / 'clientes').glob('peep-*.png'))
    medidas = set()
    nombres = []
    for i, o in enumerate(origenes):
        img = cliente(o, i)
        img.save(SALIDA / 'clientes' / o.name, optimize=True)
        medidas.add(img.size)
        nombres.append(o.stem)
    assert len(medidas) == 1, medidas
    (cw, ch), = medidas

    GEOMETRIA.parent.mkdir(parents=True, exist_ok=True)
    interiores = ',\n'.join(f'  {k}: {{ arriba: {a}, abajo: {b} }}' for k, (a, b) in interior.items())
    GEOMETRIA.write_text(
        '// GENERADO por scripts/generar-pulso.py. No editar a mano.\n'
        '/** Proporciones (ancho / alto) de los dibujos, para reservar su hueco sin medirlos. */\n'
        f'export const PROPORCION_BEBIDA = {ANCHO_BEBIDA} / {ALTO_BEBIDA};\n'
        f'export const PROPORCION_BANDEJA = {BANDEJA_W} / {BANDEJA_H};\n'
        f'export const PROPORCION_CLIENTE = {cw} / {ch};\n'
        f'export const PROPORCION_MESA = 360 / 300;\n'
        f'export const PROPORCION_TABURETE = 220 / 320;\n'
        f'export const PROPORCION_ESCENA = {ESCENA_ANCHO} / {FONDO_ALTO};\n'
        f'export const ESCENA_ANCHO = {ESCENA_ANCHO};\n'
        f'export const FONDO_ALTO = {FONDO_ALTO};\n'
        f'export const SUELO_ALTO = {SUELO_ALTO};\n'
        '/** Entre que alturas (fraccion del dibujo, 0 = arriba) esta el hueco del vaso donde va el liquido. */\n'
        f'export const INTERIOR = {{\n{interiores},\n}} as const;\n'
        f"export const CLIENTES = [{', '.join(repr(n) for n in nombres)}] as const;\n",
        encoding='utf-8',
    )
    total = sum(p.stat().st_size for p in SALIDA.rglob('*') if p.is_file())
    print(f'{len(BEBIDAS)} bebidas, {len(nombres)} clientes. Peso: {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
