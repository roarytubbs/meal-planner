import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateReceiptDelta,
  findNextIncompleteDay,
  getDayCompletionModel,
} from "../src/lib/planner-ux.js";

test("day completion model tracks planned slots out of three meals", () => {
  const completion = getDayCompletionModel({
    dayMode: "planned",
    meals: {
      breakfast: { mode: "recipe" },
      lunch: { mode: "skip" },
      dinner: { mode: "leftovers" },
    },
  });

  assert.equal(completion.configuredMeals, 2);
  assert.equal(completion.totalMeals, 3);
  assert.equal(completion.isComplete, false);
  assert.equal(completion.label, "2/3 set");
});

test("day completion model marks day overrides complete", () => {
  const completion = getDayCompletionModel({
    dayMode: "leftovers",
    meals: {
      breakfast: { mode: "skip" },
      lunch: { mode: "skip" },
      dinner: { mode: "skip" },
    },
  });

  assert.equal(completion.isComplete, true);
  assert.equal(completion.label, "Override");
});

test("next incomplete day selection skips override days", () => {
  const next = findNextIncompleteDay(["Monday", "Tuesday", "Wednesday"], {
    Monday: { dayMode: "leftovers" },
    Tuesday: {
      dayMode: "planned",
      meals: {
        breakfast: { mode: "recipe" },
        lunch: { mode: "skip" },
        dinner: { mode: "recipe" },
      },
    },
    Wednesday: {
      dayMode: "planned",
      meals: {
        breakfast: { mode: "recipe" },
        lunch: { mode: "recipe" },
        dinner: { mode: "recipe" },
      },
    },
  });

  assert.equal(next, "Tuesday");
});

test("receipt delta returns signed item count changes", () => {
  assert.equal(calculateReceiptDelta(4, 7), 3);
  assert.equal(calculateReceiptDelta(5, 2), -3);
  assert.equal(calculateReceiptDelta(3, 3), 0);
});
