// Acciones del árbitro: reloj, goles, tarjetas, cambios, deshacer.
// Cada acción guarda en D1 y avisa a la sala en vivo del partido.
import { uno, ejecutar, anotar } from './db.js';
import { json, error, entero, textoCorto, ahoraISO } from './util.js';
import { estadoPartido, recalcularMarcador, segundosReloj, minutoActual, convocadosDe, alumnosDelEquipo, partido as leerPartido, disciplina, ganadorFinal, completarCruces } from './datos.js';
import { nombreOrdenado } from './util.js';
import { avisar } from './vivo.js';
import { avisarGol } from './avisos.js';

export function puedeArbitrar(yo, p) {
  return yo && (yo.editor || (yo.rol === 'arbitro' && p.arbitro_email && p.arbitro_email.toLowerCase() === yo.email));
}

const TIPOS_EVENTO = new Set(['gol', 'amarilla', 'roja', 'cambio', 'nota']);

export async function accionArbitro(request, env, ctx, yo, partidoId) {
  const db = env.DB;
  const p = await uno(db, 'SELECT p.*, t.periodos, t.minutos_periodo, t.disciplina FROM partidos p JOIN torneos t ON t.id = p.torneo_id WHERE p.id = ?', partidoId);
  if (!p) return error('Ese partido no existe.', 404);
  if (!puedeArbitrar(yo, p)) return error('Este partido no está asignado a tu cuenta.', 403);

  let datos;
  try {
    datos = await request.json();
  } catch {
    return error('Datos no válidos.');
  }
  const accion = String(datos.accion || '');
  // Momento del toque (si el celular estuvo sin señal, llega después): máximo 15 minutos atrás.
  const real = Date.now();
  const t = Number(datos.t);
  const ahora = Number.isFinite(t) ? Math.min(real, Math.max(real - 15 * 60 * 1000, t)) : real;
  const iso = ahoraISO();
  const corriendo = Boolean(p.reloj_inicio);
  const acumulado = segundosReloj(p, ahora);

  if (p.estado === 'finalizado' && accion !== 'reabrir') {
    return error('El partido ya terminó. Un editor puede reabrirlo.', 409);
  }

  const evento = async (tipo, extra = {}) => {
    await ejecutar(db, `INSERT INTO eventos (partido_id, tipo, equipo_id, jugador_id, jugador2_id, valor, minuto, periodo, detalle, cliente_id, autor, creado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (cliente_id) DO NOTHING`,
      partidoId, tipo, extra.equipo ?? null, extra.jugador ?? null, extra.jugador2 ?? null, extra.valor ?? 1,
      extra.minuto ?? null, extra.periodo ?? p.periodo, extra.detalle ?? null, extra.clienteId ?? null, yo.email, iso);
  };

  switch (accion) {
    case 'iniciar': {
      // Empieza el primer periodo o el siguiente.
      if (p.estado === 'en_vivo') return error('El partido ya está en juego.', 409);
      const periodo = Math.min((p.periodo || 0) + 1, Math.max(p.periodos, 1) + 2);
      const base = (periodo - 1) * (p.minutos_periodo || 0) * 60;
      await ejecutar(db, `UPDATE partidos SET estado = 'en_vivo', periodo = ?, reloj_base = ?, reloj_inicio = ?, actualizado = ? WHERE id = ?`,
        periodo, base, ahora, iso, partidoId);
      await evento('inicio', { periodo, minuto: Math.floor(base / 60) });
      if (periodo === 1) await anotar(db, yo.email, `Inició el partido #${partidoId}`);
      break;
    }
    case 'pausar':
      if (!corriendo) return error('El reloj ya está detenido.', 409);
      await ejecutar(db, 'UPDATE partidos SET reloj_base = ?, reloj_inicio = NULL, actualizado = ? WHERE id = ?', acumulado, iso, partidoId);
      break;
    case 'reanudar':
      if (corriendo) return error('El reloj ya está corriendo.', 409);
      if (p.estado !== 'en_vivo') return error('Primero inicia el periodo.', 409);
      await ejecutar(db, 'UPDATE partidos SET reloj_inicio = ?, actualizado = ? WHERE id = ?', ahora, iso, partidoId);
      break;
    case 'fin_periodo':
      if (p.estado !== 'en_vivo') return error('No hay un periodo en juego.', 409);
      await ejecutar(db, `UPDATE partidos SET estado = 'entretiempo', reloj_base = ?, reloj_inicio = NULL, actualizado = ? WHERE id = ?`, acumulado, iso, partidoId);
      await evento('entretiempo', { minuto: Math.max(1, Math.ceil(acumulado / 60)) });
      break;
    case 'finalizar': {
      if (p.estado === 'programado') return error('El partido no ha empezado.', 409);
      const ganador = ganadorFinal(p, p, datos.ganador);
      if (!ganador) return error('El partido está empatado y en esta fase debe haber un ganador: elige quién ganó (por ejemplo, en penales).', 409);
      await ejecutar(db, `UPDATE partidos SET estado = 'finalizado', ganador = ?, reloj_base = ?, reloj_inicio = NULL, actualizado = ? WHERE id = ?`, ganador, acumulado, iso, partidoId);
      await evento('fin', { minuto: Math.max(1, Math.ceil(acumulado / 60)), detalle: datos.ganador && p.goles_local === p.goles_visita ? 'penales' : null });
      await anotar(db, yo.email, `Finalizó el partido #${partidoId} (${p.goles_local}–${p.goles_visita})`);
      await completarCruces(db, p.torneo_id);
      break;
    }
    case 'reabrir':
      if (!yo.editor) return error('Solo un editor puede reabrir un partido terminado.', 403);
      // Vuelve al último periodo con el reloj detenido, para corregir o seguir.
      await ejecutar(db, `UPDATE partidos SET estado = 'en_vivo', ganador = NULL, reloj_inicio = NULL, actualizado = ? WHERE id = ?`, iso, partidoId);
      await ejecutar(db, `UPDATE eventos SET anulado = 1 WHERE partido_id = ? AND tipo = 'fin'`, partidoId);
      await anotar(db, yo.email, `Reabrió el partido #${partidoId}`);
      break;
    case 'ajustar_reloj': {
      const seg = entero(datos.segundos, 0, 6 * 3600);
      if (seg === null) return error('Tiempo no válido.');
      await ejecutar(db, 'UPDATE partidos SET reloj_base = ?, reloj_inicio = ?, actualizado = ? WHERE id = ?', seg, corriendo ? ahora : null, iso, partidoId);
      break;
    }
    case 'evento': {
      const tipo = String(datos.tipo || '');
      if (!TIPOS_EVENTO.has(tipo)) return error('Tipo de evento no válido.');
      if (p.estado === 'programado') return error('Primero inicia el partido.', 409);
      const equipo = Number(datos.equipo);
      if (equipo !== p.local_id && equipo !== p.visita_id) return error('Equipo no válido.');
      const autogol = tipo === 'gol' && datos.detalle === 'autogol';
      // En un autogol el jugador es del equipo contrario al que suma.
      const equipoJugador = autogol ? (equipo === p.local_id ? p.visita_id : p.local_id) : equipo;
      const validarJugador = async (id) => {
        if (id === null || id === undefined || id === '') return null;
        const j = await uno(db, 'SELECT id FROM jugadores WHERE id = ? AND equipo_id = ?', Number(id), tipo === 'cambio' ? equipo : equipoJugador);
        return j ? j.id : undefined;
      };
      // Alumno del curso que no estaba convocado: se agrega al equipo (sin marcarlo como convocado).
      const desdeAlumno = async (alumnoId, equipoDelAlumno) => {
        if (alumnoId === null || alumnoId === undefined || alumnoId === '') return null;
        const a = await uno(db, `SELECT a.id, a.nombre FROM alumnos a JOIN equipos q ON q.curso_id = a.curso_id WHERE a.id = ? AND q.id = ?`, Number(alumnoId), equipoDelAlumno);
        if (!a) return undefined;
        const ya = await uno(db, 'SELECT id FROM jugadores WHERE equipo_id = ? AND alumno_id = ?', equipoDelAlumno, a.id);
        if (ya) return ya.id;
        const r = await ejecutar(db, 'INSERT INTO jugadores (equipo_id, nombre, alumno_id, convocado, activo) VALUES (?, ?, ?, 0, 1)', equipoDelAlumno, a.nombre, a.id);
        return r.meta.last_row_id;
      };
      const jugador = datos.alumno ? await desdeAlumno(datos.alumno, tipo === 'cambio' ? equipo : equipoJugador) : await validarJugador(datos.jugador);
      const jugador2 = tipo === 'cambio' ? (datos.alumno2 ? await desdeAlumno(datos.alumno2, equipo) : await validarJugador(datos.jugador2)) : null;
      if (jugador === undefined || jugador2 === undefined) return error('Ese jugador no es de este equipo.');
      const d = disciplina(p);
      const valores = new Set(d.botones.map((b) => b.valor));
      const valor = tipo === 'gol' ? (valores.has(Number(datos.valor)) ? Number(datos.valor) : 1) : 1;
      const minuto = entero(datos.minuto, 0, 300, minutoActual(p, ahora));
      const clienteId = typeof datos.clienteId === 'string' && /^[\w-]{8,64}$/.test(datos.clienteId) ? datos.clienteId : null;
      await evento(tipo, {
        equipo, jugador, jugador2, valor, minuto, clienteId,
        detalle: autogol ? 'autogol' : textoCorto(datos.detalle, 140),
      });
      if (tipo === 'gol') {
        await recalcularMarcador(db, partidoId);
        await avisoDeGol(env, ctx, partidoId, equipo, jugador, valor);
      }
      break;
    }
    case 'asignar': {
      // Gol o tarjeta registrado primero, jugador elegido después.
      const ev = typeof datos.clienteId === 'string'
        ? await uno(db, 'SELECT * FROM eventos WHERE cliente_id = ? AND partido_id = ? AND anulado = 0', datos.clienteId, partidoId)
        : null;
      if (!ev) return error('Ese registro ya no existe.', 404);
      const equipoJugador = ev.detalle === 'autogol' ? (ev.equipo_id === p.local_id ? p.visita_id : p.local_id) : ev.equipo_id;
      let jugadorId = null;
      if (datos.alumno) {
        const a = await uno(db, `SELECT a.id, a.nombre FROM alumnos a JOIN equipos q ON q.curso_id = a.curso_id WHERE a.id = ? AND q.id = ?`, Number(datos.alumno), equipoJugador);
        if (!a) return error('Ese alumno no es del curso.');
        const ya = await uno(db, 'SELECT id FROM jugadores WHERE equipo_id = ? AND alumno_id = ?', equipoJugador, a.id);
        jugadorId = ya ? ya.id : (await ejecutar(db, 'INSERT INTO jugadores (equipo_id, nombre, alumno_id, convocado, activo) VALUES (?, ?, ?, 0, 1)', equipoJugador, a.nombre, a.id)).meta.last_row_id;
      } else if (datos.jugador) {
        const j = await uno(db, 'SELECT id FROM jugadores WHERE id = ? AND equipo_id = ?', Number(datos.jugador), equipoJugador);
        if (!j) return error('Ese jugador no es de este equipo.');
        jugadorId = j.id;
      }
      await ejecutar(db, 'UPDATE eventos SET jugador_id = ? WHERE id = ?', jugadorId, ev.id);
      break;
    }
    case 'anular': {
      const id = entero(datos.evento, 1, Number.MAX_SAFE_INTEGER);
      const ev = id ? await uno(db, 'SELECT id, tipo FROM eventos WHERE id = ? AND partido_id = ? AND anulado = 0', id, partidoId) : null;
      if (!ev) return error('Ese registro ya no existe.', 404);
      await ejecutar(db, 'UPDATE eventos SET anulado = 1 WHERE id = ?', ev.id);
      if (ev.tipo === 'gol') await recalcularMarcador(db, partidoId);
      await anotar(db, yo.email, `Anuló un registro (${ev.tipo}) en el partido #${partidoId}`);
      break;
    }
    default:
      return error('Acción desconocida.');
  }

  const estado = await estadoPartido(db, partidoId);
  avisar(env, ctx, partidoId, estado);
  return json(estado);
}

