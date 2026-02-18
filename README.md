# Meal Planner

Meal Planner is a Next.js app for planning meals, managing ingredients, and maintaining store metadata for grocery workflows.
The app now uses PostgreSQL (via Prisma) as the source of truth.

## Local setup

1. Install dependencies: `npm install`.
2. Create `/Users/rtubbs/Dev/meal-planner/.env.local` from `.env.example`.
3. Set required environment variables:
   - `DATABASE_URL=postgresql://...`
   - `GOOGLE_PLACES_API_KEY=<meal-planner-dev key>`
4. Generate Prisma client: `npm run db:generate`.
5. Push schema to your database: `npm run db:push`.
6. Start the app: `npm run dev`.

## Environment variables

Required server-side variables:

- `DATABASE_URL`: Postgres connection string used by Prisma.
- `GOOGLE_PLACES_API_KEY`: Used only by server routes under `/api/places/*`.

Security rules:

- Never commit `.env.local` or any real key.
- Never use `NEXT_PUBLIC_` for the Google Places key.
- Keep Places calls server-side; the browser should only call internal API routes.

## Scripts

- `npm run dev`: Start Next.js dev server.
- `npm run build`: Build the Next.js app.
- `npm run start`: Run the production server.
- `npm run db:generate`: Generate Prisma client.
- `npm run db:push`: Push Prisma schema changes to Postgres.
- `npm run db:migrate`: Create/apply local Prisma migrations.

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
