const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const STORES = ["Target", "Sprouts", "Aldi", "Trader Joe's", "Unassigned"];
const CATALOG_STORES = ["Target", "Sprouts", "Aldi", "Trader Joe's"];
const STORAGE_KEY = "family-meal-planner-v1";

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

const initialRecipes = normalizeRecipes(seedRecipes);
const state = hydrateState(loadState()) || {
  recipes: initialRecipes,
  weekPlan: createDefaultWeekPlan(initialRecipes),
  pantry: ["salt", "black pepper", "olive oil"],
  householdServings: 4,
  ingredientCatalog: buildCatalogFromRecipes(initialRecipes),
  exportStoreSelection: buildDefaultExportSelection(),
};

let lastGroupedGroceries = {};

const weekGridEl = document.getElementById("week-grid");
const recipeListEl = document.getElementById("recipe-list");
const groceryOutputEl = document.getElementById("grocery-output");
const weekBalanceEl = document.getElementById("week-balance");
const pantryInputEl = document.getElementById("pantry-input");
const recipeFormEl = document.getElementById("recipe-form");
const generateBtnEl = document.getElementById("generate-groceries-btn");
const savePantryBtnEl = document.getElementById("save-pantry-btn");
const householdServingsEl = document.getElementById("household-servings");
const catalogFormEl = document.getElementById("catalog-form");
const catalogStoreEl = document.getElementById("catalog-store");
const catalogListEl = document.getElementById("catalog-list");
const copyAllBtnEl = document.getElementById("copy-all-btn");
const copySelectedBtnEl = document.getElementById("copy-selected-btn");
const printChecklistBtnEl = document.getElementById("print-checklist-btn");
const exportStoreFiltersEl = document.getElementById("export-store-filters");
const copyStatusEl = document.getElementById("copy-status");

init();

function init() {
  populateStoreSelect(catalogStoreEl, "Target");
  renderWeekGrid();
  renderRecipeList();
  renderCatalogList();
  renderWeekBalance();
  pantryInputEl.value = state.pantry.join(", ");
  householdServingsEl.value = state.householdServings;
  recomputeGroceriesAndRender();

  recipeFormEl.addEventListener("submit", handleRecipeSubmit);
  catalogFormEl.addEventListener("submit", handleCatalogSubmit);
  catalogListEl.addEventListener("click", handleCatalogListClick);
  generateBtnEl.addEventListener("click", recomputeGroceriesAndRender);
  savePantryBtnEl.addEventListener("click", handlePantrySave);
  householdServingsEl.addEventListener("change", handleHouseholdServingsChange);
  exportStoreFiltersEl.addEventListener("change", handleStoreFilterChange);
  copyAllBtnEl.addEventListener("click", handleCopyAllStores);
  copySelectedBtnEl.addEventListener("click", handleCopySelectedStores);
  printChecklistBtnEl.addEventListener("click", handlePrintChecklist);
}

function recomputeGroceriesAndRender() {
  lastGroupedGroceries = groupGroceries();
  renderGroceryOutput(lastGroupedGroceries);
  renderExportStoreFilters(lastGroupedGroceries);
}

