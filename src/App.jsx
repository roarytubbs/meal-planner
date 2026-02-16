import { useEffect, useMemo, useState } from "react";

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
  CATALOG_STORES,
  DAYS,
  STORAGE_KEY,
  STORES,
  buildPrintChecklistHtml,
  buildStoreExport,
  buildStoresExport,
  buildWeekBalance,
  createInitialState,
  displayName,
  formatItem,
  groupGroceries,
  normalizeName,
  normalizeServings,
  parseIngredients,
  parseOptionalServings,
  pickStore,
  upsertCatalogFromIngredients,
} from "@/lib/meal-planner";

const NO_RECIPE = "__none__";

function makeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function App() {
  const [state, setState] = useState(() => createInitialState());
  const [pantryInput, setPantryInput] = useState("");
  const [copyStatus, setCopyStatus] = useState({
    status: "neutral",
    message: "",
  });
  const [recipeForm, setRecipeForm] = useState({
    title: "",
    tags: "",
    servings: "4",
    ingredients: "",
  });
  const [catalogForm, setCatalogForm] = useState({
    name: "",
    store: CATALOG_STORES[0],
  });

  useEffect(() => {
    setPantryInput(state.pantry.join(", "));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const sortedRecipes = useMemo(
    () => [...state.recipes].sort((a, b) => a.title.localeCompare(b.title)),
    [state.recipes],
  );

  const groupedGroceries = useMemo(() => groupGroceries(state), [state]);
  const weekBalance = useMemo(() => buildWeekBalance(state), [state]);
  const catalogEntries = useMemo(
    () => Object.entries(state.ingredientCatalog).sort((a, b) => a[0].localeCompare(b[0])),
    [state.ingredientCatalog],
  );

  function showCopyStatus(message, status = "success") {
    setCopyStatus({ message, status });
  }

  function setDayRecipe(day, recipeId) {
    setState((prev) => ({
      ...prev,
      weekPlan: {
        ...prev.weekPlan,
        [day]: {
          recipeId,
          servingsOverride: prev.weekPlan[day]?.servingsOverride ?? null,
        },
      },
    }));
  }

  function setDayServings(day, value) {
    setState((prev) => ({
      ...prev,
      weekPlan: {
        ...prev.weekPlan,
        [day]: {
          recipeId: prev.weekPlan[day]?.recipeId ?? null,
          servingsOverride: parseOptionalServings(value),
        },
      },
    }));
  }

  function handleHouseholdServings(value) {
    setState((prev) => ({
      ...prev,
      householdServings: normalizeServings(value, prev.householdServings),
    }));
  }

  function handleRecipeSubmit(event) {
    event.preventDefault();
    const title = recipeForm.title.trim();
    const tags = recipeForm.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const servings = normalizeServings(recipeForm.servings, 4);
    const parsedIngredients = parseIngredients(recipeForm.ingredients, state.ingredientCatalog);

    if (!title || parsedIngredients.length === 0) {
      showCopyStatus("Add a recipe name and at least one valid ingredient line.", "error");
      return;
    }

    setState((prev) => {
      const recipe = {
        id: makeId("recipe"),
        title,
        tags,
        servings,
        ingredients: parsedIngredients,
      };
      return {
        ...prev,
        recipes: [...prev.recipes, recipe],
        ingredientCatalog: upsertCatalogFromIngredients(prev.ingredientCatalog, parsedIngredients),
      };
    });

    setRecipeForm({ title: "", tags: "", servings: "4", ingredients: "" });
    showCopyStatus("Recipe saved.", "success");
  }

  function handleCatalogSubmit(event) {
    event.preventDefault();
    const name = normalizeName(catalogForm.name);
    const store = pickStore(catalogForm.store);
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

    setCatalogForm({ name: "", store: CATALOG_STORES[0] });
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
    return STORES.filter((store) => Boolean(state.exportStoreSelection[store]));
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
    const text = buildStoresExport(groupedGroceries, STORES);
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
    const text = buildStoresExport(groupedGroceries, selectedStores);
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

    const html = buildPrintChecklistHtml(groupedGroceries, selectedStores);
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

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-white/80 via-white/50 to-secondary/50 p-6 shadow-glow backdrop-blur-sm md:p-10">
        <div className="pointer-events-none absolute -right-28 -top-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-52 w-52 rounded-full bg-primary/20 blur-3xl" />

        <div className="relative z-10 space-y-4">
          <Badge className="bg-primary/90">Private Family Planner</Badge>
          <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight md:text-5xl">
            Plan the week. Build store-ready groceries.
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            Dinners-first planning with health tags, pantry exclusions, ingredient store mapping,
            and exports for Target, Sprouts, Aldi, and Trader Joe&apos;s.
          </p>
        </div>
      </section>

      <Card>
        <CardHeader className="gap-5 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-2xl">This Week</CardTitle>
            <CardDescription>
              Select a recipe and optional serving override for each day.
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
          <div className="grid gap-3">
            {DAYS.map((day) => {
              const dayPlan = state.weekPlan[day] || { recipeId: null, servingsOverride: null };
              return (
                <div
                  key={day}
                  className="grid gap-2 rounded-lg border border-border/80 bg-white/80 p-3 md:grid-cols-[130px_1fr_130px] md:items-center"
                >
                  <p className="text-sm font-semibold">{day}</p>
                  <Select
                    value={dayPlan.recipeId ?? NO_RECIPE}
                    onValueChange={(value) => setDayRecipe(day, value === NO_RECIPE ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No meal selected" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_RECIPE}>No meal selected</SelectItem>
                      {sortedRecipes.map((recipe) => (
                        <SelectItem key={recipe.id} value={recipe.id}>
                          {recipe.title} ({recipe.servings} servings)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="space-y-1">
                    <Label htmlFor={`servings-${day}`}>Servings</Label>
                    <Input
                      id={`servings-${day}`}
                      type="number"
                      min="1"
                      step="1"
                      value={dayPlan.servingsOverride ?? ""}
                      placeholder={String(state.householdServings)}
                      onChange={(event) => setDayServings(day, event.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary/90">
            Balance: {weekBalance.quickMeals} quick meals, {weekBalance.proteinMeals} high-protein
            meals, {weekBalance.leftoversMeals} leftovers-friendly meals. Household target:{" "}
            {weekBalance.householdServings} servings. Day overrides: {weekBalance.overrideDays}.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Recipes</CardTitle>
          <CardDescription>
            Create staples with tags like <code>15-min</code>, <code>high-protein</code>, or{" "}
            <code>leftovers</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

            <Button className="w-fit" type="submit">
              Add Recipe
            </Button>
          </form>

          <Separator />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedRecipes.map((recipe) => (
              <article
                key={recipe.id}
                className="rounded-lg border border-border/80 bg-white/90 p-3 shadow-sm"
              >
                <h3 className="font-semibold">{recipe.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">Servings: {recipe.servings}</p>
                <p className="text-sm text-muted-foreground">
                  Tags: {recipe.tags.length ? recipe.tags.join(", ") : "none"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Ingredients: {recipe.ingredients.length}
                </p>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Ingredient Catalog</CardTitle>
          <CardDescription>
            Set default stores for ingredients so recipes can omit store names.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
                  {CATALOG_STORES.map((store) => (
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

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-2xl">Groceries</CardTitle>
            <CardDescription>
              Store-grouped output with merged items and quantity scaling.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
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
            {STORES.map((store) => {
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

          <div className="grid gap-4 lg:grid-cols-2">
            {STORES.map((store) => {
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

          {STORES.every((store) => (groupedGroceries[store] || []).length === 0) ? (
            <p className="rounded-lg border border-dashed border-border bg-white/70 p-4 text-sm text-muted-foreground">
              No groceries yet. Pick recipes for the week.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
