export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner"];
export const MEAL_SLOT_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};
export const DAY_MODES = ["planned", "leftovers", "eat-out", "skip"];
export const DAY_MODE_LABELS = {
  planned: "Planned meals",
  leftovers: "Leftovers day",
  "eat-out": "Eat out day",
  skip: "Skip day",
};
export const MEAL_MODES = ["recipe", "leftovers", "eat-out", "skip"];
export const MEAL_MODE_LABELS = {
  recipe: "Recipe",
  leftovers: "Leftovers",
  "eat-out": "Eat out",
  skip: "Skip",
};

export const STORES = ["Target", "Sprouts", "Aldi", "Trader Joe's", "Unassigned"];
export const CATALOG_STORES = ["Target", "Sprouts", "Aldi", "Trader Joe's"];
export const STORAGE_KEY = "family-meal-planner-v1";

const UNIT_MAP = {
  tablespoons: "tbsp",
  tablespoon: "tbsp",
  tbsps: "tbsp",
  tsp: "tsp",
  tsps: "tsp",
  teaspoons: "tsp",
  teaspoon: "tsp",
  ounces: "oz",
  ounce: "oz",
  pounds: "lb",
  pound: "lb",
  grams: "g",
  gram: "g",
  cups: "cup",
};

function id(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStoreLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeStoreList(rawStores = []) {
  const stores = [];
  const seen = new Set();

  CATALOG_STORES.forEach((store) => {
    const key = normalizeName(store);
    seen.add(key);
    stores.push(store);
  });

  if (Array.isArray(rawStores)) {
    rawStores.forEach((store) => {
      const label = normalizeStoreLabel(store);
      const key = normalizeName(label);
      if (!label || key === "unassigned" || seen.has(key)) {
        return;
      }
      seen.add(key);
      stores.push(label);
    });
  }

  stores.push("Unassigned");
  return stores;
}

const seedRecipes = [
  {
    id: id("recipe"),
    title: "Sheet Pan Chicken + Veg",
    mealType: "dinner",
    description: "A balanced weeknight bake with minimal cleanup.",
    servings: 4,
    tags: ["high-protein", "45-min", "leftovers"],
    ingredients: [
      { name: "Chicken breast", qty: 1.5, unit: "lb", store: "Sprouts" },
      { name: "Broccoli", qty: 2, unit: "head", store: "Aldi" },
      { name: "Sweet potato", qty: 3, unit: "each", store: "Aldi" },
      { name: "Olive oil", qty: 2, unit: "tbsp", store: "Target" },
    ],
    steps: [
      "Heat oven to 425F and line a sheet pan.",
      "Toss chicken and vegetables with olive oil, salt, and pepper.",
      "Roast until chicken reaches 165F and vegetables are tender.",
    ],
  },
  {
    id: id("recipe"),
    title: "Turkey Taco Bowls",
    mealType: "dinner",
    description: "Fast protein-forward dinner bowls with pantry staples.",
    servings: 4,
    tags: ["30-min", "high-protein", "kid-friendly"],
    ingredients: [
      { name: "Ground turkey", qty: 1.25, unit: "lb", store: "Sprouts" },
      { name: "Jasmine rice", qty: 2, unit: "cup", store: "Target" },
      { name: "Black beans", qty: 1, unit: "can", store: "Aldi" },
      { name: "Salsa", qty: 1, unit: "jar", store: "Target" },
    ],
    steps: [
      "Cook rice according to package directions.",
      "Brown turkey in a skillet and season to taste.",
      "Warm beans, then build bowls with rice, turkey, beans, and salsa.",
    ],
  },
  {
    id: id("recipe"),
    title: "Pesto Pasta + Salmon",
    mealType: "dinner",
    description: "Quick pasta and salmon combo with bold flavor.",
    servings: 4,
    tags: ["35-min", "omega-3"],
    ingredients: [
      { name: "Salmon fillet", qty: 1.25, unit: "lb", store: "Trader Joe's" },
      { name: "Pasta", qty: 16, unit: "oz", store: "Aldi" },
      { name: "Pesto", qty: 1, unit: "jar", store: "Trader Joe's" },
      { name: "Parmesan", qty: 4, unit: "oz", store: "Target" },
    ],
    steps: [
      "Cook pasta in salted water and reserve a little pasta water.",
      "Bake or pan-sear salmon until cooked through.",
      "Toss pasta with pesto, thin with pasta water, and top with salmon and parmesan.",
    ],
  },
  {
    id: id("recipe"),
    title: "Greek Chicken Wraps",
    mealType: "dinner",
    description: "No-fuss wraps for busy nights.",
    servings: 4,
    tags: ["20-min", "high-protein"],
    ingredients: [
      { name: "Rotisserie chicken", qty: 1, unit: "each", store: "Target" },
      { name: "Greek yogurt", qty: 24, unit: "oz", store: "Target" },
      { name: "Cucumber", qty: 1, unit: "each", store: "Sprouts" },
      { name: "Whole wheat wraps", qty: 1, unit: "pack", store: "Aldi" },
    ],
    steps: [
      "Shred chicken and dice cucumber.",
      "Mix yogurt with lemon, garlic, and herbs for a quick sauce.",
      "Fill wraps with chicken, cucumber, and sauce.",
    ],
  },
];

export function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizeUnit(unit) {
  const normalized = String(unit || "each").trim().toLowerCase();
  return UNIT_MAP[normalized] || normalized || "each";
}

export function pickStore(store, availableStores = STORES) {
  const stores = normalizeStoreList(availableStores);
  const cleaned = String(store || "").trim();
  const matched = stores.find((candidate) =>
    candidate.toLowerCase() === cleaned.toLowerCase(),
  );
  return matched || "Unassigned";
}

export function normalizeServings(value, fallback = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }
  return Math.round(numeric);
}

