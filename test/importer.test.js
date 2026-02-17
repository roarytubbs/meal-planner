import assert from "node:assert/strict";
import test from "node:test";

import { extractRecipeFromWebText } from "../src/lib/meal-planner.js";

test("import parser prefers JSON-LD when available", () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "JSON-LD Lemon Salmon",
            "description": "A bright lemon salmon dinner.",
            "recipeYield": "4 servings",
            "recipeIngredient": ["1 lb salmon", "2 tbsp lemon juice"],
            "recipeInstructions": [
              {"@type": "HowToStep", "text": "Season the salmon."},
              {"@type": "HowToStep", "text": "Bake for 15 minutes."}
            ]
          }
        </script>
      </head>
      <body>
        <h1>Incorrect fallback title</h1>
      </body>
    </html>
  `;

  const parsed = extractRecipeFromWebText(html, "https://example.com/lemon-salmon", {}, []);

  assert.equal(parsed.title, "JSON-LD Lemon Salmon");
  assert.equal(parsed.servings, 4);
  assert.equal(parsed.ingredients.length, 2);
  assert.equal(parsed.steps.length, 2);
});

test("import parser uses domain adapters before generic heuristics", () => {
  const content = `
    Fast Family Dinner
    Deselect All
    1 lb chicken breast
    2 tbsp olive oil
    Directions
    1. Season chicken.
    2. Bake until cooked through.
  `;

  const parsed = extractRecipeFromWebText(content, "https://www.foodnetwork.com/recipes/test", {}, []);

  assert.equal(parsed.ingredients.length, 2);
  assert.equal(parsed.steps.length, 2);
  assert.equal(parsed.title, "Fast Family Dinner");
});

test("import parser falls back to heuristic section parsing", () => {
  const content = `
    Title: Heuristic Pasta
    Description: Weeknight pasta with pantry staples and quick prep.
    Ingredients
    Pasta, 16, oz
    Olive oil, 1, tbsp
    Instructions
    1. Boil pasta.
    2. Toss with olive oil.
  `;

  const parsed = extractRecipeFromWebText(content, "https://unknown.example/pasta", {}, []);

  assert.equal(parsed.title, "Heuristic Pasta");
  assert.equal(parsed.ingredients.length, 2);
  assert.equal(parsed.steps.length, 2);
  assert.equal(parsed.steps[0], "Boil pasta.");
});

test("import parser handles malformed JSON-LD and still produces fallback output", () => {
  const content = `
    <script type="application/ld+json">{ "@type": "Recipe", "name": "Broken"</script>
    Title: Fallback Soup
    Ingredients
    1 cup broth
    Directions
    1. Heat and serve.
  `;

  const parsed = extractRecipeFromWebText(content, "https://example.com/soup", {}, []);

  assert.equal(parsed.title, "Fallback Soup");
  assert.equal(parsed.ingredients.length, 1);
  assert.equal(parsed.steps.length, 1);
});

test("import parser does not return partial JSON-LD when sections contain ingredients and steps", () => {
  const content = `
    <html>
      <head>
        <script type="application/ld+json">
          { "@context": "https://schema.org", "@type": "Recipe", "name": "Partial Recipe", "description": "Missing core fields" }
        </script>
      </head>
      <body>
        <h1>Cajun Turkey</h1>
        <h2>Ingredients</h2>
        <ul><li>1 whole turkey</li><li>2 tbsp oil</li></ul>
        <h2>Instructions</h2>
        <ol><li>Season turkey.</li><li>Smoke until done.</li></ol>
      </body>
    </html>
  `;

  const parsed = extractRecipeFromWebText(content, "https://example.com/turkey", {}, []);

  assert.ok(parsed.title.length > 0);
  assert.equal(parsed.ingredients.length, 2);
  assert.equal(parsed.steps.length, 2);
});
