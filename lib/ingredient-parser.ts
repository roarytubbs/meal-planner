// Ingredient parser with diagnostics for bulk paste parsing
// Supports unicode fractions, mixed fractions, parenthesized measurements

export interface ParsedIngredient {
  name: string
  qty: number | null
  unit: string
  store: string
}

export interface ParseDiagnostics {
  ingredients: ParsedIngredient[]
  skippedLines: string[]
}

// Unicode fraction mapping
const UNICODE_FRACTIONS: Record<string, number> = {
  '\u00BC': 0.25, // ¼
  '\u00BD': 0.5,  // ½
  '\u00BE': 0.75, // ¾
  '\u2150': 0.142857, // ⅐
  '\u2151': 0.111111, // ⅑
  '\u2152': 0.1,  // ⅒
  '\u2153': 0.333333, // ⅓
  '\u2154': 0.666667, // ⅔
  '\u2155': 0.2,  // ⅕
  '\u2156': 0.4,  // ⅖
  '\u2157': 0.6,  // ⅗
  '\u2158': 0.8,  // ⅘
  '\u2159': 0.166667, // ⅙
  '\u215A': 0.833333, // ⅚
  '\u215B': 0.125, // ⅛
  '\u215C': 0.375, // ⅜
  '\u215D': 0.625, // ⅝
  '\u215E': 0.875, // ⅞
}

// Common units
const UNITS = new Set([
  'cup', 'cups', 'c',
  'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'tb',
  'teaspoon', 'teaspoons', 'tsp', 'ts',
  'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g',
  'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'ml',
  'liter', 'liters', 'l',
  'pint', 'pints', 'pt',
  'quart', 'quarts', 'qt',
  'gallon', 'gallons', 'gal',
  'pinch', 'pinches',
  'dash', 'dashes',
  'stick', 'sticks',
  'clove', 'cloves',
  'slice', 'slices',
  'piece', 'pieces', 'pc', 'pcs',
  'bunch', 'bunches',
  'can', 'cans',
  'package', 'packages', 'pkg',
  'bag', 'bags',
  'head', 'heads',
  'sprig', 'sprigs',
  'handful', 'handfuls',
  'whole',
  'small', 'medium', 'large',
])

// Lines to skip (noise from web copy-paste)
const NOISE_PATTERNS = [
  /^add\s+to\s+cart$/i,
  /^shop$/i,
  /^sold\s+out$/i,
  /^select\s+size$/i,
  /^buy\s+now$/i,
  /^add\s+to\s+(list|bag|basket)$/i,
  /^in\s+stock$/i,
  /^out\s+of\s+stock$/i,
  /^save$/i,
  /^share$/i,
  /^print$/i,
  /^advertisement$/i,
  /^sponsored$/i,
  /^subscribe$/i,
  /^sign\s+up$/i,
  /^log\s*in$/i,
  /^ingredients:?$/i,
  /^directions:?$/i,
  /^instructions:?$/i,
  /^nutrition\s+(info|facts|information):?$/i,
  /^prep\s+time/i,
  /^cook\s+time/i,
  /^total\s+time/i,
  /^servings?:?\s*$/i,
  /^yield:?\s*$/i,
  /^\d+\s*(cal|calories|kcal)/i,
  /^jump\s+to\s+recipe$/i,
  /^rate\s+this\s+recipe$/i,
  /^\s*$/,
]

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (trimmed.length < 2) return true
  if (trimmed.length > 200) return true
  return NOISE_PATTERNS.some((p) => p.test(trimmed))
}

/**
 * Parse a fraction string to a number.
 * Supports: "1/2", "3/4", unicode fractions, and mixed like "1 1/2" or "1½"
 */
function parseFraction(str: string): number | null {
  const trimmed = str.trim()
  if (!trimmed) return null

  // Check for pure number
  const directNum = Number(trimmed)
  if (!isNaN(directNum) && trimmed !== '') return directNum

  // Check for unicode fraction alone
  if (UNICODE_FRACTIONS[trimmed] !== undefined) {
    return UNICODE_FRACTIONS[trimmed]
  }

  // Check for number + unicode fraction (e.g., "1½")
  const unicodeMixed = trimmed.match(/^(\d+)\s*([^\d\s/])$/)
  if (unicodeMixed) {
    const whole = parseInt(unicodeMixed[1], 10)
    const frac = UNICODE_FRACTIONS[unicodeMixed[2]]
    if (frac !== undefined) return whole + frac
  }

  // Check for slash fraction "1/2"
  const slashFrac = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (slashFrac) {
    const num = parseInt(slashFrac[1], 10)
    const den = parseInt(slashFrac[2], 10)
    if (den !== 0) return num / den
  }

  // Check for mixed fraction "1 1/2"
  const mixedFrac = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixedFrac) {
    const whole = parseInt(mixedFrac[1], 10)
    const num = parseInt(mixedFrac[2], 10)
    const den = parseInt(mixedFrac[3], 10)
    if (den !== 0) return whole + num / den
  }

  return null
}

