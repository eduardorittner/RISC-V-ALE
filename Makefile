.PHONY: build format test typecheck perf HEAD

build:
	wasm-pack build --target no-modules --out-dir ../../modules/pkg crates/riscv-rs
	python3 scripts/sync_wasm_types.py
	python3 scripts/update_cache.py

format:
	npx prettier --write "*.js" "modules/*.js" "!modules/pkg/**"
	cargo fmt --manifest-path crates/riscv-rs/Cargo.toml

typecheck:
	npm run typecheck

test:
	cargo test --manifest-path crates/riscv-rs/Cargo.toml
	npm run test:ui


# ─── Performance Testing Harness ───────────────────────────────────────────
#
# Usage:
#   make perf                  Default: firefox, no flags
#   make perf BROWSER=chrome   Use Chrome
#   make perf DRY=1            Dry run (no save/compare)
#   make perf NO_COMPARE=1     Save but don't compare
#   make perf ITERATIONS=3     Run each workload 3 times (median)
#   make perf FAIL_THRESHOLD=20  Fail when a workload is >20% slower than the
#                                saved baseline
#
# Before the first run: cd scripts/perf && npm install

PERF_BROWSER := $(if $(BROWSER),--browser $(BROWSER),)
PERF_DRY := $(if $(DRY),--dry,)
PERF_NO_COMPARE := $(if $(NO_COMPARE),--no-compare,)
PERF_ITERATIONS := $(if $(ITERATIONS),--iterations $(ITERATIONS),)
PERF_FAIL_THRESHOLD := $(if $(FAIL_THRESHOLD),--fail-threshold $(FAIL_THRESHOLD),)
PERF_ARGS := $(PERF_BROWSER) $(PERF_DRY) $(PERF_NO_COMPARE) $(PERF_ITERATIONS) $(PERF_FAIL_THRESHOLD)

ifeq ($(filter HEAD,$(MAKECMDGOALS)),HEAD)
perf:
	@if ! node -e "require('ws')" >/dev/null 2>&1; then \
		echo "Installing missing dependencies for perf harness..."; \
		npm install --no-audit 2>/dev/null || (cd scripts/perf && npm install --no-audit); \
	fi
	@ORIG_REF=$$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse HEAD); \
	STASHED=0; \
	if [ -n "$$(git status --porcelain)" ]; then \
		echo "Stashing uncommitted changes..."; \
		git stash push -m "make-perf-head-temp"; \
		STASHED=1; \
	fi; \
	echo "Checking out HEAD~1..."; \
	git checkout HEAD~1 && \
	$(MAKE) perf NO_COMPARE=1; \
	PERF_STATUS=$$?; \
	echo "Switching back to $$ORIG_REF..."; \
	git checkout $$ORIG_REF; \
	if [ $$STASHED -eq 1 ]; then \
		echo "Restoring stashed changes..."; \
		git stash pop; \
	fi; \
	if [ $$PERF_STATUS -ne 0 ]; then \
		exit $$PERF_STATUS; \
	fi; \
	$(MAKE) perf

HEAD:
	@:
else
perf:
	@if ! node -e "require('ws')" >/dev/null 2>&1; then \
		echo "Installing missing dependencies for perf harness..."; \
		npm install --no-audit 2>/dev/null || (cd scripts/perf && npm install --no-audit); \
	fi
	node scripts/perf/harness.js $(PERF_ARGS)
endif

