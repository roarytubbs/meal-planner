import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  activateMealPlanSnapshot,
  deleteMealPlanSnapshot,
} from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

const patchSchema = z.object({
  action: z.literal('activate'),
})

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const raw = await request.json().catch(() => ({}))
    const payload = patchSchema.parse(raw)
    if (payload.action !== 'activate') {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
    }
    const snapshot = await activateMealPlanSnapshot(id)
    return NextResponse.json(snapshot)
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const result = await deleteMealPlanSnapshot(id)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
