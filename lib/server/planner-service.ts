import { db } from '@/lib/server/db'
import { Prisma } from '@prisma/client'
import { parseIngredients } from '@/lib/ingredient-parser'
import {
  buildDateRange,
  DAY_OF_WEEK_VALUES,
  LEGACY_MEAL_SLOT_VALUES,
  MEAL_SLOT_VALUES,
  addDays,
  createEmptyMealPlan,
  parseDateKey,
  toDateKey,
  type DayOfWeek,
  type GroceryStore,
  type IngredientEntry,
  type LocalStorageMigrationPayload,
  type MealPlan,
  type MealPlanSlotEntry,
  type MealSelection,
  type MealPlanSnapshot,
  type MealPlanSnapshotMeal,
  type MealSlot,
  type OnlineOrderingConfig,
  type OnlineOrderProvider,
  type PlannerBootstrapResponse,
  type Recipe,
} from '@/lib/types'
import {
  applyDefaultStoresToIngredients,
  buildDefaultStoreIdByIngredientName,
  buildStoreNameById,
  normalizeIngredientNameForLookup,
} from '@/lib/ingredient-store-mapping'

function toIsoString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function sanitizeStringArray(value: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const filtered = value
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)
  return filtered.length > 0 ? filtered : undefined
}

function sanitizeStoreId(value: string | undefined): string {
  return value ? value.trim() : ''
}

const LEADING_INGREDIENT_MEASUREMENT_PATTERN =
  /^\s*(?:\d+(?:\.\d+)?|\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?:\s|$)/

function sanitizeIngredientQty(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value * 1000) / 1000
  return rounded > 0 ? rounded : null
}

function parseIngredientMeasurementFromName(rawName: string): {
  name: string
  qty: number | null
  unit: string
} | null {
  if (!LEADING_INGREDIENT_MEASUREMENT_PATTERN.test(rawName)) return null
  const parsed = parseIngredients(rawName)
  const first = parsed[0]
  if (!first) return null

  const name = String(first.name || '').trim()
  const unit = String(first.unit || '').trim()
  const qty = sanitizeIngredientQty(first.qty)
  if (!name) return null
  if (!unit && qty === null && name === rawName.trim()) return null

  return { name, qty, unit }
}

function normalizeRecipeIngredientForStorage(
  ingredient: Recipe['ingredients'][number]
): Recipe['ingredients'][number] {
  const rawName = String(ingredient.name || '').trim()
  const rawUnit = String(ingredient.unit || '').trim()
  const parsedFromName =
    sanitizeIngredientQty(ingredient.qty) === null && rawUnit.length === 0
      ? parseIngredientMeasurementFromName(rawName)
      : null

  const normalizedStoreId = sanitizeStoreId(ingredient.storeId)
  return {
    ...ingredient,
    name: parsedFromName?.name || rawName,
    qty: parsedFromName ? parsedFromName.qty : sanitizeIngredientQty(ingredient.qty),
    unit: parsedFromName?.unit || rawUnit,
    store: String(ingredient.store || '').trim(),
    storeId: normalizedStoreId || undefined,
  }
}

function normalizeRecipeForStorage(recipe: Recipe): Recipe {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) =>
      normalizeRecipeIngredientForStorage(ingredient)
    ),
  }
}

function sanitizeMealSlot(value: string | null | undefined): MealSlot | null {
  const normalized = String(value || '').trim().toLowerCase()
  return MEAL_SLOT_VALUES.includes(normalized as MealSlot)
    ? (normalized as MealSlot)
    : null
}

function sanitizeMealSelection(
  value: string | null | undefined
): MealSelection {
  const normalized = String(value || '').trim().toLowerCase()
  if (
    normalized === 'skip' ||
    normalized === 'eating_out' ||
    normalized === 'leftovers'
  ) {
    return normalized
  }
  return 'recipe'
}

function sanitizeOnlineOrderingProvider(
  value: string | null | undefined
): OnlineOrderProvider | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'target' ? 'target' : undefined
}

function sanitizeOnlineOrderingConfig(
  value: unknown
): OnlineOrderingConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  const targetStoreId = String(source.targetStoreId || '').trim()
  if (!targetStoreId) return undefined
  return { targetStoreId }
}

function normalizeOnlineOrderingFields(store: {
  supportsOnlineOrdering?: boolean
  onlineOrderingProvider?: string
  onlineOrderingConfig?: unknown
}): {
  supportsOnlineOrdering: boolean
  onlineOrderingProvider: OnlineOrderProvider | null
  onlineOrderingConfig: OnlineOrderingConfig | null
} {
  const provider = sanitizeOnlineOrderingProvider(store.onlineOrderingProvider)
  const config = sanitizeOnlineOrderingConfig(store.onlineOrderingConfig)
  const isEnabled = Boolean(store.supportsOnlineOrdering && provider && config)
  return {
    supportsOnlineOrdering: isEnabled,
    onlineOrderingProvider: isEnabled && provider ? provider : null,
    onlineOrderingConfig: isEnabled && config ? config : null,
  }
}

function toOnlineOrderingConfigInput(
  value: OnlineOrderingConfig | null
): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  if (!value) return Prisma.DbNull
  return { targetStoreId: value.targetStoreId }
}