export function normalizeRecipeMealType(value, fallback = "dinner") {
  const normalized = String(value || "").trim().toLowerCase();
  return MEAL_SLOTS.includes(normalized) ? normalized : fallback;
}

function normalizePlanningDays(value) {
  return Math.min(7, Math.max(1, normalizeServings(value, 7)));
}

function normalizeMealPlanName(value) {
  return String(value || "").trim().slice(0, 80);
}

function normalizeMealPlanDescription(value) {
  return String(value || "").trim().slice(0, 280);
}

function normalizeDayMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return DAY_MODES.includes(normalized) ? normalized : "planned";
}

function normalizeMealMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return MEAL_MODES.includes(normalized) ? normalized : "skip";
}

export function parseOptionalServings(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = normalizeServings(value, NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatQty(qty) {
  if (!Number.isFinite(qty)) {
    return "";
  }
  const rounded = Math.round(qty * 100) / 100;
  return rounded.toString();
}

export function displayName(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeRecipes(recipes, availableStores = STORES) {
  if (!Array.isArray(recipes)) {
    return [];
  }

  return recipes
    .map((recipe) => {
      const title = String(recipe.title || "").trim();
      const description = String(recipe.description || "").trim();
      const ingredientsRaw = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      const ingredients = ingredientsRaw
        .map((ingredient) => {
          const name = normalizeName(ingredient.name);
          if (!name) {
            return null;
          }
          const qty = Number.isFinite(Number(ingredient.qty)) ? Number(ingredient.qty) : 1;
          return {
            name,
            qty,
            unit: normalizeUnit(ingredient.unit || "each"),
            store: pickStore(ingredient.store, availableStores),
          };
        })
        .filter(Boolean);

      if (!title || ingredients.length === 0) {
        return null;
      }

      return {
        id: recipe.id || id("recipe"),
        title,
        mealType: normalizeRecipeMealType(recipe.mealType, "dinner"),
        description,
        sourceUrl: String(recipe.sourceUrl || "").trim(),
        servings: normalizeServings(recipe.servings, 4),
        tags: Array.isArray(recipe.tags)
          ? recipe.tags.map((tag) => String(tag).trim()).filter(Boolean)
          : [],
        ingredients,
        steps: normalizeSteps(recipe.steps),
      };
    })
    .filter(Boolean);
}

function parseFractionalNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return NaN;
  }

  if (/^\d+\s+\d+\/\d+$/.test(raw)) {
    const [whole, fraction] = raw.split(/\s+/);
    const [numerator, denominator] = fraction.split("/").map(Number);
    if (!denominator) {
      return NaN;
    }
    return Number(whole) + numerator / denominator;
  }

  if (/^\d+\/\d+$/.test(raw)) {
    const [numerator, denominator] = raw.split("/").map(Number);
    if (!denominator) {
      return NaN;
    }
    return numerator / denominator;
  }

  const normalized = Number(raw);
  return Number.isFinite(normalized) ? normalized : NaN;
}

export function normalizeSteps(rawSteps) {
  if (Array.isArray(rawSteps)) {
    return rawSteps
      .map((step) => String(step || "").trim())
      .map((step) => step.replace(/^\d+[\).\s:-]+/, "").trim())
      .filter(Boolean);
  }

  return String(rawSteps || "")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*•]\s+/, ""))
    .map((line) => line.replace(/^\d+[\).\s:-]+/, "").trim())
    .filter(Boolean);
}

