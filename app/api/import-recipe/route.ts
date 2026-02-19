import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  fetchRecipeHtml,
  normalizeRecipeImportUrl,
  parseRecipeFromHtml,
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

    const html = await fetchRecipeHtml(normalizedUrl)
    const recipe = parseRecipeFromHtml(html)
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
