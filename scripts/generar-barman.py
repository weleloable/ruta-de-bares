"""Genera los dibujos de Barman Express: assets/barman/sprites/ y su geometria.

    python scripts/generar-barman.py

Los PNG generados NO se editan a mano. Se reutiliza el lienzo de Tapon al Vuelo
(generar-sprites-tapon.py: supermuestreo, degradados, brillos, espuma y
burbujas), asi los vasos y la cerveza son de la misma familia que la jarra y
la chapa de los otros juegos.

  * ingredientes/*.png: los 12 botones de la barra (vaso, vaso grande, copa,
    vasito, grifo, vino, gaseosa, vermut, botella de la casa, hielo, refresco
    de limon y naranja). Cada uno se distingue por la FORMA, no solo por el
    color: el vino es una botella alta de hombros, la gaseosa una botella recta
    y transparente, el vermut un BARRIL tumbado con patas y grifo (el vermut de
    barril), la de la casa una garrafa con asa, el refresco de limon una LATA
    y la naranja una rodaja.
  * bebidas/<bebida>-<paso>.png: la bebida a medio hacer despues de cada paso
    (la caña tras el vaso, tras el grifo...). Todas en el MISMO lienzo, asi la
    app las pinta en el mismo hueco y no "saltan".
  * fondo.jpg y barra.png: la pared del bar con sus botellas y la barra de madera.
  * clientes/*.png: los bustos de Open Peeps (originales en assets/barman/clientes/,
    ver su CREDITOS.md) con un BORDE CLARO tipo pegatina: son de linea negra y
    sobre el fondo oscuro del bar se perderian.
  * src/features/minijuegos/juegos/barman/spritesGeometria.ts: proporciones,
    para reservar el hueco exacto sin medir las imagenes.

tests/barman-sprites.test.ts comprueba que esta todo y con su tamano.
"""

import importlib.util
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.dont_write_bytecode = True

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN_CLIENTES = RAIZ / 'assets' / 'barman' / 'clientes'
SALIDA = RAIZ / 'assets' / 'barman' / 'sprites'
GEOMETRIA = RAIZ / 'src' / 'features' / 'minijuegos' / 'juegos' / 'barman' / 'spritesGeometria.ts'

_spec = importlib.util.spec_from_file_location('tapon', RAIZ / 'scripts' / 'generar-sprites-tapon.py')
T = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(T)
Lienzo, interseccion, resta, burbujas, espuma = T.Lienzo, T.interseccion, T.resta, T.burbujas, T.espuma
CONTORNO, VIDRIO = T.CONTORNO, T.VIDRIO
CERVEZA_ARRIBA, CERVEZA_ABAJO, ESPUMA, ESPUMA_SOMBRA = T.CERVEZA_ARRIBA, T.CERVEZA_ABAJO, T.ESPUMA, T.ESPUMA_SOMBRA

# El crema del tema (colors.paper en src/lib/theme.ts).
CREMA = (246, 239, 226)
# Cristal de los vasos VACIOS: casi opaco. El de Tapon (VIDRIO, alfa 110) deja ver el
# relleno marron del contorno y un vaso vacio salia gris.
CRISTAL = (232, 244, 249, 240)

# Lienzos (metros). Iconos: 0.30 x 0.30 a 128 px. Bebidas: 0.30 x 0.34 a 240 px de ancho.
ICONO = 0.30
PPM_ICONO = 128 / ICONO
BEBIDA_ANCHO, BEBIDA_ALTO = 0.30, 0.34
PPM_BEBIDA = 240 / BEBIDA_ANCHO

VINO_TINTO = ((150, 20, 40, 255), (92, 10, 26, 255))
TINTO_VERANO = ((196, 42, 60, 235), (128, 18, 36, 255))
VERMUT = ((168, 62, 30, 240), (110, 34, 14, 255))
CHUPITO = ((240, 200, 120, 235), (204, 140, 50, 255))
CLARA = ((252, 230, 140, 255), (232, 190, 80, 255))
HIELO = (222, 244, 252, 210)
LIMON = (250, 222, 70, 255)
LIMON_OSCURO = (214, 176, 30, 255)
NARANJA = (250, 150, 40, 255)
NARANJA_OSCURA = (214, 104, 20, 255)


