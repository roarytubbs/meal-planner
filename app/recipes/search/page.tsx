'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Heart,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppHeader } from '@/components/app-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addRecipe, useRecipes } from '@/lib/meal-planner-store'
import type { Ingredient, Recipe } from '@/lib/types'

const PAGE_SIZE = 12
const DEFAULT_SORT = 'popularity'

type SortValue = 'popularity' | 'healthiness' | 'time' | 'random'
type PageToken = number | 'left-ellipsis' | 'right-ellipsis'

interface SearchResult {
  id: number
  title: string
  image: string
  servings: number
  sourceUrl: string
  mealType: Recipe['mealType']
  summary: string
  readyInMinutes: number | null
  aggregateLikes: number | null
  healthScore: number | null
  spoonacularScore: number | null
  pricePerServing: number | null
  cuisines: string[]
  diets: string[]
  dishTypes: string[]
  usedIngredientCount: number | null
  missedIngredientCount: number | null
}

interface SearchPagination {
  page: number
  pageSize: number
  totalResults: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

interface SearchApiResponse {
  results?: SearchResult[]
  pagination?: SearchPagination
  error?: string
}

interface ImportedRecipeDetails {
  name: string
  description: string
  ingredients: Ingredient[]
  steps: string[]
  servings: number
  rating?: number
  totalMinutes?: number
  mealType: Recipe['mealType']
  sourceUrl: string
  imageUrl: string
}

function generateRecipeId() {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

function parseMealType(value: string | null): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (
    normalized === 'breakfast' ||
    normalized === 'lunch' ||
    normalized === 'dinner' ||
    normalized === 'snack'
  ) {
    return normalized
  }
  return 'all'
}

function parseSort(value: string | null): SortValue {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (
    normalized === 'popularity' ||
    normalized === 'healthiness' ||
    normalized === 'time' ||
    normalized === 'random'
  ) {
    return normalized
  }
  return DEFAULT_SORT
}

function buildPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'right-ellipsis', totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'left-ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [
    1,
    'left-ellipsis',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'right-ellipsis',
    totalPages,
  ]
}

function formatPricePerServing(pricePerServing: number | null): string {
  if (pricePerServing === null || !Number.isFinite(pricePerServing)) return ''
  return `$${(pricePerServing / 100).toFixed(2)}/serving`
}