function mapStore(row: {
  id: string
  name: string
  address: string
  placeId: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  hours: string[]
  logoUrl: string | null
  supportsOnlineOrdering: boolean
  onlineOrderingProvider: string | null
  onlineOrderingConfig: unknown
  createdAt: Date
  updatedAt: Date
}): GroceryStore {
  const onlineOrdering = normalizeOnlineOrderingFields({
    supportsOnlineOrdering: row.supportsOnlineOrdering,
    onlineOrderingProvider: row.onlineOrderingProvider || undefined,
    onlineOrderingConfig: row.onlineOrderingConfig,
  })

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    placeId: row.placeId || undefined,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    phone: row.phone || undefined,
    hours: sanitizeStringArray(row.hours),
    logoUrl: row.logoUrl || undefined,
    supportsOnlineOrdering: onlineOrdering.supportsOnlineOrdering,
    onlineOrderingProvider: onlineOrdering.onlineOrderingProvider || undefined,
    onlineOrderingConfig: onlineOrdering.onlineOrderingConfig || undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

function mapIngredientEntry(row: {
  id: string
  name: string
  defaultUnit: string
  defaultStoreId: string | null
  category: string
  createdAt: Date
  updatedAt: Date
}): IngredientEntry {
  return {
    id: row.id,
    name: row.name,
    defaultUnit: row.defaultUnit,
    defaultStoreId: row.defaultStoreId || '',
    category: row.category,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

function buildIngredientEntryId(seed: string, index: number): string {
  const cleanedSeed = seed
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `ie_recipe_${Date.now()}_${index}_${cleanedSeed || 'item'}_${Math.random()
    .toString(36)
    .slice(2, 7)}`
}

function normalizeStoreNameForLookup(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

interface IngredientEntryCandidate {
  name: string
  defaultUnit: string
  defaultStoreId: string
}

interface IngredientStoreSource {
  name: string
  unit: string
  storeId?: string | null
  store: string
}

function buildStoreIdByNameMap(stores: Array<{ id: string; name: string }>): Map<string, string> {
  const byName = new Map<string, string>()
  for (const store of stores) {
    const normalizedStoreName = normalizeStoreNameForLookup(store.name)
    if (!normalizedStoreName || byName.has(normalizedStoreName)) continue
    byName.set(normalizedStoreName, store.id)
  }
  return byName
}

function buildIngredientEntryCandidatesFromIngredients(
  ingredients: IngredientStoreSource[],
  storeIdByName: Map<string, string>
): Map<string, IngredientEntryCandidate> {
  const candidatesByName = new Map<string, IngredientEntryCandidate>()

  for (const ingredient of ingredients) {
    const name = normalizeIngredientNameForLookup(String(ingredient.name || ''))
    if (!name) continue

    const defaultUnit = String(ingredient.unit || '').trim()
    const explicitStoreId = sanitizeStoreId(
      typeof ingredient.storeId === 'string' ? ingredient.storeId : undefined
    )
    const inferredStoreId =
      explicitStoreId.length === 0
        ? storeIdByName.get(normalizeStoreNameForLookup(ingredient.store)) || ''
        : ''
    const defaultStoreId = explicitStoreId || inferredStoreId
    const existing = candidatesByName.get(name)

    if (!existing) {
      candidatesByName.set(name, {
        name,
        defaultUnit,
        defaultStoreId,
      })
      continue
    }

    if (!existing.defaultUnit && defaultUnit) {
      existing.defaultUnit = defaultUnit
    }
    if (!existing.defaultStoreId && defaultStoreId) {
      existing.defaultStoreId = defaultStoreId
    }
  }

  return candidatesByName
}

async function upsertIngredientEntriesFromCandidates(
  candidatesByName: Map<string, IngredientEntryCandidate>
): Promise<void> {
  const candidates = Array.from(candidatesByName.values())
  if (candidates.length === 0) return

  const candidateNames = candidates.map((candidate) => candidate.name)
  const existingEntries =
    candidateNames.length > 500
      ? await db.ingredientEntry.findMany({
          select: {
            id: true,
            name: true,
            defaultUnit: true,
            defaultStoreId: true,
          },
        })
      : await db.ingredientEntry.findMany({
          where: {
            OR: candidateNames.map((name) => ({
              name: { equals: name, mode: 'insensitive' as const },
            })),
          },
          select: {
            id: true,
            name: true,
            defaultUnit: true,
            defaultStoreId: true,
          },
        })

  const existingByName = new Map<
    string,
    { id: string; name: string; defaultUnit: string; defaultStoreId: string | null }
  >()
  for (const existing of existingEntries) {
    const normalized = normalizeIngredientNameForLookup(existing.name)
    if (!normalized || existingByName.has(normalized)) continue
    existingByName.set(normalized, existing)
  }

  const rowsToCreate: IngredientEntryCandidate[] = []
  const rowsToUpdate: Array<{ id: string; defaultUnit?: string; defaultStoreId?: string | null }> =
    []

  for (const candidate of candidates) {
    const existing = existingByName.get(candidate.name)
    if (!existing) {
      rowsToCreate.push(candidate)
      continue
    }

    const nextDefaultUnit =
      !existing.defaultUnit && candidate.defaultUnit ? candidate.defaultUnit : undefined
    const nextDefaultStoreId =
      !existing.defaultStoreId && candidate.defaultStoreId
        ? candidate.defaultStoreId
        : undefined

    if (!nextDefaultUnit && !nextDefaultStoreId) continue
    rowsToUpdate.push({
      id: existing.id,
      ...(nextDefaultUnit ? { defaultUnit: nextDefaultUnit } : {}),
      ...(nextDefaultStoreId ? { defaultStoreId: nextDefaultStoreId } : {}),
    })
  }

  if (rowsToCreate.length > 0) {
    const now = new Date()
    await db.ingredientEntry.createMany({
      data: rowsToCreate.map((candidate, index) => ({
        id: buildIngredientEntryId(candidate.name, index),
        name: candidate.name,
        defaultUnit: candidate.defaultUnit,
        defaultStoreId: candidate.defaultStoreId || null,
        category: 'Other',
        createdAt: now,
        updatedAt: now,
      })),
    })
  }

  if (rowsToUpdate.length > 0) {
    const now = new Date()
    await Promise.all(
      rowsToUpdate.map((row) =>
        db.ingredientEntry.update({
          where: { id: row.id },
          data: {
            ...(row.defaultUnit !== undefined ? { defaultUnit: row.defaultUnit } : {}),
            ...(row.defaultStoreId !== undefined
              ? { defaultStoreId: row.defaultStoreId }
              : {}),
            updatedAt: now,
          },
        })
      )
    )
  }
}

async function resolveIngredientDefaultStoreMaps(
  ingredientNames: string[]
): Promise<{
  defaultStoreIdByName: Map<string, string>
  storeNameById: Map<string, string>
}> {
  const normalizedNames = Array.from(
    new Set(
      ingredientNames
        .map((name) => normalizeIngredientNameForLookup(name))
        .filter((name) => name.length > 0)
    )
  )

  if (normalizedNames.length === 0) {
    return {
      defaultStoreIdByName: new Map(),
      storeNameById: new Map(),
    }
  }

  const entries = await db.ingredientEntry.findMany({
    where: {
      OR: normalizedNames.map((name) => ({
        name: { equals: name, mode: 'insensitive' as const },
      })),
    },
    select: {
      name: true,
      defaultStoreId: true,
    },
  })

  const defaultStoreIdByName = buildDefaultStoreIdByIngredientName(
    entries.map((entry) => ({
      name: entry.name,
      defaultStoreId: entry.defaultStoreId || '',
    }))
  )
  if (defaultStoreIdByName.size === 0) {
    return { defaultStoreIdByName, storeNameById: new Map() }
  }

  const storeIds = Array.from(new Set(defaultStoreIdByName.values()))
  const stores = await db.groceryStore.findMany({
    where: { id: { in: storeIds } },
    select: {
      id: true,
      name: true,
    },
  })

  return {
    defaultStoreIdByName,
    storeNameById: buildStoreNameById(stores),
  }
}

async function applyIngredientEntryDefaultsToRecipe(recipe: Recipe): Promise<Recipe> {
  if (recipe.ingredients.length === 0) {
    return recipe
  }

  const { defaultStoreIdByName, storeNameById } = await resolveIngredientDefaultStoreMaps(
    recipe.ingredients.map((ingredient) => ingredient.name)
  )
  if (defaultStoreIdByName.size === 0) {
    return recipe
  }

  const nextIngredients = applyDefaultStoresToIngredients(
    recipe.ingredients,
    defaultStoreIdByName,
    storeNameById
  )

  if (nextIngredients === recipe.ingredients) {
    return recipe
  }

  return {
    ...recipe,
    ingredients: nextIngredients,
  }
}

async function syncIngredientEntriesFromRecipe(recipe: Recipe): Promise<void> {
  const stores = await db.groceryStore.findMany({
    select: {
      id: true,
      name: true,
    },
  })
  const candidatesByName = buildIngredientEntryCandidatesFromIngredients(
    recipe.ingredients,
    buildStoreIdByNameMap(stores)
  )
  await upsertIngredientEntriesFromCandidates(candidatesByName)
}

function mapRecipe(row: {
  id: string
  name: string
  description: string
  mealType: string
  servings: number
  sourceUrl: string
  imageUrl: string | null
  createdAt: Date
  updatedAt: Date
  ingredients: Array<{
    id: string
    name: string
    qty: number | null
    unit: string
    store: string
    storeId: string | null
    position: number
  }>
  steps: Array<{
    text: string
    position: number
  }>
}): Recipe {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    mealType: row.mealType as Recipe['mealType'],
    servings: row.servings,
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl || undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    ingredients: row.ingredients
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        name: item.name,
        qty: sanitizeIngredientQty(item.qty),
        unit: item.unit,
        store: item.store,
        storeId: item.storeId || undefined,
      })),
    steps: row.steps
      .sort((a, b) => a.position - b.position)
      .map((step) => step.text),
  }
}

