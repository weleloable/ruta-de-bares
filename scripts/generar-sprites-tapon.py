"""Genera los dibujos de Tapon al Vuelo (assets/tapon/) y su geometria.

    python scripts/generar-sprites-tapon.py        (necesita Pillow)

Por que un script y no PNG pintados a mano ni SVG:
- SVG pide react-native-svg, que es un modulo nativo: development build nuevo.
- Con Views la primera version quedaba esquematica ("low poly").
- Los dibujos tienen que CUADRAR con la fisica: la boca del vaso del dibujo es
  la boca que choca en modelo.ts. Aqui se dibuja en METROS con las mismas
  medidas, y el script escribe tambien `spritesGeometria.ts` (donde cae cada
  dibujo respecto a su punto de referencia). No se edita a mano: se regenera.
  `tests/sprites-tapon.test.ts` falla si PNG, geometria y modelo se separan.

Estilo: cartoon con volumen (degradados, brillos, contorno marron), como los
vasos de assets/vasos/. Se dibuja a 4x y se reduce, para bordes suaves.
Determinista: misma entrada, mismos ficheros.
"""

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'assets' / 'tapon'
GEOMETRIA = RAIZ / 'src' / 'features' / 'minijuegos' / 'juegos' / 'tapon' / 'spritesGeometria.ts'

# Pixeles por metro en el PNG final. En horizontal el campo sale a ~220 px/m;
# con pantallas de densidad 2 hacen falta ~440 para que no se vea borroso.
PPM = 440
SS = 4  # supersampling

# Medidas de modelo.ts (DIANAS, CABEZA, ALTURA_SALIDA). Las comprueba el test.
VASO = dict(boca=0.30, ancho=0.33, alto=0.42)
JARRA = dict(boca=0.24, ancho=0.27, alto=0.36)
CAJA = dict(boca=0.20, ancho=0.40, alto=0.30)
OREJA = dict(boca=0.12, alto=0.90)
CABEZA = dict(dx=0.17, dy=0.04, r=0.085)
ALTURA_SALIDA = 0.35
# Catapulta: el eje del brazo, respecto al punto de la barra bajo la cuchara.
PIVOTE = (-0.07, 0.12)

CONTORNO = (74, 44, 22, 255)
CERVEZA_ARRIBA = (250, 196, 64, 255)
CERVEZA_ABAJO = (214, 128, 20, 255)
ESPUMA = (255, 250, 236, 255)
ESPUMA_SOMBRA = (236, 222, 196, 255)
VIDRIO = (226, 240, 244, 110)
PIEL = (244, 196, 160, 255)
PIEL_SOMBRA = (222, 160, 124, 255)


