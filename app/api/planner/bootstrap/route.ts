import { NextResponse } from 'next/server'
import { getPlannerBootstrap } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'

export async function GET() {
  try {
    const payload = await getPlannerBootstrap()
    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 500 }
    )
  }
}
