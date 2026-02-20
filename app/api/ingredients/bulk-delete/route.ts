import { NextResponse } from 'next/server'
import { ingredientBulkDeleteSchema } from '@/lib/server/schemas'
import { normalizeErrorMessage } from '@/lib/server/http'
import { bulkDeleteIngredientEntries } from '@/lib/server/planner-service'

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}))
    const payload = ingredientBulkDeleteSchema.parse(raw)
    const deletedCount = await bulkDeleteIngredientEntries(payload.ingredientIds)
    return NextResponse.json({ deletedCount })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
