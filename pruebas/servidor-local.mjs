// Servidor local para probar La Liga Lev sin Cloudflare (Node 22.5 o superior).
//   DEV_EMAIL=tu@lev.edu.ec ADMINS=tu@lev.edu.ec node pruebas/servidor-local.mjs
// Abre http://localhost:4325 — "Continuar con Google" entra directo con DEV_EMAIL
// (o con otra cuenta: /auth/login?como=otra@lev.edu.ec).
// D1 se imita con SQLite (pruebas/.datos/lev-laliga.sqlite). Sin Durable Objects:
// la página del partido se actualiza consultando cada pocos segundos.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- D1 imitado con SQLite ----------
class Sentencia {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...p) { const s = new Sentencia(this.db, this.sql); s.params = p; return s; }
  async first() { return this.db.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params) }; }
  async run() { return this.ejecutar(); }
  ejecutar() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

class D1Local {
  constructor(ruta) {
    this.db = new DatabaseSync(ruta);
    this.db.exec('PRAGMA foreign_keys = ON'); // como D1
  }
  prepare(sql) { return new Sentencia(this.db, sql); }
  async batch(sentencias) {
    this.db.exec('BEGIN');
    try {
      const r = sentencias.map((s) => s.ejecutar());
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

// ---------- Archivos estáticos (como Workers Assets) ----------
const TIPOS = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png',
};
const ASSETS = {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const archivo = join(raiz, 'public', pathname);
    if (!archivo.startsWith(join(raiz, 'public'))) return new Response('No', { status: 404 });
    try {
      return new Response(await readFile(archivo), { headers: { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream' } });
    } catch {
      return new Response('No encontrado', { status: 404 });
    }
  },
};

await mkdir(join(raiz, 'pruebas', '.datos'), { recursive: true });
const env = {
  DB: new D1Local(process.env.DB_ARCHIVO || join(raiz, 'pruebas', '.datos', 'lev-laliga.sqlite')),
  ASSETS,
  SESSION_SECRET: 'solo-para-pruebas-locales-no-usar-en-produccion',
  DEV_EMAIL: process.env.DEV_EMAIL,
  ADMINS: process.env.ADMINS || '',
};

const { default: worker } = await import('../worker/index.js');
const puerto = Number(process.env.PUERTO || 4325);

createServer(async (req, res) => {
  const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? undefined : await new Promise((ok) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => ok(Buffer.concat(partes)));
  });
  const request = new Request(`http://localhost:${puerto}${req.url}`, { method: req.method, headers: req.headers, body: cuerpo });
  const pendientes = [];
  const r = await worker.fetch(request, env, { waitUntil: (p) => pendientes.push(p) });
  const cabeceras = {};
  r.headers.forEach((v, k) => { if (k !== 'set-cookie') cabeceras[k] = v; });
  const cookies = r.headers.getSetCookie();
  // En local no hay HTTPS: se quita "Secure" para que el navegador guarde la sesión.
  if (cookies.length) cabeceras['set-cookie'] = cookies.map((c) => c.replace('; Secure', ''));
  res.writeHead(r.status, cabeceras);
  res.end(Buffer.from(await r.arrayBuffer()));
  await Promise.allSettled(pendientes);
}).listen(puerto, () => console.log(`La Liga Lev local: http://localhost:${puerto}`));
