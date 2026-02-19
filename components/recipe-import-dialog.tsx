'use client'

import { useState, useCallback } from 'react'
import { Link as LinkIcon, Loader2, Search } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
}

interface SpoonacularSearchResult {
  id: number
  title: string
  image: string
  servings: number
  sourceUrl: string
  mealType: Recipe['mealType']
}

interface SpoonacularSearchResponse {
  results?: SpoonacularSearchResult[]
  error?: string
}

export function RecipeImportDialog({
  open,
  onOpenChange,
  onImport,
}: RecipeImportDialogProps) {
  const [importMode, setImportMode] = useState<'url' | 'provider'>('url')
  const [url, setUrl] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [providerQuery, setProviderQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [providerResults, setProviderResults] = useState<SpoonacularSearchResult[]>(
    []
  )
  const [importingProviderId, setImportingProviderId] = useState<number | null>(null)
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

    setLoadingUrl(true)
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
      // Keep URL fallback behavior so users can still create a draft quickly.
      onImport({
        id: generateId(),
        name: '',
        description: '',
        ingredients: [],
        steps: [''],
        sourceUrl: normalizedUrl,
        mealType: '',
        servings: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setUrl('')
      setError(message)
      onOpenChange(false)
    } finally {
      setLoadingUrl(false)
    }
  }, [createDraftFromImport, onImport, onOpenChange, url])

  const handleProviderSearch = useCallback(async () => {
    const query = providerQuery.trim()
    if (!query) return

    setSearchLoading(true)
    setError(null)
    setProviderResults([])

    try {
      const params = new URLSearchParams({ query, limit: '12' })
      const res = await fetch(
        `/api/import-recipe/providers/spoonacular/search?${params.toString()}`
      )
      const payload = (await res.json()) as SpoonacularSearchResponse

      if (!res.ok) {
        throw new Error(payload.error || 'Failed to search Spoonacular recipes.')
      }

      const results = Array.isArray(payload.results) ? payload.results : []
      setProviderResults(results)
    } catch (searchError) {
      const message =
        searchError instanceof Error
          ? searchError.message
          : 'Failed to search Spoonacular recipes.'
      setError(message)
    } finally {
      setSearchLoading(false)
    }
  }, [providerQuery])

  const handleProviderImport = useCallback(
    async (providerRecipeId: number) => {
      setImportingProviderId(providerRecipeId)
      setError(null)

      try {
        const res = await fetch(
          `/api/import-recipe/providers/spoonacular/recipes/${providerRecipeId}`
        )
        const payload = (await res.json()) as ImportResponse & { error?: string }
        if (!res.ok) {
          throw new Error(payload.error || 'Failed to import Spoonacular recipe.')
        }

        createDraftFromImport(payload, '')
        setProviderQuery('')
        setProviderResults([])
        onOpenChange(false)
      } catch (importError) {
        const message =
          importError instanceof Error
            ? importError.message
            : 'Failed to import Spoonacular recipe.'
        setError(message)
      } finally {
        setImportingProviderId(null)
      }
    },
    [createDraftFromImport, onOpenChange]
  )

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setImportMode('url')
        setError(null)
        setUrl('')
        setProviderQuery('')
        setProviderResults([])
        setSearchLoading(false)
        setImportingProviderId(null)
        setLoadingUrl(false)
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange]
  )

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Recipe</DialogTitle>
          <DialogDescription>
            Import from a public recipe URL or search Spoonacular.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={importMode}
          onValueChange={(value) => {
            if (value === 'url' || value === 'provider') {
              setImportMode(value)
              setError(null)
            }
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url">From URL</TabsTrigger>
            <TabsTrigger value="provider">Spoonacular</TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="mt-3">
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
                        void handleUrlImport()
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="provider" className="mt-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-query">Search recipes</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="provider-query"
                      value={providerQuery}
                      onChange={(e) => setProviderQuery(e.target.value)}
                      placeholder="e.g., slow cooker chicken"
                      className="pl-9"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleProviderSearch()
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleProviderSearch()}
                    disabled={!providerQuery.trim() || searchLoading}
                  >
                    {searchLoading && <Loader2 className="size-4 animate-spin" />}
                    Search
                  </Button>
                </div>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {providerResults.length === 0 && !searchLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Search Spoonacular to import a recipe draft.
                  </p>
                ) : null}
                {providerResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center gap-3 rounded-md border border-border p-2"
                  >
                    {result.image ? (
                      <div
                        aria-label={result.title}
                        className="h-14 w-14 rounded bg-cover bg-center"
                        role="img"
                        style={{ backgroundImage: `url(${JSON.stringify(result.image)})` }}
                      />
                    ) : (
                      <div className="h-14 w-14 rounded bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {result.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{result.servings} servings</Badge>
                        {result.mealType ? (
                          <Badge variant="outline">{result.mealType}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleProviderImport(result.id)}
                      disabled={
                        importingProviderId !== null ||
                        searchLoading ||
                        loadingUrl
                      }
                    >
                      {importingProviderId === result.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Import
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
            disabled={loadingUrl || searchLoading || importingProviderId !== null}
          >
            Cancel
          </Button>
          {importMode === 'url' ? (
            <Button
              onClick={() => void handleUrlImport()}
              disabled={!url.trim() || loadingUrl || searchLoading}
            >
              {loadingUrl && <Loader2 className="size-4 animate-spin" />}
              Import
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
