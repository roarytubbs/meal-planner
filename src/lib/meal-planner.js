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

export const DEFAULT_STORES = ["Target", "Sprouts", "Aldi", "Trader Joe's"];
export const CATALOG_STORES = DEFAULT_STORES;
export const STORES = [...DEFAULT_STORES, "Unassigned"];
export const STORAGE_KEY = "family-meal-planner-v1";
const MAX_DAY_NOTE_LENGTH = 240;
const MAX_STORE_FIELD_LENGTH = 240;
const MAX_STORE_SOURCE_LENGTH = 64;

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
const MAX_INGREDIENT_TAG_LENGTH = 40;
const UNICODE_FRACTION_MAP = {
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
  "⅐": "1/7",
  "⅑": "1/9",
  "⅒": "1/10",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};
const NON_INGREDIENT_LINE_PATTERNS = [
  /^(add\s+to\s+cart|add\s+all\s+to\s+cart)$/i,
  /^shop(\s+now)?$/i,
  /^sold\s*out$/i,
  /^(select|choose)\s+(size|option|quantity)$/i,
  /^buy\s+now$/i,
  /^quick\s*view$/i,
  /^deselect\s+all$/i,
  /^view\s+(details|product)$/i,
];
const KNOWN_MEASUREMENT_UNITS = new Set([
  "each",
  "ea",
  "cup",
  "cups",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "g",
  "gram",
  "grams",
  "kg",
  "ml",
  "l",
  "liter",
  "liters",
  "can",
  "cans",
  "jar",
  "jars",
  "package",
  "packages",
  "pack",
  "packs",
  "clove",
  "cloves",
  "pinch",
  "pinches",
  "stick",
  "sticks",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "bunch",
  "bunches",
  "head",
  "heads",
  "whole",
  ...Object.keys(UNIT_MAP),
  ...Object.values(UNIT_MAP),
]);

function id(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStoreLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeStoreList(rawStores = []) {
  const stores = [];
  const seen = new Set();

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

function normalizeStoreField(value, maxLength = MAX_STORE_FIELD_LENGTH) {
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

export function normalizeStoreProfile(storeName, profile = {}) {
  const displayName = normalizeStoreLabel(profile.displayName || storeName);
  return {
    displayName: displayName || normalizeStoreLabel(storeName),
    chainName: normalizeStoreField(profile.chainName),
    address: normalizeStoreField(profile.address),
    phone: normalizeStoreField(profile.phone, 64),
    hours: normalizeStoreField(profile.hours),
    websiteUrl: normalizeOptionalHttpUrl(profile.websiteUrl),
    logoUrl: normalizeOptionalHttpUrl(profile.logoUrl),
    googlePlaceId: normalizeStoreField(profile.googlePlaceId, 128),
    metadataSource: normalizeStoreField(profile.metadataSource, MAX_STORE_SOURCE_LENGTH),
    metadataUpdatedAt: normalizeOptionalIsoDate(profile.metadataUpdatedAt),
  };
}

function normalizeStoreProfiles(rawProfiles, stores) {
  const input = rawProfiles && typeof rawProfiles === "object" ? rawProfiles : {};
  const inputByKey = new Map();

  Object.entries(input).forEach(([name, profile]) => {
    const key = normalizeName(name);
    if (!key || inputByKey.has(key)) {
      return;
    }
    inputByKey.set(key, profile);
  });

  return stores.reduce((acc, store) => {
    if (store === "Unassigned") {
      return acc;
    }

    const profile = inputByKey.get(normalizeName(store)) || {};
    acc[store] = normalizeStoreProfile(store, profile);
    return acc;
  }, {});
}

function collectLegacyStores(rawState) {
  const collected = [];

  if (Array.isArray(rawState?.stores)) {
    collected.push(...rawState.stores);
  }

  if (Array.isArray(rawState?.recipes)) {
    rawState.recipes.forEach((recipe) => {
      if (!Array.isArray(recipe?.ingredients)) {
        return;
      }
      recipe.ingredients.forEach((ingredient) => {
        if (ingredient && typeof ingredient === "object") {
          collected.push(ingredient.store);
        }
      });
    });
  }

  if (rawState?.ingredientCatalog && typeof rawState.ingredientCatalog === "object") {
    Object.values(rawState.ingredientCatalog).forEach((entry) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        collected.push(entry.store || entry.preferredStore);
        return;
      }
      collected.push(entry);
    });
  }

  return collected;
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

function normalizeDayNote(value) {
  return String(value || "").trim().slice(0, MAX_DAY_NOTE_LENGTH);
}

function normalizeIngredientTag(value) {
  return String(value || "").trim().slice(0, MAX_INGREDIENT_TAG_LENGTH);
}

function normalizeCatalogEntry(value, availableStores = STORES) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      store: pickStore(value.store || value.preferredStore, availableStores),
      tag: normalizeIngredientTag(value.tag),
    };
  }

  return {
    store: pickStore(value, availableStores),
    tag: "",
  };
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
  const raw = String(value || "")
    .trim()
    .replace(/\u2044/g, "/")
    .replace(/(\d)-(\d+\s*\/\s*\d+)/g, "$1 $2");
  if (!raw) {
    return NaN;
  }

  let normalized = raw;
  Object.entries(UNICODE_FRACTION_MAP).forEach(([unicode, asciiFraction]) => {
    normalized = normalized.replaceAll(unicode, ` ${asciiFraction} `);
  });
  normalized = normalized
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\/\s*/g, "/");

  if (/^\d+\s+\d+\/\d+$/.test(normalized)) {
    const [whole, fraction] = normalized.split(/\s+/);
    const [numerator, denominator] = fraction.split("/").map(Number);
    if (!denominator) {
      return NaN;
    }
    return Number(whole) + numerator / denominator;
  }

  if (/^\d+\/\d+$/.test(normalized)) {
    const [numerator, denominator] = normalized.split("/").map(Number);
    if (!denominator) {
      return NaN;
    }
    return numerator / denominator;
  }

  const numeric = Number(normalized.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : NaN;
}

