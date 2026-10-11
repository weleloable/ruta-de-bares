#!/usr/bin/env node
/**
 * Mueve a "el resto de la ruta" a mano, para escribir guiones con explorar.mjs:
 *
 *   node scripts/videos/titere.mjs like Sergio Marta
 *   node scripts/videos/titere.mjs ask Sergio Marta
 *   node scripts/videos/titere.mjs text Sergio Marta Te espero en la barra
 *
 * Usa las mismas acciones que el grabador dispara en mitad de un video.
 */
import { createClient } from '@supabase/supabase-js';

import { arrancarSupabase } from './entorno.mjs';
import { titiritero } from './semilla.mjs';

const cfg = arrancarSupabase();
const servicio = createClient(cfg.url, cfg.claveServicio, { auth: { persistSession: false } });
const { data: rutas } = await servicio.from('routes').select('id').limit(1);
const { data: perfiles } = await servicio.from('profiles').select('id, display_name');
const ids = Object.fromEntries(perfiles.map((p) => [p.display_name, p.id]));
const mundo = await titiritero(cfg, rutas[0].id, ids);
const [accion, de, a, ...texto] = process.argv.slice(2);
if (accion === 'like') await mundo.meGusta(de, a);
else if (accion === 'ask') await mundo.preguntarCerveza(de, a);
else if (accion === 'answer') await mundo.responderCerveza(de, a, texto[0] ?? 'yes');
else if (accion === 'text') await mundo.escribir(de, a, texto.join(' '));
else throw new Error('Uso: titere.mjs like|ask|text <de> <a> [texto]');
console.log('hecho');
