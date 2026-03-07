'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Clock3, ExternalLink, MoreHorizontal, Star, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setMealSlot } from '@/lib/meal-planner-store'
import type { Recipe, MealSlot } from '@/lib/types'
import { formatDateLabel, toDateKey } from '@/lib/types'
import { toast } from 'sonner'
import { handleError } from '@/lib/client-logger'
import {
  getExcludedNKs,
  setExclusionNK,
  toItemNK,
  SHOP_STATE_CHANGED,
} from '@/lib/shopping-list-local'

interface RecipeDetailModalProps {
  recipe: Recipe | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditRecipe?: (recipe: Recipe) => void
  onCopyRecipe?: (recipe: Recipe) => void
  activePlanId?: string | null
}

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-100 text-amber-800',
  lunch: 'bg-emerald-100 text-emerald-800',
  dinner: 'bg-sky-100 text-sky-800',
  snack: 'bg-rose-100 text-rose-800',
}

export function RecipeDetailModal({
  recipe,
  open,
  onOpenChange,
  onEditRecipe,
  onCopyRecipe,
  activePlanId,
}: RecipeDetailModalProps) {
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [showAllIngredients, setShowAllIngredients] = useState(false)
  const [showAllSteps, setShowAllSteps] = useState(false)
  const [excludedNKs, setExcludedNKsState] = useState<Set<string>>(() => new Set())

  const [mealPlanDialogOpen, setMealPlanDialogOpen] = useState(false)
  const [mealPlanDateKey, setMealPlanDateKey] = useState(() => toDateKey(new Date()))
  const [mealPlanSlot, setMealPlanSlotState] = useState<MealSlot>('dinner')
  const [mealPlanApplying, setMealPlanApplying] = useState(false)

  useEffect(() => {
    setShowFullDescription(false)
    setShowAllIngredients(false)
    setShowAllSteps(false)
    if (activePlanId) setExcludedNKsState(getExcludedNKs(activePlanId))
  }, [recipe?.id, open, activePlanId])

  useEffect(() => {
    if (!activePlanId) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ planId: string }>).detail
      if (detail?.planId === activePlanId) setExcludedNKsState(getExcludedNKs(activePlanId))
    }
    window.addEventListener(SHOP_STATE_CHANGED, handler)
    return () => window.removeEventListener(SHOP_STATE_CHANGED, handler)
  }, [activePlanId])

  const toggleIngredientExclusion = useCallback((name: string, unit: string, excluded: boolean) => {
    if (!activePlanId) return
    const nk = toItemNK(name, unit)
    setExclusionNK(activePlanId, nk, excluded)
    setExcludedNKsState(getExcludedNKs(activePlanId))
  }, [activePlanId])

  const handleOpenMealPlanDialog = useCallback(() => {
    if (!recipe) return
    const suggestedSlot: MealSlot =
      recipe.mealType === 'breakfast'
        ? 'breakfast'
        : recipe.mealType === 'lunch'
          ? 'lunch'
          : 'dinner'
    setMealPlanSlotState(suggestedSlot)
    setMealPlanDateKey(toDateKey(new Date()))
    setMealPlanDialogOpen(true)
  }, [recipe])

  const handleAddToMealPlan = useCallback(async () => {
    if (!recipe?.id) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mealPlanDateKey)) {
      toast.error('Please choose a valid date.')
      return
    }
    setMealPlanApplying(true)
    try {
      await setMealSlot(mealPlanDateKey, mealPlanSlot, 'recipe', recipe.id)
      toast.success('Added to meal plan', {
        description: `${formatDateLabel(mealPlanDateKey)} • ${mealPlanSlot[0].toUpperCase()}${mealPlanSlot.slice(1)}`,
      })
      setMealPlanDialogOpen(false)
    } catch (error) {
      toast.error(handleError(error, 'recipe.add-to-plan'))
    } finally {
      setMealPlanApplying(false)
    }
  }, [mealPlanDateKey, mealPlanSlot, recipe?.id])

  const filteredSteps = useMemo(
    () => (recipe ? recipe.steps.map((step) => step.trim()).filter(Boolean) : []),
    [recipe]
  )

  if (!recipe) return null

  const description = recipe.description.trim()
  const hasLongDescription = description.length > 180
  const visibleIngredients = showAllIngredients
    ? recipe.ingredients
    : recipe.ingredients.slice(0, 10)
  const visibleSteps = showAllSteps ? filteredSteps : filteredSteps.slice(0, 5)
  const hasOverflowMenu = Boolean(onEditRecipe || onCopyRecipe)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-0">
            <DialogDescription className="sr-only">
              Full recipe details for {recipe.name}
            </DialogDescription>
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-xl text-balance leading-tight flex-1">
                {recipe.name}
              </DialogTitle>
              <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                {recipe.sourceUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                    asChild
                  >
                    <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-3.5" />
                      View original
                    </a>
                  </Button>
                )}
                {hasOverflowMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">More options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onEditRecipe && (
                        <DropdownMenuItem onSelect={() => onEditRecipe(recipe)}>
                          Edit
                        </DropdownMenuItem>
                      )}
                      {onCopyRecipe && (
                        <DropdownMenuItem onSelect={() => onCopyRecipe(recipe)}>
                          Copy
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleOpenMealPlanDialog}
                >
                  Add to plan
                </Button>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1 -mx-6 px-6">
            <div className="flex flex-col gap-5 pb-4 pt-3">
              {recipe.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={recipe.imageUrl}
                  alt={recipe.name}
                  className="h-52 w-full rounded-lg border border-border object-cover"
                />
              ) : null}

              <div className="flex items-center gap-2 flex-wrap">
                {recipe.mealType && (
                  <Badge
                    variant="secondary"
                    className={`text-xs ${MEAL_TYPE_COLORS[recipe.mealType] || ''}`}
                  >
                    {recipe.mealType}
                  </Badge>
                )}
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="size-3.5" />
                  {recipe.servings} servings
                </span>
                {typeof recipe.totalMinutes === 'number' && recipe.totalMinutes > 0 ? (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    {Math.round(recipe.totalMinutes)} min
                  </span>
                ) : null}
                {typeof recipe.rating === 'number' && Number.isFinite(recipe.rating) ? (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Star className="size-3.5 fill-amber-500 text-amber-500" />
                    {Math.max(0, Math.min(5, Math.round(recipe.rating * 10) / 10)).toFixed(1)}
                  </span>
                ) : null}
              </div>

              {description && (
                <div className="space-y-1">
                  <p
                    className={`text-sm text-muted-foreground leading-relaxed ${showFullDescription ? '' : 'line-clamp-2'}`}
                  >
                    {description}
                  </p>
                  {hasLongDescription ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => setShowFullDescription((prev) => !prev)}
                    >
                      {showFullDescription ? 'Show less' : 'Read more'}
                    </button>
                  ) : null}
                </div>
              )}

              <Separator />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Ingredients</h3>
                  {activePlanId ? (
                    <span className="text-[10px] text-muted-foreground">Uncheck to exclude from shopping list</span>
                  ) : null}
                </div>
                {recipe.ingredients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ingredients listed.</p>
                ) : (
                  <>
                    <ul className="flex flex-col gap-1">
                      {visibleIngredients.map((ing) => {
                        const nk = toItemNK(ing.name, ing.unit)
                        const isExcluded = excludedNKs.has(nk)
                        return (
                          <li key={ing.id} className="flex items-center gap-2 text-sm">
                            {activePlanId ? (
                              <Checkbox
                                checked={!isExcluded}
                                onCheckedChange={(checked) =>
                                  toggleIngredientExclusion(ing.name, ing.unit, checked !== true)
                                }
                                className="shrink-0"
                              />
                            ) : (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40 mt-0.5" />
                            )}
                            <span className={isExcluded ? 'line-through text-muted-foreground' : 'text-foreground'}>
                              {ing.qty !== null && (
                                <span className="font-medium">{ing.qty}</span>
                              )}{' '}
                              {ing.unit && <span className={isExcluded ? '' : 'text-muted-foreground'}>{ing.unit}</span>}{' '}
                              {ing.name}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                    {recipe.ingredients.length > 10 ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => setShowAllIngredients((prev) => !prev)}
                      >
                        {showAllIngredients
                          ? 'Show fewer ingredients'
                          : `Show all ingredients (${recipe.ingredients.length})`}
                      </button>
                    ) : null}
                  </>
                )}
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-foreground">Steps</h3>
                {filteredSteps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No steps listed.</p>
                ) : (
                  <>
                    <ol className="flex flex-col gap-3">
                      {visibleSteps.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {i + 1}
                          </span>
                          <span className="text-foreground leading-relaxed pt-0.5">
                            {step}
                          </span>
                        </li>
                      ))}
                    </ol>
                    {filteredSteps.length > 5 ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => setShowAllSteps((prev) => !prev)}
                      >
                        {showAllSteps
                          ? 'Show fewer steps'
                          : `Show all steps (${filteredSteps.length})`}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mealPlanDialogOpen} onOpenChange={setMealPlanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to meal plan</DialogTitle>
            <DialogDescription>
              Choose a day and meal slot for {recipe.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modal-meal-plan-date">Day</Label>
              <Input
                id="modal-meal-plan-date"
                type="date"
                value={mealPlanDateKey}
                onChange={(e) => setMealPlanDateKey(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modal-meal-plan-slot">Meal</Label>
              <Select
                value={mealPlanSlot}
                onValueChange={(value) => setMealPlanSlotState(value as MealSlot)}
              >
                <SelectTrigger id="modal-meal-plan-slot">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMealPlanDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleAddToMealPlan()}
                disabled={mealPlanApplying}
              >
                {mealPlanApplying ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