function parseFreeformIngredient(line, ingredientCatalog, availableStores = STORES) {
  const cleaned = String(line || "")
    .trim()
    .replace(/^[-*•]\s+/, "");
  if (!cleaned) {
    return null;
  }

  const withUnitMatch = cleaned.match(
    /^(\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)\s+([a-zA-Z]+)\s+(.+)$/,
  );
  if (withUnitMatch) {
    const [, qtyToken, rawUnit, rawName] = withUnitMatch;
    const parsedQty = parseFractionalNumber(qtyToken);
    const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    const name = normalizeName(rawName);
    if (!name) {
      return null;
    }
    return {
      name,
      qty,
      unit: normalizeUnit(rawUnit || "each"),
      store: resolveIngredientStore(name, "", ingredientCatalog, availableStores),
    };
  }

  const qtyOnlyMatch = cleaned.match(/^(\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)\s+(.+)$/);
  if (qtyOnlyMatch) {
    const [, qtyToken, rawName] = qtyOnlyMatch;
    const parsedQty = parseFractionalNumber(qtyToken);
    const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    const name = normalizeName(rawName);
    if (!name) {
      return null;
    }
    return {
      name,
      qty,
      unit: "each",
      store: resolveIngredientStore(name, "", ingredientCatalog, availableStores),
    };
  }

  const name = normalizeName(cleaned);
  if (!name) {
    return null;
  }
  return {
    name,
    qty: 1,
    unit: "each",
    store: resolveIngredientStore(name, "", ingredientCatalog, availableStores),
  };
}

export function buildCatalogFromRecipes(recipes, availableStores = STORES) {
  const catalog = {};
  recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      const name = normalizeName(ingredient.name);
      const store = pickStore(ingredient.store, availableStores);
      if (!name || store === "Unassigned") {
        return;
      }
      catalog[name] = store;
    });
  });
  return catalog;
}

export function createEmptyMealPlan(mode = "skip") {
  return {
    mode: normalizeMealMode(mode),
    recipeId: null,
    servingsOverride: null,
  };
}

function normalizeMealPlan(rawMeal) {
  const fallback = createEmptyMealPlan();
  if (!rawMeal || typeof rawMeal !== "object") {
    return fallback;
  }

  const mode = normalizeMealMode(rawMeal.mode);
  const recipeId = String(rawMeal.recipeId || "").trim() || null;
  return {
    mode,
    recipeId: mode === "recipe" ? recipeId : null,
    servingsOverride: parseOptionalServings(rawMeal.servingsOverride),
  };
}

export function createDefaultDayPlan(recipes, dayIndex = 0) {
  const recipeCount = recipes.length;
  const dinnerRecipeId = recipeCount > 0 ? recipes[dayIndex % recipeCount]?.id || null : null;

  return {
    dayMode: "planned",
    meals: {
      breakfast: createEmptyMealPlan("skip"),
      lunch: createEmptyMealPlan("skip"),
      dinner: {
        mode: dinnerRecipeId ? "recipe" : "skip",
        recipeId: dinnerRecipeId,
        servingsOverride: null,
      },
    },
  };
}

export function createDefaultWeekPlan(recipes) {
  return DAYS.reduce((acc, day, idx) => {
    acc[day] = createDefaultDayPlan(recipes, idx);
    return acc;
  }, {});
}

