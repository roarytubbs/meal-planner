import { useEffect, useSyncExternalStore } from 'react'
import type {
  DayOfWeek,
  GroceryStore,
  Ingredient,
  IngredientEntry,
  LocalStorageMigrationPayload,
  MealPlan,
  MealPlanSnapshot,
  MealSlot,
  PlannerBootstrapResponse,
  Recipe,
} from './types'
import { DAY_OF_WEEK_VALUES, MEAL_SLOT_VALUES, createEmptyMealPlan } from './types'

interface StoreState {
  recipes: Recipe[]
  mealPlan: MealPlan
  mealPlanSnapshots: MealPlanSnapshot[]
  groceryStores: GroceryStore[]
  ingredientEntries: IngredientEntry[]
}

interface StoreStatus {
  loading: boolean
  hydrated: boolean
  error: string | null
}

type Listener = () => void

const LEGACY_STORES_KEY = 'meal_planner_stores_v1'
const LEGACY_INGREDIENT_ENTRIES_KEY = 'meal_planner_ingredient_entries_v1'
const LEGACY_SNAPSHOTS_KEY = 'meal_planner_snapshots_v1'
const MIGRATION_MARKER_KEY = 'meal_planner_backend_migration_v1'
const MAX_LEGACY_SNAPSHOT_IMPORT = 50

let store: StoreState = {
  recipes: [],
  mealPlan: createEmptyMealPlan(),
  mealPlanSnapshots: [],
  groceryStores: [],
  ingredientEntries: [],
}

let status: StoreStatus = {
  loading: true,
  hydrated: false,
  error: null,
}

let hydratePromise: Promise<void> | null = null
const listeners = new Set<Listener>()

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function getSnapshot(): StoreState {
  return store
}

function getStatusSnapshot(): StoreStatus {
  return status
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unexpected error.'
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  const raw = await response.text()
  const data = raw ? JSON.parse(raw) : {}

  if (!response.ok) {
    const message =
      typeof data?.error === 'string' && data.error.trim().length > 0
        ? data.error
        : `Request failed (${response.status})`
    throw new Error(message)
  }

  return data as T
}

function normalizeMealPlan(input: unknown): MealPlan {
  const next = createEmptyMealPlan()
  if (!input || typeof input !== 'object') return next
  const source = input as Record<string, unknown>
  for (const day of DAY_OF_WEEK_VALUES) {
    const daySource = source[day]
    if (!daySource || typeof daySource !== 'object') continue
    const dayRecord = daySource as Record<string, unknown>
    for (const slot of MEAL_SLOT_VALUES) {
      const recipeId = dayRecord[slot]
      next[day][slot] =
        typeof recipeId === 'string' && recipeId.trim().length > 0 ? recipeId : null
    }
  }
  return next
}

function normalizeStore(value: unknown): GroceryStore | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const name = typeof source.name === 'string' ? source.name.trim() : ''
  const address = typeof source.address === 'string' ? source.address.trim() : ''
  if (!id || !name || !address) return null

  const createdAt =
    typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString()
  const updatedAt =
    typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt

  return {
    id,
    name,
    address,
    placeId:
      typeof source.placeId === 'string' && source.placeId.trim()
        ? source.placeId.trim()
        : undefined,
    lat: typeof source.lat === 'number' && Number.isFinite(source.lat) ? source.lat : undefined,
    lng: typeof source.lng === 'number' && Number.isFinite(source.lng) ? source.lng : undefined,
    phone:
      typeof source.phone === 'string' && source.phone.trim()
        ? source.phone.trim()
        : undefined,
    hours: Array.isArray(source.hours)
      ? source.hours
          .map((item) => String(item || '').trim())
          .filter((item) => item.length > 0)
      : undefined,
    logoUrl:
      typeof source.logoUrl === 'string' && source.logoUrl.trim()
        ? source.logoUrl.trim()
        : undefined,
    createdAt,
    updatedAt,
  }
}

