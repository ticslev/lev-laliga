// Durable Object "PartidoVivo": una sala por partido.
// Los celulares del público se conectan por WebSocket y reciben cada cambio que registra el árbitro.
// Usa la API de hibernación: si nadie habla, el objeto se duerme y no consume.

import { borrarVencidas } from './avisos.js';

const POR_TANDA = 40; // conexiones por invocación (el plan gratuito permite 50)

export class PartidoVivo {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  // Cola de avisos de gol: se envían en tandas, cada una en su propia alarma.
  async encolarAvisos(datos) {
    const cola = (await this.state.storage.get('cola')) || [];
    for (const endpoint of datos.endpoints || []) {
      const firma = datos.firmas[new URL(endpoint).origin];
      if (firma) cola.push({ endpoint, firma });
    }
    await this.state.storage.put('cola', cola.slice(-5000));
    await this.state.storage.setAlarm(Date.now() + 50);
  }

  async alarm() {
    const cola = (await this.state.storage.get('cola')) || [];
    const tanda = cola.splice(0, POR_TANDA);
    const vencidas = [];
    await Promise.all(tanda.map(async ({ endpoint, firma }) => {
      try {
        const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '600', Urgency: 'high', Authorization: firma, 'Content-Length': '0' } });
        if (r.status === 404 || r.status === 410) vencidas.push(endpoint);
      } catch (e) {
        console.error('Aviso', e);
      }
    }));
    await this.state.storage.put('cola', cola);
    if (cola.length) await this.state.storage.setAlarm(Date.now() + 200);
    if (vencidas.length && this.env?.DB) await borrarVencidas(this.env.DB, vencidas);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/ws')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Se esperaba WebSocket', { status: 426 });
      }
      const par = new WebSocketPair();
      const [cliente, servidor] = Object.values(par);
      this.state.acceptWebSocket(servidor);
      return new Response(null, { status: 101, webSocket: cliente });
    }

    // El Worker avisa aquí cada vez que cambia el partido; se reenvía a todos.
    if (request.method === 'POST' && url.pathname.endsWith('/aviso')) {
      const texto = await request.text();
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(texto);
        } catch {
          // conexión cerrada: se ignora
        }
      }
      return new Response('ok');
    }

    if (request.method === 'POST' && url.pathname.endsWith('/push')) {
      await this.encolarAvisos(await request.json());
      return new Response('ok');
    }

    if (url.pathname.endsWith('/cuantos')) {
      return new Response(String(this.state.getWebSockets().length));
    }

    return new Response('No encontrado', { status: 404 });
  }

  webSocketMessage(ws, mensaje) {
    if (mensaje === 'ping') ws.send('pong');
  }

  webSocketClose(ws, codigo) {
    try {
      ws.close(codigo, 'Hasta pronto');
    } catch {
      // ya estaba cerrada
    }
  }

  webSocketError() {}
}

// Avisa a la sala del partido (si el binding existe; en pruebas locales no hay).
export function avisar(env, ctx, partidoId, datos) {
  if (!env.PARTIDOS) return;
  const stub = env.PARTIDOS.get(env.PARTIDOS.idFromName(String(partidoId)));
  const envio = stub
    .fetch('https://vivo/aviso', { method: 'POST', body: JSON.stringify(datos) })
    .catch((e) => console.error('Aviso en vivo', e));
  if (ctx?.waitUntil) ctx.waitUntil(envio);
}

export function conectar(env, request, partidoId) {
  if (!env.PARTIDOS) return new Response('Sin conexión en vivo', { status: 501 });
  const stub = env.PARTIDOS.get(env.PARTIDOS.idFromName(String(partidoId)));
  return stub.fetch(new Request('https://vivo/ws', request));
}
