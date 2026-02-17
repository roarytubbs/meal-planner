'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Apple,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { IngredientEntry, GroceryStore } from '@/lib/types'
import {
  useIngredientEntries,
  useGroceryStores,
  addIngredientEntry,
  updateIngredientEntry,
  deleteIngredientEntry,
} from '@/lib/meal-planner-store'

function generateId() {
  return `ie_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

const CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat',
  'Pantry',
  'Bakery',
  'Spices',
  'Frozen',
  'Beverages',
  'Other',
]

const CATEGORY_COLORS: Record<string, string> = {
  Produce: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Dairy: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  Meat: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  Pantry: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Bakery: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Spices: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  Frozen: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  Beverages: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  Other: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

// ---- Add/Edit Dialog ----
function IngredientDialog({
  open,
  onOpenChange,
  editingEntry,
  stores,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingEntry: IngredientEntry | null
  stores: GroceryStore[]
}) {
  const [name, setName] = useState('')
  const [defaultUnit, setDefaultUnit] = useState('')
  const [defaultStoreId, setDefaultStoreId] = useState('')
  const [category, setCategory] = useState('Pantry')

  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      if (editingEntry) {
        setName(editingEntry.name)
        setDefaultUnit(editingEntry.defaultUnit)
        setDefaultStoreId(editingEntry.defaultStoreId)
        setCategory(editingEntry.category)
      } else {
        setName('')
        setDefaultUnit('')
        setDefaultStoreId('')
        setCategory('Pantry')
      }
      // Focus name field after mount
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [open, editingEntry])

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      toast.error('Ingredient name is required')
      return
    }

    const now = new Date().toISOString()
    const entry: IngredientEntry = {
      id: editingEntry?.id ?? generateId(),
      name: name.trim().toLowerCase(),
      defaultUnit: defaultUnit.trim(),
      defaultStoreId: defaultStoreId === '__none' ? '' : defaultStoreId,
      category,
      createdAt: editingEntry?.createdAt ?? now,
      updatedAt: now,
    }

    if (editingEntry) {
      updateIngredientEntry(entry)
      toast.success('Ingredient updated', { description: entry.name })
    } else {
      addIngredientEntry(entry)
      toast.success('Ingredient added', { description: entry.name })
    }
    onOpenChange(false)
  }, [name, defaultUnit, defaultStoreId, category, editingEntry, onOpenChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
    },
    [handleSave]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingEntry ? 'Edit Ingredient' : 'Add Ingredient'}
          </DialogTitle>
          <DialogDescription>
            {editingEntry
              ? 'Update the ingredient details. This serves as a suggestion when adding ingredients to recipes.'
              : 'Add a new ingredient to your database. It will appear as a suggestion when building recipes.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ing-name">Name</Label>
            <Input
              ref={nameRef}
              id="ing-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. fresh basil"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ing-unit">Default unit</Label>
              <Input
                id="ing-unit"
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. cup, tbsp"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ing-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="ing-category" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ing-store">Default store</Label>
            <Select value={defaultStoreId} onValueChange={setDefaultStoreId}>
              <SelectTrigger id="ing-store" className="h-9">
                <SelectValue placeholder="No default store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No default store</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1">
              {editingEntry ? 'Save Changes' : 'Add Ingredient'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---- Main Ingredient Manager ----
export function IngredientManager() {
  const entries = useIngredientEntries()
  const stores = useGroceryStores()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<IngredientEntry | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())

  const handleAdd = useCallback(() => {
    setEditingEntry(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((entry: IngredientEntry) => {
    setEditingEntry(entry)
    setDialogOpen(true)
  }, [])

  const handleDelete = useCallback(
    (id: string) => {
      const entry = entries.find((e) => e.id === id)
      deleteIngredientEntry(id)
      toast.success('Ingredient removed', { description: entry?.name })
    },
    [entries]
  )

  // Filter and group
  const filtered = useMemo(() => {
    let list = entries
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((e) => e.name.toLowerCase().includes(q))
    }
    if (filterCategory !== 'all') {
      list = list.filter((e) => e.category === filterCategory)
    }
    return list
  }, [entries, search, filterCategory])

  const grouped = useMemo(() => {
    const map: Record<string, IngredientEntry[]> = {}
    for (const entry of filtered) {
      const cat = entry.category || 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push(entry)
    }
    // Sort categories
    const order = CATEGORIES
    const sorted: Record<string, IngredientEntry[]> = {}
    for (const cat of order) {
      if (map[cat]) {
        sorted[cat] = map[cat].sort((a, b) => a.name.localeCompare(b.name))
      }
    }
    // any remaining
    for (const cat of Object.keys(map)) {
      if (!sorted[cat]) {
        sorted[cat] = map[cat].sort((a, b) => a.name.localeCompare(b.name))
      }
    }
    return sorted
  }, [filtered])

  const toggleCat = useCallback((cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  const getStoreName = useCallback(
    (storeId: string) => {
      if (!storeId || storeId === '__none') return null
      const s = stores.find((st) => st.id === storeId)
      return s?.name ?? null
    },
    [stores]
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of entries) {
      counts[e.category] = (counts[e.category] || 0) + 1
    }
    return counts
  }, [entries])

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Apple className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-bold text-foreground leading-tight">
              Ingredients
            </h2>
            <p className="text-xs text-muted-foreground">
              {entries.length} ingredient{entries.length !== 1 ? 's' : ''} in
              your database
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="size-4" />
          Add Ingredient
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredients..."
            className="pl-10"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterCategory('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterCategory === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            All ({entries.length})
          </button>
          {CATEGORIES.filter((cat) => categoryCounts[cat]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() =>
                setFilterCategory(filterCategory === cat ? 'all' : cat)
              }
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {cat} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      </div>

      {/* Grouped list */}
      {Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Apple className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {search || filterCategory !== 'all'
                ? 'No ingredients match your filters'
                : 'No ingredients yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || filterCategory !== 'all'
                ? 'Try a different search or category.'
                : 'Start building your ingredient database.'}
            </p>
          </div>
          {!search && filterCategory === 'all' && (
            <Button size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="size-4" />
              Add your first ingredient
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {Object.entries(grouped).map(([category, items]) => {
            const isCollapsed = collapsedCats.has(category)

            return (
              <div
                key={category}
                className="rounded-xl border border-border overflow-hidden"
              >
                {/* Category header */}
                <button
                  type="button"
                  onClick={() => toggleCat(category)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                  <Badge
                    variant="secondary"
                    className={`text-xs font-medium ${CATEGORY_COLORS[category] || CATEGORY_COLORS.Other}`}
                  >
                    {category}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {items.length} item{items.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Items */}
                {!isCollapsed && (
                  <div className="divide-y divide-border">
                    {items.map((entry) => {
                      const storeName = getStoreName(entry.defaultStoreId)
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground">
                              {entry.name}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {entry.defaultUnit && (
                                <span className="text-xs text-muted-foreground">
                                  Unit: {entry.defaultUnit}
                                </span>
                              )}
                              {storeName && (
                                <>
                                  {entry.defaultUnit && (
                                    <span className="text-xs text-muted-foreground">
                                      {'|'}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {storeName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleEdit(entry)}
                              aria-label={`Edit ${entry.name}`}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  aria-label={`Delete ${entry.name}`}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete {entry.name}?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This removes the ingredient from the database.
                                    Existing recipes using this ingredient will not be
                                    affected.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(entry.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <IngredientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingEntry={editingEntry}
        stores={stores}
      />
    </div>
  )
}
