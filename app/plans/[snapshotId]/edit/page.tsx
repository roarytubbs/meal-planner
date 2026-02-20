import { redirect } from 'next/navigation'

export default async function MealPlanSnapshotEditPage({
  params,
}: {
  params: Promise<{ snapshotId: string }>
}) {
  const { snapshotId } = await params
  redirect(`/?tab=planner&snapshotId=${encodeURIComponent(snapshotId)}&loadSnapshot=1`)
}
