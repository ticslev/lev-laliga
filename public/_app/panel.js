// La Liga Lev — ayudas del panel: confirmaciones y equipos según el torneo elegido.
(function () {
  'use strict';

  // Pide confirmación antes de borrar.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    var boton = e.submitter;
    var mensaje = (boton && boton.dataset.confirmar) || form.dataset.confirmar;
    if (mensaje && !confirm(mensaje)) e.preventDefault();
  });

  // Al cambiar el torneo de un partido, se actualizan las listas de equipos.
  document.querySelectorAll('select[name="torneo"][data-equipos]').forEach(function (sel) {
    var equipos = JSON.parse(sel.dataset.equipos || '{}');
    var form = sel.form;
    sel.addEventListener('change', function () {
      var lista = equipos[sel.value] || [];
      form.querySelectorAll('select[data-lista-equipos]').forEach(function (s) {
        s.textContent = '';
        var vacio = document.createElement('option');
        vacio.value = '';
        vacio.textContent = 'Por definir';
        s.appendChild(vacio);
        lista.forEach(function (q) {
          var o = document.createElement('option');
          o.value = q.id;
          o.textContent = q.nombre;
          s.appendChild(o);
        });
      });
    });
  });

  // Quita el aviso de "guardado" de la dirección para que no reaparezca al recargar.
  if (/[?&](ok|error)=/.test(location.search) && history.replaceState) {
    var url = new URL(location.href);
    url.searchParams.delete('ok');
    url.searchParams.delete('error');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
})();
