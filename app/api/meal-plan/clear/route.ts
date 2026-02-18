import { NextResponse } from 'next/server'
import { clearMealPlan } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function POST() {
  try {
    const mealPlan = await clearMealPlan()
    return NextResponse.json({ mealPlan })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 500 }
    )
  }
}
