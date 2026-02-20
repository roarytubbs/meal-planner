'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { CalendarDays, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useMealPlanSnapshots, useStoreStatus } from '@/lib/meal-planner-store'
import { getSnapshotDateRange } from '@/lib/meal-plan-snapshot-utils'
import { formatDateLabel } from '@/lib/types'
import { cn } from '@/lib/utils'

function formatSavedAt(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

interface CurrentActiveMealPlanCardProps {
  className?: string
  title?: string
  description?: string
  showManageButton?: boolean
}

export function CurrentActiveMealPlanCard({
  className,
  title = 'Current Active Meal Plan',
  description = 'This plan is read-only here. Use the planner tab to make changes.',
  showManageButton = false,
}: CurrentActiveMealPlanCardProps) {
  const { loading } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()

  const activeSnapshot = useMemo(() => {
    if (snapshots.length === 0) return null
    return (
      snapshots.find((snapshot) => snapshot.isActive) ||
      snapshots
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    )
  }, [snapshots])

  const range = useMemo(
    () => (activeSnapshot ? getSnapshotDateRange(activeSnapshot) : null),
    [activeSnapshot]
  )

  return (
    <Card className={cn('border-primary/30 bg-primary/5', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3.5" />
            Read Only
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!activeSnapshot ? (
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading active meal plan...' : 'No active meal plan yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{activeSnapshot.label}</p>
            <p className="text-sm text-muted-foreground">
              {activeSnapshot.description.trim() || 'No description'}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {range
                  ? `${formatDateLabel(range.startDateKey, { month: 'short', day: 'numeric' })} - ${formatDateLabel(range.endDateKey, { month: 'short', day: 'numeric' })}`
                  : 'Unknown range'}
              </span>
              <span>{range?.days ?? 0} day{range?.days === 1 ? '' : 's'}</span>
              <span>{activeSnapshot.meals.length} meals</span>
              <span>Saved {formatSavedAt(activeSnapshot.createdAt)}</span>
            </div>
          </div>
        )}

        {showManageButton ? (
          <div className="mt-4">
            <Button asChild size="sm" variant="outline">
              <Link href="/plans">Manage Meal Plans</Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
