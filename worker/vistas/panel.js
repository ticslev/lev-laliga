// Panel de encargados: torneos, equipos, jugadores, partidos, usuarios e historial.
import { e, fechaCorta, COLORES } from '../util.js';
import { escudo, NOMBRE } from './base.js';
import { DISCIPLINAS, FASES, ESTADOS, RAMAS, disciplina, porGrupo } from '../datos.js';
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
    ? [['inicio', '/panel/', 'Inicio'], ['dias', '/panel/dias/', 'Días de juego'], ['torneos', '/panel/torneos/', 'Torneos y equipos'], ['partidos', '/panel/partidos/', 'Partidos'],
      ...(yo.admin ? [['importar', '/panel/importar/', 'Importar desde Excel'], ['usuarios', '/panel/usuarios/', 'Usuarios y roles']] : []), ['historial', '/panel/historial/', 'Historial']]
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
  const marcador = p.estado === 'programado' ? 'vs' : p.marcador ? `${p.goles_local} – ${p.goles_visita}` : p.ganador === 'empate' ? 'empate' : p.ganador === 'local' ? '✓ ganó –' : p.ganador === 'visita' ? '– ganó ✓' : `${p.goles_local} – ${p.goles_visita}`;
  return `<div class="pp-fila">
<span class="pp-fecha">${p.fecha ? e(fechaCorta(p.fecha)) : p.dia ? `Día ${p.dia}${p.hora ? ' · ' + e(p.hora) : ''}` : 'Sin fecha'}</span>
<span class="pp-partido"><b>${e(p.local_nombre || p.etiqueta_local || 'Por definir')} <span class="pp-marcador">${marcador}</span> ${e(p.visita_nombre || p.etiqueta_visita || 'Por definir')}</b><small>${e(p.torneo_nombre)}${p.lugar ? ' · ' + e(p.lugar) : ''}${p.fase !== 'grupos' ? ' · ' + e(FASES[p.fase]) : p.jornada ? ' · J' + p.jornada : ''}${p.arbitro_email ? ' · ' + e(p.arbitro_email.split('@')[0]) : ' · sin árbitro'}</small></span>
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
<span><b>${e(t.nombre)}</b><small>${t.temporada ? e(t.temporada) + ' · ' : ''}${t.equipos} equipos · ${t.partidos} partidos</small></span>
${t.visible ? '<span class="chip-estado chip-ok">Público</span>' : '<span class="chip-estado chip-gris">Oculto</span>'}</a>`).join('') : '<p class="vacio-panel">Todavía no hay torneos.</p>'}</div>
<p class="nota-panel">Un torneo es una competencia en un nivel (por ejemplo, Fútbol masculino · 7mo de básica). Para cargar todo el campeonato de una vez usa <a href="/panel/importar/">Importar desde Excel</a>.</p>
<h2 class="subtitulo-panel">Nuevo torneo</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="crear">
<div class="grilla-campos">
${campo('Disciplina', `<select name="disciplina">${opciones(Object.fromEntries(Object.entries(DISCIPLINAS).map(([k, v]) => [k, v.nombre])), 'futbol')}</select>`)}
${campo('Rama', `<select name="rama">${opciones(RAMAS, 'masculino')}</select>`)}
${campo('Nivel o categoría', texto('nivel', '', 'required maxlength="60" placeholder="7mo de básica"'))}
${campo('Temporada', texto('temporada', String(new Date().getFullYear()), 'maxlength="20"'))}
</div>
<button class="boton boton-morado">Crear torneo</button>
</form>`;
  return panelPagina({ titulo: 'Torneos y equipos', actual: 'torneos', yo, cuerpo, aviso, errorTexto });
}

export function vistaTorneo({ yo, t, equipos, partidos, tabla, avisosEmpate, cursos, aviso, errorTexto }) {
  const d = disciplina(t);
  const hayGrupos = partidos.some((p) => p.fase === 'grupos');
  const hayFinales = partidos.some((p) => p.fase !== 'grupos' && p.fase !== 'amistoso');
  const grupos = [...new Set(equipos.map((q) => q.grupo).filter(Boolean))].sort();
  const cuerpo = `
