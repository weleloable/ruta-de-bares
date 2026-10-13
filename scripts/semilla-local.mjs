// Siembra el Supabase LOCAL (supabase start) con lo minimo para probar la app:
// un admin, a Dudu, la ruta "Ruta de Bares 26" con los 14 bares del catalogo y
// todos los sellos de Dudu. Idempotente: se puede correr las veces que haga falta.
//
//   npm run semilla:local            (Dudu con todos los sellos)
//   npm run semilla:local -- --sin-sellos
//
// Se niega a funcionar si la URL no es de esta maquina: la produccion nunca se siembra.
import { execFileSync } from 'node:child_process';

const API = process.env.SEMILLA_API_URL ?? 'http://127.0.0.1:54421';
const CONTENEDOR = process.env.SEMILLA_DB_CONTAINER ?? 'supabase_db_ruta-de-bares';
const PASSWORD = 'password123';
const sinSellos = process.argv.includes('--sin-sellos');

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`STOP: ${API} no es local. Esta semilla solo toca el Supabase de esta maquina.`);
  process.exit(1);
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
    { input: sql, encoding: 'utf8' },
  ).trim();
}

// La clave secreta local sale de `supabase status`; no se guarda en ningun sitio.
const estado = JSON.parse(
  execFileSync('npx', ['-y', 'supabase@latest', 'status', '-o', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).replace(/^[^{]*/, ''),
);
const SECRET = estado.SERVICE_ROLE_KEY ?? estado.SECRET_KEY;

async function crearUsuario(email) {
  const r = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (r.ok) return;
  const cuerpo = await r.text();
  if (!/already|registered|exists/i.test(cuerpo)) throw new Error(`crear ${email}: ${r.status} ${cuerpo}`);
}

await crearUsuario('admin@local.test');
await crearUsuario('dudu@local.test');

const salida = psql(`
  update public.profiles set role = 'admin', display_name = 'Admin'
   where id = (select id from auth.users where email = 'admin@local.test');
  update public.profiles set display_name = 'Dudu'
   where id = (select id from auth.users where email = 'dudu@local.test')
     and display_name <> 'Dudu'
     and not exists (select 1 from public.profiles p2
                      where lower(p2.display_name) = 'dudu'
                        and p2.id <> public.profiles.id);

  insert into public.routes (name, description, event_date, is_published, created_by)
  select 'Ruta de Bares 26', 'Ruta de prueba local', current_date, true,
         (select id from auth.users where email = 'admin@local.test')
   where not exists (select 1 from public.routes where name = 'Ruta de Bares 26');

  -- Sorteo abierto (0061): sale el aviso en Sellos. No se hace el sorteo: asi se
  -- ve "estas dentro" y no un ganador.
  update public.routes set sorteo_activo = true, sorteo_premio = 'Una camiseta de la Ruta de Bares 26'
   where name = 'Ruta de Bares 26';

  insert into public.route_bars (route_id, sort_order, name, address, lat, lng, radius_m, opens_at, closes_at, logo)
  select r.id, row_number() over (order by c.name) - 1, c.name, '', c.lat, c.lng, 120,
         date_trunc('day', now()) + interval '10 hours',
         date_trunc('day', now()) + interval '1 day' + interval '4 hours',
         c.logo
    from public.routes r, public.catalog_bars c
   where r.name = 'Ruta de Bares 26'
     and not exists (select 1 from public.route_bars b where b.route_id = r.id);

  insert into public.route_members (route_id, user_id)
  select r.id, u.id from public.routes r, auth.users u
   where r.name = 'Ruta de Bares 26' and u.email in ('admin@local.test', 'dudu@local.test')
  on conflict do nothing;

  ${sinSellos ? '' : `
  insert into public.stamps (user_id, route_bar_id, stamped_at, lat, lng, distance_m)
  select u.id, b.id, now() - (15 - b.sort_order) * interval '20 minutes', b.lat, b.lng, 0
    from auth.users u, public.routes r
    join public.route_bars b on b.route_id = r.id
   where u.email = 'dudu@local.test' and r.name = 'Ruta de Bares 26'
  on conflict (user_id, route_bar_id) do nothing;`}

  select 'sellos de Dudu: ' || count(*) || ' de ' ||
         (select count(*) from public.route_bars b join public.routes r on r.id = b.route_id where r.name = 'Ruta de Bares 26')
    from public.stamps s join auth.users u on u.id = s.user_id
   where u.email = 'dudu@local.test';
`);

console.log(salida);
console.log(`Usuarios: admin@local.test y dudu@local.test, contrasena ${PASSWORD}`);
