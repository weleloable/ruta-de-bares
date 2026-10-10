"""Genera supabase/migrations/0036_catalogo_en_tabla.sql a partir de scripts/semilla-catalogo/.

    python scripts/generar-semilla-catalogo.py        (necesita Pillow: pip install pillow)

La lista de bares que antes vivia en codigo (catalogo.ts) y sus logos (assets/bares/)
pasan a ser filas de `catalog_bars`. Las fuentes estan en esta carpeta:

- bares.json: nombre y coordenadas de cada bar. `plusCode` documenta de donde salen
  `lat` y `lng` (centro de la celda del plus code, ~14 m); NO se guarda en la tabla.
- logos/<id>.png: el sello de cada bar, 256 px con transparencia.

Para editar la lista: cambiar bares.json o un logo, correr esto y pegar la migracion
nueva (la 0036 YA PEGADA no se edita: se anade otra con el cambio).

Los logos se cuantizan a 64 colores: son sellos de tinta marron y a simple vista no
se distingue del original, pero el fichero pasa de ~970 mil caracteres de SQL a ~190
mil, que es lo que el SQL Editor aguanta pegado sin colgarse. Es determinista: misma
entrada, misma migracion (tests/migration-0036.test.ts vigila que sigue coincidiendo).
"""

import base64
import io
import json
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = RAIZ / 'scripts' / 'semilla-catalogo'
SALIDA = RAIZ / 'supabase' / 'migrations' / '0036_catalogo_en_tabla.sql'
COLORES = 64

CABECERA = """-- Ruta de Bares - 0036: los bares de la lista cerrada pasan a `catalog_bars`.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0035.
-- Idempotente: se puede re-ejecutar sin romper nada (el insert ignora los nombres
-- que ya estan y el update solo toca paradas sin logo). No rehace ninguna funcion.
-- FICHERO GENERADO por scripts/generar-semilla-catalogo.py: no se edita a mano.
--
-- Que hace. Hasta la 0035 el catalogo eran DOS cosas: 14 bares fijos en el codigo
-- (con sus logos en assets/bares/) y los bares propios en la tabla. Ahora es UNA:
-- esta migracion mete los 14 en `catalog_bars` y la app deja de llevar la lista.
-- Anadir, quitar o cambiar el logo de un bar ya no exige publicar una version.
--
-- Y rellena `route_bars.logo` de las paradas que ya existen. Es lo importante para
-- los jugadores: antes veian el logo de un bar de la lista porque estaba empaquetado
-- en la app; ahora SOLO lo ven si la parada lo lleva (los jugadores no leen el
-- catalogo). Se casa por nombre, sin distinguir mayusculas, igual que en toda la
-- app. Una parada que se guardo con un nombre distinto del de la tabla se queda con
-- iniciales: para verlas, ultima consulta de este fichero.
--
-- ORDEN DE DESPLIEGUE: esta migracion va ANTES que la app. La app nueva ya no trae
-- los logos, asi que una parada sin `route_bars.logo` sale con iniciales.
--
-- Decisiones que conviene conocer:
--
--   * Los 14 bares quedan con `created_by` NULL: no son de ningun admin. Por la
--     policy de la 0035 cualquier admin puede borrarlos (un bar sin dueno no se
--     podria quitar nunca). Borrar uno no toca las paradas ya copiadas.
--   * El update de paradas se puede volver a ejecutar cuando un admin sube un bar
--     propio (por ejemplo los que tenia en su dispositivo antes de la 0035): copia
--     el logo a las paradas que aun no lo tienen. Pega solo esa parte si quieres.
--   * Los logos son PNG de 256 px y 64 colores como data URL (ver el script).

"""

PIE = """
-- Paradas que siguen sin logo: o su bar no esta en catalog_bars o se guardo con otro
-- nombre. Salen con iniciales en la app. Es solo una consulta, no cambia nada.
select rb.name as parada, r.name as ruta
from public.route_bars rb
join public.routes r on r.id = rb.route_id
where rb.logo is null
order by r.name, rb.sort_order;
"""


def sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def logo_data_url(ruta: Path) -> str:
    imagen = Image.open(ruta).convert('RGBA')
    cuantizada = imagen.quantize(colors=COLORES, method=Image.FASTOCTREE, dither=Image.NONE)
    buffer = io.BytesIO()
    cuantizada.save(buffer, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')


def main() -> None:
    bares = json.loads((FUENTE / 'bares.json').read_text(encoding='utf8'))
    filas = []
    for bar in bares:
        logo = logo_data_url(FUENTE / 'logos' / f"{bar['id']}.png")
        filas.append(f"  ({sql_texto(bar['nombre'])}, {bar['lat']}, {bar['lng']}, {sql_texto(logo)})")

    cuerpo = (
        'insert into public.catalog_bars (name, lat, lng, logo) values\n'
        + ',\n'.join(filas)
        + '\non conflict (lower(btrim(name))) do nothing;\n\n'
        + '-- Copia el logo a las paradas ya creadas (mismo nombre, sin distinguir mayusculas).\n'
        + 'update public.route_bars rb\n'
        + 'set logo = c.logo\n'
        + 'from public.catalog_bars c\n'
        + 'where lower(btrim(rb.name)) = lower(btrim(c.name))\n'
        + '  and rb.logo is null\n'
        + '  and c.logo is not null;\n'
    )
    # newline='\n': el mismo fichero byte a byte en Windows y en Linux.
    with open(SALIDA, 'w', encoding='utf8', newline='\n') as f:
        f.write(CABECERA + cuerpo + PIE)
    print(f'{SALIDA.relative_to(RAIZ)}: {len(bares)} bares, {SALIDA.stat().st_size} bytes')


if __name__ == '__main__':
    main()