function isLikelyNonIngredientLine(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }
  return NON_INGREDIENT_LINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeMeasurementToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[(){}[\],.;:]+/g, "");
}

function parseLeadingMeasurementTokens(sourceLine, options = {}) {
  const allowStandaloneUnit = Boolean(options.allowStandaloneUnit);
  const tokens = String(sourceLine || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const qtyTokenOptions = [2, 1];
  for (const qtyTokenLength of qtyTokenOptions) {
    if (tokens.length < qtyTokenLength) {
      continue;
    }

    const qtyToken = tokens.slice(0, qtyTokenLength).join(" ");
    const parsedQty = parseFractionalNumber(qtyToken);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      continue;
    }

    const remainderTokens = tokens.slice(qtyTokenLength);
    if (remainderTokens.length === 0) {
      return {
        qty: parsedQty,
        unit: "each",
        name: "",
      };
    }

    const unitCandidate = normalizeMeasurementToken(remainderTokens[0]);
    if (KNOWN_MEASUREMENT_UNITS.has(unitCandidate) && (allowStandaloneUnit || remainderTokens.length > 1)) {
      return {
        qty: parsedQty,
        unit: normalizeUnit(unitCandidate || "each"),
        name: remainderTokens.slice(1).join(" ").trim(),
      };
    }

    return {
      qty: parsedQty,
      unit: "each",
      name: remainderTokens.join(" "),
    };
  }

  return null;
}

function stripLeadingParenthesizedMeasurement(value) {
  let remaining = String(value || "").trim();
  while (remaining.startsWith("(")) {
    const match = remaining.match(/^\(\s*([^)]+?)\s*\)\s*(.+)$/);
    if (!match) {
      break;
    }
    const [, candidateMeasurement, candidateRemainder] = match;
    if (!parseLeadingMeasurementTokens(candidateMeasurement)) {
      break;
    }
    remaining = candidateRemainder.trim();
  }
  return remaining;
}

function parseLeadingMeasurement(line) {
  const cleaned = String(line || "").trim();
  if (!cleaned) {
    return null;
  }

  const parenthesizedMatch = cleaned.match(/^\(\s*([^)]+?)\s*\)\s*(.+)$/);
  if (parenthesizedMatch) {
    const [, parenthesizedTokens, remainder] = parenthesizedMatch;
    const parsedParenthesized = parseLeadingMeasurementTokens(parenthesizedTokens, {
      allowStandaloneUnit: true,
    });
    if (parsedParenthesized) {
      return {
        qty: parsedParenthesized.qty,
        unit: parsedParenthesized.unit,
        name: stripLeadingParenthesizedMeasurement(remainder),
      };
    }
  }

  const parsed = parseLeadingMeasurementTokens(cleaned);
  if (!parsed) {
    return null;
  }

  return {
    qty: parsed.qty,
    unit: parsed.unit,
    name: stripLeadingParenthesizedMeasurement(parsed.name),
  };
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

