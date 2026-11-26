// La firma VAPID (ES256) que autoriza los avisos debe verificarse con la clave pública.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmaVapid } from '../worker/avisos.js';
import { aBase64url, deBase64url } from '../worker/util.js';

test('firma VAPID válida', async () => {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const datos = { privada: await crypto.subtle.exportKey('jwk', par.privateKey), publica: aBase64url(await crypto.subtle.exportKey('raw', par.publicKey)) };
  const cab = await firmaVapid(datos, 'https://fcm.googleapis.com', 'mailto:ti@lev.edu.ec');
  const m = cab.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(m, 'formato vapid t=…, k=…');
  assert.equal(m[4], datos.publica);
  const cuerpo = JSON.parse(new TextDecoder().decode(deBase64url(m[2])));
  assert.equal(cuerpo.aud, 'https://fcm.googleapis.com');
  assert.ok(cuerpo.exp > Date.now() / 1000);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, par.publicKey, deBase64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  assert.ok(ok);
});
