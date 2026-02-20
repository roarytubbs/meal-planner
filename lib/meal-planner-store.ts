import { useEffect, useSyncExternalStore } from 'react'
import type {
  DayOfWeek,
  GroceryStore,
  Ingredient,
  IngredientEntry,
  LegacyMealSlot,
  LocalStorageMigrationPayload,
  MealPlan,
  MealPlanSlotEntry,
  MealSelection,
  MealPlanSnapshot,
  MealSlot,
  PlannerBootstrapResponse,
  Recipe,
} from './types'
import {
  addDays,
  DAY_OF_WEEK_VALUES,
  LEGACY_MEAL_SLOT_VALUES,
  MEAL_SELECTION_VALUES,
  MEAL_SLOT_VALUES,
  toDateKey,
  createEmptyMealPlan,
} from './types'
import {
  applyDefaultStoresToIngredients,
  buildDefaultStoreIdByIngredientName,
  buildStoreNameById,
} from './ingredient-store-mapping'

interface StoreState {
  recipes: Recipe[]
  mealPlanSlots: MealPlanSlotEntry[]
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
  mealPlanSlots: [],
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

function applyIngredientEntryStoreDefaultsToRecipes(
  recipes: Recipe[],
  entries: IngredientEntry[],
  stores: GroceryStore[]
): Recipe[] {
  const defaultStoreIdByName = buildDefaultStoreIdByIngredientName(entries)
  if (defaultStoreIdByName.size === 0) return recipes

  const storeNameById = buildStoreNameById(stores)
  let changed = false

  const nextRecipes = recipes.map((recipe) => {
    const nextIngredients = applyDefaultStoresToIngredients(
      recipe.ingredients,
      defaultStoreIdByName,
      storeNameById
    )
    if (nextIngredients === recipe.ingredients) return recipe
    changed = true
    return {
      ...recipe,
      ingredients: nextIngredients,
    }
  })

  return changed ? nextRecipes : recipes
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

async function refreshIngredientEntriesFromServer(): Promise<void> {
  try {
    const entries = await requestJson<IngredientEntry[]>('/api/ingredients')
    store = {
      ...store,
      ingredientEntries: entries
        .map((entry) => normalizeIngredientEntry(entry))
        .filter((entry): entry is IngredientEntry => entry !== null),
    }
    emitChange()
  } catch {
    // Preserve successful recipe saves even if ingredient entry refresh fails.
  }
}

function normalizeMealPlanSelection(input: unknown): MealSelection {
  const value = String(input || '')
    .trim()
    .toLowerCase()
  return MEAL_SELECTION_VALUES.includes(value as MealSelection)
    ? (value as MealSelection)
    : 'recipe'
}

function getCurrentWeekDateKeyByDay(): Record<DayOfWeek, string> {
  const now = new Date()
  const weekday = (now.getDay() + 6) % 7
  const monday = addDays(now, -weekday)
  return DAY_OF_WEEK_VALUES.reduce<Record<DayOfWeek, string>>((map, day, index) => {
    map[day] = toDateKey(addDays(monday, index))
    return map
  }, {} as Record<DayOfWeek, string>)
}

function toWeeklyMealPlan(mealPlanSlots: MealPlanSlotEntry[]): MealPlan {
  const next = createEmptyMealPlan()
  const dayByDateKey = new Map<string, DayOfWeek>()
  const dateByDay = getCurrentWeekDateKeyByDay()
  for (const day of DAY_OF_WEEK_VALUES) {
    dayByDateKey.set(dateByDay[day], day)
  }

  for (const entry of mealPlanSlots) {
    if (entry.selection !== 'recipe' || !entry.recipeId) continue
    const day = dayByDateKey.get(entry.dateKey)
    if (!day) continue
    if (!LEGACY_MEAL_SLOT_VALUES.includes(entry.slot as LegacyMealSlot)) continue
    next[day][entry.slot as LegacyMealSlot] = entry.recipeId
  }
  return next
}

function normalizeMealPlanSlots(input: unknown): MealPlanSlotEntry[] {
  if (!Array.isArray(input)) return []
  const slots = input
    .map((value) => {
      if (!value || typeof value !== 'object') return null
      const source = value as Record<string, unknown>
      const dateKey = String(source.dateKey || '').trim()
      const slot = String(source.slot || '')
        .trim()
        .toLowerCase()
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateKey)) return null
      if (!MEAL_SLOT_VALUES.includes(slot as MealSlot)) return null

      const selection = normalizeMealPlanSelection(source.selection)
      const recipeIdRaw = String(source.recipeId || '').trim()
      const recipeId = selection === 'recipe' ? recipeIdRaw || null : null
      if (selection === 'recipe' && !recipeId) return null

      return {
        dateKey,
        slot: slot as MealSlot,
        selection,
        recipeId,
        updatedAt:
          typeof source.updatedAt === 'string' && source.updatedAt
            ? source.updatedAt
            : new Date().toISOString(),
      }
    })
    .filter((value): value is MealPlanSlotEntry => value !== null)

