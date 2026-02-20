'use client'

import Link from 'next/link'
import { useMemo, type ComponentType } from 'react'
import {
  BookOpenText,
  CalendarDays,
  ChevronDown,
  ShoppingBasket,
  Store,
  UtensilsCrossed,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMealPlanSnapshots, useStoreStatus } from '@/lib/meal-planner-store'
import { getSnapshotDateRange } from '@/lib/meal-plan-snapshot-utils'
import { formatDateLabel } from '@/lib/types'
import { cn } from '@/lib/utils'

export type AppTab = 'recipes' | 'ingredients' | 'stores' | 'planner'

const NAV_ITEMS: Array<{
  id: AppTab
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}> = [
  { id: 'recipes', label: 'Recipes', href: '/?tab=recipes', icon: BookOpenText },
  { id: 'ingredients', label: 'Ingredients', href: '/?tab=ingredients', icon: ShoppingBasket },
  { id: 'stores', label: 'Stores', href: '/?tab=stores', icon: Store },
  { id: 'planner', label: 'Meal Planner', href: '/plans', icon: CalendarDays },
]

interface AppHeaderProps {
  activeTab?: AppTab
  onTabChange?: (tab: AppTab) => void
}

function navItemClass(active: boolean): string {
  return cn(
    'inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-[color,background-color,border-color,box-shadow]',
    active
      ? 'border-foreground/20 bg-foreground text-background shadow-sm'
      : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:bg-secondary hover:text-foreground'
  )
}

export function AppHeader({ activeTab = 'recipes', onTabChange }: AppHeaderProps) {
  const { loading } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()

  const currentPlan = useMemo(() => {
    if (snapshots.length === 0) return null

    return (
      snapshots.find((snapshot) => snapshot.isActive) ||
      snapshots
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    )
  }, [snapshots])
  const currentPlanRange = useMemo(
    () => (currentPlan ? getSnapshotDateRange(currentPlan) : null),
    [currentPlan]
  )

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/45 bg-accent/45 shadow-sm">
              <UtensilsCrossed className="size-5 text-foreground" />
            </div>
            <div>
              <h1 className="text-[1.45rem] font-semibold leading-tight text-foreground">
                Meal Planner
              </h1>
              <p className="text-sm text-muted-foreground">
                Plan meals by date with flexible ranges
              </p>
            </div>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-border bg-card text-muted-foreground hover:text-foreground"
              >
                Current Plan
                <ChevronDown className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              {!currentPlan ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Current Plan</p>
                  <p className="text-xs text-muted-foreground">
                    {loading ? 'Loading current plan...' : 'No meal plan saved yet.'}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-1">
                    <Link href="/plans">Open Meal Plans</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/plans/${encodeURIComponent(currentPlan.id)}`}
                      className="text-sm font-semibold text-foreground hover:underline"
                    >
                      {currentPlan.label}
                    </Link>
                    <Badge variant="secondary" className="text-[10px]">
                      Current
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {currentPlan.description.trim() || 'No description'}
                  </p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" />
                      {currentPlanRange
                        ? `${formatDateLabel(currentPlanRange.startDateKey, {
                            month: 'short',
                            day: 'numeric',
                          })} - ${formatDateLabel(currentPlanRange.endDateKey, {
                            month: 'short',
                            day: 'numeric',
                          })}`
                        : 'Unknown range'}
                    </p>
                    <p className="inline-flex items-center gap-1">
                      {currentPlanRange
                        ? `${formatDateLabel(currentPlanRange.startDateKey, {
                            month: 'short',
                            day: 'numeric',
                          })} start`
                        : 'Unknown start date'}
                    </p>
                    <p>
                      {currentPlanRange
                        ? `${currentPlanRange.days} day${currentPlanRange.days === 1 ? '' : 's'}`
                        : 'Unknown duration'}
                    </p>
                    <p>{currentPlan.meals.length} meals</p>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const active = item.id === activeTab
            const ItemIcon = item.icon
            if (onTabChange) {
              if (item.id === 'planner') {
                return (
                  <Link key={item.id} href={item.href} className={navItemClass(active)}>
                    <ItemIcon className="size-3.5" />
                    {item.label}
                  </Link>
                )
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={navItemClass(active)}
                >
                  <ItemIcon className="size-3.5" />
                  {item.label}
                </button>
              )
            }

            return (
              <Link key={item.id} href={item.href} className={navItemClass(active)}>
                <ItemIcon className="size-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