<p class="migas"><a href="/panel/torneos/">Torneos</a> › ${e(t.nombre)} · <a href="/fixture/?t=${e(t.slug)}" target="_blank" rel="noopener">ver en el sitio ↗</a></p>
${avisosEmpate.length ? `<p class="aviso" role="alert"><b>Empates por resolver</b> (la fase final no se llena hasta resolverlos): ${avisosEmpate.map((a) => `${e(a.equipos.join(' y '))} por el ${a.puesto}.º puesto${a.grupo ? ' del grupo ' + e(a.grupo) : ''}`).join('; ')}. Jueguen el partido extra y anota 1 al ganador en la columna “Desempate” de la tabla.</p>` : ''}
<div class="dos-columnas">
<section>
<h2 class="subtitulo-panel">Tabla y desempate</h2>
${tabla.length ? `<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="desempate">
${porGrupo(tabla).map(({ grupo, filas }) => `${grupo ? `<h3 class="subtitulo-caja">Grupo ${e(grupo)}</h3>` : ''}
<div class="tabla-panel"><div class="tp-cab"><span>#</span><span>Equipo</span><span>PJ</span><span>G</span><span>Pts</span><span>Desempate</span></div>
${filas.map((f) => `<div class="tp-fila${f.pos <= t.clasifican ? ' tp-clasifica' : ''}"><span>${f.pos}</span><span>${e(f.nombre)}</span><span>${f.pj}</span><span>${f.g}</span><b>${f.pts}</b>
<input type="number" name="desempate_${f.id}" value="${f.desempate}" min="0" max="9" aria-label="Desempate de ${e(f.nombre)}"></div>`).join('')}</div>`).join('')}
<p class="nota-panel">Desempate: escribe 1 al ganador del partido extra cuando dos equipos quedan iguales en puntos y victorias.</p>
<button class="boton boton-claro">Guardar desempate</button>
</form>` : '<p class="vacio-panel">Sin equipos todavía.</p>'}

<h2 class="subtitulo-panel">Equipos (${equipos.length})</h2>
<div class="caja">${equipos.length ? equipos.map((q) => `<a class="fila-enlace" href="/panel/equipos/${q.id}/">${escudo(q.nombre, q.sigla, q.color, 's')}<span><b>${e(q.nombre)}${q.grupo ? ` <small class="en-linea">· Grupo ${e(q.grupo)}</small>` : ''}</b><small>${q.exhibicion ? 'Exhibición (no cuenta en la tabla) · ' : ''}${q.curso_id ? `Curso ${e(cursos.get(q.curso_id) || '')} · ${q.convocados} convocados` : `${q.jugadores} jugadores`}</small></span><span class="flecha">›</span></a>`).join('') : '<p class="vacio-panel">Agrega los equipos de este torneo.</p>'}</div>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="agregar_equipos">
${campo('Agregar equipos (uno por línea)', '<textarea name="nombres" rows="4" required placeholder="Responsables\nRespetuosos\nReflexivos\nResilientes"></textarea>', 'Si el nombre coincide con un paralelo de la lista de alumnos, el equipo queda unido a su curso.')}
<button class="boton boton-morado">Agregar</button>
</form>

