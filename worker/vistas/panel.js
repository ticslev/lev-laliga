// Panel de encargados: torneos, equipos, jugadores, partidos, usuarios e historial.
import { e, fechaCorta, COLORES } from '../util.js';
import { escudo, NOMBRE } from './base.js';
import { DISCIPLINAS, FASES, ESTADOS, disciplina } from '../datos.js';
import { ROLES } from '../auth.js';

function opciones(obj, actual) {
  return Object.entries(obj).map(([v, t]) => `<option value="${e(v)}"${String(v) === String(actual ?? '') ? ' selected' : ''}>${e(t)}</option>`).join('');
}

function campo(etiqueta, control, ayuda = '') {
  return `<label class="campo"><span>${e(etiqueta)}</span>${control}${ayuda ? `<small>${e(ayuda)}</small>` : ''}</label>`;
}

function texto(nombre, valor = '', extra = '') {
  return `<input name="${nombre}" value="${e(valor ?? '')}" ${extra}>`;
}

export function panelPagina({ titulo, actual = '', yo, cuerpo, aviso, errorTexto, scripts = [] }) {
  const enlaces = yo.editor
    ? [['inicio', '/panel/', 'Inicio'], ['torneos', '/panel/torneos/', 'Torneos y equipos'], ['partidos', '/panel/partidos/', 'Partidos'],
      ...(yo.admin ? [['usuarios', '/panel/usuarios/', 'Usuarios y roles']] : []), ['historial', '/panel/historial/', 'Historial']]
    : [['inicio', '/panel/', 'Mis partidos']];
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(titulo)} · Panel · ${NOMBRE}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/_app/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/_app/estilos.css">
<script src="/_app/panel.js" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('')}
</head>
<body class="panel">
<div class="panel-marco">
<aside class="panel-menu">
<a class="panel-logo" href="/panel/">LA LIGA LEV<small>Panel de encargados</small></a>
<nav aria-label="Panel">${enlaces.map(([id, href, t]) => `<a href="${href}"${id === actual ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
<a href="/" target="_blank" rel="noopener">Ver el sitio ↗</a></nav>
<div class="panel-yo">${yo.foto ? `<img src="${e(yo.foto)}" alt="" width="32" height="32" referrerpolicy="no-referrer">` : ''}<span>${e(yo.email)}<small>${e(ROLES[yo.rol])}</small></span><a href="/auth/salir">Salir</a></div>
</aside>
<main class="panel-contenido" id="contenido">
<h1 class="panel-titulo">${e(titulo)}</h1>
${aviso ? `<p class="aviso aviso-ok" role="status">${e(aviso)}</p>` : ''}
${errorTexto ? `<p class="aviso aviso-error" role="alert">${e(errorTexto)}</p>` : ''}
${cuerpo}
</main>
</div>
</body>
</html>`;
}

function chipEstado(p) {
  const clases = { en_vivo: 'chip-vivo', entretiempo: 'chip-vivo', finalizado: 'chip-ok', suspendido: 'chip-gris', programado: 'chip-lila' };
  return `<span class="chip-estado ${clases[p.estado] || ''}">${e(ESTADOS[p.estado] || p.estado)}</span>`;
}

function filaPanelPartido(p, yo) {
  const marcador = p.estado === 'programado' ? 'vs' : `${p.goles_local} – ${p.goles_visita}`;
  return `<div class="pp-fila">
<span class="pp-fecha">${e(fechaCorta(p.fecha))}</span>
<span class="pp-partido"><b>${e(p.local_nombre || 'Por definir')} <span class="pp-marcador">${marcador}</span> ${e(p.visita_nombre || 'Por definir')}</b><small>${e(p.torneo_nombre)}${p.lugar ? ' · ' + e(p.lugar) : ''}${p.fase !== 'grupos' ? ' · ' + e(FASES[p.fase]) : p.jornada ? ' · J' + p.jornada : ''}${p.arbitro_email ? ' · ' + e(p.arbitro_email.split('@')[0]) : ' · sin árbitro'}</small></span>
${chipEstado(p)}
<span class="pp-acciones">${p.local_id && p.visita_id ? `<a class="boton boton-chico boton-morado" href="/arbitro/${p.id}/">${p.estado === 'finalizado' ? 'Acta' : 'Arbitrar'}</a>` : ''}${yo.editor ? `<a class="boton boton-chico boton-claro" href="/panel/partidos/${p.id}/">Editar</a>` : ''}</span>
</div>`;
}

// ---------- Inicio ----------

export function vistaInicio({ yo, enJuego, hoy, mios, sinArbitro, hayTorneos, pendientes }) {
  if (!yo.editor) {
    return panelPagina({ titulo: 'Mis partidos', actual: 'inicio', yo, cuerpo: `
<p class="nota-panel">Estos son los partidos que te asignaron. Toca “Arbitrar” desde tu celular en la cancha.</p>
<div class="caja">${mios.length ? mios.map((p) => filaPanelPartido(p, yo)).join('') : '<p class="vacio-panel">No tienes partidos asignados por ahora.</p>'}</div>` });
  }
  const cuerpo = `
${!hayTorneos ? `<div class="caja caja-destacada"><h2>Empecemos</h2><p>Crea el primer torneo (por ejemplo “Fútbol · Básica Superior”), agrega los equipos y genera el fixture automático.</p>
<div class="fila-botones"><a class="boton boton-morado" href="/panel/torneos/">Crear un torneo</a>
${yo.admin ? `<form method="post" action="/panel/ejemplo"><button class="boton boton-claro">Cargar datos de ejemplo</button></form>` : ''}</div></div>` : ''}
${pendientes ? `<p class="aviso">Hay ${pendientes} ${pendientes === 1 ? 'persona esperando' : 'personas esperando'} un rol. <a href="/panel/usuarios/">Revisar</a></p>` : ''}
<div class="cifras">
<div class="cifra"><span>En vivo ahora</span><b class="${enJuego.length ? 'rojo' : ''}">${enJuego.length}</b></div>
<div class="cifra"><span>Partidos de hoy</span><b>${hoy.length}</b></div>
<div class="cifra"><span>Próximos sin árbitro</span><b>${sinArbitro}</b></div>
</div>
${enJuego.length ? `<h2 class="subtitulo-panel">En vivo</h2><div class="caja">${enJuego.map((p) => filaPanelPartido(p, yo)).join('')}</div>` : ''}
<h2 class="subtitulo-panel">Hoy</h2>
<div class="caja">${hoy.length ? hoy.map((p) => filaPanelPartido(p, yo)).join('') : '<p class="vacio-panel">No hay partidos programados para hoy.</p>'}</div>
${mios.length ? `<h2 class="subtitulo-panel">Asignados a ti</h2><div class="caja">${mios.map((p) => filaPanelPartido(p, yo)).join('')}</div>` : ''}`;
  return panelPagina({ titulo: 'Inicio', actual: 'inicio', yo, cuerpo });
}

// ---------- Torneos ----------

export function vistaTorneos({ yo, torneos, aviso, errorTexto }) {
  const cuerpo = `
<div class="caja">${torneos.length ? torneos.map((t) => `<a class="fila-enlace" href="/panel/torneos/${t.id}/">
<span><b>${e(t.nombre)}</b><small>${e(disciplina(t).nombre)}${t.temporada ? ' · ' + e(t.temporada) : ''} · ${t.equipos} equipos · ${t.partidos} partidos</small></span>
${t.visible ? '<span class="chip-estado chip-ok">Público</span>' : '<span class="chip-estado chip-gris">Oculto</span>'}</a>`).join('') : '<p class="vacio-panel">Todavía no hay torneos.</p>'}</div>
<h2 class="subtitulo-panel">Nuevo torneo</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="crear">
<div class="grilla-campos">
${campo('Disciplina', `<select name="disciplina">${opciones(Object.fromEntries(Object.entries(DISCIPLINAS).map(([k, v]) => [k, v.nombre])), 'futbol')}</select>`)}
${campo('Nivel o categoría', texto('nivel', '', 'required maxlength="60" placeholder="Básica Superior"'))}
${campo('Temporada', texto('temporada', String(new Date().getFullYear()), 'maxlength="20"'))}
</div>
<button class="boton boton-morado">Crear torneo</button>
</form>`;
  return panelPagina({ titulo: 'Torneos y equipos', actual: 'torneos', yo, cuerpo, aviso, errorTexto });
}

export function vistaTorneo({ yo, t, equipos, partidos, aviso, errorTexto }) {
  const d = disciplina(t);
  const hayGrupos = partidos.some((p) => p.fase === 'grupos');
  const cuerpo = `
<p class="migas"><a href="/panel/torneos/">Torneos</a> › ${e(t.nombre)} · <a href="/fixture/?t=${e(t.slug)}" target="_blank" rel="noopener">ver en el sitio ↗</a></p>
<div class="dos-columnas">
<section>
<h2 class="subtitulo-panel">Equipos (${equipos.length})</h2>
<div class="caja">${equipos.length ? equipos.map((q) => `<a class="fila-enlace" href="/panel/equipos/${q.id}/">${escudo(q.nombre, q.sigla, q.color, 's')}<span><b>${e(q.nombre)}</b><small>${q.jugadores} jugadores${q.tutor ? ' · ' + e(q.tutor) : ''}</small></span><span class="flecha">›</span></a>`).join('') : '<p class="vacio-panel">Agrega los equipos de este torneo.</p>'}</div>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="agregar_equipos">
${campo('Agregar equipos (uno por línea)', '<textarea name="nombres" rows="4" required placeholder="9no Solidarios\n10mo Positivos\n8vo Empáticos"></textarea>', 'La sigla y el color se ponen solos; luego puedes cambiarlos.')}
<button class="boton boton-morado">Agregar</button>
</form>

<h2 class="subtitulo-panel">Generar fixture automático</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="generar_fixture">
<p class="nota-panel">Todos contra todos. Cada jornada se juega en un día; los partidos del día se separan por el tiempo indicado.</p>
<div class="grilla-campos">
${campo('Primera fecha', '<input type="date" name="inicio" required>')}
${campo('Hora del primer partido', '<input type="time" name="hora" value="10:00" required>')}
${campo('Minutos entre partidos', `<input type="number" name="separacion" value="${Math.max(30, t.periodos * t.minutos_periodo + 10)}" min="0" max="600">`)}
${campo('Días entre jornadas', '<input type="number" name="dias" value="7" min="1" max="60">')}
${campo('Canchas (separadas por coma)', texto('lugares', 'Cancha 1', 'maxlength="200"'), 'Si pones varias, los partidos se reparten a la misma hora.')}
</div>
<label class="casilla"><input type="checkbox" name="vuelta" value="1"> Ida y vuelta</label>
${hayGrupos ? '<label class="casilla"><input type="checkbox" name="reemplazar" value="1"> Borrar el fixture anterior de fase de grupos (se pierden sus resultados)</label>' : ''}
<button class="boton boton-morado"${equipos.length < 2 ? ' disabled' : ''}>Generar fixture</button>
</form>

<h2 class="subtitulo-panel">Fase final</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="fase_final">
<p class="nota-panel">Crea los cruces con la tabla actual: semifinales (1.º vs 4.º y 2.º vs 3.º) o final directa (1.º vs 2.º). Después ajusta fechas y equipos en Partidos.</p>
<div class="grilla-campos">${campo('Tipo', '<select name="tipo"><option value="semis">Semifinales</option><option value="final">Final directa</option></select>')}
${campo('Fecha y hora', '<input type="datetime-local" name="fecha">')}</div>
<button class="boton boton-claro">Crear cruces</button>
</form>
</section>

<section>
<h2 class="subtitulo-panel">Configuración</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="guardar">
<div class="grilla-campos">
${campo('Disciplina', `<select name="disciplina">${opciones(Object.fromEntries(Object.entries(DISCIPLINAS).map(([k, v]) => [k, v.nombre])), t.disciplina)}</select>`)}
${campo('Nivel o categoría', texto('nivel', t.nivel, 'required maxlength="60"'))}
${campo('Temporada', texto('temporada', t.temporada, 'maxlength="20"'))}
${campo('Orden en el sitio', `<input type="number" name="orden" value="${t.orden}" min="0" max="999">`)}
${campo(`Número de ${d.periodoNombre}s`, `<input type="number" name="periodos" value="${t.periodos}" min="1" max="9">`)}
${campo(`Minutos por ${d.periodoNombre}`, `<input type="number" name="minutos_periodo" value="${t.minutos_periodo}" min="0" max="90">`, '0 = sin reloj')}
${campo('Puntos por ganar', `<input type="number" name="puntos_ganar" value="${t.puntos_ganar}" min="0" max="10">`)}
${campo('Puntos por empatar', `<input type="number" name="puntos_empatar" value="${t.puntos_empatar}" min="0" max="10">`)}
${campo('Puntos por perder', `<input type="number" name="puntos_perder" value="${t.puntos_perder}" min="0" max="10">`)}
${campo('Clasifican a la fase final', `<input type="number" name="clasifican" value="${t.clasifican}" min="0" max="16">`)}
${campo('Amarillas para suspensión', `<input type="number" name="amarillas_suspension" value="${t.amarillas_suspension}" min="0" max="10">`, '0 = no se suspende por amarillas')}
</div>
${campo('Reglamento (se muestra en Posiciones)', `<textarea name="reglamento" rows="5" maxlength="5000">${e(t.reglamento || '')}</textarea>`)}
<label class="casilla"><input type="checkbox" name="visible" value="1"${t.visible ? ' checked' : ''}> Público en el sitio</label>
<button class="boton boton-morado">Guardar</button>
</form>
${yo.admin ? `<form method="post" class="caja formulario zona-peligro" data-confirmar="Se borrará el torneo con todos sus equipos, jugadores, partidos y registros. ¿Continuar?">
<input type="hidden" name="accion" value="borrar"><button class="boton boton-peligro">Borrar torneo</button></form>` : ''}
</section>
</div>`;
  return panelPagina({ titulo: t.nombre, actual: 'torneos', yo, cuerpo, aviso, errorTexto });
}

// ---------- Equipo ----------

export function vistaEquipo({ yo, q, t, jugadores, aviso, errorTexto }) {
  const cuerpo = `
<p class="migas"><a href="/panel/torneos/">Torneos</a> › <a href="/panel/torneos/${t.id}/">${e(t.nombre)}</a> › ${e(q.nombre)} · <a href="/equipos/${q.id}/" target="_blank" rel="noopener">ver ficha ↗</a></p>
<div class="dos-columnas">
<section>
<h2 class="subtitulo-panel">Nómina (${jugadores.length})</h2>
<div class="caja">
${jugadores.length ? `<div class="jug-cabeza"><span>N.º</span><span>Nombre</span><span>Posición</span><span>Cap.</span><span>Activo</span><span></span></div>` : ''}
${jugadores.map((j) => `<form method="post" class="jug-fila">
<input type="hidden" name="accion" value="guardar_jugador"><input type="hidden" name="jugador" value="${j.id}">
<input name="dorsal" type="number" min="0" max="999" value="${j.dorsal ?? ''}" aria-label="Número de ${e(j.nombre)}">
<input name="nombre" value="${e(j.nombre)}" required maxlength="60" aria-label="Nombre">
<input name="posicion" value="${e(j.posicion || '')}" maxlength="30" aria-label="Posición de ${e(j.nombre)}">
<input type="checkbox" name="capitan" value="1"${j.capitan ? ' checked' : ''} aria-label="Capitán">
<input type="checkbox" name="activo" value="1"${j.activo ? ' checked' : ''} aria-label="Activo">
<span class="jug-botones"><button class="boton boton-chico boton-claro">Guardar</button><button class="boton boton-chico boton-texto" name="accion" value="borrar_jugador" data-confirmar="¿Quitar a ${e(j.nombre)}? Sus goles y tarjetas también se borran.">Quitar</button></span>
</form>`).join('') || '<p class="vacio-panel">Sin jugadores todavía.</p>'}
</div>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="agregar_jugadores">
${campo('Agregar jugadores (uno por línea: número, nombre, posición)', '<textarea name="lista" rows="6" required placeholder="10, Mateo R., Delantero\n1, Camila G., Arquera\nNicolás T."></textarea>', 'Por privacidad, se recomienda nombre e inicial del apellido.')}
<button class="boton boton-morado">Agregar</button>
</form>
</section>
<section>
<h2 class="subtitulo-panel">Datos del equipo</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="guardar_equipo">
<div class="vista-escudo">${escudo(q.nombre, q.sigla, q.color, 'l')}</div>
${campo('Nombre', texto('nombre', q.nombre, 'required maxlength="60"'))}
<div class="grilla-campos">
${campo('Sigla', texto('sigla', q.sigla, 'required maxlength="4"'))}
${campo('Color', `<select name="color">${opciones(COLORES, q.color)}</select>`)}
</div>
${campo('Tutor', texto('tutor', q.tutor, 'maxlength="80"'))}
${campo('Descripción', `<textarea name="descripcion" rows="3" maxlength="600">${e(q.descripcion || '')}</textarea>`)}
<button class="boton boton-morado">Guardar</button>
</form>
<form method="post" class="caja formulario zona-peligro" data-confirmar="Se borrará el equipo, su nómina y sus partidos. ¿Continuar?">
<input type="hidden" name="accion" value="borrar_equipo"><button class="boton boton-peligro">Borrar equipo</button></form>
</section>
</div>`;
  return panelPagina({ titulo: q.nombre, actual: 'torneos', yo, cuerpo, aviso, errorTexto });
}

// ---------- Partidos ----------

function formularioPartido({ p = {}, torneos, equiposPorTorneo, arbitros, accion }) {
  const torneoId = p.torneo_id || torneos[0]?.id;
  const equipos = equiposPorTorneo[torneoId] || [];
  const listaEquipos = (actual) => `<option value="">Por definir</option>${equipos.map((q) => `<option value="${q.id}"${q.id === actual ? ' selected' : ''}>${e(q.nombre)}</option>`).join('')}`;
  return `<input type="hidden" name="accion" value="${accion}">
<div class="grilla-campos">
${campo('Torneo', `<select name="torneo" data-equipos='${e(JSON.stringify(equiposPorTorneo))}'>${torneos.map((t) => `<option value="${t.id}"${t.id === torneoId ? ' selected' : ''}>${e(t.nombre)}</option>`).join('')}</select>`)}
${campo('Fase', `<select name="fase">${opciones(FASES, p.fase || 'grupos')}</select>`)}
${campo('Local', `<select name="local" data-lista-equipos>${listaEquipos(p.local_id)}</select>`)}
${campo('Visita', `<select name="visita" data-lista-equipos>${listaEquipos(p.visita_id)}</select>`)}
${campo('Fecha y hora', `<input type="datetime-local" name="fecha" value="${e(p.fecha && p.fecha.length > 10 ? p.fecha : p.fecha ? p.fecha + 'T00:00' : '')}">`)}
${campo('Lugar', texto('lugar', p.lugar, 'maxlength="60" placeholder="Cancha 1"'))}
${campo('Jornada', `<input type="number" name="jornada" value="${p.jornada ?? ''}" min="1" max="99">`)}
${campo('Árbitro', `<select name="arbitro"><option value="">Sin asignar</option>${arbitros.map((a) => `<option value="${e(a.email)}"${a.email === p.arbitro_email ? ' selected' : ''}>${e(a.nombre || a.email)} (${e(ROLES[a.rol] || a.rol)})</option>`).join('')}</select>`, 'Solo aparecen cuentas con rol de árbitro, editor o administrador.')}
</div>`;
}

export function vistaPartidos({ yo, partidos, torneos, torneo, equiposPorTorneo, arbitros, aviso, errorTexto }) {
  const cuerpo = `
<nav class="pastillas-panel" aria-label="Filtrar por torneo"><a href="/panel/partidos/"${!torneo ? ' aria-current="page"' : ''}>Todos</a>${torneos.map((t) => `<a href="/panel/partidos/?t=${t.id}"${torneo?.id === t.id ? ' aria-current="page"' : ''}>${e(t.nombre)}</a>`).join('')}</nav>
<div class="caja">${partidos.length ? partidos.map((p) => filaPanelPartido(p, yo)).join('') : '<p class="vacio-panel">No hay partidos. Genera el fixture desde el torneo o crea uno aquí abajo.</p>'}</div>
${torneos.length ? `<h2 class="subtitulo-panel">Nuevo partido</h2>
<form method="post" class="caja formulario">${formularioPartido({ p: { torneo_id: torneo?.id }, torneos, equiposPorTorneo, arbitros, accion: 'crear' })}
<button class="boton boton-morado">Crear partido</button></form>` : ''}`;
  return panelPagina({ titulo: 'Partidos', actual: 'partidos', yo, cuerpo, aviso, errorTexto });
}

export function vistaPartido({ yo, p, torneos, equiposPorTorneo, arbitros, aviso, errorTexto }) {
  const cuerpo = `
<p class="migas"><a href="/panel/partidos/">Partidos</a> › ${e(p.local_nombre || '?')} vs ${e(p.visita_nombre || '?')} · ${chipEstado(p)}</p>
<div class="dos-columnas">
<form method="post" class="caja formulario">
${formularioPartido({ p, torneos, equiposPorTorneo, arbitros, accion: 'guardar' })}
<button class="boton boton-morado">Guardar</button>
</form>
<section>
<div class="caja">
<h2 class="subtitulo-caja">Durante el partido</h2>
<p class="nota-panel">El marcador, las tarjetas y el reloj se manejan desde el panel del árbitro.</p>
${p.local_id && p.visita_id ? `<a class="boton boton-morado" href="/arbitro/${p.id}/">Abrir panel del árbitro</a>` : '<p class="nota-panel">Define los dos equipos para poder arbitrar.</p>'}
</div>
<form method="post" class="caja formulario">
<h2 class="subtitulo-caja">Resultado manual</h2>
<p class="nota-panel">Para partidos que no se registraron en vivo (o disciplinas sin árbitro en la app). Reemplaza el marcador.</p>
<input type="hidden" name="accion" value="resultado">
<div class="grilla-campos">
${campo(p.local_nombre || 'Local', `<input type="number" name="goles_local" value="${p.goles_local}" min="0" max="999">`)}
${campo(p.visita_nombre || 'Visita', `<input type="number" name="goles_visita" value="${p.goles_visita}" min="0" max="999">`)}
${campo('Estado', `<select name="estado">${opciones(ESTADOS, p.estado)}</select>`)}
</div>
${campo('Nota', texto('nota', p.nota, 'maxlength="200" placeholder="Ganó por walkover"'))}
<button class="boton boton-claro">Guardar resultado</button>
</form>
<form method="post" class="caja formulario zona-peligro" data-confirmar="Se borrará el partido y todo lo registrado en él. ¿Continuar?">
<input type="hidden" name="accion" value="borrar"><button class="boton boton-peligro">Borrar partido</button></form>
</section>
</div>`;
  return panelPagina({ titulo: 'Editar partido', actual: 'partidos', yo, cuerpo, aviso, errorTexto });
}

// ---------- Usuarios ----------

export function vistaUsuarios({ yo, usuarios, admins, aviso, errorTexto }) {
  const estados = { aprobado: 'Con acceso', pendiente: 'Pendiente', bloqueado: 'Bloqueado' };
  const cuerpo = `
<p class="nota-panel">Las personas entran con su cuenta @lev.edu.ec. La primera vez quedan pendientes hasta que les des un rol. <b>Editor</b>: torneos, equipos y partidos. <b>Árbitro</b>: solo los partidos que le asignen.</p>
<div class="caja">
${usuarios.map((u) => {
    const fijo = admins.includes(u.email);
    return `<form method="post" class="usu-fila">
<input type="hidden" name="accion" value="guardar"><input type="hidden" name="usuario" value="${u.id}">
<span class="usu-nombre"><b>${e(u.nombre || u.email.split('@')[0])}</b><small>${e(u.email)}${u.ultimo_acceso ? ' · último acceso ' + e(u.ultimo_acceso.slice(0, 10)) : ' · aún no entra'}</small></span>
${fijo ? '<span class="chip-estado chip-ok">Administrador fijo (ADMINS)</span>' : `<select name="rol" aria-label="Rol de ${e(u.email)}"><option value="ninguno">Sin rol</option>${opciones(ROLES, u.rol)}</select>
<select name="estado" aria-label="Estado de ${e(u.email)}">${opciones(estados, u.estado)}</select>
<button class="boton boton-chico boton-claro">Guardar</button>`}
</form>`;
  }).join('') || '<p class="vacio-panel">Nadie ha entrado todavía.</p>'}
</div>
<h2 class="subtitulo-panel">Autorizar a alguien antes de que entre</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="autorizar">
<div class="grilla-campos">
${campo('Correo @lev.edu.ec', '<input type="email" name="email" required maxlength="120">')}
${campo('Rol', `<select name="rol">${opciones(ROLES, 'arbitro')}</select>`)}
</div>
<button class="boton boton-morado">Autorizar</button>
</form>`;
  return panelPagina({ titulo: 'Usuarios y roles', actual: 'usuarios', yo, cuerpo, aviso, errorTexto });
}

export function vistaHistorial({ yo, filas }) {
  const cuerpo = `<div class="caja">${filas.map((f) => `<div class="hist-fila"><span class="hist-fecha">${e(f.fecha.slice(0, 16).replace('T', ' '))} UTC</span><b>${e(f.usuario || 'Sistema')}</b><span>${e(f.accion)}</span></div>`).join('') || '<p class="vacio-panel">Sin cambios registrados.</p>'}</div>`;
  return panelPagina({ titulo: 'Historial de cambios', actual: 'historial', yo, cuerpo });
}

// ---------- Panel del árbitro ----------

export function vistaArbitro({ yo, datos }) {
  const { p, disciplina: d } = datos;
  const cuerpo = `<div class="arbitro" id="arbitro">
<header class="arb-cabeza">
<div class="arb-meta"><a href="/panel/" aria-label="Volver al panel">‹ Panel</a><span>${e(p.torneo_nombre)}${p.lugar ? ' · ' + e(p.lugar) : ''}</span></div>
<div class="arb-marcador">
<b class="arb-equipo">${e(p.local_nombre)}</b>
<span class="arb-goles" id="arb-goles">${p.goles_local} – ${p.goles_visita}</span>
<b class="arb-equipo">${e(p.visita_nombre)}</b>
</div>
<div class="arb-reloj"><span id="arb-reloj">00:00</span><span id="arb-periodo" class="arb-periodo"></span></div>
<div class="arb-control" id="arb-control"></div>
<p class="arb-conexion" id="arb-conexion" role="status"></p>
</header>
<div class="arb-equipos">
${['local', 'visita'].map((lado) => `<section class="arb-lado arb-${lado}">
<h2 class="arb-lado-nombre c-${e(lado === 'local' ? p.local_color : p.visita_color)}">${e(lado === 'local' ? p.local_nombre : p.visita_nombre)}</h2>
<div class="arb-botones-gol">${d.botones.map((b) => `<button type="button" class="arb-gol" data-tipo="gol" data-lado="${lado}" data-valor="${b.valor}"${b.sinJugador ? ' data-sin-jugador="1"' : ''}>${e(b.etiqueta)}</button>`).join('')}</div>
${d.tarjetas ? `<div class="arb-tarjetas"><button type="button" class="arb-amarilla" data-tipo="amarilla" data-lado="${lado}">Amarilla</button><button type="button" class="arb-roja" data-tipo="roja" data-lado="${lado}">Roja</button></div>` : ''}
${d.botones[0].sinJugador ? '' : `<button type="button" class="arb-cambio" data-tipo="cambio" data-lado="${lado}">Cambio</button>`}
</section>`).join('')}
</div>
<section class="arb-registro">
<div class="arb-registro-cabeza"><h2>Registro</h2><button type="button" class="boton boton-chico boton-claro" id="arb-deshacer">Deshacer último</button></div>
<ol id="arb-eventos" class="arb-eventos"></ol>
</section>
<dialog class="hoja" id="hoja">
<form method="dialog" class="hoja-caja">
<h2 id="hoja-titulo">¿Quién?</h2>
<div class="hoja-lista" id="hoja-lista"></div>
<div class="hoja-pie"><button value="cancelar" class="boton boton-claro">Cancelar</button></div>
</form>
</dialog>
<script type="application/json" id="datos-arbitro">${JSON.stringify({ ...datos.estado, nominas: datos.nominas, disciplina: { tarjetas: d.tarjetas, periodoNombre: d.periodoNombre, marcador: d.marcador }, editor: yo.editor }).replace(/</g, '\\u003c')}</script>
</div>`;
  return panelPagina({ titulo: `Árbitro · ${p.local_nombre} vs ${p.visita_nombre}`, yo, cuerpo, scripts: ['/_app/eventos.js', '/_app/arbitro.js'] }).replace('<body class="panel">', '<body class="panel modo-arbitro">');
}
