#!/usr/bin/env python3
"""Serve the site for local work, with no caching in the browser.

`python3 -m http.server` sends no Cache-Control header. The browser then keeps
each file for a time that it computes from the Last-Modified date, a tenth of
the age of the file. A module that did not change for two weeks stays in the
HTTP cache for more than a day after it changes, and a new service worker
fills its own cache from that stale copy.

This server sends `Cache-Control: no-cache`: the browser asks the server about
every file at every use, and gets a short 304 answer when the file did not
change.

Usage:
    python3 scripts/serve.py [port]       # default 8000, on 127.0.0.1 only
"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    # The streaming compile of WebAssembly needs this type, and the type map
    # of an older Python does not have it.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".wasm": "application/wasm",
                      ".mjs": "text/javascript",
                      ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(Handler, directory=ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print("Serving %s at http://localhost:%d/ (Cache-Control: no-cache)"
          % (ROOT, port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
