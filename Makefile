# Aave USDe atlas — build + serve the fixed-viewport WebGL map.
#
#   make dev      regenerate graph, bundle dist/, serve on :8100 (foreground)
#   make build    bundle dist/index.html from the current data/graph.json
#   make graph    rebuild data/graph.json from the on-chain census
#   make serve    serve the existing dist/ without rebuilding
#   make stop     kill whatever is serving on :8100
#   make clean    remove dist/

PORT ?= 8100

.PHONY: dev build graph serve stop clean install

# Regenerate the Aave graph, bundle, then serve. Ctrl-C to stop.
dev: graph build serve

# One self-contained dist/index.html (styles, JS, fonts, graph inlined).
build:
	node build.mjs

# data/aave-usde-source.json (task1 census) -> data/graph.json.
# NOTE: uses the Aave pipeline, not `npm run graph` (that one rebuilds the
# dictionary content and would overwrite the Aave data).
graph:
	node pipeline/build-aave-graph.mjs

# Serve the already-built dist/ on $(PORT).
serve:
	@echo "serving dist/ on http://localhost:$(PORT)  (Ctrl-C to stop)"
	python3 -m http.server $(PORT) --directory dist

stop:
	@lsof -ti:$(PORT) | xargs kill -9 2>/dev/null && echo "stopped :$(PORT)" || echo "nothing on :$(PORT)"

clean:
	rm -rf dist

install:
	npm install