<h2 class="subtitulo-panel">Generar fixture automático</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="generar_fixture">
<p class="nota-panel">Todos contra todos${grupos.length ? ' dentro de cada grupo' : ''}. Cada ronda se juega en un día; los partidos del día se separan por el tiempo indicado.</p>
<div class="grilla-campos">
${campo('Primera fecha', '<input type="date" name="inicio" required>')}
${campo('Hora del primer partido', '<input type="time" name="hora" value="10:00" required>')}
${campo('Minutos entre partidos', `<input type="number" name="separacion" value="${Math.max(30, t.periodos * t.minutos_periodo + 10)}" min="0" max="600">`)}
${campo('Días entre rondas', '<input type="number" name="dias" value="7" min="1" max="60">')}
${campo('Canchas (separadas por coma)', texto('lugares', 'Cancha 1', 'maxlength="200"'), 'Si pones varias, los partidos se reparten a la misma hora.')}
</div>
<label class="casilla"><input type="checkbox" name="vuelta" value="1"> Ida y vuelta</label>
${hayGrupos ? '<label class="casilla"><input type="checkbox" name="reemplazar" value="1"> Borrar el fixture anterior de fase de grupos (se pierden sus resultados)</label>' : ''}
<button class="boton boton-morado"${equipos.length < 2 ? ' disabled' : ''}>Generar fixture</button>
</form>

<h2 class="subtitulo-panel">Fase final</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="fase_final">
<p class="nota-panel">Crea los cruces con lugares por definir (por ejemplo “1.º vs 2.º”). Se llenan solos cuando termina la fase de grupos, y la final con los ganadores de las semifinales.${hayFinales ? ' <b>Este torneo ya tiene partidos de fase final.</b>' : ''}</p>
<div class="grilla-campos">${campo('Tipo', `<select name="tipo">
<option value="final">Final: 1.º vs 2.º</option>
<option value="semis">Semifinales 1.º–4.º y 2.º–3.º + final</option>
${grupos.length >= 2 ? `<option value="cruzadas" selected>Semifinales cruzadas: 1.º ${e(grupos[0])}–2.º ${e(grupos[1])} y 1.º ${e(grupos[1])}–2.º ${e(grupos[0])} + final</option>` : ''}
</select>`)}
${campo('Día de juego de la final (opcional)', '<input type="number" name="dia" min="1" max="999">')}</div>
<button class="boton boton-claro">Crear cruces</button>
</form>
</section>

<section>
<h2 class="subtitulo-panel">Configuración</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="guardar">
<div class="grilla-campos">
${campo('Disciplina', `<select name="disciplina">${opciones(Object.fromEntries(Object.entries(DISCIPLINAS).map(([k, v]) => [k, v.nombre])), t.disciplina)}</select>`)}
${campo('Rama', `<select name="rama">${opciones(RAMAS, t.rama)}</select>`)}
${campo('Nivel o categoría', texto('nivel', t.nivel, 'required maxlength="60"'))}
${campo('Temporada', texto('temporada', t.temporada, 'maxlength="20"'))}
${campo('Orden en el sitio', `<input type="number" name="orden" value="${t.orden}" min="0" max="999">`)}
${campo(`Número de ${d.periodoNombre}s`, `<input type="number" name="periodos" value="${t.periodos}" min="1" max="9">`)}
${campo(`Minutos por ${d.periodoNombre}`, `<input type="number" name="minutos_periodo" value="${t.minutos_periodo}" min="0" max="90">`, '0 = sin reloj')}
${campo('Puntos por ganar', `<input type="number" name="puntos_ganar" value="${t.puntos_ganar}" min="0" max="10">`)}
${campo('Puntos por empatar', `<input type="number" name="puntos_empatar" value="${t.puntos_empatar}" min="0" max="10">`)}
${campo('Puntos por perder', `<input type="number" name="puntos_perder" value="${t.puntos_perder}" min="0" max="10">`)}
${campo(grupos.length ? 'Clasifican por grupo' : 'Clasifican a la fase final', `<input type="number" name="clasifican" value="${t.clasifican}" min="0" max="16">`)}
${campo('Amarillas para suspensión', `<input type="number" name="amarillas_suspension" value="${t.amarillas_suspension}" min="0" max="10">`, '0 = no se suspende por amarillas')}
${campo('Orden de la tabla', `<select name="desempate">${opciones({ ganados: 'Puntos, ganados, partido extra', diferencia: 'Puntos, diferencia, goles a favor' }, t.desempate)}</select>`)}
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

