'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  ChevronDown,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  ShoppingCart,
  Store,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  buildShoppingList,
  type PlannedSlotState,
  type ShoppingStoreBucket,
} from '@/lib/shopping-list'
import type {
  GroceryStore,
  MealPlanSnapshot,
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
  activateMealPlanSnapshot,
  useRecipes,
  useMealPlanSlots,
  useMealPlanSnapshots,
  useGroceryStores,
  setMealSlot,
  clearMealPlan,
  saveMealPlanSnapshot,
  getRecipeById,
  replaceMealPlanSlots,
} from '@/lib/meal-planner-store'
import {
  getSnapshotDateRange,
  partitionSnapshotsByRecency,
  snapshotToSlotUpdates,
} from '@/lib/meal-plan-snapshot-utils'
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
  slot: MealSlot
  slotLabel: string
  recipes: Recipe[]
  disabled?: boolean
  onSelectRecipe: (recipeId: string) => void
  onViewRecipe?: (recipe: Recipe) => void
}

function RecipeSearchField({
  dateKey,
  slot,
  slotLabel,
  recipes,
  disabled = false,
  onSelectRecipe,
  onViewRecipe,
}: RecipeSearchFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [menuPlacement, setMenuPlacement] = useState<'top' | 'bottom'>('bottom')

  const suggestions = useMemo(() => {
    const slotScopedRecipes = recipes.filter(
      (recipe) => recipe.mealType === '' || recipe.mealType === slot
    )
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return slotScopedRecipes.slice(0, 8)

    const startsWithMatches = slotScopedRecipes.filter((recipe) =>
      recipe.name.toLowerCase().startsWith(normalizedQuery)
    )
    const includesMatches = slotScopedRecipes.filter(
      (recipe) =>
        !recipe.name.toLowerCase().startsWith(normalizedQuery) &&
        recipe.name.toLowerCase().includes(normalizedQuery)
    )

    return [...startsWithMatches, ...includesMatches].slice(0, 8)
  }, [query, recipes, slot])

  const handleSelect = useCallback(
    (recipe: Recipe) => {
      if (disabled) return
      setQuery('')
      setOpen(false)
      setHighlightIndex(-1)
      onSelectRecipe(recipe.id)
    },
    [disabled, onSelectRecipe]
  )

  const clearQuery = useCallback(() => {
    if (disabled) return
    setQuery('')
    setOpen(false)
    setHighlightIndex(-1)
  }, [disabled])

  const commitQuery = useCallback(() => {
    if (disabled) return
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      setQuery('')
      return
    }

    const exactMatch = recipes.find(
      (recipe) => recipe.name.trim().toLowerCase() === normalized
    )
    if (exactMatch) {
      onSelectRecipe(exactMatch.id)
      setQuery('')
      return
    }
    setQuery('')
  }, [disabled, onSelectRecipe, query, recipes])

  const updateMenuPlacement = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const estimatedMenuHeight = Math.min(260, 56 + Math.max(1, suggestions.length) * 34)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    if (spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow) {
      setMenuPlacement('top')
      return
    }
    setMenuPlacement('bottom')
  }, [suggestions.length])

  useEffect(() => {
    if (!open) return
    updateMenuPlacement()

    const handleViewportChange = () => {
      updateMenuPlacement()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updateMenuPlacement])

  return (
    <div ref={containerRef} className="relative">
      <Input
        disabled={disabled}
        value={query}
        onChange={(event) => {
          if (disabled) return
          setQuery(event.target.value)
          setOpen(true)
          setHighlightIndex(-1)
        }}
        onFocus={() => {
          if (!disabled) setOpen(true)
        }}
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
        placeholder="Add recipe..."
        aria-label={`${slotLabel} recipe search for ${dateKey}`}
        autoComplete="off"
      />

      {query ? (
        <button
          type="button"
          disabled={disabled}
          onClick={clearQuery}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Clear ${slotLabel} recipe search`}
        >
          <X className="size-3.5" />
        </button>
      ) : null}

      {open ? (
        <div
          className={`absolute left-0 z-50 w-full rounded-md border border-border bg-popover shadow-md ${
            menuPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          role="listbox"
        >
          <p className="border-b border-border px-2 py-1.5 text-[11px] text-muted-foreground">
            Showing {slotLabel.toLowerCase()} and uncategorized recipes
          </p>
          {suggestions.length > 0 ? (
            <div className="max-h-52 overflow-y-auto p-1">
              {suggestions.map((recipe, index) => (
                <div
                  key={recipe.id}
                  role="option"
                  aria-selected={index === highlightIndex}
                  className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs ${
                    index === highlightIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'text-popover-foreground hover:bg-accent/50'
                  }`}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      handleSelect(recipe)
                    }}
                    onClick={() => handleSelect(recipe)}
                  >
                    {recipe.name}
                  </button>
                  {onViewRecipe ? (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onViewRecipe(recipe)}
                    >
                      View details
                    </button>
                  ) : null}
                </div>
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

interface OptimisticSlotState {
  selection: MealSelection | null
  recipeId: string | null
}

interface CreatedCartSession {
  key: string
  storeName: string
  checkoutUrl: string
  unmatchedItems: number
}

interface CartBuildFailure {
  key: string
  storeName: string
  message: string
}

interface MealPlannerViewProps {
  onEditRecipe?: (recipe: Recipe) => void
}

function buildDefaultPlanLabel(dateKeys: string[]): string {
  if (dateKeys.length === 0) return 'Meal Plan'
  const start = formatDateLabel(dateKeys[0], { month: 'short', day: 'numeric' })
  const end = formatDateLabel(dateKeys[dateKeys.length - 1], {
    month: 'short',
    day: 'numeric',
  })
  return dateKeys.length === 1 ? `Plan ${start}` : `Plan ${start} - ${end}`
}

function formatSnapshotRangeSummary(snapshot: MealPlanSnapshot | null): string {
  if (!snapshot) return ''
  const range = getSnapshotDateRange(snapshot)
  if (!range) return ''
  return `${formatDateLabel(range.startDateKey, { month: 'short', day: 'numeric' })} - ${formatDateLabel(range.endDateKey, { month: 'short', day: 'numeric' })}`
}

export function MealPlannerView({ onEditRecipe }: MealPlannerViewProps) {
  const recipes = useRecipes()
  const snapshots = useMealPlanSnapshots()
  const stores = useGroceryStores()
  const mealPlanSlots = useMealPlanSlots()
  const [viewRecipe, setViewRecipe] = useState<Recipe | null>(null)
  const [startDate, setStartDate] = useState<string>(() => toDateKey(new Date()))
  const [dayCount, setDayCount] = useState<number>(7)
  const [buildingStoreId, setBuildingStoreId] = useState<string | null>(null)
  const [buildingAllCarts, setBuildingAllCarts] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [createdCarts, setCreatedCarts] = useState<CreatedCartSession[]>([])
  const [cartBuildFailures, setCartBuildFailures] = useState<CartBuildFailure[]>([])
  const [cartResultsDialogOpen, setCartResultsDialogOpen] = useState(false)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('')
  const [loadingSnapshotId, setLoadingSnapshotId] = useState<string | null>(null)
  const [cartUnavailableStoreIds, setCartUnavailableStoreIds] = useState<Set<string>>(
    () => new Set()
  )
  const [openStoreKeys, setOpenStoreKeys] = useState<Set<string>>(() => new Set())
  const [optimisticSlots, setOptimisticSlots] = useState<Map<string, OptimisticSlotState>>(
    () => new Map()
  )
  const [pendingSlotKeys, setPendingSlotKeys] = useState<Set<string>>(() => new Set())
  const pendingSlotKeysRef = useRef<Set<string>>(new Set())

  const activeDateKeys = useMemo(
    () => buildDateRange(startDate, dayCount),
    [startDate, dayCount]
  )

  useEffect(() => {
    if (saveDialogOpen) return
    setSaveLabel(buildDefaultPlanLabel(activeDateKeys))
    setSaveDescription('')
  }, [activeDateKeys, saveDialogOpen])

  const slotMap = useMemo(() => {
    const map = new Map<string, PlannedSlotState>()
    for (const slot of mealPlanSlots) {
      map.set(`${slot.dateKey}:${slot.slot}`, {
        selection: slot.selection,
        recipeId: slot.recipeId,
      })
    }
    return map
  }, [mealPlanSlots])

  const effectiveSlotMap = useMemo(() => {
    const merged = new Map<string, PlannedSlotState>(slotMap)
    for (const [key, entry] of optimisticSlots.entries()) {
      if (!entry.selection) {
        merged.delete(key)
        continue
      }
      merged.set(key, {
        selection: entry.selection,
        recipeId: entry.selection === 'recipe' ? entry.recipeId : null,
      })
    }
    return merged
  }, [optimisticSlots, slotMap])

  useEffect(() => {
    setOptimisticSlots((previous) => {
      let changed = false
      const next = new Map(previous)

      for (const [key, entry] of previous.entries()) {
        const persisted = slotMap.get(key)
        const persistedSelection = persisted?.selection ?? null
        const persistedRecipeId = persisted?.recipeId ?? null
        if (persistedSelection === entry.selection && persistedRecipeId === entry.recipeId) {
          next.delete(key)
          changed = true
        }
      }

      return changed ? next : previous
    })
  }, [slotMap])

  const totalPlanned = useMemo(() => {
    let count = 0
    for (const dateKey of activeDateKeys) {
      for (const slot of SLOTS) {
        if (effectiveSlotMap.has(`${dateKey}:${slot}`)) count += 1
      }
    }
    return count
  }, [activeDateKeys, effectiveSlotMap])

  const shoppingBuckets = useMemo(
    () => buildShoppingList(activeDateKeys, effectiveSlotMap, recipes, stores),
    [activeDateKeys, effectiveSlotMap, recipes, stores]
  )

  const storesById = useMemo(() => {
    const map = new Map<string, GroceryStore>()
    for (const store of stores) map.set(store.id, store)
    return map
  }, [stores])

  const recipeIdSet = useMemo(() => new Set(recipes.map((recipe) => recipe.id)), [recipes])

  const sortedSnapshots = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [snapshots]
  )

  const { current: currentSnapshots, previous: previousSnapshots } = useMemo(
    () => partitionSnapshotsByRecency(sortedSnapshots),
    [sortedSnapshots]
  )

  const selectedSnapshot = useMemo(
    () =>
      sortedSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) || null,
    [selectedSnapshotId, sortedSnapshots]
  )
  const selectedSnapshotRangeSummary = useMemo(
    () => formatSnapshotRangeSummary(selectedSnapshot),
    [selectedSnapshot]
  )

  useEffect(() => {
    if (!selectedSnapshotId) return
    if (sortedSnapshots.some((snapshot) => snapshot.id === selectedSnapshotId)) return
    setSelectedSnapshotId('')
  }, [selectedSnapshotId, sortedSnapshots])

  useEffect(() => {
    if (selectedSnapshotId) return
    const active = sortedSnapshots.find((snapshot) => snapshot.isActive)
    if (!active) return
    setSelectedSnapshotId(active.id)
  }, [selectedSnapshotId, sortedSnapshots])

  const getBuildDisabledReason = useCallback(
    (bucket: ShoppingStoreBucket): string | null => {
      if (!bucket.storeId) {
        return 'Items must be assigned to a saved store to build an online cart.'
      }
      if (cartUnavailableStoreIds.has(bucket.storeId)) {
        return 'Online cart integration is unavailable for this store right now.'
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
    [cartUnavailableStoreIds, storesById]
  )

  const creatableCartBucketCount = useMemo(
    () =>
      shoppingBuckets.reduce(
        (count, bucket) => count + (getBuildDisabledReason(bucket) ? 0 : 1),
        0
      ),
    [getBuildDisabledReason, shoppingBuckets]
  )

  const toCartSessionItems = useCallback((bucket: ShoppingStoreBucket) => {
    return bucket.items
      .map((item) => ({
        name: item.name,
        qty: typeof item.qty === 'number' && item.qty > 0 ? item.qty : null,
        unit: item.unit,
      }))
      .filter((item) => item.name.trim().length > 0)
  }, [])

  const requestCartSession = useCallback(
    async (
      bucket: ShoppingStoreBucket
    ): Promise<{ checkoutUrl: string; unmatchedItems: number }> => {
      const disabledReason = getBuildDisabledReason(bucket)
      if (disabledReason) {
        throw new Error(disabledReason)
      }
      if (!bucket.storeId) {
        throw new Error('Items must be assigned to a saved store to build an online cart.')
      }

      const items = toCartSessionItems(bucket)
      if (items.length === 0) {
        throw new Error('No valid items available for cart creation.')
      }

      const response = await fetch('/api/shopping/cart-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: bucket.storeId, items }),
      })

      const raw = await response.text()
      let payload: Record<string, unknown> = {}
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            payload = parsed as Record<string, unknown>
          }
        } catch {
          payload = {}
        }
      }

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

      return {
        checkoutUrl,
        unmatchedItems: Array.isArray(payload.unmatchedItems)
          ? payload.unmatchedItems.length
          : 0,
      }
    },
    [getBuildDisabledReason, toCartSessionItems]
  )

  const handleBuildShoppingList = useCallback(
    async (bucket: ShoppingStoreBucket) => {
      if (!bucket.storeId) return

      setBuildingStoreId(bucket.storeId)
      try {
        const session = await requestCartSession(bucket)

        const popup = window.open(session.checkoutUrl, '_blank', 'noopener,noreferrer')
        if (!popup) {
          window.location.href = session.checkoutUrl
        }

        toast.success(`Cart ready for ${bucket.storeName}`, {
          description:
            session.unmatchedItems > 0
              ? `${session.unmatchedItems} item${session.unmatchedItems === 1 ? '' : 's'} need manual review.`
              : 'Your shopping cart session was created successfully.',
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to build shopping cart.'
        if (
          bucket.storeId &&
          /integration is not configured|provider is not configured|provider unavailable/i.test(
            message
          )
        ) {
          setCartUnavailableStoreIds((previous) => {
            if (previous.has(bucket.storeId as string)) return previous
            const next = new Set(previous)
            next.add(bucket.storeId as string)
            return next
          })
        }
        toast.error(message)
      } finally {
        setBuildingStoreId(null)
      }
    },
    [requestCartSession]
  )

  const handleBuildAllShoppingCarts = useCallback(async () => {
    if (pendingSlotKeysRef.current.size > 0) {
      toast.info('Please wait for meal slot updates to finish syncing.')
      return
    }
    if (buildingAllCarts || buildingStoreId) return

    const eligibleBuckets = shoppingBuckets.filter(
      (bucket) => !getBuildDisabledReason(bucket)
    )
    if (eligibleBuckets.length === 0) {
      toast.error('No eligible stores are ready for online cart creation.')
      return
    }

    setBuildingAllCarts(true)
    const successes: CreatedCartSession[] = []
    const failures: CartBuildFailure[] = []

    try {
      for (const bucket of eligibleBuckets) {
        if (!bucket.storeId) continue
        setBuildingStoreId(bucket.storeId)
        try {
          const session = await requestCartSession(bucket)
          successes.push({
            key: bucket.key,
            storeName: bucket.storeName,
            checkoutUrl: session.checkoutUrl,
            unmatchedItems: session.unmatchedItems,
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to create shopping cart for this store.'
          if (
            bucket.storeId &&
            /integration is not configured|provider is not configured|provider unavailable/i.test(
              message
            )
          ) {
            setCartUnavailableStoreIds((previous) => {
              if (previous.has(bucket.storeId as string)) return previous
              const next = new Set(previous)
              next.add(bucket.storeId as string)
              return next
            })
          }
          failures.push({
            key: bucket.key,
            storeName: bucket.storeName,
            message,
          })
        }
      }
    } finally {
      setBuildingStoreId(null)
      setBuildingAllCarts(false)
    }

    setCreatedCarts(successes)
    setCartBuildFailures(failures)

    if (successes.length > 0) {
      setCartResultsDialogOpen(true)
      toast.success(
        `Created ${successes.length} cart${successes.length === 1 ? '' : 's'}.`,
        failures.length > 0
          ? {
              description: `${failures.length} store${failures.length === 1 ? '' : 's'} could not be created.`,
            }
          : undefined
      )
      return
    }

    toast.error('Unable to create carts for the selected stores.')
  }, [
    buildingAllCarts,
    buildingStoreId,
    getBuildDisabledReason,
    requestCartSession,
    shoppingBuckets,
  ])

  const updateSlot = useCallback(
    async (
      dateKey: string,
      slot: MealSlot,
      selection: MealSelection | null,
      recipeId: string | null
    ) => {
      const slotKey = `${dateKey}:${slot}`
      if (pendingSlotKeysRef.current.has(slotKey)) return
      pendingSlotKeysRef.current.add(slotKey)

      const nextState: OptimisticSlotState = {
        selection,
        recipeId: selection === 'recipe' ? recipeId : null,
      }
      const previousState = effectiveSlotMap.get(slotKey)

      setPendingSlotKeys(new Set(pendingSlotKeysRef.current))
      setOptimisticSlots((previous) => {
        const next = new Map(previous)
        next.set(slotKey, nextState)
        return next
      })

      try {
        await setMealSlot(dateKey, slot, selection, recipeId)
      } catch (error) {
        setOptimisticSlots((previous) => {
          const next = new Map(previous)
          if (previousState) {
            next.set(slotKey, {
              selection: previousState.selection,
              recipeId: previousState.recipeId,
            })
          } else {
            next.delete(slotKey)
          }
          return next
        })
        const message =
          error instanceof Error ? error.message : 'Unable to update meal slot.'
        toast.error(message)
      } finally {
        pendingSlotKeysRef.current.delete(slotKey)
        setPendingSlotKeys(new Set(pendingSlotKeysRef.current))
      }
    },
    [effectiveSlotMap]
  )

  const handleRecipeSelection = useCallback(
    (dateKey: string, slot: MealSlot, recipeId: string) => {
      const normalizedRecipeId = recipeId.trim()
      if (!normalizedRecipeId) return
      void updateSlot(dateKey, slot, 'recipe', normalizedRecipeId)
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

  const handleOpenSaveDialog = useCallback(() => {
    if (pendingSlotKeysRef.current.size > 0) {
      toast.info('Please wait for meal slot updates to finish syncing.')
      return
    }
    setSaveLabel(buildDefaultPlanLabel(activeDateKeys))
    setSaveDescription('')
    setSaveDialogOpen(true)
  }, [activeDateKeys])

  const handleConfirmSavePlan = useCallback(async (options?: { createCarts?: boolean }) => {
    if (pendingSlotKeysRef.current.size > 0) {
      toast.info('Please wait for meal slot updates to finish syncing.')
      return
    }
    const shouldCreateCarts = options?.createCarts === true
    try {
      setSavingSnapshot(true)
      const snapshot = await saveMealPlanSnapshot({
        label: saveLabel.trim() || undefined,
        description: saveDescription.trim() || undefined,
        startDate,
        days: dayCount,
      })
      if (!snapshot) {
        if (totalPlanned > 0) {
          toast.error('Your meal changes are still syncing. Please try Save Plan again.')
        } else {
          toast.error('No meals to save in this date range yet.')
        }
        return
      }
      toast.success('Meal plan snapshot saved', { description: snapshot.label })
      setSaveDialogOpen(false)
      if (shouldCreateCarts) {
        void handleBuildAllShoppingCarts()
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save meal plan snapshot.'
      toast.error(message)
    } finally {
      setSavingSnapshot(false)
    }
  }, [
    dayCount,
    handleBuildAllShoppingCarts,
    saveDescription,
    saveLabel,
    startDate,
    totalPlanned,
  ])

  const handleClearRange = useCallback(() => {
    void clearMealPlan({ startDate, days: dayCount })
      .then(() => {
        pendingSlotKeysRef.current.clear()
        setPendingSlotKeys(new Set())
        setOptimisticSlots(new Map())
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : 'Unable to clear meal slots.'
        toast.error(message)
      })
  }, [dayCount, startDate])

  const handleLoadSnapshot = useCallback(async () => {
    if (!selectedSnapshot) {
      toast.error('Select a saved meal plan to load.')
      return
    }
    if (pendingSlotKeysRef.current.size > 0) {
      toast.info('Please wait for meal slot updates to finish syncing.')
      return
    }

    setLoadingSnapshotId(selectedSnapshot.id)
    try {
      const { slots, skippedMeals } = snapshotToSlotUpdates(selectedSnapshot, recipeIdSet)
      if (slots.length === 0) {
        toast.error('No valid meals available to load from this plan.')
        return
      }

      await replaceMealPlanSlots(slots)
      await activateMealPlanSnapshot(selectedSnapshot.id)

      const range = getSnapshotDateRange(selectedSnapshot)
      if (range) {
        setStartDate(range.startDateKey)
        setDayCount(Math.max(1, Math.min(14, range.days)))
      }

      if (skippedMeals > 0) {
        toast.success('Meal plan loaded', {
          description: `${selectedSnapshot.label} loaded with ${skippedMeals} skipped meal${skippedMeals === 1 ? '' : 's'}.`,
        })
      } else {
        toast.success('Meal plan loaded', { description: selectedSnapshot.label })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load meal plan.'
      toast.error(message)
    } finally {
      setLoadingSnapshotId(null)
    }
  }, [recipeIdSet, selectedSnapshot])

  const setStoreSectionOpen = useCallback((bucketKey: string, open: boolean) => {
    setOpenStoreKeys((previous) => {
      const next = new Set(previous)
      if (open) next.add(bucketKey)
      else next.delete(bucketKey)
      return next
    })
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <Calendar className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Meal Planner</h2>
              <p className="text-xs text-muted-foreground">
                {totalPlanned} slot{totalPlanned !== 1 ? 's' : ''} planned in this range
              </p>
              {selectedSnapshot ? (
                <p className="text-xs text-muted-foreground">
                  Selected plan: {selectedSnapshot.label}
                  {selectedSnapshotRangeSummary
                    ? ` (${selectedSnapshotRangeSummary})`
                    : ''}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[12rem_7rem_minmax(0,1fr)_auto_auto_auto_auto]">
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
            <Select
              value={selectedSnapshotId}
              onValueChange={setSelectedSnapshotId}
            >
              <SelectTrigger aria-label="Saved meal plans">
                <SelectValue placeholder="Select saved plan" />
              </SelectTrigger>
              <SelectContent>
                {currentSnapshots.length > 0 ? (
                  <>
                    {currentSnapshots.map((snapshot) => (
                      <SelectItem key={`current-${snapshot.id}`} value={snapshot.id}>
                        {snapshot.label}
                        {snapshot.isActive ? ' (Active)' : ''}
                      </SelectItem>
                    ))}
                  </>
                ) : null}
                {previousSnapshots.length > 0 ? (
                  <>
                    {previousSnapshots.map((snapshot) => (
                      <SelectItem key={`previous-${snapshot.id}`} value={snapshot.id}>
                        {snapshot.label}
                        {snapshot.isActive ? ' (Active)' : ' (Previous)'}
                      </SelectItem>
                    ))}
                  </>
                ) : null}
                {sortedSnapshots.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No saved meal plans
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleLoadSnapshot()}
              disabled={!selectedSnapshot || loadingSnapshotId !== null}
            >
              {loadingSnapshotId ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load Plan'
              )}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/plans">Saved Plans</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={handleClearRange}
              disabled={totalPlanned === 0}
            >
              Reset Plan
            </Button>
            <Button
              onClick={handleOpenSaveDialog}
              disabled={totalPlanned === 0}
              className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Save Plan
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="min-w-0 flex-1">
          <div className="overflow-visible rounded-xl border border-border/60 bg-card/25">
            {activeDateKeys.map((dateKey) => (
              <section
                key={dateKey}
                className="px-4 py-4 first:pt-4 last:pb-4 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border/60"
              >
                <div className="pb-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {formatDateLabel(dateKey, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </h3>
                </div>
                <div className="pt-0">
                  <div className="divide-y divide-border/50">
                    {SLOTS.map((slot) => {
                      const key = `${dateKey}:${slot}`
                      const entry = effectiveSlotMap.get(key)
                      const isSlotPending = pendingSlotKeys.has(key)
                      const statusSelection =
                        entry && entry.selection !== 'recipe' ? entry.selection : null
                      const recipe =
                        entry?.selection === 'recipe' && entry.recipeId
                          ? getRecipeById(recipes, entry.recipeId)
                          : undefined

                      return (
                        <div key={slot} className="space-y-2 py-3 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold tracking-tight text-foreground">
                              {SLOT_LABELS[slot]}
                            </p>
                            <div className="flex items-center gap-1">
                              {isSlotPending ? (
                                <span className="text-[11px] text-muted-foreground">
                                  Saving...
                                </span>
                              ) : null}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-6"
                                    disabled={isSlotPending}
                                    aria-label={`${SLOT_LABELS[slot]} status options for ${dateKey}`}
                                  >
                                    <MoreHorizontal className="size-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  {STATUS_VALUES.map((statusValue) => (
                                    <DropdownMenuItem
                                      key={`${dateKey}-${slot}-${statusValue}`}
                                      disabled={isSlotPending}
                                      onSelect={() =>
                                        handleStatusSelection(dateKey, slot, statusValue)
                                      }
                                    >
                                      {STATUS_LABELS[statusValue]}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuItem
                                    disabled={isSlotPending}
                                    onSelect={() => handleClearSelection(dateKey, slot)}
                                  >
                                    Select plan
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          {statusSelection ? (
                            <div className="rounded-md border border-border/60 bg-muted/35 px-3 py-2">
                              <p className="text-xs text-muted-foreground">
                                This meal is marked as{' '}
                                {STATUS_LABELS[statusSelection].toLowerCase()}.
                              </p>
                            </div>
                          ) : (
                            <>
                              <RecipeSearchField
                                dateKey={dateKey}
                                slot={slot}
                                slotLabel={SLOT_LABELS[slot]}
                                recipes={recipes}
                                disabled={isSlotPending}
                                onSelectRecipe={(recipeId) =>
                                  handleRecipeSelection(dateKey, slot, recipeId)
                                }
                                onViewRecipe={(selectedRecipe) => setViewRecipe(selectedRecipe)}
                              />

                              {recipe ? (
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setViewRecipe(recipe)}
                                    className="line-clamp-1 text-left text-sm font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                                  >
                                    {recipe.name}
                                  </button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    disabled={isSlotPending}
                                    onClick={() => handleClearSelection(dateKey, slot)}
                                    aria-label={`Remove ${recipe.name} from ${SLOT_LABELS[slot]}`}
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="xl:w-80 xl:shrink-0">
          <section className="overflow-hidden rounded-xl border border-border/60 bg-card/25">
            <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted/20 px-4 py-3">
              <ShoppingCart className="size-4 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Shopping List</h3>
              <div className="ml-auto flex items-center gap-2">
                {creatableCartBucketCount > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-[11px]"
                    disabled={buildingAllCarts}
                    onClick={() => {
                      void handleBuildAllShoppingCarts()
                    }}
                  >
                    {buildingAllCarts ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create All Carts'
                    )}
                  </Button>
                ) : null}
                <span className="rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
                  {shoppingBuckets.reduce((sum, bucket) => sum + bucket.items.length, 0)} items
                </span>
              </div>
            </div>
            <div className="p-3">
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
                  <div className="divide-y divide-border/60">
                    {shoppingBuckets.map((bucket) => {
                      const disabledReason = getBuildDisabledReason(bucket)
                      const isBuilding = Boolean(
                        bucket.storeId && buildingStoreId === bucket.storeId
                      )
                      const isOpen = openStoreKeys.has(bucket.key)

                      return (
                        <Collapsible
                          key={bucket.key}
                          open={isOpen}
                          onOpenChange={(open) => setStoreSectionOpen(bucket.key, open)}
                          className="py-2"
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 px-1 py-1.5 text-left"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-xs font-semibold text-foreground">
                                  {bucket.storeName}
                                </p>
                                <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {bucket.items.length} item{bucket.items.length === 1 ? '' : 's'}
                                </span>
                              </div>
                              <ChevronDown
                                className={`size-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t border-border/60 px-1 py-2">
                              {!disabledReason ? (
                                <div className="mb-2 flex items-center justify-end">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[11px]"
                                    disabled={isBuilding || buildingAllCarts}
                                    onClick={() => {
                                      void handleBuildShoppingList(bucket)
                                    }}
                                  >
                                    {isBuilding ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      'Create Cart'
                                    )}
                                  </Button>
                                </div>
                              ) : null}
                              <ul className="list-disc space-y-1 pl-4">
                                {bucket.items.map((item, index) => (
                                  <li
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
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          if (!savingSnapshot) setSaveDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Meal Plan</DialogTitle>
            <DialogDescription>
              Give this plan a name and optional description for later reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Plan Name</p>
              <Input
                value={saveLabel}
                onChange={(event) => setSaveLabel(event.target.value)}
                placeholder="Weekly Family Plan"
                maxLength={120}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Description</p>
              <Textarea
                value={saveDescription}
                onChange={(event) => setSaveDescription(event.target.value)}
                placeholder="Optional notes about this plan"
                rows={3}
                maxLength={600}
              />
            </div>
          </div>
          <DialogFooter>
            {creatableCartBucketCount > 0 ? (
              <Button
                variant="secondary"
                onClick={() => void handleConfirmSavePlan({ createCarts: true })}
                disabled={savingSnapshot || buildingAllCarts}
              >
                Save + Create Carts
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
              disabled={savingSnapshot}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleConfirmSavePlan()} disabled={savingSnapshot}>
              {savingSnapshot ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Plan'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cartResultsDialogOpen} onOpenChange={setCartResultsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Shopping Cart Sessions</DialogTitle>
            <DialogDescription>
              Review each store cart and open checkout links in new tabs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {createdCarts.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Ready carts ({createdCarts.length})
                </p>
                <div className="space-y-2">
                  {createdCarts.map((session) => (
                    <div
                      key={session.key}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {session.storeName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.unmatchedItems > 0
                            ? `${session.unmatchedItems} unmatched item${session.unmatchedItems === 1 ? '' : 's'}`
                            : 'All ingredients matched'}
                        </p>
                      </div>
                      <Button asChild type="button" size="sm" variant="outline">
                        <a
                          href={session.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Cart
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {cartBuildFailures.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Couldn&apos;t create ({cartBuildFailures.length})
                </p>
                <div className="space-y-1">
                  {cartBuildFailures.map((failure) => (
                    <p key={failure.key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{failure.storeName}:</span>{' '}
                      {failure.message}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCartResultsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecipeDetailModal
        recipe={viewRecipe}
        open={Boolean(viewRecipe)}
        onOpenChange={(open) => {
          if (!open) setViewRecipe(null)
        }}
        onEditRecipe={(recipe) => {
          onEditRecipe?.(recipe)
          setViewRecipe(null)
        }}
      />
    </div>
  )
}