function isMeaningfulRecipeText(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }
  if (normalized.length < 3) {
    return false;
  }
  if (/^[-_=~*•|]+$/.test(normalized)) {
    return false;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return false;
  }
  if (/^!\[[^\]]*]\([^)]+\)$/.test(normalized)) {
    return false;
  }
  if (/^(image|photo)\b/i.test(normalized)) {
    return false;
  }
  if (/^\[[^\]]+]\(https?:\/\/[^)]+\)$/.test(normalized)) {
    return false;
  }
  if (/^(ingredients?|instructions?|directions?|steps?|method|preparation)$/i.test(normalized)) {
    return false;
  }
  if (isLikelyNonIngredientLine(normalized)) {
    return false;
  }
  return /[a-zA-Z]/.test(normalized);
}

function parseFreeformIngredient(line, ingredientCatalog, availableStores = STORES) {
  const cleaned = String(line || "")
    .trim()
    .replace(/^[-*•]\s+/, "");
  if (!cleaned || !isMeaningfulRecipeText(cleaned)) {
    return null;
  }

  const leadingMeasurement = parseLeadingMeasurement(cleaned);
  if (leadingMeasurement) {
    if (
      leadingMeasurement.unit === "each"
      && KNOWN_MEASUREMENT_UNITS.has(normalizeMeasurementToken(leadingMeasurement.name))
    ) {
      return null;
    }
    const name = normalizeName(leadingMeasurement.name);
    if (!name) {
      return null;
    }
    return {
      name,
      qty: leadingMeasurement.qty,
      unit: normalizeUnit(leadingMeasurement.unit || "each"),
      store: resolveIngredientStore(name, "", ingredientCatalog, availableStores),
    };
  }

  const name = normalizeName(stripLeadingParenthesizedMeasurement(cleaned));
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
      const previous = normalizeCatalogEntry(catalog[name], availableStores);
      catalog[name] = {
        store,
        tag: previous.tag,
      };
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
    notes: "",
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
    notes: normalizeDayNote(rawDay.notes || rawDay.note),
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

  const stores = normalizeStoreList(collectLegacyStores(rawState));
  if (!Array.isArray(rawState.recipes)) {
    return null;
  }
  const recipes = normalizeRecipes(rawState.recipes, stores);
  if (rawState.recipes.length > 0 && recipes.length === 0) {
    return null;
  }

  const pantry = Array.isArray(rawState.pantry)
    ? [...new Set(rawState.pantry.map((item) => normalizeName(item)).filter(Boolean))]
    : [];
  const householdServings = normalizeServings(rawState.householdServings, 4);
  const storeProfiles = normalizeStoreProfiles(rawState.storeProfiles, stores);

  const catalogInput = rawState.ingredientCatalog && typeof rawState.ingredientCatalog === "object"
    ? rawState.ingredientCatalog
    : {};
  const ingredientCatalog = {};

  Object.entries(catalogInput).forEach(([name, value]) => {
    const normalizedName = normalizeName(name);
    const normalizedEntry = normalizeCatalogEntry(value, stores);
    if (!normalizedName) {
      return;
    }
    ingredientCatalog[normalizedName] = normalizedEntry;
  });

  const fallbackCatalog = buildCatalogFromRecipes(recipes, stores);
  Object.keys(fallbackCatalog).forEach((name) => {
    if (!ingredientCatalog[name]) {
      ingredientCatalog[name] = fallbackCatalog[name];
      return;
    }

    const existing = normalizeCatalogEntry(ingredientCatalog[name], stores);
    const fallback = normalizeCatalogEntry(fallbackCatalog[name], stores);
    ingredientCatalog[name] = {
      store: existing.store === "Unassigned" ? fallback.store : existing.store,
      tag: existing.tag,
    };
  });

  return {
    recipes,
    stores,
    storeProfiles,
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
  const stores = normalizeStoreList(DEFAULT_STORES);
  const initialRecipes = normalizeRecipes(seedRecipes, stores);
  return hydrateState(loadState()) || {
    recipes: initialRecipes,
    stores,
    storeProfiles: normalizeStoreProfiles({}, stores),
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
  const mapped = normalizeCatalogEntry(catalog[normalizeName(name)], availableStores);
  return mapped.store;
}

function resolveIngredientStore(name, rawStore, ingredientCatalog, availableStores = STORES) {
  const explicitStore = String(rawStore || "").trim();
  if (explicitStore) {
    return pickStore(explicitStore, availableStores);
  }
  return getCatalogStore(name, ingredientCatalog, availableStores);
}

export function parseIngredients(text, ingredientCatalog, availableStores = STORES) {
  return parseIngredientsWithDiagnostics(text, ingredientCatalog, availableStores).ingredients;
}

function toIngredientLines(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.replace(/<[^>]+>/g, " "))
    .map((line) => decodeHtmlEntities(line))
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCsvIngredient(line, ingredientCatalog, availableStores) {
  const [rawName = "", rawQty = "", rawUnit = "", rawStore = ""] = line
    .split(",")
    .map((part) => decodeHtmlEntities(part).trim());

  if (!isMeaningfulRecipeText(rawName) || isLikelyNonIngredientLine(rawName)) {
    return null;
  }

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
}

function parseIngredientLine(line, ingredientCatalog, availableStores) {
  if (!line.includes(",")) {
    return parseFreeformIngredient(line, ingredientCatalog, availableStores);
  }
  return parseCsvIngredient(line, ingredientCatalog, availableStores);
}

export function parseIngredientsWithDiagnostics(text, ingredientCatalog, availableStores = STORES) {
  const lines = toIngredientLines(text);
  const ingredients = [];
  const skippedLines = [];

  lines.forEach((line) => {
    const parsed = parseIngredientLine(line, ingredientCatalog, availableStores);
    if (parsed) {
      ingredients.push(parsed);
      return;
    }
    skippedLines.push(line);
  });

  return { ingredients, skippedLines };
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

function findSectionEnd(lines, start, headings) {
  if (start < 0 || !Array.isArray(lines) || lines.length === 0) {
    return Array.isArray(lines) ? lines.length : 0;
  }

  for (let index = start + 1; index < lines.length; index += 1) {
    const normalized = cleanHeadingValue(lines[index]);
    const isHeading = headings.some((heading) =>
      normalized === heading || normalized.startsWith(heading),
    );
    if (isHeading) {
      return index;
    }
  }

  return lines.length;
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
    if (!cleaned || !isMeaningfulRecipeText(cleaned)) {
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

  return normalizeSteps(steps).filter((step) => isMeaningfulRecipeText(step));
}

function parseServingsFromText(text, fallback = 4) {
  const raw = String(text || "");
  const patterns = [
    /serves?\s+(\d{1,2})/i,
    /yield(?:s)?[:\s]+(\d{1,2})/i,
    /(\d{1,2})\s+servings?/i,
    /recipe\s*yield[:\s]+(\d{1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return normalizeServings(match[1], fallback);
    }
  }

  return fallback;
}

function decodeHtmlEntities(value) {
  let decoded = String(value || "");
  for (let i = 0; i < 2; i += 1) {
    decoded = decoded
      .replaceAll("&amp;", "&")
      .replaceAll("&nbsp;", " ")
      .replaceAll("&#160;", " ")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", "\"")
      .replaceAll("&#39;", "'");
  }
  return decoded;
}

function stripHtmlForSections(text) {
  const raw = String(text || "");
  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return raw;
  }

  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/ul|\/ol|\/tr|\/td|\/th|\/blockquote|\/pre)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/?(h[1-6]|p|div|section|article|ul|ol|table|tbody|thead|tfoot|tr|td|th|blockquote|pre)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function splitRecipeLines(text) {
  return stripHtmlForSections(text)
    .split("\n")
    .map((line) => decodeHtmlEntities(line))
    .map((line) => line.replace(/\s+/g, " "))
    .map(cleanRecipeLine)
    .filter(Boolean);
}

function parseJsonSafely(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function typeIncludesRecipe(typeValue) {
  if (Array.isArray(typeValue)) {
    return typeValue.some((value) => typeIncludesRecipe(value));
  }
  return typeof typeValue === "string" && normalizeName(typeValue) === "recipe";
}

function flattenJsonLdNodes(node, bucket) {
  if (!node) {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => flattenJsonLdNodes(item, bucket));
    return;
  }
  if (typeof node !== "object") {
    return;
  }

  if (typeIncludesRecipe(node["@type"])) {
    bucket.push(node);
  }

  if (Array.isArray(node["@graph"])) {
    flattenJsonLdNodes(node["@graph"], bucket);
  }

  Object.values(node).forEach((value) => {
    if (value && typeof value === "object") {
      flattenJsonLdNodes(value, bucket);
    }
  });
}

function toInstructionLines(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => toInstructionLines(item));
  }

  if (typeof value === "string") {
    return [decodeHtmlEntities(value)];
  }

  if (typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value.itemListElement)) {
    return toInstructionLines(value.itemListElement);
  }

  if (typeof value.text === "string" && value.text.trim()) {
    return [decodeHtmlEntities(value.text)];
  }

  if (typeof value.name === "string" && value.name.trim()) {
    return [decodeHtmlEntities(value.name)];
  }

  return [];
}