function mapSnapshotMeal(row: {
  dateKey: string
  slot: string
  selection: string
  recipeId: string | null
  recipeName: string | null
  storeIds: string[]
  storeNames: string[]
}): MealPlanSnapshotMeal | null {
  const slot = sanitizeMealSlot(row.slot)
  const dateKey = parseDateKey(row.dateKey) ? row.dateKey : null
  if (!slot || !dateKey) return null
  const selection = sanitizeMealSelection(row.selection)
  return {
    day: dateKey,
    slot,
    selection,
    recipeId: selection === 'recipe' ? row.recipeId : null,
    recipeName: selection === 'recipe' ? row.recipeName : null,
    storeIds: Array.isArray(row.storeIds) ? row.storeIds : [],
    storeNames: Array.isArray(row.storeNames) ? row.storeNames : [],
  }
}

function mapSnapshot(row: {
  id: string
  createdAt: Date
  label: string
  description: string
  isActive: boolean
  activatedAt: Date | null
  meals: Array<{
    dateKey: string
    slot: string
    selection: string
    recipeId: string | null
    recipeName: string | null
    storeIds: string[]
    storeNames: string[]
  }>
}): MealPlanSnapshot {
  return {
    id: row.id,
    createdAt: toIsoString(row.createdAt),
    label: row.label,
    description: row.description,
    isActive: row.isActive,
    activatedAt: row.activatedAt ? toIsoString(row.activatedAt) : undefined,
    meals: row.meals
      .map((meal) => mapSnapshotMeal(meal))
      .filter((meal): meal is MealPlanSnapshotMeal => meal !== null),
  }
}

function mapMealPlanSlot(row: {
  dateKey: string
  slot: string
  selection: string
  recipeId: string | null
  updatedAt: Date
}): MealPlanSlotEntry | null {
  const slot = sanitizeMealSlot(row.slot)
  if (!slot || !parseDateKey(row.dateKey)) return null
  const selection = sanitizeMealSelection(row.selection)

  if (selection === 'recipe' && !row.recipeId) {
    return null
  }

  return {
    dateKey: row.dateKey,
    slot,
    selection,
    recipeId: selection === 'recipe' ? row.recipeId : null,
    updatedAt: toIsoString(row.updatedAt),
  }
}

export async function plannerIsEmpty(): Promise<boolean> {
  const [recipeCount, storeCount, ingredientCount, slotCount, snapshotCount] =
    await Promise.all([
      db.recipe.count(),
      db.groceryStore.count(),
      db.ingredientEntry.count(),
      db.mealPlanSlot.count(),
      db.mealPlanSnapshot.count(),
    ])

  return (
    recipeCount === 0 &&
    storeCount === 0 &&
    ingredientCount === 0 &&
    slotCount === 0 &&
    snapshotCount === 0
  )
}

async function syncIngredientEntriesFromAllRecipes(): Promise<void> {
  const [stores, recipeIngredients] = await Promise.all([
    db.groceryStore.findMany({
      select: {
        id: true,
        name: true,
      },
    }),
    db.recipeIngredient.findMany({
      select: {
        name: true,
        unit: true,
        storeId: true,
        store: true,
      },
    }),
  ])

  if (recipeIngredients.length === 0) return

  const candidatesByName = buildIngredientEntryCandidatesFromIngredients(
    recipeIngredients,
    buildStoreIdByNameMap(stores)
  )
  await upsertIngredientEntriesFromCandidates(candidatesByName)
}

async function normalizeInvalidRecipeIngredientQuantities(): Promise<void> {
  await db.recipeIngredient.updateMany({
    where: {
      qty: { lte: 0 },
    },
    data: {
      qty: null,
    },
  })
}

async function backfillRecipeIngredientMeasurements(): Promise<void> {
  const candidates = await db.recipeIngredient.findMany({
    where: {
      qty: null,
      unit: '',
    },
    select: {
      id: true,
      name: true,
      qty: true,
      unit: true,
    },
  })
  if (candidates.length === 0) return

  const updates: Array<{ id: string; name: string; qty: number | null; unit: string }> = []
  for (const candidate of candidates) {
    const parsed = parseIngredientMeasurementFromName(candidate.name)
    if (!parsed) continue
    if (
      parsed.name === candidate.name &&
      parsed.unit === candidate.unit &&
      parsed.qty === sanitizeIngredientQty(candidate.qty)
    ) {
      continue
    }
    updates.push({
      id: candidate.id,
      name: parsed.name,
      qty: parsed.qty,
      unit: parsed.unit,
    })
  }

  if (updates.length === 0) return

  await Promise.all(
    updates.map((update) =>
      db.recipeIngredient.update({
        where: { id: update.id },
        data: {
          name: update.name,
          qty: update.qty,
          unit: update.unit,
        },
      })
    )
  )
}

