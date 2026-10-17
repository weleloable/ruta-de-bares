"""Genera las imagenes de La Penul: assets/la-penul/ y su geometria.

    python scripts/generar-la-penul.py

Los ORIGINALES estan en assets/ultima-ronda/ (ver su CREDITOS.md) y no se
tocan. Esto genera lo que pinta la app, que NO se edita a mano:

  * fondos/*.jpg: los fondos de 4000x3000 (apaisados) recortados a 3:4 en
    vertical y reducidos a 1200x1600. La app los pinta "a pantalla" (cover) en
    un movil en vertical, que recorta todavia mas los lados: el recorte deja
    en el centro lo que importa (la barra; la puerta con la luz). 1600 px de
    alto sobran para un movil (800 pt a 2x).
  * personajes/*.png: los bustos de Open Peeps reducidos y con un BORDE CLARO
    tipo pegatina (crema del tema). Sin el, la linea negra se pierde contra los
    fondos oscuros (comprobado con una maqueta, ver CREDITOS.md).
  * src/features/minijuegos/juegos/la-penul/imagenesGeometria.ts: proporciones,
    para que la app reserve el hueco exacto sin medir la imagen.

tests/la-penul-imagenes.test.ts comprueba que esta todo, con su tamano, y que
cada original sale en CREDITOS.md.
"""

import sys
from pathlib import Path

from PIL import Image, ImageFilter

sys.dont_write_bytecode = True

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'assets' / 'ultima-ronda'
SALIDA = RAIZ / 'assets' / 'la-penul'
GEOMETRIA = RAIZ / 'src' / 'features' / 'minijuegos' / 'juegos' / 'la-penul' / 'imagenesGeometria.ts'

# El crema del tema (colors.paper en src/lib/theme.ts).
CREMA = (246, 239, 226)

# Fondos: que franja de 3:4 se queda (x de inicio sobre 4000 de ancho) y con que nombre.
FONDO_ANCHO, FONDO_ALTO = 1200, 1600
FONDOS = {
    # La barra con los taburetes a la izquierda y los sillones en el centro.
    'bar': ('bar.png', 650),
    # La puerta con la luz encendida queda en el centro-derecha.
    'portal': ('exterior-portal.png', 1750),
}

# Personajes: ancho final del busto (sin el borde) y grosor del borde, en px de
# la imagen. La app pinta el busto a ~240-280 pt de ancho, o sea ~1,9 px de
# imagen por pt: 14 px de borde son ~7 pt en pantalla (lo pedido: 6-8).
BUSTO_ANCHO = 520
BORDE = 14
PERSONAJES = ['peep-10', 'peep-17', 'peep-47', 'peep-48', 'peep-61', 'peep-91', 'peep-94', 'peep-96']


def fondo(nombre: str, fichero: str, x0: int) -> Image.Image:
    img = Image.open(ORIGEN / 'fondos' / fichero).convert('RGB')
    ancho_recorte = img.height * 3 // 4
    x0 = max(0, min(x0, img.width - ancho_recorte))
    img = img.crop((x0, 0, x0 + ancho_recorte, img.height)).resize((FONDO_ANCHO, FONDO_ALTO), Image.LANCZOS)
    img.save(SALIDA / 'fondos' / f'{nombre}.jpg', quality=82, optimize=True, progressive=True)
    return img


def pegatina(nombre: str) -> Image.Image:
    img = Image.open(ORIGEN / 'personajes' / f'{nombre}.png').convert('RGBA')
    alto = round(img.height * BUSTO_ANCHO / img.width)
    img = img.resize((BUSTO_ANCHO, alto), Image.LANCZOS)
    # Lienzo con margen para el borde. El busto toca el borde de abajo (esta
    # cortado a la altura del pecho): ahi no se pone margen, se corta recto.
    lienzo = Image.new('RGBA', (BUSTO_ANCHO + 2 * BORDE, alto + BORDE), (0, 0, 0, 0))
    lienzo.paste(img, (BORDE, BORDE), img)
    # El borde: la silueta "engordada" BORDE px. Desenfocar y umbralizar da una
    # dilatacion con las esquinas redondas (un MaxFilter las dejaria cuadradas).
    alfa = lienzo.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    gorda = alfa.filter(ImageFilter.GaussianBlur(BORDE * 0.55)).point(lambda v: 255 if v > 6 else 0)
    gorda = gorda.filter(ImageFilter.GaussianBlur(1))  # canto suave
    fondo_borde = Image.new('RGBA', lienzo.size, CREMA + (0,))
    fondo_borde.putalpha(gorda)
    final = Image.alpha_composite(fondo_borde, lienzo)
    # El interior del busto (camiseta blanca) ya es claro; lo que cubre el
    # borde es el contorno de fuera.
    final.save(SALIDA / 'personajes' / f'{nombre}.png', optimize=True)
    return final


def main() -> None:
    (SALIDA / 'fondos').mkdir(parents=True, exist_ok=True)
    (SALIDA / 'personajes').mkdir(parents=True, exist_ok=True)
    for nombre, (fichero, x0) in FONDOS.items():
        fondo(nombre, fichero, x0)
    medidas = {n: pegatina(n).size for n in PERSONAJES}
    ancho, alto = next(iter(medidas.values()))
    assert all(m == (ancho, alto) for m in medidas.values()), medidas
    GEOMETRIA.parent.mkdir(parents=True, exist_ok=True)
    GEOMETRIA.write_text(
        '// GENERADO por scripts/generar-la-penul.py. No editar a mano.\n'
        '/** Proporcion (ancho / alto) de los fondos y de los personajes con su borde. */\n'
        f'export const PROPORCION_FONDO = {FONDO_ANCHO} / {FONDO_ALTO};\n'
        f'export const PROPORCION_PERSONAJE = {ancho} / {alto};\n',
        encoding='utf-8',
    )
    total = sum(p.stat().st_size for p in SALIDA.rglob('*') if p.is_file())
    print('Escritos', sorted(str(p.relative_to(SALIDA)) for p in SALIDA.rglob('*') if p.is_file()))
    print(f'Peso total: {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
