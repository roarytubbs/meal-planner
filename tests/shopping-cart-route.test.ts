import test from 'node:test'
import assert from 'node:assert/strict'
import type { GroceryStore } from '@/lib/types'
import { clearRateLimitStore } from '@/lib/server/rate-limit'
import { ShoppingCartError } from '@/lib/server/shopping-cart'
import {
  handleCartSessionRequest,
  type ShoppingCartRouteDeps,
} from '@/lib/server/shopping-cart-route'

function createStore(): GroceryStore {
  const now = new Date().toISOString()
  return {
    id: 'store_target_1',
    name: 'Target Mission',
    address: '123 Main St',
    supportsOnlineOrdering: true,
    onlineOrderingProvider: 'target',
    onlineOrderingConfig: { targetStoreId: '3342' },
    createdAt: now,
    updatedAt: now,
  }
}

function createRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/shopping/cart-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  })
}

function createDeps(overrides?: Partial<ShoppingCartRouteDeps>): ShoppingCartRouteDeps {
  return {
    getStoreById: async () => createStore(),
    createShoppingCartSession: async () => ({
      provider: 'target',
      sessionId: 'session_1',
      checkoutUrl: 'https://target.example/checkout/session_1',
      unmatchedItems: [],
    }),
    ...(overrides || {}),
  }
}

test.beforeEach(() => {
  clearRateLimitStore()
  process.env.SHOPPING_CART_RATE_LIMIT_WINDOW_MS = '60000'
  process.env.SHOPPING_CART_RATE_LIMIT_MAX_REQUESTS = '10'
})

test.afterEach(() => {
  clearRateLimitStore()
  delete process.env.SHOPPING_CART_RATE_LIMIT_WINDOW_MS
  delete process.env.SHOPPING_CART_RATE_LIMIT_MAX_REQUESTS
})

test('returns 400 for invalid cart-session payload', async () => {
  const response = await handleCartSessionRequest(createRequest({}), createDeps())
  const data = response.body as { error?: string }

  assert.equal(response.status, 400)
  assert.ok(typeof data.error === 'string' && data.error.length > 0)
})

test('returns 404 when store does not exist', async () => {
  const response = await handleCartSessionRequest(
    createRequest({
      storeId: 'missing_store',
      items: [{ name: 'milk', qty: 1, unit: 'gal' }],
    }),
    createDeps({
      getStoreById: async () => null,
    })
  )

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { error: 'Store not found.' })
})

test('returns ShoppingCartError status/code for unsupported stores', async () => {
  const response = await handleCartSessionRequest(
    createRequest({
      storeId: 'store_target_1',
      items: [{ name: 'milk', qty: 1, unit: 'gal' }],
    }),
    createDeps({
      createShoppingCartSession: async () => {
        throw new ShoppingCartError(
          'Online ordering is disabled for this store.',
          403,
          'UNSUPPORTED_STORE'
        )
      },
    })
  )

  assert.equal(response.status, 403)
  assert.deepEqual(response.body, {
    error: 'Online ordering is disabled for this store.',
    code: 'UNSUPPORTED_STORE',
  })
})

test('returns checkout session payload on success', async () => {
  const response = await handleCartSessionRequest(
    createRequest({
      storeId: 'store_target_1',
      items: [{ name: 'milk', qty: 1, unit: 'gal' }],
    }),
    createDeps({
      createShoppingCartSession: async () => ({
        provider: 'target',
        sessionId: 'session_success',
        checkoutUrl: 'https://target.example/checkout/session_success',
        unmatchedItems: [{ name: 'milk', qty: null, unit: 'gal', reason: 'No product match found.' }],
      }),
    })
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    provider: 'target',
    sessionId: 'session_success',
    checkoutUrl: 'https://target.example/checkout/session_success',
    unmatchedItems: [
      { name: 'milk', qty: null, unit: 'gal', reason: 'No product match found.' },
    ],
  })
})

test('rate limits repeated requests from same client ip', async () => {
  process.env.SHOPPING_CART_RATE_LIMIT_MAX_REQUESTS = '1'
  process.env.SHOPPING_CART_RATE_LIMIT_WINDOW_MS = '60000'

  const headers = { 'x-forwarded-for': '203.0.113.10' }
  const first = await handleCartSessionRequest(
    createRequest(
      {
        storeId: 'store_target_1',
        items: [{ name: 'milk', qty: 1, unit: 'gal' }],
      },
      headers
    ),
    createDeps()
  )

  const second = await handleCartSessionRequest(
    createRequest(
      {
        storeId: 'store_target_1',
        items: [{ name: 'milk', qty: 1, unit: 'gal' }],
      },
      headers
    ),
    createDeps()
  )

  assert.equal(first.status, 200)
  assert.equal(second.status, 429)
  const retryHeader = Number(second.headers?.['Retry-After'] || '0')
  const payload = second.body as {
    error: string
    code: string
    retryAfterMs: number
  }

  assert.ok(retryHeader >= 1)
  assert.equal(payload.error, 'Too many cart build requests. Please try again shortly.')
  assert.equal(payload.code, 'RATE_LIMITED')
  assert.ok(payload.retryAfterMs > 0)
  assert.ok(payload.retryAfterMs <= 60_000)
})
