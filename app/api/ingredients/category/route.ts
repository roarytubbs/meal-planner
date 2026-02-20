import { NextResponse } from 'next/server'
import { ingredientCategoryBulkSchema } from '@/lib/server/schemas'
import { normalizeErrorMessage } from '@/lib/server/http'
import { bulkSetIngredientEntryCategory } from '@/lib/server/planner-service'

export async function PUT(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}))
    const payload = ingredientCategoryBulkSchema.parse(raw)
    const ingredientEntries = await bulkSetIngredientEntryCategory(
      payload.ingredientIds,
      payload.category
    )
    return NextResponse.json({ ingredientEntries })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