export function vistaEquipo({ yo, q, t, jugadores, cursos, alumnos, aviso, errorTexto }) {
  const manuales = jugadores.filter((j) => !j.alumno_id);
  const porAlumno = new Map(jugadores.filter((j) => j.alumno_id).map((j) => [j.alumno_id, j]));
  const cuerpo = `
<p class="migas"><a href="/panel/torneos/">Torneos</a> › <a href="/panel/torneos/${t.id}/">${e(t.nombre)}</a> › ${e(q.nombre)} · <a href="/equipos/${q.id}/" target="_blank" rel="noopener">ver ficha ↗</a></p>
<div class="dos-columnas">
<section>
${q.curso_id ? `<h2 class="subtitulo-panel">Convocados del curso (${[...porAlumno.values()].filter((j) => j.convocado).length} de ${alumnos.length})</h2>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="convocados">
<p class="nota-panel">Opcional. Si marcas convocados, el árbitro los ve primero y la ficha pública muestra solo a ellos. Si no marcas a nadie, el árbitro elige entre todo el curso.</p>
<div class="convocados">
${alumnos.map((a) => {
    const j = porAlumno.get(a.id);
    return `<div class="conv-fila"><label class="casilla"><input type="checkbox" name="c_${a.id}" value="1"${j?.convocado ? ' checked' : ''}> ${e(a.completo)}</label>
<input type="number" name="d_${a.id}" value="${j?.dorsal ?? ''}" min="0" max="999" placeholder="N.º" aria-label="Número de ${e(a.completo)}"></div>`;
  }).join('') || '<p class="vacio-panel">El curso no tiene alumnos activos.</p>'}
</div>
<button class="boton boton-morado">Guardar convocados</button>
</form>` : ''}

<h2 class="subtitulo-panel">${q.curso_id ? 'Jugadores agregados a mano' : 'Nómina'} (${manuales.length})</h2>
<div class="caja">
${manuales.length ? `<div class="jug-cabeza"><span>N.º</span><span>Nombre</span><span>Posición</span><span>Cap.</span><span>Activo</span><span></span></div>` : ''}
${manuales.map((j) => `<form method="post" class="jug-fila">
<input type="hidden" name="accion" value="guardar_jugador"><input type="hidden" name="jugador" value="${j.id}">
<input name="dorsal" type="number" min="0" max="999" value="${j.dorsal ?? ''}" aria-label="Número de ${e(j.nombre)}">
<input name="nombre" value="${e(j.nombre)}" required maxlength="60" aria-label="Nombre">
<input name="posicion" value="${e(j.posicion || '')}" maxlength="30" aria-label="Posición de ${e(j.nombre)}">
<input type="checkbox" name="capitan" value="1"${j.capitan ? ' checked' : ''} aria-label="Capitán">
<input type="checkbox" name="activo" value="1"${j.activo ? ' checked' : ''} aria-label="Activo">
<span class="jug-botones"><button class="boton boton-chico boton-claro">Guardar</button><button class="boton boton-chico boton-texto" name="accion" value="borrar_jugador" data-confirmar="¿Quitar a ${e(j.nombre)}? Sus goles y tarjetas también se borran.">Quitar</button></span>
</form>`).join('') || `<p class="vacio-panel">${q.curso_id ? 'Para equipos con curso no hace falta: usa la lista de convocados.' : 'Sin jugadores todavía.'}</p>`}
</div>
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="agregar_jugadores">
${campo('Agregar jugadores (uno por línea: número, nombre, posición)', '<textarea name="lista" rows="4" required placeholder="10, Carlos M., Delantero\n1, Marco S., Arquero"></textarea>', 'Para equipos de profes o personas que no están en la lista de alumnos.')}
<button class="boton boton-claro">Agregar</button>
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
${campo('Grupo', texto('grupo', q.grupo, 'maxlength="2" placeholder="A"'), 'Vacío si el nivel no tiene grupos.')}
${campo('Curso', `<select name="curso"><option value="">Sin curso</option>${cursos.map((c) => `<option value="${c.id}"${c.id === q.curso_id ? ' selected' : ''}>${e(c.nivel)} · ${e(c.nombre)}</option>`).join('')}</select>`)}
</div>
${campo('Tutor', texto('tutor', q.tutor, 'maxlength="80"'))}
${campo('Descripción', `<textarea name="descripcion" rows="3" maxlength="600">${e(q.descripcion || '')}</textarea>`)}
<label class="casilla"><input type="checkbox" name="exhibicion" value="1"${q.exhibicion ? ' checked' : ''}> Exhibición (juega, pero no cuenta en la tabla ni clasifica)</label>
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
${campo('Día de juego', `<input type="number" name="dia" value="${p.dia ?? ''}" min="1" max="999">`, 'La fecha sale del día de juego. Déjalo vacío para poner una fecha a mano.')}
${campo('Hora', `<input type="time" name="hora" value="${e(p.hora || '')}">`)}
${campo('Fecha (solo si no tiene día de juego)', `<input type="datetime-local" name="fecha" value="${e(!p.dia && p.fecha ? (p.fecha.length > 10 ? p.fecha : p.fecha + 'T00:00') : '')}">`)}
${campo('Cancha', texto('lugar', p.lugar, 'maxlength="60" placeholder="Cancha sintética"'))}
${campo('Ronda', `<input type="number" name="jornada" value="${p.jornada ?? ''}" min="1" max="99">`)}
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
<p class="migas"><a href="/panel/partidos/">Partidos</a> › ${e(p.local_nombre || p.etiqueta_local || '?')} vs ${e(p.visita_nombre || p.etiqueta_visita || '?')} · ${chipEstado(p)}${p.dia ? ` · <a href="/panel/dias/${p.dia}/">Día de juego ${p.dia}</a>` : ''}</p>
${p.codigo_local || p.codigo_visita ? '<p class="nota-panel">Este cruce se completa solo con la tabla o con el ganador de la semifinal. Si eliges los equipos a mano, se respetan.</p>' : ''}
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
${campo('Si empataron, ganó (penales)', `<select name="ganador"><option value="">—</option><option value="local"${p.ganador === 'local' && p.goles_local === p.goles_visita ? ' selected' : ''}>${e(p.local_nombre || 'Local')}</option><option value="visita"${p.ganador === 'visita' && p.goles_local === p.goles_visita ? ' selected' : ''}>${e(p.visita_nombre || 'Visita')}</option></select>`)}
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

// ---------- Resultado rápido (como en el Excel: solo quién ganó) ----------

export function botonesGanador(p, empates) {
  if (!p.local_id || !p.visita_id) return '<span class="nota-panel">Por definir</span>';
  const boton = (valor, textoBoton, activo) => `<button class="boton boton-chico ${activo ? 'boton-morado' : 'boton-claro'}" name="valor" value="${valor}"${activo ? ' aria-pressed="true"' : ''}>${e(textoBoton)}</button>`;
  const fin = p.estado === 'finalizado';
  return `<form method="post" class="rapido">
<input type="hidden" name="accion" value="ganador"><input type="hidden" name="partido" value="${p.id}">
${boton('local', p.local_nombre, fin && p.ganador === 'local')}
${empates && (p.fase === 'grupos' || p.fase === 'amistoso') ? boton('empate', 'Empate', fin && p.ganador === 'empate') : ''}
${boton('visita', p.visita_nombre, fin && p.ganador === 'visita')}
${fin ? '<button class="boton boton-chico boton-texto" name="valor" value="borrar">Quitar resultado</button>' : ''}
</form>`;
}

// ---------- Días de juego ----------

const DIAS_SEMANA = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 0: 'Dom' };

export function vistaDias({ yo, dias, diasSemana, feriados, aviso, errorTexto }) {
  const sinFecha = dias.filter((d) => !d.fecha).length;
  const proximo = dias.find((d) => d.pendientes > 0);
  const cuerpo = `
<p class="nota-panel">La planificación usa “Días de juego” (1, 2, 3…). Aquí se les pone la fecha real. Si un día no se juega (lluvia, feriado), usa <b>Posponer</b>: ese día y los siguientes se corren al próximo día de clases.</p>
${sinFecha ? `<p class="aviso">${sinFecha} ${sinFecha === 1 ? 'día no tiene' : 'días no tienen'} fecha todavía. Los partidos sin fecha se muestran en el sitio como “Día de juego N”.</p>` : ''}
<form method="post" class="caja formulario">
<input type="hidden" name="accion" value="calcular">
<h2 class="subtitulo-caja">Poner fechas automáticamente</h2>
<div class="grilla-campos">
${campo('Desde el día de juego', `<input type="number" name="desde" value="${proximo ? proximo.numero : 1}" min="1" max="999" required>`)}
${campo('Fecha de ese día', '<input type="date" name="fecha" required>')}
</div>
<fieldset class="dias-semana"><legend>Días en que se juega</legend>
${[1, 2, 3, 4, 5, 6].map((n) => `<label class="casilla"><input type="checkbox" name="semana" value="${n}"${diasSemana.includes(n) ? ' checked' : ''}> ${DIAS_SEMANA[n]}</label>`).join('')}
</fieldset>
${campo('Feriados y días sin clases (uno por línea, AAAA-MM-DD)', `<textarea name="feriados" rows="3" placeholder="2026-12-24">${e(feriados.join('\n'))}</textarea>`)}
<button class="boton boton-morado">Calcular fechas</button>
</form>
<div class="caja">
<div class="dia-cab"><span>Día</span><span>Fecha</span><span>Partidos</span><span></span></div>
${dias.map((d) => `<div class="dia-fila${proximo && proximo.numero === d.numero ? ' dia-proximo' : ''}">
<a href="/panel/dias/${d.numero}/"><b>Día ${d.numero}</b></a>
<form method="post" class="dia-fecha"><input type="hidden" name="accion" value="fecha"><input type="hidden" name="dia" value="${d.numero}">
<input type="date" name="fecha" value="${e(d.fecha || '')}" aria-label="Fecha del día ${d.numero}"><button class="boton boton-chico boton-claro">Guardar</button></form>
<span>${d.jugados}/${d.total} jugados</span>
<span class="dia-acciones"><a class="boton boton-chico boton-claro" href="/panel/dias/${d.numero}/">Resultados</a>
${d.fecha && d.pendientes ? `<form method="post" data-confirmar="¿Posponer el día ${d.numero}? Este día y los siguientes se corren al próximo día de clases."><input type="hidden" name="accion" value="posponer"><input type="hidden" name="dia" value="${d.numero}"><button class="boton boton-chico boton-texto">Posponer</button></form>` : ''}</span>
</div>`).join('') || '<p class="vacio-panel">Todavía no hay días de juego. Se crean al importar el Excel o al poner un día de juego a un partido.</p>'}
</div>`;
  return panelPagina({ titulo: 'Días de juego', actual: 'dias', yo, cuerpo, aviso, errorTexto });
}

export function vistaDia({ yo, dia, partidos, empatesPor, anterior, siguiente, aviso, errorTexto }) {
  const cuerpo = `
<p class="migas"><a href="/panel/dias/">Días de juego</a> › Día ${dia.numero}${dia.fecha ? ' · ' + e(fechaCorta(dia.fecha, { hora: false })) : ' · sin fecha'}
${anterior ? ` · <a href="/panel/dias/${anterior}/">‹ Día ${anterior}</a>` : ''}${siguiente ? ` · <a href="/panel/dias/${siguiente}/">Día ${siguiente} ›</a>` : ''}</p>
<p class="nota-panel">Toca el equipo que ganó (o Empate en fútbol, solo en fase de grupos). Para registrar goles, tarjetas y el reloj, usa <b>Arbitrar</b>.</p>
<div class="caja">
${partidos.map((p) => `<div class="dia-partido">
<span class="dp-info"><b>${e(p.hora || '')}</b> ${e(p.lugar || '')}<small>${e(p.torneo_nombre)}${p.fase !== 'grupos' ? ' · ' + e(FASES[p.fase]) : ''}</small></span>
<span class="dp-equipos">${e(p.local_nombre || p.etiqueta_local || '?')} <span class="pp-marcador">${p.estado === 'programado' ? 'vs' : p.marcador ? `${p.goles_local} – ${p.goles_visita}` : '·'}</span> ${e(p.visita_nombre || p.etiqueta_visita || '?')} ${chipEstado(p)}</span>
<span class="dp-rapido">${botonesGanador(p, empatesPor(p))}${p.local_id && p.visita_id ? `<a class="boton boton-chico boton-claro" href="/arbitro/${p.id}/">Arbitrar</a>` : ''}</span>
</div>`).join('') || '<p class="vacio-panel">Este día no tiene partidos.</p>'}
</div>`;
  return panelPagina({ titulo: `Día de juego ${dia.numero}`, actual: 'dias', yo, cuerpo, aviso, errorTexto });
}

// ---------- Importar desde Excel ----------

export function vistaImportar({ yo, hayTorneos, resumen }) {
  const cuerpo = `
<p class="nota-panel">Sube el Excel del campeonato (con la hoja <b>Calendario</b>) y, si quieres, la lista de alumnos. Los archivos se leen en tu navegador: no se guardan en ningún lado y los correos de los alumnos no se envían.</p>
${resumen.alumnos ? `<p class="nota-panel">Ahora hay ${resumen.cursos} cursos y ${resumen.alumnos} alumnos cargados. Subir otra lista actualiza los nombres y deja inactivos a los que ya no están.</p>` : ''}
<div class="dos-columnas">
<div class="caja formulario">
<h2 class="subtitulo-caja">1. Campeonato</h2>
<label class="campo"><span>Excel del campeonato (.xlsx)</span><input type="file" id="archivo-campeonato" accept=".xlsx"></label>
<p id="estado-campeonato" class="nota-panel">Se leen: N.°, Día de juego, Horario, Cancha, Deporte, Rama, Nivel / Grupo, Fase, Equipo 1 y Equipo 2.</p>
${campo('Temporada', texto('temporada', String(new Date().getFullYear()), 'id="temporada" maxlength="20"'))}
${hayTorneos ? '<label class="casilla"><input type="checkbox" id="reemplazar"> Reemplazar el campeonato actual (se borran torneos, partidos y registros)</label>' : ''}
</div>
<div class="caja formulario">
<h2 class="subtitulo-caja">2. Lista de alumnos (opcional)</h2>
<label class="campo"><span>Excel de alumnos (.xlsx)</span><input type="file" id="archivo-alumnos" accept=".xlsx"></label>
<p id="estado-alumnos" class="nota-panel">Se leen: Nivel, Paralelo y Estudiante.</p>
</div>
</div>
<div class="caja formulario">
<h2 class="subtitulo-caja">Vista previa</h2>
<div id="vista-previa"><p class="vacio-panel">Elige los archivos para ver qué se va a cargar.</p></div>
<button class="boton boton-morado" id="importar" type="button" disabled>Importar</button>
<div id="resultado" hidden></div>
</div>`;
  return panelPagina({ titulo: 'Importar desde Excel', actual: 'importar', yo, cuerpo, scripts: ['/_app/importar.js'] });
}
