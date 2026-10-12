import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CONFIG, ID_JUEGO } from './config.ts';

// Red rapida y PARCIAL que lee el codigo: la logica esta en partida.test.ts y el
// flujo de verdad se prueba en el navegador.
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const juegos = leer('src/features/minijuegos/juegos.ts');
const pantalla = leer('src/features/quiz/QuienQuiereSerCervecero.tsx');

test('esta en el menu de minijuegos con su detalle, ranking por ruta y envio de la nota', () => {
  const ficha = juegos.slice(juegos.indexOf('id: ID_QUIZ'));
  const cuerpo = ficha.slice(0, ficha.indexOf('\n  },'));
  assert.match(cuerpo, /Componente: QuienQuiereSerCervecero,/);
  assert.match(cuerpo, /Detalle: DetalleQuiz,/);
  assert.match(cuerpo, /ranking: true,/);
  assert.match(cuerpo, /enviarNota\(rutaId, r\.juego, r\.puntuacion\)/);
});

test('la nota maxima que acepta el servidor (0055) es el premio de la ultima pregunta', () => {
  const sql = leer('supabase/migrations/0055_ranking_quiz.sql');
  const tope = CONFIG.premios[CONFIG.premios.length - 1];
  assert.ok(sql.includes(`when '${ID_JUEGO}' then ${tope}`), 'la funcion usa el tope de la app');
  assert.ok(sql.includes(`game = '${ID_JUEGO}' and best_score between 0 and ${tope}`), 'la tabla usa el tope de la app');
});

test('el reloj usa una hora limite, no cuenta ticks (una pestana en segundo plano no gana tiempo)', () => {
  assert.match(pantalla, /const limite = Date\.now\(\) \+ CONFIG\.segundos \* 1000;/);
});

test('el acierto y el fallo llevan icono y texto, no solo color', () => {
  assert.match(pantalla, /name="checkmark-circle"/);
  assert.match(pantalla, /name="close-circle"/);
  assert.match(pantalla, /Correcta/);
});

test('cabe sin scroll: "Sí, definitiva" va en la MISMA fila que Plantarme, no en un bloque nuevo debajo', () => {
  // Antes salia debajo de las opciones y empujaba comodines y Plantarme fuera de la
  // pantalla (90 px de mas a 808 de ventana). El que de verdad lo mide es
  // `npm run verificar:juego`, con los textos mas largos del banco.
  const fila = pantalla.slice(pantalla.indexOf('<View style={styles.fila}>'), pantalla.indexOf('{estado.fase === \'suspense\''));
  assert.match(fila, /Sí, definitiva/);
  assert.match(fila, /Plantarme/);
  assert.doesNotMatch(pantalla, /styles\.confirmar\b/);
});

test('no se deja jugar hasta leer las preguntas vistas (si no, se pisaba el historial)', () => {
  assert.match(pantalla, /disabled=\{!listo\}/);
  assert.match(pantalla, /if \(vivo\) setListo\(true\);/);
});

test('no importa Leaflet ni nada web: tiene que funcionar igual en nativo', () => {
  assert.doesNotMatch(pantalla, /leaflet|react-dom|document\./i);
});
