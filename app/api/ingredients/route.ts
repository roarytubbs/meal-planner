import { NextResponse } from 'next/server'
import { ingredientEntrySchema } from '@/lib/server/schemas'
import { createIngredientEntry } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const raw = await request.json()
    const payload = ingredientEntrySchema.parse(raw)
    const entry = await createIngredientEntry(payload)
    return NextResponse.json(entry)
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