// Datos para el panel del árbitro (incluye las nóminas).
export async function datosArbitro(db, partidoId) {
  const p = await leerPartido(db, partidoId);
  if (!p) return null;
  // Para cada equipo: convocados (si el tutor los marcó) y todo el curso para buscar.
  const nomina = async (equipoId) => {
    if (!equipoId) return { convocados: [], curso: [] };
    const [convocados, curso] = await Promise.all([convocadosDe(db, equipoId), alumnosDelEquipo(db, equipoId)]);
    const ya = new Set(convocados.map((j) => j.alumno_id).filter(Boolean));
    return {
      convocados: convocados.map((j) => ({ id: j.id, nombre: j.nombre, dorsal: j.dorsal })),
      curso: curso.filter((a) => !ya.has(a.id)).map((a) => ({ alumno: a.id, nombre: nombreOrdenado(a.nombre_completo) })),
    };
  };
  const [estado, local, visita] = await Promise.all([estadoPartido(db, partidoId), nomina(p.local_id), nomina(p.visita_id)]);
  return { p, estado, nominas: { local, visita }, disciplina: disciplina(p) };
}

// Aviso a los celulares que siguen al curso que anotó.
async function avisoDeGol(env, ctx, partidoId, equipoId, jugadorId, valor) {
  try {
    const p = await uno(env.DB, `SELECT p.goles_local, p.goles_visita, p.local_id, t.disciplina, t.competencia,
        l.nombre AS local, v.nombre AS visita FROM partidos p JOIN torneos t ON t.id = p.torneo_id
        JOIN equipos l ON l.id = p.local_id JOIN equipos v ON v.id = p.visita_id WHERE p.id = ?`, partidoId);
    const j = jugadorId ? await uno(env.DB, 'SELECT nombre FROM jugadores WHERE id = ?', jugadorId) : null;
    const anota = equipoId === p.local_id ? p.local : p.visita;
    const que = p.disciplina === 'basquet' ? `+${valor}` : p.disciplina === 'voley' ? 'Set' : '¡Gol!';
    await avisarGol(env, ctx, {
      equipoId, partidoId,
      titulo: `${que} ${anota}${j ? ' · ' + j.nombre : ''}`,
      cuerpo: `${p.local} ${p.goles_local} – ${p.goles_visita} ${p.visita}${p.competencia ? ' · ' + p.competencia : ''}`,
    });
  } catch (e) {
    console.error('Aviso de gol', e);
  }
}
