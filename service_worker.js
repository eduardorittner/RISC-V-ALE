/*jshint esversion: 9 */

var cacheName = 'RISC-V_ALE_v0.2:219';
var urlsToCache = ['./', './index.html', './LICENSE', './Makefile', './playwright.config.js', './vitest.config.js', './.prettierignore', './README.md', './package-lock.json', './package.json', './tests/code_test.html', './tests/unit/mmio.test.js', './tests/unit/ipc_schema.test.js', './tests/unit/mmio_manager.test.js', './tests/unit/utils.test.js', './tests/integration/worker_ipc.spec.js', './tests/integration/code_test_runner.spec.js', './tests/integration/assistant.spec.js', './tests/integration/debugger.spec.js', './tests/fixtures/lab_submission_fail.zip', './tests/fixtures/lab_submission_pass.zip', './tests/fixtures/debug_sample.s', './tests/fixtures/lab_fail.zip', './tests/fixtures/lab_pass.zip', './extensions/README.md', './extensions/devices/midi_synthesizer.js', './extensions/devices/cleaner_robot.js', './extensions/devices/serial_port.js', './extensions/devices/uoli_robot.js', './extensions/devices/general_purpose_timer.js', './extensions/devices/self_driving_car.js', './extensions/devices/canvas.js', './extensions/devices/utils.js', './extensions/devices/dependencies/webaudio-tinysynth.js', './extensions/devices/dependencies/self_driving_car_unity/index.html', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/fullscreen-button.png', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/unity-logo-dark.png', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/favicon.ico', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/progress-bar-empty-light.png', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/webgl-logo.png', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/style.css', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/progress-bar-full-dark.png', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/progress-bar-full-light.png', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/progress-bar-empty-dark.png', './extensions/devices/dependencies/self_driving_car_unity/TemplateData/unity-logo-light.png', './extensions/devices/dependencies/self_driving_car_unity/Build/self_driving_car_unity.wasm', './extensions/devices/dependencies/self_driving_car_unity/Build/self_driving_car_unity.data', './extensions/devices/dependencies/self_driving_car_unity/Build/self_driving_car_unity.framework.js', './extensions/devices/dependencies/self_driving_car_unity/Build/self_driving_car_unity.loader.js', './extensions/devices/dependencies/uoli-unity/index.html', './extensions/devices/dependencies/uoli-unity/TemplateData/UnityProgress.js', './extensions/devices/dependencies/uoli-unity/TemplateData/progressFull.Light.png', './extensions/devices/dependencies/uoli-unity/TemplateData/progressEmpty.Light.png', './extensions/devices/dependencies/uoli-unity/TemplateData/favicon.ico', './extensions/devices/dependencies/uoli-unity/TemplateData/progressLogo.Light.png', './extensions/devices/dependencies/uoli-unity/TemplateData/webgl-logo.png', './extensions/devices/dependencies/uoli-unity/TemplateData/fullscreen.png', './extensions/devices/dependencies/uoli-unity/TemplateData/progressLogo.Dark.png', './extensions/devices/dependencies/uoli-unity/TemplateData/style.css', './extensions/devices/dependencies/uoli-unity/TemplateData/progressEmpty.Dark.png', './extensions/devices/dependencies/uoli-unity/TemplateData/progressFull.Dark.png', './extensions/devices/dependencies/uoli-unity/Build/UnityLoader.js', './extensions/devices/dependencies/uoli-unity/Build/build.wasm.code.unityweb', './extensions/devices/dependencies/uoli-unity/Build/build.data.unityweb', './extensions/devices/dependencies/uoli-unity/Build/build.wasm.framework.unityweb', './extensions/devices/dependencies/uoli-unity/Build/build.json', './extensions/devices/dependencies/roomba-unity/index.html', './extensions/devices/dependencies/roomba-unity/TemplateData/UnityProgress.js', './extensions/devices/dependencies/roomba-unity/TemplateData/progressFull.Light.png', './extensions/devices/dependencies/roomba-unity/TemplateData/progressEmpty.Light.png', './extensions/devices/dependencies/roomba-unity/TemplateData/favicon.ico', './extensions/devices/dependencies/roomba-unity/TemplateData/progressLogo.Light.png', './extensions/devices/dependencies/roomba-unity/TemplateData/webgl-logo.png', './extensions/devices/dependencies/roomba-unity/TemplateData/fullscreen.png', './extensions/devices/dependencies/roomba-unity/TemplateData/progressLogo.Dark.png', './extensions/devices/dependencies/roomba-unity/TemplateData/style.css', './extensions/devices/dependencies/roomba-unity/TemplateData/progressEmpty.Dark.png', './extensions/devices/dependencies/roomba-unity/TemplateData/progressFull.Dark.png', './extensions/devices/dependencies/roomba-unity/Build/UnityLoader.js', './extensions/devices/dependencies/roomba-unity/Build/build.wasm.code.unityweb', './extensions/devices/dependencies/roomba-unity/Build/build.data.unityweb', './extensions/devices/dependencies/roomba-unity/Build/build.wasm.framework.unityweb', './extensions/devices/dependencies/roomba-unity/Build/build.json', './test-results/.last-run.json', './modules/assistant.js', './modules/lld.wasm', './modules/clang_worker.js', './modules/clang.wasm', './modules/simulator_worker.js', './modules/terminal.js', './modules/compiler.js', './modules/LICENSE_clang_lld', './modules/ld.lld.js', './modules/clang.js', './modules/LICENSE_whisper', './modules/mmio_manager.js', './modules/utils.js', './modules/connection.js', './modules/debugger.js', './modules/simulator.js', './modules/ipc_schema.js', './modules/pkg/README.md', './modules/pkg/riscv_rs_bg.wasm', './modules/pkg/package.json', './modules/pkg/riscv_rs_bg.wasm.d.ts', './modules/pkg/riscv_rs.js', './modules/pkg/riscv_rs.d.ts', './data/syscalls.json', './data/config.json', './data/devices.json', './data/home.json', './data/html/hello.x', './data/html/getting_started.html', './data/html/calculator.html', './data/html/calculator.js', './assets/manifest.json', './assets/css/xterm.css', './assets/css/Top--Right--Left-Navigation-by-Jigar-Mistry.css', './assets/css/styles.css', './assets/css/Vertical-Left-SideBar-by-Jigar-Mistry.css', './assets/css/app.css', './assets/css/toast.css', './assets/js/tabs.js', './assets/js/interface_elements.js', './assets/js/zip.min.js', './assets/js/dropdown.js', './assets/js/data_table.js', './assets/js/xterm-addon-fit.min.js', './assets/js/z-worker.js', './assets/js/xterm.min.js', './assets/js/modal.js', './assets/js/toast.js', './assets/js/lz-string.min.js', './assets/img/logo_square.png', './assets/img/Standard-White_2.png', './assets/img/Standard_2.png', './assets/img/logo_circle.png', './assets/img/Standard_2ALE.png', './assets/fonts/fa-solid-900.ttf', './assets/fonts/MaterialIcons-Regular.svg', './assets/fonts/fa-regular-400.svg', './assets/fonts/fa-regular-400.woff2', './assets/fonts/MaterialIcons-Regular.woff2', './assets/fonts/fa-solid-900.eot', './assets/fonts/fontawesome-all.min.css', './assets/fonts/fa-brands-400.svg', './assets/fonts/material-icons.min.css', './assets/fonts/fa-regular-400.woff', './assets/fonts/fa-brands-400.eot', './assets/fonts/MaterialIcons-Regular.woff', './assets/fonts/fa-solid-900.svg', './assets/fonts/MaterialIcons-Regular.ttf', './assets/fonts/fa-solid-900.woff', './assets/fonts/fa-regular-400.ttf', './assets/fonts/fa-solid-900.woff2', './assets/fonts/fa-brands-400.woff2', './assets/fonts/fa-brands-400.woff', './assets/fonts/fa-brands-400.ttf', './assets/fonts/MaterialIcons-Regular.eot', './assets/fonts/fa-regular-400.eot'];

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


self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response && response.ok) {
        // cache hit and valid response
        return response;
      }
      // cache miss or invalid/corrupted cached response -> fallback to network
      return fetch(event.request).catch(function(err) {
        console.log("Fail to fetch", event.request, err);
      });
    }).catch(function(err) {
      console.warn("Cache match error, falling back to fetch:", event.request.url, err);
      return fetch(event.request).catch(function(fetchErr) {
        console.log("Fail to fetch", event.request, fetchErr);
      });
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data.action === 'skipWaiting') {
    console.log("skip waiting");
    self.skipWaiting();
  }
});
