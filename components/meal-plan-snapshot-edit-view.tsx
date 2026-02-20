'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  updateMealPlanSnapshot,
  useMealPlanSlots,
  useMealPlanSnapshots,
  useRecipes,
  useStoreStatus,
} from '@/lib/meal-planner-store'
import { getSnapshotDateRange, remapSnapshotToDateRange, type SnapshotSlotUpdate } from '@/lib/meal-plan-snapshot-utils'
import { buildDateRange, formatDateLabel, toDateKey } from '@/lib/types'

export function MealPlanSnapshotEditView({ snapshotId }: { snapshotId: string }) {
  const router = useRouter()
  const { loading, error } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()
  const mealPlanSlots = useMealPlanSlots()
  const recipes = useRecipes()

  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [setAsCurrent, setSetAsCurrent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingIntoPlanner, setLoadingIntoPlanner] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const snapshot = useMemo(
    () => snapshots.find((candidate) => candidate.id === snapshotId) || null,
    [snapshotId, snapshots]
  )

  const range = useMemo(
    () => (snapshot ? getSnapshotDateRange(snapshot) : null),
    [snapshot]
  )

  const recipeIdSet = useMemo(() => new Set(recipes.map((recipe) => recipe.id)), [recipes])

  useEffect(() => {
    if (!snapshot) return
    setLabel(snapshot.label)
    setDescription(snapshot.description)
    setSetAsCurrent(!snapshot.isActive)
  }, [snapshot])

  const handleSave = useCallback(async () => {
    if (!snapshot) return
    if (!label.trim()) {
      toast.error('Meal plan name is required.')
      return
    }

    setSaving(true)
    try {
      const updated = await updateMealPlanSnapshot(snapshot.id, {
        label: label.trim(),
        description: description.trim(),
        markActive: setAsCurrent || undefined,
      })
      toast.success('Meal plan updated', { description: updated.label })
      router.push(`/plans/${encodeURIComponent(updated.id)}`)
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : 'Unable to update meal plan.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }, [description, label, router, setAsCurrent, snapshot])

  const handleDelete = useCallback(async () => {
    if (!snapshot) return

    setDeleting(true)
    try {
      await deleteMealPlanSnapshot(snapshot.id)
      toast.success('Meal plan deleted', { description: snapshot.label })
      setDeleteOpen(false)
      router.push('/plans')
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : 'Unable to delete meal plan.'
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }, [router, snapshot])

  const handleEditMealsInPlanner = useCallback(async () => {
    if (!snapshot) return

    setLoadingIntoPlanner(true)
    try {
      const startDate = range?.startDateKey || toDateKey(new Date())
      const days = range?.days || 7
      const targetRange = buildDateRange(startDate, days)
      const targetDateSet = new Set(targetRange)

      const preservedSlots: SnapshotSlotUpdate[] = mealPlanSlots
        .filter((slot) => !targetDateSet.has(slot.dateKey))
        .map((slot) => ({
          dateKey: slot.dateKey,
          slot: slot.slot,
          selection: slot.selection,
          recipeId: slot.recipeId,
        }))

      const mapped = remapSnapshotToDateRange(snapshot, recipeIdSet, startDate, days)
      await replaceMealPlanSlots([...preservedSlots, ...mapped.slots])
      await activateMealPlanSnapshot(snapshot.id)

      if (mapped.skippedMeals > 0) {
        toast.success('Planner loaded', {
          description: `${snapshot.label} loaded with ${mapped.skippedMeals} skipped meal${mapped.skippedMeals === 1 ? '' : 's'}.`,
        })
      } else {
        toast.success('Planner loaded', { description: snapshot.label })
      }

      const params = new URLSearchParams({
        tab: 'planner',
        startDate,
        days: String(days),
      })
      router.push(`/?${params.toString()}`)
    } catch (plannerError) {
      const message =
        plannerError instanceof Error
          ? plannerError.message
          : 'Unable to load this meal plan into planner.'
      toast.error(message)
    } finally {
      setLoadingIntoPlanner(false)
    }
  }, [mealPlanSlots, range, recipeIdSet, router, snapshot])

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
          Loading meal plan...
        </CardContent>
      </Card>
    )
  }

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="text-sm font-medium text-foreground">Plan not found</p>
          <p className="text-xs text-muted-foreground">The requested meal plan may have been deleted.</p>
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href="/plans">Back to Meal Plans</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/60 bg-card/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Edit Meal Plan</h2>
            <p className="text-sm text-muted-foreground">Update this meal plan and manage its status.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/plans/${encodeURIComponent(snapshot.id)}`}>
                <ArrowLeft className="size-3.5" />
                Back to Details
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Plan Details</CardTitle>
              <CardDescription>Edit name, description, and active status.</CardDescription>
            </div>
            <Badge variant={snapshot.isActive ? 'default' : 'outline'}>
              {snapshot.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="meal-plan-label">Meal plan name</Label>
              <Input
                id="meal-plan-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={200}
                placeholder="e.g. Weeknight Favorites"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="meal-plan-description">Description</Label>
              <Textarea
                id="meal-plan-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                placeholder="Optional notes about this meal plan"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Date range:{' '}
              {range
                ? `${formatDateLabel(range.startDateKey, { month: 'short', day: 'numeric' })} - ${formatDateLabel(range.endDateKey, {
                    month: 'short',
                    day: 'numeric',
                  })}`
                : 'Unknown'}
            </span>
            <span>•</span>
            <span>{range?.days ?? 0} day{range?.days === 1 ? '' : 's'}</span>
            <span>•</span>
            <span>{snapshot.meals.length} meals</span>
          </div>

          {!snapshot.isActive ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={setAsCurrent}
                onChange={(event) => setSetAsCurrent(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Set as current active plan when saving
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">This plan is currently active.</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleEditMealsInPlanner()}
                disabled={saving || deleting || loadingIntoPlanner}
              >
                {loadingIntoPlanner ? <Loader2 className="size-4 animate-spin" /> : null}
                Edit Meals In Planner
              </Button>

              <Button
                type="button"
                variant="outline"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={saving || deleting || loadingIntoPlanner}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>

            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || deleting || loadingIntoPlanner}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Updates
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meal Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium text-foreground">{snapshot.label}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