/**
 * Parse a single ingredient line into structured data.
 */
function parseIngredientLine(line: string): ParsedIngredient {
  let text = line.trim()

  // Remove leading bullet points, dashes, numbers with periods
  text = text.replace(/^[-*\u2022\u2023\u25E6\u2043]\s*/, '')
  text = text.replace(/^\d+\.\s+/, '')

  let qty: number | null = null
  let unit = ''
  let name = text

  // Try parenthesized leading measurement: "(1/2 cup) butter"
  const parenMatch = text.match(
    /^\(([^)]+)\)\s+(.+)$/
  )
  if (parenMatch) {
    const inner = parenMatch[1].trim()
    const rest = parenMatch[2].trim()
    const parsed = parseQtyUnit(inner)
    if (parsed.qty !== null) {
      qty = parsed.qty
      unit = parsed.unit
      name = rest
      return cleanIngredient({ name, qty, unit, store: '' })
    }
  }

  // Try standard leading measurement: "1/2 cup butter"
  const parsed = parseLeadingMeasurement(text)
  if (parsed) {
    qty = parsed.qty
    unit = parsed.unit
    name = parsed.rest
  }

  return cleanIngredient({ name, qty, unit, store: '' })
}

function parseQtyUnit(text: string): { qty: number | null; unit: string } {
  // Try to parse as "qty unit" or just "qty"
  const parts = text.split(/\s+/)

  // Try first part(s) as quantity
  for (let i = 1; i <= Math.min(3, parts.length); i++) {
    const qtyStr = parts.slice(0, i).join(' ')
    const qtyVal = parseFraction(qtyStr)
    if (qtyVal !== null) {
      const remaining = parts.slice(i).join(' ').toLowerCase()
      if (remaining && UNITS.has(remaining)) {
        return { qty: qtyVal, unit: normalizeUnit(remaining) }
      }
      if (i === 1 && !remaining) {
        return { qty: qtyVal, unit: '' }
      }
    }
  }

  // Try just first token as qty
  const firstQty = parseFraction(parts[0])
  if (firstQty !== null) {
    const rest = parts.slice(1).join(' ').toLowerCase()
    if (UNITS.has(rest)) {
      return { qty: firstQty, unit: normalizeUnit(rest) }
    }
    return { qty: firstQty, unit: '' }
  }

  return { qty: null, unit: '' }
}

function parseLeadingMeasurement(
  text: string
): { qty: number; unit: string; rest: string } | null {
  // Patterns to try in order:
  // 1. "1 1/2 cup butter" (mixed fraction + unit + name)
  // 2. "1/2 cup butter" (fraction + unit + name)
  // 3. "½ cup butter" (unicode fraction + unit + name)
  // 4. "1½ cup butter" (number+unicode + unit + name)
  // 5. "2 cups butter" (number + unit + name)
  // 6. "2 butter" (number only, no unit)

  const unicodeFracChars = Object.keys(UNICODE_FRACTIONS).join('')
  const unicodeCharClass = `[${unicodeFracChars}]`

  // Mixed fraction: "1 1/2 cups butter"
  const mixedRe = new RegExp(
    `^(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)\\s+(.+)$`
  )
  const mixedMatch = text.match(mixedRe)
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10)
    const num = parseInt(mixedMatch[2], 10)
    const den = parseInt(mixedMatch[3], 10)
    if (den !== 0) {
      const qtyVal = whole + num / den
      const rest = mixedMatch[4]
      const unitAndName = extractUnit(rest)
      return { qty: qtyVal, unit: unitAndName.unit, rest: unitAndName.rest }
    }
  }

  // Slash fraction: "1/2 cup butter"
  const slashRe = /^(\d+)\s*\/\s*(\d+)\s+(.+)$/
  const slashMatch = text.match(slashRe)
  if (slashMatch) {
    const num = parseInt(slashMatch[1], 10)
    const den = parseInt(slashMatch[2], 10)
    if (den !== 0) {
      const qtyVal = num / den
      const rest = slashMatch[3]
      const unitAndName = extractUnit(rest)
      return { qty: qtyVal, unit: unitAndName.unit, rest: unitAndName.rest }
    }
  }

  // Number + unicode fraction: "1½ cups butter"
  const numUnicodeRe = new RegExp(
    `^(\\d+)(${unicodeCharClass})\\s+(.+)$`
  )
  const numUnicodeMatch = text.match(numUnicodeRe)
  if (numUnicodeMatch) {
    const whole = parseInt(numUnicodeMatch[1], 10)
    const frac = UNICODE_FRACTIONS[numUnicodeMatch[2]]
    if (frac !== undefined) {
      const qtyVal = whole + frac
      const rest = numUnicodeMatch[3]
      const unitAndName = extractUnit(rest)
      return { qty: qtyVal, unit: unitAndName.unit, rest: unitAndName.rest }
    }
  }

  // Unicode fraction alone: "½ cup butter"
  const unicodeRe = new RegExp(
    `^(${unicodeCharClass})\\s+(.+)$`
  )
  const unicodeMatch = text.match(unicodeRe)
  if (unicodeMatch) {
    const frac = UNICODE_FRACTIONS[unicodeMatch[1]]
    if (frac !== undefined) {
      const rest = unicodeMatch[2]
      const unitAndName = extractUnit(rest)
      return { qty: frac, unit: unitAndName.unit, rest: unitAndName.rest }
    }
  }

  // Plain number: "2 cups butter" or "2 butter"
  const numRe = /^(\d+(?:\.\d+)?)\s+(.+)$/
  const numMatch = text.match(numRe)
  if (numMatch) {
    const qtyVal = parseFloat(numMatch[1])
    const rest = numMatch[2]
    const unitAndName = extractUnit(rest)
    return { qty: qtyVal, unit: unitAndName.unit, rest: unitAndName.rest }
  }

  return null
}

