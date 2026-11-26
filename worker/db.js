// Base de datos D1 "lev-laliga". Las tablas se crean solas la primera vez.

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    nombre TEXT,
    foto TEXT,
    rol TEXT NOT NULL DEFAULT 'ninguno',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    creado TEXT NOT NULL,
    ultimo_acceso TEXT
  )`,
  // Un torneo = una disciplina en un nivel (p. ej. "Fútbol · Básica Superior").
  `CREATE TABLE IF NOT EXISTS torneos (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    disciplina TEXT NOT NULL DEFAULT 'futbol',
    nivel TEXT NOT NULL DEFAULT '',
    temporada TEXT NOT NULL DEFAULT '',
    periodos INTEGER NOT NULL DEFAULT 2,
    minutos_periodo INTEGER NOT NULL DEFAULT 20,
    puntos_ganar INTEGER NOT NULL DEFAULT 3,
    puntos_empatar INTEGER NOT NULL DEFAULT 1,
    puntos_perder INTEGER NOT NULL DEFAULT 0,
    clasifican INTEGER NOT NULL DEFAULT 4,
    amarillas_suspension INTEGER NOT NULL DEFAULT 3,
    reglamento TEXT,
    orden INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    creado TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS equipos (
    id INTEGER PRIMARY KEY,
    torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    sigla TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'morado',
    tutor TEXT,
    descripcion TEXT,
    creado TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS equipos_torneo ON equipos (torneo_id)`,
  `CREATE TABLE IF NOT EXISTS jugadores (
    id INTEGER PRIMARY KEY,
    equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    dorsal INTEGER,
    posicion TEXT,
    capitan INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS jugadores_equipo ON jugadores (equipo_id)`,
  // fecha: hora local de Ecuador "2026-11-26T13:30".
  // Reloj: reloj_base = segundos acumulados; reloj_inicio = ms (epoch) desde que corre, o NULL si está pausado.
  `CREATE TABLE IF NOT EXISTS partidos (
    id INTEGER PRIMARY KEY,
    torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
    fase TEXT NOT NULL DEFAULT 'grupos',
    jornada INTEGER,
    fecha TEXT,
    lugar TEXT,
    local_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
    visita_id INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
    arbitro_email TEXT,
    estado TEXT NOT NULL DEFAULT 'programado',
    goles_local INTEGER NOT NULL DEFAULT 0,
    goles_visita INTEGER NOT NULL DEFAULT 0,
    periodo INTEGER NOT NULL DEFAULT 0,
    reloj_base INTEGER NOT NULL DEFAULT 0,
    reloj_inicio INTEGER,
    nota TEXT,
    actualizado TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS partidos_torneo ON partidos (torneo_id, fecha)`,
  `CREATE INDEX IF NOT EXISTS partidos_estado ON partidos (estado)`,
  // tipo: gol, amarilla, roja, cambio, inicio, entretiempo, reanuda, fin, nota
  `CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY,
    partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    equipo_id INTEGER,
    jugador_id INTEGER,
    jugador2_id INTEGER,
    valor INTEGER NOT NULL DEFAULT 1,
    minuto INTEGER,
    periodo INTEGER,
    detalle TEXT,
    anulado INTEGER NOT NULL DEFAULT 0,
    cliente_id TEXT UNIQUE,
    autor TEXT,
    creado TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS eventos_partido ON eventos (partido_id)`,
  // Cursos y alumnos del colegio (se importan desde el panel; no se guardan correos).
  `CREATE TABLE IF NOT EXISTS cursos (
    id INTEGER PRIMARY KEY,
    nivel TEXT NOT NULL,
    nombre TEXT NOT NULL,
    clave TEXT NOT NULL UNIQUE,
    orden INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS alumnos (
    id INTEGER PRIMARY KEY,
    curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    UNIQUE (curso_id, nombre_completo)
  )`,
  `CREATE INDEX IF NOT EXISTS alumnos_curso ON alumnos (curso_id)`,
  // Días de juego: el N.º de la planificación y la fecha real (se asigna en el panel).
  `CREATE TABLE IF NOT EXISTS dias_juego (
    numero INTEGER PRIMARY KEY,
    fecha TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS historial (
    id INTEGER PRIMARY KEY,
    usuario TEXT,
    accion TEXT NOT NULL,
    fecha TEXT NOT NULL
  )`,
];

// Columnas agregadas después de la primera versión: se crean solas si faltan.
const COLUMNAS = {
  torneos: {
    competencia: "TEXT NOT NULL DEFAULT ''",
    rama: "TEXT NOT NULL DEFAULT 'mixto'",
    desempate: "TEXT NOT NULL DEFAULT 'ganados'",
  },
  equipos: {
    grupo: 'TEXT',
    exhibicion: 'INTEGER NOT NULL DEFAULT 0',
    desempate: 'INTEGER NOT NULL DEFAULT 0',
    curso_id: 'INTEGER',
  },
  jugadores: {
    alumno_id: 'INTEGER',
    convocado: 'INTEGER NOT NULL DEFAULT 1',
  },
  partidos: {
    dia: 'INTEGER',
    hora: 'TEXT',
    llave: 'TEXT',
    codigo_local: 'TEXT',
    codigo_visita: 'TEXT',
    etiqueta_local: 'TEXT',
    etiqueta_visita: 'TEXT',
    ganador: 'TEXT',
    marcador: 'INTEGER NOT NULL DEFAULT 1',
  },
};

async function migrar(db) {
  const sentencias = [];
  for (const [tabla, columnas] of Object.entries(COLUMNAS)) {
    const existentes = new Set(((await db.prepare(`PRAGMA table_info(${tabla})`).all()).results || []).map((c) => c.name));
    for (const [col, tipo] of Object.entries(columnas)) {
      if (!existentes.has(col)) sentencias.push(db.prepare(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipo}`));
    }
  }
  if (sentencias.length) await db.batch(sentencias);
  await db.batch([
    db.prepare('CREATE INDEX IF NOT EXISTS partidos_dia ON partidos (dia)'),
    db.prepare('CREATE INDEX IF NOT EXISTS jugadores_alumno ON jugadores (alumno_id)'),
  ]);
}

let listo = null;

export function asegurarEsquema(db) {
  if (!listo) {
    listo = db
      .batch(ESQUEMA.map((sql) => db.prepare(sql)))
      .then(() => migrar(db))
      .catch((e) => {
        listo = null;
        throw e;
      });
  }
  return listo;
}

export async function uno(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

export async function todos(db, sql, ...params) {
  const r = await db.prepare(sql).bind(...params).all();
  return r.results || [];
}

export async function ejecutar(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}

export async function anotar(db, usuario, accion) {
  await ejecutar(db, 'INSERT INTO historial (usuario, accion, fecha) VALUES (?, ?, ?)', usuario || null, accion, new Date().toISOString());
}

export async function ajuste(db, clave, porDefecto = null) {
  const r = await uno(db, 'SELECT valor FROM ajustes WHERE clave = ?', clave);
  return r ? r.valor : porDefecto;
}

export async function guardarAjuste(db, clave, valor) {
  await ejecutar(db, 'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor', clave, valor);
}

// Ejecuta muchas sentencias en tandas (D1 acepta lotes, pero conviene no hacerlos gigantes).
export async function enTandas(db, sentencias, tam = 80) {
  for (let i = 0; i < sentencias.length; i += tam) await db.batch(sentencias.slice(i, i + tam));
}
