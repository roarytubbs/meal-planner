import { NextResponse } from 'next/server'
import { mealPlanSlotsReplaceSchema } from '@/lib/server/schemas'
import { normalizeErrorMessage } from '@/lib/server/http'
import { replaceMealPlanSlots } from '@/lib/server/planner-service'

export async function PUT(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}))
    const payload = mealPlanSlotsReplaceSchema.parse(raw)
    const mealPlanSlots = await replaceMealPlanSlots(payload.slots)
    return NextResponse.json({ mealPlanSlots })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
