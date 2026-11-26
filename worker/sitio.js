// Rutas públicas: arman los datos y llaman a las vistas.
import { uno, todos } from './db.js';
import { html, json, error, hoyEcuador, ahoraEcuador, e } from './util.js';
import {
  torneosVisibles, torneoPorSlug, partidosDeTorneo, partidosEnJuego, proximosPartidos, ultimosResultados,
  partidosDeEquipo, partido as leerPartido, estadoPartido, jugadoresDe, convocadosDe, posiciones, anotadores, fairPlay, suspendidos,
  disciplina, segundosReloj,
} from './datos.js';

const SELECT_LISTA = `SELECT p.*, t.nombre AS torneo_nombre, t.slug AS torneo_slug, t.disciplina, t.nivel, t.competencia,
    l.nombre AS local_nombre, l.sigla AS local_sigla, l.color AS local_color,
    v.nombre AS visita_nombre, v.sigla AS visita_sigla, v.color AS visita_color
  FROM partidos p JOIN torneos t ON t.id = p.torneo_id
  LEFT JOIN equipos l ON l.id = p.local_id LEFT JOIN equipos v ON v.id = p.visita_id`;
import {
  vistaPortada, vistaFixture, vistaPosiciones, vistaEquipos, vistaEquipo, vistaPartido, vistaVivo, vistaTv, vistaEntrar, vista404, vistaCalendario,
} from './vistas/publico.js';
import { conectar } from './vivo.js';

// Día de juego que muestra la portada: el pedido (?dia=N), el de hoy, el próximo con partidos pendientes o el último.
async function diaDeJuego(db, url) {
  const dias = await todos(db, `SELECT d.numero, d.fecha,
      SUM(CASE WHEN p.estado NOT IN ('finalizado','suspendido') THEN 1 ELSE 0 END) AS pendientes
    FROM dias_juego d JOIN partidos p ON p.dia = d.numero JOIN torneos t ON t.id = p.torneo_id AND t.visible = 1
    GROUP BY d.numero ORDER BY d.numero`);
  if (!dias.length) return null;
  const hoy = hoyEcuador();
  const pedido = Number(url.searchParams.get('dia'));
  const elegido = dias.find((d) => d.numero === pedido)
    || dias.find((d) => d.fecha === hoy)
    || dias.find((d) => d.fecha && d.fecha > hoy)
    || dias.find((d) => d.pendientes > 0)
    || dias[dias.length - 1];
  const i = dias.indexOf(elegido);
  const tira = dias.slice(Math.max(0, i - 1), Math.max(0, i - 1) + 6);
  const partidos = await todos(db, `${SELECT_LISTA} WHERE t.visible = 1 AND p.dia = ? ORDER BY p.hora, p.lugar, p.id`, elegido.numero);
  return { ...elegido, hoy: elegido.fecha === hoy, tira, partidos };
}

function elegirTorneo(torneos, url) {
  const s = url.searchParams.get('t');
  return torneos.find((t) => t.slug === s) || torneos[0] || null;
}

