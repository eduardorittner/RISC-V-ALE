#!/usr/bin/env python3
"""Regenerate the service worker's precache list.

The list is an allowlist. A blocklist grew to 166 entries and 227 MB, because
every new file in the tree joined the precache until somebody remembered to
exclude it. Here nothing is precached unless a rule below names it.

Two classes of asset are deliberately absent:

  * The compiler WASM (`modules/clang.wasm`, `modules/lld.wasm`, ~46 MB) and
    the Unity device builds under `extensions/devices/dependencies/`. The
    service worker caches these at runtime on first successful fetch, so they
    work offline after one online use without costing every visitor 46 MB on
    the first load.
  * Anything the browser never requests: tests, fixtures, build files, type
    declarations, and the non-woff2 font formats.
"""

import os
import re

# Directories precached whole, filtered by extension. A path is relative to the
# repository root.
ALLOWED_TREES = (
    ("assets/css", (".css",)),
    ("assets/js", (".js",)),
    ("assets/img", (".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp")),
    # Only woff2. Every browser that can run this application (it needs WASM
    # and module workers) reads woff2, so the other four formats are dead bytes.
    ("assets/fonts", (".woff2", ".css")),
    ("data", (".json", ".html", ".js", ".x", ".s", ".css")),
    ("extensions/devices", (".js", ".json", ".html")),
)

# Single files precached by exact path.
ALLOWED_FILES = (
    "index.html",
    "assets/manifest.json",
    "modules/pkg/riscv_rs.js",
    "modules/pkg/riscv_rs_bg.wasm",
)

# Every top-level `modules/*.js` is application code the page loads. The large
# `.wasm` blobs in the same directory are not; they are runtime-cached.
ALLOWED_MODULE_SUFFIXES = (".js",)

# Paths excluded even though a rule above would otherwise take them.
EXCLUDED_PATHS = {
    # Only `tests/code_test.html` loads zip, and that page is a developer tool
    # served from the network, not part of the offline application.
    "assets/js/zip.min.js",
    "assets/js/z-worker.js",
}

# Subtrees never precached. The service worker caches these on first use.
EXCLUDED_TREES = ("extensions/devices/dependencies",)


def is_excluded(rel_path):
    if rel_path in EXCLUDED_PATHS:
        return True
    return any(
        rel_path == tree or rel_path.startswith(tree + "/") for tree in EXCLUDED_TREES
    )


def collect():
    """Return the precache paths, as './'-prefixed URLs, in a stable order."""
    found = []

    for name in ALLOWED_FILES:
        if os.path.isfile(name) and not is_excluded(name):
            found.append(name)

    for tree, suffixes in ALLOWED_TREES:
        if not os.path.isdir(tree):
            continue
        for path, subdirs, files in os.walk(tree):
            subdirs[:] = sorted(
                d
                for d in subdirs
                if not is_excluded(os.path.relpath(os.path.join(path, d), ".").replace(os.sep, "/"))
            )
            for name in sorted(files):
                rel = os.path.relpath(os.path.join(path, name), ".").replace(os.sep, "/")
                if rel.endswith(suffixes) and not is_excluded(rel):
                    found.append(rel)

    for name in sorted(os.listdir("modules")):
        rel = "modules/" + name
        if os.path.isfile(rel) and rel.endswith(ALLOWED_MODULE_SUFFIXES):
            found.append(rel)

    # Deduplicate while keeping order, then prefix.
    seen = set()
    ordered = []
    for rel in found:
        if rel not in seen:
            seen.add(rel)
            ordered.append("./" + rel)
    return ["./"] + ordered


def main():
    files_to_cache = collect()

    total = sum(os.path.getsize(u[2:]) for u in files_to_cache if u != "./")
    print("precache: %d entries, %.2f MB" % (len(files_to_cache), total / 1024 / 1024))

    with open("service_worker.js", "r", encoding="utf-8") as fh:
        content = fh.read()

    def inc_cache(match):
        num = int(match.group(1))
        return f"var cacheName = 'RISC-V_ALE_v0.2:{num + 1}';"

    content = re.sub(
        r"var cacheName = ['\"]RISC-V_ALE_v0\.2:(\d+)['\"];", inc_cache, content
    )
    content = re.sub(
        r"var urlsToCache = \[[\s\S]*?\];",
        f"var urlsToCache = {files_to_cache};",
        content,
    )

    with open("service_worker.js", "w", encoding="utf-8") as fh:
        fh.write(content)


if __name__ == "__main__":
    main()
