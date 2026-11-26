// Utilidades compartidas del Worker (firma y cookies tomadas de Lev Link).

export function json(datos, estado = 200, cabeceras = {}) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabeceras },
  });
}

export function error(mensaje, estado = 400) {
  return json({ error: mensaje }, estado);
}

export function redirigir(destino, estado = 302, cabeceras = {}) {
  return new Response(null, { status: estado, headers: { Location: destino, 'Cache-Control': 'no-store', ...cabeceras } });
}

export function html(cuerpo, estado = 200, cabeceras = {}) {
  return new Response(cuerpo, {
    status: estado,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...cabeceras },
  });
}

// Escapa texto para meterlo en HTML. Todo lo que viene de la base pasa por aquí.
export function e(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function ahoraISO() {
  return new Date().toISOString();
}

// ---------- Fechas (Ecuador continental: UTC-5 todo el año) ----------

const DESFASE_ECUADOR = -5 * 60 * 60 * 1000;

// "2026-11-26T09:40" en hora de Ecuador.
export function ahoraEcuador(fecha = new Date()) {
  return new Date(fecha.getTime() + DESFASE_ECUADOR).toISOString().slice(0, 16);
}

export function hoyEcuador() {
  return ahoraEcuador().slice(0, 10);
}

export function sumarDias(dia, n) {
  const d = new Date(dia + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "Hoy · 13:30", "Mañana · 10:00", "Vie 4 dic · 10:00"
export function fechaCorta(fecha, { hora = true } = {}) {
  if (!fecha) return 'Fecha por definir';
  const dia = fecha.slice(0, 10);
  const h = fecha.length > 10 ? fecha.slice(11, 16) : '';
  const hoy = hoyEcuador();
  let texto;
  if (dia === hoy) texto = 'Hoy';
  else if (dia === sumarDias(hoy, 1)) texto = 'Mañana';
  else if (dia === sumarDias(hoy, -1)) texto = 'Ayer';
  else {
    const d = new Date(dia + 'T12:00:00Z');
    texto = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
  }
  return hora && h ? `${texto} · ${h}` : texto;
}

export function fechaValida(texto) {
  if (!texto) return null;
  const t = String(texto).trim();
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(t)) return undefined;
  const d = new Date(t.slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t.slice(0, 10)) return undefined;
  return t;
}

// ---------- Texto ----------

export function textoCorto(texto, max) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

// "Fútbol Básica Superior" → "futbol-basica-superior"
export function slug(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// "9no Solidarios" → "9S"; "2do BGU Honestos" → "2H"
export function siglaDe(nombre) {
  const partes = String(nombre || '').split(/\s+/).filter((p) => p && p.toUpperCase() !== 'BGU' && p.toUpperCase() !== 'EGB');
  if (!partes.length) return '?';
  const num = (partes[0].match(/^\d+/) || [''])[0];
  const resto = partes.slice(num ? 1 : 0);
  const letras = resto.map((p) => p[0]).join('').toUpperCase();
  return (num + letras).slice(0, 4) || partes[0].slice(0, 3).toUpperCase();
}

export function entero(valor, min, max, porDefecto = null) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n) || n < min || n > max) return porDefecto;
  return n;
}

// ---------- Codificación base64url y firma HMAC ----------

const codificador = new TextEncoder();

