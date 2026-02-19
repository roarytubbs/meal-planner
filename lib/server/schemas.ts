import { z } from 'zod'
import {
  DAY_OF_WEEK_VALUES,
  LEGACY_MEAL_SLOT_VALUES,
  MEAL_SELECTION_VALUES,
  MEAL_SLOT_VALUES,
  MEAL_TYPE_VALUES,
  ONLINE_ORDER_PROVIDER_VALUES,
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

const dateKeySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format.')

export const daySchema = z.enum(DAY_OF_WEEK_VALUES)
export const slotSchema = z.enum(MEAL_SLOT_VALUES)
export const mealTypeSchema = z.union([z.enum(MEAL_TYPE_VALUES), z.literal('')])
export const mealSelectionSchema = z.enum(MEAL_SELECTION_VALUES)

export const ingredientSchema = z.object({
  id: idSchema,
  name: boundedString(200).min(1),
  qty: z.number().finite().nullable(),
  unit: boundedString(64),
  store: boundedString(200),
  storeId: optionalBoundedString(128),
})

export const shoppingCartItemSchema = z.object({
  name: boundedString(200).min(1),
  qty: z.number().positive().finite().nullable(),
  unit: boundedString(64),
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
  imageUrl: optionalBoundedString(1000).default(''),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

const onlineOrderingProviderSchema = z.enum(ONLINE_ORDER_PROVIDER_VALUES)

const onlineOrderingConfigSchema = z
  .object({
    targetStoreId: boundedString(128).min(1),
  })
  .strict()

export const groceryStoreSchema = z
  .object({
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
    supportsOnlineOrdering: z.boolean().optional().default(false),
    onlineOrderingProvider: z
      .preprocess(
        (value) =>
          typeof value === 'string' ? value.trim().toLowerCase() : value,
        onlineOrderingProviderSchema.optional()
      ),
    onlineOrderingConfig: onlineOrderingConfigSchema.optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .superRefine((store, context) => {
    if (!store.supportsOnlineOrdering) return
    if (!store.onlineOrderingProvider) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['onlineOrderingProvider'],
        message: 'Online ordering provider is required when online ordering is enabled.',
      })
      return
    }
    if (
      store.onlineOrderingProvider === 'target' &&
      !store.onlineOrderingConfig?.targetStoreId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['onlineOrderingConfig', 'targetStoreId'],
        message: 'Target store ID is required when online ordering is enabled.',
      })
    }
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

export const ingredientDefaultStoreBulkSchema = z.object({
  ingredientIds: z.array(idSchema).min(1).max(1000),
  defaultStoreId: z.string().trim().max(128),
})

export const mealPlanSlotUpdateSchema = z
  .object({
    dateKey: dateKeySchema,
    slot: slotSchema,
    selection: mealSelectionSchema.nullable(),
    recipeId: z.string().trim().max(128).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.selection === 'recipe' && !value.recipeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipeId'],
        message: 'recipeId is required when selection is recipe.',
      })
      return
    }

    if (value.selection !== 'recipe' && value.recipeId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipeId'],
        message: 'recipeId must be null for non-recipe slot selections.',
      })
    }

    if (value.selection === null && value.recipeId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipeId'],
        message: 'recipeId must be null when clearing a slot.',
      })
    }
  })

export const mealPlanSlotsReplaceSchema = z.object({
  slots: z.array(mealPlanSlotUpdateSchema).max(500),
})

export const clearMealPlanSchema = z
  .object({
    startDate: dateKeySchema,
    days: z.number().int().min(1).max(14),
  })
  .partial()

export const snapshotCreateSchema = z
  .object({
    label: z.string().trim().max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    startDate: dateKeySchema.optional(),
    days: z.number().int().min(1).max(14).optional(),
  })
  .superRefine((value, ctx) => {
    const hasStart = Boolean(value.startDate)
    const hasDays = typeof value.days === 'number'
    if (hasStart !== hasDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startDate and days must be provided together.',
      })
    }
  })

export const snapshotMealSchema = z
  .object({
    day: dateKeySchema,
    slot: slotSchema,
    selection: mealSelectionSchema,
    recipeId: idSchema.nullable(),
    recipeName: boundedString(200).min(1).nullable(),
    storeIds: z.array(z.string().trim().max(128)).max(50),
    storeNames: z.array(boundedString(200)).max(50),
  })
  .superRefine((meal, ctx) => {
    if (meal.selection === 'recipe') {
      if (!meal.recipeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recipeId'],
          message: 'recipeId is required when selection is recipe.',
        })
      }
      if (!meal.recipeName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recipeName'],
          message: 'recipeName is required when selection is recipe.',
        })
      }
    }

    if (meal.selection !== 'recipe' && (meal.recipeId || meal.recipeName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selection'],
        message: 'recipeId and recipeName must be null for non-recipe entries.',
      })
    }
  })

export const snapshotSchema = z.object({
  id: idSchema,
  createdAt: isoDateSchema,
  label: boundedString(200).min(1),
  description: boundedString(1000).default(''),
  meals: z.array(snapshotMealSchema).max(500),
})

const legacyMealPlanDaySchema = z
  .object({
    breakfast: z.string().trim().max(128).nullable().optional(),
    lunch: z.string().trim().max(128).nullable().optional(),
    dinner: z.string().trim().max(128).nullable().optional(),
    snack: z.string().trim().max(128).nullable().optional(),
  })
  .partial()

export const mealPlanSchema = z
  .object({
    monday: legacyMealPlanDaySchema.optional(),
    tuesday: legacyMealPlanDaySchema.optional(),
    wednesday: legacyMealPlanDaySchema.optional(),
    thursday: legacyMealPlanDaySchema.optional(),
    friday: legacyMealPlanDaySchema.optional(),
    saturday: legacyMealPlanDaySchema.optional(),
    sunday: legacyMealPlanDaySchema.optional(),
  })
  .partial()

export const localMigrationSchema = z.object({
  recipes: z.array(recipeSchema).max(1000).optional(),
  mealPlan: mealPlanSchema.optional(),
  mealPlanSnapshots: z.array(snapshotSchema).max(500).optional(),
  groceryStores: z.array(groceryStoreSchema).max(500).optional(),
  ingredientEntries: z.array(ingredientEntrySchema).max(5000).optional(),
})

export const legacyMealSlotSchema = z.enum(LEGACY_MEAL_SLOT_VALUES)

export const shoppingCartSessionCreateSchema = z.object({
  storeId: idSchema,
  items: z.array(shoppingCartItemSchema).min(1).max(400),
})
