export const DAY_OF_WEEK_VALUES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export const MEAL_SLOT_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
] as const

export const MEAL_TYPE_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
] as const

export type DayOfWeek = (typeof DAY_OF_WEEK_VALUES)[number]
export type MealSlot = (typeof MEAL_SLOT_VALUES)[number]
export type MealType = (typeof MEAL_TYPE_VALUES)[number]

export interface GroceryStore {
  id: string
  name: string
  address: string
  placeId?: string
  lat?: number
  lng?: number
  phone?: string
  hours?: string[]
  logoUrl?: string
  createdAt: string
  updatedAt: string
}

export interface IngredientEntry {
  id: string
  name: string
  defaultUnit: string
  defaultStoreId: string
  category: string
  createdAt: string
  updatedAt: string
}

export interface Ingredient {
  id: string
  name: string
  qty: number | null
  unit: string
  store: string
  storeId?: string
}

export interface Recipe {
  id: string
  name: string
  description: string
  mealType: MealType
  servings: number
  ingredients: Ingredient[]
  steps: string[]
  sourceUrl: string
  createdAt: string
  updatedAt: string
}

export type MealPlan = Record<DayOfWeek, Record<MealSlot, string | null>>

export interface MealPlanSnapshotMeal {
  day: DayOfWeek
  slot: MealSlot
  recipeId: string
  recipeName: string
  storeIds: string[]
  storeNames: string[]
}

export interface MealPlanSnapshot {
  id: string
  createdAt: string
  label: string
  meals: MealPlanSnapshotMeal[]
}

export interface PlannerBootstrapMeta {
  isEmpty: boolean
  counts: {
    recipes: number
    stores: number
    ingredientEntries: number
    mealPlanAssignments: number
    snapshots: number
  }
}

export interface PlannerBootstrapResponse {
  recipes: Recipe[]
  mealPlan: MealPlan
  mealPlanSnapshots: MealPlanSnapshot[]
  groceryStores: GroceryStore[]
  ingredientEntries: IngredientEntry[]
  meta: PlannerBootstrapMeta
}

export interface LocalStorageMigrationPayload {
  recipes?: Recipe[]
  mealPlan?: MealPlan
  mealPlanSnapshots?: MealPlanSnapshot[]
  groceryStores?: GroceryStore[]
  ingredientEntries?: IngredientEntry[]
}

export type RecipeMode = 'add' | 'edit'

export function getModeLabel(mode: RecipeMode): string {
  return mode === 'add' ? 'Add Recipe' : 'Edit Recipe'
}

export function getDraftLabel(mode: RecipeMode): string {
  return mode === 'add' ? 'Add Recipe Draft' : 'Edit Recipe Draft'
}

export function createEmptyMealPlan(): MealPlan {
  const mealPlan = {} as MealPlan
  for (const day of DAY_OF_WEEK_VALUES) {
    mealPlan[day] = {
      breakfast: null,
      lunch: null,
      dinner: null,
      snack: null,
    }
  }
  return mealPlan
}
