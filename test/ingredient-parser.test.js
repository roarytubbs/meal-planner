import assert from "node:assert/strict";
import test from "node:test";

import {
  parseIngredients,
  parseIngredientsWithDiagnostics,
} from "../src/lib/meal-planner.js";

test("parser skips common commerce noise lines", () => {
  const parsed = parseIngredientsWithDiagnostics(
    "Add To Cart\nShop\n1/2 cup butter\nSold out",
    {},
  );

  assert.equal(parsed.ingredients.length, 1);
  assert.deepEqual(parsed.ingredients[0], {
    name: "butter",
    qty: 0.5,
    unit: "cup",
    store: "Unassigned",
  });
  assert.deepEqual(parsed.skippedLines, ["Add To Cart", "Shop", "Sold out"]);
});

test("parser reads parenthesized leading measurements", () => {
  const parsed = parseIngredientsWithDiagnostics("(1/2 cup) butter", {});

  assert.equal(parsed.ingredients.length, 1);
  assert.equal(parsed.ingredients[0].name, "butter");
  assert.equal(parsed.ingredients[0].qty, 0.5);
  assert.equal(parsed.ingredients[0].unit, "cup");
});

test("parser supports unicode fractions and mixed numeric forms", () => {
  const parsed = parseIngredientsWithDiagnostics("\u00bd cup milk\n1\u00bc cups flour", {});

  assert.equal(parsed.ingredients.length, 2);
  assert.equal(parsed.ingredients[0].qty, 0.5);
  assert.equal(parsed.ingredients[0].unit, "cup");
  assert.equal(parsed.ingredients[0].name, "milk");
  assert.equal(parsed.ingredients[1].qty, 1.25);
  assert.equal(parsed.ingredients[1].unit, "cup");
  assert.equal(parsed.ingredients[1].name, "flour");
});

test("parser diagnostics return skipped lines with mixed input", () => {
  const parsed = parseIngredientsWithDiagnostics(
    "Add To Cart\n(\u00bd cup) butter\nSelect size\n2 tbsp hot honey",
    {},
  );

  assert.equal(parsed.ingredients.length, 2);
  assert.deepEqual(
    parsed.ingredients.map((ingredient) => ingredient.name),
    ["butter", "hot honey"],
  );
  assert.deepEqual(parsed.skippedLines, ["Add To Cart", "Select size"]);
});

test("parseIngredients stays backward compatible with array return", () => {
  const parsed = parseIngredients("1/2 cup butter\nAdd To Cart", {});

  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "butter");
});
