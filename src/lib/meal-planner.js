export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

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

const seedRecipes = [
  {
    id: id("recipe"),
    title: "Sheet Pan Chicken + Veg",
    servings: 4,
    tags: ["high-protein", "45-min", "leftovers"],
    ingredients: [
      { name: "Chicken breast", qty: 1.5, unit: "lb", store: "Sprouts" },
      { name: "Broccoli", qty: 2, unit: "head", store: "Aldi" },
      { name: "Sweet potato", qty: 3, unit: "each", store: "Aldi" },
      { name: "Olive oil", qty: 2, unit: "tbsp", store: "Target" },
    ],
  },
  {
    id: id("recipe"),
    title: "Turkey Taco Bowls",
    servings: 4,
    tags: ["30-min", "high-protein", "kid-friendly"],
    ingredients: [
      { name: "Ground turkey", qty: 1.25, unit: "lb", store: "Sprouts" },
      { name: "Jasmine rice", qty: 2, unit: "cup", store: "Target" },
      { name: "Black beans", qty: 1, unit: "can", store: "Aldi" },
      { name: "Salsa", qty: 1, unit: "jar", store: "Target" },
    ],
  },
  {
    id: id("recipe"),
    title: "Pesto Pasta + Salmon",
    servings: 4,
    tags: ["35-min", "omega-3"],
    ingredients: [
      { name: "Salmon fillet", qty: 1.25, unit: "lb", store: "Trader Joe's" },
      { name: "Pasta", qty: 16, unit: "oz", store: "Aldi" },
      { name: "Pesto", qty: 1, unit: "jar", store: "Trader Joe's" },
      { name: "Parmesan", qty: 4, unit: "oz", store: "Target" },
    ],
  },
  {
    id: id("recipe"),
    title: "Greek Chicken Wraps",
    servings: 4,
    tags: ["20-min", "high-protein"],
    ingredients: [
      { name: "Rotisserie chicken", qty: 1, unit: "each", store: "Target" },
      { name: "Greek yogurt", qty: 24, unit: "oz", store: "Target" },
      { name: "Cucumber", qty: 1, unit: "each", store: "Sprouts" },
      { name: "Whole wheat wraps", qty: 1, unit: "pack", store: "Aldi" },
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

export function pickStore(store) {
  const cleaned = String(store || "").trim();
  const matched = STORES.find((candidate) =>
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

export function normalizeRecipes(recipes) {
  if (!Array.isArray(recipes)) {
    return [];
  }

  return recipes
    .map((recipe) => {
      const title = String(recipe.title || "").trim();
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
            store: pickStore(ingredient.store),
          };
        })
        .filter(Boolean);

      if (!title || ingredients.length === 0) {
        return null;
      }

      return {
        id: recipe.id || id("recipe"),
        title,
        servings: normalizeServings(recipe.servings, 4),
        tags: Array.isArray(recipe.tags)
          ? recipe.tags.map((tag) => String(tag).trim()).filter(Boolean)
          : [],
        ingredients,
      };
    })
    .filter(Boolean);
}

export function buildCatalogFromRecipes(recipes) {
  const catalog = {};
  recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      const name = normalizeName(ingredient.name);
      const store = pickStore(ingredient.store);
      if (!name || store === "Unassigned") {
        return;
      }
      catalog[name] = store;
    });
  });
  return catalog;
}

export function createDefaultWeekPlan(recipes) {
  return DAYS.reduce((acc, day, idx) => {
    acc[day] = {
      recipeId: recipes[idx % recipes.length]?.id || null,
      servingsOverride: null,
    };
    return acc;
  }, {});
}

function normalizeWeekPlan(rawWeekPlan, recipes) {
  const fallback = createDefaultWeekPlan(recipes);
  const safePlan = rawWeekPlan && typeof rawWeekPlan === "object" ? rawWeekPlan : {};

  DAYS.forEach((day) => {
    const rawDay = safePlan[day];
    if (typeof rawDay === "string") {
      fallback[day] = {
        recipeId: rawDay || null,
        servingsOverride: null,
      };
      return;
    }
    if (rawDay && typeof rawDay === "object") {
      fallback[day] = {
        recipeId: String(rawDay.recipeId || "").trim() || null,
        servingsOverride: parseOptionalServings(rawDay.servingsOverride),
      };
    }
  });

  return fallback;
}

export function buildDefaultExportSelection() {
  return Object.fromEntries(STORES.map((store) => [store, true]));
}

