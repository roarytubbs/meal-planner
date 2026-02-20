'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Apple,
  ChevronDown,
  Plus,
  MoreHorizontal,
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
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
  bulkUpdateIngredientCategory,
  bulkDeleteIngredientEntries,
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
interface IngredientManagerProps {
  title?: string
  subtitle?: string | null
  initialFilterStoreId?: string
  showIcon?: boolean
}

export function IngredientManager({
  title = 'Ingredients',
  subtitle,
  initialFilterStoreId,
  showIcon = true,
}: IngredientManagerProps = {}) {
  const entries = useIngredientEntries()
  const stores = useGroceryStores()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<IngredientEntry | null>(null)
  const [search, setSearch] = useState('')
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [filterCategories, setFilterCategories] = useState<string[]>([])
  const [filterStoreIds, setFilterStoreIds] = useState<string[]>(
    initialFilterStoreId ? [initialFilterStoreId] : []
  )
  const [page, setPage] = useState(1)
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(
    new Set()
  )
  const [bulkStoreDialogOpen, setBulkStoreDialogOpen] = useState(false)
  const [bulkCategoryDialogOpen, setBulkCategoryDialogOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkStoreId, setBulkStoreId] = useState<string>('__none')
  const [bulkCategory, setBulkCategory] = useState<string>('Pantry')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkCategoryApplying, setBulkCategoryApplying] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [rowDeleteConfirm, setRowDeleteConfirm] = useState<IngredientEntry | null>(null)

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
        setRowDeleteConfirm((prev) => (prev?.id === id ? null : prev))
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
    if (filterCategories.length > 0) {
      list = list.filter((e) => filterCategories.includes(e.category))
    }
    if (filterStoreIds.length > 0) {
      list = list.filter((e) => {
        if (!e.defaultStoreId) {
          return filterStoreIds.includes('__none')
        }
        return filterStoreIds.includes(e.defaultStoreId)
      })
    }
    return list
  }, [entries, filterCategories, filterStoreIds, search])

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
  const sharedSelectedStoreId = useMemo(() => {
    if (selectedEntries.length === 0) return '__none'
    const [first, ...rest] = selectedEntries
    const baseline = first.defaultStoreId || '__none'
    const allSame = rest.every(
      (entry) => (entry.defaultStoreId || '__none') === baseline
    )
    return allSame ? baseline : '__none'
  }, [selectedEntries])
  const sharedSelectedCategory = useMemo(() => {
    if (selectedEntries.length === 0) return 'Other'
    const [first, ...rest] = selectedEntries
    const baseline = first.category || 'Other'
    const allSame = rest.every((entry) => (entry.category || 'Other') === baseline)
    return allSame ? baseline : 'Other'
  }, [selectedEntries])
  const selectedCount = selectedEntries.length
  const selectedFilteredCount = useMemo(
    () => filtered.filter((entry) => selectedIngredientIds.has(entry.id)).length,
    [filtered, selectedIngredientIds]
  )
  const filteredIds = useMemo(
    () => filtered.map((entry) => entry.id),
    [filtered]
  )
  const allFilteredSelected =
    filtered.length > 0 && selectedFilteredCount === filtered.length
  const someFilteredSelected =
    selectedFilteredCount > 0 && !allFilteredSelected

  useEffect(() => {
    const validIds = new Set(entries.map((entry) => entry.id))
    setSelectedIngredientIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [entries])

  useEffect(() => {
    if (!initialFilterStoreId) {
      setFilterStoreIds([])
      return
    }
    setFilterStoreIds([initialFilterStoreId])
  }, [initialFilterStoreId])

  useEffect(() => {
    setPage(1)
  }, [search, filterCategories, filterStoreIds])

  useEffect(() => {
    setPage((prev) => (prev > totalPages ? totalPages : prev))
  }, [totalPages])

  useEffect(() => {
    if (selectedIngredientIds.size === 0) {
      setBulkStoreDialogOpen(false)
      setBulkCategoryDialogOpen(false)
      setBulkDeleteOpen(false)
    }
  }, [selectedIngredientIds])

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

  const handleToggleSelectAllFiltered = useCallback(
    (checked: boolean) => {
      setSelectedIngredientIds((prev) => {
        const next = new Set(prev)
        for (const id of filteredIds) {
          if (checked) {
            next.add(id)
          } else {
            next.delete(id)
          }
        }
        return next
      })
    },
    [filteredIds]
  )

  const toggleFilterCategory = useCallback((category: string, checked: boolean) => {
    setFilterCategories((prev) => {
      if (checked) {
        if (prev.includes(category)) return prev
        return [...prev, category]
      }
      return prev.filter((item) => item !== category)
    })
  }, [])

  const toggleFilterStore = useCallback((storeId: string, checked: boolean) => {
    setFilterStoreIds((prev) => {
      if (checked) {
        if (prev.includes(storeId)) return prev
        return [...prev, storeId]
      }
      return prev.filter((item) => item !== storeId)
    })
  }, [])

  const handleBulkApplyDefaultStore = useCallback(async () => {
    if (selectedEntries.length === 0) {
      toast.error('Select one or more ingredients first.')
      return
    }

    const normalizedStoreId = bulkStoreId === '__none' ? '' : String(bulkStoreId || '').trim()
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
        ? (stores.find((store) => store.id === normalizedStoreId)?.name ?? 'selected store')
        : 'No default store'
      toast.success('Default store updated', {
        description: `Updated ${updated.length} ingredient${updated.length === 1 ? '' : 's'} to ${storeName}.`,
      })
      setBulkStoreDialogOpen(false)
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

  const handleBulkApplyCategory = useCallback(async () => {
    if (selectedEntries.length === 0) {
      toast.error('Select one or more ingredients first.')
      return
    }

    const normalizedCategory = String(bulkCategory || '').trim()
    if (!normalizedCategory) {
      toast.error('Select a category to apply.')
      return
    }

    const targetEntries = selectedEntries.filter(
      (entry) => entry.category !== normalizedCategory
    )
    if (targetEntries.length === 0) {
      toast.info('No changes needed for selected ingredients.')
      return
    }

    setBulkCategoryApplying(true)
    try {
      const updated = await bulkUpdateIngredientCategory(
        targetEntries.map((entry) => entry.id),
        normalizedCategory
      )
      toast.success('Ingredient type updated', {
        description: `Updated ${updated.length} ingredient${updated.length === 1 ? '' : 's'} to ${normalizedCategory}.`,
      })
      setBulkCategoryDialogOpen(false)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to update ingredient type for selected ingredients.'
      toast.error(message)
    } finally {
      setBulkCategoryApplying(false)
    }
  }, [bulkCategory, selectedEntries])

  const handleBulkDeleteSelected = useCallback(async () => {
    if (selectedEntries.length === 0) return

    const ids = selectedEntries.map((entry) => entry.id)
    setBulkDeleting(true)
    try {
      const deletedCount = await bulkDeleteIngredientEntries(ids)
      setSelectedIngredientIds(new Set())
      setBulkDeleteOpen(false)
      toast.success('Ingredients removed', {
        description: `Deleted ${deletedCount} ingredient${deletedCount === 1 ? '' : 's'}.`,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to delete selected ingredients.'
      toast.error(message)
    } finally {
      setBulkDeleting(false)
    }
  }, [selectedEntries])

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
    Number(filterCategories.length > 0) + Number(filterStoreIds.length > 0)
  const showingStart = sortedFiltered.length === 0 ? 0 : startIndex + 1
  const showingEnd = Math.min(startIndex + PAGE_SIZE, sortedFiltered.length)
  const selectedStoreLabels = useMemo(
    () =>
      filterStoreIds.map((storeId) => {
        if (storeId === '__none') return { id: storeId, label: 'No default store' }
        return {
          id: storeId,
          label: stores.find((store) => store.id === storeId)?.name || 'Unknown store',
        }
      }),
    [filterStoreIds, stores]
  )
  const subtitleText =
    subtitle === undefined
      ? `${entries.length} ingredient${entries.length !== 1 ? 's' : ''} in your database`
      : subtitle

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {showIcon ? <Apple className="size-5 text-muted-foreground" /> : null}
          <div>
            <h2 className="text-xl font-bold text-foreground leading-tight">
              {title}
            </h2>
            {subtitleText ? (
              <p className="text-xs text-muted-foreground">{subtitleText}</p>
            ) : null}
          </div>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="size-4" />
          Add Ingredient
        </Button>
      </div>

      {/* Search and filters */}
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
        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={activeFilterCount > 0 ? 'secondary' : 'outline'}
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
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[320px] space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Filter Ingredients</p>
              <p className="text-xs text-muted-foreground">
                Narrow the list by type and store.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="h-9 w-full justify-between">
                    {filterCategories.length === 0
                      ? 'All types'
                      : `${filterCategories.length} type${filterCategories.length === 1 ? '' : 's'} selected`}
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  {CATEGORIES.filter((cat) => categoryCounts[cat]).map((cat) => (
                    <DropdownMenuCheckboxItem
                      key={cat}
                      checked={filterCategories.includes(cat)}
                      onCheckedChange={(checked) => toggleFilterCategory(cat, checked === true)}
                    >
                      {cat} ({categoryCounts[cat]})
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-1.5">
              <Label>Store</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="h-9 w-full justify-between">
                    {filterStoreIds.length === 0
                      ? 'All stores'
                      : `${filterStoreIds.length} store${filterStoreIds.length === 1 ? '' : 's'} selected`}
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuCheckboxItem
                    checked={filterStoreIds.includes('__none')}
                    onCheckedChange={(checked) => toggleFilterStore('__none', checked === true)}
                  >
                    No default store
                  </DropdownMenuCheckboxItem>
                  {stores.map((store) => (
                    <DropdownMenuCheckboxItem
                      key={store.id}
                      checked={filterStoreIds.includes(store.id)}
                      onCheckedChange={(checked) => toggleFilterStore(store.id, checked === true)}
                    >
                      {store.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-8"
                onClick={() => {
                  setFilterCategories([])
                  setFilterStoreIds([])
                }}
                disabled={activeFilterCount === 0}
              >
                Clear all filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {activeFilterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {filterCategories.map((category) => (
            <Badge key={category} variant="secondary" className="h-7 gap-1 pr-1">
              Type: {category}
              <button
                type="button"
                onClick={() => toggleFilterCategory(category, false)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                aria-label={`Clear ${category} type filter`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {selectedStoreLabels.map(({ id, label }) => (
            <Badge key={id} variant="secondary" className="h-7 gap-1 pr-1">
              Store: {label}
              <button
                type="button"
                onClick={() => toggleFilterStore(id, false)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-muted-foreground/10"
                aria-label={`Clear ${label} store filter`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setFilterCategories([])
              setFilterStoreIds([])
            }}
          >
            Clear all
          </Button>
        </div>
      ) : null}

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
            <div className="sticky top-0 z-20 flex min-h-11 items-center justify-between border-b border-border bg-background px-3 py-2">
              <span className="text-sm text-foreground">
                {selectedCount} selected
                {selectedFilteredCount !== selectedCount
                  ? ` (${selectedFilteredCount} in current view)`
                  : ''}
              </span>
              {selectedCount > 0 ? (
                <div className="ml-3 flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={bulkApplying || bulkCategoryApplying || bulkDeleting}
                      >
                        Actions
                        <ChevronDown className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setBulkStoreId(sharedSelectedStoreId)
                          setBulkStoreDialogOpen(true)
                        }}
                      >
                        Set default store
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setBulkCategory(sharedSelectedCategory)
                          setBulkCategoryDialogOpen(true)
                        }}
                      >
                        Change type
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setBulkDeleteOpen(true)}
                      >
                        Delete selected
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={
                            allFilteredSelected
                              ? true
                              : someFilteredSelected
                                ? 'indeterminate'
                                : false
                          }
                          onCheckedChange={(checked) =>
                            handleToggleSelectAllFiltered(checked === true)
                          }
                          disabled={filtered.length === 0}
                          aria-label="Select all filtered ingredients"
                        />
                        <span>Ingredient</span>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Unit</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Store</th>
                    <th className="w-24 px-3 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedEntries.map((entry) => {
                    const storeName = getStoreName(entry.defaultStoreId)
                    return (
                      <tr key={entry.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedIngredientIds.has(entry.id)}
                              onCheckedChange={(checked) =>
                                toggleIngredientSelection(entry.id, checked === true)
                              }
                              aria-label={`Select ${entry.name}`}
                            />
                            <span className="font-medium text-foreground">{entry.name}</span>
                          </div>
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
                          <div className="flex items-center justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  aria-label={`Actions for ${entry.name}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => handleEdit(entry)}>
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => setRowDeleteConfirm(entry)}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

      <AlertDialog
        open={rowDeleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setRowDeleteConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {rowDeleteConfirm?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the ingredient from the database. Existing recipes using
              it will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                rowDeleteConfirm ? handleDelete(rowDeleteConfirm.id) : undefined
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkStoreDialogOpen} onOpenChange={setBulkStoreDialogOpen}>
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
              <Button variant="outline" onClick={() => setBulkStoreDialogOpen(false)}>
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

      <Dialog open={bulkCategoryDialogOpen} onOpenChange={setBulkCategoryDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Ingredient Type</DialogTitle>
            <DialogDescription>
              Update type for {selectedCount} selected ingredient
              {selectedCount === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-category">Type</Label>
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger id="bulk-category" className="h-9">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleBulkApplyCategory()}
                disabled={bulkCategoryApplying}
              >
                {bulkCategoryApplying ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} selected ingredient{selectedCount === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected ingredients from your database. Existing recipes
              using them will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleBulkDeleteSelected()}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
