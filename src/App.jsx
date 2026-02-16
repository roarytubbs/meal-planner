import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  DAYS,
  DAY_MODE_LABELS,
  DAY_MODES,
  MEAL_MODE_LABELS,
  MEAL_MODES,
  MEAL_SLOT_LABELS,
  MEAL_SLOTS,
  STORAGE_KEY,
  buildDefaultExportSelection,
  buildPrintChecklistHtml,
  buildStoreExport,
  buildStoresExport,
  buildWeekBalance,
  createDefaultDayPlan,
  createDefaultWeekPlan,
  createInitialState,
  displayName,
  extractRecipeFromWebText,
  formatItem,
  groupGroceries,
  normalizeName,
  normalizeRecipeMealType,
  normalizeServings,
  normalizeStoreList,
  normalizeSteps,
  parseIngredients,
  parseOptionalServings,
  pickStore,
  upsertCatalogFromIngredients,
} from "@/lib/meal-planner";

const NO_RECIPE = "__none__";
const MENU_HISTORY_KEY = `${STORAGE_KEY}-menu-history-v1`;
const MAX_PREVIOUS_MENUS = 5;
const MAX_MEAL_PLAN_NAME = 80;
const MAX_MEAL_PLAN_DESCRIPTION = 280;
const WORKFLOW_SCREENS = {
  landing: "landing",
  planner: "planner",
  recipes: "recipes",
};

const EMPTY_RECIPE_FORM = {
  title: "",
  mealType: "dinner",
  description: "",
  tags: "",
  servings: "4",
  ingredients: "",
  steps: "",
  sourceUrl: "",
};

function makeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeRecipeForm() {
  return { ...EMPTY_RECIPE_FORM };
}

function makeDaySearchState() {
  return Object.fromEntries(DAYS.map((day) => [day, ""]));
}