export async function getPlannerBootstrap(): Promise<PlannerBootstrapResponse> {
  await normalizeInvalidRecipeIngredientQuantities()
  await backfillRecipeIngredientMeasurements()
  await syncIngredientEntriesFromAllRecipes()
  await backfillUnmappedRecipeIngredientStores()

  const [recipesRaw, storesRaw, ingredientEntriesRaw, mealSlotsRaw, snapshotsRaw] =
    await Promise.all([
      db.recipe.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          ingredients: { orderBy: { position: 'asc' } },
          steps: { orderBy: { position: 'asc' } },
        },
      }),
      db.groceryStore.findMany({ orderBy: { name: 'asc' } }),
      db.ingredientEntry.findMany({ orderBy: { name: 'asc' } }),
      db.mealPlanSlot.findMany({
        orderBy: [{ dateKey: 'asc' }, { slot: 'asc' }],
      }),
      db.mealPlanSnapshot.findMany({
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        include: {
          meals: { orderBy: [{ dateKey: 'asc' }, { slot: 'asc' }] },
        },
      }),
    ])

  const recipes = recipesRaw.map(mapRecipe)
  const groceryStores = storesRaw.map(mapStore)
  const ingredientEntries = ingredientEntriesRaw.map(mapIngredientEntry)
  const mealPlanSlots = mealSlotsRaw
    .map((slot) => mapMealPlanSlot(slot))
    .filter((slot): slot is MealPlanSlotEntry => slot !== null)
  const mealPlanSnapshots = snapshotsRaw.map(mapSnapshot)
  const assignmentCount = mealPlanSlots.length

  return {
    recipes,
    mealPlanSlots,
    mealPlanSnapshots,
    groceryStores,
    ingredientEntries,
    meta: {
      isEmpty:
        recipes.length === 0 &&
        groceryStores.length === 0 &&
        ingredientEntries.length === 0 &&
        assignmentCount === 0 &&
        mealPlanSnapshots.length === 0,
      counts: {
        recipes: recipes.length,
        stores: groceryStores.length,
        ingredientEntries: ingredientEntries.length,
        mealPlanAssignments: assignmentCount,
        snapshots: mealPlanSnapshots.length,
      },
    },
  }
}

async function upsertRecipe(recipe: Recipe): Promise<Recipe> {
  const normalizedRecipe = normalizeRecipeForStorage(recipe)
  const preparedRecipe = await applyIngredientEntryDefaultsToRecipe(normalizedRecipe)

  await db.recipe.upsert({
    where: { id: preparedRecipe.id },
    create: {
      id: preparedRecipe.id,
      name: preparedRecipe.name,
      description: preparedRecipe.description,
      mealType: preparedRecipe.mealType,
      servings: preparedRecipe.servings,
      sourceUrl: preparedRecipe.sourceUrl,
      imageUrl: preparedRecipe.imageUrl || null,
      createdAt: new Date(preparedRecipe.createdAt),
      updatedAt: new Date(preparedRecipe.updatedAt),
      ingredients: {
        create: preparedRecipe.ingredients.map((ingredient, index) => ({
          id: ingredient.id,
          name: ingredient.name,
          qty: ingredient.qty,
          unit: ingredient.unit,
          store: ingredient.store,
          storeId: ingredient.storeId || null,
          position: index,
        })),
      },
      steps: {
        create: preparedRecipe.steps.map((text, index) => ({
          text,
          position: index,
        })),
      },
    },
    update: {
      name: preparedRecipe.name,
      description: preparedRecipe.description,
      mealType: preparedRecipe.mealType,
      servings: preparedRecipe.servings,
      sourceUrl: preparedRecipe.sourceUrl,
      imageUrl: preparedRecipe.imageUrl || null,
      updatedAt: new Date(preparedRecipe.updatedAt),
    },
  })

  await db.recipeIngredient.deleteMany({ where: { recipeId: preparedRecipe.id } })
  await db.recipeStep.deleteMany({ where: { recipeId: preparedRecipe.id } })

  if (preparedRecipe.ingredients.length > 0) {
    await db.recipeIngredient.createMany({
      data: preparedRecipe.ingredients.map((ingredient, index) => ({
        id: ingredient.id,
        recipeId: preparedRecipe.id,
        name: ingredient.name,
        qty: ingredient.qty,
        unit: ingredient.unit,
        store: ingredient.store,
        storeId: ingredient.storeId || null,
        position: index,
      })),
    })
  }

  if (preparedRecipe.steps.length > 0) {
    await db.recipeStep.createMany({
      data: preparedRecipe.steps.map((text, index) => ({
        recipeId: preparedRecipe.id,
        text,
        position: index,
      })),
    })
  }

  return preparedRecipe
}

export async function createRecipe(recipe: Recipe): Promise<Recipe> {
  const preparedRecipe = await upsertRecipe(recipe)
  await syncIngredientEntriesFromRecipe(preparedRecipe)
  const next = await db.recipe.findUniqueOrThrow({
    where: { id: preparedRecipe.id },
    include: {
      ingredients: { orderBy: { position: 'asc' } },
      steps: { orderBy: { position: 'asc' } },
    },
  })
  return mapRecipe(next)
}

export async function updateRecipe(id: string, recipe: Recipe): Promise<Recipe> {
  if (id !== recipe.id) {
    throw new Error('Recipe ID mismatch.')
  }
  const preparedRecipe = await upsertRecipe(recipe)
  await syncIngredientEntriesFromRecipe(preparedRecipe)
  const next = await db.recipe.findUniqueOrThrow({
    where: { id: preparedRecipe.id },
    include: {
      ingredients: { orderBy: { position: 'asc' } },
      steps: { orderBy: { position: 'asc' } },
    },
  })
  return mapRecipe(next)
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipe.delete({ where: { id } })
}

export async function getIngredientEntries(): Promise<IngredientEntry[]> {
  await normalizeInvalidRecipeIngredientQuantities()
  await backfillRecipeIngredientMeasurements()
  await syncIngredientEntriesFromAllRecipes()
  await backfillUnmappedRecipeIngredientStores()

  const rows = await db.ingredientEntry.findMany({
    orderBy: { name: 'asc' },
  })
  return rows.map(mapIngredientEntry)
}

