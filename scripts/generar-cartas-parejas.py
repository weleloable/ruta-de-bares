"""Genera las caras de las cartas de Parejas de Barra: assets/parejas/*.png.

    python scripts/generar-cartas-parejas.py

Los PNG NO se editan a mano. Se reutiliza lo que ya hay, para que todo se vea de
la misma familia y no haya dos dibujos del mismo objeto:

  * jarra y chapa: las mismas funciones que dibujan Tapon al Vuelo
    (generar-sprites-tapon.py), pero a mas resolucion. La chapa de Tapon mide
    48 px y en una carta de ~120 px se veria borrosa.
  * pato (logo-11) y RxB (logo-10): recortados por el aro con `circulo()` de
    generar-iconos.py, sin las cunas blancas de las esquinas.

Los escudos de las casas NO salen de aqui: la app los pinta con escudoSvg
(features/casas/casas.ts), el mismo dibujo que en el resto de la app.

tests/parejas-cartas.test.ts comprueba que estan los cuatro, con su tamano.
"""

import importlib.util
import sys
from pathlib import Path

from PIL import Image

# Sin __pycache__ en scripts/ (acabaria en git).
sys.dont_write_bytecode = True

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'assets' / 'parejas'
# Lado de la imagen. La carta mas grande es de 120 px (ver ParejasDeBarra.tsx);
# el dibujo ocupa ~80 % y se pinta a 2x-3x en un movil: 256 sobra y pesa poco.
LADO = 256


def cargar(nombre: str):
    spec = importlib.util.spec_from_file_location(nombre.replace('-', '_'), RAIZ / 'scripts' / f'{nombre}.py')
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def encajar(ruta: Path) -> None:
    """Recorta lo transparente y deja la imagen dentro de LADO x LADO, centrada."""
    img = Image.open(ruta).convert('RGBA')
    caja = img.getbbox()
    if caja:
        img = img.crop(caja)
    escala = LADO / max(img.size)
    img = img.resize((max(1, round(img.width * escala)), max(1, round(img.height * escala))), Image.LANCZOS)
    lienzo = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    lienzo.paste(img, ((LADO - img.width) // 2, (LADO - img.height) // 2), img)
    lienzo.save(ruta, optimize=True)


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)

    tapon = cargar('generar-sprites-tapon')
    tapon.SALIDA = SALIDA  # que no pise los de Tapon
    # Mas pixeles por metro: el valor por defecto del constructor del lienzo.
    por_defecto = list(tapon.Lienzo.__init__.__defaults__)
    for nombre, factor in (('chapa', 6), ('jarra', 1.5)):
        por_defecto[0] = tapon.PPM * factor
        tapon.Lienzo.__init__.__defaults__ = tuple(por_defecto)
        getattr(tapon, nombre)()
        encajar(SALIDA / f'{nombre}.png')

    iconos = cargar('generar-iconos')
    iconos.circulo('logo-11.png', LADO, ajustado=True).save(SALIDA / 'pato.png', optimize=True)
    iconos.circulo('logo-10.png', LADO, ajustado=True).save(SALIDA / 'rxb.png', optimize=True)

    print('Escritos', sorted(p.name for p in SALIDA.iterdir()))


if __name__ == '__main__':
    main()
