// Plantilla común: cabecera, pie y piezas que se repiten (escudos, tarjetas de partido).
import { e, fechaCorta } from '../util.js';
import { ESTADOS, FASES, disciplina } from '../datos.js';

export const NOMBRE = 'La Liga Lev';

const NAV = [
  ['inicio', '/', 'Inicio'],
  ['fixture', '/fixture/', 'Fixture'],
  ['posiciones', '/posiciones/', 'Posiciones'],
  ['equipos', '/equipos/', 'Equipos'],
];

const TROFEO = `<svg class="logo-icono" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 6h24v8a12 12 0 0 1-24 0z" fill="currentColor"/><path d="M14 30h12v4H14zM18 25h4v5h-4z" fill="currentColor"/><path d="M8 9H3v3a6 6 0 0 0 6 6M32 9h5v3a6 6 0 0 1-6 6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`;

export function pagina({ titulo, actual = '', cuerpo, scripts = [], descripcion, clase = '', enVivo = false, sinCabecera = false }) {
  const t = titulo ? `${titulo} · ${NOMBRE}` : `${NOMBRE} · Campeonato interno del Lev`;
  const nav = NAV.map(([id, href, txt]) =>
    `<a href="${href}"${id === actual ? ' aria-current="page"' : ''}>${txt}</a>`).join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(t)}</title>
<meta name="description" content="${e(descripcion || 'Fixture, posiciones, goleadores y partidos en vivo del campeonato interno de la Unidad Educativa Lev Vygotsky.')}">
<meta name="theme-color" content="#120b24">
<link rel="icon" href="/_app/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/_app/estilos.css">
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</head>
<body class="${e(clase)}">
<a class="saltar" href="#contenido">Saltar al contenido</a>
${sinCabecera ? '' : `<header class="cabecera">
<div class="contenedor cabecera-fila">
<a class="logo" href="/">${TROFEO}<span>LA LIGA LEV<small>Campeonato interno</small></span></a>
<nav class="nav" aria-label="Principal">${nav}<a href="/vivo/" class="nav-vivo${actual === 'vivo' ? ' activo' : ''}"${actual === 'vivo' ? ' aria-current="page"' : ''}>${enVivo ? '<span class="punto-vivo" aria-hidden="true"></span>' : ''}En vivo</a></nav>
<a class="boton-encargados" href="/panel/">Encargados</a>
</div>
</header>`}
<main id="contenido" class="${sinCabecera ? '' : 'principal'}">
${cuerpo}
</main>
${sinCabecera ? '' : `<footer class="pie contenedor">
<span>Unidad Educativa Lev Vygotsky · Campeonato interno</span>
<span class="pie-enlaces"><a href="/tv/">Modo TV</a><a href="https://lev.edu.ec">lev.edu.ec</a></span>
</footer>`}
</body>
</html>`;
}

export function escudo(nombre, sigla, color, tam = 'm') {
  return `<span class="escudo escudo-${tam} c-${e(color || 'gris')}" aria-hidden="true">${e(sigla || '?')}</span>`;
}

export function etiquetaEstado(p) {
  if (p.estado === 'en_vivo') return '<span class="estado estado-vivo"><span class="punto-vivo" aria-hidden="true"></span>En vivo</span>';
  if (p.estado === 'entretiempo') return '<span class="estado estado-vivo">Descanso</span>';
  if (p.estado === 'finalizado') return '<span class="estado estado-final">Final</span>';
  if (p.estado === 'suspendido') return '<span class="estado estado-susp">Suspendido</span>';
  return `<span class="estado">${e(fechaCorta(p.fecha))}</span>`;
}

export function centroMarcador(p) {
  if (p.estado === 'programado') {
    return `<span class="m-hora">${e(p.fecha && p.fecha.length > 10 ? p.fecha.slice(11, 16) : 'vs')}</span>`;
  }
  return `<span class="m-goles${p.estado === 'en_vivo' || p.estado === 'entretiempo' ? ' m-vivo' : ''}" data-marcador="${p.id}">${p.goles_local} – ${p.goles_visita}</span>`;
}

// Fila de partido para listas (fixture, ficha de equipo).
export function filaPartido(p, { mostrarTorneo = false } = {}) {
  const info = [
    p.estado === 'programado' ? fechaCorta(p.fecha) : ESTADOS[p.estado],
    p.lugar,
    mostrarTorneo ? p.torneo_nombre : null,
    p.fase && p.fase !== 'grupos' ? FASES[p.fase] : null,
  ].filter(Boolean).map(e).join(' · ');
  return `<a class="fila-partido${p.estado === 'en_vivo' ? ' fila-vivo' : ''}" href="/partido/${p.id}/">
<span class="fp-equipo fp-local">${e(p.local_nombre || 'Por definir')}${escudo(p.local_nombre, p.local_sigla, p.local_color, 's')}</span>
${centroMarcador(p)}
<span class="fp-equipo">${escudo(p.visita_nombre, p.visita_sigla, p.visita_color, 's')}${e(p.visita_nombre || 'Por definir')}</span>
<span class="fp-info">${p.estado === 'en_vivo' ? '<span class="punto-vivo" aria-hidden="true"></span>' : ''}${info}</span>
</a>`;
}

// Tarjeta compacta (próximos partidos en portada).
export function tarjetaPartido(p) {
  return `<a class="tarjeta tarjeta-partido" href="/partido/${p.id}/">
<span class="tp-arriba"><span>${e(fechaCorta(p.fecha))}</span><span>${e(p.lugar || '')}</span></span>
<span class="tp-equipo">${escudo(p.local_nombre, p.local_sigla, p.local_color, 's')}${e(p.local_nombre || 'Por definir')}</span>
<span class="tp-equipo">${escudo(p.visita_nombre, p.visita_sigla, p.visita_color, 's')}${e(p.visita_nombre || 'Por definir')}</span>
<span class="tp-torneo">${e(disciplina(p).nombre)} · ${e(p.nivel || p.torneo_nombre)}</span>
</a>`;
}

export function vacio(texto) {
  return `<p class="vacio">${e(texto)}</p>`;
}
