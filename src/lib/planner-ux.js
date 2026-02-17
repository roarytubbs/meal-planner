import { MEAL_SLOTS } from "./meal-planner.js";

const TOTAL_MEAL_SLOTS = MEAL_SLOTS.length;

export function getDayCompletionModel(dayPlan) {
  const dayMode = String(dayPlan?.dayMode || "planned").toLowerCase();

  if (dayMode !== "planned") {
    return {
      dayMode,
      configuredMeals: TOTAL_MEAL_SLOTS,
      totalMeals: TOTAL_MEAL_SLOTS,
      isComplete: true,
      label: "Override",
    };
  }

  const configuredMeals = MEAL_SLOTS.reduce((count, mealSlot) => {
    const mode = String(dayPlan?.meals?.[mealSlot]?.mode || "skip").toLowerCase();
    return mode === "skip" ? count : count + 1;
  }, 0);

  return {
    dayMode,
    configuredMeals,
    totalMeals: TOTAL_MEAL_SLOTS,
    isComplete: configuredMeals >= TOTAL_MEAL_SLOTS,
    label: `${configuredMeals}/${TOTAL_MEAL_SLOTS} set`,
  };
}

export function findNextIncompleteDay(activeDays, weekPlan) {
  if (!Array.isArray(activeDays) || activeDays.length === 0) {
    return null;
  }

  for (const day of activeDays) {
    const completion = getDayCompletionModel(weekPlan?.[day]);
    if (completion.dayMode === "planned" && !completion.isComplete) {
      return day;
    }
  }

  return null;
}

export function calculateReceiptDelta(previousCount, nextCount) {
  const previous = Number.isFinite(Number(previousCount)) ? Number(previousCount) : 0;
  const next = Number.isFinite(Number(nextCount)) ? Number(nextCount) : 0;
  return next - previous;
}
