// La Liga Lev — cómo se cuenta cada registro del partido (lo usan la página pública y el panel del árbitro).
(function () {
  'use strict';
  var PERIODO = { futbol: 'tiempo', futsal: 'tiempo', basquet: 'cuarto', voley: 'set', otro: 'periodo' };

  function crear(etiqueta, clase, texto) {
    var el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function icono(ev) {
    if (ev.tipo === 'gol') {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('class', 'ic-gol');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z" fill="currentColor"/>';
      return svg;
    }
    if (ev.tipo === 'amarilla' || ev.tipo === 'roja') return crear('span', 'ic-tarjeta ic-' + ev.tipo);
    if (ev.tipo === 'cambio') return crear('span', 'ic-cambio', '⇄');
    return crear('span');
  }

  function nombreJugador(ev) {
    return ev.jugador ? (ev.dorsal !== null && ev.dorsal !== undefined ? ev.jugador + ' (' + ev.dorsal + ')' : ev.jugador) : null;
  }

  // Devuelve { titulo, detalle, destacado }
  function describir(ev, disciplina) {
    var periodo = PERIODO[disciplina] || 'tiempo';
    var n = ev.periodo || 1;
    var j = nombreJugador(ev);
    switch (ev.tipo) {
      case 'gol':
        if (disciplina === 'voley') return { titulo: 'Set para ' + (ev.equipo || ''), detalle: '', destacado: true };
        if (disciplina === 'basquet' || disciplina === 'otro') return { titulo: '+' + ev.valor + (j ? ' · ' + j : ''), detalle: ev.equipo, destacado: ev.valor >= 3 };
        if (ev.detalle === 'autogol') return { titulo: '¡GOL! (en contra)', detalle: (j ? j + ' · ' : '') + 'suma para ' + ev.equipo, destacado: true };
        return { titulo: '¡GOL!' + (j ? ' ' + j : ''), detalle: ev.equipo, destacado: true };
      case 'amarilla': return { titulo: 'Amarilla' + (j ? ' a ' + j : ''), detalle: ev.equipo };
      case 'roja': return { titulo: 'Roja' + (j ? ' a ' + j : ''), detalle: ev.equipo };
      case 'cambio': return { titulo: 'Cambio en ' + ev.equipo, detalle: [ev.jugador ? 'Entra ' + ev.jugador : '', ev.jugador2 ? 'sale ' + ev.jugador2 : ''].filter(Boolean).join(', ') };
      case 'inicio': return { titulo: n === 1 ? 'Comienza el partido' : 'Comienza el ' + n + '.º ' + periodo, sistema: true };
      case 'entretiempo': return { titulo: 'Fin del ' + n + '.º ' + periodo, sistema: true };
      case 'fin': return { titulo: ev.detalle === 'penales' ? 'Final del partido (se definió por penales)' : 'Final del partido', sistema: true };
      default: return { titulo: ev.detalle || 'Nota', detalle: ev.equipo };
    }
  }

  function fila(ev, disciplina) {
    var d = describir(ev, disciplina);
    var li = crear('li', d.destacado ? 'r-gol' : d.sistema ? 'r-sistema' : '');
    li.appendChild(crear('span', 'r-min', ev.minuto !== null && ev.minuto !== undefined ? ev.minuto + "'" : ''));
    li.appendChild(icono(ev));
    var cuerpo = crear('span', 'r-texto');
    cuerpo.appendChild(crear('b', '', d.titulo));
    if (d.detalle) cuerpo.appendChild(crear('span', '', d.detalle));
    li.appendChild(cuerpo);
    return li;
  }

  function reloj(p, ahora, formato) {
    var seg = (p.relojBase || 0) + (p.relojInicio ? Math.max(0, Math.floor((ahora - p.relojInicio) / 1000)) : 0);
    if (formato === 'minuto') return (Math.floor(seg / 60) + 1) + "'";
    var m = Math.floor(seg / 60);
    var s = seg % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  window.LigaEventos = { fila: fila, describir: describir, reloj: reloj, PERIODO: PERIODO, crear: crear };
})();
