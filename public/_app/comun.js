// La Liga Lev — "Mi curso" (guardado en el celular) y avisos de goles.
(function () {
  'use strict';
  var CLAVE = 'laliga-mi-curso';

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { return null; }
  }
  function guardar(c) {
    try { if (c) localStorage.setItem(CLAVE, JSON.stringify(c)); else localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
  }
  function crear(etiqueta, clase, texto) {
    var el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }
  function sigla(c) {
    return (String(c.nivel).match(/^\d+/) || [''])[0] + String(c.nombre).charAt(0).toUpperCase();
  }

  var miCurso = leer();
  var chip = document.querySelector('[data-mi-curso]');
  var hoja = document.getElementById('hoja-cursos');
  var cursos = null;

  function pintarChip() {
    if (!chip) return;
    chip.hidden = false;
    chip.querySelector('.mc-sigla').textContent = miCurso ? sigla(miCurso) : '+';
    chip.querySelector('.mc-texto').textContent = miCurso ? miCurso.nivel + ' ' + miCurso.nombre : 'Mi curso';
    chip.classList.toggle('mc-elegido', Boolean(miCurso));
  }

  function listaCursos(filtro) {
    var cont = document.getElementById('hc-lista');
    cont.textContent = '';
    var q = (filtro || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    var nivel = null;
    var hay = false;
    cursos.forEach(function (c) {
      var texto = (c.nivel + ' ' + c.nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (q && texto.indexOf(q) < 0) return;
      hay = true;
      if (c.nivel !== nivel) { nivel = c.nivel; cont.appendChild(crear('h3', 'hc-nivel', c.nivel)); }
      var b = crear('button', 'hc-curso' + (miCurso && miCurso.id === c.id ? ' hc-actual' : ''), c.nombre);
      b.type = 'button';
      b.addEventListener('click', function () {
        miCurso = { id: c.id, nivel: c.nivel, nombre: c.nombre };
        guardar(miCurso);
        moverAvisos();
        hoja.close();
        pintarChip();
        pintarSeccion();
      });
      cont.appendChild(b);
    });
    if (!hay) cont.appendChild(crear('p', 'nota', cursos.length ? 'Ningún curso coincide.' : 'Todavía no hay cursos cargados.'));
  }

  function abrir() {
    if (!hoja) return;
    if (hoja.showModal) hoja.showModal(); else hoja.setAttribute('open', '');
    var buscar = document.getElementById('hc-buscar');
    if (cursos) { listaCursos(''); return; }
    fetch('/api/cursos').then(function (r) { return r.json(); }).then(function (d) {
      cursos = d.cursos || [];
      listaCursos(buscar.value);
    }).catch(function () {
      document.getElementById('hc-lista').textContent = 'Sin conexión. Intenta otra vez.';
    });
  }

  if (chip) chip.addEventListener('click', abrir);
  if (hoja) {
    document.getElementById('hc-buscar').addEventListener('input', function () { if (cursos) listaCursos(this.value); });
    document.getElementById('hc-quitar').addEventListener('click', function () {
      miCurso = null; guardar(null); hoja.close(); pintarChip(); pintarSeccion();
    });
  }

  // Si ya recibía avisos, pasan al curso nuevo.
  function moverAvisos() {
    if (!localStorage.getItem('laliga-avisos') || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return;
      return fetch('/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ curso: miCurso.id, suscripcion: sub.toJSON() }) })
        .then(function () { localStorage.setItem('laliga-avisos', String(miCurso.id)); });
    }).catch(function () {});
  }

  // ---------- Sección "Tu curso" en la portada ----------
  var seccion = document.getElementById('mi-curso');

  function textoProximo(p) {
    if (!p) return 'Terminó';
    if (p.estado === 'en_vivo' || p.estado === 'entretiempo') return 'EN VIVO ' + (p.marcador || '');
    if (p.hoy) return 'Hoy · ' + (p.hora || '');
    if (p.fecha) {
      var d = new Date(p.fecha.slice(0, 10) + 'T12:00:00Z');
      return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getUTCDay()] + ' ' + d.getUTCDate() + (p.hora ? ' · ' + p.hora : '');
    }
    return p.dia ? 'Día de juego ' + p.dia + (p.hora ? ' · ' + p.hora : '') : 'Fecha por definir';
  }

  function pintarSeccion() {
    if (!seccion) return;
    seccion.textContent = '';
    if (!miCurso) {
      if (seccion.dataset.tieneCursos !== '1') { seccion.hidden = true; return; }
      seccion.hidden = false;
      var invita = crear('button', 'invita-curso');
      invita.type = 'button';
      invita.appendChild(crear('b', '', 'Elige tu curso'));
      invita.appendChild(crear('span', '', 'Verás a qué hora juega hoy y en qué puesto va en cada tabla.'));
      invita.addEventListener('click', abrir);
      seccion.appendChild(invita);
      return;
    }
    seccion.hidden = false;
    var caja = crear('div', 'panel-claro mc-caja');
    var cab = crear('div', 'seccion-cabeza');
    cab.appendChild(crear('h2', 'titulo-panel', 'TU CURSO · ' + (miCurso.nivel + ' ' + miCurso.nombre).toUpperCase()));
    var cambiar = crear('button', 'boton boton-claro boton-chico', 'Cambiar');
    cambiar.type = 'button';
    cambiar.addEventListener('click', abrir);
    cab.appendChild(cambiar);
    caja.appendChild(cab);
    var lista = crear('div', 'mc-lista');
    lista.appendChild(crear('p', 'nota', 'Cargando…'));
    caja.appendChild(lista);
    seccion.appendChild(caja);
    fetch('/api/mi-curso?curso=' + miCurso.id, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) { miCurso = null; guardar(null); pintarChip(); pintarSeccion(); return null; }
      return r.json();
    }).then(function (d) {
      if (!d) return;
      lista.textContent = '';
      if (!d.items.length) { lista.appendChild(crear('p', 'nota', 'Este curso no tiene equipos en el campeonato.')); return; }
      d.items.forEach(function (it) {
        var a = crear('a', 'mc-item');
        a.href = it.proximo ? '/partido/' + it.proximo.id + '/' : '/posiciones/?t=' + it.slug;
        var vivo = it.proximo && (it.proximo.estado === 'en_vivo' || it.proximo.estado === 'entretiempo');
        var cuando = crear('b', 'mc-cuando' + (vivo ? ' mc-vivo' : ''), textoProximo(it.proximo));
        var cuerpo = crear('span', 'mc-cuerpo');
        cuerpo.appendChild(crear('b', '', it.proximo ? 'vs ' + (it.proximo.rival || 'Por definir') : it.competencia));
        cuerpo.appendChild(crear('span', '', it.proximo ? it.competencia + (it.proximo.lugar ? ' · ' + it.proximo.lugar : '') : 'Sin partidos pendientes · ver tabla'));
        a.appendChild(cuando);
        a.appendChild(cuerpo);
        a.appendChild(crear('span', 'mc-puesto', it.puesto ? it.puesto + '.º' + (it.grupo ? ' ' + it.grupo : '') : '–'));
        lista.appendChild(a);
      });
      lista.appendChild(crear('p', 'nota', 'El número es su puesto en la tabla de cada competencia.'));
    }).catch(function () { lista.textContent = 'Sin conexión.'; });
  }

  pintarChip();
  pintarSeccion();

  // ---------- Avisos de goles (notificaciones) ----------
  var zona = document.querySelector('[data-avisos]');
  var soportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (zona && soportado) {
    var boton = document.getElementById('boton-avisos');
    var texto = boton.querySelector('span');
    zona.hidden = false;

    var estado = function (activo) {
      boton.classList.toggle('activo', activo);
      texto.textContent = activo ? 'Te avisaremos los goles de ' + (miCurso ? miCurso.nombre : 'tu curso') : 'Avisarme los goles de mi curso';
    };

    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      estado(Boolean(sub && localStorage.getItem('laliga-avisos') === String(miCurso && miCurso.id)));
    }).catch(function () { zona.hidden = true; });

    boton.addEventListener('click', function () {
      if (!miCurso) { abrir(); return; }
      if (boton.classList.contains('activo')) {
        navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
          if (!sub) return;
          fetch('/api/avisos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
          return sub.unsubscribe();
        }).then(function () { localStorage.removeItem('laliga-avisos'); estado(false); });
        return;
      }
      texto.textContent = 'Activando…';
      Notification.requestPermission().then(function (permiso) {
        if (permiso !== 'granted') throw new Error('permiso');
        return Promise.all([navigator.serviceWorker.ready, fetch('/api/avisos/clave').then(function (r) { return r.json(); })]);
      }).then(function (r) {
        var clave = r[1].clave.replace(/-/g, '+').replace(/_/g, '/');
        var bytes = Uint8Array.from(atob(clave + '==='.slice((clave.length + 3) % 4)), function (c) { return c.charCodeAt(0); });
        return r[0].pushManager.getSubscription().then(function (sub) {
          return sub || r[0].pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        });
      }).then(function (sub) {
        return fetch('/api/avisos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ curso: miCurso.id, suscripcion: sub.toJSON() }),
        });
      }).then(function (r) {
        if (!r.ok) throw new Error('servidor');
        localStorage.setItem('laliga-avisos', String(miCurso.id));
        estado(true);
      }).catch(function (e) {
        estado(false);
        texto.textContent = e && e.message === 'permiso'
          ? 'Permite las notificaciones en el navegador para recibir avisos'
          : 'No se pudo activar. En iPhone, primero agrega el sitio a la pantalla de inicio.';
      });
    });
  }
})();
