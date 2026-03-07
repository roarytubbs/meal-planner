import { z } from 'zod'
import type { GroceryStore } from '@/lib/types'
import { getServerEnv } from '@/lib/server/env'
import {
  ShoppingCartError,
  type ShoppingCartSessionItem,
  type ShoppingCartSessionResult,
} from '@/lib/server/shopping-cart'

const instacartResponseSchema = z.object({
  products_link_url: z.string().trim().url(),
})

function normalizeInstacartItems(items: ShoppingCartSessionItem[]): ShoppingCartSessionItem[] {
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
  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function getInstacartRetailerId(store: GroceryStore): string {
  const retailerId = store.onlineOrderingConfig?.instacartRetailerId?.trim()
  if (!retailerId) {
    throw new ShoppingCartError(
      'Store is missing Instacart retailer ID configuration.',
      400,
      'MISSING_PROVIDER_CONFIG'
    )
  }
  return retailerId
}

export async function createInstacartCartSession(
  store: GroceryStore,
  items: ShoppingCartSessionItem[]
): Promise<ShoppingCartSessionResult> {
  const apiKey = getServerEnv('INSTACART_CONNECT_API_KEY')
  if (!apiKey) {
    throw new ShoppingCartError(
      'Instacart Connect API key is not configured on this server.',
      503,
      'PROVIDER_NOT_CONFIGURED'
    )
  }

  const normalizedItems = normalizeInstacartItems(items)
  if (normalizedItems.length === 0) {
    throw new ShoppingCartError(
      'No valid ingredients were provided to build a cart.',
      400,
      'EMPTY_ITEMS'
    )
  }

  const retailerKey = getInstacartRetailerId(store)

  const payload = {
    title: `${store.name} Shopping List`,
    link_type: 'shopping_list',
    retailer_key: retailerKey,
    items: normalizedItems.map((item) => ({
      name: item.name,
      quantity: item.qty ?? 1,
      unit: item.unit || undefined,
    })),
  }

  let response: Response
  try {
    response = await fetch('https://connect.instacart.com/idp/v1/products/products_link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ShoppingCartError(
      'Unable to reach Instacart Connect API.',
      503,
      'PROVIDER_UNAVAILABLE'
    )
  }

  const raw = await response.text()
  let parsed: unknown = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    const providerMessage =
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).message === 'string'
        ? String((parsed as Record<string, unknown>).message)
        : 'Instacart rejected the cart request.'
    throw new ShoppingCartError(providerMessage, 502, 'PROVIDER_ERROR')
  }

  const result = instacartResponseSchema.safeParse(parsed)
  if (!result.success) {
    throw new ShoppingCartError(
      'Instacart returned an invalid response.',
      502,
      'INVALID_PROVIDER_RESPONSE'
    )
  }

  return {
    provider: 'instacart',
    sessionId: result.data.products_link_url,
    checkoutUrl: result.data.products_link_url,
    unmatchedItems: [],
  }
}
