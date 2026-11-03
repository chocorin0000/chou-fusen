// 電波がないときでも開けるように、ページのファイルを覚えておく。
// 電波があるときは、いつもサーバーから新しいものを読む（直した版がすぐに届くように）。
const CACHE = 'fusen-v2';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png',
  'js/dec.js', 'js/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // 同じ chocorin0000.github.io にほかのアプリもあるので、消すのは自分（fusen-）の覚えだけ
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('fusen-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // レートの読み込みはそのまま
  if (!u.pathname.includes('/chou-fusen/') && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return; // ほかのアプリのファイルには手を出さない
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
