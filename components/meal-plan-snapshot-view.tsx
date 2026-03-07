'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pencil,
  ShoppingCart,
  Store,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { handleError, logError } from '@/lib/client-logger'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  activateMealPlanSnapshot,
  duplicateMealPlanSnapshot,
  useGroceryStores,
  useMealPlanSnapshots,
  useRecipes,
  useStoreStatus,
} from '@/lib/meal-planner-store'
import {
  buildShoppingList,
  type PlannedSlotState,
  type ShoppingStoreBucket,
} from '@/lib/shopping-list'
import {
  formatDateLabel,
  parseDateKey,
  type GroceryStore,
  type MealPlanSnapshotMeal,
  type MealSelection,
  type MealSlot,
} from '@/lib/types'

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

const SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
}

const STATUS_LABELS: Record<Exclude<MealSelection, 'recipe'>, string> = {
  skip: 'Skip',
  eating_out: 'Eating Out',
  leftovers: 'Leftovers',
}

function formatCreatedAt(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function formatSnapshotRange(meals: MealPlanSnapshotMeal[]): string {
  const days = Array.from(
    new Set(meals.map((meal) => meal.day).filter((day) => Boolean(parseDateKey(day))))
  ).sort((a, b) => a.localeCompare(b))

  if (days.length === 0) return 'No date range'
  if (days.length === 1) {
    return formatDateLabel(days[0], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  return `${formatDateLabel(days[0], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} - ${formatDateLabel(days[days.length - 1], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}`
}

export function MealPlanSnapshotView({ snapshotId }: { snapshotId: string }) {
  const router = useRouter()
  const { loading, error, shoppingCartProviderConfigured } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()
  const recipes = useRecipes()
  const stores = useGroceryStores()
  const [pendingAction, setPendingAction] = useState<'copy' | 'current' | null>(null)
  const [openStoreKeys, setOpenStoreKeys] = useState<Set<string>>(() => new Set())
  const [buildingStoreId, setBuildingStoreId] = useState<string | null>(null)

  const snapshot = useMemo(
    () => snapshots.find((candidate) => candidate.id === snapshotId),
    [snapshotId, snapshots]
  )

  const days = useMemo(() => {
    if (!snapshot) return []

    const grouped = new Map<string, MealPlanSnapshotMeal[]>()
    for (const meal of snapshot.meals) {
      if (!grouped.has(meal.day)) grouped.set(meal.day, [])
      grouped.get(meal.day)?.push(meal)
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, meals]) => ({
        day,
        meals: meals
          .slice()
          .sort(
            (a, b) =>
              SLOT_ORDER[a.slot as MealSlot] - SLOT_ORDER[b.slot as MealSlot] ||
              a.slot.localeCompare(b.slot)
          ),
      }))
  }, [snapshot])
  const storesById = useMemo(() => {
    const map = new Map<string, GroceryStore>()
    for (const store of stores) map.set(store.id, store)
    return map
  }, [stores])

  const snapshotDateKeys = useMemo(() => {
    if (!snapshot) return []
    return Array.from(
      new Set(
        snapshot.meals
          .map((meal) => meal.day)
          .filter((day) => Boolean(parseDateKey(day)))
          .sort((a, b) => a.localeCompare(b))
      )
    )
  }, [snapshot])

  const snapshotSlotMap = useMemo(() => {
    const map = new Map<string, PlannedSlotState>()
    if (!snapshot) return map
    for (const meal of snapshot.meals) {
      if (!parseDateKey(meal.day)) continue
      map.set(`${meal.day}:${meal.slot}`, {
        selection: meal.selection,
        recipeId: meal.selection === 'recipe' ? meal.recipeId : null,
      })
    }
    return map
  }, [snapshot])

  const shoppingBuckets = useMemo(
    () => buildShoppingList(snapshotDateKeys, snapshotSlotMap, recipes, stores),
    [snapshotDateKeys, snapshotSlotMap, recipes, stores]
  )

  const getBuildDisabledReason = useCallback(
    (bucket: ShoppingStoreBucket): string | null => {
      if (!shoppingCartProviderConfigured) {
        return 'Online cart checkout is not configured. Set INSTACART_CONNECT_API_KEY or TARGET_CART_SESSION_ENDPOINT on the server.'
      }
      if (!bucket.storeId) {
        return 'Items must be assigned to a saved store to build an online cart.'
      }
      const store = storesById.get(bucket.storeId)
      if (!store) return 'Store no longer exists.'
      if (!store.supportsOnlineOrdering) {
        return 'Online ordering is disabled for this store in Store Management.'
      }
      if (store.onlineOrderingProvider === 'target' && !store.onlineOrderingConfig?.targetStoreId) {
        return 'Store is missing Target online ordering configuration.'
      }
      if (store.onlineOrderingProvider === 'instacart' && !store.onlineOrderingConfig?.instacartRetailerId) {
        return 'Store is missing Instacart retailer ID configuration.'
      }
      return null
    },
    [shoppingCartProviderConfigured, storesById]
  )

  const handleCopyStoreList = useCallback(async (bucket: ShoppingStoreBucket) => {
    const lines = bucket.items.map((item) => {
      const qty =
        item.qty !== null
          ? `${Number.isInteger(item.qty) ? item.qty : item.qty.toFixed(2).replace(/\.?0+$/, '')} `
          : ''
      const unit = item.unit ? `${item.unit} ` : ''
      return `• ${qty}${unit}${item.name}`
    })
    const text = `📍 ${bucket.storeName}\n${lines.join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Unable to copy to clipboard')
    }
  }, [])

  const handleCreateCart = useCallback(
    async (bucket: ShoppingStoreBucket) => {
      if (!bucket.storeId) return
      const disabledReason = getBuildDisabledReason(bucket)
      if (disabledReason) {
        toast.error(disabledReason)
        return
      }

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
        let payload: Record<string, unknown> = {}
        if (raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>
          } catch {
            payload = {}
          }
        }

        if (!response.ok) {
          const rawError = typeof payload.error === 'string' ? payload.error : 'Cart request failed'
          toast.error(handleError(new Error(rawError), 'cart.create'))
          return
        }

        const checkoutUrl =
          typeof payload.checkoutUrl === 'string' ? payload.checkoutUrl.trim() : ''
        if (!checkoutUrl) {
          toast.error('Cart session created without a checkout URL.')
          return
        }

        const popup = window.open(checkoutUrl, '_blank', 'noopener,noreferrer')
        if (!popup) window.location.href = checkoutUrl

        const unmatchedCount = Array.isArray(payload.unmatchedItems)
          ? payload.unmatchedItems.length
          : 0
        toast.success(`Cart ready for ${bucket.storeName}`, {
          description:
            unmatchedCount > 0
              ? `${unmatchedCount} item${unmatchedCount === 1 ? '' : 's'} need manual review.`
              : 'Your shopping cart was created successfully.',
        })
      } catch (cartError) {
        toast.error(handleError(cartError, 'cart.create'))
      } finally {
        setBuildingStoreId(null)
      }
    },
    [getBuildDisabledReason]
  )

  const editInPlannerHref = useMemo(
    () => `/plans/${encodeURIComponent(snapshotId)}/edit`,
    [snapshotId]
  )
  const handleSetCurrent = useCallback(async () => {
    if (!snapshot || snapshot.isActive) return
    setPendingAction('current')
    try {
      await activateMealPlanSnapshot(snapshot.id)
      toast.success('Current plan updated', { description: snapshot.label })
    } catch (actionError) {
      toast.error(handleError(actionError, 'plan.activate'))
    } finally {
      setPendingAction(null)
    }
  }, [snapshot])

  const handleCopy = useCallback(async () => {
    if (!snapshot) return
    setPendingAction('copy')
    try {
      const copied = await duplicateMealPlanSnapshot(snapshot.id, {
        label: `${snapshot.label} (Copy)`,
        description: snapshot.description,
        markActive: false,
      })
      toast.success('Plan copied', { description: copied.label })
      router.push(`/plans/${encodeURIComponent(copied.id)}`)
    } catch (actionError) {
      toast.error(handleError(actionError, 'plan.duplicate'))
    } finally {
      setPendingAction(null)
    }
  }, [router, snapshot])

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    )
  }

  if (loading && !snapshot) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Loading saved plan...
        </CardContent>
      </Card>
    )
  }

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/plans">Meal Plans</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Plan</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="text-sm font-medium text-foreground">Plan not found</p>
            <p className="text-xs text-muted-foreground">
              The requested plan may have been deleted.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalItems = shoppingBuckets.reduce((sum, b) => sum + b.items.length, 0)

  return (
    <div className="space-y-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/plans">Plans</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{snapshot.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold text-foreground">{snapshot.label}</h1>
            {snapshot.isActive ? (
              <Badge variant="default" className="text-xs">Current</Badge>
            ) : null}
          </div>
          {snapshot.description.trim() ? (
            <p className="text-sm text-muted-foreground">{snapshot.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {formatSnapshotRange(snapshot.meals)}
            </span>
            <span>{snapshot.meals.length} meal{snapshot.meals.length === 1 ? '' : 's'}</span>
            <span>Saved {formatCreatedAt(snapshot.createdAt)}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={pendingAction !== null}
              aria-label="Plan actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link href={editInPlannerHref}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pendingAction !== null}
              onSelect={(event) => {
                event.preventDefault()
                void handleCopy()
              }}
            >
              <Copy className="size-4" />
              Copy
            </DropdownMenuItem>
            {!snapshot.isActive ? (
              <DropdownMenuItem
                disabled={pendingAction !== null}
                onSelect={(event) => {
                  event.preventDefault()
                  void handleSetCurrent()
                }}
              >
                <CheckCircle2 className="size-4" />
                Set Current
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        {/* Left: meal plan grid */}
        <div className="min-w-0 flex-1">
          <div className="overflow-visible rounded-3xl border border-border bg-card">
            {days.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <ClipboardList className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No meals in this plan</p>
              </div>
            ) : (
              days.map(({ day, meals }) => {
                const mealBySlot = new Map(meals.map((m) => [m.slot, m]))
                return (
                  <section
                    key={day}
                    className="px-6 py-5 first:pt-6 last:pb-6 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border"
                  >
                    <div className="pb-2">
                      <h3 className="text-lg font-semibold text-foreground">
                        {formatDateLabel(day, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </h3>
                    </div>
                    <div className="divide-y divide-border">
                      {(['breakfast', 'lunch', 'dinner'] as MealSlot[]).map((slot) => {
                        const meal = mealBySlot.get(slot)
                        if (!meal) return null
                        const isRecipe = meal.selection === 'recipe'
                        return (
                          <div key={slot} className="space-y-2.5 py-4 first:pt-1 last:pb-1">
                            <p className="text-sm font-semibold text-foreground">
                              {SLOT_LABELS[slot]}
                            </p>
                            {isRecipe ? (
                              <div className="rounded-xl border border-border bg-secondary/55 px-3.5 py-3">
                                <p className="text-sm font-medium text-foreground">
                                  {meal.recipeName || (
                                    <span className="text-muted-foreground">Recipe removed</span>
                                  )}
                                </p>
                                {meal.storeNames.length > 0 ? (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {meal.storeNames.join(', ')}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-border bg-secondary px-3.5 py-3">
                                <p className="text-sm font-medium text-foreground">
                                  This meal is marked as{' '}
                                  <span className="text-primary">
                                    {STATUS_LABELS[
                                      meal.selection as Exclude<MealSelection, 'recipe'>
                                    ]?.toLowerCase()}
                                  </span>
                                  .
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })
            )}
          </div>
        </div>

        {/* Right: shopping list sidebar */}
        <div className="xl:w-[23rem] xl:shrink-0 xl:sticky xl:top-6 xl:self-start">
          <section className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border bg-secondary/65 px-5 py-4">
              <ShoppingCart className="size-4 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Shopping List</h3>
              <div className="ml-auto flex items-center gap-2">
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {totalItems} item{totalItems === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <div className="p-4">
              {!shoppingCartProviderConfigured && shoppingBuckets.length > 0 ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  Online cart checkout is unavailable. Set{' '}
                  <code className="rounded bg-muted px-1">INSTACART_CONNECT_API_KEY</code> or{' '}
                  <code className="rounded bg-muted px-1">TARGET_CART_SESSION_ENDPOINT</code> in
                  server env.
                </p>
              ) : null}

              {shoppingBuckets.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-7 text-center">
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <Store className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No recipe meals in this plan to build a list from.
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
                          onOpenChange={(open) => {
                            setOpenStoreKeys((prev) => {
                              const next = new Set(prev)
                              if (open) next.add(bucket.key)
                              else next.delete(bucket.key)
                              return next
                            })
                          }}
                          className="py-3"
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-xs font-semibold text-foreground">
                                  {bucket.storeName}
                                </p>
                                <span className="rounded-full border border-border/65 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {bucket.items.length} item
                                  {bucket.items.length === 1 ? '' : 's'}
                                </span>
                              </div>
                              <ChevronDown
                                className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t border-border px-2 py-3">
                              <div className="mb-2 flex items-center justify-end gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1.5 px-2 text-[11px]"
                                  onClick={() => void handleCopyStoreList(bucket)}
                                >
                                  <Copy className="size-3.5" />
                                  Copy
                                </Button>
                                {!disabledReason ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 gap-1.5 px-2 text-[11px]"
                                    disabled={isBuilding}
                                    onClick={() => void handleCreateCart(bucket)}
                                  >
                                    {isBuilding ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <ExternalLink className="size-3.5" />
                                    )}
                                    {isBuilding ? 'Creating...' : 'Create Cart'}
                                  </Button>
                                ) : null}
                              </div>
                              <ul className="list-disc space-y-1 pl-4">
                                {bucket.items.map((item, index) => (
                                  <li
                                    key={`${bucket.key}-${index}`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    {item.qty !== null
                                      ? `${Number.isInteger(item.qty) ? item.qty : item.qty.toFixed(2).replace(/\.?0+$/, '')} `
                                      : ''}
                                    {item.unit ? `${item.unit} ` : ''}
                                    {item.name}
                                  </li>
                                ))}
                              </ul>
                              {disabledReason ? (
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                  {disabledReason}
                                </p>
                              ) : null}
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
    </div>
  )
}
