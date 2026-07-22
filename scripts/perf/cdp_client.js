"use strict";

const WebSocket = require("ws");

/**
 * BiDi Client — wraps a WebSocket connection to a WebDriver BiDi endpoint.
 * Provides promise-based command/response correlation and event dispatch.
 *
 * Firefox 152 uses WebDriver BiDi (not CDP) when --remote-debugging-port is
 * specified. The WebSocket endpoint is ws://127.0.0.1:PORT/session.
 */
class BiDiClient {
  /**
   * @param {number} port - The debugging port.
   */
  constructor(port) {
    this.port = port;
    this.ws = null;
    this._id = 0;
    this._pending = new Map(); // id → {resolve, reject}
    this._eventHandlers = new Map(); // method → Set<fn>
    this.sessionId = null;
    this.context = null;
    this.browserVersion = "unknown";
  }

  /**
   * Connect to the WebSocket endpoint and create a BiDi session.
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://127.0.0.1:${this.port}/session`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        // Create a session
        this._send("session.new", { capabilities: {} })
          .then((result) => {
            this.sessionId = result.sessionId;
            this.browserVersion =
              result.capabilities?.browserVersion || "unknown";
            // Get the browsing context
            return this._send("browsingContext.getTree", {});
          })
          .then((result) => {
            if (
              result.contexts &&
              result.contexts.length > 0
            ) {
              this.context = result.contexts[0].context;
            }
            resolve();
          })
          .catch(reject);
      });

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
            if (msg.type === "error") {
              pending.reject(
                new Error(msg.message || JSON.stringify(msg))
              );
            } else if (msg.type === "success") {
              pending.resolve(msg.result);
            } else {
              pending.reject(new Error("Unexpected response type: " + msg.type));
            }
          }
        } else if (msg.method) {
          // Event
          const handlers = this._eventHandlers.get(msg.method);
          if (handlers) {
            for (const handler of handlers) {
              handler(msg.params);
            }
          }
        }
      });

      this.ws.on("close", () => {
        for (const [id, pending] of this._pending) {
          pending.reject(new Error("WebSocket closed"));
        }
        this._pending.clear();
      });
    });
  }

  /**
   * Send a BiDi command and await the response.
   * @param {string} method - BiDi method name.
   * @param {object} [params={}] - Command parameters.
   * @returns {Promise<object>}
   */
  _send(method, params = {}) {
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
   * @param {function} handler - Handler function (params).
   */
  on(method, handler) {
    if (!this._eventHandlers.has(method)) {
      this._eventHandlers.set(method, new Set());
    }
    this._eventHandlers.get(method).add(handler);
  }

  /**
   * Evaluate a JavaScript expression in the page context.
   * @param {string} expression - JS expression to evaluate.
   * @param {boolean} [awaitPromise=false] - Whether to await a returned promise.
   * @returns {Promise<object>} - The evaluation result: {type, value} or {type, ...}.
   */
  async evaluate(expression, awaitPromise = false) {
    const result = await this._send("script.evaluate", {
      expression,
      target: { context: this.context },
      awaitPromise,
    });
    // BiDi returns {result: {type: "string", value: "..."}, ...}
    return result;
  }

  /**
   * Navigate the page to a URL.
   * @param {string} url
   * @returns {Promise<object>}
   */
  async navigate(url) {
    return this._send("browsingContext.navigate", {
      context: this.context,
      url,
      wait: "complete",
    });
  }

  /**
   * Wait for the page to reach readyState 'complete' by polling.
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
        if (result && result.result && result.result.value === "ready") {
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
   * Wait for a global variable to be defined.
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
        if (result && result.result && result.result.value === "defined") {
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
 * Connect to a browser's BiDi endpoint.
 * @param {number} port - The debugging port.
 * @returns {Promise<BiDiClient>}
 */
async function connectToPage(port) {
  const client = new BiDiClient(port);
  await client.connect();
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { BiDiClient, connectToPage };
