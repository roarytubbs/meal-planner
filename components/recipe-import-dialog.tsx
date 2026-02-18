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

interface RecipeImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (recipe: Partial<Recipe>) => void
}

function generateId() {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function RecipeImportDialog({
  open,
  onOpenChange,
  onImport,
}: RecipeImportDialogProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleImport = useCallback(async () => {
    if (!url.trim()) return

    setLoading(true)
    setError(null)

    try {
      // Use the API route to scrape the recipe
      const res = await fetch('/api/import-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!res.ok) {
        throw new Error('Failed to import recipe')
      }

      const data = await res.json()
      onImport({
        id: generateId(),
        name: data.name || '',
        description: data.description || '',
        ingredients: data.ingredients || [],
        steps: data.steps || [],
        sourceUrl: url.trim(),
        mealType: 'dinner',
        servings: data.servings || 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setUrl('')
      onOpenChange(false)
    } catch {
      // Fallback: open recipe form with URL prefilled
      setError(
        'Could not import recipe automatically. A draft will be created with the URL prefilled.'
      )
      onImport({
        id: generateId(),
        name: '',
        description: '',
        ingredients: [],
        steps: [''],
        sourceUrl: url.trim(),
        mealType: 'dinner',
        servings: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setUrl('')
      setError(null)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }, [url, onImport, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Recipe from URL</DialogTitle>
          <DialogDescription>
            Paste a recipe URL and we will try to extract the title, description,
            ingredients, and steps.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-url">Recipe URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="import-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/recipe"
                  className="pl-9"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleImport()
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!url.trim() || loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