function renderWeekGrid() {
  weekGridEl.innerHTML = "";
  const sortedRecipes = [...state.recipes].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  DAYS.forEach((day) => {
    const dayPlan = getDayPlan(day);
    const row = document.createElement("div");
    row.className = "day-row";

    const dayName = document.createElement("div");
    dayName.className = "day-name";
    dayName.textContent = day;

    const select = document.createElement("select");
    select.name = day;
    select.dataset.day = day;

    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "No meal selected";
    select.appendChild(noneOption);

    sortedRecipes.forEach((recipe) => {
      const option = document.createElement("option");
      option.value = recipe.id;
      option.textContent = `${recipe.title} (${recipe.servings} servings)`;
      if (dayPlan.recipeId === recipe.id) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener("change", (event) => {
      setDayPlan(day, {
        recipeId: event.target.value || null,
        servingsOverride: getDayPlan(day).servingsOverride,
      });
      renderWeekBalance();
      recomputeGroceriesAndRender();
    });

    const dayServings = document.createElement("div");
    dayServings.className = "day-servings";

    const servingsLabel = document.createElement("label");
    servingsLabel.textContent = "Servings";

    const servingsInput = document.createElement("input");
    servingsInput.type = "number";
    servingsInput.min = "1";
    servingsInput.step = "1";
    servingsInput.placeholder = String(state.householdServings);
    servingsInput.value = dayPlan.servingsOverride == null ? "" : String(dayPlan.servingsOverride);
    servingsInput.setAttribute("aria-label", `${day} servings override`);
    servingsInput.addEventListener("change", (event) => {
      setDayPlan(day, {
        recipeId: getDayPlan(day).recipeId,
        servingsOverride: parseOptionalServings(event.target.value),
      });
      renderWeekBalance();
      recomputeGroceriesAndRender();
      const updated = getDayPlan(day);
      event.target.value = updated.servingsOverride == null ? "" : String(updated.servingsOverride);
    });

    dayServings.appendChild(servingsLabel);
    dayServings.appendChild(servingsInput);

    row.appendChild(dayName);
    row.appendChild(select);
    row.appendChild(dayServings);
    weekGridEl.appendChild(row);
  });
}

function renderRecipeList() {
  recipeListEl.innerHTML = "";
  const sorted = [...state.recipes].sort((a, b) => a.title.localeCompare(b.title));

  sorted.forEach((recipe) => {
    const card = document.createElement("article");
    card.className = "recipe-chip";

    const title = document.createElement("h3");
    title.textContent = recipe.title;

    const servings = document.createElement("p");
    servings.textContent = `Servings: ${recipe.servings}`;

    const tags = document.createElement("p");
    tags.textContent = recipe.tags.length
      ? `Tags: ${recipe.tags.join(", ")}`
      : "Tags: none";

    const ingredients = document.createElement("p");
    ingredients.textContent = `Ingredients: ${recipe.ingredients.length}`;

    card.appendChild(title);
    card.appendChild(servings);
    card.appendChild(tags);
    card.appendChild(ingredients);
    recipeListEl.appendChild(card);
  });
}

function renderCatalogList() {
  catalogListEl.innerHTML = "";
  const entries = Object.entries(state.ingredientCatalog).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "catalog-empty";
    empty.textContent = "No defaults yet. Add ingredient-store mappings above.";
    catalogListEl.appendChild(empty);
    return;
  }

  entries.forEach(([name, store]) => {
    const row = document.createElement("div");
    row.className = "catalog-row";

    const ingredientEl = document.createElement("span");
    ingredientEl.textContent = displayName(name);

    const storeEl = document.createElement("span");
    storeEl.textContent = store;

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-small";
    removeBtn.type = "button";
    removeBtn.dataset.remove = name;
    removeBtn.textContent = "Remove";

    row.appendChild(ingredientEl);
    row.appendChild(storeEl);
    row.appendChild(removeBtn);
    catalogListEl.appendChild(row);
  });
}

function renderExportStoreFilters(grouped) {
  exportStoreFiltersEl.innerHTML = "";

  STORES.forEach((store) => {
    const count = (grouped[store] || []).length;
    const label = document.createElement("label");
    label.className = "store-filter";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.store = store;
    checkbox.checked = Boolean(state.exportStoreSelection[store]);

    const text = document.createElement("span");
    text.textContent = `${store} (${count})`;

    label.appendChild(checkbox);
    label.appendChild(text);
    exportStoreFiltersEl.appendChild(label);
  });
}

function renderWeekBalance() {
  const chosenRecipes = DAYS.map((day) => {
    const recipeId = getDayPlan(day).recipeId;
    return state.recipes.find((recipe) => recipe.id === recipeId);
  }).filter(Boolean);

  const overrideDays = DAYS.filter((day) => getDayPlan(day).servingsOverride != null).length;
  const quickMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /\b(15-min|20-min)\b/i.test(tag)),
  ).length;
  const proteinMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /high-protein/i.test(tag)),
  ).length;
  const leftoversMeals = chosenRecipes.filter((recipe) =>
    recipe.tags.some((tag) => /leftovers/i.test(tag)),
  ).length;

  weekBalanceEl.textContent =
    `Balance: ${quickMeals} quick meals, ${proteinMeals} high-protein meals, ${leftoversMeals} leftovers-friendly meals. Household target: ${state.householdServings} servings. Day overrides: ${overrideDays}.`;
}

function renderGroceryOutput(grouped) {
  groceryOutputEl.innerHTML = "";
  let hasItems = false;

  STORES.forEach((store) => {
    const items = grouped[store] || [];
    if (items.length === 0) {
      return;
    }
    hasItems = true;

    const block = document.createElement("section");
    block.className = "store-block";

    const heading = document.createElement("div");
    heading.className = "store-heading";

    const title = document.createElement("h3");
    title.className = "store-title";
    title.textContent = store;

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn btn-small";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy List";
    copyBtn.addEventListener("click", () => handleCopyStore(store, items));

    heading.appendChild(title);
    heading.appendChild(copyBtn);

    const list = document.createElement("ul");
    list.className = "store-items";

    items.forEach((item) => {
      const li = document.createElement("li");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", `Mark ${displayName(item.name)} as picked up`);
      const text = document.createElement("span");
      text.textContent = formatItem(item);
      li.appendChild(checkbox);
      li.appendChild(text);
      list.appendChild(li);
    });

    block.appendChild(heading);
    if (store === "Trader Joe's") {
      const note = document.createElement("p");
      note.className = "store-note";
      note.textContent = "Trader Joe's export uses checklist format for in-store shopping.";
      block.appendChild(note);
    }
    block.appendChild(list);
    groceryOutputEl.appendChild(block);
  });

  if (!hasItems) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "No groceries yet. Pick recipes for the week and click Generate Groceries.";
    groceryOutputEl.appendChild(hint);
  }
}

