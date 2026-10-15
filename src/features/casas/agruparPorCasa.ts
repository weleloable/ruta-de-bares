/**
 * Una lista de personas partida por casa, en el orden de las casas y con quien
 * no tiene casa al final. Las casas vacias no salen. Dentro de cada casa se
 * respeta el orden de entrada (el servidor ya ordena por nombre).
 *
 * Recibe el orden en vez de importar ORDEN_CASAS: node --test no resuelve los
 * imports sin extension que usa la app.
 */
export type GrupoCasa<T> = { casa: string | null; personas: T[] };

export function agruparPorCasa<T extends { house: string | null }>(
  lista: readonly T[],
  orden: readonly string[],
): GrupoCasa<T>[] {
  const grupos: GrupoCasa<T>[] = [...orden, null].map((casa) => ({ casa, personas: [] }));
  for (const p of lista) {
    const i = p.house !== null && orden.includes(p.house) ? orden.indexOf(p.house) : orden.length;
    grupos[i].personas.push(p);
  }
  return grupos.filter((g) => g.personas.length > 0);
}
