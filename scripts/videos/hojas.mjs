#!/usr/bin/env node
/**
 * Hoja de contactos de cada video (un fotograma cada N segundos en una sola
 * imagen) para revisarlos de un vistazo sin reproducirlos:
 *
 *   node scripts/videos/hojas.mjs            cada 3 s, en ~/.ruta-de-bares-videos/hojas/
 *   node scripts/videos/hojas.mjs 2 trailer  cada 2 s, solo los que contengan "trailer"
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ffmpeg from 'ffmpeg-static';

import { SALIDA, TRABAJO } from './entorno.mjs';

const cada = Number(process.argv[2] ?? 3);
const filtro = process.argv[3] ?? '';
const destino = join(TRABAJO, 'hojas');
mkdirSync(destino, { recursive: true });
for (const f of readdirSync(SALIDA).filter((x) => x.endsWith('.mp4') && x.includes(filtro))) {
  const salida = join(destino, f.replace('.mp4', '.png'));
  const r = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', join(SALIDA, f),
    '-vf', `fps=1/${cada},scale=216:384,tile=10x4`, '-frames:v', '1', salida,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  console.log(salida);
}
