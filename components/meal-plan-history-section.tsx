'use client'

import { useCallback, useMemo, useState } from 'react'
import { Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteMealPlanSnapshot,
  replaceMealPlanSlots,
  saveMealPlanSnapshot,
  useMealPlanSlots,
  useMealPlanSnapshots,
  useRecipes,
} from '@/lib/meal-planner-store'
import {
  DAY_OF_WEEK_VALUES,
  MEAL_SLOT_VALUES,
  addDays,
  formatDateLabel,
  parseDateKey,
  toDateKey,
  type DayOfWeek,
  type MealSelection,
  type MealPlanSnapshot,
  type MealSlot,
} from '@/lib/types'

interface DraftMealRow {
  key: string
  meal: string
  detail: string
}

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

function formatSnapshotDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'an unknown date'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function snapshotDescription(snapshot: MealPlanSnapshot): string {
  if (snapshot.description.trim()) return snapshot.description
  const count = snapshot.meals.length
  const preview = snapshot.meals
    .filter((meal) => meal.selection === 'recipe' && meal.recipeName)
    .slice(0, 2)
    .map((meal) => meal.recipeName as string)
  const suffix = count > 2 ? `, +${count - 2} more` : ''
  const previewText = preview.length > 0 ? `${preview.join(', ')}${suffix}` : 'No recipes'
  return `${count} meals saved on ${formatSnapshotDate(snapshot.createdAt)}. ${previewText}.`
}

function getCurrentWeekDateKeyByDay(): Record<DayOfWeek, string> {
  const now = new Date()
  const weekday = (now.getDay() + 6) % 7
  const monday = addDays(now, -weekday)
  return DAY_OF_WEEK_VALUES.reduce<Record<DayOfWeek, string>>((map, day, index) => {
    map[day] = toDateKey(addDays(monday, index))
    return map
  }, {} as Record<DayOfWeek, string>)
}

