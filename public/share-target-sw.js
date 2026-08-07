// Web Share Target handler. Registered before Workbox's own routing (this file
// is importScripts'd at the top of the generated service worker), so the POST
// from another app's share sheet is captured here rather than falling through
// to the SPA navigation route.
//
// Android/Chromium only — iOS Safari does not implement share_target. The
// import page simply won't see a shared file there, which is the correct
// degradation.
const LM_SHARE_CACHE = 'lm-share'
const LM_SHARE_URL = '/__shared-audio'

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const file = form.get('audio') || form.get('file')
        if (file && typeof file.arrayBuffer === 'function') {
          const cache = await caches.open(LM_SHARE_CACHE)
          await cache.put(
            LM_SHARE_URL,
            new Response(file, {
              headers: {
                'content-type': file.type || 'application/octet-stream',
                'x-lm-filename': encodeURIComponent(file.name || 'shared-audio'),
              },
            }),
          )
        }
      } catch {
        /* fall through to the import page, which will just show an empty picker */
      }
      return Response.redirect('/import?shared=1', 303)
    })(),
  )
})
