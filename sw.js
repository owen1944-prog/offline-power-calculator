'use strict';
const VERSION = '0.4.1';
const BASE = new URL('./', self.location.href);
const PREFIX = 'power-calculator-' + encodeURIComponent(BASE.pathname) + '-';
const CACHE_NAME = PREFIX + VERSION;
const FILES = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const URLS = FILES.map(file => new URL(file, BASE).href);
async function prepareOffline() {
  const responses = await Promise.all(URLS.map(async url => {
    const response = await fetch(new Request(url, { cache: 'reload' }));
    if (!response.ok) throw new Error('Missing file');
    return response;
  }));
  const html = await responses[0].clone().text();
  if (!html.includes('name="app-version" content="' + VERSION + '"')) throw new Error('Version mismatch');
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(URLS.map((url, i) => cache.put(url, responses[i])));
}
async function isReady() {
  if (!(await caches.has(CACHE_NAME))) return false;
  const cache = await caches.open(CACHE_NAME);
  for (const url of URLS) { if (!(await cache.match(url))) return false; }
  const html = await (await cache.match(URLS[0])).text();
  return html.includes('name="app-version" content="' + VERSION + '"');
}
self.addEventListener('install', event => { event.waitUntil(prepareOffline()); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin) return;
  const isAppPage = event.request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === new URL('index.html', BASE).pathname);
  const known = URLS.includes(url.origin + url.pathname);
  if (!isAppPage && !known) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = isAppPage ? URLS[0] : url.origin + url.pathname;
    const cached = await cache.match(key);
    if (cached) return cached;
    return fetch(event.request);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') { event.waitUntil(self.skipWaiting()); return; }
  if (!['CHECK_READY', 'PREPARE_OFFLINE'].includes(event.data?.type)) return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'PREPARE_OFFLINE') await prepareOffline();
      port?.postMessage({ ready: await isReady(), version: VERSION });
    } catch (_) { port?.postMessage({ ready: false, version: VERSION }); }
  })());
});
