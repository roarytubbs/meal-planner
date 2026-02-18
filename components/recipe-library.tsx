'use client'

import { useState } from 'react'
import {
  UtensilsCrossed,
  Plus,
  Search,
  MoreHorizontal,
  Clock,
  Users,
  Link as LinkIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import type { Recipe } from '@/lib/types'
import { useRecipes, deleteRecipe } from '@/lib/meal-planner-store'

interface RecipeLibraryProps {
  onAddRecipe: () => void
  onEditRecipe: (recipe: Recipe) => void
  onImportRecipe: () => void
}

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-100 text-amber-800',
  lunch: 'bg-emerald-100 text-emerald-800',
  dinner: 'bg-sky-100 text-sky-800',
  snack: 'bg-rose-100 text-rose-800',
}

export function RecipeLibrary({
  onAddRecipe,
  onEditRecipe,
  onImportRecipe,
}: RecipeLibraryProps) {
  const recipes = useRecipes()
  const [search, setSearch] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Recipe | null>(null)

  const filtered = recipes.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = (recipe: Recipe) => {
    deleteRecipe(recipe.id)
    setDeleteConfirm(null)
    toast('Recipe deleted', {
      description: recipe.name,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Recipe Library</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onImportRecipe}>
            <LinkIcon className="size-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" onClick={onAddRecipe}>
            <Plus className="size-4" />
            Add Recipe
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes..."
          className="pl-9"
        />
      </div>

      {/* Recipe Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UtensilsCrossed className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">No recipes found</p>
            <p className="text-sm text-muted-foreground">
              {search
                ? 'Try adjusting your search.'
                : 'Get started by adding your first recipe.'}
            </p>
          </div>
          {!search && (
            <Button size="sm" onClick={onAddRecipe}>
              <Plus className="size-4" />
              Add Recipe
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => (
            <Card
              key={recipe.id}
              className="group cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => onEditRecipe(recipe)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base leading-snug text-pretty">
                    {recipe.name}
                  </CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Recipe actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditRecipe(recipe)
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteConfirm(recipe)
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {recipe.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {recipe.description}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="secondary"
                    className={`text-xs ${MEAL_TYPE_COLORS[recipe.mealType] || ''}`}
                  >
                    {recipe.mealType}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {recipe.servings}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {recipe.ingredients.length} ingredients
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipe</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteConfirm?.name}&rdquo;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
