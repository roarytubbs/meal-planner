# Family Meal Planner (v0)

Private, family-first meal planning app optimized for:

- Weekly dinner planning in minutes
- Store-grouped grocery output
- Lightweight health tags and meal-balance signal
- Pantry exclusions for repeat staples

## v0 Features

- 7-day meal selection from saved recipes
- Recipe creation with:
  - tags
  - recipe servings (base servings per recipe)
  - ingredients
- Grocery list generation that:
  - scales ingredient quantities from recipe servings to household servings
  - supports per-day servings override (different target servings by day)
  - merges duplicate ingredients
  - normalizes common units
  - groups by store: Target, Sprouts, Aldi, Trader Joe's
- Ingredient catalog for default store mapping (used when recipes omit store values)
- Per-store export/copy formats:
  - Target/Sprouts/Aldi as cart-ready lists
  - Trader Joe's as in-store markdown checklist
- Export actions:
  - copy all stores
  - copy only selected stores
  - print selected-store checklist
- Pantry item filtering
- Mobile-friendly UI
- Local persistence via browser `localStorage`

## Run

```bash
npm start
```

Then open `http://127.0.0.1:3000`.

## Input Format For Ingredients

When creating recipes, add one ingredient per line:

```text
name, qty, unit, optional store
```

Example:

```text
Chicken breast, 1.5, lb, Sprouts
Greek yogurt, 32, oz
```

If store is omitted, the app uses the ingredient catalog default store (if available).

## Current Limitations

1. Unit conversion is basic and only merges identical units.
2. Export is copy-to-clipboard text, not direct store cart API integration.
3. Data is browser-local only (not shared across devices yet).