function parseTags(text) {
  return String(text || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function ingredientsToText(ingredients) {
  if (!Array.isArray(ingredients)) {
    return "";
  }

  return ingredients
    .map((ingredient) => {
      const name = displayName(ingredient.name);
      const qty = Number.isFinite(Number(ingredient.qty)) ? String(ingredient.qty) : "1";
      const unit = String(ingredient.unit || "each");
      const store = String(ingredient.store || "");
      return store && store !== "Unassigned"
        ? `${name}, ${qty}, ${unit}, ${store}`
        : `${name}, ${qty}, ${unit}`;
    })
    .join("\n");
}

function stepsToText(steps) {
  return Array.isArray(steps) ? steps.join("\n") : "";
}

function recipeToForm(recipe) {
  if (!recipe) {
    return makeRecipeForm();
  }

  return {
    title: recipe.title || "",
    mealType: normalizeRecipeMealType(recipe.mealType, "dinner"),
    description: recipe.description || "",
    tags: Array.isArray(recipe.tags) ? recipe.tags.join(", ") : "",
    servings: String(recipe.servings || 4),
    ingredients: ingredientsToText(recipe.ingredients),
    steps: stepsToText(recipe.steps),
    sourceUrl: recipe.sourceUrl || "",
  };
}

function normalizeRecipeUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
  const candidate = hasProtocol ? value : `https://${value}`;

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

function buildRecipeFromForm(form, ingredientCatalog, availableStores, id) {
  const title = String(form.title || "").trim();
  const mealType = normalizeRecipeMealType(form.mealType, "dinner");
  const description = String(form.description || "").trim();
  const tags = parseTags(form.tags);
  const servings = normalizeServings(form.servings, 4);
  const ingredients = parseIngredients(form.ingredients, ingredientCatalog, availableStores);
  const steps = normalizeSteps(form.steps);
  const sourceUrl = normalizeRecipeUrl(form.sourceUrl || "");

  if (!title) {
    return { error: "Add a recipe name before saving." };
  }

  if (ingredients.length === 0) {
    return { error: "Add at least one valid ingredient line before saving." };
  }

  if (steps.length === 0) {
    return { error: "Add at least one step before saving." };
  }

  return {
    recipe: {
      id: id || makeId("recipe"),
      title,
      mealType,
      description,
      sourceUrl,
      tags,
      servings,
      ingredients,
      steps,
    },
  };
}

function recipeSearchBlob(recipe) {
  return [
    recipe.title,
    recipe.mealType,
    recipe.description,
    recipe.sourceUrl,
    ...(recipe.tags || []),
    ...(recipe.ingredients || []).map((item) => item.name),
    ...(recipe.steps || []),
  ]
    .join(" ")
    .toLowerCase();
}

function normalizePlanName(value) {
  return String(value || "").trim().slice(0, MAX_MEAL_PLAN_NAME);
}

function normalizePlanDescription(value) {
  return String(value || "").trim().slice(0, MAX_MEAL_PLAN_DESCRIPTION);
}

function formatMenuDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function cloneWeekPlan(weekPlan) {
  try {
    return JSON.parse(JSON.stringify(weekPlan || {}));
  } catch {
    return {};
  }
}

function normalizeMenuHistoryEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const createdAt = new Date(entry.createdAt || Date.now()).toISOString();
      const mealPlanName = normalizePlanName(entry.mealPlanName || entry.label);
      const mealPlanDescription = normalizePlanDescription(entry.mealPlanDescription);
      const label = mealPlanName || `Menu ${formatMenuDate(createdAt)}`;
      const planningDays = Math.min(7, Math.max(1, normalizeServings(entry.planningDays, 7)));

      return {
        id: String(entry.id || makeId("menu")),
        label,
        mealPlanName,
        mealPlanDescription,
        createdAt,
        planningDays,
        weekPlan: cloneWeekPlan(entry.weekPlan),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_PREVIOUS_MENUS);
}

function loadMenuHistory() {
  try {
    if (typeof window === "undefined") {
      return [];
    }
    const raw = window.localStorage.getItem(MENU_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return normalizeMenuHistoryEntries(parsed);
  } catch {
    return [];
  }
}

function dayHasMenuContent(dayPlan) {
  if (!dayPlan || typeof dayPlan !== "object") {
    return false;
  }

  if (dayPlan.dayMode && dayPlan.dayMode !== "planned") {
    return true;
  }

  const meals = dayPlan.meals;
  if (meals && typeof meals === "object") {
    return MEAL_SLOTS.some((slot) => {
      const meal = meals[slot];
      return meal?.mode && meal.mode !== "skip";
    });
  }

  return Boolean(dayPlan.recipeId);
}

function hasAnyMenuContent(weekPlan, planningDays) {
  const dayCount = Math.min(7, Math.max(1, normalizeServings(planningDays, 7)));
  return DAYS.slice(0, dayCount).some((day) => dayHasMenuContent(weekPlan?.[day]));
}

function buildMenuSnapshot(state) {
  const createdAt = new Date().toISOString();
  const mealPlanName = normalizePlanName(state.mealPlanName);
  const mealPlanDescription = normalizePlanDescription(state.mealPlanDescription);
  return {
    id: makeId("menu"),
    label: mealPlanName || `Menu ${formatMenuDate(createdAt)}`,
    mealPlanName,
    mealPlanDescription,
    createdAt,
    planningDays: Math.min(7, Math.max(1, normalizeServings(state.planningDays, 7))),
    weekPlan: cloneWeekPlan(state.weekPlan),
  };
}

export default function App() {
  const [state, setState] = useState(() => createInitialState());
  const [menuHistory, setMenuHistory] = useState(() => loadMenuHistory());
  const [workflowScreen, setWorkflowScreen] = useState(WORKFLOW_SCREENS.landing);
  const [plannerStep, setPlannerStep] = useState(1);
  const [showGroceries, setShowGroceries] = useState(false);
  const [showRecipeSplitMenu, setShowRecipeSplitMenu] = useState(false);
  const [recipeComposerMode, setRecipeComposerMode] = useState("manual");
  const [dayRecipeSearch, setDayRecipeSearch] = useState(() => makeDaySearchState());
  const [pantryInput, setPantryInput] = useState("");
  const [copyStatus, setCopyStatus] = useState({
    status: "neutral",
    message: "",
  });
  const [recipeForm, setRecipeForm] = useState(() => makeRecipeForm());
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeSort, setRecipeSort] = useState("title-asc");
  const [recipeMealFilter, setRecipeMealFilter] = useState("all");
  const [recipeTagFilter, setRecipeTagFilter] = useState("");
  const [recipeSourceFilter, setRecipeSourceFilter] = useState("all");
  const [quickPlanDay, setQuickPlanDay] = useState(DAYS[0]);
  const [quickPlanMealSlot, setQuickPlanMealSlot] = useState("dinner");
  const [importUrl, setImportUrl] = useState("");
  const [importDraft, setImportDraft] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [storeNameInput, setStoreNameInput] = useState("");
  const [catalogForm, setCatalogForm] = useState({
    name: "",
    store: "",
  });
  const recipeSplitMenuRef = useRef(null);
  const recipeSplitToggleRef = useRef(null);
  const recipeSplitManualRef = useRef(null);
  const recipeSplitImportRef = useRef(null);
  const recipeListRef = useRef(null);
  const storeWorkflowRef = useRef(null);
  const storeInputRef = useRef(null);

  useEffect(() => {
    setPantryInput(state.pantry.join(", "));
  }, [state.pantry]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    window.localStorage.setItem(MENU_HISTORY_KEY, JSON.stringify(menuHistory));
  }, [menuHistory]);

  useEffect(() => {
    if (!showRecipeSplitMenu) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      const inMenu = recipeSplitMenuRef.current?.contains(target);
      const onToggle = recipeSplitToggleRef.current?.contains(target);
      if (!inMenu && !onToggle) {
        setShowRecipeSplitMenu(false);
      }
    }

    function handleEscape(event) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setShowRecipeSplitMenu(false);
      recipeSplitToggleRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showRecipeSplitMenu]);

  const stores = useMemo(() => normalizeStoreList(state.stores), [state.stores]);
  const assignableStores = useMemo(
    () => stores.filter((store) => store !== "Unassigned"),
    [stores],
  );

  const sortedRecipes = useMemo(
    () => [...state.recipes].sort((a, b) => a.title.localeCompare(b.title)),
    [state.recipes],
  );

  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.trim().toLowerCase();
    const normalizedTagFilter = normalizeName(recipeTagFilter);

    const filtered = state.recipes.filter((recipe) => {
      if (query && !recipeSearchBlob(recipe).includes(query)) {
        return false;
      }

      if (recipeMealFilter !== "all" && normalizeRecipeMealType(recipe.mealType, "dinner") !== recipeMealFilter) {
        return false;
      }

      if (normalizedTagFilter) {
        const hasTag = recipe.tags.some((tag) => normalizeName(tag).includes(normalizedTagFilter));
        if (!hasTag) {
          return false;
        }
      }

      if (recipeSourceFilter === "with-source" && !recipe.sourceUrl) {
        return false;
      }
      if (recipeSourceFilter === "without-source" && recipe.sourceUrl) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      if (recipeSort === "title-desc") {
        return b.title.localeCompare(a.title);
      }
      if (recipeSort === "servings-asc") {
        return a.servings - b.servings || a.title.localeCompare(b.title);
      }
      if (recipeSort === "servings-desc") {
        return b.servings - a.servings || a.title.localeCompare(b.title);
      }
      if (recipeSort === "ingredients-desc") {
        return b.ingredients.length - a.ingredients.length || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title);
    });

    return filtered;
  }, [
    recipeSearch,
    recipeTagFilter,
    recipeMealFilter,
    recipeSourceFilter,
    recipeSort,
    state.recipes,
  ]);

  const planningDays = useMemo(
    () => Math.min(7, Math.max(1, normalizeServings(state.planningDays, 7))),
    [state.planningDays],
  );
  const activeDays = useMemo(() => DAYS.slice(0, planningDays), [planningDays]);
  const groupedGroceries = useMemo(() => groupGroceries(state), [state]);
  const weekBalance = useMemo(() => buildWeekBalance(state), [state]);
  const catalogEntries = useMemo(
    () => Object.entries(state.ingredientCatalog).sort((a, b) => a[0].localeCompare(b[0])),
    [state.ingredientCatalog],
  );
  const selectedStores = useMemo(
    () => stores.filter((store) => Boolean(state.exportStoreSelection[store])),
    [state.exportStoreSelection, stores],
  );

  useEffect(() => {
    const fallbackStore = assignableStores[0] || "Unassigned";
    setCatalogForm((prev) =>
      assignableStores.includes(prev.store) ? prev : { ...prev, store: fallbackStore },
    );
  }, [assignableStores]);

  const filteredRecipesByDay = useMemo(() => {
    return activeDays.reduce((acc, day) => {
      const query = normalizeName(dayRecipeSearch[day]);
      if (!query) {
        acc[day] = sortedRecipes;
        return acc;
      }

      acc[day] = sortedRecipes.filter((recipe) => {
        const titleMatch = normalizeName(recipe.title).includes(query);
        const tagMatch = recipe.tags.some((tag) => normalizeName(tag).includes(query));
        return titleMatch || tagMatch;
      });
      return acc;
    }, {});
  }, [activeDays, dayRecipeSearch, sortedRecipes]);

  useEffect(() => {
    const fallbackDay = activeDays[0] || DAYS[0];
    if (!activeDays.includes(quickPlanDay)) {
      setQuickPlanDay(fallbackDay);
    }
  }, [activeDays, quickPlanDay]);

  function showCopyStatus(message, status = "success") {
    setCopyStatus({ message, status });
  }

  function updateDay(day, updater) {
    setState((prev) => {
      const dayIndex = DAYS.indexOf(day);
      const currentDay = prev.weekPlan[day] || createDefaultDayPlan(prev.recipes, dayIndex);
      return {
        ...prev,
        weekPlan: {
          ...prev.weekPlan,
          [day]: updater(currentDay),
        },
      };
    });
  }

  function updateMeal(day, mealSlot, updater) {
    updateDay(day, (dayPlan) => {
      const currentMeal = dayPlan.meals?.[mealSlot] || {
        mode: "skip",
        recipeId: null,
        servingsOverride: null,
      };
      return {
        ...dayPlan,
        meals: {
          ...dayPlan.meals,
          [mealSlot]: updater(currentMeal),
        },
      };
    });
  }

  function handleStartNewMealPlan() {
    if (hasAnyMenuContent(state.weekPlan, state.planningDays)) {
      const snapshot = buildMenuSnapshot(state);
      setMenuHistory((prev) => normalizeMenuHistoryEntries([snapshot, ...prev]));
    }

    setState((prev) => ({
      ...prev,
      planningDays: 7,
      mealPlanName: "",
      mealPlanDescription: "",
      weekPlan: createDefaultWeekPlan(prev.recipes),
      exportStoreSelection: buildDefaultExportSelection(prev.stores),
    }));
    setDayRecipeSearch(makeDaySearchState());
    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(1);
    setShowGroceries(false);
    setShowRecipeSplitMenu(false);
    showCopyStatus("", "neutral");
  }

  function handleOpenCurrentMenu() {
    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(2);
    setShowGroceries(false);
    setShowRecipeSplitMenu(false);
  }

  function handleOpenPreviousMenu(menuId) {
    const selectedMenu = menuHistory.find((menu) => menu.id === menuId);
    if (!selectedMenu) {
      showCopyStatus("Menu not found.", "error");
      return;
    }

    setState((prev) => ({
      ...prev,
      planningDays: selectedMenu.planningDays,
      mealPlanName: selectedMenu.mealPlanName || "",
      mealPlanDescription: selectedMenu.mealPlanDescription || "",
      weekPlan: DAYS.reduce((acc, day, index) => {
        acc[day] = selectedMenu.weekPlan[day] || createDefaultDayPlan(prev.recipes, index);
        return acc;
      }, {}),
    }));
    setDayRecipeSearch(makeDaySearchState());
    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(2);
    setShowGroceries(false);
    setShowRecipeSplitMenu(false);
    showCopyStatus(`Loaded ${selectedMenu.label}.`, "success");
  }

  function handleCreateRecipeFlow(mode = "manual") {
    setWorkflowScreen(WORKFLOW_SCREENS.recipes);
    setRecipeComposerMode(mode);
    setShowRecipeSplitMenu(false);
    if (mode === "manual") {
      resetRecipeEditor();
    } else {
      setEditingRecipeId(null);
    }
  }

  function handleBackToLanding() {
    setWorkflowScreen(WORKFLOW_SCREENS.landing);
    setShowRecipeSplitMenu(false);
  }

  function handleOpenPlannerWorkflow() {
    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(2);
    setShowRecipeSplitMenu(false);
  }

  function scrollToRef(ref) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function handleOpenRecipeLibrary() {
    setWorkflowScreen(WORKFLOW_SCREENS.recipes);
    scrollToRef(recipeListRef);
  }

  function handleOpenStoreWorkflow() {
    setWorkflowScreen(WORKFLOW_SCREENS.recipes);
    scrollToRef(storeWorkflowRef);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        storeInputRef.current?.focus();
      });
    });
  }

  function focusRecipeSplitOption(index) {
    const options = [recipeSplitManualRef.current, recipeSplitImportRef.current];
    const nextIndex = ((index % options.length) + options.length) % options.length;
    options[nextIndex]?.focus();
  }

  function openRecipeSplitMenu(initialFocusIndex = 0) {
    setShowRecipeSplitMenu(true);
    window.requestAnimationFrame(() => {
      focusRecipeSplitOption(initialFocusIndex);
    });
  }

  function closeRecipeSplitMenu(focusToggle = false) {
    setShowRecipeSplitMenu(false);
    if (focusToggle) {
      recipeSplitToggleRef.current?.focus();
    }
  }

  function handleRecipeSplitToggleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openRecipeSplitMenu(0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      openRecipeSplitMenu(1);
      return;
    }
    if (event.key === "Escape" && showRecipeSplitMenu) {
      event.preventDefault();
      closeRecipeSplitMenu(true);
    }
  }

  function handleRecipeSplitItemKeyDown(event, itemIndex) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRecipeSplitOption(itemIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRecipeSplitOption(itemIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusRecipeSplitOption(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusRecipeSplitOption(1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeRecipeSplitMenu(true);
      return;
    }
    if (event.key === "Tab") {
      closeRecipeSplitMenu(false);
    }
  }

  function setPlanningDays(value) {
    setState((prev) => ({
      ...prev,
      planningDays: Math.min(7, Math.max(1, normalizeServings(value, prev.planningDays))),
    }));
  }

  function setMealPlanName(value) {
    setState((prev) => ({
      ...prev,
      mealPlanName: String(value || "").slice(0, MAX_MEAL_PLAN_NAME),
    }));
  }

  function setMealPlanDescription(value) {
    setState((prev) => ({
      ...prev,
      mealPlanDescription: String(value || "").slice(0, MAX_MEAL_PLAN_DESCRIPTION),
    }));
  }

  function setDayMode(day, mode) {
    const nextMode = DAY_MODES.includes(mode) ? mode : "planned";
    updateDay(day, (dayPlan) => ({
      ...dayPlan,
      dayMode: nextMode,
    }));
  }

  function setMealEnabled(day, mealSlot, enabled) {
    updateMeal(day, mealSlot, (mealPlan) => {
      if (!enabled) {
        return {
          mode: "skip",
          recipeId: null,
          servingsOverride: null,
        };
      }

      if (mealPlan.mode === "skip") {
        return {
          ...mealPlan,
          mode: "recipe",
          recipeId: mealPlan.recipeId || sortedRecipes[0]?.id || null,
        };
      }

      return mealPlan;
    });
  }

  function setMealMode(day, mealSlot, mode) {
    const nextMode = MEAL_MODES.includes(mode) ? mode : "skip";
    updateMeal(day, mealSlot, (mealPlan) => {
      if (nextMode === "recipe") {
        return {
          ...mealPlan,
          mode: "recipe",
          recipeId: mealPlan.recipeId || sortedRecipes[0]?.id || null,
        };
      }

      return {
        ...mealPlan,
        mode: nextMode,
        recipeId: null,
      };
    });
  }

  function setMealRecipe(day, mealSlot, recipeId) {
    updateMeal(day, mealSlot, (mealPlan) => {
      if (recipeId === NO_RECIPE) {
        return {
          ...mealPlan,
          mode: "skip",
          recipeId: null,
        };
      }

      return {
        ...mealPlan,
        mode: "recipe",
        recipeId,
      };
    });
  }

  function setMealServings(day, mealSlot, value) {
    updateMeal(day, mealSlot, (mealPlan) => ({
      ...mealPlan,
      servingsOverride: parseOptionalServings(value),
    }));
  }

  function setDayRecipeSearchValue(day, value) {
    setDayRecipeSearch((prev) => ({
      ...prev,
      [day]: value,
    }));
  }

  function handleHouseholdServings(value) {
    setState((prev) => ({
      ...prev,
      householdServings: normalizeServings(value, prev.householdServings),
    }));
  }

  function resetRecipeEditor() {
    setRecipeForm(makeRecipeForm());
    setEditingRecipeId(null);
  }

  function upsertRecipe(recipe) {
    setState((prev) => {
      const exists = prev.recipes.some((item) => item.id === recipe.id);
      return {
        ...prev,
        recipes: exists
          ? prev.recipes.map((item) => (item.id === recipe.id ? recipe : item))
          : [...prev.recipes, recipe],
        ingredientCatalog: upsertCatalogFromIngredients(
          prev.ingredientCatalog,
          recipe.ingredients,
          prev.stores,
        ),
      };
    });
  }

  function handleRecipeSubmit(event) {
    event.preventDefault();

    const built = buildRecipeFromForm(recipeForm, state.ingredientCatalog, stores, editingRecipeId);
    if (!built.recipe) {
      showCopyStatus(built.error || "Unable to save recipe.", "error");
      return;
    }

    upsertRecipe(built.recipe);
    showCopyStatus(editingRecipeId ? "Recipe updated." : "Recipe saved.", "success");
    resetRecipeEditor();
  }

  function handleRecipeEdit(recipeId) {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) {
      showCopyStatus("Recipe not found.", "error");
      return;
    }

    setEditingRecipeId(recipe.id);
    setRecipeForm(recipeToForm(recipe));
    setRecipeComposerMode("manual");
  }

  function handleRecipeDuplicate(recipeId) {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) {
      showCopyStatus("Recipe not found.", "error");
      return;
    }

    const duplicate = {
      ...recipe,
      id: makeId("recipe"),
      title: `${recipe.title} (Copy)`,
      ingredients: recipe.ingredients.map((item) => ({ ...item })),
      steps: Array.isArray(recipe.steps) ? [...recipe.steps] : [],
    };

    upsertRecipe(duplicate);
    showCopyStatus("Recipe duplicated.", "success");
  }

  function handleRecipeDelete(recipeId) {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) {
      return;
    }

    const confirmed = window.confirm(`Delete recipe "${recipe.title}"?`);
    if (!confirmed) {
      return;
    }

    setState((prev) => {
      const weekPlan = { ...prev.weekPlan };
      DAYS.forEach((day) => {
        const dayPlan = weekPlan[day] || createDefaultDayPlan(prev.recipes, DAYS.indexOf(day));
        const meals = { ...dayPlan.meals };
        MEAL_SLOTS.forEach((mealSlot) => {
          if (meals[mealSlot]?.recipeId === recipeId) {
            meals[mealSlot] = {
              ...meals[mealSlot],
              mode: "skip",
              recipeId: null,
            };
          }
        });

        weekPlan[day] = {
          ...dayPlan,
          meals,
        };
      });

      return {
        ...prev,
        recipes: prev.recipes.filter((item) => item.id !== recipeId),
        weekPlan,
      };
    });

    if (editingRecipeId === recipeId) {
      resetRecipeEditor();
    }

    showCopyStatus("Recipe deleted.", "success");
  }

  function handleAddRecipeToMealPlan(recipeId) {
    const day = activeDays.includes(quickPlanDay) ? quickPlanDay : activeDays[0];
    if (!day) {
      showCopyStatus("Set a valid meal-plan range before adding recipes.", "error");
      return;
    }

    setState((prev) => {
      const dayIndex = DAYS.indexOf(day);
      const currentDay = prev.weekPlan[day] || createDefaultDayPlan(prev.recipes, dayIndex);
      const currentMeal = currentDay.meals?.[quickPlanMealSlot] || {
        mode: "skip",
        recipeId: null,
        servingsOverride: null,
      };

      return {
        ...prev,
        weekPlan: {
          ...prev.weekPlan,
          [day]: {
            ...currentDay,
            dayMode: "planned",
            meals: {
              ...currentDay.meals,
              [quickPlanMealSlot]: {
                ...currentMeal,
                mode: "recipe",
                recipeId,
              },
            },
          },
        },
      };
    });

    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(2);
    setShowGroceries(false);
    showCopyStatus(
      `Added recipe to ${day} ${MEAL_SLOT_LABELS[quickPlanMealSlot].toLowerCase()}.`,
      "success",
    );
  }

  async function handleImportFromUrl(event) {
    event.preventDefault();
    setRecipeComposerMode("import");

    const normalizedUrl = normalizeRecipeUrl(importUrl);
    if (!normalizedUrl) {
      showCopyStatus("Enter a valid recipe URL (http or https).", "error");
      return;
    }

    setIsImporting(true);

    try {
      const proxyUrl = `https://r.jina.ai/${normalizedUrl}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Import failed with status ${response.status}`);
      }

      const sourceText = await response.text();
      const extracted = extractRecipeFromWebText(
        sourceText,
        normalizedUrl,
        state.ingredientCatalog,
        stores,
      );

      const draft = {
        sourceUrl: normalizedUrl,
        title: extracted.title || "",
        mealType: normalizeRecipeMealType(extracted.mealType, "dinner"),
        description: extracted.description || "",
        tags: "",
        servings: String(extracted.servings || 4),
        ingredients: ingredientsToText(extracted.ingredients),
        steps: stepsToText(extracted.steps),
      };

      setImportDraft(draft);

      const qualityWarnings = [];
      if (!draft.title) {
        qualityWarnings.push("title");
      }
      if (!draft.ingredients.trim()) {
        qualityWarnings.push("ingredients");
      }
      if (!draft.steps.trim()) {
        qualityWarnings.push("steps");
      }

      if (qualityWarnings.length > 0) {
        showCopyStatus(
          `Imported with partial fields (${qualityWarnings.join(", ")}). Review and complete before saving.`,
          "error",
        );
      } else {
        showCopyStatus("Imported recipe. Review and approve before saving.", "success");
      }
    } catch {
      showCopyStatus(
        "Unable to import from this URL. You can still paste recipe details manually.",
        "error",
      );
    } finally {
      setIsImporting(false);
    }
  }

  function handleImportDraftChange(field, value) {
    setImportDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function handleImportApprove(event) {
    event.preventDefault();
    if (!importDraft) {
      return;
    }

    const built = buildRecipeFromForm(importDraft, state.ingredientCatalog, stores);
    if (!built.recipe) {
      showCopyStatus(built.error || "Unable to save imported recipe.", "error");
      return;
    }

    upsertRecipe(built.recipe);
    setImportDraft(null);
    setImportUrl("");
    showCopyStatus("Imported recipe saved.", "success");
  }

  function handleImportReset() {
    setImportDraft(null);
  }

  function handleCatalogSubmit(event) {
    event.preventDefault();
    const name = normalizeName(catalogForm.name);
    const store = pickStore(catalogForm.store, stores);
    if (!name || store === "Unassigned") {
      return;
    }

    setState((prev) => ({
      ...prev,
      ingredientCatalog: {
        ...prev.ingredientCatalog,
        [name]: store,
      },
    }));

    setCatalogForm({ name: "", store: assignableStores[0] || "Unassigned" });
  }

  function handleStoreSubmit(event) {
    event.preventDefault();
    const storeName = String(storeNameInput || "").trim().replace(/\s+/g, " ");
    if (!storeName) {
      showCopyStatus("Add a store name before saving.", "error");
      return;
    }
    if (normalizeName(storeName) === "unassigned") {
      showCopyStatus('"Unassigned" is reserved and cannot be added.', "error");
      return;
    }
    const exists = stores.some((store) => normalizeName(store) === normalizeName(storeName));
    if (exists) {
      showCopyStatus("That store already exists.", "error");
      return;
    }

    setState((prev) => {
      const nextStores = normalizeStoreList([...(prev.stores || []), storeName]);
      return {
        ...prev,
        stores: nextStores,
        exportStoreSelection: {
          ...buildDefaultExportSelection(nextStores),
          ...prev.exportStoreSelection,
          [storeName]: true,
        },
      };
    });
    setStoreNameInput("");
    setCatalogForm((prev) => ({ ...prev, store: storeName }));
    showCopyStatus(`Added store "${storeName}".`, "success");
  }

  function handleCatalogRemove(name) {
    setState((prev) => {
      const nextCatalog = { ...prev.ingredientCatalog };
      delete nextCatalog[name];
      return {
        ...prev,
        ingredientCatalog: nextCatalog,
      };
    });
  }

  function handlePantrySave() {
    const pantryItems = pantryInput
      .split(",")
      .map((item) => normalizeName(item))
      .filter(Boolean);

    setState((prev) => ({
      ...prev,
      pantry: [...new Set(pantryItems)],
    }));

    showCopyStatus("Pantry filters updated.", "success");
  }

  function handleStoreFilterChange(store, checked) {
    setState((prev) => ({
      ...prev,
      exportStoreSelection: {
        ...prev.exportStoreSelection,
        [store]: checked,
      },
    }));
  }

  function getSelectedStores() {
    return stores.filter((store) => Boolean(state.exportStoreSelection[store]));
  }

  function handleBuildGroceryList() {
    const stores = getSelectedStores();
    if (stores.length === 0) {
      showCopyStatus("Select at least one pickup store before building your list.", "error");
      return;
    }
    setShowGroceries(true);
    setPlannerStep(3);
    showCopyStatus(`Built grocery list for ${stores.join(", ")}.`, "success");
  }

  async function copyTextAndReport(text, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
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
      showCopyStatus(successMessage, "success");
    } catch {
      showCopyStatus("Copy failed in this browser. You can still select text manually.", "error");
    }
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
    const text = buildStoresExport(groupedGroceries, stores);
    if (!text) {
      showCopyStatus("No grocery items available to copy yet.", "error");
      return;
    }
    await copyTextAndReport(text, "Copied all store exports.");
  }

  async function handleCopySelectedStores() {
    const stores = getSelectedStores();
    if (stores.length === 0) {
      showCopyStatus("Select at least one store to copy.", "error");
      return;
    }
    const text = buildStoresExport(groupedGroceries, stores);
    if (!text) {
      showCopyStatus("No grocery items available for selected stores.", "error");
      return;
    }
    await copyTextAndReport(text, "Copied selected store exports.");
  }

  function handlePrintChecklist() {
    const stores = getSelectedStores();
    if (stores.length === 0) {
      showCopyStatus("Select at least one store to print.", "error");
      return;
    }

    const html = buildPrintChecklistHtml(groupedGroceries, stores);
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

  const visibleStores = selectedStores.length > 0 ? selectedStores : stores;
  const hasVisibleGroceries = visibleStores.some((store) => (groupedGroceries[store] || []).length > 0);
  const landingStats = [
    {
      label: "Recipes",
      value: sortedRecipes.length,
      description: "Open the full recipe list",
      onClick: handleOpenRecipeLibrary,
    },
    {
      label: "Stores",
      value: assignableStores.length,
      description: "Add and manage stores",
      onClick: handleOpenStoreWorkflow,
    },
  ];
  const previousMenus = menuHistory.slice(0, MAX_PREVIOUS_MENUS);

  const isPlannerWorkflow = workflowScreen === WORKFLOW_SCREENS.planner;
  const isRecipeWorkflow = workflowScreen === WORKFLOW_SCREENS.recipes;
  const activePlanName = normalizePlanName(state.mealPlanName);

  if (workflowScreen === WORKFLOW_SCREENS.landing) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-gradient-to-br from-white/95 via-white/80 to-muted/70 p-6 shadow-[0_24px_54px_hsl(220_15%_10%_/_0.12)] md:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,hsl(0_0%_100%_/_0.95),transparent_38%),radial-gradient(circle_at_88%_18%,hsl(220_15%_88%_/_0.8),transparent_42%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(220_12%_85%_/_0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(220_12%_85%_/_0.35)_1px,transparent_1px)] [background-size:36px_36px]" />

          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-zinc-800/30 bg-zinc-900 text-zinc-100">
                  Private Family Planner
                </Badge>
                <span className="rounded-full border border-border/80 bg-white/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  Workflow-ready
                </span>
              </div>

              <h1 className="max-w-3xl text-4xl font-black tracking-tight text-zinc-900 md:text-6xl">
                Plan the week with a calm, structured recipe workflow.
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Configure plan length, assign breakfast/lunch/dinner, set leftovers or eat-out
                overrides, then generate store-ready grocery lists with one pass.
              </p>

              <div className="flex flex-wrap gap-3">
                <Button className="bg-zinc-900 text-zinc-50 hover:bg-zinc-800" onClick={handleStartNewMealPlan}>
                  Start New Meal Plan
                </Button>
                <div ref={recipeSplitMenuRef} className="relative inline-flex">
                  <Button
                    variant="outline"
                    className="rounded-r-none border-zinc-400/70 bg-white/60 text-zinc-800 hover:bg-zinc-100"
                    onClick={() => handleCreateRecipeFlow("manual")}
                  >
                    Create Recipe
                  </Button>
                  <Button
                    ref={recipeSplitToggleRef}
                    type="button"
                    variant="outline"
                    className="rounded-l-none border-zinc-400/70 border-l px-3 text-zinc-800 hover:bg-zinc-100"
                    aria-label="Choose recipe creation mode"
                    aria-haspopup="menu"
                    aria-controls="create-recipe-split-menu"
                    aria-expanded={showRecipeSplitMenu}
                    onClick={() =>
                      showRecipeSplitMenu
                        ? closeRecipeSplitMenu(false)
                        : setShowRecipeSplitMenu(true)
                    }
                    onKeyDown={handleRecipeSplitToggleKeyDown}
                  >
                    ▾
                  </Button>

                  {showRecipeSplitMenu ? (
                    <div
                      id="create-recipe-split-menu"
                      role="menu"
                      aria-label="Create recipe options"
                      className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-44 rounded-md border border-border bg-white p-1 shadow-md"
                    >
                      <button
                        ref={recipeSplitManualRef}
                        type="button"
                        role="menuitem"
                        className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => handleCreateRecipeFlow("manual")}
                        onKeyDown={(event) => handleRecipeSplitItemKeyDown(event, 0)}
                      >
                        Manually Add
                      </button>
                      <button
                        ref={recipeSplitImportRef}
                        type="button"
                        role="menuitem"
                        className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => handleCreateRecipeFlow("import")}
                        onKeyDown={(event) => handleRecipeSplitItemKeyDown(event, 1)}
                      >
                        Import Recipe
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {landingStats.map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    className="rounded-xl border border-border/80 bg-white/70 px-4 py-3 text-left backdrop-blur-sm transition hover:border-zinc-400/80 hover:bg-white"
                    onClick={item.onClick}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900">{item.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <aside className="rounded-2xl border border-border/80 bg-white/75 p-5 shadow-sm backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                This Week&apos;s Menu
              </p>
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-border/80 bg-zinc-50/90 p-3">
                  <p className="text-sm font-semibold text-zinc-900">Current menu</p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold text-zinc-700 underline decoration-zinc-400 underline-offset-4 transition hover:text-zinc-950"
                    onClick={handleOpenCurrentMenu}
                  >
                    Open this week&apos;s menu
                  </button>
                </div>

                <div className="rounded-lg border border-border/80 bg-zinc-50/90 p-3">
                  <p className="text-sm font-semibold text-zinc-900">Previous menus</p>
                  {previousMenus.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No previous menus yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {previousMenus.map((menu) => (
                        <li key={menu.id}>
                          <button
                            type="button"
                            className="text-sm font-semibold text-zinc-700 underline decoration-zinc-400 underline-offset-4 transition hover:text-zinc-950"
                            onClick={() => handleOpenPreviousMenu(menu.id)}
                          >
                            {menu.label}
                          </button>
                          <p className="text-xs text-muted-foreground">{formatMenuDate(menu.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-white/80 via-white/50 to-secondary/50 p-6 shadow-glow backdrop-blur-sm md:p-10">
        <div className="pointer-events-none absolute -right-28 -top-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-52 w-52 rounded-full bg-primary/20 blur-3xl" />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge className="bg-primary/90">
              {isPlannerWorkflow ? "Weekly Workflow" : "Recipe Workflow"}
            </Badge>
            <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight md:text-5xl">
              {isPlannerWorkflow
                ? activePlanName || `Build and configure your ${planningDays}-day meal plan.`
                : "Capture, refine, and organize recipes before planning."}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              {isPlannerWorkflow
                ? "Set plan basics first, then configure day-level and meal-level overrides."
                : "Add recipes manually or import from a URL, then keep everything searchable and ready for meal planning."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isRecipeWorkflow ? (
              <Button type="button" variant="secondary" onClick={handleOpenPlannerWorkflow}>
                Open Meal Planner
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={handleBackToLanding}>
              Back To Landing
            </Button>
          </div>
        </div>
      </section>

      {copyStatus.message ? (
        <p
          className={
            copyStatus.status === "error"
              ? "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          }
          role="status"
        >
          {copyStatus.message}
        </p>
      ) : null}

      {isPlannerWorkflow ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Step 1: Plan Basics</CardTitle>
            <CardDescription>
              Name the plan, add an optional description, and choose how many days it should cover.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meal-plan-name">Meal Plan Name</Label>
              <Input
                id="meal-plan-name"
                maxLength={MAX_MEAL_PLAN_NAME}
                placeholder="Weeknight Dinners"
                value={state.mealPlanName || ""}
                onChange={(event) => setMealPlanName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planning-days">Days In Plan</Label>
              <Input
                id="planning-days"
                type="number"
                min="1"
                max="7"
                step="1"
                value={planningDays}
                onChange={(event) => setPlanningDays(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="meal-plan-description">Description (optional)</Label>
              <Textarea
                id="meal-plan-description"
                rows={3}
                maxLength={MAX_MEAL_PLAN_DESCRIPTION}
                placeholder="Focus on easy dinners and leftovers for busy nights."
                value={state.mealPlanDescription || ""}
                onChange={(event) => setMealPlanDescription(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="button" onClick={() => setPlannerStep(2)}>
                Continue To Day Setup
              </Button>
              <Button type="button" variant="secondary" onClick={handleStartNewMealPlan}>
                Reset Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isPlannerWorkflow && plannerStep >= 2 ? (
        <Card>
          <CardHeader className="gap-5 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-2xl">Step 2: Day And Meal Setup</CardTitle>
              <CardDescription>
                Choose day-level overrides and select breakfast/lunch/dinner recipes.
              </CardDescription>
            </div>
            <div className="grid gap-2 sm:max-w-sm sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="household-servings">Household Servings</Label>
                <Input
                  id="household-servings"
                  type="number"
                  min="1"
                  step="1"
                  value={state.householdServings}
                  onChange={(event) => handleHouseholdServings(event.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4">
              {activeDays.map((day, dayIndex) => {
                const dayPlan = state.weekPlan[day] || createDefaultDayPlan(state.recipes, dayIndex);
                const dayMode = dayPlan.dayMode || "planned";
                const dayLocked = dayMode !== "planned";
                const recipesForDay = filteredRecipesByDay[day] || sortedRecipes;

                return (
                  <article
                    key={day}
                    className="rounded-xl border border-border/80 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="grid gap-3 md:grid-cols-[140px_220px_1fr] md:items-end">
                      <div>
                        <p className="text-base font-semibold">{day}</p>
                        <p className="text-xs text-muted-foreground">
                          {dayLocked ? DAY_MODE_LABELS[dayMode] : "Custom meals"}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`day-mode-${day}`}>Day Override</Label>
                        <Select value={dayMode} onValueChange={(value) => setDayMode(day, value)}>
                          <SelectTrigger id={`day-mode-${day}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAY_MODES.map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {DAY_MODE_LABELS[mode]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`day-search-${day}`}>Search Recipes</Label>
                        <Input
                          id={`day-search-${day}`}
                          placeholder="Search by name or tag"
                          disabled={dayLocked}
                          value={dayRecipeSearch[day] || ""}
                          onChange={(event) => setDayRecipeSearchValue(day, event.target.value)}
                        />
                      </div>
                    </div>

                    {dayLocked ? (
                      <p className="mt-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                        {day} is set to {DAY_MODE_LABELS[dayMode].toLowerCase()}. Meal choices are
                        paused for this day.
                      </p>
                    ) : null}

                    <div className="mt-4 grid gap-3">
                      {MEAL_SLOTS.map((mealSlot) => {
                        const mealPlan = dayPlan.meals?.[mealSlot] || {
                          mode: "skip",
                          recipeId: null,
                          servingsOverride: null,
                        };
                        const enabled = mealPlan.mode !== "skip";
                        const recipeOptions = recipesForDay.length > 0 ? recipesForDay : sortedRecipes;

                        return (
                          <div
                            key={`${day}-${mealSlot}`}
                            className="grid gap-3 rounded-lg border border-border/80 bg-white p-3 md:grid-cols-[140px_120px_1fr_120px]"
                          >
                            <div className="space-y-1">
                              <p className="text-sm font-semibold">{MEAL_SLOT_LABELS[mealSlot]}</p>
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                  checked={enabled}
                                  disabled={dayLocked}
                                  onCheckedChange={(value) =>
                                    setMealEnabled(day, mealSlot, Boolean(value))
                                  }
                                />
                                Include meal
                              </label>
                            </div>

                            <div className="space-y-1">
                              <Label htmlFor={`meal-mode-${day}-${mealSlot}`}>Type</Label>
                              <Select
                                value={mealPlan.mode || "skip"}
                                disabled={!enabled || dayLocked}
                                onValueChange={(value) => setMealMode(day, mealSlot, value)}
                              >
                                <SelectTrigger id={`meal-mode-${day}-${mealSlot}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {MEAL_MODES.map((mode) => (
                                    <SelectItem key={mode} value={mode}>
                                      {MEAL_MODE_LABELS[mode]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {enabled && mealPlan.mode === "recipe" ? (
                              <div className="space-y-1">
                                <Label htmlFor={`meal-recipe-${day}-${mealSlot}`}>Recipe</Label>
                                <Select
                                  value={mealPlan.recipeId || NO_RECIPE}
                                  disabled={dayLocked}
                                  onValueChange={(value) => setMealRecipe(day, mealSlot, value)}
                                >
                                  <SelectTrigger id={`meal-recipe-${day}-${mealSlot}`}>
                                    <SelectValue placeholder="No recipe selected" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NO_RECIPE}>No recipe selected</SelectItem>
                                    {recipeOptions.map((recipe) => (
                                      <SelectItem key={recipe.id} value={recipe.id}>
                                        {recipe.title} ({recipe.servings} servings)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                <p className="text-sm text-muted-foreground">
                                  {enabled
                                    ? `This meal is set to ${MEAL_MODE_LABELS[mealPlan.mode].toLowerCase()}.`
                                    : "Not included in this day."}
                                </p>
                              </div>
                            )}

                            <div className="space-y-1">
                              <Label htmlFor={`meal-servings-${day}-${mealSlot}`}>Servings</Label>
                              <Input
                                id={`meal-servings-${day}-${mealSlot}`}
                                type="number"
                                min="1"
                                step="1"
                                disabled={!enabled || dayLocked || mealPlan.mode !== "recipe"}
                                value={mealPlan.servingsOverride ?? ""}
                                placeholder={String(state.householdServings)}
                                onChange={(event) =>
                                  setMealServings(day, mealSlot, event.target.value)
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary/90">
              Balance: {weekBalance.plannedMeals} recipe meals, {weekBalance.quickMeals} quick
              meals, {weekBalance.proteinMeals} high-protein meals, and {weekBalance.leftoversMeals}{" "}
              leftovers slots across {weekBalance.planningDays} days.
            </div>

          </CardContent>
        </Card>
      ) : null}

      {isRecipeWorkflow ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Recipe Workflow</CardTitle>
            <CardDescription>
              Popular recipe-first planners separate recipe capture from day-by-day planning.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <article className="rounded-lg border border-border/80 bg-white/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                1. Capture
              </p>
              <p className="mt-1 text-sm">Start with Manual Add or URL Import.</p>
            </article>
            <article className="rounded-lg border border-border/80 bg-white/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                2. Organize
              </p>
              <p className="mt-1 text-sm">Set meal type, tags, servings, and ingredient stores.</p>
            </article>
            <article className="rounded-lg border border-border/80 bg-white/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                3. Plan
              </p>
              <p className="mt-1 text-sm">Move to Meal Planner when recipes are ready to schedule.</p>
            </article>
          </CardContent>
        </Card>
      ) : null}

      {isRecipeWorkflow ? (
        <Card ref={recipeListRef}>
        <CardHeader>
          <CardTitle className="text-2xl">Recipes</CardTitle>
          <CardDescription>
            Create recipes with full prep details, then sort, filter, search, add to meal plans,
            duplicate, edit, delete, or import from websites.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex w-fit overflow-hidden rounded-lg border border-border">
            <Button
              type="button"
              variant={recipeComposerMode === "manual" ? "default" : "ghost"}
              className="rounded-none"
              onClick={() => setRecipeComposerMode("manual")}
            >
              Manual Add
            </Button>
            <Button
              type="button"
              variant={recipeComposerMode === "import" ? "default" : "ghost"}
              className="rounded-none border-l border-border"
              onClick={() => setRecipeComposerMode("import")}
            >
              Import
            </Button>
          </div>

          {recipeComposerMode === "manual" ? (
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleRecipeSubmit}>
              <div className="space-y-2">
                <Label htmlFor="recipe-title">Recipe Name</Label>
                <Input
                  id="recipe-title"
                  maxLength={80}
                  required
                  value={recipeForm.title}
                  onChange={(event) =>
                    setRecipeForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipe-tags">Tags (comma separated)</Label>
                <Input
                  id="recipe-tags"
                  placeholder="15-min, high-protein, kid-friendly"
                  value={recipeForm.tags}
                  onChange={(event) =>
                    setRecipeForm((prev) => ({ ...prev, tags: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2 md:max-w-xs">
                <Label htmlFor="recipe-meal-type">Meal Type</Label>
                <Select
                  value={recipeForm.mealType}
                  onValueChange={(value) =>
                    setRecipeForm((prev) => ({ ...prev, mealType: value }))
                  }
                >
                  <SelectTrigger id="recipe-meal-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_SLOTS.map((mealSlot) => (
                      <SelectItem key={mealSlot} value={mealSlot}>
                        {MEAL_SLOT_LABELS[mealSlot]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="recipe-description">Description</Label>
                <Textarea
                  id="recipe-description"
                  rows={2}
                  placeholder="Short summary of the recipe"
                  value={recipeForm.description}
                  onChange={(event) =>
                    setRecipeForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2 md:max-w-xs">
                <Label htmlFor="recipe-servings">Recipe Servings</Label>
                <Input
                  id="recipe-servings"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={recipeForm.servings}
                  onChange={(event) =>
                    setRecipeForm((prev) => ({ ...prev, servings: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2 md:max-w-xl">
                <Label htmlFor="recipe-source-url">Source URL (optional)</Label>
                <Input
                  id="recipe-source-url"
                  type="url"
                  placeholder="https://example.com/recipe"
                  value={recipeForm.sourceUrl}
                  onChange={(event) =>
                    setRecipeForm((prev) => ({ ...prev, sourceUrl: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="recipe-ingredients">
                  Ingredients (one per line: name, qty, unit, optional store)
                </Label>
                <Textarea
                  id="recipe-ingredients"
                  rows={6}
                  required
                  placeholder={"Chicken breast, 1.5, lb, Sprouts\nGreek yogurt, 32, oz"}
                  value={recipeForm.ingredients}
                  onChange={(event) =>
                    setRecipeForm((prev) => ({ ...prev, ingredients: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="recipe-steps">How To Make</Label>
                <Textarea
                  id="recipe-steps"
                  rows={6}
                  required
                  placeholder={"Preheat oven to 425F\nMix marinade\nBake for 25 minutes"}
                  value={recipeForm.steps}
                  onChange={(event) =>
                    setRecipeForm((prev) => ({ ...prev, steps: event.target.value }))
                  }
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="w-fit" type="submit">
                  {editingRecipeId ? "Update Recipe" : "Add Recipe"}
                </Button>
                {editingRecipeId ? (
                  <Button type="button" variant="outline" onClick={resetRecipeEditor}>
                    Cancel Edit
                  </Button>
                ) : null}
              </div>
            </form>
          ) : (
            <section className="space-y-4 rounded-lg border border-border/80 bg-white/60 p-4">
              <div>
                <h3 className="font-semibold">Import Recipe From Website</h3>
                <p className="text-sm text-muted-foreground">
                  Paste a recipe URL to extract name, description, ingredients, and steps. Review
                  before approving and saving.
                </p>
              </div>

              <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={handleImportFromUrl}>
                <Input
                  id="import-url"
                  type="url"
                  placeholder="https://example.com/your-recipe"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  required
                />
                <Button type="submit" disabled={isImporting}>
                  {isImporting ? "Importing..." : "Import"}
                </Button>
              </form>

              {importDraft ? (
                <form className="grid gap-4 border-t border-border/70 pt-4 md:grid-cols-2" onSubmit={handleImportApprove}>
                  <div className="space-y-2">
                    <Label htmlFor="import-title">Recipe Name</Label>
                    <Input
                      id="import-title"
                      required
                      value={importDraft.title}
                      onChange={(event) => handleImportDraftChange("title", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="import-tags">Tags (comma separated)</Label>
                    <Input
                      id="import-tags"
                      placeholder="30-min, high-protein"
                      value={importDraft.tags}
                      onChange={(event) => handleImportDraftChange("tags", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2 md:max-w-xs">
                    <Label htmlFor="import-meal-type">Meal Type</Label>
                    <Select
                      value={importDraft.mealType || "dinner"}
                      onValueChange={(value) => handleImportDraftChange("mealType", value)}
                    >
                      <SelectTrigger id="import-meal-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEAL_SLOTS.map((mealSlot) => (
                          <SelectItem key={mealSlot} value={mealSlot}>
                            {MEAL_SLOT_LABELS[mealSlot]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="import-description">Description</Label>
                    <Textarea
                      id="import-description"
                      rows={2}
                      value={importDraft.description}
                      onChange={(event) =>
                        handleImportDraftChange("description", event.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2 md:max-w-xs">
                    <Label htmlFor="import-servings">Servings</Label>
                    <Input
                      id="import-servings"
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={importDraft.servings}
                      onChange={(event) => handleImportDraftChange("servings", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2 md:max-w-xl">
                    <Label htmlFor="import-source-url">Source URL</Label>
                    <Input
                      id="import-source-url"
                      type="url"
                      value={importDraft.sourceUrl}
                      onChange={(event) => handleImportDraftChange("sourceUrl", event.target.value)}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="import-ingredients">
                      Ingredients (one per line: name, qty, unit, optional store)
                    </Label>
                    <Textarea
                      id="import-ingredients"
                      rows={6}
                      required
                      value={importDraft.ingredients}
                      onChange={(event) =>
                        handleImportDraftChange("ingredients", event.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="import-steps">How To Make</Label>
                    <Textarea
                      id="import-steps"
                      rows={6}
                      required
                      value={importDraft.steps}
                      onChange={(event) => handleImportDraftChange("steps", event.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <Button type="submit">Approve &amp; Save Imported Recipe</Button>
                    <Button type="button" variant="outline" onClick={handleImportReset}>
                      Discard Import
                    </Button>
                  </div>
                </form>
              ) : null}
            </section>
          )}

          <Separator />

          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="recipe-search">Search Recipes</Label>
                <Input
                  id="recipe-search"
                  type="text"
                  placeholder="Search by name, tags, ingredients, or steps"
                  value={recipeSearch}
                  onChange={(event) => setRecipeSearch(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipe-sort">Sort</Label>
                <Select value={recipeSort} onValueChange={setRecipeSort}>
                  <SelectTrigger id="recipe-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="title-asc">Title (A-Z)</SelectItem>
                    <SelectItem value="title-desc">Title (Z-A)</SelectItem>
                    <SelectItem value="servings-asc">Servings (Low-High)</SelectItem>
                    <SelectItem value="servings-desc">Servings (High-Low)</SelectItem>
                    <SelectItem value="ingredients-desc">Most Ingredients</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipe-meal-filter">Meal Filter</Label>
                <Select value={recipeMealFilter} onValueChange={setRecipeMealFilter}>
                  <SelectTrigger id="recipe-meal-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Meals</SelectItem>
                    {MEAL_SLOTS.map((mealSlot) => (
                      <SelectItem key={mealSlot} value={mealSlot}>
                        {MEAL_SLOT_LABELS[mealSlot]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipe-source-filter">Source Filter</Label>
                <Select value={recipeSourceFilter} onValueChange={setRecipeSourceFilter}>
                  <SelectTrigger id="recipe-source-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="with-source">Has Source URL</SelectItem>
                    <SelectItem value="without-source">No Source URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="recipe-tag-filter">Tag Filter</Label>
                <Input
                  id="recipe-tag-filter"
                  type="text"
                  placeholder="high-protein"
                  value={recipeTagFilter}
                  onChange={(event) => setRecipeTagFilter(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-plan-day">Add To Plan Day</Label>
                <Select value={quickPlanDay} onValueChange={setQuickPlanDay}>
                  <SelectTrigger id="quick-plan-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeDays.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-plan-slot">Meal Slot</Label>
                <Select value={quickPlanMealSlot} onValueChange={setQuickPlanMealSlot}>
                  <SelectTrigger id="quick-plan-slot">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_SLOTS.map((mealSlot) => (
                      <SelectItem key={mealSlot} value={mealSlot}>
                        {MEAL_SLOT_LABELS[mealSlot]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRecipes.map((recipe) => (
              <article
                key={recipe.id}
                className="rounded-lg border border-border/80 bg-white/90 p-3 shadow-sm"
              >
                <h3 className="font-semibold">{recipe.title}</h3>
                {recipe.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{recipe.description}</p>
                ) : null}
                {recipe.sourceUrl ? (
                  <a
                    className="mt-1 block break-all text-xs text-primary underline-offset-4 hover:underline"
                    href={recipe.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Source: {recipe.sourceUrl}
                  </a>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">Servings: {recipe.servings}</p>
                <p className="text-sm text-muted-foreground">
                  Meal: {MEAL_SLOT_LABELS[normalizeRecipeMealType(recipe.mealType, "dinner")]}
                </p>
                <p className="text-sm text-muted-foreground">
                  Tags: {recipe.tags.length ? recipe.tags.join(", ") : "none"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Ingredients: {recipe.ingredients.length}
                </p>
                <p className="text-sm text-muted-foreground">Steps: {recipe.steps?.length || 0}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => handleAddRecipeToMealPlan(recipe.id)}>
                    Add To Meal Plan
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleRecipeEdit(recipe.id)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleRecipeDuplicate(recipe.id)}
                  >
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRecipeDelete(recipe.id)}
                  >
                    Delete
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {filteredRecipes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-white/70 p-4 text-sm text-muted-foreground">
              No recipes matched your search.
            </p>
          ) : null}
        </CardContent>
        </Card>
      ) : null}

      {isRecipeWorkflow ? (
        <Card ref={storeWorkflowRef}>
        <CardHeader>
          <CardTitle className="text-2xl">Ingredient Catalog</CardTitle>
          <CardDescription>
            Set default stores for ingredients so recipes can omit store names.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="grid gap-3 rounded-lg border border-border/70 bg-white/80 p-3 md:grid-cols-[1fr_auto]" onSubmit={handleStoreSubmit}>
            <div className="space-y-2">
              <Label htmlFor="store-name">Add Store</Label>
              <Input
                id="store-name"
                ref={storeInputRef}
                placeholder="Costco"
                value={storeNameInput}
                onChange={(event) => setStoreNameInput(event.target.value)}
              />
            </div>
            <div className="pt-0 md:pt-8">
              <Button type="submit">Add Store</Button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            {assignableStores.map((store) => (
              <Badge key={store} variant="secondary">
                {store}
              </Badge>
            ))}
          </div>

          <form className="grid gap-4 md:grid-cols-[1fr_200px_auto]" onSubmit={handleCatalogSubmit}>
            <div className="space-y-2">
              <Label htmlFor="catalog-name">Ingredient Name</Label>
              <Input
                id="catalog-name"
                placeholder="Greek yogurt"
                required
                value={catalogForm.name}
                onChange={(event) =>
                  setCatalogForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catalog-store">Default Store</Label>
              <Select
                value={catalogForm.store}
                onValueChange={(value) => setCatalogForm((prev) => ({ ...prev, store: value }))}
              >
                <SelectTrigger id="catalog-store">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableStores.map((store) => (
                    <SelectItem key={store} value={store}>
                      {store}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-0 md:pt-8">
              <Button type="submit">Save Mapping</Button>
            </div>
          </form>

          {catalogEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No defaults yet. Add ingredient-store mappings above.
            </p>
          ) : (
            <div className="grid gap-2">
              {catalogEntries.map(([name, store]) => (
                <div
                  key={name}
                  className="grid items-center gap-2 rounded-md border border-border/80 bg-white/90 px-3 py-2 text-sm md:grid-cols-[1fr_140px_auto]"
                >
                  <span className="font-medium">{displayName(name)}</span>
                  <span className="text-muted-foreground">{store}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCatalogRemove(name)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        </Card>
      ) : null}

      {isRecipeWorkflow ? (
        <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Pantry Always-On-Hand</CardTitle>
          <CardDescription>
            These ingredients are excluded from generated grocery lists.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            id="pantry-input"
            type="text"
            placeholder="olive oil, salt, black pepper"
            value={pantryInput}
            onChange={(event) => setPantryInput(event.target.value)}
          />
          <Button type="button" onClick={handlePantrySave}>
            Save Pantry
          </Button>
        </CardContent>
        </Card>
      ) : null}

      {isPlannerWorkflow && plannerStep >= 3 ? (
        <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-2xl">Step 3: Build Grocery List</CardTitle>
            <CardDescription>
              Select pickup stores and generate store-ready lists.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleBuildGroceryList}>
              Build Grocery List
            </Button>
            <Button type="button" variant="secondary" onClick={handleCopyAllStores}>
              Copy All Stores
            </Button>
            <Button type="button" variant="secondary" onClick={handleCopySelectedStores}>
              Copy Selected Stores
            </Button>
            <Button type="button" variant="outline" onClick={handlePrintChecklist}>
              Print Checklist
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4 rounded-lg border border-border/80 bg-white/80 p-3">
            {stores.map((store) => {
              const count = (groupedGroceries[store] || []).length;
              return (
                <label key={store} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(state.exportStoreSelection[store])}
                    onCheckedChange={(value) => handleStoreFilterChange(store, Boolean(value))}
                  />
                  <span>
                    {store} ({count})
                  </span>
                </label>
              );
            })}
          </div>

          {showGroceries ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleStores.map((store) => {
                const items = groupedGroceries[store] || [];
                if (items.length === 0) {
                  return null;
                }

                return (
                  <section
                    key={store}
                    className="rounded-lg border border-border/80 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{store}</h3>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyStore(store, items)}
                      >
                        Copy List
                      </Button>
                    </div>

                    {store === "Trader Joe's" ? (
                      <p className="mb-2 text-xs text-muted-foreground">
                        Trader Joe&apos;s export uses checklist format for in-store shopping.
                      </p>
                    ) : null}

                    <ul className="space-y-2 text-sm">
                      {items.map((item) => (
                        <li key={`${store}-${item.name}-${item.unit}`} className="flex items-start gap-2">
                          <Checkbox aria-label={`Mark ${displayName(item.name)} as picked up`} />
                          <span>{formatItem(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-white/70 p-4 text-sm text-muted-foreground">
              Select your stores, then click "Build Grocery List".
            </p>
          )}

          {showGroceries && !hasVisibleGroceries ? (
            <p className="rounded-lg border border-dashed border-border bg-white/70 p-4 text-sm text-muted-foreground">
              No groceries yet for selected stores. Add recipe meals or adjust day overrides.
            </p>
          ) : null}
        </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
