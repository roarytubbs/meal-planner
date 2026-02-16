# Family Meal Planner

Meal planning app rebuilt with React + Tailwind + local `shadcn/ui` components.

## Stack

- React (Vite)
- Tailwind CSS
- `shadcn/ui` component primitives (local source in `src/components/ui`)
- Local persistence with browser `localStorage`

## Run

```bash
npm install
npm start
```

Then open the Vite URL shown in terminal (usually `http://127.0.0.1:5173`).

## Build

```bash
npm run build
npm run preview
```

## Features

- Weekly meal selection with per-day serving overrides
- Recipe creation with tags and ingredient parsing
- Ingredient catalog for default store routing
- Pantry exclusion filtering
- Grocery grouping and quantity scaling by household servings
- Copy exports per store / all stores / selected stores
- Printable grocery checklist
