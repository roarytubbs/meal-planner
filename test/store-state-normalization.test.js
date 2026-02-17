import assert from "node:assert/strict";
import test from "node:test";

import { hydrateState, normalizeStoreList } from "../src/lib/meal-planner.js";

function makeLegacyState(overrides = {}) {
  return {
    recipes: [
      {
        id: "legacy_recipe_store",
        title: "Legacy Store Recipe",
        mealType: "dinner",
        description: "",
        servings: 4,
        tags: [],
        ingredients: [
          { name: "Chicken breast", qty: 1, unit: "lb", store: "Custom Store" },
        ],
        steps: ["Cook."],
      },
    ],
    stores: ["Custom Store", "Unassigned"],
    pantry: [],
    mealPlanName: "",
    mealPlanDescription: "",
    householdServings: 4,
    ingredientCatalog: {
      "chicken breast": { store: "Custom Store", tag: "" },
    },
    planningDays: 7,
    weekPlan: {},
    exportStoreSelection: {
      "Custom Store": true,
      Unassigned: true,
    },
    ...overrides,
  };
}

test("normalizeStoreList keeps dynamic stores and always appends Unassigned", () => {
  const stores = normalizeStoreList(["  Target  ", "Target", "HEB South", "Unassigned", ""]);
  assert.deepEqual(stores, ["Target", "HEB South", "Unassigned"]);
  assert.deepEqual(normalizeStoreList(), ["Unassigned"]);
});

test("hydrateState migrates storeProfiles for legacy states without profiles", () => {
  const hydrated = hydrateState(makeLegacyState());

  assert.ok(hydrated);
  assert.ok(hydrated.stores.includes("Custom Store"));
  assert.equal(hydrated.storeProfiles["Custom Store"].displayName, "Custom Store");
  assert.equal(hydrated.storeProfiles["Custom Store"].address, "");
});

test("hydrateState can infer stores from legacy recipe/catalog data when stores is missing", () => {
  const hydrated = hydrateState(
    makeLegacyState({
      stores: undefined,
      ingredientCatalog: {
        "olive oil": { store: "Sprouts", tag: "" },
      },
    }),
  );

  assert.ok(hydrated);
  assert.ok(hydrated.stores.includes("Custom Store"));
  assert.ok(hydrated.stores.includes("Sprouts"));
  assert.ok(hydrated.stores.includes("Unassigned"));
});
