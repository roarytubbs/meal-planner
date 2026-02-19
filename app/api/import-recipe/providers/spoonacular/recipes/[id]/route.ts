import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  importSpoonacularRecipe,
  isSpoonacularConfigured,
} from '@/lib/server/spoonacular'

const paramsSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/),
})

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!isSpoonacularConfigured()) {
      return NextResponse.json(
        {
          error: 'Recipe import is not configured on this server.',
        },
        { status: 503 }
      )
    }

    const { id } = await context.params
    const parsedParams = paramsSchema.safeParse({ id })
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Recipe ID must be a positive integer.' },
        { status: 400 }
      )
    }

    const recipeId = Number.parseInt(parsedParams.data.id, 10)
    const recipe = await importSpoonacularRecipe(recipeId)
    return NextResponse.json(recipe)
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to import recipe from provider.'
    const status = message.toLowerCase().includes('not found') ? 404 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