function buildRecipeFromSections(
  rawText,
  lines,
  sourceUrl,
  ingredientCatalog,
  availableStores,
  sectionConfig = {},
) {
  const ingredientHeadings = sectionConfig.ingredientHeadings || ["ingredients", "whatyouneed"];
  const stepHeadings = sectionConfig.stepHeadings || [
    "instructions",
    "directions",
    "method",
    "preparation",
    "steps",
  ];
  const stepStopHeadings = sectionConfig.stepStopHeadings || [
    "nutrition",
    "notes",
    "notestips",
    "tips",
    "video",
    "videos",
    "related",
    "relatedrecipes",
    "recommended",
    "shop",
    "comments",
    "comment",
    "tags",
    "keywords",
    "equipment",
  ];

  const ingredientsStart = findSectionStart(lines, ingredientHeadings);
  const stepsStart = findSectionStart(lines, stepHeadings);
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

  const stepsEnd = findSectionEnd(lines, stepsStart, stepStopHeadings);
  const instructionsLines = getLinesInSection(lines, stepsStart, stepsEnd);
  const parsedSteps = normalizeImportedInstructions(instructionsLines);

  return {
    title,
    mealType: "dinner",
    description,
    servings: parseServingsFromText(rawText, 4),
    ingredients: parsedIngredients,
    steps: parsedSteps,
    sourceUrl: sourceUrl || "",
  };
}

