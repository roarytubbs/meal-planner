import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  fetchRecipeHtml,
  fetchRecipeHtmlFallback,
  hasMeaningfulRecipeData,
  isLikelyBlockedImportContent,
  normalizeRecipeImportUrl,
  parseRecipeFromHtml,
  parseRecipeFromText,
} from '@/lib/recipe-import'

const importRequestSchema = z.object({
  url: z.string().trim().min(1).max(2000),
})

export async function POST(request: Request) {
  try {
    const raw = await request.json()
    const parsed = importRequestSchema.safeParse(raw)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    const normalizedUrl = normalizeRecipeImportUrl(parsed.data.url)
    if (!normalizedUrl) {
      return NextResponse.json(
        { error: 'Please enter a valid public http(s) URL.' },
        { status: 400 }
      )
    }

    let recipe = null

    try {
      const html = await fetchRecipeHtml(normalizedUrl)
      if (!isLikelyBlockedImportContent(html)) {
        const parsedRecipe = parseRecipeFromHtml(html)
        if (hasMeaningfulRecipeData(parsedRecipe)) {
          recipe = parsedRecipe
        }
      }
    } catch {
      // Fallback parser below handles primary fetch failures.
    }

    let fallbackHtml: string | null = null

    if (!recipe) {
      fallbackHtml = await fetchRecipeHtmlFallback(normalizedUrl)
      if (fallbackHtml) {
        const fallbackRecipeFromText = parseRecipeFromText(fallbackHtml)
        if (hasMeaningfulRecipeData(fallbackRecipeFromText)) {
          recipe = fallbackRecipeFromText
        }
      }
    }

    if (!recipe) {
      if (fallbackHtml && !isLikelyBlockedImportContent(fallbackHtml)) {
        const fallbackRecipe = parseRecipeFromHtml(fallbackHtml)
        if (hasMeaningfulRecipeData(fallbackRecipe)) {
          recipe = fallbackRecipe
        }
      }
    }

    if (!recipe) {
      return NextResponse.json(
        { error: 'Could not extract recipe data from that URL.' },
        { status: 422 }
      )
    }

    return NextResponse.json({
      ...recipe,
      sourceUrl: normalizedUrl,
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to import recipe' },
      { status: 500 }
    )
  }
}
