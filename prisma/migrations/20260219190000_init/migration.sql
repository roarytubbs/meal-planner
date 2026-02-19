-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "grocery_stores" (
    "id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "place_id" VARCHAR(200),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" VARCHAR(80),
    "hours" TEXT[],
    "logo_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_entries" (
    "id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "default_unit" VARCHAR(64) NOT NULL,
    "default_store_id" VARCHAR(128),
    "category" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "meal_type" VARCHAR(32) NOT NULL,
    "servings" INTEGER NOT NULL,
    "source_url" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" VARCHAR(128) NOT NULL,
    "recipe_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "qty" DOUBLE PRECISION,
    "unit" VARCHAR(64) NOT NULL,
    "store" VARCHAR(200) NOT NULL,
    "store_id" VARCHAR(128),
    "position" INTEGER NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_steps" (
    "id" VARCHAR(128) NOT NULL,
    "recipe_id" VARCHAR(128) NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "recipe_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_slots" (
    "day" VARCHAR(16) NOT NULL,
    "slot" VARCHAR(16) NOT NULL,
    "recipe_id" VARCHAR(128),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plan_slots_pkey" PRIMARY KEY ("day","slot")
);

-- CreateTable
CREATE TABLE "meal_plan_snapshots" (
    "id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" VARCHAR(200) NOT NULL,

    CONSTRAINT "meal_plan_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_snapshot_meals" (
    "id" VARCHAR(128) NOT NULL,
    "snapshot_id" VARCHAR(128) NOT NULL,
    "day" VARCHAR(16) NOT NULL,
    "slot" VARCHAR(16) NOT NULL,
    "recipe_id" VARCHAR(128) NOT NULL,
    "recipe_name" VARCHAR(200) NOT NULL,
    "store_ids" TEXT[],
    "store_names" TEXT[],

    CONSTRAINT "meal_plan_snapshot_meals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grocery_stores_place_id_key" ON "grocery_stores"("place_id");

-- CreateIndex
CREATE INDEX "grocery_stores_name_idx" ON "grocery_stores"("name");

-- CreateIndex
CREATE INDEX "ingredient_entries_name_idx" ON "ingredient_entries"("name");

-- CreateIndex
CREATE INDEX "ingredient_entries_default_store_id_idx" ON "ingredient_entries"("default_store_id");

-- CreateIndex
CREATE INDEX "recipes_name_idx" ON "recipes"("name");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_ingredients_store_id_idx" ON "recipe_ingredients"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_recipe_id_position_key" ON "recipe_ingredients"("recipe_id", "position");

-- CreateIndex
CREATE INDEX "recipe_steps_recipe_id_idx" ON "recipe_steps"("recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_steps_recipe_id_position_key" ON "recipe_steps"("recipe_id", "position");

-- CreateIndex
CREATE INDEX "meal_plan_slots_recipe_id_idx" ON "meal_plan_slots"("recipe_id");

-- CreateIndex
CREATE INDEX "meal_plan_snapshots_created_at_idx" ON "meal_plan_snapshots"("created_at" DESC);

-- CreateIndex
CREATE INDEX "meal_plan_snapshot_meals_snapshot_id_idx" ON "meal_plan_snapshot_meals"("snapshot_id");

-- AddForeignKey
ALTER TABLE "ingredient_entries" ADD CONSTRAINT "ingredient_entries_default_store_id_fkey" FOREIGN KEY ("default_store_id") REFERENCES "grocery_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "grocery_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_slots" ADD CONSTRAINT "meal_plan_slots_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_snapshot_meals" ADD CONSTRAINT "meal_plan_snapshot_meals_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "meal_plan_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