function normalizeSourceUrl(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`.toLowerCase()
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase()
  }
}

function normalizeRecipeName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function RecipeSearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const recipes = useRecipes()

  const [query, setQuery] = useState(() => searchParams.get('query') || '')
  const [mealType, setMealType] = useState(() => parseMealType(searchParams.get('mealType')))
  const [diet, setDiet] = useState(() => searchParams.get('diet') || '')
  const [cuisine, setCuisine] = useState(() => searchParams.get('cuisine') || '')
  const [maxReadyTime, setMaxReadyTime] = useState(
    () => String(parsePositiveInt(searchParams.get('maxReadyTime'), 0) || '')
  )
  const [sort, setSort] = useState<SortValue>(() => parseSort(searchParams.get('sort')))
  const [page, setPage] = useState(() => parsePositiveInt(searchParams.get('page'), 1))

  const [results, setResults] = useState<SearchResult[]>([])
  const [pagination, setPagination] = useState<SearchPagination | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [initializedFromUrl, setInitializedFromUrl] = useState(false)

  const [detailsById, setDetailsById] = useState<Record<number, ImportedRecipeDetails>>({})
  const [loadingDetailsId, setLoadingDetailsId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [importingId, setImportingId] = useState<number | null>(null)
  const [addedRecipeIdsBySearchId, setAddedRecipeIdsBySearchId] = useState<
    Record<number, string>
  >({})

  const activeFilters = useMemo(() => {
    return [
      mealType !== 'all',
      Boolean(diet.trim()),
      Boolean(cuisine.trim()),
      Boolean(maxReadyTime.trim()),
    ].filter(Boolean).length
  }, [mealType, diet, cuisine, maxReadyTime])

  const pageTokens = useMemo(() => {
    if (!pagination || pagination.totalPages <= 1) return []
    return buildPageTokens(pagination.page, pagination.totalPages)
  }, [pagination])

  const recipesBySourceUrl = useMemo(() => {
    const bySource = new Map<string, string>()
    for (const recipe of recipes) {
      const key = normalizeSourceUrl(recipe.sourceUrl)
      if (key && !bySource.has(key)) {
        bySource.set(key, recipe.id)
      }
    }
    return bySource
  }, [recipes])

  const recipesByName = useMemo(() => {
    const byName = new Map<string, string>()
    for (const recipe of recipes) {
      const key = normalizeRecipeName(recipe.name)
      if (key && !byName.has(key)) {
        byName.set(key, recipe.id)
      }
    }
    return byName
  }, [recipes])

  const buildRequestParams = useCallback(
    (targetPage: number): URLSearchParams => {
      const params = new URLSearchParams({
        query: query.trim(),
        page: String(Math.max(1, targetPage)),
        limit: String(PAGE_SIZE),
        sort,
      })

      if (mealType !== 'all') params.set('mealType', mealType)
      if (diet.trim()) params.set('diet', diet.trim())
      if (cuisine.trim()) params.set('cuisine', cuisine.trim())
      if (maxReadyTime.trim()) params.set('maxReadyTime', maxReadyTime.trim())

      return params
    },
    [query, sort, mealType, diet, cuisine, maxReadyTime]
  )

  const executeSearch = useCallback(
    async (targetPage: number, syncUrl: boolean) => {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) {
        setSearchError(null)
        setSearched(false)
        setResults([])
        setPagination(null)
        setPage(1)
        if (syncUrl) {
          router.replace('/recipes/search', { scroll: false })
        }
        return
      }

      const params = buildRequestParams(targetPage)
      setSearching(true)
      setSearchError(null)
      setSearched(true)

      try {
        const response = await fetch(
          `/api/import-recipe/providers/spoonacular/search?${params.toString()}`
        )
        const payload = (await response.json().catch(() => ({}))) as SearchApiResponse

        if (!response.ok) {
          throw new Error(payload.error || 'Unable to search recipes.')
        }

        const nextResults = Array.isArray(payload.results) ? payload.results : []
        const fallbackPagination: SearchPagination = {
          page: Math.max(1, targetPage),
          pageSize: PAGE_SIZE,
          totalResults: nextResults.length,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: targetPage > 1,
        }
        const nextPagination = payload.pagination || fallbackPagination

        setResults(nextResults)
        setPagination(nextPagination)
        setPage(nextPagination.page)

        if (syncUrl) {
          router.replace(`/recipes/search?${params.toString()}`, { scroll: false })
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to search recipes.'
        setSearchError(message)
        setResults([])
        setPagination(null)
      } finally {
        setSearching(false)
      }
    },
    [buildRequestParams, query, router]
  )

  const findExistingRecipeId = useCallback(
    (result: SearchResult): string | null => {
      const sourceMatch = normalizeSourceUrl(result.sourceUrl)
      if (sourceMatch && recipesBySourceUrl.has(sourceMatch)) {
        return recipesBySourceUrl.get(sourceMatch) || null
      }

      const nameMatch = normalizeRecipeName(result.title)
      if (nameMatch && recipesByName.has(nameMatch)) {
        return recipesByName.get(nameMatch) || null
      }

      return null
    },
    [recipesByName, recipesBySourceUrl]
  )

  const orderedResults = useMemo(() => {
    return results
      .map((result, index) => {
        const recipeId =
          addedRecipeIdsBySearchId[result.id] || findExistingRecipeId(result)
        return {
          result,
          index,
          recipeId,
          alreadyAdded: Boolean(recipeId),
        }
      })
      .sort((a, b) => {
        if (a.alreadyAdded === b.alreadyAdded) return a.index - b.index
        return a.alreadyAdded ? 1 : -1
      })
  }, [addedRecipeIdsBySearchId, findExistingRecipeId, results])

  useEffect(() => {
    if (initializedFromUrl) return
    setInitializedFromUrl(true)
    if (!query.trim()) return
    void executeSearch(page, false)
  }, [executeSearch, initializedFromUrl, page, query])

  const loadRecipeDetails = useCallback(
    async (recipeId: number) => {
      if (detailsById[recipeId]) return detailsById[recipeId]

      setLoadingDetailsId(recipeId)
      try {
        const response = await fetch(
          `/api/import-recipe/providers/spoonacular/recipes/${recipeId}`
        )
        const payload = (await response.json().catch(() => ({}))) as
          | ImportedRecipeDetails
          | { error?: string }

        if (!response.ok) {
          throw new Error(
            'error' in payload && typeof payload.error === 'string'
              ? payload.error
              : 'Unable to load recipe details.'
          )
        }

        const details = payload as ImportedRecipeDetails
        setDetailsById((prev) => ({ ...prev, [recipeId]: details }))
        return details
      } finally {
        setLoadingDetailsId(null)
      }
    },
    [detailsById]
  )

  const handleSearch = useCallback(() => {
    void executeSearch(1, true)
  }, [executeSearch])

  const toggleDetails = useCallback(
    async (recipeId: number) => {
      const isOpen = expanded.has(recipeId)
      if (isOpen) {
        setExpanded((prev) => {
          const next = new Set(prev)
          next.delete(recipeId)
          return next
        })
        return
      }

      try {
        await loadRecipeDetails(recipeId)
        setExpanded((prev) => new Set(prev).add(recipeId))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load recipe details.'
        toast.error(message)
      }
    },
    [expanded, loadRecipeDetails]
  )

  const handleImport = useCallback(
    async (result: SearchResult) => {
      const existingRecipeId = findExistingRecipeId(result)
      if (existingRecipeId) {
        setAddedRecipeIdsBySearchId((prev) =>
          prev[result.id] === existingRecipeId
            ? prev
            : { ...prev, [result.id]: existingRecipeId }
        )
        toast.info('Already in your library', {
          description: result.title,
          action: {
            label: 'View details',
            onClick: () =>
              router.push(`/?tab=recipes&recipeId=${encodeURIComponent(existingRecipeId)}`),
          },
        })
        return
      }

      setImportingId(result.id)
      try {
        const details = await loadRecipeDetails(result.id)
        const now = new Date().toISOString()
        const recipe: Recipe = {
          id: generateRecipeId(),
          name: details.name || result.title,
          description: details.description || result.summary || '',
          mealType: details.mealType || result.mealType || '',
          servings: details.servings || result.servings || 4,
          rating:
            typeof details.rating === 'number' && Number.isFinite(details.rating)
              ? Math.max(0, Math.min(5, Math.round(details.rating * 10) / 10))
              : typeof result.spoonacularScore === 'number' &&
                  Number.isFinite(result.spoonacularScore)
                ? Math.max(
                    0,
                    Math.min(5, Math.round((result.spoonacularScore / 20) * 10) / 10)
                  )
                : undefined,
          totalMinutes:
            typeof details.totalMinutes === 'number' &&
            Number.isFinite(details.totalMinutes) &&
            details.totalMinutes > 0
              ? Math.round(details.totalMinutes)
              : typeof result.readyInMinutes === 'number' &&
                  Number.isFinite(result.readyInMinutes) &&
                  result.readyInMinutes > 0
                ? Math.round(result.readyInMinutes)
                : undefined,
          ingredients: Array.isArray(details.ingredients) ? details.ingredients : [],
          steps:
            Array.isArray(details.steps) && details.steps.length > 0
              ? details.steps
              : [''],
          sourceUrl: details.sourceUrl || result.sourceUrl || '',
          imageUrl: details.imageUrl || result.image || '',
          createdAt: now,
          updatedAt: now,
        }

        const created = await addRecipe(recipe)
        setAddedRecipeIdsBySearchId((prev) => ({ ...prev, [result.id]: created.id }))
        toast.success('Added to your library', {
          description: recipe.name,
          action: {
            label: 'View details',
            onClick: () =>
              router.push(`/?tab=recipes&recipeId=${encodeURIComponent(created.id)}`),
          },
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to import recipe.'
        toast.error(message)
      } finally {
        setImportingId(null)
      }
    },
    [findExistingRecipeId, loadRecipeDetails, router]
  )

  return (
    <main className="min-h-screen bg-background">
      <AppHeader activeTab="recipes" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => router.push('/?tab=recipes')}
          >
            <ArrowLeft className="size-4" />
            Back To Recipes
          </Button>
        </div>

        <Card className="gap-3 py-4">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Search Recipes</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Browse recipes with rich metadata before importing into your library.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {activeFilters} filter{activeFilters === 1 ? '' : 's'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search recipes..."
                  className="pl-9"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleSearch()
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                onClick={handleSearch}
                disabled={!query.trim() || searching}
              >
                {searching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Search
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger>
                  <SelectValue placeholder="Meal Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Meal Types</SelectItem>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>

              <Input
                value={diet}
                onChange={(event) => setDiet(event.target.value)}
                placeholder="Diet (e.g., vegan)"
              />

              <Input
                value={cuisine}
                onChange={(event) => setCuisine(event.target.value)}
                placeholder="Cuisine (e.g., mexican)"
              />

              <Input
                value={maxReadyTime}
                onChange={(event) =>
                  setMaxReadyTime(event.target.value.replace(/\D/g, ''))
                }
                placeholder="Max mins"
              />

              <Select
                value={sort}
                onValueChange={(value) => setSort(value as SortValue)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popularity">Popularity</SelectItem>
                  <SelectItem value="healthiness">Health</SelectItem>
                  <SelectItem value="time">Cook Time</SelectItem>
                  <SelectItem value="random">Random</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {searchError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {searchError}
          </div>
        ) : null}

        {searched && !searching && results.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No recipes matched this search.
          </div>
        ) : null}

        <div className="grid gap-3">
          {orderedResults.map(({ result, recipeId, alreadyAdded }) => {
            const detail = detailsById[result.id]
            const isExpanded = expanded.has(result.id)
            const loadingDetail = loadingDetailsId === result.id
            const importing = importingId === result.id
            const tags = [...result.cuisines, ...result.diets, ...result.dishTypes]
            const ingredientCountLabel =
              result.usedIngredientCount !== null ||
              result.missedIngredientCount !== null
                ? `${result.usedIngredientCount || 0}/${(result.usedIngredientCount || 0) + (result.missedIngredientCount || 0)} matched ingredients`
                : null

            return (
              <Card key={result.id} className="gap-3 py-4">
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    {result.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={result.image}
                        alt={result.title}
                        className="h-24 w-24 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
                        No image
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <h3 className="line-clamp-2 text-lg font-semibold text-foreground">
                            {result.title}
                          </h3>
                          {alreadyAdded ? (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            >
                              Added to recipes
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {result.sourceUrl ? (
                            <a
                              href={result.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                            >
                              Open Source
                              <ExternalLink className="size-3.5" />
                            </a>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant={alreadyAdded ? 'secondary' : 'default'}
                            onClick={() => {
                              if (recipeId) {
                                router.push(`/?tab=recipes&recipeId=${encodeURIComponent(recipeId)}`)
                                return
                              }
                              void handleImport(result)
                            }}
                            disabled={importing}
                          >
                            {importing ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : alreadyAdded ? null : (
                              <Plus className="size-3.5" />
                            )}
                            {importing ? 'Importing...' : alreadyAdded ? 'View Recipe' : 'Add'}
                          </Button>
                        </div>
                      </div>

                      {result.summary ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {result.summary}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5 text-sky-500" />
                          {result.servings} servings
                        </span>
                        {result.readyInMinutes !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3.5 text-violet-500" />
                            {result.readyInMinutes} min
                          </span>
                        ) : null}
                        {result.aggregateLikes !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Heart className="size-3.5 fill-rose-500 text-rose-500" />
                            {result.aggregateLikes} likes
                          </span>
                        ) : null}
                        {result.spoonacularScore !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3.5 fill-amber-500 text-amber-500" />
                            Score {Math.round(result.spoonacularScore)}
                          </span>
                        ) : null}
                        {result.healthScore !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="size-3.5 text-emerald-500" />
                            Health {Math.round(result.healthScore)}
                          </span>
                        ) : null}
                        {ingredientCountLabel ? (
                          <span>{ingredientCountLabel}</span>
                        ) : null}
                        {formatPricePerServing(result.pricePerServing) ? (
                          <span>{formatPricePerServing(result.pricePerServing)}</span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {result.mealType ? (
                          <Badge variant="secondary" className="text-xs">
                            {result.mealType}
                          </Badge>
                        ) : null}
                        {tags.slice(0, 6).map((tag) => (
                          <Badge
                            key={`${result.id}-${tag}`}
                            variant="outline"
                            className="text-[11px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            void toggleDetails(result.id)
                          }}
                          disabled={loadingDetail}
                          className="inline-flex items-center gap-1 text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground disabled:opacity-60"
                        >
                          {loadingDetail ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : null}
                          {isExpanded ? 'Hide Details' : 'Show Details'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Ingredients
                      </p>

                      {detail ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {detail.ingredients.length} ingredient
                            {detail.ingredients.length === 1 ? '' : 's'} •{' '}
                            {detail.steps.length} step
                            {detail.steps.length === 1 ? '' : 's'}
                          </p>
                          <div className="grid gap-1 sm:grid-cols-2">
                            {detail.ingredients.slice(0, 14).map((ingredient) => (
                              <p key={ingredient.id} className="text-xs text-foreground">
                                {ingredient.qty !== null ? `${ingredient.qty} ` : ''}
                                {ingredient.unit ? `${ingredient.unit} ` : ''}
                                {ingredient.name}
                              </p>
                            ))}
                          </div>
                        </>
                      ) : loadingDetail ? (
                        <p className="text-xs text-muted-foreground">
                          Loading ingredients...
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!pagination.hasPreviousPage) return
                  void executeSearch(pagination.page - 1, true)
                }}
                disabled={!pagination.hasPreviousPage || searching}
              >
                Prev
              </Button>

              {pageTokens.map((token) => {
                if (token === 'left-ellipsis' || token === 'right-ellipsis') {
                  return (
                    <span
                      key={token}
                      className="inline-flex h-8 min-w-8 items-center justify-center px-1 text-xs text-muted-foreground"
                    >
                      ...
                    </span>
                  )
                }

                const isCurrent = token === pagination.page
                return (
                  <Button
                    key={token}
                    type="button"
                    size="sm"
                    variant={isCurrent ? 'default' : 'outline'}
                    className="h-8 min-w-8 px-2"
                    disabled={searching || isCurrent}
                    onClick={() => {
                      void executeSearch(token, true)
                    }}
                  >
                    {token}
                  </Button>
                )
              })}

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!pagination.hasNextPage) return
                  void executeSearch(pagination.page + 1, true)
                }}
                disabled={!pagination.hasNextPage || searching}
              >
                Next
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} • {pagination.totalResults}{' '}
              results
            </p>
          </div>
        ) : null}
      </div>
      <Toaster />
    </main>
  )
}

export default function RecipeSearchPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background">
          <AppHeader activeTab="recipes" />
          <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-muted-foreground">
            Loading search...
          </div>
        </main>
      }
    >
      <RecipeSearchContent />
    </Suspense>
  )
}
