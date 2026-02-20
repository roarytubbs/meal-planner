'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { AppHeader, type AppTab } from '@/components/app-header'
import { RecipeLibrary } from '@/components/recipe-library'
import { RecipeForm } from '@/components/recipe-form'
import { MealPlannerView } from '@/components/meal-planner-view'
import { RecipeImportDialog } from '@/components/recipe-import-dialog'
import { StoreManager } from '@/components/store-manager'
import { IngredientManager } from '@/components/ingredient-manager'
import { addRecipe, updateRecipe, useRecipes, useStoreStatus } from '@/lib/meal-planner-store'
import { toast } from 'sonner'
import type { Recipe, RecipeMode } from '@/lib/types'

type View = 'library' | 'form' | 'planner'

export default function MealPlannerPage() {
  const router = useRouter()
  const [view, setView] = useState<View>('library')
  const [activeTab, setActiveTab] = useState<AppTab>('recipes')
  const [formMode, setFormMode] = useState<RecipeMode>('add')
  const [editingRecipe, setEditingRecipe] = useState<Recipe | undefined>(
    undefined
  )
  const [importOpen, setImportOpen] = useState(false)
  const [pendingRecipeId, setPendingRecipeId] = useState<string | null>(null)
  const { loading, error } = useStoreStatus()
  const recipes = useRecipes()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    const recipeId = String(params.get('recipeId') || '').trim()
    if (tab !== 'recipes' && tab !== 'ingredients' && tab !== 'stores' && tab !== 'planner') {
      return
    }

    setActiveTab((prev) => (prev === tab ? prev : tab))
    setView((prev) => {
      if (tab === 'planner') return 'planner'
      if (tab === 'recipes') return prev === 'form' ? prev : 'library'
      return 'library'
    })

    if (recipeId) {
      setPendingRecipeId(recipeId)
    }
  }, [])

  useEffect(() => {
    if (!pendingRecipeId) return
    const matchingRecipe = recipes.find((recipe) => recipe.id === pendingRecipeId)
    if (!matchingRecipe) return

    setActiveTab('recipes')
    setFormMode('edit')
    setEditingRecipe(matchingRecipe)
    setView('form')
    setPendingRecipeId(null)
    router.replace('/?tab=recipes')
  }, [pendingRecipeId, recipes, router])

  const handleAddRecipe = useCallback(() => {
    setFormMode('add')
    setEditingRecipe(undefined)
    setView('form')
  }, [])

  const handleEditRecipe = useCallback((recipe: Recipe) => {
    setActiveTab('recipes')
    setFormMode('edit')
    setEditingRecipe(recipe)
    setView('form')
  }, [])

  const handleSaveRecipe = useCallback(
    async (recipe: Recipe) => {
      try {
        if (formMode === 'add') {
          await addRecipe(recipe)
          toast.success('Recipe added', { description: recipe.name })
        } else {
          await updateRecipe(recipe)
          toast.success('Recipe updated', { description: recipe.name })
        }
        setActiveTab('recipes')
        router.replace('/?tab=recipes')
        setView('library')
        setEditingRecipe(undefined)
      } catch (saveError) {
        const message =
          saveError instanceof Error ? saveError.message : 'Unable to save recipe.'
        toast.error(message)
      }
    },
    [formMode, router]
  )

  const handleCancelForm = useCallback(() => {
    setActiveTab('recipes')
    router.replace('/?tab=recipes')
    setView('library')
    setEditingRecipe(undefined)
  }, [router])

  const handleImport = useCallback((partial: Partial<Recipe>) => {
    const recipe: Recipe = {
      id: partial.id || `recipe_${Date.now()}`,
      name: partial.name || '',
      description: partial.description || '',
      mealType: partial.mealType ?? '',
      servings: partial.servings || 4,
      rating:
        typeof partial.rating === 'number' && Number.isFinite(partial.rating)
          ? Math.max(0, Math.min(5, Math.round(partial.rating * 10) / 10))
          : undefined,
      totalMinutes:
        typeof partial.totalMinutes === 'number' &&
        Number.isFinite(partial.totalMinutes) &&
        partial.totalMinutes > 0
          ? Math.round(partial.totalMinutes)
          : undefined,
      ingredients: partial.ingredients || [],
      steps: partial.steps || [''],
      sourceUrl: partial.sourceUrl || '',
      imageUrl: partial.imageUrl || '',
      createdAt: partial.createdAt || new Date().toISOString(),
      updatedAt: partial.updatedAt || new Date().toISOString(),
    }
    setFormMode('add')
    setEditingRecipe(recipe)
    setView('form')
    toast.info('Recipe imported', {
      description: recipe.name || 'Draft created with URL prefilled',
    })
  }, [])

  const handleTabChange = useCallback(
    (tab: AppTab) => {
      setActiveTab(tab)
      router.replace(`/?tab=${tab}`)
      if (tab === 'recipes' && view === 'form') {
        // Keep form view
      } else if (tab === 'recipes') {
        setView('library')
      } else if (tab === 'planner') {
        setView('planner')
      } else {
        setView('library')
      }
    },
    [router, view]
  )

  return (
    <main className="min-h-screen bg-background">
      <AppHeader activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Content */}
      <div className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
        {loading ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading planner data...
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {view === 'form' ? (
          <RecipeForm
            mode={formMode}
            initialRecipe={editingRecipe}
            onSave={handleSaveRecipe}
            onCancel={handleCancelForm}
          />
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as AppTab)}>
              <TabsContent value="recipes">
                <RecipeLibrary
                  onAddRecipe={handleAddRecipe}
                  onEditRecipe={handleEditRecipe}
                  onImportRecipe={() => setImportOpen(true)}
                  onSearchRecipes={() => router.push('/recipes/search')}
                />
              </TabsContent>

              <TabsContent value="ingredients">
                <IngredientManager />
              </TabsContent>

              <TabsContent value="stores">
                <StoreManager />
              </TabsContent>

              <TabsContent value="planner">
                <MealPlannerView onEditRecipe={handleEditRecipe} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Import Dialog */}
      <RecipeImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
      />

      {/* Toast notifications */}
      <Toaster />
    </main>
  )
}
