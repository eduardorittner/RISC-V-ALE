.PHONY: gh-pages perf

gh-pages:
	./scripts/deploy_gh_pages.sh

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

perf:
	@if [ ! -d "scripts/perf/node_modules/ws" ]; then \
		echo "Error: 'ws' package not found."; \
		echo "Please run: cd scripts/perf && npm install"; \
		exit 1; \
	fi
	node scripts/perf/harness.js $(PERF_ARGS)
