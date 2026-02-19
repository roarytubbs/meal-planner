'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Calendar,
  Eye,
  Loader2,
  ShoppingCart,
  Store,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import type {
  GroceryStore,
  MealSelection,
  MealSlot,
  Recipe,
} from '@/lib/types'
import {
  MEAL_SLOT_VALUES,
  buildDateRange,
  formatDateLabel,
  toDateKey,
} from '@/lib/types'
import {
  useRecipes,
  useMealPlanSlots,
  useGroceryStores,
  setMealSlot,
  clearMealPlan,
  saveMealPlanSnapshot,
  getRecipeById,
} from '@/lib/meal-planner-store'
import { RecipeDetailModal } from '@/components/recipe-detail-modal'
import { toast } from 'sonner'

const SLOTS = [...MEAL_SLOT_VALUES] as MealSlot[]

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

const STATUS_LABELS: Record<Exclude<MealSelection, 'recipe'>, string> = {
  skip: 'Skip',
  eating_out: 'Eating Out',
  leftovers: 'Leftovers',
}

const STATUS_VALUES: Array<Exclude<MealSelection, 'recipe'>> = [
  'skip',
  'eating_out',
  'leftovers',
]

interface ShoppingItem {
  name: string
  qty: number | null
  unit: string
}

interface ShoppingStoreBucket {
  key: string
  storeId: string | null
  storeName: string
  items: ShoppingItem[]
}

function buildShoppingList(
  activeDateKeys: string[],
  slotMap: Map<string, { selection: MealSelection; recipeId: string | null }>,
  recipes: Recipe[],
  stores: GroceryStore[]
): ShoppingStoreBucket[] {
  const storeNameToId = new Map<string, string>()
  const storeById = new Map<string, GroceryStore>()
  for (const store of stores) {
    const normalized = store.name.trim().toLowerCase()
    if (normalized) storeNameToId.set(normalized, store.id)
    storeById.set(store.id, store)
  }

  const bucketMap = new Map<
    string,
    { storeId: string | null; storeName: string; items: ShoppingItem[] }
  >()

  for (const dateKey of activeDateKeys) {
    for (const slot of SLOTS) {
      const entry = slotMap.get(`${dateKey}:${slot}`)
      if (!entry || entry.selection !== 'recipe' || !entry.recipeId) continue
      const recipe = getRecipeById(recipes, entry.recipeId)
      if (!recipe) continue

      for (const ingredient of recipe.ingredients) {
        const explicitStoreId =
          typeof ingredient.storeId === 'string' && ingredient.storeId.trim()
            ? ingredient.storeId.trim()
            : null
        const ingredientStoreName = ingredient.store?.trim() || ''
        const inferredStoreId =
          !explicitStoreId && ingredientStoreName
            ? storeNameToId.get(ingredientStoreName.toLowerCase()) || null
            : null
        const storeId = explicitStoreId || inferredStoreId
        const resolvedStoreName = storeId
          ? storeById.get(storeId)?.name || ingredientStoreName || 'Unknown Store'
          : ingredientStoreName || 'Uncategorized'
        const bucketKey = storeId
          ? `id:${storeId}`
          : `name:${resolvedStoreName.toLowerCase()}`

        const current = bucketMap.get(bucketKey)
        if (!current) {
          bucketMap.set(bucketKey, {
            storeId,
            storeName: resolvedStoreName,
            items: [],
          })
        }
        bucketMap.get(bucketKey)?.items.push({
          name: ingredient.name,
          qty: ingredient.qty,
          unit: ingredient.unit,
        })
      }
    }
  }

  const buckets = Array.from(bucketMap.entries()).map(([key, value]) => {
    const deduped: Record<string, ShoppingItem> = {}
    for (const item of value.items) {
      const dedupeKey = `${item.name.toLowerCase()}|${item.unit.toLowerCase()}`
      if (deduped[dedupeKey]) {
        if (deduped[dedupeKey].qty !== null && item.qty !== null) {
          deduped[dedupeKey].qty = (deduped[dedupeKey].qty as number) + item.qty
        }
      } else {
        deduped[dedupeKey] = { ...item }
      }
    }
    return {
      key,
      storeId: value.storeId,
      storeName: value.storeName,
      items: Object.values(deduped).sort((a, b) => a.name.localeCompare(b.name)),
    }
  })

  return buckets.sort((a, b) => {
    if (a.storeName === 'Uncategorized') return 1
    if (b.storeName === 'Uncategorized') return -1
    return a.storeName.localeCompare(b.storeName)
  })
}

