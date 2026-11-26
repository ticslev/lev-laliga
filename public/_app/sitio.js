// La Liga Lev — relojes en marcha y marcadores que se actualizan solos
// (portada, fixture, en vivo y modo TV).
(function () {
  'use strict';
  var desfase = 0; // diferencia entre el reloj del servidor y el del dispositivo

  function dosDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function pintarRelojes() {
    var ahora = Date.now() + desfase;
    document.querySelectorAll('[data-reloj]').forEach(function (el) {
      var base = Number(el.dataset.base || 0);
      var inicio = Number(el.dataset.inicio || 0);
      if (el.dataset.descanso === '1') { el.textContent = 'Descanso'; return; }
      var seg = base + (inicio ? Math.max(0, Math.floor((ahora - inicio) / 1000)) : 0);
      el.textContent = el.dataset.formato === 'reloj'
        ? dosDigitos(Math.floor(seg / 60)) + ':' + dosDigitos(seg % 60)
        : (Math.floor(seg / 60) + 1) + "'";
    });
    var hora = document.getElementById('tv-hora');
    if (hora) {
      var d = new Date();
      hora.textContent = dosDigitos(d.getHours()) + ':' + dosDigitos(d.getMinutes());
    }
  }

  function idsEnPagina() {
    var ids = {};
    document.querySelectorAll('[data-reloj]').forEach(function (el) { ids[el.dataset.reloj] = true; });
    return Object.keys(ids).sort().join(',');
  }

  function actualizar() {
    fetch('/api/vivo', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (datos) {
        if (!datos) return;
        desfase = datos.ahora - Date.now();
        var ids = datos.partidos.map(function (p) { return String(p.id); }).sort().join(',');
        // Empezó o terminó un partido: se recarga la página para mostrarlo.
        if (ids !== idsEnPagina()) { location.reload(); return; }
        datos.partidos.forEach(function (p) {
          document.querySelectorAll('[data-marcador="' + p.id + '"]').forEach(function (el) {
            var nuevo = p.golesLocal + ' – ' + p.golesVisita;
            if (el.textContent.replace(/\s+/g, ' ').trim() !== nuevo) {
              el.textContent = nuevo;
              el.classList.remove('salta');
              void el.offsetWidth;
              el.classList.add('salta');
            }
          });
          document.querySelectorAll('[data-reloj="' + p.id + '"]').forEach(function (el) {
            el.dataset.base = p.relojBase;
            el.dataset.inicio = p.relojInicio || '';
            el.dataset.descanso = p.estado === 'entretiempo' ? '1' : '0';
          });
        });
        pintarRelojes();
      })
      .catch(function () { /* sin conexión: se reintenta en la próxima vuelta */ });
  }

  pintarRelojes();
  setInterval(pintarRelojes, 1000);
  if (document.body.classList.contains('actualizar')) {
    var cada = document.body.classList.contains('modo-tv') ? 8000 : 15000;
    setInterval(function () { if (!document.hidden) actualizar(); }, cada);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) actualizar(); });
  }
})();
