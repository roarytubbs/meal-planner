'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { Toaster } from '@/components/ui/sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  replaceMealPlanSlots,
  useMealPlanSnapshots,
  useRecipes,
} from '@/lib/meal-planner-store'
import { formatDateLabel, type MealPlanSnapshot } from '@/lib/types'
import {
  getSnapshotDateRange,
  partitionSnapshotsByRecency,
  snapshotToSlotUpdates,
} from '@/lib/meal-plan-snapshot-utils'

function formatSnapshotRange(snapshot: MealPlanSnapshot): string {
  const range = getSnapshotDateRange(snapshot)
  if (!range) return 'Unknown date range'
  const start = formatDateLabel(range.startDateKey, { month: 'short', day: 'numeric' })
  const end = formatDateLabel(range.endDateKey, { month: 'short', day: 'numeric' })
  return `${start} - ${end}`
}

function formatCreatedAt(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

interface SnapshotSectionProps {
  title: string
  snapshots: MealPlanSnapshot[]
  pendingAction: string | null
  onLoad: (snapshot: MealPlanSnapshot) => Promise<void>
  onActivate: (snapshot: MealPlanSnapshot) => Promise<void>
  onDelete: (snapshot: MealPlanSnapshot) => void
}

function SnapshotSection({
  title,
  snapshots,
  pendingAction,
  onLoad,
  onActivate,
  onDelete,
}: SnapshotSectionProps) {
  if (snapshots.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-3">
        {snapshots.map((snapshot) => {
          const loadingLoad = pendingAction === `load-${snapshot.id}`
          const loadingActivate = pendingAction === `activate-${snapshot.id}`
          const loadingDelete = pendingAction === `delete-${snapshot.id}`

          return (
            <Card key={snapshot.id} className="py-4">
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">{snapshot.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {snapshot.description.trim() || 'No description'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarRange className="size-3.5" />
                        {formatSnapshotRange(snapshot)}
                      </span>
                      <span>Saved {formatCreatedAt(snapshot.createdAt)}</span>
                      <span>{snapshot.meals.length} meals</span>
                    </div>
                  </div>
                  {snapshot.isActive ? (
                    <Badge variant="secondary" className="h-6">
                      <CheckCircle2 className="size-3.5" />
                      Active
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void onLoad(snapshot)}
                    disabled={pendingAction !== null}
                  >
                    {loadingLoad ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Load Into Draft
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void onActivate(snapshot)}
                    disabled={pendingAction !== null || snapshot.isActive}
                  >
                    {loadingActivate ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {snapshot.isActive ? 'Active' : 'Set Active'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(snapshot)}
                    disabled={pendingAction !== null}
                  >
                    {loadingDelete ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

export default function SavedPlansPage() {
  const router = useRouter()
  const recipes = useRecipes()
  const snapshots = useMealPlanSnapshots()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MealPlanSnapshot | null>(null)

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

  const handleLoad = useCallback(
    async (snapshot: MealPlanSnapshot) => {
      setPendingAction(`load-${snapshot.id}`)
      try {
        const { slots, skippedMeals } = snapshotToSlotUpdates(snapshot, recipeIdSet)
        if (slots.length === 0) {
          toast.error('No valid meals available to load from this plan.')
          return
        }
        await replaceMealPlanSlots(slots)
        await activateMealPlanSnapshot(snapshot.id)
        toast.success('Meal plan loaded', {
          description:
            skippedMeals > 0
              ? `${snapshot.label} loaded with ${skippedMeals} skipped meal${skippedMeals === 1 ? '' : 's'}.`
              : snapshot.label,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load meal plan.'
        toast.error(message)
      } finally {
        setPendingAction(null)
      }
    },
    [recipeIdSet]
  )

  const handleActivate = useCallback(async (snapshot: MealPlanSnapshot) => {
    if (snapshot.isActive) return
    setPendingAction(`activate-${snapshot.id}`)
    try {
      await activateMealPlanSnapshot(snapshot.id)
      toast.success('Active plan updated', { description: snapshot.label })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to set active plan.'
      toast.error(message)
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to delete meal plan.'
      toast.error(message)
    } finally {
      setPendingAction(null)
    }
  }, [deleteTarget])

  return (
    <main className="min-h-screen bg-background">
      <AppHeader activeTab="planner" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Saved Plans</h1>
            <p className="text-sm text-muted-foreground">
              Browse, load, activate, and manage your saved meal plans.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => router.push('/?tab=planner')}>
            Open Meal Planner
          </Button>
        </div>

        {sortedSnapshots.length === 0 ? (
          <Card className="py-10">
            <CardHeader className="text-center">
              <CardTitle className="text-base">No Saved Plans Yet</CardTitle>
              <CardDescription>
                Save a plan from Meal Planner to manage it here.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-6">
            <SnapshotSection
              title="Current / Upcoming"
              snapshots={currentSnapshots}
              pendingAction={pendingAction}
              onLoad={handleLoad}
              onActivate={handleActivate}
              onDelete={setDeleteTarget}
            />
            <SnapshotSection
              title="Previous"
              snapshots={previousSnapshots}
              pendingAction={pendingAction}
              onLoad={handleLoad}
              onActivate={handleActivate}
              onDelete={setDeleteTarget}
            />
          </div>
        )}
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Saved Plan</AlertDialogTitle>
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
              onClick={(event) => {
                event.preventDefault()
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