function normalizeIngredientEntry(value: unknown): IngredientEntry | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const name = typeof source.name === 'string' ? source.name.trim() : ''
  if (!id || !name) return null
  const createdAt =
    typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString()
  const updatedAt =
    typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt
  return {
    id,
    name,
    defaultUnit:
      typeof source.defaultUnit === 'string' ? source.defaultUnit.trim() : '',
    defaultStoreId:
      typeof source.defaultStoreId === 'string' ? source.defaultStoreId.trim() : '',
    category:
      typeof source.category === 'string' && source.category.trim()
        ? source.category.trim()
        : 'Other',
    createdAt,
    updatedAt,
  }
}

function normalizeRecipe(value: unknown): Recipe | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const rawName =
    typeof source.name === 'string'
      ? source.name
      : typeof source.title === 'string'
        ? source.title
        : ''
  const name = rawName.trim()
  if (!id || !name) return null

  const mealType = String(source.mealType || '').trim().toLowerCase()
  const normalizedMealType: Recipe['mealType'] =
    mealType === 'breakfast' ||
    mealType === 'lunch' ||
    mealType === 'dinner' ||
    mealType === 'snack'
      ? mealType
      : ''

  const servingsRaw = Number(source.servings)
  const servings = Number.isFinite(servingsRaw) && servingsRaw > 0 ? Math.round(servingsRaw) : 1
  const createdAt =
    typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString()
  const updatedAt =
    typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt

  const ingredientsSource = Array.isArray(source.ingredients) ? source.ingredients : []
  const ingredients: Ingredient[] = ingredientsSource
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const ingredient = item as Record<string, unknown>
      const ingredientName = String(ingredient.name || '').trim()
      if (!ingredientName) return null
      const qtyNum = Number(ingredient.qty)
      const storeId =
        typeof ingredient.storeId === 'string' && ingredient.storeId.trim()
          ? ingredient.storeId.trim()
          : undefined

      return {
        id:
          typeof ingredient.id === 'string' && ingredient.id.trim()
            ? ingredient.id.trim()
            : `${id}_ing_${index}`,
        name: ingredientName,
        qty: Number.isFinite(qtyNum) ? qtyNum : null,
        unit: String(ingredient.unit || '').trim(),
        store: String(ingredient.store || '').trim(),
        ...(storeId ? { storeId } : {}),
      }
    })
    .filter((value): value is Ingredient => Boolean(value))

  const stepsSource = Array.isArray(source.steps) ? source.steps : []
  const steps = stepsSource
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)

  return {
    id,
    name,
    description: String(source.description || '').trim(),
    mealType: normalizedMealType,
    servings,
    ingredients,
    steps,
    sourceUrl: String(source.sourceUrl || '').trim(),
    createdAt,
    updatedAt,
  }
}

function normalizeSnapshot(value: unknown): MealPlanSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const id = typeof source.id === 'string' ? source.id.trim() : ''
  const label = typeof source.label === 'string' ? source.label.trim() : ''
  if (!id || !label || !Array.isArray(source.meals)) return null
  const createdAt =
    typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString()
  const meals = source.meals
    .map((meal) => {
      if (!meal || typeof meal !== 'object') return null
      const mealSource = meal as Record<string, unknown>
      const day = String(mealSource.day || '').trim().toLowerCase()
      const slot = String(mealSource.slot || '').trim().toLowerCase()
      if (
        !DAY_OF_WEEK_VALUES.includes(day as DayOfWeek) ||
        !MEAL_SLOT_VALUES.includes(slot as MealSlot)
      ) {
        return null
      }
      const recipeId = String(mealSource.recipeId || '').trim()
      const recipeName = String(mealSource.recipeName || '').trim()
      if (!recipeId || !recipeName) return null
      return {
        day: day as DayOfWeek,
        slot: slot as MealSlot,
        recipeId,
        recipeName,
        storeIds: Array.isArray(mealSource.storeIds)
          ? mealSource.storeIds
              .map((item) => String(item || '').trim())
              .filter((item) => item.length > 0)
          : [],
        storeNames: Array.isArray(mealSource.storeNames)
          ? mealSource.storeNames
              .map((item) => String(item || '').trim())
              .filter((item) => item.length > 0)
          : [],
      }
    })
    .filter((value): value is MealPlanSnapshot['meals'][number] => value !== null)

  return {
    id,
    createdAt,
    label,
    meals,
  }
}

