// Consultas y cálculos del campeonato: posiciones, goleadores, fair play, suspensiones, fixture.
import { uno, todos, ejecutar } from './db.js';

// Cómo se juega y se cuenta cada disciplina.
export const DISCIPLINAS = {
  futbol: {
    nombre: 'Fútbol', marcador: 'goles', anotadores: 'Goleadores', unidad: 'goles', empates: true, tarjetas: true,
    botones: [{ valor: 1, etiqueta: 'GOL' }], periodos: 2, minutos: 20, periodoNombre: 'tiempo',
  },
  futsal: {
    nombre: 'Fútbol sala', marcador: 'goles', anotadores: 'Goleadores', unidad: 'goles', empates: true, tarjetas: true,
    botones: [{ valor: 1, etiqueta: 'GOL' }], periodos: 2, minutos: 20, periodoNombre: 'tiempo',
  },
  basquet: {
    nombre: 'Básquet', marcador: 'puntos', anotadores: 'Anotadores', unidad: 'puntos', empates: false, tarjetas: false,
    botones: [{ valor: 1, etiqueta: '+1' }, { valor: 2, etiqueta: '+2' }, { valor: 3, etiqueta: '+3' }], periodos: 4, minutos: 10, periodoNombre: 'cuarto',
  },
  voley: {
    nombre: 'Ecuavóley', marcador: 'sets', anotadores: null, unidad: 'sets', empates: false, tarjetas: false,
    botones: [{ valor: 1, etiqueta: 'SET', sinJugador: true }], periodos: 3, minutos: 0, periodoNombre: 'set',
  },
  otro: {
    nombre: 'Otra disciplina', marcador: 'manual', anotadores: null, unidad: 'puntos', empates: true, tarjetas: false,
    botones: [{ valor: 1, etiqueta: '+1', sinJugador: true }], periodos: 1, minutos: 0, periodoNombre: 'periodo',
  },
};

export function disciplina(torneo) {
  return DISCIPLINAS[torneo?.disciplina] || DISCIPLINAS.futbol;
}

