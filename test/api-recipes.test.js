import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStateStore } from "../server/db.js";
import {
  createRecipe,
  deleteRecipe,
  getOrSeedState,
  normalizeIncomingState,
  updateRecipe,
} from "../server/state-service.js";

function makeRecipe(id = "recipe_api_test") {
  return {
    id,
    title: "API Test Pasta",
    mealType: "dinner",
    description: "Simple dinner for API CRUD tests.",
    servings: 4,
    tags: ["quick"],
    ingredients: [
      { name: "Pasta", qty: 16, unit: "oz", store: "Aldi" },
      { name: "Olive Oil", qty: 1, unit: "tbsp", store: "Target" },
    ],
    steps: ["Boil pasta.", "Drain and serve."],
  };
}

async function withStore(run) {
  const sqlitePath = path.join(
    os.tmpdir(),
    `meal-planner-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const store = await createStateStore({ sqlitePath });

  try {
    await run(store);
  } finally {
    await store.close();
    await fs.rm(sqlitePath, { force: true });
  }
}

test("recipe CRUD service persists create/update/delete in shared state", async () => {
  await withStore(async (store) => {
    const initialState = await getOrSeedState(store);
    assert.ok(Array.isArray(initialState.recipes));

    const created = await createRecipe(store, makeRecipe());
    assert.equal(created.id, "recipe_api_test");

    const updated = await updateRecipe(store, "recipe_api_test", {
      ...makeRecipe(),
      title: "API Test Pasta Updated",
      servings: 6,
    });
    assert.equal(updated.title, "API Test Pasta Updated");
    assert.equal(updated.servings, 6);

    const stateAfterUpdate = await getOrSeedState(store);
    assert.ok(stateAfterUpdate.recipes.some((recipe) => recipe.id === "recipe_api_test"));

    const deletion = await deleteRecipe(store, "recipe_api_test");
    assert.equal(deletion.deleted, true);

    const stateAfterDelete = await getOrSeedState(store);
    assert.ok(!stateAfterDelete.recipes.some((recipe) => recipe.id === "recipe_api_test"));
  });
});

test("deleting a recipe clears meal references from the week plan", async () => {
  await withStore(async (store) => {
    const seeded = await getOrSeedState(store);

    const nextState = normalizeIncomingState({
      ...seeded,
      recipes: [...seeded.recipes, makeRecipe("recipe_day_linked")],
      weekPlan: {
        ...seeded.weekPlan,
        Monday: {
          ...seeded.weekPlan.Monday,
          dayMode: "planned",
          meals: {
            ...seeded.weekPlan.Monday.meals,
            dinner: {
              mode: "recipe",
              recipeId: "recipe_day_linked",
              servingsOverride: null,
            },
          },
        },
      },
    });

    assert.ok(nextState);
    await store.setState(nextState);

    await deleteRecipe(store, "recipe_day_linked");

    const stateAfterDelete = await getOrSeedState(store);
    assert.equal(stateAfterDelete.weekPlan.Monday.meals.dinner.recipeId, null);
    assert.equal(stateAfterDelete.weekPlan.Monday.meals.dinner.mode, "skip");
  });
});
