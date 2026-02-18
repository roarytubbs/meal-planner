import { NextResponse } from 'next/server'
import { ingredientEntrySchema } from '@/lib/server/schemas'
import {
  deleteIngredientEntry,
  updateIngredientEntry,
} from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const raw = await request.json()
    const payload = ingredientEntrySchema.parse(raw)
    const entry = await updateIngredientEntry(id, payload)
    return NextResponse.json(entry)
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
    await deleteIngredientEntry(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
