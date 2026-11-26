// La Liga Lev — resultados del día en un toque (panel del editor, pensado para el celular).
(function () {
  'use strict';
  var lista = document.getElementById('rc-lista');
  if (!lista) return;
  var toast = document.getElementById('toast');
  var toastTexto = document.getElementById('toast-texto');
  var botonDeshacer = document.getElementById('toast-deshacer');
  var conteo = document.getElementById('conteo');
  var barra = document.getElementById('barra-avance');
  var vacio = document.getElementById('rc-vacio');
  var filtro = { tipo: 'pendientes', valor: null };
  var deshacer = null;
  var temporizador = null;

  function tarjetas() { return Array.prototype.slice.call(lista.querySelectorAll('.rc')); }

  function enviar(url, datos) {
    var cuerpo = new URLSearchParams(datos);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Rapido': '1' },
      body: cuerpo.toString(),
      credentials: 'same-origin',
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, mensaje: 'Tu sesión terminó. Vuelve a entrar.' }; }).then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d.mensaje || 'No se pudo guardar.');
        return d;
      });
    });
  }

  function textoResultado(rc) {
    var d = rc.dataset;
    if (d.estado !== 'finalizado') return '';
    if (d.ganador === 'empate') return d.local + ' y ' + d.visita + ' empataron' + (d.marcador === '1' ? ' · ' + d.gl + '–' + d.gv : '');
    return 'Ganó ' + (d.ganador === 'visita' ? d.visita : d.local) + (d.marcador === '1' ? ' · ' + d.gl + '–' + d.gv : '');
  }

  function foto(rc) {
    var d = rc.dataset;
    return { estado: d.estado, ganador: d.ganador, gl: d.gl, gv: d.gv, marcador: d.marcador };
  }

  function aplicar(rc, f) {
    rc.dataset.estado = f.estado;
    rc.dataset.ganador = f.ganador || '';
    rc.dataset.gl = f.gl;
    rc.dataset.gv = f.gv;
    rc.dataset.marcador = f.marcador;
    rc.classList.remove('editando');
    rc.querySelectorAll('.rc-botones button').forEach(function (b) {
      b.setAttribute('aria-pressed', f.estado === 'finalizado' && b.value === f.ganador ? 'true' : 'false');
    });
    var t = rc.querySelector('.rc-texto');
    if (t) t.textContent = textoResultado(rc);
    rc.classList.remove('salta');
    void rc.offsetWidth;
    rc.classList.add('salta');
    contar();
  }

  function contar() {
    var todas = tarjetas();
    var hechos = todas.filter(function (rc) { return rc.dataset.estado === 'finalizado'; }).length;
    var total = Number(conteo.dataset.total) || todas.length;
    conteo.textContent = hechos + '/' + total;
    barra.setAttribute('width', total ? Math.round((hechos / total) * 100) : 0);
  }

  function filtrar() {
    var visibles = 0;
    tarjetas().forEach(function (rc) {
      var ver = filtro.tipo === 'todos' ||
        (filtro.tipo === 'pendientes' && (rc.dataset.estado !== 'finalizado' || rc.classList.contains('reciente'))) ||
        (filtro.tipo === 'cancha' && rc.dataset.cancha === filtro.valor);
      rc.hidden = !ver;
      if (ver) visibles++;
    });
    vacio.hidden = !(filtro.tipo === 'pendientes' && visibles === 0 && tarjetas().length);
  }

  function avisar(texto, alDeshacer) {
    toastTexto.textContent = texto;
    deshacer = alDeshacer;
    botonDeshacer.hidden = !alDeshacer;
    toast.hidden = false;
    toast.classList.remove('toast-error');
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { toast.hidden = true; deshacer = null; }, 5000);
  }

  function fallo(rc, previo, e) {
    aplicar(rc, previo);
    avisar(e.message || 'No se pudo guardar.', null);
    toast.classList.add('toast-error');
  }

  // Restaura un resultado anterior (para "Deshacer").
  function restaurar(rc, previo) {
    var id = rc.dataset.id;
    var actual = foto(rc);
    aplicar(rc, previo);
    var envio = previo.estado !== 'finalizado'
      ? enviar(location.pathname, { accion: 'ganador', partido: id, valor: 'borrar' })
      : previo.marcador === '1'
        ? enviar('/panel/partidos/' + id + '/', { accion: 'resultado', goles_local: previo.gl, goles_visita: previo.gv, estado: 'finalizado', ganador: previo.gl === previo.gv ? previo.ganador : '' })
        : enviar(location.pathname, { accion: 'ganador', partido: id, valor: previo.ganador });
    envio.then(function () { avisar('Se deshizo el cambio', null); }).catch(function (e) { fallo(rc, actual, e); });
  }

  // Toque en un equipo (o Empate)
  lista.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form.classList.contains('rc-botones')) return;
    ev.preventDefault();
    var boton = ev.submitter;
    if (!boton) return;
    var rc = form.closest('.rc');
    var previo = foto(rc);
    var valor = boton.value;
    rc.classList.add('reciente');
    aplicar(rc, { estado: 'finalizado', ganador: valor, gl: previo.marcador === '1' ? previo.gl : '0', gv: previo.marcador === '1' ? previo.gv : '0', marcador: previo.marcador === '1' && previo.estado !== 'programado' ? '1' : '0' });
    if (navigator.vibrate) navigator.vibrate(25);
    enviar(location.pathname, { accion: 'ganador', partido: rc.dataset.id, valor: valor }).then(function () {
      avisar(valor === 'empate' ? 'Empate guardado' : 'Ganó ' + (valor === 'local' ? rc.dataset.local : rc.dataset.visita) + ' · guardado', function () { restaurar(rc, previo); });
    }).catch(function (e) { fallo(rc, previo, e); });
  });

  lista.addEventListener('click', function (ev) {
    var rc = ev.target.closest('.rc');
    if (!rc) return;
    if (ev.target.closest('.rc-cambiar')) rc.classList.add('editando');
    if (ev.target.closest('.rc-marcador')) abrirMarcador(rc);
  });

  botonDeshacer.addEventListener('click', function () {
    toast.hidden = true;
    if (deshacer) { var f = deshacer; deshacer = null; f(); }
  });

  document.querySelectorAll('[data-filtro]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-filtro]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      filtro = { tipo: b.dataset.filtro, valor: b.dataset.valor || null };
      tarjetas().forEach(function (rc) { rc.classList.remove('reciente'); });
      filtrar();
    });
  });

  // ---------- Hoja de marcador y penales ----------
  var hoja = document.getElementById('hoja-marcador');
  var hm = { rc: null, gl: 0, gv: 0, penal: null };
  var $ = function (id) { return document.getElementById(id); };

  function pintarHoja() {
    $('hm-gl').textContent = hm.gl;
    $('hm-gv').textContent = hm.gv;
    var d = hm.rc.dataset;
    var debeGanar = hm.gl === hm.gv && (d.empate !== '1');
    $('hm-penales').hidden = !debeGanar;
    $('hm-pl').setAttribute('aria-pressed', hm.penal === 'local' ? 'true' : 'false');
    $('hm-pv').setAttribute('aria-pressed', hm.penal === 'visita' ? 'true' : 'false');
    var listo = !debeGanar || hm.penal;
    $('hm-guardar').disabled = !listo;
    $('hm-guardar').textContent = listo ? 'Guardar ' + hm.gl + ' – ' + hm.gv : 'Elige quién ganó';
  }

  function abrirMarcador(rc) {
    var d = rc.dataset;
    hm = { rc: rc, gl: d.marcador === '1' ? Number(d.gl) : 0, gv: d.marcador === '1' ? Number(d.gv) : 0, penal: null };
    if (d.estado === 'finalizado' && d.gl === d.gv && (d.ganador === 'local' || d.ganador === 'visita')) hm.penal = d.ganador;
    $('hm-titulo').textContent = 'Marcador · ' + (d.fase === 'grupos' ? 'fase de grupos' : 'fase final');
    $('hm-local').textContent = d.local;
    $('hm-visita').textContent = d.visita;
    $('hm-pl').textContent = d.local;
    $('hm-pv').textContent = d.visita;
    pintarHoja();
    if (hoja.showModal) hoja.showModal(); else hoja.setAttribute('open', '');
  }

  hoja.addEventListener('click', function (ev) {
    var paso = ev.target.closest('[data-paso]');
    if (paso) {
      var k = paso.dataset.paso === 'l' ? 'gl' : 'gv';
      hm[k] = Math.max(0, Math.min(999, hm[k] + Number(paso.dataset.delta)));
      pintarHoja();
    }
    var penal = ev.target.closest('[data-penal]');
    if (penal) { hm.penal = penal.dataset.penal; pintarHoja(); }
  });

  $('hm-guardar').addEventListener('click', function () {
    var rc = hm.rc;
    var previo = foto(rc);
    var empate = hm.gl === hm.gv;
    var ganador = empate ? (rc.dataset.empate === '1' ? 'empate' : hm.penal) : hm.gl > hm.gv ? 'local' : 'visita';
    hoja.close();
    rc.classList.add('reciente');
    aplicar(rc, { estado: 'finalizado', ganador: ganador, gl: String(hm.gl), gv: String(hm.gv), marcador: '1' });
    enviar('/panel/partidos/' + rc.dataset.id + '/', {
      accion: 'resultado', goles_local: hm.gl, goles_visita: hm.gv, estado: 'finalizado', ganador: empate && ganador !== 'empate' ? ganador : '',
    }).then(function () {
      avisar('Marcador ' + hm.gl + '–' + hm.gv + ' guardado', function () { restaurar(rc, previo); });
    }).catch(function (e) { fallo(rc, previo, e); });
  });

  contar();
  filtrar();
})();
