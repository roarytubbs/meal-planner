'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Calendar,
  X,
  Eye,
  Trash2,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  Store,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { RecipeDetailModal } from '@/components/recipe-detail-modal'
import type { Recipe, DayOfWeek, MealSlot } from '@/lib/types'
import {
  useRecipes,
  useMealPlan,
  setMealSlot,
  clearMealPlan,
  getRecipeById,
} from '@/lib/meal-planner-store'

const DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

const DAY_FULL: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const SLOT_ICONS: Record<MealSlot, string> = {
  breakfast: 'text-amber-500',
  lunch: 'text-emerald-500',
  dinner: 'text-sky-500',
  snack: 'text-rose-500',
}

const SLOT_BG: Record<MealSlot, string> = {
  breakfast: 'bg-amber-50 dark:bg-amber-950/20',
  lunch: 'bg-emerald-50 dark:bg-emerald-950/20',
  dinner: 'bg-sky-50 dark:bg-sky-950/20',
  snack: 'bg-rose-50 dark:bg-rose-950/20',
}

const SLOT_BORDER: Record<MealSlot, string> = {
  breakfast: 'border-amber-200 dark:border-amber-800',
  lunch: 'border-emerald-200 dark:border-emerald-800',
  dinner: 'border-sky-200 dark:border-sky-800',
  snack: 'border-rose-200 dark:border-rose-800',
}

// ---- Shopping List helpers ----
interface ShoppingItem {
  name: string
  qty: number | null
  unit: string
  recipeName: string
}

function buildShoppingList(
  mealPlan: Record<string, Record<string, string | null>>,
  recipes: Recipe[]
): Record<string, ShoppingItem[]> {
  const storeMap: Record<string, ShoppingItem[]> = {}

  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const recipeId = mealPlan[day]?.[slot]
      if (!recipeId) continue
      const recipe = getRecipeById(recipes, recipeId)
      if (!recipe) continue
      for (const ing of recipe.ingredients) {
        const storeName = ing.store?.trim() || 'Uncategorized'
        if (!storeMap[storeName]) storeMap[storeName] = []
        storeMap[storeName].push({
          name: ing.name,
          qty: ing.qty,
          unit: ing.unit,
          recipeName: recipe.name,
        })
      }
    }
  }

  // Sort stores alphabetically, but keep Uncategorized last
  const sorted: Record<string, ShoppingItem[]> = {}
  const keys = Object.keys(storeMap).sort((a, b) => {
    if (a === 'Uncategorized') return 1
    if (b === 'Uncategorized') return -1
    return a.localeCompare(b)
  })
  for (const k of keys) {
    // De-duplicate by name+unit, summing quantities
    const deduped: Record<string, ShoppingItem> = {}
    for (const item of storeMap[k]) {
      const key = `${item.name.toLowerCase()}|${item.unit.toLowerCase()}`
      if (deduped[key]) {
        if (deduped[key].qty !== null && item.qty !== null) {
          deduped[key].qty = (deduped[key].qty as number) + item.qty
        }
      } else {
        deduped[key] = { ...item }
      }
    }
    sorted[k] = Object.values(deduped).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }
  return sorted
}

