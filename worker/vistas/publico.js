// Páginas públicas: portada, fixture, posiciones, equipos, partido, en vivo, modo TV.
import { e, fechaCorta, hoyEcuador, ahoraEcuador } from '../util.js';
import { pagina, escudo, filaPartido, tarjetaPartido, centroMarcador, etiquetaEstado, vacio, nombreLocal, nombreVisita, cuando, soloGanador } from './base.js';
import { simbolo } from './logo.js';
import { disciplina, DISCIPLINAS, FASES, EN_JUEGO, segundosReloj, porGrupo } from '../datos.js';

const ICONO_BALON = '<svg class="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z" fill="currentColor"/></svg>';

function reloj(p, formato = 'minuto') {
  const enJuego = EN_JUEGO.includes(p.estado);
  if (!enJuego) return '';
  const seg = segundosReloj(p);
  const texto = formato === 'minuto' ? `${Math.floor(seg / 60) + 1}'` : `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
  return `<span class="reloj" data-reloj="${p.id}" data-base="${p.reloj_base}" data-inicio="${p.reloj_inicio || ''}" data-formato="${formato}" data-descanso="${p.estado === 'entretiempo' ? 1 : 0}">${p.estado === 'entretiempo' ? 'Descanso' : texto}</span>`;
}

function textoTicker(p) {
  const l = nombreLocal(p);
  const v = nombreVisita(p);
  const donde = p.nivel ? ` (${p.nivel})` : '';
  if (EN_JUEGO.includes(p.estado)) return `● EN VIVO · ${l} ${p.goles_local} – ${p.goles_visita} ${v}${donde}`;
  if (p.estado === 'finalizado' && !p.marcador) return `FINAL · ${p.ganador === 'empate' ? `${l} empató con ${v}` : `Ganó ${p.ganador === 'local' ? l : v} ante ${p.ganador === 'local' ? v : l}`}${donde}`;
  if (p.estado === 'finalizado') return `FINAL · ${l} ${p.goles_local} – ${p.goles_visita} ${v}${donde}`;
  return `${cuando(p).toUpperCase()} · ${l} vs ${v}${donde}`;
}

function competenciaDe(t) {
  return t.competencia || (DISCIPLINAS[t.disciplina] || DISCIPLINAS.futbol).nombre;
}

// Dos pasos: competencia (Fútbol masculino…) y nivel (2do de básica…).
function selectorTorneos(torneos, actual, base) {
  const grupos = new Map();
  for (const t of torneos) {
    const c = competenciaDe(t);
    if (!grupos.has(c)) grupos.set(c, []);
    grupos.get(c).push(t);
  }
  const compActual = actual ? competenciaDe(actual) : null;
  const niveles = grupos.get(compActual) || [];
  return `<nav class="selector" aria-label="Torneo">
${grupos.size > 1 ? `<div class="selector-grupo"><span class="selector-titulo">Competencia</span><div class="pastillas">${[...grupos.entries()].map(([c, lista]) => {
    const destino = lista.find((t) => t.nivel === actual?.nivel) || lista[0];
    return `<a class="pastilla" href="${base}?t=${e(destino.slug)}"${c === compActual ? ' aria-current="true"' : ''}>${e(c)}</a>`;
  }).join('')}</div></div>` : ''}
${niveles.length > 1 ? `<div class="selector-grupo"><span class="selector-titulo">Nivel</span><div class="pastillas pastillas-chicas">${niveles.map((t) => `<a class="pastilla" href="${base}?t=${e(t.slug)}"${t.id === actual?.id ? ' aria-current="page"' : ''}>${e(t.nivel || t.nombre)}</a>`).join('')}</div></div>` : ''}
</nav>`;
}

function marcadorGrande(p, { enlace = true } = {}) {
  return `<div class="marcador-grande">
<div class="mg-equipo">${escudo(p.local_nombre, p.local_sigla, p.local_color, 'l')}<b>${e(nombreLocal(p))}</b></div>
<div class="mg-centro">${p.estado === 'programado' ? `<span class="mg-vs">${e(p.hora || (p.fecha ? p.fecha.slice(11, 16) : '') || 'vs')}</span>` : soloGanador(p) ? `<span class="mg-vs">${p.ganador === 'empate' ? 'EMPATE' : 'GANÓ ' + e((p.ganador === 'local' ? nombreLocal(p) : nombreVisita(p)).toUpperCase())}</span>` : `<span class="mg-goles" data-marcador="${p.id}">${p.goles_local} <i>–</i> ${p.goles_visita}</span>`}${reloj(p)}</div>
<div class="mg-equipo">${escudo(p.visita_nombre, p.visita_sigla, p.visita_color, 'l')}<b>${e(nombreVisita(p))}</b></div>
</div>${enlace ? `<a class="boton boton-morado boton-ancho" href="/partido/${p.id}/">${EN_JUEGO.includes(p.estado) ? 'Seguir el partido en vivo' : 'Ver el partido'}</a>` : ''}`;
}

function tablaPosiciones(filas, torneo, { resumida = false } = {}) {
  if (!filas.length) return vacio('Todavía no hay equipos en este torneo.');
  const d = disciplina(torneo);
  const conGoles = torneo.desempate === 'diferencia' || filas.some((f) => f.gf || f.gc);
  const forma = (f) => f.forma.map((x) => `<span class="forma forma-${x}" title="${x === 'G' ? 'Ganó' : x === 'E' ? 'Empató' : 'Perdió'}">${x}</span>`).join('');
  const una = (lista, grupo) => `${grupo ? `<h3 class="grupo-titulo">Grupo ${e(grupo)}</h3>` : ''}<div class="tabla-caja"><table class="tabla">
<thead><tr><th scope="col">#</th><th scope="col" class="izq">Equipo</th><th scope="col"><abbr title="Partidos jugados">PJ</abbr></th><th scope="col"><abbr title="Ganados">G</abbr></th>${resumida ? '' : `${d.empates ? '<th scope="col" class="opc"><abbr title="Empatados">E</abbr></th>' : ''}<th scope="col" class="opc"><abbr title="Perdidos">P</abbr></th>`}${!resumida && conGoles ? `<th scope="col" class="opc"><abbr title="A favor">${d.unidad === 'goles' ? 'GF' : 'PF'}</abbr></th><th scope="col" class="opc"><abbr title="En contra">${d.unidad === 'goles' ? 'GC' : 'PC'}</abbr></th><th scope="col" class="opc"><abbr title="Diferencia">DIF</abbr></th>` : ''}${resumida ? '' : '<th scope="col" class="opc2">Últimos 5</th>'}<th scope="col"><abbr title="Puntos">PTS</abbr></th></tr></thead>
<tbody>${(resumida ? lista.slice(0, 5) : lista).map((f) => `<tr${f.pos <= torneo.clasifican ? ' class="clasifica"' : ''}>
<td class="pos">${f.pos}</td>
<td class="izq"><a class="equipo-celda" href="/equipos/${f.id}/">${escudo(f.nombre, f.sigla, f.color, 'xs')}${e(f.nombre)}</a>${f.desempate ? ' <abbr class="marca-desempate" title="Ganó el partido de desempate">D</abbr>' : ''}</td>
<td>${f.pj}</td><td>${f.g}</td>${resumida ? '' : `${d.empates ? `<td class="opc">${f.e}</td>` : ''}<td class="opc">${f.p}</td>`}${!resumida && conGoles ? `<td class="opc">${f.gf}</td><td class="opc">${f.gc}</td><td class="opc">${f.dg > 0 ? '+' : ''}${f.dg}</td>` : ''}${resumida ? '' : `<td class="opc2"><span class="formas">${forma(f)}</span></td>`}
<td class="pts">${f.pts}</td></tr>`).join('')}</tbody></table></div>`;
  return porGrupo(filas).map(({ grupo, filas: lista }) => una(lista, grupo)).join('');
}

function listaAnotadores(lista, unidad = 'goles') {
  if (!lista.length) return vacio('Aún no hay anotaciones registradas.');
  const max = lista[0].total || 1;
  return `<ol class="anotadores">${lista.map((a, i) => `<li>
<span class="an-pos">${i + 1}</span>
<span class="an-cuerpo"><span class="an-nombre"><b>${e(a.nombre)}</b><a href="/equipos/${a.equipo_id}/">${e(a.equipo)}</a></span>
<svg class="barra" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="4" class="barra-fondo"/><rect width="${Math.max(4, Math.round((a.total / max) * 100))}" height="8" rx="4" class="barra-valor${i === 0 ? ' barra-oro' : ''}"/></svg></span>
<b class="an-total" title="${e(unidad)}">${a.total}</b></li>`).join('')}</ol>`;
}

function competencias(torneos) {
  const mapa = new Map();
  for (const t of torneos) {
    const c = competenciaDe(t);
    if (!mapa.has(c)) mapa.set(c, []);
    mapa.get(c).push(t);
  }
  return [...mapa.entries()].map(([nombre, lista]) => ({ nombre, lista }));
}

// ---------- Portada ----------

export function vistaPortada({ enJuego, proximos, resultados, torneos, destacado, tabla, anotadoresTop, dia }) {
  const ticker = [...enJuego, ...resultados.slice(0, 4), ...proximos.slice(0, 4)].map(textoTicker);
  const principal = enJuego[0] || proximos[0] || resultados[0];
  const disciplinas = [...new Set(torneos.map((t) => competenciaDe(t)))];
  const cuerpo = `
${ticker.length ? `<div class="cinta" aria-label="Resultados y próximos partidos"><div class="cinta-pista">${[...ticker, ...ticker].map((t, i) => `<span${i >= ticker.length ? ' aria-hidden="true"' : ''}>${e(t)}</span>`).join('')}</div></div>` : ''}
<section class="contenedor seccion-mi-curso" id="mi-curso" data-tiene-cursos="${torneos.length ? 1 : 0}" hidden></section>
<section class="heroe">
<div class="contenedor heroe-grid">
<div class="entra heroe-textos">
<p class="sobretitulo">Campeonato interno · ${e(String(new Date().getFullYear()))}</p>
<h1 class="heroe-titulo">JUGAMOS<br>COMO <span>EQUIPO</span></h1>
<p class="heroe-texto">Fixture, posiciones, goleadores y cada partido minuto a minuto, alimentado por el árbitro desde la cancha.</p>
<div class="acciones"><a class="boton boton-oro" href="/fixture/">Ver fixture</a><a class="boton boton-borde" href="/posiciones/">Tabla de posiciones</a></div>
${disciplinas.length ? `<div class="chips">${disciplinas.map((d) => `<span class="chip">${e(d)}</span>`).join('')}</div>` : ''}
</div>
<div class="tarjeta-vivo entra entra-2">
${principal ? `<div class="tv-arriba">${etiquetaEstado(principal)}<span>${e(principal.competencia || disciplina(principal).nombre)} · ${e(principal.nivel || principal.torneo_nombre)}${principal.lugar ? ' · ' + e(principal.lugar) : ''}</span></div>
${marcadorGrande(principal)}` : `<div class="tv-vacio"><b>Muy pronto</b><p>Cuando los encargados publiquen el fixture, aquí aparecerá el partido destacado.</p></div>`}
</div>
</div>
</section>

${dia ? `<section class="contenedor seccion" id="dia">
<div class="tira-dias" role="list" aria-label="Días de juego">${dia.tira.map((d) => {
    const etq = d.fecha ? fechaCorta(d.fecha, { hora: false }) : 'Sin fecha';
    const [sem, num] = d.fecha ? [etq.split(' ')[0], d.fecha.slice(8, 10).replace(/^0/, '')] : ['Día', String(d.numero)];
    return `<a role="listitem" class="tira-dia" href="/?dia=${d.numero}#dia"${d.numero === dia.numero ? ' aria-current="date"' : ''}><span>${e(['Hoy', 'Mañana', 'Ayer'].includes(etq) ? etq : sem)}</span><b>${e(num)}</b><small>Día ${d.numero}</small></a>`;
  }).join('')}<a class="tira-dia tira-mas" href="/calendario/#dia-${dia.numero}"><span>Ver</span><b>+</b><small>todos</small></a></div>
<div class="seccion-cabeza"><h2 class="titulo-seccion">${dia.hoy ? 'HOY' : 'DÍA ' + dia.numero} · ${dia.partidos.length} PARTIDOS</h2><span class="nota-dia">${dia.fecha ? e(fechaCorta(dia.fecha, { hora: false })) : 'Fecha por definir'}</span></div>
<div class="panel-lista">${dia.partidos.map((p) => filaPartido(p, { mostrarTorneo: true })).join('')}</div>
</section>` : `<section class="contenedor seccion">
<div class="seccion-cabeza"><h2 class="titulo-seccion">PRÓXIMOS PARTIDOS</h2><a href="/fixture/">Todo el fixture →</a></div>
${proximos.length ? `<div class="grilla-tarjetas">${proximos.slice(0, 4).map(tarjetaPartido).join('')}</div>` : vacio('No hay partidos programados por ahora.')}
</section>`}

${destacado ? `<section class="contenedor seccion grilla-2">
<div class="panel-claro">
<div class="seccion-cabeza"><h2 class="titulo-panel">POSICIONES · ${e((destacado.nivel || destacado.nombre).toUpperCase())}<small class="sub-panel">${e(competenciaDe(destacado))}</small></h2><a href="/posiciones/?t=${e(destacado.slug)}">Completa</a></div>
${tablaPosiciones(tabla, destacado, { resumida: true })}
</div>
<div class="panel-claro">
<div class="seccion-cabeza"><h2 class="titulo-panel">GOLEADORES${destacado.competencia ? ' · ' + e(destacado.competencia.toUpperCase()) : ''}</h2><a href="/posiciones/?t=${e(destacado.slug)}#anotadores">Ranking</a></div>
${listaAnotadores(anotadoresTop)}
</div>
</section>` : ''}

${torneos.length ? `<section class="contenedor seccion">
<h2 class="titulo-seccion">ELIGE TU COMPETENCIA</h2>
<div class="grilla-tarjetas">${competencias(torneos).map(({ nombre, lista }) => `<a class="tarjeta tarjeta-torneo d-${e(lista[0].disciplina)} r-${e(lista[0].rama || 'mixto')}" href="/fixture/?t=${e(lista[0].slug)}"><b>${e(nombre.toUpperCase())}</b><span>${lista.length === 1 ? e(lista[0].nivel) : `${lista.length} niveles`}${lista[0].temporada ? ' · ' + e(lista[0].temporada) : ''}</span></a>`).join('')}</div>
</section>` : ''}`;
  return pagina({ actual: 'inicio', cuerpo, scripts: ['/_app/sitio.js'], enVivo: enJuego.length > 0, clase: 'actualizar' });
}

// ---------- Fixture ----------

export function vistaFixture({ torneos, torneo, partidos, enVivo }) {
  if (!torneo) {
    return pagina({ titulo: 'Fixture', actual: 'fixture', enVivo, cuerpo: `<div class="contenedor seccion"><h1 class="titulo-pagina">FIXTURE</h1>${vacio('Todavía no hay torneos publicados.')}</div>` });
  }
  const grupos = new Map();
  const finales = [];
  for (const p of partidos) {
    if (p.fase !== 'grupos') { finales.push(p); continue; }
    const clave = p.jornada || 0;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  }
  const hoy = hoyEcuador();
  const jornadas = [...grupos.entries()].map(([j, lista]) => {
    const fechas = lista.map((p) => p.fecha).filter(Boolean).sort();
    const esHoy = fechas.some((f) => f.startsWith(hoy));
    const diasRonda = [...new Set(lista.map((p) => p.dia).filter(Boolean))];
    const etiquetaFecha = fechas.length ? fechaCorta(fechas[0], { hora: false }) : diasRonda.length ? `Día de juego ${diasRonda.join(', ')}` : 'Fecha por definir';
    return `<section class="jornada${esHoy ? ' jornada-hoy' : ''}" id="jornada-${j}">
<div class="jornada-cabeza"><h2>${j ? `RONDA ${j}` : 'SIN RONDA'}</h2><span>${e(etiquetaFecha)}</span></div>
${lista.map((p) => filaPartido(p)).join('')}
</section>`;
  }).join('');
  const d = disciplina(torneo);
  const cuerpo = `<div class="contenedor seccion">
<div class="cabeza-pagina">
<div><p class="sobretitulo">${e(competenciaDe(torneo))} · ${e(torneo.nivel || torneo.nombre)}${torneo.temporada ? ' · ' + e(torneo.temporada) : ''}</p><h1 class="titulo-pagina">FIXTURE</h1></div>
<a class="boton boton-borde" href="/calendario/${e(torneo.slug)}.ics">Agregar a mi calendario</a>
</div>
${selectorTorneos(torneos, torneo, '/fixture/')}
<p class="resumen">${new Set(partidos.filter((p) => p.fase === 'grupos').flatMap((p) => [p.local_id, p.visita_id]).filter(Boolean)).size} equipos · ${partidos.length} partidos${torneo.clasifican ? ` · ${torneo.clasifican === 1 ? 'el primero pasa' : `los ${torneo.clasifican} primeros${partidos.some((p) => p.codigo_local && /:\w+$/.test(p.codigo_local) && /^pos/.test(p.codigo_local)) ? ' de cada grupo' : ''} pasan`} a la fase final` : ''}</p>
${jornadas ? `<div class="grilla-jornadas">${jornadas}</div>` : vacio('El fixture de este torneo aún no se ha publicado.')}
${finales.length ? `<section class="panel-claro seccion-final"><h2 class="titulo-panel">FASE FINAL</h2>
<div class="lista-finales">${finales.map((p) => `<div class="final-item"><span class="final-fase">${e(FASES[p.fase] || p.fase)}</span>${filaPartido(p)}</div>`).join('')}</div></section>` : ''}
</div>`;
  return pagina({ titulo: `Fixture ${torneo.nombre}`, actual: 'fixture', cuerpo, scripts: ['/_app/sitio.js'], enVivo, clase: 'actualizar' });
}

// ---------- Posiciones ----------

export function vistaPosiciones({ torneos, torneo, tabla, anotadoresLista, fair, susp, enVivo, posFinales = [] }) {
  if (!torneo) {
    return pagina({ titulo: 'Posiciones', actual: 'posiciones', enVivo, cuerpo: `<div class="contenedor seccion"><h1 class="titulo-pagina">POSICIONES</h1>${vacio('Todavía no hay torneos publicados.')}</div>` });
  }
  const d = disciplina(torneo);
  const cuerpo = `<div class="contenedor seccion">
<div class="cabeza-pagina"><div><p class="sobretitulo">${e(competenciaDe(torneo))} · ${e(torneo.nivel || torneo.nombre)}</p><h1 class="titulo-pagina">POSICIONES</h1></div></div>
${selectorTorneos(torneos, torneo, '/posiciones/')}
<div class="panel-claro">${tablaPosiciones(tabla, torneo)}
<p class="leyenda"><span class="marca-clasifica" aria-hidden="true"></span>Clasifican a la fase final · Orden: ${torneo.desempate === 'diferencia' ? `puntos, diferencia, ${e(d.unidad)} a favor, fair play` : 'puntos, partidos ganados y partido de desempate'}${torneo.puntos_ganar ? ` · Ganar ${torneo.puntos_ganar}, ${d.empates ? `empatar ${torneo.puntos_empatar}, ` : ''}perder ${torneo.puntos_perder}` : ''}</p>
${posFinales.length ? `<div class="finales-tabla"><h3 class="grupo-titulo">Fase final</h3>${posFinales.map((p) => filaPartido(p)).join('')}</div>` : ''}</div>
<div class="grilla-2 seccion">
${d.anotadores ? `<section class="panel-oscuro" id="anotadores"><h2 class="titulo-panel">${e(d.anotadores.toUpperCase())}</h2><p class="nota">Se actualiza con cada anotación que registra el árbitro.</p>${listaAnotadores(anotadoresLista, d.unidad)}</section>` : ''}
${d.tarjetas ? `<section class="panel-oscuro"><h2 class="titulo-panel">FAIR PLAY</h2><p class="nota">Amarilla = 1 punto, roja = 3. Gana el equipo con menos.</p>
<div class="tabla-caja"><table class="tabla tabla-oscura"><thead><tr><th scope="col" class="izq">Equipo</th><th scope="col"><abbr title="Amarillas">AM</abbr></th><th scope="col"><abbr title="Rojas">RO</abbr></th><th scope="col">PTS</th></tr></thead>
<tbody>${fair.map((f) => `<tr><td class="izq">${e(f.nombre)}</td><td>${f.amarillas}</td><td>${f.rojas}</td><td class="pts">${f.puntos}</td></tr>`).join('')}</tbody></table></div>
<div class="suspendidos"><h3>Suspendidos para la próxima fecha</h3>${susp.length ? susp.map((s) => `<p><span class="tarjeta-mini ${s.motivo === 'Tarjeta roja' ? 'roja' : 'amarilla'}" aria-hidden="true"></span><b>${e(s.nombre)}</b> <span>${e(s.equipo)} · ${e(s.motivo)}</span></p>`).join('') : '<p class="nota">Nadie está suspendido.</p>'}</div>
</section>` : ''}
</div>
${torneo.reglamento ? `<section class="panel-oscuro seccion"><h2 class="titulo-panel">REGLAMENTO</h2><div class="texto-largo">${e(torneo.reglamento).replace(/\n/g, '<br>')}</div></section>` : ''}
</div>`;
  return pagina({ titulo: `Posiciones ${torneo.nombre}`, actual: 'posiciones', cuerpo, enVivo });
}

// ---------- Equipos ----------

export function vistaEquipos({ torneos, torneo, equipos, enVivo }) {
  const cuerpo = `<div class="contenedor seccion">
<div class="cabeza-pagina"><div><p class="sobretitulo">Fichas de equipo</p><h1 class="titulo-pagina">EQUIPOS</h1></div></div>
${torneos.length ? selectorTorneos(torneos, torneo, '/equipos/') : ''}
${equipos.length ? `<div class="grilla-tarjetas">${equipos.map((q) => `<a class="tarjeta tarjeta-equipo" href="/equipos/${q.id}/">${escudo(q.nombre, q.sigla, q.color, 'm')}<b>${e(q.nombre)}</b><span>${q.jugadores} jugadores</span></a>`).join('')}</div>` : vacio('Todavía no hay equipos.')}
</div>`;
  return pagina({ titulo: 'Equipos', actual: 'equipos', cuerpo, enVivo });
}

export function vistaEquipo({ equipo, torneo, jugadores, partidos, fila, posicion, anotacionesPor, tarjetasPor, enVivo, tituloPlantilla = 'PLANTILLA', curso }) {
  const d = disciplina(torneo);
  const cuerpo = `<section class="heroe-equipo c-fondo-${e(equipo.color)}">
<div class="contenedor heroe-equipo-fila entra">
${escudo(equipo.nombre, equipo.sigla, equipo.color, 'xl')}
<div class="he-texto"><p class="sobretitulo">${e(competenciaDe(torneo))} · ${e(torneo.nivel || '')}${equipo.grupo ? ' · Grupo ' + e(equipo.grupo) : ''}${equipo.exhibicion ? ' · Exhibición' : ''}</p><h1>${e(equipo.nombre.toUpperCase())}</h1>
<p>${[curso ? `Curso: ${e(curso)}` : '', equipo.tutor ? `Tutor: ${e(equipo.tutor)}` : '', jugadores.find((j) => j.capitan) ? `Capitán: ${e(jugadores.find((j) => j.capitan).nombre)}` : ''].filter(Boolean).join(' · ')}</p></div>
<div class="he-datos"><div><b>${posicion ? posicion + '.º' : '–'}</b><span>Posición</span></div><div><b>${fila?.pts ?? 0}</b><span>Puntos</span></div><div><b>${fila?.gf ?? 0}</b><span>${d.unidad === 'goles' ? 'Goles' : 'A favor'}</span></div></div>
</div></section>
<div class="contenedor seccion con-lateral">
<div class="col-principal">
<h2 class="titulo-seccion">${e(tituloPlantilla)}</h2>
${jugadores.length ? `<div class="grilla-jugadores">${jugadores.filter((j) => j.activo).map((j) => {
    const an = anotacionesPor.get(j.id) || 0;
    const ta = tarjetasPor.get(j.id) || { amarillas: 0, rojas: 0 };
    const ini = j.nombre.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    return `<div class="jugador">${j.dorsal != null ? `<span class="j-dorsal">${j.dorsal}</span>` : ''}<span class="j-avatar c-${e(equipo.color)}">${e(ini)}</span><b>${e(j.nombre)}</b><span class="j-pos">${e([j.posicion, j.capitan ? 'Capitán' : ''].filter(Boolean).join(' · ') || 'Jugador')}</span>
<span class="j-stats">${d.anotadores ? `<span>${an} ${an === 1 ? d.unidad.replace(/s$/, '') : d.unidad}</span>` : ''}${ta.amarillas ? `<span><span class="tarjeta-mini amarilla" aria-label="amarillas"></span>${ta.amarillas}</span>` : ''}${ta.rojas ? `<span><span class="tarjeta-mini roja" aria-label="rojas"></span>${ta.rojas}</span>` : ''}</span></div>`;
  }).join('')}</div>` : vacio(equipo.exhibicion ? 'Equipo de exhibición.' : 'Aquí aparecerán los convocados y quienes anoten o reciban tarjetas.')}
<h2 class="titulo-seccion">PARTIDOS</h2>
<div class="panel-lista">${partidos.length ? partidos.map((p) => filaPartido(p)).join('') : vacio('Sin partidos todavía.')}</div>
</div>
<aside class="col-lateral">
${fila ? `<div class="panel-oscuro"><h3 class="mini-titulo">RENDIMIENTO</h3><div class="mini-datos"><span><b>${fila.g}</b>Ganados</span>${d.empates ? `<span><b>${fila.e}</b>Empates</span>` : ''}<span><b>${fila.p}</b>Perdidos</span></div><div class="formas formas-grandes">${fila.forma.map((x) => `<span class="forma forma-${x}">${x}</span>`).join('')}</div></div>` : ''}
${equipo.descripcion ? `<div class="panel-oscuro"><h3 class="mini-titulo">SOBRE EL EQUIPO</h3><p class="texto-largo">${e(equipo.descripcion)}</p></div>` : ''}
<a class="boton boton-borde boton-ancho" href="/posiciones/?t=${e(torneo.slug)}">Ver tabla de ${e(torneo.nivel || torneo.nombre)}</a>
</aside>
</div>`;
  return pagina({ titulo: equipo.nombre, actual: 'equipos', cuerpo, enVivo });
}

// ---------- Partido (en vivo o terminado) ----------

export function vistaPartido({ estado, p, jugadoresLocal, jugadoresVisita, enVivo, despues }) {
  const d = disciplina(p);
  const alineacion = (nombre, lista, color) => `<div class="alin-col"><h3>${e(nombre)}</h3>${lista.length ? `<ul>${lista.filter((j) => j.activo).map((j) => `<li><span class="alin-dorsal c-${e(color)}">${j.dorsal ?? '–'}</span>${e(j.nombre)}${j.capitan ? ' <abbr title="Capitán">(C)</abbr>' : ''}</li>`).join('')}</ul>` : '<p class="nota">Sin nómina.</p>'}</div>`;
  const cuerpo = `<div class="partido" data-partido="${p.id}">
<section class="partido-heroe">
<div class="contenedor">
<div class="ph-arriba"><span data-estado>${etiquetaEstado(p)}</span><span>${e(p.competencia || d.nombre)} · ${e(p.nivel || p.torneo_nombre)}${p.lugar ? ' · ' + e(p.lugar) : ''}${p.fase !== 'grupos' ? ' · ' + e(FASES[p.fase]) : p.jornada ? ' · Jornada ' + p.jornada : ''}</span></div>
<div class="marcador-grande marcador-partido">
<a class="mg-equipo" href="${p.local_id ? `/equipos/${p.local_id}/` : '#'}">${escudo(p.local_nombre, p.local_sigla, p.local_color, 'xl')}<b>${e(nombreLocal(p))}</b></a>
<div class="mg-centro"><span class="mg-goles" id="marcador">${p.estado === 'programado' ? `<small>${e(cuando(p))}</small>` : soloGanador(p) ? `<small>${p.ganador === 'empate' ? 'EMPATE' : 'GANÓ ' + e((p.ganador === 'local' ? nombreLocal(p) : nombreVisita(p)).toUpperCase())}</small>` : `${p.goles_local} <i>–</i> ${p.goles_visita}`}</span><span id="reloj" class="reloj"></span><span id="periodo" class="periodo"></span></div>
<a class="mg-equipo" href="${p.visita_id ? `/equipos/${p.visita_id}/` : '#'}">${escudo(p.visita_nombre, p.visita_sigla, p.visita_color, 'xl')}<b>${e(nombreVisita(p))}</b></a>
</div>
<p class="conexion" id="conexion" hidden></p>
<div class="avisos-goles" data-avisos data-local="${p.local_id || ''}" data-visita="${p.visita_id || ''}" hidden>
<button type="button" class="boton boton-borde boton-aviso" id="boton-avisos"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg><span>Avisarme los goles de mi curso</span></button>
</div>
</div>
</section>
<div class="contenedor seccion partido-cuerpo">
<section class="panel-oscuro"><div class="seccion-cabeza"><h2 class="titulo-panel">MINUTO A MINUTO</h2><button class="boton boton-borde boton-chico" type="button" id="compartir">Compartir</button></div>
<ol class="relato" id="relato"></ol>
${despues ? `<a class="despues" href="/partido/${despues.id}/">Después en ${e(p.lugar)}: <b>${e(nombreLocal(despues))} vs ${e(nombreVisita(despues))}</b> · ${e(despues.hora || despues.fecha.slice(11, 16))}</a>` : ''}
<noscript><p class="nota">Activa JavaScript para ver el relato en vivo.</p></noscript>
</section>
${jugadoresLocal.length || jugadoresVisita.length ? `<section class="panel-oscuro"><h2 class="titulo-panel">CONVOCADOS</h2><div class="alineaciones">${alineacion(nombreLocal(p), jugadoresLocal, p.local_color)}${alineacion(nombreVisita(p), jugadoresVisita, p.visita_color)}</div></section>` : ''}
</div>
<div class="festejo" id="festejo" hidden><div class="festejo-caja"><span class="festejo-texto" id="festejo-texto">¡GOL!</span><span class="festejo-equipo" id="festejo-equipo"></span></div></div>
<script type="application/json" id="datos-partido">${JSON.stringify(estado).replace(/</g, '\\u003c')}</script>
</div>`;
  return pagina({ titulo: `${nombreLocal(p)} vs ${nombreVisita(p)}`, cuerpo, scripts: ['/_app/eventos.js', '/_app/partido.js'], enVivo, clase: 'pagina-partido' });
}

// ---------- Calendario por día de juego ----------

export function vistaCalendario({ dias, enVivo, competenciasLista, filtro }) {
  const hoy = hoyEcuador();
  const actual = dias.find((d) => d.partidos.some((p) => p.estado !== 'finalizado' && p.estado !== 'suspendido')) || dias[dias.length - 1];
  const filtros = competenciasLista.length > 1 ? `<nav class="selector" aria-label="Competencia"><div class="pastillas">
<a class="pastilla" href="/calendario/"${!filtro ? ' aria-current="true"' : ''}>Todas</a>
${competenciasLista.map((c) => `<a class="pastilla" href="/calendario/?c=${encodeURIComponent(c)}"${c === filtro ? ' aria-current="true"' : ''}>${e(c)}</a>`).join('')}</div></nav>` : '';
  const cuerpo = `<div class="contenedor seccion">
<div class="cabeza-pagina"><div><p class="sobretitulo">Todos los partidos por día de juego</p><h1 class="titulo-pagina">CALENDARIO</h1></div>${actual ? `<a class="boton boton-oro" href="#dia-${actual.numero}">Ir al día ${actual.numero}</a>` : ''}</div>
${filtros}
<p class="nota">Si un día no se juega (lluvia o feriado), sus partidos pasan al siguiente día de clases y las fechas se actualizan aquí.</p>
${dias.length ? dias.map((d) => {
    const terminado = d.partidos.every((p) => p.estado === 'finalizado');
    const abierto = actual && d.numero >= actual.numero && d.numero < actual.numero + 3;
    return `<details class="dia-cal${d.fecha === hoy ? ' dia-hoy' : ''}" id="dia-${d.numero}"${abierto ? ' open' : ''}>
<summary><b>Día ${d.numero}</b><span>${d.fecha ? e(fechaCorta(d.fecha, { hora: false })) : 'Fecha por definir'}</span><span class="dia-resumen">${d.partidos.length} partidos${terminado ? ' · jugado' : ''}</span></summary>
<div class="panel-lista">${d.partidos.map((p) => filaPartido(p, { mostrarTorneo: true })).join('')}</div>
</details>`;
  }).join('') : vacio('Todavía no hay partidos programados.')}
</div>`;
  return pagina({ titulo: 'Calendario', actual: 'calendario', cuerpo, enVivo });
}

// ---------- En vivo ----------

export function vistaVivo({ enJuego, hoy }) {
  const cuerpo = `<div class="contenedor seccion">
<div class="cabeza-pagina"><div><p class="sobretitulo">${e(fechaCorta(ahoraEcuador(), { hora: false }))}</p><h1 class="titulo-pagina">EN VIVO</h1></div><a class="boton boton-borde" href="/tv/">Modo TV</a></div>
${enJuego.length ? `<div class="grilla-vivo">${enJuego.map((p) => `<div class="tarjeta-vivo"><div class="tv-arriba">${etiquetaEstado(p)}<span>${e(p.competencia || disciplina(p).nombre)} · ${e(p.nivel || p.torneo_nombre)}${p.lugar ? ' · ' + e(p.lugar) : ''}</span></div>${marcadorGrande(p)}</div>`).join('')}</div>` : `<div class="panel-oscuro vacio-grande"><b>No hay partidos en juego ahora</b><p>Cuando un árbitro inicie un partido, aparecerá aquí al instante.</p></div>`}
<h2 class="titulo-seccion">PARTIDOS DE HOY</h2>
<div class="panel-lista">${hoy.length ? hoy.map((p) => filaPartido(p, { mostrarTorneo: true })).join('') : vacio('No hay más partidos programados para hoy.')}</div>
</div>`;
  return pagina({ titulo: 'En vivo', actual: 'vivo', cuerpo, scripts: ['/_app/sitio.js'], enVivo: enJuego.length > 0, clase: 'actualizar' });
}

// ---------- Modo TV (pantalla grande del patio) ----------

export function vistaTv({ enJuego, proximos, resultados }) {
  const cuerpo = `<div class="tv">
<header class="tv-cabeza"><span class="logo-tv">${simbolo(64)}<span><small>LA LIGA</small>LEV</span></span><span class="tv-hora" id="tv-hora"></span></header>
${enJuego.length ? `<div class="tv-grilla tv-${Math.min(enJuego.length, 4)}">${enJuego.slice(0, 4).map((p) => `<div class="tv-partido">
<div class="tv-info">${etiquetaEstado(p)} <span>${e(p.competencia || disciplina(p).nombre)} · ${e(p.nivel || p.torneo_nombre)}${p.lugar ? ' · ' + e(p.lugar) : ''}</span></div>
<div class="tv-marcador"><div>${escudo(p.local_nombre, p.local_sigla, p.local_color, 'xl')}<b>${e(nombreLocal(p))}</b></div><span class="tv-goles" data-marcador="${p.id}">${p.goles_local} – ${p.goles_visita}</span><div>${escudo(p.visita_nombre, p.visita_sigla, p.visita_color, 'xl')}<b>${e(nombreVisita(p))}</b></div></div>
<div class="tv-reloj">${reloj(p, 'reloj')}</div></div>`).join('')}</div>`
    : `<div class="tv-sin"><h1>PRÓXIMOS PARTIDOS</h1>${proximos.slice(0, 5).map((p) => `<div class="tv-fila"><span>${e(cuando(p))}</span><b>${e(nombreLocal(p))} vs ${e(nombreVisita(p))}</b><span>${e(p.lugar || '')}</span></div>`).join('') || '<p>Sin partidos programados.</p>'}</div>`}
${resultados.length ? `<div class="cinta cinta-tv"><div class="cinta-pista">${[...resultados, ...resultados].map((p, i) => `<span${i >= resultados.length ? ' aria-hidden="true"' : ''}>${e(textoTicker(p))}</span>`).join('')}</div></div>` : ''}
</div>`;
  return pagina({ titulo: 'Modo TV', cuerpo, scripts: ['/_app/sitio.js'], sinCabecera: true, clase: 'modo-tv actualizar' });
}

// ---------- Entrar (encargados) ----------

const MENSAJES = {
  pendiente: 'Tu cuenta quedó registrada. Un administrador debe darte un rol (editor o árbitro) antes de que puedas entrar.',
  bloqueado: 'Tu cuenta no tiene acceso al panel.',
  dominio: 'Solo se puede entrar con una cuenta @lev.edu.ec.',
  error: 'No se pudo completar el inicio de sesión. Intenta otra vez.',
  configuracion: 'Falta configurar el inicio de sesión con Google en Cloudflare (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).',
};

export function vistaEntrar(estado, siguiente) {
  const msg = MENSAJES[estado];
  const destino = siguiente && /^\/(panel|arbitro)\/[\w\-/]*$/.test(siguiente) ? `/auth/login?siguiente=${encodeURIComponent(siguiente)}` : '/auth/login';
  const cuerpo = `<div class="contenedor seccion entrar">
<div class="entrar-caja">
<h1 class="titulo-pagina">ENCARGADOS</h1>
<p>Coordinación de deportes, editores y árbitros entran con su cuenta del colegio.</p>
${msg ? `<p class="aviso" role="status">${e(msg)}</p>` : ''}
<a class="boton-google" href="${e(destino)}"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.7l-7.9 6C6.6 42.6 14.6 48 24 48z"/></svg>Continuar con Google</a>
<p class="nota">Solo cuentas @lev.edu.ec</p>
</div></div>`;
  return pagina({ titulo: 'Encargados', cuerpo });
}

export function vista404() {
  return pagina({ titulo: 'No encontrado', cuerpo: `<div class="contenedor seccion no-encontrado"><p class="numero-404">4<span>0</span>4</p><h1 class="titulo-pagina">FUERA DE LA CANCHA</h1><p>Esta página no existe o se movió.</p><a class="boton boton-oro" href="/">Volver al inicio</a></div>` });
}

export { ICONO_BALON, centroMarcador };
