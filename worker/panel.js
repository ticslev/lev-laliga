// Rutas del panel de encargados (formularios con POST que vuelven a la misma página).
import { uno, todos, ejecutar, anotar, enTandas, ajuste, guardarAjuste } from './db.js';
import { html, json, redirigir, error, textoCorto, slug, siglaDe, siglaUnica, entero, fechaValida, colorValido, COLORES, hoyEcuador, sumarDias, ahoraISO, nombreOrdenado, claveTexto } from './util.js';
import { DISCIPLINAS, FASES, ESTADOS, RAMAS, partidosEnJuego, partidosDeArbitro, posiciones, rondasTodosContraTodos, nombreCompetencia, empatesEnLaLinea, completarCruces, ganadorFinal, disciplina } from './datos.js';
import { ROLES, administradores, dominio } from './auth.js';
import { vistaInicio, vistaTorneos, vistaTorneo, vistaEquipo, vistaPartidos, vistaPartido, vistaUsuarios, vistaHistorial, vistaArbitro, vistaDias, vistaDia, vistaImportar, vistaArbitrar, vistaMas } from './vistas/panel.js';
import { importarCampeonato, importarAlumnos, aplicarFechas, enlazarCursos } from './importar.js';
import { datosArbitro, puedeArbitrar } from './arbitro.js';
import { cargarEjemplo } from './ejemplo.js';

const SELECT_PARTIDO = `SELECT p.*, t.nombre AS torneo_nombre, t.disciplina, t.puntos_empatar,
  l.nombre AS local_nombre, v.nombre AS visita_nombre
  FROM partidos p JOIN torneos t ON t.id = p.torneo_id
  LEFT JOIN equipos l ON l.id = p.local_id LEFT JOIN equipos v ON v.id = p.visita_id`;

// Día de juego que conviene trabajar: el de hoy, el próximo con fecha o el primero con pendientes.
async function diaActual(db) {
  const dias = await todos(db, `SELECT d.numero, d.fecha, COUNT(p.id) AS total,
      SUM(CASE WHEN p.estado = 'finalizado' THEN 1 ELSE 0 END) AS hechos,
      SUM(CASE WHEN p.estado IN ('en_vivo','entretiempo') THEN 1 ELSE 0 END) AS vivos
    FROM dias_juego d JOIN partidos p ON p.dia = d.numero GROUP BY d.numero ORDER BY d.numero`);
  if (!dias.length) return null;
  const hoy = hoyEcuador();
  return dias.find((d) => d.fecha === hoy)
    || dias.find((d) => d.hechos < d.total && (!d.fecha || d.fecha <= hoy))
    || dias.find((d) => d.fecha && d.fecha > hoy)
    || dias.find((d) => d.hechos < d.total)
    || dias[dias.length - 1];
}

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

async function nombreTorneo(disciplina, nivel, rama = 'mixto') {
  return `${nombreCompetencia(disciplina, rama)} · ${nivel}`;
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
  const dia = entero(f.get('dia'), 1, 999);
  const hora = /^\d{2}:\d{2}$/.test(f.get('hora') || '') ? f.get('hora') : null;
  if (dia) await ejecutar(db, 'INSERT INTO dias_juego (numero) VALUES (?) ON CONFLICT (numero) DO NOTHING', dia);
  return {
    datos: {
      torneo: torneo.id, local, visita, fase, arbitro, dia, hora,
      fecha: dia ? null : fecha && hora && fecha.length === 10 ? `${fecha}T${hora}` : fecha,
      lugar: textoCorto(f.get('lugar'), 60), jornada: entero(f.get('jornada'), 1, 99),
    },
  };
}

