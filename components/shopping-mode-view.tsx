'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  ShoppingCart,
  Store,
  Tag,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  buildShoppingList,
  type PlannedSlotState,
  type ShoppingItem,
  type ShoppingStoreBucket,
} from '@/lib/shopping-list'
import {
  addIngredientEntry,
  useGroceryStores,
  useIngredientEntries,
  useMealPlanSnapshots,
  useRecipes,
  useStoreStatus,
} from '@/lib/meal-planner-store'
import type { GroceryStore, IngredientEntry } from '@/lib/types'
import {
  addIngredientEntry as saveNewIngredientEntry,
  updateIngredientEntry,
} from '@/lib/meal-planner-store'
import { handleError } from '@/lib/client-logger'
import { toast } from 'sonner'
import { getSnapshotDateRange } from '@/lib/meal-plan-snapshot-utils'
import { buildDateRange, type MealSelection } from '@/lib/types'
import {
  SHOP_STATE_CHANGED,
  toItemNK,
  getExcludedNKs,
  setExclusionNK,
  clearExcludedNKs,
} from '@/lib/shopping-list-local'

// ── Category inference ──────────────────────────────────────────────────────

const GROCERY_CATEGORIES: Array<{ name: string; keywords: string[] }> = [
  {
    name: 'Produce',
    keywords: [
      'apple', 'banana', 'lettuce', 'tomato', 'onion', 'garlic', 'carrot', 'potato',
      'lemon', 'lime', 'orange', 'berry', 'grape', 'cucumber', 'pepper', 'spinach',
      'kale', 'mushroom', 'broccoli', 'avocado', 'celery', 'zucchini', 'squash',
      'basil', 'parsley', 'cilantro', 'mint', 'ginger', 'arugula', 'scallion', 'leek',
      'shallot', 'jalapeño', 'mango', 'pineapple', 'peach', 'pear', 'radish', 'beet',
      'fennel', 'asparagus', 'eggplant', 'sweet potato', 'cabbage',
    ],
  },
  {
    name: 'Meat & Seafood',
    keywords: [
      'chicken', 'beef', 'pork', 'lamb', 'turkey', 'salmon', 'shrimp', 'fish',
      'tuna', 'steak', 'bacon', 'sausage', 'ham', 'tilapia', 'cod', 'crab',
      'lobster', 'scallop', 'ground beef', 'ground turkey', 'ground pork',
    ],
  },
  {
    name: 'Dairy & Eggs',
    keywords: [
      'milk', 'egg', 'cheese', 'butter', 'cream', 'yogurt', 'sour cream', 'cheddar',
      'mozzarella', 'parmesan', 'ricotta', 'feta', 'ghee', 'half and half',
    ],
  },
  {
    name: 'Grains & Pasta',
    keywords: [
      'flour', 'pasta', 'rice', 'bread', 'oat', 'cereal', 'noodle', 'spaghetti',
      'tortilla', 'quinoa', 'couscous', 'barley', 'cracker', 'panko', 'breadcrumb', 'pita',
    ],
  },
  {
    name: 'Canned & Pantry',
    keywords: [
      'broth', 'stock', 'bean', 'lentil', 'chickpea', 'olive oil', ' oil', 'vinegar',
      'sauce', 'paste', 'mustard', 'ketchup', 'mayonnaise', 'honey', 'maple syrup',
      'jam', 'peanut butter', 'tahini', 'salsa', 'canned', 'coconut milk',
    ],
  },
  {
    name: 'Spices & Baking',
    keywords: [
      'salt', 'pepper', 'cumin', 'paprika', 'oregano', 'thyme', 'rosemary',
      'cinnamon', 'nutmeg', 'turmeric', 'cayenne', 'baking powder', 'baking soda',
      'yeast', 'vanilla', 'sugar', 'brown sugar', 'cocoa', 'chocolate', 'cornstarch',
    ],
  },
  {
    name: 'Beverages',
    keywords: ['water', 'juice', 'coffee', 'tea', 'soda', 'wine', 'almond milk', 'oat milk'],
  },
]

function inferCategory(name: string): string {
  const n = name.toLowerCase()
  for (const cat of GROCERY_CATEGORIES) {
    if (cat.keywords.some((kw) => n.includes(kw))) return cat.name
  }
  return 'Other'
}

// ── Types & helpers ───────────────────────────────────────────────────────────

type SortMode = 'custom' | 'az' | 'category'

interface AdHocItem {
  id: string
  bucketKey: string
  name: string
  qty: number | null
  unit: string
}

type UnifiedItem =
  | { type: 'regular'; key: string; nk: string; item: ShoppingItem }
  | { type: 'adhoc'; key: string; item: AdHocItem }

function itemNK(item: ShoppingItem): string {
  return toItemNK(item.name, item.unit)
}

