'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { RecipeForm } from '@/components/recipe-form'
import { updateRecipe, useRecipes, useStoreStatus } from '@/lib/meal-planner-store'
import { handleError } from '@/lib/client-logger'
import { toast } from 'sonner'
import type { Recipe } from '@/lib/types'

export function RecipeEditPageView({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const { loading } = useStoreStatus()
  const recipes = useRecipes()
  const recipe = recipes.find((r) => r.id === recipeId) ?? undefined

  const handleSave = async (updated: Recipe) => {
    try {
      await updateRecipe(updated)
      toast.success('Recipe updated', { description: updated.name })
      router.push(`/recipes/${encodeURIComponent(recipeId)}`)
    } catch (err) {
      toast.error(handleError(err, 'recipe.save'))
    }
  }

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
        <RecipeForm
          mode="edit"
          initialRecipe={recipe}
          onSave={handleSave}
          onCancel={() => router.push(`/recipes/${encodeURIComponent(recipeId)}`)}
        />
      </div>
    </main>
  )
}
