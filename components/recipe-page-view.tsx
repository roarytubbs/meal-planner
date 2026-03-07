'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { RecipeDetailView } from '@/components/recipe-detail-view'
import { addRecipe, updateRecipe, useRecipes, useStoreStatus } from '@/lib/meal-planner-store'
import { handleError } from '@/lib/client-logger'
import { toast } from 'sonner'
import type { Recipe } from '@/lib/types'

function generateId() {
  return `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function RecipePageView({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const { loading } = useStoreStatus()
  const recipes = useRecipes()
  const recipe = recipes.find((r) => r.id === recipeId) ?? null

  const handleDuplicate = useCallback(
    async (source: Recipe) => {
      const copy: Recipe = {
        ...source,
        id: generateId(),
        name: `${source.name} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      try {
        await addRecipe(copy)
        toast.success('Recipe duplicated', { description: copy.name })
        router.push(`/recipes/${encodeURIComponent(copy.id)}`)
      } catch (err) {
        toast.error(handleError(err, 'recipe.save'))
      }
    },
    [router]
  )

  if (loading && !recipe) {
    return (
      <main className="min-h-screen bg-background">
        <AppHeader activeTab="recipes" />
        <div className="mx-auto max-w-7xl px-5 py-7">
          <p className="text-sm text-muted-foreground">Loading recipe...</p>
        </div>
      </main>
    )
  }

  if (!recipe) {
    return (
      <main className="min-h-screen bg-background">
        <AppHeader activeTab="recipes" />
        <div className="mx-auto max-w-7xl px-5 py-7 sm:py-8">
          <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/?tab=recipes" className="flex items-center gap-1 transition-colors hover:text-foreground">
              <ArrowLeft className="size-4" />
              Recipes
            </Link>
          </nav>
          <p className="text-sm text-muted-foreground">Recipe not found.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <AppHeader activeTab="recipes" />
      <div className="mx-auto max-w-7xl px-5 py-7 sm:py-8">
        <RecipeDetailView
          recipe={recipe}
          onBack={() => router.push('/?tab=recipes')}
          onEdit={() => router.push(`/recipes/${encodeURIComponent(recipeId)}/edit`)}
          onDuplicate={() => void handleDuplicate(recipe)}
        />
      </div>
    </main>
  )
}
