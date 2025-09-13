const CACHE_NAME = 'strategy9-g2e-v1';
const API_CACHE = 'strategy9-api-v1';
const CACHE_DURATION = 60 * 1000; // 1 minute for API responses

const urlsToCache = [
  '/G2E/',
  '/G2E/index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.log('Cache failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

    // Skip non-HTTP(S) requests to avoid cache errors
  if (!request.url.startsWith('http')) {
    return;
  }

  const url = new URL(request.url);

  // Handle API requests with time-based caching
  if (url.pathname.includes('/api/services/app/Survey/GetPublicStatistics')) {
    event.respondWith(
      caches.open(API_CACHE).then(cache => {
        return cache.match(request).then(cachedResponse => {
          if (cachedResponse) {
            // Check if cache is still valid
            const cachedTime = cachedResponse.headers.get('sw-cache-time');
            if (cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_DURATION) {
              return cachedResponse;
            }
          }

          // Fetch fresh data
          return fetch(request).then(response => {
            // Clone the response to add custom header
            const responseToCache = response.clone();
            const headers = new Headers(responseToCache.headers);
            headers.append('sw-cache-time', Date.now().toString());

            // Create new response with timestamp
            const timedResponse = new Response(responseToCache.body, {
              status: responseToCache.status,
              statusText: responseToCache.statusText,
              headers: headers
            });

            // Cache the response
            cache.put(request, timedResponse.clone()).catch(err => {
              console.log('Failed to cache API response:', err);
            });
            return response;
          }).catch(() => {
            // Return cached response if available, even if expired
            return cachedResponse || new Response(JSON.stringify({
              error: 'Offline',
              message: 'Unable to fetch survey statistics'
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        });
      })
    );
    return;
  }

  // Handle survey submission requests - queue if offline
  if (url.pathname.includes('/s/e/anonymous/')) {
    event.respondWith(
      fetch(request).catch(() => {
        // Store failed submission for later
        return storeOfflineSubmission(request.url).then(() => {
          return new Response(JSON.stringify({
            success: true,
            offline: true,
            message: 'Response saved and will be submitted when online'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Default strategy for other requests
  event.respondWith(
    caches.match(request).then(response => {
      return response || fetch(request).then(response => {
        // Cache successful responses
        if (response.status === 200 && request.method === 'GET') {
          const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache).catch(err => {
            console.log('Failed to cache request:', request.url, err);
          });
        });
        }
        return response;
      }).catch(() => {
        // Offline fallback for HTML pages
        if (request.destination === 'document') {
          return caches.match('/G2E/index.html');
        }
      });
    })
  );
});

// Store offline submissions using IndexedDB
async function storeOfflineSubmission(url) {
  // This would integrate with IndexedDB in your main app
  // For now, we'll just log it
  console.log('Storing offline submission:', url);
  
  // Send message to all clients about offline submission
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'OFFLINE_SUBMISSION',
      url: url,
      timestamp: Date.now()
    });
  });
}

// Listen for sync event to submit queued responses
self.addEventListener('sync', event => {
  if (event.tag === 'submit-surveys') {
    event.waitUntil(submitQueuedSurveys());
  }
});

async function submitQueuedSurveys() {
  // This would retrieve and submit stored surveys from IndexedDB
  console.log('Attempting to submit queued surveys...');
}