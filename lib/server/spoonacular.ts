import type { Ingredient, Recipe } from '@/lib/types'
import { getServerEnv } from '@/lib/server/env'

const SPOONACULAR_BASE_URL = 'https://api.spoonacular.com'
const DEFAULT_SEARCH_LIMIT = 12
const MAX_SEARCH_LIMIT = 24

export interface SpoonacularSearchResult {
  id: number
  title: string
  image: string
  servings: number
  sourceUrl: string
  mealType: Recipe['mealType']
}

export interface SpoonacularRecipeImport {
  name: string
  description: string
  ingredients: Ingredient[]
  steps: string[]
  servings: number
  mealType: Recipe['mealType']
  sourceUrl: string
}

function truncate(value: string, maxLength: number): string {
  const text = value.trim()
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim()
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    '#39': "'",
    quot: '"',
    nbsp: ' ',
    ndash: '-',
    mdash: '-',
    hellip: '...',
    lt: '<',
    gt: '>',
  }

  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (full, code) => {
    const normalized = String(code).toLowerCase()
    if (normalized.startsWith('#x')) {
      const parsed = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : full
    }
    if (normalized.startsWith('#')) {
      const parsed = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : full
    }
    return namedEntities[normalized] ?? full
  })
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function normalizeMealType(raw: unknown): Recipe['mealType'] {
  const mealType = String(raw || '')
    .trim()
    .toLowerCase()
  if (
    mealType === 'breakfast' ||
    mealType === 'lunch' ||
    mealType === 'dinner' ||
    mealType === 'snack'
  ) {
    return mealType
  }
  return ''
}

function inferMealType(parts: string[]): Recipe['mealType'] {
  const content = parts.join(' ').toLowerCase()
  if (!content) return ''

  if (/\b(breakfast|brunch|pancake|oatmeal|frittata|granola)\b/.test(content)) {
    return 'breakfast'
  }
  if (/\b(lunch|sandwich|wrap|bento|grain bowl|salad)\b/.test(content)) {
    return 'lunch'
  }
  if (/\b(dinner|supper|entree|main course|casserole|roast)\b/.test(content)) {
    return 'dinner'
  }
  if (/\b(snack|appetizer|dessert|cookie|brownie|muffin|bar)\b/.test(content)) {
    return 'snack'
  }

  return ''
}

function toBoundedServings(value: unknown): number {
  const servings = Number(value)
  if (!Number.isFinite(servings) || servings <= 0) return 4
  return Math.max(1, Math.min(100, Math.round(servings)))
}

function toBoundedQty(value: unknown): number | null {
  const qty = Number(value)
  if (!Number.isFinite(qty)) return null
  const rounded = Math.round(qty * 1000) / 1000
  return rounded > 0 ? rounded : null
}

function toIngredientId(recipeId: number, index: number): string {
  return `spoon_${recipeId}_ing_${index + 1}`
}

function toNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toMealTypeFromPayload(payload: Record<string, unknown>): Recipe['mealType'] {
  const direct = normalizeMealType(payload.mealType)
  if (direct) return direct

  const dishTypes = Array.isArray(payload.dishTypes)
    ? payload.dishTypes.map((item) => toNonEmptyString(item)).filter(Boolean)
    : []
  const occasions = Array.isArray(payload.occasions)
    ? payload.occasions.map((item) => toNonEmptyString(item)).filter(Boolean)
    : []

  return inferMealType([
    toNonEmptyString(payload.title),
    toNonEmptyString(payload.summary),
    ...dishTypes,
    ...occasions,
  ])
}

function toInstructions(payload: Record<string, unknown>): string[] {
  const analyzed = Array.isArray(payload.analyzedInstructions)
    ? payload.analyzedInstructions
    : []

  const stepsFromAnalyzed = analyzed
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const source = item as Record<string, unknown>
      if (!Array.isArray(source.steps)) return []
      return source.steps
    })
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const source = item as Record<string, unknown>
      const text = stripHtml(toNonEmptyString(source.step))
      return text ? [truncate(text, 2000)] : []
    })

  if (stepsFromAnalyzed.length > 0) {
    return stepsFromAnalyzed.slice(0, 200)
  }

  const instructions = stripHtml(toNonEmptyString(payload.instructions))
  if (!instructions) return []

  const split = instructions
    .split(/\r?\n+|(?<=\.)\s+(?=[A-Z])/)
    .map((item) => item.replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean)
    .map((item) => truncate(item, 2000))

  return split.slice(0, 200)
}