def guardar(lz, ruta):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    final = lz.img.resize((lz.w // T.SS, lz.h // T.SS), Image.LANCZOS)
    final.save(ruta, optimize=True)
    return final


# --- Formas de los vasos (y = 0 en la base, x = 0 en el centro) -------------------

VASOS = {
    # medio ancho abajo, medio ancho arriba, alto, grosor del fondo
    'vaso': (0.050, 0.064, 0.170, 0.014),
    'vaso-grande': (0.056, 0.074, 0.245, 0.016),
    'vasito': (0.030, 0.038, 0.080, 0.020),
}


def silueta_vaso(lz, tipo, dx=0.0):
    ab, ar, alto, _ = VASOS[tipo]
    return lz.poligono([(dx - ab, 0), (dx + ab, 0), (dx + ar, alto), (dx - ar, alto)])


def interior_vaso(lz, tipo, nivel, dx=0.0):
    """El liquido: de la base gruesa hasta `nivel` (0..1 del alto), por dentro de las paredes."""
    ab, ar, alto, fondo = VASOS[tipo]
    pared = 0.008
    y1 = fondo + (alto - fondo - 0.006) * nivel

    def ancho(y):
        return ab + (ar - ab) * y / alto - pared

    return lz.poligono([(dx - ancho(fondo), fondo), (dx + ancho(fondo), fondo), (dx + ancho(y1), y1), (dx - ancho(y1), y1)]), y1, ancho(y1)


def pintar_vaso(lz, tipo, dx=0.0, sombra=True):
    cuerpo = silueta_vaso(lz, tipo, dx)
    if sombra:
        lz.sombra(cuerpo, 0.008, -0.004, 60, 0.008)
    lz.contorno(cuerpo, 0.005)
    lz.color(cuerpo, CRISTAL)
    return cuerpo


def remate_vaso(lz, tipo, cuerpo, dx=0.0):
    ab, ar, alto, fondo = VASOS[tipo]
    lz.color(interseccion(lz.rect(dx - ab, 0, dx + ab, fondo), cuerpo), (240, 248, 250, 170))
    lz.brillo(cuerpo, dx - ar * 0.55, alto * 0.5, 0.010, alto * 0.42, 200, 0.004)
    lz.brillo(cuerpo, dx + ar * 0.6, alto * 0.55, 0.004, alto * 0.3, 120, 0.003)
    lz.color(lz.elipse(dx, alto, ar, 0.006), (250, 252, 252, 150))


def copa(lz, dx=0.0):
    """Copa de vino: caliz, tallo y pie. Devuelve la mascara del caliz."""
    caliz = lz.elipse(dx, 0.175, 0.068, 0.085)
    caliz = interseccion(caliz, lz.rect(dx - 0.1, 0.11, dx + 0.1, 0.235))
    caliz = ImageChops.lighter(caliz, lz.rect(dx - 0.062, 0.175, dx + 0.062, 0.235))
    tallo = lz.rect(dx - 0.006, 0.012, dx + 0.006, 0.12)
    pie = lz.elipse(dx, 0.010, 0.050, 0.010)
    todo = ImageChops.lighter(ImageChops.lighter(caliz, tallo), pie)
    lz.sombra(todo, 0.008, -0.004, 60, 0.008)
    lz.contorno(todo, 0.005)
    lz.color(todo, CRISTAL)
    return caliz, todo


def remate_copa(lz, caliz, todo, dx=0.0):
    lz.brillo(caliz, dx - 0.035, 0.18, 0.010, 0.045, 170, 0.004)
    lz.color(lz.elipse(dx, 0.235, 0.062, 0.006), (250, 252, 252, 150))


def liquido_copa(lz, caliz, nivel, colores, dx=0.0):
    tope = 0.115 + (0.225 - 0.115) * nivel
    mk = interseccion(caliz, lz.rect(dx - 0.1, 0.0, dx + 0.1, tope))
    mk = mk.filter(ImageFilter.MinFilter(int(lz.m(0.007)) | 1))
    lz.degradado(mk, *colores)
    return mk, tope


def cubitos(lz, xs, y, lado=0.030, semilla=1, mascara=None):
    rnd = random.Random(semilla)
    for i, x in enumerate(xs):
        yy = y + rnd.uniform(-0.006, 0.006)
        c = lz.rect(x - lado / 2, yy - lado / 2, x + lado / 2, yy + lado / 2, lado * 0.25)
        if mascara is not None:
            c = interseccion(c, mascara)
        lz.contorno(c, 0.003, (120, 170, 190, 255))
        lz.color(c, HIELO)
        lz.brillo(c, x - lado * 0.2, yy + lado * 0.2, lado * 0.18, lado * 0.12, 200, 0.002)


def rodaja(lz, cx, cy, r, claro, oscuro, gajos=8):
    """Rodaja de citrico vista de frente: corteza, pulpa y gajos."""
    piel = lz.elipse(cx, cy, r, r)
    lz.contorno(piel, 0.004)
    lz.color(piel, oscuro)
    pulpa = lz.elipse(cx, cy, r * 0.84, r * 0.84)
    lz.color(pulpa, claro)
    mk = lz.mascara()
    d = ImageDraw.Draw(mk)
    for i in range(gajos):
        a = 2 * math.pi * i / gajos
        d.line([lz.p(cx, cy), lz.p(cx + math.cos(a) * r * 0.84, cy + math.sin(a) * r * 0.84)], fill=255, width=int(lz.m(0.004)))
    lz.color(mk, (255, 248, 220, 220))
    lz.color(lz.elipse(cx, cy, r * 0.12, r * 0.12), (255, 248, 220, 255))


def rodaja_en_borde(lz, cx, cy, r, claro, oscuro):
    """Media rodaja clavada en el borde del vaso (se ve el semicirculo de arriba)."""
    rodaja(lz, cx, cy, r, claro, oscuro, 6)


# --- Ingredientes (iconos) ---------------------------------------------------------


def lienzo_icono(zoom=1.0):
    """Lienzo del icono (siempre 128 px). Con zoom > 1 el dibujo sale mas grande."""
    return Lienzo(-ICONO / 2 / zoom, ICONO / 2 / zoom, -0.01 / zoom, (ICONO - 0.01) / zoom, PPM_ICONO * zoom)


# Zoom de cada vaso en su icono. El vasito a tamano real saldria de ~12 px en un boton
# de 44: se amplia, y se sigue distinguiendo por la forma (bajo, ancho, fondo grueso).
ZOOM_ICONO = {'vaso': 1.15, 'vaso-grande': 1.0, 'vasito': 1.5}


def icono_vaso(tipo):
    lz = lienzo_icono(ZOOM_ICONO[tipo])
    cuerpo = pintar_vaso(lz, tipo)
    remate_vaso(lz, tipo, cuerpo)
    return lz


def icono_copa():
    lz = lienzo_icono()
    caliz, todo = copa(lz)
    remate_copa(lz, caliz, todo)
    return lz


def icono_grifo():
    lz = lienzo_icono()
    # Torre del grifo, cuerpo cromado, palanca alta y caño hacia abajo, con una gota.
    cuerpo = lz.rect(-0.07, 0.15, 0.05, 0.19, 0.012)
    palanca = lz.rect(-0.018, 0.19, 0.018, 0.275, 0.014)
    pie = lz.rect(-0.07, 0.0, -0.035, 0.17, 0.006)
    cano = lz.rect(0.025, 0.105, 0.05, 0.16, 0.006)
    metal = ImageChops.lighter(ImageChops.lighter(cuerpo, pie), cano)
    lz.sombra(ImageChops.lighter(metal, palanca), 0.008, -0.004, 60, 0.008)
    lz.contorno(ImageChops.lighter(metal, palanca), 0.005)
    lz.degradado(metal, (236, 238, 240, 255), (150, 156, 162, 255), True)
    lz.degradado(palanca, (120, 66, 30, 255), (70, 36, 14, 255), True)
    lz.brillo(palanca, -0.008, 0.25, 0.004, 0.02, 160, 0.002)
    gota = ImageChops.lighter(lz.elipse(0.0375, 0.075, 0.012, 0.014), lz.poligono([(0.027, 0.08), (0.048, 0.08), (0.0375, 0.098)]))
    lz.contorno(gota, 0.003)
    lz.degradado(gota, CERVEZA_ARRIBA, CERVEZA_ABAJO)
    return lz


def botella(lz, silueta, cristal, etiqueta, tapon, liquido=None, nivel=0.6, alto=0.27):
    lz.sombra(silueta, 0.008, -0.004, 60, 0.008)
    lz.contorno(silueta, 0.005)
    lz.degradado(silueta, cristal[0], cristal[1], True)
    if liquido is not None:
        mk = interseccion(silueta, lz.rect(-0.2, 0.0, 0.2, alto * nivel))
        mk = mk.filter(ImageFilter.MinFilter(int(lz.m(0.008)) | 1))
        lz.degradado(mk, liquido[0], liquido[1])
    if etiqueta is not None:
        mk, c = etiqueta
        lz.contorno(mk, 0.003)
        lz.color(mk, c)
    if tapon is not None:
        mk, c = tapon
        lz.contorno(mk, 0.003)
        lz.color(mk, c)
    caja = silueta.getbbox()
    lz.brillo(silueta, -0.03, 0.12, 0.008, 0.07, 150, 0.004)
    return caja


def icono_vino():
    # Bordelesa: cuerpo recto alto, hombros marcados, cuello largo.
    lz = lienzo_icono()
    s = ImageChops.lighter(lz.rect(-0.042, 0.0, 0.042, 0.17, 0.012), lz.elipse(0, 0.17, 0.042, 0.022))
    s = ImageChops.lighter(s, lz.rect(-0.014, 0.17, 0.014, 0.27, 0.005))
    etiqueta = (lz.rect(-0.036, 0.05, 0.036, 0.12, 0.004), (246, 236, 214, 255))
    tapon = (lz.rect(-0.016, 0.255, 0.016, 0.28, 0.003), (150, 20, 40, 255))
    botella(lz, s, ((60, 20, 30, 255), (30, 8, 14, 255)), etiqueta, tapon)
    lz.color(lz.rect(-0.036, 0.075, 0.036, 0.09), (150, 20, 40, 255))
    return lz


def icono_gaseosa():
    # Recta, de cristal azulado, tapon de rosca y burbujas: la unica botella transparente.
    lz = lienzo_icono()
    s = ImageChops.lighter(lz.rect(-0.04, 0.0, 0.04, 0.2, 0.014), lz.poligono([(-0.04, 0.19), (0.04, 0.19), (0.016, 0.24), (-0.016, 0.24)]))
    s = ImageChops.lighter(s, lz.rect(-0.016, 0.23, 0.016, 0.255, 0.003))
    etiqueta = (lz.rect(-0.04, 0.07, 0.04, 0.12, 0.0), (40, 110, 200, 255))
    tapon = (lz.rect(-0.019, 0.25, 0.019, 0.275, 0.004), (40, 110, 200, 255))
    botella(lz, s, ((214, 236, 248, 220), (170, 206, 228, 230)), etiqueta, tapon)
    burbujas(lz, interseccion(s, lz.rect(-0.04, 0.13, 0.04, 0.19)), -0.03, 0.03, 0.135, 0.185, 14, 7)
    burbujas(lz, interseccion(s, lz.rect(-0.04, 0.01, 0.04, 0.07)), -0.03, 0.03, 0.015, 0.065, 10, 8)
    return lz


def icono_vermut():
    """El vermut de barril: barril tumbado sobre sus patas, con aros y un grifo en la tapa."""
    lz = lienzo_icono()
    # Patas: dos caballetes en aspa bajo el barril.
    patas = lz.mascara()
    d = ImageDraw.Draw(patas)
    for x in (-0.07, 0.05):
        for a, b in (((x - 0.03, 0.0), (x + 0.03, 0.09)), ((x + 0.03, 0.0), (x - 0.03, 0.09))):
            d.line([lz.p(*a), lz.p(*b)], fill=255, width=int(lz.m(0.014)))
    # Cuerpo: tumbado, mas ancho por el centro (la panza del barril).
    cuerpo = lz.poligono([
        (-0.11, 0.095), (-0.06, 0.08), (0.03, 0.08), (0.09, 0.095),
        (0.09, 0.215), (0.03, 0.23), (-0.06, 0.23), (-0.11, 0.215),
    ])
    cuerpo = ImageChops.lighter(cuerpo, lz.elipse(-0.015, 0.155, 0.085, 0.078))
    # La tapa de delante (a la derecha), un ovalo.
    tapa = lz.elipse(0.09, 0.155, 0.022, 0.06)
    todo = ImageChops.lighter(ImageChops.lighter(cuerpo, tapa), patas)
    lz.sombra(todo, 0.008, -0.004, 60, 0.008)
    lz.contorno(todo, 0.005)
    lz.color(patas, (110, 66, 36, 255))
    lz.degradado(cuerpo, (196, 124, 66, 255), (122, 70, 34, 255))
    # Duelas: lineas a lo largo.
    duelas = lz.mascara()
    d = ImageDraw.Draw(duelas)
    for y in (0.115, 0.14, 0.17, 0.195):
        d.line([lz.p(-0.1, y), lz.p(0.085, y)], fill=255, width=int(lz.m(0.003)))
    lz.color(interseccion(duelas, cuerpo), (110, 62, 30, 200))
    # Aros de hierro.
    for x in (-0.07, 0.045):
        aro = interseccion(lz.rect(x - 0.008, 0.0, x + 0.008, 0.3), cuerpo)
        lz.color(aro, (60, 56, 54, 255))
    lz.brillo(cuerpo, -0.02, 0.2, 0.07, 0.012, 120, 0.004)
    lz.contorno(tapa, 0.004)
    lz.degradado(tapa, (210, 150, 90, 255), (150, 92, 46, 255), True)
    # Grifo en la tapa: cano corto hacia fuera y abajo, con su llave.
    cano = ImageChops.lighter(lz.rect(0.1, 0.13, 0.135, 0.145, 0.004), lz.rect(0.123, 0.105, 0.137, 0.145, 0.004))
    llave = lz.rect(0.112, 0.145, 0.124, 0.175, 0.004)
    lz.contorno(ImageChops.lighter(cano, llave), 0.003)
    lz.degradado(cano, (236, 238, 240, 255), (150, 156, 162, 255))
    lz.color(llave, (150, 30, 30, 255))
    # Una gota de vermut.
    gota = lz.elipse(0.13, 0.09, 0.007, 0.009)
    lz.color(gota, VERMUT[0])
    return lz


def icono_casa():
    # Garrafa de barro con asa y corcho: la del chupito de la casa.
    lz = lienzo_icono()
    cuerpo = lz.elipse(-0.01, 0.085, 0.07, 0.085)
    cuello = lz.rect(-0.03, 0.15, 0.01, 0.22, 0.008)
    asa = resta(lz.elipse(0.065, 0.14, 0.04, 0.05), lz.elipse(0.065, 0.14, 0.022, 0.032))
    asa = resta(asa, cuerpo)
    s = ImageChops.lighter(ImageChops.lighter(cuerpo, cuello), asa)
    tapon = (lz.rect(-0.026, 0.215, 0.006, 0.255, 0.006), (196, 150, 100, 255))
    botella(lz, s, ((196, 120, 70, 255), (130, 70, 36, 255)), None, tapon)
    # Las tres equis de "aguardiente".
    mk = lz.mascara()
    d = ImageDraw.Draw(mk)
    for i in range(3):
        x = -0.04 + i * 0.03
        for a, b in (((x - 0.01, 0.075), (x + 0.01, 0.105)), ((x - 0.01, 0.105), (x + 0.01, 0.075))):
            d.line([lz.p(*a), lz.p(*b)], fill=255, width=int(lz.m(0.006)))
    lz.color(mk, (250, 238, 214, 255))
    return lz


def icono_hielo():
    lz = lienzo_icono()
    cubitos(lz, [-0.045, 0.045], 0.05, 0.075, 3)
    cubitos(lz, [0.0], 0.125, 0.075, 4)
    return lz


def icono_refresco_limon():
    """Refresco de limon: una LATA amarilla con un limon pintado (no un limon de verdad)."""
    lz = lienzo_icono()
    cuerpo = lz.rect(-0.05, 0.01, 0.05, 0.215, 0.012)
    tapa = lz.rect(-0.044, 0.205, 0.044, 0.23, 0.008)
    todo = ImageChops.lighter(cuerpo, tapa)
    lz.sombra(todo, 0.008, -0.004, 60, 0.008)
    lz.contorno(todo, 0.005)
    lz.degradado(cuerpo, (252, 226, 80, 255), (218, 176, 26, 255), True)
    lz.degradado(tapa, (230, 232, 236, 255), (160, 166, 172, 255), True)
    # Bandas metalicas arriba y abajo.
    lz.color(interseccion(lz.rect(-0.05, 0.01, 0.05, 0.03), cuerpo), (190, 194, 200, 255))
    lz.color(interseccion(lz.rect(-0.05, 0.19, 0.05, 0.205), cuerpo), (190, 194, 200, 255))
    # Anilla.
    anilla = resta(lz.elipse(0.012, 0.222, 0.014, 0.006), lz.elipse(0.012, 0.222, 0.007, 0.003))
    lz.color(anilla, (120, 126, 132, 255))
    # El limon estampado, con su hoja.
    limon = ImageChops.lighter(lz.elipse(0, 0.11, 0.032, 0.024), lz.elipse(-0.034, 0.11, 0.008, 0.007))
    limon = ImageChops.lighter(limon, lz.elipse(0.034, 0.11, 0.008, 0.007))
    lz.contorno(limon, 0.003, (150, 120, 20, 255))
    lz.color(limon, (255, 244, 150, 255))
    hoja = lz.poligono([(0.02, 0.135), (0.045, 0.16), (0.052, 0.143), (0.03, 0.13)])
    lz.color(hoja, (70, 140, 50, 255))
    lz.brillo(cuerpo, -0.03, 0.12, 0.008, 0.08, 160, 0.004)
    return lz


def icono_naranja():
    lz = lienzo_icono()
    r = 0.11
    lz.sombra(lz.elipse(0, 0.12, r, r), 0.008, -0.004, 60, 0.008)
    rodaja(lz, 0, 0.12, r, NARANJA, NARANJA_OSCURA)
    return lz


INGREDIENTES = {
    'vaso': lambda: icono_vaso('vaso'),
    'vaso-grande': lambda: icono_vaso('vaso-grande'),
    'copa': icono_copa,
    'vasito': lambda: icono_vaso('vasito'),
    'grifo': icono_grifo,
    'vino': icono_vino,
    'gaseosa': icono_gaseosa,
    'vermut': icono_vermut,
    'casa': icono_casa,
    'hielo': icono_hielo,
    'refresco-limon': icono_refresco_limon,
    'naranja': icono_naranja,
}


# --- Bebidas a medio hacer -----------------------------------------------------------


def lienzo_bebida():
    return Lienzo(-BEBIDA_ANCHO / 2, BEBIDA_ANCHO / 2, -0.01, BEBIDA_ALTO - 0.01, PPM_BEBIDA)


def cerveza_en(lz, tipo, nivel=0.8, semilla=1, colores=None):
    liquido, y1, ancho = interior_vaso(lz, tipo, nivel)
    lz.degradado(liquido, *(colores or (CERVEZA_ARRIBA, CERVEZA_ABAJO)))
    burbujas(lz, liquido, -ancho * 0.8, ancho * 0.8, VASOS[tipo][3] + 0.01, y1 - 0.01, 18, semilla)
    cuerpo = silueta_vaso(lz, tipo)
    esp = interseccion(espuma(lz, -ancho, ancho, y1 + 0.012, 0.034, semilla + 1), cuerpo)
    lz.degradado(esp, ESPUMA, ESPUMA_SOMBRA)


def bebida_cana(pasos, tipo='vaso', clara=False):
    lz = lienzo_bebida()
    cuerpo = pintar_vaso(lz, tipo)
    if clara and pasos >= 3:
        # Con el refresco de limon: mas llena, mas palida y turbia, y con menos espuma.
        cerveza_en(lz, tipo, 0.86, 3, CLARA)
    elif pasos >= 2:
        # La caña de la clara se tira hasta la mitad: el resto es refresco.
        cerveza_en(lz, tipo, 0.55 if clara else 0.8)
    remate_vaso(lz, tipo, cuerpo)
    return lz


def bebida_tinto(pasos):
    lz = lienzo_bebida()
    caliz, todo = copa(lz)
    if pasos >= 2:
        # Vino: mitad de la copa. Con gaseosa: casi llena, mas clara y con burbujas.
        nivel = 0.45 if pasos == 2 else 0.85
        colores = VINO_TINTO if pasos == 2 else TINTO_VERANO
        mk, tope = liquido_copa(lz, caliz, nivel, colores)
        if pasos >= 3:
            burbujas(lz, mk, -0.04, 0.04, 0.125, tope - 0.01, 16, 5)
        if pasos >= 4:
            cubitos(lz, [-0.025, 0.022], tope - 0.022, 0.03, 6, caliz)
    remate_copa(lz, caliz, todo)
    return lz


def bebida_vermut(pasos):
    lz = lienzo_bebida()
    tipo = 'vaso'
    cuerpo = pintar_vaso(lz, tipo)
    _, ar, alto, fondo = VASOS[tipo]
    if pasos >= 3:
        liquido, y1, ancho = interior_vaso(lz, tipo, 0.7)
        lz.degradado(liquido, *VERMUT)
    if pasos >= 2:
        nivel = fondo + (alto - fondo) * (0.55 if pasos >= 3 else 0.35)
        cubitos(lz, [-0.022, 0.02], nivel - 0.03, 0.032, 9, cuerpo)
        cubitos(lz, [0.0], nivel, 0.032, 10, cuerpo)
    remate_vaso(lz, tipo, cuerpo)
    if pasos >= 4:
        rodaja_en_borde(lz, ar * 0.75, alto + 0.005, 0.032, NARANJA, NARANJA_OSCURA)
    return lz


def bebida_chupito(pasos):
    lz = lienzo_bebida()
    tipo = 'vasito'
    cuerpo = pintar_vaso(lz, tipo)
    if pasos >= 2:
        liquido, _, _ = interior_vaso(lz, tipo, 0.85)
        lz.degradado(liquido, *CHUPITO)
    remate_vaso(lz, tipo, cuerpo)
    return lz


BEBIDAS = {
    'cana': (2, lambda p: bebida_cana(p, 'vaso')),
    'canon': (2, lambda p: bebida_cana(p, 'vaso-grande')),
    'clara': (3, lambda p: bebida_cana(p, 'vaso', clara=True)),
    'tinto': (4, bebida_tinto),
    'vermut': (4, bebida_vermut),
    'chupito': (2, bebida_chupito),
}


# --- Fondo y barra -------------------------------------------------------------------


def fondo():
    """La pared del bar: madera oscura, dos baldas con botellas a contraluz y lamparas calidas."""
    W, H = 720, 1280
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(round(58 - 22 * t), round(34 - 14 * t), round(26 - 10 * t)))
    # Tablones verticales.
    rnd = random.Random(11)
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=(34, 20, 14), width=3)
        for _ in range(6):
            y = rnd.randint(0, H)
            d.line([(x + rnd.randint(8, 50), y), (x + rnd.randint(8, 50), y + rnd.randint(30, 120))], fill=(48, 28, 20), width=1)
    capa = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dc = ImageDraw.Draw(capa)
    for yb in (300, 520):
        dc.rectangle([0, yb, W, yb + 16], fill=(90, 54, 30, 255))
        dc.rectangle([0, yb + 16, W, yb + 22], fill=(30, 16, 10, 255))
        x = 18
        while x < W - 30:
            w = rnd.randint(26, 40)
            h = rnd.randint(70, 130)
            col = rnd.choice([(30, 60, 34), (70, 20, 24), (110, 70, 20), (40, 50, 70), (90, 40, 20)])
            dc.rounded_rectangle([x, yb - h, x + w, yb], radius=8, fill=col + (230,))
            dc.rectangle([x + w // 2 - 5, yb - h - 28, x + w // 2 + 5, yb - h + 4], fill=col + (230,))
            dc.rectangle([x + 5, yb - h * 0.6, x + w - 5, yb - h * 0.3], fill=(220, 200, 160, 160))
            x += w + rnd.randint(8, 22)
    luz = Image.new('L', (W, H), 0)
    dl = ImageDraw.Draw(luz)
    for cx in (140, 580):
        dl.ellipse([cx - 160, -120, cx + 160, 260], fill=120)
    luz = luz.filter(ImageFilter.GaussianBlur(80))
    img = Image.alpha_composite(img.convert('RGBA'), capa)
    calida = Image.new('RGBA', (W, H), (255, 190, 110, 0))
    calida.putalpha(luz)
    img = Image.alpha_composite(img, calida)
    img.convert('RGB').save(SALIDA / 'fondo.jpg', quality=84, optimize=True, progressive=True)


def barra():
    """La barra de madera donde se prepara la bebida: tablero claro con canto y frente oscuro."""
    W, H = 720, 150
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(36):
        t = y / 36
        d.line([(0, y), (W, y)], fill=(round(196 - 40 * t), round(130 - 30 * t), round(72 - 20 * t), 255))
    d.rectangle([0, 34, W, 42], fill=(70, 40, 22, 255))
    for y in range(42, H):
        t = (y - 42) / (H - 42)
        d.line([(0, y), (W, y)], fill=(round(110 - 40 * t), round(64 - 24 * t), round(36 - 14 * t), 255))
    rnd = random.Random(5)
    for _ in range(40):
        y = rnd.randint(4, 30)
        x = rnd.randint(0, W)
        d.line([(x, y), (x + rnd.randint(40, 140), y + rnd.randint(-2, 2))], fill=(150, 96, 52, 255), width=1)
    d.line([(0, 2), (W, 2)], fill=(232, 182, 120, 255), width=3)
    img.save(SALIDA / 'barra.png', optimize=True)


# --- Clientes con borde de pegatina -----------------------------------------------------

CLIENTE_ANCHO = 300
CLIENTE_BORDE = 9


def solo_la_figura(img: Image.Image) -> Image.Image:
    """Quita los trozos sueltos que traen algunos PNG de Open Peeps (una "<" de la mano
    de otro dibujo, un garabato): se queda con las piezas de al menos el 10 % de la mayor."""
    alfa = img.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    w, h = alfa.size
    px = alfa.load()
    visto = bytearray(w * h)
    piezas = []
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0] == 0 or visto[y0 * w + x0]:
                continue
            pila = [(x0, y0)]
            visto[y0 * w + x0] = 1
            pieza = []
            while pila:
                x, y = pila.pop()
                pieza.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny] and not visto[ny * w + nx]:
                        visto[ny * w + nx] = 1
                        pila.append((nx, ny))
            piezas.append(pieza)
    mayor = max(len(p) for p in piezas)
    fuera = [p for p in piezas if len(p) < mayor * 0.10]
    out = img.copy()
    po = out.load()
    for p in fuera:
        for x, y in p:
            po[x, y] = (0, 0, 0, 0)
    return out


