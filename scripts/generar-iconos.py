"""Genera todos los iconos de la app a partir de los dos logos de assets/marca/.

    python scripts/generar-iconos.py        (necesita Pillow: pip install pillow)

- logo-10.png (RxB con Don Quijote): icono de la app en nativo y en la PWA,
  favicon y el sello del login.
- logo-11.png (el pato peregrino): solo el logo de la barra superior.

Por que un script y no exportarlos a mano: son once ficheros con tamanos y
margenes distintos (Android recorta el adaptativo a un circulo del 61 %, la
PWA "maskable" al 80 %...) y cambiar el logo otra vez tiene que ser pegar el
nuevo original y correr esto. Es determinista: misma entrada, mismos pngs.

Los originales vienen como maqueta de icono, con las esquinas redondeadas en
blanco. Eso no sirve tal cual: el movil pone su propia mascara y asomarian
cunas blancas. Por eso se detecta el aro marron, se recorta el circulo y se
vuelve a montar sobre un cuadrado liso del crema del propio logo.
"""

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
MARCA = RAIZ / 'assets' / 'marca'

# Crema del fondo de logo-10, muestreado dentro del aro. Si cambia el logo,
# cambiarlo tambien en app.config.ts (android.adaptiveIcon.backgroundColor).
CREMA = (251, 247, 235)
# Cuanto ocupa el aro en un icono cuadrado normal (icon.png, favicon, PWA,
# maskable). La primera version lo puso al 0.9 y quedaba cortado contra el
# marco del icono. Se bajo a 0.68 (la proporcion MEDIDA del icono viejo:
# icono-web.png, icon-192, apple-touch-icon, icon-512 daban 0.67-0.68) y en
# el movil de verdad SEGUIA viendose ajustado: varios lanzadores de Android
# (y algunos navegadores) le aplican a un icono plano SU PROPIA mascara y
# recorte, ademas del margen que ya trae el fichero, asi que hace falta mas
# margen del que basta en el ordenador. 0.55 deja un margen claramente
# visible incluso con ese recorte extra encima.
PROPORCION_ICONO = 0.55
# Un pixel es "del aro" si es bastante oscuro. Las siluetas color arena
# (suma ~545) quedan fuera; el marron del aro suma ~210.
OSCURO = 400
# Se supersamplea la mascara para que el borde del circulo salga suave.
SUPER = 4


def buscar_aro(img: Image.Image) -> tuple[float, float, float, float]:
    """Centro y radios exteriores (max, min) del aro: 360 rayos de fuera a dentro.

    El aro esta pintado a mano y no es un circulo perfecto (el del pato mide
    1124 x 1142). Con el radio MAXIMO no se pierde nada de aro pero por los
    lados queda un hilo de crema fuera: vale sobre fondo crema (los iconos). Con
    el MINIMO el corte cae sobre el aro, que es mas grueso que el desvio: es el
    que se usa para los circulos que se pintan sobre otro color.
    """
    rgb = img.convert('RGB')
    w, h = rgb.size
    cx0, cy0 = w / 2, h / 2

    impactos = []
    for grado in range(360):
        a = math.radians(grado)
        dx, dy = math.cos(a), math.sin(a)
        r = min(w, h) / 2 - 1
        while r > 0:
            x, y = int(cx0 + dx * r), int(cy0 + dy * r)
            if sum(rgb.getpixel((x, y))) < OSCURO:
                impactos.append((x, y))
                break
            r -= 1
    if len(impactos) < 300:
        raise SystemExit(f'No encuentro el aro: solo {len(impactos)} rayos lo tocan.')
    cx = sum(p[0] for p in impactos) / len(impactos)
    cy = sum(p[1] for p in impactos) / len(impactos)
    distancias = [math.hypot(x - cx, y - cy) for x, y in impactos]
    return cx, cy, max(distancias) + 2, min(distancias) - 1


def mascara_circulo(lado: int) -> Image.Image:
    grande = Image.new('L', (lado * SUPER, lado * SUPER), 0)
    ImageDraw.Draw(grande).ellipse((0, 0, lado * SUPER - 1, lado * SUPER - 1), fill=255)
    return grande.resize((lado, lado), Image.LANCZOS)