async function getCurrentMealPlanSlots(): Promise<MealPlanSlotEntry[]> {
  const rows = await db.mealPlanSlot.findMany({
    orderBy: [{ dateKey: 'asc' }, { slot: 'asc' }],
  })
  return rows
    .map((row) => mapMealPlanSlot(row))
    .filter((row): row is MealPlanSlotEntry => row !== null)
}

function buildSnapshotLabelForRange(startDate: string, days: number): string {
  const dateKeys = buildDateRange(startDate, days)
  if (dateKeys.length === 0) {
    return 'Plan Snapshot'
  }
  const start = parseDateKey(dateKeys[0])
  const end = parseDateKey(dateKeys[dateKeys.length - 1])
  if (!start || !end) return 'Plan Snapshot'
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  })
  return `Plan ${formatter.format(start)} - ${formatter.format(end)} (${dateKeys.length} days)`
}

export async function setMealPlanSlot(
  dateKey: string,
  slot: MealSlot,
  selection: MealSelection | null,
  recipeId: string | null
): Promise<MealPlanSlotEntry[]> {
  if (!parseDateKey(dateKey)) {
    throw new Error('Invalid date key.')
  }

  if (selection === null) {
    await db.mealPlanSlot.deleteMany({ where: { dateKey, slot } })
    return getCurrentMealPlanSlots()
  }

  if (selection === 'recipe' && !recipeId) {
    throw new Error('Recipe is required when selecting recipe.')
  }

  if (selection === 'recipe' && recipeId) {
    const recipe = await db.recipe.findUnique({
      where: { id: recipeId },
      select: { id: true },
    })
    if (!recipe) {
      throw new Error('Recipe not found.')
    }
  }

  await db.mealPlanSlot.upsert({
    where: { dateKey_slot: { dateKey, slot } },
    create: {
      dateKey,
      slot,
      selection,
      recipeId: selection === 'recipe' ? recipeId : null,
    },
    update: {
      selection,
      recipeId: selection === 'recipe' ? recipeId : null,
    },
  })
  return getCurrentMealPlanSlots()
}

export async function replaceMealPlanSlots(
  slots: Array<{
    dateKey: string
    slot: MealSlot
    selection: MealSelection | null
    recipeId: string | null
  }>
): Promise<MealPlanSlotEntry[]> {
  const normalized = new Map<
    string,
    { dateKey: string; slot: MealSlot; selection: MealSelection; recipeId: string | null }
  >()
  const requestedRecipeIds = new Set<string>()

  for (const slot of slots) {
    if (!parseDateKey(slot.dateKey)) continue
    if (!slot.selection) continue
    if (slot.selection === 'recipe') {
      const recipeId = String(slot.recipeId || '').trim()
      if (!recipeId) continue
      requestedRecipeIds.add(recipeId)
      normalized.set(`${slot.dateKey}-${slot.slot}`, {
        dateKey: slot.dateKey,
        slot: slot.slot,
        selection: 'recipe',
        recipeId,
      })
      continue
    }

    normalized.set(`${slot.dateKey}-${slot.slot}`, {
      dateKey: slot.dateKey,
      slot: slot.slot,
      selection: slot.selection,
      recipeId: null,
    })
  }

  const validRecipeIds = new Set<string>()
  if (requestedRecipeIds.size > 0) {
    const recipes = await db.recipe.findMany({
      where: { id: { in: Array.from(requestedRecipeIds) } },
      select: { id: true },
    })
    for (const recipe of recipes) {
      validRecipeIds.add(recipe.id)
    }
  }

  const nextRows = Array.from(normalized.values()).filter((slot) => {
    if (slot.selection !== 'recipe') return true
    return Boolean(slot.recipeId && validRecipeIds.has(slot.recipeId))
  })

  await db.$transaction(async (tx) => {
    await tx.mealPlanSlot.deleteMany({})
    if (nextRows.length > 0) {
      await tx.mealPlanSlot.createMany({
        data: nextRows.map((slot) => ({
          dateKey: slot.dateKey,
          slot: slot.slot,
          selection: slot.selection,
          recipeId: slot.recipeId,
        })),
      })
    }
  })

  return getCurrentMealPlanSlots()
}

export async function clearMealPlan(options?: {
  startDate?: string
  days?: number
}): Promise<MealPlanSlotEntry[]> {
  if (options?.startDate && options.days) {
    const range = buildDateRange(options.startDate, options.days)
    if (range.length > 0) {
      await db.mealPlanSlot.deleteMany({ where: { dateKey: { in: range } } })
      return getCurrentMealPlanSlots()
    }
  }
  await db.mealPlanSlot.deleteMany({})
  return []
}

export async function createMealPlanSnapshot(options?: {
  label?: string
  description?: string
  startDate?: string
  days?: number
  markActive?: boolean
}): Promise<MealPlanSnapshot | null> {
  const range =
    options?.startDate && options?.days
      ? buildDateRange(options.startDate, options.days)
      : null
  const slots = await db.mealPlanSlot.findMany({
    where: range ? { dateKey: { in: range } } : undefined,
    include: {
      recipe: {
        include: {
          ingredients: true,
        },
      },
    },
    orderBy: [{ dateKey: 'asc' }, { slot: 'asc' }],
  })

  const meals: MealPlanSnapshotMeal[] = []
  for (const slot of slots) {
    const safeSlot = sanitizeMealSlot(slot.slot)
    if (!safeSlot || !parseDateKey(slot.dateKey)) continue
    const selection = sanitizeMealSelection(slot.selection)

    if (selection === 'recipe') {
      const recipe = slot.recipe
      if (!recipe || !slot.recipeId) continue
      const storeIds = new Set<string>()
      const storeNames = new Set<string>()
      for (const ingredient of recipe.ingredients) {
        if (ingredient.storeId) storeIds.add(ingredient.storeId)
        const store = String(ingredient.store || '').trim()
        if (store) storeNames.add(store)
      }
      meals.push({
        day: slot.dateKey,
        slot: safeSlot,
        selection,
        recipeId: slot.recipeId,
        recipeName: recipe.name,
        storeIds: Array.from(storeIds),
        storeNames: Array.from(storeNames),
      })
      continue
    }

    meals.push({
      day: slot.dateKey,
      slot: safeSlot,
      selection,
      recipeId: null,
      recipeName: null,
      storeIds: [],
      storeNames: [],
    })
  }

  if (meals.length === 0) {
    return null
  }

  const now = new Date()
  const snapshotId = `mps_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`
  const label =
    (options?.label || '').trim() ||
    (options?.startDate && options.days
      ? buildSnapshotLabelForRange(options.startDate, options.days)
      : `Plan Snapshot ${new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(now)}`)
  const description = (options?.description || '').trim()
  const markActive = options?.markActive !== false

  await db.$transaction(async (tx) => {
    if (markActive) {
      await tx.mealPlanSnapshot.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
    }

    await tx.mealPlanSnapshot.create({
      data: {
        id: snapshotId,
        createdAt: now,
        label,
        description,
        isActive: markActive,
        activatedAt: markActive ? now : null,
        meals: {
          create: meals.map((meal) => ({
            dateKey: meal.day,
            slot: meal.slot,
            selection: meal.selection,
            recipeId: meal.recipeId,
            recipeName: meal.recipeName,
            storeIds: meal.storeIds,
            storeNames: meal.storeNames,
          })),
        },
      },
    })
  })

  const created = await db.mealPlanSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: { meals: true },
  })
  return mapSnapshot(created)
}

