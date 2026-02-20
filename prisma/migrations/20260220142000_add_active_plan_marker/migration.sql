ALTER TABLE "meal_plan_snapshots"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "activated_at" TIMESTAMP(3);

WITH newest AS (
  SELECT id
  FROM "meal_plan_snapshots"
  ORDER BY "created_at" DESC
  LIMIT 1
)
UPDATE "meal_plan_snapshots"
SET "is_active" = true,
    "activated_at" = now()
WHERE id IN (SELECT id FROM newest);

CREATE UNIQUE INDEX "meal_plan_snapshots_single_active_idx"
ON "meal_plan_snapshots" ("is_active")
WHERE "is_active" = true;
