# Diagnostic Gate — Makefile (root)
# Usage:
#   make help
#   make venv
#   make backend-install
#   make backend-run
#   make frontend-install
#   make frontend-run
#   make dev

SHELL := /bin/bash

PYTHON ?= python3
VENV_DIR := .venv
VENV_BIN := $(VENV_DIR)/bin
PIP := $(VENV_BIN)/pip
PY := $(VENV_BIN)/python

BACKEND_DIR := backend
FRONTEND_DIR := frontend

UVICORN_APP := backend.app.main:app
BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000

.PHONY: help venv venv-check backend-install backend-run backend-test \
        frontend-install frontend-run dev clean

help:
	@echo "Targets:"
	@echo "  make venv               - create venv in .venv"
	@echo "  make backend-install    - install backend deps (requirements.txt)"
	@echo "  make backend-run        - run FastAPI backend (reload)"
	@echo "  make backend-test       - run backend tests (pytest -q)"
	@echo "  make frontend-install   - npm install in frontend/"
	@echo "  make frontend-run       - run Vite dev server"
	@echo "  make dev                - run backend+frontend in parallel"
	@echo "  make clean              - remove venv and node_modules (destructive)"

$(VENV_BIN)/activate:
	$(PYTHON) -m venv $(VENV_DIR)

venv: $(VENV_BIN)/activate
	@echo "venv ready: $(VENV_DIR)"
	@echo "activate with: source $(VENV_BIN)/activate"

venv-check:
	@test -x "$(PY)" || (echo "ERROR: venv not found. Run: make venv" && exit 1)

backend-install: venv-check
	@test -f "$(BACKEND_DIR)/requirements.txt" || (echo "ERROR: backend/requirements.txt not found" && exit 1)
	$(PIP) install -r $(BACKEND_DIR)/requirements.txt

backend-run: venv-check
	$(PY) -m uvicorn $(UVICORN_APP) --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT)

backend-test: venv-check
	$(PY) -m pytest -q

frontend-install:
	cd $(FRONTEND_DIR) && npm install

frontend-run:
	cd $(FRONTEND_DIR) && npm run dev

# NOTE: This runs both processes in one terminal using GNU make parallel jobs.
# If logs are messy, use two terminals: `make backend-run` and `make frontend-run`.
dev:
	@$(MAKE) -j2 backend-run frontend-run

clean:
	rm -rf $(VENV_DIR)
	rm -rf $(FRONTEND_DIR)/node_modules
	rm -f  $(FRONTEND_DIR)/package-lock.json
	@echo "cleaned: $(VENV_DIR), node_modules, package-lock.json"