export async function activateMealPlanSnapshot(id: string): Promise<MealPlanSnapshot> {
  return db.$transaction(async (tx) => {
    const existing = await tx.mealPlanSnapshot.findUnique({
      where: { id },
      include: { meals: true },
    })
    if (!existing) {
      throw new Error('Meal plan snapshot not found.')
    }

    const now = new Date()
    await tx.mealPlanSnapshot.updateMany({
      where: { isActive: true, NOT: { id } },
      data: { isActive: false },
    })
    const updated = await tx.mealPlanSnapshot.update({
      where: { id },
      data: {
        isActive: true,
        activatedAt: now,
      },
      include: { meals: true },
    })
    return mapSnapshot(updated)
  })
}

export async function deleteMealPlanSnapshot(id: string): Promise<{
  nextActiveSnapshotId: string | null
}> {
  return db.$transaction(async (tx) => {
    const existing = await tx.mealPlanSnapshot.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    })
    if (!existing) {
      throw new Error('Meal plan snapshot not found.')
    }

    await tx.mealPlanSnapshot.delete({ where: { id } })

    if (!existing.isActive) {
      const active = await tx.mealPlanSnapshot.findFirst({
        where: { isActive: true },
        select: { id: true },
      })
      return { nextActiveSnapshotId: active?.id ?? null }
    }

    const replacement = await tx.mealPlanSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (!replacement) {
      return { nextActiveSnapshotId: null }
    }

    await tx.mealPlanSnapshot.update({
      where: { id: replacement.id },
      data: {
        isActive: true,
        activatedAt: new Date(),
      },
    })
    return { nextActiveSnapshotId: replacement.id }
  })
}

export async function createStore(store: GroceryStore): Promise<GroceryStore> {
  const onlineOrdering = normalizeOnlineOrderingFields(store)
  const created = await db.groceryStore.create({
    data: {
      id: store.id,
      name: store.name,
      address: store.address,
      placeId: store.placeId || null,
      lat: store.lat ?? null,
      lng: store.lng ?? null,
      phone: store.phone || null,
      hours: sanitizeStringArray(store.hours) || [],
      logoUrl: store.logoUrl || null,
      supportsOnlineOrdering: onlineOrdering.supportsOnlineOrdering,
      onlineOrderingProvider: onlineOrdering.onlineOrderingProvider,
      onlineOrderingConfig: toOnlineOrderingConfigInput(
        onlineOrdering.onlineOrderingConfig
      ),
      createdAt: new Date(store.createdAt),
      updatedAt: new Date(store.updatedAt),
    },
  })
  return mapStore(created)
}

export async function updateStore(id: string, store: GroceryStore): Promise<GroceryStore> {
  const onlineOrdering = normalizeOnlineOrderingFields(store)
  const updated = await db.groceryStore.update({
    where: { id },
    data: {
      name: store.name,
      address: store.address,
      placeId: store.placeId || null,
      lat: store.lat ?? null,
      lng: store.lng ?? null,
      phone: store.phone || null,
      hours: sanitizeStringArray(store.hours) || [],
      logoUrl: store.logoUrl || null,
      supportsOnlineOrdering: onlineOrdering.supportsOnlineOrdering,
      onlineOrderingProvider: onlineOrdering.onlineOrderingProvider,
      onlineOrderingConfig: toOnlineOrderingConfigInput(
        onlineOrdering.onlineOrderingConfig
      ),
      updatedAt: new Date(store.updatedAt),
    },
  })
  return mapStore(updated)
}

export async function deleteStore(id: string): Promise<void> {
  await db.groceryStore.delete({ where: { id } })
}

export async function getStoreById(id: string): Promise<GroceryStore | null> {
  const store = await db.groceryStore.findUnique({ where: { id } })
  return store ? mapStore(store) : null
}

export async function createIngredientEntry(
  ingredient: IngredientEntry
): Promise<IngredientEntry> {
  const created = await db.ingredientEntry.create({
    data: {
      id: ingredient.id,
      name: ingredient.name,
      defaultUnit: ingredient.defaultUnit,
      defaultStoreId: sanitizeStoreId(ingredient.defaultStoreId) || null,
      category: ingredient.category,
      createdAt: new Date(ingredient.createdAt),
      updatedAt: new Date(ingredient.updatedAt),
    },
  })
  return mapIngredientEntry(created)
}

export async function updateIngredientEntry(
  id: string,
  ingredient: IngredientEntry
): Promise<IngredientEntry> {
  const updated = await db.ingredientEntry.update({
    where: { id },
    data: {
      name: ingredient.name,
      defaultUnit: ingredient.defaultUnit,
      defaultStoreId: sanitizeStoreId(ingredient.defaultStoreId) || null,
      category: ingredient.category,
      updatedAt: new Date(ingredient.updatedAt),
    },
  })
  const mapped = mapIngredientEntry(updated)
  await applyDefaultStoresToUnmappedRecipeIngredients([
    {
      name: mapped.name,
      defaultStoreId: mapped.defaultStoreId || null,
    },
  ])
  return mapped
}

