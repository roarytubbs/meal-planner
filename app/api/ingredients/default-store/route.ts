import { NextResponse } from 'next/server'
import { ingredientDefaultStoreBulkSchema } from '@/lib/server/schemas'
import { normalizeErrorMessage } from '@/lib/server/http'
import { bulkSetIngredientEntryDefaultStore } from '@/lib/server/planner-service'

export async function PUT(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}))
    const payload = ingredientDefaultStoreBulkSchema.parse(raw)
    const ingredientEntries = await bulkSetIngredientEntryDefaultStore(
      payload.ingredientIds,
      payload.defaultStoreId
    )
    return NextResponse.json({ ingredientEntries })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