function fullItemKey(bucketKey: string, item: ShoppingItem): string {
  return `${bucketKey}::${itemNK(item)}`
}

function adHocItemKey(item: AdHocItem): string {
  return `adhoc::${item.id}`
}

function formatQty(qty: number | null): string {
  if (qty === null) return ''
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '')
}

// ── Unified item row ──────────────────────────────────────────────────────────

interface UnifiedItemRowProps {
  unified: UnifiedItem
  isChecked: boolean
  isExcluded: boolean
  isDragging: boolean
  isDropTarget: boolean
  draggable: boolean
  onToggle: () => void
  onRemove?: () => void
  onEdit?: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function UnifiedItemRow({
  unified,
  isChecked,
  isDragging,
  isDropTarget,
  draggable: canDrag,
  onToggle,
  onRemove,
  onEdit,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: UnifiedItemRowProps) {
  const { item } = unified
  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'group flex items-center gap-3 px-5 py-4 transition-colors select-none',
        isDropTarget ? 'border-t-2 border-primary bg-primary/5' : '',
        isDragging ? 'opacity-30' : '',
        isChecked && !isDragging ? 'bg-muted/20' : '',
        canDrag ? 'cursor-default' : '',
      ].join(' ')}
    >
      {canDrag ? (
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/30 active:cursor-grabbing" />
      ) : (
        <div className="w-4 shrink-0" />
      )}

      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 transition-transform active:scale-90"
        aria-label={isChecked ? `Uncheck ${item.name}` : `Check ${item.name}`}
      >
        {isChecked ? (
          <CheckCircle2 className="size-6 text-emerald-500" />
        ) : (
          <Circle className="size-6 text-border" />
        )}
      </button>