function extractUnit(text: string): { unit: string; rest: string } {
  const parts = text.split(/\s+/)
  const firstWord = parts[0].toLowerCase().replace(/[.,]$/, '')

  if (UNITS.has(firstWord) && parts.length > 1) {
    return {
      unit: normalizeUnit(firstWord),
      rest: parts.slice(1).join(' '),
    }
  }

  // Try two-word units (not common but safe)
  if (parts.length > 2) {
    const twoWord = `${parts[0]} ${parts[1]}`.toLowerCase()
    if (UNITS.has(twoWord)) {
      return {
        unit: normalizeUnit(twoWord),
        rest: parts.slice(2).join(' '),
      }
    }
  }

  return { unit: '', rest: text }
}

function normalizeUnit(unit: string): string {
  const normalized: Record<string, string> = {
    c: 'cup',
    cups: 'cup',
    tbsp: 'tbsp',
    tbs: 'tbsp',
    tb: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    tsp: 'tsp',
    ts: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    oz: 'oz',
    ounce: 'oz',
    ounces: 'oz',
    lb: 'lb',
    lbs: 'lb',
    pound: 'lb',
    pounds: 'lb',
    g: 'g',
    gram: 'g',
    grams: 'g',
    kg: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    l: 'l',
    liter: 'l',
    liters: 'l',
    pt: 'pint',
    pint: 'pint',
    pints: 'pint',
    qt: 'quart',
    quart: 'quart',
    quarts: 'quart',
    gal: 'gallon',
    gallon: 'gallon',
    gallons: 'gallon',
    pinch: 'pinch',
    pinches: 'pinch',
    dash: 'dash',
    dashes: 'dash',
    stick: 'stick',
    sticks: 'stick',
    clove: 'clove',
    cloves: 'clove',
    slice: 'slice',
    slices: 'slice',
    piece: 'piece',
    pieces: 'piece',
    pc: 'piece',
    pcs: 'piece',
    bunch: 'bunch',
    bunches: 'bunch',
    can: 'can',
    cans: 'can',
    package: 'package',
    packages: 'package',
    pkg: 'package',
    bag: 'bag',
    bags: 'bag',
    head: 'head',
    heads: 'head',
    sprig: 'sprig',
    sprigs: 'sprig',
    handful: 'handful',
    handfuls: 'handful',
    whole: 'whole',
    small: 'small',
    medium: 'medium',
    large: 'large',
  }
  return normalized[unit.toLowerCase()] || unit.toLowerCase()
}

function cleanIngredient(ing: ParsedIngredient): ParsedIngredient {
  // Clean up name: remove trailing commas, parenthetical notes after comma
  let name = ing.name.trim()
  // Remove common suffixes like ", divided" ", to taste"
  name = name.replace(/,\s*(divided|optional|to taste|or more|as needed|for garnish|for serving)$/i, '')
  name = name.trim().replace(/^,\s*/, '').replace(/,\s*$/, '')

  return {
    ...ing,
    name: name || 'Unknown ingredient',
    qty: ing.qty !== null ? Math.round(ing.qty * 1000) / 1000 : null,
  }
}

/**
 * Parse bulk pasted text into an array of ingredients.
 * Backward-compatible: returns just the array.
 */
export function parseIngredients(
  text: string,
  existingNames?: string[]
): ParsedIngredient[] {
  const result = parseIngredientsWithDiagnostics(text, existingNames)
  return result.ingredients
}

/**
 * Parse bulk pasted text with diagnostics (skipped lines info).
 */
export function parseIngredientsWithDiagnostics(
  text: string,
  existingNames?: string[]
): ParseDiagnostics {
  const lines = text.split('\n').map((l) => l.trim())
  const ingredients: ParsedIngredient[] = []
  const skippedLines: string[] = []

  for (const line of lines) {
    if (!line) continue

    if (isNoiseLine(line)) {
      skippedLines.push(line)
      continue
    }

    const parsed = parseIngredientLine(line)
    ingredients.push(parsed)
  }

  return { ingredients, skippedLines }
}
