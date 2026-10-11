import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Red rapida y PARCIAL que lee el codigo: la logica esta en partida.test.ts y el
// flujo de verdad se prueba en el navegador.
const leer = (ruta: string) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const juegos = leer('src/features/minijuegos/juegos.ts');
const pantalla = leer('src/features/quiz/QuienQuiereSerCervecero.tsx');

test('esta en el menu de minijuegos con su detalle y SIN ranking ni envio (pediria una migracion)', () => {
  const ficha = juegos.slice(juegos.indexOf('id: ID_QUIZ'));
  assert.match(ficha, /Componente: QuienQuiereSerCervecero,/);
  assert.match(ficha, /Detalle: DetalleQuiz,/);
  assert.doesNotMatch(ficha.slice(0, ficha.indexOf('},')), /ranking|enviar/);
});

test('el reloj usa una hora limite, no cuenta ticks (una pestana en segundo plano no gana tiempo)', () => {
  assert.match(pantalla, /const limite = Date\.now\(\) \+ CONFIG\.segundos \* 1000;/);
});

test('el acierto y el fallo llevan icono y texto, no solo color', () => {
  assert.match(pantalla, /name="checkmark-circle"/);
  assert.match(pantalla, /name="close-circle"/);
  assert.match(pantalla, /Correcta/);
});

test('no importa Leaflet ni nada web: tiene que funcionar igual en nativo', () => {
  assert.doesNotMatch(pantalla, /leaflet|react-dom|document\./i);
});