def circulo(nombre: str, lado: int, ajustado: bool = False) -> Image.Image:
    """El logo recortado por el aro, transparente alrededor, lado x lado."""
    img = Image.open(MARCA / nombre).convert('RGBA')
    cx, cy, r_max, r_min = buscar_aro(img)
    r = r_min if ajustado else r_max
    caja = (round(cx - r), round(cy - r), round(cx + r), round(cy + r))
    recorte = img.crop(caja).resize((lado, lado), Image.LANCZOS)
    recorte.putalpha(mascara_circulo(lado))
    return recorte


def sobre_fondo(logo: Image.Image, lado: int, proporcion: float, fondo) -> Image.Image:
    """Pone el circulo centrado ocupando `proporcion` del lado, sobre `fondo` (None = transparente)."""
    lienzo = Image.new('RGBA', (lado, lado), (*fondo, 255) if fondo else (0, 0, 0, 0))
    d = round(lado * proporcion)
    pieza = logo.resize((d, d), Image.LANCZOS)
    lienzo.alpha_composite(pieza, ((lado - d) // 2, (lado - d) // 2))
    return lienzo


def monocromo(logo: Image.Image) -> Image.Image:
    """Icono tematico de Android 13+: una sola tinta, el sistema la colorea.

    La opacidad sale de lo oscuro que es cada pixel: el marron del aro y las
    letras quedan opacos y las siluetas arena a un tercio, asi que Don Quijote
    y Sancho se siguen viendo sin tapar las letras.
    """
    gris = logo.convert('L')
    claro, oscuro = 247, 75
    alfa = gris.point(lambda v: max(0, min(255, round((claro - v) * 255 / (claro - oscuro)))))
    alfa = ImageChops.multiply(alfa, logo.getchannel('A'))
    tinta = Image.new('RGBA', logo.size, (0, 0, 0, 0))
    tinta.putalpha(alfa)
    return tinta


def guardar(img: Image.Image, ruta: str, rgb: bool = False) -> None:
    destino = RAIZ / ruta
    destino.parent.mkdir(parents=True, exist_ok=True)
    (img.convert('RGB') if rgb else img).save(destino, optimize=True)
    print(f'{ruta}  {img.size[0]}x{img.size[1]}')


def main() -> None:
    quijote = circulo('logo-10.png', 1024)

    # Nativo. iOS y Android redondean el cuadrado ellos: fondo liso hasta el borde.
    guardar(sobre_fondo(quijote, 1024, PROPORCION_ICONO, CREMA), 'assets/icon.png', rgb=True)
    # Adaptativo de Android: el sistema recorta a su forma y solo garantiza el
    # circulo central de 66/108 dp (61 %). 0.6 deja el aro entero dentro.
    guardar(sobre_fondo(quijote, 1024, 0.6, None), 'assets/android-icon-foreground.png')
    guardar(Image.new('RGB', (1024, 1024), CREMA), 'assets/android-icon-background.png')
    guardar(sobre_fondo(monocromo(quijote), 1024, 0.6, None), 'assets/android-icon-monochrome.png')

    # Web / PWA.
    guardar(sobre_fondo(quijote, 48, PROPORCION_ICONO, CREMA), 'assets/favicon.png', rgb=True)
    guardar(sobre_fondo(quijote, 192, PROPORCION_ICONO, CREMA), 'public/icons/icon-192.png', rgb=True)
    guardar(sobre_fondo(quijote, 512, PROPORCION_ICONO, CREMA), 'public/icons/icon-512.png', rgb=True)
    guardar(sobre_fondo(quijote, 180, PROPORCION_ICONO, CREMA), 'public/icons/apple-touch-icon.png', rgb=True)
    # maskable: la zona segura del spec es un circulo del 80 % del lado, pero
    # se pinta a la misma PROPORCION_ICONO (bastante mas conservador) para que
    # se vea igual que el resto y no distinto solo por venir de otra formula.
    guardar(sobre_fondo(quijote, 512, PROPORCION_ICONO, CREMA), 'public/icons/maskable-512.png', rgb=True)

    # Dentro de la app: circulos con fondo transparente para pintarlos sobre
    # cualquier color. 3x del mayor tamano en pantalla (92 px el login).
    guardar(circulo('logo-10.png', 288, ajustado=True), 'assets/logo.png')
    guardar(circulo('logo-11.png', 144, ajustado=True), 'assets/logo-barra.png')


if __name__ == '__main__':
    main()
