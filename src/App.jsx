import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Leaf, ListChecks, MoreVertical, Pencil, Plus, Trash2, UtensilsCrossed, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DayActionMenu } from "@/components/ui/day-action-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileSheet } from "@/components/ui/mobile-sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UndoToast } from "@/components/ui/undo-toast";
import {
  calculateReceiptDelta,
} from "@/lib/planner-ux";
import {
  DAYS,
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
  formatItem,
  groupGroceries,
  normalizeName,
  normalizeRecipeMealType,
  normalizeServings,
  normalizeStoreList,
  normalizeSteps,
  normalizeUnit,
  parseIngredients,
  parseIngredientsWithDiagnostics,
  parseOptionalServings,
  pickStore,
  upsertCatalogFromIngredients,
} from "@/lib/meal-planner";
import { fetchPlannerState, parseRecipeFromUrl, savePlannerState } from "@/lib/api";

const NO_RECIPE = "__none__";
const MENU_HISTORY_KEY = `${STORAGE_KEY}-menu-history-v1`;
const MAX_PREVIOUS_MENUS = 5;
const MAX_MEAL_PLAN_NAME = 80;
const MAX_MEAL_PLAN_DESCRIPTION = 280;
const MAX_DAY_NOTE_LENGTH = 240;
const MAX_INGREDIENT_TAG_LENGTH = 40;
const MIN_PLAN_NAME_LENGTH = 1;
const STATE_SYNC_DEBOUNCE_MS = 400;
const WORKFLOW_SCREENS = {
  landing: "landing",
  planner: "planner",
  recipes: "recipes",
};
const LIBRARY_TABS = {
  recipes: "recipes",
  ingredients: "ingredients",
};
const RECIPE_PAGES = {
  create: "create",
  list: "list",
};
const RECIPE_INGREDIENT_MODES = {
  directory: "directory",
  custom: "custom",
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
const EMPTY_RECIPE_INGREDIENT_FORM = {
  name: "",
  qty: "1",
  unit: "each",
  store: "Unassigned",
};
const EMPTY_NEW_INGREDIENT_FORM = {
  name: "",
  qty: "1",
  unit: "each",
  store: "Unassigned",
};

function makeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeRecipeForm() {
  return { ...EMPTY_RECIPE_FORM };
}

function makeRecipeIngredientForm(defaultStore = "") {
  return {
    ...EMPTY_RECIPE_INGREDIENT_FORM,
    store: defaultStore || "Target",
  };
}

function makeNewIngredientForm(defaultStore = "") {
  return {
    ...EMPTY_NEW_INGREDIENT_FORM,
    store: defaultStore || "Unassigned",
  };
}

function normalizeIngredientCatalogEntry(entry, availableStores) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return {
      store: pickStore(entry.store || entry.preferredStore, availableStores),
      tag: String(entry.tag || "").trim().slice(0, MAX_INGREDIENT_TAG_LENGTH),
    };
  }

  return {
    store: pickStore(entry, availableStores),
    tag: "",
  };
}

