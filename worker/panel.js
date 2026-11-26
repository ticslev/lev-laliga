// Rutas del panel de encargados (formularios con POST que vuelven a la misma página).
import { uno, todos, ejecutar, anotar } from './db.js';
import { html, redirigir, error, textoCorto, slug, siglaDe, entero, fechaValida, colorValido, COLORES, hoyEcuador, sumarDias, ahoraISO } from './util.js';
import { DISCIPLINAS, FASES, ESTADOS, partidosEnJuego, partidosDeArbitro, posiciones, rondasTodosContraTodos } from './datos.js';
import { ROLES, administradores, dominio } from './auth.js';
import { vistaInicio, vistaTorneos, vistaTorneo, vistaEquipo, vistaPartidos, vistaPartido, vistaUsuarios, vistaHistorial, vistaArbitro } from './vistas/panel.js';
import { datosArbitro, puedeArbitrar } from './arbitro.js';
import { cargarEjemplo } from './ejemplo.js';

const SELECT_PARTIDO = `SELECT p.*, t.nombre AS torneo_nombre, t.disciplina,
  l.nombre AS local_nombre, v.nombre AS visita_nombre
  FROM partidos p JOIN torneos t ON t.id = p.torneo_id
  LEFT JOIN equipos l ON l.id = p.local_id LEFT JOIN equipos v ON v.id = p.visita_id`;

// Aviso de "Guardado" que viaja en la URL después de un POST.
function volver(url, mensaje, esError = false) {
  const destino = new URL(url);
  destino.search = '';
  destino.searchParams.set(esError ? 'error' : 'ok', mensaje);
  return redirigir(destino.pathname + destino.search, 303);
}

function avisos(url) {
  return { aviso: textoCorto(url.searchParams.get('ok'), 200), errorTexto: textoCorto(url.searchParams.get('error'), 200) };
}

const COLORES_AUTO = Object.keys(COLORES);

async function nombreTorneo(disciplina, nivel) {
  return `${(DISCIPLINAS[disciplina] || DISCIPLINAS.futbol).nombre} · ${nivel}`;
}

async function slugLibre(db, base, excepto = 0) {
  let s = slug(base) || 'torneo';
  let n = 1;
  while (await uno(db, 'SELECT id FROM torneos WHERE slug = ? AND id != ?', s, excepto)) s = `${slug(base)}-${++n}`;
  return s;
}

async function datosPartidoForm(db) {
  const torneos = await todos(db, 'SELECT id, nombre FROM torneos ORDER BY orden, id');
  const equipos = await todos(db, 'SELECT id, torneo_id, nombre FROM equipos ORDER BY nombre');
  const equiposPorTorneo = {};
  for (const q of equipos) (equiposPorTorneo[q.torneo_id] ||= []).push({ id: q.id, nombre: q.nombre });
  const arbitros = await todos(db, `SELECT email, nombre, rol FROM usuarios WHERE estado = 'aprobado' AND rol IN ('arbitro','editor','admin') ORDER BY rol = 'arbitro' DESC, nombre`);
  return { torneos, equiposPorTorneo, arbitros };
}

async function leerFormularioPartido(db, f) {
  const torneo = await uno(db, 'SELECT id FROM torneos WHERE id = ?', entero(f.get('torneo'), 1, 1e9));
  if (!torneo) return { error: 'Elige un torneo.' };
  const equipo = async (v) => {
    if (!v) return null;
    const q = await uno(db, 'SELECT id FROM equipos WHERE id = ? AND torneo_id = ?', entero(v, 1, 1e9), torneo.id);
    return q ? q.id : undefined;
  };
  const local = await equipo(f.get('local'));
  const visita = await equipo(f.get('visita'));
  if (local === undefined || visita === undefined) return { error: 'Los equipos deben ser del torneo elegido.' };
  if (local && local === visita) return { error: 'Un equipo no puede jugar contra sí mismo.' };
  const fecha = fechaValida(f.get('fecha'));
  if (fecha === undefined) return { error: 'La fecha no es válida.' };
  const fase = Object.hasOwn(FASES, f.get('fase')) ? f.get('fase') : 'grupos';
  let arbitro = String(f.get('arbitro') || '').toLowerCase().trim() || null;
  if (arbitro && !(await uno(db, `SELECT id FROM usuarios WHERE email = ? AND estado = 'aprobado'`, arbitro))) arbitro = null;
  return {
    datos: {
      torneo: torneo.id, local, visita, fecha, fase, arbitro,
      lugar: textoCorto(f.get('lugar'), 60), jornada: entero(f.get('jornada'), 1, 99),
    },
  };
}

