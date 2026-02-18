import { NextResponse } from 'next/server'
import { localMigrationSchema } from '@/lib/server/schemas'
import { importLocalMigration } from '@/lib/server/planner-service'
import { normalizeErrorMessage } from '@/lib/server/http'
import type { LocalStorageMigrationPayload } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const raw = await request.json()
    const payload = localMigrationSchema.parse(raw)
    const result = await importLocalMigration(
      payload as LocalStorageMigrationPayload
    )
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error) },
      { status: 400 }
    )
  }
}
