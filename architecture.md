# Euroleague Shot Chart & Player Efficiency Platform

A full-stack sports analytics platform built on the free official Euroleague API: ingestion pipeline → warehouse → possession-level modeling → API → interactive dashboard.

---

## 1. Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────────┐     ┌───────────┐
│  Euroleague API  │────▶│  Ingestion   │────▶│  Postgres   │────▶│  dbt        │────▶│  FastAPI  │
│  (euroleague_api)│     │  (Dagster)   │     │  (raw layer)│     │  (transform)│     │  backend  │
└─────────────────┘     └──────────────┘     └─────────────┘     └────────────┘     └─────┬─────┘
                                                                                             │
                                                                                             ▼
                                                                                     ┌──────────────┐
                                                                                     │  Next.js      │
                                                                                     │  dashboard    │
                                                                                     └──────────────┘

CI/CD: GitHub Actions (lint/test → dbt build/test → Docker build → deploy)
```

**Core idea:** raw JSON from the API → clean relational tables → dbt models that turn play-by-play events into possessions and lineups → an API layer that serves pre-aggregated stats → a frontend that renders shot maps and game-flow charts.

---

## 2. Repository Structure

```
euroleague-analytics/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # lint, test, dbt build on every PR
│       ├── deploy.yml             # build + push Docker images, deploy on merge to main
│       └── ingest.yml             # scheduled data pull (cron)
├── ingestion/
│   ├── dagster_project/
│   │   ├── assets/
│   │   │   ├── standings.py
│   │   │   ├── boxscores.py
│   │   │   ├── play_by_play.py
│   │   │   └── shot_data.py
│   │   ├── resources.py           # euroleague_api client wrapper, DB connection
│   │   ├── schedules.py           # e.g. daily during season
│   │   └── definitions.py
│   ├── tests/
│   └── requirements.txt
├── warehouse/
│   ├── dbt_project/
│   │   ├── models/
│   │   │   ├── staging/           # 1:1 cleaned versions of raw tables
│   │   │   │   ├── stg_games.sql
│   │   │   │   ├── stg_shots.sql
│   │   │   │   └── stg_play_by_play.sql
│   │   │   ├── intermediate/
│   │   │   │   ├── int_possessions.sql      # play-by-play → possessions
│   │   │   │   └── int_lineup_stints.sql    # 5-man unit on/off tracking
│   │   │   └── marts/
│   │   │       ├── fct_player_game_stats.sql
│   │   │       ├── fct_team_shot_zones.sql
│   │   │       ├── fct_lineup_efficiency.sql
│   │   │       └── dim_players.sql
│   │   ├── tests/                 # dbt data tests (not_null, uniqueness, accepted_values)
│   │   └── dbt_project.yml
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app entrypoint
│   │   ├── routers/
│   │   │   ├── teams.py
│   │   │   ├── players.py
│   │   │   ├── games.py
│   │   │   └── shots.py
│   │   ├── models/                # Pydantic schemas
│   │   ├── db.py                  # SQLAlchemy engine / session
│   │   └── config.py
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                       # Next.js app router
│   │   ├── teams/[teamId]/page.tsx
│   │   ├── players/[playerId]/page.tsx
│   │   ├── games/[gameId]/page.tsx
│   │   └── page.tsx                # league overview / standings
│   ├── components/
│   │   ├── ShotChart.tsx           # court + hexbin/scatter overlay
│   │   ├── GameFlowChart.tsx       # score differential over time
│   │   ├── LineupTable.tsx
│   │   └── PlayerCard.tsx
│   ├── lib/api.ts                  # typed fetch client for the FastAPI backend
│   ├── Dockerfile
│   └── package.json
├── infra/
│   ├── docker-compose.yml          # local dev: postgres + backend + frontend + dagster
│   └── terraform/                  # optional: hosting infra as code
├── docs/
│   └── data_model.md
└── README.md
```

---

## 3. Functionalities

### MVP (build first, ship this as your v1 portfolio piece)
- **League overview**: current standings, team records, points for/against
- **Team page**: roster, season averages, shot chart aggregated across all games
- **Player page**: season stat line (PPG/RPG/APG/eFG%), shot chart, game log
- **Game page**: boxscore, play-by-play feed, game-flow chart (score margin over time)
- **Shot chart component**: court diagram with makes/misses plotted by zone, filterable by player/team/season
- **Ingestion pipeline** running on a schedule, idempotent (safe to re-run without duplicating data)
- **CI pipeline**: automated tests + dbt model tests running on every PR

### V2 / stretch (what elevates this from "CRUD dashboard" to "analytics project")
- **Possession-level derivation**: parse play-by-play into discrete possessions with outcome (score, turnover, foul) — this is the hardest and most impressive part
- **Lineup efficiency ("on/off") analysis**: point differential per 100 possessions for every 5-man unit
- **Effective FG% by zone** and shot-quality index (compare a player's shot selection to league-average zone efficiency)
- **Player similarity search**: cluster players by shot profile / stat line (k-means or cosine similarity over a feature vector) — nice excuse to touch a bit of ML
- **Game prediction model** (logistic regression/gradient boosting on team form, rest days, home/away) with a documented accuracy backtest
- **Public read-only API** with OpenAPI docs, rate limiting, and caching (Redis) — shows you understand productionizing an API, not just building one

### Nice-to-have polish
- Dark/light theme, team-colored UI accents per team page
- Export shot chart as PNG
- "Compare two players" side-by-side view

---

## 4. Data Model (core tables)

**Raw/staging layer** (mirrors API shape):
`games`, `teams`, `players`, `boxscores`, `play_by_play_events`, `shots`

**Marts (dbt-built)**:
- `fct_player_game_stats` — one row per player per game, standard + advanced stats
- `fct_team_shot_zones` — team/player × court zone × season, attempts/makes/eFG%
- `int_possessions` — one row per possession: game_id, team_id, start_event, end_event, outcome, points_scored
- `fct_lineup_efficiency` — 5-man unit stints with possessions played, points for/against, net rating

The possession-derivation model is the centerpiece: you take raw play-by-play events (which typically log substitutions, makes, misses, turnovers, fouls in game-clock order) and roll them up into possession boundaries. This is genuinely non-trivial SQL/Python logic and worth documenting well in `docs/data_model.md` — it's the part interviewers will ask about.

---

## 5. Tech Stack Summary

| Layer | Tool | Why |
|---|---|---|
| Ingestion/orchestration | Dagster | Modern, asset-based, good UI, strong resume signal |
| Warehouse | Postgres | Simple, free, plenty for this data volume |
| Transform | dbt | Industry-standard, testable, documents your data model |
| Backend | FastAPI | Async, auto-generated OpenAPI docs, Pydantic validation |
| Frontend | Next.js + Tailwind | Fast to build, server components for data-heavy pages |
| Charts | Custom SVG/Canvas for court + Recharts/Tremor for line/bar charts | Court visuals need custom rendering; standard charts don't |
| Caching (v2) | Redis | For hot endpoints like league standings |
| CI/CD | GitHub Actions | Free, ubiquitous, easy to show off in a portfolio |
| Deployment | Docker + Fly.io/Railway | Cheap always-on hosting for a demo |

---

## 6. CI/CD Pipeline Design

**`ci.yml`** (runs on every PR):
1. Lint (ruff/black for Python, eslint for frontend)
2. Unit tests (pytest for backend/ingestion, vitest/jest for frontend)
3. `dbt build --select state:modified+` against a test schema (only run models affected by the PR)
4. `dbt test` for data quality checks

**`deploy.yml`** (runs on merge to `main`):
1. Build Docker images for backend + frontend
2. Push to a container registry (GHCR is free and simple)
3. Deploy to Fly.io/Railway via their GitHub Action
4. Run dbt models against production warehouse

**`ingest.yml`** (scheduled, e.g. daily during the season):
1. Trigger the Dagster ingestion job (or run it directly via a scheduled Action if you don't want to host Dagster's UI)
2. Run dbt afterward to refresh marts
3. Post a summary (row counts, any failures) — Slack webhook or just a GitHub Actions summary

---

## 7. Suggested Build Order (roadmap)

1. **Week 1** — Ingestion: pull standings/boxscores/shots into raw Postgres tables, get it idempotent and scheduled
2. **Week 2** — dbt staging + simple marts (player/team season stats), backend endpoints for those
3. **Week 3** — Frontend MVP: league page, team page, player page, basic shot chart
4. **Week 4** — CI/CD: tests, GitHub Actions, Docker, deploy a live demo
5. **Week 5+** — Stretch: possession derivation, lineup efficiency, prediction model — this is where the project goes from "solid" to "impressive"

---

## 8. What to highlight in your README / portfolio writeup

- The possession-derivation logic (show a before/after: raw event log → possession table)
- A screenshot of the shot chart
- Your CI pipeline badge and a link to a live demo
- A short "data model" doc explaining the star schema/mart design — reviewers love seeing that you thought about this deliberately, not just dumped JSON into tables