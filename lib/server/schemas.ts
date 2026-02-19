import { z } from 'zod'
import {
  DAY_OF_WEEK_VALUES,
  MEAL_SLOT_VALUES,
  MEAL_TYPE_VALUES,
} from '@/lib/types'

const isoDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())

const idSchema = z.string().trim().min(1).max(128)

const boundedString = (max: number) => z.string().trim().max(max)

const optionalBoundedString = (
  max: number,
  options?: { dropIfTooLong?: boolean }
) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    if (trimmed.length === 0) return undefined
    if (options?.dropIfTooLong && trimmed.length > max) return undefined
    return trimmed
  }, z.string().max(max).optional())

export const daySchema = z.enum(DAY_OF_WEEK_VALUES)
export const slotSchema = z.enum(MEAL_SLOT_VALUES)
export const mealTypeSchema = z.union([z.enum(MEAL_TYPE_VALUES), z.literal('')])

export const ingredientSchema = z.object({
  id: idSchema,
  name: boundedString(200).min(1),
  qty: z.number().finite().nullable(),
  unit: boundedString(64),
  store: boundedString(200),
  storeId: optionalBoundedString(128),
})

export const recipeSchema = z.object({
  id: idSchema,
  name: boundedString(200).min(1),
  description: boundedString(1000),
  mealType: mealTypeSchema,
  servings: z.number().int().min(1).max(100),
  ingredients: z.array(ingredientSchema).max(300),
  steps: z.array(boundedString(2000).min(1)).max(200),
  sourceUrl: boundedString(500),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const groceryStoreSchema = z.object({
  id: idSchema,
  name: boundedString(200).min(1),
  address: boundedString(300).min(1),
  placeId: optionalBoundedString(200),
  lat: z.number().finite().optional(),
  lng: z.number().finite().optional(),
  phone: optionalBoundedString(80),
  hours: z.array(boundedString(120).min(1)).max(14).optional(),
  // Google photo proxy URLs can exceed this storage limit; drop instead of failing create/update.
  logoUrl: optionalBoundedString(500, { dropIfTooLong: true }),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const ingredientEntrySchema = z.object({
  id: idSchema,
  name: boundedString(200).min(1),
  defaultUnit: boundedString(64),
  defaultStoreId: z.string().trim().max(128),
  category: boundedString(80).min(1),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const mealPlanSlotUpdateSchema = z.object({
  day: daySchema,
  slot: slotSchema,
  recipeId: z.string().trim().max(128).nullable(),
})

export const snapshotCreateSchema = z.object({
  label: z.string().trim().max(200).optional(),
})

export const snapshotMealSchema = z.object({
  day: daySchema,
  slot: slotSchema,
  recipeId: idSchema,
  recipeName: boundedString(200).min(1),
  storeIds: z.array(z.string().trim().max(128)).max(50),
  storeNames: z.array(boundedString(200)).max(50),
})

export const snapshotSchema = z.object({
  id: idSchema,
  createdAt: isoDateSchema,
  label: boundedString(200).min(1),
  meals: z.array(snapshotMealSchema).max(300),
})

const mealPlanDaySchema = z
  .object({
    breakfast: z.string().trim().max(128).nullable().optional(),
    lunch: z.string().trim().max(128).nullable().optional(),
    dinner: z.string().trim().max(128).nullable().optional(),
    snack: z.string().trim().max(128).nullable().optional(),
  })
  .partial()

export const mealPlanSchema = z
  .object({
    monday: mealPlanDaySchema.optional(),
    tuesday: mealPlanDaySchema.optional(),
    wednesday: mealPlanDaySchema.optional(),
    thursday: mealPlanDaySchema.optional(),
    friday: mealPlanDaySchema.optional(),
    saturday: mealPlanDaySchema.optional(),
    sunday: mealPlanDaySchema.optional(),
  })
  .partial()

export const localMigrationSchema = z.object({
  recipes: z.array(recipeSchema).max(1000).optional(),
  mealPlan: mealPlanSchema.optional(),
  mealPlanSnapshots: z.array(snapshotSchema).max(500).optional(),
  groceryStores: z.array(groceryStoreSchema).max(500).optional(),
  ingredientEntries: z.array(ingredientEntrySchema).max(5000).optional(),
})
