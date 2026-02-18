import { useSyncExternalStore } from 'react'
import type { Recipe, MealPlan, DayOfWeek, MealSlot, GroceryStore, IngredientEntry } from './types'
import { SAMPLE_RECIPES, SAMPLE_MEAL_PLAN, SAMPLE_STORES, SAMPLE_INGREDIENT_ENTRIES } from './sample-data'

// Simple in-memory store with subscription pattern for SWR-like behavior
// In production this would be backed by a database

interface Store {
  recipes: Recipe[]
  mealPlan: MealPlan
  groceryStores: GroceryStore[]
  ingredientEntries: IngredientEntry[]
}

type Listener = () => void

let store: Store = {
  recipes: [...SAMPLE_RECIPES],
  mealPlan: { ...SAMPLE_MEAL_PLAN },
  groceryStores: [...SAMPLE_STORES],
  ingredientEntries: [...SAMPLE_INGREDIENT_ENTRIES],
}

const listeners = new Set<Listener>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Store {
  return store
}

// Actions
export function addRecipe(recipe: Recipe) {
  store = {
    ...store,
    recipes: [...store.recipes, recipe],
  }
  emitChange()
}

export function updateRecipe(recipe: Recipe) {
  store = {
    ...store,
    recipes: store.recipes.map((r) => (r.id === recipe.id ? recipe : r)),
  }
  emitChange()
}

export function deleteRecipe(id: string) {
  // Also remove from meal plan
  const newPlan = { ...store.mealPlan }
  for (const day of Object.keys(newPlan)) {
    const dayPlan = { ...newPlan[day] }
    for (const slot of Object.keys(dayPlan)) {
      if (dayPlan[slot] === id) {
        dayPlan[slot] = null
      }
    }
    newPlan[day] = dayPlan
  }

  store = {
    ...store,
    recipes: store.recipes.filter((r) => r.id !== id),
    mealPlan: newPlan,
  }
  emitChange()
}

export function setMealSlot(day: DayOfWeek, slot: MealSlot, recipeId: string | null) {
  store = {
    ...store,
    mealPlan: {
      ...store.mealPlan,
      [day]: {
        ...store.mealPlan[day],
        [slot]: recipeId,
      },
    },
  }
  emitChange()
}

export function clearMealPlan() {
  const empty: MealPlan = {}
  const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  for (const day of days) {
    empty[day] = { breakfast: null, lunch: null, dinner: null, snack: null }
  }
  store = { ...store, mealPlan: empty }
  emitChange()
}

// Grocery Store actions
export function addGroceryStore(groceryStore: GroceryStore) {
  store = { ...store, groceryStores: [...store.groceryStores, groceryStore] }
  emitChange()
}

export function updateGroceryStore(groceryStore: GroceryStore) {
  store = {
    ...store,
    groceryStores: store.groceryStores.map((s) =>
      s.id === groceryStore.id ? groceryStore : s
    ),
  }
  emitChange()
}

export function deleteGroceryStore(id: string) {
  store = {
    ...store,
    groceryStores: store.groceryStores.filter((s) => s.id !== id),
  }
  emitChange()
}

// Ingredient Entry actions
export function addIngredientEntry(entry: IngredientEntry) {
  store = { ...store, ingredientEntries: [...store.ingredientEntries, entry] }
  emitChange()
}

export function updateIngredientEntry(entry: IngredientEntry) {
  store = {
    ...store,
    ingredientEntries: store.ingredientEntries.map((e) =>
      e.id === entry.id ? entry : e
    ),
  }
  emitChange()
}

export function deleteIngredientEntry(id: string) {
  store = {
    ...store,
    ingredientEntries: store.ingredientEntries.filter((e) => e.id !== id),
  }
  emitChange()
}

// Hook
export function useStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return snapshot
}

export function useRecipes() {
  const { recipes } = useStore()
  return recipes
}

export function useMealPlan() {
  const { mealPlan } = useStore()
  return mealPlan
}

export function useGroceryStores() {
  const { groceryStores } = useStore()
  return groceryStores
}

export function useIngredientEntries() {
  const { ingredientEntries } = useStore()
  return ingredientEntries
}

export function getRecipeById(recipes: Recipe[], id: string): Recipe | undefined {
  return recipes.find((r) => r.id === id)
}

export function getStoreById(stores: GroceryStore[], id: string): GroceryStore | undefined {
  return stores.find((s) => s.id === id)
}
