import { NextResponse } from 'next/server'
import { mealPlanSlotUpdateSchema } from '@/lib/server/schemas'
import { normalizeErrorMessage } from '@/lib/server/http'
import { setMealPlanSlot } from '@/lib/server/planner-service'

export async function PUT(request: Request) {
  try {
    const raw = await request.json()
    const payload = mealPlanSlotUpdateSchema.parse(raw)

    const slots = await setMealPlanSlot(payload.dateKey, payload.slot, payload.selection, payload.recipeId)

    return NextResponse.json({ mealPlanSlots: slots })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