  slots.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey)
    return a.slot.localeCompare(b.slot)
  })
  return slots
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
  const onlineOrderingProvider =
    typeof source.onlineOrderingProvider === 'string' &&
    source.onlineOrderingProvider.trim().toLowerCase() === 'target'
      ? 'target'
      : undefined
  const onlineOrderingSource =
    source.onlineOrderingConfig &&
    typeof source.onlineOrderingConfig === 'object' &&
    !Array.isArray(source.onlineOrderingConfig)
      ? (source.onlineOrderingConfig as Record<string, unknown>)
      : null
  const targetStoreId =
    onlineOrderingSource && typeof onlineOrderingSource.targetStoreId === 'string'
      ? onlineOrderingSource.targetStoreId.trim()
      : ''
  const onlineOrderingConfig = targetStoreId ? { targetStoreId } : undefined
  const supportsOnlineOrdering = Boolean(
    source.supportsOnlineOrdering === true &&
      onlineOrderingProvider === 'target' &&
      onlineOrderingConfig?.targetStoreId
  )

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
    supportsOnlineOrdering,
    onlineOrderingProvider: supportsOnlineOrdering
      ? onlineOrderingProvider
      : undefined,
    onlineOrderingConfig: supportsOnlineOrdering ? onlineOrderingConfig : undefined,
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
      const rawQty = ingredient.qty
      let qty: number | null = null
      if (typeof rawQty === 'number' && Number.isFinite(rawQty) && rawQty > 0) {
        qty = Math.round(rawQty * 1000) / 1000
      } else if (typeof rawQty === 'string' && rawQty.trim().length > 0) {
        const parsedQty = Number(rawQty)
        if (Number.isFinite(parsedQty) && parsedQty > 0) {
          qty = Math.round(parsedQty * 1000) / 1000
        }
      }
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
        qty,
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
    imageUrl: String(source.imageUrl || '').trim() || undefined,
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
      const day = String(mealSource.day || '')
        .trim()
        .toLowerCase()
      const slot = String(mealSource.slot || '').trim().toLowerCase()
      if (!day || !MEAL_SLOT_VALUES.includes(slot as MealSlot)) {
        return null
      }
      const selection = normalizeMealPlanSelection(mealSource.selection)
      const recipeIdRaw = String(mealSource.recipeId || '').trim()
      const recipeNameRaw = String(mealSource.recipeName || '').trim()
      const recipeId = selection === 'recipe' ? recipeIdRaw || null : null
      const recipeName = selection === 'recipe' ? recipeNameRaw || null : null
      if (selection === 'recipe' && (!recipeId || !recipeName)) return null
      return {
        day,
        slot: slot as MealSlot,
        selection,
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
    description:
      typeof source.description === 'string' ? source.description.trim() : '',
    isActive: source.isActive === true,
    activatedAt:
      typeof source.activatedAt === 'string' && source.activatedAt.trim()
        ? source.activatedAt.trim()
        : undefined,
    meals,
  }
}

