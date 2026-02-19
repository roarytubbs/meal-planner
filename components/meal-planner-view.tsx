'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  Eye,
  Loader2,
  MoreHorizontal,
  ShoppingCart,
  Store,
  Trash2,
  X,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

interface RecipeSearchFieldProps {
  dateKey: string
  slotLabel: string
  recipes: Recipe[]
  selectedRecipe: Recipe | null
  onSelectRecipe: (recipeId: string) => void
  onClearSelection: () => void
}

function RecipeSearchField({
  dateKey,
  slotLabel,
  recipes,
  selectedRecipe,
  onSelectRecipe,
  onClearSelection,
}: RecipeSearchFieldProps) {
  const [query, setQuery] = useState(selectedRecipe?.name ?? '')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  useEffect(() => {
    setQuery(selectedRecipe?.name ?? '')
  }, [selectedRecipe?.id, selectedRecipe?.name])

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return recipes.slice(0, 8)

    const startsWithMatches = recipes.filter((recipe) =>
      recipe.name.toLowerCase().startsWith(normalizedQuery)
    )
    const includesMatches = recipes.filter(
      (recipe) =>
        !recipe.name.toLowerCase().startsWith(normalizedQuery) &&
        recipe.name.toLowerCase().includes(normalizedQuery)
    )

    return [...startsWithMatches, ...includesMatches].slice(0, 8)
  }, [query, recipes])

  const handleSelect = useCallback(
    (recipe: Recipe) => {
      setQuery(recipe.name)
      setOpen(false)
      setHighlightIndex(-1)
      onSelectRecipe(recipe.id)
    },
    [onSelectRecipe]
  )

  const handleClear = useCallback(() => {
    setQuery('')
    setOpen(false)
    setHighlightIndex(-1)
    onClearSelection()
  }, [onClearSelection])

  const commitQuery = useCallback(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      if (selectedRecipe) handleClear()
      return
    }

    const exactMatch = recipes.find(
      (recipe) => recipe.name.trim().toLowerCase() === normalized
    )
    if (exactMatch) {
      if (selectedRecipe?.id !== exactMatch.id) {
        onSelectRecipe(exactMatch.id)
      }
      setQuery(exactMatch.name)
      return
    }

    if (selectedRecipe) {
      setQuery(selectedRecipe.name)
    }
  }, [handleClear, onSelectRecipe, query, recipes, selectedRecipe])

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setHighlightIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            commitQuery()
            setOpen(false)
          }, 120)
        }}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) {
            if (event.key === 'Escape') setOpen(false)
            return
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
            return
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            const target =
              highlightIndex >= 0 ? suggestions[highlightIndex] : suggestions[0]
            if (target) handleSelect(target)
            return
          }
          if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        className="h-8 pr-7 text-xs"
        placeholder="Search recipes..."
        aria-label={`${slotLabel} recipe search for ${dateKey}`}
        autoComplete="off"
      />

      {query ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Clear ${slotLabel} recipe selection`}
        >
          <X className="size-3.5" />
        </button>
      ) : null}

      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md"
          role="listbox"
        >
          {suggestions.length > 0 ? (
            <div className="max-h-52 overflow-y-auto p-1">
              {suggestions.map((recipe, index) => (
                <button
                  key={recipe.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlightIndex}
                  className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs ${
                    index === highlightIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'text-popover-foreground hover:bg-accent/50'
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    handleSelect(recipe)
                  }}
                  onClick={() => handleSelect(recipe)}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  <span className="truncate">{recipe.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matching recipes.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

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

  const updateSlot = useCallback(
    async (
      dateKey: string,
      slot: MealSlot,
      selection: MealSelection | null,
      recipeId: string | null
    ) => {
      try {
        await setMealSlot(dateKey, slot, selection, recipeId)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to update meal slot.'
        toast.error(message)
      }
    },
    []
  )

  const handleRecipeSelection = useCallback(
    (dateKey: string, slot: MealSlot, recipeId: string) => {
      if (!recipeId.trim()) return
      void updateSlot(dateKey, slot, 'recipe', recipeId)
    },
    [updateSlot]
  )

  const handleStatusSelection = useCallback(
    (dateKey: string, slot: MealSlot, selection: Exclude<MealSelection, 'recipe'>) => {
      if (!STATUS_VALUES.includes(selection)) return
      void updateSlot(dateKey, slot, selection, null)
    },
    [updateSlot]
  )

  const handleClearSelection = useCallback(
    (dateKey: string, slot: MealSlot) => {
      void updateSlot(dateKey, slot, null, null)
    },
    [updateSlot]
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
          <div className="space-y-3">
              {activeDateKeys.map((dateKey) => (
                <Card
                  key={dateKey}
                  className="w-full gap-3 border-border/80 py-4"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-foreground">
                      {formatDateLabel(dateKey, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                    {SLOTS.map((slot) => {
                      const key = `${dateKey}:${slot}`
                      const entry = slotMap.get(key)
                      const recipe =
                        entry?.selection === 'recipe' && entry.recipeId
                          ? getRecipeById(recipes, entry.recipeId)
                          : undefined

                      return (
                        <div
                          key={slot}
                          className="rounded-lg border border-border bg-muted/20 p-2.5"
                        >
                          <div className="mb-2 flex items-center justify-between gap-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {SLOT_LABELS[slot]}
                            </p>
                            <div className="flex items-center gap-1">
                              {entry && entry.selection !== 'recipe' ? (
                                <Badge variant="secondary" className="text-[11px]">
                                  {STATUS_LABELS[entry.selection as Exclude<MealSelection, 'recipe'>]}
                                </Badge>
                              ) : null}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-6"
                                    aria-label={`${SLOT_LABELS[slot]} status options for ${dateKey}`}
                                  >
                                    <MoreHorizontal className="size-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  {STATUS_VALUES.map((statusValue) => (
                                    <DropdownMenuItem
                                      key={`${dateKey}-${slot}-${statusValue}`}
                                      onSelect={() =>
                                        handleStatusSelection(dateKey, slot, statusValue)
                                      }
                                    >
                                      {STATUS_LABELS[statusValue]}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuItem
                                    onSelect={() => handleClearSelection(dateKey, slot)}
                                  >
                                    No plan
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <RecipeSearchField
                            dateKey={dateKey}
                            slotLabel={SLOT_LABELS[slot]}
                            recipes={recipes}
                            selectedRecipe={recipe ?? null}
                            onSelectRecipe={(recipeId) =>
                              handleRecipeSelection(dateKey, slot, recipeId)
                            }
                            onClearSelection={() => handleClearSelection(dateKey, slot)}
                          />

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
