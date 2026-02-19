import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  isSpoonacularConfigured,
  searchSpoonacularRecipes,
} from '@/lib/server/spoonacular'

const searchParamsSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z
    .string()
    .trim()
    .regex(/^\d{1,2}$/)
    .optional(),
})

export async function GET(request: Request) {
  try {
    if (!isSpoonacularConfigured()) {
      return NextResponse.json(
        {
          error:
            'Spoonacular import is not configured. Set SPOONACULAR_API_KEY in your server environment.',
        },
        { status: 503 }
      )
    }

    const url = new URL(request.url)
    const parsed = searchParamsSchema.safeParse({
      query: url.searchParams.get('query') || '',
      limit: url.searchParams.get('limit') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please provide a valid search query.' },
        { status: 400 }
      )
    }

    const limit = parsed.data.limit ? Number.parseInt(parsed.data.limit, 10) : 12
    const results = await searchSpoonacularRecipes(parsed.data.query, limit)

    return NextResponse.json({
      provider: 'spoonacular',
      results,
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to search recipe provider.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
