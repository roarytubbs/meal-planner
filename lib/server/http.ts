import { NextResponse } from 'next/server'
import { normalizeErrorMessage } from '@/lib/server/error-message'

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export { normalizeErrorMessage }
