import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ID_JUEGO } from './config.ts';
import { PUNTOS_MAXIMOS } from './partida.ts';

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
  // Con el tiempo, que desempata (0061).
  assert.match(cuerpo, /enviarNota\(rutaId, r\.juego, r\.puntuacion, typeof r\.detalles\?\.ms === 'number' \? r\.detalles\.ms : 0\)/);
});

test('la nota maxima que acepta el servidor (0061) es un punto por pregunta', () => {
  const sql = leer('supabase/migrations/0061_copa_margen_sorteo_quiz.sql');
  assert.ok(sql.includes(`when '${ID_JUEGO}' then ${PUNTOS_MAXIMOS}`), 'la funcion usa el tope de la app');
  assert.ok(sql.includes(`game = '${ID_JUEGO}' and best_score between 0 and ${PUNTOS_MAXIMOS}`), 'la tabla usa el tope de la app');
});

test('el reloj usa una hora limite, no cuenta ticks (una pestana en segundo plano no gana tiempo)', () => {
  assert.match(pantalla, /const limite = Date\.now\(\) \+ CONFIG\.segundos \* 1000;/);
});

test('el acierto y el fallo llevan icono y texto, no solo color', () => {
  assert.match(pantalla, /name="checkmark-circle"/);
  assert.match(pantalla, /name="close-circle"/);
  assert.match(pantalla, /Correcta/);
});

test('cabe sin scroll: "Sí, definitiva" ocupa la fila fija de abajo, no un bloque nuevo; y ya no hay "Plantarme"', () => {
  // Antes salia debajo de las opciones y empujaba los comodines fuera de la
  // pantalla (90 px de mas a 808 de ventana). El que de verdad lo mide es
  // `npm run verificar:juego`, con los textos mas largos del banco.
  const fila = pantalla.slice(pantalla.indexOf('<View style={styles.fila}>'), pantalla.indexOf('{estado.fase === \'suspense\''));
  assert.match(fila, /Sí, definitiva/);
  assert.doesNotMatch(pantalla, /Plantarme|plantarse/);
  assert.doesNotMatch(pantalla, /styles\.confirmar\b/);
});

test('el tiempo de cada pregunta lo mide la pantalla desde que sale, y viaja al confirmar y al cambiar de ronda', () => {
  assert.match(pantalla, /inicio\.current = Date\.now\(\);/);
  assert.match(pantalla, /enviar\(\{ tipo: 'confirmar', ms: tardado\(\) \}\)/);
  assert.match(pantalla, /comodin: 'cambio', ms: tardado\(\)/);
});

test('no se deja jugar hasta leer las preguntas vistas (si no, se pisaba el historial)', () => {
  assert.match(pantalla, /disabled=\{!listo\}/);
  assert.match(pantalla, /if \(vivo\) setListo\(true\);/);
});

test('no importa Leaflet ni nada web: tiene que funcionar igual en nativo', () => {
  assert.doesNotMatch(pantalla, /leaflet|react-dom|document\./i);
});
