'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock3, ExternalLink, Star, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { Recipe } from '@/lib/types'

interface RecipeDetailModalProps {
  recipe: Recipe | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditRecipe?: (recipe: Recipe) => void
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
}: RecipeDetailModalProps) {
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [showAllIngredients, setShowAllIngredients] = useState(false)
  const [showAllSteps, setShowAllSteps] = useState(false)

  useEffect(() => {
    setShowFullDescription(false)
    setShowAllIngredients(false)
    setShowAllSteps(false)
  }, [recipe?.id, open])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl text-balance">{recipe.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Full recipe details for {recipe.name}
          </DialogDescription>
          <div className="flex items-center gap-2 flex-wrap pt-1">
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
            {onEditRecipe ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => onEditRecipe(recipe)}
              >
                Edit Recipe
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 -mx-6 px-6">
          <div className="flex flex-col gap-5 pb-4">
            {recipe.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={recipe.imageUrl}
                alt={recipe.name}
                className="h-52 w-full rounded-lg border border-border object-cover"
              />
            ) : null}

            {/* Description */}
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

            {/* Ingredients */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Ingredients</h3>
              {recipe.ingredients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ingredients listed.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1">
                    {visibleIngredients.map((ing) => (
                      <li
                        key={ing.id}
                        className="flex items-baseline gap-2 text-sm"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40 mt-1.5" />
                        <span className="text-foreground">
                          {ing.qty !== null && (
                            <span className="font-medium">{ing.qty}</span>
                          )}{' '}
                          {ing.unit && <span className="text-muted-foreground">{ing.unit}</span>}{' '}
                          {ing.name}
                        </span>
                      </li>
                    ))}
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

            {/* Steps */}
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

            {/* Source URL */}
            {recipe.sourceUrl && (
              <>
                <Separator />
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-foreground">Source</h3>
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    {recipe.sourceUrl}
                  </a>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
