// Copia las fuentes (instaladas con npm en Cloudflare) a public/_app/fonts.
// Si no están instaladas, el sitio igual funciona con las fuentes del sistema.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const destino = join('public', '_app', 'fonts');
mkdirSync(destino, { recursive: true });

const fuentes = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter.woff2'],
  ['@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2', 'barlow-condensed-700.woff2'],
  ['@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2', 'barlow-condensed-800.woff2'],
];

for (const [origen, nombre] of fuentes) {
  const ruta = join('node_modules', origen);
  if (existsSync(ruta)) {
    copyFileSync(ruta, join(destino, nombre));
    console.log(`Fuente copiada: ${nombre}`);
  } else {
    console.warn(`Aviso: no se encontró ${origen}; se usará la fuente del sistema.`);
  }
}
