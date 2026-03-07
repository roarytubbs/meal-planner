'use client'

import { ShoppingCart } from 'lucide-react'
import { ShoppingModeProvider, useShoppingMode } from '@/lib/shopping-mode-context'
import { ShoppingModeView } from '@/components/shopping-mode-view'
import { cn } from '@/lib/utils'

function ShoppingToggleSwitch({ className }: { className?: string }) {
  const { isActive, toggle } = useShoppingMode()

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      onClick={toggle}
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      <ShoppingCart className="size-3.5 shrink-0" />
      <span>In Store</span>
      <span
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          isActive ? 'bg-emerald-500' : 'bg-border'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            isActive ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  )
}

function ShoppingOverlay() {
  const { isActive } = useShoppingMode()

  if (!isActive) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex w-full items-center justify-end border-b border-border px-5 py-3">
        <ShoppingToggleSwitch />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ShoppingModeView />
      </div>
    </div>
  )
}

export function ShoppingModeGate({ children }: { children: React.ReactNode }) {
  return (
    <ShoppingModeProvider>
      {children}
      <ShoppingOverlay />
    </ShoppingModeProvider>
  )
}

export { ShoppingToggleSwitch }
