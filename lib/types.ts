export const DAY_OF_WEEK_VALUES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export const LEGACY_MEAL_SLOT_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
] as const

export const MEAL_SLOT_VALUES = ['breakfast', 'lunch', 'dinner'] as const

export const MEAL_TYPE_VALUES = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
] as const

export const MEAL_SELECTION_VALUES = [
  'recipe',
  'skip',
  'eating_out',
  'leftovers',
] as const

export const ONLINE_ORDER_PROVIDER_VALUES = ['target'] as const

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type DayOfWeek = (typeof DAY_OF_WEEK_VALUES)[number]
export type LegacyMealSlot = (typeof LEGACY_MEAL_SLOT_VALUES)[number]
export type MealSlot = (typeof MEAL_SLOT_VALUES)[number]
export type MealType = (typeof MEAL_TYPE_VALUES)[number]
export type MealSelection = (typeof MEAL_SELECTION_VALUES)[number]
export type RecipeMealType = MealType | ''
export type OnlineOrderProvider = (typeof ONLINE_ORDER_PROVIDER_VALUES)[number]

export interface OnlineOrderingConfig {
  targetStoreId: string
}

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
  supportsOnlineOrdering?: boolean
  onlineOrderingProvider?: OnlineOrderProvider
  onlineOrderingConfig?: OnlineOrderingConfig
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
  mealType: RecipeMealType
  servings: number
  ingredients: Ingredient[]
  steps: string[]
  sourceUrl: string
  createdAt: string
  updatedAt: string
}

export type MealPlan = Record<DayOfWeek, Record<LegacyMealSlot, string | null>>

export interface MealPlanSlotEntry {
  dateKey: string
  slot: MealSlot
  selection: MealSelection
  recipeId: string | null
  updatedAt: string
}

export interface MealPlanSnapshotMeal {
  day: string
  slot: MealSlot
  selection: MealSelection
  recipeId: string | null
  recipeName: string | null
  storeIds: string[]
  storeNames: string[]
}

export interface MealPlanSnapshot {
  id: string
  createdAt: string
  label: string
  description: string
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
  mealPlanSlots: MealPlanSlotEntry[]
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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDateKey(value: string): Date | null {
  const candidate = String(value || '').trim()
  if (!DATE_KEY_PATTERN.test(candidate)) return null
  const [year, month, day] = candidate.split('-').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function buildDateRange(startDateKey: string, days: number): string[] {
  const start = parseDateKey(startDateKey)
  if (!start) return []
  const safeDays = Math.max(1, Math.min(14, Math.floor(days || 1)))
  const keys: string[] = []
  for (let index = 0; index < safeDays; index += 1) {
    keys.push(toDateKey(addDays(start, index)))
  }
  return keys
}

export function formatDateLabel(dateKey: string, options?: Intl.DateTimeFormatOptions): string {
  const parsed = parseDateKey(dateKey)
  if (!parsed) return dateKey
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(options || {}),
  }).format(parsed)
}