export const RAMAS = { masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto' };

export function nombreCompetencia(disciplina, rama) {
  const d = (DISCIPLINAS[disciplina] || DISCIPLINAS.futbol).nombre;
  return rama && rama !== 'mixto' ? `${d} ${rama}` : d;
}

export const FASES = {
  grupos: 'Fase de grupos',
  cuartos: 'Cuartos de final',
  semifinal: 'Semifinal',
  tercer: 'Tercer lugar',
  final: 'Final',
  amistoso: 'Exhibición',
};

export const ESTADOS = {
  programado: 'Programado',
  en_vivo: 'En vivo',
  entretiempo: 'Descanso',
  finalizado: 'Final',
  suspendido: 'Suspendido',
};

export const EN_JUEGO = ['en_vivo', 'entretiempo'];

// ---------- Reloj ----------

export function segundosReloj(p, ahora = Date.now()) {
  const extra = p.reloj_inicio ? Math.max(0, Math.floor((ahora - p.reloj_inicio) / 1000)) : 0;
  return (p.reloj_base || 0) + extra;
}

export function minutoActual(p, ahora = Date.now()) {
  return Math.floor(segundosReloj(p, ahora) / 60) + 1;
}

// ---------- Lecturas ----------

export async function torneosVisibles(db, { todosLos = false } = {}) {
  return todos(db, `SELECT * FROM torneos ${todosLos ? '' : 'WHERE visible = 1'} ORDER BY orden, id`);
}

export async function torneoPorSlug(db, s) {
  return uno(db, 'SELECT * FROM torneos WHERE slug = ?', s);
}

const SELECT_PARTIDO = `
  SELECT p.*, t.nombre AS torneo_nombre, t.slug AS torneo_slug, t.disciplina, t.nivel, t.competencia,
    l.nombre AS local_nombre, l.sigla AS local_sigla, l.color AS local_color,
    v.nombre AS visita_nombre, v.sigla AS visita_sigla, v.color AS visita_color
  FROM partidos p
  JOIN torneos t ON t.id = p.torneo_id
  LEFT JOIN equipos l ON l.id = p.local_id
  LEFT JOIN equipos v ON v.id = p.visita_id`;

export async function partidosDeTorneo(db, torneoId) {
  return todos(db, `${SELECT_PARTIDO} WHERE p.torneo_id = ? ORDER BY COALESCE(p.jornada, 999), COALESCE(p.dia, 999), p.fecha IS NULL, p.fecha, p.hora, p.id`, torneoId);
}

export async function partidosEnJuego(db) {
  return todos(db, `${SELECT_PARTIDO} WHERE p.estado IN ('en_vivo','entretiempo') AND t.visible = 1 ORDER BY p.fecha`);
}

export async function proximosPartidos(db, desde, limite = 8) {
  return todos(db, `${SELECT_PARTIDO} WHERE p.estado = 'programado' AND t.visible = 1 AND (p.fecha IS NULL OR p.fecha >= ?)
    ORDER BY p.fecha IS NULL, p.fecha, p.dia IS NULL, p.dia, p.hora, p.id LIMIT ?`, desde, limite);
}

export async function ultimosResultados(db, limite = 6) {
  return todos(db, `${SELECT_PARTIDO} WHERE p.estado = 'finalizado' AND t.visible = 1 ORDER BY p.actualizado DESC LIMIT ?`, limite);
}

export async function partidosDeEquipo(db, equipoId) {
  return todos(db, `${SELECT_PARTIDO} WHERE p.local_id = ?1 OR p.visita_id = ?1 ORDER BY p.dia IS NULL, p.dia, p.fecha IS NULL, p.fecha, p.id`, equipoId);
}

export async function partidosDeArbitro(db, email) {
  return todos(db, `${SELECT_PARTIDO} WHERE p.arbitro_email = ? AND p.estado != 'finalizado' ORDER BY p.fecha IS NULL, p.fecha, p.dia, p.hora`, email);
}

export async function partido(db, id) {
  return uno(db, `${SELECT_PARTIDO} WHERE p.id = ?`, id);
}

export async function eventosDe(db, partidoId) {
  return todos(db, `SELECT ev.*, j.nombre AS jugador, j.dorsal, j2.nombre AS jugador2, eq.nombre AS equipo, eq.sigla
    FROM eventos ev
    LEFT JOIN jugadores j ON j.id = ev.jugador_id
    LEFT JOIN jugadores j2 ON j2.id = ev.jugador2_id
    LEFT JOIN equipos eq ON eq.id = ev.equipo_id
    WHERE ev.partido_id = ? AND ev.anulado = 0
    ORDER BY ev.id DESC`, partidoId);
}

export async function jugadoresDe(db, equipoId) {
  return todos(db, 'SELECT * FROM jugadores WHERE equipo_id = ? ORDER BY activo DESC, dorsal IS NULL, dorsal, nombre', equipoId);
}

// Convocados de un equipo (los que el tutor marcó o se cargaron a mano).
export async function convocadosDe(db, equipoId) {
  return todos(db, 'SELECT * FROM jugadores WHERE equipo_id = ? AND convocado = 1 AND activo = 1 ORDER BY dorsal IS NULL, dorsal, nombre', equipoId);
}

// Alumnos activos del curso al que pertenece un equipo.
export async function alumnosDelEquipo(db, equipoId) {
  return todos(db, `SELECT a.id, a.nombre, a.nombre_completo FROM alumnos a JOIN equipos q ON q.curso_id = a.curso_id
    WHERE q.id = ? AND a.activo = 1 ORDER BY a.nombre_completo`, equipoId);
}

// Todo lo que necesita la página del partido y el panel del árbitro.
export async function estadoPartido(db, id) {
  const p = await partido(db, id);
  if (!p) return null;
  const torneo = await uno(db, 'SELECT * FROM torneos WHERE id = ?', p.torneo_id);
  const eventos = await eventosDe(db, id);
  return {
    ahora: Date.now(),
    partido: {
      id: p.id, estado: p.estado, estadoTexto: ESTADOS[p.estado] || p.estado, fase: FASES[p.fase] || p.fase,
      jornada: p.jornada, fecha: p.fecha, lugar: p.lugar, periodo: p.periodo,
      relojBase: p.reloj_base, relojInicio: p.reloj_inicio,
      golesLocal: p.goles_local, golesVisita: p.goles_visita,
      local: { id: p.local_id, nombre: p.local_nombre || p.etiqueta_local || 'Por definir', sigla: p.local_sigla || '?', color: p.local_color || 'gris' },
      visita: { id: p.visita_id, nombre: p.visita_nombre || p.etiqueta_visita || 'Por definir', sigla: p.visita_sigla || '?', color: p.visita_color || 'gris' },
      ganador: p.ganador, marcador: p.marcador, faseCodigo: p.fase, dia: p.dia, hora: p.hora,
      torneo: { nombre: torneo.nombre, slug: torneo.slug, disciplina: torneo.disciplina, periodos: torneo.periodos, minutos: torneo.minutos_periodo, empates: disciplina(torneo).empates },
    },
    eventos: eventos.map((ev) => ({
      id: ev.id, tipo: ev.tipo, equipoId: ev.equipo_id, equipo: ev.equipo, sigla: ev.sigla, valor: ev.valor,
      minuto: ev.minuto, periodo: ev.periodo, jugador: ev.jugador, dorsal: ev.dorsal, jugador2: ev.jugador2, detalle: ev.detalle,
    })),
  };
}

// ---------- Posiciones ----------

// Quién ganó: lo anotado como ganador (resultado rápido o penales) o, si no, el marcador.
export function resultadoDe(p) {
  if (p.ganador === 'local' || p.ganador === 'visita' || p.ganador === 'empate') return p.ganador;
  if (p.goles_local > p.goles_visita) return 'local';
  if (p.goles_local < p.goles_visita) return 'visita';
  return 'empate';
}

function ordenar(filas, torneo) {
  const porGanados = torneo.desempate !== 'diferencia';
  return filas.sort((a, b) =>
    b.pts - a.pts ||
    (porGanados ? b.g - a.g || b.desempate - a.desempate : 0) ||
    b.dg - a.dg || b.gf - a.gf || a.fairplay - b.fairplay ||
    (porGanados ? 0 : b.desempate - a.desempate) ||
    a.nombre.localeCompare(b.nombre, 'es'));
}

// Filas de la tabla (sin los equipos de exhibición), ordenadas dentro de cada grupo.
export async function posiciones(db, torneo) {
  const equipos = await todos(db, 'SELECT * FROM equipos WHERE torneo_id = ? AND exhibicion = 0 ORDER BY nombre', torneo.id);
  const partidos = await todos(db, `SELECT * FROM partidos WHERE torneo_id = ? AND fase = 'grupos' AND estado = 'finalizado'
    AND local_id IS NOT NULL AND visita_id IS NOT NULL ORDER BY fecha, dia, id`, torneo.id);
  const fp = await fairPlay(db, torneo.id);
  const fpPor = new Map(fp.map((f) => [f.id, f.puntos]));
  const tabla = new Map(equipos.map((eq) => [eq.id, {
    id: eq.id, nombre: eq.nombre, sigla: eq.sigla, color: eq.color, grupo: eq.grupo || '', desempate: eq.desempate || 0,
    pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0, forma: [], fairplay: fpPor.get(eq.id) || 0,
  }]));
  for (const pa of partidos) {
    const l = tabla.get(pa.local_id);
    const v = tabla.get(pa.visita_id);
    if (!l || !v) continue; // partido contra un equipo de exhibición: no cuenta
    const r = resultadoDe(pa);
    const anotar = (fila, gano, a, b) => {
      fila.pj++;
      if (pa.marcador) { fila.gf += a; fila.gc += b; }
      if (r === 'empate') { fila.e++; fila.pts += torneo.puntos_empatar; fila.forma.push('E'); }
      else if (gano) { fila.g++; fila.pts += torneo.puntos_ganar; fila.forma.push('G'); }
      else { fila.p++; fila.pts += torneo.puntos_perder; fila.forma.push('P'); }
    };
    anotar(l, r === 'local', pa.goles_local, pa.goles_visita);
    anotar(v, r === 'visita', pa.goles_visita, pa.goles_local);
  }
  const filas = [...tabla.values()].map((f) => ({ ...f, dg: f.gf - f.gc, forma: f.forma.slice(-5) }));
  const grupos = [...new Set(filas.map((f) => f.grupo))].sort();
  return grupos.flatMap((gr) => ordenar(filas.filter((f) => f.grupo === gr), torneo).map((f, i) => ({ ...f, pos: i + 1 })));
}

// Agrupa las filas por grupo: [{ grupo: 'A', filas: [...] }, ...]
export function porGrupo(filas) {
  const mapa = new Map();
  for (const f of filas) {
    if (!mapa.has(f.grupo)) mapa.set(f.grupo, []);
    mapa.get(f.grupo).push(f);
  }
  return [...mapa.entries()].map(([grupo, lista]) => ({ grupo, filas: lista }));
}

// Empates sin resolver que importan: en la línea de clasificación y, cuando hay grupos
// (semifinales cruzadas 1.º vs 2.º del otro grupo), también entre los que clasifican.
export function empatesEnLaLinea(filas, torneo) {
  const avisos = [];
  const iguales = (a, b) => (torneo.desempate === 'diferencia'
    ? a.pts === b.pts && a.dg === b.dg && a.gf === b.gf && a.desempate === b.desempate
    : a.pts === b.pts && a.g === b.g && a.desempate === b.desempate);
  for (const { grupo, filas: lista } of porGrupo(filas)) {
    const k = torneo.clasifican;
    if (!k || !lista.length || !lista.some((f) => f.pj > 0)) continue;
    const lineas = grupo ? Array.from({ length: k }, (_, i) => i + 1) : [k];
    for (const puesto of lineas) {
      const a = lista[puesto - 1];
      const b = lista[puesto];
      if (a && b && iguales(a, b)) avisos.push({ grupo, equipos: [a.nombre, b.nombre], puesto });
    }
  }
  return avisos;
}

// ---------- Cruces que se llenan solos ----------
// Códigos: "pos:1" (1.º del torneo), "pos:2:B" (2.º del grupo B), "ganador:semi1" (ganador de la llave semi1).

export async function completarCruces(db, torneoId) {
  const torneo = await uno(db, 'SELECT * FROM torneos WHERE id = ?', torneoId);
  if (!torneo) return;
  const pendientes = await todos(db, `SELECT * FROM partidos WHERE torneo_id = ? AND (codigo_local IS NOT NULL OR codigo_visita IS NOT NULL)`, torneoId);
  if (!pendientes.length) return;
  const sinJugar = await uno(db, `SELECT COUNT(*) AS n FROM partidos p JOIN equipos l ON l.id = p.local_id JOIN equipos v ON v.id = p.visita_id
    WHERE p.torneo_id = ? AND p.fase = 'grupos' AND p.estado != 'finalizado' AND l.exhibicion = 0 AND v.exhibicion = 0`, torneoId);
  let tabla = null;
  let bloqueados = new Set();
  if (sinJugar.n === 0) {
    tabla = await posiciones(db, torneo);
    bloqueados = new Set(empatesEnLaLinea(tabla, torneo).flatMap((a) => [`${a.grupo}|${a.puesto}`, `${a.grupo}|${a.puesto + 1}`]));
  }
  const llaves = new Map((await todos(db, `SELECT llave, local_id, visita_id, estado, ganador, goles_local, goles_visita FROM partidos
    WHERE torneo_id = ? AND llave IS NOT NULL`, torneoId)).map((p) => [p.llave, p]));
  const resolver = (codigo) => {
    if (!codigo) return undefined;
    let m = codigo.match(/^pos:(\d+)(?::(\w+))?$/);
    if (m) {
      if (!tabla) return null;
      const grupo = m[2] || '';
      if (bloqueados.has(`${grupo}|${m[1]}`)) return null;
      const fila = tabla.find((f) => f.grupo === grupo && f.pos === Number(m[1]));
      return fila ? fila.id : null;
    }
    m = codigo.match(/^ganador:(\w+)$/);
    if (m) {
      const p = llaves.get(m[1]);
      if (!p || p.estado !== 'finalizado') return null;
      const r = resultadoDe(p);
      return r === 'local' ? p.local_id : r === 'visita' ? p.visita_id : null;
    }
    return null;
  };
  const sentencias = [];
  for (const p of pendientes) {
    if (p.estado !== 'programado') continue; // ya se jugó: no se toca
    const l = resolver(p.codigo_local);
    const v = resolver(p.codigo_visita);
    const nuevoL = l === undefined ? p.local_id : l;
    const nuevoV = v === undefined ? p.visita_id : v;
    if (nuevoL !== p.local_id || nuevoV !== p.visita_id) {
      sentencias.push(db.prepare('UPDATE partidos SET local_id = ?, visita_id = ?, actualizado = ? WHERE id = ?')
        .bind(nuevoL, nuevoV, new Date().toISOString(), p.id));
    }
  }
  if (sentencias.length) await db.batch(sentencias);
}

export async function anotadores(db, torneoIds, limite = 10) {
  if (!torneoIds.length) return [];
  const marcas = torneoIds.map(() => '?').join(',');
  return todos(db, `SELECT j.id, j.nombre, eq.id AS equipo_id, eq.nombre AS equipo, eq.color, t.disciplina, SUM(ev.valor) AS total
    FROM eventos ev
    JOIN partidos p ON p.id = ev.partido_id
    JOIN torneos t ON t.id = p.torneo_id
    JOIN jugadores j ON j.id = ev.jugador_id
    JOIN equipos eq ON eq.id = j.equipo_id
    WHERE ev.tipo = 'gol' AND ev.anulado = 0 AND (ev.detalle IS NULL OR ev.detalle != 'autogol') AND p.torneo_id IN (${marcas})
    GROUP BY j.id ORDER BY total DESC, j.nombre LIMIT ?`, ...torneoIds, limite);
}

// Amarilla = 1 punto, roja = 3. Menos es mejor.
export async function fairPlay(db, torneoId) {
  const filas = await todos(db, `SELECT eq.id, eq.nombre, eq.color,
      SUM(CASE WHEN ev.tipo = 'amarilla' THEN 1 ELSE 0 END) AS amarillas,
      SUM(CASE WHEN ev.tipo = 'roja' THEN 1 ELSE 0 END) AS rojas
    FROM equipos eq
    LEFT JOIN eventos ev ON ev.equipo_id = eq.id AND ev.anulado = 0 AND ev.tipo IN ('amarilla','roja')
    WHERE eq.torneo_id = ? AND eq.exhibicion = 0
    GROUP BY eq.id`, torneoId);
  return filas
    .map((f) => ({ ...f, amarillas: f.amarillas || 0, rojas: f.rojas || 0, puntos: (f.amarillas || 0) + 3 * (f.rojas || 0) }))
    .sort((a, b) => a.puntos - b.puntos || a.nombre.localeCompare(b.nombre, 'es'));
}

// Jugadores que no pueden jugar el próximo partido de su equipo:
// roja en su último partido jugado, o completó N amarillas acumuladas en ese partido.
export async function suspendidos(db, torneo) {
  const tarjetas = await todos(db, `SELECT ev.jugador_id, ev.tipo, ev.partido_id, j.nombre, eq.id AS equipo_id, eq.nombre AS equipo
    FROM eventos ev
    JOIN partidos p ON p.id = ev.partido_id
    JOIN jugadores j ON j.id = ev.jugador_id
    JOIN equipos eq ON eq.id = j.equipo_id
    WHERE ev.anulado = 0 AND ev.tipo IN ('amarilla','roja') AND p.torneo_id = ? AND p.estado = 'finalizado'
    ORDER BY p.fecha, p.id, ev.id`, torneo.id);
  if (!tarjetas.length) return [];
  const jugados = await todos(db, `SELECT id, local_id, visita_id FROM partidos WHERE torneo_id = ? AND estado = 'finalizado' ORDER BY fecha, id`, torneo.id);
  const ultimoDe = new Map();
  for (const pa of jugados) {
    ultimoDe.set(pa.local_id, pa.id);
    ultimoDe.set(pa.visita_id, pa.id);
  }
  const porJugador = new Map();
  for (const t of tarjetas) {
    if (!porJugador.has(t.jugador_id)) porJugador.set(t.jugador_id, { ...t, amarillas: 0, motivo: null });
    const j = porJugador.get(t.jugador_id);
    const enUltimo = ultimoDe.get(t.equipo_id) === t.partido_id;
    if (t.tipo === 'amarilla') {
      j.amarillas++;
      if (enUltimo && torneo.amarillas_suspension > 0 && j.amarillas % torneo.amarillas_suspension === 0) {
        j.motivo = `${torneo.amarillas_suspension} amarillas acumuladas`;
      }
    } else if (enUltimo) {
      j.motivo = 'Tarjeta roja';
    }
  }
  return [...porJugador.values()].filter((j) => j.motivo);
}

// ---------- Marcador ----------

export async function recalcularMarcador(db, partidoId) {
  const p = await uno(db, 'SELECT local_id, visita_id FROM partidos WHERE id = ?', partidoId);
  if (!p) return;
  const r = await uno(db, `SELECT
      COALESCE(SUM(CASE WHEN equipo_id = ?2 THEN valor ELSE 0 END), 0) AS l,
      COALESCE(SUM(CASE WHEN equipo_id = ?3 THEN valor ELSE 0 END), 0) AS v
    FROM eventos WHERE partido_id = ?1 AND tipo = 'gol' AND anulado = 0`, partidoId, p.local_id, p.visita_id);
  await ejecutar(db, 'UPDATE partidos SET goles_local = ?, goles_visita = ?, marcador = 1, actualizado = ? WHERE id = ?', r.l, r.v, new Date().toISOString(), partidoId);
}

// Ganador al terminar: el elegido (penales o resultado rápido) o el que hizo más goles/puntos.
// Devuelve null si hay empate y en esa fase o disciplina no se permite.
export function ganadorFinal(p, torneo, elegido) {
  if (elegido === 'local' || elegido === 'visita') return elegido;
  if (p.goles_local > p.goles_visita) return 'local';
  if (p.goles_local < p.goles_visita) return 'visita';
  const permiteEmpate = disciplina(torneo).empates && (p.fase === 'grupos' || p.fase === 'amistoso');
  if (elegido === 'empate' || permiteEmpate) return permiteEmpate ? 'empate' : null;
  return null;
}

// ---------- Fixture automático (todos contra todos, método del círculo) ----------

export function rondasTodosContraTodos(ids, idaYVuelta = false) {
  const lista = [...ids];
  if (lista.length < 2) return [];
  if (lista.length % 2) lista.push(null); // descansa
  const n = lista.length;
  const rondas = [];
  for (let r = 0; r < n - 1; r++) {
    const ronda = [];
    for (let i = 0; i < n / 2; i++) {
      const a = lista[i];
      const b = lista[n - 1 - i];
      if (a !== null && b !== null) ronda.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rondas.push(ronda);
    lista.splice(1, 0, lista.pop());
  }
  if (idaYVuelta) return [...rondas, ...rondas.map((ro) => ro.map(([a, b]) => [b, a]))];
  return rondas;
}
