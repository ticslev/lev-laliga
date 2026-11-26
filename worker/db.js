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
  `CREATE TABLE IF NOT EXISTS historial (
    id INTEGER PRIMARY KEY,
    usuario TEXT,
    accion TEXT NOT NULL,
    fecha TEXT NOT NULL
  )`,
];

let listo = null;

export function asegurarEsquema(db) {
  if (!listo) {
    listo = db
      .batch(ESQUEMA.map((sql) => db.prepare(sql)))
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
