import { NextResponse } from 'next/server'
import { deleteMealPlanSnapshot } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    await deleteMealPlanSnapshot(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
