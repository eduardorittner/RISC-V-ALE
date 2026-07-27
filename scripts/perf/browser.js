"use strict";

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const path = require("path");

function getCandidatePaths(browser) {
  if (browser === "firefox" && process.env.FIREFOX_BIN) return [process.env.FIREFOX_BIN];
  if (browser === "chrome" && process.env.CHROME_BIN) return [process.env.CHROME_BIN];
  if (process.env.BROWSER_BIN) return [process.env.BROWSER_BIN];

  const platform = process.platform;

  if (browser === "firefox") {
    if (platform === "darwin") {
      return [
        "/Applications/Firefox.app/Contents/MacOS/firefox",
        "/Applications/Firefox Nightly.app/Contents/MacOS/firefox",
        "firefox",
      ];
    } else if (platform === "win32") {
      return [
        "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
        "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
        "firefox",
      ];
    } else {
      return ["firefox", "/usr/bin/firefox", "/snap/bin/firefox"];
    }
  }

  if (browser === "chrome") {
    if (platform === "darwin") {
      return [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "google-chrome",
        "chrome",
        "chromium",
      ];
    } else if (platform === "win32") {
      return [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "google-chrome",
        "chrome",
      ];
    } else {
      return [
        "google-chrome",
        "google-chrome-stable",
        "chromium-browser",
        "chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
      ];
    }
  }

  return [browser];
}

function resolveBrowserBinary(browser) {
  const candidates = getCandidatePaths(browser);
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      // Return command name directly to let system PATH resolve it
      return candidate;
    }
  }
  return candidates[0];
}

const BROWSER_COMMANDS = {
  firefox: {
    getCmd: () => resolveBrowserBinary("firefox"),
    args: [
      "--headless",
      "--remote-debugging-port=0",
      "--no-remote",
      "-profile",
      "/tmp/ale-perf-firefox-profile",
    ],
  },
  chrome: {
    getCmd: () => resolveBrowserBinary("chrome"),
    args: [
      "--headless=new",
      "--remote-debugging-port=0",
      "--enable-bidi",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=/tmp/ale-perf-chrome-profile",
      "--disable-gpu",
      "--disable-features=ServiceWorker",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
};

/**
 * Wait for the browser to be ready and return the debugging port.
 * Parses stderr for the "WebDriver BiDi listening on ws://127.0.0.1:PORT"
 * message (Firefox) or "DevTools listening on ws://127.0.0.1:PORT" (Chrome).
 * @param {object} proc - The child process.
 * @param {number} timeoutMs - Timeout in ms.
 * @returns {Promise<number>} - The debugging port.
 */
function waitForPort(proc, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let stderrBuffer = "";
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        reject(
          new Error(
            `Timeout waiting for debugging port. stderr:\n${stderrBuffer}`
          )
        );
      }
    }, timeoutMs);

    proc.stderr.on("data", (data) => {
      if (resolved) return;
      const text = data.toString();
      stderrBuffer += text;

      // Firefox: "WebDriver BiDi listening on ws://127.0.0.1:PORT"
      const bidiMatch = text.match(
        /WebDriver BiDi listening on ws:\/\/[^:]+:(\d+)/
      );
      if (bidiMatch) {
        resolved = true;
        clearTimeout(timer);
        resolve(parseInt(bidiMatch[1], 10));
        return;
      }

      // Chrome: "DevTools listening on ws://127.0.0.1:PORT"
      const devtoolsMatch = text.match(
        /DevTools listening on ws:\/\/[^:]+:(\d+)/
      );
      if (devtoolsMatch) {
        resolved = true;
        clearTimeout(timer);
        resolve(parseInt(devtoolsMatch[1], 10));
        return;
      }

      // Generic fallback: "listening on ws://host:PORT"
      const genericMatch = text.match(/listening on ws:\/\/[^:]+:(\d+)/);
      if (genericMatch) {
        resolved = true;
        clearTimeout(timer);
        resolve(parseInt(genericMatch[1], 10));
        return;
      }
    });
  });
}

/**
 * Launch a headless browser and return the process and debugging port.
 * @param {string} browser - "firefox" or "chrome".
 * @returns {Promise<{process: object, port: number}>}
 */
async function launchBrowser(browser) {
  const config = BROWSER_COMMANDS[browser];
  if (!config) {
    throw new Error(`Unknown browser: ${browser}. Use "firefox" or "chrome".`);
  }

  const binary = config.getCmd();
  const proc = spawn(binary, config.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let port;
  try {
    port = await waitForPort(proc, 30000);
  } catch (e) {
    proc.kill("SIGTERM");
    throw e;
  }

  return { process: proc, port };
}

/**
 * Get the browser version info via the BiDi session.
 * Since Firefox BiDi doesn't have an HTTP /json/version endpoint,
 * this returns a minimal object. The actual version is obtained
 * during session.new.
 * @param {number} port - The debugging port.
 * @returns {Promise<object>}
 */
async function getBrowserInfo(port) {
  // Firefox BiDi doesn't expose /json/version.
  // The browser version is obtained from session.new capabilities.
  return { Browser: "firefox", "webSocketDebuggerUrl": "" };
}

/**
 * Kill the browser process.
 * @param {object} proc - The child process.
 */
function killBrowser(proc) {
  if (!proc || proc.exitCode !== null) return;
  try {
    proc.kill("SIGTERM");
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch (e) {
        // Already dead
      }
    }, 2000);
  } catch (e) {
    // Already dead
  }
}

module.exports = { launchBrowser, killBrowser, getBrowserInfo };
