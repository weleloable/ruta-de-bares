"""Genera assets/vasos/<malta>.png a partir del collage de scripts/vasos-cerveza/fuente.jpg.

    python scripts/generar-vasos-cerveza.py        (necesita Pillow y numpy)

El collage son capturas del diseno del juego: cada vaso va sobre un fondo beige.
Aqui se recorta cada uno, se le quita el fondo (relleno desde los bordes; el
contorno marron del vaso lo frena), se queda solo con el vaso entero (fuera
motas del JPEG), se rellenan huecos, se suaviza el borde y se amplia x2.

Si algun dia hay los iconos originales en PNG con transparencia, se sustituyen
los cuatro ficheros de assets/vasos/ y este script ya no hace falta. Es
determinista: misma fuente, mismos PNG.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = RAIZ / 'scripts' / 'vasos-cerveza' / 'fuente.jpg'
SALIDA = RAIZ / 'assets' / 'vasos'

# (izq, arriba, der, abajo) de cada vaso de la lista, con margen de fondo alrededor.
CAJAS = {
    'palida': (55, 305, 135, 455),
    'caramelo': (45, 495, 140, 640),
    'tostada': (45, 685, 140, 830),
    'negra': (45, 875, 140, 1020),
}

TOLERANCIA = 22  # cuanto se puede alejar un pixel del beige para seguir siendo fondo
AMPLIACION = 2
MARCA = (255, 0, 255)


def fondo(recorte: Image.Image) -> np.ndarray:
    """Mascara booleana: True donde hay fondo (alcanzable desde el borde sin cruzar el contorno)."""
    m = recorte.copy()
    w, h = m.size
    puntos = [(x, y) for x in range(0, w, 2) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 2) for x in (0, w - 1)]
    for p in puntos:
        if m.getpixel(p) != MARCA:
            ImageDraw.floodfill(m, p, MARCA, thresh=TOLERANCIA)
    a = np.asarray(m)
    return (a[:, :, 0] == 255) & (a[:, :, 1] == 0) & (a[:, :, 2] == 255)


def solo_el_vaso(es_fondo: np.ndarray) -> np.ndarray:
    """Lo que no es fondo, reducido al trozo conectado que pasa por el centro (sin motas).

    Busqueda en anchura a mano: ImageDraw.floodfill no rellena una mascara de un
    solo canal con thresh=0 (se comprobo), y aqui son miles de pixeles, no millones.
    """
    h, w = es_fondo.shape
    libre = ~es_fondo
    visto = np.zeros_like(libre)
    pila = [(h // 2, w // 2)]
    assert libre[h // 2, w // 2], 'el centro del recorte no cae dentro del vaso'
    visto[h // 2, w // 2] = True
    while pila:
        y, x = pila.pop()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and libre[ny, nx] and not visto[ny, nx]:
                visto[ny, nx] = True
                pila.append((ny, nx))
    return visto


def alfa_suave(vaso: np.ndarray) -> Image.Image:
    """Borde sin escalon y sin aureola beige: se erosiona un pixel y se difumina un poco."""
    m = Image.fromarray((vaso * 255).astype(np.uint8), 'L')
    m = m.filter(ImageFilter.MinFilter(3))
    return m.filter(ImageFilter.GaussianBlur(0.7))


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    collage = Image.open(FUENTE).convert('RGB')
    for nombre, caja in CAJAS.items():
        recorte = collage.crop(caja)
        vaso = solo_el_vaso(fondo(recorte))
        rgba = recorte.convert('RGBA')
        rgba.putalpha(alfa_suave(vaso))
        # Recorte justo al vaso, con 2 px de aire para que el borde difuminado no se corte.
        caja_vaso = rgba.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        assert caja_vaso is not None, nombre
        izq, arr, der, aba = caja_vaso
        rgba = rgba.crop((max(izq - 2, 0), max(arr - 2, 0), min(der + 2, rgba.width), min(aba + 2, rgba.height)))
        rgba = rgba.resize((rgba.width * AMPLIACION, rgba.height * AMPLIACION), Image.LANCZOS)
        destino = SALIDA / f'{nombre}.png'
        rgba.save(destino, 'PNG', optimize=True)
        print(f'{destino.relative_to(RAIZ)}: {rgba.size[0]}x{rgba.size[1]}, {destino.stat().st_size} bytes')


if __name__ == '__main__':
    main()