// ---- Slot Card ----
function SlotCard({
  day,
  slot,
  recipe,
  recipes,
  onAssign,
  onClear,
  onView,
}: {
  day: DayOfWeek
  slot: MealSlot
  recipe: Recipe | undefined
  recipes: Recipe[]
  onAssign: (day: DayOfWeek, slot: MealSlot, recipeId: string) => void
  onClear: (day: DayOfWeek, slot: MealSlot) => void
  onView: (recipe: Recipe) => void
}) {
  return (
    <div
      className={`rounded-lg border ${SLOT_BORDER[slot]} ${SLOT_BG[slot]} p-2.5 flex flex-col gap-2 min-h-[5.5rem] transition-colors`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-semibold ${SLOT_ICONS[slot]}`}>
          {SLOT_LABELS[slot]}
        </span>
      </div>

      {recipe ? (
        <div className="flex flex-col gap-1.5 flex-1">
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 text-pretty">
            {recipe.name}
          </p>
          <div className="flex items-center gap-1.5 mt-auto">
            <button
              type="button"
              onClick={() => onView(recipe)}
              className="text-xs text-primary hover:underline flex items-center gap-1 transition-colors"
            >
              <Eye className="size-3" />
              Details
            </button>
            <button
              type="button"
              onClick={() => onClear(day, slot)}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
              aria-label={`Remove ${recipe.name} from ${DAY_FULL[day]} ${slot}`}
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      ) : (
        <Select
          value="__none"
          onValueChange={(v) => {
            if (v !== '__none') onAssign(day, slot, v)
          }}
        >
          <SelectTrigger className="h-8 text-xs bg-background/60 border-0 shadow-none">
            <SelectValue placeholder="Add recipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none" disabled>
              Choose a recipe...
            </SelectItem>
            {recipes.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

// ---- Shopping List Sidebar ----
function ShoppingList({
  shoppingList,
}: {
  shoppingList: Record<string, ShoppingItem[]>
}) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set())

  const totalItems = useMemo(
    () => Object.values(shoppingList).reduce((sum, items) => sum + items.length, 0),
    [shoppingList]
  )

  const toggleCheck = (key: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleStore = (store: string) => {
    setCollapsedStores((prev) => {
      const next = new Set(prev)
      if (next.has(store)) next.delete(store)
      else next.add(store)
      return next
    })
  }

  const storeKeys = Object.keys(shoppingList)

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center px-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <ShoppingCart className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No items yet</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add recipes to your meal plan to see the shopping list.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-xs text-muted-foreground">
          {checkedItems.size} of {totalItems} checked
        </span>
        {checkedItems.size > 0 && (
          <button
            type="button"
            onClick={() => setCheckedItems(new Set())}
            className="text-xs text-primary hover:underline"
          >
            Uncheck all
          </button>
        )}
      </div>
      {storeKeys.map((store) => {
        const items = shoppingList[store]
        const isCollapsed = collapsedStores.has(store)
        const checkedInStore = items.filter((_, i) =>
          checkedItems.has(`${store}-${i}`)
        ).length

        return (
          <div key={store} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggleStore(store)}
              className="flex items-center gap-2 py-2 px-1 hover:bg-accent/50 rounded-md transition-colors group"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              )}
              <Store className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground flex-1 text-left">
                {store}
              </span>
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                {checkedInStore}/{items.length}
              </Badge>
            </button>
            {!isCollapsed && (
              <div className="flex flex-col gap-0.5 pl-3 pb-2">
                {items.map((item, i) => {
                  const key = `${store}-${i}`
                  const isChecked = checkedItems.has(key)
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-2.5 py-1.5 px-2 rounded-md cursor-pointer hover:bg-accent/40 transition-colors ${
                        isChecked ? 'opacity-50' : ''
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleCheck(key)}
                        className="mt-0.5"
                      />
                      <div className="flex flex-col gap-0">
                        <span
                          className={`text-sm text-foreground leading-snug ${
                            isChecked ? 'line-through' : ''
                          }`}
                        >
                          {item.qty !== null && (
                            <span className="font-medium">
                              {Number.isInteger(item.qty)
                                ? item.qty
                                : item.qty.toFixed(2).replace(/\.?0+$/, '')}
                            </span>
                          )}{' '}
                          {item.unit && (
                            <span className="text-muted-foreground">
                              {item.unit}
                            </span>
                          )}{' '}
                          {item.name}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---- Main View ----
export function MealPlannerView() {
  const recipes = useRecipes()
  const mealPlan = useMealPlan()
  const [viewRecipe, setViewRecipe] = useState<Recipe | null>(null)

  const handleAssign = useCallback(
    (day: DayOfWeek, slot: MealSlot, recipeId: string) => {
      setMealSlot(day, slot, recipeId)
    },
    []
  )

  const handleClear = useCallback((day: DayOfWeek, slot: MealSlot) => {
    setMealSlot(day, slot, null)
  }, [])

  const shoppingList = useMemo(
    () => buildShoppingList(mealPlan, recipes),
    [mealPlan, recipes]
  )

  const totalMeals = useMemo(() => {
    let count = 0
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        if (mealPlan[day]?.[slot]) count++
      }
    }
    return count
  }, [mealPlan])

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Calendar className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-bold text-foreground leading-tight">
              Weekly Planner
            </h2>
            <p className="text-xs text-muted-foreground">
              {totalMeals} meal{totalMeals !== 1 ? 's' : ''} planned this week
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearMealPlan}
          disabled={totalMeals === 0}
        >
          <Trash2 className="size-3.5" />
          Clear All
        </Button>
      </div>

      {/* Two-column layout: Planner + Shopping List */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Weekly Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-2">
            {/* Column headers - desktop only */}
            <div className="hidden sm:grid grid-cols-[6rem_1fr_1fr_1fr_1fr] gap-2 px-1">
              <div />
              {SLOTS.map((slot) => (
                <span
                  key={slot}
                  className={`text-xs font-semibold text-center ${SLOT_ICONS[slot]}`}
                >
                  {SLOT_LABELS[slot]}
                </span>
              ))}
            </div>

            {/* Day rows */}
            {DAYS.map((day) => (
              <div
                key={day}
                className="flex flex-col sm:grid sm:grid-cols-[6rem_1fr_1fr_1fr_1fr] gap-2 rounded-xl border border-border bg-card p-3 sm:p-2 sm:items-stretch"
              >
                {/* Day label */}
                <div className="flex items-center sm:justify-center sm:flex-col sm:gap-0.5">
                  <span className="text-sm font-bold text-foreground sm:text-base">
                    <span className="hidden sm:inline">{DAY_LABELS[day]}</span>
                    <span className="sm:hidden">{DAY_FULL[day]}</span>
                  </span>
                </div>

                {/* Slot cards */}
                {SLOTS.map((slot) => {
                  const recipeId = mealPlan[day]?.[slot]
                  const recipe = recipeId
                    ? getRecipeById(recipes, recipeId)
                    : undefined

                  return (
                    <SlotCard
                      key={slot}
                      day={day}
                      slot={slot}
                      recipe={recipe}
                      recipes={recipes}
                      onAssign={handleAssign}
                      onClear={handleClear}
                      onView={setViewRecipe}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Shopping List Sidebar */}
        <div className="lg:w-80 shrink-0">
          <div className="lg:sticky lg:top-4">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/30">
                <ShoppingCart className="size-4 text-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Shopping List
                </h3>
                <Badge variant="outline" className="ml-auto text-xs h-5 px-1.5">
                  {Object.values(shoppingList).reduce(
                    (s, items) => s + items.length,
                    0
                  )}{' '}
                  items
                </Badge>
              </div>
              <CardContent className="p-3">
                <ScrollArea className="max-h-[calc(100vh-14rem)]">
                  <ShoppingList shoppingList={shoppingList} />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Recipe Detail Modal */}
      <RecipeDetailModal
        recipe={viewRecipe}
        open={!!viewRecipe}
        onOpenChange={(open) => !open && setViewRecipe(null)}
      />
    </div>
  )
}
