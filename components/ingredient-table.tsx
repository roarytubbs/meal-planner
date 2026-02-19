'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { MoreHorizontal, Plus, ClipboardPaste } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
}

function generateId() {
  return `ing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ---- Autocomplete name input ----
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
  const listRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    if (!value.trim() || value.trim().length < 1) return []
    const q = value.toLowerCase()
    return entries
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 8)
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
        setHighlightIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
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
          // Delay to allow click
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
      {open && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover shadow-md overflow-hidden"
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
                className={`flex items-center justify-between w-full px-3 py-2 text-left text-sm transition-colors ${
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
                <span className="text-xs text-muted-foreground ml-2 shrink-0">
                  {[entry.defaultUnit, store?.name]
                    .filter(Boolean)
                    .join(' | ')}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---- Store dropdown ----
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

  const currentValue = storeId || '__none'

  return (
    <Select
      value={currentValue}
      onValueChange={(v) => {
        if (v === '__none') {
          onChangeStore('', '')
        } else {
          const store = stores.find((s) => s.id === v)
          onChangeStore(store?.name ?? '', v)
        }
      }}
    >
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder="Store">
          {value || 'None'}
        </SelectValue>
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

export function IngredientTable({ ingredients, onChange }: IngredientTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Ingredient | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')

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
    const updated = ingredients.map((ing) =>
      ing.id === editDraft.id ? editDraft : ing
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
      const index = ingredients.findIndex((ing) => ing.id === id)
      if (index === -1) return
      const ingredient = ingredients[index]

      const updated = ingredients.filter((ing) => ing.id !== id)
      onChange(updated)

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Ingredients</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPaste(!showPaste)}
        >
          <ClipboardPaste className="size-4" />
          <span className="hidden sm:inline">Paste</span>
        </Button>
      </div>

      {showPaste && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <label
            htmlFor="paste-area"
            className="text-sm font-medium text-foreground"
          >
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
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div
          className="grid items-center bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider"
          style={{ gridTemplateColumns: '1fr 4rem 4.5rem 7rem 2.5rem' }}
        >
          <span>Name</span>
          <span>Qty</span>
          <span>Unit</span>
          <span>Store</span>
          <span className="sr-only">Actions</span>
        </div>

        {/* Rows */}
        {ingredients.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No ingredients yet. Add one or paste from a recipe.
          </div>
        )}

        {ingredients.map((ingredient) => {
          const isEditing = editingId === ingredient.id

          if (isEditing && editDraft) {
            return (
              <div
                key={ingredient.id}
                className="flex flex-col gap-2 border-t border-border bg-accent/30 px-3 py-2"
              >
                <div
                  className="grid items-center gap-1.5"
                  style={{
                    gridTemplateColumns: '1fr 4rem 4.5rem 7rem',
                  }}
                >
                  <NameAutocomplete
                    value={editDraft.name}
                    onChange={(name) =>
                      setEditDraft({ ...editDraft, name })
                    }
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
                    value={
                      editDraft.qty !== null ? String(editDraft.qty) : ''
                    }
                    onChange={(e) => {
                      const val = e.target.value
                      setEditDraft({
                        ...editDraft,
                        qty: val === '' ? null : Number(val) || null,
                      })
                    }}
                    onKeyDown={handleEditKeyDown}
                    className="h-8 text-sm"
                    placeholder="Qty"
                    aria-label="Quantity"
                  />
                  <Input
                    value={editDraft.unit}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, unit: e.target.value })
                    }
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
              className="grid items-center border-t border-border px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
              style={{ gridTemplateColumns: '1fr 4rem 4.5rem 7rem 2.5rem' }}
            >
              <span className="truncate text-foreground">
                {ingredient.name || 'Unnamed'}
              </span>
              <span className="text-muted-foreground">
                {ingredient.qty !== null ? ingredient.qty : '-'}
              </span>
              <span className="text-muted-foreground">
                {ingredient.unit || '-'}
              </span>
              <span className="text-muted-foreground truncate text-xs">
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
                  <DropdownMenuItem onClick={() => startEdit(ingredient)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCopyName(ingredient.name)}
                  >
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
        })}
      </div>

      <div className="flex items-center justify-start">
        <Button type="button" variant="outline" size="sm" onClick={addEmpty}>
          <Plus className="size-4" />
          Add ingredients
        </Button>
      </div>
    </div>
  )
}