export function MealPlannerView() {
  const recipes = useRecipes()
  const stores = useGroceryStores()
  const mealPlanSlots = useMealPlanSlots()
  const [viewRecipe, setViewRecipe] = useState<Recipe | null>(null)
  const [startDate, setStartDate] = useState<string>(() => toDateKey(new Date()))
  const [dayCount, setDayCount] = useState<number>(7)
  const [buildingStoreId, setBuildingStoreId] = useState<string | null>(null)

  const activeDateKeys = useMemo(
    () => buildDateRange(startDate, dayCount),
    [startDate, dayCount]
  )

  const slotMap = useMemo(() => {
    const map = new Map<string, { selection: MealSelection; recipeId: string | null }>()
    for (const slot of mealPlanSlots) {
      map.set(`${slot.dateKey}:${slot.slot}`, {
        selection: slot.selection,
        recipeId: slot.recipeId,
      })
    }
    return map
  }, [mealPlanSlots])

  const totalPlanned = useMemo(() => {
    let count = 0
    for (const dateKey of activeDateKeys) {
      for (const slot of SLOTS) {
        if (slotMap.has(`${dateKey}:${slot}`)) count += 1
      }
    }
    return count
  }, [activeDateKeys, slotMap])

  const shoppingBuckets = useMemo(
    () => buildShoppingList(activeDateKeys, slotMap, recipes, stores),
    [activeDateKeys, slotMap, recipes, stores]
  )

  const storesById = useMemo(() => {
    const map = new Map<string, GroceryStore>()
    for (const store of stores) map.set(store.id, store)
    return map
  }, [stores])

  const getBuildDisabledReason = useCallback(
    (bucket: ShoppingStoreBucket): string | null => {
      if (!bucket.storeId) {
        return 'Items must be assigned to a saved store to build an online cart.'
      }
      const store = storesById.get(bucket.storeId)
      if (!store) return 'Store no longer exists.'
      if (!store.supportsOnlineOrdering) {
        return 'Online ordering is disabled for this store in Store Management.'
      }
      if (store.onlineOrderingProvider !== 'target') {
        return 'Only Target online ordering is currently supported.'
      }
      if (!store.onlineOrderingConfig?.targetStoreId) {
        return 'Store is missing Target online ordering configuration.'
      }
      return null
    },
    [storesById]
  )

  const handleBuildShoppingList = useCallback(
    async (bucket: ShoppingStoreBucket) => {
      const disabledReason = getBuildDisabledReason(bucket)
      if (disabledReason) {
        toast.error(disabledReason)
        return
      }
      if (!bucket.storeId) return

      const items = bucket.items
        .map((item) => ({
          name: item.name,
          qty: typeof item.qty === 'number' && item.qty > 0 ? item.qty : null,
          unit: item.unit,
        }))
        .filter((item) => item.name.trim().length > 0)

      if (items.length === 0) {
        toast.error('No valid items available for cart creation.')
        return
      }

      setBuildingStoreId(bucket.storeId)
      try {
        const response = await fetch('/api/shopping/cart-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: bucket.storeId, items }),
        })

        const raw = await response.text()
        const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}

        if (!response.ok) {
          const message =
            typeof payload.error === 'string' && payload.error.trim()
              ? payload.error
              : 'Unable to build shopping cart session.'
          throw new Error(message)
        }

        const checkoutUrl =
          typeof payload.checkoutUrl === 'string' ? payload.checkoutUrl.trim() : ''
        if (!checkoutUrl) {
          throw new Error('Cart session created without checkout URL.')
        }

        const popup = window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
        if (!popup) {
          window.location.href = checkoutUrl
          return
        }

        const unmatchedItems = Array.isArray(payload.unmatchedItems)
          ? payload.unmatchedItems.length
          : 0
        toast.success('Cart ready at Target', {
          description:
            unmatchedItems > 0
              ? `${unmatchedItems} item${unmatchedItems === 1 ? '' : 's'} need manual review.`
              : 'Your shopping cart session was created successfully.',
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to build shopping cart.'
        toast.error(message)
      } finally {
        setBuildingStoreId(null)
      }
    },
    [getBuildDisabledReason]
  )

  const handleSlotSelection = useCallback(
    async (dateKey: string, slot: MealSlot, value: string) => {
      try {
        if (value === '__empty') {
          await setMealSlot(dateKey, slot, null, null)
          return
        }

        if (value.startsWith('recipe:')) {
          const recipeId = value.slice('recipe:'.length).trim()
          if (!recipeId) return
          await setMealSlot(dateKey, slot, 'recipe', recipeId)
          return
        }

        if (value.startsWith('status:')) {
          const selection = value.slice('status:'.length) as Exclude<MealSelection, 'recipe'>
          if (!STATUS_VALUES.includes(selection)) return
          await setMealSlot(dateKey, slot, selection, null)
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to update meal slot.'
        toast.error(message)
      }
    },
    []
  )

  const handleSavePlan = useCallback(async () => {
    try {
      const snapshot = await saveMealPlanSnapshot({
        startDate,
        days: dayCount,
      })
      if (!snapshot) {
        toast.error('No meals to save in this date range yet.')
        return
      }
      toast.success('Meal plan snapshot saved', { description: snapshot.label })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save meal plan snapshot.'
      toast.error(message)
    }
  }, [dayCount, startDate])

  const handleClearRange = useCallback(() => {
    void clearMealPlan({ startDate, days: dayCount }).catch((error) => {
      const message =
        error instanceof Error ? error.message : 'Unable to clear meal slots.'
      toast.error(message)
    })
  }, [dayCount, startDate])

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <Calendar className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Meal Planner</h2>
              <p className="text-xs text-muted-foreground">
                {totalPlanned} slot{totalPlanned !== 1 ? 's' : ''} planned in this range
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[12rem_7rem_auto_auto]">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value || toDateKey(new Date()))}
              aria-label="Start date"
            />
            <Select
              value={String(dayCount)}
              onValueChange={(value) => setDayCount(Number.parseInt(value, 10) || 7)}
            >
              <SelectTrigger aria-label="Total days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 14 }, (_, index) => index + 1).map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} day{value !== 1 ? 's' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              onClick={handleSavePlan}
              disabled={totalPlanned === 0}
            >
              Save Plan
            </Button>
            <Button
              variant="outline"
              onClick={handleClearRange}
              disabled={totalPlanned === 0}
            >
              <Trash2 className="size-4" />
              Clear Range
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="min-w-0 flex-1">
          <ScrollArea className="w-full">
            <div className="grid min-w-max grid-flow-col auto-cols-[minmax(220px,1fr)] gap-4 pb-2">
              {activeDateKeys.map((dateKey) => (
                <Card key={dateKey} className="border-border/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-foreground">
                      {formatDateLabel(dateKey, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {SLOTS.map((slot) => {
                      const key = `${dateKey}:${slot}`
                      const entry = slotMap.get(key)
                      const recipe =
                        entry?.selection === 'recipe' && entry.recipeId
                          ? getRecipeById(recipes, entry.recipeId)
                          : undefined
                      const selectValue = entry
                        ? entry.selection === 'recipe' && entry.recipeId
                          ? `recipe:${entry.recipeId}`
                          : `status:${entry.selection}`
                        : '__empty'

                      return (
                        <div key={slot} className="rounded-lg border border-border bg-muted/20 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {SLOT_LABELS[slot]}
                            </p>
                            {entry && entry.selection !== 'recipe' ? (
                              <Badge variant="secondary" className="text-[11px]">
                                {STATUS_LABELS[entry.selection as Exclude<MealSelection, 'recipe'>]}
                              </Badge>
                            ) : null}
                          </div>

                          <Select
                            value={selectValue}
                            onValueChange={(value) => {
                              void handleSlotSelection(dateKey, slot, value)
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs bg-background">
                              <SelectValue placeholder="Select meal" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__empty">No plan</SelectItem>
                              {STATUS_VALUES.map((statusValue) => (
                                <SelectItem
                                  key={statusValue}
                                  value={`status:${statusValue}`}
                                >
                                  {STATUS_LABELS[statusValue]}
                                </SelectItem>
                              ))}
                              {recipes.map((recipeOption) => (
                                <SelectItem
                                  key={recipeOption.id}
                                  value={`recipe:${recipeOption.id}`}
                                >
                                  {recipeOption.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {recipe ? (
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <p className="line-clamp-2 text-sm font-medium text-foreground">
                                {recipe.name}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setViewRecipe(recipe)}
                                className="h-7 px-2"
                              >
                                <Eye className="size-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="xl:w-80 xl:shrink-0">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-border bg-muted/40 px-4 py-3">
              <ShoppingCart className="size-4 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Shopping List</h3>
              <Badge variant="outline" className="ml-auto text-xs">
                {shoppingBuckets.reduce((sum, bucket) => sum + bucket.items.length, 0)} items
              </Badge>
            </div>
            <CardContent className="p-3">
              {shoppingBuckets.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-7 text-center">
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <Store className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add recipe slots in this date range to build your list.
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[calc(100vh-15rem)]">
                  <div className="space-y-3">
                    {shoppingBuckets.map((bucket) => {
                      const disabledReason = getBuildDisabledReason(bucket)
                      const isBuilding = Boolean(
                        bucket.storeId && buildingStoreId === bucket.storeId
                      )
                      return (
                        <div key={bucket.key} className="rounded-md border border-border p-2">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground">
                              {bucket.storeName}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 px-2 text-[11px]"
                              disabled={Boolean(disabledReason) || isBuilding}
                              onClick={() => {
                                void handleBuildShoppingList(bucket)
                              }}
                              title={disabledReason || undefined}
                            >
                              {isBuilding ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                'Build Shopping List'
                              )}
                            </Button>
                          </div>
                          {disabledReason ? (
                            <p className="mb-2 text-[11px] text-muted-foreground">
                              {disabledReason}
                            </p>
                          ) : null}
                        <div className="space-y-1">
                          {bucket.items.map((item, index) => (
                            <p
                              key={`${bucket.key}-${index}`}
                              className="text-xs text-muted-foreground"
                            >
                              {item.qty !== null
                                ? `${Number.isInteger(item.qty)
                                    ? item.qty
                                    : item.qty.toFixed(2).replace(/\.?0+$/, '')} `
                                : ''}
                              {item.unit ? `${item.unit} ` : ''}
                              {item.name}
                            </p>
                          ))}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <RecipeDetailModal
        recipe={viewRecipe}
        open={Boolean(viewRecipe)}
        onOpenChange={(open) => {
          if (!open) setViewRecipe(null)
        }}
      />
    </div>
  )
}
