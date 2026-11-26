// Importa el campeonato (hoja Calendario del Excel) y la lista de alumnos.
// El navegador lee los .xlsx y envía solo lo necesario (sin correos).
import { uno, todos, ejecutar, enTandas, anotar } from './db.js';
import { slug, siglaUnica, claveTexto, nombreCorto, titulo, COLORES, ahoraISO } from './util.js';
import { DISCIPLINAS, nombreCompetencia, completarCruces } from './datos.js';

const ORDEN_COMPETENCIAS = ['futbol|masculino', 'futbol|femenino', 'basquet|masculino', 'basquet|femenino'];
const PALETA = ['turquesa', 'morado', 'naranja', 'azul', 'rojo', 'verde', 'rosa', 'celeste', 'dorado', 'negro'];

// Duración pensada para turnos de 30 minutos; se cambia en cada torneo.
const TIEMPOS = { futbol: [2, 12], futsal: [2, 12], basquet: [4, 6], voley: [3, 0], otro: [1, 0] };
const PUNTOS = { futbol: [3, 1, 0], futsal: [3, 1, 0], basquet: [2, 0, 1], voley: [2, 0, 1], otro: [3, 1, 0] };

function disciplinaDe(texto) {
  const t = claveTexto(texto);
  if (t.startsWith('FUTBOL SALA') || t.startsWith('FUTSAL') || t.startsWith('INDOOR')) return 'futsal';
  if (t.startsWith('FUT')) return 'futbol';
  if (t.startsWith('BASQ') || t.startsWith('BALONCESTO') || t.startsWith('BASKET')) return 'basquet';
  if (t.includes('VOLEY') || t.includes('VOLLEY')) return 'voley';
  return 'otro';
}

function ramaDe(texto) {
  const t = claveTexto(texto);
  if (t.startsWith('MASC') || t === 'HOMBRES' || t === 'VARONES') return 'masculino';
  if (t.startsWith('FEM') || t === 'MUJERES') return 'femenino';
  return 'mixto';
}

// "Bachillerato – Grupo A" → { nivel: "Bachillerato", grupo: "A" }
function nivelYGrupo(texto) {
  const m = String(texto || '').match(/^(.*?)\s*[–—-]\s*Grupo\s+(\w+)\s*$/i);
  return m ? { nivel: m[1].trim(), grupo: m[2].toUpperCase() } : { nivel: String(texto || '').trim(), grupo: '' };
}

function ordenNivel(nivel) {
  const n = parseInt(nivel, 10);
  if (Number.isFinite(n)) return n;
  if (/bach|bgu/i.test(nivel)) return 100;
  return 50;
}

