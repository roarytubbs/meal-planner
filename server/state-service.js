import {
  DAYS,
  MEAL_SLOTS,
  createDefaultDayPlan,
  createInitialState,
  hydrateState,
  normalizeRecipes,
  normalizeStoreList,
  upsertCatalogFromIngredients,
} from "../src/lib/meal-planner.js";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function normalizeIncomingState(candidate) {
  return hydrateState(candidate);
}

export async function getOrSeedState(store) {
  const existing = await store.getState();
  const hydrated = hydrateState(existing);

  if (hydrated) {
    return hydrated;
  }

  const seeded = createInitialState();
  await store.setState(seeded);
  return seeded;
}

function normalizeRecipePayload(recipePayload, state, forceId) {
  if (!recipePayload || typeof recipePayload !== "object") {
    return null;
  }

  const normalizedStores = normalizeStoreList(state.stores);
  const normalizedRecipes = normalizeRecipes(
    [{ ...recipePayload, id: forceId || recipePayload.id }],
    normalizedStores,
  );

  return normalizedRecipes[0] || null;
}

function removeRecipeFromWeekPlan(weekPlan, recipeId, recipes) {
  const safeWeekPlan = weekPlan && typeof weekPlan === "object" ? cloneJson(weekPlan) : {};

  DAYS.forEach((day, index) => {
    const dayPlan = safeWeekPlan[day] || createDefaultDayPlan(recipes, index);
    const nextMeals = { ...(dayPlan.meals || {}) };

    MEAL_SLOTS.forEach((slot) => {
      const currentMeal = nextMeals[slot];
      if (currentMeal?.recipeId !== recipeId) {
        return;
      }

      nextMeals[slot] = {
        ...currentMeal,
        mode: "skip",
        recipeId: null,
      };
    });

    safeWeekPlan[day] = {
      ...dayPlan,
      meals: nextMeals,
    };
  });

  return safeWeekPlan;
}

export async function createRecipe(store, payload) {
  const state = await getOrSeedState(store);
  const recipe = normalizeRecipePayload(payload, state);

  if (!recipe) {
    throw createHttpError(400, "Recipe payload is invalid.");
  }

  if (state.recipes.some((item) => item.id === recipe.id)) {
    throw createHttpError(409, "Recipe id already exists.");
  }

  const nextState = {
    ...state,
    recipes: [...state.recipes, recipe],
    ingredientCatalog: upsertCatalogFromIngredients(
      state.ingredientCatalog,
      recipe.ingredients,
      state.stores,
    ),
  };

  await store.setState(nextState);
  return recipe;
}

export async function updateRecipe(store, recipeId, payload) {
  const state = await getOrSeedState(store);

  if (!state.recipes.some((item) => item.id === recipeId)) {
    throw createHttpError(404, "Recipe not found.");
  }

  const normalized = normalizeRecipePayload(payload, state, recipeId);
  if (!normalized) {
    throw createHttpError(400, "Recipe payload is invalid.");
  }

  const nextState = {
    ...state,
    recipes: state.recipes.map((recipe) => (recipe.id === recipeId ? normalized : recipe)),
    ingredientCatalog: upsertCatalogFromIngredients(
      state.ingredientCatalog,
      normalized.ingredients,
      state.stores,
    ),
  };

  await store.setState(nextState);
  return normalized;
}

export async function deleteRecipe(store, recipeId) {
  const state = await getOrSeedState(store);

  if (!state.recipes.some((item) => item.id === recipeId)) {
    throw createHttpError(404, "Recipe not found.");
  }

  const nextRecipes = state.recipes.filter((item) => item.id !== recipeId);
  const nextState = {
    ...state,
    recipes: nextRecipes,
    weekPlan: removeRecipeFromWeekPlan(state.weekPlan, recipeId, nextRecipes),
  };

  await store.setState(nextState);
  return { deleted: true, id: recipeId };
}
