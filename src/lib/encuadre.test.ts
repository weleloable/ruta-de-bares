import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MARGEN_ABAJO_PX,
  MARGEN_ARRIBA_PX,
  crearControlEncuadre,
  desplazamientoCentroPx,
  encuadreDe,
  huecosDesdeMedidas,
  latitudCentroDesplazado,
  margenesEncuadre,
} from './encuadre.ts';

describe('desplazamientoCentroPx', () => {
  const huecosReales = [
    { arriba: 110, abajo: 250 },
    { arriba: 132, abajo: 214 },
    { arriba: 60, abajo: 60 },
  ];

  it('coloca el punto en el centro del hueco libre REAL, con los huecos medidos', () => {
    for (const tapado of huecosReales) {
      for (const alto of [419, 460, 600, 820, 1200]) {
        const libre = alto - tapado.arriba - tapado.abajo;
        if (libre < 40) continue;
        const yDelPunto = alto / 2 - desplazamientoCentroPx(alto, tapado);
        const centroDelHueco = tapado.arriba + libre / 2;
        assert.ok(Math.abs(yDelPunto - centroDelHueco) < 1e-9, `alto ${alto} ${JSON.stringify(tapado)}`);
      }
    }
  });

  it('reproduce el fallo del critico: a 419 px con carrusel de 250, el bar ya no cae bajo el carrusel', () => {
    const tapado = { arriba: 110, abajo: 250 };
    const yDelPunto = 419 / 2 - desplazamientoCentroPx(419, tapado);
    assert.ok(yDelPunto >= tapado.arriba && yDelPunto <= 419 - tapado.abajo, `y=${yDelPunto}`);
  });

  it('sin hueco real, cae en los margenes escalados en vez de dar un numero absurdo', () => {
    const tapado = { arriba: 110, abajo: 250 };
    const d = desplazamientoCentroPx(300, tapado);
    assert.ok(Number.isFinite(d) && Math.abs(d) < 150);
  });

  it('sin alto no desplaza', () => {
    assert.equal(desplazamientoCentroPx(0), 0);
  });

  it('huecos no numericos o negativos se tratan como cero', () => {
    assert.equal(desplazamientoCentroPx(800, { arriba: Number.NaN, abajo: -30 }), 0);
  });
});

describe('huecosDesdeMedidas', () => {
  const base = { altoSuperior: 92, altoPie: 232, margenSeguroArriba: 0, margenSeguroAbajo: 0, aire: 8 };

  it('suma alto, margen seguro y aire en cada lado', () => {
    assert.deepEqual(huecosDesdeMedidas({ ...base, margenSeguroArriba: 47, margenSeguroAbajo: 34 }), {
      arriba: 47 + 92 + 8,
      abajo: 34 + 232 + 8,
    });
  });

  it('reproduce el fallo del critico: el hueco de abajo sale del alto del carrusel, no de su posicion', () => {
    // Con la formula anterior (alto de la ventana - y del carrusel), encoger la
    // ventana de 900 a 600 sin que llegase el onLayout del carrusel daba 8 px.
    // Aqui no hay posicion que se quede vieja: el carrusel mide lo que mide.
    assert.equal(huecosDesdeMedidas(base).abajo, 240);
  });

  it('el aviso de error solo agranda el hueco de arriba', () => {
    const sinAviso = huecosDesdeMedidas(base);
    const conAviso = huecosDesdeMedidas({ ...base, altoSuperior: base.altoSuperior + 64 });
    assert.equal(conAviso.arriba - sinAviso.arriba, 64);
    assert.equal(conAviso.abajo, sinAviso.abajo);
  });

  it('medidas negativas o no numericas cuentan como cero', () => {
    assert.deepEqual(
      huecosDesdeMedidas({ altoSuperior: Number.NaN, altoPie: -5, margenSeguroArriba: -1, margenSeguroAbajo: Infinity * 0, aire: 8 }),
      { arriba: 8, abajo: 8 },
    );
  });
});

