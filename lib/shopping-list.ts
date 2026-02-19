import type {
  GroceryStore,
  MealSelection,
  MealSlot,
  Recipe,
} from '@/lib/types'
import { MEAL_SLOT_VALUES } from '@/lib/types'

export interface ShoppingItem {
  name: string
  qty: number | null
  unit: string
}

export interface ShoppingStoreBucket {
  key: string
  storeId: string | null
  storeName: string
  items: ShoppingItem[]
}

export interface PlannedSlotState {
  selection: MealSelection
  recipeId: string | null
}

export function buildShoppingList(
  activeDateKeys: string[],
  slotMap: Map<string, PlannedSlotState>,
  recipes: Recipe[],
  stores: GroceryStore[]
): ShoppingStoreBucket[] {
  const storeNameToId = new Map<string, string>()
  const storeById = new Map<string, GroceryStore>()
  for (const store of stores) {
    const normalized = store.name.trim().toLowerCase()
    if (normalized) storeNameToId.set(normalized, store.id)
    storeById.set(store.id, store)
  }

  const recipesById = new Map<string, Recipe>()
  for (const recipe of recipes) {
    recipesById.set(recipe.id, recipe)
  }

  const slots = [...MEAL_SLOT_VALUES] as MealSlot[]
  const bucketMap = new Map<
    string,
    { storeId: string | null; storeName: string; items: ShoppingItem[] }
  >()

  for (const dateKey of activeDateKeys) {
    for (const slot of slots) {
      const entry = slotMap.get(`${dateKey}:${slot}`)
      if (!entry || entry.selection !== 'recipe' || !entry.recipeId) continue
      const recipe = recipesById.get(entry.recipeId)
      if (!recipe) continue

      for (const ingredient of recipe.ingredients) {
        const explicitStoreId =
          typeof ingredient.storeId === 'string' && ingredient.storeId.trim()
            ? ingredient.storeId.trim()
            : null
        const ingredientStoreName = ingredient.store?.trim() || ''
        const inferredStoreId =
          !explicitStoreId && ingredientStoreName
            ? storeNameToId.get(ingredientStoreName.toLowerCase()) || null
            : null
        const storeId = explicitStoreId || inferredStoreId
        const resolvedStoreName = storeId
          ? storeById.get(storeId)?.name || ingredientStoreName || 'Unknown Store'
          : ingredientStoreName || 'Uncategorized'
        const bucketKey = storeId
          ? `id:${storeId}`
          : `name:${resolvedStoreName.toLowerCase()}`

        const current = bucketMap.get(bucketKey)
        if (!current) {
          bucketMap.set(bucketKey, {
            storeId,
            storeName: resolvedStoreName,
            items: [],
          })
        }
        bucketMap.get(bucketKey)?.items.push({
          name: ingredient.name,
          qty: ingredient.qty,
          unit: ingredient.unit,
        })
      }
    }
  }

  const buckets = Array.from(bucketMap.entries()).map(([key, value]) => {
    const deduped: Record<string, ShoppingItem> = {}
    for (const item of value.items) {
      const dedupeKey = `${item.name.toLowerCase()}|${item.unit.toLowerCase()}`
      if (deduped[dedupeKey]) {
        if (deduped[dedupeKey].qty !== null && item.qty !== null) {
          deduped[dedupeKey].qty = (deduped[dedupeKey].qty as number) + item.qty
        }
      } else {
        deduped[dedupeKey] = { ...item }
      }
    }
    return {
      key,
      storeId: value.storeId,
      storeName: value.storeName,
      items: Object.values(deduped).sort((a, b) => a.name.localeCompare(b.name)),
    }
  })

  return buckets.sort((a, b) => {
    if (a.storeName === 'Uncategorized') return 1
    if (b.storeName === 'Uncategorized') return -1
    return a.storeName.localeCompare(b.storeName)
  })
}
