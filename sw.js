// Always-fresh loading: every same-origin request is revalidated with the server
// (a cheap conditional request; 304 when unchanged), so a new release shows up on the
// next page load without Ctrl+Shift+R. No offline cache: this worker only fixes staleness.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req, { cache: 'no-cache' }));
});
