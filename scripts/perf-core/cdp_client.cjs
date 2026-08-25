"use strict";

const WebSocket = require("ws");
const http = require("http");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

/**
 * BiDi & CDP Client — wraps a WebSocket connection to either a WebDriver BiDi endpoint
 * (Firefox) or Chrome DevTools Protocol endpoint (Chrome/Chromium).
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
    this.isCDP = false;
  }

  /**
   * Connect to the WebSocket endpoint (BiDi or CDP).
   * @returns {Promise<void>}
   */
  async connect() {
    // Try WebDriver BiDi first (Firefox)
    const bidiSuccess = await this._connectBiDi().catch(() => false);
    if (bidiSuccess) return;

    // Fall back to Chrome DevTools Protocol (Chrome)
    await this._connectCDP();
  }

  _connectBiDi() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://127.0.0.1:${this.port}/session`;
      const ws = new WebSocket(wsUrl);

      ws.on("open", () => {
        this.ws = ws;
        this.isCDP = false;
        this._setupMessageHandling();

        this._send("session.new", { capabilities: {} })
          .then((result) => {
            this.sessionId = result.sessionId;
            this.browserVersion =
              result.capabilities?.browserVersion || "unknown";
            return this._send("browsingContext.getTree", {});
          })
          .then((result) => {
            if (result.contexts && result.contexts.length > 0) {
              this.context = result.contexts[0].context;
            }
            resolve(true);
          })
          .catch((err) => {
            ws.close();
            reject(err);
          });
      });

      ws.on("error", reject);
    });
  }

  async _connectCDP() {
    // Fetch version for version name
    fetchJson(`http://127.0.0.1:${this.port}/json/version`)
      .then((v) => { if (v && v.Browser) this.browserVersion = v.Browser; })
      .catch(() => {});

    // Poll /json/list until a page target is available
    let pageTarget = null;
    const start = Date.now();
    while (Date.now() - start < 10000) {
      try {
        const list = await fetchJson(`http://127.0.0.1:${this.port}/json/list`);
        pageTarget = list.find((t) => t.type === "page") || list[0];
        if (pageTarget && pageTarget.webSocketDebuggerUrl) break;
      } catch (e) {
        // Wait for Chrome endpoint
      }
      await sleep(200);
    }

    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error("Could not obtain CDP page WebSocket debugger URL");
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

      ws.on("open", () => {
        this.ws = ws;
        this.isCDP = true;
        this._setupMessageHandling();

        Promise.all([
          this._send("Page.enable"),
          this._send("Runtime.enable")
        ]).then(() => resolve()).catch(reject);
      });

      ws.on("error", reject);
    });
  }

  _setupMessageHandling() {
    this.ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        return;
      }

      if (msg.id !== undefined) {
        const pending = this._pending.get(msg.id);
        if (pending) {
          this._pending.delete(msg.id);
          if (msg.error) {
            pending.reject(
              new Error(msg.error.message || JSON.stringify(msg.error))
            );
          } else if (msg.type === "error") {
            pending.reject(
              new Error(msg.message || JSON.stringify(msg))
            );
          } else {
            // CDP returns {id, result: ...}, BiDi returns {id, type: 'success', result: ...}
            pending.resolve(msg.result !== undefined ? msg.result : msg);
          }
        }
      } else if (msg.method) {
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
  }

  /**
   * Send a BiDi or CDP command and await the response.
   * @param {string} method - Method name.
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

  on(method, handler) {
    if (!this._eventHandlers.has(method)) {
      this._eventHandlers.set(method, new Set());
    }
    this._eventHandlers.get(method).add(handler);
  }

  async evaluate(expression, awaitPromise = false) {
    if (this.isCDP) {
      const res = await this._send("Runtime.evaluate", {
        expression,
        awaitPromise,
        returnByValue: true,
      });
      const val = res.result ? res.result.value : undefined;
      return { result: { type: typeof val, value: val } };
    } else {
      const result = await this._send("script.evaluate", {
        expression,
        target: { context: this.context },
        awaitPromise,
      });
      return result;
    }
  }

  async navigate(url) {
    if (this.isCDP) {
      return this._send("Page.navigate", { url });
    } else {
      return this._send("browsingContext.navigate", {
        context: this.context,
        url,
        wait: "complete",
      });
    }
  }

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

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function connectToPage(port) {
  const client = new BiDiClient(port);
  await client.connect();
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { BiDiClient, connectToPage };
