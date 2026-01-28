/**
 * Service Worker for Fitness Tracker PWA
 * Enables offline functionality and caching
 */

const CACHE_NAME = 'fitness-tracker-v1';
const OFFLINE_URL = '/offline.html';

// Files to cache
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/data.js',
    '/js/exercises.js',
    '/js/badges.js',
    '/js/charts.js',
    '/js/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// External resources to cache
const EXTERNAL_ASSETS = [
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap'
];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                // Cache static assets
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Failed to cache:', error);
            })
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                // Take control of all clients
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - serve from cache, fallback to network
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle different request types
    if (request.method !== 'GET') {
        return;
    }

    // For navigation requests (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    return caches.match('/index.html');
                })
        );
        return;
    }

    // For static assets - cache first, then network
    if (isStaticAsset(url)) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request)
                        .then((response) => {
                            // Cache the new response
                            if (response.ok) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then((cache) => {
                                        cache.put(request, responseClone);
                                    });
                            }
                            return response;
                        });
                })
        );
        return;
    }

    // For external resources (CDN, fonts) - network first, then cache
    if (isExternalResource(url)) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(request, responseClone);
                            });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(request);
                })
        );
        return;
    }

    // Default: network first
    event.respondWith(
        fetch(request)
            .catch(() => {
                return caches.match(request);
            })
    );
});

/**
 * Check if URL is a static asset
 */
function isStaticAsset(url) {
    const staticExtensions = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.svg', '.ico'];
    return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

/**
 * Check if URL is an external resource
 */
function isExternalResource(url) {
    const externalHosts = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
    return externalHosts.includes(url.host);
}

/**
 * Handle push notifications
 */
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'وقت التمرين!',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [100, 50, 100],
        dir: 'rtl',
        lang: 'ar',
        tag: 'fitness-notification',
        actions: [
            {
                action: 'open',
                title: 'فتح التطبيق',
                icon: '/icons/check.png'
            },
            {
                action: 'dismiss',
                title: 'تجاهل',
                icon: '/icons/close.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('متتبع اللياقة', options)
    );
});

/**
 * Handle notification click
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clientList) => {
                    // If app is already open, focus it
                    for (const client of clientList) {
                        if (client.url.includes('/index.html') && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    // Otherwise, open new window
                    if (clients.openWindow) {
                        return clients.openWindow('/index.html');
                    }
                })
        );
    }
});

/**
 * Background sync for offline actions
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

/**
 * Sync data when back online
 */
async function syncData() {
    // This would sync any pending data when the user comes back online
    // For now, localStorage is used, so no sync needed
    console.log('Background sync triggered');
}

/**
 * Message handler for communication with main app
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME)
            .then(() => {
                event.ports[0].postMessage({ success: true });
            });
    }
});
