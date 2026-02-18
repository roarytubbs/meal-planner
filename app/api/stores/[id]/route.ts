import { NextResponse } from 'next/server'
import { groceryStoreSchema } from '@/lib/server/schemas'
import { deleteStore, updateStore } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const raw = await request.json()
    const payload = groceryStoreSchema.parse(raw)
    const store = await updateStore(id, payload)
    return NextResponse.json(store)
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
    await deleteStore(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
