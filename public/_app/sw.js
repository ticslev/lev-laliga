// La Liga Lev — service worker: muestra los avisos de goles del curso.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (evento) {
  evento.waitUntil(
    self.registration.pushManager.getSubscription()
      .then(function (sub) {
        return fetch('/api/avisos/ultimo?endpoint=' + encodeURIComponent(sub ? sub.endpoint : ''), { cache: 'no-store' });
      })
      .then(function (r) { return r.json(); })
      .catch(function () { return { titulo: 'La Liga Lev', cuerpo: 'Hay novedades en el partido de tu curso.', url: '/' }; })
      .then(function (a) {
        return self.registration.showNotification(a.titulo, {
          body: a.cuerpo || '',
          icon: '/_app/icono-192.png',
          badge: '/_app/icono-192.png',
          tag: a.url || 'laliga',
          renotify: true,
          data: { url: a.url || '/' },
        });
      })
  );
});

self.addEventListener('notificationclick', function (evento) {
  evento.notification.close();
  var destino = (evento.notification.data && evento.notification.data.url) || '/';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        if ('focus' in lista[i]) { lista[i].navigate(destino); return lista[i].focus(); }
      }
      return self.clients.openWindow(destino);
    })
  );
});
