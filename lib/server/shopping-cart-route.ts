import { shoppingCartSessionCreateSchema } from '@/lib/server/schemas'
import { normalizeErrorMessage } from '@/lib/server/error-message'
import { getServerEnv } from '@/lib/server/env'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { getStoreById } from '@/lib/server/planner-service'
import {
  ShoppingCartError,
  createShoppingCartSession,
} from '@/lib/server/shopping-cart'

function getRateLimitWindowMs(): number {
  const configured = Number(getServerEnv('SHOPPING_CART_RATE_LIMIT_WINDOW_MS') || '')
  if (!Number.isFinite(configured)) return 60_000
  return Math.max(1_000, Math.min(10 * 60_000, Math.floor(configured)))
}

function getRateLimitMaxRequests(): number {
  const configured = Number(getServerEnv('SHOPPING_CART_RATE_LIMIT_MAX_REQUESTS') || '')
  if (!Number.isFinite(configured)) return 10
  return Math.max(1, Math.min(100, Math.floor(configured)))
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')?.trim()
  return realIp || 'unknown'
}

export interface ShoppingCartRouteDeps {
  getStoreById: typeof getStoreById
  createShoppingCartSession: typeof createShoppingCartSession
}

const defaultDeps: ShoppingCartRouteDeps = {
  getStoreById,
  createShoppingCartSession,
}

export interface CartSessionHttpResult {
  status: number
  body: Record<string, unknown>
  headers?: Record<string, string>
}

export async function handleCartSessionRequest(
  request: Request,
  deps: ShoppingCartRouteDeps = defaultDeps
): Promise<CartSessionHttpResult> {
  try {
    const clientIp = getClientIp(request)
    const rateLimit = checkRateLimit({
      key: `shopping-cart:${clientIp}`,
      maxRequests: getRateLimitMaxRequests(),
      windowMs: getRateLimitWindowMs(),
    })
    if (!rateLimit.allowed) {
      return {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) },
        body: {
          error: 'Too many cart build requests. Please try again shortly.',
          code: 'RATE_LIMITED',
          retryAfterMs: rateLimit.retryAfterMs,
        },
      }
    }

    const raw = await request.json()
    const payload = shoppingCartSessionCreateSchema.parse(raw)

    const store = await deps.getStoreById(payload.storeId)
    if (!store) {
      return { status: 404, body: { error: 'Store not found.' } }
    }

    const session = await deps.createShoppingCartSession({
      store,
      items: payload.items,
    })

    return { status: 200, body: session as unknown as Record<string, unknown> }
  } catch (error) {
    if (error instanceof ShoppingCartError) {
      return {
        status: error.status,
        body: {
          error: error.message,
          code: error.code,
        },
      }
    }

    return {
      status: 400,
      body: { error: normalizeErrorMessage(error) },
    }
  }
}
