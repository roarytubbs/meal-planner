import { parseIngredients } from '@/lib/ingredient-parser'
import type { Ingredient, Recipe } from '@/lib/types'

export interface ScrapedRecipe {
  name: string
  description: string
  ingredients: Ingredient[]
  steps: string[]
  servings: number
  mealType: Recipe['mealType']
}

const RECIPE_HEADING_PATTERN =
  /^(recipe|ingredients?|instructions?|directions?|method|preparation|steps?)[:\s-]*$/i
const INGREDIENTS_HEADING_PATTERN = /^ingredients?[:\s-]*$/i
const STEPS_HEADING_PATTERN =
  /^(instructions?|directions?|method|preparation|steps?)[:\s-]*$/i
const STOP_SECTION_PATTERN =
  /^(nutrition|reviews?|notes?|tips?|video|faq|author|related|more recipes|print)[:\s-]*$/i

function generateIngredientId() {
  return `ing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
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

function normalizeText(value: string): string {
  return stripHtml(value).replace(/\s+/g, ' ').trim()
}

function normalizeLines(lines: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const cleaned = normalizeText(line)
    if (!cleaned) continue
    if (RECIPE_HEADING_PATTERN.test(cleaned) || STOP_SECTION_PATTERN.test(cleaned)) continue
    if (seen.has(cleaned)) continue
    seen.add(cleaned)
    result.push(cleaned)
  }

  return result
}

function toIngredientRows(lines: string[]): Ingredient[] {
  if (lines.length === 0) return []
  const parsed = parseIngredients(lines.join('\n'))
  if (parsed.length > 0) {
    return parsed.map((item) => ({
      id: generateIngredientId(),
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      store: item.store,
    }))
  }

  return lines.map((line) => ({
    id: generateIngredientId(),
    name: line,
    qty: null,
    unit: '',
    store: '',
  }))
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(asString).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    if (typeof source.text === 'string') return source.text
    if (typeof source.name === 'string') return source.name
  }
  return ''
}

function parseServings(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.max(1, Math.round(raw))
  }
  const text = asString(raw)
  const match = text.match(/(\d{1,3})(?:\s*-\s*\d{1,3})?/)
  if (!match) return 4
  const value = Number.parseInt(match[1], 10)
  if (!Number.isFinite(value) || value <= 0) return 4
  return Math.max(1, Math.min(100, value))
}

function inferMealType(parts: string[]): Recipe['mealType'] {
  const content = parts.join(' ').toLowerCase()
  if (!content) return ''

  if (/\b(breakfast|brunch|pancake|oatmeal|frittata|granola)\b/.test(content)) {
    return 'breakfast'
  }
  if (/\b(lunch|sandwich|wrap|bento|grain bowl)\b/.test(content)) {
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

function extractInstructionTexts(value: unknown): string[] {
  if (!value) return []

  if (typeof value === 'string') {
    const chunks = value
      .split(/\r?\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
    if (chunks.length > 0) return chunks
    return normalizeText(value) ? [normalizeText(value)] : []
  }

  if (Array.isArray(value)) {
    return normalizeLines(value.flatMap((item) => extractInstructionTexts(item)))
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const nested = [
      ...extractInstructionTexts(source.text),
      ...extractInstructionTexts(source.name),
      ...extractInstructionTexts(source.itemListElement),
      ...extractInstructionTexts(source.steps),
      ...extractInstructionTexts(source.recipeInstructions),
    ]
    return normalizeLines(nested)
  }

  return []
}

function extractMetaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta[^>]*(?:name|property|itemprop)=["']${escaped}["'][^>]*content=["']([\\s\\S]*?)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]*content=["']([\\s\\S]*?)["'][^>]*(?:name|property|itemprop)=["']${escaped}["'][^>]*>`,
      'i'
    ),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      return normalizeText(match[1])
    }
  }
  return ''
}

