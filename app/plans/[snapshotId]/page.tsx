import { AppHeader } from '@/components/app-header'
import { MealPlanSnapshotView } from '@/components/meal-plan-snapshot-view'

export default async function MealPlanSnapshotPage({
  params,
}: {
  params: Promise<{ snapshotId: string }>
}) {
  const { snapshotId } = await params

  return (
    <main className="min-h-screen bg-background">
      <AppHeader activeTab="planner" />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <MealPlanSnapshotView snapshotId={snapshotId} />
      </div>
    </main>
  )
}