async function applyDefaultStoresToUnmappedRecipeIngredients(
  entries: Array<{
    name: string
    defaultStoreId: string | null
  }>
): Promise<void> {
  const defaultStoreIdByName = buildDefaultStoreIdByIngredientName(
    entries.map((entry) => ({
      name: entry.name,
      defaultStoreId: entry.defaultStoreId || '',
    }))
  )
  if (defaultStoreIdByName.size === 0) return

  const storeIds = Array.from(new Set(defaultStoreIdByName.values()))
  const stores = await db.groceryStore.findMany({
    where: { id: { in: storeIds } },
    select: {
      id: true,
      name: true,
    },
  })
  const storeNameById = buildStoreNameById(stores)

  await Promise.all(
    Array.from(defaultStoreIdByName.entries()).map(([ingredientName, storeId]) =>
      db.recipeIngredient.updateMany({
        where: {
          name: { equals: ingredientName, mode: 'insensitive' as const },
          storeId: null,
          store: '',
        },
        data: {
          storeId,
          store: storeNameById.get(storeId) || '',
        },
      })
    )
  )
}

async function backfillUnmappedRecipeIngredientStores(): Promise<void> {
  const unmappedIngredientNames = await db.recipeIngredient.findMany({
    where: {
      storeId: null,
      store: '',
    },
    select: {
      name: true,
    },
    distinct: ['name'],
  })
  if (unmappedIngredientNames.length === 0) return

  const entries = await db.ingredientEntry.findMany({
    where: {
      defaultStoreId: { not: null },
      OR: unmappedIngredientNames.map((ingredient) => ({
        name: { equals: ingredient.name, mode: 'insensitive' as const },
      })),
    },
    select: {
      name: true,
      defaultStoreId: true,
    },
  })
  if (entries.length === 0) return

  await applyDefaultStoresToUnmappedRecipeIngredients(
    entries.map((entry) => ({
      name: entry.name,
      defaultStoreId: entry.defaultStoreId,
    }))
  )
}

export async function bulkSetIngredientEntryDefaultStore(
  ingredientIds: string[],
  defaultStoreId: string
): Promise<IngredientEntry[]> {
  const ids = Array.from(
    new Set(
      ingredientIds
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0)
    )
  )

  if (ids.length === 0) {
    return []
  }

  const normalizedStoreId = sanitizeStoreId(defaultStoreId)
  if (normalizedStoreId) {
    const store = await db.groceryStore.findUnique({
      where: { id: normalizedStoreId },
      select: { id: true },
    })
    if (!store) {
      throw new Error('Selected default store does not exist.')
    }
  }

  const now = new Date()
  await db.ingredientEntry.updateMany({
    where: { id: { in: ids } },
    data: {
      defaultStoreId: normalizedStoreId || null,
      updatedAt: now,
    },
  })

  const updated = await db.ingredientEntry.findMany({
    where: { id: { in: ids } },
    orderBy: { name: 'asc' },
  })
  await applyDefaultStoresToUnmappedRecipeIngredients(
    updated.map((entry) => ({
      name: entry.name,
      defaultStoreId: entry.defaultStoreId,
    }))
  )
  return updated.map((row) => mapIngredientEntry(row))
}

export async function bulkSetIngredientEntryCategory(
  ingredientIds: string[],
  category: string
): Promise<IngredientEntry[]> {
  const ids = Array.from(
    new Set(
      ingredientIds
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0)
    )
  )
  if (ids.length === 0) return []

  const normalizedCategory = String(category || '').trim()
  if (!normalizedCategory) {
    throw new Error('Category is required.')
  }

  const now = new Date()
  await db.ingredientEntry.updateMany({
    where: { id: { in: ids } },
    data: {
      category: normalizedCategory,
      updatedAt: now,
    },
  })

  const updated = await db.ingredientEntry.findMany({
    where: { id: { in: ids } },
    orderBy: { name: 'asc' },
  })
  return updated.map((row) => mapIngredientEntry(row))
}

export async function bulkDeleteIngredientEntries(ingredientIds: string[]): Promise<number> {
  const ids = Array.from(
    new Set(
      ingredientIds
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0)
    )
  )
  if (ids.length === 0) return 0

  const result = await db.ingredientEntry.deleteMany({
    where: { id: { in: ids } },
  })
  return result.count
}

export async function deleteIngredientEntry(id: string): Promise<void> {
  await db.ingredientEntry.delete({ where: { id } })
}

function normalizeMigrationMealPlan(raw: LocalStorageMigrationPayload['mealPlan']): MealPlan {
  const next = createEmptyMealPlan()
  if (!raw) return next

  for (const day of DAY_OF_WEEK_VALUES) {
    const dayPlan = raw[day]
    if (!dayPlan || typeof dayPlan !== 'object') continue
    for (const slot of LEGACY_MEAL_SLOT_VALUES) {
      const recipeId = dayPlan[slot]
      next[day][slot] = recipeId || null
    }
  }

  return next
}

function getCurrentWeekDateKeyByDay(): Record<DayOfWeek, string> {
  const now = new Date()
  const weekday = (now.getDay() + 6) % 7
  const monday = addDays(now, -weekday)
  const map = {} as Record<DayOfWeek, string>
  for (const [index, day] of DAY_OF_WEEK_VALUES.entries()) {
    map[day] = toDateKey(addDays(monday, index))
  }
  return map
}

function hasMigrationData(payload: LocalStorageMigrationPayload): boolean {
  return Boolean(
    (payload.recipes && payload.recipes.length > 0) ||
      (payload.groceryStores && payload.groceryStores.length > 0) ||
      (payload.ingredientEntries && payload.ingredientEntries.length > 0) ||
      (payload.mealPlanSnapshots && payload.mealPlanSnapshots.length > 0) ||
      (payload.mealPlan &&
        DAY_OF_WEEK_VALUES.some((day) =>
          LEGACY_MEAL_SLOT_VALUES.some((slot) => Boolean(payload.mealPlan?.[day]?.[slot]))
        ))
  )
}