function extractTitle(html: string): string {
  const ogTitle = extractMetaContent(html, 'og:title')
  if (ogTitle) return ogTitle
  const twitterTitle = extractMetaContent(html, 'twitter:title')
  if (twitterTitle) return twitterTitle

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!titleMatch) return ''
  return normalizeText(titleMatch[1]).replace(/\s*[-|].*$/, '').trim()
}

function htmlToLines(html: string): string[] {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
  const withLineBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|tr|ul|ol)>/gi, '\n')
  const textOnly = withLineBreaks.replace(/<[^>]+>/g, ' ')

  return textOnly
    .split('\n')
    .map((line) => normalizeText(line))
    .filter(Boolean)
}

function isLikelyStepLine(line: string): boolean {
  if (!line) return false
  if (/^\d+[.)]\s+/.test(line)) return true
  if (line.length >= 24 && /\s/.test(line)) return true
  return false
}

function extractSectionLines(
  lines: string[],
  startPattern: RegExp,
  stopPattern: RegExp,
  options?: { maxLines?: number; stepsOnly?: boolean }
): string[] {
  const startIndex = lines.findIndex((line) => startPattern.test(line))
  if (startIndex === -1) return []

  const maxLines = options?.maxLines ?? 80
  const collected: string[] = []
  for (let i = startIndex + 1; i < lines.length && collected.length < maxLines; i += 1) {
    const line = lines[i]
    if (startPattern.test(line)) continue
    if (stopPattern.test(line) || INGREDIENTS_HEADING_PATTERN.test(line) || STEPS_HEADING_PATTERN.test(line)) {
      break
    }
    if (!line) continue
    if (options?.stepsOnly && !isLikelyStepLine(line)) continue
    collected.push(line.replace(/^\d+[.)]\s+/, '').trim())
  }
  return normalizeLines(collected)
}

function normalizeJsonLdBlock(raw: string): string {
  return raw
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .replace(/^\s*\/\*<!\[CDATA\[\*\/\s*/i, '')
    .replace(/\s*\/\*\]\]>\*\/\s*$/i, '')
    .replace(/;\s*$/, '')
    .trim()
}

function parseJsonLdBlock(raw: string): unknown[] {
  const normalized = normalizeJsonLdBlock(raw)
  if (!normalized) return []
  const attempts = [normalized, decodeHtmlEntities(normalized)]
  for (const attempt of attempts) {
    try {
      return [JSON.parse(attempt)]
    } catch {
      continue
    }
  }
  return []
}

function isRecipeNode(value: Record<string, unknown>): boolean {
  const typeValue = value['@type']
  if (typeof typeValue === 'string') return typeValue.toLowerCase() === 'recipe'
  if (Array.isArray(typeValue)) {
    return typeValue.some(
      (item) => typeof item === 'string' && item.toLowerCase() === 'recipe'
    )
  }
  return false
}

function collectRecipeNodes(node: unknown, sink: Array<Record<string, unknown>>, depth = 0) {
  if (depth > 12 || !node) return
  if (Array.isArray(node)) {
    for (const item of node) {
      collectRecipeNodes(item, sink, depth + 1)
    }
    return
  }
  if (typeof node !== 'object') return

  const source = node as Record<string, unknown>
  if (isRecipeNode(source)) {
    sink.push(source)
  }

  const nestedKeys = [
    '@graph',
    'graph',
    'mainEntity',
    'itemListElement',
    'subjectOf',
    'hasPart',
  ] as const

  for (const key of nestedKeys) {
    if (source[key]) {
      collectRecipeNodes(source[key], sink, depth + 1)
    }
  }
}

function parseRecipeNode(node: Record<string, unknown>): ScrapedRecipe {
  const ingredientValues = node.recipeIngredient ?? node.ingredients ?? []
  const ingredientLines = normalizeLines(
    Array.isArray(ingredientValues)
      ? ingredientValues.map((value) => asString(value))
      : [asString(ingredientValues)]
  )
  const ingredients = toIngredientRows(ingredientLines)
  const steps = extractInstructionTexts(node.recipeInstructions ?? node.instructions ?? node.steps)
  const name = normalizeText(asString(node.name))
  const description = normalizeText(asString(node.description))
  const servings = parseServings(node.recipeYield ?? node.yield ?? node.servings)
  const mealType = inferMealType([
    asString(node.recipeCategory),
    asString(node.keywords),
    name,
    description,
  ])

  return {
    name,
    description,
    ingredients,
    steps,
    servings,
    mealType,
  }
}

