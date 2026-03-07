'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface ShoppingModeContextValue {
  isActive: boolean
  toggle: () => void
  activate: () => void
  deactivate: () => void
}

const ShoppingModeContext = createContext<ShoppingModeContextValue>({
  isActive: false,
  toggle: () => {},
  activate: () => {},
  deactivate: () => {},
})

export function ShoppingModeProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)

  return (
    <ShoppingModeContext.Provider
      value={{
        isActive,
        toggle: () => setIsActive((v) => !v),
        activate: () => setIsActive(true),
        deactivate: () => setIsActive(false),
      }}
    >
      {children}
    </ShoppingModeContext.Provider>
  )
}

export function useShoppingMode() {
  return useContext(ShoppingModeContext)
}
