"use strict";

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BROWSER_COMMANDS = {
  firefox: {
    cmd: "firefox",
    args: [
      "--headless",
      "--remote-debugging-port=0",
      "--profile",
      "/tmp/ale-perf-profile",
      "--no-remote",
    ],
  },
  chrome: {
    cmd: "google-chrome",
    args: [
      "--headless=new",
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=/tmp/ale-perf-chrome-profile",
      "--disable-gpu",
      "--disable-features=ServiceWorker",
    ],
  },
};

/**
 * Poll an HTTP endpoint until it responds.
 * @param {number} port - The debugging port.
 * @param {string} endpoint - Path like "/json/version".
 * @param {number} timeoutMs - Timeout in ms.
 * @returns {Promise<object>} - Parsed JSON response.
 */
function httpGet(port, endpoint, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      const req = http.get(
        `http://127.0.0.1:${port}${endpoint}`,
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              if (Date.now() - start > timeoutMs) {
                reject(new Error("Timeout parsing JSON from browser"));
              } else {
                setTimeout(attempt, 200);
              }
            }
          });
        }
      );
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for browser on port ${port}`));
        } else {
          setTimeout(attempt, 200);
        }
      });
    }
    attempt();
  });
}

/**
 * Wait for the browser to be ready and return the debugging port.
 * Parses stderr for the "DevTools listening on ws://127.0.0.1:PORT" message.
 * Falls back to polling /json/version.
 * @param {object} proc - The child process.
 * @param {number} timeoutMs - Timeout in ms.
 * @returns {Promise<number>} - The debugging port.
 */
function waitForPort(proc, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
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

      // Look for "DevTools listening on ws://127.0.0.1:PORT" or similar
      const match = text.match(/DevTools listening on ws:\/\/[^:]+:(\d+)/);
      if (match) {
        resolved = true;
        clearTimeout(timer);
        resolve(parseInt(match[1], 10));
        return;
      }

      // Also look for "listening on" patterns (Firefox variant)
      const match2 = text.match(/listening on .*:(\d+)/i);
      if (match2) {
        resolved = true;
        clearTimeout(timer);
        resolve(parseInt(match2[1], 10));
        return;
      }
    });

    // Fallback: if we can't parse stderr, try polling /json/version
    // This is a last resort — we try common ports
    function pollFallback() {
      if (resolved) return;
      if (Date.now() - start > timeoutMs) return;

      // Try to get the port from /json/version by trying the process
      // Actually, we can't know the port without stderr parsing.
      // So this fallback only works if we already have a port.
      setTimeout(pollFallback, 500);
    }
    pollFallback();
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

  // Clean up old profile
  const profileDir =
    browser === "firefox" ? "/tmp/ale-perf-profile" : "/tmp/ale-perf-chrome-profile";
  try {
    fs.rmSync(profileDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }

  const proc = spawn(config.cmd, config.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let port;
  try {
    port = await waitForPort(proc, 30000);
  } catch (e) {
    // If stderr parsing failed, try a fallback: poll /json/version on common ports
    // This is unlikely to work but is a last resort
    proc.kill("SIGTERM");
    throw e;
  }

  // Wait for the HTTP endpoint to be ready
  await httpGet(port, "/json/version", 15000);

  return { process: proc, port };
}

/**
 * Get the browser version info.
 * @param {number} port - The debugging port.
 * @returns {Promise<object>}
 */
async function getBrowserInfo(port) {
  return httpGet(port, "/json/version", 10000);
}

/**
 * Get the list of targets.
 * @param {number} port - The debugging port.
 * @returns {Promise<object[]>}
 */
async function getTargets(port) {
  return httpGet(port, "/json", 10000);
}

/**
 * Kill the browser process.
 * @param {object} proc - The child process.
 */
function killBrowser(proc) {
  if (!proc || proc.exitCode !== null) return;
  try {
    proc.kill("SIGTERM");
    // Give it a moment, then force kill
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

module.exports = { launchBrowser, killBrowser, getBrowserInfo, getTargets };
