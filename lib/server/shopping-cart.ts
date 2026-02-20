import { z } from 'zod'
import type { GroceryStore, OnlineOrderProvider } from '@/lib/types'
import { getServerEnv } from '@/lib/server/env'

export interface ShoppingCartSessionItem {
  name: string
  qty: number | null
  unit: string
}

export interface ShoppingCartSessionUnmatchedItem {
  name: string
  qty: number | null
  unit: string
  reason: string
}

export interface ShoppingCartSessionResult {
  provider: OnlineOrderProvider
  sessionId: string
  checkoutUrl: string
  unmatchedItems: ShoppingCartSessionUnmatchedItem[]
}

export class ShoppingCartError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'ShoppingCartError'
    this.status = status
    this.code = code
  }
}

const targetConnectorResponseSchema = z.object({
  sessionId: z.string().trim().min(1),
  checkoutUrl: z.string().trim().url(),
  unmatchedItems: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        qty: z.number().positive().finite().nullable().optional(),
        unit: z.string().trim().max(64).optional(),
        reason: z.string().trim().max(200).optional(),
      })
    )
    .optional(),
})

interface TargetCartCacheEntry {
  expiresAt: number
  value: ShoppingCartSessionResult
}

const targetCartSessionCache = new Map<string, TargetCartCacheEntry>()

function parseJsonResponse(raw: string): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getProviderTimeoutMs(): number {
  const configured = Number(getServerEnv('TARGET_CART_TIMEOUT_MS') || '')
  if (!Number.isFinite(configured)) return 10_000
  return Math.max(1_000, Math.min(30_000, Math.round(configured)))
}

function getTargetCartCacheTtlMs(): number {
  const configured = Number(getServerEnv('TARGET_CART_CACHE_TTL_MS') || '')
  if (!Number.isFinite(configured)) return 60_000
  return Math.max(0, Math.min(5 * 60_000, Math.floor(configured)))
}

function getNow(): number {
  return Date.now()
}

function cleanupTargetCartCache(now: number): void {
  for (const [key, entry] of targetCartSessionCache.entries()) {
    if (entry.expiresAt <= now) {
      targetCartSessionCache.delete(key)
    }
  }
}

function toStableCacheItems(items: ShoppingCartSessionItem[]): ShoppingCartSessionItem[] {
  return [...items].sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) return nameCompare
    return a.unit.localeCompare(b.unit)
  })
}

function buildTargetCartCacheKey(args: {
  storeId: string
  targetStoreId: string
  items: ShoppingCartSessionItem[]
}): string {
  return JSON.stringify({
    storeId: args.storeId,
    targetStoreId: args.targetStoreId,
    items: toStableCacheItems(args.items),
  })
}

function cloneCartSessionResult(result: ShoppingCartSessionResult): ShoppingCartSessionResult {
  return {
    provider: result.provider,
    sessionId: result.sessionId,
    checkoutUrl: result.checkoutUrl,
    unmatchedItems: result.unmatchedItems.map((item) => ({ ...item })),
  }
}

function normalizeItems(items: ShoppingCartSessionItem[]): ShoppingCartSessionItem[] {
  const deduped = new Map<string, ShoppingCartSessionItem>()
  for (const item of items) {
    const name = item.name.trim()
    if (!name) continue
    const unit = item.unit.trim()
    const key = `${name.toLowerCase()}|${unit.toLowerCase()}`
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, { name, unit, qty: item.qty })
      continue
    }
    if (existing.qty !== null && item.qty !== null) {
      existing.qty += item.qty
      continue
    }
    existing.qty = null
  }
  return Array.from(deduped.values()).sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) return nameCompare
    return a.unit.localeCompare(b.unit)
  })
}