function recipeScore(recipe) {
  if (!recipe) {
    return 0;
  }
  const titleScore = recipe.title ? 1 : 0;
  const ingredientsScore = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0;
  const stepsScore = Array.isArray(recipe.steps) ? recipe.steps.length : 0;
  return titleScore + ingredientsScore + stepsScore;
}

function isUsableImportedRecipe(recipe) {
  return recipeScore(recipe) >= 3
    && Array.isArray(recipe.ingredients)
    && recipe.ingredients.length > 0
    && Array.isArray(recipe.steps)
    && recipe.steps.length > 0;
}

function extractRecipeFromJsonLd(text, sourceUrl, ingredientCatalog, availableStores) {
  const rawText = String(text || "");
  const scriptPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const jsonPayloads = [];
  let match = scriptPattern.exec(rawText);

  while (match) {
    const cleaned = String(match[1] || "")
      .replace(/^<!--/, "")
      .replace(/-->$/, "")
      .trim();
    if (cleaned) {
      jsonPayloads.push(cleaned);
    }
    match = scriptPattern.exec(rawText);
  }

  if (jsonPayloads.length === 0 && /"@type"\s*:\s*"Recipe"/i.test(rawText)) {
    jsonPayloads.push(rawText.trim());
  }

  const candidates = [];

  jsonPayloads.forEach((payload) => {
    const parsed = parseJsonSafely(payload);
    if (!parsed) {
      return;
    }
    flattenJsonLdNodes(parsed, candidates);
  });

  if (candidates.length === 0) {
    return null;
  }

  const bestCandidate = candidates
    .map((candidate) => {
      const ingredientLines = Array.isArray(candidate.recipeIngredient)
        ? candidate.recipeIngredient.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      const instructions = toInstructionLines(candidate.recipeInstructions || candidate.instructions);
      const score = ingredientLines.length + instructions.length;
      return { candidate, ingredientLines, instructions, score };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!bestCandidate) {
    return null;
  }

  const candidateTitle = decodeHtmlEntities(
    String(bestCandidate.candidate.name || bestCandidate.candidate.headline || "").trim(),
  );
  const description = decodeHtmlEntities(
    String(bestCandidate.candidate.description || "").trim(),
  );
  const servingsText = Array.isArray(bestCandidate.candidate.recipeYield)
    ? bestCandidate.candidate.recipeYield.join(" ")
    : String(bestCandidate.candidate.recipeYield || "");

  return {
    title: candidateTitle || titleFromSourceUrl(sourceUrl),
    mealType: "dinner",
    description,
    servings: parseServingsFromText(`${servingsText} ${text}`, 4),
    ingredients: parseIngredients(
      bestCandidate.ingredientLines.join("\n"),
      ingredientCatalog,
      availableStores,
    ),
    steps: normalizeImportedInstructions(bestCandidate.instructions),
    sourceUrl: sourceUrl || "",
  };
}

const DOMAIN_IMPORT_ADAPTERS = [
  {
    domains: ["allrecipes.com"],
    ingredientHeadings: ["ingredients"],
    stepHeadings: ["directions", "instructions", "steps"],
  },
  {
    domains: ["foodnetwork.com"],
    ingredientHeadings: ["ingredients", "deselectall"],
    stepHeadings: ["directions", "instructions", "preparation", "method"],
  },
  {
    domains: ["nytimes.com"],
    ingredientHeadings: ["ingredients"],
    stepHeadings: ["preparation", "method", "instructions", "steps"],
  },
];

function extractRecipeFromDomainAdapter(text, sourceUrl, ingredientCatalog, availableStores) {
  let hostname = "";
  try {
    hostname = new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }

  const adapter = DOMAIN_IMPORT_ADAPTERS.find((item) =>
    item.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)),
  );
  if (!adapter) {
    return null;
  }

  const lines = splitRecipeLines(text);
  return buildRecipeFromSections(text, lines, sourceUrl, ingredientCatalog, availableStores, {
    ingredientHeadings: adapter.ingredientHeadings,
    stepHeadings: adapter.stepHeadings,
  });
}