export async function rutaPanel(request, env, url, yo) {
  const db = env.DB;
  const ruta = url.pathname;
  const post = request.method === 'POST';
  const f = post ? await request.formData().catch(() => new FormData()) : null;
  const accion = f?.get('accion');

  // ----- Inicio -----
  if (ruta === '/panel/') {
    const mios = await todos(db, `${SELECT_PARTIDO} WHERE p.arbitro_email = ? AND p.estado != 'finalizado' ORDER BY p.fecha IS NULL, p.fecha LIMIT 30`, yo.email);
    if (!yo.editor) return html(vistaInicio({ yo, mios }));
    const hoy = hoyEcuador();
    const [enJuego, deHoy, sinArbitro, hayTorneos, pendientes] = await Promise.all([
      todos(db, `${SELECT_PARTIDO} WHERE p.estado IN ('en_vivo','entretiempo') ORDER BY p.fecha`),
      todos(db, `${SELECT_PARTIDO} WHERE substr(p.fecha, 1, 10) = ? AND p.estado NOT IN ('en_vivo','entretiempo') ORDER BY p.fecha`, hoy),
      uno(db, `SELECT COUNT(*) AS n FROM partidos WHERE estado = 'programado' AND arbitro_email IS NULL AND (fecha IS NULL OR fecha >= ?)`, hoy),
      uno(db, 'SELECT COUNT(*) AS n FROM torneos'),
      uno(db, `SELECT COUNT(*) AS n FROM usuarios WHERE estado = 'pendiente'`),
    ]);
    return html(vistaInicio({ yo, enJuego, hoy: deHoy, mios, sinArbitro: sinArbitro.n, hayTorneos: hayTorneos.n > 0, pendientes: yo.admin ? pendientes.n : 0 }));
  }

  if (ruta === '/panel/ejemplo' && post) {
    if (!yo.admin) return error('Solo para administradores.', 403);
    const hay = await uno(db, 'SELECT COUNT(*) AS n FROM torneos');
    if (hay.n > 0) return redirigir('/panel/?error=' + encodeURIComponent('Ya hay torneos: los datos de ejemplo solo se cargan con la base vacía.'), 303);
    await cargarEjemplo(db, yo.email);
    await anotar(db, yo.email, 'Cargó los datos de ejemplo');
    return redirigir('/panel/?ok=' + encodeURIComponent('Datos de ejemplo cargados. Bórralos desde cada torneo cuando ya no los necesites.'), 303);
  }

  // A partir de aquí, solo editores y administradores.
  if (!yo.editor) return error('Tu rol no permite esta sección.', 403);

  // ----- Torneos -----
  if (ruta === '/panel/torneos/') {
    if (post && accion === 'crear') {
      const disciplina = Object.hasOwn(DISCIPLINAS, f.get('disciplina')) ? f.get('disciplina') : 'futbol';
      const nivel = textoCorto(f.get('nivel'), 60);
      if (!nivel) return volver(url, 'Escribe el nivel o la categoría.', true);
      const temporada = textoCorto(f.get('temporada'), 20) || '';
      const nombre = await nombreTorneo(disciplina, nivel);
      const d = DISCIPLINAS[disciplina];
      const orden = (await uno(db, 'SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM torneos')).n;
      const r = await ejecutar(db, `INSERT INTO torneos (slug, nombre, disciplina, nivel, temporada, periodos, minutos_periodo, puntos_ganar, puntos_empatar, puntos_perder, orden, creado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        await slugLibre(db, nombre), nombre, disciplina, nivel, temporada, d.periodos, d.minutos,
        d.marcador === 'goles' || d.marcador === 'manual' ? 3 : 2, d.empates ? 1 : 0, d.marcador === 'goles' || d.marcador === 'manual' ? 0 : 1, orden, ahoraISO());
      await anotar(db, yo.email, `Creó el torneo ${nombre}`);
      return redirigir(`/panel/torneos/${r.meta.last_row_id}/?ok=` + encodeURIComponent('Torneo creado. Ahora agrega los equipos.'), 303);
    }
    const torneos = await todos(db, `SELECT t.*, (SELECT COUNT(*) FROM equipos q WHERE q.torneo_id = t.id) AS equipos,
      (SELECT COUNT(*) FROM partidos p WHERE p.torneo_id = t.id) AS partidos FROM torneos t ORDER BY t.orden, t.id`);
    return html(vistaTorneos({ yo, torneos, ...avisos(url) }));
  }

  let m = ruta.match(/^\/panel\/torneos\/(\d+)\/$/);
  if (m) {
    const t = await uno(db, 'SELECT * FROM torneos WHERE id = ?', Number(m[1]));
    if (!t) return null;
    if (post) return accionTorneo(db, url, yo, t, accion, f);
    const equipos = await todos(db, `SELECT q.*, (SELECT COUNT(*) FROM jugadores j WHERE j.equipo_id = q.id) AS jugadores FROM equipos q WHERE torneo_id = ? ORDER BY nombre`, t.id);
    const partidos = await todos(db, 'SELECT id, fase FROM partidos WHERE torneo_id = ?', t.id);
    return html(vistaTorneo({ yo, t, equipos, partidos, ...avisos(url) }));
  }

  // ----- Equipos -----
  m = ruta.match(/^\/panel\/equipos\/(\d+)\/$/);
  if (m) {
    const q = await uno(db, 'SELECT * FROM equipos WHERE id = ?', Number(m[1]));
    if (!q) return null;
    const t = await uno(db, 'SELECT * FROM torneos WHERE id = ?', q.torneo_id);
    if (post) return accionEquipo(db, url, yo, q, t, accion, f);
    const jugadores = await todos(db, 'SELECT * FROM jugadores WHERE equipo_id = ? ORDER BY dorsal IS NULL, dorsal, nombre', q.id);
    return html(vistaEquipo({ yo, q, t, jugadores, ...avisos(url) }));
  }

  // ----- Partidos -----
  if (ruta === '/panel/partidos/') {
    if (post && accion === 'crear') {
      const r = await leerFormularioPartido(db, f);
      if (r.error) return volver(url, r.error, true);
      const d = r.datos;
      const ins = await ejecutar(db, `INSERT INTO partidos (torneo_id, fase, jornada, fecha, lugar, local_id, visita_id, arbitro_email, actualizado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, d.torneo, d.fase, d.jornada, d.fecha, d.lugar, d.local, d.visita, d.arbitro, ahoraISO());
      await anotar(db, yo.email, `Creó el partido #${ins.meta.last_row_id}`);
      return redirigir(`/panel/partidos/?t=${d.torneo}&ok=` + encodeURIComponent('Partido creado.'), 303);
    }
    const formulario = await datosPartidoForm(db);
    const torneo = formulario.torneos.find((t) => t.id === entero(url.searchParams.get('t'), 1, 1e9)) || null;
    const partidos = await todos(db, `${SELECT_PARTIDO} ${torneo ? 'WHERE p.torneo_id = ?' : ''} ORDER BY p.fecha IS NULL, p.fecha, p.id LIMIT 300`, ...(torneo ? [torneo.id] : []));
    return html(vistaPartidos({ yo, partidos, torneo, ...formulario, ...avisos(url) }));
  }

  m = ruta.match(/^\/panel\/partidos\/(\d+)\/$/);
  if (m) {
    const p = await uno(db, `${SELECT_PARTIDO} WHERE p.id = ?`, Number(m[1]));
    if (!p) return null;
    if (post) return accionPartido(db, url, yo, p, accion, f);
    return html(vistaPartido({ yo, p, ...(await datosPartidoForm(db)), ...avisos(url) }));
  }

  // ----- Usuarios (solo administradores) -----
  if (ruta === '/panel/usuarios/') {
    if (!yo.admin) return error('Solo para administradores.', 403);
    if (post) return accionUsuarios(db, env, url, yo, accion, f);
    const usuarios = await todos(db, `SELECT * FROM usuarios ORDER BY estado = 'pendiente' DESC, rol, nombre`);
    return html(vistaUsuarios({ yo, usuarios, admins: administradores(env), ...avisos(url) }));
  }

  if (ruta === '/panel/historial/') {
    const filas = await todos(db, 'SELECT * FROM historial ORDER BY id DESC LIMIT 300');
    return html(vistaHistorial({ yo, filas }));
  }

  return null;
}

// ---------- Acciones de torneo ----------

async function accionTorneo(db, url, yo, t, accion, f) {
  if (accion === 'guardar') {
    const disciplina = Object.hasOwn(DISCIPLINAS, f.get('disciplina')) ? f.get('disciplina') : t.disciplina;
    const nivel = textoCorto(f.get('nivel'), 60);
    if (!nivel) return volver(url, 'Escribe el nivel o la categoría.', true);
    const nombre = await nombreTorneo(disciplina, nivel);
    const n = (campo, min, max, def) => entero(f.get(campo), min, max, def);
    await ejecutar(db, `UPDATE torneos SET nombre = ?, slug = ?, disciplina = ?, nivel = ?, temporada = ?, orden = ?, periodos = ?, minutos_periodo = ?,
      puntos_ganar = ?, puntos_empatar = ?, puntos_perder = ?, clasifican = ?, amarillas_suspension = ?, reglamento = ?, visible = ? WHERE id = ?`,
      nombre, nombre === t.nombre ? t.slug : await slugLibre(db, nombre, t.id), disciplina, nivel, textoCorto(f.get('temporada'), 20) || '',
      n('orden', 0, 999, t.orden), n('periodos', 1, 9, t.periodos), n('minutos_periodo', 0, 90, t.minutos_periodo),
      n('puntos_ganar', 0, 10, t.puntos_ganar), n('puntos_empatar', 0, 10, t.puntos_empatar), n('puntos_perder', 0, 10, t.puntos_perder),
      n('clasifican', 0, 16, t.clasifican), n('amarillas_suspension', 0, 10, t.amarillas_suspension),
      String(f.get('reglamento') || '').trim().slice(0, 5000) || null, f.get('visible') ? 1 : 0, t.id);
    await anotar(db, yo.email, `Editó el torneo ${nombre}`);
    return volver(url, 'Cambios guardados.');
  }

  if (accion === 'agregar_equipos') {
    const nombres = String(f.get('nombres') || '').split(/\r?\n/).map((x) => textoCorto(x, 60)).filter(Boolean).slice(0, 40);
    if (!nombres.length) return volver(url, 'Escribe al menos un nombre.', true);
    const ya = (await uno(db, 'SELECT COUNT(*) AS n FROM equipos WHERE torneo_id = ?', t.id)).n;
    await db.batch(nombres.map((nombre, i) => db.prepare('INSERT INTO equipos (torneo_id, nombre, sigla, color, creado) VALUES (?, ?, ?, ?, ?)')
      .bind(t.id, nombre, siglaDe(nombre), COLORES_AUTO[(ya + i) % COLORES_AUTO.length], ahoraISO())));
    await anotar(db, yo.email, `Agregó ${nombres.length} equipo(s) a ${t.nombre}`);
    return volver(url, `${nombres.length} equipo(s) agregado(s).`);
  }

  if (accion === 'generar_fixture') {
    const equipos = await todos(db, 'SELECT id FROM equipos WHERE torneo_id = ? ORDER BY id', t.id);
    if (equipos.length < 2) return volver(url, 'Se necesitan al menos dos equipos.', true);
    const inicio = fechaValida(f.get('inicio'));
    const hora = /^\d{2}:\d{2}$/.test(f.get('hora') || '') ? f.get('hora') : '10:00';
    if (!inicio || inicio.length !== 10) return volver(url, 'Elige la primera fecha.', true);
    const separacion = entero(f.get('separacion'), 0, 600, 60);
    const dias = entero(f.get('dias'), 1, 60, 7);
    const lugares = String(f.get('lugares') || '').split(',').map((x) => textoCorto(x, 60)).filter(Boolean);
    const existentes = (await uno(db, `SELECT COUNT(*) AS n FROM partidos WHERE torneo_id = ? AND fase = 'grupos'`, t.id)).n;
    if (existentes && !f.get('reemplazar')) return volver(url, 'Ya hay un fixture. Marca “Borrar el fixture anterior” para generarlo de nuevo.', true);
    const rondas = rondasTodosContraTodos(equipos.map((q) => q.id), Boolean(f.get('vuelta')));
    const sentencias = [];
    if (existentes) sentencias.push(db.prepare(`DELETE FROM partidos WHERE torneo_id = ? AND fase = 'grupos'`).bind(t.id));
    const [hh, mm] = hora.split(':').map(Number);
    rondas.forEach((ronda, r) => {
      const dia = sumarDias(inicio, r * dias);
      const porTurno = Math.max(lugares.length, 1);
      ronda.forEach(([local, visita], i) => {
        const turno = Math.floor(i / porTurno);
        const minutos = hh * 60 + mm + turno * separacion;
        const fecha = `${dia}T${String(Math.floor(minutos / 60) % 24).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
        sentencias.push(db.prepare(`INSERT INTO partidos (torneo_id, fase, jornada, fecha, lugar, local_id, visita_id, actualizado) VALUES (?, 'grupos', ?, ?, ?, ?, ?, ?)`)
          .bind(t.id, r + 1, fecha, lugares.length ? lugares[i % lugares.length] : null, local, visita, ahoraISO()));
      });
    });
    await db.batch(sentencias);
    const total = rondas.reduce((s, ro) => s + ro.length, 0);
    await anotar(db, yo.email, `Generó el fixture de ${t.nombre} (${rondas.length} jornadas, ${total} partidos)`);
    return volver(url, `Fixture generado: ${rondas.length} jornadas y ${total} partidos. Asigna árbitros en Partidos.`);
  }

  if (accion === 'fase_final') {
    const tabla = await posiciones(db, t);
    const fecha = fechaValida(f.get('fecha')) || null;
    const cruces = f.get('tipo') === 'final'
      ? [['final', 0, 1]]
      : [['semifinal', 0, 3], ['semifinal', 1, 2]];
    const faltan = cruces.some(([, a, b]) => !tabla[a] || !tabla[b]);
    if (faltan) return volver(url, 'No hay suficientes equipos en la tabla para esos cruces.', true);
    await db.batch(cruces.map(([fase, a, b]) => db.prepare(`INSERT INTO partidos (torneo_id, fase, fecha, local_id, visita_id, actualizado) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(t.id, fase, fecha, tabla[a].id, tabla[b].id, ahoraISO())));
    await anotar(db, yo.email, `Creó la fase final de ${t.nombre}`);
    return volver(url, 'Cruces creados. Revísalos en Partidos.');
  }

  if (accion === 'borrar') {
    if (!yo.admin) return error('Solo un administrador puede borrar torneos.', 403);
    await db.batch([
      db.prepare('DELETE FROM eventos WHERE partido_id IN (SELECT id FROM partidos WHERE torneo_id = ?)').bind(t.id),
      db.prepare('DELETE FROM partidos WHERE torneo_id = ?').bind(t.id),
      db.prepare('DELETE FROM jugadores WHERE equipo_id IN (SELECT id FROM equipos WHERE torneo_id = ?)').bind(t.id),
      db.prepare('DELETE FROM equipos WHERE torneo_id = ?').bind(t.id),
      db.prepare('DELETE FROM torneos WHERE id = ?').bind(t.id),
    ]);
    await anotar(db, yo.email, `Borró el torneo ${t.nombre}`);
    return redirigir('/panel/torneos/?ok=' + encodeURIComponent('Torneo borrado.'), 303);
  }
  return volver(url, 'Acción desconocida.', true);
}

// ---------- Acciones de equipo ----------

function leerLineaJugador(linea) {
  const partes = linea.split(/[,;\t]/).map((x) => x.trim()).filter(Boolean);
  if (!partes.length) return null;
  let dorsal = null;
  if (/^\d{1,3}$/.test(partes[0])) dorsal = Number(partes.shift());
  else {
    const m = partes[0].match(/^(\d{1,3})\s+(.+)$/);
    if (m) { dorsal = Number(m[1]); partes[0] = m[2]; }
  }
  const nombre = textoCorto(partes[0], 60);
  if (!nombre) return null;
  return { dorsal, nombre, posicion: textoCorto(partes[1], 30) };
}

async function accionEquipo(db, url, yo, q, t, accion, f) {
  if (accion === 'guardar_equipo') {
    const nombre = textoCorto(f.get('nombre'), 60);
    if (!nombre) return volver(url, 'El nombre no puede quedar vacío.', true);
    const sigla = (textoCorto(f.get('sigla'), 4) || siglaDe(nombre)).toUpperCase();
    await ejecutar(db, 'UPDATE equipos SET nombre = ?, sigla = ?, color = ?, tutor = ?, descripcion = ? WHERE id = ?',
      nombre, sigla, colorValido(f.get('color')), textoCorto(f.get('tutor'), 80), String(f.get('descripcion') || '').trim().slice(0, 600) || null, q.id);
    await anotar(db, yo.email, `Editó el equipo ${nombre}`);
    return volver(url, 'Equipo guardado.');
  }
  if (accion === 'agregar_jugadores') {
    const lista = String(f.get('lista') || '').split(/\r?\n/).map(leerLineaJugador).filter(Boolean).slice(0, 60);
    if (!lista.length) return volver(url, 'Escribe al menos un jugador.', true);
    await db.batch(lista.map((j) => db.prepare('INSERT INTO jugadores (equipo_id, nombre, dorsal, posicion) VALUES (?, ?, ?, ?)').bind(q.id, j.nombre, j.dorsal, j.posicion)));
    await anotar(db, yo.email, `Agregó ${lista.length} jugador(es) a ${q.nombre}`);
    return volver(url, `${lista.length} jugador(es) agregado(s).`);
  }
  const jugadorId = entero(f.get('jugador'), 1, 1e9);
  const j = jugadorId ? await uno(db, 'SELECT * FROM jugadores WHERE id = ? AND equipo_id = ?', jugadorId, q.id) : null;
  if (accion === 'guardar_jugador' && j) {
    const nombre = textoCorto(f.get('nombre'), 60);
    if (!nombre) return volver(url, 'El nombre no puede quedar vacío.', true);
    const capitan = f.get('capitan') ? 1 : 0;
    const sentencias = [];
    if (capitan) sentencias.push(db.prepare('UPDATE jugadores SET capitan = 0 WHERE equipo_id = ?').bind(q.id));
    sentencias.push(db.prepare('UPDATE jugadores SET nombre = ?, dorsal = ?, posicion = ?, capitan = ?, activo = ? WHERE id = ?')
      .bind(nombre, entero(f.get('dorsal'), 0, 999), textoCorto(f.get('posicion'), 30), capitan, f.get('activo') ? 1 : 0, j.id));
    await db.batch(sentencias);
    return volver(url, `${nombre} guardado.`);
  }
  if (accion === 'borrar_jugador' && j) {
    await db.batch([
      db.prepare('DELETE FROM eventos WHERE jugador_id = ? OR jugador2_id = ?').bind(j.id, j.id),
      db.prepare('DELETE FROM jugadores WHERE id = ?').bind(j.id),
    ]);
    await anotar(db, yo.email, `Quitó a ${j.nombre} de ${q.nombre}`);
    return volver(url, `${j.nombre} quitado de la nómina.`);
  }
  if (accion === 'borrar_equipo') {
    await db.batch([
      db.prepare('DELETE FROM eventos WHERE partido_id IN (SELECT id FROM partidos WHERE local_id = ?1 OR visita_id = ?1)').bind(q.id),
      db.prepare('DELETE FROM partidos WHERE local_id = ?1 OR visita_id = ?1').bind(q.id),
      db.prepare('DELETE FROM jugadores WHERE equipo_id = ?').bind(q.id),
      db.prepare('DELETE FROM equipos WHERE id = ?').bind(q.id),
    ]);
    await anotar(db, yo.email, `Borró el equipo ${q.nombre}`);
    return redirigir(`/panel/torneos/${t.id}/?ok=` + encodeURIComponent('Equipo borrado.'), 303);
  }
  return volver(url, 'Acción desconocida.', true);
}

// ---------- Acciones de partido ----------

async function accionPartido(db, url, yo, p, accion, f) {
  if (accion === 'guardar') {
    const r = await leerFormularioPartido(db, f);
    if (r.error) return volver(url, r.error, true);
    const d = r.datos;
    await ejecutar(db, `UPDATE partidos SET torneo_id = ?, fase = ?, jornada = ?, fecha = ?, lugar = ?, local_id = ?, visita_id = ?, arbitro_email = ?, actualizado = ? WHERE id = ?`,
      d.torneo, d.fase, d.jornada, d.fecha, d.lugar, d.local, d.visita, d.arbitro, ahoraISO(), p.id);
    await anotar(db, yo.email, `Editó el partido #${p.id}`);
    return volver(url, 'Partido guardado.');
  }
  if (accion === 'resultado') {
    const estado = Object.hasOwn(ESTADOS, f.get('estado')) ? f.get('estado') : p.estado;
    await ejecutar(db, `UPDATE partidos SET goles_local = ?, goles_visita = ?, estado = ?, nota = ?, reloj_inicio = CASE WHEN ? IN ('en_vivo') THEN reloj_inicio ELSE NULL END, actualizado = ? WHERE id = ?`,
      entero(f.get('goles_local'), 0, 999, 0), entero(f.get('goles_visita'), 0, 999, 0), estado, textoCorto(f.get('nota'), 200), estado, ahoraISO(), p.id);
    await anotar(db, yo.email, `Cambió a mano el resultado del partido #${p.id}`);
    return volver(url, 'Resultado guardado.');
  }
  if (accion === 'borrar') {
    await db.batch([db.prepare('DELETE FROM eventos WHERE partido_id = ?').bind(p.id), db.prepare('DELETE FROM partidos WHERE id = ?').bind(p.id)]);
    await anotar(db, yo.email, `Borró el partido #${p.id} (${p.local_nombre || '?'} vs ${p.visita_nombre || '?'})`);
    return redirigir('/panel/partidos/?ok=' + encodeURIComponent('Partido borrado.'), 303);
  }
  return volver(url, 'Acción desconocida.', true);
}

// ---------- Usuarios ----------

async function accionUsuarios(db, env, url, yo, accion, f) {
  const rolValido = (r) => (Object.hasOwn(ROLES, r) ? r : 'ninguno');
  if (accion === 'guardar') {
    const u = await uno(db, 'SELECT * FROM usuarios WHERE id = ?', entero(f.get('usuario'), 1, 1e9));
    if (!u) return volver(url, 'Ese usuario no existe.', true);
    if (administradores(env).includes(u.email)) return volver(url, 'Ese administrador está fijado en la variable ADMINS.', true);
    const rol = rolValido(f.get('rol'));
    const estado = ['aprobado', 'pendiente', 'bloqueado'].includes(f.get('estado')) ? f.get('estado') : u.estado;
    // Dar un rol aprueba automáticamente a quien estaba pendiente.
    const estadoFinal = rol !== 'ninguno' && estado === 'pendiente' ? 'aprobado' : estado;
    await ejecutar(db, 'UPDATE usuarios SET rol = ?, estado = ? WHERE id = ?', rol, estadoFinal, u.id);
    await anotar(db, yo.email, `Cambió a ${u.email}: ${ROLES[rol] || 'sin rol'}, ${estadoFinal}`);
    return volver(url, `${u.email} actualizado.`);
  }
  if (accion === 'autorizar') {
    const email = String(f.get('email') || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email) || !email.endsWith('@' + dominio(env))) return volver(url, `Escribe un correo @${dominio(env)}.`, true);
    const rol = rolValido(f.get('rol'));
    await ejecutar(db, `INSERT INTO usuarios (email, rol, estado, creado) VALUES (?, ?, 'aprobado', ?)
      ON CONFLICT (email) DO UPDATE SET rol = excluded.rol, estado = 'aprobado'`, email, rol, ahoraISO());
    await anotar(db, yo.email, `Autorizó a ${email} como ${ROLES[rol]}`);
    return volver(url, `${email} podrá entrar como ${ROLES[rol]}.`);
  }
  return volver(url, 'Acción desconocida.', true);
}

// ---------- Panel del árbitro (página) ----------

export async function paginaArbitro(env, yo, partidoId) {
  const datos = await datosArbitro(env.DB, partidoId);
  if (!datos) return null;
  if (!puedeArbitrar(yo, datos.p)) return redirigir('/panel/?error=' + encodeURIComponent('Ese partido no está asignado a tu cuenta.'), 303);
  if (!datos.p.local_id || !datos.p.visita_id) return redirigir(`/panel/partidos/${partidoId}/?error=` + encodeURIComponent('Define los dos equipos antes de arbitrar.'), 303);
  return html(vistaArbitro({ yo, datos }));
}

export { partidosEnJuego, partidosDeArbitro };