// "9:45 – 10:15" → "09:45"
function horaInicio(texto) {
  const m = String(texto || '').match(/(\d{1,2})[:.h](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// "1º 2do de básica" → pos:1 · "2º Grupo B" → pos:2:B · "Ganador Semifinal 1" → ganador:semi1
function codigoCruce(texto, nivel) {
  const t = String(texto || '').trim();
  let m = t.match(/^(\d+)\s*[º°o.]*\s*(?:del?\s+)?grupo\s+(\w+)$/i);
  if (m) return `pos:${m[1]}:${m[2].toUpperCase()}`;
  m = t.match(/^(\d+)\s*[º°o.]*\s*(.*)$/i);
  if (m && (!m[2] || claveTexto(m[2]) === claveTexto(nivel) || !/grupo/i.test(m[2]))) return `pos:${m[1]}`;
  m = t.match(/^ganador\s+(?:de\s+(?:la\s+)?)?semi(?:final)?\s*(\d+)$/i);
  if (m) return `ganador:semi${m[1]}`;
  return null;
}

function faseYLlave(texto) {
  const t = claveTexto(texto);
  let m = t.match(/^SEMI(?:FINAL)?\s*(\d+)?/);
  if (m) return { fase: 'semifinal', llave: `semi${m[1] || 1}` };
  if (t.startsWith('CUARTOS')) {
    m = t.match(/(\d+)/);
    return { fase: 'cuartos', llave: `cuartos${m ? m[1] : 1}` };
  }
  if (t.startsWith('TERCER')) return { fase: 'tercer', llave: 'tercero' };
  if (t.startsWith('FINAL')) return { fase: 'final', llave: 'final' };
  m = t.match(/(\d+)/);
  return { fase: 'grupos', llave: null, jornada: m ? Number(m[1]) : null };
}

function nivelLegible(nivel) {
  // "2DO EGB" → "2do EGB", "INTUITIVO" → "Intuitivo"
  return String(nivel || '').trim().split(/\s+/).map((p) => {
    if (/^\d+[A-Z]+$/i.test(p)) return p.replace(/^(\d+)(.*)$/, (m, a, b) => a + b.toLowerCase());
    if (/^(EGB|BGU|BI)$/i.test(p)) return p.toUpperCase();
    return titulo(p);
  }).join(' ');
}

// ---------- Alumnos ----------

export async function importarAlumnos(db, filas) {
  const limpias = filas
    .map((f) => ({ nivel: String(f.nivel || '').trim(), paralelo: String(f.paralelo || '').trim(), nombre: String(f.nombre || '').replace(/\s+/g, ' ').trim() }))
    .filter((f) => f.nivel && f.paralelo && f.nombre && f.nombre.length <= 120)
    .slice(0, 5000);
  if (!limpias.length) return { cursos: 0, alumnos: 0 };

  // Clave del curso: el nombre del paralelo (son únicos en el colegio); si se repite en otro nivel, nivel + paralelo.
  const nivelesPorParalelo = new Map();
  for (const f of limpias) {
    const k = claveTexto(f.paralelo);
    if (!nivelesPorParalelo.has(k)) nivelesPorParalelo.set(k, new Set());
    nivelesPorParalelo.get(k).add(claveTexto(f.nivel));
  }
  const claveCurso = (f) => (nivelesPorParalelo.get(claveTexto(f.paralelo)).size > 1 ? claveTexto(`${f.nivel} ${f.paralelo}`) : claveTexto(f.paralelo));

  const cursos = new Map();
  for (const f of limpias) {
    const k = claveCurso(f);
    if (!cursos.has(k)) cursos.set(k, { clave: k, nivel: nivelLegible(f.nivel), nombre: titulo(f.paralelo), orden: cursos.size + 1 });
  }
  await enTandas(db, [...cursos.values()].map((c) => db.prepare(`INSERT INTO cursos (nivel, nombre, clave, orden) VALUES (?, ?, ?, ?)
    ON CONFLICT (clave) DO UPDATE SET nivel = excluded.nivel, nombre = excluded.nombre, orden = excluded.orden`).bind(c.nivel, c.nombre, c.clave, c.orden)));
  const ids = new Map((await todos(db, 'SELECT id, clave FROM cursos')).map((c) => [c.clave, c.id]));

  // Los que ya no están en la lista quedan inactivos (no se borran: pueden tener goles registrados).
  const idsImportados = [...cursos.keys()].map((k) => ids.get(k));
  const sentencias = idsImportados.map((id) => db.prepare('UPDATE alumnos SET activo = 0 WHERE curso_id = ?').bind(id));
  // Inserción de 30 alumnos por sentencia (D1 admite hasta 100 parámetros).
  for (let i = 0; i < limpias.length; i += 30) {
    const lote = limpias.slice(i, i + 30);
    const valores = lote.map(() => '(?, ?, ?, 1)').join(', ');
    const params = lote.flatMap((f) => [ids.get(claveCurso(f)), f.nombre, nombreCorto(f.nombre)]);
    sentencias.push(db.prepare(`INSERT INTO alumnos (curso_id, nombre_completo, nombre, activo) VALUES ${valores}
      ON CONFLICT (curso_id, nombre_completo) DO UPDATE SET nombre = excluded.nombre, activo = 1`).bind(...params));
  }
  await enTandas(db, sentencias, 60);
  await enlazarCursos(db);
  return { cursos: cursos.size, alumnos: limpias.length };
}

// Une cada equipo con su curso por el nombre (Amables ↔ AMABLES, Dinámicos ↔ DINAMICOS).
export async function enlazarCursos(db) {
  const cursos = await todos(db, 'SELECT id, clave, nombre FROM cursos');
  const porNombre = new Map();
  for (const c of cursos) porNombre.set(claveTexto(c.nombre), c.id);
  const equipos = await todos(db, 'SELECT id, nombre FROM equipos WHERE curso_id IS NULL AND exhibicion = 0');
  const sentencias = [];
  for (const q of equipos) {
    const id = porNombre.get(claveTexto(q.nombre));
    if (id) sentencias.push(db.prepare('UPDATE equipos SET curso_id = ? WHERE id = ?').bind(id, q.id));
  }
  await enTandas(db, sentencias);
  return sentencias.length;
}

// ---------- Campeonato ----------

export async function importarCampeonato(db, filas, { reemplazar = false, temporada = '' } = {}) {
  const partidos = filas
    .map((f) => ({
      n: Number(f.n), dia: Number(f.dia) || null, horario: String(f.horario || ''), cancha: String(f.cancha || '').trim() || null,
      deporte: String(f.deporte || ''), rama: String(f.rama || ''), nivelGrupo: String(f.nivel || ''), fase: String(f.fase || ''),
      eq1: String(f.eq1 || '').trim(), eq2: String(f.eq2 || '').trim(),
    }))
    .filter((f) => f.deporte && f.nivelGrupo && f.eq1 && f.eq2)
    .slice(0, 3000);
  if (!partidos.length) throw new Error('No se encontraron partidos en la hoja Calendario.');

  const hay = await uno(db, 'SELECT COUNT(*) AS n FROM torneos');
  if (hay.n && !reemplazar) throw new Error('Ya hay torneos cargados. Marca “Reemplazar el campeonato actual” para importar de nuevo.');
  if (hay.n) {
    await db.batch([
      db.prepare('DELETE FROM eventos'),
      db.prepare('DELETE FROM partidos'),
      db.prepare('DELETE FROM jugadores'),
      db.prepare('DELETE FROM equipos'),
      db.prepare('DELETE FROM torneos'),
    ]);
  }

  // 1. Torneos: competencia (deporte + rama) × nivel
  const torneos = new Map();
  for (const p of partidos) {
    const disciplina = disciplinaDe(p.deporte);
    const rama = ramaDe(p.rama);
    const { nivel, grupo } = nivelYGrupo(p.nivelGrupo);
    const k = `${disciplina}|${rama}|${claveTexto(nivel)}`;
    if (!torneos.has(k)) torneos.set(k, { k, disciplina, rama, nivel, grupos: new Set(), equipos: new Map(), partidos: [] });
    const t = torneos.get(k);
    if (grupo) t.grupos.add(grupo);
    t.partidos.push({ ...p, grupo });
    const tipo = faseYLlave(p.fase);
    if (tipo.fase === 'grupos') {
      for (const nombre of [p.eq1, p.eq2]) if (!t.equipos.has(claveTexto(nombre))) t.equipos.set(claveTexto(nombre), { nombre, grupo });
    }
  }
  const lista = [...torneos.values()].sort((a, b) => {
    const ca = ORDEN_COMPETENCIAS.indexOf(`${a.disciplina}|${a.rama}`);
    const cb = ORDEN_COMPETENCIAS.indexOf(`${b.disciplina}|${b.rama}`);
    return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || a.disciplina.localeCompare(b.disciplina) || a.rama.localeCompare(b.rama) || ordenNivel(a.nivel) - ordenNivel(b.nivel);
  });

  const usados = new Set((await todos(db, 'SELECT slug FROM torneos')).map((t) => t.slug));
  const ahora = ahoraISO();
  let orden = 0;
  for (const t of lista) {
    const competencia = nombreCompetencia(t.disciplina, t.rama);
    const nombre = `${competencia} · ${t.nivel}`;
    let s = slug(nombre);
    let n = 1;
    while (usados.has(s)) s = `${slug(nombre)}-${++n}`;
    usados.add(s);
    const [periodos, minutos] = TIEMPOS[t.disciplina];
    const [ganar, empatar, perder] = PUNTOS[t.disciplina];
    const r = await ejecutar(db, `INSERT INTO torneos (slug, nombre, disciplina, nivel, temporada, competencia, rama, periodos, minutos_periodo,
        puntos_ganar, puntos_empatar, puntos_perder, clasifican, amarillas_suspension, desempate, orden, visible, creado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 3, 'ganados', ?, 1, ?)`,
      s, nombre, t.disciplina, t.nivel, temporada, competencia, t.rama, periodos, minutos, ganar, empatar, perder, ++orden, ahora);
    t.id = r.meta.last_row_id;
  }

  // 2. Equipos
  const equiposSql = [];
  for (const t of lista) {
    const siglas = new Set();
    let i = 0;
    for (const q of t.equipos.values()) {
      const exhibicion = /^profe/i.test(q.nombre) ? 1 : 0;
      const color = exhibicion ? 'gris' : PALETA[i++ % PALETA.length];
      equiposSql.push(db.prepare('INSERT INTO equipos (torneo_id, nombre, sigla, color, grupo, exhibicion, creado) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(t.id, q.nombre, exhibicion ? 'PRF' : siglaUnica(q.nombre, siglas), color, q.grupo || null, exhibicion, ahora));
    }
  }
  await enTandas(db, equiposSql);
  const equipoId = new Map((await todos(db, 'SELECT id, torneo_id, nombre FROM equipos')).map((q) => [`${q.torneo_id}|${claveTexto(q.nombre)}`, q.id]));

  // 3. Partidos
  const partidosSql = [];
  const dias = new Set();
  for (const t of lista) {
    for (const p of t.partidos) {
      const tipo = faseYLlave(p.fase);
      const hora = horaInicio(p.horario);
      if (p.dia) dias.add(p.dia);
      if (tipo.fase === 'grupos') {
        partidosSql.push(db.prepare(`INSERT INTO partidos (torneo_id, fase, jornada, dia, hora, lugar, local_id, visita_id, actualizado)
          VALUES (?, 'grupos', ?, ?, ?, ?, ?, ?, ?)`).bind(t.id, tipo.jornada, p.dia, hora, p.cancha,
          equipoId.get(`${t.id}|${claveTexto(p.eq1)}`), equipoId.get(`${t.id}|${claveTexto(p.eq2)}`), ahora));
      } else {
        // Cruce que se llena solo: si el texto es un equipo real, se usa tal cual.
        const fijoL = equipoId.get(`${t.id}|${claveTexto(p.eq1)}`) || null;
        const fijoV = equipoId.get(`${t.id}|${claveTexto(p.eq2)}`) || null;
        partidosSql.push(db.prepare(`INSERT INTO partidos (torneo_id, fase, llave, dia, hora, lugar, local_id, visita_id,
            codigo_local, codigo_visita, etiqueta_local, etiqueta_visita, actualizado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(t.id, tipo.fase, tipo.llave, p.dia, hora, p.cancha, fijoL, fijoV,
          fijoL ? null : codigoCruce(p.eq1, t.nivel), fijoV ? null : codigoCruce(p.eq2, t.nivel), p.eq1, p.eq2, ahora));
      }
    }
  }
  await enTandas(db, partidosSql);

  // 4. Días de juego (las fechas se ponen en el panel; si ya tenían fecha, se conservan)
  await enTandas(db, [...dias].map((d) => db.prepare('INSERT INTO dias_juego (numero) VALUES (?) ON CONFLICT (numero) DO NOTHING').bind(d)));
  await aplicarFechas(db);
  const enlazados = await enlazarCursos(db);
  for (const t of lista) await completarCruces(db, t.id);

  return {
    torneos: lista.length,
    equipos: equiposSql.length,
    partidos: partidosSql.length,
    dias: dias.size,
    enlazados,
  };
}

// Copia la fecha de cada día de juego a sus partidos (fecha + hora).
export async function aplicarFechas(db) {
  await ejecutar(db, `UPDATE partidos SET fecha = (
      SELECT CASE WHEN d.fecha IS NULL THEN NULL ELSE d.fecha || CASE WHEN partidos.hora IS NULL THEN '' ELSE 'T' || partidos.hora END END
      FROM dias_juego d WHERE d.numero = partidos.dia)
    WHERE dia IS NOT NULL`);
}

export async function registrarImportacion(db, usuario, texto) {
  await anotar(db, usuario, texto);
}

export { COLORES, DISCIPLINAS };
