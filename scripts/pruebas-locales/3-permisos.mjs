// Matriz de permisos: para cada tabla de `public` y cada persona, cuantas filas VE,
// y cuantas podria MODIFICAR o BORRAR con un UPDATE/DELETE "a todo" por la API
// (como authenticator + SET LOCAL ROLE + claims; deshecho al terminar).
// Lo que se busca: que nadie sin ser admin pueda tocar filas que no son suyas,
// y que sin sesion no se vea ni se toque nada.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { guardar, psql, psqlEstricto, SALIDA } from './comun.mjs';

const mundo = JSON.parse(readFileSync(join(SALIDA, 'mundo.json'), 'utf8'));
const U = mundo.usuarios;
const personas = {
  anonimo: { rol: 'anon', sub: null },
  fuera: { rol: 'authenticated', sub: U.fede.id },
  participante: { rol: 'authenticated', sub: U.ana.id },
  admin: { rol: 'authenticated', sub: U.admin.id },
};

const tablas = JSON.parse(
  psqlEstricto(`
    select json_agg(t order by t.tabla) from (
      select c.relname as tabla, c.relrowsecurity as rls,
             (select a.attname from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped order by a.attnum limit 1) as col,
             (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as filas
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ) t;`),
);

const lit = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const casos = [];
const bloques = [];
for (const t of tablas) {
  for (const [persona, p] of Object.entries(personas)) {
    for (const op of ['select', 'update', 'delete']) {
      const id = casos.length;
      casos.push({ id, tabla: t.tabla, persona, op });
      const sentencia =
        op === 'select' ? `perform 1 from public.${t.tabla}` : op === 'update' ? `update public.${t.tabla} set ${t.col} = ${t.col} where true` : `delete from public.${t.tabla} where true`;
      const contar = op === 'select' ? `select count(*) into n from public.${t.tabla};` : `${sentencia}; get diagnostics n = row_count;`;
      bloques.push(`do $b$
declare st text := ''; msg text := ''; n bigint := 0;
begin
  perform set_config('request.jwt.claims', ${lit(JSON.stringify(p.sub ? { sub: p.sub, role: p.rol } : { role: p.rol }))}, true);
  perform set_config('request.jwt.claim.sub', ${lit(p.sub ?? '')}, true);
  begin
    execute 'set local role ${p.rol}';
    ${contar}
    raise exception using errcode = 'ZZ999', message = n::text;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
  end;
  raise notice 'P|${id}|%|%', st, replace(msg, E'\\n', ' ');
end $b$;`);
    }
  }
}
const r = psql(bloques.join('\n'), { como: 'authenticator' });
for (const linea of r.stderr.split('\n')) {
  const m = /NOTICE:\s+P\|(\d+)\|([^|]*)\|(.*)$/.exec(linea);
  if (!m) continue;
  const c = casos[Number(m[1])];
  if (m[2] === 'ZZ999') c.filas = Number(m[3]);
  else c.error = `${m[2]} ${m[3].trim()}`;
}

// Filas que son "de" cada persona en cada tabla (por columnas de dueno tipicas), para
// distinguir "toca lo suyo" de "toca lo de otros".
const columnasDueno = JSON.parse(
  psqlEstricto(`
    select json_object_agg(table_name, cols) from (
      select table_name, array_agg(column_name::text) as cols from information_schema.columns
      where table_schema = 'public' and column_name in ('user_id','id','created_by','owner_id','reporter_id','sender_id','admin_id','voter_id','blocker_id')
      group by table_name
    ) x;`),
);
function propias(tabla, sub) {
  if (!sub) return 0;
  const cols = (columnasDueno[tabla] ?? []).filter((c) => c !== 'id' || tabla === 'profiles');
  if (cols.length === 0) return 0;
  const cond = cols.map((c) => `${c}::text = '${sub}'`).join(' or ');
  return Number(psqlEstricto(`select count(*) from public.${tabla} where ${cond};`));
}

const sospechosos = [];
for (const c of casos) {
  const t = tablas.find((x) => x.tabla === c.tabla);
  c.total = t.filas;
  if (c.op === 'select' || c.error || !c.filas) continue;
  if (c.persona === 'admin') continue; // los admins gestionan: se lista aparte
  const mias = propias(c.tabla, personas[c.persona].sub);
  c.propias = mias;
  if (c.persona === 'anonimo' || c.filas > mias) sospechosos.push(c);
}
const sinRls = tablas.filter((t) => !t.rls).map((t) => t.tabla);
guardar('permisos.json', { tablas, casos, sospechosos, sinRls });

console.log(`Permisos: ${tablas.length} tablas x ${Object.keys(personas).length} personas x 3 operaciones = ${casos.length} pruebas`);
console.log(`  tablas sin RLS: ${sinRls.length ? sinRls.join(', ') : 'ninguna'}`);
const ve = (persona) => casos.filter((c) => c.persona === persona && c.op === 'select' && c.filas > 0).map((c) => `${c.tabla}(${c.filas}/${c.total})`);
console.log(`  sin sesion VE filas en: ${ve('anonimo').join(', ') || 'ninguna'}`);
console.log(`  fede (sin ruta) VE filas en: ${ve('fuera').join(', ') || 'ninguna'}`);
console.log(`  ana (participante) VE filas en: ${ve('participante').join(', ')}`);
const escribe = (persona) => casos.filter((c) => c.persona === persona && c.op !== 'select' && c.filas > 0).map((c) => `${c.op} ${c.tabla}(${c.filas}${c.propias !== undefined ? `, suyas ${c.propias}` : ''})`);
console.log(`  ana podria cambiar/borrar: ${escribe('participante').join(', ') || 'nada'}`);
console.log(`  fede podria cambiar/borrar: ${escribe('fuera').join(', ') || 'nada'}`);
console.log(`  admin podria cambiar/borrar: ${escribe('admin').join(', ') || 'nada'}`);
console.log(`  SOSPECHOSOS (toca filas que no son suyas, o sin sesion): ${sospechosos.length}`);
for (const s of sospechosos) console.log(`    ${s.persona} ${s.op} ${s.tabla}: ${s.filas} filas (suyas ${s.propias ?? 0})`);
