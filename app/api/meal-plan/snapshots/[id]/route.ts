import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  activateMealPlanSnapshot,
  updateMealPlanSnapshot,
  duplicateMealPlanSnapshot,
  deleteMealPlanSnapshot,
} from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('activate'),
  }),
  z.object({
    action: z.literal('duplicate'),
    label: z.string().trim().max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    markActive: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('update'),
    label: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    markActive: z.boolean().optional(),
  }),
])

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const raw = await request.json().catch(() => ({}))
    const payload = patchSchema.parse(raw)
    if (payload.action === 'activate') {
      const snapshot = await activateMealPlanSnapshot(id)
      return NextResponse.json(snapshot)
    }
    if (payload.action === 'update') {
      const snapshot = await updateMealPlanSnapshot(id, {
        label: payload.label,
        description: payload.description,
        markActive: payload.markActive,
      })
      return NextResponse.json(snapshot)
    }

    const snapshot = await duplicateMealPlanSnapshot(id, {
      label: payload.label,
      description: payload.description,
      markActive: payload.markActive,
    })
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