function normalizeBootstrapPayload(payload: PlannerBootstrapResponse): StoreState {
  return {
    recipes: Array.isArray(payload.recipes)
      ? payload.recipes.map((item) => normalizeRecipe(item)).filter((item): item is Recipe => item !== null)
      : [],
    mealPlan: normalizeMealPlan(payload.mealPlan),
    mealPlanSnapshots: Array.isArray(payload.mealPlanSnapshots)
      ? payload.mealPlanSnapshots
          .map((item) => normalizeSnapshot(item))
          .filter((item): item is MealPlanSnapshot => item !== null)
      : [],
    groceryStores: Array.isArray(payload.groceryStores)
      ? payload.groceryStores
          .map((item) => normalizeStore(item))
          .filter((item): item is GroceryStore => item !== null)
      : [],
    ingredientEntries: Array.isArray(payload.ingredientEntries)
      ? payload.ingredientEntries
          .map((item) => normalizeIngredientEntry(item))
          .filter((item): item is IngredientEntry => item !== null)
      : [],
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readKnownArray<T>(key: string, normalizer: (value: unknown) => T | null): T[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(key)
  const parsed = parseJson(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.map((value) => normalizer(value)).filter((value): value is T => value !== null)
}

function normalizeLegacyMealPlan(raw: unknown): MealPlan {
  const next = createEmptyMealPlan()
  if (!raw || typeof raw !== 'object') return next
  const source = raw as Record<string, unknown>
  for (const day of DAY_OF_WEEK_VALUES) {
    const dayPlan = source[day]
    if (!dayPlan || typeof dayPlan !== 'object') continue
    const daySource = dayPlan as Record<string, unknown>
    const meals = daySource.meals && typeof daySource.meals === 'object'
      ? (daySource.meals as Record<string, unknown>)
      : daySource
    for (const slot of MEAL_SLOT_VALUES) {
      const slotValue = meals[slot]
      if (typeof slotValue === 'string' && slotValue.trim()) {
        next[day][slot] = slotValue.trim()
        continue
      }
      if (slotValue && typeof slotValue === 'object') {
        const recipeId = String((slotValue as Record<string, unknown>).recipeId || '').trim()
        next[day][slot] = recipeId || null
      }
    }
  }
  return next
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

function extractLegacyStateCandidate(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  let best: { score: number; state: Record<string, unknown> } | null = null

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key) continue
    const parsed = parseJson(window.localStorage.getItem(key))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    const state = parsed as Record<string, unknown>
    const score =
      (Array.isArray(state.recipes) ? state.recipes.length : 0) +
      (state.weekPlan && typeof state.weekPlan === 'object' ? 5 : 0) +
      (state.mealPlan && typeof state.mealPlan === 'object' ? 5 : 0) +
      (Array.isArray(state.stores) ? state.stores.length : 0) +
      (state.storeProfiles && typeof state.storeProfiles === 'object' ? 3 : 0)
    if (score <= 0) continue
    if (!best || score > best.score) {
      best = { score, state }
    }
  }

  return best?.state || null
}

function normalizeLegacyStores(candidate: Record<string, unknown>): GroceryStore[] {
  const byId = new Map<string, GroceryStore>()
  const now = new Date().toISOString()

  const legacyNames = Array.isArray(candidate.stores) ? candidate.stores : []
  for (const value of legacyNames) {
    const name = String(value || '').trim()
    if (!name || name === 'Unassigned') continue
    const id = `store_${slugify(name)}`
    byId.set(id, {
      id,
      name,
      address: '',
      createdAt: now,
      updatedAt: now,
    })
  }

  const profiles =
    candidate.storeProfiles && typeof candidate.storeProfiles === 'object'
      ? (candidate.storeProfiles as Record<string, unknown>)
      : {}
  for (const [storeName, details] of Object.entries(profiles)) {
    const name = String(storeName || '').trim()
    if (!name) continue
    const source =
      details && typeof details === 'object' ? (details as Record<string, unknown>) : {}
    const id = `store_${slugify(name)}`
    byId.set(id, {
      id,
      name: String(source.displayName || name).trim() || name,
      address: String(source.address || '').trim(),
      phone: String(source.phone || '').trim() || undefined,
      logoUrl: String(source.logoUrl || '').trim() || undefined,
      placeId: String(source.googlePlaceId || '').trim() || undefined,
      createdAt: now,
      updatedAt: now,
    })
  }

  return Array.from(byId.values())
}

function normalizeLegacyRecipes(
  candidate: Record<string, unknown>,
  stores: GroceryStore[]
): Recipe[] {
  const recipesRaw = Array.isArray(candidate.recipes) ? candidate.recipes : []
  const storeIdByName = new Map<string, string>()
  for (const store of stores) {
    storeIdByName.set(store.name.trim().toLowerCase(), store.id)
  }

  return recipesRaw
    .map((value, index) => {
      if (!value || typeof value !== 'object') return null
      const source = value as Record<string, unknown>
      const parsed = normalizeRecipe({
        ...source,
        id:
          typeof source.id === 'string' && source.id.trim()
            ? source.id
            : `recipe_legacy_${index}`,
        name:
          typeof source.name === 'string' && source.name.trim()
            ? source.name
            : String(source.title || '').trim(),
        ingredients: Array.isArray(source.ingredients)
          ? source.ingredients.map((ingredient, ingredientIndex) => {
              if (!ingredient || typeof ingredient !== 'object') return ingredient
              const row = ingredient as Record<string, unknown>
              const storeName = String(row.store || '').trim()
              const inferredStoreId =
                typeof row.storeId === 'string' && row.storeId.trim()
                  ? row.storeId.trim()
                  : storeIdByName.get(storeName.toLowerCase())
              return {
                ...row,
                id:
                  typeof row.id === 'string' && row.id.trim()
                    ? row.id
                    : `ing_legacy_${index}_${ingredientIndex}`,
                storeId: inferredStoreId,
              }
            })
          : [],
      })
      return parsed
    })
    .filter((item): item is Recipe => item !== null)
}

function normalizeLegacyIngredientEntries(
  candidate: Record<string, unknown>,
  stores: GroceryStore[]
): IngredientEntry[] {
  const now = new Date().toISOString()
  const storeIdByName = new Map<string, string>()
  for (const store of stores) {
    storeIdByName.set(store.name.trim().toLowerCase(), store.id)
  }
  const catalog =
    candidate.ingredientCatalog && typeof candidate.ingredientCatalog === 'object'
      ? (candidate.ingredientCatalog as Record<string, unknown>)
      : {}
  const entries: IngredientEntry[] = []
  let index = 0
  for (const [nameRaw, value] of Object.entries(catalog)) {
    const name = String(nameRaw || '').trim().toLowerCase()
    if (!name) continue
    let storeName = ''
    if (typeof value === 'string') {
      storeName = value.trim()
    } else if (value && typeof value === 'object') {
      storeName = String((value as Record<string, unknown>).store || '').trim()
    }
    const defaultStoreId = storeIdByName.get(storeName.toLowerCase()) || ''
    entries.push({
      id: `ie_legacy_${index}`,
      name,
      defaultUnit: '',
      defaultStoreId,
      category: 'Other',
      createdAt: now,
      updatedAt: now,
    })
    index += 1
  }
  return entries
}

function hasMeaningfulMealPlan(mealPlan: MealPlan): boolean {
  for (const day of DAY_OF_WEEK_VALUES) {
    for (const slot of MEAL_SLOT_VALUES) {
      if (mealPlan[day][slot]) return true
    }
  }
  return false
}

function collectLocalMigrationPayload(): LocalStorageMigrationPayload {
  const knownStores = readKnownArray(LEGACY_STORES_KEY, normalizeStore)
  const knownEntries = readKnownArray(LEGACY_INGREDIENT_ENTRIES_KEY, normalizeIngredientEntry)
  const knownSnapshots = readKnownArray(LEGACY_SNAPSHOTS_KEY, normalizeSnapshot).slice(
    0,
    MAX_LEGACY_SNAPSHOT_IMPORT
  )

  const payload: LocalStorageMigrationPayload = {}
  if (knownStores.length > 0) payload.groceryStores = knownStores
  if (knownEntries.length > 0) payload.ingredientEntries = knownEntries
  if (knownSnapshots.length > 0) payload.mealPlanSnapshots = knownSnapshots

  const legacyCandidate = extractLegacyStateCandidate()
  if (legacyCandidate) {
    const legacyStores = normalizeLegacyStores(legacyCandidate)
    const stores = payload.groceryStores && payload.groceryStores.length > 0
      ? payload.groceryStores
      : legacyStores
    if (!payload.groceryStores && stores.length > 0) {
      payload.groceryStores = stores
    }

    if (!payload.recipes || payload.recipes.length === 0) {
      const recipes = normalizeLegacyRecipes(legacyCandidate, stores)
      if (recipes.length > 0) payload.recipes = recipes
    }
    if (!payload.ingredientEntries || payload.ingredientEntries.length === 0) {
      const entries = normalizeLegacyIngredientEntries(legacyCandidate, stores)
      if (entries.length > 0) payload.ingredientEntries = entries
    }

    const mealPlan = normalizeLegacyMealPlan(
      legacyCandidate.mealPlan || legacyCandidate.weekPlan
    )
    if (hasMeaningfulMealPlan(mealPlan)) {
      payload.mealPlan = mealPlan
    }
  }

  return payload
}

function hasMigrationData(payload: LocalStorageMigrationPayload): boolean {
  return Boolean(
    (payload.recipes && payload.recipes.length > 0) ||
      (payload.groceryStores && payload.groceryStores.length > 0) ||
      (payload.ingredientEntries && payload.ingredientEntries.length > 0) ||
      (payload.mealPlanSnapshots && payload.mealPlanSnapshots.length > 0) ||
      (payload.mealPlan && hasMeaningfulMealPlan(payload.mealPlan))
  )
}

function markMigrationComplete() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MIGRATION_MARKER_KEY, 'done')
}

