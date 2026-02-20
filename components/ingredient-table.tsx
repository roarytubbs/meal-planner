'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { MoreHorizontal, Plus, ClipboardPaste, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import type { Ingredient } from '@/lib/types'
import { parseIngredientsWithDiagnostics } from '@/lib/ingredient-parser'
import { useIngredientEntries, useGroceryStores } from '@/lib/meal-planner-store'

interface IngredientTableProps {
  ingredients: Ingredient[]
  onChange: (ingredients: Ingredient[]) => void
  showTitle?: boolean
}

function generateId() {
  return `ing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function NameAutocomplete({
  value,
  onChange,
  onSelect,
  onKeyDown,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onSelect: (name: string, unit: string, store: string, storeId: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const entries = useIngredientEntries()
  const stores = useGroceryStores()
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  const suggestions = useMemo(() => {
    if (!value.trim() || value.trim().length < 1) return []
    const q = value.toLowerCase()
    return entries.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8)
  }, [value, entries])

  useEffect(() => {
    setHighlightIndex(-1)
    setOpen(suggestions.length > 0)
  }, [suggestions])

  const handleSelect = useCallback(
    (idx: number) => {
      const entry = suggestions[idx]
      if (!entry) return
      const store = stores.find((s) => s.id === entry.defaultStoreId)
      onSelect(entry.name, entry.defaultUnit, store?.name ?? '', entry.defaultStoreId)
      setOpen(false)
    },
    [suggestions, stores, onSelect]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || suggestions.length === 0) {
        onKeyDown(e)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
      } else if (e.key === 'Enter' && highlightIndex >= 0) {
        e.preventDefault()
        handleSelect(highlightIndex)
      } else if (e.key === 'Escape') {
        setOpen(false)
        onKeyDown(e)
      } else {
        onKeyDown(e)
      }
    },
    [open, suggestions, highlightIndex, handleSelect, onKeyDown]
  )

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150)
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        className="h-8 text-sm"
        placeholder="Name"
        aria-label="Ingredient name"
        autoComplete="off"
      />
      {open && suggestions.length > 0 ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-md"
          role="listbox"
        >
          {suggestions.map((entry, i) => {
            const store = stores.find((s) => s.id === entry.defaultStoreId)
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={i === highlightIndex}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                  i === highlightIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'text-popover-foreground hover:bg-accent/50'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(i)
                }}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                <span className="truncate font-medium">{entry.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {[entry.defaultUnit, store?.name].filter(Boolean).join(' | ')}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function StoreSelect({
  value,
  storeId,
  onChangeStore,
}: {
  value: string
  storeId?: string
  onChangeStore: (storeName: string, storeId: string) => void
}) {
  const stores = useGroceryStores()

  return (
    <Select
      value={storeId || '__none'}
      onValueChange={(v) => {
        if (v === '__none') {
          onChangeStore('', '')
          return
        }
        const store = stores.find((s) => s.id === v)
        onChangeStore(store?.name ?? '', v)
      }}
    >
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder="Store">{value || 'None'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">No store</SelectItem>
        {stores.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function IngredientTable({
  ingredients,
  onChange,
  showTitle = true,
}: IngredientTableProps) {
  const stores = useGroceryStores()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Ingredient | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<Set<string>>(
    () => new Set()
  )
  const [bulkStoreDialogOpen, setBulkStoreDialogOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkStoreId, setBulkStoreId] = useState('__none')

  const nameInputRef = useRef<HTMLInputElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editingId && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [editingId])

  useEffect(() => {
    if (showPaste && pasteRef.current) {
      pasteRef.current.focus()
    }
  }, [showPaste])

  useEffect(() => {
    setSelectedIngredientIds((previous) => {
      const available = new Set(ingredients.map((ingredient) => ingredient.id))
      const next = new Set<string>()
      for (const id of previous) {
        if (available.has(id)) next.add(id)
      }
      return next
    })
  }, [ingredients])

  const filteredIngredients = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return ingredients

    return ingredients.filter((ingredient) => {
      const haystack = [ingredient.name, ingredient.unit, ingredient.store]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
      return haystack.includes(query)
    })
  }, [ingredients, search])

  const selectedCount = selectedIngredientIds.size
  const allFilteredSelected =
    filteredIngredients.length > 0 &&
    filteredIngredients.every((ingredient) => selectedIngredientIds.has(ingredient.id))
  const someFilteredSelected =
    filteredIngredients.some((ingredient) => selectedIngredientIds.has(ingredient.id)) &&
    !allFilteredSelected

  const selectedIngredients = useMemo(
    () => ingredients.filter((ingredient) => selectedIngredientIds.has(ingredient.id)),
    [ingredients, selectedIngredientIds]
  )

  const sharedSelectedStoreId = useMemo(() => {
    if (selectedIngredients.length === 0) return '__none'

    const first = selectedIngredients[0].storeId || '__none'
    const same = selectedIngredients.every(
      (ingredient) => (ingredient.storeId || '__none') === first
    )
    return same ? first : '__none'
  }, [selectedIngredients])

  const startEdit = useCallback((ingredient: Ingredient) => {
    setEditingId(ingredient.id)
    setEditDraft({ ...ingredient })
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditDraft(null)
  }, [])

  const saveEdit = useCallback(() => {
    if (!editDraft) return
    const updated = ingredients.map((ingredient) =>
      ingredient.id === editDraft.id ? editDraft : ingredient
    )
    onChange(updated)
    setEditingId(null)
    setEditDraft(null)
  }, [editDraft, ingredients, onChange])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        saveEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      }
    },
    [saveEdit, cancelEdit]
  )

  const handleDelete = useCallback(
    (id: string) => {
      const index = ingredients.findIndex((ingredient) => ingredient.id === id)
      if (index === -1) return
      const ingredient = ingredients[index]

      const updated = ingredients.filter((row) => row.id !== id)
      onChange(updated)
      setSelectedIngredientIds((previous) => {
        if (!previous.has(id)) return previous
        const next = new Set(previous)
        next.delete(id)
        return next
      })

      toast('Ingredient deleted', {
        description: ingredient.name,
        action: {
          label: 'Undo',
          onClick: () => {
            const restored = [...updated]
            restored.splice(Math.min(index, restored.length), 0, ingredient)
            onChange(restored)
          },
        },
      })
    },
    [ingredients, onChange]
  )

  const handleCopyName = useCallback((name: string) => {
    navigator.clipboard.writeText(name).then(() => {
      toast('Copied to clipboard', { description: name })
    })
  }, [])

  const addEmpty = useCallback(() => {
    const newIngredient: Ingredient = {
      id: generateId(),
      name: '',
      qty: null,
      unit: '',
      store: '',
    }
    onChange([...ingredients, newIngredient])
    setEditingId(newIngredient.id)
    setEditDraft(newIngredient)
  }, [ingredients, onChange])

  const handleBulkPaste = useCallback(() => {
    if (!pasteText.trim()) return
    const result = parseIngredientsWithDiagnostics(pasteText)

    const newIngredients: Ingredient[] = result.ingredients.map((parsed) => ({
      id: generateId(),
      name: parsed.name,
      qty: parsed.qty,
      unit: parsed.unit,
      store: parsed.store,
    }))

    onChange([...ingredients, ...newIngredients])

    if (result.skippedLines.length > 0) {
      toast.warning(
        `Skipped ${result.skippedLines.length} non-ingredient line${result.skippedLines.length > 1 ? 's' : ''} from paste.`
      )
    }

    if (newIngredients.length > 0) {
      toast.success(
        `Added ${newIngredients.length} ingredient${newIngredients.length > 1 ? 's' : ''}`
      )
    }

    setPasteText('')
    setShowPaste(false)
  }, [pasteText, ingredients, onChange])

  const toggleIngredientSelection = useCallback((id: string, selected: boolean) => {
    setSelectedIngredientIds((previous) => {
      const next = new Set(previous)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleToggleSelectAllFiltered = useCallback(
    (selected: boolean) => {
      setSelectedIngredientIds((previous) => {
        const next = new Set(previous)
        for (const ingredient of filteredIngredients) {
          if (selected) next.add(ingredient.id)
          else next.delete(ingredient.id)
        }
        return next
      })
    },
    [filteredIngredients]
  )

  const handleOpenBulkStoreDialog = useCallback(() => {
    setBulkStoreId(sharedSelectedStoreId)
    setBulkStoreDialogOpen(true)
  }, [sharedSelectedStoreId])

  const handleBulkSetDefaultStore = useCallback(() => {
    if (selectedIngredients.length === 0) {
      toast.error('Select one or more ingredients first.')
      return
    }

    const nextStoreId = bulkStoreId === '__none' ? '' : bulkStoreId
    const nextStoreName =
      nextStoreId.length > 0
        ? stores.find((store) => store.id === nextStoreId)?.name || ''
        : ''

    const selectedIds = new Set(selectedIngredients.map((ingredient) => ingredient.id))
    const updated = ingredients.map((ingredient) => {
      if (!selectedIds.has(ingredient.id)) return ingredient
      return {
        ...ingredient,
        storeId: nextStoreId || undefined,
        store: nextStoreName,
      }
    })

    onChange(updated)
    setBulkStoreDialogOpen(false)

    toast.success('Default store updated', {
      description:
        nextStoreId.length > 0
          ? `Applied ${nextStoreName || 'selected store'} to ${selectedIngredients.length} ingredient${selectedIngredients.length === 1 ? '' : 's'}.`
          : `Cleared store for ${selectedIngredients.length} ingredient${selectedIngredients.length === 1 ? '' : 's'}.`,
    })
  }, [bulkStoreId, ingredients, onChange, selectedIngredients, stores])

  const handleBulkDelete = useCallback(() => {
    if (selectedIngredients.length === 0) {
      toast.error('Select one or more ingredients first.')
      return
    }

    const selectedIds = new Set(selectedIngredients.map((ingredient) => ingredient.id))
    const updated = ingredients.filter((ingredient) => !selectedIds.has(ingredient.id))

    onChange(updated)
    setSelectedIngredientIds(new Set())
    setBulkDeleteOpen(false)

    toast.success('Ingredients deleted', {
      description: `Removed ${selectedIngredients.length} ingredient${selectedIngredients.length === 1 ? '' : 's'}.`,
    })
  }, [ingredients, onChange, selectedIngredients])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {showTitle ? <h3 className="text-base font-semibold text-foreground">Ingredients</h3> : <span />}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPaste((previous) => !previous)}
          >
            <ClipboardPaste className="size-4" />
            <span className="hidden sm:inline">Paste</span>
          </Button>
          <Button type="button" size="sm" onClick={addEmpty}>
            <Plus className="size-4" />
            Add Ingredient
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ingredients in this recipe..."
          className="pl-10 pr-10"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/25 px-3 py-2">
          <span className="text-xs text-foreground">{selectedCount} selected</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={handleOpenBulkStoreDialog}
          >
            Set default store
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 px-2 text-xs"
            onClick={() => setBulkDeleteOpen(true)}
          >
            Delete selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setSelectedIngredientIds(new Set())}
          >
            Clear selection
          </Button>
        </div>
      ) : null}

      {showPaste ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <label htmlFor="paste-area" className="text-sm font-medium text-foreground">
            Paste ingredients (one per line)
          </label>
          <textarea
            id="paste-area"
            ref={pasteRef}
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={'1 cup flour\n2 tbsp butter\n1/2 tsp salt'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={handleBulkPaste}>
              Parse & Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowPaste(false)
                setPasteText('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border overflow-hidden">
        <div
          className="grid items-center bg-muted/50 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"
          style={{ gridTemplateColumns: '1.75rem 1fr 4rem 4.5rem 7rem 2.5rem' }}
        >
          <Checkbox
            checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
            onCheckedChange={(checked) => handleToggleSelectAllFiltered(checked === true)}
            disabled={filteredIngredients.length === 0}
            aria-label="Select all filtered ingredients"
          />
          <span>Name</span>
          <span>Qty</span>
          <span>Unit</span>
          <span>Store</span>
          <span className="sr-only">Actions</span>
        </div>

        {filteredIngredients.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {search
              ? 'No ingredients match your search.'
              : 'No ingredients yet. Add one or paste from a recipe.'}
          </div>
        ) : (
          filteredIngredients.map((ingredient) => {
            const isEditing = editingId === ingredient.id

            if (isEditing && editDraft) {
              return (
                <div
                  key={ingredient.id}
                  className="flex flex-col gap-2 border-t border-border bg-accent/30 px-3 py-2"
                >
                  <div
                    className="grid items-center gap-1.5"
                    style={{ gridTemplateColumns: '1fr 4rem 4.5rem 7rem' }}
                  >
                    <NameAutocomplete
                      value={editDraft.name}
                      onChange={(name) => setEditDraft({ ...editDraft, name })}
                      onSelect={(name, unit, store, storeId) => {
                        setEditDraft({
                          ...editDraft,
                          name,
                          unit: editDraft.unit || unit,
                          store,
                          storeId,
                        })
                      }}
                      onKeyDown={handleEditKeyDown}
                      inputRef={nameInputRef}
                    />
                    <Input
                      value={editDraft.qty !== null ? String(editDraft.qty) : ''}
                      onChange={(e) => {
                        const value = e.target.value
                        setEditDraft({
                          ...editDraft,
                          qty: value === '' ? null : Number(value) || null,
                        })
                      }}
                      onKeyDown={handleEditKeyDown}
                      className="h-8 text-sm"
                      placeholder="Qty"
                      aria-label="Quantity"
                    />
                    <Input
                      value={editDraft.unit}
                      onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })}
                      onKeyDown={handleEditKeyDown}
                      className="h-8 text-sm"
                      placeholder="Unit"
                      aria-label="Unit"
                    />
                    <StoreSelect
                      value={editDraft.store}
                      storeId={editDraft.storeId}
                      onChangeStore={(store, storeId) =>
                        setEditDraft({ ...editDraft, store, storeId })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 px-3 text-xs font-medium"
                      onClick={saveEdit}
                      title="Save (Enter)"
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-3 text-xs text-muted-foreground"
                      onClick={cancelEdit}
                      title="Cancel (Escape)"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={ingredient.id}
                className="grid items-center border-t border-border px-3 py-2 text-sm transition-colors hover:bg-muted/30"
                style={{ gridTemplateColumns: '1.75rem 1fr 4rem 4.5rem 7rem 2.5rem' }}
              >
                <Checkbox
                  checked={selectedIngredientIds.has(ingredient.id)}
                  onCheckedChange={(checked) =>
                    toggleIngredientSelection(ingredient.id, checked === true)
                  }
                  aria-label={`Select ${ingredient.name || 'ingredient'}`}
                />
                <span className="truncate text-foreground">{ingredient.name || 'Unnamed'}</span>
                <span className="text-muted-foreground">
                  {ingredient.qty !== null ? ingredient.qty : '-'}
                </span>
                <span className="text-muted-foreground">{ingredient.unit || '-'}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {ingredient.store || '-'}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      aria-label="Ingredient actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startEdit(ingredient)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleCopyName(ingredient.name)}>
                      Copy Name
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleDelete(ingredient.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })
        )}
      </div>

      <Dialog open={bulkStoreDialogOpen} onOpenChange={setBulkStoreDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Default Store</DialogTitle>
            <DialogDescription>
              Apply a default store to {selectedCount} selected ingredient
              {selectedCount === 1 ? '' : 's'} in this recipe.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-bulk-store">Store</Label>
              <Select value={bulkStoreId} onValueChange={setBulkStoreId}>
                <SelectTrigger id="recipe-bulk-store" className="h-9">
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
              <Button type="button" variant="outline" onClick={() => setBulkStoreDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleBulkSetDefaultStore}>
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
              This removes the selected ingredients from this recipe only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