def pegatina(origen: Path) -> Image.Image:
    img = Image.open(origen).convert('RGBA')
    alto = round(img.height * CLIENTE_ANCHO / img.width)
    img = solo_la_figura(img.resize((CLIENTE_ANCHO, alto), Image.LANCZOS))
    b = CLIENTE_BORDE
    lienzo = Image.new('RGBA', (CLIENTE_ANCHO + 2 * b, alto + b), (0, 0, 0, 0))
    lienzo.paste(img, (b, b), img)
    alfa = lienzo.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    gorda = alfa.filter(ImageFilter.GaussianBlur(b * 0.55)).point(lambda v: 255 if v > 6 else 0)
    gorda = gorda.filter(ImageFilter.GaussianBlur(1))
    borde = Image.new('RGBA', lienzo.size, CREMA + (0,))
    borde.putalpha(gorda)
    return Image.alpha_composite(borde, lienzo)


def main() -> None:
    for sub in ('ingredientes', 'bebidas', 'clientes'):
        (SALIDA / sub).mkdir(parents=True, exist_ok=True)
    for nombre, f in INGREDIENTES.items():
        guardar(f(), SALIDA / 'ingredientes' / f'{nombre}.png')
    for nombre, (pasos, f) in BEBIDAS.items():
        for p in range(1, pasos + 1):
            guardar(f(p), SALIDA / 'bebidas' / f'{nombre}-{p}.png')
    fondo()
    barra()
    clientes = sorted(ORIGEN_CLIENTES.glob('peep-*.png'))
    medidas = set()
    for c in clientes:
        img = pegatina(c)
        img.save(SALIDA / 'clientes' / c.name, optimize=True)
        medidas.add(img.size)
    assert len(medidas) == 1, medidas
    (cw, ch), = medidas
    iw = round(ICONO * PPM_ICONO)
    bw, bh = round(BEBIDA_ANCHO * PPM_BEBIDA), round(BEBIDA_ALTO * PPM_BEBIDA)
    GEOMETRIA.parent.mkdir(parents=True, exist_ok=True)
    GEOMETRIA.write_text(
        '// GENERADO por scripts/generar-barman.py. No editar a mano.\n'
        '/** Proporciones (ancho / alto) de los dibujos, para reservar su hueco sin medirlos. */\n'
        f'export const PROPORCION_ICONO = {iw} / {iw};\n'
        f'export const PROPORCION_BEBIDA = {bw} / {bh};\n'
        f'export const PROPORCION_CLIENTE = {cw} / {ch};\n'
        f"export const CLIENTES = [{', '.join(repr(c.stem) for c in clientes)}] as const;\n".replace("'", "'"),
        encoding='utf-8',
    )
    total = sum(p.stat().st_size for p in SALIDA.rglob('*') if p.is_file())
    print(f'{len(INGREDIENTES)} ingredientes, {sum(p for p, _ in BEBIDAS.values())} bebidas, {len(clientes)} clientes. Peso: {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
