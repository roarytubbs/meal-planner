import { ZodError } from 'zod'

export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    const first = error.issues[0]
    return first?.message || 'Invalid request.'
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Unexpected error.'
}
