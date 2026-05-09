// Simple service worker — cache app shell for offline / fast reload
const CACHE = 'photo-album-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([
      '/',
      '/index.html',
    ]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  // Skip API requests — don't cache dynamic data
  if (e.request.url.includes('/api/')) return
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  )
})
