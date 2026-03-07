'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  UtensilsCrossed,
  Plus,
  Search,
  ChevronDown,
  MoreHorizontal,
  Users,
  SlidersHorizontal,
  X,
  Star,
  Clock3,
  ListChecks,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { toast } from 'sonner'
import type { Recipe, RecipeTimeWindow } from '@/lib/types'
import {
  getRecipeTimeWindow,
  getRecipeTimeWindowLabel,
} from '@/lib/types'
import { useRecipes, deleteRecipe } from '@/lib/meal-planner-store'
import { handleError } from '@/lib/client-logger'

interface RecipeLibraryProps {
  onAddRecipe: () => void
  onImportRecipe: () => void
  onSearchRecipes: () => void
}

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-500/15 text-amber-500',
  lunch: 'bg-emerald-500/15 text-emerald-500',
  dinner: 'bg-sky-500/15 text-sky-500',
  snack: 'bg-rose-500/15 text-rose-500',
}

const MEAL_TYPE_FILTERS = ['all', 'breakfast', 'lunch', 'dinner', 'snack'] as const
const RATING_FILTERS = ['all', '4', '3', '2'] as const
const TIME_WINDOW_FILTERS = ['all', 'under_30', '30_to_60', 'over_60'] as const
const STEP_FILTERS = ['all', '0-3', '4-6', '7+'] as const
const INGREDIENT_FILTERS = ['all', '0-5', '6-10', '11+'] as const
const SERVING_FILTERS = ['all', '1-2', '3-4', '5+'] as const

function getStepCount(recipe: Recipe): number {
  return recipe.steps.filter((step) => step.trim().length > 0).length
}

function getRecipeRating(recipe: Recipe): number {
  if (
    typeof recipe.rating === 'number' &&
    Number.isFinite(recipe.rating) &&
    recipe.rating >= 0 &&
    recipe.rating <= 5
  ) {
    return Math.round(recipe.rating * 10) / 10
  }
  const stepCount = getStepCount(recipe)
  const ingredientCount = recipe.ingredients.length
  const raw = ingredientCount * 0.28 + stepCount * 0.46
  return Math.max(1, Math.min(5, Number((raw / 1.8).toFixed(1))))
}

function getTotalMinutes(recipe: Recipe): number | null {
  if (
    typeof recipe.totalMinutes === 'number' &&
    Number.isFinite(recipe.totalMinutes) &&
    recipe.totalMinutes > 0
  ) {
    return Math.round(recipe.totalMinutes)
  }
  return null
}

function inRange(value: number, filter: string): boolean {
  if (filter === 'all') return true
  if (filter.endsWith('+')) {
    const min = Number.parseInt(filter.replace('+', ''), 10)
    return Number.isFinite(min) ? value >= min : true
  }

  const [minRaw, maxRaw] = filter.split('-')
  const min = Number.parseInt(minRaw, 10)
  const max = Number.parseInt(maxRaw, 10)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return true
  return value >= min && value <= max
}

