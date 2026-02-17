# Family Meal Planner

A private, practical meal planning app for one household, rebuilt with React, Tailwind CSS, and local `shadcn/ui` components.

## Product Vision

Plan a week of meals quickly, then generate:

- One consolidated grocery list
- Store-specific lists (Target, Sprouts, Aldi, Trader Joe's)
- Copy-friendly exports and printable checklists

The app is intentionally optimized for real household usage: fast planning, low friction, and reliable grocery output.

## Stack

- React (Vite)
- Tailwind CSS
- Local `shadcn/ui` primitives in `src/components/ui`
- Backend API (`server/index.js` locally, `api/index.js` on Vercel) with shared database storage
- SQLite by default (`data/meal-planner.db`), optional Postgres via `DATABASE_URL`

## Development

```bash
npm install
npm start
```

`npm start` runs both the API server and Vite client.
Open the Vite URL shown in the terminal (usually `http://127.0.0.1:5173`).

### Database Config

- SQLite (default): no extra setup required for local development.
- Postgres: set `DATABASE_URL=postgres://...` and install `pg` (`npm install pg`) before starting.
- Optional custom SQLite path: `SQLITE_PATH=/absolute/path/meal-planner.db`.
- SQLite runtime requirement: `node:sqlite` support (Node.js 22+).

## Deploying To Vercel

Yes, this app can run fully on Vercel with serverless API routes.

1. Create a Postgres database (Vercel Postgres is the easiest option).
2. Add environment variable `DATABASE_URL` in Vercel project settings.
3. Add `pg` to dependencies before deploying:

```bash
npm install pg
```

Important: Vercel filesystem storage is ephemeral, so production should not use local SQLite files.

## Build

```bash
npm run build
npm run preview
```

## Tests

```bash
npm test
```

## Current Features

- Weekly meal selection with per-day serving overrides
- Per-day planning notes
- Copy previous day plan forward for faster weekly setup
- Dedicated recipe workflow screen for manual add/import before meal scheduling
- Full recipe workflow: create, search, duplicate, edit, and delete
- Recipe details: name, description, servings, ingredients, and step-by-step instructions
- Website recipe import with layered parsing (JSON-LD, domain adapters, heuristic fallback)
- Ingredient catalog with default store routing
- Pantry exclusion filtering
- Grocery grouping and quantity scaling by household servings
- Copy exports per store, all stores, or selected stores
- Printable grocery checklist

## Product Principles

1. Weekly planning in under 5 minutes
2. Mobile-first interactions
3. Health-aware, not calorie-obsessed
4. Adapter-based integrations, not lock-in
5. Manual override always available
