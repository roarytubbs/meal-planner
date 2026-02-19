'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IngredientTable } from '@/components/ingredient-table'
import type { Recipe, Ingredient, RecipeMode } from '@/lib/types'
import { getModeLabel, getDraftLabel } from '@/lib/types'

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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  )

  const modeLabel = getModeLabel(mode)
  const draftLabel = getDraftLabel(mode)

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
        <Badge variant="outline" className="text-xs">
          {draftLabel}
        </Badge>
      </div>

      {/* Recipe card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{modeLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Name */}
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

          {/* Description */}
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

          {/* Meal type + Servings */}
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

          {/* Source URL */}
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

          {/* Ingredients */}
          <IngredientTable
            ingredients={recipe.ingredients}
            onChange={handleIngredientsChange}
          />

          {/* Steps */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Steps</h3>
            </div>

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
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!recipe.name.trim()}>
          {mode === 'add' ? 'Save Recipe' : 'Update Recipe'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