class Lienzo:
    """Un PNG en metros: (x, y) con y hacia ARRIBA y el origen donde diga quien lo crea."""

    def __init__(self, x0, x1, y0, y1, ppm=PPM):
        self.x0, self.y1 = x0, y1
        self.ppm = ppm
        self.w = round((x1 - x0) * ppm) * SS
        self.h = round((y1 - y0) * ppm) * SS
        self.img = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        self.extent = (x0, x1, y0, y1)

    def p(self, x, y):
        return ((x - self.x0) * self.ppm * SS, (self.y1 - y) * self.ppm * SS)

    def m(self, metros):
        return metros * self.ppm * SS

    def mascara(self):
        return Image.new('L', (self.w, self.h), 0)

    def poligono(self, pts):
        mk = self.mascara()
        ImageDraw.Draw(mk).polygon([self.p(x, y) for x, y in pts], fill=255)
        return mk

    def elipse(self, cx, cy, rx, ry):
        mk = self.mascara()
        a = self.p(cx - rx, cy + ry)
        b = self.p(cx + rx, cy - ry)
        ImageDraw.Draw(mk).ellipse([a, b], fill=255)
        return mk

    def rect(self, x0, y0, x1, y1, r=0.0):
        mk = self.mascara()
        a = self.p(x0, y1)
        b = self.p(x1, y0)
        ImageDraw.Draw(mk).rounded_rectangle([a, b], radius=self.m(r), fill=255)
        return mk

    def degradado(self, mk, c0, c1, horizontal=False):
        """Rellena la mascara con un degradado de c0 a c1 (de arriba abajo, o de izq. a der.)."""
        caja = mk.getbbox()
        if not caja:
            return
        a, b = (caja[0], caja[2]) if horizontal else (caja[1], caja[3])
        n = max(1, b - a)
        tira = Image.new('RGBA', (n, 1) if horizontal else (1, n))
        for i in range(n):
            t = i / max(1, n - 1)
            col = tuple(round(c0[k] + (c1[k] - c0[k]) * t) for k in range(4))
            tira.putpixel((i, 0) if horizontal else (0, i), col)
        capa = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        tam = (n, self.h) if horizontal else (self.w, n)
        capa.paste(tira.resize(tam), (a, 0) if horizontal else (0, a))
        self.pegar(capa, mk)

    def color(self, mk, c):
        capa = Image.new('RGBA', (self.w, self.h), c)
        self.pegar(capa, mk)

    def pegar(self, capa, mk):
        """Compone `capa` solo donde dice la mascara, respetando su propio alfa."""
        alfa = ImageChops.multiply(capa.getchannel('A'), mk)
        capa = capa.copy()
        capa.putalpha(alfa)
        self.img.alpha_composite(capa)

    def contorno(self, mk, grosor=0.006, c=CONTORNO):
        k = max(3, int(self.m(grosor)) | 1)
        borde = mk.filter(ImageFilter.MaxFilter(min(k, 31)))
        if k > 31:
            for _ in range((k - 31) // 30 + 1):
                borde = borde.filter(ImageFilter.MaxFilter(31))
        self.color(borde, c)

    def brillo(self, mk, cx, cy, rx, ry, alfa=150, desenfoque=0.01):
        luz = self.elipse(cx, cy, rx, ry).filter(ImageFilter.GaussianBlur(self.m(desenfoque)))
        luz = ImageChops.multiply(luz, mk)
        capa = Image.new('RGBA', (self.w, self.h), (255, 255, 255, alfa))
        self.pegar(capa, luz)

    def sombra(self, mk, dx, dy, alfa=70, desenfoque=0.012):
        # Sin ImageChops.offset: ese ENVUELVE por el borde y metia la base del torso arriba, como una franja gris.
        movida = Image.new('L', (self.w, self.h), 0)
        movida.paste(mk, (int(self.m(dx)), int(-self.m(dy))))
        s = movida.filter(ImageFilter.GaussianBlur(self.m(desenfoque)))
        self.color(s, (40, 20, 5, alfa))

    def guardar(self, nombre):
        final = self.img.resize((self.w // SS, self.h // SS), Image.LANCZOS)
        final.save(SALIDA / nombre, optimize=True)
        return final.size


def interseccion(*mks):
    r = mks[0]
    for m in mks[1:]:
        r = ImageChops.multiply(r, m)
    return r


def resta(a, b):
    return ImageChops.subtract(a, b)


def burbujas(lz, mk, x0, x1, y0, y1, n, semilla):
    rnd = random.Random(semilla)
    for _ in range(n):
        x = rnd.uniform(x0, x1)
        y = rnd.uniform(y0, y1)
        r = rnd.uniform(0.003, 0.007)
        b = interseccion(lz.elipse(x, y, r, r), mk)
        lz.color(b, (255, 245, 210, 170))


def espuma(lz, x0, x1, y, alto, semilla):
    """Espuma con el borde de arriba en bultitos."""
    rnd = random.Random(semilla)
    mk = lz.rect(x0, y - alto * 0.5, x1, y + alto * 0.35)
    x = x0
    while x < x1:
        r = rnd.uniform(alto * 0.35, alto * 0.6)
        mk = ImageChops.lighter(mk, lz.elipse(x + r * 0.7, y + alto * 0.3, r, r * 0.8))
        x += r * 1.1
    corte = lz.rect(x0, -1, x1, 9)
    mk = interseccion(mk, corte)
    return mk


# --- Vaso de cana -------------------------------------------------------------


def vaso():
    a = VASO
    lz = Lienzo(-0.19, 0.19, -0.02, a['alto'] + 0.05)
    arriba = a['ancho'] / 2
    abajo = arriba * 0.78
    silueta = [(-abajo, 0), (abajo, 0), (arriba, a['alto']), (-arriba, a['alto'])]
    cuerpo = lz.poligono(silueta)
    lz.sombra(cuerpo, 0.012, -0.006)
    lz.contorno(cuerpo)
    lz.color(cuerpo, VIDRIO)
    # Cerveza: hasta el 80 % con la misma forma, por dentro de las paredes.
    pared = 0.012
    nivel = a['alto'] * 0.8

    def ancho_en(y):
        return abajo + (arriba - abajo) * y / a['alto'] - pared

    liquido = lz.poligono([(-ancho_en(0.03), 0.03), (ancho_en(0.03), 0.03), (ancho_en(nivel), nivel), (-ancho_en(nivel), nivel)])
    lz.degradado(liquido, CERVEZA_ARRIBA, CERVEZA_ABAJO)
    burbujas(lz, liquido, -abajo * 0.8, abajo * 0.8, 0.05, nivel - 0.02, 26, 1)
    esp = interseccion(espuma(lz, -ancho_en(nivel), ancho_en(nivel), nivel + 0.02, 0.05, 2), cuerpo)
    lz.degradado(esp, ESPUMA, ESPUMA_SOMBRA)
    # Fondo grueso de vidrio y brillos.
    lz.color(interseccion(lz.rect(-abajo, 0, abajo, 0.025), cuerpo), (240, 248, 250, 170))
    lz.brillo(cuerpo, -arriba * 0.55, a['alto'] * 0.5, 0.018, a['alto'] * 0.42, 170, 0.006)
    lz.brillo(cuerpo, arriba * 0.6, a['alto'] * 0.55, 0.006, a['alto'] * 0.3, 90, 0.004)
    # Labio del borde.
    lz.color(lz.elipse(0, a['alto'], arriba, 0.012), (250, 252, 252, 140))
    return lz.guardar('vaso.png'), lz.extent


# --- Jarra -------------------------------------------------------------------


def jarra():
    a = JARRA
    lz = Lienzo(-0.17, 0.28, -0.02, a['alto'] + 0.05)
    m = a['ancho'] / 2
    cuerpo = lz.rect(-m, 0, m, a['alto'], 0.02)
    # Asa: un aro a la derecha.
    asa = resta(lz.rect(m - 0.02, a['alto'] * 0.18, m + 0.11, a['alto'] * 0.85, 0.06),
                lz.rect(m, a['alto'] * 0.3, m + 0.065, a['alto'] * 0.73, 0.035))
    todo = ImageChops.lighter(cuerpo, asa)
    lz.sombra(todo, 0.012, -0.006)
    lz.contorno(todo)
    lz.color(asa, (230, 242, 246, 170))
    lz.brillo(asa, m + 0.09, a['alto'] * 0.55, 0.008, 0.06, 140, 0.004)
    lz.color(cuerpo, VIDRIO)
    pared = 0.016
    nivel = a['alto'] * 0.82
    liquido = lz.rect(-m + pared, 0.04, m - pared, nivel)
    lz.degradado(liquido, CERVEZA_ARRIBA, CERVEZA_ABAJO)
    burbujas(lz, liquido, -m + 0.03, m - 0.03, 0.05, nivel - 0.02, 20, 3)
    # Hoyuelos de jarra: columnas mas claras.
    for i in range(4):
        x = -m + 0.045 + i * (a['ancho'] - 0.09) / 3
        lz.brillo(cuerpo, x, a['alto'] * 0.45, 0.012, a['alto'] * 0.3, 70, 0.006)
    esp = interseccion(espuma(lz, -m + pared, m - pared, nivel + 0.025, 0.055, 4), lz.rect(-m, 0, m, a['alto'] + 0.03))
    lz.degradado(esp, ESPUMA, ESPUMA_SOMBRA)
    lz.color(lz.rect(-m, 0, m, 0.035, 0.015), (240, 248, 250, 170))
    lz.brillo(cuerpo, -m * 0.65, a['alto'] * 0.5, 0.014, a['alto'] * 0.38, 170, 0.006)
    return lz.guardar('jarra.png'), lz.extent


# --- Caja de botellines ---------------------------------------------------------


def caja():
    a = CAJA
    lz = Lienzo(-0.23, 0.23, -0.02, a['alto'] + 0.05)
    m = a['ancho'] / 2
    hueco = a['boca'] / 2
    frente_alto = a['alto'] * 0.72
    frente = lz.rect(-m, 0, m, frente_alto, 0.015)
    # Las paredes de atras y de los lados suben hasta la boca; dentro, en sombra, el hueco vacio.
    trasera = lz.rect(-m, frente_alto - 0.03, m, a['alto'], 0.012)
    lz.contorno(trasera)
    lz.degradado(trasera, (176, 50, 34, 255), (120, 28, 18, 255))
    lz.color(lz.rect(-hueco, frente_alto - 0.02, hueco, a['alto'] - 0.012, 0.01), (70, 20, 12, 255))
    lz.color(lz.rect(-m + 0.01, a['alto'] - 0.012, m - 0.01, a['alto'] - 0.004, 0.004), (236, 110, 84, 200))
    # Botellines a los lados: cuello verde y chapa dorada a la altura de la boca.
    for lado in (-1, 1):
        x = lado * (hueco + (m - hueco) / 2)
        cuello = lz.poligono([(x - 0.035, frente_alto - 0.02), (x + 0.035, frente_alto - 0.02), (x + 0.017, a['alto'] - 0.015),
                              (x - 0.017, a['alto'] - 0.015)])
        lz.contorno(cuello, 0.005)
        lz.degradado(cuello, (70, 140, 80, 255), (30, 80, 40, 255), horizontal=True)
        lz.brillo(cuello, x - 0.012, a['alto'] * 0.85, 0.005, 0.03, 140, 0.003)
        chapa = lz.rect(x - 0.022, a['alto'] - 0.022, x + 0.022, a['alto'], 0.006)
        lz.contorno(chapa, 0.004)
        lz.degradado(chapa, (250, 214, 110, 255), (196, 140, 30, 255))
    lz.sombra(frente, 0.012, -0.006)
    lz.contorno(frente)
    lz.degradado(frente, (214, 70, 46, 255), (150, 36, 24, 255))
    # Asidero y nervios del plastico.
    asidero = lz.rect(-0.07, frente_alto - 0.075, 0.07, frente_alto - 0.04, 0.017)
    lz.color(asidero, (80, 20, 14, 255))
    for i in range(5):
        x = -m + 0.045 + i * (a['ancho'] - 0.09) / 4
        nervio = lz.rect(x - 0.007, 0.03, x + 0.007, frente_alto - 0.1, 0.006)
        lz.color(nervio, (240, 110, 80, 120))
    lz.brillo(frente, 0, frente_alto * 0.9, m * 0.85, 0.012, 110, 0.006)
    lz.color(lz.rect(-m + 0.01, 0.008, m - 0.01, 0.022), (110, 24, 16, 140))
    return lz.guardar('caja.png'), lz.extent


# --- Camarero -------------------------------------------------------------------


def curva_hombros(cx, y_base, y_hombro, y_cuello, w_cuerpo, w_cuello, n=26):
    """Contorno de un torso con hombros REDONDEADOS (un cuarto de elipse), no una caja."""
    der = [(cx + w_cuerpo, y_base), (cx + w_cuerpo, y_hombro)]
    for k in range(1, n + 1):
        t = k / n
        ang = t * math.pi / 2
        der.append((cx + w_cuello + (w_cuerpo - w_cuello) * math.cos(ang), y_hombro + (y_cuello - y_hombro) * math.sin(ang)))
    izq = [(2 * cx - x, y) for x, y in reversed(der)]
    return der + izq


def camarero():
    """Medio cuerpo tras la barra, con una OREJA grande y bien hecha: es la diana."""
    hx = CABEZA['dx']
    hy = OREJA['alto'] + CABEZA['dy']
    R = 0.112  # la cabeza se dibuja un poco mas grande que lo que choca (CABEZA['r'])
    lz = Lienzo(-0.12, 0.47, 0.0, hy + R + 0.07)
    cuello_y = hy - R * 0.92
    hombro_y = cuello_y - 0.11
    ancho = 0.185

    # Torso: camisa blanca con hombros redondos, sombreada hacia los lados.
    forma = lz.poligono(curva_hombros(hx, 0, hombro_y, cuello_y, ancho, 0.05))
    lz.sombra(forma, 0.012, -0.006)
    lz.contorno(forma)
    lz.degradado(forma, (255, 255, 255, 255), (222, 226, 232, 255), horizontal=True)
    lz.brillo(forma, hx - 0.09, hombro_y - 0.02, 0.025, 0.07, 110, 0.012)
    # Brazos: la manga baja hasta un puno doblado y de ahi, el antebrazo con piel.
    for lado in (-1, 1):
        cx_b = hx + lado * 0.172
        antebrazo = lz.poligono([(cx_b - 0.034, 0.0), (cx_b + 0.034, 0.0), (cx_b + 0.04, 0.31), (cx_b - 0.04, 0.31)])
        lz.contorno(antebrazo, 0.005)
        lz.degradado(antebrazo, (238, 184, 150, 255), (216, 152, 118, 255), horizontal=True)
        manga = lz.poligono([(cx_b - 0.05, 0.28), (cx_b + 0.05, 0.28), (cx_b + 0.058, hombro_y + 0.0), (cx_b - 0.058, hombro_y + 0.0)])
        lz.contorno(manga, 0.005)
        lz.degradado(manga, (252, 252, 254, 255), (212, 216, 226, 255), horizontal=True)
        puno = lz.rect(cx_b - 0.056, 0.275, cx_b + 0.056, 0.335, 0.014)
        lz.contorno(puno, 0.004)
        lz.degradado(puno, (236, 240, 248, 255), (190, 198, 214, 255))
    # Delantal de barman: peto oscuro con tirantes al cuello, bolsillo y cordon.
    peto = lz.poligono([(hx - 0.115, 0), (hx + 0.115, 0), (hx + 0.1, hombro_y - 0.02), (hx + 0.06, cuello_y - 0.085),
                        (hx - 0.06, cuello_y - 0.085), (hx - 0.1, hombro_y - 0.02)])
    lz.contorno(peto, 0.005)
    lz.degradado(peto, (46, 80, 96, 255), (24, 48, 62, 255))
    for lado in (-1, 1):
        tirante = lz.poligono([(hx + lado * 0.06, cuello_y - 0.085), (hx + lado * 0.095, cuello_y - 0.02), (hx + lado * 0.075, cuello_y + 0.0),
                               (hx + lado * 0.04, cuello_y - 0.075)])
        lz.contorno(tirante, 0.004)
        lz.degradado(tirante, (60, 96, 112, 255), (30, 56, 70, 255))
    bolsillo = lz.rect(hx - 0.07, 0.2, hx + 0.07, 0.31, 0.02)
    lz.contorno(bolsillo, 0.004, (16, 34, 44, 255))
    lz.degradado(bolsillo, (58, 92, 108, 255), (34, 62, 76, 255))
    lz.color(lz.rect(hx - 0.07, 0.295, hx + 0.07, 0.31, 0.01), (96, 132, 148, 255))
    # Un abrebotellas asomando del bolsillo.
    lz.color(lz.rect(hx + 0.035, 0.29, hx + 0.05, 0.37, 0.006), (170, 174, 184, 255))
    lz.color(lz.elipse(hx + 0.0425, 0.37, 0.016, 0.012), (212, 214, 222, 255))
    lz.brillo(peto, hx - 0.05, hombro_y - 0.1, 0.015, 0.09, 80, 0.008)
    # Trapo al hombro, con rayas.
    trapo = lz.poligono([(hx + 0.07, cuello_y + 0.0), (hx + 0.16, hombro_y + 0.04), (hx + 0.21, hombro_y - 0.06), (hx + 0.2, hombro_y - 0.2),
                         (hx + 0.135, hombro_y - 0.19), (hx + 0.135, hombro_y - 0.04)])
    lz.contorno(trapo, 0.004)
    lz.color(trapo, (246, 240, 224, 255))
    for k in range(3):
        y = hombro_y - 0.03 - k * 0.045
        lz.color(interseccion(lz.rect(hx + 0.12, y - 0.011, hx + 0.23, y + 0.011), trapo), (200, 80, 66, 255))
    # Cuello y cuello de la camisa en pico.
    cuello = lz.rect(hx - 0.04, cuello_y - 0.04, hx + 0.04, hy - R * 0.5, 0.02)
    lz.contorno(cuello, 0.004)
    lz.degradado(cuello, (232, 176, 142, 255), (206, 140, 108, 255), horizontal=True)
    for lado in (-1, 1):
        solapa = lz.poligono([(hx, cuello_y - 0.06), (hx + lado * 0.07, cuello_y - 0.005), (hx + lado * 0.075, cuello_y - 0.065)])
        lz.contorno(solapa, 0.004)
        lz.color(solapa, (255, 255, 255, 255))
    # Pajarita roja.
    for lado in (-1, 1):
        ala = lz.poligono([(hx, cuello_y - 0.03), (hx + lado * 0.055, cuello_y - 0.005), (hx + lado * 0.055, cuello_y - 0.06)])
        lz.contorno(ala, 0.004)
        lz.degradado(ala, (214, 56, 48, 255), (150, 28, 26, 255))
    nudo = lz.rect(hx - 0.013, cuello_y - 0.05, hx + 0.013, cuello_y - 0.012, 0.01)
    lz.contorno(nudo, 0.003)
    lz.color(nudo, (170, 34, 30, 255))

    # LA OREJA (la diana): grande, de perfil, con su hélix, el antehelix y el lobulo. Va detras de la cabeza.
    ox, oy = 0.0, OREJA['alto']
    pabellon = lz.elipse(ox, oy + 0.005, 0.068, 0.088)
    lobulo = lz.elipse(ox - 0.004, oy - 0.07, 0.03, 0.028)
    oreja = ImageChops.lighter(pabellon, lobulo)
    lz.sombra(oreja, 0.008, -0.004)
    lz.contorno(oreja, 0.005)
    lz.degradado(oreja, (246, 200, 166, 255), (226, 164, 130, 255), horizontal=True)
    # Helix: el aro exterior, mas oscuro, y la concha interior en sombra.
    aro = resta(lz.elipse(ox - 0.003, oy + 0.008, 0.056, 0.074), lz.elipse(ox - 0.003, oy + 0.004, 0.044, 0.062))
    lz.color(aro, (206, 136, 108, 200))
    lz.degradado(lz.elipse(ox + 0.004, oy - 0.002, 0.03, 0.045), (214, 140, 112, 255), (176, 100, 80, 255))
    lz.color(lz.elipse(ox + 0.012, oy - 0.012, 0.014, 0.026), (150, 78, 62, 255))
    lz.brillo(oreja, ox - 0.03, oy + 0.04, 0.012, 0.022, 110, 0.006)

    # Cabeza redonda con barbilla suave.
    cara = ImageChops.lighter(lz.elipse(hx, hy, R, R * 1.03), lz.elipse(hx, hy - R * 0.38, R * 0.86, R * 0.75))
    lz.sombra(cara, 0.008, -0.004)
    lz.contorno(cara)
    lz.degradado(cara, (250, 206, 172, 255), (232, 172, 138, 255), horizontal=True)
    # Pelo: casquete con tupe hacia delante y patillas. Sin brillos grandes.
    casquete = resta(lz.elipse(hx, hy + 0.02, R * 1.07, R * 1.04), lz.elipse(hx + 0.012, hy - 0.025, R * 0.93, R * 0.9))
    tupe = lz.elipse(hx - 0.018, hy + R * 0.86, 0.075, 0.042)
    flequillo = lz.poligono([(hx - 0.085, hy + 0.03), (hx + 0.07, hy + 0.04), (hx + 0.045, hy + 0.012), (hx - 0.03, hy + 0.01)])
    pelo = interseccion(ImageChops.lighter(ImageChops.lighter(casquete, tupe), flequillo), lz.rect(hx - R * 1.2, hy - 0.04, hx + R * 1.2, hy + R * 1.4))
    lz.contorno(pelo, 0.005)
    lz.degradado(pelo, (92, 58, 36, 255), (46, 28, 18, 255))
    mecha = interseccion(lz.elipse(hx - 0.03, hy + R * 0.84, 0.045, 0.012), pelo)
    lz.color(mecha, (150, 104, 70, 150))
    # Cejas, ojos, nariz, bigote, sonrisa y mofletes.
    for dx in (-0.042, 0.042):
        lz.color(lz.elipse(hx + dx, hy + 0.005, 0.022, 0.026), (255, 255, 255, 255))
        lz.color(lz.elipse(hx + dx - 0.004, hy + 0.002, 0.012, 0.015), (74, 44, 26, 255))
        lz.color(lz.elipse(hx + dx - 0.004, hy + 0.002, 0.0065, 0.0085), (20, 14, 12, 255))
        lz.color(lz.elipse(hx + dx - 0.009, hy + 0.009, 0.0042, 0.0042), (255, 255, 255, 255))
        ceja = resta(lz.elipse(hx + dx + (0.004 if dx < 0 else -0.004), hy + 0.053, 0.026, 0.014),
                     lz.elipse(hx + dx + (0.004 if dx < 0 else -0.004), hy + 0.047, 0.028, 0.0145))
        lz.color(ceja, (60, 38, 26, 255))
        lz.color(lz.elipse(hx + dx * 1.45, hy - 0.04, 0.02, 0.012), (240, 128, 120, 110))
    nariz = lz.elipse(hx - 0.004, hy - 0.026, 0.024, 0.024)
    lz.contorno(nariz, 0.003, (190, 120, 94, 255))
    lz.degradado(nariz, (244, 178, 146, 255), (222, 148, 118, 255))
    lz.brillo(nariz, hx - 0.011, hy - 0.019, 0.007, 0.007, 170, 0.003)
    # Bigote de manillar con las puntas rizadas.
    bigote = ImageChops.lighter(lz.elipse(hx - 0.03, hy - 0.056, 0.036, 0.016), lz.elipse(hx + 0.022, hy - 0.056, 0.036, 0.016))
    bigote = ImageChops.lighter(bigote, ImageChops.lighter(lz.elipse(hx - 0.068, hy - 0.046, 0.011, 0.014), lz.elipse(hx + 0.06, hy - 0.046, 0.011, 0.014)))
    lz.contorno(bigote, 0.003, (30, 18, 12, 255))
    lz.degradado(bigote, (70, 44, 28, 255), (34, 20, 14, 255))
    sonrisa = resta(lz.elipse(hx - 0.002, hy - 0.078, 0.034, 0.02), lz.elipse(hx - 0.002, hy - 0.068, 0.034, 0.017))
    lz.color(sonrisa, (130, 44, 38, 255))
    return lz.guardar('camarero.png'), lz.extent


# --- Catapulta y chapa -----------------------------------------------------------


def madera(lz, mk, claro=(196, 136, 74, 255), oscuro=(128, 80, 36, 255), horizontal=False):
    lz.degradado(mk, claro, oscuro, horizontal=horizontal)
    rnd = random.Random(7)
    caja_ = mk.getbbox()
    if not caja_:
        return
    for _ in range(8):
        y = rnd.uniform(caja_[1], caja_[3])
        veta = Image.new('L', (lz.w, lz.h), 0)
        ImageDraw.Draw(veta).line([(caja_[0], y), (caja_[2], y + rnd.uniform(-8, 8))], fill=90, width=SS * 2)
        lz.color(interseccion(veta, mk), (90, 52, 20, 120))


def catapulta_base():
    px, py = PIVOTE
    lz = Lienzo(-0.34, 0.2, 0.0, 0.3)
    # Patin de abajo, dos patas en A hasta el eje, ruedas.
    patin = lz.rect(-0.3, 0.035, 0.14, 0.075, 0.012)
    pata_a = lz.poligono([(-0.26, 0.06), (-0.22, 0.06), (px + 0.015, py + 0.02), (px - 0.02, py + 0.03)])
    pata_b = lz.poligono([(0.08, 0.06), (0.12, 0.06), (px + 0.02, py + 0.03), (px - 0.015, py + 0.02)])
    tope = lz.rect(0.02, 0.06, 0.05, 0.2, 0.008)  # donde golpea el brazo al soltar
    estructura = ImageChops.lighter(ImageChops.lighter(patin, pata_a), ImageChops.lighter(pata_b, tope))
    lz.sombra(estructura, 0.01, -0.005)
    lz.contorno(estructura)
    for pieza in (pata_a, pata_b, tope):
        madera(lz, pieza, horizontal=True)
    madera(lz, patin)
    lz.color(lz.rect(0.015, 0.17, 0.055, 0.2, 0.01), (90, 60, 40, 255))  # cojin del tope
    for x in (-0.24, 0.08):
        rueda = lz.elipse(x, 0.035, 0.035, 0.035)
        lz.contorno(rueda, 0.005)
        lz.degradado(rueda, (150, 100, 52, 255), (96, 60, 26, 255))
        lz.color(lz.elipse(x, 0.035, 0.012, 0.012), (60, 40, 30, 255))
    # Eje del brazo (encima de todo, el brazo se pinta debajo en la app).
    eje = lz.elipse(px, py, 0.02, 0.02)
    lz.contorno(eje, 0.004)
    lz.degradado(eje, (200, 200, 205, 255), (110, 110, 120, 255))
    return lz.guardar('catapulta-base.png'), lz.extent


def catapulta_brazo():
    """El brazo, horizontal hacia la DERECHA y con el eje en el centro del PNG: asi se gira desde su centro."""
    largo = math.hypot(-PIVOTE[0], ALTURA_SALIDA - PIVOTE[1])
    medio = largo + 0.07
    lz = Lienzo(-medio, medio, -0.07, 0.07)
    palo = lz.rect(-0.03, -0.017, largo - 0.03, 0.017, 0.012)
    cuchara = resta(lz.elipse(largo, 0.0, 0.058, 0.05), lz.elipse(largo, 0.018, 0.045, 0.04))
    cuchara = ImageChops.lighter(cuchara, lz.elipse(largo, -0.012, 0.05, 0.032))
    todo = ImageChops.lighter(palo, cuchara)
    lz.contorno(todo)
    madera(lz, palo)
    lz.degradado(cuchara, (170, 112, 56, 255), (110, 66, 28, 255))
    # Cuerdas de la torsion en el eje.
    for i in range(3):
        lz.color(lz.rect(-0.03 + i * 0.014, -0.022, -0.022 + i * 0.014, 0.022, 0.003), (220, 200, 150, 255))
    return lz.guardar('catapulta-brazo.png'), lz.extent, largo


def chapa():
    """Chapa de botellin, vista de frente: corona de dientes, roja y dorada."""
    R = 0.045
    lz = Lienzo(-R - 0.01, R + 0.01, -R - 0.01, R + 0.01)
    dientes = 21
    pts = []
    for i in range(dientes * 2):
        ang = math.pi * 2 * i / (dientes * 2)
        rr = R if i % 2 == 0 else R * 0.86
        pts.append((rr * math.cos(ang), rr * math.sin(ang)))
    corona = lz.poligono(pts)
    lz.contorno(corona, 0.004)
    lz.degradado(corona, (236, 196, 96, 255), (168, 118, 30, 255))
    cara = lz.elipse(0, 0, R * 0.74, R * 0.74)
    lz.contorno(cara, 0.003, (120, 30, 20, 255))
    lz.degradado(cara, (226, 70, 52, 255), (150, 28, 22, 255))
    # Estrella de la marca.
    est = []
    for i in range(10):
        ang = math.pi / 2 + math.pi * i / 5
        rr = R * 0.38 if i % 2 == 0 else R * 0.16
        est.append((rr * math.cos(ang), rr * math.sin(ang)))
    lz.color(lz.poligono(est), (250, 222, 140, 255))
    lz.brillo(corona, -R * 0.35, R * 0.4, R * 0.35, R * 0.2, 170, 0.004)
    return lz.guardar('chapa.png'), lz.extent


# --- Fondo y barra ---------------------------------------------------------------


def fondo():
    """La pared del bar: azulejos abajo, estanteria con botellas, lampara. Apagado, para no distraer."""
    # Fondo: menos resolucion (va detras y apagado) y asi el script no tarda minutos.
    lz = Lienzo(0, 4.0, 0, 1.8, ppm=180)
    pared = lz.rect(0, 0, 4.0, 1.8)
    lz.degradado(pared, (246, 234, 210, 255), (232, 214, 182, 255))
    # Zocalo de azulejos.
    zocalo = lz.rect(0, 0, 4.0, 0.62)
    lz.degradado(zocalo, (196, 222, 214, 255), (164, 198, 188, 255))
    for i in range(0, 41):
        lz.color(lz.rect(i * 0.1 - 0.002, 0, i * 0.1 + 0.002, 0.62), (240, 246, 240, 255))
    for j in range(0, 7):
        lz.color(lz.rect(0, j * 0.1 - 0.002, 4.0, j * 0.1 + 0.002), (240, 246, 240, 255))
    lz.color(lz.rect(0, 0.6, 4.0, 0.64), (150, 104, 60, 255))
    # Dos estantes con botellas.
    rnd = random.Random(11)
    colores = [(64, 120, 70), (120, 70, 30), (150, 40, 34), (60, 90, 120), (200, 150, 60), (40, 60, 40)]
    for ye in (1.12, 1.52):
        x = 0.1
        while x < 3.9:
            c = rnd.choice(colores)
            alto = rnd.uniform(0.18, 0.3)
            anc = rnd.uniform(0.06, 0.09)
            b = ImageChops.lighter(lz.rect(x, ye, x + anc, ye + alto * 0.65, 0.015),
                                   lz.rect(x + anc * 0.35, ye, x + anc * 0.65, ye + alto, 0.008))
            lz.contorno(b, 0.004, (90, 60, 40, 255))
            lz.degradado(b, (*c, 255), tuple(int(v * 0.6) for v in c) + (255,), horizontal=True)
            lz.color(interseccion(lz.rect(x + anc * 0.12, ye + alto * 0.2, x + anc * 0.88, ye + alto * 0.42), b), (240, 230, 200, 230))
            lz.brillo(b, x + anc * 0.25, ye + alto * 0.4, anc * 0.1, alto * 0.25, 120, 0.004)
            x += anc + rnd.uniform(0.03, 0.12)
        estante = lz.rect(0, ye - 0.035, 4.0, ye)
        lz.contorno(estante, 0.004)
        madera(lz, estante)
    # Lamparas.
    for x in (0.9, 2.9):
        lz.color(lz.rect(x - 0.004, 1.72, x + 0.004, 1.8), (60, 50, 40, 255))
        luz = lz.elipse(x, 1.62, 0.5, 0.25).filter(ImageFilter.GaussianBlur(lz.m(0.08)))
        lz.color(luz, (255, 236, 170, 90))
        pantalla = lz.poligono([(x - 0.12, 1.62), (x + 0.12, 1.62), (x + 0.05, 1.72), (x - 0.05, 1.72)])
        lz.contorno(pantalla, 0.004)
        lz.degradado(pantalla, (60, 100, 70, 255), (30, 60, 40, 255))
    # Velo: el fondo no compite con lo que se juega.
    lz.color(pared, (246, 236, 216, 70))
    final = lz.img.resize((lz.w // SS, lz.h // SS), Image.LANCZOS).convert('RGB')
    final.save(SALIDA / 'fondo.jpg', quality=84, optimize=True)
    return final.size


def barra():
    """El frente de la barra: tablero claro arriba y paneles debajo. Se estira a lo ancho."""
    lz = Lienzo(0, 2.0, -0.2, 0.0, ppm=220)
    frente = lz.rect(0, -0.2, 2.0, 0.0)
    madera(lz, frente, (150, 92, 40, 255), (96, 56, 22, 255))
    for i in range(1, 8):
        lz.color(lz.rect(i * 0.25 - 0.004, -0.2, i * 0.25 + 0.004, -0.04), (70, 40, 16, 200))
    tablero = lz.rect(0, -0.04, 2.0, 0.0)
    madera(lz, tablero, (214, 160, 96, 255), (170, 114, 56, 255))
    lz.color(lz.rect(0, -0.002, 2.0, 0.0), (250, 220, 170, 255))
    final = lz.img.resize((lz.w // SS, lz.h // SS), Image.LANCZOS).convert('RGB')
    final.save(SALIDA / 'barra.jpg', quality=86, optimize=True)
    return final.size


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    geo = {}
    for nombre, f in (('vaso', vaso), ('jarra', jarra), ('caja', caja), ('camarero', camarero), ('base', catapulta_base),
                      ('chapa', chapa)):
        tam, (x0, x1, y0, y1) = f()
        geo[nombre] = (tam, x0, x1, y0, y1)
    tam, (x0, x1, y0, y1), largo = catapulta_brazo()
    geo['brazo'] = (tam, round(x0, 6), round(x1, 6), y0, y1)
    fondo()
    barra()

    lineas = [
        '// GENERADO por scripts/generar-sprites-tapon.py. No editar a mano: regenerar.',
        '//',
        '// Donde cae cada dibujo de assets/tapon/ respecto a su punto de referencia, en',
        '// metros: x0..x1 a lo ancho, y0..y1 a lo alto (y hacia arriba). Lo que va en la',
        '// barra (vaso, jarra, caja, camarero, base) tiene la referencia EN la barra (y = 0)',
        '// bajo el centro de su boca, de la oreja o de la cuchara. El brazo, en su eje; la',
        '// chapa, en su centro.',
        '',
        'export type Caja = { x0: number; x1: number; y0: number; y1: number; px: [number, number] };',
        '',
        'export const SPRITES = {',
    ]
    for nombre, (tam, x0, x1, y0, y1) in geo.items():
        lineas.append(f'  {nombre}: {{ x0: {x0}, x1: {x1}, y0: {y0}, y1: {y1}, px: [{tam[0]}, {tam[1]}] }},')
    lineas += [
        '} as const satisfies Record<string, Caja>;',
        '',
        '/** Eje del brazo de la catapulta, respecto al punto de la barra bajo la cuchara (m). */',
        f'export const PIVOTE = {{ x: {PIVOTE[0]}, y: {PIVOTE[1]} }};',
        '/** Del eje al centro de la cuchara (m). */',
        f'export const LARGO_BRAZO = {round(largo, 6)};',
        '/** Medidas con las que se dibujo, para que el test las compare con modelo.ts. */',
        f'export const DIBUJADO_CON = {{ alturaSalida: {ALTURA_SALIDA}, vaso: {VASO}, jarra: {JARRA}, caja: {CAJA}, oreja: {OREJA}, cabeza: {CABEZA} }};'.replace("'", ''),
        '',
    ]
    GEOMETRIA.write_text('\n'.join(lineas), encoding='utf-8')
    print('Escritos', sorted(p.name for p in SALIDA.iterdir()), 'y', GEOMETRIA.name)


if __name__ == '__main__':
    main()
