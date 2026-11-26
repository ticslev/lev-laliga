// La Liga Lev — panel del árbitro.
// Cada toque se guarda primero en el celular (cola) y se envía en orden; si no hay señal,
// se reintenta solo. El minuto de cada registro se toma en el momento del toque.
(function () {
  'use strict';
  var L = window.LigaEventos;
  var nodo = document.getElementById('datos-arbitro');
  if (!nodo || !L) return;
  var inicial = JSON.parse(nodo.textContent);
  var estado = { partido: inicial.partido, eventos: inicial.eventos, ahora: inicial.ahora };
  var nominas = inicial.nominas;
  var disc = inicial.disciplina;
  var esEditor = inicial.editor;
  var id = estado.partido.id;
  var desfase = estado.ahora - Date.now();
  var CLAVE = 'laliga-cola-' + id;
  var cola = leerCola();
  var enviando = false;

  var $ = function (s) { return document.getElementById(s); };
  var golesEl = $('arb-goles');
  var relojEl = $('arb-reloj');
  var periodoEl = $('arb-periodo');
  var control = $('arb-control');
  var conexion = $('arb-conexion');
  var lista = $('arb-eventos');
  var hoja = $('hoja');

  function leerCola() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch (e) { return []; }
  }
  function guardarCola() {
    try { localStorage.setItem(CLAVE, JSON.stringify(cola)); } catch (e) { /* sin almacenamiento */ }
  }
  function idCliente() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------- Estado mostrado (servidor + lo que aún está en la cola) ----------
  function vista() {
    var p = Object.assign({}, estado.partido);
    var ahora = Date.now() + desfase;
    var pendientes = [];
    cola.forEach(function (a) {
      if (a.accion === 'evento') {
        if (a.tipo === 'gol') {
          if (a.equipo === p.local.id) p.golesLocal += a.valor || 1; else p.golesVisita += a.valor || 1;
        }
        pendientes.push(a);
      } else if (a.accion === 'pausar' && p.relojInicio) {
        p.relojBase += Math.floor((a.t - p.relojInicio) / 1000); p.relojInicio = null;
      } else if (a.accion === 'reanudar' && !p.relojInicio) {
        p.relojInicio = a.t;
      } else if (a.accion === 'iniciar') {
        p.periodo = (p.periodo || 0) + 1; p.estado = 'en_vivo'; p.relojBase = (p.periodo - 1) * (p.torneo.minutos || 0) * 60; p.relojInicio = a.t;
      } else if (a.accion === 'fin_periodo') {
        if (p.relojInicio) p.relojBase += Math.floor((a.t - p.relojInicio) / 1000);
        p.relojInicio = null; p.estado = 'entretiempo';
      } else if (a.accion === 'reabrir') {
        p.estado = 'en_vivo'; p.relojInicio = null;
      } else if (a.accion === 'finalizar') {
        if (p.relojInicio) p.relojBase += Math.floor((a.t - p.relojInicio) / 1000);
        p.relojInicio = null; p.estado = 'finalizado';
      }
    });
    return { p: p, pendientes: pendientes, ahora: ahora };
  }

  function boton(texto, clase, accion) {
    var b = L.crear('button', clase, texto);
    b.type = 'button';
    b.addEventListener('click', accion);
    return b;
  }

  function pintar() {
    var v = vista();
    var p = v.p;
    golesEl.textContent = p.golesLocal + ' – ' + p.golesVisita;
    relojEl.textContent = p.estado === 'programado' ? '00:00' : L.reloj(p, v.ahora, 'reloj');
    var nombre = disc.periodoNombre;
    periodoEl.textContent = p.estado === 'programado' ? 'Sin empezar'
      : p.estado === 'finalizado' ? 'Terminado'
      : p.estado === 'entretiempo' ? 'Descanso tras el ' + p.periodo + '.º ' + nombre
      : p.periodo + '.º ' + nombre + (p.relojInicio ? '' : ' · pausado');

    control.textContent = '';
    if (p.estado === 'programado') {
      control.appendChild(boton('Iniciar partido', 'principal', function () { encolar({ accion: 'iniciar' }); }));
    } else if (p.estado === 'en_vivo') {
      control.appendChild(p.relojInicio
        ? boton('Pausar', '', function () { encolar({ accion: 'pausar' }); })
        : boton('Reanudar', 'principal', function () { encolar({ accion: 'reanudar' }); }));
      control.appendChild(boton('Fin del ' + p.periodo + '.º ' + nombre, '', function () { encolar({ accion: 'fin_periodo' }); }));
      control.appendChild(boton('Finalizar', 'peligro', finalizar));
    } else if (p.estado === 'entretiempo') {
      control.appendChild(boton('Iniciar ' + (p.periodo + 1) + '.º ' + nombre, 'principal', function () { encolar({ accion: 'iniciar' }); }));
      control.appendChild(boton('Finalizar partido', 'peligro', finalizar));
    } else if (p.estado === 'finalizado' && esEditor) {
      control.appendChild(boton('Reabrir partido', '', function () {
        if (confirm('¿Reabrir el partido para corregir registros?')) encolar({ accion: 'reabrir' });
      }));
    }
    if (p.estado === 'en_vivo' || p.estado === 'entretiempo') {
      control.appendChild(boton('Ajustar reloj', 'ajuste', ajustarReloj));
    }

    var activo = p.estado === 'en_vivo' || p.estado === 'entretiempo';
    document.querySelectorAll('.arb-equipos button').forEach(function (b) { b.disabled = !activo; });
    $('arb-deshacer').disabled = !activo || (!cola.some(function (a) { return a.accion === 'evento'; }) && !ultimoDeshacible());

    lista.textContent = '';
    v.pendientes.slice().reverse().forEach(function (a) {
      var li = L.fila({ tipo: a.tipo, equipo: a.equipo === p.local.id ? p.local.nombre : p.visita.nombre, valor: a.valor, minuto: a.minuto, jugador: a.nombreJugador, jugador2: a.nombreJugador2, detalle: a.detalle, periodo: p.periodo }, p.torneo.disciplina);
      li.classList.add('pendiente');
      lista.appendChild(li);
    });
    estado.eventos.forEach(function (ev) { lista.appendChild(L.fila(ev, p.torneo.disciplina)); });
    if (!lista.children.length) lista.appendChild(L.crear('li', 'r-sistema', 'Todavía no hay registros.'));
  }

  function ultimoDeshacible() {
    for (var i = 0; i < estado.eventos.length; i++) {
      var t = estado.eventos[i].tipo;
      if (t === 'gol' || t === 'amarilla' || t === 'roja' || t === 'cambio' || t === 'nota') return estado.eventos[i];
    }
    return null;
  }

  function finalizar() {
    var v = vista();
    if (confirm('¿Finalizar el partido con ' + v.p.local.nombre + ' ' + v.p.golesLocal + ' – ' + v.p.golesVisita + ' ' + v.p.visita.nombre + '?')) {
      encolar({ accion: 'finalizar' });
    }
  }

  function ajustarReloj() {
    var v = vista();
    var actual = L.reloj(v.p, v.ahora, 'reloj');
    var texto = prompt('Escribe el tiempo del reloj (minutos:segundos)', actual);
    if (!texto) return;
    var m = texto.trim().match(/^(\d{1,3})(?::(\d{1,2}))?$/);
    if (!m) { alert('Usa el formato 25:00'); return; }
    encolar({ accion: 'ajustar_reloj', segundos: Number(m[1]) * 60 + Number(m[2] || 0) });
  }

  // ---------- Cola y envío ----------
  function encolar(accion) {
    accion.t = Date.now() + desfase;
    accion.clienteId = idCliente();
    cola.push(accion);
    guardarCola();
    if (navigator.vibrate) navigator.vibrate(30);
    pintar();
    enviar();
  }

  function estadoConexion(texto, mal) {
    conexion.textContent = texto;
    conexion.className = 'arb-conexion' + (mal ? ' mal' : '');
  }

  function enviar() {
    if (enviando || !cola.length) {
      if (!cola.length) estadoConexion('Todo guardado ✓');
      return;
    }
    enviando = true;
    var a = cola[0];
    var cuerpo = Object.assign({}, a);
    delete cuerpo.nombreJugador; delete cuerpo.nombreJugador2;
    estadoConexion('Guardando…');
    fetch('/api/arbitro/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      credentials: 'same-origin',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, datos: d }; });
    }).then(function (res) {
      enviando = false;
      if (res.ok) {
        cola.shift(); guardarCola();
        estado = res.datos; desfase = res.datos.ahora - Date.now();
        pintar(); enviar();
      } else if (res.status === 401) {
        estadoConexion('Tu sesión terminó. Abre el panel otra vez para entrar; lo pendiente se enviará después.', true);
      } else {
        // El servidor rechazó la acción (p. ej. ya estaba pausado): se descarta y se sigue.
        cola.shift(); guardarCola();
        estadoConexion(res.datos.error || 'No se pudo guardar.', true);
        pintar();
        setTimeout(enviar, 1500);
      }
    }).catch(function () {
      enviando = false;
      estadoConexion('Sin señal: ' + cola.length + ' pendiente(s). Se enviarán solos.', true);
      setTimeout(enviar, 4000);
    });
  }

  // ---------- Hoja para elegir jugador ----------
  function elegir(titulo, jugadores, extras, alElegir) {
    $('hoja-titulo').textContent = titulo;
    var cont = $('hoja-lista');
    cont.textContent = '';
    jugadores.forEach(function (j) {
      var b = L.crear('button');
      b.type = 'button';
      b.appendChild(L.crear('b', '', j.dorsal !== null && j.dorsal !== undefined ? String(j.dorsal) : '–'));
      b.appendChild(document.createTextNode(j.nombre));
      b.addEventListener('click', function () { hoja.close(); alElegir(j); });
      cont.appendChild(b);
    });
    (extras || []).forEach(function (x) {
      var b = L.crear('button', 'otro', x.texto);
      b.type = 'button';
      b.addEventListener('click', function () { hoja.close(); x.accion(); });
      cont.appendChild(b);
    });
    if (hoja.showModal) hoja.showModal(); else hoja.setAttribute('open', '');
  }

  function minutoAhora() {
    var v = vista();
    var seg = (v.p.relojBase || 0) + (v.p.relojInicio ? Math.max(0, Math.floor((v.ahora - v.p.relojInicio) / 1000)) : 0);
    return Math.floor(seg / 60) + 1;
  }

  document.querySelectorAll('.arb-equipos button[data-tipo]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = estado.partido;
      var lado = b.dataset.lado;
      var equipo = lado === 'local' ? p.local.id : p.visita.id;
      var propios = nominas[lado];
      var rivales = nominas[lado === 'local' ? 'visita' : 'local'];
      var tipo = b.dataset.tipo;
      var valor = Number(b.dataset.valor || 1);
      var minuto = minutoAhora();
      var base = { accion: 'evento', tipo: tipo, equipo: equipo, valor: valor, minuto: minuto };

      if (b.dataset.sinJugador) { encolar(base); return; }

      if (tipo === 'gol') {
        var extras = [{ texto: 'Sin identificar', accion: function () { encolar(base); } }];
        if (disc.marcador === 'goles') {
          extras.push({ texto: 'Gol en contra (autogol del rival)', accion: function () {
            elegir('¿Quién hizo el autogol?', rivales, [{ texto: 'Sin identificar', accion: function () { encolar(Object.assign({}, base, { detalle: 'autogol' })); } }], function (j) {
              encolar(Object.assign({}, base, { detalle: 'autogol', jugador: j.id, nombreJugador: j.nombre }));
            });
          } });
        }
        elegir((disc.marcador === 'goles' ? '¿Quién anotó?' : '¿Quién anotó +' + valor + '?'), propios, extras, function (j) {
          encolar(Object.assign({}, base, { jugador: j.id, nombreJugador: j.nombre }));
        });
      } else if (tipo === 'amarilla' || tipo === 'roja') {
        elegir('Tarjeta ' + tipo + ': ¿a quién?', propios, [{ texto: 'Sin identificar', accion: function () { encolar(base); } }], function (j) {
          encolar(Object.assign({}, base, { jugador: j.id, nombreJugador: j.nombre }));
        });
      } else if (tipo === 'cambio') {
        elegir('Cambio: ¿quién entra?', propios, [{ texto: 'Omitir', accion: function () { salir(null); } }], function (j) { salir(j); });
        var salir = function (entra) {
          elegir('Cambio: ¿quién sale?', propios.filter(function (x) { return !entra || x.id !== entra.id; }), [{ texto: 'Omitir', accion: function () {
            encolar(Object.assign({}, base, entra ? { jugador: entra.id, nombreJugador: entra.nombre } : {}));
          } }], function (sale) {
            encolar(Object.assign({}, base, entra ? { jugador: entra.id, nombreJugador: entra.nombre } : {}, { jugador2: sale.id, nombreJugador2: sale.nombre }));
          });
        };
      }
    });
  });

  $('arb-deshacer').addEventListener('click', function () {
    // Primero lo que aún no se envió; si no hay, se anula el último registro guardado.
    for (var i = cola.length - 1; i >= 0; i--) {
      if (cola[i].accion === 'evento' && !(enviando && i === 0)) {
        cola.splice(i, 1); guardarCola(); pintar();
        return;
      }
    }
    var ev = ultimoDeshacible();
    if (!ev) return;
    var d = L.describir(ev, estado.partido.torneo.disciplina);
    if (confirm('¿Deshacer “' + d.titulo + (d.detalle ? ' · ' + d.detalle : '') + '”?')) encolar({ accion: 'anular', evento: ev.id });
  });

  // Recibe también los cambios hechos desde otro celular (otro árbitro o editor).
  setInterval(function () {
    if (cola.length || enviando || document.hidden) return;
    fetch('/api/partido/' + id, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && !cola.length) { estado = d; desfase = d.ahora - Date.now(); pintar(); }
    }).catch(function () {});
  }, 10000);

  setInterval(function () {
    var v = vista();
    if (v.p.estado !== 'programado') relojEl.textContent = L.reloj(v.p, v.ahora, 'reloj');
  }, 500);
  window.addEventListener('online', enviar);
  window.addEventListener('beforeunload', function (e) { if (cola.length) { e.preventDefault(); e.returnValue = ''; } });

  pintar();
  enviar();
})();
