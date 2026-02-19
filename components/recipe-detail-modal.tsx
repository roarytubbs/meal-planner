'use client'

import { ExternalLink, Users } from 'lucide-react'
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
}: RecipeDetailModalProps) {
  if (!recipe) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
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
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="flex flex-col gap-5 pb-4">
            {/* Description */}
            {recipe.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {recipe.description}
              </p>
            )}

            <Separator />

            {/* Ingredients */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Ingredients</h3>
              {recipe.ingredients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ingredients listed.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {recipe.ingredients.map((ing) => (
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
              )}
            </div>

            <Separator />

            {/* Steps */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Steps</h3>
              {recipe.steps.filter(Boolean).length === 0 ? (
                <p className="text-sm text-muted-foreground">No steps listed.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {recipe.steps
                    .filter(Boolean)
                    .map((step, i) => (
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
