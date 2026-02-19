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
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  diet: z.string().trim().max(60).optional(),
  cuisine: z.string().trim().max(80).optional(),
  maxReadyTime: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/)
    .optional(),
  sort: z.enum(['popularity', 'healthiness', 'time', 'random']).optional(),
  page: z
    .string()
    .trim()
    .regex(/^[1-9]\d{0,3}$/)
    .optional(),
})

export async function GET(request: Request) {
  try {
    if (!isSpoonacularConfigured()) {
      return NextResponse.json(
        {
          error: 'Recipe search is not configured on this server.',
        },
        { status: 503 }
      )
    }

    const url = new URL(request.url)
    const parsed = searchParamsSchema.safeParse({
      query: url.searchParams.get('query') || '',
      limit: url.searchParams.get('limit') || undefined,
      mealType: url.searchParams.get('mealType') || undefined,
      diet: url.searchParams.get('diet') || undefined,
      cuisine: url.searchParams.get('cuisine') || undefined,
      maxReadyTime: url.searchParams.get('maxReadyTime') || undefined,
      sort: url.searchParams.get('sort') || undefined,
      page: url.searchParams.get('page') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please provide a valid search query.' },
        { status: 400 }
      )
    }

    const page = parsed.data.page ? Number.parseInt(parsed.data.page, 10) : 1
    const pageSize = parsed.data.limit ? Number.parseInt(parsed.data.limit, 10) : 12
    const payload = await searchSpoonacularRecipes(parsed.data.query, {
      page,
      pageSize,
      filters: {
        mealType: parsed.data.mealType,
        diet: parsed.data.diet,
        cuisine: parsed.data.cuisine,
        maxReadyTime: parsed.data.maxReadyTime
          ? Number.parseInt(parsed.data.maxReadyTime, 10)
          : undefined,
        sort: parsed.data.sort,
      },
    })

    return NextResponse.json(payload)
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to search recipes.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
