import { NextResponse } from 'next/server'
import { snapshotCreateSchema } from '@/lib/server/schemas'
import { createMealPlanSnapshot } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}))
    const payload = snapshotCreateSchema.parse(raw)
    const snapshot = await createMealPlanSnapshot({
      label: payload.label,
      description: payload.description,
      startDate: payload.startDate,
      days: payload.days,
    })
    if (!snapshot) {
      return NextResponse.json({ error: 'No meals to snapshot.' }, { status: 400 })
    }
    return NextResponse.json(snapshot)
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
