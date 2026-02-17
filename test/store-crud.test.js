import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStateStore } from "../server/db.js";
import {
  createStore,
  deleteStore,
  getOrSeedState,
  normalizeIncomingState,
  updateStore,
} from "../server/state-service.js";

async function withStore(run) {
  const sqlitePath = path.join(
    os.tmpdir(),
    `meal-planner-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const store = await createStateStore({ sqlitePath });

  try {
    await run(store);
  } finally {
    await store.close();
    await fs.rm(sqlitePath, { force: true });
  }
}

function makeRecipe(id = "recipe_store_test", storeName = "Target") {
  return {
    id,
    title: "Store Migration Pasta",
    mealType: "dinner",
    description: "Recipe used for store migration tests.",
    servings: 4,
    tags: ["test"],
    ingredients: [
      { name: "Pasta", qty: 16, unit: "oz", store: storeName },
      { name: "Olive oil", qty: 1, unit: "tbsp", store: storeName },
    ],
    steps: ["Boil pasta.", "Serve."],
  };
}

test("store CRUD create rejects duplicates and reserved names", async () => {
  await withStore(async (store) => {
    await getOrSeedState(store);

    const created = await createStore(store, {
      storeName: "Whole Foods (Downtown)",
      displayName: "Whole Foods (Downtown)",
      address: "123 Main St, Austin, TX",
      metadataSource: "manual",
    });
    assert.equal(created.store.storeName, "Whole Foods (Downtown)");

    await assert.rejects(
      () => createStore(store, { storeName: "Whole Foods (Downtown)" }),
      (error) => error?.statusCode === 409,
    );

    await assert.rejects(
      () => createStore(store, { storeName: "Unassigned" }),
      (error) => error?.statusCode === 400,
    );
  });
});

test("renaming a store migrates recipe, catalog, and export selection references", async () => {
  await withStore(async (store) => {
    const seeded = await getOrSeedState(store);
    const seededWithRecipe = normalizeIncomingState({
      ...seeded,
      recipes: [...seeded.recipes, makeRecipe("recipe_store_rename", "Target")],
      ingredientCatalog: {
        ...seeded.ingredientCatalog,
        "test ingredient": { store: "Target", tag: "test" },
      },
      exportStoreSelection: {
        ...seeded.exportStoreSelection,
        Target: false,
      },
    });
    assert.ok(seededWithRecipe);
    await store.setState(seededWithRecipe);

    const updated = await updateStore(store, "Target", {
      storeName: "Target (South Lamar)",
      displayName: "Target (South Lamar)",
      chainName: "Target",
      address: "3600 S Lamar Blvd, Austin, TX",
    });

    assert.equal(updated.store.storeName, "Target (South Lamar)");

    const stateAfterUpdate = await getOrSeedState(store);
    assert.ok(stateAfterUpdate.stores.includes("Target (South Lamar)"));
    assert.ok(!stateAfterUpdate.stores.includes("Target"));
    assert.ok(!Object.prototype.hasOwnProperty.call(stateAfterUpdate.exportStoreSelection, "Target"));
    assert.equal(stateAfterUpdate.exportStoreSelection["Target (South Lamar)"], false);
    assert.ok(
      stateAfterUpdate.recipes.every((recipe) =>
        recipe.ingredients.every((ingredient) => ingredient.store !== "Target"),
      ),
    );
    assert.ok(
      Object.values(stateAfterUpdate.ingredientCatalog).every((entry) => entry.store !== "Target"),
    );
  });
});

test("deleting a store reassigns references to Unassigned", async () => {
  await withStore(async (store) => {
    const seeded = await getOrSeedState(store);
    const customState = normalizeIncomingState({
      ...seeded,
      stores: ["Target", "Delete Me", "Unassigned"],
      storeProfiles: {
        ...(seeded.storeProfiles || {}),
        "Delete Me": {
          displayName: "Delete Me",
          chainName: "Delete Me",
          metadataSource: "manual",
        },
      },
      recipes: [...seeded.recipes, makeRecipe("recipe_store_delete", "Delete Me")],
      ingredientCatalog: {
        ...seeded.ingredientCatalog,
        "delete-me-item": { store: "Delete Me", tag: "" },
      },
      exportStoreSelection: {
        ...seeded.exportStoreSelection,
        "Delete Me": true,
      },
    });
    assert.ok(customState);
    await store.setState(customState);

    const result = await deleteStore(store, "Delete Me");
    assert.equal(result.deleted, true);

    const stateAfterDelete = await getOrSeedState(store);
    assert.ok(!stateAfterDelete.stores.includes("Delete Me"));
    assert.ok(
      stateAfterDelete.recipes.every((recipe) =>
        recipe.ingredients.every((ingredient) => ingredient.store !== "Delete Me"),
      ),
    );
    assert.ok(
      Object.values(stateAfterDelete.ingredientCatalog).every((entry) => entry.store !== "Delete Me"),
    );
    assert.ok(!Object.prototype.hasOwnProperty.call(stateAfterDelete.exportStoreSelection, "Delete Me"));
  });
});