export function aBase64url(bytes) {
  let texto = '';
  for (const b of new Uint8Array(bytes)) texto += String.fromCharCode(b);
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64url(texto) {
  const normal = texto.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = normal + '='.repeat((4 - (normal.length % 4)) % 4);
  const binario = atob(relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function clave(secreto) {
  return crypto.subtle.importKey('raw', codificador.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function firmar(datos, secreto) {
  const cuerpo = aBase64url(codificador.encode(JSON.stringify(datos)));
  const firma = await crypto.subtle.sign('HMAC', await clave(secreto), codificador.encode(cuerpo));
  return `${cuerpo}.${aBase64url(firma)}`;
}

export async function verificar(token, secreto) {
  if (!token || typeof token !== 'string') return null;
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  let valido = false;
  try {
    valido = await crypto.subtle.verify('HMAC', await clave(secreto), deBase64url(firma), codificador.encode(cuerpo));
  } catch {
    return null;
  }
  if (!valido) return null;
  try {
    const datos = JSON.parse(new TextDecoder().decode(deBase64url(cuerpo)));
    if (typeof datos.x === 'number' && datos.x < Date.now()) return null;
    return datos;
  } catch {
    return null;
  }
}

export function aleatorio(n = 16) {
  return aBase64url(crypto.getRandomValues(new Uint8Array(n)));
}

// ---------- Cookies ----------

export function leerCookie(request, nombre) {
  const texto = request.headers.get('Cookie') || '';
  for (const parte of texto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function cookie(nombre, valor, segundos) {
  const partes = [`${nombre}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  partes.push(`Max-Age=${Math.max(0, Math.floor(segundos))}`);
  return partes.join('; ');
}

// ---------- Colores de equipo ----------
// Paleta fija (la CSP no permite estilos en línea): cada equipo elige una clase.
export const COLORES = {
  turquesa: 'Turquesa',
  morado: 'Morado',
  dorado: 'Dorado',
  rojo: 'Rojo',
  azul: 'Azul',
  verde: 'Verde',
  naranja: 'Naranja',
  rosa: 'Rosa',
  celeste: 'Celeste',
  gris: 'Gris',
  negro: 'Negro',
  blanco: 'Blanco',
};

export function colorValido(c) {
  return Object.hasOwn(COLORES, c) ? c : 'morado';
}

// ---------- Nombres de estudiantes ----------
// "ALVAREZ ORTEGA VICTORIA" → { nombres: "Victoria", apellido: "Álvarez" } → público: "Victoria A."
const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'SAN', 'SANTA', 'Y', 'VAN', 'VON', 'DA', 'DI', 'MC', 'MAC']);

export function titulo(texto) {
  return String(texto || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

export function partirNombre(completo) {
  const t = String(completo || '').trim().split(/\s+/).filter(Boolean);
  const tomarApellido = () => {
    const partes = [];
    while (t.length && PARTICULAS.has(t[0].toUpperCase())) partes.push(t.shift());
    if (t.length) partes.push(t.shift());
    return partes.join(' ');
  };
  const ap1 = tomarApellido();
  // Con 3 o más palabras restantes se asume un segundo apellido; con menos, lo que queda son nombres.
  const ap2 = t.length >= 2 ? tomarApellido() : '';
  const nombres = t.join(' ');
  return { apellido: titulo(ap1), apellido2: titulo(ap2), nombres: titulo(nombres || ap2 || ap1) };
}

export function nombreCorto(completo) {
  const { apellido, nombres } = partirNombre(completo);
  const primero = nombres.split(' ')[0] || '';
  const inicial = (apellido.split(' ').find((p) => !PARTICULAS.has(p.toUpperCase())) || apellido)[0] || '';
  return `${primero} ${inicial ? inicial.toUpperCase() + '.' : ''}`.trim();
}

export function nombreOrdenado(completo) {
  const { apellido, apellido2, nombres } = partirNombre(completo);
  return `${nombres} ${apellido}${apellido2 ? ' ' + apellido2 : ''}`.trim();
}

// Quita tildes y pasa a mayúsculas, para comparar nombres de cursos.
export function claveTexto(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// Sigla de 3 letras que no se repita dentro del torneo: Amables → AMA, Amigables → AMI, Amistosos → AMS.
export function siglaUnica(nombre, usadas) {
  const letras = claveTexto(nombre).replace(/[^A-Z0-9]/g, '');
  if (!letras) return '?';
  for (let i = 2; i < letras.length; i++) {
    const s = letras[0] + letras[1] + letras[i];
    if (!usadas.has(s)) { usadas.add(s); return s; }
  }
  for (let n = 2; n < 99; n++) {
    const s = letras.slice(0, 2) + n;
    if (!usadas.has(s)) { usadas.add(s); return s; }
  }
  return letras.slice(0, 3);
}
