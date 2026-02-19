interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  key: string
  maxRequests: number
  windowMs: number
  now?: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

function safeNow(input?: number): number {
  return typeof input === 'number' && Number.isFinite(input) ? input : Date.now()
}

function cleanupExpired(now: number): void {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key)
    }
  }
}

export function checkRateLimit(options: RateLimitOptions): {
  allowed: boolean
  remaining: number
  retryAfterMs: number
} {
  const maxRequests = Math.max(1, Math.floor(options.maxRequests))
  const windowMs = Math.max(1_000, Math.floor(options.windowMs))
  const now = safeNow(options.now)
  const key = options.key.trim()

  if (!key) {
    return { allowed: true, remaining: maxRequests, retryAfterMs: 0 }
  }

  cleanupExpired(now)
  const existing = rateLimitStore.get(key)

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    })
    return {
      allowed: true,
      remaining: maxRequests - 1,
      retryAfterMs: 0,
    }
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    }
  }

  existing.count += 1
  rateLimitStore.set(key, existing)
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - existing.count),
    retryAfterMs: 0,
  }
}

export function clearRateLimitStore(): void {
  rateLimitStore.clear()
}