function normalizeDayPlan(rawDay, recipes, dayIndex) {
  const fallback = createDefaultDayPlan(recipes, dayIndex);

  if (!rawDay) {
    return fallback;
  }

  if (typeof rawDay === "string") {
    fallback.meals.dinner = {
      mode: rawDay ? "recipe" : "skip",
      recipeId: rawDay || null,
      servingsOverride: null,
    };
    return fallback;
  }

  if (typeof rawDay !== "object") {
    return fallback;
  }

  const normalized = {
    dayMode: normalizeDayMode(rawDay.dayMode),
    meals: {
      breakfast: fallback.meals.breakfast,
      lunch: fallback.meals.lunch,
      dinner: fallback.meals.dinner,
    },
  };

  const legacyRecipeId = String(rawDay.recipeId || "").trim() || null;
  if (legacyRecipeId) {
    normalized.meals.dinner = {
      mode: "recipe",
      recipeId: legacyRecipeId,
      servingsOverride: parseOptionalServings(rawDay.servingsOverride),
    };
  }

  if (rawDay.meals && typeof rawDay.meals === "object") {
    MEAL_SLOTS.forEach((slot) => {
      normalized.meals[slot] = normalizeMealPlan(rawDay.meals[slot]);
    });
  }

  return normalized;
}

function normalizeWeekPlan(rawWeekPlan, recipes) {
  const safePlan = rawWeekPlan && typeof rawWeekPlan === "object" ? rawWeekPlan : {};
  return DAYS.reduce((acc, day, idx) => {
    acc[day] = normalizeDayPlan(safePlan[day], recipes, idx);
    return acc;
  }, {});
}

export function buildDefaultExportSelection(availableStores = STORES) {
  return Object.fromEntries(normalizeStoreList(availableStores).map((store) => [store, true]));
}

function normalizeExportStoreSelection(rawSelection, availableStores = STORES) {
  const stores = normalizeStoreList(availableStores);
  const defaults = buildDefaultExportSelection(stores);
  const selection = rawSelection && typeof rawSelection === "object" ? rawSelection : {};

  stores.forEach((store) => {
    if (Object.prototype.hasOwnProperty.call(selection, store)) {
      defaults[store] = Boolean(selection[store]);
    }
  });

  return defaults;
}

export function hydrateState(rawState) {
  if (!rawState) {
    return null;
  }

  const stores = normalizeStoreList(rawState.stores);
  const recipes = normalizeRecipes(rawState.recipes, stores);
  if (recipes.length === 0) {
    return null;
  }

  const pantry = Array.isArray(rawState.pantry)
    ? [...new Set(rawState.pantry.map((item) => normalizeName(item)).filter(Boolean))]
    : [];
  const householdServings = normalizeServings(rawState.householdServings, 4);

  const catalogInput = rawState.ingredientCatalog && typeof rawState.ingredientCatalog === "object"
    ? rawState.ingredientCatalog
    : {};
  const ingredientCatalog = {};

  Object.entries(catalogInput).forEach(([name, store]) => {
    const normalizedName = normalizeName(name);
    const normalizedStore = pickStore(store, stores);
    if (!normalizedName || normalizedStore === "Unassigned") {
      return;
    }
    ingredientCatalog[normalizedName] = normalizedStore;
  });

  const fallbackCatalog = buildCatalogFromRecipes(recipes, stores);
  Object.keys(fallbackCatalog).forEach((name) => {
    if (!ingredientCatalog[name]) {
      ingredientCatalog[name] = fallbackCatalog[name];
    }
  });

  return {
    recipes,
    stores,
    pantry,
    mealPlanName: normalizeMealPlanName(rawState.mealPlanName),
    mealPlanDescription: normalizeMealPlanDescription(rawState.mealPlanDescription),
    householdServings,
    ingredientCatalog,
    planningDays: normalizePlanningDays(rawState.planningDays),
    weekPlan: normalizeWeekPlan(rawState.weekPlan, recipes),
    exportStoreSelection: normalizeExportStoreSelection(rawState.exportStoreSelection, stores),
  };
}