function hasCompletedMigration(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(MIGRATION_MARKER_KEY) === 'done'
}

async function bootstrapFromBackend(): Promise<void> {
  status = { ...status, loading: true, error: null }
  emitChange()

  let bootstrap = await requestJson<PlannerBootstrapResponse>('/api/planner/bootstrap')

  if (!hasCompletedMigration() && bootstrap.meta.isEmpty) {
    const migrationPayload = collectLocalMigrationPayload()
    if (hasMigrationData(migrationPayload)) {
      try {
        const migrationResult = await requestJson<{ imported: boolean; reason?: string }>(
          '/api/migrations/local-storage',
          {
            method: 'POST',
            body: JSON.stringify(migrationPayload),
          }
        )
        if (migrationResult.imported) {
          bootstrap = await requestJson<PlannerBootstrapResponse>('/api/planner/bootstrap')
        }
        if (migrationResult.imported || migrationResult.reason === 'not_empty') {
          markMigrationComplete()
        }
      } catch {
        // Fall through with empty bootstrap if migration fails.
      }
    } else {
      markMigrationComplete()
    }
  }

  store = normalizeBootstrapPayload(bootstrap)
  status = { loading: false, hydrated: true, error: null }
  emitChange()
}

async function hydrateStore(): Promise<void> {
  if (typeof window === 'undefined') {
    status = { loading: false, hydrated: true, error: null }
    return
  }
  if (!hydratePromise) {
    hydratePromise = bootstrapFromBackend().catch((error) => {
      status = {
        loading: false,
        hydrated: true,
        error: normalizeErrorMessage(error),
      }
      emitChange()
      throw error
    })
  }
  await hydratePromise.catch(() => undefined)
}

