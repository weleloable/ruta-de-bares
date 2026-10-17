/*
 * Que icono lleva cada aviso del movil. Lo carga el service worker
 * (`importScripts` en sw.js) y lo prueba tests/iconos-avisos.test.ts.
 *
 * El aviso no trae su tipo como campo: se saca del `tag` que pone la Edge
 * Function (`cana`, `admin` o `<tipo>-<id>`), y el detalle del emoji con el que
 * empieza el titulo, que lo escribe el servidor (0064, 0066). Asi no hay que
 * tocar ni redesplegar la Edge Function. Si un titulo cambia de emoji, el test
 * que compara con las migraciones falla.
 *
 * Devuelve el nombre del fichero en icons/avisos/ (sin .png), o null para el
 * icono de la app.
 */
self.iconoDeAviso = function iconoDeAviso(datos) {
  var tag = String((datos && datos.tag) || '');
  var titulo = String((datos && datos.titulo) || '');
  var url = String((datos && datos.url) || '');
  var tipo = tag.replace(/-\d+$/, '');
  var empieza = function (emoji) {
    return titulo.indexOf(emoji) === 0;
  };
  switch (tipo) {
    case 'parada':
      if (empieza('📸')) return 'foto';
      if (empieza('📍')) return 'otra';
      return 'bar';
    case 'ultimo_bar':
      return 'falta';
    case 'sorteo':
      return empieza('🎉') ? 'gana' : 'sorteo';
    case 'cana':
      if (empieza('🍻')) return 'conexion';
      if (empieza('📳')) return 'toque';
      if (empieza('🍺')) return 'pregunta';
      return 'mensaje';
    case 'anuncio':
      return 'anuncio';
    case 'admin':
      // Lo que hizo otro admin lleva a Moderacion; lo pendiente, a Alertas.
      return url.indexOf('/admin/moderacion') === 0 ? 'info' : 'alerta';
    default:
      return null;
  }
};
