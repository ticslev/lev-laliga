// Inicio de sesión con Google (OpenID Connect), solo cuentas del dominio del colegio.
// Basado en el de Lev Link. Roles: admin, editor, arbitro.
import { uno, ejecutar } from './db.js';
import { firmar, verificar, aleatorio, leerCookie, cookie, redirigir, deBase64url, ahoraISO } from './util.js';

const COOKIE_SESION = 'lev_laliga';
const COOKIE_OAUTH = 'lev_laliga_oauth';
const DURACION_SESION = 30 * 24 * 60 * 60; // 30 días

export const ROLES = {
  admin: 'Administrador',
  editor: 'Editor',
  arbitro: 'Árbitro',
};

export function dominio(env) {
  return (env.DOMINIO || 'lev.edu.ec').toLowerCase();
}

export function administradores(env) {
  return String(env.ADMINS || '')
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function secreto(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error('Falta SESSION_SECRET (mínimo 32 caracteres) en las variables del Worker.');
  }
  return env.SESSION_SECRET;
}

// Usuario de la sesión actual, o null. Solo devuelve usuarios aprobados con un rol.
export async function usuarioActual(request, env) {
  const datos = await verificar(leerCookie(request, COOKIE_SESION), secreto(env));
  if (!datos || typeof datos.u !== 'number') return null;
  const u = await uno(env.DB, 'SELECT id, email, nombre, foto, rol, estado FROM usuarios WHERE id = ?', datos.u);
  if (!u) return null;
  if (administradores(env).includes(u.email)) {
    u.rol = 'admin';
    u.estado = 'aprobado';
  }
  if (u.estado !== 'aprobado' || !ROLES[u.rol]) return null;
  u.admin = u.rol === 'admin';
  u.editor = u.rol === 'admin' || u.rol === 'editor';
  return u;
}

async function crearSesion(env, usuarioId, destino) {
  const token = await firmar({ u: usuarioId, x: Date.now() + DURACION_SESION * 1000 }, secreto(env));
  const r = redirigir(destino);
  r.headers.append('Set-Cookie', cookie(COOKIE_SESION, token, DURACION_SESION));
  r.headers.append('Set-Cookie', cookie(COOKIE_OAUTH, '', 0));
  return r;
}

// Crea o actualiza el usuario. Si un administrador lo autorizó antes con su correo, ya tiene rol.
async function registrarUsuario(env, { email, nombre, foto }) {
  const ahora = ahoraISO();
  const esAdmin = administradores(env).includes(email);
  await ejecutar(
    env.DB,
    `INSERT INTO usuarios (email, nombre, foto, rol, estado, creado, ultimo_acceso)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT (email) DO UPDATE SET nombre = ?2, foto = ?3, ultimo_acceso = ?6,
       rol = CASE WHEN ?4 = 'admin' THEN 'admin' ELSE usuarios.rol END,
       estado = CASE WHEN ?4 = 'admin' THEN 'aprobado' ELSE usuarios.estado END`,
    email, nombre, foto, esAdmin ? 'admin' : 'ninguno', esAdmin ? 'aprobado' : 'pendiente', ahora
  );
  return uno(env.DB, 'SELECT id, estado, rol FROM usuarios WHERE email = ?', email);
}

function siguienteSeguro(texto) {
  return typeof texto === 'string' && /^\/(panel|arbitro)\/[\w\-/?=&.]*$/.test(texto) ? texto : '/panel/';
}

export async function iniciar(request, env) {
  const url = new URL(request.url);
  const siguiente = siguienteSeguro(url.searchParams.get('siguiente'));

  // Solo para pruebas en el computador: entra sin Google si DEV_EMAIL está definido.
  if (env.DEV_EMAIL && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    const email = (url.searchParams.get('como') || env.DEV_EMAIL).toLowerCase();
    const u = await registrarUsuario(env, { email, nombre: email.split('@')[0], foto: null });
    if (u.estado !== 'aprobado') return redirigir(`/entrar/?estado=${u.estado}`);
    return crearSesion(env, u.id, siguiente);
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return redirigir('/entrar/?estado=configuracion');
  }

  const estado = aleatorio(24);
  const nonce = aleatorio(24);
  const token = await firmar({ s: estado, n: nonce, r: siguiente, x: Date.now() + 10 * 60 * 1000 }, secreto(env));
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  google.searchParams.set('redirect_uri', `${url.origin}/auth/callback`);
  google.searchParams.set('response_type', 'code');
  google.searchParams.set('scope', 'openid email profile');
  google.searchParams.set('state', estado);
  google.searchParams.set('nonce', nonce);
  google.searchParams.set('hd', dominio(env));
  google.searchParams.set('prompt', 'select_account');
  return redirigir(google.toString(), 302, { 'Set-Cookie': cookie(COOKIE_OAUTH, token, 600) });
}

export async function volverDeGoogle(request, env) {
  const url = new URL(request.url);
  const guardado = await verificar(leerCookie(request, COOKIE_OAUTH), secreto(env));
  const estado = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  if (url.searchParams.get('error')) return redirigir('/entrar/');
  if (!guardado || !estado || guardado.s !== estado || !code) return redirigir('/entrar/?estado=error');

  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!respuesta.ok) {
    console.error('Google token', respuesta.status, await respuesta.text());
    return redirigir('/entrar/?estado=error');
  }
  const { id_token: idToken } = await respuesta.json();

  // El id_token llega directo de Google por HTTPS (flujo con código),
  // así que basta con revisar su contenido.
  let datos;
  try {
    datos = JSON.parse(new TextDecoder().decode(deBase64url(idToken.split('.')[1])));
  } catch {
    return redirigir('/entrar/?estado=error');
  }
  const email = String(datos.email || '').toLowerCase();
  const correcto =
    ['accounts.google.com', 'https://accounts.google.com'].includes(datos.iss) &&
    datos.aud === env.GOOGLE_CLIENT_ID &&
    datos.exp * 1000 > Date.now() &&
    datos.nonce === guardado.n &&
    datos.email_verified === true;
  if (!correcto) return redirigir('/entrar/?estado=error');
  if (datos.hd !== dominio(env) || !email.endsWith('@' + dominio(env))) return redirigir('/entrar/?estado=dominio');

  const u = await registrarUsuario(env, {
    email,
    nombre: datos.name || email.split('@')[0],
    foto: typeof datos.picture === 'string' && datos.picture.startsWith('https://') ? datos.picture : null,
  });
  if (u.estado !== 'aprobado' || !ROLES[u.rol]) {
    const r = redirigir(`/entrar/?estado=${u.estado === 'bloqueado' ? 'bloqueado' : 'pendiente'}`);
    r.headers.append('Set-Cookie', cookie(COOKIE_OAUTH, '', 0));
    return r;
  }
  return crearSesion(env, u.id, siguienteSeguro(guardado.r));
}

export function salir() {
  return redirigir('/', 302, { 'Set-Cookie': cookie(COOKIE_SESION, '', 0) });
}