export function loadState() {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createInitialState() {
  const stores = normalizeStoreList();
  const initialRecipes = normalizeRecipes(seedRecipes, stores);
  return hydrateState(loadState()) || {
    recipes: initialRecipes,
    stores,
    weekPlan: createDefaultWeekPlan(initialRecipes),
    planningDays: 7,
    pantry: ["salt", "black pepper", "olive oil"],
    mealPlanName: "",
    mealPlanDescription: "",
    householdServings: 4,
    ingredientCatalog: buildCatalogFromRecipes(initialRecipes, stores),
    exportStoreSelection: buildDefaultExportSelection(stores),
  };
}

function getCatalogStore(name, ingredientCatalog, availableStores = STORES) {
  const catalog = ingredientCatalog && typeof ingredientCatalog === "object" ? ingredientCatalog : {};
  const mapped = catalog[normalizeName(name)];
  return pickStore(mapped, availableStores);
}

function resolveIngredientStore(name, rawStore, ingredientCatalog, availableStores = STORES) {
  const explicitStore = String(rawStore || "").trim();
  if (explicitStore) {
    return pickStore(explicitStore, availableStores);
  }
  return getCatalogStore(name, ingredientCatalog, availableStores);
}

export function parseIngredients(text, ingredientCatalog, availableStores = STORES) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      if (!line.includes(",")) {
        return parseFreeformIngredient(line, ingredientCatalog, availableStores);
      }

      const [rawName = "", rawQty = "", rawUnit = "", rawStore = ""] = line
        .split(",")
        .map((part) => part.trim());

      const name = normalizeName(rawName);
      if (!name) {
        return null;
      }

      const parsedQty = parseFractionalNumber(rawQty);
      const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
      const unit = normalizeUnit(rawUnit || "each");
      const store = resolveIngredientStore(name, rawStore, ingredientCatalog, availableStores);

      return {
        name,
        qty,
        unit,
        store,
      };
    })
    .filter(Boolean);
}

function cleanRecipeLine(line) {
  return String(line || "")
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s*/, "")
    .trim();
}

function cleanHeadingValue(line) {
  return cleanRecipeLine(line)
    .toLowerCase()
    .replace(/[:\s]/g, "");
}

function findSectionStart(lines, headings) {
  return lines.findIndex((line) => {
    const normalized = cleanHeadingValue(line);
    return headings.some((heading) => normalized === heading || normalized.startsWith(heading));
  });
}

function getLinesInSection(lines, start, end) {
  if (start < 0) {
    return [];
  }
  const upperBound = end > start ? end : lines.length;
  return lines
    .slice(start + 1, upperBound)
    .map(cleanRecipeLine)
    .filter(Boolean);
}

function titleFromSourceUrl(sourceUrl) {
  try {
    const { hostname } = new URL(sourceUrl);
    const base = hostname.replace(/^www\./, "").split(".")[0] || "Imported Recipe";
    return base
      .split(/[-_]/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  } catch {
    return "Imported Recipe";
  }
}

function normalizeImportedInstructions(lines) {
  const steps = [];

  lines.forEach((line) => {
    const cleaned = cleanRecipeLine(line).replace(/^[-*•]\s+/, "");
    if (!cleaned) {
      return;
    }

    const chunks = cleaned
      .split(/(?=\d{1,2}[.)]\s+)/)
      .map((chunk) => chunk.replace(/^\d{1,2}[.)]\s*/, "").trim())
      .filter(Boolean);

    if (chunks.length > 1) {
      steps.push(...chunks);
      return;
    }

    steps.push(cleaned.replace(/^\d{1,2}[.)]\s*/, "").trim());
  });

  return normalizeSteps(steps);
}

function parseServingsFromText(text, fallback = 4) {
  const raw = String(text || "");
  const patterns = [
    /serves?\s+(\d{1,2})/i,
    /yield(?:s)?[:\s]+(\d{1,2})/i,
    /(\d{1,2})\s+servings?/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return normalizeServings(match[1], fallback);
    }
  }

  return fallback;
}

