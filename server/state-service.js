import {
  buildDefaultExportSelection,
  DAYS,
  MEAL_SLOTS,
  createDefaultDayPlan,
  createInitialState,
  hydrateState,
  normalizeRecipes,
  normalizeStoreProfile,
  normalizeStoreList,
  normalizeName,
  upsertCatalogFromIngredients,
} from "../src/lib/meal-planner.js";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const STORE_NAME_MAX_LENGTH = 80;
const STORE_TEXT_FIELD_MAX_LENGTH = 240;
const STORE_PHONE_MAX_LENGTH = 64;
const STORE_PLACE_ID_MAX_LENGTH = 128;
const STORE_SOURCE_MAX_LENGTH = 64;
const RESERVED_STORE_KEY = "unassigned";

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeStoreNameInput(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeStoreTextField(value, maxLength = STORE_TEXT_FIELD_MAX_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeOptionalHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw);
  const candidate = hasProtocol ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function validateOptionalHttpUrl(value, fieldName) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = normalizeOptionalHttpUrl(raw);
  if (!normalized) {
    throw createHttpError(400, `${fieldName} must be a valid http(s) URL.`);
  }

  return normalized;
}

function normalizeOptionalIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isReservedStoreName(value) {
  return normalizeName(value) === RESERVED_STORE_KEY;
}

function resolveExistingStoreName(stores, candidate) {
  const key = normalizeName(candidate);
  return stores.find((store) => normalizeName(store) === key) || "";
}

function assertStorePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createHttpError(400, "Store payload is invalid.");
  }
}

function assertMaxLength(value, maxLength, fieldName) {
  const normalized = String(value || "").trim();
  if (normalized.length > maxLength) {
    throw createHttpError(400, `${fieldName} must be ${maxLength} characters or fewer.`);
  }
}

function getStoreProfile(state, storeName) {
  const rawProfile =
    state.storeProfiles && typeof state.storeProfiles === "object"
      ? state.storeProfiles[storeName]
      : null;
  return normalizeStoreProfile(storeName, rawProfile || {});
}

function normalizeSelectionForStores(rawSelection, stores) {
  const defaults = buildDefaultExportSelection(stores);
  const selection = rawSelection && typeof rawSelection === "object" ? rawSelection : {};

  stores.forEach((store) => {
    if (hasOwn(selection, store)) {
      defaults[store] = Boolean(selection[store]);
    }
  });

  return defaults;
}

function mapRecipeIngredientStores(recipes, mapper) {
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        store: mapper(ingredient.store),
      }))
      : [],
  }));
}

function mapIngredientCatalogStores(catalog, mapper) {
  const source = catalog && typeof catalog === "object" ? catalog : {};
  const next = {};

  Object.entries(source).forEach(([name, entry]) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      next[name] = {
        ...entry,
        store: mapper(entry.store || entry.preferredStore || "Unassigned"),
      };
      return;
    }

    next[name] = {
      store: mapper(entry),
      tag: "",
    };
  });

  return next;
}

function buildStoreResponse(state, storeName) {
  const profile = getStoreProfile(state, storeName);
  return {
    storeName,
    ...profile,
  };
}

