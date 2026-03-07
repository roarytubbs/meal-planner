'use client'

import { ArrowLeft, Clock3, Copy, ExternalLink, Pencil, Star, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Recipe } from '@/lib/types'

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-500/15 text-amber-600',
  lunch: 'bg-emerald-500/15 text-emerald-600',
  dinner: 'bg-sky-500/15 text-sky-600',
  snack: 'bg-rose-500/15 text-rose-600',
}

interface RecipeDetailViewProps {
  recipe: Recipe
  onEdit: () => void
  onDuplicate: () => void
  onBack: () => void
}

export function RecipeDetailView({ recipe, onEdit, onDuplicate, onBack }: RecipeDetailViewProps) {
  const filteredSteps = recipe.steps.filter((s) => s.trim().length > 0)

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Recipes
        </button>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-xl font-semibold text-foreground">{recipe.name}</h1>
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
            {recipe.mealType ? (
              <Badge
                variant="secondary"
                className={`text-[11px] ${MEAL_TYPE_COLORS[recipe.mealType] || ''}`}
              >
                {recipe.mealType}
              </Badge>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5 text-sky-400" />
              {recipe.servings} servings
            </span>
            {typeof recipe.totalMinutes === 'number' && recipe.totalMinutes > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3.5 text-violet-400" />
                {recipe.totalMinutes} min
              </span>
            ) : null}
            {typeof recipe.rating === 'number' && Number.isFinite(recipe.rating) ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-amber-500 text-amber-500" />
                {Math.max(0, Math.min(5, recipe.rating)).toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDuplicate}>
            <Copy className="size-4" />
            Duplicate
          </Button>
          <Button type="button" size="sm" onClick={onEdit}>
            <Pencil className="size-4" />
            Edit
          </Button>
        </div>
      </div>

      {recipe.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.imageUrl}
          alt={recipe.name}
          className="h-52 w-full rounded-xl border border-border object-cover"
        />
      ) : null}

      {recipe.description.trim() ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{recipe.description}</p>
      ) : null}

      <Tabs defaultValue="ingredients">
        <TabsList className="w-full">
          <TabsTrigger value="ingredients" className="flex-1">
            Ingredients
            {recipe.ingredients.length > 0 ? (
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                ({recipe.ingredients.length})
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="instructions" className="flex-1">
            Instructions
            {filteredSteps.length > 0 ? (
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                ({filteredSteps.length})
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ingredients" className="mt-4">
          {recipe.ingredients.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No ingredients listed.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/25" />
                    <span className="text-foreground">{ing.name}</span>
                    {ing.store ? (
                      <span className="text-xs text-muted-foreground/60">{ing.store}</span>
                    ) : null}
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {[ing.qty !== null ? String(ing.qty) : '', ing.unit]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="instructions" className="mt-4">
          {filteredSteps.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No instructions listed.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {filteredSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed text-foreground">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>

      {recipe.sourceUrl ? (
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
          View original recipe
        </a>
      ) : null}
    </div>
  )
}