function scoreRecipe(recipe: ScrapedRecipe): number {
  let score = 0
  if (recipe.name) score += 3
  if (recipe.description) score += 1
  score += recipe.ingredients.length * 2
  score += recipe.steps.length * 2
  return score
}

function extractJsonLdRecipe(html: string): ScrapedRecipe | null {
  const jsonLdPattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  const candidates: ScrapedRecipe[] = []

  while ((match = jsonLdPattern.exec(html)) !== null) {
    const blocks = parseJsonLdBlock(match[1])
    for (const block of blocks) {
      const recipeNodes: Array<Record<string, unknown>> = []
      collectRecipeNodes(block, recipeNodes)
      for (const node of recipeNodes) {
        candidates.push(parseRecipeNode(node))
      }
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => scoreRecipe(b) - scoreRecipe(a))
  return candidates[0]
}

function extractBasicRecipe(html: string): ScrapedRecipe {
  const lines = htmlToLines(html)
  const name = extractTitle(html)
  const description =
    extractMetaContent(html, 'description') ||
    extractMetaContent(html, 'og:description') ||
    extractMetaContent(html, 'twitter:description')

  const ingredients = toIngredientRows(
    extractSectionLines(lines, INGREDIENTS_HEADING_PATTERN, STEPS_HEADING_PATTERN, {
      maxLines: 80,
    })
  )
  const steps = extractSectionLines(lines, STEPS_HEADING_PATTERN, STOP_SECTION_PATTERN, {
    maxLines: 80,
    stepsOnly: true,
  })
  const servings = parseServings(extractMetaContent(html, 'recipeYield'))
  const mealType = inferMealType([name, description])

  return {
    name,
    description,
    ingredients,
    steps,
    servings,
    mealType,
  }
}

export function parseRecipeFromHtml(html: string): ScrapedRecipe {
  const jsonLdRecipe = extractJsonLdRecipe(html)
  const fallbackRecipe = extractBasicRecipe(html)

  const name = jsonLdRecipe?.name || fallbackRecipe.name
  const description = jsonLdRecipe?.description || fallbackRecipe.description
  const ingredients =
    jsonLdRecipe && jsonLdRecipe.ingredients.length > 0
      ? jsonLdRecipe.ingredients
      : fallbackRecipe.ingredients
  const steps =
    jsonLdRecipe && jsonLdRecipe.steps.length > 0
      ? jsonLdRecipe.steps
      : fallbackRecipe.steps
  const servings = jsonLdRecipe?.servings || fallbackRecipe.servings || 4
  const mealType = jsonLdRecipe?.mealType || fallbackRecipe.mealType

  return {
    name,
    description,
    ingredients,
    steps,
    servings,
    mealType,
  }
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.local') ||
    normalized === '0.0.0.0'
  ) {
    return true
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    const parts = normalized.split('.').map((part) => Number.parseInt(part, 10))
    if (parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) return true
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    return false
  }

  if (normalized === '::1') return true
  if (normalized.startsWith('fe80:')) return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true

  return false
}

export function normalizeRecipeImportUrl(input: string): string | null {
  const raw = String(input || '').trim()
  if (!raw) return null
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (isPrivateHostname(parsed.hostname)) return null
  return parsed.toString()
}

export async function fetchRecipeHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (compatible; MealPlannerBot/1.0; +https://example.com/bot)',
    },
    signal: AbortSignal.timeout(15000),
  })

  const html = await response.text()
  if (!html || !html.trim()) {
    throw new Error('Recipe page returned empty content.')
  }
  return html
}
