// La Liga Lev — laliga.lev.edu.ec
// Campeonato interno de la Unidad Educativa Lev Vygotsky: fixture, posiciones, goleadores
// y partidos en vivo que alimenta el árbitro desde la cancha.
import { asegurarEsquema } from './db.js';
import { usuarioActual, iniciar, volverDeGoogle, salir } from './auth.js';
import { rutaPublica, apiPublica, noEncontrado } from './sitio.js';
import { rutaPanel, paginaArbitro } from './panel.js';
import { accionArbitro } from './arbitro.js';
import { apiAvisos } from './avisos.js';
import { error, redirigir, html, json } from './util.js';

export { PartidoVivo } from './vivo.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https://lh3.googleusercontent.com",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
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

  // Service worker de los avisos: debe servirse desde la raíz para cubrir todo el sitio.
  if (ruta === '/sw.js') {
    const r = await env.ASSETS.fetch(new Request(new URL('/_app/sw.js', url), request));
    const h = new Response(r.body, r);
    h.headers.set('Content-Type', 'text/javascript; charset=utf-8');
    h.headers.set('Cache-Control', 'no-cache');
    return h;
  }

  // Archivos del sitio (estilos, scripts, fuentes, iconos).
  if (ruta.startsWith('/_app/') || ruta === '/robots.txt' || ruta === '/favicon.ico') {
    return env.ASSETS.fetch(request);
  }

  // Rutas sin barra final: /fixture → /fixture/
  if (/^\/(fixture|posiciones|equipos|calendario|vivo|tv|entrar|panel)$/.test(ruta)) return redirigir(ruta + '/' + url.search, 301);

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

  if (ruta.startsWith('/api/avisos')) {
    return (await apiAvisos(request, env, url)) || error('No encontrado.', 404);
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
    // Envíos rápidos desde el celular (sin recargar): la redirección con el aviso se convierte en JSON.
    if (r && request.headers.get('X-Rapido') === '1' && r.status === 303) {
      const destino = new URL(r.headers.get('Location'), url);
      const ok = destino.searchParams.get('ok');
      return json({ ok: Boolean(ok), mensaje: ok || destino.searchParams.get('error') || '' }, ok ? 200 : 400);
    }
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