function resolveStoreProvider(store: GroceryStore): OnlineOrderProvider {
  if (!store.supportsOnlineOrdering) {
    throw new ShoppingCartError(
      'Online ordering is disabled for this store.',
      403,
      'UNSUPPORTED_STORE'
    )
  }

  if (!store.onlineOrderingProvider) {
    throw new ShoppingCartError(
      'Store online ordering is not configured with a provider.',
      400,
      'MISSING_PROVIDER'
    )
  }

  return store.onlineOrderingProvider
}

function getTargetStoreId(store: GroceryStore): string {
  const targetStoreId = store.onlineOrderingConfig?.targetStoreId?.trim()
  if (!targetStoreId) {
    throw new ShoppingCartError(
      'Store is missing Target online ordering configuration.',
      400,
      'MISSING_PROVIDER_CONFIG'
    )
  }
  return targetStoreId
}

async function createTargetCartSession(
  store: GroceryStore,
  items: ShoppingCartSessionItem[]
): Promise<ShoppingCartSessionResult> {
  const endpoint = getServerEnv('TARGET_CART_SESSION_ENDPOINT')
  if (!endpoint) {
    throw new ShoppingCartError(
      'Target cart endpoint is not configured on this server.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    )
  }

  const normalizedItems = normalizeItems(items)
  if (normalizedItems.length === 0) {
    throw new ShoppingCartError(
      'No valid ingredients were provided to build a cart.',
      400,
      'EMPTY_ITEMS'
    )
  }

  const targetStoreId = getTargetStoreId(store)
  const apiKey = getServerEnv('TARGET_CART_SESSION_API_KEY')
  const cacheTtlMs = getTargetCartCacheTtlMs()
  const now = getNow()
  cleanupTargetCartCache(now)

  const cacheKey = buildTargetCartCacheKey({
    storeId: store.id,
    targetStoreId,
    items: normalizedItems,
  })
  if (cacheTtlMs > 0) {
    const cached = targetCartSessionCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return cloneCartSessionResult(cached.value)
    }
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        store: {
          id: store.id,
          name: store.name,
          targetStoreId,
        },
        items: normalizedItems,
      }),
      signal: AbortSignal.timeout(getProviderTimeoutMs()),
    })
  } catch {
    throw new ShoppingCartError(
      'Unable to reach Target cart provider.',
      503,
      'PROVIDER_UNAVAILABLE'
    )
  }

  const raw = await response.text()
  const parsed = parseJsonResponse(raw)

  if (!response.ok) {
    const providerMessage =
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).error === 'string'
        ? String((parsed as Record<string, unknown>).error)
        : 'Provider rejected cart session request.'
    throw new ShoppingCartError(providerMessage, 502, 'PROVIDER_ERROR')
  }

  const payload = targetConnectorResponseSchema.safeParse(parsed)
  if (!payload.success) {
    throw new ShoppingCartError(
      'Target provider returned an invalid cart session payload.',
      502,
      'INVALID_PROVIDER_RESPONSE'
    )
  }

  const result: ShoppingCartSessionResult = {
    provider: 'target',
    sessionId: payload.data.sessionId,
    checkoutUrl: payload.data.checkoutUrl,
    unmatchedItems: (payload.data.unmatchedItems || []).map((item) => ({
      name: item.name,
      qty: item.qty ?? null,
      unit: item.unit || '',
      reason: item.reason || 'No product match found.',
    })),
  }

  if (cacheTtlMs > 0) {
    targetCartSessionCache.set(cacheKey, {
      expiresAt: now + cacheTtlMs,
      value: cloneCartSessionResult(result),
    })
  }

  return result
}

export async function createShoppingCartSession(args: {
  store: GroceryStore
  items: ShoppingCartSessionItem[]
}): Promise<ShoppingCartSessionResult> {
  const provider = resolveStoreProvider(args.store)

  if (provider === 'target') {
    return createTargetCartSession(args.store, args.items)
  }

  throw new ShoppingCartError(
    'Store provider is not supported for online ordering.',
    400,
    'UNSUPPORTED_PROVIDER'
  )
}

export function clearTargetCartSessionCache(): void {
  targetCartSessionCache.clear()
}
