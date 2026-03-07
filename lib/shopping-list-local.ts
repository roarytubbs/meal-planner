/**
 * Client-side utilities for shopping list exclusions and ad-hoc items.
 * Uses localStorage and dispatches a custom event so any mounted
 * ShoppingModeView can refresh itself when another component makes a change.
 */

export const SHOP_STATE_CHANGED = 'mp-shop-state-changed'

// ── Key helpers ───────────────────────────────────────────────────────────────

export function toItemNK(name: string, unit: string): string {
  return `${name.toLowerCase()}::${(unit ?? '').toLowerCase()}`
}

function exclusionKey(planId: string) {
  return `mp_shop_excluded_${planId}`
}

function adHocKey(planId: string) {
  return `mp_shop_adhoc_${planId}`
}

// ── Exclusions ────────────────────────────────────────────────────────────────

export function getExcludedNKs(planId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(exclusionKey(planId))
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* noop */ }
  return new Set()
}

export function setExclusionNK(planId: string, nk: string, excluded: boolean): void {
  const current = getExcludedNKs(planId)
  if (excluded) current.add(nk)
  else current.delete(nk)
  localStorage.setItem(exclusionKey(planId), JSON.stringify([...current]))
  window.dispatchEvent(new CustomEvent(SHOP_STATE_CHANGED, { detail: { planId } }))
}

export function clearExcludedNKs(planId: string): void {
  localStorage.removeItem(exclusionKey(planId))
  window.dispatchEvent(new CustomEvent(SHOP_STATE_CHANGED, { detail: { planId } }))
}

// ── Ad-hoc items ──────────────────────────────────────────────────────────────

export interface StoredAdHocItem {
  id: string
  bucketKey: string
  name: string
  qty: number | null
  unit: string
}

export function getAdHocItems(planId: string): StoredAdHocItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(adHocKey(planId))
    if (raw) return JSON.parse(raw) as StoredAdHocItem[]
  } catch { /* noop */ }
  return []
}

export function addAdHocShoppingItem(
  planId: string,
  storeId: string | null | undefined,
  name: string,
  qty: number | null,
  unit: string
): string {
  const items = getAdHocItems(planId)
  const id = `adhoc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const bucketKey = storeId ? `id:${storeId}` : '__misc__'
  items.push({ id, bucketKey, name, qty, unit })
  localStorage.setItem(adHocKey(planId), JSON.stringify(items))
  window.dispatchEvent(new CustomEvent(SHOP_STATE_CHANGED, { detail: { planId } }))
  return id
}