function ensureHydrated() {
  if (typeof window === 'undefined') return
  if (!hydratePromise) {
    void hydrateStore()
  }
}

export async function refreshFromServer(): Promise<void> {
  hydratePromise = null
  await hydrateStore()
}

export async function addRecipe(recipe: Recipe): Promise<Recipe> {
  await hydrateStore()
  const created = await requestJson<Recipe>('/api/recipes', {
    method: 'POST',
    body: JSON.stringify(recipe),
  })
  store = {
    ...store,
    recipes: [...store.recipes.filter((item) => item.id !== created.id), created],
  }
  emitChange()
  return created
}

export async function updateRecipe(recipe: Recipe): Promise<Recipe> {
  await hydrateStore()
  const updated = await requestJson<Recipe>(`/api/recipes/${encodeURIComponent(recipe.id)}`, {
    method: 'PUT',
    body: JSON.stringify(recipe),
  })
  store = {
    ...store,
    recipes: store.recipes.map((item) => (item.id === updated.id ? updated : item)),
  }
  emitChange()
  return updated
}

export async function deleteRecipe(id: string): Promise<void> {
  await hydrateStore()
  await requestJson<{ ok: boolean }>(`/api/recipes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  const mealPlan = normalizeMealPlan(store.mealPlan)
  for (const day of DAY_OF_WEEK_VALUES) {
    for (const slot of MEAL_SLOT_VALUES) {
      if (mealPlan[day][slot] === id) {
        mealPlan[day][slot] = null
      }
    }
  }

  store = {
    ...store,
    recipes: store.recipes.filter((item) => item.id !== id),
    mealPlan,
  }
  emitChange()
}

export async function setMealSlot(
  day: DayOfWeek,
  slot: MealSlot,
  recipeId: string | null
): Promise<void> {
  await hydrateStore()
  const payload = await requestJson<{ mealPlan: MealPlan }>('/api/meal-plan/slot', {
    method: 'PUT',
    body: JSON.stringify({ day, slot, recipeId }),
  })
  store = {
    ...store,
    mealPlan: normalizeMealPlan(payload.mealPlan),
  }
  emitChange()
}

export async function clearMealPlan(): Promise<void> {
  await hydrateStore()
  const payload = await requestJson<{ mealPlan: MealPlan }>('/api/meal-plan/clear', {
    method: 'POST',
    body: '{}',
  })
  store = {
    ...store,
    mealPlan: normalizeMealPlan(payload.mealPlan),
  }
  emitChange()
}

export async function saveMealPlanSnapshot(label?: string): Promise<MealPlanSnapshot | null> {
  await hydrateStore()
  try {
    const snapshot = await requestJson<MealPlanSnapshot>('/api/meal-plan/snapshots', {
      method: 'POST',
      body: JSON.stringify({ label }),
    })
    store = {
      ...store,
      mealPlanSnapshots: [snapshot, ...store.mealPlanSnapshots.filter((item) => item.id !== snapshot.id)],
    }
    emitChange()
    return snapshot
  } catch (error) {
    const message = normalizeErrorMessage(error)
    if (message.toLowerCase().includes('no meals')) {
      return null
    }
    throw error
  }
}

export async function deleteMealPlanSnapshot(id: string): Promise<void> {
  await hydrateStore()
  await requestJson<{ ok: boolean }>(`/api/meal-plan/snapshots/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  store = {
    ...store,
    mealPlanSnapshots: store.mealPlanSnapshots.filter((item) => item.id !== id),
  }
  emitChange()
}

export async function addGroceryStore(groceryStore: GroceryStore): Promise<GroceryStore> {
  await hydrateStore()
  const created = await requestJson<GroceryStore>('/api/stores', {
    method: 'POST',
    body: JSON.stringify(groceryStore),
  })
  store = {
    ...store,
    groceryStores: [...store.groceryStores.filter((item) => item.id !== created.id), created],
  }
  emitChange()
  return created
}

export async function updateGroceryStore(groceryStore: GroceryStore): Promise<GroceryStore> {
  await hydrateStore()
  const updated = await requestJson<GroceryStore>(
    `/api/stores/${encodeURIComponent(groceryStore.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(groceryStore),
    }
  )
  store = {
    ...store,
    groceryStores: store.groceryStores.map((item) =>
      item.id === updated.id ? updated : item
    ),
  }
  emitChange()
  return updated
}

export async function deleteGroceryStore(id: string): Promise<void> {
  await hydrateStore()
  await requestJson<{ ok: boolean }>(`/api/stores/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  store = {
    ...store,
    groceryStores: store.groceryStores.filter((item) => item.id !== id),
    ingredientEntries: store.ingredientEntries.map((entry) =>
      entry.defaultStoreId === id
        ? { ...entry, defaultStoreId: '', updatedAt: new Date().toISOString() }
        : entry
    ),
    recipes: store.recipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient) =>
        ingredient.storeId === id
          ? { ...ingredient, storeId: undefined }
          : ingredient
      ),
    })),
  }
  emitChange()
}