export async function rutaPublica(request, env, url) {
  const db = env.DB;
  const ruta = url.pathname;

  if (ruta === '/') {
    const [enJuego, proximos, resultados, torneos] = await Promise.all([
      partidosEnJuego(db), proximosPartidos(db, hoyEcuador()), ultimosResultados(db), torneosVisibles(db),
    ]);
    // Torneo destacado: el del partido en vivo, o el primero con partidos jugados.
    const idDestacado = enJuego[0]?.torneo_id || resultados[0]?.torneo_id || torneos[0]?.id;
    const destacado = torneos.find((t) => t.id === idDestacado) || null;
    const tabla = destacado ? await posiciones(db, destacado) : [];
    const idsGoles = torneos.filter((t) => disciplina(t).marcador === 'goles').map((t) => t.id);
    const anotadoresTop = await anotadores(db, idsGoles, 5);
    const dia = await diaDeJuego(db, url);
    return html(vistaPortada({ enJuego, proximos, resultados, torneos, destacado, tabla, anotadoresTop, dia }));
  }

  if (ruta === '/fixture/' || ruta === '/posiciones/' || ruta === '/equipos/') {
    const torneos = await torneosVisibles(db);
    const torneo = elegirTorneo(torneos, url);
    const enVivo = (await partidosEnJuego(db)).length > 0;
    if (ruta === '/fixture/') {
      const partidos = torneo ? await partidosDeTorneo(db, torneo.id) : [];
      return html(vistaFixture({ torneos, torneo, partidos, enVivo }));
    }
    if (ruta === '/posiciones/') {
      if (!torneo) return html(vistaPosiciones({ torneos, torneo, enVivo }));
      const [tabla, anotadoresLista, fair, susp, posFinales] = await Promise.all([
        posiciones(db, torneo), anotadores(db, [torneo.id], 10), fairPlay(db, torneo.id), suspendidos(db, torneo),
        todos(db, `${SELECT_LISTA} WHERE p.torneo_id = ? AND p.fase NOT IN ('grupos','amistoso') ORDER BY p.dia, p.fecha, p.llave`, torneo.id),
      ]);
      return html(vistaPosiciones({ torneos, torneo, tabla, anotadoresLista, fair, susp, enVivo, posFinales }));
    }
    const equipos = torneo
      ? await todos(db, `SELECT eq.*, (SELECT COUNT(*) FROM jugadores j WHERE j.equipo_id = eq.id AND j.activo = 1) AS jugadores
          FROM equipos eq WHERE eq.torneo_id = ? ORDER BY eq.nombre`, torneo.id)
      : [];
    return html(vistaEquipos({ torneos, torneo, equipos, enVivo }));
  }

  let m = ruta.match(/^\/equipos\/(\d+)\/$/);
  if (m) {
    const equipo = await uno(db, 'SELECT * FROM equipos WHERE id = ?', Number(m[1]));
    if (!equipo) return null;
    const torneo = await uno(db, 'SELECT * FROM torneos WHERE id = ? AND visible = 1', equipo.torneo_id);
    if (!torneo) return null;
    const [jugadores, partidos, tabla, an, ta, enJuego, curso] = await Promise.all([
      jugadoresDe(db, equipo.id),
      partidosDeEquipo(db, equipo.id),
      posiciones(db, torneo),
      todos(db, `SELECT jugador_id, SUM(valor) AS total FROM eventos WHERE tipo = 'gol' AND anulado = 0 AND (detalle IS NULL OR detalle != 'autogol')
        AND jugador_id IN (SELECT id FROM jugadores WHERE equipo_id = ?) GROUP BY jugador_id`, equipo.id),
      todos(db, `SELECT jugador_id, SUM(tipo = 'amarilla') AS amarillas, SUM(tipo = 'roja') AS rojas FROM eventos
        WHERE tipo IN ('amarilla','roja') AND anulado = 0 AND jugador_id IN (SELECT id FROM jugadores WHERE equipo_id = ?) GROUP BY jugador_id`, equipo.id),
      partidosEnJuego(db),
      equipo.curso_id ? uno(db, 'SELECT nivel, nombre FROM cursos WHERE id = ?', equipo.curso_id) : null,
    ]);
    const i = tabla.findIndex((f) => f.id === equipo.id);
    // Plantilla: los convocados; si no hay, quienes ya anotaron o recibieron tarjetas.
    const convocados = jugadores.filter((j) => j.convocado && j.activo);
    const conRegistro = new Set([...an.map((a) => a.jugador_id), ...ta.map((t) => t.jugador_id)]);
    const lista = convocados.length ? convocados : jugadores.filter((j) => conRegistro.has(j.id));
    return html(vistaEquipo({
      equipo, torneo, jugadores: lista, tituloPlantilla: convocados.length ? 'CONVOCADOS' : 'JUGADORES DESTACADOS',
      curso: curso ? `${curso.nivel} ${curso.nombre}` : null,
      partidos, fila: tabla[i], posicion: i >= 0 && tabla[i].pj ? tabla[i].pos : null,
      anotacionesPor: new Map(an.map((a) => [a.jugador_id, a.total])),
      tarjetasPor: new Map(ta.map((t) => [t.jugador_id, t])),
      enVivo: enJuego.length > 0,
    }));
  }

  m = ruta.match(/^\/partido\/(\d+)\/$/);
  if (m) {
    const p = await leerPartido(db, Number(m[1]));
    if (!p) return null;
    const torneo = await uno(db, 'SELECT visible FROM torneos WHERE id = ?', p.torneo_id);
    if (!torneo?.visible) return null;
    const [estado, jugadoresLocal, jugadoresVisita, enJuego] = await Promise.all([
      estadoPartido(db, p.id),
      p.local_id ? convocadosDe(db, p.local_id) : [],
      p.visita_id ? convocadosDe(db, p.visita_id) : [],
      partidosEnJuego(db),
    ]);
    const despues = p.lugar && p.fecha ? await uno(db, `${SELECT_LISTA} WHERE p.lugar = ? AND p.fecha > ? AND substr(p.fecha, 1, 10) = ? AND p.id != ?
      ORDER BY p.fecha LIMIT 1`, p.lugar, p.fecha, p.fecha.slice(0, 10), p.id) : null;
    return html(vistaPartido({ estado, p, jugadoresLocal, jugadoresVisita, enVivo: enJuego.length > 0, despues }));
  }

  if (ruta === '/vivo/') {
    const hoy = hoyEcuador();
    const [enJuego, deHoy] = await Promise.all([
      partidosEnJuego(db),
      todos(db, `${SELECT_LISTA} WHERE t.visible = 1 AND substr(p.fecha, 1, 10) = ? AND p.estado NOT IN ('en_vivo','entretiempo') ORDER BY p.fecha, p.lugar`, hoy),
    ]);
    return html(vistaVivo({ enJuego, hoy: deHoy }));
  }

  if (ruta === '/calendario/') {
    const filtro = url.searchParams.get('c') || null;
    const [lista, enJuego, comps] = await Promise.all([
      todos(db, `${SELECT_LISTA} WHERE t.visible = 1 AND p.dia IS NOT NULL ${filtro ? 'AND t.competencia = ?' : ''}
        ORDER BY p.dia, p.hora, p.lugar, p.id`, ...(filtro ? [filtro] : [])),
      partidosEnJuego(db),
      todos(db, `SELECT competencia, MIN(orden) AS o FROM torneos WHERE visible = 1 AND competencia != '' GROUP BY competencia ORDER BY o`),
    ]);
    const fechas = new Map((await todos(db, 'SELECT numero, fecha FROM dias_juego')).map((d) => [d.numero, d.fecha]));
    const dias = [];
    for (const p of lista) {
      if (!dias.length || dias[dias.length - 1].numero !== p.dia) dias.push({ numero: p.dia, fecha: fechas.get(p.dia) || null, partidos: [] });
      dias[dias.length - 1].partidos.push(p);
    }
    return html(vistaCalendario({ dias, enVivo: enJuego.length > 0, competenciasLista: comps.map((c) => c.competencia), filtro }));
  }

  if (ruta === '/tv/') {
    const [enJuego, proximos, resultados] = await Promise.all([
      partidosEnJuego(db), proximosPartidos(db, hoyEcuador(), 5), ultimosResultados(db, 6),
    ]);
    return html(vistaTv({ enJuego, proximos, resultados }));
  }

  if (ruta === '/entrar/') return html(vistaEntrar(url.searchParams.get('estado'), url.searchParams.get('siguiente')));

  m = ruta.match(/^\/calendario\/([a-z0-9-]+)\.ics$/);
  if (m) {
    const torneo = await torneoPorSlug(db, m[1]);
    if (!torneo || !torneo.visible) return null;
    return calendario(torneo, await partidosDeTorneo(db, torneo.id), url);
  }

  return null;
}

