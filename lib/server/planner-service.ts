import { db } from '@/lib/server/db'
import {
  DAY_OF_WEEK_VALUES,
  MEAL_SLOT_VALUES,
  createEmptyMealPlan,
  type DayOfWeek,
  type GroceryStore,
  type IngredientEntry,
  type LocalStorageMigrationPayload,
  type MealPlan,
  type MealPlanSnapshot,
  type MealPlanSnapshotMeal,
  type MealSlot,
  type PlannerBootstrapResponse,
  type Recipe,
} from '@/lib/types'

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
  createdAt: Date
  updatedAt: Date
}): GroceryStore {
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

function mapRecipe(row: {
  id: string
  name: string
  description: string
  mealType: string
  servings: number
  sourceUrl: string
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
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    ingredients: row.ingredients
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
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
  day: string
  slot: string
  recipeId: string
  recipeName: string
  storeIds: string[]
  storeNames: string[]
}): MealPlanSnapshotMeal {
  return {
    day: row.day as DayOfWeek,
    slot: row.slot as MealSlot,
    recipeId: row.recipeId,
    recipeName: row.recipeName,
    storeIds: Array.isArray(row.storeIds) ? row.storeIds : [],
    storeNames: Array.isArray(row.storeNames) ? row.storeNames : [],
  }
}

function mapSnapshot(row: {
  id: string
  createdAt: Date
  label: string
  meals: Array<{
    day: string
    slot: string
    recipeId: string
    recipeName: string
    storeIds: string[]
    storeNames: string[]
  }>
}): MealPlanSnapshot {
  return {
    id: row.id,
    createdAt: toIsoString(row.createdAt),
    label: row.label,
    meals: row.meals.map(mapSnapshotMeal),
  }
}

export async function plannerIsEmpty(): Promise<boolean> {
  const [recipeCount, storeCount, ingredientCount, slotCount, snapshotCount] =
    await Promise.all([
      db.recipe.count(),
      db.groceryStore.count(),
      db.ingredientEntry.count(),
      db.mealPlanSlot.count({ where: { recipeId: { not: null } } }),
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

export async function getPlannerBootstrap(): Promise<PlannerBootstrapResponse> {
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
      db.mealPlanSlot.findMany(),
      db.mealPlanSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          meals: { orderBy: [{ day: 'asc' }, { slot: 'asc' }] },
        },
      }),
    ])

  const mealPlan = createEmptyMealPlan()
  for (const slot of mealSlotsRaw) {
    if (
      DAY_OF_WEEK_VALUES.includes(slot.day as DayOfWeek) &&
      MEAL_SLOT_VALUES.includes(slot.slot as MealSlot)
    ) {
      mealPlan[slot.day as DayOfWeek][slot.slot as MealSlot] = slot.recipeId
    }
  }

  const recipes = recipesRaw.map(mapRecipe)
  const groceryStores = storesRaw.map(mapStore)
  const ingredientEntries = ingredientEntriesRaw.map(mapIngredientEntry)
  const mealPlanSnapshots = snapshotsRaw.map(mapSnapshot)
  const assignmentCount = mealSlotsRaw.filter((slot) => slot.recipeId).length

  return {
    recipes,
    mealPlan,
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

async function upsertRecipe(recipe: Recipe): Promise<void> {
  await db.recipe.upsert({
    where: { id: recipe.id },
    create: {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      mealType: recipe.mealType,
      servings: recipe.servings,
      sourceUrl: recipe.sourceUrl,
      createdAt: new Date(recipe.createdAt),
      updatedAt: new Date(recipe.updatedAt),
      ingredients: {
        create: recipe.ingredients.map((ingredient, index) => ({
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
        create: recipe.steps.map((text, index) => ({
          text,
          position: index,
        })),
      },
    },
    update: {
      name: recipe.name,
      description: recipe.description,
      mealType: recipe.mealType,
      servings: recipe.servings,
      sourceUrl: recipe.sourceUrl,
      updatedAt: new Date(recipe.updatedAt),
    },
  })

  await db.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } })
  await db.recipeStep.deleteMany({ where: { recipeId: recipe.id } })

  if (recipe.ingredients.length > 0) {
    await db.recipeIngredient.createMany({
      data: recipe.ingredients.map((ingredient, index) => ({
        id: ingredient.id,
        recipeId: recipe.id,
        name: ingredient.name,
        qty: ingredient.qty,
        unit: ingredient.unit,
        store: ingredient.store,
        storeId: ingredient.storeId || null,
        position: index,
      })),
    })
  }

  if (recipe.steps.length > 0) {
    await db.recipeStep.createMany({
      data: recipe.steps.map((text, index) => ({
        recipeId: recipe.id,
        text,
        position: index,
      })),
    })
  }
}

export async function createRecipe(recipe: Recipe): Promise<Recipe> {
  await upsertRecipe(recipe)
  const next = await db.recipe.findUniqueOrThrow({
    where: { id: recipe.id },
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
  await upsertRecipe(recipe)
  const next = await db.recipe.findUniqueOrThrow({
    where: { id: recipe.id },
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

export async function setMealPlanSlot(
  day: DayOfWeek,
  slot: MealSlot,
  recipeId: string | null
): Promise<MealPlan> {
  await db.mealPlanSlot.upsert({
    where: { day_slot: { day, slot } },
    create: { day, slot, recipeId },
    update: { recipeId },
  })
  const bootstrap = await getPlannerBootstrap()
  return bootstrap.mealPlan
}

export async function clearMealPlan(): Promise<MealPlan> {
  await db.mealPlanSlot.deleteMany({})
  return createEmptyMealPlan()
}

function buildSnapshotLabel(now: Date): string {
  return `Week of ${new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(now)}`
}

export async function createMealPlanSnapshot(label?: string): Promise<MealPlanSnapshot | null> {
  const slots = await db.mealPlanSlot.findMany({
    where: { recipeId: { not: null } },
    include: {
      recipe: {
        include: {
          ingredients: true,
        },
      },
    },
  })

  const meals: MealPlanSnapshotMeal[] = []
  for (const slot of slots) {
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
      day: slot.day as DayOfWeek,
      slot: slot.slot as MealSlot,
      recipeId: slot.recipeId,
      recipeName: recipe.name,
      storeIds: Array.from(storeIds),
      storeNames: Array.from(storeNames),
    })
  }

  if (meals.length === 0) {
    return null
  }

  const now = new Date()
  const snapshotId = `mps_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`
  await db.mealPlanSnapshot.create({
    data: {
      id: snapshotId,
      createdAt: now,
      label: (label || '').trim() || buildSnapshotLabel(now),
      meals: {
        create: meals.map((meal) => ({
          day: meal.day,
          slot: meal.slot,
          recipeId: meal.recipeId,
          recipeName: meal.recipeName,
          storeIds: meal.storeIds,
          storeNames: meal.storeNames,
        })),
      },
    },
    include: {
      meals: true,
    },
  })

  const created = await db.mealPlanSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: { meals: true },
  })
  return mapSnapshot(created)
}

export async function deleteMealPlanSnapshot(id: string): Promise<void> {
  await db.mealPlanSnapshot.delete({ where: { id } })
}

export async function createStore(store: GroceryStore): Promise<GroceryStore> {
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
      createdAt: new Date(store.createdAt),
      updatedAt: new Date(store.updatedAt),
    },
  })
  return mapStore(created)
}

