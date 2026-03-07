'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { CalendarDays, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMealPlanSnapshots, useStoreStatus } from '@/lib/meal-planner-store'
import { getSnapshotDateRange } from '@/lib/meal-plan-snapshot-utils'
import { formatDateLabel, toDateKey, MEAL_SLOT_VALUES, type MealSlot, type MealSelection } from '@/lib/types'

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

const SLOT_COLORS: Record<MealSlot, string> = {
  breakfast: 'text-amber-500',
  lunch: 'text-emerald-500',
  dinner: 'text-sky-500',
}

function selectionLabel(selection: MealSelection): string {
  if (selection === 'eating_out') return 'Eating out'
  if (selection === 'leftovers') return 'Leftovers'
  if (selection === 'skip') return 'Skipped'
  return '—'
}

interface DaySlots {
  dateKey: string
  slots: Record<MealSlot, { selection: MealSelection; recipeName: string | null } | null>
}

export function ActiveMealPlanSection() {
  const { loading } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()

  const activeSnapshot = useMemo(() => {
    if (snapshots.length === 0) return null
    return (
      snapshots.find((s) => s.isActive) ||
      snapshots
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    )
  }, [snapshots])

  const range = useMemo(
    () => (activeSnapshot ? getSnapshotDateRange(activeSnapshot) : null),
    [activeSnapshot]
  )

  const dayGroups = useMemo<DaySlots[]>(() => {
    if (!activeSnapshot) return []

    const groups = new Map<string, Record<MealSlot, { selection: MealSelection; recipeName: string | null } | null>>()

    for (const meal of activeSnapshot.meals) {
      if (!groups.has(meal.day)) {
        groups.set(meal.day, { breakfast: null, lunch: null, dinner: null })
      }
      const slot = meal.slot as MealSlot
      if (MEAL_SLOT_VALUES.includes(slot)) {
        groups.get(meal.day)![slot] = { selection: meal.selection, recipeName: meal.recipeName }
      }
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, slots]) => ({ dateKey, slots }))
  }, [activeSnapshot])

  const todayKey = toDateKey(new Date())

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading active meal plan...
      </div>
    )
  }

  if (!activeSnapshot) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 py-12 text-center">
        <CalendarDays className="size-10 text-muted-foreground/30" />
        <div>
          <p className="font-medium text-foreground">No active meal plan</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create a plan in the Meal Planner to see it here.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/plans">Open Meal Planner</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">{activeSnapshot.label}</h2>
            {activeSnapshot.isActive && (
              <Badge variant="secondary" className="text-[10px]">
                Active
              </Badge>
            )}
          </div>
          {range ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDateLabel(range.startDateKey, { month: 'short', day: 'numeric' })}
              {' – '}
              {formatDateLabel(range.endDateKey, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {' · '}
              {range.days} day{range.days === 1 ? '' : 's'}
              {' · '}
              {activeSnapshot.meals.length} meals
            </p>
          ) : null}
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1 text-muted-foreground hover:text-foreground">
          <Link href={`/plans/${encodeURIComponent(activeSnapshot.id)}`}>
            View Full Plan
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div style={{ minWidth: `${Math.max(dayGroups.length * 148, 400)}px` }}>
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: `repeat(${dayGroups.length}, 1fr)` }}
          >
            {dayGroups.map(({ dateKey }) => {
              const isToday = dateKey === todayKey
              const date = new Date(`${dateKey}T12:00:00`)
              return (
                <div
                  key={dateKey}
                  className={`border-r border-border px-3 py-3 text-center last:border-r-0 ${isToday ? 'bg-primary/5' : ''}`}
                >
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-widest ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {date.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p
                    className={`mt-0.5 text-sm font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}
                  >
                    {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                  {isToday ? (
                    <div className="mx-auto mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                  ) : null}
                </div>
              )
            })}
          </div>

          {MEAL_SLOT_VALUES.map((slot, slotIndex) => (
            <div
              key={slot}
              className={`grid ${slotIndex < MEAL_SLOT_VALUES.length - 1 ? 'border-b border-border' : ''}`}
              style={{ gridTemplateColumns: `repeat(${dayGroups.length}, 1fr)` }}
            >
              {dayGroups.map(({ dateKey, slots }) => {
                const entry = slots[slot]
                const isToday = dateKey === todayKey
                const isRecipe = entry?.selection === 'recipe'

                return (
                  <div
                    key={`${dateKey}-${slot}`}
                    className={`min-h-[76px] border-r border-border px-3 py-2.5 last:border-r-0 ${isToday ? 'bg-primary/5' : ''}`}
                  >
                    <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${SLOT_COLORS[slot]}`}>
                      {SLOT_LABELS[slot]}
                    </p>
                    {!entry ? (
                      <p className="text-xs italic text-muted-foreground/40">—</p>
                    ) : isRecipe && entry.recipeName ? (
                      <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
                        {entry.recipeName}
                      </p>
                    ) : (
                      <p className="text-xs italic text-muted-foreground/60">
                        {selectionLabel(entry.selection)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