function applySnapshotToStore(snapshot: MealPlanSnapshot): void {
  const normalizedSnapshot = normalizeSnapshot(snapshot)
  if (!normalizedSnapshot) return
  const nextSnapshots = store.mealPlanSnapshots
    .filter((item) => item.id !== normalizedSnapshot.id)
    .map((item) =>
      normalizedSnapshot.isActive ? { ...item, isActive: false } : item
    )
  store = {
    ...store,
    mealPlanSnapshots: [normalizedSnapshot, ...nextSnapshots],
  }
  emitChange()
}

function normalizeBootstrapPayload(payload: PlannerBootstrapResponse): StoreState {
  return {
    recipes: Array.isArray(payload.recipes)
      ? payload.recipes.map((item) => normalizeRecipe(item)).filter((item): item is Recipe => item !== null)
      : [],
    mealPlanSlots: normalizeMealPlanSlots(payload.mealPlanSlots),
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
    for (const slot of LEGACY_MEAL_SLOT_VALUES) {
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
      supportsOnlineOrdering: false,
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
      supportsOnlineOrdering: false,
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
    for (const slot of LEGACY_MEAL_SLOT_VALUES) {
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
  await refreshIngredientEntriesFromServer()
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
  await refreshIngredientEntriesFromServer()
  return updated
}

export async function deleteRecipe(id: string): Promise<void> {
  await hydrateStore()
  await requestJson<{ ok: boolean }>(`/api/recipes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  store = {
    ...store,
    recipes: store.recipes.filter((item) => item.id !== id),
    mealPlanSlots: store.mealPlanSlots.filter((slot) => slot.recipeId !== id),
  }
  emitChange()
}

export async function setMealSlot(
  dateKey: string,
  slot: MealSlot,
  selection: MealSelection | null,
  recipeId: string | null
): Promise<void> {
  await hydrateStore()
  const payload = await requestJson<{ mealPlanSlots: MealPlanSlotEntry[] }>('/api/meal-plan/slot', {
    method: 'PUT',
    body: JSON.stringify({ dateKey, slot, selection, recipeId }),
  })
  store = {
    ...store,
    mealPlanSlots: normalizeMealPlanSlots(payload.mealPlanSlots),
  }
  emitChange()
}

export async function replaceMealPlanSlots(slots: Array<{
  dateKey: string
  slot: MealSlot
  selection: MealSelection | null
  recipeId: string | null
}>): Promise<void> {
  await hydrateStore()
  const payload = await requestJson<{ mealPlanSlots: MealPlanSlotEntry[] }>('/api/meal-plan', {
    method: 'PUT',
    body: JSON.stringify({ slots }),
  })
  store = {
    ...store,
    mealPlanSlots: normalizeMealPlanSlots(payload.mealPlanSlots),
  }
  emitChange()
}

export async function replaceMealPlan(mealPlan: MealPlan): Promise<void> {
  const dateByDay = getCurrentWeekDateKeyByDay()
  const slots = DAY_OF_WEEK_VALUES.flatMap((day) =>
    MEAL_SLOT_VALUES.map((slot) => ({
      dateKey: dateByDay[day],
      slot,
      selection: mealPlan[day][slot] ? ('recipe' as const) : null,
      recipeId: mealPlan[day][slot],
    }))
  )
  await replaceMealPlanSlots(slots)
}

export async function clearMealPlan(input?: {
  startDate?: string
  days?: number
}): Promise<void> {
  await hydrateStore()
  const payload = await requestJson<{ mealPlanSlots: MealPlanSlotEntry[] }>('/api/meal-plan/clear', {
    method: 'POST',
    body: JSON.stringify({
      startDate: input?.startDate,
      days: input?.days,
    }),
  })
  store = {
    ...store,
    mealPlanSlots: normalizeMealPlanSlots(payload.mealPlanSlots),
  }
  emitChange()
}

export async function saveMealPlanSnapshot(input?: {
  label?: string
  description?: string
  startDate?: string
  days?: number
}): Promise<MealPlanSnapshot | null> {
  await hydrateStore()
  try {
    const snapshot = await requestJson<MealPlanSnapshot>('/api/meal-plan/snapshots', {
      method: 'POST',
      body: JSON.stringify({
        label: input?.label,
        description: input?.description,
        startDate: input?.startDate,
        days: input?.days,
      }),
    })
    applySnapshotToStore(snapshot)
    return snapshot
  } catch (error) {
    const message = normalizeErrorMessage(error)
    if (message.toLowerCase().includes('no meals')) {
      return null
    }
    throw error
  }
}

export async function activateMealPlanSnapshot(id: string): Promise<MealPlanSnapshot> {
  await hydrateStore()
  const snapshot = await requestJson<MealPlanSnapshot>(
    `/api/meal-plan/snapshots/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action: 'activate' }),
    }
  )
  applySnapshotToStore(snapshot)
  return snapshot
}

