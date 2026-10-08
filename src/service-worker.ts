/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Offline support: app code and static files are cached at install. Pages and their data are
// fetched from the network first; the last copy is kept so budgets can be viewed offline
// (read-only). Saving changes always needs the network.

const sw = self as unknown as ServiceWorkerGlobalScope;
const ASSETS = `assets-${version}`;
const PAGES = 'pages-v1';
const precache = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(ASSETS)
			.then((c) => c.addAll(precache))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== ASSETS && k !== PAGES).map((k) => caches.delete(k)))
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('message', (event) => {
	// Sent on sign-out so another person on this device can't read cached pages.
	if (event.data === 'clear-pages') event.waitUntil(caches.delete(PAGES));
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) return;

	if (precache.includes(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((r) => r ?? fetch(req)));
		return;
	}

	const isPage = req.mode === 'navigate' || url.pathname.endsWith('/__data.json');
	if (!isPage) return;
	event.respondWith(
		fetch(req)
			.then((res) => {
				// Only keep real pages, never redirects to the login screen.
				if (res.ok && !res.redirected) {
					const copy = res.clone();
					event.waitUntil(caches.open(PAGES).then((c) => c.put(req, copy)));
				}
				return res;
			})
			.catch(async () => {
				const cached = await caches.match(req);
				if (cached) return cached;
				return new Response(
					'<!doctype html><meta name="viewport" content="width=device-width"><title>Offline</title><body style="font-family:system-ui;padding:2rem"><h1>You are offline</h1><p>This page has not been opened on this device yet. Reconnect and try again.</p>',
					{ status: 503, headers: { 'Content-Type': 'text/html' } }
				);
			})
	);
});