      <div className={`flex min-w-0 flex-1 items-center justify-between gap-3 ${isChecked ? 'opacity-40' : ''}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className={`text-sm font-medium text-left truncate ${isChecked ? 'line-through text-muted-foreground' : 'text-foreground hover:text-primary'} ${onEdit ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {item.name}
          </button>
          {unified.type === 'adhoc' ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              added
            </span>
          ) : null}
        </div>
        {item.qty !== null || item.unit ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatQty(item.qty)}{item.qty !== null && item.unit ? ' ' : ''}{item.unit}
          </span>
        ) : null}
      </div>

      {/* Remove button — visible on hover */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            title={unified.type === 'regular' ? 'Already have this — remove from list' : `Remove ${item.name}`}
            className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
            aria-label={`Remove ${item.name}`}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ── Ingredient bottom sheet ───────────────────────────────────────────────────

const ING_CATEGORIES = [
  'Produce', 'Dairy', 'Meat', 'Pantry', 'Bakery', 'Spices', 'Frozen', 'Beverages', 'Other',
]

function generateIngId() {
  return `ie_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

interface IngredientSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingEntry: IngredientEntry | null
  stores: GroceryStore[]
}

function IngredientSheet({ open, onOpenChange, editingEntry, stores }: IngredientSheetProps) {
  const [name, setName] = useState('')
  const [defaultUnit, setDefaultUnit] = useState('')
  const [defaultStoreId, setDefaultStoreId] = useState('')
  const [category, setCategory] = useState('Pantry')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      if (editingEntry) {
        setName(editingEntry.name)
        setDefaultUnit(editingEntry.defaultUnit)
        setDefaultStoreId(editingEntry.defaultStoreId || '')
        setCategory(editingEntry.category || 'Pantry')
      } else {
        setName('')
        setDefaultUnit('')
        setDefaultStoreId('')
        setCategory('Pantry')
      }
      setTimeout(() => nameRef.current?.focus(), 150)
    }
  }, [open, editingEntry])

  const handleSave = useCallback(async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const now = new Date().toISOString()
    const entry: IngredientEntry = {
      id: editingEntry?.id ?? generateIngId(),
      name: name.trim().toLowerCase(),
      defaultUnit: defaultUnit.trim(),
      defaultStoreId: defaultStoreId === '__none' ? '' : defaultStoreId,
      category,
      createdAt: editingEntry?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      if (editingEntry) {
        await updateIngredientEntry(entry)
        toast.success('Ingredient updated', { description: entry.name })
      } else {
        await saveNewIngredientEntry(entry)
        toast.success('Ingredient added', { description: entry.name })
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(handleError(err, 'ingredient.save'))
    } finally {
      setSaving(false)
    }
  }, [name, defaultUnit, defaultStoreId, category, editingEntry, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[62vh] overflow-y-auto px-5 pb-8"
      >
        <SheetHeader className="pb-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <SheetTitle>{editingEntry ? 'Edit Ingredient' : 'Add Ingredient'}</SheetTitle>
          <SheetDescription className="sr-only">
            {editingEntry ? 'Update ingredient details' : 'Add to ingredient database'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sheet-ing-name">Name</Label>
            <Input
              ref={nameRef}
              id="sheet-ing-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
              placeholder="e.g. fresh basil"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sheet-ing-unit">Default unit</Label>
              <Input
                id="sheet-ing-unit"
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
                placeholder="cup, tbsp…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sheet-ing-cat">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="sheet-ing-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ING_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sheet-ing-store">Default store</Label>
            <Select value={defaultStoreId || '__none'} onValueChange={setDefaultStoreId}>
              <SelectTrigger id="sheet-ing-store"><SelectValue placeholder="No default store" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No default store</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={() => void handleSave()} disabled={saving || !name.trim()} className="flex-1">
              {saving ? 'Saving…' : editingEntry ? 'Save Changes' : 'Add Ingredient'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ShoppingModeViewProps {
  standalone?: boolean
}

// ── Main view ────────────────────────────────────────────────────────────────

export function ShoppingModeView({ standalone = false }: ShoppingModeViewProps) {
  const { loading, error } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()
  const recipes = useRecipes()
  const stores = useGroceryStores()
  const ingredientEntries = useIngredientEntries()

  const activePlan = useMemo(() => {
    const active = snapshots.find((s) => s.isActive)
    return (
      active ??
      snapshots.slice().sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0] ??
      null
    )
  }, [snapshots])

  const buckets = useMemo(() => {
    if (!activePlan) return []
    const range = getSnapshotDateRange(activePlan)
    const dateKeys = range
      ? buildDateRange(range.startDateKey, range.days)
      : Array.from(new Set(activePlan.meals.map((m) => m.day))).sort()
    const slotMap = new Map<string, PlannedSlotState>()
    for (const meal of activePlan.meals) {
      slotMap.set(`${meal.day}:${meal.slot}`, {
        selection: meal.selection as MealSelection,
        recipeId: meal.recipeId,
      })
    }
    return buildShoppingList(dateKeys, slotMap, recipes, stores)
  }, [activePlan, recipes, stores])

  const planId = activePlan?.id ?? ''

  // ── Persisted state ───────────────────────────────────────────────────────
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set())
  const [customOrders, setCustomOrders] = useState<Map<string, string[]>>(() => new Map())
  const [sortModes, setSortModes] = useState<Map<string, SortMode>>(() => new Map())
  const [adHocItems, setAdHocItems] = useState<Map<string, AdHocItem[]>>(() => new Map())
  const [excludedNKs, setExcludedNKsState] = useState<Set<string>>(() => new Set())

  const reloadFromStorage = useCallback((id: string) => {
    if (!id) return
    try {
      const raw = localStorage.getItem(`mp_shop_checked_${id}`)
      if (raw) setCheckedKeys(new Set(JSON.parse(raw) as string[]))
    } catch { /* noop */ }
    try {
      const raw = localStorage.getItem(`mp_shop_orders_${id}`)
      if (raw) setCustomOrders(new Map(Object.entries(JSON.parse(raw) as Record<string, string[]>)))
    } catch { /* noop */ }
    try {
      const raw = localStorage.getItem(`mp_shop_adhoc_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw) as AdHocItem[]
        const map = new Map<string, AdHocItem[]>()
        for (const item of parsed) {
          if (!map.has(item.bucketKey)) map.set(item.bucketKey, [])
          map.get(item.bucketKey)!.push(item)
        }
        setAdHocItems(map)
      }
    } catch { /* noop */ }
    setExcludedNKsState(getExcludedNKs(id))
  }, [])

  useEffect(() => {
    reloadFromStorage(planId)
  }, [planId, reloadFromStorage])

  // Listen for changes from other components (ingredient manager, meal planner, etc.)
  useEffect(() => {
    if (!planId) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ planId: string }>).detail
      if (detail?.planId === planId) {
        setExcludedNKsState(getExcludedNKs(planId))
        // reload ad-hoc too in case items were added from ingredients page
        try {
          const raw = localStorage.getItem(`mp_shop_adhoc_${planId}`)
          if (raw) {
            const parsed = JSON.parse(raw) as AdHocItem[]
            const map = new Map<string, AdHocItem[]>()
            for (const item of parsed) {
              if (!map.has(item.bucketKey)) map.set(item.bucketKey, [])
              map.get(item.bucketKey)!.push(item)
            }
            setAdHocItems(map)
          }
        } catch { /* noop */ }
      }
    }
    window.addEventListener(SHOP_STATE_CHANGED, handler)
    return () => window.removeEventListener(SHOP_STATE_CHANGED, handler)
  }, [planId])

  useEffect(() => {
    if (!planId) return
    localStorage.setItem(`mp_shop_checked_${planId}`, JSON.stringify([...checkedKeys]))
  }, [checkedKeys, planId])

  useEffect(() => {
    if (!planId) return
    const obj: Record<string, string[]> = {}
    customOrders.forEach((v, k) => { obj[k] = v })
    localStorage.setItem(`mp_shop_orders_${planId}`, JSON.stringify(obj))
  }, [customOrders, planId])

  useEffect(() => {
    if (!planId) return
    const all: AdHocItem[] = []
    adHocItems.forEach((items) => all.push(...items))
    localStorage.setItem(`mp_shop_adhoc_${planId}`, JSON.stringify(all))
  }, [adHocItems, planId])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [dragFrom, setDragFrom] = useState<{ bucketKey: string; idx: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ bucketKey: string; idx: number } | null>(null)
  const [addingToBucket, setAddingToBucket] = useState<string | null>(null)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [addSheetBucketKey, setAddSheetBucketKey] = useState<string | null>(null)
  const [addForm, setAddForm] = useState<{ name: string; qty: string; unit: string }>({ name: '', qty: '', unit: '' })
  const [collapseChecked, setCollapseChecked] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<IngredientEntry | null>(null)
  const [ingredientSheetOpen, setIngredientSheetOpen] = useState(false)
  const [addSuggestions, setAddSuggestions] = useState<IngredientEntry[]>([])
  const [selectedIngDefaultStoreId, setSelectedIngDefaultStoreId] = useState<string | null>(null)
  const addNameRef = useRef<HTMLInputElement>(null)

  // ── Derived ───────────────────────────────────────────────────────────────
  const allAdHocItems = useMemo(() => {
    const result: AdHocItem[] = []
    adHocItems.forEach((items) => result.push(...items))
    return result
  }, [adHocItems])

  // Buckets from the plan + any ad-hoc-only buckets (e.g. from ingredient manager)
  const allBuckets = useMemo((): ShoppingStoreBucket[] => {
    const planBucketKeys = new Set(buckets.map((b) => b.key))
    const extraBuckets: ShoppingStoreBucket[] = []
    adHocItems.forEach((items, bucketKey) => {
      if (planBucketKeys.has(bucketKey) || items.length === 0) return
      const storeName = bucketKey === '__misc__'
        ? 'Other Items'
        : stores.find((s) => bucketKey === `id:${s.id}`)?.name ?? 'Other Items'
      const storeId = bucketKey === '__misc__' ? null : bucketKey.replace(/^id:/, '')
      extraBuckets.push({ key: bucketKey, storeId, storeName, items: [] })
    })
    return [...buckets, ...extraBuckets]
  }, [buckets, adHocItems, stores])

  const totalItems = useMemo(
    () => {
      let count = 0
      for (const b of buckets) {
        for (const item of b.items) {
          if (!excludedNKs.has(itemNK(item))) count++
        }
      }
      count += allAdHocItems.length
      return count
    },
    [buckets, allAdHocItems, excludedNKs]
  )

  const checkedCount = useMemo(() => {
    let count = 0
    for (const bucket of buckets) {
      for (const item of bucket.items) {
        const nk = itemNK(item)
        if (!excludedNKs.has(nk) && checkedKeys.has(fullItemKey(bucket.key, item))) count++
      }
    }
    for (const item of allAdHocItems) {
      if (checkedKeys.has(adHocItemKey(item))) count++
    }
    return count
  }, [buckets, checkedKeys, allAdHocItems, excludedNKs])

  const excludedCount = useMemo(() => excludedNKs.size, [excludedNKs])

  const progressPct = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const toggleItem = useCallback((key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const clearChecked = useCallback(() => setCheckedKeys(new Set()), [])

  const excludeItem = useCallback((nk: string) => {
    if (!planId) return
    setExclusionNK(planId, nk, true)
    setExcludedNKsState(getExcludedNKs(planId))
  }, [planId])

  const restoreAllExcluded = useCallback(() => {
    if (!planId) return
    clearExcludedNKs(planId)
    setExcludedNKsState(new Set())
  }, [planId])

  const getSortMode = useCallback(
    (bucketKey: string): SortMode => sortModes.get(bucketKey) ?? 'custom',
    [sortModes]
  )

  const updateSortMode = useCallback((bucketKey: string, mode: SortMode) => {
    setSortModes((prev) => new Map(prev).set(bucketKey, mode))
  }, [])

  const getUnifiedItems = useCallback(
    (bucket: ShoppingStoreBucket): UnifiedItem[] => {
      const mode = getSortMode(bucket.key)
      const bucketAdHoc = adHocItems.get(bucket.key) ?? []

      const regular: UnifiedItem[] = bucket.items
        .filter((item) => !excludedNKs.has(itemNK(item)))
        .map((item) => ({
          type: 'regular' as const,
          key: fullItemKey(bucket.key, item),
          nk: itemNK(item),
          item,
        }))
      const adhoc: UnifiedItem[] = bucketAdHoc.map((item) => ({
        type: 'adhoc' as const,
        key: adHocItemKey(item),
        item,
      }))
      const all = [...regular, ...adhoc]

      if (mode === 'az') {
        return all.sort((a, b) => a.item.name.localeCompare(b.item.name))
      }
      if (mode === 'category') {
        return all.sort((a, b) => {
          const catA = inferCategory(a.item.name)
          const catB = inferCategory(b.item.name)
          return catA !== catB ? catA.localeCompare(catB) : a.item.name.localeCompare(b.item.name)
        })
      }

      const order = customOrders.get(bucket.key)
      if (!order) return all
      const byKey = new Map<string, UnifiedItem>()
      for (const u of all) byKey.set(u.key, u)
      const result: UnifiedItem[] = []
      for (const k of order) {
        const u = byKey.get(k)
        if (u) { result.push(u); byKey.delete(k) }
      }
      for (const u of byKey.values()) result.push(u)
      return result
    },
    [getSortMode, adHocItems, customOrders, excludedNKs]
  )

  const moveItem = useCallback(
    (bucket: ShoppingStoreBucket, fromIdx: number, toIdx: number) => {
      const currentItems = getUnifiedItems(bucket)
      if (toIdx < 0 || toIdx >= currentItems.length) return
      const next = [...currentItems]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      setCustomOrders((prev) => new Map(prev).set(bucket.key, next.map((u) => u.key)))
      setSortModes((prev) => new Map(prev).set(bucket.key, 'custom'))
    },
    [getUnifiedItems]
  )

  const openAddForm = useCallback((bucketKey: string) => {
    setAddingToBucket(bucketKey)
    setAddForm({ name: '', qty: '', unit: '' })
    setAddSuggestions([])
    setSelectedIngDefaultStoreId(null)
    setTimeout(() => addNameRef.current?.focus(), 50)
  }, [])

  const closeAddForm = useCallback(() => {
    setAddingToBucket(null)
    setAddSheetOpen(false)
    setAddSheetBucketKey(null)
    setAddForm({ name: '', qty: '', unit: '' })
    setAddSuggestions([])
    setSelectedIngDefaultStoreId(null)
  }, [])

  const openAddSheet = useCallback((bucketKey: string | null) => {
    const key = bucketKey ?? allBuckets[0]?.key ?? '__misc__'
    setAddSheetBucketKey(key)
    setAddForm({ name: '', qty: '', unit: '' })
    setAddSuggestions([])
    setSelectedIngDefaultStoreId(null)
    setAddSheetOpen(true)
  }, [allBuckets])

  const handleAddNameChange = useCallback((value: string) => {
    setAddForm((f) => ({ ...f, name: value }))
    setSelectedIngDefaultStoreId(null)
    if (value.trim().length >= 1) {
      const lower = value.toLowerCase()
      const matches = ingredientEntries
        .filter((e) => e.name.includes(lower))
        .slice(0, 6)
      setAddSuggestions(matches)
    } else {
      setAddSuggestions([])
    }
  }, [ingredientEntries])

  const selectSuggestion = useCallback((entry: IngredientEntry) => {
    setAddForm({ name: entry.name, qty: '', unit: entry.defaultUnit })
    setAddSuggestions([])
    setSelectedIngDefaultStoreId(entry.defaultStoreId || null)
    setTimeout(() => addNameRef.current?.blur(), 0)
  }, [])

  const openEditIngredient = useCallback((itemName: string) => {
    const entry = ingredientEntries.find((e) => e.name.toLowerCase() === itemName.toLowerCase())
    if (entry) {
      setEditingIngredient(entry)
    } else {
      setEditingIngredient({
        id: `ing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: itemName.toLowerCase(),
        defaultUnit: '',
        defaultStoreId: '',
        category: inferCategory(itemName),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
    setIngredientSheetOpen(true)
  }, [ingredientEntries])

  const handleAddAdHocItem = useCallback(
    async (bucket: ShoppingStoreBucket) => {
      const name = addForm.name.trim()
      if (!name) return

      const qtyNum = addForm.qty ? parseFloat(addForm.qty) : null
      const qty = qtyNum !== null && Number.isFinite(qtyNum) ? qtyNum : null
      const unit = addForm.unit.trim()
      const id = `adhoc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      // Route to the ingredient's default store if one was selected from autocomplete
      let targetBucketKey = bucket.key
      let targetStoreId = bucket.storeId
      if (selectedIngDefaultStoreId) {
        const candidateKey = `id:${selectedIngDefaultStoreId}`
        const matchesPlanBucket = buckets.some((b) => b.key === candidateKey)
        const matchesAdHocBucket = adHocItems.has(candidateKey)
        if (matchesPlanBucket || matchesAdHocBucket) {
          targetBucketKey = candidateKey
          targetStoreId = selectedIngDefaultStoreId
        } else {
          // Store exists in the stores list even if not yet in any bucket
          const storeExists = stores.some((s) => s.id === selectedIngDefaultStoreId)
          if (storeExists) {
            targetBucketKey = candidateKey
            targetStoreId = selectedIngDefaultStoreId
          }
        }
      }

      const newItem: AdHocItem = { id, bucketKey: targetBucketKey, name, qty, unit }
      setAdHocItems((prev) => {
        const next = new Map(prev)
        next.set(targetBucketKey, [...(next.get(targetBucketKey) ?? []), newItem])
        return next
      })
      closeAddForm()

      try {
        await addIngredientEntry({
          id,
          name,
          defaultUnit: unit,
          defaultStoreId: targetStoreId ?? '',
          category: inferCategory(name),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      } catch { /* keep local item even if save fails */ }
    },
    [addForm, selectedIngDefaultStoreId, buckets, adHocItems, stores, closeAddForm]
  )

  const handleAddFromSheet = useCallback(async () => {
    if (!addSheetBucketKey) return
    const bucket = allBuckets.find((b) => b.key === addSheetBucketKey) ?? {
      key: '__misc__',
      storeId: null,
      storeName: 'Other Items',
      items: [],
    }
    await handleAddAdHocItem(bucket)
    setAddSheetOpen(false)
  }, [addSheetBucketKey, allBuckets, handleAddAdHocItem])

  const handleDeleteAdHocItem = useCallback((bucketKey: string, itemId: string) => {
    setAdHocItems((prev) => {
      const next = new Map(prev)
      next.set(bucketKey, (next.get(bucketKey) ?? []).filter((i) => i.id !== itemId))
      return next
    })
    setCheckedKeys((prev) => {
      const next = new Set(prev)
      next.delete(`adhoc::${itemId}`)
      return next
    })
  }, [])

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderBuckets = () => (
    <div className="space-y-6">
      {checkedCount === totalItems && totalItems > 0 ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            All done! Great shopping trip 🎉
          </p>
        </div>
      ) : null}

      {excludedCount > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            {excludedCount} item{excludedCount !== 1 ? 's' : ''} hidden — already in your pantry
          </p>
          <button
            type="button"
            onClick={restoreAllExcluded}
            className="text-xs font-medium text-primary transition-colors hover:underline"
          >
            Restore all
          </button>
        </div>
      ) : null}

      {allBuckets.map((bucket) => {
        const sortMode = getSortMode(bucket.key)
        const unifiedItems = getUnifiedItems(bucket)
        const bucketChecked = unifiedItems.filter((u) => checkedKeys.has(u.key)).length

        const visibleItems = collapseChecked
          ? unifiedItems.filter((u) => !checkedKeys.has(u.key))
          : unifiedItems

        let categoryGroups: Array<{ category: string; items: UnifiedItem[] }> | null = null
        if (sortMode === 'category') {
          const grouped = new Map<string, UnifiedItem[]>()
          for (const u of visibleItems) {
            const cat = inferCategory(u.item.name)
            if (!grouped.has(cat)) grouped.set(cat, [])
            grouped.get(cat)!.push(u)
          }
          categoryGroups = Array.from(grouped.entries())
            .sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
            .map(([category, items]) => ({ category, items }))
        }

        return (
          <section key={bucket.key} className="overflow-hidden rounded-2xl border border-border bg-card">
            {/* Store header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/65 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-2">
                <Store className="size-4 shrink-0 text-muted-foreground" />
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {bucket.storeName}
                </h2>
                <span className="shrink-0 rounded-full border border-border/65 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {bucketChecked}/{unifiedItems.length}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {(['custom', 'az', 'category'] as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateSortMode(bucket.key, mode)}
                    className={[
                      'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      sortMode === mode
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    ].join(' ')}
                  >
                    {mode === 'category' ? <Tag className="size-3" /> : null}
                    {mode === 'custom' ? 'Custom' : mode === 'az' ? 'A–Z' : 'Category'}
                  </button>
                ))}
              </div>
            </div>

            {/* Items */}
            <div className="divide-y divide-border/40">
              {categoryGroups ? (
                categoryGroups.map(({ category, items: catItems }) => (
                  <div key={category}>
                    <div className="bg-muted/30 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                      {category}
                    </div>
                    {catItems.map((unified) => (
                      <UnifiedItemRow
                        key={unified.key}
                        unified={unified}
                        isChecked={checkedKeys.has(unified.key)}
                        isExcluded={false}
                        isDragging={false}
                        isDropTarget={false}
                        draggable={false}
                        onToggle={() => toggleItem(unified.key)}
                        onRemove={unified.type === 'regular'
                          ? () => excludeItem(unified.nk)
                          : () => handleDeleteAdHocItem(bucket.key, unified.item.id)}
                        onEdit={() => openEditIngredient(unified.item.name)}
                        onDragStart={() => {}}
                        onDragEnd={() => {}}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => e.preventDefault()}
                      />
                    ))}
                  </div>
                ))
              ) : (
                visibleItems.map((unified, idx) => {
                  const isDragging =
                    dragFrom?.bucketKey === bucket.key && dragFrom.idx === idx
                  const isDropTarget =
                    dragOver?.bucketKey === bucket.key &&
                    dragOver.idx === idx &&
                    dragFrom?.bucketKey === bucket.key &&
                    dragFrom.idx !== idx
                  return (
                    <UnifiedItemRow
                      key={unified.key}
                      unified={unified}
                      isChecked={checkedKeys.has(unified.key)}
                      isExcluded={false}
                      isDragging={isDragging}
                      isDropTarget={isDropTarget}
                      draggable={sortMode === 'custom'}
                      onToggle={() => toggleItem(unified.key)}
                      onRemove={unified.type === 'regular'
                        ? () => excludeItem(unified.nk)
                        : () => handleDeleteAdHocItem(bucket.key, unified.item.id)}
                      onEdit={() => openEditIngredient(unified.item.name)}
                      onDragStart={() => setDragFrom({ bucketKey: bucket.key, idx })}
                      onDragEnd={() => { setDragFrom(null); setDragOver(null) }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (dragFrom?.bucketKey === bucket.key) {
                          setDragOver({ bucketKey: bucket.key, idx })
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (dragFrom && dragFrom.bucketKey === bucket.key && dragFrom.idx !== idx) {
                          moveItem(bucket, dragFrom.idx, idx)
                        }
                        setDragFrom(null)
                        setDragOver(null)
                      }}
                    />
                  )
                })
              )}
            </div>

            {/* Add item form / button */}
            {addingToBucket === bucket.key ? (() => {
              const routeStoreName = selectedIngDefaultStoreId
                ? stores.find((s) => s.id === selectedIngDefaultStoreId)?.name
                : null
              const showsRouting = routeStoreName && routeStoreName !== bucket.storeName
              return (
                <div className="border-t border-border/40 bg-muted/10 px-4 py-3 flex flex-col gap-2">
                  <div className="relative">
                    <input
                      ref={addNameRef}
                      type="text"
                      value={addForm.name}
                      onChange={(e) => handleAddNameChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && addSuggestions.length === 0) void handleAddAdHocItem(bucket)
                        if (e.key === 'Escape') closeAddForm()
                      }}
                      placeholder="Search or type item name…"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                    {addSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                        {addSuggestions.map((entry) => {
                          const entryStore = entry.defaultStoreId
                            ? stores.find((s) => s.id === entry.defaultStoreId)?.name
                            : null
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(entry) }}
                              className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-muted"
                            >
                              <span className="font-medium">{entry.name}</span>
                              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                {entry.defaultUnit && <span>{entry.defaultUnit}</span>}
                                {entryStore && <span className="text-primary/70">→ {entryStore}</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {showsRouting && (
                    <p className="text-[11px] text-primary/70 -mt-0.5">
                      Will be added to <span className="font-medium">{routeStoreName}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={addForm.qty}
                      onChange={(e) => setAddForm((f) => ({ ...f, qty: e.target.value }))}
                      placeholder="Qty"
                      className="w-16 rounded-md border border-border bg-background px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="text"
                      value={addForm.unit}
                      onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                      placeholder="Unit"
                      className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button
                      size="sm"
                      onClick={() => void handleAddAdHocItem(bucket)}
                      disabled={!addForm.name.trim()}
                      className="flex-1"
                    >
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={closeAddForm} className="shrink-0">
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              )
            })() : (
              <button
                type="button"
                onClick={() => openAddSheet(bucket.key)}
                className="flex w-full items-center justify-center gap-2 border-t border-border/40 px-5 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              >
                <Plus className="size-4" />
                Add item
              </button>
            )}
          </section>
        )
      })}
    </div>
  )

  // ── Standalone page layout ────────────────────────────────────────────────
  if (standalone) {
    return (
      <>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Link
                  href={activePlan ? `/plans/${encodeURIComponent(activePlan.id)}` : '/plans'}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Link>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <ShoppingCart className="size-4 text-foreground" />
                  <span className="font-semibold text-foreground">Shopping</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {checkedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCollapseChecked((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {collapseChecked ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    {collapseChecked ? 'Show' : 'Hide'} checked
                  </button>
                ) : null}
                {checkedCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearChecked}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : null}
                <span className="text-sm tabular-nums text-muted-foreground">
                  {checkedCount}/{totalItems}
                </span>
              </div>
            </div>
            {activePlan ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">{activePlan.label}</p>
            ) : null}
            {totalItems > 0 ? (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            ) : null}
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-5 py-6 pb-16">
          {renderContent()}
        </div>
      </div>
      <IngredientSheet
        open={ingredientSheetOpen}
        onOpenChange={setIngredientSheetOpen}
        editingEntry={editingIngredient}
        stores={stores}
      />
      </>
    )
  }

  // ── Inline (tab) layout ───────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-4">
        {activePlan ? (
          <Button
            size="default"
            className="w-full"
            onClick={() => openAddSheet(null)}
          >
            <Plus className="size-4" />
            Add item
          </Button>
        ) : null}

        {activePlan && totalItems > 0 ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{activePlan.label}</p>
              <p className="text-xs text-muted-foreground">{checkedCount} of {totalItems} items checked</p>
            </div>
            <div className="flex items-center gap-3">
              {checkedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setCollapseChecked((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {collapseChecked ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  {collapseChecked ? 'Show' : 'Hide'} checked
                </button>
              ) : null}
              {checkedCount > 0 ? (
                <button
                  type="button"
                  onClick={clearChecked}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear checked
                </button>
              ) : null}
              <span className="text-sm tabular-nums text-muted-foreground">{progressPct}%</span>
            </div>
          </div>
        ) : null}

        {totalItems > 0 ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}

        {renderContent()}
      </div>

      {/* Global add-item sheet */}
      <Sheet open={addSheetOpen} onOpenChange={(v) => { if (!v) closeAddForm(); setAddSheetOpen(v) }}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[62vh] flex flex-col px-5 pb-6">
          <SheetHeader className="shrink-0 pb-2">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <SheetTitle>Add to list</SheetTitle>
            <SheetDescription className="sr-only">Search your ingredient database or type a new item</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
            {allBuckets.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-sheet-store">Store</Label>
                <Select value={addSheetBucketKey ?? '__misc__'} onValueChange={setAddSheetBucketKey}>
                  <SelectTrigger id="add-sheet-store">
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {allBuckets.map((b) => (
                      <SelectItem key={b.key} value={b.key}>{b.storeName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-sheet-name">Item name</Label>
              <div className="relative">
                <Input
                  ref={addNameRef}
                  id="add-sheet-name"
                  type="text"
                  value={addForm.name}
                  onChange={(e) => handleAddNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && addSuggestions.length === 0) void handleAddFromSheet()
                    if (e.key === 'Escape') closeAddForm()
                  }}
                  placeholder="Search or type item name…"
                  autoComplete="off"
                />
                {addSuggestions.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                    {addSuggestions.map((entry) => {
                      const entryStore = entry.defaultStoreId
                        ? stores.find((s) => s.id === entry.defaultStoreId)?.name
                        : null
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectSuggestion(entry) }}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-muted"
                        >
                          <span className="font-medium">{entry.name}</span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {entry.defaultUnit ? <span>{entry.defaultUnit}</span> : null}
                            {entryStore ? <span className="text-primary/70">→ {entryStore}</span> : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-sheet-qty">Qty</Label>
                <Input
                  id="add-sheet-qty"
                  type="number"
                  value={addForm.qty}
                  onChange={(e) => setAddForm((f) => ({ ...f, qty: e.target.value }))}
                  placeholder="e.g. 2"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-sheet-unit">Unit</Label>
                <Input
                  id="add-sheet-unit"
                  type="text"
                  value={addForm.unit}
                  onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="e.g. cups"
                />
              </div>
            </div>

            <Button
              size="default"
              className="w-full mt-auto"
              disabled={!addForm.name.trim()}
              onClick={() => void handleAddFromSheet()}
            >
              Add to list
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <IngredientSheet
        open={ingredientSheetOpen}
        onOpenChange={setIngredientSheetOpen}
        editingEntry={editingIngredient}
        stores={stores}
      />
    </>
  )

  function renderContent() {
    if (loading && !activePlan) {
      return <p className="text-sm text-muted-foreground">Loading shopping list...</p>
    }
    if (error) {
      return <p className="text-sm text-destructive">{error}</p>
    }
    if (!activePlan) {
      return (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <ShoppingCart className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No active meal plan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set a meal plan as active to see your shopping list here.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href="/plans">View Meal Plans</Link>
          </Button>
        </div>
      )
    }
    if (allBuckets.length === 0) {
      return (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Store className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No shopping list items</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add recipes with ingredients to your plan to build a list.
          </p>
        </div>
      )
    }
    return renderBuckets()
  }
}
