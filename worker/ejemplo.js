// Datos de ejemplo para ver el sitio funcionando (solo se cargan con la base vacía).
import { ejecutar, uno, todos } from './db.js';
import { hoyEcuador, sumarDias, siglaDe, ahoraISO } from './util.js';
import { rondasTodosContraTodos, recalcularMarcador } from './datos.js';

const PILA = ['Mateo', 'Camila', 'Nicolás', 'Isabella', 'Julián', 'Valentina', 'Sebastián', 'Daniela', 'Emilio', 'Sofía', 'Joaquín', 'Martina', 'Andrés', 'Lucía', 'Tomás', 'Paula', 'Diego', 'Renata', 'Gabriel', 'Ariana', 'Samuel', 'Emilia', 'Lucas', 'Antonella', 'Martín', 'Valeria', 'Benjamín', 'Doménica', 'Matías', 'Rafaela', 'Felipe', 'Victoria', 'Esteban', 'Juliana', 'David', 'Amelia', 'Leonardo', 'Mía', 'Josué', 'Abigail', 'Ian', 'Nicole', 'Alejandro', 'Sara', 'Bruno', 'Elena'];
const INICIALES = 'RGTSBCALVPQMHENFOD';
const NOMBRES = PILA.map((n, i) => `${n} ${INICIALES[(i * 7) % INICIALES.length]}.`);
const POSICIONES = ['Arquero', 'Defensa', 'Defensa', 'Volante', 'Volante', 'Delantero', 'Delantero'];

async function crearTorneo(db, { nombre, slug, disciplina, nivel, periodos, minutos, ganar, empatar, perder, orden, equipos, colores }) {
  const t = await ejecutar(db, `INSERT INTO torneos (slug, nombre, disciplina, nivel, temporada, periodos, minutos_periodo, puntos_ganar, puntos_empatar, puntos_perder, orden, creado, reglamento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, slug, nombre, disciplina, nivel, String(new Date().getFullYear()), periodos, minutos, ganar, empatar, perder, orden, ahoraISO(),
    'Ejemplo de reglamento: partidos de dos tiempos, cambios ilimitados, tres amarillas acumuladas suspenden una fecha.');
  const torneoId = t.meta.last_row_id;
  const ids = [];
  let k = 0;
  for (let i = 0; i < equipos.length; i++) {
    const q = await ejecutar(db, 'INSERT INTO equipos (torneo_id, nombre, sigla, color, tutor, creado) VALUES (?, ?, ?, ?, ?, ?)',
      torneoId, equipos[i], siglaDe(equipos[i]), colores[i % colores.length], `Tutor de ${equipos[i]}`, ahoraISO());
    ids.push(q.meta.last_row_id);
    const sentencias = [];
    for (let n = 0; n < 7; n++) {
      sentencias.push(db.prepare('INSERT INTO jugadores (equipo_id, nombre, dorsal, posicion, capitan) VALUES (?, ?, ?, ?, ?)')
        .bind(q.meta.last_row_id, NOMBRES[(k++) % NOMBRES.length], n === 0 ? 1 : n + 3, disciplina === 'basquet' ? null : POSICIONES[n], n === 5 ? 1 : 0));
    }
    await db.batch(sentencias);
  }
  return { torneoId, ids };
}

// Registra un resultado con goles de jugadores al azar (determinista).
async function jugar(db, partidoId, localId, visitaId, gl, gv, valor, autor, tarjetas = []) {
  const jl = await todos(db, 'SELECT id FROM jugadores WHERE equipo_id = ? ORDER BY id', localId);
  const jv = await todos(db, 'SELECT id FROM jugadores WHERE equipo_id = ? ORDER BY id', visitaId);
  const s = [];
  const anotar = (equipo, lista, n, semilla) => {
    for (let i = 0; i < n; i++) {
      const j = lista[[5, 6, 5, 3, 4, 5, 2][(semilla + i) % 7] % lista.length];
      s.push(db.prepare(`INSERT INTO eventos (partido_id, tipo, equipo_id, jugador_id, valor, minuto, periodo, autor, creado) VALUES (?, 'gol', ?, ?, ?, ?, ?, ?, ?)`)
        .bind(partidoId, equipo, j.id, valor, 3 + ((semilla * 7 + i * 11) % 36), i % 2 + 1, autor, ahoraISO()));
    }
  };
  anotar(localId, jl, gl, partidoId);
  anotar(visitaId, jv, gv, partidoId + 1);
  for (const [lado, tipo, idx, minuto] of tarjetas) {
    const lista = lado === 'l' ? jl : jv;
    s.push(db.prepare(`INSERT INTO eventos (partido_id, tipo, equipo_id, jugador_id, minuto, periodo, autor, creado) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(partidoId, tipo, lado === 'l' ? localId : visitaId, lista[idx].id, minuto, autor, ahoraISO()));
  }
  if (s.length) await db.batch(s);
  await ejecutar(db, `UPDATE partidos SET estado = 'finalizado', periodo = 2, reloj_base = 2400 WHERE id = ?`, partidoId);
  await recalcularMarcador(db, partidoId);
}

