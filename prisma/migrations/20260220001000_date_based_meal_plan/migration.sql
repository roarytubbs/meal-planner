-- Add explicit per-slot selection state
ALTER TABLE "meal_plan_slots"
ADD COLUMN "selection" VARCHAR(16) NOT NULL DEFAULT 'recipe';

ALTER TABLE "meal_plan_snapshot_meals"
ADD COLUMN "selection" VARCHAR(16) NOT NULL DEFAULT 'recipe';

-- Snapshot meals now support status-only rows
ALTER TABLE "meal_plan_snapshot_meals"
ALTER COLUMN "recipe_id" DROP NOT NULL,
ALTER COLUMN "recipe_name" DROP NOT NULL;

-- Planner no longer supports snack slots
DELETE FROM "meal_plan_snapshot_meals" WHERE lower("slot") = 'snack';
DELETE FROM "meal_plan_slots" WHERE lower("slot") = 'snack';

WITH anchor AS (
  SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7))::date AS monday
)
UPDATE "meal_plan_slots" AS target
SET "day" = to_char(
  anchor.monday +
  CASE lower(target."day")
    WHEN 'monday' THEN 0
    WHEN 'tuesday' THEN 1
    WHEN 'wednesday' THEN 2
    WHEN 'thursday' THEN 3
    WHEN 'friday' THEN 4
    WHEN 'saturday' THEN 5
    WHEN 'sunday' THEN 6
  END,
  'YYYY-MM-DD'
)
FROM anchor
WHERE lower(target."day") IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

WITH anchor AS (
  SELECT (CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7))::date AS monday
)
UPDATE "meal_plan_snapshot_meals" AS target
SET "day" = to_char(
  anchor.monday +
  CASE lower(target."day")
    WHEN 'monday' THEN 0
    WHEN 'tuesday' THEN 1
    WHEN 'wednesday' THEN 2
    WHEN 'thursday' THEN 3
    WHEN 'friday' THEN 4
    WHEN 'saturday' THEN 5
    WHEN 'sunday' THEN 6
  END,
  'YYYY-MM-DD'
)
FROM anchor
WHERE lower(target."day") IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
