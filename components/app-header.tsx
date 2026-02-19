'use client'

import Link from 'next/link'
import { UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AppTab = 'recipes' | 'ingredients' | 'stores' | 'planner'

const NAV_ITEMS: Array<{ id: AppTab; label: string; href: string }> = [
  { id: 'recipes', label: 'Recipes', href: '/?tab=recipes' },
  { id: 'ingredients', label: 'Ingredients', href: '/?tab=ingredients' },
  { id: 'stores', label: 'Stores', href: '/?tab=stores' },
  { id: 'planner', label: 'Meal Planner', href: '/?tab=planner' },
]

interface AppHeaderProps {
  activeTab?: AppTab
  onTabChange?: (tab: AppTab) => void
}

function navItemClass(active: boolean): string {
  return cn(
    'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
    active
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  )
}

export function AppHeader({ activeTab = 'recipes', onTabChange }: AppHeaderProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <UtensilsCrossed className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-foreground">
              Meal Planner
            </h1>
            <p className="text-xs text-muted-foreground">
              Plan meals by date with flexible ranges
            </p>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const active = item.id === activeTab
            if (onTabChange) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={navItemClass(active)}
                >
                  {item.label}
                </button>
              )
            }

            return (
              <Link key={item.id} href={item.href} className={navItemClass(active)}>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
