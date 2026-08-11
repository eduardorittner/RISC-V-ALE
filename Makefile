.PHONY: build format test perf HEAD

build:
	wasm-pack build --target no-modules --out-dir ../../modules/pkg crates/rust-whisper
	python3 update_cache.py

format:
	npx prettier --write "*.js" "modules/*.js" "!modules/pkg/**"
	cargo fmt --manifest-path crates/rust-whisper/Cargo.toml

test:
	cargo test --manifest-path crates/rust-whisper/Cargo.toml
	npm run test:ui


# ─── Performance Testing Harness ───────────────────────────────────────────
#
# Usage:
#   make perf                  Default: firefox, no flags
#   make perf BROWSER=chrome   Use Chrome
#   make perf DRY=1            Dry run (no save/compare)
#   make perf NO_COMPARE=1     Save but don't compare
#   make perf ITERATIONS=3     Run each workload 3 times (median)
#
# Before the first run: cd scripts/perf && npm install

PERF_BROWSER := $(if $(BROWSER),--browser $(BROWSER),)
PERF_DRY := $(if $(DRY),--dry,)
PERF_NO_COMPARE := $(if $(NO_COMPARE),--no-compare,)
PERF_ITERATIONS := $(if $(ITERATIONS),--iterations $(ITERATIONS),)
PERF_ARGS := $(PERF_BROWSER) $(PERF_DRY) $(PERF_NO_COMPARE) $(PERF_ITERATIONS)

ifeq ($(filter HEAD,$(MAKECMDGOALS)),HEAD)
perf:
	@if [ ! -d "scripts/perf/node_modules/ws" ]; then \
		echo "Error: 'ws' package not found."; \
		echo "Please run: cd scripts/perf && npm install"; \
		exit 1; \
	fi
	@STASHED=0; \
	if [ -n "$$(git status --porcelain)" ]; then \
		echo "Stashing uncommitted changes..."; \
		git stash push -m "make-perf-head-temp"; \
		STASHED=1; \
	fi; \
	echo "Checking out HEAD~1..."; \
	git checkout HEAD~1 && \
	$(MAKE) perf NO_COMPARE=1 && \
	echo "Switching back to current commit..."; \
	git switch - && \
	$(MAKE) perf; \
	EXIT_CODE=$$?; \
	if [ $$STASHED -eq 1 ]; then \
		echo "Restoring stashed changes..."; \
		git stash pop; \
	fi; \
	exit $$EXIT_CODE

HEAD:
	@:
else
perf:
	@if [ ! -d "scripts/perf/node_modules/ws" ]; then \
		echo "Error: 'ws' package not found."; \
		echo "Please run: cd scripts/perf && npm install"; \
		exit 1; \
	fi
	node scripts/perf/harness.js $(PERF_ARGS)
endif

