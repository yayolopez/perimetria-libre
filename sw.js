// Service worker: permite usar la app sin conexión una vez cargada.
// Estrategia "red primero": siempre intenta la versión más nueva y cae a caché si no hay red.
const CACHE = 'perimetria-libre-v4';
const SHELL = [
  './',
  'index.html',
  'monitor.html',
  'styles.css',
  'icon.svg',
  'manifest.webmanifest',
  'src/app/main.js',
  'src/app/monitor.js',
  'src/app/monitor-view.js',
  'src/app/monitor-link.js',
  'src/app/sound.js',
  'src/app/sync.js',
  'src/app/gaze.js',
  'src/app/runner.js',
  'src/app/report.js',
  'src/app/storage.js',
  'src/app/timed-presenter.js',
  'src/app/screen-renderer.js',
  'src/app/xr-renderer.js',
  'src/app/canvas-stage.js',
  'src/app/canvas-renderers.js',
  'src/app/xr-canvas-renderer.js',
  'src/app/tests/index.js',
  'src/app/tests/common.js',
  'src/app/tests/acuity.js',
  'src/app/tests/contrast.js',
  'src/app/tests/amsler.js',
  'src/app/tests/stereo.js',
  'src/app/tests/color.js',
  'src/app/tests/phoria.js',
  'src/app/tests/hess.js',
  'src/core/patterns.js',
  'src/core/luminance.js',
  'src/core/math.js',
  'src/core/devices.js',
  'src/core/procedure.js',
  'src/core/results.js',
  'src/core/simulator.js',
  'src/core/normative.js',
  'src/core/options.js',
  'src/core/screenGeometry.js',
  'src/core/strategies/supraThreshold.js',
  'src/core/adaptive.js',
  'src/core/anonymize.js',
  'src/core/tests/acuity.js',
  'src/core/tests/contrast.js',
  'src/core/tests/amsler.js',
  'src/core/tests/stereo.js',
  'src/core/tests/color.js',
  'src/core/tests/phoria.js',
  'src/core/tests/hess.js',
  'src/core/strategies/zest.js',
  'src/core/strategies/fullThreshold.js',
  'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
