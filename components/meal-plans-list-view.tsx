'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, CalendarDays, ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useMealPlanSnapshots, useStoreStatus } from '@/lib/meal-planner-store'
import { formatDateLabel, parseDateKey, type MealPlanSnapshot } from '@/lib/types'

function formatCreatedAt(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function formatSnapshotRange(snapshot: MealPlanSnapshot): string {
  const days = Array.from(
    new Set(snapshot.meals.map((meal) => meal.day).filter((day) => Boolean(parseDateKey(day))))
  ).sort((a, b) => a.localeCompare(b))

  if (days.length === 0) return 'No date range'
  if (days.length === 1) {
    return formatDateLabel(days[0], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  return `${formatDateLabel(days[0], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} - ${formatDateLabel(days[days.length - 1], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}`
}

function buildPreview(snapshot: MealPlanSnapshot): string {
  const recipeNames = snapshot.meals
    .filter((meal) => meal.selection === 'recipe' && meal.recipeName)
    .map((meal) => meal.recipeName as string)

  if (recipeNames.length === 0) return 'No recipe slots in this snapshot.'
  if (recipeNames.length <= 3) return recipeNames.join(', ')
  return `${recipeNames.slice(0, 3).join(', ')} +${recipeNames.length - 3} more`
}

export function MealPlansListView() {
  const { loading, error } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()

  const sortedSnapshots = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [snapshots]
  )

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/60 bg-card/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Saved Meal Plans</h2>
            <p className="text-sm text-muted-foreground">
              Review your saved plan snapshots without editing your current draft.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/?tab=planner">Back to Planner</Link>
          </Button>
        </div>
      </section>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {loading && sortedSnapshots.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Loading saved plans...
          </CardContent>
        </Card>
      ) : null}

      {!loading && sortedSnapshots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No saved plans yet</p>
            <p className="text-xs text-muted-foreground">
              Save a plan from the Meal Planner page to view it here.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {sortedSnapshots.map((snapshot) => (
          <Card key={snapshot.id} className="border-border/70">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">{snapshot.label}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">
                    {snapshot.description.trim() || 'No description provided.'}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {snapshot.meals.length} meal{snapshot.meals.length === 1 ? '' : 's'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" />
                  {formatSnapshotRange(snapshot)}
                </span>
                <span>Saved {formatCreatedAt(snapshot.createdAt)}</span>
              </div>

              <p className="text-xs text-muted-foreground">{buildPreview(snapshot)}</p>

              <Button asChild size="sm" className="h-8 px-3 text-xs">
                <Link href={`/plans/${encodeURIComponent(snapshot.id)}`}>
                  View Plan
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
