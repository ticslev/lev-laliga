// La Liga Lev — panel del árbitro "con una mano".
// - El gol (o la tarjeta) se registra al primer toque; quién fue se elige después y es opcional.
// - Cada toque se guarda primero en el celular (cola) y se envía en orden; sin señal, se reintenta solo.
// - El reloj se pausa tocándolo. "Deshacer" siempre visible y dice qué deshace.
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
  var pendiente = null; // { clienteId, tipo, lado, valor, equipo, minuto }

  var $ = function (s) { return document.getElementById(s); };
  var hoja = $('hoja');

  function leerCola() { try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch (e) { return []; } }
  function guardarCola() { try { localStorage.setItem(CLAVE, JSON.stringify(cola)); } catch (e) { /* sin almacenamiento */ } }
  function idCliente() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function nombreLado(lado) { return lado === 'local' ? estado.partido.local.nombre : estado.partido.visita.nombre; }
  function ladoDe(equipoId) { return equipoId === estado.partido.local.id ? 'local' : 'visita'; }

  // ---------- Estado mostrado (servidor + cola) ----------
  function vista() {
    var p = Object.assign({}, estado.partido);
    var eventos = estado.eventos.map(function (ev) { return Object.assign({}, ev); });
    cola.forEach(function (a) {
      if (a.accion === 'evento') {
        if (a.tipo === 'gol') { if (a.equipo === p.local.id) p.golesLocal += a.valor || 1; else p.golesVisita += a.valor || 1; }
        eventos.unshift({ tipo: a.tipo, equipoId: a.equipo, equipo: nombreLado(ladoDe(a.equipo)), valor: a.valor || 1, minuto: a.minuto, jugador: a.nombreJugador, jugador2: a.nombreJugador2, detalle: a.detalle, periodo: p.periodo, clienteId: a.clienteId, pendiente: true });
      } else if (a.accion === 'asignar') {
        eventos.forEach(function (ev) { if (ev.clienteId === a.objetivo) ev.jugador = a.nombreJugador; });
      } else if (a.accion === 'anular') {
        var anulado = eventos.find(function (ev) { return ev.id === a.evento; });
        if (anulado && anulado.tipo === 'gol') { if (anulado.equipoId === p.local.id) p.golesLocal -= anulado.valor; else p.golesVisita -= anulado.valor; }
        eventos = eventos.filter(function (ev) { return ev.id !== a.evento; });
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
      } else if (a.accion === 'ajustar_reloj') {
        p.relojBase = a.segundos; if (p.relojInicio) p.relojInicio = a.t;
      }
    });
    return { p: p, eventos: eventos, ahora: Date.now() + desfase };
  }

  function ultimoDeshacible(v) {
    for (var i = 0; i < v.eventos.length; i++) {
      var t = v.eventos[i].tipo;
      if (t === 'gol' || t === 'amarilla' || t === 'roja' || t === 'cambio' || t === 'nota') return v.eventos[i];
    }
    return null;
  }

  function pintar() {
    var v = vista();
    var p = v.p;
    var nombre = disc.periodoNombre;
    $('arb-goles').textContent = p.golesLocal + ' – ' + p.golesVisita;
    $('arb-reloj').textContent = p.estado === 'programado' ? '00:00' : L.reloj(p, v.ahora, 'reloj');

    var relojBoton = $('arb-reloj-boton');
    var relojTexto = $('arb-reloj-texto');
    relojBoton.className = 'arb-reloj-boton';
    if (p.estado === 'programado') { relojTexto.textContent = 'Toca para iniciar el partido'; relojBoton.classList.add('detenido'); }
    else if (p.estado === 'en_vivo' && p.relojInicio) relojTexto.textContent = p.periodo + '.º ' + nombre + ' · toca para pausar';
    else if (p.estado === 'en_vivo') { relojTexto.textContent = 'Pausado · toca para seguir'; relojBoton.classList.add('detenido'); }
    else if (p.estado === 'entretiempo') { relojTexto.textContent = 'Descanso · toca para iniciar el ' + (p.periodo + 1) + '.º ' + nombre; relojBoton.classList.add('detenido'); }
    else { relojTexto.textContent = 'Partido terminado'; relojBoton.classList.add('terminado'); }

    var periodo = $('arb-periodo-boton');
    var ultimoPeriodo = p.periodo >= (p.torneo.periodos || 2);
    periodo.hidden = false;
    if (p.estado === 'en_vivo') {
      periodo.textContent = ultimoPeriodo ? 'Finalizar' : 'Fin del ' + p.periodo + '.º ' + nombre;
      periodo.dataset.accion = ultimoPeriodo ? 'finalizar' : 'fin_periodo';
    } else if (p.estado === 'entretiempo') {
      periodo.textContent = 'Finalizar'; periodo.dataset.accion = 'finalizar';
    } else if (p.estado === 'finalizado' && esEditor) {
      periodo.textContent = 'Reabrir'; periodo.dataset.accion = 'reabrir';
    } else { periodo.hidden = true; }

    var activo = p.estado === 'en_vivo' || p.estado === 'entretiempo';
    document.querySelectorAll('.arb-equipos button').forEach(function (b) { b.disabled = !activo; });
    if ($('arb-cambio')) $('arb-cambio').disabled = !activo;

    var deshacible = ultimoDeshacible(v);
    var botonDeshacer = $('arb-deshacer');
    botonDeshacer.disabled = !activo || !deshacible;
    botonDeshacer.textContent = deshacible ? 'Deshacer ' + deshacible.tipo : 'Deshacer';

    var ultimo = v.eventos[0];
    $('arb-ultimo').textContent = ultimo
      ? 'Último: ' + (ultimo.minuto != null ? ultimo.minuto + "' · " : '') + L.describir(ultimo, p.torneo.disciplina).titulo + (ultimo.equipo && ultimo.tipo !== 'gol' ? ' · ' + ultimo.equipo : ultimo.tipo === 'gol' && !ultimo.jugador ? ' · ' + ultimo.equipo : '')
      : 'Sin registros todavía.';

    pintarPendiente();
  }

  // ---------- Aviso "¿quién fue?" ----------
  function sugeridos(lado) {
    var lista = [];
    var vistos = {};
    // Primero quienes ya anotaron en este partido por ese equipo, luego los convocados.
    vista().eventos.forEach(function (ev) {
      if (ev.tipo === 'gol' && ev.jugador && ladoDe(ev.equipoId) === lado && ev.detalle !== 'autogol' && !vistos[ev.jugador]) {
        var j = nominas[lado].convocados.find(function (x) { return x.nombre === ev.jugador; });
        vistos[ev.jugador] = true;
        if (j) lista.push(j);
      }
    });
    nominas[lado].convocados.forEach(function (j) { if (!vistos[j.nombre]) { vistos[j.nombre] = true; lista.push(j); } });
    return lista.slice(0, 5);
  }

  function pintarPendiente() {
    var caja = $('arb-pendiente');
    if (!pendiente) { caja.hidden = true; return; }
    caja.hidden = false;
    var etiquetas = { gol: disc.marcador === 'goles' ? 'Gol' : '+' + pendiente.valor, amarilla: 'Amarilla', roja: 'Roja' };
    $('arb-pendiente-texto').textContent = etiquetas[pendiente.tipo] + ' · ' + nombreLado(pendiente.lado) + ' · ¿quién fue?';
    var cont = $('arb-sugeridos');
    cont.textContent = '';
    var nomina = nominas[pendiente.lado];
    sugeridos(pendiente.lado).forEach(function (j) {
      var b = L.crear('button', '', (j.dorsal != null ? j.dorsal + ' · ' : '') + j.nombre);
      b.type = 'button';
      b.addEventListener('click', function () { asignar({ jugador: j.id, nombre: j.nombre }); });
      cont.appendChild(b);
    });
    var hayNomina = nomina.curso.length || nomina.convocados.length;
    var buscar = L.crear('button', 'buscar', hayNomina ? 'Buscar en el curso' : 'Sin nómina');
    buscar.type = 'button';
    buscar.disabled = !hayNomina && !(pendiente.tipo === 'gol' && disc.marcador === 'goles');
    buscar.addEventListener('click', function () {
      var extras = [];
      if (pendiente.tipo === 'gol' && disc.marcador === 'goles') {
        extras.push({ texto: 'Fue autogol del rival', accion: function () {
          var rival = pendiente.lado === 'local' ? 'visita' : 'local';
          elegir('¿Quién hizo el autogol?', nominas[rival], [{ texto: 'Sin identificar', accion: function () { asignar({ nombre: null }, true); } }], function (j) { asignar(j, true); }, true);
        } });
      }
      elegir('¿Quién fue?', nomina, extras, function (j) { asignar(j); }, true);
    });
    cont.appendChild(buscar);
  }

  function asignar(persona, autogol) {
    if (!pendiente) return;
    var p = pendiente;
    pendiente = null;
    if (autogol) {
      // El gol sin dueño se quita y se registra de nuevo como autogol.
      quitarEvento(p.clienteId);
      var nuevo = { accion: 'evento', tipo: 'gol', equipo: p.equipo, valor: p.valor, minuto: p.minuto, detalle: 'autogol' };
      if (persona.alumno) nuevo.alumno = persona.alumno;
      else if (persona.jugador) nuevo.jugador = persona.jugador;
      if (persona.nombre) nuevo.nombreJugador = persona.nombre;
      encolar(nuevo);
      return;
    }
    var a = { accion: 'asignar', objetivo: p.clienteId, nombreJugador: persona.nombre };
    if (persona.alumno) a.alumno = persona.alumno; else a.jugador = persona.jugador;
    encolar(a);
  }

  // Si el registro aún no se envió, se quita de la cola; si ya se guardó, se anula.
  function quitarEvento(clienteId) {
    var i = cola.findIndex(function (a) { return a.clienteId === clienteId; });
    if (i > 0 || (i === 0 && !enviando)) { cola.splice(i, 1); guardarCola(); return; }
    var ev = estado.eventos.find(function (x) { return x.clienteId === clienteId; });
    if (ev) encolar({ accion: 'anular', evento: ev.id });
    else if (i === 0) { setTimeout(function () { quitarEvento(clienteId); }, 800); }
  }

  $('arb-pendiente-cerrar').addEventListener('click', function () { pendiente = null; pintar(); });

  // ---------- Hojas ----------
  function abrirHoja() { if (!hoja.open) { if (hoja.showModal) hoja.showModal(); else hoja.setAttribute('open', ''); } }

  function elegir(titulo, nomina, extras, alElegir, todoElCurso) {
    $('hoja-titulo').textContent = titulo;
    var cont = $('hoja-lista');
    cont.textContent = '';
    var lista = todoElCurso || !nomina.convocados.length ? nomina.convocados.concat(nomina.curso) : nomina.convocados;
    if (lista.length > 8) {
      var buscar = L.crear('input', 'hoja-buscar');
      buscar.type = 'search';
      buscar.placeholder = 'Buscar por nombre o apellido';
      buscar.setAttribute('aria-label', 'Buscar jugador');
      buscar.addEventListener('input', function () {
        var q = buscar.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
        cont.querySelectorAll('button[data-buscar]').forEach(function (b) { b.hidden = Boolean(q) && b.dataset.buscar.indexOf(q) < 0; });
      });
      cont.appendChild(buscar);
    }
    lista.forEach(function (p) {
      var b = L.crear('button');
      b.type = 'button';
      b.appendChild(L.crear('b', '', p.dorsal !== null && p.dorsal !== undefined ? String(p.dorsal) : '·'));
      b.appendChild(document.createTextNode(p.nombre));
      b.dataset.buscar = p.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      b.addEventListener('click', function () {
        hoja.close();
        alElegir(p.alumno ? { alumno: p.alumno, nombre: p.nombre } : { jugador: p.id, nombre: p.nombre });
      });
      cont.appendChild(b);
    });
    if (!lista.length) cont.appendChild(L.crear('p', 'nota-panel', 'Este equipo no tiene nómina.'));
    (extras || []).forEach(function (x) {
      var b = L.crear('button', 'otro', x.texto);
      b.type = 'button';
      b.addEventListener('click', function () { hoja.close(); x.accion(); });
      cont.appendChild(b);
    });
    abrirHoja();
  }

  function opciones(titulo, lista) {
    $('hoja-titulo').textContent = titulo;
    var cont = $('hoja-lista');
    cont.textContent = '';
    lista.forEach(function (x) {
      var b = L.crear('button', 'otro', x.texto);
      b.type = 'button';
      b.addEventListener('click', function () { hoja.close(); x.accion(); });
      cont.appendChild(b);
    });
    abrirHoja();
  }

  function minutoAhora() {
    var v = vista();
    var seg = (v.p.relojBase || 0) + (v.p.relojInicio ? Math.max(0, Math.floor((v.ahora - v.p.relojInicio) / 1000)) : 0);
    return Math.floor(seg / 60) + 1;
  }

  // ---------- Botones grandes: se registra al primer toque ----------
  document.querySelectorAll('.arb-equipos button[data-tipo]').forEach(function (b) {
    b.addEventListener('click', function () {
      var lado = b.dataset.lado;
      var equipo = lado === 'local' ? estado.partido.local.id : estado.partido.visita.id;
      var tipo = b.dataset.tipo;
      var valor = Number(b.dataset.valor || 1);
      var a = { accion: 'evento', tipo: tipo, equipo: equipo, valor: valor, minuto: minutoAhora(), clienteId: idCliente() };
      pendiente = b.dataset.sinJugador ? null : { clienteId: a.clienteId, tipo: tipo, lado: lado, valor: valor, equipo: equipo, minuto: a.minuto };
      if (navigator.vibrate) navigator.vibrate(tipo === 'gol' ? [40, 30, 40] : 30);
      encolar(a);
      var goles = $('arb-goles');
      if (tipo === 'gol') { goles.classList.remove('salta'); void goles.offsetWidth; goles.classList.add('salta'); }
    });
  });

  if ($('arb-cambio')) {
    $('arb-cambio').addEventListener('click', function () {
      opciones('Cambio: ¿de qué equipo?', ['local', 'visita'].map(function (lado) {
        return { texto: nombreLado(lado), accion: function () {
          var base = { accion: 'evento', tipo: 'cambio', equipo: lado === 'local' ? estado.partido.local.id : estado.partido.visita.id, minuto: minutoAhora() };
          var salir = function (entra) {
            var conEntra = Object.assign({}, base);
            if (entra) { if (entra.alumno) conEntra.alumno = entra.alumno; else conEntra.jugador = entra.jugador; conEntra.nombreJugador = entra.nombre; }
            elegir('¿Quién sale?', nominas[lado], [{ texto: 'Omitir', accion: function () { encolar(conEntra); } }], function (s) {
              var final = Object.assign({}, conEntra, { nombreJugador2: s.nombre });
              if (s.alumno) final.alumno2 = s.alumno; else final.jugador2 = s.jugador;
              encolar(final);
            });
          };
          elegir('¿Quién entra?', nominas[lado], [{ texto: 'Omitir', accion: function () { salir(null); } }], salir);
        } };
      }));
    });
  }

  // Reloj: un toque para iniciar, pausar o seguir.
  $('arb-reloj-boton').addEventListener('click', function () {
    var p = vista().p;
    if (p.estado === 'programado' || p.estado === 'entretiempo') encolar({ accion: 'iniciar' });
    else if (p.estado === 'en_vivo') encolar({ accion: p.relojInicio ? 'pausar' : 'reanudar' });
  });

  $('arb-periodo-boton').addEventListener('click', function () {
    var accion = this.dataset.accion;
    if (accion === 'finalizar') finalizar();
    else if (accion === 'reabrir') { if (confirm('¿Reabrir el partido para corregir registros?')) encolar({ accion: 'reabrir' }); }
    else encolar({ accion: accion });
  });

  function finalizar() {
    var p = vista().p;
    var empate = p.golesLocal === p.golesVisita;
    var debeHaberGanador = (p.faseCodigo !== 'grupos' && p.faseCodigo !== 'amistoso') || !p.torneo.empates;
    if (empate && debeHaberGanador) {
      opciones('Empate: ¿quién ganó (penales)?', ['local', 'visita'].map(function (lado) {
        return { texto: nombreLado(lado), accion: function () { encolar({ accion: 'finalizar', ganador: lado }); } };
      }));
      return;
    }
    if (confirm('¿Finalizar el partido con ' + p.local.nombre + ' ' + p.golesLocal + ' – ' + p.golesVisita + ' ' + p.visita.nombre + '?')) encolar({ accion: 'finalizar' });
  }

  $('arb-mas').addEventListener('click', function () {
    var p = vista().p;
    var lista = [];
    if (p.estado === 'en_vivo' || p.estado === 'entretiempo') {
      lista.push({ texto: 'Ajustar reloj', accion: ajustarReloj });
      lista.push({ texto: 'Finalizar partido', accion: finalizar });
    }
    if (p.estado === 'finalizado' && esEditor) lista.push({ texto: 'Reabrir partido', accion: function () { encolar({ accion: 'reabrir' }); } });
    lista.push({ texto: 'Ver registro completo', accion: verRegistro });
    lista.push({ texto: 'Ver la página pública', accion: function () { window.open('/partido/' + id + '/', '_blank'); } });
    opciones('Más acciones', lista);
  });

  function verRegistro() {
    var v = vista();
    $('hoja-titulo').textContent = 'Registro del partido';
    var cont = $('hoja-lista');
    cont.textContent = '';
    var ol = L.crear('ol', 'arb-eventos');
    v.eventos.forEach(function (ev) {
      var li = L.fila(ev, v.p.torneo.disciplina);
      if (ev.pendiente) li.classList.add('pendiente');
      ol.appendChild(li);
    });
    if (!v.eventos.length) ol.appendChild(L.crear('li', 'r-sistema', 'Sin registros.'));
    cont.appendChild(ol);
    abrirHoja();
  }

  function ajustarReloj() {
    var v = vista();
    var texto = prompt('Escribe el tiempo del reloj (minutos:segundos)', L.reloj(v.p, v.ahora, 'reloj'));
    if (!texto) return;
    var m = texto.trim().match(/^(\d{1,3})(?::(\d{1,2}))?$/);
    if (!m) { alert('Usa el formato 25:00'); return; }
    encolar({ accion: 'ajustar_reloj', segundos: Number(m[1]) * 60 + Number(m[2] || 0) });
  }

  $('arb-deshacer').addEventListener('click', function () {
    var ev = ultimoDeshacible(vista());
    if (!ev) return;
    if (pendiente && ev.clienteId === pendiente.clienteId) pendiente = null;
    if (ev.pendiente) { quitarEvento(ev.clienteId); pintar(); return; }
    encolar({ accion: 'anular', evento: ev.id });
  });

  // ---------- Cola y envío ----------
  function encolar(accion) {
    accion.t = Date.now() + desfase;
    cola.push(accion);
    guardarCola();
    pintar();
    enviar();
  }

  function estadoConexion(texto, mal) {
    var c = $('arb-conexion');
    c.textContent = texto;
    c.className = 'arb-conexion' + (mal ? ' mal' : '');
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
    if (a.accion === 'asignar') { cuerpo.clienteId = a.objetivo; delete cuerpo.objetivo; }
    estadoConexion('Guardando…');
    fetch('/api/arbitro/' + id, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), credentials: 'same-origin',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, datos: d }; });
    }).then(function (res) {
      enviando = false;
      if (res.ok) {
        cola.shift(); guardarCola();
        estado = res.datos; desfase = res.datos.ahora - Date.now();
        pintar(); enviar();
      } else if (res.status === 401) {
        estadoConexion('Tu sesión terminó. Abre el panel otra vez; lo pendiente se enviará después.', true);
      } else {
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

  // Cambios hechos desde otro celular.
  setInterval(function () {
    if (cola.length || enviando || document.hidden) return;
    fetch('/api/partido/' + id, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && !cola.length) { estado = d; desfase = d.ahora - Date.now(); pintar(); }
    }).catch(function () {});
  }, 10000);

  setInterval(function () {
    var v = vista();
    if (v.p.estado !== 'programado') $('arb-reloj').textContent = L.reloj(v.p, v.ahora, 'reloj');
  }, 500);
  window.addEventListener('online', enviar);
  window.addEventListener('beforeunload', function (e) { if (cola.length) { e.preventDefault(); e.returnValue = ''; } });

  pintar();
  enviar();
})();