function makeMealSearchState() {
  return Object.fromEntries(
    DAYS.flatMap((day) => MEAL_SLOTS.map((mealSlot) => [`${day}:${mealSlot}`, ""])),
  );
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

function titleFromRecipeUrl(rawValue) {
  const normalizedUrl = normalizeRecipeUrl(rawValue);
  if (!normalizedUrl) {
    return "Imported Recipe";
  }

  try {
    const parsed = new URL(normalizedUrl);
    const slugPart = parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop();
    if (slugPart) {
      return slugPart
        .replace(/[-_]+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Imported Recipe";
  }
}

function normalizeRecipeIngredientItem(item, availableStores) {
  const name = normalizeName(item?.name);
  if (!name) {
    return null;
  }

  const qtyValue = Number(item?.qty);
  const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;
  const unit = normalizeUnit(item?.unit || "each");
  const store = pickStore(item?.store, availableStores);

  return {
    name,
    qty,
    unit,
    store,
  };
}

function buildRecipeFromForm(form, ingredientItems, availableStores, id) {
  const title = String(form.title || "").trim();
  const mealType = normalizeRecipeMealType(form.mealType, "dinner");
  const description = String(form.description || "").trim();
  const tags = parseTags(form.tags);
  const servings = normalizeServings(form.servings, 4);
  const ingredients = Array.isArray(ingredientItems)
    ? ingredientItems
      .map((item) => normalizeRecipeIngredientItem(item, availableStores))
      .filter(Boolean)
    : [];
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

  if (String(dayPlan.notes || "").trim()) {
    return true;
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

function buildRecipeDraftSnapshot(form, ingredients, ingredientPasteText) {
  return JSON.stringify({
    recipeForm: form,
    recipeIngredients: ingredients,
    ingredientPasteText: String(ingredientPasteText || ""),
  });
}

function getReceiptItemKey(store, name, unit) {
  return `${store}__${name}__${unit}`;
}

function toShortDayLabel(day) {
  return String(day || "").slice(0, 3);
}

export default function App() {
  const [state, setState] = useState(() => createInitialState());
  const [menuHistory, setMenuHistory] = useState(() => loadMenuHistory());
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const [workflowScreen, setWorkflowScreen] = useState(WORKFLOW_SCREENS.landing);
  const [plannerStep, setPlannerStep] = useState(1);
  const [planBasicsLocked, setPlanBasicsLocked] = useState(false);
  const [planBasicsErrors, setPlanBasicsErrors] = useState({
    mealPlanName: "",
    planningDays: "",
  });
  const [showGroceries, setShowGroceries] = useState(false);
  const [libraryTab, setLibraryTab] = useState(LIBRARY_TABS.recipes);
  const [recipePage, setRecipePage] = useState(RECIPE_PAGES.list);
  const [mealRecipeSearch, setMealRecipeSearch] = useState(() => makeMealSearchState());
  const [expandedDay, setExpandedDay] = useState(DAYS[0]);
  const [openDayMenu, setOpenDayMenu] = useState("");
  const [noteEditorDay, setNoteEditorDay] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRecipeUrl, setImportRecipeUrl] = useState("");
  const [isImportingRecipe, setIsImportingRecipe] = useState(false);
  const [isLandingAddRecipeMenuOpen, setIsLandingAddRecipeMenuOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState({
    status: "neutral",
    message: "",
  });
  const [recipeForm, setRecipeForm] = useState(() => makeRecipeForm());
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [quickPlanDay, setQuickPlanDay] = useState(DAYS[0]);
  const [quickPlanMealSlot, setQuickPlanMealSlot] = useState("dinner");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [openLibraryMenu, setOpenLibraryMenu] = useState("");
  const [isAddingIngredient, setIsAddingIngredient] = useState(false);
  const [editingIngredientName, setEditingIngredientName] = useState("");
  const [ingredientForm, setIngredientForm] = useState({
    name: "",
    tag: "",
    store: "Unassigned",
  });
  const [inlineEditingRecipeId, setInlineEditingRecipeId] = useState(null);
  const [inlineRecipeForm, setInlineRecipeForm] = useState(() => makeRecipeForm());
  const [recipeIngredientMode, setRecipeIngredientMode] = useState("");
  const [recipeIngredientForm, setRecipeIngredientForm] = useState(() => makeRecipeIngredientForm());
  const [newIngredientForm, setNewIngredientForm] = useState(() => makeNewIngredientForm());
  const [recipeIngredients, setRecipeIngredients] = useState([]);
  const [inlineEditingRecipeIngredientIndex, setInlineEditingRecipeIngredientIndex] = useState(null);
  const [inlineRecipeIngredientForm, setInlineRecipeIngredientForm] = useState(() => makeRecipeIngredientForm());
  const [openMealPickerKey, setOpenMealPickerKey] = useState("");
  const [recipeDetailsModalRecipeId, setRecipeDetailsModalRecipeId] = useState("");
  const [ingredientPasteText, setIngredientPasteText] = useState("");
  const [ingredientPasteSkippedLines, setIngredientPasteSkippedLines] = useState([]);
  const [recipeDraftBaseline, setRecipeDraftBaseline] = useState(() =>
    buildRecipeDraftSnapshot(makeRecipeForm(), [], ""),
  );
  const [receiptDelta, setReceiptDelta] = useState(null);
  const [isMobileReceiptOpen, setIsMobileReceiptOpen] = useState(false);
  const [undoToast, setUndoToast] = useState(null);
  const recipeListRef = useRef(null);
  const ingredientPasteRef = useRef(null);
  const landingAddRecipeMenuRef = useRef(null);
  const landingAddRecipeTriggerRef = useRef(null);
  const dayCardRefs = useRef({});
  const previousReceiptCountRef = useRef(null);
  const receiptDeltaTimerRef = useRef(null);
  const undoToastTimerRef = useRef(null);
  const hasShownSyncErrorRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromApi() {
      try {
        const remoteState = await fetchPlannerState();
        if (cancelled || !remoteState || typeof remoteState !== "object") {
          return;
        }
        setState(remoteState);
      } catch {
        if (!cancelled) {
          showCopyStatus(
            "Shared storage is unavailable. Local data is still available in this browser.",
            "error",
          );
        }
      } finally {
        if (!cancelled) {
          setIsStateHydrated(true);
        }
      }
    }

    hydrateFromApi();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!isStateHydrated) {
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        await savePlannerState(state);
        hasShownSyncErrorRef.current = false;
      } catch {
        if (!cancelled && !hasShownSyncErrorRef.current) {
          hasShownSyncErrorRef.current = true;
          showCopyStatus(
            "Unable to sync with shared storage. Changes remain saved in this browser for now.",
            "error",
          );
        }
      }
    }, STATE_SYNC_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isStateHydrated, state]);

  useEffect(() => {
    window.localStorage.setItem(MENU_HISTORY_KEY, JSON.stringify(menuHistory));
  }, [menuHistory]);

  const stores = useMemo(() => normalizeStoreList(state.stores), [state.stores]);
  const assignableStores = useMemo(
    () => stores.filter((store) => store !== "Unassigned"),
    [stores],
  );

  const sortedRecipes = useMemo(
    () => [...state.recipes].sort((a, b) => a.title.localeCompare(b.title)),
    [state.recipes],
  );
  const recipesById = useMemo(
    () => Object.fromEntries(state.recipes.map((recipe) => [recipe.id, recipe])),
    [state.recipes],
  );
  const recipeDetailsModalRecipe = recipeDetailsModalRecipeId
    ? recipesById[recipeDetailsModalRecipeId] || null
    : null;

  const recipeList = useMemo(() => {
    const query = normalizeName(recipeSearch);
    if (!query) {
      return sortedRecipes;
    }
    return sortedRecipes.filter((recipe) => recipeSearchBlob(recipe).includes(query));
  }, [recipeSearch, sortedRecipes]);

  const planningDays = useMemo(
    () => Math.min(7, Math.max(1, normalizeServings(state.planningDays, 7))),
    [state.planningDays],
  );
  const activeDays = useMemo(() => DAYS.slice(0, planningDays), [planningDays]);
  const groupedGroceries = useMemo(() => groupGroceries(state), [state]);
  const weekBalance = useMemo(() => buildWeekBalance(state), [state]);
  const ingredientDirectory = useMemo(() => {
    const knownNames = new Set();
    state.recipes.forEach((recipe) => {
      recipe.ingredients.forEach((ingredient) => {
        const normalized = normalizeName(ingredient.name);
        if (normalized) {
          knownNames.add(normalized);
        }
      });
    });
    Object.keys(state.ingredientCatalog || {}).forEach((name) => {
      const normalized = normalizeName(name);
      if (normalized) {
        knownNames.add(normalized);
      }
    });

    return Array.from(knownNames)
      .map((name) => {
        const entry = normalizeIngredientCatalogEntry(state.ingredientCatalog?.[name], stores);
        return {
          name,
          tag: entry.tag,
          store: entry.store,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.ingredientCatalog, state.recipes, stores]);
  const filteredIngredientDirectory = useMemo(() => {
    const query = normalizeName(ingredientSearch);
    if (!query) {
      return ingredientDirectory;
    }
    return ingredientDirectory.filter((ingredient) =>
      [ingredient.name, ingredient.tag, ingredient.store].join(" ").toLowerCase().includes(query),
    );
  }, [ingredientDirectory, ingredientSearch]);
  const selectedStores = useMemo(
    () => stores.filter((store) => Boolean(state.exportStoreSelection[store])),
    [state.exportStoreSelection, stores],
  );
  const noteEditorSavedText = noteEditorDay
    ? String(
      (
        state.weekPlan[noteEditorDay]
        || createDefaultDayPlan(state.recipes, DAYS.indexOf(noteEditorDay))
      ).notes || "",
    ).trim()
    : "";
  const selectedRecipeIngredientName = normalizeName(recipeIngredientForm.name);
  const canSaveRecipeIngredient = ingredientDirectory.some(
    (ingredient) => ingredient.name === selectedRecipeIngredientName,
  );
  const canCreateRecipeIngredient = Boolean(normalizeName(newIngredientForm.name));
  const hasIngredientPasteText = Boolean(String(ingredientPasteText || "").trim());
  const isDirectoryIngredientMode = recipeIngredientMode === RECIPE_INGREDIENT_MODES.directory;
  const isCustomIngredientMode = recipeIngredientMode === RECIPE_INGREDIENT_MODES.custom;
  const isRecipeCreatePage = recipePage === RECIPE_PAGES.create;
  const isEditingRecipeDraft = Boolean(editingRecipeId);
  const recipeEditorModeLabel = isEditingRecipeDraft ? "Edit recipe" : "Add recipe";
  const recipeDraftModeLabel = isEditingRecipeDraft ? "Edit recipe draft" : "Add recipe draft";
  const recipeDraftSnapshot = useMemo(
    () => buildRecipeDraftSnapshot(recipeForm, recipeIngredients, ingredientPasteText),
    [ingredientPasteText, recipeForm, recipeIngredients],
  );
  const isRecipeDraftDirty = isRecipeCreatePage && recipeDraftBaseline !== recipeDraftSnapshot;

  useEffect(() => {
    const fallbackStore = "Unassigned";
    setIngredientForm((prev) =>
      stores.includes(prev.store) ? prev : { ...prev, store: fallbackStore },
    );
  }, [stores]);

  useEffect(() => {
    const fallbackStore = assignableStores[0] || "Unassigned";
    setRecipeIngredientForm((prev) =>
      stores.includes(prev.store) ? prev : { ...prev, store: fallbackStore },
    );
  }, [assignableStores, stores]);

  useEffect(() => {
    const fallbackStore = "Unassigned";
    setNewIngredientForm((prev) =>
      stores.includes(prev.store) ? prev : { ...prev, store: fallbackStore },
    );
  }, [stores]);

  useEffect(() => {
    const fallbackDay = activeDays[0] || DAYS[0];
    if (!activeDays.includes(quickPlanDay)) {
      setQuickPlanDay(fallbackDay);
    }
  }, [activeDays, quickPlanDay]);

  useEffect(() => {
    if (!expandedDay) {
      return;
    }
    const fallbackDay = activeDays[0] || "";
    if (!activeDays.includes(expandedDay)) {
      setExpandedDay(fallbackDay);
    }
  }, [activeDays, expandedDay]);

  useEffect(() => {
    if (openDayMenu && !activeDays.includes(openDayMenu)) {
      setOpenDayMenu("");
    }
  }, [activeDays, openDayMenu]);

  useEffect(() => {
    if (noteEditorDay && !activeDays.includes(noteEditorDay)) {
      setNoteEditorDay("");
      setNoteDraft("");
    }
  }, [activeDays, noteEditorDay]);

  useEffect(() => {
    if (workflowScreen !== WORKFLOW_SCREENS.planner || plannerStep < 2) {
      return;
    }

    setState((prev) => {
      let changed = false;
      const nextWeekPlan = { ...prev.weekPlan };

      activeDays.forEach((day) => {
        const dayIndex = DAYS.indexOf(day);
        const dayPlan = nextWeekPlan[day] || createDefaultDayPlan(prev.recipes, dayIndex);
        if (dayPlan.dayMode !== "planned") {
          changed = true;
          nextWeekPlan[day] = {
            ...dayPlan,
            dayMode: "planned",
          };
        }
      });

      if (!changed) {
        return prev;
      }

      return {
        ...prev,
        weekPlan: nextWeekPlan,
      };
    });
  }, [activeDays, plannerStep, workflowScreen]);

  useEffect(() => {
    if (!isRecipeCreatePage) {
      return;
    }
    setRecipeDraftBaseline(recipeDraftSnapshot);
    if (!recipeIngredientMode) {
      setRecipeIngredientMode(RECIPE_INGREDIENT_MODES.directory);
    }
  }, [editingRecipeId, isRecipeCreatePage]);

  useEffect(() => {
    if (!isRecipeCreatePage) {
      return undefined;
    }

    function handleGlobalPaste(event) {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const isEditable = target.matches("input, textarea, [contenteditable='true']")
          || target.isContentEditable
          || Boolean(target.closest("input, textarea, [contenteditable='true']"));
        if (isEditable) {
          return;
        }
      }

      const pastedText = String(event.clipboardData?.getData("text/plain") || "").trim();
      if (!pastedText) {
        return;
      }

      event.preventDefault();
      setIngredientPasteText((prev) => (prev ? `${prev}\n${pastedText}` : pastedText));
      setIngredientPasteSkippedLines([]);
      setRecipeIngredientMode((prev) => prev || RECIPE_INGREDIENT_MODES.directory);
      window.requestAnimationFrame(() => {
        ingredientPasteRef.current?.focus();
      });
    }

    window.addEventListener("paste", handleGlobalPaste);
    return () => {
      window.removeEventListener("paste", handleGlobalPaste);
    };
  }, [isRecipeCreatePage]);

  useEffect(
    () => () => {
      if (receiptDeltaTimerRef.current) {
        window.clearTimeout(receiptDeltaTimerRef.current);
      }
      if (undoToastTimerRef.current) {
        window.clearTimeout(undoToastTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (workflowScreen !== WORKFLOW_SCREENS.planner || plannerStep < 2) {
      setIsMobileReceiptOpen(false);
    }
  }, [plannerStep, workflowScreen]);

  useEffect(() => {
    if (!isLandingAddRecipeMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!landingAddRecipeMenuRef.current || landingAddRecipeMenuRef.current.contains(target)) {
        return;
      }
      setIsLandingAddRecipeMenuOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") {
        return;
      }
      setIsLandingAddRecipeMenuOpen(false);
      window.requestAnimationFrame(() => {
        landingAddRecipeTriggerRef.current?.focus();
      });
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLandingAddRecipeMenuOpen]);

  useEffect(() => {
    if (!openMealPickerKey) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-meal-picker='true']")) {
        return;
      }
      setOpenMealPickerKey("");
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenMealPickerKey("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMealPickerKey]);

  useEffect(() => {
    if (!recipeDetailsModalRecipeId) {
      return;
    }
    if (!recipesById[recipeDetailsModalRecipeId]) {
      setRecipeDetailsModalRecipeId("");
    }
  }, [recipeDetailsModalRecipeId, recipesById]);

  useEffect(() => {
    if (!recipeDetailsModalRecipeId) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setRecipeDetailsModalRecipeId("");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [recipeDetailsModalRecipeId]);

  function showCopyStatus(message, status = "success") {
    setCopyStatus({ message, status });
  }

  function validatePlanBasics() {
    const nextErrors = {
      mealPlanName: "",
      planningDays: "",
    };

    if (String(state.mealPlanName || "").trim().length < MIN_PLAN_NAME_LENGTH) {
      nextErrors.mealPlanName = "Meal plan name is required.";
    }

    const daysValue = Number(state.planningDays);
    if (!Number.isFinite(daysValue) || daysValue < 1 || daysValue > 7) {
      nextErrors.planningDays = "Days in plan must be between 1 and 7.";
    }

    setPlanBasicsErrors(nextErrors);
    return !nextErrors.mealPlanName && !nextErrors.planningDays;
  }

  function handleContinueToDaySetup() {
    if (!validatePlanBasics()) {
      showCopyStatus("Fix the required plan basics before continuing.", "error");
      return;
    }

    setPlanBasicsLocked(true);
    setPlannerStep(2);
    showCopyStatus("Plan basics saved. Continue with day setup.", "success");
  }

  function handleEditPlanBasics() {
    setPlanBasicsLocked(false);
    setPlannerStep(1);
    showCopyStatus("Plan basics unlocked for editing.", "success");
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
    setMealRecipeSearch(makeMealSearchState());
    setExpandedDay(DAYS[0]);
    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(1);
    setPlanBasicsLocked(false);
    setPlanBasicsErrors({ mealPlanName: "", planningDays: "" });
    setShowGroceries(false);
    setIsLandingAddRecipeMenuOpen(false);
    showCopyStatus("", "neutral");
  }

  function handleOpenCurrentMenu() {
    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(2);
    setPlanBasicsLocked(true);
    setExpandedDay(DAYS[0]);
    setShowGroceries(false);
    setIsLandingAddRecipeMenuOpen(false);
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
    setMealRecipeSearch(makeMealSearchState());
    setExpandedDay(DAYS[0]);
    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(2);
    setPlanBasicsLocked(true);
    setShowGroceries(false);
    setIsLandingAddRecipeMenuOpen(false);
    showCopyStatus(`Loaded ${selectedMenu.label}.`, "success");
  }

  function handleCreateRecipeFlow() {
    setWorkflowScreen(WORKFLOW_SCREENS.recipes);
    setLibraryTab(LIBRARY_TABS.recipes);
    setRecipePage(RECIPE_PAGES.create);
    setIsLandingAddRecipeMenuOpen(false);
    resetRecipeEditor();
  }

  function handleOpenHome() {
    setWorkflowScreen(WORKFLOW_SCREENS.landing);
    setIsLandingAddRecipeMenuOpen(false);
  }

  function handleOpenPlannerWorkflow() {
    setWorkflowScreen(WORKFLOW_SCREENS.planner);
    setPlannerStep(2);
    setPlanBasicsLocked(true);
    setExpandedDay(DAYS[0]);
    setIsLandingAddRecipeMenuOpen(false);
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
    setLibraryTab(LIBRARY_TABS.recipes);
    setRecipePage(RECIPE_PAGES.list);
    setIsLandingAddRecipeMenuOpen(false);
    scrollToRef(recipeListRef);
  }

  function handleOpenIngredientLibrary() {
    setWorkflowScreen(WORKFLOW_SCREENS.recipes);
    setLibraryTab(LIBRARY_TABS.ingredients);
    setRecipePage(RECIPE_PAGES.list);
    setIsLandingAddRecipeMenuOpen(false);
    scrollToRef(recipeListRef);
  }

  function openRecipeImportModal() {
    setImportRecipeUrl("");
    setIsImportModalOpen(true);
    setIsLandingAddRecipeMenuOpen(false);
  }

  function closeRecipeImportModal() {
    if (isImportingRecipe) {
      return;
    }
    setIsImportModalOpen(false);
    setImportRecipeUrl("");
  }

  async function handleImportRecipeSubmit(event) {
    event.preventDefault();
    if (isImportingRecipe) {
      return;
    }

    const normalizedUrl = normalizeRecipeUrl(importRecipeUrl);
    if (!normalizedUrl) {
      showCopyStatus("Enter a valid recipe URL to import.", "error");
      return;
    }

    setIsImportingRecipe(true);
    try {
      const imported = await parseRecipeFromUrl(normalizedUrl, state.ingredientCatalog, stores);
      const importedIngredients = Array.isArray(imported?.ingredients)
        ? imported.ingredients
          .map((item) => normalizeRecipeIngredientItem(item, stores))
          .filter(Boolean)
        : [];
      const importedRecipe = {
        id: editingRecipeId || makeId("recipe"),
        title: String(imported?.title || "").trim() || "Imported Recipe",
        mealType: normalizeRecipeMealType(imported?.mealType, "dinner"),
        description: String(imported?.description || "").trim(),
        sourceUrl: normalizeRecipeUrl(imported?.sourceUrl) || normalizedUrl,
        tags: Array.isArray(imported?.tags) ? imported.tags.filter(Boolean) : [],
        servings: normalizeServings(imported?.servings, 4),
        ingredients: importedIngredients,
        steps: Array.isArray(imported?.steps) ? normalizeSteps(imported.steps.join("\n")) : [],
      };

      setEditingRecipeId(null);
      const importedForm = recipeToForm(importedRecipe);
      setRecipeForm(importedForm);
      setRecipeIngredients(importedIngredients);
      setRecipeIngredientMode(RECIPE_INGREDIENT_MODES.directory);
      setIngredientPasteText("");
      setIngredientPasteSkippedLines([]);
      setInlineEditingRecipeIngredientIndex(null);
      setInlineRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
      setRecipeDraftBaseline(buildRecipeDraftSnapshot(importedForm, importedIngredients, ""));
      resetNewIngredientForm();
      resetRecipeIngredientForm();
      setWorkflowScreen(WORKFLOW_SCREENS.recipes);
      setLibraryTab(LIBRARY_TABS.recipes);
      setRecipePage(RECIPE_PAGES.create);
      setIsImportModalOpen(false);
      setImportRecipeUrl("");
      showCopyStatus("Recipe imported. Review details and save.", "success");
    } catch (error) {
      const isServer500 = /API request failed \(500\)/i.test(String(error?.message || ""));
      setEditingRecipeId(null);
      const fallbackForm = recipeToForm({
          id: makeId("recipe"),
          title: titleFromRecipeUrl(normalizedUrl),
          mealType: "dinner",
          description: "",
          sourceUrl: normalizedUrl,
          tags: [],
          servings: 4,
          ingredients: [],
          steps: [],
        });
      setRecipeForm(fallbackForm);
      setRecipeIngredients([]);
      setRecipeIngredientMode(RECIPE_INGREDIENT_MODES.directory);
      setIngredientPasteText("");
      setIngredientPasteSkippedLines([]);
      setInlineEditingRecipeIngredientIndex(null);
      setInlineRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
      setRecipeDraftBaseline(buildRecipeDraftSnapshot(fallbackForm, [], ""));
      resetNewIngredientForm();
      resetRecipeIngredientForm();
      setWorkflowScreen(WORKFLOW_SCREENS.recipes);
      setLibraryTab(LIBRARY_TABS.recipes);
      setRecipePage(RECIPE_PAGES.create);
      setIsImportModalOpen(false);
      setImportRecipeUrl("");
      showCopyStatus(
        isServer500
          ? "Import service is unavailable right now. Opened a recipe draft with the URL prefilled."
          : error?.message
            || "Import parser could not read this URL. Opened a new recipe draft with the URL prefilled.",
        "error",
      );
    } finally {
      setIsImportingRecipe(false);
    }
  }

  function setPlanningDays(value) {
    setState((prev) => ({
      ...prev,
      planningDays: Math.min(7, Math.max(1, normalizeServings(value, prev.planningDays))),
    }));
    setPlanBasicsErrors((prev) => ({ ...prev, planningDays: "" }));
  }

  function setMealPlanName(value) {
    setState((prev) => ({
      ...prev,
      mealPlanName: String(value || "").slice(0, MAX_MEAL_PLAN_NAME),
    }));
    setPlanBasicsErrors((prev) => ({ ...prev, mealPlanName: "" }));
  }

  function setMealPlanDescription(value) {
    setState((prev) => ({
      ...prev,
      mealPlanDescription: String(value || "").slice(0, MAX_MEAL_PLAN_DESCRIPTION),
    }));
  }

  function setDayNotes(day, value) {
    updateDay(day, (dayPlan) => ({
      ...dayPlan,
      notes: String(value || "").slice(0, MAX_DAY_NOTE_LENGTH),
    }));
  }

  function handleOpenDayMenu(day) {
    setOpenDayMenu((prev) => (prev === day ? "" : day));
  }

  function handleOpenRecipeDetailsModal(recipeId) {
    if (!recipeId || !recipesById[recipeId]) {
      return;
    }
    setOpenMealPickerKey("");
    setRecipeDetailsModalRecipeId(recipeId);
  }

  function handleEditRecipeFromModal(recipeId) {
    const recipe = recipesById[recipeId];
    if (!recipe) {
      showCopyStatus("Recipe not found.", "error");
      return;
    }

    const nextIngredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((ingredient) => ({ ...ingredient }))
      : [];
    const nextForm = recipeToForm(recipe);

    setWorkflowScreen(WORKFLOW_SCREENS.recipes);
    setLibraryTab(LIBRARY_TABS.recipes);
    setRecipePage(RECIPE_PAGES.create);
    setRecipeSearch("");
    setOpenLibraryMenu("");
    setInlineEditingRecipeId(null);
    setInlineRecipeForm(makeRecipeForm());
    setEditingRecipeId(recipe.id);
    setRecipeForm(nextForm);
    setRecipeIngredients(nextIngredients);
    setRecipeIngredientMode(RECIPE_INGREDIENT_MODES.directory);
    setIngredientPasteText("");
    setIngredientPasteSkippedLines([]);
    setInlineEditingRecipeIngredientIndex(null);
    setInlineRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
    setRecipeDraftBaseline(buildRecipeDraftSnapshot(nextForm, nextIngredients, ""));
    resetNewIngredientForm();
    resetRecipeIngredientForm();
    handleCloseRecipeDetailsModal();
  }

  function handleCloseRecipeDetailsModal() {
    setRecipeDetailsModalRecipeId("");
  }

  function handleOpenDayNoteEditor(day) {
    const dayPlan = state.weekPlan[day] || createDefaultDayPlan(state.recipes, DAYS.indexOf(day));
    setNoteEditorDay(day);
    setNoteDraft(String(dayPlan.notes || ""));
    setOpenDayMenu("");
  }

  function handleCloseDayNoteEditor() {
    setNoteEditorDay("");
    setNoteDraft("");
  }

  function handleSaveDayNote() {
    if (!noteEditorDay) {
      return;
    }

    setDayNotes(noteEditorDay, noteDraft);
    showCopyStatus(noteDraft.trim() ? `Note saved for ${noteEditorDay}.` : `Note cleared for ${noteEditorDay}.`, "success");
    handleCloseDayNoteEditor();
  }

  function handleDeleteDayNote(day) {
    setDayNotes(day, "");
    if (noteEditorDay === day) {
      handleCloseDayNoteEditor();
    }
    setOpenDayMenu("");
    showCopyStatus(`Note deleted for ${day}.`, "success");
  }

  function handleToggleDayEdit(day) {
    setExpandedDay((prev) => (prev === day ? "" : day));
    setOpenMealPickerKey("");
    setOpenDayMenu("");
  }

  function handleResetDay(day) {
    updateDay(day, (dayPlan) => ({
      ...dayPlan,
      dayMode: "planned",
      notes: "",
      meals: {
        breakfast: {
          mode: "skip",
          recipeId: null,
          servingsOverride: null,
        },
        lunch: {
          mode: "skip",
          recipeId: null,
          servingsOverride: null,
        },
        dinner: {
          mode: "skip",
          recipeId: null,
          servingsOverride: null,
        },
      },
    }));
    setMealRecipeSearch((prev) => {
      const next = { ...prev };
      MEAL_SLOTS.forEach((mealSlot) => {
        next[`${day}:${mealSlot}`] = "";
      });
      return next;
    });
    if (noteEditorDay === day) {
      handleCloseDayNoteEditor();
    }
    setOpenMealPickerKey((prev) => (prev.startsWith(`${day}:`) ? "" : prev));
    setOpenDayMenu("");
    showCopyStatus(`${day} reset. Meals and note cleared.`, "success");
  }

  function scrollToDayCard(day) {
    const target = dayCardRefs.current[day];
    if (!target) {
      return;
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  function setMealRecipeSearchValue(day, mealSlot, value) {
    const key = `${day}:${mealSlot}`;
    setMealRecipeSearch((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function getRecipesForMeal(day, mealSlot) {
    const key = `${day}:${mealSlot}`;
    const query = normalizeName(mealRecipeSearch[key] || "");
    if (!query) {
      return sortedRecipes;
    }

    return sortedRecipes.filter((recipe) => {
      const titleMatch = normalizeName(recipe.title).includes(query);
      const tagMatch = recipe.tags.some((tag) => normalizeName(tag).includes(query));
      return titleMatch || tagMatch;
    });
  }

  function handleMealRecipePickerSelect(day, mealSlot, recipeId) {
    setMealRecipe(day, mealSlot, recipeId);
    if (recipeId === NO_RECIPE) {
      setMealRecipeSearchValue(day, mealSlot, "");
      setOpenMealPickerKey("");
      return;
    }

    const selected = sortedRecipes.find((recipe) => recipe.id === recipeId);
    setMealRecipeSearchValue(day, mealSlot, selected ? selected.title : "");
    setOpenMealPickerKey("");
  }

  function handleHouseholdServings(value) {
    setState((prev) => ({
      ...prev,
      householdServings: normalizeServings(value, prev.householdServings),
    }));
  }

  function saveIngredientToCatalog(rawName, rawStore, options = {}) {
    const name = normalizeName(rawName);
    const store = pickStore(rawStore, stores);
    const normalizedTag = typeof options.tag === "string"
      ? options.tag.trim().slice(0, MAX_INGREDIENT_TAG_LENGTH)
      : null;
    const allowUnassigned = options.allowUnassigned !== false;
    const overwriteWithUnassigned = Boolean(options.overwriteWithUnassigned);

    if (!name || (!allowUnassigned && store === "Unassigned")) {
      return false;
    }

    setState((prev) => {
      const nextCatalog = { ...(prev.ingredientCatalog || {}) };
      const previous = normalizeIngredientCatalogEntry(
        nextCatalog[name],
        normalizeStoreList(prev.stores),
      );

      nextCatalog[name] = {
        store:
          store === "Unassigned" && previous.store !== "Unassigned" && !overwriteWithUnassigned
            ? previous.store
            : store,
        tag: normalizedTag === null ? previous.tag : normalizedTag,
      };

      return {
        ...prev,
        ingredientCatalog: nextCatalog,
      };
    });

    return true;
  }

  function setRecipeIngredientsAndMirror(nextIngredientsOrUpdater) {
    setRecipeIngredients((prevIngredients) => {
      const nextIngredients = typeof nextIngredientsOrUpdater === "function"
        ? nextIngredientsOrUpdater(prevIngredients)
        : nextIngredientsOrUpdater;
      setRecipeForm((prev) => ({
        ...prev,
        ingredients: ingredientsToText(nextIngredients),
      }));
      return nextIngredients;
    });
  }

  function dismissUndoToast() {
    if (undoToastTimerRef.current) {
      window.clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = null;
    }
    setUndoToast(null);
  }

  function showUndoToast(message, durationMs, onUndo) {
    if (undoToastTimerRef.current) {
      window.clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = null;
    }

    setUndoToast({
      message,
      onUndo,
    });

    undoToastTimerRef.current = window.setTimeout(() => {
      setUndoToast(null);
      undoToastTimerRef.current = null;
    }, durationMs);
  }

  function handleUndoToastAction() {
    if (!undoToast?.onUndo) {
      dismissUndoToast();
      return;
    }

    const undoAction = undoToast.onUndo;
    dismissUndoToast();
    undoAction();
  }

  function resetRecipeIngredientForm() {
    setRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
  }

  function resetNewIngredientForm() {
    setNewIngredientForm(makeNewIngredientForm("Unassigned"));
  }

  function handleRecipeIngredientModeChange(mode) {
    setRecipeIngredientMode(mode);
    resetRecipeIngredientForm();
    setInlineEditingRecipeIngredientIndex(null);
    setInlineRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
    setOpenLibraryMenu("");
    if (mode === RECIPE_INGREDIENT_MODES.custom) {
      resetNewIngredientForm();
    }
  }

  function buildRecipeIngredientFromForm(formValue) {
    return normalizeRecipeIngredientItem(
      {
        name: formValue.name,
        qty: formValue.qty,
        unit: formValue.unit,
        store: formValue.store,
      },
      stores,
    );
  }

  function handleRecipeIngredientNameChange(value) {
    const normalizedName = normalizeName(value);
    const entry = normalizeIngredientCatalogEntry(state.ingredientCatalog?.[normalizedName], stores);

    setRecipeIngredientForm((prev) => ({
      ...prev,
      name: value,
      store: entry.store !== "Unassigned" ? entry.store : (prev.store || assignableStores[0] || "Unassigned"),
    }));
  }

  function handleDirectoryIngredientKeyDown(event) {
    if (event.key === "Enter" && canSaveRecipeIngredient) {
      event.preventDefault();
      handleSaveRecipeIngredient();
    }
  }

  function handleCustomIngredientKeyDown(event) {
    if (event.key !== "Enter" || !canCreateRecipeIngredient) {
      return;
    }
    event.preventDefault();
    handleCreateNewIngredient();
  }

  function handleSaveRecipeIngredient() {
    const normalized = buildRecipeIngredientFromForm(recipeIngredientForm);
    const existsInDirectory = normalized
      ? ingredientDirectory.some((ingredient) => ingredient.name === normalized.name)
      : false;
    if (!normalized || !existsInDirectory) {
      showCopyStatus("Select an ingredient from your directory before adding it.", "error");
      return;
    }

    setRecipeIngredientsAndMirror([...recipeIngredients, normalized]);
    saveIngredientToCatalog(normalized.name, normalized.store, {
      allowUnassigned: true,
      overwriteWithUnassigned: true,
    });
    setInlineEditingRecipeIngredientIndex(null);
    setInlineRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
    setOpenLibraryMenu("");
    showCopyStatus("Ingredient added to recipe.", "success");
    resetRecipeIngredientForm();
  }

  function handleStartInlineRecipeIngredientEdit(index) {
    const ingredient = recipeIngredients[index];
    if (!ingredient) {
      return;
    }

    setOpenLibraryMenu("");
    setInlineEditingRecipeIngredientIndex(index);
    setInlineRecipeIngredientForm({
      name: displayName(ingredient.name),
      qty: String(ingredient.qty ?? 1),
      unit: String(ingredient.unit || "each"),
      store: pickStore(ingredient.store, stores),
    });
  }

  function handleInlineRecipeIngredientFormChange(field, value) {
    if (field === "name") {
      const normalizedName = normalizeName(value);
      const entry = normalizeIngredientCatalogEntry(state.ingredientCatalog?.[normalizedName], stores);
      setInlineRecipeIngredientForm((prev) => ({
        ...prev,
        name: value,
        store: entry.store !== "Unassigned" ? entry.store : (prev.store || assignableStores[0] || "Unassigned"),
      }));
      return;
    }

    setInlineRecipeIngredientForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleCancelInlineRecipeIngredientEdit() {
    setInlineEditingRecipeIngredientIndex(null);
    setInlineRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
  }

  function handleSaveInlineRecipeIngredient(index) {
    if (inlineEditingRecipeIngredientIndex !== index) {
      return;
    }

    const normalized = buildRecipeIngredientFromForm(inlineRecipeIngredientForm);
    if (!normalized) {
      showCopyStatus("Add a valid ingredient name before saving.", "error");
      return;
    }

    setRecipeIngredientsAndMirror((prevIngredients) => {
      if (!prevIngredients[index]) {
        return prevIngredients;
      }
      const next = [...prevIngredients];
      next[index] = normalized;
      return next;
    });
    saveIngredientToCatalog(normalized.name, normalized.store, {
      allowUnassigned: true,
      overwriteWithUnassigned: true,
    });
    handleCancelInlineRecipeIngredientEdit();
    showCopyStatus("Ingredient updated.", "success");
  }

  function handleInlineRecipeIngredientKeyDown(event, index) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSaveInlineRecipeIngredient(index);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelInlineRecipeIngredientEdit();
    }
  }

  function handleRemoveRecipeIngredient(index) {
    const removedIngredient = recipeIngredients[index];
    if (!removedIngredient) {
      return;
    }

    const confirmed = window.confirm(`Delete ingredient "${displayName(removedIngredient.name)}"?`);
    if (!confirmed) {
      return;
    }
    setOpenLibraryMenu("");

    const nextIngredients = recipeIngredients.filter((_, currentIndex) => currentIndex !== index);
    setRecipeIngredientsAndMirror(nextIngredients);

    if (inlineEditingRecipeIngredientIndex === index) {
      handleCancelInlineRecipeIngredientEdit();
    } else if (inlineEditingRecipeIngredientIndex !== null && inlineEditingRecipeIngredientIndex > index) {
      setInlineEditingRecipeIngredientIndex((prev) => (prev === null ? null : prev - 1));
    }

    showUndoToast("Ingredient removed from recipe.", 6000, () => {
      setRecipeIngredientsAndMirror((prevIngredients) => {
        const safeIndex = Math.min(index, prevIngredients.length);
        const next = [...prevIngredients];
        next.splice(safeIndex, 0, removedIngredient);
        return next;
      });
      showCopyStatus("Ingredient restored.", "success");
    });
    showCopyStatus("Ingredient removed from recipe.", "success");
  }

  async function handleCopyRecipeIngredientName(index) {
    const ingredient = recipeIngredients[index];
    if (!ingredient) {
      return;
    }
    setOpenLibraryMenu("");
    await copyTextAndReport(displayName(ingredient.name), "Ingredient name copied.");
  }

  function handleCreateNewIngredient() {
    const normalized = buildRecipeIngredientFromForm(newIngredientForm);
    if (!normalized) {
      showCopyStatus("New ingredient requires at least a name.", "error");
      return;
    }

    saveIngredientToCatalog(normalized.name, normalized.store, {
      allowUnassigned: true,
      overwriteWithUnassigned: true,
    });

    setRecipeIngredientsAndMirror([...recipeIngredients, normalized]);
    setInlineEditingRecipeIngredientIndex(null);
    setInlineRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
    setOpenLibraryMenu("");
    showCopyStatus("Created ingredient and added it to the recipe.", "success");
    resetNewIngredientForm();
  }

  function handleGenerateIngredients() {
    const { ingredients: parsed, skippedLines } = parseIngredientsWithDiagnostics(
      ingredientPasteText,
      state.ingredientCatalog,
      stores,
    );
    setIngredientPasteSkippedLines(skippedLines);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      showCopyStatus("Paste ingredient lines first, then generate.", "error");
      return;
    }

    parsed.forEach((ingredient) => {
      saveIngredientToCatalog(ingredient.name, ingredient.store, {
        allowUnassigned: true,
        overwriteWithUnassigned: false,
      });
    });

    setRecipeIngredientsAndMirror([...recipeIngredients, ...parsed]);
    setIngredientPasteText("");
    showCopyStatus(`Generated ${parsed.length} ingredient${parsed.length === 1 ? "" : "s"}.`, "success");
  }

  function resetRecipeEditor() {
    const nextForm = makeRecipeForm();
    setRecipeForm(nextForm);
    setEditingRecipeId(null);
    setRecipeIngredients([]);
    setRecipeIngredientMode(RECIPE_INGREDIENT_MODES.directory);
    setIngredientPasteText("");
    setIngredientPasteSkippedLines([]);
    setOpenLibraryMenu("");
    setInlineEditingRecipeIngredientIndex(null);
    setInlineRecipeIngredientForm(makeRecipeIngredientForm(assignableStores[0] || "Unassigned"));
    setRecipeDraftBaseline(buildRecipeDraftSnapshot(nextForm, [], ""));
    resetNewIngredientForm();
    resetRecipeIngredientForm();
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

  function saveRecipeDraft() {
    const isEditing = Boolean(editingRecipeId);
    const built = buildRecipeFromForm(recipeForm, recipeIngredients, stores, editingRecipeId);
    if (!built.recipe) {
      showCopyStatus(built.error || "Unable to save recipe.", "error");
      return false;
    }

    upsertRecipe(built.recipe);
    setRecipeDraftBaseline(buildRecipeDraftSnapshot(recipeForm, recipeIngredients, ingredientPasteText));
    showCopyStatus(
      isEditing ? "Recipe updated successfully." : "Recipe added successfully.",
      "success",
    );
    setRecipePage(RECIPE_PAGES.list);
    setLibraryTab(LIBRARY_TABS.recipes);
    setRecipeSearch("");
    resetRecipeEditor();
    return true;
  }

  function handleRecipeSubmit(event) {
    event.preventDefault();
    saveRecipeDraft();
  }

  function handleCancelRecipeDraft() {
    if (isRecipeDraftDirty) {
      const confirmed = window.confirm("Discard unsaved recipe changes?");
      if (!confirmed) {
        return;
      }
    }
    resetRecipeEditor();
    setRecipePage(RECIPE_PAGES.list);
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

    setOpenLibraryMenu("");
    upsertRecipe(duplicate);
    showCopyStatus("Recipe duplicated.", "success");
  }

  function handleInlineRecipeEdit(recipeId) {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) {
      showCopyStatus("Recipe not found.", "error");
      return;
    }
    setOpenLibraryMenu("");
    setInlineEditingRecipeId(recipeId);
    setInlineRecipeForm(recipeToForm(recipe));
  }

  function handleInlineRecipeSave(recipeId) {
    if (!inlineEditingRecipeId || inlineEditingRecipeId !== recipeId) {
      return;
    }

    const parsedIngredients = parseIngredients(
      inlineRecipeForm.ingredients,
      state.ingredientCatalog,
      stores,
    );
    const built = buildRecipeFromForm(inlineRecipeForm, parsedIngredients, stores, recipeId);
    if (!built.recipe) {
      showCopyStatus(built.error || "Unable to save recipe.", "error");
      return;
    }

    upsertRecipe(built.recipe);
    setInlineEditingRecipeId(null);
    setInlineRecipeForm(makeRecipeForm());
    showCopyStatus("Recipe updated successfully.", "success");
  }

  function handleInlineRecipeCancel() {
    setInlineEditingRecipeId(null);
    setInlineRecipeForm(makeRecipeForm());
  }

  function handleRecipeDelete(recipeId) {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) {
      return;
    }
    const deleteSnapshot = {
      recipes: state.recipes.map((item) => ({
        ...item,
        ingredients: Array.isArray(item.ingredients) ? item.ingredients.map((ingredient) => ({ ...ingredient })) : [],
        steps: Array.isArray(item.steps) ? [...item.steps] : [],
      })),
      weekPlan: cloneWeekPlan(state.weekPlan),
    };

    const confirmed = window.confirm(`Delete recipe "${recipe.title}"?`);
    if (!confirmed) {
      return;
    }
    setOpenLibraryMenu("");

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
    if (inlineEditingRecipeId === recipeId) {
      setInlineEditingRecipeId(null);
      setInlineRecipeForm(makeRecipeForm());
    }

    showUndoToast(`Deleted "${recipe.title}".`, 8000, () => {
      setState((prev) => ({
        ...prev,
        recipes: deleteSnapshot.recipes,
        weekPlan: deleteSnapshot.weekPlan,
      }));
      showCopyStatus(`Restored "${recipe.title}".`, "success");
    });
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
    setOpenLibraryMenu("");
    showCopyStatus(
      `Added recipe to ${day} ${MEAL_SLOT_LABELS[quickPlanMealSlot].toLowerCase()}.`,
      "success",
    );
  }

  function resetIngredientForm() {
    setIngredientForm({
      name: "",
      tag: "",
      store: "Unassigned",
    });
    setEditingIngredientName("");
    setIsAddingIngredient(false);
  }

  function handleStartIngredientCreate() {
    setOpenLibraryMenu("");
    setEditingIngredientName("");
    setIsAddingIngredient(true);
    setIngredientForm({
      name: "",
      tag: "",
      store: "Unassigned",
    });
  }

  function handleIngredientSubmit() {
    const tag = String(ingredientForm.tag || "").trim().slice(0, MAX_INGREDIENT_TAG_LENGTH);
    const name = normalizeName(ingredientForm.name);
    const store = pickStore(ingredientForm.store, stores);
    const saved = saveIngredientToCatalog(name, store, {
      tag,
      allowUnassigned: true,
      overwriteWithUnassigned: true,
    });
    if (!saved) {
      showCopyStatus("Add a name to save this ingredient.", "error");
      return;
    }

    if (editingIngredientName && editingIngredientName !== name && !isAddingIngredient) {
      setState((prev) => {
        const nextCatalog = { ...(prev.ingredientCatalog || {}) };
        delete nextCatalog[editingIngredientName];
        return {
          ...prev,
          ingredientCatalog: nextCatalog,
        };
      });
    }

    showCopyStatus(
      editingIngredientName && !isAddingIngredient
        ? "Ingredient updated successfully."
        : "Ingredient saved successfully.",
      "success",
    );
    resetIngredientForm();
  }

  function handleIngredientEdit(name) {
    setOpenLibraryMenu("");
    const normalizedName = normalizeName(name);
    const entry = normalizeIngredientCatalogEntry(state.ingredientCatalog?.[normalizedName], stores);
    setEditingIngredientName(normalizedName);
    setIsAddingIngredient(false);
    setIngredientForm({
      name: displayName(normalizedName),
      tag: entry.tag,
      store: entry.store,
    });
  }

  async function handleIngredientCopy(name) {
    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      return;
    }
    setOpenLibraryMenu("");
    await copyTextAndReport(displayName(normalizedName), "Ingredient name copied.");
  }

  function handleIngredientDelete(name) {
    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      return;
    }

    const ingredientLabel = displayName(normalizedName);
    const confirmed = window.confirm(`Delete ingredient "${ingredientLabel}"?`);
    if (!confirmed) {
      return;
    }

    setOpenLibraryMenu("");
    setState((prev) => {
      const nextCatalog = { ...(prev.ingredientCatalog || {}) };
      delete nextCatalog[normalizedName];
      return {
        ...prev,
        ingredientCatalog: nextCatalog,
      };
    });
    if (editingIngredientName === normalizedName) {
      resetIngredientForm();
    }
    if (isAddingIngredient && normalizeName(ingredientForm.name) === normalizedName) {
      resetIngredientForm();
    }
    showCopyStatus("Ingredient removed from directory.", "success");
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

  function handleReceiptSourceClick(day) {
    setExpandedDay(day);
    setOpenDayMenu("");
    if (isMobileReceiptOpen) {
      setIsMobileReceiptOpen(false);
      window.setTimeout(() => {
        scrollToDayCard(day);
      }, 200);
      return;
    }
    scrollToDayCard(day);
  }

  const visibleStores = selectedStores.length > 0 ? selectedStores : stores;
  const hasVisibleGroceries = visibleStores.some((store) => (groupedGroceries[store] || []).length > 0);
  const liveReceiptStores = useMemo(
    () => stores.filter((store) => (groupedGroceries[store] || []).length > 0),
    [groupedGroceries, stores],
  );
  const liveReceiptItemCount = useMemo(
    () =>
      liveReceiptStores.reduce(
        (count, store) => count + (groupedGroceries[store] || []).length,
        0,
      ),
    [groupedGroceries, liveReceiptStores],
  );
  const receiptSourceMap = useMemo(() => {
    const sourceMap = new Map();

    activeDays.forEach((day, dayIndex) => {
      const dayPlan = state.weekPlan[day] || createDefaultDayPlan(state.recipes, dayIndex);
      MEAL_SLOTS.forEach((mealSlot) => {
        const mealPlan = dayPlan.meals?.[mealSlot];
        if (!mealPlan || mealPlan.mode !== "recipe" || !mealPlan.recipeId) {
          return;
        }

        const recipe = recipesById[mealPlan.recipeId];
        if (!recipe || !Array.isArray(recipe.ingredients)) {
          return;
        }

        recipe.ingredients.forEach((ingredient) => {
          const name = normalizeName(ingredient.name);
          if (!name) {
            return;
          }

          const unit = normalizeUnit(ingredient.unit || "each");
          const catalogStore = normalizeIngredientCatalogEntry(
            state.ingredientCatalog?.[name],
            stores,
          ).store;
          const store = ingredient.store !== "Unassigned"
            ? pickStore(ingredient.store, stores)
            : catalogStore;
          const key = getReceiptItemKey(store, name, unit);
          const sourceKey = `${day}:${mealSlot}`;
          const existingSources = sourceMap.get(key) || [];
          if (existingSources.some((source) => source.sourceKey === sourceKey)) {
            return;
          }

          sourceMap.set(key, [
            ...existingSources,
            {
              sourceKey,
              day,
              mealSlot,
              label: `${toShortDayLabel(day)} ${MEAL_SLOT_LABELS[mealSlot]}`,
            },
          ]);
        });
      });
    });

    return sourceMap;
  }, [activeDays, recipesById, state.ingredientCatalog, state.recipes, state.weekPlan, stores]);

  useEffect(() => {
    if (previousReceiptCountRef.current === null) {
      previousReceiptCountRef.current = liveReceiptItemCount;
      return;
    }

    const delta = calculateReceiptDelta(previousReceiptCountRef.current, liveReceiptItemCount);
    previousReceiptCountRef.current = liveReceiptItemCount;
    if (delta === 0) {
      return;
    }

    setReceiptDelta({
      value: delta,
      label: `${delta > 0 ? "+" : ""}${delta} item${Math.abs(delta) === 1 ? "" : "s"}`,
    });

    if (receiptDeltaTimerRef.current) {
      window.clearTimeout(receiptDeltaTimerRef.current);
    }
    receiptDeltaTimerRef.current = window.setTimeout(() => {
      setReceiptDelta(null);
      receiptDeltaTimerRef.current = null;
    }, 2000);
  }, [liveReceiptItemCount]);

  const liveReceiptPanelContent = (
    <>
      <div className="mb-3 border-b border-emerald-200 pb-3">
        <p className="text-xs font-medium text-emerald-900/70">
          Live Grocery Receipt
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-sm font-semibold text-emerald-950">
            {liveReceiptItemCount} item{liveReceiptItemCount === 1 ? "" : "s"} so far
          </p>
          {receiptDelta ? (
            <span
              className={
                receiptDelta.value > 0
                  ? "rounded-full border border-emerald-400 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                  : "rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700"
              }
            >
              {receiptDelta.label}
            </span>
          ) : null}
        </div>
      </div>
      {liveReceiptStores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add recipes to start building your shopping list.
        </p>
      ) : (
        <div className="space-y-3">
          {liveReceiptStores.map((store) => (
            <section key={`receipt-${store}`} className="space-y-1 rounded-md border border-border/70 bg-white p-2">
              <p className="text-xs font-medium text-muted-foreground">
                {store}
              </p>
              <ul className="space-y-1">
                {(groupedGroceries[store] || []).slice(0, 10).map((item) => {
                  const sources =
                    receiptSourceMap.get(getReceiptItemKey(store, item.name, item.unit)) || [];
                  return (
                    <li key={`receipt-${store}-${item.name}-${item.unit}`} className="rounded-md bg-zinc-50/30 p-1.5 text-xs">
                      <p>{formatItem(item)}</p>
                      {sources.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {sources.slice(0, 3).map((source) => (
                            <button
                              key={`${store}-${item.name}-${item.unit}-${source.sourceKey}`}
                              type="button"
                              className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:border-emerald-400"
                              onClick={() => handleReceiptSourceClick(source.day)}
                            >
                              {source.label}
                            </button>
                          ))}
                          {sources.length > 3 ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                              +{sources.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {(groupedGroceries[store] || []).length > 10 ? (
                  <li className="text-xs text-muted-foreground">
                    +{(groupedGroceries[store] || []).length - 10} more
                  </li>
                ) : null}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );

  const previousMenus = menuHistory.slice(0, MAX_PREVIOUS_MENUS);

  const isPlannerWorkflow = workflowScreen === WORKFLOW_SCREENS.planner;
  const isRecipeWorkflow = workflowScreen === WORKFLOW_SCREENS.recipes;
  const isRecipesTab = isRecipeWorkflow && libraryTab === LIBRARY_TABS.recipes;
  const isIngredientsTab = isRecipeWorkflow && libraryTab === LIBRARY_TABS.ingredients;
  const activePlanName = normalizePlanName(state.mealPlanName);
  const isStep1ReadOnly = isPlannerWorkflow && planBasicsLocked;
  const breadcrumbs = useMemo(() => {
    if (isPlannerWorkflow) {
      if (plannerStep >= 3) {
        return ["Meal plan", "Grocery list"];
      }
      if (plannerStep >= 2) {
        return ["Meal plan", "Day setup"];
      }
      return ["Meal plan", "Plan basics"];
    }

    if (isIngredientsTab) {
      return ["Ingredients", editingIngredientName ? "Edit ingredient" : "Directory"];
    }

    if (isRecipesTab) {
      if (isRecipeCreatePage) {
        return ["Recipes", recipeEditorModeLabel];
      }
      return ["Recipes", "List"];
    }

    return ["Home"];
  }, [
    editingIngredientName,
    editingRecipeId,
    isIngredientsTab,
    isPlannerWorkflow,
    isRecipeCreatePage,
    isRecipesTab,
    recipeEditorModeLabel,
    plannerStep,
  ]);

  const topNav = (
    <section className="rounded-md border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700"
          onClick={handleOpenHome}
          aria-label="Go to home"
        >
          <div className="relative h-5 w-5">
            <Leaf className="absolute -left-0.5 -top-0.5 h-3.5 w-3.5" aria-hidden="true" />
            <UtensilsCrossed className="absolute bottom-0 right-0 h-3.5 w-3.5" aria-hidden="true" />
          </div>
        </button>

        <div className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50/60 p-0.5">
          <Button
            type="button"
            size="sm"
            variant={isPlannerWorkflow ? "default" : "ghost"}
            className={isPlannerWorkflow ? "" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"}
            onClick={handleOpenPlannerWorkflow}
          >
            Meal plan
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isRecipeWorkflow ? "default" : "ghost"}
            className={isRecipeWorkflow ? "" : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"}
            onClick={handleOpenRecipeLibrary}
          >
            Recipes
          </Button>
        </div>

        <div ref={landingAddRecipeMenuRef} className="relative flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleStartNewMealPlan}>
            New plan
          </Button>
          <div className="relative inline-flex">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-r-none border-r-0"
              onClick={handleCreateRecipeFlow}
            >
              Add recipe
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              ref={landingAddRecipeTriggerRef}
              className="h-9 w-9 rounded-l-none border-zinc-200 p-0"
              aria-haspopup="menu"
              aria-expanded={isLandingAddRecipeMenuOpen}
              aria-label="Open add recipe options"
              onClick={() => setIsLandingAddRecipeMenuOpen((prev) => !prev)}
            >
              <ChevronDown
                className={
                  isLandingAddRecipeMenuOpen
                    ? "h-4 w-4 rotate-180 transition-transform"
                    : "h-4 w-4 transition-transform"
                }
                aria-hidden="true"
              />
            </Button>
            {isLandingAddRecipeMenuOpen ? (
              <div
                className="absolute right-0 top-11 z-20 w-48 rounded-md border border-zinc-200 bg-white p-1.5 shadow-md"
                role="menu"
                aria-label="Add recipe options"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                  onClick={handleCreateRecipeFlow}
                >
                  Manual
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                  onClick={openRecipeImportModal}
                >
                  Import from URL
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );

  if (workflowScreen === WORKFLOW_SCREENS.landing) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl space-y-4 px-4 py-6 md:px-8 md:py-10">
        {topNav}
        <section className="rounded-md border border-zinc-200/80 bg-white p-5 shadow-sm md:p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
                Meal planner
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Build your weekly plan, organize recipes, and generate grocery lists.
              </p>

              <div className="flex max-w-md flex-wrap items-center gap-4">
                <button
                  type="button"
                  className="inline-flex items-end gap-2 text-left transition hover:text-zinc-950"
                  onClick={handleOpenRecipeLibrary}
                >
                  <p className="text-xl font-semibold leading-none text-zinc-900">{sortedRecipes.length}</p>
                  <p className="text-xs font-medium text-muted-foreground">Recipes</p>
                </button>
                <span className="h-5 w-px bg-border/80" aria-hidden="true" />
                <button
                  type="button"
                  className="inline-flex items-end gap-2 text-left transition hover:text-zinc-950"
                  onClick={handleOpenIngredientLibrary}
                >
                  <p className="text-xl font-semibold leading-none text-zinc-900">{ingredientDirectory.length}</p>
                  <p className="text-xs font-medium text-muted-foreground">Ingredients</p>
                </button>
              </div>
            </div>

            <aside className="rounded-md border border-zinc-200/70 bg-zinc-50/40 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                This week&apos;s menu
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Current menu</p>
                  <button
                    type="button"
                    className="mt-1 text-sm font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-4 transition hover:text-zinc-950"
                    onClick={handleOpenCurrentMenu}
                  >
                    Open this week&apos;s menu
                  </button>
                </div>
                <div className="h-px bg-border/80" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Previous menus</p>
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
                            className="text-sm font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-4 transition hover:text-zinc-950"
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

        {isImportModalOpen ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Close import modal"
              className="absolute inset-0 bg-zinc-950/35"
              onClick={closeRecipeImportModal}
            />
            <Card className="relative z-10 w-full max-w-lg border-zinc-200/80 bg-white shadow-lg">
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl text-emerald-950">Import recipe from URL</CardTitle>
                <CardDescription>
                  Paste a recipe URL and we&apos;ll prefill the recipe editor.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleImportRecipeSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="import-recipe-url">Recipe URL</Label>
                    <Input
                      id="import-recipe-url"
                      type="url"
                      placeholder="https://example.com/recipe"
                      value={importRecipeUrl}
                      onChange={(event) => setImportRecipeUrl(event.target.value)}
                      disabled={isImportingRecipe}
                      required
                    />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={closeRecipeImportModal} disabled={isImportingRecipe}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isImportingRecipe}>
                      {isImportingRecipe ? "Importing..." : "Add"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-4 px-4 py-6 md:px-8 md:py-10">
      {topNav}

      <section className="rounded-md border border-zinc-200/80 bg-white px-4 py-5 shadow-sm md:px-6 md:py-6">
        <div className="space-y-5">
          <nav aria-label="Breadcrumb" className="text-xs">
            <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const key = `${crumb}-${index}`;
                const crumbClass = isLast
                  ? "font-medium text-foreground"
                  : "font-medium text-muted-foreground transition hover:text-foreground";
                const separator = index > 0 ? <span className="px-0.5 text-muted-foreground">/</span> : null;

                const action =
                  !isLast && crumb === "Meal plan"
                    ? handleOpenPlannerWorkflow
                    : !isLast && crumb === "Recipes"
                      ? handleOpenRecipeLibrary
                      : !isLast && crumb === "Ingredients"
                        ? handleOpenIngredientLibrary
                        : null;

                return (
                  <li key={key} className="flex items-center">
                    {separator}
                    {action ? (
                      <button type="button" className={crumbClass} onClick={action}>
                        {crumb}
                      </button>
                    ) : (
                      <span className={crumbClass}>{crumb}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          <section className="space-y-1">
            <h1 className="max-w-4xl text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {isPlannerWorkflow
                ? activePlanName || "Meal plan setup"
                : isIngredientsTab
                  ? "Ingredient directory"
                  : isRecipeCreatePage
                    ? recipeEditorModeLabel
                    : "Recipe library"}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {isPlannerWorkflow
                ? "Start with plan basics, then set up days and meals."
                : "Manage recipes and ingredients from one place."}
            </p>
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
        <Card className="rounded-md border border-zinc-200/80 bg-white shadow-sm">
          <CardHeader className="gap-2">
            <div>
              <CardTitle className="text-lg text-emerald-950">Plan basics</CardTitle>
              <CardDescription className="mt-1 text-emerald-900/70">
                Name the plan and day count before day setup.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {isStep1ReadOnly ? (
              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-sm border border-border/60 bg-white/70 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Meal plan name</p>
                  <p className="mt-1 text-sm font-semibold">{state.mealPlanName || "-"}</p>
                </article>
                <article className="rounded-sm border border-border/60 bg-white/70 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Days in plan</p>
                  <p className="mt-1 text-sm font-semibold">{planningDays}</p>
                </article>
                <article className="rounded-sm border border-border/60 bg-white/70 p-3 md:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">Description</p>
                  <p className="mt-1 text-sm">{state.mealPlanDescription || "No description."}</p>
                </article>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button type="button" variant="outline" onClick={handleEditPlanBasics}>
                    Edit
                  </Button>
                  <Button type="button" variant="outline" onClick={handleStartNewMealPlan}>
                    Reset
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="meal-plan-name">Meal plan name</Label>
                  <Input
                    id="meal-plan-name"
                    maxLength={MAX_MEAL_PLAN_NAME}
                    placeholder="Weeknight Dinners"
                    value={state.mealPlanName || ""}
                    aria-invalid={Boolean(planBasicsErrors.mealPlanName)}
                    className={planBasicsErrors.mealPlanName ? "border-destructive/70" : ""}
                    onChange={(event) => setMealPlanName(event.target.value)}
                  />
                  {planBasicsErrors.mealPlanName ? (
                    <p className="text-xs font-semibold text-destructive">{planBasicsErrors.mealPlanName}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planning-days">Days in plan</Label>
                  <Input
                    id="planning-days"
                    type="number"
                    min="1"
                    max="7"
                    step="1"
                    value={planningDays}
                    aria-invalid={Boolean(planBasicsErrors.planningDays)}
                    className={planBasicsErrors.planningDays ? "border-destructive/70" : ""}
                    onChange={(event) => setPlanningDays(event.target.value)}
                  />
                  {planBasicsErrors.planningDays ? (
                    <p className="text-xs font-semibold text-destructive">{planBasicsErrors.planningDays}</p>
                  ) : null}
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
                  <Button type="button" onClick={handleContinueToDaySetup}>
                    Continue
                  </Button>
                  <Button type="button" variant="outline" onClick={handleStartNewMealPlan}>
                    Reset
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
          ) : null}

          {isPlannerWorkflow && plannerStep >= 2 ? (
        <Card className="rounded-md border border-zinc-200/80 bg-white shadow-sm">
          <CardHeader className="gap-3 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-lg text-emerald-950">Day setup</CardTitle>
              <CardDescription className="text-emerald-900/70">
                Set meals by day with quick day actions and live grocery feedback.
              </CardDescription>
            </div>
            <div className="grid gap-2 sm:max-w-md sm:grid-cols-1 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="household-servings">Household servings</Label>
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
          <CardContent className="pt-2">
            <div className="grid gap-4 xl:grid-cols-[3fr_1fr]">
              <section className="space-y-3">
                {activeDays.map((day, dayIndex) => {
                  const dayPlan = state.weekPlan[day] || createDefaultDayPlan(state.recipes, dayIndex);
                  const isExpanded = expandedDay === day;
                  const noteText = String(dayPlan.notes || "").trim();
                  const plannedRecipeMeals = MEAL_SLOTS.reduce((count, mealSlot) => {
                    const mealPlan = dayPlan.meals?.[mealSlot];
                    if (!mealPlan || mealPlan.mode !== "recipe" || !mealPlan.recipeId) {
                      return count;
                    }
                    return count + 1;
                  }, 0);
                  const dayIngredientCount = MEAL_SLOTS.reduce((count, mealSlot) => {
                    const mealPlan = dayPlan.meals?.[mealSlot];
                    if (!mealPlan || mealPlan.mode !== "recipe" || !mealPlan.recipeId) {
                      return count;
                    }
                    const recipe = recipesById[mealPlan.recipeId];
                    return count + (Array.isArray(recipe?.ingredients) ? recipe.ingredients.length : 0);
                  }, 0);

                  return (
                    <article
                      key={day}
                      ref={(node) => {
                        if (node) {
                          dayCardRefs.current[day] = node;
                        } else {
                          delete dayCardRefs.current[day];
                        }
                      }}
                      className="rounded-md border border-zinc-200/80 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xl font-semibold tracking-tight text-emerald-950">{day}</p>
                          <p className="mt-1 text-xs text-emerald-900/75">
                            {plannedRecipeMeals} recipe meal{plannedRecipeMeals === 1 ? "" : "s"} planned •{" "}
                            {dayIngredientCount} ingredient{dayIngredientCount === 1 ? "" : "s"} selected
                          </p>
                          {noteText ? (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              Note: {noteText}
                            </p>
                          ) : null}
                        </div>

                        <div className="relative flex items-center gap-2">
                          <DayActionMenu
                            day={day}
                            isEditing={isExpanded}
                            isOpen={openDayMenu === day}
                            noteText={noteText}
                            onToggle={() => handleOpenDayMenu(day)}
                            onClose={() => setOpenDayMenu("")}
                            onToggleEdit={() => handleToggleDayEdit(day)}
                            onResetDay={() => handleResetDay(day)}
                            onOpenNoteEditor={() => handleOpenDayNoteEditor(day)}
                          />
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mt-3 space-y-2">
                          <div className="grid gap-3">
                            {MEAL_SLOTS.map((mealSlot) => {
                              const mealPlan = dayPlan.meals?.[mealSlot] || {
                                mode: "skip",
                                recipeId: null,
                                servingsOverride: null,
                              };
                              const enabled = mealPlan.mode !== "skip";
                              const mealKey = `${day}:${mealSlot}`;
                              const mealSearchValue = mealRecipeSearch[mealKey] || "";
                              const recipeOptions = getRecipesForMeal(day, mealSlot);
                              const selectedRecipe = mealPlan.recipeId ? recipesById[mealPlan.recipeId] : null;
                              const mealPickerOpen = openMealPickerKey === mealKey;
                              const mealPickerValue = mealSearchValue || (selectedRecipe ? selectedRecipe.title : "");

                              return (
                                <div
                                  key={`${day}-${mealSlot}`}
                                  className="grid gap-2 rounded-md border border-zinc-200/70 bg-white p-2 md:grid-cols-[120px_120px_1fr_96px]"
                                >
                                  <div className="space-y-1">
                                    <p className="text-sm font-semibold">{MEAL_SLOT_LABELS[mealSlot]}</p>
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Checkbox
                                        checked={enabled}
                                        onCheckedChange={(value) =>
                                          setMealEnabled(day, mealSlot, Boolean(value))
                                        }
                                      />
                                      Include
                                    </label>
                                  </div>

                                  <div className="space-y-1">
                                    <Label htmlFor={`meal-mode-${day}-${mealSlot}`}>Type</Label>
                                    <Select
                                      value={mealPlan.mode || "skip"}
                                      disabled={!enabled}
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
                                    <div className="space-y-1" data-meal-picker="true">
                                      <Label htmlFor={`meal-search-${day}-${mealSlot}`}>Recipe</Label>
                                      <div className="relative">
                                        <Input
                                          id={`meal-search-${day}-${mealSlot}`}
                                          placeholder="Search by recipe or tag"
                                          role="combobox"
                                          aria-expanded={mealPickerOpen}
                                          aria-controls={`meal-picker-options-${day}-${mealSlot}`}
                                          value={mealPickerValue}
                                          onFocus={() => {
                                            if (!mealSearchValue && selectedRecipe) {
                                              setMealRecipeSearchValue(day, mealSlot, selectedRecipe.title);
                                            }
                                            setOpenMealPickerKey(mealKey);
                                          }}
                                          onClick={() => setOpenMealPickerKey(mealKey)}
                                          onChange={(event) => {
                                            setMealRecipeSearchValue(day, mealSlot, event.target.value);
                                            setOpenMealPickerKey(mealKey);
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Escape") {
                                              setOpenMealPickerKey("");
                                              return;
                                            }
                                            if (event.key === "Enter" && mealPickerOpen && recipeOptions.length > 0) {
                                              event.preventDefault();
                                              handleMealRecipePickerSelect(day, mealSlot, recipeOptions[0].id);
                                            }
                                          }}
                                        />
                                        {mealPickerOpen ? (
                                          <div
                                            id={`meal-picker-options-${day}-${mealSlot}`}
                                            role="listbox"
                                            className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white p-1.5 shadow-md"
                                          >
                                            <button
                                              type="button"
                                              role="option"
                                              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                                              onClick={() => handleMealRecipePickerSelect(day, mealSlot, NO_RECIPE)}
                                            >
                                              <span>No recipe selected</span>
                                            </button>
                                            {recipeOptions.length > 0 ? (
                                              recipeOptions.map((recipe) => (
                                                <button
                                                  key={recipe.id}
                                                  type="button"
                                                  role="option"
                                                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                                                  onClick={() =>
                                                    handleMealRecipePickerSelect(day, mealSlot, recipe.id)
                                                  }
                                                >
                                                  <span className="truncate pr-2">{recipe.title}</span>
                                                  <span className="shrink-0 text-xs text-muted-foreground">
                                                    {recipe.servings} servings
                                                  </span>
                                                </button>
                                              ))
                                            ) : (
                                              <p className="px-2 py-2 text-xs text-muted-foreground">
                                                No matching recipes.
                                              </p>
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                      {selectedRecipe ? (
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-800/80">
                                          <p>
                                            {(selectedRecipe.ingredients || []).length} ingredients •{" "}
                                            {(selectedRecipe.steps || []).length} steps
                                          </p>
                                          <button
                                            type="button"
                                            className="font-semibold underline decoration-emerald-500 underline-offset-4 transition hover:text-emerald-950"
                                            onClick={() => handleOpenRecipeDetailsModal(selectedRecipe.id)}
                                          >
                                            View full recipe
                                          </button>
                                        </div>
                                      ) : null}
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
                                      disabled={!enabled || mealPlan.mode !== "recipe"}
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
                        </div>
                      ) : null}
                    </article>
                  );
                })}

                <div className="rounded-sm border border-primary/20 bg-primary/5 p-3 text-sm text-primary/90">
                  Balance: {weekBalance.plannedMeals} recipe meals, {weekBalance.quickMeals} quick
                  meals, {weekBalance.proteinMeals} high-protein meals, and {weekBalance.leftoversMeals}{" "}
                  leftovers slots across {weekBalance.planningDays} days.
                </div>
              </section>

              <aside className="hidden rounded-md border border-zinc-200/70 bg-zinc-50/40 p-4 shadow-sm xl:sticky xl:top-4 xl:block xl:h-fit">
                {liveReceiptPanelContent}
              </aside>
            </div>
            <div className="xl:hidden">
              <Button
                type="button"
                className="fixed bottom-4 right-4 z-30 rounded-full bg-emerald-700 px-4 py-2 text-white shadow-md hover:bg-emerald-700/90"
                onClick={() => setIsMobileReceiptOpen(true)}
              >
                Shopping list ({liveReceiptItemCount})
              </Button>
              <MobileSheet
                open={isMobileReceiptOpen}
                onClose={() => setIsMobileReceiptOpen(false)}
                title="Shopping list"
              >
                {liveReceiptPanelContent}
              </MobileSheet>
            </div>
          </CardContent>
        </Card>
          ) : null}

          {isRecipeWorkflow ? (
        <>
          {!isRecipeCreatePage ? (
            <Card className="border-zinc-200/70 bg-white shadow-sm">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={isRecipesTab ? "default" : "outline"}
                  onClick={() => {
                    if (isRecipeCreatePage) {
                      handleCancelRecipeDraft();
                      return;
                    }
                    setLibraryTab(LIBRARY_TABS.recipes);
                    setRecipePage(RECIPE_PAGES.list);
                    setOpenLibraryMenu("");
                    handleInlineRecipeCancel();
                    resetIngredientForm();
                  }}
                >
                  Recipes ({sortedRecipes.length})
                </Button>
                <Button
                  type="button"
                  variant={isIngredientsTab ? "default" : "outline"}
                  onClick={() => {
                    if (isRecipeCreatePage && isRecipeDraftDirty) {
                      const confirmed = window.confirm("Discard unsaved recipe changes?");
                      if (!confirmed) {
                        return;
                      }
                    }
                    if (isRecipeCreatePage) {
                      resetRecipeEditor();
                    }
                    setLibraryTab(LIBRARY_TABS.ingredients);
                    setOpenLibraryMenu("");
                    handleInlineRecipeCancel();
                    setRecipePage(RECIPE_PAGES.list);
                  }}
                >
                  Ingredients ({ingredientDirectory.length})
                </Button>
              </div>

              {isRecipesTab ? (
                isRecipeCreatePage ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelRecipeDraft}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Back to Recipes
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => {
                      resetRecipeEditor();
                      setRecipePage(RECIPE_PAGES.create);
                    }}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Recipe
                  </Button>
                )
              ) : (
                <Button type="button" onClick={handleStartIngredientCreate}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Ingredient
                </Button>
              )}
            </CardContent>
            </Card>
          ) : null}

          {isRecipesTab ? (
            <Card ref={recipeListRef}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {isRecipeCreatePage ? recipeEditorModeLabel : "Recipe library"}
                </CardTitle>
                <CardDescription>
                  Manage recipes in a list with inline edit, copy, and delete actions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {isRecipeCreatePage ? (
                  <form className="grid gap-4 pb-28 md:grid-cols-2 md:pb-4" onSubmit={handleRecipeSubmit}>
                    <div className="order-first hidden md:sticky md:top-3 md:z-20 md:col-span-2 md:flex md:items-center md:justify-between md:rounded-md md:border md:border-emerald-200 md:bg-white md:p-3 md:shadow-sm md:backdrop-blur">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-emerald-950">
                          {recipeDraftModeLabel}
                        </p>
                        {isRecipeDraftDirty ? (
                          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Unsaved changes
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={handleCancelRecipeDraft}>
                          Cancel
                        </Button>
                        <Button type="button" onClick={saveRecipeDraft}>
                          Save Recipe
                        </Button>
                      </div>
                    </div>

                    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-200 bg-white p-3 backdrop-blur md:hidden">
                      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 pb-[env(safe-area-inset-bottom)]">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-emerald-950">
                            {isRecipeDraftDirty ? "Unsaved changes" : "Draft saved"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={handleCancelRecipeDraft}>
                            Cancel
                          </Button>
                          <Button type="button" size="sm" onClick={saveRecipeDraft}>
                            Save Recipe
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="recipe-title">Recipe name</Label>
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
                      <Label htmlFor="recipe-meal-type">Meal type</Label>
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
                      <Label htmlFor="recipe-servings">Recipe servings</Label>
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

                    <div className="space-y-3 rounded-md border border-zinc-200/80 bg-white p-4 md:col-span-2 md:p-5">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 rounded-md border border-emerald-200 bg-zinc-100/70 p-1.5 text-emerald-700">
                          <ListChecks className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-base font-semibold text-emerald-950">Add ingredients</Label>
                          <p className="text-sm text-emerald-900/75">
                            Choose how you want to add each ingredient.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-2 rounded-md border border-zinc-200/80 bg-zinc-50/40 p-1 md:grid-cols-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className={
                            isDirectoryIngredientMode
                              ? "h-11 rounded-sm bg-emerald-700 text-white shadow-sm hover:bg-emerald-700/95"
                              : "h-11 rounded-sm bg-transparent text-emerald-900 hover:bg-white"
                          }
                          onClick={() => handleRecipeIngredientModeChange(RECIPE_INGREDIENT_MODES.directory)}
                        >
                          <ListChecks className="h-4 w-4" aria-hidden="true" />
                          Directory
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className={
                            isCustomIngredientMode
                              ? "h-11 rounded-sm bg-emerald-700 text-white shadow-sm hover:bg-emerald-700/95"
                              : "h-11 rounded-sm bg-transparent text-emerald-900 hover:bg-white"
                          }
                          onClick={() => handleRecipeIngredientModeChange(RECIPE_INGREDIENT_MODES.custom)}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Custom
                        </Button>
                      </div>

                      <div
                        className={
                          isDirectoryIngredientMode
                            ? "overflow-hidden transition-all duration-300 ease-out max-h-[680px] opacity-100 translate-y-0"
                            : "pointer-events-none overflow-hidden transition-all duration-200 ease-out max-h-0 opacity-0 -translate-y-1"
                        }
                      >
                        <div
                          className="space-y-3 rounded-md border border-zinc-200/80 bg-white p-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.8)]"
                          onKeyDown={handleDirectoryIngredientKeyDown}
                        >
                          <p className="text-sm text-emerald-900/75">
                            Pick an ingredient from your directory, then set quantity, unit, and store.
                          </p>
                          <div className="grid gap-3 md:grid-cols-[1.3fr_120px_140px_220px]">
                            <div className="space-y-2">
                              <Label htmlFor="recipe-ingredient-name" className="text-xs font-medium text-emerald-900/70">
                                Name
                              </Label>
                              <Input
                                id="recipe-ingredient-name"
                                list="ingredient-name-options"
                                placeholder="Chicken breast"
                                value={recipeIngredientForm.name}
                                onChange={(event) => handleRecipeIngredientNameChange(event.target.value)}
                              />
                              <datalist id="ingredient-name-options">
                                {ingredientDirectory.map((ingredient) => (
                                  <option key={ingredient.name} value={displayName(ingredient.name)} />
                                ))}
                              </datalist>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="recipe-ingredient-qty" className="text-xs font-medium text-emerald-900/70">
                                Qty
                              </Label>
                              <Input
                                id="recipe-ingredient-qty"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={recipeIngredientForm.qty}
                                onChange={(event) =>
                                  setRecipeIngredientForm((prev) => ({ ...prev, qty: event.target.value }))
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="recipe-ingredient-unit" className="text-xs font-medium text-emerald-900/70">
                                Unit
                              </Label>
                              <Input
                                id="recipe-ingredient-unit"
                                placeholder="each"
                                value={recipeIngredientForm.unit}
                                onChange={(event) =>
                                  setRecipeIngredientForm((prev) => ({ ...prev, unit: event.target.value }))
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="recipe-ingredient-store" className="text-xs font-medium text-emerald-900/70">
                                Preferred store
                              </Label>
                              <Select
                                value={recipeIngredientForm.store}
                                onValueChange={(value) =>
                                  setRecipeIngredientForm((prev) => ({ ...prev, store: value }))
                                }
                              >
                                <SelectTrigger id="recipe-ingredient-store">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {stores.map((store) => (
                                    <SelectItem key={store} value={store}>
                                      {store === "Unassigned" ? "No preferred store" : store}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1">
                            <Button
                              type="button"
                              className="min-w-[150px] bg-emerald-700 text-white hover:bg-emerald-700/90"
                              onClick={handleSaveRecipeIngredient}
                              disabled={!canSaveRecipeIngredient}
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                              Add Ingredient
                            </Button>
                          </div>
                          {!canSaveRecipeIngredient ? (
                            <p className="text-xs font-medium text-emerald-800/75">
                              Select an ingredient from your directory to enable add.
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div
                        className={
                          isCustomIngredientMode
                            ? "overflow-hidden transition-all duration-300 ease-out max-h-[680px] opacity-100 translate-y-0"
                            : "pointer-events-none overflow-hidden transition-all duration-200 ease-out max-h-0 opacity-0 -translate-y-1"
                        }
                      >
                        <div
                          className="space-y-3 rounded-md border border-dashed border-zinc-200/80 bg-zinc-50/30 p-4"
                          onKeyDown={handleCustomIngredientKeyDown}
                        >
                          <p className="text-sm text-emerald-900/75">
                            Create a custom ingredient. It will be saved to your directory and added to this recipe.
                          </p>
                          <div className="grid gap-3 md:grid-cols-[1.3fr_120px_140px_220px]">
                            <div className="space-y-2">
                              <Label htmlFor="new-ingredient-name" className="text-xs font-medium text-emerald-900/70">
                                Name
                              </Label>
                              <Input
                                id="new-ingredient-name"
                                placeholder="Coconut milk"
                                value={newIngredientForm.name}
                                onChange={(event) =>
                                  setNewIngredientForm((prev) => ({ ...prev, name: event.target.value }))
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="new-ingredient-qty" className="text-xs font-medium text-emerald-900/70">
                                Qty
                              </Label>
                              <Input
                                id="new-ingredient-qty"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={newIngredientForm.qty}
                                onChange={(event) =>
                                  setNewIngredientForm((prev) => ({ ...prev, qty: event.target.value }))
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="new-ingredient-unit" className="text-xs font-medium text-emerald-900/70">
                                Unit
                              </Label>
                              <Input
                                id="new-ingredient-unit"
                                placeholder="can"
                                value={newIngredientForm.unit}
                                onChange={(event) =>
                                  setNewIngredientForm((prev) => ({ ...prev, unit: event.target.value }))
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="new-ingredient-store" className="text-xs font-medium text-emerald-900/70">
                                Preferred store
                              </Label>
                              <Select
                                value={newIngredientForm.store}
                                onValueChange={(value) =>
                                  setNewIngredientForm((prev) => ({ ...prev, store: value }))
                                }
                              >
                                <SelectTrigger id="new-ingredient-store">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {stores.map((store) => (
                                    <SelectItem key={store} value={store}>
                                      {store === "Unassigned" ? "No preferred store" : store}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <Button
                            type="button"
                            className="min-w-[220px] bg-emerald-700 text-white hover:bg-emerald-700/90"
                            onClick={handleCreateNewIngredient}
                            disabled={!canCreateRecipeIngredient}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Create Ingredient + Add To Recipe
                          </Button>
                          {!canCreateRecipeIngredient ? (
                            <p className="text-xs font-medium text-emerald-800/75">
                              Enter a custom ingredient name to continue.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="flex items-center gap-2 text-base font-semibold text-emerald-950">
                        <ListChecks className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                        Ingredients
                      </Label>
                      {recipeIngredients.length === 0 ? (
                        <p className="rounded-md border border-dashed border-zinc-200/80 bg-white p-4 text-sm text-emerald-900/70">
                          No ingredients added yet. Choose a method above, or generate from pasted text.
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-md border border-zinc-200/80 bg-white shadow-sm">
                          <div className="hidden bg-zinc-50/60 px-3 py-2 text-xs font-medium text-emerald-900/70 md:grid md:grid-cols-[minmax(0,1fr)_110px_120px_220px_120px]">
                            <span className="text-left">Name</span>
                            <span className="text-left">Qty</span>
                            <span className="text-left">Unit</span>
                            <span className="text-left">Store</span>
                            <span className="justify-self-end" aria-hidden="true" />
                          </div>
                          <div className="divide-y divide-emerald-100">
                            {recipeIngredients.map((ingredient, index) => {
                              const menuKey = `recipe-ingredient-menu-${index}`;
                              const isInlineEditing = inlineEditingRecipeIngredientIndex === index;

                              return (
                                <article
                                  key={`${ingredient.name}-${index}`}
                                  className={
                                    isInlineEditing
                                      ? "grid items-center gap-2 bg-zinc-50/40 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_110px_120px_220px_120px]"
                                      : "grid items-center gap-2 bg-white px-3 py-2.5 transition-colors hover:bg-zinc-50/30 md:grid-cols-[minmax(0,1fr)_110px_120px_220px_120px]"
                                  }
                                  onKeyDown={
                                    isInlineEditing
                                      ? (event) => handleInlineRecipeIngredientKeyDown(event, index)
                                      : undefined
                                  }
                                >
                                  {isInlineEditing ? (
                                    <>
                                      <div className="space-y-1">
                                        <Label htmlFor={`inline-recipe-ingredient-name-${index}`} className="text-xs font-medium text-emerald-900/70 md:hidden">
                                          Name
                                        </Label>
                                        <Input
                                          id={`inline-recipe-ingredient-name-${index}`}
                                          list="ingredient-name-options"
                                          value={inlineRecipeIngredientForm.name}
                                          onChange={(event) =>
                                            handleInlineRecipeIngredientFormChange("name", event.target.value)
                                          }
                                          autoFocus
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label htmlFor={`inline-recipe-ingredient-qty-${index}`} className="text-xs font-medium text-emerald-900/70 md:hidden">
                                          Qty
                                        </Label>
                                        <Input
                                          id={`inline-recipe-ingredient-qty-${index}`}
                                          type="number"
                                          min="0.01"
                                          step="0.01"
                                          value={inlineRecipeIngredientForm.qty}
                                          onChange={(event) =>
                                            handleInlineRecipeIngredientFormChange("qty", event.target.value)
                                          }
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label htmlFor={`inline-recipe-ingredient-unit-${index}`} className="text-xs font-medium text-emerald-900/70 md:hidden">
                                          Unit
                                        </Label>
                                        <Input
                                          id={`inline-recipe-ingredient-unit-${index}`}
                                          value={inlineRecipeIngredientForm.unit}
                                          onChange={(event) =>
                                            handleInlineRecipeIngredientFormChange("unit", event.target.value)
                                          }
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label htmlFor={`inline-recipe-ingredient-store-${index}`} className="text-xs font-medium text-emerald-900/70 md:hidden">
                                          Store
                                        </Label>
                                        <Select
                                          value={inlineRecipeIngredientForm.store}
                                          onValueChange={(value) =>
                                            handleInlineRecipeIngredientFormChange("store", value)
                                          }
                                        >
                                          <SelectTrigger id={`inline-recipe-ingredient-store-${index}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {stores.map((store) => (
                                              <SelectItem key={store} value={store}>
                                                {store === "Unassigned" ? "No preferred store" : store}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="flex items-center gap-2 justify-self-end">
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="bg-emerald-700 text-white hover:bg-emerald-700/90"
                                          onClick={() => handleSaveInlineRecipeIngredient(index)}
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={handleCancelInlineRecipeIngredientEdit}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <p className="font-semibold text-emerald-950">{displayName(ingredient.name)}</p>
                                      <p className="text-sm text-emerald-900/75">{ingredient.qty}</p>
                                      <p className="text-sm text-emerald-900/75">{ingredient.unit}</p>
                                      <p className="text-sm text-emerald-900/75">
                                        {ingredient.store === "Unassigned" ? "No preferred store" : ingredient.store}
                                      </p>
                                      <div className="relative justify-self-end">
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="ghost"
                                          aria-label={`Open actions for ${displayName(ingredient.name)}`}
                                          onClick={() =>
                                            setOpenLibraryMenu((prev) => (prev === menuKey ? "" : menuKey))
                                          }
                                        >
                                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                        {openLibraryMenu === menuKey ? (
                                          <div className="absolute right-0 top-10 z-20 w-44 rounded-md border border-zinc-200 bg-white p-1.5 shadow-md">
                                            <button
                                              type="button"
                                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                                              onClick={() => handleStartInlineRecipeIngredientEdit(index)}
                                            >
                                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                                              onClick={() => handleCopyRecipeIngredientName(index)}
                                            >
                                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                              Copy name
                                            </button>
                                            <button
                                              type="button"
                                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
                                              onClick={() => handleRemoveRecipeIngredient(index)}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                              Delete
                                            </button>
                                          </div>
                                        ) : null}
                                      </div>
                                    </>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-md border border-zinc-200/80 bg-zinc-50/20 p-4 md:col-span-2">
                      <Label htmlFor="recipe-ingredients-paste" className="flex items-center gap-2 text-base font-semibold text-emerald-950">
                        <Wand2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                        Paste ingredients (bulk)
                      </Label>
                      <Textarea
                        id="recipe-ingredients-paste"
                        ref={ingredientPasteRef}
                        rows={5}
                        className="bg-white"
                        placeholder={"Chicken breast, 1.5, lb, Sprouts\nGreek yogurt, 32, oz\n1 can black beans"}
                        value={ingredientPasteText}
                        onChange={(event) => {
                          setIngredientPasteText(event.target.value);
                          setIngredientPasteSkippedLines([]);
                        }}
                      />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          variant="secondary"
                          className="bg-emerald-700 text-white hover:bg-emerald-700/90"
                          onClick={handleGenerateIngredients}
                          disabled={!hasIngredientPasteText}
                        >
                          <Wand2 className="h-4 w-4" aria-hidden="true" />
                          Generate ingredients
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIngredientPasteText("");
                            setIngredientPasteSkippedLines([]);
                          }}
                          disabled={!hasIngredientPasteText}
                        >
                          Clear paste
                        </Button>
                      </div>
                      {ingredientPasteSkippedLines.length > 0 ? (
                        <p className="rounded-md border border-amber-300/90 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          Skipped {ingredientPasteSkippedLines.length} non-ingredient{" "}
                          {ingredientPasteSkippedLines.length === 1 ? "line" : "lines"} from paste.
                        </p>
                      ) : null}
                      {!hasIngredientPasteText ? (
                        <p className="text-xs font-medium text-emerald-800/75">
                          Paste one or more ingredient lines first.
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="recipe-steps">How to make</Label>
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

                  </form>
                ) : (
                  <section className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2 md:col-span-1">
                        <Label htmlFor="recipe-search">Search recipes</Label>
                        <Input
                          id="recipe-search"
                          placeholder="Search name, tag, ingredient, steps"
                          value={recipeSearch}
                          onChange={(event) => setRecipeSearch(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="quick-plan-day">Add to plan day</Label>
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
                        <Label htmlFor="quick-plan-slot">Meal slot</Label>
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

                    {recipeList.length === 0 ? (
                      <p className="rounded-sm border border-dashed border-border bg-white/70 p-4 text-sm text-muted-foreground">
                        No recipes found.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {recipeList.map((recipe) => {
                          const menuKey = `recipe-menu-${recipe.id}`;
                          const isInlineEditing = inlineEditingRecipeId === recipe.id;
                          return (
                            <article
                              key={recipe.id}
                              className="rounded-md border border-zinc-200/80 bg-white p-4 shadow-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                  <h3 className="text-lg font-semibold">{recipe.title}</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {MEAL_SLOT_LABELS[normalizeRecipeMealType(recipe.mealType, "dinner")]} •{" "}
                                    {recipe.servings} servings
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Tags: {recipe.tags.length ? recipe.tags.join(", ") : "none"}
                                  </p>
                                  {recipe.description ? (
                                    <p className="text-sm text-muted-foreground">{recipe.description}</p>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAddRecipeToMealPlan(recipe.id)}
                                  >
                                    Add to plan
                                  </Button>
                                  <div className="relative">
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      aria-label={`Open actions for ${recipe.title}`}
                                      onClick={() =>
                                        setOpenLibraryMenu((prev) => (prev === menuKey ? "" : menuKey))
                                      }
                                    >
                                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                    {openLibraryMenu === menuKey ? (
                                      <div className="absolute right-0 top-10 z-20 w-44 rounded-md border border-zinc-200 bg-white p-1.5 shadow-md">
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                                          onClick={() => handleInlineRecipeEdit(recipe.id)}
                                        >
                                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                                          onClick={() => handleRecipeDuplicate(recipe.id)}
                                        >
                                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                          Copy
                                        </button>
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
                                          onClick={() => handleRecipeDelete(recipe.id)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                          Delete
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              {isInlineEditing ? (
                                <form
                                  className="mt-4 grid gap-3 rounded-sm border border-zinc-200/80 bg-zinc-50/30 p-3 md:grid-cols-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    handleInlineRecipeSave(recipe.id);
                                  }}
                                >
                                  <div className="space-y-1">
                                    <Label htmlFor={`inline-recipe-title-${recipe.id}`}>Name</Label>
                                    <Input
                                      id={`inline-recipe-title-${recipe.id}`}
                                      value={inlineRecipeForm.title}
                                      onChange={(event) =>
                                        setInlineRecipeForm((prev) => ({ ...prev, title: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor={`inline-recipe-tags-${recipe.id}`}>Tags</Label>
                                    <Input
                                      id={`inline-recipe-tags-${recipe.id}`}
                                      value={inlineRecipeForm.tags}
                                      onChange={(event) =>
                                        setInlineRecipeForm((prev) => ({ ...prev, tags: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor={`inline-recipe-meal-${recipe.id}`}>Meal type</Label>
                                    <Select
                                      value={inlineRecipeForm.mealType}
                                      onValueChange={(value) =>
                                        setInlineRecipeForm((prev) => ({ ...prev, mealType: value }))
                                      }
                                    >
                                      <SelectTrigger id={`inline-recipe-meal-${recipe.id}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {MEAL_SLOTS.map((mealSlot) => (
                                          <SelectItem key={`inline-${recipe.id}-${mealSlot}`} value={mealSlot}>
                                            {MEAL_SLOT_LABELS[mealSlot]}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor={`inline-recipe-servings-${recipe.id}`}>Servings</Label>
                                    <Input
                                      id={`inline-recipe-servings-${recipe.id}`}
                                      type="number"
                                      min="1"
                                      step="1"
                                      value={inlineRecipeForm.servings}
                                      onChange={(event) =>
                                        setInlineRecipeForm((prev) => ({ ...prev, servings: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1 md:col-span-2">
                                    <Label htmlFor={`inline-recipe-description-${recipe.id}`}>Description</Label>
                                    <Textarea
                                      id={`inline-recipe-description-${recipe.id}`}
                                      rows={2}
                                      value={inlineRecipeForm.description}
                                      onChange={(event) =>
                                        setInlineRecipeForm((prev) => ({ ...prev, description: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1 md:col-span-2">
                                    <Label htmlFor={`inline-recipe-source-${recipe.id}`}>Source URL</Label>
                                    <Input
                                      id={`inline-recipe-source-${recipe.id}`}
                                      type="url"
                                      value={inlineRecipeForm.sourceUrl}
                                      onChange={(event) =>
                                        setInlineRecipeForm((prev) => ({ ...prev, sourceUrl: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1 md:col-span-2">
                                    <Label htmlFor={`inline-recipe-ingredients-${recipe.id}`}>Ingredients</Label>
                                    <Textarea
                                      id={`inline-recipe-ingredients-${recipe.id}`}
                                      rows={4}
                                      placeholder={"Chicken breast, 1.5, lb, Sprouts\nGreek yogurt, 32, oz"}
                                      value={inlineRecipeForm.ingredients}
                                      onChange={(event) =>
                                        setInlineRecipeForm((prev) => ({ ...prev, ingredients: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1 md:col-span-2">
                                    <Label htmlFor={`inline-recipe-steps-${recipe.id}`}>Steps</Label>
                                    <Textarea
                                      id={`inline-recipe-steps-${recipe.id}`}
                                      rows={4}
                                      placeholder={"Preheat oven to 425F\nMix marinade\nBake for 25 minutes"}
                                      value={inlineRecipeForm.steps}
                                      onChange={(event) =>
                                        setInlineRecipeForm((prev) => ({ ...prev, steps: event.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2 md:col-span-2">
                                    <Button type="submit">Save changes</Button>
                                    <Button type="button" variant="outline" onClick={handleInlineRecipeCancel}>
                                      Cancel
                                    </Button>
                                  </div>
                                </form>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </CardContent>
            </Card>
          ) : null}

          {isIngredientsTab ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ingredient directory</CardTitle>
                <CardDescription>
                  Ingredients stay in list view with inline edit, copy, and delete actions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="ingredient-search">Search ingredients</Label>
                  <Input
                    id="ingredient-search"
                    placeholder="Search by name, tag, or store"
                    value={ingredientSearch}
                    onChange={(event) => setIngredientSearch(event.target.value)}
                  />
                </div>

                {isAddingIngredient ? (
                  <article className="grid items-end gap-3 rounded-sm border border-zinc-200/80 bg-zinc-50/40 p-3 md:grid-cols-[1fr_1fr_220px_auto]">
                    <div className="space-y-1">
                      <Label htmlFor="new-inline-ingredient-name">Name</Label>
                      <Input
                        id="new-inline-ingredient-name"
                        placeholder="Greek yogurt"
                        value={ingredientForm.name}
                        onChange={(event) =>
                          setIngredientForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-inline-ingredient-tag">Tag</Label>
                      <Input
                        id="new-inline-ingredient-tag"
                        placeholder="dairy"
                        maxLength={MAX_INGREDIENT_TAG_LENGTH}
                        value={ingredientForm.tag}
                        onChange={(event) =>
                          setIngredientForm((prev) => ({ ...prev, tag: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-inline-ingredient-store">Preferred store</Label>
                      <Select
                        value={ingredientForm.store}
                        onValueChange={(value) =>
                          setIngredientForm((prev) => ({ ...prev, store: value }))
                        }
                      >
                        <SelectTrigger id="new-inline-ingredient-store">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stores.map((store) => (
                            <SelectItem key={`create-${store}`} value={store}>
                              {store === "Unassigned" ? "No preferred store" : store}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" onClick={handleIngredientSubmit}>
                        Save
                      </Button>
                      <Button type="button" variant="outline" onClick={resetIngredientForm}>
                        Cancel
                      </Button>
                    </div>
                  </article>
                ) : null}

                {filteredIngredientDirectory.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-border bg-white/70 p-4 text-sm text-muted-foreground">
                    No ingredients found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredIngredientDirectory.map((ingredient) => {
                      const menuKey = `ingredient-menu-${ingredient.name}`;
                      const isEditingIngredient = editingIngredientName === ingredient.name;
                      return isEditingIngredient ? (
                        <article
                          key={ingredient.name}
                          className="grid items-end gap-3 rounded-sm border border-zinc-200/80 bg-zinc-50/40 p-3 md:grid-cols-[1fr_1fr_220px_auto]"
                        >
                          <div className="space-y-1">
                            <Label htmlFor={`ingredient-edit-name-${ingredient.name}`}>Name</Label>
                            <Input
                              id={`ingredient-edit-name-${ingredient.name}`}
                              value={ingredientForm.name}
                              onChange={(event) =>
                                setIngredientForm((prev) => ({ ...prev, name: event.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`ingredient-edit-tag-${ingredient.name}`}>Tag</Label>
                            <Input
                              id={`ingredient-edit-tag-${ingredient.name}`}
                              maxLength={MAX_INGREDIENT_TAG_LENGTH}
                              value={ingredientForm.tag}
                              onChange={(event) =>
                                setIngredientForm((prev) => ({ ...prev, tag: event.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`ingredient-edit-store-${ingredient.name}`}>Preferred store</Label>
                            <Select
                              value={ingredientForm.store}
                              onValueChange={(value) =>
                                setIngredientForm((prev) => ({ ...prev, store: value }))
                              }
                            >
                              <SelectTrigger id={`ingredient-edit-store-${ingredient.name}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {stores.map((store) => (
                                  <SelectItem key={`edit-${ingredient.name}-${store}`} value={store}>
                                    {store === "Unassigned" ? "No preferred store" : store}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" onClick={handleIngredientSubmit}>
                              Save
                            </Button>
                            <Button type="button" variant="outline" onClick={resetIngredientForm}>
                              Cancel
                            </Button>
                          </div>
                        </article>
                      ) : (
                        <article
                          key={ingredient.name}
                          className="grid items-center gap-2 rounded-md border border-zinc-200/80 bg-white px-3 py-2.5 md:grid-cols-[1fr_180px_auto]"
                        >
                          <div>
                            <p className="font-medium">{displayName(ingredient.name)}</p>
                            <p className="text-xs text-muted-foreground">
                              Tag: {ingredient.tag || "none"}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {ingredient.store === "Unassigned" ? "No preferred store" : ingredient.store}
                          </p>
                          <div className="relative justify-self-end">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Open actions for ${displayName(ingredient.name)}`}
                              onClick={() =>
                                setOpenLibraryMenu((prev) => (prev === menuKey ? "" : menuKey))
                              }
                            >
                              <MoreVertical className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            {openLibraryMenu === menuKey ? (
                              <div className="absolute right-0 top-10 z-20 w-44 rounded-md border border-zinc-200 bg-white p-1.5 shadow-md">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                                  onClick={() => handleIngredientEdit(ingredient.name)}
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                                  onClick={() => handleIngredientCopy(ingredient.name)}
                                >
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
                                  onClick={() => handleIngredientDelete(ingredient.name)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
          ) : null}
          {isPlannerWorkflow && plannerStep >= 3 ? (
        <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-lg">Step 3: Build grocery list</CardTitle>
            <CardDescription>
              Select pickup stores and generate store-ready lists.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleBuildGroceryList}>
              Build grocery list
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
          <div className="flex flex-wrap gap-4 rounded-sm border border-border/80 bg-white p-3">
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
                    className="rounded-md border border-zinc-200/80 bg-white p-4 shadow-sm"
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
            <p className="rounded-sm border border-dashed border-border bg-white/70 p-4 text-sm text-muted-foreground">
              Select your stores, then click "Build grocery list".
            </p>
          )}

          {showGroceries && !hasVisibleGroceries ? (
            <p className="rounded-sm border border-dashed border-border bg-white/70 p-4 text-sm text-muted-foreground">
              No groceries yet for selected stores. Add recipe meals or adjust day overrides.
            </p>
          ) : null}
        </CardContent>
        </Card>
          ) : null}
        </div>
      </section>

      {isImportModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close import modal"
            className="absolute inset-0 bg-zinc-950/35"
            onClick={closeRecipeImportModal}
          />
          <Card className="relative z-10 w-full max-w-lg border-zinc-200/80 bg-white shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl text-emerald-950">Import recipe from URL</CardTitle>
              <CardDescription>
                Paste a recipe URL and we&apos;ll prefill the recipe editor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleImportRecipeSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="import-recipe-url-main">Recipe URL</Label>
                  <Input
                    id="import-recipe-url-main"
                    type="url"
                    placeholder="https://example.com/recipe"
                    value={importRecipeUrl}
                    onChange={(event) => setImportRecipeUrl(event.target.value)}
                    disabled={isImportingRecipe}
                    required
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeRecipeImportModal} disabled={isImportingRecipe}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isImportingRecipe}>
                    {isImportingRecipe ? "Importing..." : "Add"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {recipeDetailsModalRecipe ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close recipe details"
            className="absolute inset-0 bg-zinc-950/35"
            onClick={handleCloseRecipeDetailsModal}
          />
          <Card className="relative z-10 w-full max-w-2xl border-zinc-200/80 bg-white shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl text-emerald-950">{recipeDetailsModalRecipe.title}</CardTitle>
              <CardDescription>
                {MEAL_SLOT_LABELS[normalizeRecipeMealType(recipeDetailsModalRecipe.mealType, "dinner")]} •{" "}
                {recipeDetailsModalRecipe.servings} servings
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[70vh] space-y-4 overflow-y-auto">
              {recipeDetailsModalRecipe.description ? (
                <p className="text-sm text-muted-foreground">{recipeDetailsModalRecipe.description}</p>
              ) : null}
              {recipeDetailsModalRecipe.sourceUrl ? (
                <p className="text-sm">
                  <a
                    href={recipeDetailsModalRecipe.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-emerald-800 underline decoration-emerald-500 underline-offset-4 hover:text-emerald-950"
                  >
                    Open source URL
                  </a>
                </p>
              ) : null}
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-emerald-900/75">Ingredients</h3>
                {Array.isArray(recipeDetailsModalRecipe.ingredients) && recipeDetailsModalRecipe.ingredients.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {recipeDetailsModalRecipe.ingredients.map((ingredient, index) => (
                      <li key={`${recipeDetailsModalRecipe.id}-ingredient-${index}`}>
                        {formatItem(ingredient)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No ingredients listed.</p>
                )}
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-emerald-900/75">How to make</h3>
                {Array.isArray(recipeDetailsModalRecipe.steps) && recipeDetailsModalRecipe.steps.length > 0 ? (
                  <ol className="list-inside list-decimal space-y-1 text-sm">
                    {recipeDetailsModalRecipe.steps.map((step, index) => (
                      <li key={`${recipeDetailsModalRecipe.id}-step-${index}`}>{step}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">No steps listed.</p>
                )}
              </section>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => handleEditRecipeFromModal(recipeDetailsModalRecipe.id)}
                >
                  Edit
                </Button>
                <Button type="button" variant="outline" onClick={handleCloseRecipeDetailsModal}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {noteEditorDay ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close note editor"
            className="absolute inset-0 bg-zinc-950/35"
            onClick={handleCloseDayNoteEditor}
          />
          <Card className="relative z-10 w-full max-w-lg border-zinc-200/80 bg-white shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl text-emerald-950">
                {noteEditorSavedText ? "Edit note" : "Add note"}: {noteEditorDay}
              </CardTitle>
              <CardDescription>
                Add context for this day, like schedule constraints or meal preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="day-note-editor">Note</Label>
                  <span className="text-xs text-muted-foreground">
                    {noteDraft.length}/{MAX_DAY_NOTE_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="day-note-editor"
                  rows={4}
                  maxLength={MAX_DAY_NOTE_LENGTH}
                  placeholder="Kids at practice, quick dinner only."
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {noteEditorSavedText ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleDeleteDayNote(noteEditorDay)}
                  >
                    Delete
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={handleCloseDayNoteEditor}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveDayNote}>
                  Save Note
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <UndoToast
        toast={undoToast}
        onDismiss={dismissUndoToast}
        onUndo={handleUndoToastAction}
      />
    </main>
  );
}
