'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ClipboardList, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { handleError } from '@/lib/client-logger'
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
import { buildDateRange, formatDateLabel, parseDateKey, toDateKey, type MealSelection, type MealSlot } from '@/lib/types'

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
      toast.error(handleError(saveError, 'plan.update-details'))
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
      toast.error(handleError(deleteError, 'plan.delete'))
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
      toast.error(handleError(plannerError, 'plan.load'))
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meal Selections</CardTitle>
          <CardDescription>Current meals saved in this plan.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {snapshot.meals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <ClipboardList className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No meals in this plan.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {(() => {
                const SLOT_ORDER: Record<MealSlot, number> = { breakfast: 0, lunch: 1, dinner: 2 }
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

                const grouped = new Map<string, typeof snapshot.meals>()
                for (const meal of snapshot.meals) {
                  if (!grouped.has(meal.day)) grouped.set(meal.day, [])
                  grouped.get(meal.day)?.push(meal)
                }
                const sortedDays = Array.from(grouped.entries()).sort(([a], [b]) =>
                  a.localeCompare(b)
                )

                return sortedDays.map(([day, meals]) => {
                  const sortedMeals = meals
                    .slice()
                    .sort(
                      (a, b) =>
                        SLOT_ORDER[a.slot as MealSlot] - SLOT_ORDER[b.slot as MealSlot]
                    )
                  const label = parseDateKey(day)
                    ? formatDateLabel(day, { weekday: 'short', month: 'short', day: 'numeric' })
                    : day
                  return (
                    <section key={day} className="px-6 py-4">
                      <h4 className="text-sm font-semibold text-foreground">{label}</h4>
                      <ul className="mt-2 divide-y divide-border/50 rounded-md border border-border/60">
                        {sortedMeals.map((meal) => {
                          const isRecipe = meal.selection === 'recipe'
                          return (
                            <li
                              key={`${day}-${meal.slot}`}
                              className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {SLOT_LABELS[meal.slot as MealSlot]}
                              </span>
                              {isRecipe ? (
                                <div className="min-w-0 sm:text-right">
                                  <p className="truncate font-medium text-foreground">
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
                                  {STATUS_LABELS[meal.selection as Exclude<MealSelection, 'recipe'>]}
                                </Badge>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })
              })()}
            </div>
          )}
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
