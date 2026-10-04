# Shortcuts for the npm scripts in package.json, plus runs of the local CLI on examples/.
# The npm scripts stay the source of truth; CI runs them directly.
# Works with the GNU Make 3.81 that macOS ships.

CLI := packages/core/dist/cli.js
SDC_LINT := node $(CURDIR)/$(CLI)
EXAMPLE ?= health-check
EXAMPLES := $(notdir $(wildcard examples/*))

# Runs the CLI in examples/$(EXAMPLE). Exit code 1 only means the example has errors, which is
# what the examples are for, so only exit code 2 (the run did not complete) fails make.
define run_example
	@test -d examples/$(EXAMPLE) || { echo "no example $(EXAMPLE); choose one of: $(EXAMPLES)"; exit 2; }
	@cd examples/$(EXAMPLE) && $(SDC_LINT) $(1) || test $$? -eq 1
endef

.DEFAULT_GOAL := help

.PHONY: help
help: ## List the targets
	@awk 'BEGIN { FS = ":.*## " } /^[a-z-]+:.*## / { printf "  %-14s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo
	@echo "  make test T=expressions     run matching tests"
	@echo "  make example EXAMPLE=name   lint another example: $(EXAMPLES)"
	@echo "  make lint-ig IG=path        lint an IG with the local build"

# Setup and build

.PHONY: install
install: ## Install dependencies from the lockfile (run "nvm use" first)
	npm ci

.PHONY: build
build: ## Build both packages, core first
	npm run build

.PHONY: clean
clean: ## Remove build output and coverage
	rm -rf packages/*/dist coverage

# Checks

.PHONY: check
check: ## Everything CI runs; run before every commit
	npm run check

.PHONY: typecheck
typecheck: ## Type-check both packages
	npm run typecheck

.PHONY: lint
lint: ## Run ESLint on the repository
	npm run lint

.PHONY: format
format: ## Apply Prettier
	npm run format

.PHONY: format-check
format-check: ## Check formatting without changing files
	npm run format:check

.PHONY: test
test: ## Run the tests; T=pattern runs matching tests only
	npm test -- $(T)

.PHONY: test-watch
test-watch: ## Run the tests in watch mode
	npm run test:watch -- $(T)

.PHONY: check-package
check-package: ## Validate the packages as published
	npm run check:package

# The local CLI. Its targets rebuild core only when its source has changed since the last build.

$(CLI): $(shell find packages/core/src -type f) packages/core/package.json packages/core/tsup.config.ts
	npm run build --workspace sdc-questionnaire-lint --silent
	@# tsup keeps an unchanged cli.js, with its old timestamp.
	@touch $@

.PHONY: example
example: $(CLI) ## Lint an example with the local build (default EXAMPLE=health-check)
	$(call run_example,lint)

.PHONY: example-info
example-info: $(CLI) ## Same, including info findings
	$(call run_example,lint --show-info)

.PHONY: example-json
example-json: $(CLI) ## Same, as a JSON report
	$(call run_example,lint --format json)

.PHONY: examples
examples: $(CLI) ## Lint every example
	@for name in $(EXAMPLES); do \
		echo "== examples/$$name"; \
		(cd examples/$$name && $(SDC_LINT) lint) || test $$? -eq 1 || exit 2; \
	done

.PHONY: explain
explain: $(CLI) ## List the registered rules; RULE=id prints one rule's docs
	@$(SDC_LINT) explain $(RULE)

.PHONY: lint-ig
lint-ig: $(CLI) ## Lint the IG at IG=path with the local build (run sushi there first)
	@test -n "$(IG)" || { echo "set IG to the IG folder: make lint-ig IG=../my-ig"; exit 2; }
	@cd "$(IG)" && $(SDC_LINT) lint $(ARGS)
