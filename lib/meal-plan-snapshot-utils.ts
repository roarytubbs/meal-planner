import {
  DAY_OF_WEEK_VALUES,
  MEAL_SLOT_VALUES,
  addDays,
  parseDateKey,
  toDateKey,
  type DayOfWeek,
  type MealPlanSnapshot,
  type MealSelection,
  type MealSlot,
} from '@/lib/types'

export interface SnapshotDateRange {
  startDateKey: string
  endDateKey: string
  days: number
}

export interface SnapshotSlotUpdate {
  dateKey: string
  slot: MealSlot
  selection: MealSelection | null
  recipeId: string | null
}

export interface SnapshotToSlotsResult {
  slots: SnapshotSlotUpdate[]
  skippedMeals: number
}

export function getCurrentWeekDateKeyByDay(
  anchorDate: Date = new Date()
): Record<DayOfWeek, string> {
  const weekday = (anchorDate.getDay() + 6) % 7
  const monday = addDays(anchorDate, -weekday)
  return DAY_OF_WEEK_VALUES.reduce<Record<DayOfWeek, string>>((map, day, index) => {
    map[day] = toDateKey(addDays(monday, index))
    return map
  }, {} as Record<DayOfWeek, string>)
}

export function getSnapshotDateRange(
  snapshot: MealPlanSnapshot
): SnapshotDateRange | null {
  const dateKeys = snapshot.meals
    .map((meal) => meal.day)
    .filter((day) => Boolean(parseDateKey(day)))
    .sort()
  if (dateKeys.length === 0) return null

  const startDateKey = dateKeys[0]
  const endDateKey = dateKeys[dateKeys.length - 1]
  const start = parseDateKey(startDateKey)
  const end = parseDateKey(endDateKey)
  if (!start || !end) return null

  const msPerDay = 24 * 60 * 60 * 1000
  const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1)
  return { startDateKey, endDateKey, days }
}

export function isSnapshotPrevious(
  snapshot: MealPlanSnapshot,
  todayDateKey: string = toDateKey(new Date())
): boolean {
  const range = getSnapshotDateRange(snapshot)
  if (!range) return true
  return range.endDateKey < todayDateKey
}

export function partitionSnapshotsByRecency(
  snapshots: MealPlanSnapshot[],
  todayDateKey: string = toDateKey(new Date())
): { current: MealPlanSnapshot[]; previous: MealPlanSnapshot[] } {
  const current: MealPlanSnapshot[] = []
  const previous: MealPlanSnapshot[] = []
  for (const snapshot of snapshots) {
    if (isSnapshotPrevious(snapshot, todayDateKey)) {
      previous.push(snapshot)
      continue
    }
    current.push(snapshot)
  }
  return { current, previous }
}

export function snapshotToSlotUpdates(
  snapshot: MealPlanSnapshot,
  validRecipeIds: Set<string>,
  dayFallbackMap: Record<DayOfWeek, string> = getCurrentWeekDateKeyByDay()
): SnapshotToSlotsResult {
  const slots: SnapshotSlotUpdate[] = []
  let skippedMeals = 0

  for (const meal of snapshot.meals) {
    if (!MEAL_SLOT_VALUES.includes(meal.slot as MealSlot)) {
      skippedMeals += 1
      continue
    }

    const dateKey = parseDateKey(meal.day)
      ? meal.day
      : DAY_OF_WEEK_VALUES.includes(meal.day as DayOfWeek)
        ? dayFallbackMap[meal.day as DayOfWeek]
        : null
    if (!dateKey) {
      skippedMeals += 1
      continue
    }

    if (meal.selection === 'recipe') {
      if (!meal.recipeId || !validRecipeIds.has(meal.recipeId)) {
        skippedMeals += 1
        continue
      }
      slots.push({
        dateKey,
        slot: meal.slot as MealSlot,
        selection: 'recipe',
        recipeId: meal.recipeId,
      })
      continue
    }

    slots.push({
      dateKey,
      slot: meal.slot as MealSlot,
      selection: meal.selection,
      recipeId: null,
    })
  }

  return { slots, skippedMeals }
}
