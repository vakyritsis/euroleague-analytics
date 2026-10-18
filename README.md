# euroleague-analytics
EuroLeague analytics platform with ingestion, dbt transformations, PostgreSQL warehouse, FastAPI backend, and dashboard-ready data models.

## Fresh clone setup

The following steps create a local development database, fetch the configured EuroLeague season, build the analytics models, and run the dashboard. They assume Python 3.12, Node.js 22/npm, PostgreSQL 16, and a Bash-compatible shell are installed.

1. Create and activate a Python environment, install the backend, ingestion, and warehouse dependencies, install the frontend dependencies, and create your local settings file:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt -r ingestion/requirements.txt -r warehouse/requirements.txt
   npm --prefix frontend ci
   cp .env.example .env
   ```

2. Create the local PostgreSQL role and database. The setup script uses the development credentials from `.env.example` (`euroleague` / `euroleague`); do not use these defaults outside local development. If you customize the database credentials in `.env`, update `ingestion/setup_postgres.sql` to match:

   ```bash
   sudo -u postgres psql -f ingestion/setup_postgres.sql
   ```

3. Load the environment settings, create the raw ingestion tables, and materialize the ingestion assets:

   ```bash
   set -a
   source .env
   set +a
   export PGPASSWORD="$POSTGRES_PASSWORD"
   psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f ingestion/schema.sql
   dagster asset materialize --select '*' --module-name ingestion.definitions
   ```

   Ingestion calls the public EuroLeague API for the season configured by `EUROLEAGUE_SEASON` in `.env` and can take several minutes. The assets can be materialized again to refresh the raw data.

4. Build and test the dbt models:

   ```bash
   dbt run --project-dir warehouse/dbt_project --profiles-dir warehouse/dbt_project
   dbt test --project-dir warehouse/dbt_project --profiles-dir warehouse/dbt_project
   ```

5. Start the backend and frontend in separate terminals from the repository root. Activate `.venv` in the backend terminal; load `.env` in the dbt terminal if running dbt in a new shell.

   Backend:

   ```bash
   source .venv/bin/activate
   PYTHONPATH=backend uvicorn app.main:app --app-dir backend --reload
   ```

   Frontend:

   ```bash
   cd frontend
   npm run dev
   ```

   Open the Vite URL printed in the terminal, usually [http://localhost:5173](http://localhost:5173). The API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

## Run the dashboard

After completing the fresh-clone setup above, start the API and React dev server in separate terminals from the repository root:

```bash
source .venv/bin/activate
PYTHONPATH=backend uvicorn app.main:app --app-dir backend --reload
```

```bash
cd frontend
npm run dev
```

Open the Vite URL printed in the terminal (usually [http://localhost:5173](http://localhost:5173)). Vite proxies API calls to FastAPI at `http://127.0.0.1:8000`. The season selector lists seasons with data in the warehouse and defaults to the latest available season. If you open a season with no data, the dashboard explains that and lets you switch to an available one. Browse the full season schedule from Games, filter by status or team, and open game details from the list. Player, team, and game details are also linked from dashboard tables.

To serve the production React build from FastAPI instead, run `npm run build` inside `frontend`, then start the backend and open [http://localhost:8000](http://localhost:8000).

See [architecture.md](./architecture.md) for API routes and platform details.

### Bash development aliases

The repo includes `dev-aliases.sh` with `euro-backend` and `euro-frontend` commands. To enable them in new Bash terminals, add a source line to `~/.bashrc`, replacing the path with your clone location:

```bash
source /path/to/euroleague-analytics/dev-aliases.sh
```

Reload your shell configuration with `source ~/.bashrc`. Run `euro-backend` and `euro-frontend` in separate terminals to start the API and Vite dev server.
