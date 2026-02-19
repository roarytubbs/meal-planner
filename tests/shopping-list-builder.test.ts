import test from 'node:test'
import assert from 'node:assert/strict'
import { buildShoppingList, type PlannedSlotState } from '@/lib/shopping-list'
import type { GroceryStore, Recipe } from '@/lib/types'

function buildStore(overrides?: Partial<GroceryStore>): GroceryStore {
  return {
    id: 'store_1',
    name: 'Target Mission',
    address: '123 Main St',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(overrides || {}),
  }
}

function buildRecipe(overrides?: Partial<Recipe>): Recipe {
  return {
    id: 'recipe_1',
    name: 'Recipe One',
    description: '',
    mealType: 'dinner',
    servings: 4,
    ingredients: [],
    steps: [],
    sourceUrl: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(overrides || {}),
  }
}

function slotState(
  entries: Array<{ key: string; selection: PlannedSlotState['selection']; recipeId: string | null }>
): Map<string, PlannedSlotState> {
  const map = new Map<string, PlannedSlotState>()
  for (const entry of entries) {
    map.set(entry.key, {
      selection: entry.selection,
      recipeId: entry.recipeId,
    })
  }
  return map
}

test('adds recipe ingredients to the matching store bucket', () => {
  const stores = [buildStore({ id: 'store_target', name: 'Target Downtown' })]
  const recipes = [
    buildRecipe({
      id: 'recipe_a',
      ingredients: [{ id: 'ing1', name: 'Milk', qty: 1, unit: 'gal', store: '', storeId: 'store_target' }],
    }),
  ]

  const buckets = buildShoppingList(
    ['2026-02-19'],
    slotState([{ key: '2026-02-19:breakfast', selection: 'recipe', recipeId: 'recipe_a' }]),
    recipes,
    stores
  )

  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].storeId, 'store_target')
  assert.equal(buckets[0].storeName, 'Target Downtown')
  assert.deepEqual(buckets[0].items, [{ name: 'Milk', qty: 1, unit: 'gal' }])
})

test('aggregates duplicate ingredient + unit quantities across recipes in the same store', () => {
  const stores = [buildStore({ id: 'store_target', name: 'Target Downtown' })]
  const recipes = [
    buildRecipe({
      id: 'recipe_a',
      ingredients: [{ id: 'ing1', name: 'Eggs', qty: 1, unit: 'dozen', store: '', storeId: 'store_target' }],
    }),
    buildRecipe({
      id: 'recipe_b',
      ingredients: [{ id: 'ing2', name: 'Eggs', qty: 2, unit: 'dozen', store: '', storeId: 'store_target' }],
    }),
  ]

  const buckets = buildShoppingList(
    ['2026-02-19'],
    slotState([
      { key: '2026-02-19:breakfast', selection: 'recipe', recipeId: 'recipe_a' },
      { key: '2026-02-19:lunch', selection: 'recipe', recipeId: 'recipe_b' },
    ]),
    recipes,
    stores
  )

  assert.equal(buckets.length, 1)
  assert.deepEqual(buckets[0].items, [{ name: 'Eggs', qty: 3, unit: 'dozen' }])
})

test('ignores non-recipe slot selections', () => {
  const stores = [buildStore({ id: 'store_target', name: 'Target Downtown' })]
  const recipes = [
    buildRecipe({
      id: 'recipe_a',
      ingredients: [{ id: 'ing1', name: 'Bread', qty: 1, unit: 'loaf', store: '', storeId: 'store_target' }],
    }),
  ]

  const buckets = buildShoppingList(
    ['2026-02-19'],
    slotState([
      { key: '2026-02-19:breakfast', selection: 'skip', recipeId: null },
      { key: '2026-02-19:lunch', selection: 'recipe', recipeId: 'recipe_a' },
    ]),
    recipes,
    stores
  )

  assert.equal(buckets.length, 1)
  assert.deepEqual(buckets[0].items, [{ name: 'Bread', qty: 1, unit: 'loaf' }])
})

test('falls back to Uncategorized when ingredient has no store mapping', () => {
  const recipes = [
    buildRecipe({
      id: 'recipe_a',
      ingredients: [{ id: 'ing1', name: 'Salt', qty: null, unit: '', store: '', storeId: undefined }],
    }),
  ]

  const buckets = buildShoppingList(
    ['2026-02-19'],
    slotState([{ key: '2026-02-19:dinner', selection: 'recipe', recipeId: 'recipe_a' }]),
    recipes,
    []
  )

  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].storeId, null)
  assert.equal(buckets[0].storeName, 'Uncategorized')
  assert.deepEqual(buckets[0].items, [{ name: 'Salt', qty: null, unit: '' }])
})
