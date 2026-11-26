// Avisos de goles por curso (Web Push).
// - Las claves VAPID se generan solas la primera vez y se guardan en D1 (tabla ajustes).
// - Se envía un "empujón" sin contenido; el service worker pide el texto a /api/avisos/ultimo.
//   Así no hace falta cifrar el mensaje.
// - El envío lo hace el Durable Object en tandas (con alarmas), para no pasar el límite
//   de conexiones por petición del plan gratuito.
import { uno, todos, ejecutar, ajuste, guardarAjuste } from './db.js';
import { json, error, aBase64url } from './util.js';

const PROVEEDORES = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

export async function asegurarTablasAvisos(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS suscripciones (
      id INTEGER PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, curso_id INTEGER NOT NULL, creado TEXT NOT NULL)`),
    db.prepare('CREATE INDEX IF NOT EXISTS suscripciones_curso ON suscripciones (curso_id)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS avisos (
      id INTEGER PRIMARY KEY, curso_id INTEGER NOT NULL, titulo TEXT NOT NULL, cuerpo TEXT, url TEXT, creado INTEGER NOT NULL)`),
    db.prepare('CREATE INDEX IF NOT EXISTS avisos_curso ON avisos (curso_id, creado)'),
  ]);
}

// ---------- Claves VAPID ----------

async function claves(db) {
  const guardadas = await ajuste(db, 'vapid');
  if (guardadas) return JSON.parse(guardadas);
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privada = await crypto.subtle.exportKey('jwk', par.privateKey);
  const publica = aBase64url(await crypto.subtle.exportKey('raw', par.publicKey));
  const datos = { privada, publica };
  // Si dos peticiones generan a la vez, gana la primera que se guardó.
  await ejecutar(db, 'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO NOTHING', 'vapid', JSON.stringify(datos));
  return JSON.parse(await ajuste(db, 'vapid'));
}

export async function firmaVapid(datos, audiencia, contacto) {
  const llave = await crypto.subtle.importKey('jwk', datos.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cod = new TextEncoder();
  const cab = aBase64url(cod.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = aBase64url(cod.encode(JSON.stringify({ aud: audiencia, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contacto })));
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llave, cod.encode(`${cab}.${cuerpo}`));
  return `vapid t=${cab}.${cuerpo}.${aBase64url(firma)}, k=${datos.publica}`;
}

function endpointValido(texto) {
  try {
    const u = new URL(texto);
    return u.protocol === 'https:' && PROVEEDORES.some((r) => r.test(u.hostname)) && texto.length < 1000;
  } catch {
    return false;
  }
}

// ---------- API ----------

export async function apiAvisos(request, env, url) {
  const db = env.DB;
  await asegurarTablasAvisos(db);

  if (url.pathname === '/api/avisos/clave') {
    return json({ clave: (await claves(db)).publica });
  }

  if (url.pathname === '/api/avisos/ultimo') {
    const endpoint = url.searchParams.get('endpoint') || '';
    const s = await uno(db, 'SELECT curso_id FROM suscripciones WHERE endpoint = ?', endpoint);
    const a = s ? await uno(db, 'SELECT titulo, cuerpo, url FROM avisos WHERE curso_id = ? AND creado > ? ORDER BY id DESC LIMIT 1', s.curso_id, Date.now() - 15 * 60 * 1000) : null;
    return json(a || { titulo: 'La Liga Lev', cuerpo: 'Hay novedades en el partido de tu curso.', url: '/' });
  }

  if (url.pathname === '/api/avisos') {
    let datos;
    try {
      datos = await request.json();
    } catch {
      return error('Datos no válidos.');
    }
    if (request.method === 'DELETE') {
      await ejecutar(db, 'DELETE FROM suscripciones WHERE endpoint = ?', String(datos.endpoint || ''));
      return json({ ok: true });
    }
    if (request.method === 'POST') {
      const endpoint = String(datos.suscripcion?.endpoint || '');
      if (!endpointValido(endpoint)) return error('Suscripción no válida.');
      const curso = await uno(db, 'SELECT id FROM cursos WHERE id = ?', Number(datos.curso));
      if (!curso) return error('Ese curso no existe.', 404);
      await ejecutar(db, `INSERT INTO suscripciones (endpoint, curso_id, creado) VALUES (?, ?, ?)
        ON CONFLICT (endpoint) DO UPDATE SET curso_id = excluded.curso_id`, endpoint, curso.id, new Date().toISOString());
      return json({ ok: true });
    }
    return error('Método no permitido.', 405);
  }
  return null;
}

// ---------- Enviar el aviso de un gol ----------

export async function avisarGol(env, ctx, { equipoId, partidoId, titulo, cuerpo }) {
  if (!env.PARTIDOS) return;
  const db = env.DB;
  await asegurarTablasAvisos(db);
  const q = await uno(db, 'SELECT curso_id FROM equipos WHERE id = ?', equipoId);
  if (!q?.curso_id) return;
  const subs = await todos(db, 'SELECT endpoint FROM suscripciones WHERE curso_id = ?', q.curso_id);
  if (!subs.length) return;
  await ejecutar(db, 'INSERT INTO avisos (curso_id, titulo, cuerpo, url, creado) VALUES (?, ?, ?, ?, ?)',
    q.curso_id, titulo, cuerpo, `/partido/${partidoId}/`, Date.now());
  const datos = await claves(db);
  const contacto = `mailto:${env.CONTACTO || 'ti@lev.edu.ec'}`;
  const firmas = {};
  for (const s of subs) {
    const aud = new URL(s.endpoint).origin;
    if (!firmas[aud]) firmas[aud] = await firmaVapid(datos, aud, contacto);
  }
  const stub = env.PARTIDOS.get(env.PARTIDOS.idFromName('avisos'));
  const envio = stub.fetch('https://vivo/push', { method: 'POST', body: JSON.stringify({ endpoints: subs.map((s) => s.endpoint), firmas }) })
    .catch((e) => console.error('Avisos', e));
  if (ctx?.waitUntil) ctx.waitUntil(envio);
}

// Suscripciones que el servicio de avisos dio por vencidas.
export async function borrarVencidas(db, endpoints) {
  if (!endpoints.length) return;
  await db.batch(endpoints.map((e) => db.prepare('DELETE FROM suscripciones WHERE endpoint = ?').bind(e)));
}
