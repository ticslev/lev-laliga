// La Liga Lev — importar desde Excel.
// Lee los .xlsx en el navegador (sin subir el archivo a ningún lado), muestra una vista previa
// y envía al servidor solo lo necesario: partidos y, de los alumnos, nivel, paralelo y nombre (sin correos).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var datos = { campeonato: null, alumnos: null };

  // ---------- Lector mínimo de ZIP + XLSX ----------
  function u16(v, o) { return v.getUint16(o, true); }
  function u32(v, o) { return v.getUint32(o, true); }

  function leerZip(buffer) {
    var v = new DataView(buffer);
    var fin = -1;
    for (var i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 70000); i--) {
      if (u32(v, i) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
    var total = u16(v, fin + 10);
    var pos = u32(v, fin + 16);
    var archivos = {};
    var dec = new TextDecoder();
    for (var n = 0; n < total; n++) {
      if (u32(v, pos) !== 0x02014b50) break;
      var metodo = u16(v, pos + 10);
      var comprimido = u32(v, pos + 20);
      var largoNombre = u16(v, pos + 28);
      var extra = u16(v, pos + 30);
      var comentario = u16(v, pos + 32);
      var local = u32(v, pos + 42);
      var nombre = dec.decode(new Uint8Array(buffer, pos + 46, largoNombre));
      var inicio = local + 30 + u16(v, local + 26) + u16(v, local + 28);
      archivos[nombre] = { metodo: metodo, datos: new Uint8Array(buffer, inicio, comprimido) };
      pos += 46 + largoNombre + extra + comentario;
    }
    return archivos;
  }

  function texto(archivos, nombre) {
    var a = archivos[nombre];
    if (!a) return Promise.resolve(null);
    if (a.metodo === 0) return Promise.resolve(new TextDecoder().decode(a.datos));
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('Este navegador es muy antiguo para leer Excel. Usa Chrome, Edge o Firefox actualizados.'));
    var flujo = new Blob([a.datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(flujo).text();
  }

  function xml(t) { return new DOMParser().parseFromString(t, 'application/xml'); }
  function etiquetas(nodo, nombre) { return Array.prototype.slice.call(nodo.getElementsByTagNameNS('*', nombre)); }

  function columna(ref) {
    var letras = ref.replace(/[0-9]/g, '');
    var n = 0;
    for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  }

  // Devuelve { nombreHoja: [[celdas...], ...] }
  function leerExcel(buffer) {
    var archivos = leerZip(buffer);
    return Promise.all([
      texto(archivos, 'xl/workbook.xml'),
      texto(archivos, 'xl/_rels/workbook.xml.rels'),
      texto(archivos, 'xl/sharedStrings.xml'),
    ]).then(function (r) {
      if (!r[0]) throw new Error('El archivo no es un Excel (.xlsx) válido.');
      var compartidos = r[2] ? etiquetas(xml(r[2]), 'si').map(function (si) {
        return etiquetas(si, 't').map(function (t) { return t.textContent; }).join('');
      }) : [];
      var rutas = {};
      etiquetas(xml(r[1]), 'Relationship').forEach(function (rel) {
        var destino = rel.getAttribute('Target').replace(/^\/?xl\//, '');
        rutas[rel.getAttribute('Id')] = 'xl/' + destino.replace(/^\//, '');
      });
      var hojas = etiquetas(xml(r[0]), 'sheet').map(function (h) {
        var id = h.getAttribute('r:id') || h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        return { nombre: h.getAttribute('name'), ruta: rutas[id] };
      });
      return Promise.all(hojas.map(function (h) { return texto(archivos, h.ruta); })).then(function (contenidos) {
        var libro = {};
        hojas.forEach(function (h, i) {
          if (!contenidos[i]) return;
          var filas = [];
          etiquetas(xml(contenidos[i]), 'row').forEach(function (fila) {
            var celdas = [];
            etiquetas(fila, 'c').forEach(function (c) {
              var tipo = c.getAttribute('t');
              var v = etiquetas(c, 'v')[0];
              var valor = null;
              if (tipo === 's' && v) valor = compartidos[Number(v.textContent)];
              else if (tipo === 'inlineStr') valor = etiquetas(c, 't').map(function (t) { return t.textContent; }).join('');
              else if (v) valor = tipo === 'str' || tipo === 'e' ? v.textContent : (isNaN(Number(v.textContent)) ? v.textContent : Number(v.textContent));
              celdas[columna(c.getAttribute('r') || 'A1')] = valor;
            });
            filas.push(celdas);
          });
          libro[h.nombre] = filas;
        });
        return libro;
      });
    });
  }

  // ---------- Interpretar las hojas ----------
  function normal(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }

  function buscarCabecera(filas, obligatorias) {
    for (var i = 0; i < Math.min(filas.length, 30); i++) {
      var f = (filas[i] || []).map(normal);
      if (obligatorias.every(function (o) { return f.some(function (c) { return c.indexOf(o) === 0; }); })) return i;
    }
    return -1;
  }

  function indice(cab, opciones) {
    for (var i = 0; i < cab.length; i++) {
      var c = normal(cab[i]);
      for (var j = 0; j < opciones.length; j++) if (c === opciones[j] || c.indexOf(opciones[j]) === 0) return i;
    }
    return -1;
  }

  function leerCalendario(libro) {
    var nombre = Object.keys(libro).find(function (n) { return /calendario|partidos|fixture/i.test(n); });
    if (!nombre) throw new Error('No encontré la hoja “Calendario” en el archivo del campeonato.');
    var filas = libro[nombre];
    var h = buscarCabecera(filas, ['DEPORTE', 'EQUIPO 1', 'EQUIPO 2']);
    if (h < 0) throw new Error('En la hoja Calendario no encontré las columnas Deporte, Equipo 1 y Equipo 2.');
    var cab = filas[h];
    var col = {
      n: indice(cab, ['N°', 'NO', 'N']), dia: indice(cab, ['DIA DE JUEGO', 'DIA']), horario: indice(cab, ['HORARIO', 'HORA']),
      cancha: indice(cab, ['CANCHA', 'LUGAR']), deporte: indice(cab, ['DEPORTE', 'DISCIPLINA']), rama: indice(cab, ['RAMA', 'GENERO']),
      nivel: indice(cab, ['NIVEL']), fase: indice(cab, ['FASE', 'RONDA']), eq1: indice(cab, ['EQUIPO 1']), eq2: indice(cab, ['EQUIPO 2']),
    };
    var lista = [];
    for (var i = h + 1; i < filas.length; i++) {
      var f = filas[i] || [];
      var e1 = f[col.eq1], e2 = f[col.eq2];
      if (!e1 || !e2 || !f[col.deporte]) continue;
      lista.push({
        n: f[col.n], dia: col.dia >= 0 ? f[col.dia] : null, horario: col.horario >= 0 ? f[col.horario] : '',
        cancha: col.cancha >= 0 ? f[col.cancha] : '', deporte: f[col.deporte], rama: col.rama >= 0 ? f[col.rama] : '',
        nivel: f[col.nivel], fase: col.fase >= 0 ? f[col.fase] : '', eq1: e1, eq2: e2,
      });
    }
    if (!lista.length) throw new Error('La hoja Calendario no tiene partidos.');
    return lista;
  }

  function leerAlumnos(libro) {
    for (var nombre in libro) {
      var filas = libro[nombre];
      var h = buscarCabecera(filas, ['NIVEL', 'PARALELO']);
      if (h < 0) continue;
      var cab = filas[h];
      var cNivel = indice(cab, ['NIVEL', 'GRADO', 'CURSO']);
      var cPar = indice(cab, ['PARALELO']);
      var cNom = indice(cab, ['ESTUDIANTE', 'NOMBRE', 'ALUMNO', 'APELLIDOS']);
      if (cNom < 0) continue;
      var lista = [];
      for (var i = h + 1; i < filas.length; i++) {
        var f = filas[i] || [];
        if (f[cNivel] && f[cPar] && f[cNom]) lista.push({ nivel: String(f[cNivel]), paralelo: String(f[cPar]), nombre: String(f[cNom]) });
      }
      if (lista.length) return lista;
    }
    throw new Error('En la lista de alumnos no encontré las columnas Nivel, Paralelo y Estudiante.');
  }

  // ---------- Vista previa ----------
  function contar(lista, clave) {
    var m = {};
    lista.forEach(function (x) { var k = clave(x); m[k] = (m[k] || 0) + 1; });
    return m;
  }

  function fila(tabla, celdas, encabezado) {
    var tr = document.createElement('tr');
    celdas.forEach(function (c) {
      var td = document.createElement(encabezado ? 'th' : 'td');
      td.textContent = c;
      tr.appendChild(td);
    });
    tabla.appendChild(tr);
  }

  function vistaPrevia() {
    var caja = $('vista-previa');
    caja.textContent = '';
    if (datos.campeonato) {
      var p = datos.campeonato;
      var h = document.createElement('h3');
      h.textContent = 'Campeonato: ' + p.length + ' partidos';
      caja.appendChild(h);
      var tabla = document.createElement('table');
      tabla.className = 'tabla-previa';
      fila(tabla, ['Competencia', 'Partidos', 'Niveles', 'Días de juego'], true);
      var comp = {};
      p.forEach(function (x) {
        var k = x.deporte + ' ' + String(x.rama || '').toLowerCase();
        comp[k] = comp[k] || { n: 0, niveles: {}, dias: {} };
        comp[k].n++;
        comp[k].niveles[String(x.nivel).replace(/\s*[–—-]\s*Grupo.*/i, '')] = 1;
        if (x.dia) comp[k].dias[x.dia] = 1;
      });
      Object.keys(comp).forEach(function (k) {
        var d = Object.keys(comp[k].dias).map(Number);
        fila(tabla, [k, comp[k].n, Object.keys(comp[k].niveles).length, d.length ? Math.min.apply(null, d) + ' a ' + Math.max.apply(null, d) : '—']);
      });
      caja.appendChild(tabla);
      var profes = {};
      p.forEach(function (x) { [x.eq1, x.eq2].forEach(function (e) { if (/^profe/i.test(e)) profes[e] = 1; }); });
      if (Object.keys(profes).length) {
        var np = document.createElement('p');
        np.className = 'nota-panel';
        np.textContent = 'Equipos de exhibición (no cuentan en la tabla): ' + Object.keys(profes).join(', ') + '.';
        caja.appendChild(np);
      }
    }
    if (datos.alumnos) {
      var a = datos.alumnos;
      var h2 = document.createElement('h3');
      var cursos = contar(a, function (x) { return x.nivel + ' · ' + x.paralelo; });
      h2.textContent = 'Alumnos: ' + a.length + ' en ' + Object.keys(cursos).length + ' cursos';
      caja.appendChild(h2);
      var nota = document.createElement('p');
      nota.className = 'nota-panel';
      nota.textContent = 'Se guardan nivel, paralelo y nombre. En el sitio público se muestra solo el nombre y la inicial del apellido (por ejemplo, “Victoria A.”). Los correos no se envían.';
      caja.appendChild(nota);
      if (datos.campeonato) {
        var paralelos = {};
        a.forEach(function (x) { paralelos[normal(x.paralelo)] = 1; });
        var sinCurso = {};
        datos.campeonato.forEach(function (x) {
          [x.eq1, x.eq2].forEach(function (e) {
            if (!/^profe/i.test(e) && !/^\d+\s*[º°]|^ganador/i.test(e) && !paralelos[normal(e)]) sinCurso[e] = 1;
          });
        });
        var lista = Object.keys(sinCurso);
        var aviso = document.createElement('p');
        aviso.className = lista.length ? 'aviso' : 'aviso aviso-ok';
        aviso.textContent = lista.length
          ? 'Estos equipos no coinciden con ningún paralelo de la lista de alumnos: ' + lista.join(', ') + '. Se importan igual, pero sin nómina.'
          : 'Todos los equipos coinciden con un paralelo de la lista de alumnos.';
        caja.appendChild(aviso);
      }
    }
    $('importar').disabled = !(datos.campeonato || datos.alumnos);
  }

  function cargar(input, tipo) {
    var archivo = input.files[0];
    var estado = $('estado-' + tipo);
    if (!archivo) return;
    estado.textContent = 'Leyendo ' + archivo.name + '…';
    estado.className = 'nota-panel';
    archivo.arrayBuffer().then(leerExcel).then(function (libro) {
      datos[tipo] = tipo === 'campeonato' ? leerCalendario(libro) : leerAlumnos(libro);
      estado.textContent = '✓ ' + archivo.name;
      vistaPrevia();
    }).catch(function (e) {
      datos[tipo] = null;
      estado.textContent = e.message || 'No se pudo leer el archivo.';
      estado.className = 'aviso aviso-error';
      vistaPrevia();
    });
  }

  $('archivo-campeonato').addEventListener('change', function () { cargar(this, 'campeonato'); });
  $('archivo-alumnos').addEventListener('change', function () { cargar(this, 'alumnos'); });

  $('importar').addEventListener('click', function () {
    var boton = this;
    var reemplazar = $('reemplazar') && $('reemplazar').checked;
    if (datos.campeonato && $('reemplazar') && !reemplazar) {
      alert('Ya hay un campeonato cargado. Marca “Reemplazar el campeonato actual” para continuar.');
      return;
    }
    if (reemplazar && !confirm('Se borrarán los torneos, equipos, partidos y registros actuales y se cargará el Excel. ¿Continuar?')) return;
    boton.disabled = true;
    boton.textContent = 'Importando…';
    fetch('/panel/importar/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campeonato: datos.campeonato, alumnos: datos.alumnos, reemplazar: reemplazar, temporada: $('temporada').value }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
      var caja = $('resultado');
      caja.hidden = false;
      if (!res.ok) {
        caja.className = 'aviso aviso-error';
        caja.textContent = res.d.error || 'No se pudo importar.';
        boton.disabled = false;
        boton.textContent = 'Importar';
        return;
      }
      caja.className = 'aviso aviso-ok';
      caja.textContent = res.d.mensaje;
      boton.textContent = 'Importado ✓';
      var ir = document.createElement('a');
      ir.href = '/panel/dias/';
      ir.className = 'boton boton-morado';
      ir.textContent = 'Siguiente: poner las fechas de los días de juego';
      caja.appendChild(document.createElement('br'));
      caja.appendChild(ir);
    }).catch(function () {
      boton.disabled = false;
      boton.textContent = 'Importar';
      alert('Sin conexión. Intenta otra vez.');
    });
  });
})();
