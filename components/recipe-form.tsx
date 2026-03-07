'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft, ExternalLink, Plus, Trash2 } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IngredientTable } from '@/components/ingredient-table'
import { setMealSlot } from '@/lib/meal-planner-store'
import type {
  Recipe,
  Ingredient,
  RecipeMode,
  MealSlot,
} from '@/lib/types'
import {
  formatDateLabel,
  getModeLabel,
  toDateKey,
} from '@/lib/types'
import { toast } from 'sonner'
import { handleError } from '@/lib/client-logger'

interface RecipeFormProps {
  mode: RecipeMode
  initialRecipe?: Recipe
  onSave: (recipe: Recipe) => Promise<void> | void
  onCancel: () => void
}

function generateId() {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

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
      toast.error(handleError(error, 'recipe.add-to-plan'))
    } finally {
      setMealPlanApplying(false)
    }
  }, [mealPlanDateKey, mealPlanSlot, recipe.id])

  return (
    <>
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl flex flex-col gap-8">
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

        {/* Name + actions row */}
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="recipe-name" className="text-base font-semibold">
                Recipe name
              </Label>
              <Input
                id="recipe-name"
                value={recipe.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g., Chicken Stir Fry"
                className="h-11 text-base"
                required
              />
            </div>
            <div className="flex items-center gap-2 shrink-0 pb-0.5">
              {recipe.sourceUrl && (
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" asChild>
                  <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" />
                    View original
                  </a>
                </Button>
              )}
              {canAddToMealPlan && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenMealPlanDialog}
                >
                  Add to plan
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={!recipe.name.trim()}>
                {mode === 'add' ? 'Save Recipe' : 'Update Recipe'}
              </Button>
            </div>
          </div>
        </div>

        {/* Source + Image URL fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source-url">
              Source URL{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="source-url"
              type="url"
              value={recipe.sourceUrl}
              onChange={(e) => updateField('sourceUrl', e.target.value)}
              placeholder="https://example.com/recipe"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="image-url">
              Image URL{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="image-url"
              type="url"
              value={recipe.imageUrl || ''}
              onChange={(e) => updateField('imageUrl', e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>
        </div>

        {recipe.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.imageUrl}
            alt={`${recipe.name || 'Recipe'} preview`}
            className="h-48 w-full rounded-xl border border-border object-cover"
          />
        ) : null}

        {/* Quick metadata row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meal-type">Type</Label>
            <Select
              value={recipe.mealType || undefined}
              onValueChange={(v) => updateField('mealType', v as Recipe['mealType'])}
            >
              <SelectTrigger id="meal-type">
                <SelectValue placeholder="Select" />
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
              onChange={(e) => updateField('servings', parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="total-minutes">Cook time (min)</Label>
            <Input
              id="total-minutes"
              type="number"
              min={1}
              max={1440}
              step={1}
              value={typeof recipe.totalMinutes === 'number' ? recipe.totalMinutes : ''}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-rating">Rating (0–5)</Label>
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
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipe-desc">
            Description{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="recipe-desc"
            value={recipe.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="A quick weeknight dinner with fresh vegetables..."
            rows={3}
          />
        </div>

        {/* Ingredients */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Ingredients</h2>
            <span className="text-xs text-muted-foreground">
              {recipe.ingredients.length > 0 ? `${recipe.ingredients.length} added` : ''}
            </span>
          </div>
          <IngredientTable
            ingredients={recipe.ingredients}
            onChange={handleIngredientsChange}
            showTitle={false}
          />
        </section>

        {/* Steps */}
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">Steps</h2>

          {recipe.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps yet.</p>
          ) : (
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
          )}

          <div>
            <Button type="button" variant="outline" size="sm" onClick={addStep}>
              <Plus className="size-4" />
              Add step
            </Button>
          </div>
        </section>

        <div className="pb-8" />
      </form>

      <Dialog open={mealPlanDialogOpen} onOpenChange={setMealPlanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to meal plan</DialogTitle>
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
    </>
  )
}