export async function addIngredientEntry(entry: IngredientEntry): Promise<IngredientEntry> {
  await hydrateStore()
  const created = await requestJson<IngredientEntry>('/api/ingredients', {
    method: 'POST',
    body: JSON.stringify(entry),
  })
  store = {
    ...store,
    ingredientEntries: [
      ...store.ingredientEntries.filter((item) => item.id !== created.id),
      created,
    ],
  }
  emitChange()
  return created
}

export async function updateIngredientEntry(entry: IngredientEntry): Promise<IngredientEntry> {
  await hydrateStore()
  const updated = await requestJson<IngredientEntry>(
    `/api/ingredients/${encodeURIComponent(entry.id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(entry),
    }
  )
  store = {
    ...store,
    ingredientEntries: store.ingredientEntries.map((item) =>
      item.id === updated.id ? updated : item
    ),
  }
  emitChange()
  return updated
}

export async function deleteIngredientEntry(id: string): Promise<void> {
  await hydrateStore()
  await requestJson<{ ok: boolean }>(`/api/ingredients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  store = {
    ...store,
    ingredientEntries: store.ingredientEntries.filter((item) => item.id !== id),
  }
  emitChange()
}

export function useStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    ensureHydrated()
  }, [])
  return snapshot
}

export function useStoreStatus() {
  const snapshot = useSyncExternalStore(subscribe, getStatusSnapshot, getStatusSnapshot)
  useEffect(() => {
    ensureHydrated()
  }, [])
  return snapshot
}

export function useRecipes() {
  return useStore().recipes
}

export function useMealPlan() {
  return useStore().mealPlan
}

export function useMealPlanSnapshots() {
  return useStore().mealPlanSnapshots
}

export function useGroceryStores() {
  return useStore().groceryStores
}

export function useIngredientEntries() {
  return useStore().ingredientEntries
}

export function getRecipeById(recipes: Recipe[], id: string): Recipe | undefined {
  return recipes.find((recipe) => recipe.id === id)
}

export function getStoreById(stores: GroceryStore[], id: string): GroceryStore | undefined {
  return stores.find((storeItem) => storeItem.id === id)
}