export function extractRecipeFromWebText(text, sourceUrl, ingredientCatalog, availableStores = STORES) {
  const lines = String(text || "")
    .split("\n")
    .map(cleanRecipeLine)
    .filter(Boolean);

  const ingredientsStart = findSectionStart(lines, ["ingredients", "whatyouneed"]);
  const stepsStart = findSectionStart(lines, [
    "instructions",
    "directions",
    "method",
    "preparation",
    "steps",
  ]);
  const firstSectionStart = [ingredientsStart, stepsStart]
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0] ?? lines.length;

  const titleLine = lines.find((line) => /^title\s*:/i.test(line));
  const titleCandidate = titleLine
    ? titleLine.replace(/^title\s*:/i, "").trim()
    : lines[0] || titleFromSourceUrl(sourceUrl);
  const title = titleCandidate || titleFromSourceUrl(sourceUrl);

  const descriptionLine = lines.find((line) => /^description\s*:/i.test(line));
  const descriptionFromMeta = descriptionLine
    ? descriptionLine.replace(/^description\s*:/i, "").trim()
    : "";
  const descriptionFromBody = lines
    .slice(1, firstSectionStart)
    .find((line) => line.length >= 30 && !/^https?:\/\//i.test(line));
  const description = descriptionFromMeta || descriptionFromBody || "";

  const ingredientsLines = getLinesInSection(lines, ingredientsStart, stepsStart);
  const parsedIngredients = parseIngredients(ingredientsLines.join("\n"), ingredientCatalog, availableStores);

  const instructionsLines = getLinesInSection(lines, stepsStart, lines.length);
  const parsedSteps = normalizeImportedInstructions(instructionsLines);

  return {
    title,
    mealType: "dinner",
    description,
    servings: parseServingsFromText(text, 4),
    ingredients: parsedIngredients,
    steps: parsedSteps,
    sourceUrl: sourceUrl || "",
  };
}

export function upsertCatalogFromIngredients(currentCatalog, ingredients, availableStores = STORES) {
  const nextCatalog = { ...currentCatalog };
  ingredients.forEach((ingredient) => {
    const name = normalizeName(ingredient.name);
    const store = pickStore(ingredient.store, availableStores);
    if (!name || store === "Unassigned") {
      return;
    }
    nextCatalog[name] = store;
  });
  return nextCatalog;
}

function getRecipeScale(recipe, targetServings, householdServings) {
  const recipeServings = normalizeServings(recipe.servings, 4);
  const plannedServings = normalizeServings(targetServings, householdServings);
  return plannedServings / recipeServings;
}

export function groupGroceries(state) {
  const stores = normalizeStoreList(state.stores);
  const pantrySet = new Set(state.pantry.map((item) => normalizeName(item)));
  const grouped = Object.fromEntries(stores.map((store) => [store, []]));
  const merged = new Map();
  const activeDays = DAYS.slice(0, normalizePlanningDays(state.planningDays));

  activeDays.forEach((day, dayIndex) => {
    const dayPlan = state.weekPlan[day] || createDefaultDayPlan(state.recipes, dayIndex);
    if (dayPlan.dayMode !== "planned") {
      return;
    }

    MEAL_SLOTS.forEach((mealSlot) => {
      const mealPlan = dayPlan.meals?.[mealSlot];
      if (!mealPlan || mealPlan.mode !== "recipe" || !mealPlan.recipeId) {
        return;
      }

      const recipe = state.recipes.find((item) => item.id === mealPlan.recipeId);
      if (!recipe) {
        return;
      }

      const dayServingsTarget = mealPlan.servingsOverride == null
        ? state.householdServings
        : mealPlan.servingsOverride;
      const scaleFactor = getRecipeScale(recipe, dayServingsTarget, state.householdServings);

      recipe.ingredients.forEach((ingredient) => {
        const name = normalizeName(ingredient.name);
        if (!name || pantrySet.has(name)) {
          return;
        }

        const unit = normalizeUnit(ingredient.unit || "each");
        const store = ingredient.store !== "Unassigned"
          ? pickStore(ingredient.store, stores)
          : getCatalogStore(name, state.ingredientCatalog, stores);
        const key = `${store}__${name}__${unit}`;
        const baseQty = Number.isFinite(Number(ingredient.qty)) ? Number(ingredient.qty) : 1;
        const qty = baseQty * scaleFactor;

        if (!merged.has(key)) {
          merged.set(key, { name, qty, unit, store });
        } else {
          const prev = merged.get(key);
          prev.qty += qty;
        }
      });
    });
  });

  merged.forEach((item) => {
    grouped[item.store].push(item);
  });

  Object.keys(grouped).forEach((store) => {
    grouped[store] = grouped[store].sort((a, b) => a.name.localeCompare(b.name));
  });

  return grouped;
}

