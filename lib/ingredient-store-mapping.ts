import type { GroceryStore, Ingredient, IngredientEntry } from '@/lib/types'

export function normalizeIngredientNameForLookup(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeStoreId(value: string): string {
  return String(value || '').trim()
}

export function buildDefaultStoreIdByIngredientName(
  entries: Array<Pick<IngredientEntry, 'name' | 'defaultStoreId'>>
): Map<string, string> {
  const byName = new Map<string, string>()

  for (const entry of entries) {
    const name = normalizeIngredientNameForLookup(entry.name)
    const storeId = normalizeStoreId(entry.defaultStoreId)
    if (!name || !storeId) continue
    if (!byName.has(name)) {
      byName.set(name, storeId)
    }
  }

  return byName
}

export function buildStoreNameById(
  stores: Array<Pick<GroceryStore, 'id' | 'name'>>
): Map<string, string> {
  const byId = new Map<string, string>()

  for (const store of stores) {
    const id = normalizeStoreId(store.id)
    if (!id) continue
    byId.set(id, String(store.name || '').trim())
  }

  return byId
}

export function applyDefaultStoresToIngredients(
  ingredients: Ingredient[],
  defaultStoreIdByName: Map<string, string>,
  storeNameById: Map<string, string>
): Ingredient[] {
  if (ingredients.length === 0 || defaultStoreIdByName.size === 0) {
    return ingredients
  }

  let changed = false
  const next = ingredients.map((ingredient) => {
    const existingStoreId = normalizeStoreId(ingredient.storeId || '')
    const existingStoreName = String(ingredient.store || '').trim()

    if (existingStoreId || existingStoreName) {
      return ingredient
    }

    const lookupName = normalizeIngredientNameForLookup(ingredient.name)
    if (!lookupName) {
      return ingredient
    }

    const defaultStoreId = defaultStoreIdByName.get(lookupName)
    if (!defaultStoreId) {
      return ingredient
    }

    changed = true
    return {
      ...ingredient,
      storeId: defaultStoreId,
      store: storeNameById.get(defaultStoreId) || '',
    }
  })

  return changed ? next : ingredients
}
