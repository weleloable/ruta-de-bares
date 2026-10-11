#!/usr/bin/env node
/**
 * Exporta la web contra el Supabase local (lo mismo que hace grabar.mjs sin
 * --sin-export), para mirar la app a mano con servidor.mjs y explorar.mjs.
 */
import { arrancarSupabase, exportarWeb } from './entorno.mjs';

exportarWeb(arrancarSupabase());