function handleRecipeSubmit(event) {
  event.preventDefault();
  const formData = new FormData(recipeFormEl);
  const title = String(formData.get("title") || "").trim();
  const tagsRaw = String(formData.get("tags") || "");
  const ingredientsRaw = String(formData.get("ingredients") || "");
  const servings = normalizeServings(formData.get("servings"), 4);

  const tags = tagsRaw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const parsedIngredients = parseIngredients(ingredientsRaw);
  if (!title || parsedIngredients.length === 0) {
    return;
  }

  state.recipes.push({
    id: id("recipe"),
    title,
    servings,
    tags,
    ingredients: parsedIngredients,
  });

  upsertCatalogFromIngredients(parsedIngredients);
  persistState();
  recipeFormEl.reset();
  document.getElementById("recipe-servings").value = "4";
  renderRecipeList();
  renderWeekGrid();
  renderCatalogList();
  recomputeGroceriesAndRender();
}

function handlePantrySave() {
  const pantryItems = pantryInputEl.value
    .split(",")
    .map((item) => normalizeName(item))
    .filter(Boolean);
  state.pantry = [...new Set(pantryItems)];
  persistState();
  recomputeGroceriesAndRender();
}

function handleHouseholdServingsChange() {
  state.householdServings = normalizeServings(householdServingsEl.value, state.householdServings);
  householdServingsEl.value = state.householdServings;
  persistState();
  renderWeekGrid();
  renderWeekBalance();
  recomputeGroceriesAndRender();
}

function handleCatalogSubmit(event) {
  event.preventDefault();
  const formData = new FormData(catalogFormEl);
  const name = normalizeName(formData.get("name"));
  const store = pickStore(formData.get("store"));
  if (!name || store === "Unassigned") {
    return;
  }

  state.ingredientCatalog[name] = store;
  persistState();
  catalogFormEl.reset();
  populateStoreSelect(catalogStoreEl, "Target");
  renderCatalogList();
  recomputeGroceriesAndRender();
}

function handleCatalogListClick(event) {
  const button = event.target.closest("button[data-remove]");
  if (!button) {
    return;
  }
  const name = button.dataset.remove;
  delete state.ingredientCatalog[name];
  persistState();
  renderCatalogList();
  recomputeGroceriesAndRender();
}

function handleStoreFilterChange(event) {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") {
    return;
  }
  const store = event.target.dataset.store;
  if (!store || !STORES.includes(store)) {
    return;
  }
  state.exportStoreSelection[store] = event.target.checked;
  persistState();
}

async function handleCopyStore(store, items) {
  if (!Array.isArray(items) || items.length === 0) {
    showCopyStatus(`No items found for ${store}.`, "error");
    return;
  }
  const text = buildStoreExport(store, items);
  await copyTextAndReport(text, `Copied ${store} export.`);
}

async function handleCopyAllStores() {
  const text = buildStoresExport(lastGroupedGroceries, STORES);
  if (!text) {
    showCopyStatus("No grocery items available to copy yet.", "error");
    return;
  }
  await copyTextAndReport(text, "Copied all store exports.");
}

async function handleCopySelectedStores() {
  const selectedStores = getSelectedStores();
  if (selectedStores.length === 0) {
    showCopyStatus("Select at least one store to copy.", "error");
    return;
  }
  const text = buildStoresExport(lastGroupedGroceries, selectedStores);
  if (!text) {
    showCopyStatus("No grocery items available for selected stores.", "error");
    return;
  }
  await copyTextAndReport(text, "Copied selected store exports.");
}

function handlePrintChecklist() {
  const selectedStores = getSelectedStores();
  if (selectedStores.length === 0) {
    showCopyStatus("Select at least one store to print.", "error");
    return;
  }
  const html = buildPrintChecklistHtml(lastGroupedGroceries, selectedStores);
  if (!html) {
    showCopyStatus("No grocery items available for selected stores.", "error");
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showCopyStatus("Popup blocked. Allow popups to print checklist.", "error");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  showCopyStatus("Opened print checklist for selected stores.", "success");
}

async function copyTextAndReport(text, successMessage) {
  try {
    await copyTextToClipboard(text);
    showCopyStatus(successMessage, "success");
  } catch (error) {
    showCopyStatus("Copy failed in this browser. You can still select text manually.", "error");
  }
}

function parseIngredients(text) {
  const lines = text
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
      const store = resolveIngredientStore(name, rawStore);

      return {
        name,
        qty,
        unit,
        store,
      };
    })
    .filter(Boolean);
}

