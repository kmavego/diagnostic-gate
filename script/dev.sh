#!/usr/bin/env bash
set -e

# ================================
# Diagnostic Gate — dev runner
# ================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$PROJECT_ROOT/.venv"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
UVICORN_APP="backend.app.main:app"

echo "▶ Diagnostic Gate dev runner"
echo "▶ Project root: $PROJECT_ROOT"

# ----------------
# 1. venv check
# ----------------
if [ ! -d "$VENV_DIR" ]; then
  echo "✖ venv not found (.venv)"
  echo "→ run: python -m venv .venv"
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
echo "✔ venv activated"

# ----------------
# 2. backend deps
# ----------------
if [ ! -f "$BACKEND_DIR/requirements.txt" ]; then
  echo "✖ backend/requirements.txt not found"
  exit 1
fi

# ----------------
# 3. frontend deps
# ----------------
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "▶ frontend deps not found → npm install"
  (cd "$FRONTEND_DIR" && npm install)
fi

# ----------------
# 4. run backend
# ----------------
echo "▶ starting backend on http://$BACKEND_HOST:$BACKEND_PORT"
(
  cd "$PROJECT_ROOT"
  python -m uvicorn "$UVICORN_APP" \
    --reload \
    --host "$BACKEND_HOST" \
    --port "$BACKEND_PORT"
) &

BACKEND_PID=$!

# ----------------
# 5. run frontend
# ----------------
echo "▶ starting frontend (vite)"
(
  cd "$FRONTEND_DIR"
  npm run dev
) &

FRONTEND_PID=$!

# ----------------
# 6. shutdown handler
# ----------------
trap 'echo "⏹ stopping…"; kill $BACKEND_PID $FRONTEND_PID; exit 0' SIGINT SIGTERM

wait