function toIngredients(payload: Record<string, unknown>, recipeId: number): Ingredient[] {
  const source = Array.isArray(payload.extendedIngredients)
    ? payload.extendedIngredients
    : []

  return source
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const ingredient = item as Record<string, unknown>
      const rawName =
        toNonEmptyString(ingredient.originalName) ||
        toNonEmptyString(ingredient.nameClean) ||
        toNonEmptyString(ingredient.name)
      const name = truncate(rawName, 200)
      if (!name) return null

      return {
        id: toIngredientId(recipeId, index),
        name,
        qty: toBoundedQty(ingredient.amount),
        unit: truncate(toNonEmptyString(ingredient.unit), 64),
        store: '',
      } satisfies Ingredient
    })
    .filter((item): item is Ingredient => item !== null)
    .slice(0, 300)
}

function normalizeSourceUrl(payload: Record<string, unknown>): string {
  const sourceUrl = toNonEmptyString(payload.sourceUrl)
  if (sourceUrl) return truncate(sourceUrl, 500)
  const spoonacularUrl = toNonEmptyString(payload.spoonacularSourceUrl)
  return truncate(spoonacularUrl, 500)
}

function parseSearchResult(item: unknown): SpoonacularSearchResult | null {
  if (!item || typeof item !== 'object') return null
  const source = item as Record<string, unknown>
  const id = Number(source.id)
  const title = truncate(toNonEmptyString(source.title), 200)
  if (!Number.isInteger(id) || id <= 0 || !title) return null

  const sourceUrl = normalizeSourceUrl(source)
  const image = toNonEmptyString(source.image)
  const servings = toBoundedServings(source.servings)
  const mealType = toMealTypeFromPayload(source)

  return {
    id,
    title,
    image,
    servings,
    sourceUrl,
    mealType,
  }
}

function parseRecipeDetails(payload: unknown): SpoonacularRecipeImport {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Recipe response was invalid.')
  }
  const source = payload as Record<string, unknown>
  const recipeId = Number(source.id)
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    throw new Error('Recipe response did not include a valid recipe ID.')
  }

  const name = truncate(toNonEmptyString(source.title), 200)
  if (!name) {
    throw new Error('Recipe response did not include a recipe name.')
  }

  const description = truncate(stripHtml(toNonEmptyString(source.summary)), 1000)
  const ingredients = toIngredients(source, recipeId)
  const steps = toInstructions(source)
  const servings = toBoundedServings(source.servings)
  const mealType = toMealTypeFromPayload(source)
  const sourceUrl = normalizeSourceUrl(source)

  return {
    name,
    description,
    ingredients,
    steps,
    servings,
    mealType,
    sourceUrl,
  }
}

function getSpoonacularApiKey(): string | null {
  return getServerEnv('SPOONACULAR_API_KEY') || null
}

export function isSpoonacularConfigured(): boolean {
  return Boolean(getSpoonacularApiKey())
}

async function fetchSpoonacularJson(
  pathname: string,
  query?: Record<string, string | number | boolean | undefined>
): Promise<unknown> {
  const apiKey = getSpoonacularApiKey()
  if (!apiKey) {
    throw new Error('Recipe provider is not configured.')
  }

  const url = new URL(pathname, SPOONACULAR_BASE_URL)
  url.searchParams.set('apiKey', apiKey)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })

  const body = await response.text()
  let payload: unknown = {}
  if (body) {
    try {
      payload = JSON.parse(body)
    } catch {
      payload = {}
    }
  }

  if (!response.ok) {
    const providerMessage =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as Record<string, unknown>).message === 'string'
        ? (payload as Record<string, unknown>).message
        : ''
    if (response.status === 401 || response.status === 402) {
      throw new Error('Recipe provider key is invalid or quota has been exceeded.')
    }
    if (response.status === 404) {
      throw new Error('Recipe was not found in Spoonacular.')
    }
    if (providerMessage) {
      throw new Error(`Recipe provider error: ${providerMessage}`)
    }
    throw new Error(`Recipe provider request failed (${response.status}).`)
  }

  return payload
}

export async function searchSpoonacularRecipes(
  query: string,
  limit = DEFAULT_SEARCH_LIMIT
): Promise<SpoonacularSearchResult[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const safeLimit = Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(limit)))
  const payload = await fetchSpoonacularJson('/recipes/complexSearch', {
    query: trimmedQuery,
    number: safeLimit,
    addRecipeInformation: true,
    fillIngredients: false,
    instructionsRequired: true,
    sort: 'popularity',
    sortDirection: 'desc',
  })

  if (!payload || typeof payload !== 'object') return []
  const source = payload as Record<string, unknown>
  if (!Array.isArray(source.results)) return []

  return source.results
    .map((item) => parseSearchResult(item))
    .filter((item): item is SpoonacularSearchResult => item !== null)
}

export async function importSpoonacularRecipe(
  recipeId: number
): Promise<SpoonacularRecipeImport> {
  const payload = await fetchSpoonacularJson(`/recipes/${recipeId}/information`, {
    includeNutrition: false,
  })
  return parseRecipeDetails(payload)
}