function groupGroceries() {
  const pantrySet = new Set(state.pantry.map((item) => normalizeName(item)));
  const grouped = Object.fromEntries(STORES.map((store) => [store, []]));
  const merged = new Map();

  DAYS.forEach((day) => {
    const dayPlan = getDayPlan(day);
    const recipe = state.recipes.find((item) => item.id === dayPlan.recipeId);
    if (!recipe) {
      return;
    }

    const dayServingsTarget = dayPlan.servingsOverride == null
      ? state.householdServings
      : dayPlan.servingsOverride;
    const scaleFactor = getRecipeScale(recipe, dayServingsTarget);

    recipe.ingredients.forEach((ingredient) => {
      const name = normalizeName(ingredient.name);
      if (!name || pantrySet.has(name)) {
        return;
      }

      const unit = normalizeUnit(ingredient.unit || "each");
      const store = ingredient.store !== "Unassigned"
        ? pickStore(ingredient.store)
        : getCatalogStore(name);
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

function getRecipeScale(recipe, targetServings) {
  const recipeServings = normalizeServings(recipe.servings, 4);
  const plannedServings = normalizeServings(targetServings, state.householdServings);
  return plannedServings / recipeServings;
}

function buildStoreExport(store, items) {
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

function buildStoresExport(grouped, stores) {
  const sections = stores
    .map((store) => buildStoreExport(store, grouped[store] || []))
    .filter(Boolean);
  return sections.join("\n\n");
}

function buildPrintChecklistHtml(grouped, stores) {
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
        font-family: "Avenir Next", "Trebuchet MS", sans-serif;
        margin: 24px;
        color: #18230f;
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

function formatItem(item) {
  return `${formatQty(item.qty)} ${item.unit} ${displayName(item.name)}`.replace(/\s+/g, " ").trim();
}

function getSelectedStores() {
  return STORES.filter((store) => Boolean(state.exportStoreSelection[store]));
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);
  if (!copied) {
    throw new Error("copy failed");
  }
}

function showCopyStatus(message, status = "success") {
  copyStatusEl.className = `copy-status ${status}`;
  copyStatusEl.textContent = message;
}

function populateStoreSelect(selectEl, selectedStore = "Target") {
  selectEl.innerHTML = "";
  CATALOG_STORES.forEach((store) => {
    const option = document.createElement("option");
    option.value = store;
    option.textContent = store;
    if (store === selectedStore) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  });
}

function resolveIngredientStore(name, rawStore) {
  const explicitStore = String(rawStore || "").trim();
  if (explicitStore) {
    return pickStore(explicitStore);
  }
  return getCatalogStore(name);
}

function getCatalogStore(name) {
  const mapped = state.ingredientCatalog[normalizeName(name)];
  return pickStore(mapped);
}

function upsertCatalogFromIngredients(ingredients) {
  ingredients.forEach((ingredient) => {
    const name = normalizeName(ingredient.name);
    const store = pickStore(ingredient.store);
    if (!name || store === "Unassigned") {
      return;
    }
    state.ingredientCatalog[name] = store;
  });
}

function buildCatalogFromRecipes(recipes) {
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

function getDayPlan(day) {
  return state.weekPlan[day] || { recipeId: null, servingsOverride: null };
}

function setDayPlan(day, plan) {
  state.weekPlan[day] = {
    recipeId: plan.recipeId || null,
    servingsOverride: parseOptionalServings(plan.servingsOverride),
  };
  persistState();
}

function createDefaultWeekPlan(recipes) {
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

function buildDefaultExportSelection() {
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

function parseOptionalServings(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = normalizeServings(value, NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeUnit(unit) {
  const normalized = String(unit || "each").trim().toLowerCase();
  return UNIT_MAP[normalized] || normalized || "each";
}

function pickStore(store) {
  const cleaned = String(store || "").trim();
  const matched = STORES.find((candidate) =>
    candidate.toLowerCase() === cleaned.toLowerCase(),
  );
  return matched || "Unassigned";
}

function formatQty(qty) {
  if (!Number.isFinite(qty)) {
    return "";
  }
  const rounded = Math.round(qty * 100) / 100;
  return rounded.toString();
}

function displayName(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeServings(value, fallback = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }
  return Math.round(numeric);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRecipes(recipes) {
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

function hydrateState(rawState) {
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

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}