function createStoreProfileFromPayload(storeName, payload, fallbackProfile = {}) {
  const merged = { ...fallbackProfile };
  const normalizedDisplayName = normalizeStoreNameInput(
    hasOwn(payload, "displayName") ? payload.displayName : (fallbackProfile.displayName || storeName),
  );
  assertMaxLength(normalizedDisplayName, STORE_NAME_MAX_LENGTH, "displayName");
  merged.displayName = normalizedDisplayName || storeName;

  if (hasOwn(payload, "chainName")) {
    assertMaxLength(payload.chainName, STORE_TEXT_FIELD_MAX_LENGTH, "chainName");
    merged.chainName = normalizeStoreTextField(payload.chainName);
  }
  if (hasOwn(payload, "address")) {
    assertMaxLength(payload.address, STORE_TEXT_FIELD_MAX_LENGTH, "address");
    merged.address = normalizeStoreTextField(payload.address);
  }
  if (hasOwn(payload, "phone")) {
    assertMaxLength(payload.phone, STORE_PHONE_MAX_LENGTH, "phone");
    merged.phone = normalizeStoreTextField(payload.phone, STORE_PHONE_MAX_LENGTH);
  }
  if (hasOwn(payload, "hours")) {
    assertMaxLength(payload.hours, STORE_TEXT_FIELD_MAX_LENGTH, "hours");
    merged.hours = normalizeStoreTextField(payload.hours);
  }
  if (hasOwn(payload, "websiteUrl")) {
    merged.websiteUrl = validateOptionalHttpUrl(payload.websiteUrl, "websiteUrl");
  }
  if (hasOwn(payload, "logoUrl")) {
    merged.logoUrl = validateOptionalHttpUrl(payload.logoUrl, "logoUrl");
  }
  if (hasOwn(payload, "googlePlaceId")) {
    assertMaxLength(payload.googlePlaceId, STORE_PLACE_ID_MAX_LENGTH, "googlePlaceId");
    merged.googlePlaceId = normalizeStoreTextField(payload.googlePlaceId, STORE_PLACE_ID_MAX_LENGTH);
  }
  if (hasOwn(payload, "metadataSource")) {
    assertMaxLength(payload.metadataSource, STORE_SOURCE_MAX_LENGTH, "metadataSource");
    merged.metadataSource = normalizeStoreTextField(payload.metadataSource, STORE_SOURCE_MAX_LENGTH);
  }
  if (hasOwn(payload, "metadataUpdatedAt")) {
    const normalized = normalizeOptionalIsoDate(payload.metadataUpdatedAt);
    if (payload.metadataUpdatedAt && !normalized) {
      throw createHttpError(400, "metadataUpdatedAt must be a valid date-time.");
    }
    merged.metadataUpdatedAt = normalized;
  }

  return normalizeStoreProfile(storeName, merged);
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

export async function listStores(store) {
  const state = await getOrSeedState(store);
  const managedStores = normalizeStoreList(state.stores).filter((item) => item !== "Unassigned");

  return managedStores.map((storeName) => buildStoreResponse(state, storeName));
}

export async function createStore(store, payload) {
  assertStorePayload(payload);
  const state = await getOrSeedState(store);
  const nextStoreName = normalizeStoreNameInput(payload.storeName || payload.displayName);

  if (!nextStoreName) {
    throw createHttpError(400, "Store name is required.");
  }
  assertMaxLength(nextStoreName, STORE_NAME_MAX_LENGTH, "storeName");
  if (isReservedStoreName(nextStoreName)) {
    throw createHttpError(400, "Unassigned is reserved and cannot be created.");
  }
  if (resolveExistingStoreName(state.stores, nextStoreName)) {
    throw createHttpError(409, "Store name already exists.");
  }

  const nextStores = normalizeStoreList([...state.stores, nextStoreName]);
  const profile = createStoreProfileFromPayload(nextStoreName, payload, { displayName: nextStoreName });
  const nextState = {
    ...state,
    stores: nextStores,
    storeProfiles: {
      ...(state.storeProfiles || {}),
      [nextStoreName]: profile,
    },
    exportStoreSelection: normalizeSelectionForStores(state.exportStoreSelection, nextStores),
  };

  await store.setState(nextState);
  return {
    state: nextState,
    store: buildStoreResponse(nextState, nextStoreName),
  };
}

export async function updateStore(store, routeStoreName, payload) {
  assertStorePayload(payload);
  const state = await getOrSeedState(store);
  const existingStoreName = resolveExistingStoreName(state.stores, routeStoreName);

  if (!existingStoreName || isReservedStoreName(existingStoreName)) {
    throw createHttpError(404, "Store not found.");
  }

  const requestedName = hasOwn(payload, "storeName")
    ? payload.storeName
    : hasOwn(payload, "displayName")
      ? payload.displayName
      : existingStoreName;
  const nextStoreName = normalizeStoreNameInput(requestedName);

  if (!nextStoreName) {
    throw createHttpError(400, "Store name is required.");
  }
  assertMaxLength(nextStoreName, STORE_NAME_MAX_LENGTH, "storeName");
  if (isReservedStoreName(nextStoreName)) {
    throw createHttpError(400, "Unassigned is reserved and cannot be used.");
  }

  const existingWithNewName = resolveExistingStoreName(state.stores, nextStoreName);
  if (existingWithNewName && normalizeName(existingWithNewName) !== normalizeName(existingStoreName)) {
    throw createHttpError(409, "Store name already exists.");
  }

  const fromStoreKey = normalizeName(existingStoreName);
  const needsRename = normalizeName(nextStoreName) !== fromStoreKey;

  const nextStores = needsRename
    ? normalizeStoreList(
      state.stores.map((storeName) =>
        normalizeName(storeName) === fromStoreKey ? nextStoreName : storeName,
      ),
    )
    : normalizeStoreList(state.stores);

  const currentProfile = getStoreProfile(state, existingStoreName);
  const fallbackDisplayName = normalizeName(currentProfile.displayName) === normalizeName(existingStoreName)
    ? nextStoreName
    : currentProfile.displayName;
  const nextProfile = createStoreProfileFromPayload(nextStoreName, payload, {
    ...currentProfile,
    displayName: fallbackDisplayName,
  });

  const nextStoreProfiles = { ...(state.storeProfiles || {}) };
  delete nextStoreProfiles[existingStoreName];
  nextStoreProfiles[nextStoreName] = nextProfile;

  const mapStoreValue = (storeName) => {
    if (normalizeName(storeName) !== fromStoreKey) {
      return storeName;
    }
    return nextStoreName;
  };

  const nextRecipes = needsRename
    ? mapRecipeIngredientStores(state.recipes, mapStoreValue)
    : state.recipes;
  const nextCatalog = needsRename
    ? mapIngredientCatalogStores(state.ingredientCatalog, mapStoreValue)
    : state.ingredientCatalog;

  const remappedSelection = {};
  Object.entries(state.exportStoreSelection || {}).forEach(([storeName, selected]) => {
    remappedSelection[mapStoreValue(storeName)] = Boolean(selected);
  });
  const nextState = {
    ...state,
    stores: nextStores,
    storeProfiles: nextStoreProfiles,
    recipes: nextRecipes,
    ingredientCatalog: nextCatalog,
    exportStoreSelection: normalizeSelectionForStores(remappedSelection, nextStores),
  };

  await store.setState(nextState);
  return {
    state: nextState,
    store: buildStoreResponse(nextState, nextStoreName),
  };
}

export async function deleteStore(store, routeStoreName) {
  const state = await getOrSeedState(store);
  const existingStoreName = resolveExistingStoreName(state.stores, routeStoreName);

  if (!existingStoreName || isReservedStoreName(existingStoreName)) {
    throw createHttpError(404, "Store not found.");
  }

  const deleteStoreKey = normalizeName(existingStoreName);
  const mapStoreValue = (storeName) => (
    normalizeName(storeName) === deleteStoreKey ? "Unassigned" : storeName
  );
  const nextStores = normalizeStoreList(
    state.stores.filter((storeName) => normalizeName(storeName) !== deleteStoreKey),
  );
  const nextStoreProfiles = { ...(state.storeProfiles || {}) };
  delete nextStoreProfiles[existingStoreName];

  const nextSelection = {};
  Object.entries(state.exportStoreSelection || {}).forEach(([storeName, selected]) => {
    if (normalizeName(storeName) === deleteStoreKey) {
      return;
    }
    nextSelection[storeName] = Boolean(selected);
  });

  const nextState = {
    ...state,
    stores: nextStores,
    storeProfiles: nextStoreProfiles,
    recipes: mapRecipeIngredientStores(state.recipes, mapStoreValue),
    ingredientCatalog: mapIngredientCatalogStores(state.ingredientCatalog, mapStoreValue),
    exportStoreSelection: normalizeSelectionForStores(nextSelection, nextStores),
  };

  await store.setState(nextState);
  return {
    deleted: true,
    storeName: existingStoreName,
    reassignedTo: "Unassigned",
    state: nextState,
  };
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
