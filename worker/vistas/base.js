// Plantilla común: cabecera, pie y piezas que se repiten (escudos, tarjetas de partido).
import { e, fechaCorta } from '../util.js';
import { ESTADOS, FASES, disciplina } from '../datos.js';

export const NOMBRE = 'La Liga Lev';

const NAV = [
  ['inicio', '/', 'Inicio'],
  ['calendario', '/calendario/', 'Calendario'],
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
<link rel="manifest" href="/_app/manifest.webmanifest">
<link rel="apple-touch-icon" href="/_app/icono-180.png">
<link rel="stylesheet" href="/_app/estilos.css">
${[...scripts, '/_app/comun.js'].map((s) => `<script src="${s}" defer></script>`).join('\n')}
</head>
<body class="${e(clase)}">
<a class="saltar" href="#contenido">Saltar al contenido</a>
${sinCabecera ? '' : `<header class="cabecera">
<div class="contenedor cabecera-fila">
<a class="logo" href="/">${TROFEO}<span>LA LIGA LEV<small>Campeonato interno</small></span></a>
<nav class="nav" aria-label="Principal">${nav}<a href="/vivo/" class="nav-vivo${actual === 'vivo' ? ' activo' : ''}"${actual === 'vivo' ? ' aria-current="page"' : ''}>${enVivo ? '<span class="punto-vivo" aria-hidden="true"></span>' : ''}En vivo</a></nav>
<button type="button" class="mi-curso-chip" data-mi-curso hidden><span class="mc-sigla" aria-hidden="true">+</span><span class="mc-texto">Mi curso</span></button>
<a class="boton-encargados" href="/panel/">Encargados</a>
</div>
</header>`}
<main id="contenido" class="${sinCabecera ? '' : 'principal'}">
${cuerpo}
</main>
${sinCabecera ? '' : `<footer class="pie contenedor">
<span>Unidad Educativa Lev Vygotsky · Campeonato interno</span>
<span class="pie-enlaces"><a href="/tv/">Modo TV</a><a href="/panel/">Encargados</a><a href="https://lev.edu.ec">lev.edu.ec</a></span>
</footer>
<nav class="pestanas" aria-label="Secciones">
<a href="/"${actual === 'inicio' ? ' aria-current="page"' : ''}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Hoy${enVivo ? '<span class="pestana-vivo" aria-label="hay partidos en vivo"></span>' : ''}</a>
<a href="/calendario/"${actual === 'calendario' || actual === 'fixture' ? ' aria-current="page"' : ''}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>Calendario</a>
<a href="/posiciones/"${actual === 'posiciones' ? ' aria-current="page"' : ''}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>Tablas</a>
<a href="/equipos/"${actual === 'equipos' ? ' aria-current="page"' : ''}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3 2.8 3 6"/></svg>Equipos</a>
</nav>
<dialog class="hoja-cursos" id="hoja-cursos" aria-labelledby="hc-titulo">
<form method="dialog" class="hc-caja">
<h2 id="hc-titulo">¿Cuál es tu curso?</h2>
<p>Se guarda solo en este celular. La portada te mostrará sus partidos y su puesto en cada tabla.</p>
<input type="search" id="hc-buscar" placeholder="Buscar curso o paralelo" aria-label="Buscar curso">
<div class="hc-lista" id="hc-lista"><p class="nota">Cargando cursos…</p></div>
<div class="hc-pie"><button value="quitar" class="boton boton-borde boton-chico" id="hc-quitar" type="button">Quitar mi curso</button><button value="cerrar" class="boton boton-oro boton-chico">Listo</button></div>
</form>
</dialog>`}
</body>
</html>`;
}

export function nombreLocal(p) {
  return p.local_nombre || p.etiqueta_local || 'Por definir';
}

export function nombreVisita(p) {
  return p.visita_nombre || p.etiqueta_visita || 'Por definir';
}

// "Hoy · 13:45", o "Día de juego 12 · 13:45" si el día aún no tiene fecha.
export function cuando(p, { hora = true } = {}) {
  if (p.fecha) return fechaCorta(p.fecha, { hora });
  if (p.dia) return `Día de juego ${p.dia}${hora && p.hora ? ' · ' + p.hora : ''}`;
  return 'Fecha por definir';
}

// Resultado anotado solo con el ganador (sin goles).
export function soloGanador(p) {
  return p.estado === 'finalizado' && !p.marcador;
}

export function escudo(nombre, sigla, color, tam = 'm') {
  return `<span class="escudo escudo-${tam} c-${e(color || 'gris')}" aria-hidden="true">${e(sigla || '?')}</span>`;
}

export function etiquetaEstado(p) {
  if (p.estado === 'en_vivo') return '<span class="estado estado-vivo"><span class="punto-vivo" aria-hidden="true"></span>En vivo</span>';
  if (p.estado === 'entretiempo') return '<span class="estado estado-vivo">Descanso</span>';
  if (p.estado === 'finalizado') return '<span class="estado estado-final">Final</span>';
  if (p.estado === 'suspendido') return '<span class="estado estado-susp">Suspendido</span>';
  return `<span class="estado">${e(cuando(p))}</span>`;
}

export function centroMarcador(p) {
  if (p.estado === 'programado') {
    return `<span class="m-hora">${e(p.hora || (p.fecha && p.fecha.length > 10 ? p.fecha.slice(11, 16) : 'vs'))}</span>`;
  }
  if (soloGanador(p)) {
    return `<span class="m-goles m-ganador">${p.ganador === 'empate' ? 'EMP' : p.ganador === 'local' ? '◀ G' : 'G ▶'}</span>`;
  }
  return `<span class="m-goles${p.estado === 'en_vivo' || p.estado === 'entretiempo' ? ' m-vivo' : ''}" data-marcador="${p.id}">${p.goles_local} – ${p.goles_visita}</span>`;
}

// Fila de partido para listas (fixture, ficha de equipo).
export function filaPartido(p, { mostrarTorneo = false } = {}) {
  const gano = p.estado === 'finalizado' ? p.ganador || (p.goles_local > p.goles_visita ? 'local' : p.goles_local < p.goles_visita ? 'visita' : 'empate') : null;
  const info = [
    p.estado === 'programado' ? cuando(p) : soloGanador(p) ? (p.ganador === 'empate' ? 'Empate' : `Ganó ${p.ganador === 'local' ? nombreLocal(p) : nombreVisita(p)}`) : ESTADOS[p.estado],
    p.lugar,
    mostrarTorneo ? p.torneo_nombre : null,
    p.fase && p.fase !== 'grupos' ? FASES[p.fase] : null,
  ].filter(Boolean).map(e).join(' · ');
  return `<a class="fila-partido${p.estado === 'en_vivo' ? ' fila-vivo' : ''}" href="/partido/${p.id}/">
<span class="fp-equipo fp-local${gano === 'local' ? ' fp-gano' : ''}">${e(nombreLocal(p))}${escudo(p.local_nombre, p.local_sigla, p.local_color, 's')}</span>
${centroMarcador(p)}
<span class="fp-equipo${gano === 'visita' ? ' fp-gano' : ''}">${escudo(p.visita_nombre, p.visita_sigla, p.visita_color, 's')}${e(nombreVisita(p))}</span>
<span class="fp-info">${p.estado === 'en_vivo' ? '<span class="punto-vivo" aria-hidden="true"></span>' : ''}${info}</span>
</a>`;
}

// Tarjeta compacta (próximos partidos en portada).
export function tarjetaPartido(p) {
  return `<a class="tarjeta tarjeta-partido" href="/partido/${p.id}/">
<span class="tp-arriba"><span>${e(cuando(p))}</span><span>${e(p.lugar || '')}</span></span>
<span class="tp-equipo">${escudo(p.local_nombre, p.local_sigla, p.local_color, 's')}${e(nombreLocal(p))}</span>
<span class="tp-equipo">${escudo(p.visita_nombre, p.visita_sigla, p.visita_color, 's')}${e(nombreVisita(p))}</span>
<span class="tp-torneo">${e(p.competencia || disciplina(p).nombre)} · ${e(p.nivel || p.torneo_nombre)}</span>
</a>`;
}

export function vacio(texto) {
  return `<p class="vacio">${e(texto)}</p>`;
}
