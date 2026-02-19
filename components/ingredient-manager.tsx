'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Apple,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
  bulkUpdateIngredientDefaultStore,
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

const PAGE_SIZE = 20

type PageToken = number | 'left-ellipsis' | 'right-ellipsis'

function buildPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'right-ellipsis', totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      'left-ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ]
  }

  return [
    1,
    'left-ellipsis',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'right-ellipsis',
    totalPages,
  ]
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

  const handleSave = useCallback(async () => {
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

    try {
      if (editingEntry) {
        await updateIngredientEntry(entry)
        toast.success('Ingredient updated', { description: entry.name })
      } else {
        await addIngredientEntry(entry)
        toast.success('Ingredient added', { description: entry.name })
      }
      onOpenChange(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save ingredient.'
      toast.error(message)
    }
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStoreId, setFilterStoreId] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(
    new Set()
  )
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkStoreId, setBulkStoreId] = useState<string>('__none')
  const [bulkApplying, setBulkApplying] = useState(false)

  const handleAdd = useCallback(() => {
    setEditingEntry(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((entry: IngredientEntry) => {
    setEditingEntry(entry)
    setDialogOpen(true)
  }, [])

  const handleDelete = useCallback(
    async (id: string) => {
      const entry = entries.find((e) => e.id === id)
      try {
        await deleteIngredientEntry(id)
        setSelectedIngredientIds((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        toast.success('Ingredient removed', { description: entry?.name })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to delete ingredient.'
        toast.error(message)
      }
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
    if (filterStoreId === '__none') {
      list = list.filter((e) => !e.defaultStoreId)
    } else if (filterStoreId !== 'all') {
      list = list.filter((e) => e.defaultStoreId === filterStoreId)
    }
    return list
  }, [entries, search, filterCategory, filterStoreId])

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => a.name.localeCompare(b.name)),
    [filtered]
  )

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const paginatedEntries = sortedFiltered.slice(startIndex, startIndex + PAGE_SIZE)
  const pageTokens = useMemo(() => buildPageTokens(safePage, totalPages), [safePage, totalPages])

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedIngredientIds.has(entry.id)),
    [entries, selectedIngredientIds]
  )
  const selectedCount = selectedEntries.length
  const selectedFilteredCount = useMemo(
    () => filtered.filter((entry) => selectedIngredientIds.has(entry.id)).length,
    [filtered, selectedIngredientIds]
  )
  const allFilteredSelected =
    filtered.length > 0 && selectedFilteredCount === filtered.length

  useEffect(() => {
    const validIds = new Set(entries.map((entry) => entry.id))
    setSelectedIngredientIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [entries])

  useEffect(() => {
    setPage(1)
  }, [search, filterCategory, filterStoreId])

  useEffect(() => {
    setPage((prev) => (prev > totalPages ? totalPages : prev))
  }, [totalPages])

  useEffect(() => {
    if (selectedIngredientIds.size === 0 && bulkDialogOpen) {
      setBulkDialogOpen(false)
    }
  }, [selectedIngredientIds, bulkDialogOpen])

  const toggleIngredientSelection = useCallback((id: string, checked: boolean) => {
    setSelectedIngredientIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])

  const handleSelectAllFiltered = useCallback(() => {
    setSelectedIngredientIds((prev) => {
      const next = new Set(prev)
      for (const entry of filtered) {
        next.add(entry.id)
      }
      return next
    })
  }, [filtered])

  const handleClearSelection = useCallback(() => {
    setSelectedIngredientIds(new Set())
  }, [])

  const handleBulkApplyDefaultStore = useCallback(async () => {
    if (selectedEntries.length === 0) {
      toast.error('Select one or more ingredients first.')
      return
    }

    const normalizedStoreId =
      bulkStoreId === '__none' ? '' : String(bulkStoreId || '').trim()
    if (normalizedStoreId && !stores.some((store) => store.id === normalizedStoreId)) {
      toast.error('Selected store no longer exists.')
      return
    }

    const targetEntries = selectedEntries.filter(
      (entry) => entry.defaultStoreId !== normalizedStoreId
    )
    if (targetEntries.length === 0) {
      toast.info('No changes needed for selected ingredients.')
      return
    }

    setBulkApplying(true)
    try {
      const updated = await bulkUpdateIngredientDefaultStore(
        targetEntries.map((entry) => entry.id),
        normalizedStoreId
      )
      const storeName = normalizedStoreId
        ? (stores.find((store) => store.id === normalizedStoreId)?.name ??
          'selected store')
        : 'No default store'
      toast.success('Default store updated', {
        description: `Updated ${updated.length} ingredient${updated.length === 1 ? '' : 's'} to ${storeName}.`,
      })
      setBulkDialogOpen(false)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to apply default store to selected ingredients.'
      toast.error(message)
    } finally {
      setBulkApplying(false)
    }
  }, [bulkStoreId, selectedEntries, stores])

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

  const activeFilterCount =
    Number(filterCategory !== 'all') + Number(filterStoreId !== 'all')
  const showingStart = sortedFiltered.length === 0 ? 0 : startIndex + 1
  const showingEnd = Math.min(startIndex + PAGE_SIZE, sortedFiltered.length)

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

      {/* Search and filter toggle */}
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
        <Button
          type="button"
          size="sm"
          variant={filtersOpen || activeFilterCount > 0 ? 'secondary' : 'outline'}
          onClick={() => setFiltersOpen((prev) => !prev)}
          className="w-full sm:w-auto"
        >
          <SlidersHorizontal className="size-4" />
          Filters
          {activeFilterCount > 0 ? (
            <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      {filtersOpen ? (
        <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ingredient-filter-type">Type</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger id="ingredient-filter-type" className="h-9">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types ({entries.length})</SelectItem>
                {CATEGORIES.filter((cat) => categoryCounts[cat]).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat} ({categoryCounts[cat]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ingredient-filter-store">Store</Label>
            <Select value={filterStoreId} onValueChange={setFilterStoreId}>
              <SelectTrigger id="ingredient-filter-store" className="h-9">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                <SelectItem value="__none">No Default Store</SelectItem>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full sm:w-auto"
              onClick={() => {
                setFilterCategory('all')
                setFilterStoreId('all')
              }}
              disabled={activeFilterCount === 0}
            >
              Clear filters
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSelectAllFiltered}
          disabled={filtered.length === 0 || allFilteredSelected}
        >
          Select all filtered ({filtered.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleClearSelection}
          disabled={selectedCount === 0}
        >
          Clear selection
        </Button>
        <span className="text-xs text-muted-foreground">
          {selectedCount} selected
          {selectedFilteredCount !== selectedCount
            ? ` (${selectedFilteredCount} in current view)`
            : ''}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setBulkDialogOpen(true)}
          disabled={selectedCount === 0}
        >
          Set Default Store
        </Button>
      </div>

      {/* Flat list */}
      {sortedFiltered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Apple className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {search || activeFilterCount > 0
                ? 'No ingredients match your filters'
                : 'No ingredients yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || activeFilterCount > 0
                ? 'Try a different search or category.'
                : 'Start building your ingredient database.'}
            </p>
          </div>
          {!search && activeFilterCount === 0 && (
            <Button size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="size-4" />
              Add your first ingredient
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left font-medium">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Ingredient</th>
                    <th className="px-3 py-2 text-left font-medium">Unit</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Store</th>
                    <th className="w-24 px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedEntries.map((entry) => {
                    const storeName = getStoreName(entry.defaultStoreId)
                    return (
                      <tr key={entry.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 align-middle">
                          <Checkbox
                            checked={selectedIngredientIds.has(entry.id)}
                            onCheckedChange={(checked) =>
                              toggleIngredientSelection(entry.id, checked === true)
                            }
                            aria-label={`Select ${entry.name}`}
                          />
                        </td>
                        <td className="px-3 py-2.5 align-middle font-medium text-foreground">
                          {entry.name}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-muted-foreground">
                          {entry.defaultUnit || '—'}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <Badge
                            variant="secondary"
                            className={`text-xs font-medium ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.Other}`}
                          >
                            {entry.category || 'Other'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 align-middle text-muted-foreground">
                          {storeName || '—'}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex items-center justify-end gap-1">
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
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {showingStart}-{showingEnd} of {sortedFiltered.length}
            </p>
            {totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage <= 1}
                >
                  Prev
                </Button>
                {pageTokens.map((token) => {
                  if (token === 'left-ellipsis' || token === 'right-ellipsis') {
                    return (
                      <span
                        key={token}
                        className="inline-flex h-8 min-w-8 items-center justify-center px-1 text-xs text-muted-foreground"
                      >
                        ...
                      </span>
                    )
                  }

                  const isCurrent = token === safePage
                  return (
                    <Button
                      key={token}
                      type="button"
                      size="sm"
                      variant={isCurrent ? 'default' : 'outline'}
                      className="h-8 min-w-8 px-2"
                      onClick={() => setPage(token)}
                      disabled={isCurrent}
                    >
                      {token}
                    </Button>
                  )
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={safePage >= totalPages}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Default Store</DialogTitle>
            <DialogDescription>
              Apply a default store to {selectedCount} selected ingredient
              {selectedCount === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-default-store">Store</Label>
              <Select value={bulkStoreId} onValueChange={setBulkStoreId}>
                <SelectTrigger id="bulk-default-store" className="h-9">
                  <SelectValue placeholder="No default store" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No default store</SelectItem>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleBulkApplyDefaultStore()}
                disabled={bulkApplying}
              >
                {bulkApplying ? <Loader2 className="size-4 animate-spin" /> : null}
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
