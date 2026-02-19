import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit, clearRateLimitStore } from '@/lib/server/rate-limit'

test.beforeEach(() => {
  clearRateLimitStore()
})

test('allows up to max requests in window and then blocks', () => {
  const key = 'cart:user-1'
  const first = checkRateLimit({ key, maxRequests: 2, windowMs: 10_000, now: 1_000 })
  const second = checkRateLimit({ key, maxRequests: 2, windowMs: 10_000, now: 1_001 })
  const third = checkRateLimit({ key, maxRequests: 2, windowMs: 10_000, now: 1_002 })

  assert.equal(first.allowed, true)
  assert.equal(first.remaining, 1)
  assert.equal(second.allowed, true)
  assert.equal(second.remaining, 0)
  assert.equal(third.allowed, false)
  assert.equal(third.remaining, 0)
  assert.ok(third.retryAfterMs > 0)
})

test('resets after window expiry', () => {
  const key = 'cart:user-2'
  checkRateLimit({ key, maxRequests: 1, windowMs: 2_000, now: 2_000 })
  const blocked = checkRateLimit({ key, maxRequests: 1, windowMs: 2_000, now: 2_100 })
  const reset = checkRateLimit({ key, maxRequests: 1, windowMs: 2_000, now: 4_001 })

  assert.equal(blocked.allowed, false)
  assert.equal(reset.allowed, true)
  assert.equal(reset.remaining, 0)
})