describe('latitudCentroDesplazado', () => {
  const MADRID = 40.4118;

  it('sin desplazamiento el centro es el propio punto', () => {
    assert.ok(Math.abs(latitudCentroDesplazado(MADRID, 0, 17) - MADRID) < 1e-9);
  });

  it('desplazamiento positivo lleva el centro al sur, en los dos hemisferios', () => {
    assert.ok(latitudCentroDesplazado(MADRID, 63, 17) < MADRID);
    assert.ok(latitudCentroDesplazado(-33.87, 63, 17) < -33.87);
  });

  it('coincide con los metros por pixel de Web Mercator (0.91 m/px en Madrid a zoom 17)', () => {
    // 156543.03 m/px en el ecuador a zoom 0, por cos(lat), entre 2^17.
    const metrosPorPixel = (156543.03392 * Math.cos((MADRID * Math.PI) / 180)) / 2 ** 17;
    const gradosEsperados = (63 * metrosPorPixel) / 111320;
    const gradosObtenidos = MADRID - latitudCentroDesplazado(MADRID, 63, 17);
    assert.ok(Math.abs(gradosObtenidos - gradosEsperados) / gradosEsperados < 0.01, `${gradosObtenidos} vs ${gradosEsperados}`);
  });

  it('ida y vuelta: desplazar y deshacer devuelve la latitud', () => {
    const ida = latitudCentroDesplazado(MADRID, 120, 17);
    assert.ok(Math.abs(latitudCentroDesplazado(ida, -120, 17) - MADRID) < 1e-9);
  });

  it('a mas zoom, el mismo desplazamiento en pixeles son menos grados', () => {
    const a15 = MADRID - latitudCentroDesplazado(MADRID, 63, 15);
    const a17 = MADRID - latitudCentroDesplazado(MADRID, 63, 17);
    assert.ok(Math.abs(a15 / a17 - 4) < 0.001);
  });
});

describe('crearControlEncuadre', () => {
  /**
   * Simula lo que hace RutaMapa.web.tsx: `encuadres` cuenta las veces que el
   * mapa se reencuadra de verdad.
   */
  function simulacion() {
    const control = crearControlEncuadre();
    let alto = 700;
    let encuadres = 0;
    const encuadrar = () => {
      if (control.pedir(alto)) encuadres += 1;
    };
    return {
      montar() {
        encuadrar();
      },
      ocultar() {
        alto = 0;
      },
      mostrar() {
        alto = 700;
        if (control.recuperarTamano()) encuadrar();
      },
      medida(valida: boolean) {
        if (control.medir(valida)) encuadrar();
      },
      cambianLosBares() {
        encuadrar();
      },
      get encuadres() {
        return encuadres;
      },
    };
  }

  it('reproduce el fallo del critico: ocultar y mostrar la pestana no reencuadra (se respeta el pan)', () => {
    const s = simulacion();
    s.montar();
    s.medida(true);
    const tras = s.encuadres;
    // Cambiar de pestana: la medida pasa a 0 (no valida) y vuelve.
    s.ocultar();
    s.medida(false);
    s.mostrar();
    s.medida(true);
    assert.equal(s.encuadres, tras);
  });

  it('la primera medida valida encuadra una vez; las siguientes (aviso de error, resize) no', () => {
    const s = simulacion();
    s.montar();
    assert.equal(s.encuadres, 1);
    s.medida(false);
    assert.equal(s.encuadres, 1, 'una medida invalida no cuenta como la primera');
    s.medida(true);
    assert.equal(s.encuadres, 2);
    s.medida(true);
    s.medida(true);
    assert.equal(s.encuadres, 2);
  });

  it('bares cambiados con la pestana oculta: se encuadra al volver, una sola vez', () => {
    const s = simulacion();
    s.montar();
    s.medida(true);
    s.ocultar();
    const antes = s.encuadres;
    s.cambianLosBares();
    assert.equal(s.encuadres, antes, 'con 0 px no se encuadra');
    s.mostrar();
    assert.equal(s.encuadres, antes + 1);
    s.ocultar();
    s.mostrar();
    assert.equal(s.encuadres, antes + 1, 'lo pendiente ya se hizo');
  });

  it('un alto no numerico cuenta como oculto', () => {
    assert.equal(crearControlEncuadre().pedir(Number.NaN), false);
  });
});

describe('margenesEncuadre con huecos medidos', () => {
  it('con sitio de sobra usa los huecos medidos tal cual', () => {
    assert.deepEqual(margenesEncuadre(900, { arriba: 132, abajo: 214 }), { arriba: 132, abajo: 214 });
  });

  it('una pantalla sin nada encima no tiene margenes', () => {
    assert.deepEqual(margenesEncuadre(300, { arriba: 0, abajo: 0 }), { arriba: 0, abajo: 0 });
  });
});