export function RecipeLibrary({
  onAddRecipe,
  onImportRecipe,
  onSearchRecipes,
}: RecipeLibraryProps) {
  const recipes = useRecipes()

  const [search, setSearch] = useState('')
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [filterMealType, setFilterMealType] = useState<(typeof MEAL_TYPE_FILTERS)[number]>('all')
  const [filterRating, setFilterRating] = useState<(typeof RATING_FILTERS)[number]>('all')
  const [filterTimeWindow, setFilterTimeWindow] = useState<
    (typeof TIME_WINDOW_FILTERS)[number]
  >('all')
  const [filterStepCount, setFilterStepCount] = useState<(typeof STEP_FILTERS)[number]>('all')
  const [filterIngredientCount, setFilterIngredientCount] = useState<
    (typeof INGREDIENT_FILTERS)[number]
  >('all')
  const [filterServings, setFilterServings] = useState<(typeof SERVING_FILTERS)[number]>('all')
  const [deleteConfirm, setDeleteConfirm] = useState<Recipe | null>(null)

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return recipes.filter((recipe) => {
      if (normalizedSearch) {
        const haystack = [recipe.name, recipe.description]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')
        if (!haystack.includes(normalizedSearch)) return false
      }

      if (filterMealType !== 'all' && recipe.mealType !== filterMealType) return false

      const rating = getRecipeRating(recipe)
      if (filterRating !== 'all' && rating < Number.parseInt(filterRating, 10)) return false

      if (filterTimeWindow !== 'all') {
        const timeWindow = getRecipeTimeWindow(getTotalMinutes(recipe) || undefined)
        if (!timeWindow || timeWindow !== filterTimeWindow) return false
      }

      const stepCount = getStepCount(recipe)
      if (!inRange(stepCount, filterStepCount)) return false

      const ingredientCount = recipe.ingredients.length
      if (!inRange(ingredientCount, filterIngredientCount)) return false

      if (!inRange(recipe.servings, filterServings)) return false

      return true
    })
  }, [
    filterIngredientCount,
    filterMealType,
    filterRating,
    filterServings,
    filterStepCount,
    filterTimeWindow,
    recipes,
    search,
  ])

  const activeFilterCount =
    Number(filterMealType !== 'all') +
    Number(filterRating !== 'all') +
    Number(filterTimeWindow !== 'all') +
    Number(filterStepCount !== 'all') +
    Number(filterIngredientCount !== 'all') +
    Number(filterServings !== 'all')

  const handleDelete = async (recipe: Recipe) => {
    try {
      await deleteRecipe(recipe.id)
      setDeleteConfirm(null)
      toast('Recipe deleted', {
        description: recipe.name,
      })
    } catch (error) {
      toast.error(handleError(error, 'recipe.delete'))
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <UtensilsCrossed className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-bold leading-tight text-foreground">Recipe Library</h2>
            <p className="text-xs text-muted-foreground">
              {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} in your library
            </p>
          </div>
        </div>

        <div className="inline-flex items-center">
          <Button
            size="sm"
            onClick={onAddRecipe}
            className="h-9 rounded-r-none border-r border-r-primary-foreground/25 px-4"
          >
            <Plus className="size-4" />
            Add Recipe
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="h-9 rounded-l-none px-3"
                aria-label="Add recipe options"
              >
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onAddRecipe}>Manual</DropdownMenuItem>
              <DropdownMenuItem onClick={onImportRecipe}>Import From URL</DropdownMenuItem>
              <DropdownMenuItem onClick={onSearchRecipes}>Search</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="h-11 rounded-xl border-border pl-9 pr-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear recipe search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={activeFilterCount > 0 ? 'secondary' : 'outline'}
              size="sm"
              className="h-11 w-full rounded-xl px-4 sm:w-auto"
            >
              <SlidersHorizontal className="size-4" />
              Filters
              {activeFilterCount > 0 ? (
                <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                  {activeFilterCount}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[340px] space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Filter Recipes</p>
              <p className="text-xs text-muted-foreground">Narrow results using key recipe metrics.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recipe-filter-type">Type</Label>
              <Select
                value={filterMealType}
                onValueChange={(value) => setFilterMealType(value as (typeof MEAL_TYPE_FILTERS)[number])}
              >
                <SelectTrigger id="recipe-filter-type" className="h-9">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPE_FILTERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === 'all'
                        ? 'All Types'
                        : `${value.charAt(0).toUpperCase()}${value.slice(1)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="recipe-filter-rating">Rating</Label>
                <Select
                  value={filterRating}
                  onValueChange={(value) => setFilterRating(value as (typeof RATING_FILTERS)[number])}
                >
                  <SelectTrigger id="recipe-filter-rating" className="h-9">
                    <SelectValue placeholder="Any rating" />
                  </SelectTrigger>
                  <SelectContent>
                    {RATING_FILTERS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'all' ? 'Any Rating' : `${value}.0+ stars`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipe-filter-time">Time window</Label>
                <Select
                  value={filterTimeWindow}
                  onValueChange={(value) =>
                    setFilterTimeWindow(value as (typeof TIME_WINDOW_FILTERS)[number])
                  }
                >
                  <SelectTrigger id="recipe-filter-time" className="h-9">
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any time</SelectItem>
                    {TIME_WINDOW_FILTERS.filter((value) => value !== 'all').map((value) => (
                      <SelectItem key={value} value={value}>
                        {getRecipeTimeWindowLabel(value as RecipeTimeWindow)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="recipe-filter-steps">Step count</Label>
                <Select
                  value={filterStepCount}
                  onValueChange={(value) => setFilterStepCount(value as (typeof STEP_FILTERS)[number])}
                >
                  <SelectTrigger id="recipe-filter-steps" className="h-9">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_FILTERS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'all' ? 'Any' : `${value} steps`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipe-filter-ingredients">Ingredient count</Label>
                <Select
                  value={filterIngredientCount}
                  onValueChange={(value) =>
                    setFilterIngredientCount(value as (typeof INGREDIENT_FILTERS)[number])
                  }
                >
                  <SelectTrigger id="recipe-filter-ingredients" className="h-9">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {INGREDIENT_FILTERS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'all' ? 'Any' : `${value} ingredients`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recipe-filter-servings">Servings</Label>
              <Select
                value={filterServings}
                onValueChange={(value) => setFilterServings(value as (typeof SERVING_FILTERS)[number])}
              >
                <SelectTrigger id="recipe-filter-servings" className="h-9">
                  <SelectValue placeholder="Any servings" />
                </SelectTrigger>
                <SelectContent>
                  {SERVING_FILTERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === 'all' ? 'Any' : `${value} servings`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-8"
                onClick={() => {
                  setFilterMealType('all')
                  setFilterRating('all')
                  setFilterTimeWindow('all')
                  setFilterStepCount('all')
                  setFilterIngredientCount('all')
                  setFilterServings('all')
                }}
                disabled={activeFilterCount === 0}
              >
                Clear all filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {activeFilterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {filterMealType !== 'all' ? (
            <Badge variant="secondary" className="h-7 rounded-full gap-1 pr-1">
              Type: {filterMealType}
              <button
                type="button"
                onClick={() => setFilterMealType('all')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                aria-label="Clear type filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          {filterRating !== 'all' ? (
            <Badge variant="secondary" className="h-7 rounded-full gap-1 pr-1">
              Rating: {filterRating}.0+
              <button
                type="button"
                onClick={() => setFilterRating('all')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                aria-label="Clear rating filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          {filterTimeWindow !== 'all' ? (
            <Badge variant="secondary" className="h-7 rounded-full gap-1 pr-1">
              Time: {getRecipeTimeWindowLabel(filterTimeWindow as RecipeTimeWindow)}
              <button
                type="button"
                onClick={() => setFilterTimeWindow('all')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                aria-label="Clear time filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          {filterStepCount !== 'all' ? (
            <Badge variant="secondary" className="h-7 rounded-full gap-1 pr-1">
              Steps: {filterStepCount}
              <button
                type="button"
                onClick={() => setFilterStepCount('all')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                aria-label="Clear step count filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          {filterIngredientCount !== 'all' ? (
            <Badge variant="secondary" className="h-7 rounded-full gap-1 pr-1">
              Ingredients: {filterIngredientCount}
              <button
                type="button"
                onClick={() => setFilterIngredientCount('all')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                aria-label="Clear ingredient count filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          {filterServings !== 'all' ? (
            <Badge variant="secondary" className="h-7 rounded-full gap-1 pr-1">
              Servings: {filterServings}
              <button
                type="button"
                onClick={() => setFilterServings('all')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                aria-label="Clear servings filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UtensilsCrossed className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">No recipes found</p>
            <p className="text-sm text-muted-foreground">
              {search || activeFilterCount > 0
                ? 'Try adjusting your search or filters.'
                : 'Get started by adding your first recipe.'}
            </p>
          </div>
          {!search && activeFilterCount === 0 ? (
            <Button size="sm" onClick={onAddRecipe}>
              <Plus className="size-4" />
              Add Recipe
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => {
            const stepCount = getStepCount(recipe)
            const rating = getRecipeRating(recipe)
            const totalMinutes = getTotalMinutes(recipe)
            const timeWindow = getRecipeTimeWindow(totalMinutes || undefined)

            return (
              <Card
                key={recipe.id}
                className="overflow-hidden rounded-2xl border-border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <Link
                  href={`/recipes/${encodeURIComponent(recipe.id)}`}
                  className="block w-full text-left"
                  aria-label={`View ${recipe.name}`}
                >
                  {recipe.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.name}
                      className="h-44 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center bg-secondary">
                      <UtensilsCrossed className="size-8 text-muted-foreground/25" />
                    </div>
                  )}
                </Link>

                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/recipes/${encodeURIComponent(recipe.id)}`}
                      className="line-clamp-2 text-left text-base font-semibold leading-snug text-foreground hover:underline"
                    >
                      {recipe.name}
                    </Link>
                    {recipe.mealType ? (
                      <Badge
                        variant="secondary"
                        className={`shrink-0 text-[11px] ${MEAL_TYPE_COLORS[recipe.mealType] || ''}`}
                      >
                        {recipe.mealType}
                      </Badge>
                    ) : null}
                  </div>

                  {recipe.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {recipe.description}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3 fill-amber-500 text-amber-500" />
                      {rating.toFixed(1)}
                    </span>
                    {totalMinutes ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3 text-violet-400" />
                        {totalMinutes} min
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3 text-sky-400" />
                      {recipe.servings} servings
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="size-3 text-emerald-400" />
                      {stepCount} steps
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1.5">
                      {timeWindow ? (
                        <Badge variant="outline" className="text-[10px]">
                          {getRecipeTimeWindowLabel(timeWindow)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      {recipe.sourceUrl ? (
                        <a
                          href={recipe.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          aria-label="Open source"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md"
                            aria-label="Recipe actions"
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/recipes/${encodeURIComponent(recipe.id)}/edit`}>
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteConfirm(recipe)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipe</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteConfirm?.name}&rdquo;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => (deleteConfirm ? handleDelete(deleteConfirm) : undefined)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
