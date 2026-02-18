import { NextResponse } from 'next/server'
import { groceryStoreSchema } from '@/lib/server/schemas'
import { createStore } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function POST(request: Request) {
  try {
    const raw = await request.json()
    const payload = groceryStoreSchema.parse(raw)
    const store = await createStore(payload)
    return NextResponse.json(store)
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
