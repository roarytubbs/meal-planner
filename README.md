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
- Local persistence via browser `localStorage`

## Development

```bash
npm install
npm start
```

Open the Vite URL shown in the terminal (usually `http://127.0.0.1:5173`).

## Build

```bash
npm run build
npm run preview
```

## Current Features

- Weekly meal selection with per-day serving overrides
- Recipe creation with tags and ingredient parsing
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
