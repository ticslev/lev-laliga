# La Liga Lev · laliga.lev.edu.ec

Sitio del campeonato interno de la Unidad Educativa Lev Vygotsky: fixture por nivel, tabla de posiciones, goleadores, fair play, suspendidos, fichas de equipo y **partidos en vivo** que alimenta el árbitro desde su celular.

Corre en un **Cloudflare Worker** con base de datos **D1** y un **Durable Object** por partido para el marcador en vivo. No hay ninguna VM.

## Qué tiene

**Público** (sin iniciar sesión)
- Portada:
  - cinta animada de resultados;
  - el partido en vivo destacado;
  - próximos partidos;
  - posiciones y goleadores;
  - acceso a cada torneo.
- `/fixture/`: jornadas por torneo (disciplina + nivel), la fase final y el botón **Agregar a mi calendario** (archivo `.ics`).
- `/posiciones/`: tabla completa con los últimos 5 resultados, goleadores o anotadores, fair play, **suspendidos para la próxima fecha** y reglamento.
- `/equipos/` y `/equipos/<id>/`: ficha con plantilla, goles y tarjetas por jugador, partidos y rendimiento.
- `/partido/<id>/`: marcador, reloj, minuto a minuto, nóminas, animación de **¡GOL!** y botón Compartir. Se actualiza al instante por WebSocket; si no puede conectarse, consulta cada 5 segundos.
- `/vivo/`: los partidos en juego y la programación del día.
- `/tv/`: **modo TV** para una pantalla grande en el patio o el coliseo, con marcador gigante, reloj y cinta de resultados.

**Encargados** (`/panel/`, con cuenta Google @lev.edu.ec)

| Rol | Qué puede hacer |
|---|---|
| Administrador | Todo, además de usuarios y roles. Los correos de la variable `ADMINS` siempre son administradores. |
| Editor | Torneos, equipos, nóminas, partidos, fixture automático, fase final, resultados manuales y arbitrar cualquier partido. |
| Árbitro | Solo los partidos que le asignaron (ve "Mis partidos" y el botón **Arbitrar**). |

La primera vez que alguien entra queda **pendiente** hasta que un administrador le da un rol en *Usuarios y roles*. También se puede autorizar un correo antes de que entre. Cada cambio queda en el **Historial**.

**Panel del árbitro** (`/arbitro/<id>/`, pensado para el celular al sol)
- **Reloj:** iniciar, pausar y reanudar, fin de periodo, siguiente periodo, finalizar y ajustar reloj.
- **Anotaciones según la disciplina:**
  - fútbol y fútbol sala: GOL, amarilla, roja y cambio;
  - básquet: +1, +2 y +3;
  - ecuavóley: SET.
- **Jugador:** al tocar GOL o una tarjeta se elige el jugador. También se puede marcar como "Sin identificar" o como autogol del rival.
- **Deshacer último.** Un editor puede **reabrir** un partido terminado.
- **Sin señal:** cada toque se guarda primero en el celular, con el minuto del momento, y se envía solo cuando vuelve la conexión.

**Disciplinas:** fútbol, fútbol sala, básquet, ecuavóley y "otra" (para el ajedrez, por ejemplo, con resultado manual). Cada torneo configura:
- periodos y minutos;
- puntos por ganar, empatar y perder;
- cuántos clasifican;
- con cuántas amarillas se suspende.

## Publicar en Cloudflare (desde la consola web)

1. **Base de datos:** Cloudflare → *Storage & Databases* → *D1* → **Create** → nombre `lev-laliga`. Copia el **Database ID** y pégalo en `wrangler.jsonc` (`"database_id"`). Haz commit. Las tablas se crean solas.
2. **Cliente OAuth de Google:** [console.cloud.google.com](https://console.cloud.google.com) → *APIs y servicios* → *Credenciales* → *Crear credenciales* → *ID de cliente de OAuth* → *Aplicación web*.
   - Pantalla de consentimiento: tipo **Interno**.
   - URI de redirección autorizado: `https://laliga.lev.edu.ec/auth/callback`
3. **Worker:** *Workers & Pages* → **Create** → *Import a repository* → `ticslev/lev-laliga`, rama `main`. Cloudflare toma la configuración de `wrangler.jsonc` (D1, Durable Object y comando de build).
4. **Variables:** Worker `lev-laliga` → *Settings* → *Variables and Secrets*. Agrega como **Secret**:
   - `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, del paso 2;
   - `SESSION_SECRET`: un texto aleatorio de 48 caracteres o más;
   - `ADMINS`: tu correo (puedes poner varios, separados por comas).
5. **Dominio:** borra el registro DNS `laliga` si existe. Luego Worker → *Settings* → *Domains & Routes* → *Add* → *Custom domain* → `laliga.lev.edu.ec`.
6. Entra a `https://laliga.lev.edu.ec/panel/` con tu cuenta. En el inicio puedes **cargar datos de ejemplo** para ver todo funcionando; se borran después desde cada torneo con *Borrar torneo*.

## Uso típico

1. **Torneos y equipos:** crea un torneo por disciplina y nivel (por ejemplo "Básica Superior") y pega los equipos, uno por línea.
2. En cada equipo, pega la nómina, una línea por jugador: `10, Mateo R., Delantero`. Por privacidad, usa nombre e inicial del apellido.
3. **Generar fixture automático:** indica la primera fecha, la hora, la separación entre partidos y las canchas.
4. **Usuarios y roles:** da el rol **Árbitro** a los profesores. En *Partidos* asigna un árbitro a cada partido.
5. El día del partido, el árbitro abre `laliga.lev.edu.ec/panel/` en su celular → **Arbitrar** → *Iniciar partido*.
6. Al cerrar la fase de grupos: torneo → **Fase final** → *Crear cruces* (semifinales 1.º vs 4.º y 2.º vs 3.º, o final directa).

## Estructura

```
worker/
  index.js       rutas, seguridad (CSP estricta, mismo origen en formularios)
  auth.js        inicio de sesión con Google (reutilizado de Lev Link) y roles
  db.js          esquema de D1 (se crea solo)
  datos.js       disciplinas, posiciones, goleadores, fair play, suspendidos, fixture
  sitio.js       páginas públicas, API pública y calendario .ics
  panel.js       panel de encargados (formularios)
  arbitro.js     acciones del árbitro (reloj, goles, tarjetas, deshacer)
  vivo.js        Durable Object PartidoVivo (WebSocket por partido)
  ejemplo.js     datos de ejemplo
  vistas/        HTML de las páginas
public/_app/     estilos.css, sitio.js, partido.js, arbitro.js, eventos.js, panel.js
pruebas/         servidor local (SQLite) y pruebas
```

## Probar en el computador

Requiere Node 22.5 o superior; no hace falta instalar nada.

```bash
npm run local      # http://localhost:4325 — entra sin Google como admin@lev.edu.ec
npm test           # pruebas del fixture y del reloj
```

En local no hay Durable Object: la página del partido se actualiza consultando cada 5 segundos. Para entrar como otra cuenta: `/auth/login?como=arbitro@lev.edu.ec`.

## Límites del plan gratuito

- Cada toque del árbitro escribe 1 o 2 filas en D1.
- La página pública lee de D1 solo al abrirse. Mientras el partido está en juego, cada cambio le llega por el WebSocket, así que no hace más lecturas.
- El Durable Object usa la API de hibernación: si nadie envía nada, no consume.
