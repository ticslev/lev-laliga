// La Liga Lev — página del partido: marcador, reloj y minuto a minuto en vivo.
// Recibe los cambios por WebSocket; si no se puede, consulta cada pocos segundos.
(function () {
  'use strict';
  var L = window.LigaEventos;
  var nodo = document.getElementById('datos-partido');
  if (!nodo || !L) return;
  var estado = JSON.parse(nodo.textContent);
  var id = estado.partido.id;
  var desfase = estado.ahora - Date.now();
  var marcador = document.getElementById('marcador');
  var relojEl = document.getElementById('reloj');
  var periodoEl = document.getElementById('periodo');
  var relato = document.getElementById('relato');
  var conexion = document.getElementById('conexion');
  var festejo = document.getElementById('festejo');
  var ultimoGolVisto = null;
  var ws = null;
  var consulta = null;

  function enJuego() { return estado.partido.estado === 'en_vivo' || estado.partido.estado === 'entretiempo'; }

  function pintarReloj() {
    var p = estado.partido;
    if (!enJuego() || !p.torneo.minutos) { relojEl.textContent = ''; return; }
    relojEl.textContent = p.estado === 'entretiempo' ? 'Descanso' : L.reloj(p, Date.now() + desfase, 'minuto');
  }

  function pintar() {
    var p = estado.partido;
    if (p.estado === 'finalizado' && !p.marcador) {
      marcador.textContent = '';
      marcador.appendChild(L.crear('small', '', p.ganador === 'empate' ? 'EMPATE' : 'GANÓ ' + (p.ganador === 'local' ? p.local.nombre : p.visita.nombre).toUpperCase()));
    } else if (p.estado !== 'programado') {
      marcador.textContent = '';
      marcador.appendChild(document.createTextNode(p.golesLocal + ' '));
      marcador.appendChild(L.crear('i', '', '–'));
      marcador.appendChild(document.createTextNode(' ' + p.golesVisita));
    }
    var nombre = L.PERIODO[p.torneo.disciplina] || 'tiempo';
    periodoEl.textContent = enJuego() && p.periodo ? p.periodo + '.º ' + nombre : p.estado === 'finalizado' ? 'Final' : '';
    var etiqueta = document.querySelector('[data-estado]');
    if (etiqueta) {
      etiqueta.textContent = '';
      var span = L.crear('span', 'estado' + (enJuego() ? ' estado-vivo' : p.estado === 'finalizado' ? ' estado-final' : ''));
      if (p.estado === 'en_vivo') span.appendChild(L.crear('span', 'punto-vivo'));
      span.appendChild(document.createTextNode(p.estado === 'programado' ? 'Programado' : p.estadoTexto));
      etiqueta.appendChild(span);
    }
    relato.textContent = '';
    if (!estado.eventos.length) {
      relato.appendChild(L.crear('li', 'r-sistema', p.estado === 'programado' ? 'El partido aún no empieza. Aquí verás cada gol, tarjeta y cambio al instante.' : 'Sin registros todavía.'));
    }
    estado.eventos.forEach(function (ev) { relato.appendChild(L.fila(ev, p.torneo.disciplina)); });
    pintarReloj();
  }

  function celebrar() {
    var goles = estado.eventos.filter(function (ev) { return ev.tipo === 'gol'; });
    var ultimo = goles.length ? goles[0].id : 0;
    if (ultimoGolVisto !== null && ultimo > ultimoGolVisto && festejo) {
      var ev = goles[0];
      var d = estado.partido.torneo.disciplina;
      document.getElementById('festejo-texto').textContent = d === 'voley' ? '¡SET!' : d === 'basquet' || d === 'otro' ? '+' + ev.valor : '¡GOL!';
      document.getElementById('festejo-equipo').textContent = [ev.jugador, ev.equipo].filter(Boolean).join(' · ');
      festejo.hidden = false;
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      setTimeout(function () { festejo.hidden = true; }, 2600);
    }
    ultimoGolVisto = ultimo;
  }

  function recibir(nuevo) {
    if (!nuevo || !nuevo.partido) return;
    estado = nuevo;
    desfase = nuevo.ahora - Date.now();
    celebrar();
    pintar();
  }

  function consultar() {
    fetch('/api/partido/' + id, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(recibir)
      .catch(function () { aviso('Sin conexión. Reintentando…'); });
  }

  function aviso(texto) {
    conexion.hidden = !texto;
    conexion.textContent = texto || '';
  }

  function porConsulta(segundos) {
    clearInterval(consulta);
    consulta = setInterval(function () { if (!document.hidden) consultar(); }, segundos * 1000);
  }

  function conectar() {
    if (!enJuego() && estado.partido.estado !== 'programado') return; // terminado: no hace falta
    if (!('WebSocket' in window)) { porConsulta(5); return; }
    try {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/partido/' + id + '/ws');
    } catch (e) { porConsulta(5); return; }
    ws.onopen = function () { aviso(''); porConsulta(60); consultar(); };
    ws.onmessage = function (m) {
      if (m.data === 'pong') return;
      try { recibir(JSON.parse(m.data)); } catch (e) { /* mensaje no válido */ }
    };
    ws.onclose = function () {
      ws = null;
      porConsulta(enJuego() ? 5 : 30);
      setTimeout(conectar, 15000);
    };
    ws.onerror = function () { try { ws.close(); } catch (e) { /* nada */ } };
  }

  // Mantiene viva la conexión en celulares.
  setInterval(function () { if (ws && ws.readyState === 1) ws.send('ping'); }, 25000);
  setInterval(pintarReloj, 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) consultar(); });

  var compartir = document.getElementById('compartir');
  if (compartir) {
    compartir.addEventListener('click', function () {
      var p = estado.partido;
      var texto = p.local.nombre + ' ' + (p.estado === 'programado' ? 'vs' : p.golesLocal + '–' + p.golesVisita) + ' ' + p.visita.nombre + ' · La Liga Lev';
      if (navigator.share) {
        navigator.share({ title: 'La Liga Lev', text: texto, url: location.href }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(texto + ' ' + location.href).then(function () { compartir.textContent = '¡Enlace copiado!'; });
      }
    });
  }

  celebrar();
  pintar();
  conectar();
  if (!ws) porConsulta(enJuego() ? 5 : 60);
})();
