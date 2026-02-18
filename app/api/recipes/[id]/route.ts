import { NextResponse } from 'next/server'
import { recipeSchema } from '@/lib/server/schemas'
import { deleteRecipe, updateRecipe } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const raw = await request.json()
    const recipe = recipeSchema.parse(raw)
    const updated = await updateRecipe(id, recipe)
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    await deleteRecipe(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