export function buildWeekBalance(state) {
  const activeDays = DAYS.slice(0, normalizePlanningDays(state.planningDays));
  const chosenRecipes = [];
  let leftoversSlots = 0;

  activeDays.forEach((day, dayIndex) => {
    const dayPlan = state.weekPlan[day] || createDefaultDayPlan(state.recipes, dayIndex);
    if (dayPlan.dayMode === "leftovers") {
      leftoversSlots += MEAL_SLOTS.length;
      return;
    }
    if (dayPlan.dayMode !== "planned") {
      return;
    }

    MEAL_SLOTS.forEach((mealSlot) => {
      const mealPlan = dayPlan.meals?.[mealSlot];
      if (!mealPlan) {
        return;
      }
      if (mealPlan.mode === "leftovers") {
        leftoversSlots += 1;
        return;
      }
      if (mealPlan.mode !== "recipe") {
        return;
      }

      const recipe = state.recipes.find((item) => item.id === mealPlan.recipeId);
      if (recipe) {
        chosenRecipes.push(recipe);
      }
    });
  });

  const overrideDays = activeDays.filter((day, dayIndex) => {
    const dayPlan = state.weekPlan[day] || createDefaultDayPlan(state.recipes, dayIndex);
    return dayPlan.dayMode !== "planned";
  }).length;
  const quickMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /\b(15-min|20-min)\b/i.test(tag)),
  ).length;
  const proteinMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /high-protein/i.test(tag)),
  ).length;
  const leftoversRecipeMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /leftovers/i.test(tag)),
  ).length;

  return {
    quickMeals,
    proteinMeals,
    leftoversMeals: leftoversRecipeMeals + leftoversSlots,
    overrideDays,
    plannedMeals: chosenRecipes.length,
    householdServings: state.householdServings,
    planningDays: activeDays.length,
  };
}

export function formatItem(item) {
  return `${formatQty(item.qty)} ${item.unit} ${displayName(item.name)}`.replace(/\s+/g, " ").trim();
}

export function buildStoreExport(store, items) {
  if (!items || items.length === 0) {
    return "";
  }

  const lines = [];
  if (store === "Trader Joe's") {
    lines.push("Trader Joe's In-Store Checklist", "");
    items.forEach((item) => {
      lines.push(`- [ ] ${formatItem(item)}`);
    });
    return lines.join("\n");
  }

  if (store !== "Unassigned") {
    lines.push(`${store} Cart-Ready List`, "");
    items.forEach((item) => {
      lines.push(`- ${formatItem(item)}`);
    });
    return lines.join("\n");
  }

  lines.push("Unassigned Grocery Items", "");
  items.forEach((item) => {
    lines.push(`- ${formatItem(item)}`);
  });
  return lines.join("\n");
}

export function buildStoresExport(grouped, stores) {
  const sections = stores
    .map((store) => buildStoreExport(store, grouped[store] || []))
    .filter(Boolean);
  return sections.join("\n\n");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildPrintChecklistHtml(grouped, stores) {
  const sections = stores
    .map((store) => {
      const items = grouped[store] || [];
      if (items.length === 0) {
        return "";
      }
      const listItems = items
        .map((item) => `<li><span class="box">□</span><span>${escapeHtml(formatItem(item))}</span></li>`)
        .join("");
      return `<section><h2>${escapeHtml(store)}</h2><ul>${listItems}</ul></section>`;
    })
    .filter(Boolean);

  if (sections.length === 0) {
    return "";
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Meal Planner Checklist</title>
    <style>
      body {
        font-family: "Manrope", "Avenir Next", "Trebuchet MS", sans-serif;
        margin: 24px;
        color: #17271f;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      h2 {
        margin: 20px 0 8px;
        font-size: 18px;
        border-bottom: 1px solid #d9d6c9;
        padding-bottom: 4px;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      li {
        display: grid;
        grid-template-columns: 22px 1fr;
        gap: 8px;
        margin: 5px 0;
      }
      .box {
        font-size: 16px;
        line-height: 1.2;
      }
      @media print {
        body {
          margin: 12px;
        }
      }
    </style>
  </head>
  <body>
    <h1>Grocery Checklist</h1>
    ${sections.join("")}
  </body>
</html>`;
}
