"use strict";

const WebSocket = require("ws");
const http = require("http");

/**
 * CDP Client — wraps a WebSocket connection to a CDP (Chrome DevTools Protocol)
 * target. Provides promise-based command/response correlation and event dispatch.
 */
class CDPClient {
  /**
   * @param {string} wsUrl - WebSocket URL of the CDP target.
   */
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this._id = 0;
    this._pending = new Map(); // id → {resolve, reject}
    this._eventHandlers = new Map(); // method → Set<fn>
  }

  /**
   * Connect to the WebSocket endpoint.
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", resolve);
      this.ws.on("error", reject);

      this.ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (e) {
          return;
        }

        if (msg.id !== undefined) {
          // Command response
          const pending = this._pending.get(msg.id);
          if (pending) {
            this._pending.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              pending.resolve(msg.result);
            }
          }
        } else if (msg.method) {
          // Event
          const handlers = this._eventHandlers.get(msg.method);
          if (handlers) {
            for (const handler of handlers) {
              handler(msg.params, msg.sessionId);
            }
          }
        }
      });

      this.ws.on("close", () => {
        // Reject all pending commands
        for (const [id, pending] of this._pending) {
          pending.reject(new Error("WebSocket closed"));
        }
        this._pending.clear();
      });
    });
  }

  /**
   * Send a CDP command and await the response.
   * @param {string} method - CDP method name (e.g. "Runtime.evaluate").
   * @param {object} [params={}] - Command parameters.
   * @returns {Promise<object>}
   */
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not open"));
        return;
      }
      const id = ++this._id;
      const msg = { id, method, params };
      this._pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg), (err) => {
        if (err) {
          this._pending.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Register an event handler.
   * @param {string} method - Event method name.
   * @param {function} handler - Handler function (params, sessionId).
   */
  on(method, handler) {
    if (!this._eventHandlers.has(method)) {
      this._eventHandlers.set(method, new Set());
    }
    this._eventHandlers.get(method).add(handler);
  }

  /**
   * Remove an event handler.
   * @param {string} method
   * @param {function} handler
   */
  off(method, handler) {
    const handlers = this._eventHandlers.get(method);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Evaluate a JavaScript expression in the page context.
   * @param {string} expression - JS expression to evaluate.
   * @param {boolean} [awaitPromise=false] - Whether to await a returned promise.
   * @param {boolean} [returnByValue=true] - Whether to return the result by value.
   * @returns {Promise<object>} - The evaluation result.
   */
  async evaluate(expression, awaitPromise = false, returnByValue = true) {
    return this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue,
    });
  }

  /**
   * Navigate the page to a URL.
   * @param {string} url
   * @returns {Promise<object>}
   */
  async navigate(url) {
    return this.send("Page.navigate", { url });
  }

  /**
   * Wait for the page to reach a readyState by polling.
   * More robust than relying on Page.loadEventFired (which Firefox may not fire).
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<void>}
   */
  async waitForReady(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.evaluate(
          'document.readyState === "complete" ? "ready" : "not-ready"'
        );
        if (
          result &&
          result.result &&
          result.result.value === "ready"
        ) {
          return;
        }
      } catch (e) {
        // Page might not be ready yet
      }
      await sleep(200);
    }
    throw new Error("Timeout waiting for page readyState");
  }

  /**
   * Wait for a global variable to be defined (e.g. after ES module load).
   * @param {string} varName - The global variable name to check.
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<void>}
   */
  async waitForGlobal(varName, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.evaluate(
          `typeof window.${varName} !== "undefined" ? "defined" : "undefined"`
        );
        if (
          result &&
          result.result &&
          result.result.value === "defined"
        ) {
          return;
        }
      } catch (e) {
        // Ignore
      }
      await sleep(200);
    }
    throw new Error(`Timeout waiting for window.${varName} to be defined`);
  }

  /**
   * Poll a global variable until it returns a non-null value.
   * @param {string} expression - JS expression to evaluate.
   * @param {number} [intervalMs=100] - Polling interval.
   * @param {number} [timeoutMs=120000] - Overall timeout.
   * @returns {Promise<string>} - The string value of the expression.
   */
  async pollForResult(expression, intervalMs = 100, timeoutMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.evaluate(expression);
        if (result && result.result && result.result.value) {
          return result.result.value;
        }
      } catch (e) {
        // Ignore
      }
      await sleep(intervalMs);
    }
    throw new Error("Timeout polling for result");
  }

  /**
   * Close the WebSocket connection.
   */
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

/**
 * Connect to a page target's WebSocket.
 * Fetches /json to find the page target, then connects to its webSocketDebuggerUrl.
 * @param {number} port - The debugging port.
 * @returns {Promise<CDPClient>}
 */
async function connectToPage(port) {
  // Get the list of targets
  const targets = await httpGetJson(port, "/json");

  // Find a page target
  let pageTarget = targets.find((t) => t.type === "page");
  if (!pageTarget) {
    // If no page target, try /json/version for browser-level WS
    throw new Error("No page target found. Browser may not have a page open.");
  }

  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();

  // Enable required domains
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  return client;
}

/**
 * Helper: HTTP GET returning parsed JSON.
 */
function httpGetJson(port, endpoint) {
  return new Promise((resolve, reject) => {
    http.get(
      `http://127.0.0.1:${port}${endpoint}`,
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    ).on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { CDPClient, connectToPage };
