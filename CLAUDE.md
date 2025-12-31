# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cortex is a lightweight headless BI (Business Intelligence) analytics platform. It provides a semantic layer for defining business data models, a query engine for multiple data sources, and a dashboard/visualization system. The architecture consists of a Python backend (FastAPI) and a Nuxt 4 frontend (Studio UI).

## Common Commands

### Backend (Poetry/Python)

```bash
# Install dependencies with API extras
poetry install --with api

# Run development server
poetry run uvicorn cortex.api.main:app --reload --host 0.0.0.0 --port 9002

# Run via module (alternative)
python -m cortex.api

# Install core dependencies only (no API)
poetry install --only main
```

### Frontend (Yarn/Nuxt)

```bash
cd frontend/cortex
yarn install
yarn dev          # Development server on :3000
yarn build        # Production build
yarn generate     # Static generation
```

### Docker (Full Stack)

```bash
docker-compose up -d  # Starts PostgreSQL, Redis, API (9002), Frontend (3000)
```

### Database Migrations

Enable auto-migrations: `export CORTEX_AUTO_APPLY_DB_MIGRATIONS=true`

Migrations run automatically on API startup when enabled. Manual migration commands use Alembic in `cortex/migrations/alembic/`.

## Architecture

### Multi-Tenancy Hierarchy

```
Workspace → Environment → (Data Sources, Data Models, Metrics, Dashboards, Consumers)
```

- **Workspace**: Top-level organizational unit
- **Environment**: Isolation for dev/staging/production
- **Consumer**: End user with context-aware data access
- **Consumer Groups**: Shared properties across users

### Semantic Layer (`cortex/core/semantics/`)

JSON-based metric definitions with:
- **Measures**: Quantitative metrics (sum, avg, count, etc.)
- **Dimensions**: Categorical attributes for grouping
- **Filters**: Row-level constraints
- **Joins**: Multi-table relationships
- **Aggregations**: Data aggregation specifications
- **Parameters**: Dynamic query substitution
- **Output Formatting**: IN_QUERY (SQL-level) and POST_QUERY (post-execution) transformations

### Query Execution Pipeline (`cortex/core/query/`)

1. Metric Modifiers → 2. Pre-aggregation Planning → 3. SQL Generation → 4. Cache Check → 5. Database Execution → 6. Output Processing → 7. Query Logging

### Data Layer Patterns

Session management pattern:
```python
db_session = CortexStorage().get_session()
try:
    # operations
    db_session.commit()
finally:
    db_session.close()
```

`CortexStorage` uses singleton pattern for database connections.

### Supported Databases

PostgreSQL (primary), MySQL, BigQuery, SQLite, DuckDB

### API Structure (`cortex/api/`)

Base URL: `/api/v1`

Core routers: workspaces, environments, data/sources, data/models, metrics, dashboards, consumers, consumers/groups, query/history, pre-aggregations

### Frontend Structure (`frontend/cortex/app/`)

- `pages/`: Nuxt routes (dashboards, metrics, data, consumers, config)
- `components/`: Vue 3 components (charts/, metric/, dashboards/, data-sources/, ui/)
- `composables/`: State management
- `types/`: TypeScript definitions

Uses shadcn/ui components, ECharts for visualizations, VeeValidate + Zod for forms.

## Environment Variables

Key variables (see `local.env` for full list):

```bash
CORTEX_DB_TYPE=postgresql
CORTEX_DB_HOST=localhost
CORTEX_DB_PORT=5432
CORTEX_DB_USERNAME=root
CORTEX_DB_PASSWORD=password
CORTEX_DB_NAME=cortex
CORTEX_CACHE_ENABLED=true
CORTEX_CACHE_BACKEND=redis
CORTEX_CACHE_REDIS_URL=redis://localhost:6379
CORTEX_PREAGGREGATIONS_ENABLED=false
CORTEX_AUTO_APPLY_DB_MIGRATIONS=true
API_BASE_URL=http://localhost:9002
ALLOWED_ORIGINS=http://localhost:3000
```

## Key Conventions

- All models inherit from `TSModel` (Telescope Semantic Model) base class
- Pydantic v2 for validation, SQLAlchemy 2.0+ for ORM
- Factory patterns for database connectors and query generators
- ORM models in `cortex/core/storage/database.py`
- API schemas (Pydantic) in `cortex/api/schemas/`
