'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { handleError } from '@/lib/client-logger'
import { AppHeader } from '@/components/app-header'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  activateMealPlanSnapshot,
  deleteMealPlanSnapshot,
  duplicateMealPlanSnapshot,
  useMealPlanSnapshots,
  useStoreStatus,
} from '@/lib/meal-planner-store'
import { getSnapshotDateRange } from '@/lib/meal-plan-snapshot-utils'
import { formatDateLabel, parseDateKey, toDateKey, MEAL_SLOT_VALUES } from '@/lib/types'
import type { MealPlanSnapshot } from '@/lib/types'

const PAGE_SIZE = 10

function formatCreatedAt(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function PlanDateRange({ snapshot }: { snapshot: MealPlanSnapshot }) {
  const range = getSnapshotDateRange(snapshot)
  if (!range) return null
  return (
    <span className="inline-flex items-center gap-1">
      <CalendarDays className="size-3.5" />
      {formatDateLabel(range.startDateKey, { month: 'short', day: 'numeric' })}
      {' – '}
      {formatDateLabel(range.endDateKey, { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  )
}

function CurrentPlanCard({
  snapshot,
  pendingAction,
  onDelete,
}: {
  snapshot: MealPlanSnapshot
  pendingAction: string | null
  onDelete: (snapshot: MealPlanSnapshot) => void
}) {
  const editHref = `/?tab=planner&snapshotId=${encodeURIComponent(snapshot.id)}&loadSnapshot=1`
  const range = getSnapshotDateRange(snapshot)
  const today = toDateKey(new Date())

  const totalPossibleSlots = range ? range.days * MEAL_SLOT_VALUES.length : 0
  const filledSlots = snapshot.meals.length
  const coveragePct =
    totalPossibleSlots > 0
      ? Math.min(100, Math.round((filledSlots / totalPossibleSlots) * 100))
      : 0

  const isActive =
    range !== null && today >= range.startDateKey && today <= range.endDateKey

  let currentDay = 0
  if (isActive && range) {
    const startMs = parseDateKey(range.startDateKey)?.getTime() ?? 0
    const todayMs = parseDateKey(today)?.getTime() ?? 0
    currentDay = Math.floor((todayMs - startMs) / (24 * 60 * 60 * 1000)) + 1
  }

  const recipeNames = snapshot.meals
    .filter((m) => m.selection === 'recipe' && m.recipeName)
    .map((m) => m.recipeName as string)
  const visibleRecipes = recipeNames.slice(0, 5)
  const extraCount = Math.max(0, recipeNames.length - 5)

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/plans/${encodeURIComponent(snapshot.id)}`}
                className="text-base font-semibold text-foreground hover:underline"
              >
                {snapshot.label}
              </Link>
              <Badge variant="default" className="h-5 text-[10px]">
                Current
              </Badge>
              {isActive ? (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  Day {currentDay} of {range?.days}
                </Badge>
              ) : null}
            </div>
            {snapshot.description.trim() ? (
              <p className="text-sm text-muted-foreground">{snapshot.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <PlanDateRange snapshot={snapshot} />
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                disabled={pendingAction !== null}
                aria-label="Current plan actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href={`/plans/${encodeURIComponent(snapshot.id)}`}>
                  <Eye className="size-4" />
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={editHref}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pendingAction !== null}
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault()
                  onDelete(snapshot)
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Completion progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {filledSlots} of {totalPossibleSlots} meal slots planned
            </span>
            <span className="font-semibold tabular-nums text-foreground">{coveragePct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        </div>

        {/* Recipe pills */}
        {visibleRecipes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleRecipes.map((name, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground/80"
              >
                {name}
              </span>
            ))}
            {extraCount > 0 ? (
              <span className="inline-flex items-center rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
                +{extraCount} more
              </span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function MealPlansPage() {
  const { loading, error } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()

  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MealPlanSnapshot | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const sortedSnapshots = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [snapshots]
  )

  const activePlan = useMemo(
    () => sortedSnapshots.find((s) => s.isActive) ?? null,
    [sortedSnapshots]
  )

  const pastPlans = useMemo(
    () => sortedSnapshots.filter((s) => !s.isActive),
    [sortedSnapshots]
  )

  const filteredPast = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) return pastPlans
    return pastPlans.filter(
      (s) =>
        s.label.toLowerCase().includes(normalized) ||
        s.description.toLowerCase().includes(normalized) ||
        s.meals.some((m) => m.recipeName?.toLowerCase().includes(normalized))
    )
  }, [pastPlans, search])

  const totalPages = Math.max(1, Math.ceil(filteredPast.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedPast = filteredPast.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleActivate = useCallback(async (snapshot: MealPlanSnapshot) => {
    setPendingAction(`activate-${snapshot.id}`)
    try {
      await activateMealPlanSnapshot(snapshot.id)
      toast.success('Current plan updated', { description: snapshot.label })
    } catch (err) {
      toast.error(handleError(err, 'plan.activate'))
    } finally {
      setPendingAction(null)
    }
  }, [])

  const handleDuplicate = useCallback(async (snapshot: MealPlanSnapshot) => {
    setPendingAction(`duplicate-${snapshot.id}`)
    try {
      await duplicateMealPlanSnapshot(snapshot.id)
      toast.success('Plan duplicated', { description: `Copy of "${snapshot.label}" created` })
    } catch (err) {
      toast.error(handleError(err, 'plan.duplicate'))
    } finally {
      setPendingAction(null)
    }
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setPendingAction(`delete-${deleteTarget.id}`)
    try {
      await deleteMealPlanSnapshot(deleteTarget.id)
      toast.success('Meal plan deleted', { description: deleteTarget.label })
      setDeleteTarget(null)
    } catch (err) {
      toast.error(handleError(err, 'plan.delete'))
    } finally {
      setPendingAction(null)
    }
  }, [deleteTarget])

  return (
    <main className="min-h-screen bg-background">
      <AppHeader activeTab="planner" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-7 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Meal Plans</h1>
            <p className="text-sm text-muted-foreground">
              Browse saved plans, set the current one, and open a plan in planner mode.
            </p>
          </div>
          <Button asChild type="button">
            <Link href="/?tab=planner">
              <Plus className="size-4" />
              Add plan
            </Link>
          </Button>
        </div>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {loading && sortedSnapshots.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Loading meal plans...
            </CardContent>
          </Card>
        ) : null}

        {!loading && sortedSnapshots.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No meal plans yet. Create one in the planner to get started.
            </CardContent>
          </Card>
        ) : null}

        {activePlan ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Current Plan
            </h2>
            <CurrentPlanCard
              snapshot={activePlan}
              pendingAction={pendingAction}
              onDelete={setDeleteTarget}
            />
          </section>
        ) : null}

        {!loading && (pastPlans.length > 0 || activePlan) ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                Past Meal Plans
              </h2>
              {filteredPast.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {filteredPast.length} plan{filteredPast.length === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>

            {pastPlans.length > 0 ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Search past plans..."
                  className="h-10 rounded-xl pl-9 pr-9"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setPage(1)
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            ) : null}

            {pastPlans.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No past plans yet.
                </CardContent>
              </Card>
            ) : filteredPast.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No plans match &ldquo;{search}&rdquo;.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="px-0 pb-0">
                  <div className="divide-y divide-border">
                    {pagedPast.map((snapshot) => {
                      const duplicating = pendingAction === `duplicate-${snapshot.id}`
                      const deleting = pendingAction === `delete-${snapshot.id}`
                      const editHref = `/?tab=planner&snapshotId=${encodeURIComponent(snapshot.id)}&loadSnapshot=1`

                      return (
                        <div
                          key={snapshot.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <Link
                              href={`/plans/${encodeURIComponent(snapshot.id)}`}
                              className="block truncate text-sm font-medium text-foreground hover:underline"
                            >
                              {snapshot.label}
                            </Link>
                            <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                              <PlanDateRange snapshot={snapshot} />
                              <span>· Saved {formatCreatedAt(snapshot.createdAt)}</span>
                            </p>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                disabled={pendingAction !== null}
                                aria-label={`Actions for ${snapshot.label}`}
                              >
                                {duplicating || deleting ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="size-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild>
                                <Link href={`/plans/${encodeURIComponent(snapshot.id)}`}>
                                  <Eye className="size-4" />
                                  View
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={editHref}>
                                  <Pencil className="size-4" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={pendingAction !== null}
                                onSelect={(e) => {
                                  e.preventDefault()
                                  void handleDuplicate(snapshot)
                                }}
                              >
                                <Copy className="size-4" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={pendingAction !== null}
                                onSelect={(e) => {
                                  e.preventDefault()
                                  void handleActivate(snapshot)
                                }}
                              >
                                <CheckCircle2 className="size-4" />
                                Set as Current
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={pendingAction !== null}
                                className="text-destructive focus:text-destructive"
                                onSelect={(e) => {
                                  e.preventDefault()
                                  setDeleteTarget(snapshot)
                                }}
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {totalPages > 1 ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meal Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.label || 'this meal plan'}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={pendingAction !== null}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pendingAction?.startsWith('delete-') ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster />
    </main>
  )
}
