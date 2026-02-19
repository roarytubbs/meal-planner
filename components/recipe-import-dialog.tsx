'use client'

import { useState, useCallback } from 'react'
import { Link as LinkIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Recipe } from '@/lib/types'
import { toast } from 'sonner'

interface RecipeImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (recipe: Partial<Recipe>) => void
}

function generateId() {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function normalizeMealType(value: unknown): Recipe['mealType'] {
  const mealType = String(value || '')
    .trim()
    .toLowerCase()
  if (
    mealType === 'breakfast' ||
    mealType === 'lunch' ||
    mealType === 'dinner' ||
    mealType === 'snack'
  ) {
    return mealType
  }
  return ''
}

interface ImportResponse {
  name?: string
  description?: string
  ingredients?: Recipe['ingredients']
  steps?: string[]
  servings?: number
  mealType?: Recipe['mealType']
  sourceUrl?: string
  imageUrl?: string
}

export function RecipeImportDialog({
  open,
  onOpenChange,
  onImport,
}: RecipeImportDialogProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createDraftFromImport = useCallback(
    (data: ImportResponse, fallbackSourceUrl = '') => {
      const ingredients = Array.isArray(data.ingredients) ? data.ingredients : []
      const steps = Array.isArray(data.steps)
        ? data.steps.map((step) => String(step || '').trim()).filter(Boolean)
        : []

      onImport({
        id: generateId(),
        name: data.name || '',
        description: data.description || '',
        ingredients,
        steps: steps.length > 0 ? steps : [''],
        sourceUrl: data.sourceUrl || fallbackSourceUrl,
        imageUrl: data.imageUrl || '',
        mealType: normalizeMealType(data.mealType),
        servings: data.servings || 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    },
    [onImport]
  )

  const handleUrlImport = useCallback(async () => {
    const normalizedUrl = url.trim()
    if (!normalizedUrl) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/import-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
      })

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Failed to import recipe.')
      }

      const data = (await res.json()) as ImportResponse
      createDraftFromImport(data, normalizedUrl)
      setUrl('')
      onOpenChange(false)
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : 'Could not import this URL automatically.'
      toast.warning('Import needs manual review', {
        description: message,
      })
      onImport({
        id: generateId(),
        name: '',
        description: '',
        ingredients: [],
        steps: [''],
        sourceUrl: normalizedUrl,
        imageUrl: '',
        mealType: '',
        servings: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setUrl('')
      setError(message)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }, [createDraftFromImport, onImport, onOpenChange, url])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setError(null)
        setUrl('')
        setLoading(false)
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange]
  )

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Recipe</DialogTitle>
          <DialogDescription>
            Paste a public recipe URL and we&apos;ll parse it into a draft recipe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-url">Recipe URL</Label>
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="import-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/recipe"
              className="pl-9"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleUrlImport()
                }
              }}
            />
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleUrlImport()
            }}
            disabled={!url.trim() || loading}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