// ---------- API pública (para actualizar sin recargar) ----------

export async function apiPublica(request, env, url, ctx) {
  const db = env.DB;
  const ruta = url.pathname;

  if (ruta === '/api/vivo') {
    const lista = await partidosEnJuego(db);
    return json({
      ahora: Date.now(),
      partidos: lista.map((p) => ({
        id: p.id, estado: p.estado, golesLocal: p.goles_local, golesVisita: p.goles_visita,
        relojBase: p.reloj_base, relojInicio: p.reloj_inicio, periodo: p.periodo,
      })),
    });
  }

  // Lista de cursos para elegir "Mi curso" (solo los que tienen equipos en el campeonato).
  if (ruta === '/api/cursos') {
    const cursos = await todos(db, `SELECT c.id, c.nivel, c.nombre FROM cursos c
      WHERE EXISTS (SELECT 1 FROM equipos q JOIN torneos t ON t.id = q.torneo_id AND t.visible = 1 WHERE q.curso_id = c.id)
      ORDER BY c.orden, c.nombre`);
    return json({ cursos }, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  // Resumen de "Mi curso": sus equipos, puesto en cada tabla, partidos de hoy y el próximo.
  if (ruta === '/api/mi-curso') {
    const cursoId = Number(url.searchParams.get('curso'));
    const curso = cursoId ? await uno(db, 'SELECT id, nivel, nombre FROM cursos WHERE id = ?', cursoId) : null;
    if (!curso) return error('Ese curso no existe.', 404);
    const equipos = await todos(db, `SELECT q.id, q.nombre, q.sigla, q.color, t.id AS torneo_id FROM equipos q
      JOIN torneos t ON t.id = q.torneo_id AND t.visible = 1 WHERE q.curso_id = ? ORDER BY t.orden`, cursoId);
    const hoy = hoyEcuador();
    const items = [];
    for (const q of equipos) {
      const torneo = await uno(db, 'SELECT * FROM torneos WHERE id = ?', q.torneo_id);
      const tabla = await posiciones(db, torneo);
      const fila = tabla.find((f) => f.id === q.id);
      const proximo = await uno(db, `${SELECT_LISTA} WHERE (p.local_id = ?1 OR p.visita_id = ?1) AND p.estado != 'finalizado'
        ORDER BY p.estado IN ('en_vivo','entretiempo') DESC, p.dia IS NULL, p.dia, p.hora LIMIT 1`, q.id);
      items.push({
        equipo: q.id, competencia: torneo.competencia || disciplina(torneo).nombre, nivel: torneo.nivel, slug: torneo.slug,
        puesto: fila && fila.pj ? fila.pos : null, puntos: fila ? fila.pts : 0, grupo: fila?.grupo || '',
        proximo: proximo ? {
          id: proximo.id, rival: proximo.local_id === q.id ? (proximo.visita_nombre || proximo.etiqueta_visita) : (proximo.local_nombre || proximo.etiqueta_local),
          hora: proximo.hora, lugar: proximo.lugar, fecha: proximo.fecha, dia: proximo.dia, estado: proximo.estado,
          hoy: Boolean(proximo.fecha && proximo.fecha.startsWith(hoy)),
          marcador: proximo.estado === 'programado' ? null : (proximo.local_id === q.id ? `${proximo.goles_local}–${proximo.goles_visita}` : `${proximo.goles_visita}–${proximo.goles_local}`),
        } : null,
      });
    }
    return json({ curso, items, hoy });
  }

  let m = ruta.match(/^\/api\/partido\/(\d+)$/);
  if (m) {
    const estado = await estadoPartido(db, Number(m[1]));
    if (!estado) return error('Ese partido no existe.', 404);
    return json(estado);
  }

  m = ruta.match(/^\/api\/partido\/(\d+)\/ws$/);
  if (m) return conectar(env, request, Number(m[1]));

  return null;
}

// ---------- Calendario (ICS) para Google Calendar o el celular ----------

function calendario(torneo, partidos, url) {
  const ics = (t) => String(t || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const fechaICS = (f) => f.replace(/[-:]/g, '').slice(0, 13) + '00';
  const sumarMin = (f, min) => {
    const d = new Date(f + ':00Z');
    d.setUTCMinutes(d.getUTCMinutes() + min);
    return d.toISOString().slice(0, 16);
  };
  const duracion = Math.max(30, torneo.periodos * torneo.minutos_periodo + 15);
  const eventos = partidos.filter((p) => p.fecha && p.fecha.length > 10).map((p) => [
    'BEGIN:VEVENT',
    `UID:partido-${p.id}@${url.hostname}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=America/Guayaquil:${fechaICS(p.fecha)}`,
    `DTEND;TZID=America/Guayaquil:${fechaICS(sumarMin(p.fecha, duracion))}`,
    `SUMMARY:${ics(`${p.local_nombre || '?'} vs ${p.visita_nombre || '?'}`)}`,
    `LOCATION:${ics(p.lugar || '')}`,
    `DESCRIPTION:${ics(`${torneo.nombre}\n${url.origin}/partido/${p.id}/`)}`,
    'END:VEVENT',
  ].join('\r\n'));
  const cuerpo = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lev Vygotsky//La Liga Lev//ES', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${ics(`La Liga Lev · ${torneo.nombre}`)}`, 'X-WR-TIMEZONE:America/Guayaquil',
    'BEGIN:VTIMEZONE', 'TZID:America/Guayaquil', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0500', 'TZNAME:-05', 'END:STANDARD', 'END:VTIMEZONE',
    ...eventos, 'END:VCALENDAR',
  ].join('\r\n');
  return new Response(cuerpo, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `inline; filename="${torneo.slug}.ics"`, 'Cache-Control': 'public, max-age=300' },
  });
}

export function noEncontrado() {
  return html(vista404(), 404);
}

export { segundosReloj, ahoraEcuador, e };
