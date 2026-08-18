/*jshint esversion: 9 */

var cacheName = 'RISC-V_ALE_v0.2:255';
var urlsToCache = ['./', './index.html', './assets/manifest.json', './modules/pkg/riscv_rs.js', './modules/pkg/riscv_rs_bg.wasm', './assets/css/app.css', './assets/css/styles.css', './assets/css/toast.css', './assets/css/xterm.css', './assets/js/data_table.js', './assets/js/dropdown.js', './assets/js/interface_elements.js', './assets/js/lz-string.min.js', './assets/js/modal.js', './assets/js/tabs.js', './assets/js/toast.js', './assets/js/xterm-addon-fit.min.js', './assets/js/xterm.min.js', './assets/img/Standard-White_2.png', './assets/img/Standard_2.png', './assets/img/Standard_2ALE.png', './assets/img/logo_circle.png', './assets/img/logo_square.png', './assets/fonts/MaterialIcons-Regular.woff2', './assets/fonts/fa-brands-400.woff2', './assets/fonts/fa-regular-400.woff2', './assets/fonts/fa-solid-900.woff2', './assets/fonts/fontawesome-all.min.css', './assets/fonts/material-icons.min.css', './data/config.json', './data/devices.json', './data/home.json', './data/syscalls.json', './data/html/calculator.html', './data/html/calculator.js', './data/html/getting_started.html', './data/html/hello.x', './extensions/devices/bus_helper.js', './extensions/devices/canvas.js', './extensions/devices/general_purpose_timer.js', './extensions/devices/midi_synthesizer.js', './extensions/devices/self_driving_car.js', './extensions/devices/serial_port.js', './extensions/devices/uoli_robot.js', './extensions/devices/utils.js', './modules/assistant.js', './modules/clang.js', './modules/clang_worker.js', './modules/compiler.js', './modules/connection.js', './modules/debugger.js', './modules/ld.lld.js', './modules/mmio_manager.js', './modules/simulator.js', './modules/simulator_worker.js', './modules/terminal.js', './modules/utils.js'];

// Large, optional assets are not precached. The first successful fetch of one
// of these puts it in the cache, so the compiler and the Unity devices work
// offline after one online use without costing every visitor 46 MB up front.
var RUNTIME_CACHE_PATTERNS = [
  /\/modules\/[^/]+\.wasm$/,
  /\/extensions\/devices\/dependencies\//,
];

// Answered from the cache first and refreshed in the background. These are
// small first-party files where a one-reload-stale copy is an acceptable trade
// for not blocking the page on the network.
var STALE_WHILE_REVALIDATE_PATTERNS = [
  /\/$/,
  /\.html$/,
  /\/assets\/(js|css)\/[^/]+\.(js|css)$/,
  /\/modules\/[^/]+\.js$/,
  /\/data\//,
];

function matchesAny(patterns, url) {
  return patterns.some(function (pattern) {
    return pattern.test(url);
  });
}

function offlineResponse() {
  return new Response("Offline", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain" },
  });
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(cacheName).then(function(cache) {
      return Promise.all(
        urlsToCache.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn("Service worker failed to cache URL:", url, err);
          });
        })
      );
    })
  );
});

self.addEventListener('activate', event => {
  // delete any caches that aren't cacheName
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (cacheName != key) {
          return caches.delete(key);
        }
      })
    ))
  );
});

/**
 * Answer from the cache, and refresh the entry from the network in the
 * background. A cache miss waits for the network.
 */
function staleWhileRevalidate(request) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var networked = fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(function (err) {
          console.log("Fail to fetch", request.url, err);
          return cached || offlineResponse();
        });

      if (cached && cached.ok) {
        return cached;
      }
      return networked;
    });
  });
}

/**
 * Answer from the cache, and on a miss fetch and store the response. Used for
 * the WASM and the fonts, where the cache name carries the version, and for
 * the large optional assets that are never precached.
 */
function cacheFirst(request, storeOnMiss) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached && cached.ok) {
        return cached;
      }
      return fetch(request)
        .then(function (response) {
          if (storeOnMiss && response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(function (err) {
          console.log("Fail to fetch", request.url, err);
          return offlineResponse();
        });
    });
  });
}

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') {
    return;
  }

  var url = event.request.url;

  // Cross-origin requests (the Google Fonts stylesheets) are left to the
  // browser; a partial cross-origin cache is worse than none.
  if (!url.startsWith(self.location.origin)) {
    return;
  }

  if (matchesAny(RUNTIME_CACHE_PATTERNS, url)) {
    event.respondWith(cacheFirst(event.request, true));
    return;
  }

  if (matchesAny(STALE_WHILE_REVALIDATE_PATTERNS, url)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request, false));
});

self.addEventListener('message', function (event) {
  if (event.data.action === 'skipWaiting') {
    console.log("skip waiting");
    self.skipWaiting();
  }
});
