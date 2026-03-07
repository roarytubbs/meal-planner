import { RecipeEditPageView } from '@/components/recipe-edit-page-view'

export default async function RecipeEditPage({
  params,
}: {
  params: Promise<{ recipeId: string }>
}) {
  const { recipeId } = await params
  return <RecipeEditPageView recipeId={decodeURIComponent(recipeId)} />
}
