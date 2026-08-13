#!/usr/bin/env python3

import sys, os, re

sw_file = open("service_worker.js", "r")
content = sw_file.read()
sw_file.close()

files_to_cache = ["./"]
IGNORED_DIRS = {".git", "node_modules", "crates", "scripts", "mc404", "local", ".githooks"}

for path, subdirs, files in os.walk("."):
  subdirs[:] = [d for d in subdirs if d not in IGNORED_DIRS]
  for name in files:
    filepath = os.path.join(path, name)
    if not any(ignored in filepath for ignored in IGNORED_DIRS):
      files_to_cache.append("" + filepath)

if "./service_worker.js" in files_to_cache:
  files_to_cache.remove("./service_worker.js")
if "./update_cache.py" in files_to_cache:
  files_to_cache.remove("./update_cache.py")

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
