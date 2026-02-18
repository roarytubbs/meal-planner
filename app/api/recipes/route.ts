import { NextResponse } from 'next/server'
import { recipeSchema } from '@/lib/server/schemas'
import { createRecipe } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const raw = await request.json()
    const recipe = recipeSchema.parse(raw)
    const created = await createRecipe(recipe)
    return NextResponse.json(created)
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
