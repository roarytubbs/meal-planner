'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, Copy, MoreHorizontal, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
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
  useMealPlanSnapshots,
  useStoreStatus,
} from '@/lib/meal-planner-store'
import {
  formatDateLabel,
  parseDateKey,
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
  const { loading, error } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()
  const [pendingAction, setPendingAction] = useState<'copy' | 'current' | null>(null)

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
      const message =
        actionError instanceof Error ? actionError.message : 'Unable to set current plan.'
      toast.error(message)
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
      const message =
        actionError instanceof Error ? actionError.message : 'Unable to copy plan.'
      toast.error(message)
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
            <BreadcrumbPage>{snapshot.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section className="rounded-xl border border-border/60 bg-card/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{snapshot.label}</h2>
            <p className="text-sm text-muted-foreground">
              {snapshot.description.trim() || 'No description provided.'}
            </p>
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

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatSnapshotRange(snapshot.meals)}
          </span>
          <span>Saved {formatCreatedAt(snapshot.createdAt)}</span>
          <Badge variant="secondary" className="text-xs">
            {snapshot.meals.length} meal{snapshot.meals.length === 1 ? '' : 's'}
          </Badge>
          {snapshot.isActive ? (
            <Badge variant="default" className="text-xs">
              Current
            </Badge>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card/25">
        <div className="border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Meal Selections</h3>
          <p className="text-xs text-muted-foreground">
            Read-only view of meals included in this saved plan.
          </p>
        </div>

        {days.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No meals in this plan</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {days.map(({ day, meals }) => (
              <section key={day} className="px-4 py-4">
                <h4 className="text-sm font-semibold text-foreground">
                  {formatDateLabel(day, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h4>

                <ul className="mt-2 divide-y divide-border/50 rounded-md border border-border/60">
                  {meals.map((meal) => {
                    const isRecipe = meal.selection === 'recipe'
                    const statusLabel = isRecipe
                      ? null
                      : STATUS_LABELS[meal.selection as Exclude<MealSelection, 'recipe'>]
                    return (
                      <li
                        key={`${day}-${meal.slot}`}
                        className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {SLOT_LABELS[meal.slot as MealSlot]}
                          </span>
                        </div>

                        {isRecipe ? (
                          <div className="min-w-0 text-sm text-foreground sm:text-right">
                            <p className="truncate font-medium">
                              {meal.recipeName || 'Recipe removed'}
                            </p>
                            {meal.storeNames.length > 0 ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {meal.storeNames.join(', ')}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="w-fit text-xs">
                            {statusLabel}
                          </Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