export async function rutaPanel(request, env, url, yo) {
  const db = env.DB;
  const ruta = url.pathname;
  const post = request.method === 'POST';
  // Importar desde Excel: el navegador envía JSON (no un formulario).
  if (ruta === '/panel/importar/') {
    if (!yo.admin) return error('Solo para administradores.', 403);
    if (post) return accionImportar(request, env, yo);
    const [t, c, a] = await Promise.all([
      uno(db, 'SELECT COUNT(*) AS n FROM torneos'), uno(db, 'SELECT COUNT(*) AS n FROM cursos'), uno(db, 'SELECT COUNT(*) AS n FROM alumnos WHERE activo = 1'),
    ]);
    return html(vistaImportar({ yo, hayTorneos: t.n > 0, resumen: { cursos: c.n, alumnos: a.n } }));
  }

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
    const dia = await diaActual(db);
    const canchas = dia ? await todos(db, `SELECT COALESCE(lugar, 'Sin cancha') AS lugar, COUNT(*) AS total, SUM(estado = 'finalizado') AS hechos
      FROM partidos WHERE dia = ? GROUP BY lugar ORDER BY lugar`, dia.numero) : [];
    const sinResultado = dia ? await todos(db, `${SELECT_PARTIDO} WHERE p.dia = ? AND p.estado = 'programado' AND p.hora IS NOT NULL AND p.hora < ? AND ? >= ?
      ORDER BY p.hora LIMIT 20`, dia.numero, new Date(Date.now() - 5 * 3600 * 1000 - 30 * 60 * 1000).toISOString().slice(11, 16), hoy, dia.fecha || '9999') : [];
    return html(vistaInicio({ yo, enJuego, hoy: deHoy, mios, sinArbitro: sinArbitro.n, hayTorneos: hayTorneos.n > 0, pendientes: yo.admin ? pendientes.n : 0, dia, canchas, sinResultado, ...avisos(url) }));
  }

  // Atajos de las pestañas del celular
  if (ruta === '/panel/resultados/') {
    const dia = await diaActual(db);
    return redirigir(dia ? `/panel/dias/${dia.numero}/` : '/panel/dias/');
  }
  if (ruta === '/panel/arbitrar/') {
    const hoy = hoyEcuador();
    const [enJuego, deHoy] = await Promise.all([
      todos(db, `${SELECT_PARTIDO} WHERE p.estado IN ('en_vivo','entretiempo') ${yo.editor ? '' : 'AND p.arbitro_email = ?'} ORDER BY p.fecha`, ...(yo.editor ? [] : [yo.email])),
      todos(db, `${SELECT_PARTIDO} WHERE substr(p.fecha, 1, 10) = ? AND p.estado = 'programado' AND p.local_id IS NOT NULL AND p.visita_id IS NOT NULL
        ${yo.editor ? '' : 'AND p.arbitro_email = ?'} ORDER BY p.fecha, p.lugar`, hoy, ...(yo.editor ? [] : [yo.email])),
    ]);
    return html(vistaArbitrar({ yo, enJuego, deHoy }));
  }
  if (ruta === '/panel/mas/') return html(vistaMas({ yo }));

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

  // ----- Días de juego -----
  if (ruta === '/panel/dias/') {
    if (post) return accionDias(db, url, yo, accion, f);
    const [dias, semana, feriados] = await Promise.all([
      todos(db, `SELECT d.numero, d.fecha, COUNT(p.id) AS total, SUM(p.estado = 'finalizado') AS jugados,
          SUM(p.estado != 'finalizado' AND p.estado != 'suspendido') AS pendientes
        FROM dias_juego d LEFT JOIN partidos p ON p.dia = d.numero GROUP BY d.numero ORDER BY d.numero`),
      ajuste(db, 'dias_semana', '1,2,3,4,5'),
      ajuste(db, 'feriados', ''),
    ]);
    return html(vistaDias({
      yo, dias: dias.map((d) => ({ ...d, jugados: d.jugados || 0, pendientes: d.pendientes || 0 })),
      diasSemana: semana.split(',').map(Number), feriados: feriados.split(/\s+/).filter(Boolean), ...avisos(url),
    }));
  }

  let m = ruta.match(/^\/panel\/dias\/(\d+)\/$/);
  if (m) {
    const dia = await uno(db, 'SELECT * FROM dias_juego WHERE numero = ?', Number(m[1]));
    if (!dia) return null;
    if (post && accion === 'ganador') return accionGanador(db, url, yo, f);
    const partidos = await todos(db, `${SELECT_PARTIDO} WHERE p.dia = ? ORDER BY p.hora, p.lugar, p.id`, dia.numero);
    const [ant, sig] = await Promise.all([
      uno(db, 'SELECT MAX(numero) AS n FROM dias_juego WHERE numero < ?', dia.numero),
      uno(db, 'SELECT MIN(numero) AS n FROM dias_juego WHERE numero > ?', dia.numero),
    ]);
    return html(vistaDia({ yo, dia, partidos, empatesPor: (p) => disciplina(p).empates, anterior: ant.n, siguiente: sig.n, ...avisos(url) }));
  }

  // ----- Torneos -----
  if (ruta === '/panel/torneos/') {
    if (post && accion === 'crear') {
      const disciplina = Object.hasOwn(DISCIPLINAS, f.get('disciplina')) ? f.get('disciplina') : 'futbol';
      const nivel = textoCorto(f.get('nivel'), 60);
      if (!nivel) return volver(url, 'Escribe el nivel o la categoría.', true);
      const temporada = textoCorto(f.get('temporada'), 20) || '';
      const rama = Object.hasOwn(RAMAS, f.get('rama')) ? f.get('rama') : 'mixto';
      const nombre = await nombreTorneo(disciplina, nivel, rama);
      const d = DISCIPLINAS[disciplina];
      const orden = (await uno(db, 'SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM torneos')).n;
      const r = await ejecutar(db, `INSERT INTO torneos (slug, nombre, disciplina, rama, competencia, nivel, temporada, periodos, minutos_periodo, puntos_ganar, puntos_empatar, puntos_perder, orden, creado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        await slugLibre(db, nombre), nombre, disciplina, rama, nombreCompetencia(disciplina, rama), nivel, temporada, d.periodos, d.minutos,
        d.marcador === 'goles' || d.marcador === 'manual' ? 3 : 2, d.empates ? 1 : 0, d.marcador === 'goles' || d.marcador === 'manual' ? 0 : 1, orden, ahoraISO());
      await anotar(db, yo.email, `Creó el torneo ${nombre}`);
      return redirigir(`/panel/torneos/${r.meta.last_row_id}/?ok=` + encodeURIComponent('Torneo creado. Ahora agrega los equipos.'), 303);
    }
    const torneos = await todos(db, `SELECT t.*, (SELECT COUNT(*) FROM equipos q WHERE q.torneo_id = t.id) AS equipos,
      (SELECT COUNT(*) FROM partidos p WHERE p.torneo_id = t.id) AS partidos FROM torneos t ORDER BY t.orden, t.id`);
    return html(vistaTorneos({ yo, torneos, ...avisos(url) }));
  }

  m = ruta.match(/^\/panel\/torneos\/(\d+)\/$/);
  if (m) {
    const t = await uno(db, 'SELECT * FROM torneos WHERE id = ?', Number(m[1]));
    if (!t) return null;
    if (post) return accionTorneo(db, url, yo, t, accion, f);
    const [equipos, partidos, tabla, cursos] = await Promise.all([
      todos(db, `SELECT q.*, (SELECT COUNT(*) FROM jugadores j WHERE j.equipo_id = q.id) AS jugadores,
        (SELECT COUNT(*) FROM jugadores j WHERE j.equipo_id = q.id AND j.convocado = 1 AND j.alumno_id IS NOT NULL) AS convocados
        FROM equipos q WHERE torneo_id = ? ORDER BY grupo, nombre`, t.id),
      todos(db, 'SELECT id, fase FROM partidos WHERE torneo_id = ?', t.id),
      posiciones(db, t),
      todos(db, 'SELECT id, nivel, nombre FROM cursos'),
    ]);
    return html(vistaTorneo({
      yo, t, equipos, partidos, tabla, avisosEmpate: empatesEnLaLinea(tabla, t),
      cursos: new Map(cursos.map((c) => [c.id, `${c.nivel} ${c.nombre}`])), ...avisos(url),
    }));
  }

  // ----- Equipos -----
  m = ruta.match(/^\/panel\/equipos\/(\d+)\/$/);
  if (m) {
    const q = await uno(db, 'SELECT * FROM equipos WHERE id = ?', Number(m[1]));
    if (!q) return null;
    const t = await uno(db, 'SELECT * FROM torneos WHERE id = ?', q.torneo_id);
    if (post) return accionEquipo(db, url, yo, q, t, accion, f);
    const [jugadores, cursos, alumnos] = await Promise.all([
      todos(db, 'SELECT * FROM jugadores WHERE equipo_id = ? ORDER BY dorsal IS NULL, dorsal, nombre', q.id),
      todos(db, 'SELECT id, nivel, nombre FROM cursos ORDER BY orden, nombre'),
      q.curso_id ? todos(db, 'SELECT id, nombre_completo FROM alumnos WHERE curso_id = ? AND activo = 1 ORDER BY nombre_completo', q.curso_id) : [],
    ]);
    return html(vistaEquipo({ yo, q, t, jugadores, cursos, alumnos: alumnos.map((a) => ({ id: a.id, completo: nombreOrdenado(a.nombre_completo) })), ...avisos(url) }));
  }

  // ----- Partidos -----
  if (ruta === '/panel/partidos/') {
    if (post && accion === 'crear') {
      const r = await leerFormularioPartido(db, f);
      if (r.error) return volver(url, r.error, true);
      const d = r.datos;
      const ins = await ejecutar(db, `INSERT INTO partidos (torneo_id, fase, jornada, dia, hora, fecha, lugar, local_id, visita_id, arbitro_email, actualizado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, d.torneo, d.fase, d.jornada, d.dia, d.hora, d.fecha, d.lugar, d.local, d.visita, d.arbitro, ahoraISO());
      if (d.dia) await aplicarFechas(db);
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
    const rama = Object.hasOwn(RAMAS, f.get('rama')) ? f.get('rama') : t.rama;
    const nombre = await nombreTorneo(disciplina, nivel, rama);
    const n = (campo, min, max, def) => entero(f.get(campo), min, max, def);
    await ejecutar(db, `UPDATE torneos SET nombre = ?, slug = ?, disciplina = ?, rama = ?, competencia = ?, desempate = ?, nivel = ?, temporada = ?, orden = ?, periodos = ?, minutos_periodo = ?,
      puntos_ganar = ?, puntos_empatar = ?, puntos_perder = ?, clasifican = ?, amarillas_suspension = ?, reglamento = ?, visible = ? WHERE id = ?`,
      nombre, nombre === t.nombre ? t.slug : await slugLibre(db, nombre, t.id), disciplina, rama, nombreCompetencia(disciplina, rama),
      f.get('desempate') === 'diferencia' ? 'diferencia' : 'ganados', nivel, textoCorto(f.get('temporada'), 20) || '',
      n('orden', 0, 999, t.orden), n('periodos', 1, 9, t.periodos), n('minutos_periodo', 0, 90, t.minutos_periodo),
      n('puntos_ganar', 0, 10, t.puntos_ganar), n('puntos_empatar', 0, 10, t.puntos_empatar), n('puntos_perder', 0, 10, t.puntos_perder),
      n('clasifican', 0, 16, t.clasifican), n('amarillas_suspension', 0, 10, t.amarillas_suspension),
      String(f.get('reglamento') || '').trim().slice(0, 5000) || null, f.get('visible') ? 1 : 0, t.id);
    await anotar(db, yo.email, `Editó el torneo ${nombre}`);
    await completarCruces(db, t.id);
    return volver(url, 'Cambios guardados.');
  }

  if (accion === 'desempate') {
    const equipos = await todos(db, 'SELECT id FROM equipos WHERE torneo_id = ?', t.id);
    await db.batch(equipos.map((q) => db.prepare('UPDATE equipos SET desempate = ? WHERE id = ?').bind(entero(f.get(`desempate_${q.id}`), 0, 9, 0), q.id)));
    await completarCruces(db, t.id);
    await anotar(db, yo.email, `Actualizó el desempate de ${t.nombre}`);
    return volver(url, 'Desempate guardado.');
  }

  if (accion === 'agregar_equipos') {
    const nombres = String(f.get('nombres') || '').split(/\r?\n/).map((x) => textoCorto(x, 60)).filter(Boolean).slice(0, 40);
    if (!nombres.length) return volver(url, 'Escribe al menos un nombre.', true);
    const existentes = await todos(db, 'SELECT sigla FROM equipos WHERE torneo_id = ?', t.id);
    const siglas = new Set(existentes.map((q) => q.sigla));
    const ya = existentes.length;
    await db.batch(nombres.map((nombre, i) => db.prepare('INSERT INTO equipos (torneo_id, nombre, sigla, color, exhibicion, creado) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(t.id, nombre, /^\d/.test(nombre) ? siglaDe(nombre) : siglaUnica(nombre, siglas), COLORES_AUTO[(ya + i) % COLORES_AUTO.length], /^profe/i.test(nombre) ? 1 : 0, ahoraISO())));
    await enlazarCursos(db);
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
    // Con grupos: todos contra todos dentro de cada grupo, y las rondas de cada grupo se juegan el mismo día.
    const conGrupo = await todos(db, 'SELECT id, grupo FROM equipos WHERE torneo_id = ? ORDER BY grupo, id', t.id);
    const grupos = [...new Set(conGrupo.map((q) => q.grupo || ''))];
    const porGrupoRondas = grupos.map((g) => rondasTodosContraTodos(conGrupo.filter((q) => (q.grupo || '') === g).map((q) => q.id), Boolean(f.get('vuelta'))));
    const rondas = Array.from({ length: Math.max(...porGrupoRondas.map((r) => r.length)) }, (_, i) => porGrupoRondas.flatMap((r) => r[i] || []));
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
        sentencias.push(db.prepare(`INSERT INTO partidos (torneo_id, fase, jornada, fecha, hora, lugar, local_id, visita_id, actualizado) VALUES (?, 'grupos', ?, ?, ?, ?, ?, ?, ?)`)
          .bind(t.id, r + 1, fecha, fecha.slice(11, 16), lugares.length ? lugares[i % lugares.length] : null, local, visita, ahoraISO()));
      });
    });
    await enTandas(db, sentencias);
    const total = rondas.reduce((s, ro) => s + ro.length, 0);
    await anotar(db, yo.email, `Generó el fixture de ${t.nombre} (${rondas.length} jornadas, ${total} partidos)`);
    return volver(url, `Fixture generado: ${rondas.length} jornadas y ${total} partidos. Asigna árbitros en Partidos.`);
  }

  if (accion === 'fase_final') {
    const dia = entero(f.get('dia'), 1, 999);
    if (dia) await ejecutar(db, 'INSERT INTO dias_juego (numero) VALUES (?) ON CONFLICT (numero) DO NOTHING', dia);
    const grupos = [...new Set((await todos(db, 'SELECT grupo FROM equipos WHERE torneo_id = ? AND exhibicion = 0', t.id)).map((q) => q.grupo).filter(Boolean))].sort();
    const etiqueta = (codigo) => {
      const m = codigo.match(/^pos:(\d+)(?::(\w+))?$/);
      if (m) return `${m[1]}.º ${m[2] ? 'Grupo ' + m[2] : t.nivel}`;
      return codigo === 'ganador:semi1' ? 'Ganador semifinal 1' : 'Ganador semifinal 2';
    };
    let cruces;
    if (f.get('tipo') === 'cruzadas' && grupos.length >= 2) {
      const [A, B] = grupos;
      cruces = [['semifinal', 'semi1', `pos:1:${A}`, `pos:2:${B}`], ['semifinal', 'semi2', `pos:1:${B}`, `pos:2:${A}`], ['final', 'final', 'ganador:semi1', 'ganador:semi2']];
    } else if (f.get('tipo') === 'semis') {
      cruces = [['semifinal', 'semi1', 'pos:1', 'pos:4'], ['semifinal', 'semi2', 'pos:2', 'pos:3'], ['final', 'final', 'ganador:semi1', 'ganador:semi2']];
    } else {
      cruces = [['final', 'final', 'pos:1', 'pos:2']];
    }
    await db.batch(cruces.map(([fase, llave, cl, cv]) => db.prepare(`INSERT INTO partidos (torneo_id, fase, llave, dia, codigo_local, codigo_visita, etiqueta_local, etiqueta_visita, actualizado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(t.id, fase, llave, fase === 'final' ? dia : null, cl, cv, etiqueta(cl), etiqueta(cv), ahoraISO())));
    await aplicarFechas(db);
    await completarCruces(db, t.id);
    await anotar(db, yo.email, `Creó la fase final de ${t.nombre}`);
    return volver(url, 'Cruces creados. Se completan solos al terminar la fase de grupos; ajusta día y cancha en Partidos.');
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
    const curso = entero(f.get('curso'), 1, 1e9);
    const cursoOk = curso ? await uno(db, 'SELECT id FROM cursos WHERE id = ?', curso) : null;
    const grupo = (textoCorto(f.get('grupo'), 2) || '').toUpperCase() || null;
    await ejecutar(db, 'UPDATE equipos SET nombre = ?, sigla = ?, color = ?, tutor = ?, descripcion = ?, grupo = ?, exhibicion = ?, curso_id = ? WHERE id = ?',
      nombre, sigla, colorValido(f.get('color')), textoCorto(f.get('tutor'), 80), String(f.get('descripcion') || '').trim().slice(0, 600) || null,
      grupo, f.get('exhibicion') ? 1 : 0, cursoOk ? cursoOk.id : null, q.id);
    await completarCruces(db, t.id);
    await anotar(db, yo.email, `Editó el equipo ${nombre}`);
    return volver(url, 'Equipo guardado.');
  }
  if (accion === 'convocados') {
    if (!q.curso_id) return volver(url, 'Este equipo no está unido a un curso.', true);
    const alumnos = await todos(db, 'SELECT id, nombre FROM alumnos WHERE curso_id = ? AND activo = 1', q.curso_id);
    const actuales = new Map((await todos(db, 'SELECT id, alumno_id FROM jugadores WHERE equipo_id = ? AND alumno_id IS NOT NULL', q.id)).map((j) => [j.alumno_id, j.id]));
    const sentencias = [];
    let marcados = 0;
    for (const a of alumnos) {
      const conv = f.get(`c_${a.id}`) ? 1 : 0;
      const dorsal = entero(f.get(`d_${a.id}`), 0, 999);
      marcados += conv;
      if (actuales.has(a.id)) {
        sentencias.push(db.prepare('UPDATE jugadores SET convocado = ?, dorsal = ?, nombre = ? WHERE id = ?').bind(conv, dorsal, a.nombre, actuales.get(a.id)));
      } else if (conv) {
        sentencias.push(db.prepare('INSERT INTO jugadores (equipo_id, nombre, dorsal, alumno_id, convocado, activo) VALUES (?, ?, ?, ?, 1, 1)').bind(q.id, a.nombre, dorsal, a.id));
      }
    }
    await enTandas(db, sentencias);
    await anotar(db, yo.email, `Marcó ${marcados} convocado(s) en ${q.nombre} (${t.nombre})`);
    return volver(url, `${marcados} convocado(s) guardado(s).`);
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
    // Si se eligen los equipos a mano, el cruce deja de llenarse solo.
    const codL = d.local === p.local_id ? p.codigo_local : d.local ? null : p.codigo_local;
    const codV = d.visita === p.visita_id ? p.codigo_visita : d.visita ? null : p.codigo_visita;
    await ejecutar(db, `UPDATE partidos SET torneo_id = ?, fase = ?, jornada = ?, dia = ?, hora = ?, fecha = ?, lugar = ?, local_id = ?, visita_id = ?, arbitro_email = ?,
      codigo_local = ?, codigo_visita = ?, actualizado = ? WHERE id = ?`,
      d.torneo, d.fase, d.jornada, d.dia, d.hora, d.fecha, d.lugar, d.local, d.visita, d.arbitro, codL, codV, ahoraISO(), p.id);
    if (d.dia) await aplicarFechas(db);
    await anotar(db, yo.email, `Editó el partido #${p.id}`);
    return volver(url, 'Partido guardado.');
  }
  if (accion === 'resultado') {
    const estado = Object.hasOwn(ESTADOS, f.get('estado')) ? f.get('estado') : p.estado;
    const gl = entero(f.get('goles_local'), 0, 999, 0);
    const gv = entero(f.get('goles_visita'), 0, 999, 0);
    let ganador = null;
    if (estado === 'finalizado') {
      const torneo = await uno(db, 'SELECT * FROM torneos WHERE id = ?', p.torneo_id);
      ganador = ganadorFinal({ ...p, goles_local: gl, goles_visita: gv }, torneo, f.get('ganador'));
      if (!ganador) return volver(url, 'Hay empate y en esta fase debe haber un ganador: elige quién ganó en penales.', true);
    }
    await ejecutar(db, `UPDATE partidos SET goles_local = ?, goles_visita = ?, marcador = 1, ganador = ?, estado = ?, nota = ?, reloj_inicio = CASE WHEN ? IN ('en_vivo') THEN reloj_inicio ELSE NULL END, actualizado = ? WHERE id = ?`,
      gl, gv, ganador, estado, textoCorto(f.get('nota'), 200), estado, ahoraISO(), p.id);
    await completarCruces(db, p.torneo_id);
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

// ---------- Importar ----------

async function accionImportar(request, env, yo) {
  let datos;
  try {
    datos = await request.json();
  } catch {
    return error('Datos no válidos.');
  }
  const db = env.DB;
  const partes = [];
  try {
    if (Array.isArray(datos.alumnos) && datos.alumnos.length) {
      const r = await importarAlumnos(db, datos.alumnos);
      partes.push(`${r.alumnos} alumnos en ${r.cursos} cursos`);
    }
    if (Array.isArray(datos.campeonato) && datos.campeonato.length) {
      const r = await importarCampeonato(db, datos.campeonato, { reemplazar: Boolean(datos.reemplazar), temporada: textoCorto(datos.temporada, 20) || '' });
      partes.unshift(`${r.torneos} torneos, ${r.equipos} equipos, ${r.partidos} partidos y ${r.dias} días de juego (${r.enlazados} equipos unidos a su curso)`);
    }
  } catch (e) {
    return error(e.message || 'No se pudo importar.', 400);
  }
  if (!partes.length) return error('No hay nada que importar.');
  const mensaje = `Importado: ${partes.join('; ')}.`;
  await anotar(db, yo.email, mensaje);
  return json({ ok: true, mensaje });
}

// ---------- Días de juego ----------

function diaSemana(fecha) {
  return new Date(fecha + 'T12:00:00Z').getUTCDay();
}

// Próximo día de clases desde "fecha" (incluida si incluir = true).
function diaDeClases(fecha, semana, feriados, incluir) {
  let d = incluir ? fecha : sumarDias(fecha, 1);
  for (let i = 0; i < 400; i++) {
    if (semana.has(diaSemana(d)) && !feriados.has(d)) return d;
    d = sumarDias(d, 1);
  }
  return d;
}

async function recalcularDesde(db, desde, fecha) {
  const semana = new Set((await ajuste(db, 'dias_semana', '1,2,3,4,5')).split(',').map(Number));
  const feriados = new Set((await ajuste(db, 'feriados', '')).split(/\s+/).filter(Boolean));
  if (!semana.size) throw new Error('Elige al menos un día de la semana.');
  const dias = await todos(db, 'SELECT numero FROM dias_juego WHERE numero >= ? ORDER BY numero', desde);
  let actual = diaDeClases(fecha, semana, feriados, true);
  const sentencias = [];
  for (const d of dias) {
    sentencias.push(db.prepare('UPDATE dias_juego SET fecha = ? WHERE numero = ?').bind(actual, d.numero));
    actual = diaDeClases(actual, semana, feriados, false);
  }
  await enTandas(db, sentencias);
  await aplicarFechas(db);
  return dias.length;
}

async function accionDias(db, url, yo, accion, f) {
  try {
    if (accion === 'calcular') {
      const desde = entero(f.get('desde'), 1, 999, 1);
      const fecha = fechaValida(f.get('fecha'));
      if (!fecha || fecha.length !== 10) return volver(url, 'Elige la fecha.', true);
      const semana = f.getAll('semana').map((x) => entero(x, 0, 6)).filter((x) => x !== null);
      if (!semana.length) return volver(url, 'Elige al menos un día de la semana.', true);
      const feriados = String(f.get('feriados') || '').split(/[\s,;]+/).map((x) => fechaValida(x)).filter((x) => x && x.length === 10);
      await guardarAjuste(db, 'dias_semana', semana.join(','));
      await guardarAjuste(db, 'feriados', feriados.join(' '));
      const n = await recalcularDesde(db, desde, fecha);
      await anotar(db, yo.email, `Calculó las fechas de ${n} días de juego desde el día ${desde} (${fecha})`);
      return volver(url, `Fechas asignadas a ${n} días de juego.`);
    }
    const numero = entero(f.get('dia'), 1, 999);
    const dia = numero ? await uno(db, 'SELECT * FROM dias_juego WHERE numero = ?', numero) : null;
    if (!dia) return volver(url, 'Ese día de juego no existe.', true);
    if (accion === 'fecha') {
      const fecha = fechaValida(f.get('fecha'));
      if (fecha === undefined || (fecha && fecha.length !== 10)) return volver(url, 'La fecha no es válida.', true);
      await ejecutar(db, 'UPDATE dias_juego SET fecha = ? WHERE numero = ?', fecha, numero);
      await aplicarFechas(db);
      await anotar(db, yo.email, `Puso el día de juego ${numero} el ${fecha || '(sin fecha)'}`);
      return volver(url, `Día ${numero} guardado.`);
    }
    if (accion === 'posponer') {
      if (!dia.fecha) return volver(url, 'Ese día no tiene fecha.', true);
      const semana = new Set((await ajuste(db, 'dias_semana', '1,2,3,4,5')).split(',').map(Number));
      const feriados = new Set((await ajuste(db, 'feriados', '')).split(/\s+/).filter(Boolean));
      const nueva = diaDeClases(dia.fecha, semana, feriados, false);
      const n = await recalcularDesde(db, numero, nueva);
      await anotar(db, yo.email, `Pospuso el día de juego ${numero} (${dia.fecha} → ${nueva}) y ${n - 1} días siguientes`);
      return volver(url, `Día ${numero} pospuesto al ${nueva}; los ${n - 1} días siguientes también se corrieron.`);
    }
  } catch (e) {
    return volver(url, e.message || 'No se pudo guardar.', true);
  }
  return volver(url, 'Acción desconocida.', true);
}

// Resultado rápido: solo quién ganó (como en el Excel).
async function accionGanador(db, url, yo, f) {
  const p = await uno(db, `${SELECT_PARTIDO} WHERE p.id = ?`, entero(f.get('partido'), 1, 1e9));
  if (!p) return volver(url, 'Ese partido no existe.', true);
  if (!p.local_id || !p.visita_id) return volver(url, 'El cruce todavía no tiene equipos.', true);
  const valor = String(f.get('valor') || '');
  const goles = await uno(db, `SELECT COUNT(*) AS n FROM eventos WHERE partido_id = ? AND tipo = 'gol' AND anulado = 0`, p.id);
  if (valor === 'borrar') {
    await ejecutar(db, `UPDATE partidos SET estado = 'programado', ganador = NULL, marcador = 1, reloj_inicio = NULL, actualizado = ? WHERE id = ?`, ahoraISO(), p.id);
  } else {
    if (!['local', 'visita', 'empate'].includes(valor)) return volver(url, 'Resultado no válido.', true);
    if (valor === 'empate' && !(disciplina(p).empates && (p.fase === 'grupos' || p.fase === 'amistoso'))) return volver(url, 'En esta fase o disciplina no hay empate.', true);
    // Si el árbitro registró goles, se conservan; si no, el partido queda solo con el ganador.
    await ejecutar(db, `UPDATE partidos SET estado = 'finalizado', ganador = ?, marcador = ?, reloj_inicio = NULL,
      goles_local = CASE WHEN ? THEN goles_local ELSE 0 END, goles_visita = CASE WHEN ? THEN goles_visita ELSE 0 END, actualizado = ? WHERE id = ?`,
      valor, goles.n ? 1 : 0, goles.n ? 1 : 0, goles.n ? 1 : 0, ahoraISO(), p.id);
  }
  await completarCruces(db, p.torneo_id);
  const quien = valor === 'local' ? p.local_nombre : valor === 'visita' ? p.visita_nombre : valor === 'empate' ? 'empate' : 'sin resultado';
  await anotar(db, yo.email, `Resultado rápido #${p.id} (${p.local_nombre} vs ${p.visita_nombre}): ${quien}`);
  return volver(url, `Guardado: ${quien === 'empate' ? 'empate' : quien === 'sin resultado' ? 'resultado quitado' : 'ganó ' + quien}.`);
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
