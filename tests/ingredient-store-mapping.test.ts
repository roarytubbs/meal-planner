import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDefaultStoresToIngredients,
  buildDefaultStoreIdByIngredientName,
  buildStoreNameById,
} from '@/lib/ingredient-store-mapping'
import type { Ingredient, IngredientEntry, GroceryStore } from '@/lib/types'

function createIngredient(overrides?: Partial<Ingredient>): Ingredient {
  return {
    id: 'ing_1',
    name: 'milk',
    qty: 1,
    unit: 'gal',
    store: '',
    ...(overrides || {}),
  }
}

function createEntry(overrides?: Partial<IngredientEntry>): IngredientEntry {
  const now = new Date().toISOString()
  return {
    id: 'ie_1',
    name: 'milk',
    defaultUnit: 'gal',
    defaultStoreId: 'store_target',
    category: 'Dairy',
    createdAt: now,
    updatedAt: now,
    ...(overrides || {}),
  }
}

function createStore(overrides?: Partial<GroceryStore>): GroceryStore {
  const now = new Date().toISOString()
  return {
    id: 'store_target',
    name: 'Target North',
    address: '123 Main',
    createdAt: now,
    updatedAt: now,
    ...(overrides || {}),
  }
}

test('applies default store mapping to unmapped ingredients', () => {
  const ingredients = [createIngredient({ name: 'Milk' })]
  const defaultStoreIdByName = buildDefaultStoreIdByIngredientName([createEntry()])
  const storeNameById = buildStoreNameById([createStore()])

  const result = applyDefaultStoresToIngredients(
    ingredients,
    defaultStoreIdByName,
    storeNameById
  )

  assert.notEqual(result, ingredients)
  assert.equal(result[0].storeId, 'store_target')
  assert.equal(result[0].store, 'Target North')
})

test('does not override ingredients that already have a store assignment', () => {
  const ingredients = [
    createIngredient({
      name: 'milk',
      storeId: 'store_existing',
      store: 'Existing Store',
    }),
  ]
  const defaultStoreIdByName = buildDefaultStoreIdByIngredientName([createEntry()])
  const storeNameById = buildStoreNameById([createStore()])

  const result = applyDefaultStoresToIngredients(
    ingredients,
    defaultStoreIdByName,
    storeNameById
  )

  assert.equal(result, ingredients)
  assert.equal(result[0].storeId, 'store_existing')
  assert.equal(result[0].store, 'Existing Store')
})

test('ignores entries without default store ids', () => {
  const ingredients = [createIngredient({ name: 'milk' })]
  const defaultStoreIdByName = buildDefaultStoreIdByIngredientName([
    createEntry({ defaultStoreId: '' }),
  ])
  const storeNameById = buildStoreNameById([createStore()])

  const result = applyDefaultStoresToIngredients(
    ingredients,
    defaultStoreIdByName,
    storeNameById
  )

  assert.equal(result, ingredients)
  assert.equal(result[0].storeId, undefined)
  assert.equal(result[0].store, '')
})