export async function deleteMealPlanSnapshot(id: string): Promise<void> {
  await hydrateStore()
  const payload = await requestJson<{ ok: boolean; nextActiveSnapshotId?: string | null }>(
    `/api/meal-plan/snapshots/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  )
  const nextActiveSnapshotId = payload.nextActiveSnapshotId || null
  store = {
    ...store,
    mealPlanSnapshots: store.mealPlanSnapshots
      .filter((item) => item.id !== id)
      .map((item) => ({
        ...item,
        isActive: Boolean(nextActiveSnapshotId && item.id === nextActiveSnapshotId),
      })),
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
    recipes: applyIngredientEntryStoreDefaultsToRecipes(
      store.recipes,
      [updated],
      store.groceryStores
    ),
  }
  emitChange()
  return updated
}

export async function bulkUpdateIngredientDefaultStore(
  ingredientIds: string[],
  defaultStoreId: string
): Promise<IngredientEntry[]> {
  await hydrateStore()
  const payload = await requestJson<{ ingredientEntries?: IngredientEntry[] }>(
    '/api/ingredients/default-store',
    {
      method: 'PUT',
      body: JSON.stringify({
        ingredientIds,
        defaultStoreId,
      }),
    }
  )

  const updatedEntries = Array.isArray(payload.ingredientEntries)
    ? payload.ingredientEntries
    : []
  if (updatedEntries.length === 0) return []

  const byId = new Map(updatedEntries.map((entry) => [entry.id, entry]))
  store = {
    ...store,
    ingredientEntries: store.ingredientEntries.map(
      (item) => byId.get(item.id) ?? item
    ),
    recipes: applyIngredientEntryStoreDefaultsToRecipes(
      store.recipes,
      updatedEntries,
      store.groceryStores
    ),
  }
  emitChange()
  return updatedEntries
}

export async function bulkUpdateIngredientCategory(
  ingredientIds: string[],
  category: string
): Promise<IngredientEntry[]> {
  await hydrateStore()
  const payload = await requestJson<{ ingredientEntries?: IngredientEntry[] }>(
    '/api/ingredients/category',
    {
      method: 'PUT',
      body: JSON.stringify({
        ingredientIds,
        category,
      }),
    }
  )

  const updatedEntries = Array.isArray(payload.ingredientEntries)
    ? payload.ingredientEntries
    : []
  if (updatedEntries.length === 0) return []

  const byId = new Map(updatedEntries.map((entry) => [entry.id, entry]))
  store = {
    ...store,
    ingredientEntries: store.ingredientEntries.map(
      (item) => byId.get(item.id) ?? item
    ),
  }
  emitChange()
  return updatedEntries
}

export async function bulkDeleteIngredientEntries(
  ingredientIds: string[]
): Promise<number> {
  await hydrateStore()
  const payload = await requestJson<{ deletedCount?: number }>(
    '/api/ingredients/bulk-delete',
    {
      method: 'POST',
      body: JSON.stringify({ ingredientIds }),
    }
  )

  const ids = new Set(
    ingredientIds
      .map((id) => String(id || '').trim())
      .filter((id) => id.length > 0)
  )
  if (ids.size > 0) {
    store = {
      ...store,
      ingredientEntries: store.ingredientEntries.filter((item) => !ids.has(item.id)),
    }
    emitChange()
  }

  return Number(payload.deletedCount || 0)
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
  return useStore().mealPlanSlots
}

export function useMealPlanSlots() {
  return useStore().mealPlanSlots
}

export function useWeeklyMealPlan() {
  return toWeeklyMealPlan(useStore().mealPlanSlots)
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
