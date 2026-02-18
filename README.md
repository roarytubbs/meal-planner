# Meal Planner

Family-first weekly meal planner with store-specific grocery lists.

## Prerequisites

- Node.js `20.9.0` or newer
- npm

## Setup

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

## Typecheck

```bash
npm run typecheck
```

## Tests

```bash
npm run test
```

## Optional Environment Variables

- `GOOGLE_PLACES_API_KEY`: enables `/api/places/search` place lookup.

If `GOOGLE_PLACES_API_KEY` is not set, `/api/places/search` returns a handled `500` JSON error indicating the key is missing.
