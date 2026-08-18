"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Create a minimal static file server.
 * @param {string} rootDir - Directory to serve files from.
 * @returns {Promise<{server: http.Server, port: number}>}
 */
function createServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split("?")[0];
      // Decode URI and normalize
      urlPath = decodeURIComponent(urlPath);

      // Prevent path traversal
      const filePath = path.join(rootDir, urlPath);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      // If directory, try index.html
      let resolvedPath = filePath;
      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          resolvedPath = path.join(filePath, "index.html");
        }
      } catch (e) {
        // File doesn't exist — fall through to read attempt
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      fs.readFile(resolvedPath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not Found: " + urlPath);
          return;
        }
        res.writeHead(200, {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
        });
        res.end(data);
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

module.exports = { createServer };