function normalizeExportStoreSelection(rawSelection) {
  const defaults = buildDefaultExportSelection();
  const selection = rawSelection && typeof rawSelection === "object" ? rawSelection : {};

  STORES.forEach((store) => {
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

  const recipes = normalizeRecipes(rawState.recipes);
  if (recipes.length === 0) {
    return null;
  }

  const pantry = Array.isArray(rawState.pantry)
    ? [...new Set(rawState.pantry.map((item) => normalizeName(item)).filter(Boolean))]
    : [];
  const householdServings = normalizeServings(rawState.householdServings, 4);
  const weekPlan = normalizeWeekPlan(rawState.weekPlan, recipes);

  const catalogInput = rawState.ingredientCatalog && typeof rawState.ingredientCatalog === "object"
    ? rawState.ingredientCatalog
    : {};
  const ingredientCatalog = {};

  Object.entries(catalogInput).forEach(([name, store]) => {
    const normalizedName = normalizeName(name);
    const normalizedStore = pickStore(store);
    if (!normalizedName || normalizedStore === "Unassigned") {
      return;
    }
    ingredientCatalog[normalizedName] = normalizedStore;
  });

  const fallbackCatalog = buildCatalogFromRecipes(recipes);
  Object.keys(fallbackCatalog).forEach((name) => {
    if (!ingredientCatalog[name]) {
      ingredientCatalog[name] = fallbackCatalog[name];
    }
  });

  return {
    recipes,
    pantry,
    householdServings,
    ingredientCatalog,
    weekPlan,
    exportStoreSelection: normalizeExportStoreSelection(rawState.exportStoreSelection),
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
  const initialRecipes = normalizeRecipes(seedRecipes);
  return hydrateState(loadState()) || {
    recipes: initialRecipes,
    weekPlan: createDefaultWeekPlan(initialRecipes),
    pantry: ["salt", "black pepper", "olive oil"],
    householdServings: 4,
    ingredientCatalog: buildCatalogFromRecipes(initialRecipes),
    exportStoreSelection: buildDefaultExportSelection(),
  };
}

function getCatalogStore(name, ingredientCatalog) {
  const mapped = ingredientCatalog[normalizeName(name)];
  return pickStore(mapped);
}

function resolveIngredientStore(name, rawStore, ingredientCatalog) {
  const explicitStore = String(rawStore || "").trim();
  if (explicitStore) {
    return pickStore(explicitStore);
  }
  return getCatalogStore(name, ingredientCatalog);
}

export function parseIngredients(text, ingredientCatalog) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const [rawName = "", rawQty = "", rawUnit = "", rawStore = ""] = line
        .split(",")
        .map((part) => part.trim());

      const name = normalizeName(rawName);
      if (!name) {
        return null;
      }

      const parsedQty = Number(rawQty);
      const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
      const unit = normalizeUnit(rawUnit || "each");
      const store = resolveIngredientStore(name, rawStore, ingredientCatalog);

      return {
        name,
        qty,
        unit,
        store,
      };
    })
    .filter(Boolean);
}

export function upsertCatalogFromIngredients(currentCatalog, ingredients) {
  const nextCatalog = { ...currentCatalog };
  ingredients.forEach((ingredient) => {
    const name = normalizeName(ingredient.name);
    const store = pickStore(ingredient.store);
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
  const pantrySet = new Set(state.pantry.map((item) => normalizeName(item)));
  const grouped = Object.fromEntries(STORES.map((store) => [store, []]));
  const merged = new Map();

  DAYS.forEach((day) => {
    const dayPlan = state.weekPlan[day] || { recipeId: null, servingsOverride: null };
    const recipe = state.recipes.find((item) => item.id === dayPlan.recipeId);
    if (!recipe) {
      return;
    }

    const dayServingsTarget = dayPlan.servingsOverride == null
      ? state.householdServings
      : dayPlan.servingsOverride;
    const scaleFactor = getRecipeScale(recipe, dayServingsTarget, state.householdServings);

    recipe.ingredients.forEach((ingredient) => {
      const name = normalizeName(ingredient.name);
      if (!name || pantrySet.has(name)) {
        return;
      }

      const unit = normalizeUnit(ingredient.unit || "each");
      const store = ingredient.store !== "Unassigned"
        ? pickStore(ingredient.store)
        : getCatalogStore(name, state.ingredientCatalog);
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

  merged.forEach((item) => {
    grouped[item.store].push(item);
  });

  Object.keys(grouped).forEach((store) => {
    grouped[store] = grouped[store].sort((a, b) => a.name.localeCompare(b.name));
  });

  return grouped;
}

export function buildWeekBalance(state) {
  const chosenRecipes = DAYS.map((day) => {
    const recipeId = state.weekPlan[day]?.recipeId;
    return state.recipes.find((recipe) => recipe.id === recipeId);
  }).filter(Boolean);

  const overrideDays = DAYS.filter((day) => state.weekPlan[day]?.servingsOverride != null).length;
  const quickMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /\b(15-min|20-min)\b/i.test(tag)),
  ).length;
  const proteinMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /high-protein/i.test(tag)),
  ).length;
  const leftoversMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /leftovers/i.test(tag)),
  ).length;

  return {
    quickMeals,
    proteinMeals,
    leftoversMeals,
    overrideDays,
    householdServings: state.householdServings,
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

  if (CATALOG_STORES.includes(store)) {
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
