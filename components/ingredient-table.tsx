'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Plus, ClipboardPaste, Search, Trash2, Pencil } from 'lucide-react'
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
import { toast } from 'sonner'
import type { Ingredient, IngredientEntry } from '@/lib/types'
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
    if (!value.trim()) return []
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
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
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
                onMouseDown={(e) => { e.preventDefault(); handleSelect(i) }}
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

function AddIngredientInput({ onAdd }: { onAdd: (ingredient: Ingredient) => void }) {
  const entries = useIngredientEntries()
  const stores = useGroceryStores()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(() => {
    if (!value.trim()) return []
    const q = value.toLowerCase()
    return entries.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8)
  }, [value, entries])

  useEffect(() => {
    setHighlightIndex(-1)
  }, [suggestions])

  const addFromEntry = useCallback(
    (entry: IngredientEntry) => {
      const store = stores.find((s) => s.id === entry.defaultStoreId)
      onAdd({
        id: generateId(),
        name: entry.name,
        qty: null,
        unit: entry.defaultUnit,
        store: store?.name ?? '',
        storeId: entry.defaultStoreId || undefined,
      })
      setValue('')
      setOpen(false)
      inputRef.current?.focus()
    },
    [stores, onAdd]
  )

  const addCustom = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      onAdd({ id: generateId(), name: trimmed, qty: null, unit: '', store: '' })
      setValue('')
      setOpen(false)
      inputRef.current?.focus()
    },
    [onAdd]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : suggestions.length > 0 ? 0 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightIndex >= 0 && suggestions[highlightIndex]) {
          addFromEntry(suggestions[highlightIndex])
        } else if (value.trim()) {
          addCustom(value)
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        setValue('')
      }
    },
    [suggestions, highlightIndex, addFromEntry, addCustom, value]
  )

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (value.trim()) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search your ingredient database or type to add..."
        className="pl-9 pr-4"
        autoComplete="off"
        aria-label="Add ingredient"
        aria-expanded={open && (suggestions.length > 0 || value.trim().length > 0)}
        aria-haspopup="listbox"
      />
      {open && (suggestions.length > 0 || value.trim()) ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md"
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
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors ${
                  i === highlightIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'text-popover-foreground hover:bg-accent/50'
                }`}
                onMouseDown={(e) => { e.preventDefault(); addFromEntry(entry) }}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                <span className="font-medium">{entry.name}</span>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                  {[entry.defaultUnit, store?.name].filter(Boolean).join(' · ')}
                </span>
              </button>
            )
          })}
          {value.trim() &&
          !suggestions.some((e) => e.name.toLowerCase() === value.trim().toLowerCase()) ? (
            <button
              type="button"
              className={`flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm transition-colors ${
                highlightIndex === suggestions.length
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
              onMouseDown={(e) => { e.preventDefault(); addCustom(value) }}
              onMouseEnter={() => setHighlightIndex(suggestions.length)}
            >
              <Plus className="size-3.5 shrink-0" />
              Add &ldquo;{value.trim()}&rdquo;
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
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
      const available = new Set(ingredients.map((i) => i.id))
      const next = new Set<string>()
      for (const id of previous) {
        if (available.has(id)) next.add(id)
      }
      return next
    })
  }, [ingredients])

  const selectedCount = selectedIngredientIds.size
  const allSelected =
    ingredients.length > 0 && ingredients.every((i) => selectedIngredientIds.has(i.id))
  const someSelected =
    ingredients.some((i) => selectedIngredientIds.has(i.id)) && !allSelected

  const selectedIngredients = useMemo(
    () => ingredients.filter((i) => selectedIngredientIds.has(i.id)),
    [ingredients, selectedIngredientIds]
  )

  const sharedSelectedStoreId = useMemo(() => {
    if (selectedIngredients.length === 0) return '__none'
    const first = selectedIngredients[0].storeId || '__none'
    return selectedIngredients.every((i) => (i.storeId || '__none') === first)
      ? first
      : '__none'
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
    onChange(ingredients.map((i) => (i.id === editDraft.id ? editDraft : i)))
    setEditingId(null)
    setEditDraft(null)
  }, [editDraft, ingredients, onChange])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
    },
    [saveEdit, cancelEdit]
  )

  const handleAdd = useCallback(
    (ingredient: Ingredient) => {
      onChange([...ingredients, ingredient])
    },
    [ingredients, onChange]
  )

  const handleDelete = useCallback(
    (id: string) => {
      const index = ingredients.findIndex((i) => i.id === id)
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
      if (editingId === id) { setEditingId(null); setEditDraft(null) }
      toast('Ingredient removed', {
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
    [ingredients, onChange, editingId]
  )

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
        `Skipped ${result.skippedLines.length} non-ingredient line${result.skippedLines.length > 1 ? 's' : ''}.`
      )
    }
    if (newIngredients.length > 0) {
      toast.success(`Added ${newIngredients.length} ingredient${newIngredients.length > 1 ? 's' : ''}`)
    }
    setPasteText('')
    setShowPaste(false)
  }, [pasteText, ingredients, onChange])

  const toggleSelection = useCallback((id: string, selected: boolean) => {
    setSelectedIngredientIds((previous) => {
      const next = new Set(previous)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleBulkSetDefaultStore = useCallback(() => {
    const nextStoreId = bulkStoreId === '__none' ? '' : bulkStoreId
    const nextStoreName = nextStoreId
      ? stores.find((s) => s.id === nextStoreId)?.name || ''
      : ''
    const selectedIds = new Set(selectedIngredients.map((i) => i.id))
    onChange(
      ingredients.map((i) =>
        selectedIds.has(i.id)
          ? { ...i, storeId: nextStoreId || undefined, store: nextStoreName }
          : i
      )
    )
    setBulkStoreDialogOpen(false)
    toast.success('Default store updated', {
      description: nextStoreId
        ? `Applied ${nextStoreName} to ${selectedIngredients.length} ingredient${selectedIngredients.length === 1 ? '' : 's'}.`
        : `Cleared store for ${selectedIngredients.length} ingredient${selectedIngredients.length === 1 ? '' : 's'}.`,
    })
  }, [bulkStoreId, ingredients, onChange, selectedIngredients, stores])

  const handleBulkDelete = useCallback(() => {
    const selectedIds = new Set(selectedIngredients.map((i) => i.id))
    onChange(ingredients.filter((i) => !selectedIds.has(i.id)))
    setSelectedIngredientIds(new Set())
    setBulkDeleteOpen(false)
    toast.success('Ingredients removed', {
      description: `Removed ${selectedIngredients.length} ingredient${selectedIngredients.length === 1 ? '' : 's'}.`,
    })
  }, [ingredients, onChange, selectedIngredients])

  return (
    <div className="flex flex-col gap-3">
      {showTitle ? (
        <h3 className="text-base font-semibold text-foreground">Ingredients</h3>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <AddIngredientInput onAdd={handleAdd} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPaste((p) => !p)}
          aria-label="Paste ingredients"
        >
          <ClipboardPaste className="size-4" />
          <span className="hidden sm:inline">Paste</span>
        </Button>
      </div>

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
              onClick={() => { setShowPaste(false); setPasteText('') }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/25 px-3 py-2">
          <span className="text-xs text-foreground">{selectedCount} selected</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => { setBulkStoreId(sharedSelectedStoreId); setBulkStoreDialogOpen(true) }}
          >
            Set store
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
            Clear
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2 text-left font-medium">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(checked) => {
                    setSelectedIngredientIds(() => {
                      if (checked === true) return new Set(ingredients.map((i) => i.id))
                      return new Set()
                    })
                  }}
                  disabled={ingredients.length === 0}
                  aria-label="Select all ingredients"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">Ingredient</th>
              <th className="w-16 px-3 py-2 text-left font-medium">Qty</th>
              <th className="w-20 px-3 py-2 text-left font-medium">Unit</th>
              <th className="w-32 px-3 py-2 text-left font-medium">Store</th>
              <th className="w-8 px-3 py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ingredients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Search for ingredients above to add them, or paste from a recipe.
                </td>
              </tr>
            ) : (
              ingredients.map((ingredient) => {
                const isEditing = editingId === ingredient.id

                if (isEditing && editDraft) {
                  return (
                    <tr key={ingredient.id} className="bg-accent/30">
                      <td colSpan={6} className="px-3 py-2.5">
                        <div className="flex flex-col gap-2">
                          <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: '1fr 4rem 4.5rem 7rem' }}>
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
                                const v = e.target.value
                                setEditDraft({ ...editDraft, qty: v === '' ? null : Number(v) || null })
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
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-3 text-xs text-muted-foreground"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={ingredient.id}
                    className="group cursor-pointer hover:bg-muted/20"
                    onClick={() => startEdit(ingredient)}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <Checkbox
                        checked={selectedIngredientIds.has(ingredient.id)}
                        onCheckedChange={(checked) =>
                          toggleSelection(ingredient.id, checked === true)
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${ingredient.name || 'ingredient'}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        {ingredient.name || <span className="font-normal italic text-muted-foreground">Unnamed</span>}
                        <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-50" />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-middle text-muted-foreground">
                      {ingredient.qty !== null ? ingredient.qty : '—'}
                    </td>
                    <td className="px-3 py-2.5 align-middle text-muted-foreground">
                      {ingredient.unit || '—'}
                    </td>
                    <td className="px-3 py-2.5 align-middle text-muted-foreground">
                      {ingredient.store || '—'}
                    </td>
                    <td className="px-3 py-2.5 align-middle text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); handleDelete(ingredient.id) }}
                        aria-label={`Delete ${ingredient.name || 'ingredient'}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
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
              Delete {selectedCount} ingredient{selectedCount === 1 ? '' : 's'}?
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
