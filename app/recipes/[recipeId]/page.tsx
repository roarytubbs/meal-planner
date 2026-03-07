import { RecipePageView } from '@/components/recipe-page-view'

export default async function RecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>
}) {
  const { recipeId } = await params
  return <RecipePageView recipeId={decodeURIComponent(recipeId)} />
}
