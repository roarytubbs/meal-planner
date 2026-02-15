# Meal Planner (Family-Focused)

A private, practical meal planning app designed for a single household.

## Product Vision

Help one person (your wife) plan a week of meals quickly, then automatically generate:

- A consolidated grocery list
- Store-split lists for Target, Sprouts, Aldi, and Trader Joe's
- Cart-ready order drafts where integrations are available

This project is intentionally **not** optimized for mass-market complexity. It is optimized for real household usage: fast planning, minimal friction, and reliable grocery output.

## Product Principles

1. **Weekly planning in under 5 minutes**
2. **Mobile-first interaction** (use while cooking or shopping)
3. **Health-aware, not calorie-obsessed**
4. **Integration adapters, not integration lock-in**
5. **Manual overrides always available**

## Core User Flow

1. Select meals for Mon-Sun (dinner-first MVP)
2. Review and adjust ingredients
3. Generate groceries
4. Split groceries by preferred store
5. Export:
   - order draft for supported stores
   - in-store checklist for Trader Joe's

## MVP Scope (First Build Slice)

### Data model

- `Recipe`
  - `id`
  - `title`
  - `tags[]` (e.g., high-protein, quick, kid-friendly)
  - `ingredients[]`
- `Ingredient`
  - `name`
  - `quantity`
  - `unit`
  - `notes`
  - `defaultStore` (Target/Sprouts/Aldi/Trader Joe's)
- `WeekPlan`
  - `startDate`
  - `meals[]` (`day`, `recipeId`)
- `Pantry` (optional early)
  - ingredients to exclude from grocery generation

### Features

- Build/edit family recipe set (start with 30-50)
- Assign recipe to each day of the week
- Merge and normalize ingredient list
- Split by store using default mapping + manual edits
- Mobile-friendly "This Week" and "Groceries" screens

## Integration Strategy

Assume uneven API support across grocers.

- Treat each grocer as an adapter with a shared interface
- Start with robust list generation first
- Add order-draft automation incrementally
- Keep Trader Joe's optimized for in-store checklist mode

## Health Layer (Phase 1.5)

Start with lightweight meal metadata instead of full nutrition tracking.

Recommended tags:

- high-protein
- low-carb
- high-fiber
- quick-15
- freezer-friendly
- leftovers-friendly

Add a weekly balance summary such as:

- quick meals count
- leftovers coverage
- cook-heavy nights

## Initial Backlog

1. Build recipe + ingredient schema
2. Add weekly planner UI (Mon-Sun)
3. Implement grocery merge logic
4. Add unit normalization rules (basic)
5. Add store split rules and manual override
6. Build checklist/export views
7. Add pantry exclusion pass
8. Add health tag dashboard

## Next Iteration Questions

- Should recipe source of truth be in-app only or include URL imports?
- Should lunches be added immediately, or after dinner flow is smooth?
- Which store should get first automation effort for order draft creation?
- Do you want price-awareness in v1 (even rough estimates), or defer?