export function MealPlanHistorySection() {
  const recipes = useRecipes()
  const mealPlanSlots = useMealPlanSlots()
  const snapshots = useMealPlanSnapshots()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MealPlanSnapshot | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [planName, setPlanName] = useState('')
  const [planDescription, setPlanDescription] = useState('')

  const weekDateByDay = useMemo(() => getCurrentWeekDateKeyByDay(), [])

  const recipesById = useMemo(() => {
    const next = new Map<string, string>()
    for (const recipe of recipes) {
      next.set(recipe.id, recipe.name)
    }
    return next
  }, [recipes])

  const draftMeals = useMemo<DraftMealRow[]>(() => {
    return mealPlanSlots
      .slice()
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.slot.localeCompare(b.slot))
      .map((slot) => {
        const meal = `${formatDateLabel(slot.dateKey, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })} - ${SLOT_LABELS[slot.slot]}`

        if (slot.selection === 'recipe' && slot.recipeId) {
          return {
            key: `${slot.dateKey}-${slot.slot}`,
            meal,
            detail: recipesById.get(slot.recipeId) || 'Recipe no longer exists',
          }
        }

        return {
          key: `${slot.dateKey}-${slot.slot}`,
          meal,
          detail: STATUS_LABELS[slot.selection as Exclude<MealSelection, 'recipe'>],
        }
      })
  }, [mealPlanSlots, recipesById])

  const sortedSnapshots = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [snapshots]
  )

  const openSaveDialog = useCallback(() => {
    const defaultLabel = `Plan ${new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date())}`
    setPlanName(defaultLabel)
    setPlanDescription('')
    setSaveDialogOpen(true)
  }, [])

  const handleSavePlan = useCallback(async () => {
    const label = planName.trim()
    if (!label) {
      toast.error('Plan name is required')
      return
    }

    setPendingAction('save')
    try {
      const snapshot = await saveMealPlanSnapshot({
        label,
        description: planDescription.trim(),
      })
      if (!snapshot) {
        toast.error('No meals to save yet')
        return
      }
      toast.success('Meal plan saved', { description: snapshot.label })
      setSaveDialogOpen(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save meal plan.'
      toast.error(message)
    } finally {
      setPendingAction(null)
    }
  }, [planDescription, planName])

  const handleDuplicate = useCallback(
    async (snapshot: MealPlanSnapshot) => {
      setPendingAction(`duplicate-${snapshot.id}`)
      try {
        const slots: Array<{
          dateKey: string
          slot: MealSlot
          selection: MealSelection | null
          recipeId: string | null
        }> = []
        let skippedMeals = 0

        for (const meal of snapshot.meals) {
          if (!MEAL_SLOT_VALUES.includes(meal.slot as MealSlot)) {
            skippedMeals += 1
            continue
          }

          const dateKey = parseDateKey(meal.day)
            ? meal.day
            : DAY_OF_WEEK_VALUES.includes(meal.day as DayOfWeek)
              ? weekDateByDay[meal.day as DayOfWeek]
              : null

          if (!dateKey) {
            skippedMeals += 1
            continue
          }

          if (meal.selection === 'recipe') {
            if (!meal.recipeId || !recipesById.has(meal.recipeId)) {
              skippedMeals += 1
              continue
            }
            slots.push({
              dateKey,
              slot: meal.slot as MealSlot,
              selection: 'recipe',
              recipeId: meal.recipeId,
            })
            continue
          }

          slots.push({
            dateKey,
            slot: meal.slot as MealSlot,
            selection: meal.selection,
            recipeId: null,
          })
        }

        await replaceMealPlanSlots(slots)

        if (skippedMeals > 0) {
          toast.success('Meal plan duplicated to draft', {
            description: `${snapshot.label} copied. ${skippedMeals} slot${skippedMeals === 1 ? ' was' : 's were'} skipped.`,
          })
          return
        }

        toast.success('Meal plan duplicated to draft', {
          description: snapshot.label,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to duplicate meal plan.'
        toast.error(message)
      } finally {
        setPendingAction(null)
      }
    },
    [recipesById, weekDateByDay]
  )

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
    <>
      <section className="mb-3 grid gap-3 lg:grid-cols-2">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="border-b py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Current Meal Plan Draft</CardTitle>
                <CardDescription className="text-xs">
                  Slots you are actively building.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {draftMeals.length}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={openSaveDialog}
                  disabled={pendingAction !== null || draftMeals.length === 0}
                >
                  {pendingAction === 'save' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="py-2.5">
            {draftMeals.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No meal slots in draft yet.
              </p>
            ) : (
              <ScrollArea className="max-h-44">
                <div className="space-y-1 pr-3">
                  {draftMeals.map((meal) => (
                    <div
                      key={meal.key}
                      className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5"
                    >
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {meal.meal}
                      </p>
                      <p className="text-xs text-foreground">{meal.detail}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="border-b py-2.5">
            <CardTitle className="text-sm">Previous Meal Plans</CardTitle>
            <CardDescription className="text-xs">
              Duplicate an old plan into your draft or delete saved plans.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-2.5">
            {sortedSnapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No previous meal plans yet.
              </p>
            ) : (
              <ScrollArea className="max-h-44">
                <div className="space-y-2 pr-3">
                  {sortedSnapshots.map((snapshot) => {
                    const duplicateLoading =
                      pendingAction === `duplicate-${snapshot.id}`
                    const deleteLoading = pendingAction === `delete-${snapshot.id}`
                    return (
                      <div
                        key={snapshot.id}
                        className="rounded-md border border-border/60 bg-card p-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-foreground">
                              {snapshot.label}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                              {snapshotDescription(snapshot)}
                            </p>
                          </div>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {snapshot.meals.length}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs"
                            onClick={() => void handleDuplicate(snapshot)}
                            disabled={pendingAction !== null}
                          >
                            {duplicateLoading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                            Duplicate
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDeleteTarget(snapshot)}
                            disabled={pendingAction !== null}
                          >
                            {deleteLoading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Draft Meal Plan</DialogTitle>
            <DialogDescription>
              Name this meal plan and optionally add a description.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meal-plan-name">Plan name</Label>
              <Input
                id="meal-plan-name"
                value={planName}
                onChange={(event) => setPlanName(event.target.value)}
                maxLength={200}
                placeholder="Plan for next week"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meal-plan-description">Description</Label>
              <Textarea
                id="meal-plan-description"
                value={planDescription}
                onChange={(event) => setPlanDescription(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Optional notes for this plan."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
              disabled={pendingAction === 'save'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSavePlan()}
              disabled={pendingAction === 'save' || planName.trim().length === 0}
            >
              {pendingAction === 'save' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Plan'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <AlertDialogCancel disabled={pendingAction !== null}>
              Cancel
            </AlertDialogCancel>
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
    </>
  )
}
