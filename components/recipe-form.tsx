'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { IngredientTable } from '@/components/ingredient-table'
import { setMealSlot } from '@/lib/meal-planner-store'
import type {
  Recipe,
  Ingredient,
  RecipeMode,
  MealSlot,
  RecipeTimeWindow,
} from '@/lib/types'
import {
  formatDateLabel,
  getModeLabel,
  getRecipeTimeWindow,
  getRecipeTimeWindowLabel,
  toDateKey,
} from '@/lib/types'
import { toast } from 'sonner'

interface RecipeFormProps {
  mode: RecipeMode
  initialRecipe?: Recipe
  onSave: (recipe: Recipe) => Promise<void> | void
  onCancel: () => void
}

function generateId() {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const TIME_WINDOW_OPTIONS: RecipeTimeWindow[] = ['under_30', '30_to_60', 'over_60']

export function RecipeForm({ mode, initialRecipe, onSave, onCancel }: RecipeFormProps) {
  const [recipe, setRecipe] = useState<Recipe>(
    initialRecipe || {
      id: generateId(),
      name: '',
      description: '',
      mealType: 'dinner',
      servings: 4,
      ingredients: [],
      steps: [''],
      sourceUrl: '',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  )

  const modeLabel = getModeLabel(mode)
  const canAddToMealPlan = mode === 'edit' && Boolean(initialRecipe?.id)
  const [mealPlanDialogOpen, setMealPlanDialogOpen] = useState(false)
  const [mealPlanDateKey, setMealPlanDateKey] = useState(() => toDateKey(new Date()))
  const [mealPlanSlot, setMealPlanSlot] = useState<MealSlot>(() => {
    if (initialRecipe?.mealType === 'breakfast') return 'breakfast'
    if (initialRecipe?.mealType === 'lunch') return 'lunch'
    return 'dinner'
  })
  const [mealPlanApplying, setMealPlanApplying] = useState(false)

  const updateField = useCallback(<K extends keyof Recipe>(key: K, value: Recipe[K]) => {
    setRecipe((prev) => ({ ...prev, [key]: value, updatedAt: new Date().toISOString() }))
  }, [])

  const handleIngredientsChange = useCallback((ingredients: Ingredient[]) => {
    setRecipe((prev) => ({ ...prev, ingredients, updatedAt: new Date().toISOString() }))
  }, [])

  const addStep = useCallback(() => {
    setRecipe((prev) => ({
      ...prev,
      steps: [...prev.steps, ''],
      updatedAt: new Date().toISOString(),
    }))
  }, [])

  const updateStep = useCallback((index: number, value: string) => {
    setRecipe((prev) => {
      const steps = [...prev.steps]
      steps[index] = value
      return { ...prev, steps, updatedAt: new Date().toISOString() }
    })
  }, [])

  const removeStep = useCallback((index: number) => {
    setRecipe((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
      updatedAt: new Date().toISOString(),
    }))
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!recipe.name.trim()) return
      await onSave(recipe)
    },
    [recipe, onSave]
  )

  const handleOpenMealPlanDialog = useCallback(() => {
    if (!canAddToMealPlan) {
      toast.info('Save this recipe first before adding it to a meal plan.')
      return
    }
    const suggestedSlot: MealSlot =
      recipe.mealType === 'breakfast'
        ? 'breakfast'
        : recipe.mealType === 'lunch'
          ? 'lunch'
          : 'dinner'
    setMealPlanSlot(suggestedSlot)
    setMealPlanDateKey(toDateKey(new Date()))
    setMealPlanDialogOpen(true)
  }, [canAddToMealPlan, recipe.mealType])

  const handleAddToMealPlan = useCallback(async () => {
    if (!recipe.id) {
      toast.error('Recipe must be saved before adding to meal plan.')
      return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(mealPlanDateKey)) {
      toast.error('Please choose a valid date.')
      return
    }

    setMealPlanApplying(true)
    try {
      await setMealSlot(mealPlanDateKey, mealPlanSlot, 'recipe', recipe.id)
      toast.success('Added to current meal plan', {
        description: `${formatDateLabel(mealPlanDateKey)} • ${mealPlanSlot[0].toUpperCase()}${mealPlanSlot.slice(1)}`,
      })
      setMealPlanDialogOpen(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to add recipe to meal plan.'
      toast.error(message)
    } finally {
      setMealPlanApplying(false)
    }
  }, [mealPlanDateKey, mealPlanSlot, recipe.id])

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Recipes
        </button>
        <span>/</span>
        <span className="text-foreground font-medium">{modeLabel}</span>
      </nav>

      {/* Page heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground text-balance">{modeLabel}</h1>
      </div>

      {/* Recipe content */}
      <Card>
        <CardContent className="flex flex-col gap-5">
          <Accordion
            type="multiple"
            defaultValue={['details', 'ingredients', 'steps']}
            className="w-full"
          >
            <AccordionItem value="details">
              <AccordionTrigger className="py-2 text-base font-semibold hover:no-underline">
                Details
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pt-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipe-name">Recipe Name</Label>
                  <Input
                    id="recipe-name"
                    value={recipe.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g., Chicken Stir Fry"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipe-desc">Description</Label>
                  <Textarea
                    id="recipe-desc"
                    value={recipe.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="A quick weeknight dinner..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="meal-type">Meal Type</Label>
                    <Select
                      value={recipe.mealType || undefined}
                      onValueChange={(v) =>
                        updateField('mealType', v as Recipe['mealType'])
                      }
                    >
                      <SelectTrigger id="meal-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="breakfast">Breakfast</SelectItem>
                        <SelectItem value="lunch">Lunch</SelectItem>
                        <SelectItem value="dinner">Dinner</SelectItem>
                        <SelectItem value="snack">Snack</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="servings">Servings</Label>
                    <Input
                      id="servings"
                      type="number"
                      min={1}
                      value={recipe.servings}
                      onChange={(e) =>
                        updateField('servings', parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="recipe-rating">Rating</Label>
                    <Input
                      id="recipe-rating"
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      value={typeof recipe.rating === 'number' ? recipe.rating : ''}
                      onChange={(e) => {
                        const value = e.target.value.trim()
                        if (!value) {
                          updateField('rating', undefined)
                          return
                        }
                        const parsed = Number(value)
                        if (!Number.isFinite(parsed)) return
                        updateField('rating', Math.max(0, Math.min(5, Math.round(parsed * 10) / 10)))
                      }}
                      placeholder="e.g., 4.5"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="recipe-time-window">Time Window</Label>
                    <Select
                      value={getRecipeTimeWindow(recipe.totalMinutes) || 'unset'}
                      onValueChange={(value) => {
                        if (value === 'unset') {
                          updateField('totalMinutes', undefined)
                          return
                        }
                        const window = value as RecipeTimeWindow
                        const currentMinutes =
                          typeof recipe.totalMinutes === 'number' &&
                          Number.isFinite(recipe.totalMinutes) &&
                          recipe.totalMinutes > 0
                            ? Math.round(recipe.totalMinutes)
                            : null
                        if (
                          (window === 'under_30' && currentMinutes && currentMinutes <= 30) ||
                          (window === '30_to_60' &&
                            currentMinutes &&
                            currentMinutes >= 30 &&
                            currentMinutes <= 60) ||
                          (window === 'over_60' && currentMinutes && currentMinutes > 60)
                        ) {
                          updateField('totalMinutes', currentMinutes)
                          return
                        }
                        if (window === 'under_30') updateField('totalMinutes', 25)
                        else if (window === '30_to_60') updateField('totalMinutes', 45)
                        else updateField('totalMinutes', 75)
                      }}
                    >
                      <SelectTrigger id="recipe-time-window">
                        <SelectValue placeholder="Select window" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Not set</SelectItem>
                        {TIME_WINDOW_OPTIONS.map((window) => (
                          <SelectItem key={window} value={window}>
                            {getRecipeTimeWindowLabel(window)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="total-minutes">Total Minutes</Label>
                    <Input
                      id="total-minutes"
                      type="number"
                      min={1}
                      max={1440}
                      step={1}
                      value={
                        typeof recipe.totalMinutes === 'number' ? recipe.totalMinutes : ''
                      }
                      onChange={(e) => {
                        const value = e.target.value.trim()
                        if (!value) {
                          updateField('totalMinutes', undefined)
                          return
                        }
                        const parsed = Number.parseInt(value, 10)
                        if (!Number.isFinite(parsed) || parsed <= 0) return
                        updateField('totalMinutes', Math.max(1, Math.min(1440, parsed)))
                      }}
                      placeholder="e.g., 35"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="source-url">Source URL</Label>
                  <Input
                    id="source-url"
                    type="url"
                    value={recipe.sourceUrl}
                    onChange={(e) => updateField('sourceUrl', e.target.value)}
                    placeholder="https://example.com/recipe"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="image-url">Image URL</Label>
                    <Input
                      id="image-url"
                      type="url"
                      value={recipe.imageUrl || ''}
                      onChange={(e) => updateField('imageUrl', e.target.value)}
                      placeholder="https://example.com/recipe-image.jpg"
                    />
                  </div>
                  {recipe.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recipe.imageUrl}
                      alt={`${recipe.name || 'Recipe'} preview`}
                      className="h-36 w-full rounded-md border border-border object-cover"
                    />
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="ingredients">
              <AccordionTrigger className="py-2 text-base font-semibold hover:no-underline">
                Ingredients
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <IngredientTable
                  ingredients={recipe.ingredients}
                  onChange={handleIngredientsChange}
                  showTitle={false}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="steps">
              <AccordionTrigger className="py-2 text-base font-semibold hover:no-underline">
                Steps
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2">
                {recipe.steps.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No steps yet. Add one to get started.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {recipe.steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {index + 1}
                      </span>
                      <Textarea
                        value={step}
                        onChange={(e) => updateStep(index, e.target.value)}
                        placeholder={`Step ${index + 1}...`}
                        rows={2}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 text-muted-foreground hover:text-destructive"
                        onClick={() => removeStep(index)}
                        aria-label={`Remove step ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-start">
                  <Button type="button" variant="outline" size="sm" onClick={addStep}>
                    <Plus className="size-4" />
                    Add step
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!recipe.name.trim()}>
          {mode === 'add' ? 'Save Recipe' : 'Update Recipe'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleOpenMealPlanDialog}
          disabled={!canAddToMealPlan}
        >
          Add To Current Meal Plan
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <Dialog open={mealPlanDialogOpen} onOpenChange={setMealPlanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add To Current Meal Plan</DialogTitle>
            <DialogDescription>
              Choose a day and meal slot for {recipe.name || 'this recipe'}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meal-plan-date">Day</Label>
              <Input
                id="meal-plan-date"
                type="date"
                value={mealPlanDateKey}
                onChange={(e) => setMealPlanDateKey(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meal-plan-slot">Meal</Label>
              <Select
                value={mealPlanSlot}
                onValueChange={(value) => setMealPlanSlot(value as MealSlot)}
              >
                <SelectTrigger id="meal-plan-slot">
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
    </form>
  )
}