describe('margenesEncuadre', () => {
  it('en una pantalla normal usa los margenes completos', () => {
    assert.deepEqual(margenesEncuadre(900), { arriba: MARGEN_ARRIBA_PX, abajo: MARGEN_ABAJO_PX });
    // 600 px: justo quedan 240 libres, el minimo.
    assert.deepEqual(margenesEncuadre(600), { arriba: MARGEN_ARRIBA_PX, abajo: MARGEN_ABAJO_PX });
  });

  it('en una pantalla baja deja libre la mitad del alto o 240 px, lo que sea menor', () => {
    for (const alto of [120, 300, 380, 460, 520, 599]) {
      const { arriba, abajo } = margenesEncuadre(alto);
      const libre = alto - arriba - abajo;
      // -1 por el redondeo a pixeles enteros de los dos margenes.
      assert.ok(libre >= Math.min(240, alto / 2) - 1, `alto ${alto}: libre ${libre}`);
      assert.ok(arriba <= MARGEN_ARRIBA_PX && abajo <= MARGEN_ABAJO_PX, `alto ${alto}`);
    }
    // Por debajo de 600 px los margenes completos ya no caben: se reducen.
    assert.ok(margenesEncuadre(460).arriba < MARGEN_ARRIBA_PX);
  });

  it('reproduce el fallo visto: 460 px con margenes fijos dejaban solo 100 px de mapa', () => {
    const { arriba, abajo } = margenesEncuadre(460);
    assert.ok(460 - arriba - abajo >= 230);
  });

  it('mantiene la proporcion entre cabecera y carrusel', () => {
    const { arriba, abajo } = margenesEncuadre(380);
    assert.ok(Math.abs(arriba / abajo - MARGEN_ARRIBA_PX / MARGEN_ABAJO_PX) < 0.05);
  });

  it('los margenes nunca decrecen al crecer la pantalla', () => {
    let anterior = margenesEncuadre(0);
    for (let alto = 10; alto <= 1200; alto += 10) {
      const actual = margenesEncuadre(alto);
      assert.ok(actual.arriba >= anterior.arriba && actual.abajo >= anterior.abajo, `alto ${alto}`);
      anterior = actual;
    }
  });

  it('alto cero, negativo o no numerico: sin margenes, nunca negativos ni NaN', () => {
    for (const alto of [0, -50, Number.NaN, Infinity * -1]) {
      assert.deepEqual(margenesEncuadre(alto), { arriba: 0, abajo: 0 }, String(alto));
    }
  });
});

describe('encuadreDe', () => {
  it('sin paradas no hay encuadre', () => {
    assert.equal(encuadreDe([]), null);
  });

  it('una parada se centra, no se encuadra con limites de area cero', () => {
    assert.deepEqual(encuadreDe([{ lat: 40.4168, lng: -3.7038 }]), {
      tipo: 'punto',
      centro: { lat: 40.4168, lng: -3.7038 },
    });
  });

  it('varias paradas en el mismo sitio tambien se centran', () => {
    const p = { lat: 40.4, lng: -3.7 };
    assert.equal(encuadreDe([p, { ...p }, { ...p }])?.tipo, 'punto');
  });

  it('limites [[sur, oeste], [norte, este]] bien ordenados en el hemisferio oeste', () => {
    const e = encuadreDe([
      { lat: 40.4155, lng: -3.7074 },
      { lat: 40.4168, lng: -3.7038 },
      { lat: 40.4131, lng: -3.701 },
    ]);
    assert.deepEqual(e, {
      tipo: 'limites',
      limites: [
        [40.4131, -3.7074],
        [40.4168, -3.701],
      ],
    });
  });

  it('dos paradas en la misma latitud dan limites, no un punto', () => {
    assert.equal(encuadreDe([{ lat: 40, lng: -3.7 }, { lat: 40, lng: -3.6 }])?.tipo, 'limites');
  });

  it('ignora coordenadas no finitas en vez de mandar el mapa a NaN', () => {
    assert.deepEqual(
      encuadreDe([
        { lat: Number.NaN, lng: -3.7 },
        { lat: 40.4, lng: Infinity },
        { lat: 40.4, lng: -3.7 },
      ]),
      { tipo: 'punto', centro: { lat: 40.4, lng: -3.7 } },
    );
    assert.equal(encuadreDe([{ lat: Number.NaN, lng: Number.NaN }]), null);
  });

  it('no muta la entrada', () => {
    const entrada = [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ];
    const copia = structuredClone(entrada);
    encuadreDe(entrada);
    assert.deepEqual(entrada, copia);
  });
});