export async function importLocalMigration(
  payload: LocalStorageMigrationPayload
): Promise<{ imported: boolean; reason?: string }> {
  if (!hasMigrationData(payload)) {
    return { imported: false, reason: 'no_data' }
  }

  if (!(await plannerIsEmpty())) {
    return { imported: false, reason: 'not_empty' }
  }

  await db.$transaction(async (tx) => {
    const stores = payload.groceryStores || []
    for (const store of stores) {
      const onlineOrdering = normalizeOnlineOrderingFields(store)
      await tx.groceryStore.upsert({
        where: { id: store.id },
        create: {
          id: store.id,
          name: store.name,
          address: store.address,
          placeId: store.placeId || null,
          lat: store.lat ?? null,
          lng: store.lng ?? null,
          phone: store.phone || null,
          hours: sanitizeStringArray(store.hours) || [],
          logoUrl: store.logoUrl || null,
          supportsOnlineOrdering: onlineOrdering.supportsOnlineOrdering,
          onlineOrderingProvider: onlineOrdering.onlineOrderingProvider,
          onlineOrderingConfig: toOnlineOrderingConfigInput(
            onlineOrdering.onlineOrderingConfig
          ),
          createdAt: new Date(store.createdAt),
          updatedAt: new Date(store.updatedAt),
        },
        update: {
          name: store.name,
          address: store.address,
          placeId: store.placeId || null,
          lat: store.lat ?? null,
          lng: store.lng ?? null,
          phone: store.phone || null,
          hours: sanitizeStringArray(store.hours) || [],
          logoUrl: store.logoUrl || null,
          supportsOnlineOrdering: onlineOrdering.supportsOnlineOrdering,
          onlineOrderingProvider: onlineOrdering.onlineOrderingProvider,
          onlineOrderingConfig: toOnlineOrderingConfigInput(
            onlineOrdering.onlineOrderingConfig
          ),
          updatedAt: new Date(store.updatedAt),
        },
      })
    }

    const ingredients = payload.ingredientEntries || []
    for (const ingredient of ingredients) {
      await tx.ingredientEntry.upsert({
        where: { id: ingredient.id },
        create: {
          id: ingredient.id,
          name: ingredient.name,
          defaultUnit: ingredient.defaultUnit,
          defaultStoreId: sanitizeStoreId(ingredient.defaultStoreId) || null,
          category: ingredient.category,
          createdAt: new Date(ingredient.createdAt),
          updatedAt: new Date(ingredient.updatedAt),
        },
        update: {
          name: ingredient.name,
          defaultUnit: ingredient.defaultUnit,
          defaultStoreId: sanitizeStoreId(ingredient.defaultStoreId) || null,
          category: ingredient.category,
          updatedAt: new Date(ingredient.updatedAt),
        },
      })
    }

    const recipes = payload.recipes || []
    for (const recipe of recipes) {
      const normalizedRecipe = normalizeRecipeForStorage(recipe)
      await tx.recipe.upsert({
        where: { id: normalizedRecipe.id },
        create: {
          id: normalizedRecipe.id,
          name: normalizedRecipe.name,
          description: normalizedRecipe.description,
          mealType: normalizedRecipe.mealType,
          servings: normalizedRecipe.servings,
          sourceUrl: normalizedRecipe.sourceUrl,
          imageUrl: normalizedRecipe.imageUrl || null,
          createdAt: new Date(normalizedRecipe.createdAt),
          updatedAt: new Date(normalizedRecipe.updatedAt),
        },
        update: {
          name: normalizedRecipe.name,
          description: normalizedRecipe.description,
          mealType: normalizedRecipe.mealType,
          servings: normalizedRecipe.servings,
          sourceUrl: normalizedRecipe.sourceUrl,
          imageUrl: normalizedRecipe.imageUrl || null,
          updatedAt: new Date(normalizedRecipe.updatedAt),
        },
      })
      await tx.recipeIngredient.deleteMany({ where: { recipeId: normalizedRecipe.id } })
      await tx.recipeStep.deleteMany({ where: { recipeId: normalizedRecipe.id } })
      if (normalizedRecipe.ingredients.length > 0) {
        await tx.recipeIngredient.createMany({
          data: normalizedRecipe.ingredients.map((ingredient, index) => ({
            id: ingredient.id,
            recipeId: normalizedRecipe.id,
            name: ingredient.name,
            qty: ingredient.qty,
            unit: ingredient.unit,
            store: ingredient.store,
            storeId: ingredient.storeId || null,
            position: index,
          })),
        })
      }
      if (normalizedRecipe.steps.length > 0) {
        await tx.recipeStep.createMany({
          data: normalizedRecipe.steps.map((text, index) => ({
            recipeId: normalizedRecipe.id,
            text,
            position: index,
          })),
        })
      }
    }

    const mealPlan = normalizeMigrationMealPlan(payload.mealPlan)
    const dayToDateKey = getCurrentWeekDateKeyByDay()
    await tx.mealPlanSlot.deleteMany({})
    const slotRows = DAY_OF_WEEK_VALUES.flatMap((day) =>
      MEAL_SLOT_VALUES.map((slot) => ({
        dateKey: dayToDateKey[day],
        slot,
        selection: 'recipe' as const,
        recipeId: mealPlan[day][slot] || null,
      }))
    ).filter((slot) => slot.recipeId !== null)
    if (slotRows.length > 0) {
      await tx.mealPlanSlot.createMany({ data: slotRows })
    }

    const snapshots = payload.mealPlanSnapshots || []
    for (const snapshot of snapshots) {
      await tx.mealPlanSnapshot.upsert({
        where: { id: snapshot.id },
        create: {
          id: snapshot.id,
          label: snapshot.label,
          description: snapshot.description || '',
          createdAt: new Date(snapshot.createdAt),
        },
        update: {
          label: snapshot.label,
          description: snapshot.description || '',
        },
      })
      await tx.mealPlanSnapshotMeal.deleteMany({
        where: { snapshotId: snapshot.id },
      })
      if (snapshot.meals.length > 0) {
        const rows = snapshot.meals
          .map((meal) => {
            const slot = sanitizeMealSlot(meal.slot)
            if (!slot) return null
            const normalizedDateKey =
              DAY_OF_WEEK_VALUES.includes(meal.day as DayOfWeek)
                ? dayToDateKey[meal.day as DayOfWeek]
                : parseDateKey(meal.day)
                  ? meal.day
                  : null
            if (!normalizedDateKey) return null
            const selection = sanitizeMealSelection(meal.selection)
            if (selection === 'recipe') {
              if (!meal.recipeId || !meal.recipeName) return null
              return {
                snapshotId: snapshot.id,
                dateKey: normalizedDateKey,
                slot,
                selection,
                recipeId: meal.recipeId,
                recipeName: meal.recipeName,
                storeIds: meal.storeIds,
                storeNames: meal.storeNames,
              }
            }
            return {
              snapshotId: snapshot.id,
              dateKey: normalizedDateKey,
              slot,
              selection,
              recipeId: null,
              recipeName: null,
              storeIds: meal.storeIds,
              storeNames: meal.storeNames,
            }
          })
          .filter((meal): meal is NonNullable<typeof meal> => meal !== null)

        if (rows.length === 0) {
          continue
        }

        await tx.mealPlanSnapshotMeal.createMany({
          data: rows,
        })
      }
    }
  })

  await normalizeInvalidRecipeIngredientQuantities()
  await backfillRecipeIngredientMeasurements()
  await syncIngredientEntriesFromAllRecipes()
  await backfillUnmappedRecipeIngredientStores()

  return { imported: true }
}
