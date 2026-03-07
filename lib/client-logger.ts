export interface ErrorLogEntry {
  id: string
  timestamp: string
  context: string
  message: string
  stack?: string
}

const LOG_STORAGE_KEY = 'mealplanner:errorlog'
const MAX_ENTRIES = 50

const USER_MESSAGES: Record<string, string> = {
  'app.load': 'Unable to load your data. Try refreshing the page.',
  'recipe.save': 'Something went wrong saving your recipe. Please try again.',
  'recipe.delete': 'Something went wrong deleting this recipe. Please try again.',
  'recipe.import': 'Something went wrong importing this recipe. Please try again.',
  'recipe.search': 'Something went wrong searching for recipes. Please try again.',
  'recipe.load-details': 'Something went wrong loading recipe details. Please try again.',
  'recipe.add-to-plan': 'Something went wrong adding this recipe to your meal plan.',
  'ingredient.save': 'Something went wrong saving this ingredient. Please try again.',
  'ingredient.delete': 'Something went wrong deleting this ingredient. Please try again.',
  'ingredient.update-store': 'Something went wrong updating the store for selected ingredients.',
  'ingredient.update-category': 'Something went wrong updating the category for selected ingredients.',
  'ingredient.delete-selected': 'Something went wrong deleting the selected ingredients.',
  'store.save': 'Something went wrong saving this store. Please try again.',
  'store.delete': 'Something went wrong deleting this store. Please try again.',
  'plan.save': 'Something went wrong saving this meal plan. Please try again.',
  'plan.delete': 'Something went wrong deleting this meal plan. Please try again.',
  'plan.activate': 'Something went wrong setting this as the current plan.',
  'plan.duplicate': 'Something went wrong duplicating this plan. Please try again.',
  'plan.load': 'Something went wrong loading this meal plan. Please try again.',
  'plan.update-slot': 'Something went wrong updating this meal slot. Please try again.',
  'plan.clear-slots': 'Something went wrong clearing meal slots. Please try again.',
  'plan.update-details': 'Something went wrong updating this meal plan. Please try again.',
  'cart.build': 'Something went wrong building the shopping cart. Please try again.',
  'cart.create': 'Something went wrong creating the cart. Please try again.',
}

export function logError(error: unknown, context: string): void {
  const entry: ErrorLogEntry = {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Date.now()),
    timestamp: new Date().toISOString(),
    context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }

  console.error(`[meal-planner] [${context}]`, entry)

  if (typeof window === 'undefined') return

  try {
    const raw = sessionStorage.getItem(LOG_STORAGE_KEY)
    const existing: ErrorLogEntry[] = raw ? (JSON.parse(raw) as ErrorLogEntry[]) : []
    sessionStorage.setItem(
      LOG_STORAGE_KEY,
      JSON.stringify([entry, ...existing].slice(0, MAX_ENTRIES))
    )
  } catch {
    // sessionStorage unavailable — console log is the fallback
  }
}

export function handleError(error: unknown, context: string): string {
  logError(error, context)
  return USER_MESSAGES[context] ?? 'Something went wrong. Please try again.'
}

export function getErrorLog(): ErrorLogEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(LOG_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ErrorLogEntry[]) : []
  } catch {
    return []
  }
}

export function clearErrorLog(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(LOG_STORAGE_KEY)
  } catch {
    // noop
  }
}
