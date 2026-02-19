import { NextResponse } from 'next/server'
import { clearMealPlanSchema } from '@/lib/server/schemas'
import { clearMealPlan } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}))
    const payload = clearMealPlanSchema.parse(raw)

    const slots = await clearMealPlan({
      startDate: payload.startDate,
      days: payload.days,
    })

    return NextResponse.json({ mealPlanSlots: slots })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