export async function updateStore(id: string, store: GroceryStore): Promise<GroceryStore> {
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
      updatedAt: new Date(store.updatedAt),
    },
  })
  return mapStore(updated)
}

export async function deleteStore(id: string): Promise<void> {
  await db.groceryStore.delete({ where: { id } })
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
  return mapIngredientEntry(updated)
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
    for (const slot of MEAL_SLOT_VALUES) {
      const recipeId = dayPlan[slot]
      next[day][slot] = recipeId || null
    }
  }

  return next
}

function hasMigrationData(payload: LocalStorageMigrationPayload): boolean {
  return Boolean(
    (payload.recipes && payload.recipes.length > 0) ||
      (payload.groceryStores && payload.groceryStores.length > 0) ||
      (payload.ingredientEntries && payload.ingredientEntries.length > 0) ||
      (payload.mealPlanSnapshots && payload.mealPlanSnapshots.length > 0) ||
      (payload.mealPlan &&
        DAY_OF_WEEK_VALUES.some((day) =>
          MEAL_SLOT_VALUES.some((slot) => Boolean(payload.mealPlan?.[day]?.[slot]))
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
      await tx.recipe.upsert({
        where: { id: recipe.id },
        create: {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          mealType: recipe.mealType,
          servings: recipe.servings,
          sourceUrl: recipe.sourceUrl,
          createdAt: new Date(recipe.createdAt),
          updatedAt: new Date(recipe.updatedAt),
        },
        update: {
          name: recipe.name,
          description: recipe.description,
          mealType: recipe.mealType,
          servings: recipe.servings,
          sourceUrl: recipe.sourceUrl,
          updatedAt: new Date(recipe.updatedAt),
        },
      })
      await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } })
      await tx.recipeStep.deleteMany({ where: { recipeId: recipe.id } })
      if (recipe.ingredients.length > 0) {
        await tx.recipeIngredient.createMany({
          data: recipe.ingredients.map((ingredient, index) => ({
            id: ingredient.id,
            recipeId: recipe.id,
            name: ingredient.name,
            qty: ingredient.qty,
            unit: ingredient.unit,
            store: ingredient.store,
            storeId: ingredient.storeId || null,
            position: index,
          })),
        })
      }
      if (recipe.steps.length > 0) {
        await tx.recipeStep.createMany({
          data: recipe.steps.map((text, index) => ({
            recipeId: recipe.id,
            text,
            position: index,
          })),
        })
      }
    }

    const mealPlan = normalizeMigrationMealPlan(payload.mealPlan)
    await tx.mealPlanSlot.deleteMany({})
    const slotRows = DAY_OF_WEEK_VALUES.flatMap((day) =>
      MEAL_SLOT_VALUES.map((slot) => ({
        day,
        slot,
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
          createdAt: new Date(snapshot.createdAt),
        },
        update: {
          label: snapshot.label,
        },
      })
      await tx.mealPlanSnapshotMeal.deleteMany({
        where: { snapshotId: snapshot.id },
      })
      if (snapshot.meals.length > 0) {
        await tx.mealPlanSnapshotMeal.createMany({
          data: snapshot.meals.map((meal) => ({
            snapshotId: snapshot.id,
            day: meal.day,
            slot: meal.slot,
            recipeId: meal.recipeId,
            recipeName: meal.recipeName,
            storeIds: meal.storeIds,
            storeNames: meal.storeNames,
          })),
        })
      }
    }
  })

  return { imported: true }
}
