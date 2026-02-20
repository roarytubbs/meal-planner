# Meal Planner

Meal Planner is a Next.js app for planning meals, managing ingredients, and maintaining store metadata for grocery workflows.
The app now uses PostgreSQL (via Prisma) as the source of truth.

## Local setup

1. Use Node.js `22.x` (`nvm use` reads `/Users/rtubbs/Dev/meal-planner/.nvmrc`).
2. Install dependencies: `npm install`.
3. Create `/Users/rtubbs/Dev/meal-planner/.env.local` from `.env.example`.
4. Set required environment variables:
   - `DATABASE_URL=postgresql://...`
   - `GOOGLE_PLACES_API_KEY=<meal-planner-dev key>`
5. Generate Prisma client: `npm run db:generate`.
6. Apply Prisma migrations to your database: `npm run db:migrate`.
7. Start the app: `npm run dev`.

### Shared preview database workflow

To keep localhost and Vercel Preview in sync, pull preview env vars locally:

1. `vercel env pull --environment=preview .env.local`
2. Confirm `.env.local` now has the preview `DATABASE_URL`.
3. Ensure preview schema is up to date (run from your shell, do not commit secrets):
   - `DATABASE_URL="<preview DATABASE_URL>" npm run db:migrate:deploy`
   - or deploy the latest Preview build so migrations run in CI.
4. Restart local dev server.

Operational risk: local writes now modify preview data.

## Environment variables

Required server-side variables:

- `DATABASE_URL`: Postgres connection string used by Prisma.
- `GOOGLE_PLACES_API_KEY`: Used only by server routes under `/api/places/*`.
- `SPOONACULAR_API_KEY` (optional): Enables provider-backed recipe search/import under `/api/import-recipe/providers/spoonacular/*`.
- `TARGET_CART_SESSION_ENDPOINT` (optional): Provider endpoint used by `/api/shopping/cart-session` to create a Target cart session.
- `TARGET_CART_SESSION_API_KEY` (optional): Bearer token for the cart-session provider endpoint.
- `TARGET_CART_TIMEOUT_MS` (optional): Request timeout for Target cart session calls. Defaults to `10000`.
- `TARGET_CART_CACHE_TTL_MS` (optional): Cart-session response cache TTL in milliseconds. Defaults to `60000`.
- `SHOPPING_CART_RATE_LIMIT_WINDOW_MS` (optional): Fixed window duration for cart-session request limits. Defaults to `60000`.
- `SHOPPING_CART_RATE_LIMIT_MAX_REQUESTS` (optional): Max cart-session requests per window per client IP. Defaults to `10`.

Security rules:

- Never commit `.env.local` or any real key.
- Never use `NEXT_PUBLIC_` for the Google Places key.
- Keep Places calls server-side; the browser should only call internal API routes.
- Keep provider keys server-side; do not expose `SPOONACULAR_API_KEY` as `NEXT_PUBLIC_*`.

## Scripts

- `npm run dev`: Start Next.js dev server.
- `npm run codex:run`: Codex-focused alias to start local dev server.
- `npm run build`: Build the Next.js app.
- `npm run start`: Run the production server.
- `npm run lint`: Run ESLint.
- `npm run typecheck`: Run TypeScript checks without emitting output.
- `npm run db:generate`: Generate Prisma client.
- `npm run db:push`: Push Prisma schema changes to Postgres.
- `npm run db:migrate`: Create/apply local Prisma migrations.
- `npm run db:migrate:deploy`: Apply committed migrations (used in deploy environments).
- `npm run codex:verify`: Run the full validation suite (`lint`, `typecheck`, `test`, `build`).

`dev`, `build`, and `test` enforce Node.js 22 via `/Users/rtubbs/Dev/meal-planner/scripts/check-node-version.mjs`.

## Google key restrictions (required)

For both `meal-planner-dev` and `meal-planner-prod` keys:

1. Open key settings in Google Cloud Console.
2. Restriction type: `API restriction`.
3. Allowed API: `Places API` (`places.googleapis.com`).
4. Keep app restriction as `None` for serverless environments unless you have static egress IPs.

Also configure quota caps and billing alerts (50% / 90% / 100%).

## Deployment (Vercel/Netlify)

Set both variables in hosting provider environment settings:

- `DATABASE_URL`
- `GOOGLE_PLACES_API_KEY` (`meal-planner-prod` for hosted envs)

Builds run a migration step before `next build`:
- normal path: `prisma migrate deploy`
- baseline path (one-time): if Prisma reports `P3005` (schema already exists without migration history), the initial migration is marked applied, then deploy continues.

Do not place keys in repository files, client code, or build arguments.

## Secret scanning

This repo uses Gitleaks in GitHub Actions:

- Workflow: `/Users/rtubbs/Dev/meal-planner/.github/workflows/secret-scan.yml`
- Config: `/Users/rtubbs/Dev/meal-planner/.gitleaks.toml`

The workflow runs on push/PR, uploads a scan report artifact, and fails on detected secrets.

## Key rotation process

If a key is exposed:

1. Regenerate the compromised key in Google Cloud immediately.
2. Update `.env.local` and hosting env vars.
3. Re-run secret scans and remove leaked secrets from git history if needed.
