'use client'

import { useState, useCallback } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { RecipeLibrary } from '@/components/recipe-library'
import { RecipeForm } from '@/components/recipe-form'
import { MealPlannerView } from '@/components/meal-planner-view'
import { RecipeImportDialog } from '@/components/recipe-import-dialog'
import { StoreManager } from '@/components/store-manager'
import { IngredientManager } from '@/components/ingredient-manager'
import { addRecipe, updateRecipe } from '@/lib/meal-planner-store'
import { toast } from 'sonner'
import type { Recipe, RecipeMode } from '@/lib/types'

type View = 'library' | 'form' | 'planner'

export default function MealPlannerPage() {
  const [view, setView] = useState<View>('library')
  const [activeTab, setActiveTab] = useState<string>('recipes')
  const [formMode, setFormMode] = useState<RecipeMode>('add')
  const [editingRecipe, setEditingRecipe] = useState<Recipe | undefined>(
    undefined
  )
  const [importOpen, setImportOpen] = useState(false)

  const handleAddRecipe = useCallback(() => {
    setFormMode('add')
    setEditingRecipe(undefined)
    setView('form')
  }, [])

  const handleEditRecipe = useCallback((recipe: Recipe) => {
    setFormMode('edit')
    setEditingRecipe(recipe)
    setView('form')
  }, [])

  const handleSaveRecipe = useCallback(
    (recipe: Recipe) => {
      if (formMode === 'add') {
        addRecipe(recipe)
        toast.success('Recipe added', { description: recipe.name })
      } else {
        updateRecipe(recipe)
        toast.success('Recipe updated', { description: recipe.name })
      }
      setView('library')
      setEditingRecipe(undefined)
    },
    [formMode]
  )

  const handleCancelForm = useCallback(() => {
    setView('library')
    setEditingRecipe(undefined)
  }, [])

  const handleImport = useCallback((partial: Partial<Recipe>) => {
    const recipe: Recipe = {
      id: partial.id || `recipe_${Date.now()}`,
      name: partial.name || '',
      description: partial.description || '',
      mealType: partial.mealType || 'dinner',
      servings: partial.servings || 4,
      ingredients: partial.ingredients || [],
      steps: partial.steps || [''],
      sourceUrl: partial.sourceUrl || '',
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
    (tab: string) => {
      setActiveTab(tab)
      if (tab === 'recipes' && view === 'form') {
        // Keep form view
      } else if (tab === 'recipes') {
        setView('library')
      } else if (tab === 'planner') {
        setView('planner')
      }
    },
    [view]
  )

  return (
    <main className="min-h-screen bg-background">
      {/* App header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <UtensilsCrossed className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-foreground">
              Meal Planner
            </h1>
            <p className="text-xs text-muted-foreground">
              Plan your weekly meals with ease
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        {view === 'form' ? (
          <RecipeForm
            mode={formMode}
            initialRecipe={editingRecipe}
            onSave={handleSaveRecipe}
            onCancel={handleCancelForm}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="mb-4">
              <TabsTrigger value="recipes">Recipes</TabsTrigger>
              <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
              <TabsTrigger value="stores">Stores</TabsTrigger>
              <TabsTrigger value="planner">Planner</TabsTrigger>
            </TabsList>

            <TabsContent value="recipes">
              <RecipeLibrary
                onAddRecipe={handleAddRecipe}
                onEditRecipe={handleEditRecipe}
                onImportRecipe={() => setImportOpen(true)}
              />
            </TabsContent>

            <TabsContent value="ingredients">
              <IngredientManager />
            </TabsContent>

            <TabsContent value="stores">
              <StoreManager />
            </TabsContent>

            <TabsContent value="planner">
              <MealPlannerView />
            </TabsContent>
          </Tabs>
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