function completeImportedRecipe(baseRecipe, fallbacks, sourceUrl) {
  const base = baseRecipe && typeof baseRecipe === "object" ? baseRecipe : {};
  const fallbackList = Array.isArray(fallbacks) ? fallbacks.filter(Boolean) : [];
  const withIngredients = [base, ...fallbackList].find(
    (item) => Array.isArray(item.ingredients) && item.ingredients.length > 0,
  );
  const withSteps = [base, ...fallbackList].find(
    (item) => Array.isArray(item.steps) && item.steps.length > 0,
  );
  const withTitle = [base, ...fallbackList].find((item) => String(item.title || "").trim());
  const withDescription = [base, ...fallbackList].find((item) => String(item.description || "").trim());

  return {
    title: String(withTitle?.title || "").trim() || titleFromSourceUrl(sourceUrl),
    mealType: "dinner",
    description: String(withDescription?.description || "").trim(),
    servings: normalizeServings(base.servings ?? withIngredients?.servings ?? withSteps?.servings, 4),
    ingredients: Array.isArray(withIngredients?.ingredients) ? withIngredients.ingredients : [],
    steps: Array.isArray(withSteps?.steps) ? withSteps.steps : [],
    sourceUrl: sourceUrl || "",
  };
}

export function extractRecipeFromWebText(text, sourceUrl, ingredientCatalog, availableStores = STORES) {
  const lines = splitRecipeLines(text);
  const fromJsonLd = extractRecipeFromJsonLd(text, sourceUrl, ingredientCatalog, availableStores);
  if (isUsableImportedRecipe(fromJsonLd)) {
    return fromJsonLd;
  }

  const fromDomainAdapter = extractRecipeFromDomainAdapter(
    text,
    sourceUrl,
    ingredientCatalog,
    availableStores,
  );
  if (isUsableImportedRecipe(fromDomainAdapter)) {
    return fromDomainAdapter;
  }

  const heuristicRecipe = buildRecipeFromSections(
    text,
    lines,
    sourceUrl,
    ingredientCatalog,
    availableStores,
  );
  const ranked = [fromJsonLd, fromDomainAdapter, heuristicRecipe]
    .filter(Boolean)
    .sort((a, b) => recipeScore(b) - recipeScore(a));
  const best = ranked[0] || heuristicRecipe;
  if (isUsableImportedRecipe(best)) {
    return best;
  }
  return completeImportedRecipe(best, ranked.slice(1), sourceUrl);
}

export function upsertCatalogFromIngredients(currentCatalog, ingredients, availableStores = STORES) {
  const nextCatalog = { ...currentCatalog };
  ingredients.forEach((ingredient) => {
    const name = normalizeName(ingredient.name);
    const store = pickStore(ingredient.store, availableStores);
    if (!name) {
      return;
    }
    const current = normalizeCatalogEntry(nextCatalog[name], availableStores);
    nextCatalog[name] = {
      store: store === "Unassigned" ? current.store : store,
      tag: current.tag,
    };
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
