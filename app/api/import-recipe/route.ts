import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Fetch the URL
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MealPlannerBot/1.0)',
      },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch recipe URL' },
        { status: 502 }
      )
    }

    const html = await res.text()

    // Try to extract JSON-LD recipe data
    const recipe = extractJsonLdRecipe(html) || extractBasicRecipe(html, url)

    return NextResponse.json(recipe)
  } catch {
    return NextResponse.json(
      { error: 'Failed to import recipe' },
      { status: 500 }
    )
  }
}

interface ScrapedRecipe {
  name: string
  description: string
  ingredients: Array<{
    id: string
    name: string
    qty: number | null
    unit: string
    store: string
  }>
  steps: string[]
  servings: number
}

function generateId() {
  return `ing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function extractJsonLdRecipe(html: string): ScrapedRecipe | null {
  // Look for JSON-LD script tags
  const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])

      // Handle both single object and array
      const items = Array.isArray(data) ? data : [data]

      for (const item of items) {
        // Check @graph array
        const candidates = item['@graph'] ? item['@graph'] : [item]

        for (const candidate of candidates) {
          if (
            candidate['@type'] === 'Recipe' ||
            (Array.isArray(candidate['@type']) &&
              candidate['@type'].includes('Recipe'))
          ) {
            return parseJsonLdRecipe(candidate)
          }
        }
      }
    } catch {
      // Invalid JSON, try next
      continue
    }
  }

  return null
}

function parseJsonLdRecipe(data: Record<string, unknown>): ScrapedRecipe {
  const name = (data.name as string) || ''
  const description = (data.description as string) || ''

  // Parse ingredients
  const rawIngredients = (data.recipeIngredient as string[]) || []
  const ingredients = rawIngredients.map((line: string) => ({
    id: generateId(),
    name: line.trim(),
    qty: null,
    unit: '',
    store: '',
  }))

  // Parse steps
  let steps: string[] = []
  const rawInstructions = data.recipeInstructions
  if (Array.isArray(rawInstructions)) {
    steps = rawInstructions.map((step: unknown) => {
      if (typeof step === 'string') return step
      if (typeof step === 'object' && step !== null) {
        return (step as Record<string, string>).text || (step as Record<string, string>).name || ''
      }
      return ''
    }).filter(Boolean)
  } else if (typeof rawInstructions === 'string') {
    steps = rawInstructions.split('\n').filter(Boolean)
  }

  // Parse servings
  let servings = 4
  const rawYield = data.recipeYield
  if (typeof rawYield === 'number') {
    servings = rawYield
  } else if (typeof rawYield === 'string') {
    const num = parseInt(rawYield, 10)
    if (!isNaN(num)) servings = num
  } else if (Array.isArray(rawYield) && rawYield.length > 0) {
    const num = parseInt(rawYield[0], 10)
    if (!isNaN(num)) servings = num
  }

  return { name, description, ingredients, steps, servings }
}

function extractBasicRecipe(html: string, _url: string): ScrapedRecipe {
  // Basic fallback: extract title from <title> tag
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
  const name = titleMatch
    ? titleMatch[1].replace(/\s*[-|].*$/, '').trim()
    : ''

  // Extract meta description
  const descMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["'][^>]*>/i
  )
  const description = descMatch ? descMatch[1].trim() : ''

  return {
    name,
    description,
    ingredients: [],
    steps: [],
    servings: 4,
  }
}
