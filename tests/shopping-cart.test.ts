import test from 'node:test'
import assert from 'node:assert/strict'
import type { GroceryStore } from '@/lib/types'
import {
  ShoppingCartError,
  clearTargetCartSessionCache,
  createShoppingCartSession,
} from '@/lib/server/shopping-cart'

const realFetch = globalThis.fetch

function buildStore(overrides?: Partial<GroceryStore>): GroceryStore {
  return {
    id: 'store_target_1',
    name: 'Target Mission',
    address: '123 Main St',
    supportsOnlineOrdering: true,
    onlineOrderingProvider: 'target',
    onlineOrderingConfig: { targetStoreId: '3342' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(overrides || {}),
  }
}

function setTargetEnv(values?: {
  endpoint?: string
  apiKey?: string
  timeoutMs?: string
  cacheTtlMs?: string
}) {
  process.env.TARGET_CART_SESSION_ENDPOINT = values?.endpoint ?? 'https://provider.local/cart'
  if (values?.apiKey === undefined) delete process.env.TARGET_CART_SESSION_API_KEY
  else process.env.TARGET_CART_SESSION_API_KEY = values.apiKey
  process.env.TARGET_CART_TIMEOUT_MS = values?.timeoutMs ?? '10000'
  process.env.TARGET_CART_CACHE_TTL_MS = values?.cacheTtlMs ?? '60000'
}

test.beforeEach(() => {
  clearTargetCartSessionCache()
  setTargetEnv()
})

test.afterEach(() => {
  globalThis.fetch = realFetch
  clearTargetCartSessionCache()
  delete process.env.TARGET_CART_SESSION_ENDPOINT
  delete process.env.TARGET_CART_SESSION_API_KEY
  delete process.env.TARGET_CART_TIMEOUT_MS
  delete process.env.TARGET_CART_CACHE_TTL_MS
})

test('throws unsupported-store error when online ordering disabled', async () => {
  await assert.rejects(
    createShoppingCartSession({
      store: buildStore({ supportsOnlineOrdering: false }),
      items: [{ name: 'milk', qty: 1, unit: 'gal' }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShoppingCartError)
      assert.equal(error.code, 'UNSUPPORTED_STORE')
      assert.equal(error.status, 403)
      return true
    }
  )
})

test('throws missing config error when target store id is absent', async () => {
  await assert.rejects(
    createShoppingCartSession({
      store: buildStore({ onlineOrderingConfig: undefined }),
      items: [{ name: 'milk', qty: 1, unit: 'gal' }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShoppingCartError)
      assert.equal(error.code, 'MISSING_PROVIDER_CONFIG')
      assert.equal(error.status, 400)
      return true
    }
  )
})

test('creates a target cart session and normalizes unmatched item payload', async () => {
  let fetchCalls = 0
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1
    const rawBody = typeof init?.body === 'string' ? init.body : ''
    const payload = JSON.parse(rawBody) as {
      store: { targetStoreId: string }
      items: Array<{ name: string; qty: number | null; unit: string }>
    }

    assert.equal(payload.store.targetStoreId, '3342')
    assert.deepEqual(payload.items, [
      { name: 'eggs', qty: 2, unit: '' },
      { name: 'milk', qty: 1.5, unit: 'gal' },
    ])

    return new Response(
      JSON.stringify({
        sessionId: 'session_123',
        checkoutUrl: 'https://target.example/checkout/session_123',
        unmatchedItems: [{ name: 'eggs' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }) as typeof fetch

  const result = await createShoppingCartSession({
    store: buildStore(),
    items: [
      { name: 'milk', qty: 1, unit: 'gal' },
      { name: 'eggs', qty: 2, unit: '' },
      { name: 'milk', qty: 0.5, unit: 'gal' },
    ],
  })

  assert.equal(fetchCalls, 1)
  assert.equal(result.provider, 'target')
  assert.equal(result.sessionId, 'session_123')
  assert.equal(result.checkoutUrl, 'https://target.example/checkout/session_123')
  assert.deepEqual(result.unmatchedItems, [
    { name: 'eggs', qty: null, unit: '', reason: 'No product match found.' },
  ])
})

test('returns cached result for duplicate target cart requests within ttl', async () => {
  let fetchCalls = 0
  process.env.TARGET_CART_CACHE_TTL_MS = '120000'

  globalThis.fetch = (async () => {
    fetchCalls += 1
    return new Response(
      JSON.stringify({
        sessionId: 'session_cache',
        checkoutUrl: 'https://target.example/checkout/session_cache',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }) as typeof fetch

  const store = buildStore()
  const first = await createShoppingCartSession({
    store,
    items: [
      { name: 'milk', qty: 1, unit: 'gal' },
      { name: 'eggs', qty: 2, unit: '' },
    ],
  })
  const second = await createShoppingCartSession({
    store,
    items: [
      { name: 'eggs', qty: 2, unit: '' },
      { name: 'milk', qty: 1, unit: 'gal' },
    ],
  })

  assert.equal(fetchCalls, 1)
  assert.equal(first.sessionId, 'session_cache')
  assert.equal(second.sessionId, 'session_cache')
})

test('maps provider error payload into ShoppingCartError', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ error: 'Provider unavailable for this store.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch

  await assert.rejects(
    createShoppingCartSession({
      store: buildStore(),
      items: [{ name: 'milk', qty: 1, unit: 'gal' }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShoppingCartError)
      assert.equal(error.code, 'PROVIDER_ERROR')
      assert.equal(error.status, 502)
      assert.equal(error.message, 'Provider unavailable for this store.')
      return true
    }
  )
})