export async function cargarEjemplo(db, autor) {
  const hoy = hoyEcuador();

  // ---- Fútbol · Básica Superior: 6 equipos, 2 jornadas jugadas, 1 partido en vivo ----
  const futbol = await crearTorneo(db, {
    nombre: 'Fútbol · Básica Superior', slug: 'futbol-basica-superior', disciplina: 'futbol', nivel: 'Básica Superior',
    periodos: 2, minutos: 20, ganar: 3, empatar: 1, perder: 0, orden: 1,
    equipos: ['9no Solidarios', '10mo Positivos', '8vo Empáticos', '10mo Justos', '8vo Tolerantes', '9no Perseverantes'],
    colores: ['turquesa', 'morado', 'naranja', 'azul', 'verde', 'rojo'],
  });
  const rondas = rondasTodosContraTodos(futbol.ids);
  const resultados = [[[2, 1], [0, 0], [3, 2]], [[1, 3], [2, 2], [4, 0]]];
  for (let r = 0; r < rondas.length; r++) {
    const dia = sumarDias(hoy, (r - 2) * 7);
    for (let i = 0; i < rondas[r].length; i++) {
      const [l, v] = rondas[r][i];
      const fecha = `${dia}T${String(10 + i).padStart(2, '0')}:00`;
      const ins = await ejecutar(db, `INSERT INTO partidos (torneo_id, fase, jornada, fecha, lugar, local_id, visita_id, arbitro_email, actualizado)
        VALUES (?, 'grupos', ?, ?, ?, ?, ?, ?, ?)`, futbol.torneoId, r + 1, fecha, i % 2 ? 'Cancha 2' : 'Cancha 1', l, v, autor, ahoraISO());
      const id = ins.meta.last_row_id;
      if (r < 2) {
        const [gl, gv] = resultados[r][i];
        await jugar(db, id, l, v, gl, gv, 1, autor, r === 0 && i === 0 ? [['v', 'amarilla', 2, 27]] : r === 1 && i === 1 ? [['l', 'roja', 3, 33], ['v', 'amarilla', 1, 12]] : []);
      } else if (r === 2 && i === 0) {
        // Partido en vivo, empezó hace 12 minutos.
        await ejecutar(db, `UPDATE partidos SET fecha = ?, estado = 'en_vivo', periodo = 1, reloj_base = 0, reloj_inicio = ? WHERE id = ?`,
          `${hoy}T09:00`, Date.now() - 12 * 60 * 1000, id);
        const jl = await uno(db, 'SELECT id FROM jugadores WHERE equipo_id = ? ORDER BY id LIMIT 1 OFFSET 5', l);
        await db.batch([
          db.prepare(`INSERT INTO eventos (partido_id, tipo, minuto, periodo, autor, creado) VALUES (?, 'inicio', 0, 1, ?, ?)`).bind(id, autor, ahoraISO()),
          db.prepare(`INSERT INTO eventos (partido_id, tipo, equipo_id, jugador_id, minuto, periodo, autor, creado) VALUES (?, 'gol', ?, ?, 8, 1, ?, ?)`).bind(id, l, jl.id, autor, ahoraISO()),
        ]);
        await recalcularMarcador(db, id);
      }
    }
  }

  // ---- Básquet · Bachillerato: 4 equipos, 1 jornada jugada ----
  const basquet = await crearTorneo(db, {
    nombre: 'Básquet · Bachillerato', slug: 'basquet-bachillerato', disciplina: 'basquet', nivel: 'Bachillerato',
    periodos: 4, minutos: 10, ganar: 2, empatar: 0, perder: 1, orden: 2,
    equipos: ['1ro BGU Leales', '2do BGU Honestos', '3ro BGU Creativos', '1ro BGU Íntegros'],
    colores: ['celeste', 'dorado', 'rosa', 'negro'],
  });
  const rondasB = rondasTodosContraTodos(basquet.ids);
  for (let r = 0; r < rondasB.length; r++) {
    const dia = sumarDias(hoy, (r - 1) * 7 + 1);
    for (let i = 0; i < rondasB[r].length; i++) {
      const [l, v] = rondasB[r][i];
      const ins = await ejecutar(db, `INSERT INTO partidos (torneo_id, fase, jornada, fecha, lugar, local_id, visita_id, actualizado)
        VALUES (?, 'grupos', ?, ?, 'Coliseo', ?, ?, ?)`, basquet.torneoId, r + 1, `${dia}T${String(13 + i).padStart(2, '0')}:30`, l, v, ahoraISO());
      if (r === 0) await jugar(db, ins.meta.last_row_id, l, v, i ? 9 : 14, i ? 12 : 11, 2, autor);
    }
  }
}
