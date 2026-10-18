if [[ -n "${BASH_VERSION:-}" ]]; then
    EUROLEAGUE_ANALYTICS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

    alias euro-backend='cd "$EUROLEAGUE_ANALYTICS_ROOT" && source .venv/bin/activate && PYTHONPATH=backend uvicorn app.main:app --app-dir backend --reload'
    alias euro-frontend='cd "$EUROLEAGUE_ANALYTICS_ROOT/frontend" && npm run dev'
fi
