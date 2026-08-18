#!/usr/bin/env python3

import sys, os, re

sw_file = open("service_worker.js", "r")
content = sw_file.read()
sw_file.close()

files_to_cache = ["./"]
IGNORED_DIRS = {".git", "node_modules", "crates", "scripts", "mc404", "local", ".githooks",
                "test-results", "playwright-report"}
# The browser never requests these. Precaching them wastes the user's bandwidth
# and makes every type-only edit invalidate the offline cache.
IGNORED_PREFIXES = (os.path.join(".", "modules", "types"),)
IGNORED_SUFFIXES = (".d.ts", ".ts")
IGNORED_NAMES = {"service_worker.js", "update_cache.py", "sync_wasm_types.py",
                 "tsconfig.json", "tsconfig.worker.json"}

for path, subdirs, files in os.walk("."):
  subdirs[:] = [d for d in subdirs if d not in IGNORED_DIRS]
  for name in files:
    filepath = os.path.join(path, name)
    if name in IGNORED_NAMES or name.endswith(IGNORED_SUFFIXES):
      continue
    if filepath.startswith(IGNORED_PREFIXES):
      continue
    if not any(ignored in filepath for ignored in IGNORED_DIRS):
      files_to_cache.append("" + filepath)

# update cache number
def inc_cache(match):
  num = int(match.group(1))
  return f"var cacheName = 'RISC-V_ALE_v0.2:{num + 1}';"

content = re.sub(r"var cacheName = ['\"]RISC-V_ALE_v0\.2:(\d+)['\"];", inc_cache, content)

# update files
content = re.sub(r"var urlsToCache = \[[\s\S]*?\];", f"var urlsToCache = {files_to_cache};", content)

sw_file = open("service_worker.js", "w")
sw_file.write(content)
sw_file.close()
