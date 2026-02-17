// A grocery store with location details
export interface GroceryStore {
  id: string
  name: string
  address: string
  placeId?: string        // Google Places ID
  lat?: number
  lng?: number
  phone?: string
  hours?: string[]        // array of day-hours strings
  logoUrl?: string        // Google Place photo URL
  createdAt: string
  updatedAt: string
}

// An ingredient in the global ingredients database (autocomplete source)
export interface IngredientEntry {
  id: string
  name: string
  defaultUnit: string
  defaultStoreId: string  // links to GroceryStore.id
  category: string        // e.g. "Produce", "Dairy", "Pantry"
  createdAt: string
  updatedAt: string
}

// An ingredient as it appears in a recipe (copy from DB, customizable per-recipe)
export interface Ingredient {
  id: string
  name: string
  qty: number | null
  unit: string
  store: string           // store name (denormalized for display)
  storeId?: string        // optional link back to GroceryStore
}

export interface Recipe {
  id: string
  name: string
  description: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  servings: number
  ingredients: Ingredient[]
  steps: string[]
  sourceUrl: string
  createdAt: string
  updatedAt: string
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealPlan {
  [day: string]: {
    [slot: string]: string | null // recipe ID or null
  }
}

export type RecipeMode = 'add' | 'edit'

export function getModeLabel(mode: RecipeMode): string {
  return mode === 'add' ? 'Add Recipe' : 'Edit Recipe'
}

export function getDraftLabel(mode: RecipeMode): string {
  return mode === 'add' ? 'Add Recipe Draft' : 'Edit Recipe Draft'
}
