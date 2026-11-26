// La Liga Lev — laliga.lev.edu.ec
// Campeonato interno de la Unidad Educativa Lev Vygotsky: fixture, posiciones, goleadores
// y partidos en vivo que alimenta el árbitro desde la cancha.
import { asegurarEsquema } from './db.js';
import { usuarioActual, iniciar, volverDeGoogle, salir } from './auth.js';
import { rutaPublica, apiPublica, noEncontrado } from './sitio.js';
import { rutaPanel, paginaArbitro } from './panel.js';
import { accionArbitro } from './arbitro.js';
import { error, redirigir, html } from './util.js';

export { PartidoVivo } from './vivo.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https://lh3.googleusercontent.com",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

function conSeguridad(respuesta) {
  if (respuesta.status === 101) return respuesta; // WebSocket
  const r = new Response(respuesta.body, respuesta);
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Strict-Transport-Security', 'max-age=31536000');
  r.headers.set('Referrer-Policy', 'same-origin');
  const tipo = r.headers.get('Content-Type') || '';
  if (tipo.includes('text/html')) {
    r.headers.set('Content-Security-Policy', CSP);
    r.headers.set('X-Frame-Options', 'DENY');
    r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }
  return r;
}

// Los formularios y la API del árbitro solo aceptan envíos desde el mismo sitio.
function mismoOrigen(request, url) {
  const origen = request.headers.get('Origin');
  if (origen) return origen === url.origin;
  const referer = request.headers.get('Referer');
  return Boolean(referer && referer.startsWith(url.origin + '/'));
}

async function manejar(request, env, ctx) {
  const url = new URL(request.url);
  const ruta = url.pathname;

  // Archivos del sitio (estilos, scripts, fuentes, iconos).
  if (ruta.startsWith('/_app/') || ruta === '/robots.txt' || ruta === '/favicon.ico') {
    return env.ASSETS.fetch(request);
  }

  // Rutas sin barra final: /fixture → /fixture/
  if (/^\/(fixture|posiciones|equipos|vivo|tv|entrar|panel)$/.test(ruta)) return redirigir(ruta + '/' + url.search, 301);

  await asegurarEsquema(env.DB);

  if (ruta === '/auth/login') return iniciar(request, env);
  if (ruta === '/auth/callback') return volverDeGoogle(request, env);
  if (ruta === '/auth/salir') return salir();

  if (request.method !== 'GET' && request.method !== 'HEAD' && !mismoOrigen(request, url)) {
    return error('Envío rechazado: debe hacerse desde el mismo sitio.', 403);
  }

  // API del árbitro
  let m = ruta.match(/^\/api\/arbitro\/(\d+)$/);
  if (m) {
    if (request.method !== 'POST') return error('Método no permitido.', 405);
    const yo = await usuarioActual(request, env);
    if (!yo) return error('Tu sesión terminó. Vuelve a entrar.', 401);
    return accionArbitro(request, env, ctx, yo, Number(m[1]));
  }

  if (ruta.startsWith('/api/')) {
    return (await apiPublica(request, env, url, ctx)) || error('No encontrado.', 404);
  }

  // Panel de encargados y panel del árbitro
  m = ruta.match(/^\/arbitro\/(\d+)\/$/);
  if (ruta.startsWith('/panel/') || m) {
    const yo = await usuarioActual(request, env);
    if (!yo) return redirigir('/entrar/?siguiente=' + encodeURIComponent(ruta));
    const r = m ? await paginaArbitro(env, yo, Number(m[1])) : await rutaPanel(request, env, url, yo);
    return r || noEncontrado();
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return error('Método no permitido.', 405);
  return (await rutaPublica(request, env, url)) || noEncontrado();
}

export default {
  async fetch(request, env, ctx) {
    try {
      return conSeguridad(await manejar(request, env, ctx));
    } catch (e) {
      console.error(e);
      const enApi = new URL(request.url).pathname.startsWith('/api/');
      return conSeguridad(
        enApi
          ? error('Algo salió mal en el servidor. Intenta otra vez.', 500)
          : html('<!doctype html><meta charset="utf-8"><title>Error</title><p>Algo salió mal. Intenta otra vez en unos minutos.</p>', 500)
      );
    }
  },
};
